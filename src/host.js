// dsh-intertidal —— 宿主半片（cordis 插件）。
//
// 职责只有三件：把 state.json 读写包装成 HTTP、把天文计算暴露成 `/intertidal/now`、
// 并且给每个请求过一道**准入围栏**。渲染全在浏览器半片，这里一行画图的代码都没有。
//
// 三条装载期约束（与 dsh-workbench 同款，都是踩过的坑）：
//   1. 模块加载时不读文件、不监听端口——`import('./src/host.js')` 必须能在单测里直接跑；
//      `$DSH_HOME` 只在 apply / handler 时才解析。
//   2. 只 `inject: ['webServer']`。把 `connection` 写进 inject 会让 fiber 等一个可能更晚
//      才出现的服务，进而把启动卡住（workbench 的 PO 记录过）；connection 只在 handler 里
//      现取，取不到就走自写围栏。
//   3. 注册动作包在 `scope.effect()` 里，插件卸载即注销路由。
//
// 铁律（spec §8）：潮间是"可选的呼吸"。宿主的任何异常都不得让 DSH 主流程受损——本文件
// 所有 handler 都自己兜错，`apply` 里的失败只记日志。

import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { skyAt } from './sky.js'
import { guessCity } from './cities.js'
import {
  cacheDir as mediaCacheDir,
  openMediaFile,
  pickFromCache,
  pickFromDir,
  resolveUrlToCache,
  scanDir,
  sniffSize,
} from './media.js'
import { patchSettings, readState, resolveDshHome, rhythmEvent, statePath, writeState } from './store.js'

export const name = 'dsh-intertidal'
/** 静态声明依赖：webServer 缺席时本插件不激活（fiber 保持 pending，不会拖垮启动）。 */
export const inject = ['webServer']

export const API_PREFIX = '/intertidal'

const TZ_OK = (() => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' })
    return true
  } catch {
    return false
  }
})()

/** 任意输入 → 合法地点。非法就按系统时区猜一个城市（spec：「默认按系统时区猜」）。 */
export function sanitizeLocation(value) {
  const raw = value && typeof value === 'object' ? value : {}
  const lat = Number(raw.lat)
  const lon = Number(raw.lon)
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    let tz = typeof raw.tz === 'string' ? raw.tz.trim() : ''
    if (tz && TZ_OK) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz })
      } catch {
        tz = ''
      }
    }
    const fallback = guessCity({ tz: tz || undefined })
    return {
      city: typeof raw.city === 'string' && raw.city ? raw.city : fallback.id ?? fallback.city,
      lat,
      lon,
      tz: tz || fallback.tz,
    }
  }
  const guess = guessCity({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
  return { city: guess.id ?? guess.city, lat: guess.lat, lon: guess.lon, tz: guess.tz }
}
/** 请求体上限：设置对象只有几百字节，1 MB 已经很宽容。 */
export const MAX_BODY_BYTES = 1 << 20

// ---------------------------------------------------------------------------
// 信封与工具

function json(res, status, body) {
  if (res.writableEnded || res.destroyed) return
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

const fail = (res, status, message) => json(res, status, { error: { message } })

/** 只有 JSON 才读 body：`text/plain` 表单 POST 是"无预检跨站"的经典口子，必须在门口挡掉。 */
function isJsonRequest(req) {
  const raw = String(req?.headers?.['content-type'] ?? '')
  const media = raw.split(';')[0].trim().toLowerCase()
  return media === 'application/json' || /^application\/[a-z0-9.+-]+\+json$/.test(media)
}

async function readJsonBody(req, limit = MAX_BODY_BYTES) {
  if (!isJsonRequest(req)) {
    throw Object.assign(new Error('请求必须是 application/json'), { status: 415 })
  }
  const declared = Number(req?.headers?.['content-length'] ?? Number.NaN)
  if (Number.isFinite(declared) && declared > limit) {
    req.destroy?.()
    throw Object.assign(new Error('请求体过大'), { status: 413 })
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) {
      req.destroy?.()
      throw Object.assign(new Error('请求体过大'), { status: 413 })
    }
    chunks.push(chunk)
  }
  if (!size) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    return parsed
  } catch {
    throw Object.assign(new Error('请求不是有效的 JSON 对象'), { status: 400 })
  }
}

// ---------------------------------------------------------------------------
// 准入围栏
//
// `webServer.register({kind:'prefix'})` 注册的路由**绕过**框架给 `/api` 挂的浏览器信任围栏，
// 所以必须自己判"这个请求是不是本机页面自己发的"。这不是鉴权（本机端点没有凭据可校验），
// 而是防 DNS-rebinding / 跨站 POST 的副作用。
//
// 判定顺序（任何一项不满足即拒，先拒后信）：
//   ① Host 落在 loopback 或显式 bindHost；
//   ② 已知端口时 Host 的端口必须与服务端口一致；
//   ③ Origin 若存在必须与 Host 同源；
//   ④ sec-fetch-site 只允许 same-origin / none。
function headerOf(req, key) {
  const value = req?.headers?.[key]
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

export function localRejection(req, { port, bindHost } = {}) {
  const host = headerOf(req, 'host') ?? headerOf(req, ':authority')
  if (!host) return 'no-host'
  // host 可能是 `127.0.0.1:51234` 或 `[::1]:51234`
  const hostname = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : host.split(':')[0]
  const hostPort = host.includes(']') ? host.slice(host.indexOf(']') + 2) : host.split(':')[1]
  const loopback =
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  const allowedName = loopback || (typeof bindHost === 'string' && bindHost !== '' && hostname === bindHost)
  if (!allowedName) return 'host-not-loopback'
  if (port !== undefined && port !== null && hostPort !== undefined && String(hostPort) !== String(port)) {
    return 'port-mismatch'
  }
  const origin = headerOf(req, 'origin')
  if (origin !== undefined) {
    try {
      const parsed = new URL(origin)
      if (parsed.host !== host) return 'origin-mismatch'
    } catch {
      return 'origin-unparsable'
    }
  }
  const site = headerOf(req, 'sec-fetch-site')
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return 'cross-site'
  return null
}

/**
 * 先问框架（connection.requestRejection），它不在或抛了就退回自写围栏。
 * 返回拒绝原因字符串表示拒绝，返回 null 表示放行。
 */
function rejectionFor(ctx, req) {
  const connection = ctx.get?.('connection')
  const guard = connection?.requestRejection
  if (typeof guard === 'function') {
    try {
      const rejection = guard.call(connection, req)
      if (rejection !== undefined && rejection !== null) return String(rejection)
      return null
    } catch {
      /* 框架围栏异常 → 继续走自写围栏，绝不放行 */
    }
  }
  const server = ctx.get?.('webServer')
  return localRejection(req, { port: server?.port, bindHost: server?.host })
}

// ---------------------------------------------------------------------------
// 天文计算的按分钟缓存：`dayLength` 要扫 1440 个采样点，没必要每次请求都算。

const SKY_CACHE_MS = 60_000
const skyCache = new Map()

function nowPayload(location, at = Date.now(), noCache = false) {
  const key = `${location.lat},${location.lon},${location.tz}`
  const hit = skyCache.get(key)
  if (!noCache && hit && at - hit.at < SKY_CACHE_MS) return hit.value
  let value
  try {
    value = skyAt(new Date(at), location)
  } catch {
    // 兜底：任何天文计算异常都退回"午后的海"，画面不会因此崩掉（spec §8）。
    value = {
      t: Math.floor(at / 1000),
      sun: { altitude: 20, azimuth: 200 },
      moon: { altitude: -10, azimuth: 90, phase: 0.5 },
      tide: { height: 0, trend: 'rising' },
      phase: 'afternoon',
      dayLength: null,
    }
  }
  skyCache.set(key, { at, value })
  return value
}

// ---------------------------------------------------------------------------
// 方法表

/**
 * @param {{ ctx: any, logger: any, home: string, clock: () => number }} deps
 */
export function createApiHandler({ ctx, logger, clock = () => Date.now() }) {
  const home = () => resolveDshHome()

  async function currentLocation() {
    const state = await readState(home())
    const raw = state?.settings?.location
    if (raw && Number.isFinite(raw.lat) && Number.isFinite(raw.lon) && typeof raw.tz === 'string') {
      return sanitizeLocation(raw)
    }
    return sanitizeLocation(guessCity({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone }))
  }

  const methods = {
    // GET /intertidal/state —— 一次拿全，减少首屏往返（settings + rhythm + now）。
    async state(req, res) {
      const state = await readState(home())
      const location = sanitizeLocation(state?.settings?.location)
      return json(res, 200, {
        settings: state.settings,
        rhythm: state.rhythm,
        now: nowPayload(location, clock()),
        home: home(),
      })
    },

    // GET /intertidal/now?lat=&lon=&tz=
    async now(req, res, url) {
      const q = url.searchParams
      const location = sanitizeLocation({
        lat: q.get('lat') !== null ? Number(q.get('lat')) : undefined,
        lon: q.get('lon') !== null ? Number(q.get('lon')) : undefined,
        tz: q.get('tz') ?? undefined,
      })
      // 没带参数就用设置里的地点
      const explicit = q.get('lat') !== null || q.get('lon') !== null || q.get('tz') !== null
      return json(res, 200, nowPayload(explicit ? location : await currentLocation(), clock(), true))
    },

    // POST /intertidal/settings
    async settings(req, res) {
      const body = await readJsonBody(req)
      const settings = await patchSettings(home(), body)
      return json(res, 200, settings)
    },

    // POST /intertidal/rhythm { event }
    async rhythm(req, res) {
      const body = await readJsonBody(req)
      const event = typeof body.event === 'string' ? body.event : ''
      if (!['shown', 'hidden', 'skip-today', 'manual-open'].includes(event)) {
        return fail(res, 400, '未知的 rhythm 事件')
      }
      const rhythm = await rhythmEvent(home(), event, clock())
      return json(res, 200, rhythm)
    },

    // GET /intertidal/media?fresh=1 —— 这一次浮现该用哪张素材
    async media(req, res, url) {
      const state = await readState(home())
      const media = state?.settings?.media ?? { mode: 'off' }
      if (media.mode === 'off') return json(res, 200, { item: null })

      if (media.mode === 'dir') {
        const item = await pickFromDir(media.dir, { shuffle: media.shuffle !== false })
        if (!item) return json(res, 200, { item: null, reason: 'empty-dir' })
        const file = await openMediaFile(media.dir, item.name)
        if (file && item.kind === 'image') {
          const size = await sniffSize(file.path)
          if (size) Object.assign(item, size)
        }
        return json(res, 200, { item })
      }

      // url 模式：缓存优先（离线也能看），没有缓存时才去下载
      const cache = mediaCacheDir(home())
      const fresh = url.searchParams.get('fresh') === '1'
      let item = fresh ? null : await pickFromCache(cache)
      if (!item) {
        const urls = Array.isArray(media.urls) ? media.urls : []
        const order = media.shuffle === false ? urls : [...urls].sort(() => Math.random() - 0.5)
        for (const target of order.slice(0, 3)) {
          item = await resolveUrlToCache(target, cache)
          if (item) break
        }
      }
      if (!item) return json(res, 200, { item: null, reason: 'unresolved' })
      const file = await openMediaFile(cache, item.name)
      if (file && item.kind === 'image') {
        const size = await sniffSize(file.path)
        if (size) Object.assign(item, size)
      }
      return json(res, 200, { item })
    },

    // GET /intertidal/media/file?name=xxx.jpg —— 字节流（支持 Range，视频要循环播放）
    async mediaFile(req, res, url) {
      const state = await readState(home())
      const media = state?.settings?.media ?? { mode: 'off' }
      const name = url.searchParams.get('name') ?? ''
      if (!name) return fail(res, 400, '缺少 name')
      if (media.mode === 'off') return fail(res, 404, '未启用素材')

      const candidates = [mediaCacheDir(home())]
      if (media.dir) candidates.push(media.dir)
      let file = null
      for (const directory of candidates) {
        file = await openMediaFile(directory, name)
        if (file) break
      }
      if (!file) return fail(res, 404, '素材不存在')

      res.setHeader('content-type', file.mime)
      res.setHeader('accept-ranges', 'bytes')
      res.setHeader('cache-control', 'private, max-age=86400')
      res.setHeader('x-content-type-options', 'nosniff')
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers?.range ?? '')
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, file.size - Number(range[2]))
        const end = range[1] && range[2] ? Math.min(Number(range[2]), file.size - 1) : file.size - 1
        if (start >= file.size || start > end) {
          res.statusCode = 416
          res.setHeader('content-range', `bytes */${file.size}`)
          return res.end()
        }
        res.statusCode = 206
        res.setHeader('content-range', `bytes ${start}-${end}/${file.size}`)
        res.setHeader('content-length', end - start + 1)
        return file.stream({ start, end }).pipe(res)
      }
      res.statusCode = 200
      res.setHeader('content-length', file.size)
      if (req.method === 'HEAD') return res.end()
      return file.stream().pipe(res)
    },

    // POST /intertidal/media/resolve { url }
    async mediaResolve(req, res) {
      const body = await readJsonBody(req)
      const target = typeof body.url === 'string' ? body.url.trim() : ''
      if (!target) return fail(res, 400, '缺少 url')
      const item = await resolveUrlToCache(target, mediaCacheDir(home()))
      if (!item) return json(res, 200, { item: null, reason: 'unresolved' })
      return json(res, 200, { item })
    },

    // POST /intertidal/media/scan { dir } —— 设置页验证目录
    async mediaScan(req, res) {
      const body = await readJsonBody(req)
      const dir = typeof body.dir === 'string' ? body.dir.trim() : ''
      if (!dir) return fail(res, 400, '缺少 dir')
      const scan = await scanDir(dir)
      return json(res, 200, scan)
    },
  }

  return {
    methods,
    /** Node http 风格的入口。 */
    async handler(req, res) {
      try {
        const rejection = rejectionFor(ctx, req)
        if (rejection) {
          logger?.warn?.(`dsh-intertidal: 请求被准入围栏拒绝（${rejection}）`)
          return fail(res, 403, 'forbidden')
        }
        const url = new URL(req.url ?? '/', 'http://localhost')
        // `/intertidal/state` → `state`
        const path = url.pathname.replace(/^\/intertidal\/?/, '').replace(/\/$/, '')
        if (req.method === 'GET' && (path === '' || path === 'state')) return await methods.state(req, res, url)
        if (req.method === 'GET' && path === 'now') return await methods.now(req, res, url)
        if (req.method === 'POST' && path === 'settings') return await methods.settings(req, res, url)
        if (req.method === 'POST' && path === 'rhythm') return await methods.rhythm(req, res, url)
        if (req.method === 'GET' && path === 'media') return await methods.media(req, res, url)
        if (req.method === 'GET' && path === 'media/file') return await methods.mediaFile(req, res, url)
        if (req.method === 'POST' && path === 'media/resolve') return await methods.mediaResolve(req, res, url)
        if (req.method === 'POST' && path === 'media/scan') return await methods.mediaScan(req, res, url)
        if (path in methods) return fail(res, 405, '方法不允许')
        return fail(res, 404, '没有这个接口')
      } catch (error) {
        const status = Number(error?.status) || 500
        if (status >= 500) logger?.warn?.(`dsh-intertidal: ${API_PREFIX} 处理失败：${String(error?.message ?? error)}`)
        return fail(res, status, status >= 500 ? '潮间宿主侧出错' : String(error?.message ?? error))
      }
    },
  }
}

// ---------------------------------------------------------------------------
// cordis 插件

export function apply(ctx) {
  const logger = ctx.logger ?? ctx.get?.('logger')
  const api = createApiHandler({ ctx, logger })

  const mount = (scope) => {
    try {
      scope.effect(
        () =>
          scope.webServer.register({
            kind: 'prefix',
            path: API_PREFIX,
            handler: api.handler,
          }),
        'dsh-intertidal: api',
      )
    } catch (error) {
      // 同一 path 注册两次会抛（插件被装两遍）。宁可少一条路由并留日志，也不让整层装载失败。
      logger?.warn?.(`dsh-intertidal: 注册 ${API_PREFIX} 失败：${String(error?.message ?? error)}`)
    }
  }

  if (typeof ctx.inject === 'function') ctx.inject(['webServer'], mount)
  else mount(ctx)

  // 首次启动记下 installedAt（用于"装完先安静 20 分钟"）。失败只记日志。
  void (async () => {
    try {
      const state = await readState(resolveDshHome())
      if (!state.rhythm.installedAt) {
        state.rhythm.installedAt = Math.floor(Date.now() / 1000)
        await writeState(resolveDshHome(), state)
      }
    } catch (error) {
      logger?.warn?.(`dsh-intertidal: 初始化状态文件失败（${statePath(resolveDshHome())}）：${String(error?.message ?? error)}`)
    }
  })()
}