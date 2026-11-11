// 潮间 —— 夜里必须有月亮。
//
// 真实天象里月亮完全可能整夜在地平线下，但"夜里抬头就该看见月亮"是产品要求（用户明确提过）。
// 所以：真实月亮可见时用它自己的位置/月相；不可见时按同一月相在天上画一轮。

import assert from 'node:assert/strict'
import test from 'node:test'

import { paletteFor } from '../src/client/palette.js'

const night = (moon) => ({ sun: { altitude: -40, azimuth: 300 }, moon, tide: { height: 0 }, phase: 'night' })

test('月亮在地平线下时，夜里仍然给出一轮月亮（沿用真实月相）', () => {
  const pal = paletteFor(night({ altitude: -20, azimuth: 20, phase: 0.25 }))
  assert.ok(pal.moon, '夜里必须有月亮')
  assert.equal(pal.moon.phase, 0.25, '月相来自朔望周期，不是随机值')
  assert.ok(pal.moon.alpha > 0.2)
  assert.ok(pal.moon.x >= 0 && pal.moon.x <= 1 && pal.moon.y >= 0 && pal.moon.y <= 0.5, '位置要在天上')
})

test('真实月亮可见时用它的真实位置', () => {
  const pal = paletteFor(night({ altitude: 35, azimuth: 150, phase: 0.25 }))
  assert.ok(pal.moon)
  assert.notEqual(pal.moon.x, 0.62, '不该被合成的位置覆盖')
})

test('白天不补月亮', () => {
  const pal = paletteFor({ sun: { altitude: 40, azimuth: 200 }, moon: { altitude: -30, azimuth: 20, phase: 0.5 }, tide: { height: 0 }, phase: 'noon' })
  if (pal.moon) {
    // 白天月亮若可见（真实位置在天上）可以画，但不允许是"合成补位"的那个位置
    assert.notEqual(pal.moon.x, 0.62)
  }
})

test('月相决定亮度：望月比新月亮', () => {
  const full = paletteFor(night({ altitude: -20, azimuth: 20, phase: 0.5 }))
  const nw = paletteFor(night({ altitude: -20, azimuth: 20, phase: 0 }))
  assert.ok(full.moon.alpha > nw.moon.alpha, `望月 ${full.moon.alpha} 应亮于新月 ${nw.moon.alpha}`)
})

test('脏输入：moon 为空/NaN 也不崩', () => {
  for (const moon of [null, undefined, {}, { altitude: Number.NaN, azimuth: Number.NaN, phase: Number.NaN }]) {
    const pal = paletteFor(night(moon))
    assert.ok(pal.moon, '夜里仍要有月亮')
    assert.ok(Number.isFinite(pal.moon.alpha) && pal.moon.alpha > 0)
  }
})
