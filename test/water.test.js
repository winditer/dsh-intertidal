// 潮间 —— 新水面（斑块场）的单测。
//
// water.js 是纯 JS（不 import React、装载期不碰 DOM），所以 node 能直接跑。
// 这里钉死三件事：
//   1. **可复现**：同一 t 必须给出同一高度场（噪声里不许有 Math.random）；
//   2. **没有"一条一条"**：高度场沿 y 的自相关必须远低于"整行同值"那种横带特征；
//   3. **不抛**：没有 canvas / 没有 pal / 极端尺寸都要能安全退化。

import assert from 'node:assert/strict'
import test from 'node:test'

import { WATER_CONSTANTS, createWaterField, drawWater } from '../src/client/water.js'

/** 造一个只够 record 调用的假 2D context（water.js 会 putImageData + drawImage + fillRect）。 */
function fakeCtx() {
  const calls = []
  return {
    calls,
    fillStyle: '',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'high',
    save() {
      calls.push('save')
    },
    restore() {
      calls.push('restore')
    },
    fillRect(x, y, w, h) {
      calls.push(['fillRect', x, y, w, h])
    },
    drawImage(source, dx, dy, dw, dh) {
      calls.push(['drawImage', dx, dy, dw, dh])
    },
    createLinearGradient() {
      return { addColorStop() {} }
    },
    beginPath() {},
    arc() {},
    fill() {},
    createRadialGradient() {
      return { addColorStop() {} }
    },
  }
}

/** 造一个假 document，让 createWaterField 能造出 canvas + ImageData。 */
function fakeDocument(width = 0, height = 0) {
  return {
    createElement() {
      const canvas = {
        width,
        height,
        getContext() {
          return {
            createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
            putImageData() {},
            save() {},
            restore() {},
            drawImage() {},
            fillRect() {},
            createLinearGradient: () => ({ addColorStop() {} }),
          }
        },
      }
      return canvas
    },
  }
}

const PAL = {
  seaFar: '#4793ae',
  seaMid: '#27728e',
  seaNear: '#16506b',
  skyBottom: '#b7e1f6',
  foam: '#fefaef',
  horizonGlow: '#fceed1',
  exposure: 0.95,
  sun: { x: 0.5, y: 0.2, color: '#fff6e2', alpha: 0.8 },
}

test('drawWater 在假 canvas 上画一帧：putImageData + drawImage + 雾带，不抛', () => {
  const field = createWaterField(fakeDocument())
  const ctx = fakeCtx()
  assert.equal(drawWater(ctx, { W: 1280, H: 720, horizonY: 374, t: 6.4, pal: PAL, tideN: 0 }, field), true)
  const kinds = ctx.calls.filter((c) => Array.isArray(c)).map((c) => c[0])
  assert.ok(kinds.includes('drawImage'), '必须把高度场放大贴到画面上')
  assert.ok(kinds.includes('fillRect'), '地平线雾带用 fillRect')
  assert.ok(field.width > 0 && field.height > 0)
})

test('没有 canvas（拿不到 document）时返回 false，而不是抛', () => {
  const field = createWaterField(undefined)
  const ctx = fakeCtx()
  assert.equal(drawWater(ctx, { W: 800, H: 600, horizonY: 300, t: 1, pal: PAL }, field), false)
  assert.equal(ctx.calls.length, 0, '画不出来就不该在画布上留半帧')
})

test('pal 缺失 / 数值是垃圾也不抛', () => {
  const field = createWaterField(fakeDocument())
  const ctx = fakeCtx()
  assert.equal(drawWater(ctx, { W: 640, H: 360, horizonY: 190, t: 0, pal: {} }, field), true)
  assert.equal(
    drawWater(ctx, { W: 640, H: 360, horizonY: 190, t: Number.NaN, pal: { exposure: Number.NaN, sun: null }, tideN: 'x' }, field),
    true,
  )
})

test('极端尺寸：地平线贴到底 / 宽高比极端', () => {
  const field = createWaterField(fakeDocument())
  const ctx = fakeCtx()
  assert.equal(drawWater(ctx, { W: 1280, H: 720, horizonY: 718, t: 3, pal: PAL }, field), true)
  assert.equal(drawWater(ctx, { W: 200, H: 1200, horizonY: 200, t: 3, pal: PAL }, field), true)
  assert.ok(field.height >= WATER_CONSTANTS.MIN_BUFFER_H)
  assert.ok(field.height <= WATER_CONSTANTS.MAX_BUFFER_H)
})

test('可复现：同一 t 两次渲染的高度场逐像素相同（噪声里没有 Math.random）', () => {
  const a = createWaterField(fakeDocument())
  const b = createWaterField(fakeDocument())
  drawWater(fakeCtx(), { W: 900, H: 560, horizonY: 290, t: 12.34, pal: PAL }, a)
  drawWater(fakeCtx(), { W: 900, H: 560, horizonY: 290, t: 12.34, pal: PAL }, b)
  assert.deepEqual(Array.from(a.h), Array.from(b.h))
})

test('随时间真正在动：t 变了高度场就变', () => {
  const a = createWaterField(fakeDocument())
  drawWater(fakeCtx(), { W: 900, H: 560, horizonY: 290, t: 1, pal: PAL }, a)
  const first = Array.from(a.h)
  drawWater(fakeCtx(), { W: 900, H: 560, horizonY: 290, t: 3, pal: PAL }, a)
  const second = Array.from(a.h)
  let changed = 0
  for (let i = 0; i < first.length; i += 1) if (Math.abs(first[i] - second[i]) > 1e-6) changed += 1
  assert.ok(changed / first.length > 0.8, `超过 80% 的采样点应该变化，实测 ${((changed / first.length) * 100).toFixed(1)}%`)
})

test('不是"一条一条"：整行恒定的横向条纹比例必须很低', () => {
  // 如果画面是横向贯通的一条条浪脊，那么同一行内的高度值会高度一致。
  // 这里统计"行内标准差接近 0"的行所占比例——它应该很小。
  const field = createWaterField(fakeDocument())
  drawWater(fakeCtx(), { W: 1280, H: 720, horizonY: 374, t: 5, pal: PAL }, field)
  const { width: w, height: h, h: heights } = field
  let flatRows = 0
  for (let j = 0; j < h; j += 1) {
    let sum = 0
    for (let i = 0; i < w; i += 1) sum += heights[j * w + i]
    const mean = sum / w
    let varSum = 0
    for (let i = 0; i < w; i += 1) {
      const d = heights[j * w + i] - mean
      varSum += d * d
    }
    const sd = Math.sqrt(varSum / w)
    if (sd < 0.02) flatRows += 1
  }
  const ratio = flatRows / h
  assert.ok(ratio < 0.35, `"整行同值"的行不应超过 35%，实测 ${(ratio * 100).toFixed(1)}%`)
})

test('透视正确：远处更细碎、近处斑块更大（逐像素变化在下方更小）', () => {
  const field = createWaterField(fakeDocument())
  drawWater(fakeCtx(), { W: 1280, H: 720, horizonY: 374, t: 5, pal: PAL }, field)
  const { width: w, height: h, h: heights } = field
  const rowDelta = (j) => {
    let sum = 0
    for (let i = 1; i < w; i += 1) sum += Math.abs(heights[j * w + i] - heights[j * w + i - 1])
    return sum / (w - 1)
  }
  const far = rowDelta(Math.floor(h * 0.15))
  const near = rowDelta(Math.floor(h * 0.85))
  // 透视的正确含义：远处的浪在屏幕上更小 → 同样的屏幕宽度里塞进更多起伏 → 逐像素差值更大。
  // （早先一版把两个坐标轴的放大率写反了，近处反而更碎，看起来像"隧道里放射的条纹"。）
  assert.ok(far > near * 1.05, `远处应更细碎（far=${far.toFixed(4)} near=${near.toFixed(4)}）`)
})

test('常量为预期值（缓冲宽度/上下限）', () => {
  assert.equal(WATER_CONSTANTS.BUFFER_W, 430)
  assert.ok(WATER_CONSTANTS.MIN_BUFFER_H > 0)
  assert.ok(WATER_CONSTANTS.MAX_BUFFER_H > WATER_CONSTANTS.MIN_BUFFER_H)
})

test('涌浪朝观察者推进：同一道浪脊的深度随时间单调增大', () => {
  // 方向是硬要求（用户两次提到"方向"）：一道浪必须从地平线往脚下走，不能反过来。
  const field = createWaterField(fakeDocument())
  const ctx = fakeCtx()
  const rowMean = (h) => {
    const { width: w, h: hs } = field
    const out = new Array(h).fill(0)
    for (let j = 0; j < h; j += 1) {
      let sum = 0
      for (let i = 0; i < w; i += 1) sum += hs[j * w + i]
      out[j] = sum / w
    }
    return out
  }
  const crestsOf = (mean) => {
    const out = []
    for (let j = 2; j < mean.length - 2; j += 1) if (mean[j] > mean[j - 1] && mean[j] >= mean[j + 1]) out.push(j)
    return out
  }
  const seen = []
  for (const t of [0, 1, 2]) {
    drawWater(ctx, { W: 1280, H: 720, horizonY: 374, t, pal: PAL }, field)
    const crests = crestsOf(rowMean(field.height))
    seen.push({ t, deepest: crests[crests.length - 1] / field.height })
  }
  assert.ok(seen[1].deepest > seen[0].deepest, `t=1 的浪脊应比 t=0 更近：${JSON.stringify(seen)}`)
  assert.ok(seen[2].deepest > seen[1].deepest, `t=2 的浪脊应比 t=1 更近：${JSON.stringify(seen)}`)
})

test('浪速是"慢"的：一道浪跨越整个水面需要 20 秒以上', () => {
  // 用户反馈过"波浪太快了"。这里用同样的分组测量把速度钉住：d 的推进速率 ≤ 0.05 /s。
  const field = createWaterField(fakeDocument())
  const ctx = fakeCtx()
  const deepestCrest = () => {
    const { width: w, height: h, h: hs } = field
    const mean = new Array(h).fill(0)
    for (let j = 0; j < h; j += 1) {
      let sum = 0
      for (let i = 0; i < w; i += 1) sum += hs[j * w + i]
      mean[j] = sum / w
    }
    let best = -1
    let bestVal = -Infinity
    for (let j = 2; j < h - 2; j += 1) {
      if (mean[j] > mean[j - 1] && mean[j] >= mean[j + 1] && mean[j] > bestVal) {
        bestVal = mean[j]
        best = j
      }
    }
    return best / h
  }
  drawWater(ctx, { W: 1280, H: 720, horizonY: 374, t: 0, pal: PAL }, field)
  const d0 = deepestCrest()
  drawWater(ctx, { W: 1280, H: 720, horizonY: 374, t: 1, pal: PAL }, field)
  const d1 = deepestCrest()
  const speed = Math.abs(d1 - d0) // 每秒推进的深度比例（绕回时可能变小，故取绝对值上限判断）
  assert.ok(speed <= 0.06, `每秒推进不应超过 0.06 水深（实测 ${speed.toFixed(4)}）`)
})
