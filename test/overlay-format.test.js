// 潮间 —— 覆盖层倒计时的格式化（右上角那个 m:ss）。
//
// 这是唯一一个用户会盯着看的数字，所以边界必须钉死：起点不许显示 2:59、不许出现负数、
// 不许出现 undefined。

import assert from 'node:assert/strict'
import test from 'node:test'
import { formatRemaining } from '../src/client/format.js'

test('formatRemaining：3 分钟时长从 3:00 开始倒数', () => {
  assert.equal(formatRemaining(180_000), '3:00')
  assert.equal(formatRemaining(179_400), '3:00', '向上取整，别一上来就 2:59')
  assert.equal(formatRemaining(179_000), '2:59')
  assert.equal(formatRemaining(60_000), '1:00')
  assert.equal(formatRemaining(9_500), '0:10')
  assert.equal(formatRemaining(1_000), '0:01')
})

test('formatRemaining：0 / 负数 / 垃圾输入都退成 0:00', () => {
  assert.equal(formatRemaining(0), '0:00')
  assert.equal(formatRemaining(-5_000), '0:00')
  assert.equal(formatRemaining(Number.NaN), '0:00')
  assert.equal(formatRemaining(undefined), '0:00')
  assert.equal(formatRemaining('abc'), '0:00')
})

test('formatRemaining：超过一小时用 h:mm:ss', () => {
  assert.equal(formatRemaining(30 * 60_000), '30:00')
  assert.equal(formatRemaining(60 * 60_000), '1:00:00')
  assert.equal(formatRemaining(3_661_000), '1:01:01')
})

test('formatRemaining：两位补零', () => {
  assert.equal(formatRemaining(65_000), '1:05')
  assert.equal(formatRemaining(5_000), '0:05')
})
