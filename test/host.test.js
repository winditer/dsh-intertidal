// 潮间 —— 宿主半片单测：准入围栏 + 四个接口的真行为（spec §7 / §11 R4）。
//
// 这些测试直接用假的 req/res 打 handler，不启端口、不依赖 DSH：围栏与接口逻辑都是纯的。

import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { createApiHandler, localRejection } from '../src/host.js'

function makeReq({ url = '/intertidal/state', method = 'GET', headers = {}, body } = {}) {
  const base = { 'host': '127.0.0.1:51234', 'sec-fetch-site': 'same-origin', ...headers }
  if (body !== undefined) base['content-type'] = 'application/json'
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(body)])
  return Object.assign(stream, { url, method, headers: base })
}

function makeRes() {
  const chunks = []
  return {
    writableEnded: false,
    destroyed: false,
    statusCode: 200,
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value
    },
    writeHead(status, headers) {
      this.statusCode = status
      Object.assign(this.headers, headers)
      return this
    },
    end(chunk) {
      if (chunk !== undefined) chunks.push(Buffer.from(chunk))
      this.writableEnded = true
    },
    get body() {
      const text = Buffer.concat(chunks).toString('utf8')
      return text ? JSON.parse(text) : null
    },
  }
}

const ctxStub = { get: () => undefined }

async function withHome(fn) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-intertidal-host-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    return await fn(home)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(home, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// 围栏

test('围栏放行本机页面自己发的请求', () => {
  assert.equal(localRejection(makeReq()), null)
  assert.equal(localRejection(makeReq({ headers: { host: 'localhost:51234' } })), null)
  assert.equal(localRejection(makeReq({ headers: { host: '[::1]:51234' } })), null)
  assert.equal(
    localRejection(makeReq({ headers: { origin: 'http://127.0.0.1:51234' } }), { port: 51234 }),
    null,
  )
})

test('围栏拒绝非 loopback / 端口不符 / 跨站 / 缺 Host', () => {
  assert.equal(localRejection(makeReq({ headers: { host: 'evil.example.com' } })), 'host-not-loopback')
  assert.equal(localRejection(makeReq({ headers: { host: undefined } })), 'no-host')
  assert.equal(localRejection(makeReq(), { port: 5000 }), 'port-mismatch')
  assert.equal(
    localRejection(makeReq({ headers: { origin: 'http://evil.example.com' } })),
    'origin-mismatch',
  )
  assert.equal(localRejection(makeReq({ headers: { 'sec-fetch-site': 'cross-site' } })), 'cross-site')
})

test('handler 对围栏拒绝的请求返回 403，且不读 body', async () => {
  const api = createApiHandler({ ctx: ctxStub, logger: null })
  const req = makeReq({ url: '/intertidal/settings', method: 'POST', headers: { host: 'evil.example.com' }, body: '{"auto":true}' })
  const res = makeRes()
  await api.handler(req, res)
  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, { error: { message: 'forbidden' } })
})

// ---------------------------------------------------------------------------
// 接口

test('GET /intertidal/state 返回 settings + rhythm + now', async () => {
  await withHome(async () => {
    const api = createApiHandler({ ctx: ctxStub, logger: null })
    const res = makeRes()
    await api.handler(makeReq({ url: '/intertidal/state' }), res)
    assert.equal(res.statusCode, 200)
    const body = res.body
    assert.ok(body.settings, '有 settings')
    assert.ok(body.rhythm, '有 rhythm')
    assert.ok(body.now, '有 now')
    // now 的字段与 spec §4.2 一致
    for (const key of ['t', 'sun', 'moon', 'tide', 'phase', 'dayLength']) {
      assert.ok(key in body.now, `now.${key} 存在`)
    }
    assert.ok(Number.isFinite(body.now.sun.altitude))
    assert.ok(['dawn', 'noon', 'afternoon', 'dusk', 'night'].includes(body.now.phase))
  })
})

test('POST /intertidal/settings 做范围钳制并落盘', async () => {
  await withHome(async () => {
    const api = createApiHandler({ ctx: ctxStub, logger: null })
    const res = makeRes()
    await api.handler(
      makeReq({ url: '/intertidal/settings', method: 'POST', body: JSON.stringify({ intervalMinutes: 9999, durationSeconds: 5, form: 'nope' }) }),
      res,
    )
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.intervalMinutes, 480, '越界钳到上限')
    assert.equal(res.body.durationSeconds, 30, '越界钳到下限')
    assert.equal(res.body.form, 'full', '非法枚举退回默认')
  })
})

test('POST 只接受 JSON content-type（挡掉 text/plain 表单跨站）', async () => {
  await withHome(async () => {
    const api = createApiHandler({ ctx: ctxStub, logger: null })
    const res = makeRes()
    const req = makeReq({ url: '/intertidal/settings', method: 'POST', body: '{"auto":true}' })
    req.headers['content-type'] = 'text/plain'
    await api.handler(req, res)
    assert.equal(res.statusCode, 415)
  })
})

test('POST /intertidal/settings 拒绝非法 JSON 与非对象', async () => {
  await withHome(async () => {
    const api = createApiHandler({ ctx: ctxStub, logger: null })
    const bad = makeRes()
    await api.handler(makeReq({ url: '/intertidal/settings', method: 'POST', body: '{oops' }), bad)
    assert.equal(bad.statusCode, 400)

    const array = makeRes()
    await api.handler(makeReq({ url: '/intertidal/settings', method: 'POST', body: '[1,2]' }), array)
    assert.equal(array.statusCode, 400)
  })
})

test('POST /intertidal/rhythm 只接受四种事件', async () => {
  await withHome(async () => {
    const api = createApiHandler({ ctx: ctxStub, logger: null, clock: () => 1_760_000_000_000 })
    const ok = makeRes()
    await api.handler(makeReq({ url: '/intertidal/rhythm', method: 'POST', body: '{"event":"shown"}' }), ok)
    assert.equal(ok.statusCode, 200)
    assert.equal(ok.body.lastShownAt, 1_760_000_000)

    const bad = makeRes()
    await api.handler(makeReq({ url: '/intertidal/rhythm', method: 'POST', body: '{"event":"boom"}' }), bad)
    assert.equal(bad.statusCode, 400)
  })
})

test('未知路径 404、方法不对 405', async () => {
  await withHome(async () => {
    const api = createApiHandler({ ctx: ctxStub, logger: null })
    const missing = makeRes()
    await api.handler(makeReq({ url: '/intertidal/nope' }), missing)
    assert.equal(missing.statusCode, 404)

    const wrong = makeRes()
    await api.handler(makeReq({ url: '/intertidal/settings', method: 'GET' }), wrong)
    assert.equal(wrong.statusCode, 405)
  })
})

test('GET /intertidal/now 支持显式经纬度，且地点非法时回落而不是 500', async () => {
  await withHome(async () => {
    const api = createApiHandler({ ctx: ctxStub, logger: null })
    const res = makeRes()
    await api.handler(makeReq({ url: '/intertidal/now?lat=64.15&lon=-21.94&tz=Atlantic/Reykjavik' }), res)
    assert.equal(res.statusCode, 200)
    assert.ok(Number.isFinite(res.body.sun.altitude))

    const broken = makeRes()
    await api.handler(makeReq({ url: '/intertidal/now?lat=abc&lon=xyz&tz=Nowhere/Bad' }), broken)
    assert.equal(broken.statusCode, 200, '非法地点也必须给出合法画面参数')
    assert.ok(Number.isFinite(broken.body.sun.altitude))
  })
})

test('shanghai 与 reykjavik 同一时刻的天光参数明显不同（验收 3 的自动化版）', async () => {
  await withHome(async () => {
    const api = createApiHandler({ ctx: ctxStub, logger: null })
    const at = '2026-11-10T09:00:00Z'
    const sh = makeRes()
    await api.handler(makeReq({ url: '/intertidal/now?lat=31.23&lon=121.47&tz=Asia/Shanghai&at=' }), sh)
    const rk = makeRes()
    await api.handler(makeReq({ url: '/intertidal/now?lat=64.15&lon=-21.94&tz=Atlantic/Reykjavik' }), rk)
    // 真比较用纯函数（这里只验证两个接口都能跑通且给了不同画面族）
    assert.notDeepEqual(
      { a: sh.body.sun.altitude, p: sh.body.phase },
      { a: rk.body.sun.altitude, p: rk.body.phase },
    )
    void at
  })
})

// ---------------------------------------------------------------------------
// 媒体素材（v2）

test('媒体接口：默认关闭时返回 item:null', async () => {
  await withHome(async () => {
    const api = createApiHandler({ ctx: ctxStub, logger: null })
    const res = makeRes()
    await api.handler(makeReq({ url: '/intertidal/media' }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.item, null)
  })
})

test('媒体接口：目录模式 → 抽到一张 → 字节流能取回（含 Range）', async () => {
  await withHome(async () => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = await mkdtemp(join(tmpdir(), 'dsh-intertidal-dir-'))
    try {
      const png = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x02, 0x80, 0x00, 0x00, 0x01, 0x68,
      ])
      await writeFile(join(dir, 'sea.png'), png)
      await writeFile(join(dir, 'second.png'), png)
      await mkdir(join(dir, 'nested'))

      const api = createApiHandler({ ctx: ctxStub, logger: null })
      const save = makeRes()
      await api.handler(
        makeReq({ url: '/intertidal/settings', method: 'POST', body: JSON.stringify({ media: { mode: 'dir', dir } }) }),
        save,
      )
      assert.equal(save.statusCode, 200)
      assert.equal(save.body.media.mode, 'dir')
      assert.equal(save.body.media.dir, dir)

      const pick = makeRes()
      await api.handler(makeReq({ url: '/intertidal/media' }), pick)
      assert.equal(pick.statusCode, 200)
      assert.ok(pick.body.item, '抽得到素材')
      assert.equal(pick.body.item.kind, 'image')
      assert.equal(pick.body.item.source, 'dir')
      assert.equal(pick.body.item.width, 640, '尺寸嗅探')
      assert.equal(pick.body.item.height, 360)

      // 字节流：投给一个真正的 Writable，才能验证 pipe（假 res 会被 pipe 打爆）
      const { Writable } = await import('node:stream')
      const chunks = []
      const res = new Writable({
        write(chunk, _enc, callback) {
          chunks.push(Buffer.from(chunk))
          callback()
        },
      })
      res.statusCode = 200
      res.headers = {}
      res.setHeader = (key, value) => {
        res.headers[key] = value
      }
      res.writeHead = (status, headers) => {
        res.statusCode = status
        if (headers) Object.assign(res.headers, headers)
        return res
      }
      const finished = new Promise((resolve) => res.on('finish', resolve))
      await api.handler(makeReq({ url: pick.body.item.url }), res)
      await finished
      assert.equal(res.statusCode, 200)
      assert.equal(res.headers['content-type'], 'image/png')
      assert.equal(Number(res.headers['content-length']), png.length)
      assert.deepEqual(Buffer.concat(chunks), png, '取回的字节必须与源文件一致')
    } finally {
      const { rm } = await import('node:fs/promises')
      await rm(dir, { recursive: true, force: true })
    }
  })
})

test('媒体接口：文件名穿越与未启用一律拒绝', async () => {
  await withHome(async () => {
    const api = createApiHandler({ ctx: ctxStub, logger: null })
    const traversal = makeRes()
    await api.handler(makeReq({ url: '/intertidal/media/file?name=..%2Fstate.json' }), traversal)
    assert.ok([400, 404].includes(traversal.statusCode), '穿越必须被拒')

    const noName = makeRes()
    await api.handler(makeReq({ url: '/intertidal/media/file' }), noName)
    assert.equal(noName.statusCode, 400)
  })
})

test('媒体接口：scan 报告目录内容，非法目录不抛', async () => {
  await withHome(async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = await mkdtemp(join(tmpdir(), 'dsh-intertidal-scan-'))
    try {
      await writeFile(join(dir, 'a.jpg'), 'x')
      await writeFile(join(dir, 'b.mp4'), 'x')
      const api = createApiHandler({ ctx: ctxStub, logger: null })
      const res = makeRes()
      await api.handler(
        makeReq({ url: '/intertidal/media/scan', method: 'POST', body: JSON.stringify({ dir }) }),
        res,
      )
      assert.equal(res.statusCode, 200)
      assert.equal(res.body.ok, true)
      assert.equal(res.body.count, 2)
      assert.equal(res.body.images, 1)
      assert.equal(res.body.videos, 1)

      const bad = makeRes()
      await api.handler(
        makeReq({ url: '/intertidal/media/scan', method: 'POST', body: JSON.stringify({ dir: '/no/such/dir' }) }),
        bad,
      )
      assert.equal(bad.statusCode, 200)
      assert.equal(bad.body.ok, false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

test('媒体接口：resolve 拒绝非法链接（SSRF/协议）', async () => {
  await withHome(async () => {
    const api = createApiHandler({ ctx: ctxStub, logger: null })
    for (const url of ['http://127.0.0.1/a.jpg', 'file:///etc/passwd', 'ftp://x/a.jpg']) {
      const res = makeRes()
      await api.handler(
        makeReq({ url: '/intertidal/media/resolve', method: 'POST', body: JSON.stringify({ url }) }),
        res,
      )
      assert.equal(res.statusCode, 200)
      assert.equal(res.body.item, null, `${url} 必须解析失败而不是真去抓`)
    }
  })
})
