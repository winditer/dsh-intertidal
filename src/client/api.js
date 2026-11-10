// 潮间 —— `/intertidal/*` 的浏览器侧封装。
//
// 三条要求（spec §8）：
//   1. **永远不抛**：所有方法都 resolve，失败返回 `{ ok:false }`，由 runtime 决定降级；
//   2. 设置写入失败时用 `localStorage` 镜像，刷新后仍能用你刚改的值；
//   3. 超时必须有：宿主卡住时不能把 UI 拖住（4 秒）。

const BASE = '/intertidal'
const MIRROR_KEY = 'dsh-intertidal:settings'
const TIMEOUT_MS = 4000

/** 读镜像（坏 JSON 就当没有）。 */
export function readMirror(storage = safeStorage()) {
  try {
    const raw = storage?.getItem(MIRROR_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writeMirror(settings, storage = safeStorage()) {
  try {
    storage?.setItem(MIRROR_KEY, JSON.stringify(settings))
  } catch {
    /* 隐私模式 / 配额满 → 忽略 */
  }
}

function safeStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

async function call(path, { method = 'GET', body, signal } = {}, fetchImpl) {
  const doFetch = fetchImpl ?? globalThis.fetch
  if (typeof doFetch !== 'function') return { ok: false, status: 0, error: 'no-fetch' }
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null
  try {
    const init = { method, cache: 'no-store', credentials: 'same-origin', signal: controller?.signal ?? signal }
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' }
      init.body = JSON.stringify(body)
    }
    const res = await doFetch(`${BASE}${path}`, init)
    if (!res.ok) return { ok: false, status: res.status, error: `http-${res.status}` }
    const value = await res.json()
    return { ok: true, value }
  } catch (error) {
    return { ok: false, status: 0, error: String(error?.name === 'AbortError' ? 'timeout' : (error?.message ?? error)) }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * 造一个 api。`onStatus` 用来把"宿主是否可用"报给 runtime（设置页据此显示一行告警）。
 */
export function createApi({ fetchImpl, storage = safeStorage(), onStatus } = {}) {
  let offline = false
  const note = (ok) => {
    if (offline === !ok) return
    offline = !ok
    try {
      onStatus?.(offline)
    } catch {
      /* 回调自己抛了不该影响请求 */
    }
  }

  return {
    get offline() {
      return offline
    },

    /** GET /state → `{ settings, rhythm, now }`；失败时退镜像 + null。 */
    async state() {
      const result = await call('/state', {}, fetchImpl)
      note(result.ok)
      if (result.ok) {
        writeMirror(result.value?.settings, storage)
        return result
      }
      const mirror = readMirror(storage)
      return { ok: false, error: result.error, value: mirror ? { settings: mirror, rhythm: null, now: null } : null }
    },

    /** GET /now；带地点参数就按参数算，不带就用宿主设置。 */
    async now(location) {
      const query = location && Number.isFinite(location.lat) && Number.isFinite(location.lon)
        ? `?lat=${encodeURIComponent(location.lat)}&lon=${encodeURIComponent(location.lon)}&tz=${encodeURIComponent(location.tz ?? '')}`
        : ''
      const result = await call(`/now${query}`, {}, fetchImpl)
      note(result.ok)
      return result
    },

    /** POST /settings：整份覆盖式提交（宿主做合并与钳制）。 */
    async saveSettings(patch) {
      const result = await call('/settings', { method: 'POST', body: patch }, fetchImpl)
      note(result.ok)
      if (result.ok) writeMirror(result.value, storage)
      else {
        const mirror = readMirror(storage) ?? {}
        writeMirror({ ...mirror, ...patch }, storage)
      }
      return result
    },

    /** POST /rhythm：`shown` / `hidden` / `skip-today` / `manual-open`。 */
    async rhythm(event) {
      const result = await call('/rhythm', { method: 'POST', body: { event } }, fetchImpl)
      note(result.ok)
      return result
    },

    /** GET /media：这一次浮现用哪张素材（`fresh` 强制重新抽一张）。 */
    async media(fresh = false) {
      const result = await call(`/media${fresh ? '?fresh=1' : ''}`, {}, fetchImpl)
      // 素材失败不影响看海（会退回程序化海），所以不改变 offline 判定
      return result
    },

    /** POST /media/scan：设置页验证目录里有多少素材。 */
    async scanMedia(dir) {
      return call('/media/scan', { method: 'POST', body: { dir } }, fetchImpl)
    },

    /** POST /media/resolve：把一个网页/图片链接抓成本地缓存。 */
    async resolveMedia(url) {
      return call('/media/resolve', { method: 'POST', body: { url } }, fetchImpl)
    },
  }
}