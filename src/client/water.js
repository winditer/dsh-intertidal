// 潮间 · 程序化水面的新画法：**斑块场**，不是一排排浪脊。
//
// 用户反馈（第三次）：海还是一"条一条"的，真实的海是"一块一块"、随机分布的。
// 根因不是调参能解决的：只要按"横向贯通的浪前"来画，无论怎么加噪声，屏幕上都会出现
// 可数的水平带子——那是画法本身，不是细节不够。
//
// 这里的做法换了：
//   1. 在**低分辨率的高度场**上按透视采样 3 个八度的值噪声（ridged + smooth 两种），
//      每帧只算 ~4-6 万像素，然后整块放大到屏幕（双线性，天然柔化）——
//      得到的是随机分布、大小随远近变化的"水面斑块"，没有贯通全屏的条纹；
//   2. 高度场的斜率决定哪里被太阳照亮（镜面碎光），所以亮点是**跟着斑块走向散落**的；
//   3. 靠近观察者（画面下方）的斑块上叠加白色浪沫，浪沫是斑块状的，不是一条线；
//   4. 地平线一条雾带把水天接缝抹掉。
//
// 这个文件不碰 React、不碰生命周期：`createWaterField()` 造缓冲，`drawWater()` 画一帧，
// 调用方（sea-canvas）决定什么时候调用、什么时候停帧。

const TAU = Math.PI * 2

/** 一帧高度场的内部缓冲宽度（像素）。高度按画面比例算，上限见 MAX_BUFFER_H。 */
const BUFFER_W = 430
const MAX_BUFFER_H = 260
const MIN_BUFFER_H = 40

/* ------------------------------ 噪声 ------------------------------ */

/** 32 位整数哈希 → [0,1)。不用 Math.random，保证同一 t 的结果可复现。 */
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 值噪声（smoothstep 插值）。 */
function vnoise(x, y) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** 3 个八度的平滑噪声（给水色用）。 */
function fbmSmooth(x, y) {
  return (
    0.55 * vnoise(x, y) +
    0.3 * vnoise(x * 2.07 + 3.1, y * 2.07 + 1.7) +
    0.15 * vnoise(x * 4.31 + 7.7, y * 4.31 + 3.3)
  )
}

/** ridged 噪声（给浪脊/浪沫用）：把噪声折叠成尖锐的脊，4 个八度保证近处有细碎浪。 */
function fbmRidged(x, y) {
  let sum = 0
  let amp = 0.6
  let freq = 1
  let total = 0
  for (let o = 0; o < 4; o += 1) {
    const n = vnoise(x * freq + o * 13.7, y * freq + o * 7.3)
    sum += amp * (1 - Math.abs(2 * n - 1))
    total += amp
    amp *= 0.52
    freq *= 2.17
  }
  return sum / total
}

/* ------------------------------ 颜色 ------------------------------ */

function hexToRgb(hex) {
  const text = String(hex ?? '').replace('#', '')
  if (text.length !== 6) return [0, 0, 0]
  return [parseInt(text.slice(0, 2), 16), parseInt(text.slice(2, 4), 16), parseInt(text.slice(4, 6), 16)]
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a, b, t) => a + (b - a) * t

/* ------------------------------ 场 ------------------------------ */

/**
 * 造一个高度场缓冲。`drawWater()` 内部会按需重建。
 * @returns {{ width:number, height:number, canvas:any, ctx:any, image:any, h:Float32Array }}
 */
export function createWaterField(doc = globalThis.document) {
  const canvas = doc?.createElement?.('canvas') ?? null
  return { width: 0, height: 0, canvas, ctx: canvas?.getContext?.('2d') ?? null, image: null, h: null }
}

function ensureSize(field, width, height) {
  if (field.width === width && field.height === height && field.image) return true
  field.width = width
  field.height = height
  field.h = new Float32Array(width * height)
  if (!field.canvas || !field.ctx) return false
  field.canvas.width = width
  field.canvas.height = height
  field.image = field.ctx.createImageData(width, height)
  return true
}

/**
 * 画一帧水面。调用方负责 `接缝`（地平线以上不动）。
 *
 * @param {CanvasRenderingContext2D} ctx 全分辨率上下文（已经 setTransform 成 W×H）
 * @param {{W:number,H:number,horizonY:number,t:number,pal:any,tideN?:number}} view
 * @param {ReturnType<typeof createWaterField>} field
 * @returns {boolean} 画成功返回 true
 */
export function drawWater(ctx, view, field) {
  const { W, H, horizonY, t } = view
  const pal = view.pal ?? {}
  const tideN = Number.isFinite(view.tideN) ? view.tideN : 0
  const waterH = Math.max(1, H - horizonY)

  const bw = BUFFER_W
  const bh = Math.max(MIN_BUFFER_H, Math.min(MAX_BUFFER_H, Math.round((bw * waterH) / Math.max(1, W))))
  if (!ensureSize(field, bw, bh)) return false

  const exposure = clamp01(Number.isFinite(pal.exposure) ? pal.exposure : 0.8)
  const deep = hexToRgb(pal.seaNear ?? '#0d1729')
  const mid = hexToRgb(pal.seaMid ?? '#27728e')
  const far = hexToRgb(pal.seaFar ?? '#4793ae')
  const sky = hexToRgb(pal.skyBottom ?? '#b7e1f6')
  const foam = hexToRgb(pal.foam ?? '#ffffff')
  const glow = hexToRgb(pal.horizonGlow ?? '#ffd5a8')

  // 太阳/月亮在画面里的横向位置（0..1）；没有天体就用正午的默认方向，避免碎光整片消失。
  const body = pal.sun || pal.moon || null
  const bodyX = body ? clamp01(body.x) : 0.5
  const bodyColor = hexToRgb(body?.color ?? pal.horizonGlow ?? '#fff6e2')
  const bodyAlpha = body ? clamp01(body.alpha ?? 0.8) : 0.35

  const heights = field.h
  // 透视：屏幕上越靠下 = 世界坐标里离观察者越近。用 zc = 1/(a+b·d) 做距离映射，
  // 横向再用 zc 放大 —— 斑块在世界空间里各向同性，屏幕上自然近大远小。
  //
  // v0.1.3：在"随机斑块"之上加一层**涌浪层次**。纯噪声看起来是平的、没有远近层次；
  // 真实的海能看出"一道一道的涌浪由远及近"。做法是把高度场乘上一个沿深度推进的相位带：
  //   phase = d·LAYERS - t·SPEED（t 增大 → 同一道浪的 d 增大 → 屏幕上往下走 = 朝观察者推过来）
  // 再用低频噪声扭曲相位，使浪脊不是直线、而是被随机打断的弧形 —— 既有层次，又不是"一条一条"。
  // 速度取 0.115 道/秒：一道涌浪从地平线推到脚下大约 8–9 秒，慢到能看清，不像快进。
  const LAYERS = 6.0 //   画面里同时能看到的涌浪道数
  const SPEED = 0.22 //   每秒推进多少"道"：一道浪从地平线到脚下约 27 秒，每 ~4.5 秒来一道新的
  const scroll = t * 0.12 // 细碎纹理自身的极慢漂移
  const XSPREAD = 6.2
  const WFREQ = 5.4
  const XFREQ = 1.45

  /* ---- 第一遍：高度场 ---- */
  let idx = 0
  for (let j = 0; j < bh; j += 1) {
    const d = (j + 0.5) / bh
    const zc = 1 / (0.38 + d * 2.4)
    const wz = zc - scroll
    const phaseBase = d * LAYERS - t * SPEED
    // 涌浪振幅随深度变大（近处高），远处收得很小，免得地平线附近糊成一片
    const swellAmp = 0.16 + 0.30 * d
    for (let i = 0; i < bw; i += 1) {
      const wx = ((i + 0.5) / bw - 0.5) * zc * XSPREAD
      // 相位扭曲：让浪脊是弧形/被绊住，而不是一条笔直的横线
      const wobble = (vnoise(wx * 0.85 + 9.7, wz * 0.55 + 3.3) - 0.5) * 0.62
      const swell = Math.sin((phaseBase + wobble) * TAU)
      const ridge = fbmRidged(wx * XFREQ + 3.0, wz * WFREQ)
      const detail = fbmSmooth(wx * XFREQ * 1.9 + 11.3, wz * WFREQ * 0.72 + 5.1)
      // 三段合成：涌浪层（大尺度、有方向）+ 碎浪脊（随机斑块）+ 细纹理
      const h = 0.5 + 0.5 * swell * swellAmp + (ridge - 0.5) * 0.5 + (detail - 0.5) * 0.28
      heights[idx] = h < 0 ? 0 : h > 1 ? 1 : h
      idx += 1
    }
  }

  /* ---- 第二遍：上色（高度场邻居算斜率 → 明暗与碎光） ---- */
  const data = field.image.data
  let p = 0
  for (let j = 0; j < bh; j += 1) {
    const d = (j + 0.5) / bh
    const haze = (1 - d) * (1 - d) * (0.55 + 0.35 * exposure)
    // 远处偏天空色、近处偏深水
    const nearness = clamp01(d * 1.6)
    const rBase = lerp(lerp(far[0], mid[0], nearness), deep[0], Math.max(0, d - 0.35) / 0.65)
    const gBase = lerp(lerp(far[1], mid[1], nearness), deep[1], Math.max(0, d - 0.35) / 0.65)
    const bBase = lerp(lerp(far[2], mid[2], nearness), deep[2], Math.max(0, d - 0.35) / 0.65)
    const foamBand = clamp01((d - 0.78) / 0.22) * clamp01(0.45 + 0.45 * tideN)
    const rowLight = 0.5 + 0.5 * exposure

    for (let i = 0; i < bw; i += 1) {
      const h = heights[j * bw + i]
      const hx = (heights[j * bw + Math.min(bw - 1, i + 1)] - heights[j * bw + Math.max(0, i - 1)]) * 0.5
      const hz = (heights[Math.min(bh - 1, j + 1) * bw + i] - heights[Math.max(0, j - 1) * bw + i]) * 0.5

      // 明暗：坡度朝光的一侧亮、背光暗 —— 这是"块与块之间有立体感"的来源
      const tilt = -(hx * (bodyX - 0.5) * 4.4 + hz * 1.15)
      // 近处不要压成黑条：明暗增益随深度递减
      const shade = clamp01(0.64 + tilt * (2.2 - 0.9 * d))
      const crest = clamp01((h - 0.4) / 0.6)

      let r = rBase * shade
      let g = gBase * shade
      let b = bBase * shade

      // 天际反射（雾感）
      r = lerp(r, sky[0], haze * 0.62)
      g = lerp(g, sky[1], haze * 0.62)
      b = lerp(b, sky[2], haze * 0.62)

      // 浪脊亮边：只有"高且坡对"的碎块才亮，不是整条线
      const crestLight = crest * crest * clamp01(0.25 + tilt * 2.2) * rowLight
      r += glow[0] * crestLight * 0.3
      g += glow[1] * crestLight * 0.3
      b += glow[2] * crestLight * 0.28

      // 镜面碎光
      const spec = Math.pow(clamp01(0.26 - tilt * 1.35), 5) * crest * bodyAlpha
      if (spec > 0.004) {
        r += bodyColor[0] * spec * 1.35
        g += bodyColor[1] * spec * 1.35
        b += bodyColor[2] * spec * 1.35
      }

      // 白沫：只在近处、只在最高的那批碎块上，斑块状
      if (foamBand > 0.01) {
        const mask = clamp01((h - (0.72 - 0.1 * foamBand)) / 0.24) * foamBand
        if (mask > 0.01) {
          const a = mask * 0.32
          r = lerp(r, foam[0], a)
          g = lerp(g, foam[1], a)
          b = lerp(b, foam[2], a)
        }
      }

      data[p] = r > 255 ? 255 : r < 0 ? 0 : r
      data[p + 1] = g > 255 ? 255 : g < 0 ? 0 : g
      data[p + 2] = b > 255 ? 255 : b < 0 ? 0 : b
      data[p + 3] = 255
      p += 4
    }
  }

  field.ctx.putImageData(field.image, 0, 0)

  /* ---- 放大到屏幕 ---- */
  ctx.save()
  ctx.imageSmoothingEnabled = true
  try {
    ctx.imageSmoothingQuality = 'high'
  } catch {
    /* 老浏览器没有这个属性 */
  }
  ctx.drawImage(field.canvas, 0, horizonY, W, waterH)
  ctx.restore()

  /* ---- 碎光：全分辨率撒一层短线，让近处的"块"有反光点 ---- */
  try {
    drawGlitter(ctx, { W, H, horizonY, t, pal, exposure, bodyX, bodyAlpha, glow })
  } catch {
    /* 碎光失败了不影响画面 */
  }

  /* ---- 地平线雾带：把水天接缝抹掉 ---- */
  try {
    const hazeH = Math.max(2, waterH * 0.09)
    const grad = ctx.createLinearGradient(0, horizonY - hazeH * 0.4, 0, horizonY + hazeH)
    grad.addColorStop(0, `rgba(${sky[0] | 0},${sky[1] | 0},${sky[2] | 0},${0.55 + 0.35 * (1 - exposure)})`)
    grad.addColorStop(1, `rgba(${sky[0] | 0},${sky[1] | 0},${sky[2] | 0},0)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, horizonY - hazeH * 0.4, W, hazeH * 1.4)
  } catch {
    /* 渐变失败了就少一层雾，不影响画面 */
  }

  return true
}

/**
 * 全分辨率碎光：在太阳/月亮下方的水面上撒一批 1–3px 的短线，密度与亮度跟曝光、天体高度相关。
 * 位置由哈希决定（可复现），相位随 t 闪灭，所以看起来是"碎着亮"而不是一片亮。
 */
function drawGlitter(ctx, { W, H, horizonY, t, pal, exposure, bodyX, bodyAlpha, glow }) {
  const waterH = H - horizonY
  if (waterH <= 2) return
  const count = Math.round((40 + 150 * exposure) * clamp01(bodyAlpha + 0.2))
  const sunU = bodyX
  ctx.save()
  for (let n = 0; n < count; n += 1) {
    const seedA = hash2(n * 3 + 1, 7)
    const seedB = hash2(n * 5 + 2, 13)
    const seedC = hash2(n * 7 + 3, 19)
    // 越靠下（近处）越密，横向集中在天体附近（±0.28 屏宽）
    const d = Math.pow(seedA, 0.72) // 0 远 → 1 近
    const y = horizonY + d * waterH
    const spread = 0.18 + 0.34 * d
    const x = (sunU + (seedB - 0.5) * 2 * spread) * W
    if (x < 0 || x > W) continue
    const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.45 + seedC * 1.1) + seedC * TAU))
    const alpha = twinkle * (0.12 + 0.34 * exposure) * clamp01(1 - Math.abs(seedB - 0.5) * 1.9)
    if (alpha < 0.03) continue
    const len = 1 + 1.6 * d + seedC
    ctx.fillStyle = `rgba(${glow[0] | 0},${glow[1] | 0},${glow[2] | 0},${alpha.toFixed(3)})`
    ctx.fillRect(x, y, len, 1)
  }
  ctx.restore()
}

/** 供测试：同一输入必须给出同一高度场（不含 Math.random）。 */
export const WATER_CONSTANTS = Object.freeze({ BUFFER_W, MAX_BUFFER_H, MIN_BUFFER_H, TAU })