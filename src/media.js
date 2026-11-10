// 潮间 · 媒体素材（v2：用真实图片/视频当海的基底，程序化海降级为兜底）
//
// 两条来源：
//   dir —— 用户指定的本地目录，随机挑一张（每次浮现换一张）
//   url —— 用户给的链接；可能是直链图片，也可能是一个网页（从 og:image / 首图里挖）
//
// 三条约束：
//   1. **路径围栏**：只服务目录内的 basename，扩展名白名单之外一律不认，杜绝 `../` 穿越。
//   2. **不联网就不用网络**：`dir` 模式完全不发请求；`url` 模式只在缓存缺失时下载一次，
//      之后一直用本地缓存（离线也能继续看）。
//   3. **装载期零 IO**：本文件 import 时不读目录、不建目录、不解析 $DSH_HOME。

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join, resolve, sep } from 'node:path'

export const IMAGE_EXT = Object.freeze(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp'])
export const VIDEO_EXT = Object.freeze(['.mp4', '.webm', '.mov', '.m4v'])

export const MIME = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
})

const MAX_DOWNLOAD = 40 * 1024 * 1024
const MAX_HTML = 2 * 1024 * 1024
const MAX_CACHE_BYTES = 200 * 1024 * 1024
const FETCH_TIMEOUT = 12_000
const CACHE_DIR_NAME = 'cache'

/** 扩展名 → 'image' | 'video' | null */
export function kindOf(name) {
  const ext = extname(String(name ?? '')).toLowerCase()
  if (IMAGE_EXT.includes(ext)) return 'image'
  if (VIDEO_EXT.includes(ext)) return 'video'
  return null
}

/** 合法的素材文件名：只有 basename，没有分隔符，扩展名在白名单内。 */
export function isMediaName(name) {
  if (typeof name !== 'string' || !name) return false
  if (name !== basename(name)) return false
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return false
  if (name.startsWith('.')) return false
  return kindOf(name) !== null
}

export function cacheDir(home) {
  return join(home, 'intertidal', CACHE_DIR_NAME)
}

/** 目录里有哪些素材（只认白名单扩展名，跳过隐藏文件）。 */
export async function scanDir(dir) {
  if (typeof dir !== 'string' || !isAbsolute(dir)) {
    return { dir, ok: false, count: 0, images: 0, videos: 0, names: [], error: 'not-absolute' }
  }
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    return { dir, ok: false, count: 0, images: 0, videos: 0, names: [], error: String(error?.code ?? error) }
  }
  const names = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!isMediaName(entry.name)) continue
    names.push(entry.name)
  }
  names.sort()
  const images = names.filter((name) => kindOf(name) === 'image').length
  return {
    dir,
    ok: true,
    count: names.length,
    images,
    videos: names.length - images,
    names: names.slice(0, 50),
  }
}

/** 上一个挑到的文件（避免"随机"连着两次同一张）。 */
const lastPicked = new Map()

/** 从目录里挑一个素材；空目录返回 null。 */
export async function pickFromDir(dir, { shuffle = true } = {}) {
  const scan = await scanDir(dir)
  if (!scan.ok || scan.count === 0) return null
  const previous = lastPicked.get(dir)
  const pool = !shuffle && Array.isArray(scan.names) && scan.names.length ? scan.names : scan.names
  let candidates = pool
  if (pool.length > 1 && previous) candidates = pool.filter((name) => name !== previous)
  const name = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0]
  lastPicked.set(dir, name)
  return { kind: kindOf(name), name, url: `/intertidal/media/file?name=${encodeURIComponent(name)}`, source: 'dir' }
}

/** 目录内一个文件的绝对路径；不合法或不存在返回 null（围栏的第二道：路径必须真的在目录下）。 */
export async function resolveDirFile(dir, name) {
  if (typeof dir !== 'string' || !isAbsolute(dir)) return null
  if (!isMediaName(name)) return null
  const target = resolve(dir, name)
  if (!target.startsWith(resolve(dir) + sep)) return null
  try {
    const info = await stat(target)
    if (!info.isFile()) return null
    return { path: target, size: info.size, mime: MIME[extname(name).toLowerCase()] ?? 'application/octet-stream' }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// url 模式：下载一次、本地缓存、之后离线可用

function cacheKey(url) {
  return createHash('sha1').update(url).digest('hex')
}

/** 只允许公网 http/https：拒绝 loopback 与私有网段（防 SSRF）。 */
export function isFetchableUrl(text) {
  let parsed
  try {
    parsed = new URL(String(text))
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase()
  if (!host) return false
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false
  if (host === '::1' || host === '[::1]') return false
  if (/^127\./.test(host)) return false
  if (/^10\./.test(host)) return false
  if (/^192\.168\./.test(host)) return false
  if (/^169\.254\./.test(host)) return false
  const private172 = /^172\.(\d{1,3})\./.exec(host)
  if (private172) {
    const second = Number(private172[1])
    if (second >= 16 && second <= 31) return false
  }
  if (host.startsWith('[')) return false // 其余 IPv6 一律不接
  return true
}

async function fetchWithLimit(url, { limit, accept }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) dsh-intertidal/0.2',
        'accept': accept,
      },
    })
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
    const length = Number(res.headers.get('content-length') ?? 0)
    if (Number.isFinite(length) && length > limit) throw new Error('内容太大')
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length > limit) throw new Error('内容太大')
    return { buffer, contentType: String(res.headers.get('content-type') ?? '') }
  } finally {
    clearTimeout(timer)
  }
}

/** 从一个网页 HTML 里挖出最像"首图"的地址。 */
export function extractImageUrl(html, baseUrl) {
  const text = String(html ?? '')
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url|:url)?["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url|:url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["']/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (!match) continue
    try {
      const absolute = new URL(decodeURIComponent(match[1].replace(/&amp;/g, '&')), baseUrl)
      if (absolute.protocol === 'http:' || absolute.protocol === 'https:') return absolute.href
    } catch {
      /* 试下一条 */
    }
  }
  return null
}

function extFromContentType(contentType, fallbackUrl) {
  const type = contentType.split(';')[0].trim().toLowerCase()
  const byType = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/gif': '.gif',
    'image/bmp': '.bmp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  }[type]
  if (byType) return byType
  try {
    const ext = extname(new URL(fallbackUrl).pathname).toLowerCase()
    if (MIME[ext]) return ext
  } catch {
    /* ignore */
  }
  return null
}

/** 把总量压回上限（按修改时间从旧到新删）。 */
export async function pruneCache(dir, maxBytes = MAX_CACHE_BYTES) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return { removed: 0 }
  }
  const files = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    try {
      const info = await stat(join(dir, entry.name))
      files.push({ name: entry.name, size: info.size, mtime: info.mtimeMs })
    } catch {
      /* 读不到就跳过 */
    }
  }
  files.sort((a, b) => a.mtime - b.mtime)
  let total = files.reduce((sum, file) => sum + file.size, 0)
  let removed = 0
  for (const file of files) {
    if (total <= maxBytes) break
    try {
      await unlink(join(dir, file.name))
      total -= file.size
      removed += 1
    } catch {
      /* ignore */
    }
  }
  return { removed }
}

/**
 * 解析一个链接 → 缓存中的素材。
 * 直链图片/视频直接下载；网页则先挖 og:image 再下载。
 * @returns {{kind,name,url,source}|null}
 */
export async function resolveUrlToCache(url, cacheDirectory) {
  if (!isFetchableUrl(url)) return null
  const key = cacheKey(url)
  const directory = cacheDirectory

  // 已经缓存过就直接用（同一个链接不会重复下载）
  try {
    const names = await readdir(directory)
    const hit = names.find((name) => name.startsWith(`${key}.`) && kindOf(name))
    if (hit) {
      const info = await stat(join(directory, hit))
      if (info.size > 0) {
        return { kind: kindOf(hit), name: hit, url: `/intertidal/media/file?name=${encodeURIComponent(hit)}`, source: 'url' }
      }
    }
  } catch {
    /* 目录还不存在，往下走 */
  }

  let fetched
  try {
    fetched = await fetchWithLimit(url, { limit: MAX_HTML, accept: 'image/*,video/*,text/html;q=0.8,*/*;q=0.5' })
  } catch {
    return null
  }

  const isHtml = fetched.contentType.startsWith('text/html')
  let payload = fetched.buffer
  let contentType = fetched.contentType
  let sourceUrl = url

  if (isHtml) {
    const imageUrl = extractImageUrl(fetched.buffer.toString('utf8'), url)
    if (!imageUrl || !isFetchableUrl(imageUrl)) return null
    try {
      const image = await fetchWithLimit(imageUrl, { limit: MAX_DOWNLOAD, accept: 'image/*,video/*,*/*;q=0.5' })
      payload = image.buffer
      contentType = image.contentType
      sourceUrl = imageUrl
    } catch {
      return null
    }
  }

  const ext = extFromContentType(contentType, sourceUrl)
  if (!ext) return null

  const name = `${key}${ext}`
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await writeFile(join(directory, name), payload, { mode: 0o600 })
  } catch {
    return null
  }
  void pruneCache(directory)
  return { kind: kindOf(name), name, url: `/intertidal/media/file?name=${encodeURIComponent(name)}`, source: 'url' }
}

/** 缓存目录里挑一个（url 模式下的随机换图）。 */
export async function pickFromCache(directory) {
  let names
  try {
    names = await readdir(directory)
  } catch {
    return null
  }
  const usable = names.filter(isMediaName)
  if (!usable.length) return null
  const name = usable[Math.floor(Math.random() * usable.length)]
  return { kind: kindOf(name), name, url: `/intertidal/media/file?name=${encodeURIComponent(name)}`, source: 'url' }
}

/** 打开一个媒体文件流（支持 Range，视频才能拖/循环）。 */
export async function openMediaFile(directory, name) {
  if (!isMediaName(name)) return null
  const target = resolve(directory, name)
  if (!target.startsWith(resolve(directory) + sep)) return null
  try {
    const info = await stat(target)
    if (!info.isFile()) return null
    return {
      stream: (range) => createReadStream(target, range),
      size: info.size,
      mime: MIME[extname(name).toLowerCase()] ?? 'application/octet-stream',
      path: target,
    }
  } catch {
    return null
  }
}

/** 读一点点字节做图片尺寸嗅探（只认 PNG/JPEG/GIF/WebP 四类头，认不出就返回 null）。 */
export async function sniffSize(path) {
  let buffer
  try {
    const handle = await readFile(path)
    buffer = handle.subarray(0, 64 * 1024)
  } catch {
    return null
  }
  try {
    // PNG
    if (buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
    }
    // GIF
    if (buffer.length >= 10 && buffer.toString('ascii', 0, 3) === 'GIF') {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }
    }
    // WebP
    if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      const chunk = buffer.toString('ascii', 12, 16)
      if (chunk === 'VP8X') {
        const width = 1 + (buffer.readUIntLE(24, 3) & 0xffffff)
        const height = 1 + (buffer.readUIntLE(27, 3) & 0xffffff)
        return { width, height }
      }
      if (chunk === 'VP8 ') {
        return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff }
      }
      if (chunk === 'VP8L') {
        const bits = buffer.readUInt32LE(21)
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
      }
    }
    // JPEG：扫 SOFn
    if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1
          continue
        }
        const marker = buffer[offset + 1]
        const length = buffer.readUInt16BE(offset + 2)
        const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
        if (isSof) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
        }
        offset += 2 + length
      }
    }
  } catch {
    /* 认不出就当没有 */
  }
  return null
}

export const MEDIA_LIMITS = Object.freeze({ MAX_DOWNLOAD, MAX_HTML, MAX_CACHE_BYTES })

/** 给测试用：清掉"上次挑到哪个"的记忆。 */
export function forgetPicks() {
  lastPicked.clear()
}

/** 默认主页（测试可改 $DSH_HOME 后再取）。 */
export function defaultDshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}