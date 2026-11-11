// 潮间 —— 白天的海鸥。
//
// 这里要钉死的三件事：
//   1. 白天有鸟、夜里没有（夜里只有月亮和星）；
//   2. **可复现**：同一 t 画出同一批鸟（航行是时间函数，不是状态机）；
//   3. 会真的动：t 变了位置就变；且不会因为"掉帧"多出或少掉鸟。

import assert from 'node:assert/strict'
import test from 'node:test'

import { BIRD_CONSTANTS, daylightOf, drawBirds } from '../src/client/birds.js'
import { paletteFor } from '../src/client/palette.js'

const VIEW = { W: 1280, H: 720, horizonY: 374 }

const ctxRecorder = () => {
  const strokes = []
  return {
    strokes,
    lineWidth: 1,
    strokeStyle: '',
    lineCap: 'round',
    save() {},
    restore() {},
    beginPath() {},
    moveTo(x, y) {
      this._x = x
      this._y = y
    },
    quadraticCurveTo() {},
    lineTo() {
      strokes.push([this._x, this._y])
    },
    stroke() {
      strokes.push([this._x, this._y])
    },
  }
}

const day = paletteFor({ sun: { altitude: 34, azimuth: 200 }, moon: { altitude: -12, azimuth: 20, phase: 0.4 }, tide: { height: 0 }, phase: 'afternoon' })
const night = paletteFor({ sun: { altitude: -40, azimuth: 300 }, moon: { altitude: -20, azimuth: 20, phase: 0.5 }, tide: { height: 0 }, phase: 'night' })

test('daylightOf：白天为 1、夜里为 0', () => {
  assert.equal(daylightOf(day), 1)
  assert.equal(daylightOf(night), 0)
  assert.equal(daylightOf(null), 0)
  assert.equal(daylightOf({}), 0, '没有 exposure / stars 时不画鸟')
})

test('白天有海鸥，而且数量随时间变化（不是固定几只）', () => {
  const counts = []
  for (let t = 0; t < 60; t += 2) counts.push(drawBirds(ctxRecorder(), { ...VIEW, t, pal: day }))
  const total = counts.reduce((a, b) => a + b, 0)
  assert.ok(total > 0, '一分钟内必须出现过海鸥')
  assert.ok(new Set(counts).size > 1, '数量应当随时间变化')
  for (const n of counts) assert.ok(n >= 0 && n <= BIRD_CONSTANTS.slots)
})

test('夜里一只都没有', () => {
  for (let t = 0; t < 60; t += 3) assert.equal(drawBirds(ctxRecorder(), { ...VIEW, t, pal: night }), 0)
})

test('可复现：同一 t 两次画出的鸟数相同', () => {
  for (const t of [3, 17.5, 41]) {
    assert.equal(drawBirds(ctxRecorder(), { ...VIEW, t, pal: day }), drawBirds(ctxRecorder(), { ...VIEW, t, pal: day }))
  }
})

test('会真的动：t 推进后位置不同', () => {
  const a = ctxRecorder()
  const b = ctxRecorder()
  drawBirds(a, { ...VIEW, t: 10, pal: day })
  drawBirds(b, { ...VIEW, t: 10.5, pal: day })
  assert.notDeepEqual(a.strokes, b.strokes, '0.5 秒后鸟的位置必须变化')
})

test('退化安全：没有 ctx / 极短地平线 / NaN 都不抛且返回 0', () => {
  assert.equal(drawBirds(null, { ...VIEW, t: 1, pal: day }), 0)
  assert.equal(drawBirds(ctxRecorder(), { ...VIEW, horizonY: 2, t: 1, pal: day }), 0)
  assert.equal(drawBirds(ctxRecorder(), { W: Number.NaN, H: 720, horizonY: 374, t: 1, pal: day }), 0)
})
