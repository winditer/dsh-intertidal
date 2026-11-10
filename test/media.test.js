// 潮间 —— 媒体素材层的单测（v2）：围栏、扩展名白名单、HTML 里挖首图、缓存淘汰。
//
// 这一层的失败模式是"安全事故"（路径穿越 / SSRF），所以每个拒绝路径都要有正反例；
// 网络部分不在这里测（resolveUrlToCache 需要真网络），只测它的纯函数前置条件。

import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  extractImageUrl,
  forgetPicks,
  isFetchableUrl,
  isMediaName,
  kindOf,
  pickFromDir,
  pruneCache,
  resolveDirFile,
  scanDir,
  sniffSize,
  cacheDir,
} from '../src/media.js'

async function withTmp(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-intertidal-media-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('kindOf：按扩展名分流，非白名单返回 null', () => {
  assert.equal(kindOf('a.JPG'), 'image')
  assert.equal(kindOf('a.webp'), 'image')
  assert.equal(kindOf('a.mp4'), 'video')
  assert.equal(kindOf('a.webm'), 'video')
  assert.equal(kindOf('a.txt'), null)
  assert.equal(kindOf('a.js'), null)
  assert.equal(kindOf(''), null)
  assert.equal(kindOf(undefined), null)
})

test('isMediaName：只认 basename，拒绝穿越与控制字符', () => {
  assert.equal(isMediaName('sea.jpg'), true)
  assert.equal(isMediaName('海 01.mp4'), true)
  assert.equal(isMediaName('../sea.jpg'), false)
  assert.equal(isMediaName('/etc/passwd.jpg'), false)
  assert.equal(isMediaName('a/b.jpg'), false)
  assert.equal(isMediaName('a\\b.jpg'), false)
  assert.equal(isMediaName('..jpg'), false)
  assert.equal(isMediaName('.hidden.jpg'), false)
  assert.equal(isMediaName('sea.txt'), false)
  assert.equal(isMediaName(42), false)
})

test('scanDir：只数白名单文件，读不到目录不抛', async () => {
  await withTmp(async (dir) => {
    await writeFile(join(dir, 'a.jpg'), 'x')
    await writeFile(join(dir, 'b.mp4'), 'x')
    await writeFile(join(dir, 'notes.txt'), 'x')
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, 'sub', 'c.jpg'), 'x')
    const scan = await scanDir(dir)
    assert.equal(scan.ok, true)
    assert.equal(scan.count, 2, '子目录里的不算，非白名单不算')
    assert.equal(scan.images, 1)
    assert.equal(scan.videos, 1)

    const missing = await scanDir(join(dir, 'nope'))
    assert.equal(missing.ok, false)
    assert.equal(missing.count, 0)

    const relative = await scanDir('pictures')
    assert.equal(relative.ok, false, '相对路径不认（没法做围栏）')
  })
})

test('pickFromDir：空目录返回 null，多张时不会连续给同一张', async () => {
  await withTmp(async (dir) => {
    forgetPicks()
    assert.equal(await pickFromDir(dir), null)

    await writeFile(join(dir, 'a.jpg'), 'x')
    await writeFile(join(dir, 'b.jpg'), 'x')
    await writeFile(join(dir, 'c.jpg'), 'x')
    const first = await pickFromDir(dir)
    assert.ok(first)
    assert.ok(first.url.startsWith('/intertidal/media/file?name='))
    assert.equal(first.source, 'dir')
    // 约束：连续两次不同
    for (let i = 0; i < 12; i += 1) {
      const next = await pickFromDir(dir)
      assert.notEqual(next.name, first.name === next.name ? '__impossible__' : undefined)
      const again = await pickFromDir(dir)
      assert.notEqual(again.name, next.name, '不允许连着两次同一张')
    }
  })
})

test('resolveDirFile：只服务目录内的真实文件', async () => {
  await withTmp(async (dir) => {
    await writeFile(join(dir, 'sea.jpg'), 'hello')
    const file = await resolveDirFile(dir, 'sea.jpg')
    assert.ok(file)
    assert.equal(file.mime, 'image/jpeg')
    assert.equal(file.size, 5)

    assert.equal(await resolveDirFile(dir, '../sea.jpg'), null, '穿越必须被拒')
    assert.equal(await resolveDirFile(dir, 'missing.jpg'), null)
    assert.equal(await resolveDirFile('/tmp', 'sea.jpg'), null, '不在这个目录里')
  })
})

test('isFetchableUrl：只放行公网 http/https', () => {
  assert.equal(isFetchableUrl('https://example.com/a.jpg'), true)
  assert.equal(isFetchableUrl('http://example.com/a.jpg'), true)
  for (const bad of [
    'ftp://example.com/a.jpg',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'http://localhost/a.jpg',
    'http://127.0.0.1/a.jpg',
    'http://10.0.0.1/a.jpg',
    'http://192.168.1.1/a.jpg',
    'http://172.16.5.5/a.jpg',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/a.jpg',
    'http://nas.local/a.jpg',
    'not a url',
    '',
  ]) {
    assert.equal(isFetchableUrl(bad), false, `${bad} 必须被拒`)
  }
  // 172.32 是公网段，不能误伤
  assert.equal(isFetchableUrl('http://172.32.0.1/a.jpg'), true)
})

test('extractImageUrl：og:image → twitter:image → 首图，且能补成绝对地址', () => {
  const base = 'https://example.com/post/1'
  assert.equal(
    extractImageUrl('<meta property="og:image" content="https://cdn.example.com/a.jpg">', base),
    'https://cdn.example.com/a.jpg',
  )
  assert.equal(
    extractImageUrl('<meta content="/img/b.png" property="og:image">', base),
    'https://example.com/img/b.png',
  )
  assert.equal(
    extractImageUrl('<meta name="twitter:image" content="https://cdn.example.com/c.webp">', base),
    'https://cdn.example.com/c.webp',
  )
  assert.equal(
    extractImageUrl('<html><body><img src="pics/d.jpg" alt=""></body></html>', base),
    'https://example.com/post/pics/d.jpg',
  )
  assert.equal(
    extractImageUrl('<meta property="og:image" content="https://cdn.example.com/a.jpg?a=1&amp;b=2">', base),
    'https://cdn.example.com/a.jpg?a=1&b=2',
  )
  assert.equal(extractImageUrl('<html>没有图</html>', base), null)
  assert.equal(extractImageUrl('', base), null)
  assert.equal(extractImageUrl('<img src="javascript:alert(1)">', base), null)
})

test('pruneCache：超出上限按最旧的删', async () => {
  await withTmp(async (dir) => {
    for (const name of ['old.jpg', 'mid.jpg', 'new.jpg']) {
      await writeFile(join(dir, name), Buffer.alloc(100))
    }
    // 让修改时间有明确先后
    const { utimes } = await import('node:fs/promises')
    await utimes(join(dir, 'old.jpg'), new Date(2020, 0, 1), new Date(2020, 0, 1))
    await utimes(join(dir, 'mid.jpg'), new Date(2021, 0, 1), new Date(2021, 0, 1))
    await utimes(join(dir, 'new.jpg'), new Date(2022, 0, 1), new Date(2022, 0, 1))

    const result = await pruneCache(dir, 150)
    assert.equal(result.removed, 2)
    assert.deepEqual((await readdir(dir)).sort(), ['new.jpg'])

    const empty = await pruneCache(join(dir, 'missing'), 10)
    assert.equal(empty.removed, 0)
  })
})

test('sniffSize：认出 PNG / GIF 头部的尺寸，认不出返回 null', async () => {
  await withTmp(async (dir) => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
      0x00, 0x00, 0x07, 0x80, 0x00, 0x00, 0x04, 0x38, // 1920 x 1080
    ])
    await writeFile(join(dir, 'a.png'), png)
    assert.deepEqual(await sniffSize(join(dir, 'a.png')), { width: 1920, height: 1080 })

    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xf0, 0x00])
    await writeFile(join(dir, 'b.gif'), gif)
    assert.deepEqual(await sniffSize(join(dir, 'b.gif')), { width: 320, height: 240 })

    await writeFile(join(dir, 'c.bin'), Buffer.alloc(4))
    assert.equal(await sniffSize(join(dir, 'c.bin')), null)
    assert.equal(await sniffSize(join(dir, 'missing.png')), null)
  })
})

test('cacheDir 落在 <home>/intertidal/cache', () => {
  assert.equal(cacheDir('/tmp/home'), join('/tmp/home', 'intertidal', 'cache'))
})