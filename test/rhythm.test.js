// 潮间 —— 节奏纯函数单测（spec §5.2 / §5.3）。
//
// 这些函数决定"来得恰好、退得干净"，出错是产品级的（该来不来、来了不走），所以单测覆盖
// 跨零点静默、首次延迟、手动顺延、打字抑制与放弃。

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SUPPRESS,
  inputSuppression,
  isQuietTime,
  localDateKey,
  nextDueAt,
  parseClock,
  reducedMotionActive,
  skippedToday,
} from '../src/client/rhythm.js'
import { DEFAULTS } from '../src/settings.js'

test('parseClock 接受合法 HH:MM，拒绝垃圾', () => {
  assert.equal(parseClock('00:00'), 0)
  assert.equal(parseClock('23:59'), 23 * 60 + 59)
  assert.equal(parseClock('7:05'), 7 * 60 + 5)
  assert.equal(parseClock('24:00'), null)
  assert.equal(parseClock('12:60'), null)
  assert.equal(parseClock('abc'), null)
  assert.equal(parseClock(null), null)
})

test('isQuietTime：23:00–07:00 这种跨零点区间', () => {
  const quiet = { enabled: true, start: '23:00', end: '07:00' }
  const at = (h, m = 0) => new Date(2026, 10, 10, h, m, 0)
  assert.equal(isQuietTime(quiet, at(23, 30)), true, '23:30 在静默里')
  assert.equal(isQuietTime(quiet, at(2, 0)), true, '02:00 在静默里')
  assert.equal(isQuietTime(quiet, at(6, 59)), true)
  assert.equal(isQuietTime(quiet, at(7, 0)), false, '右端开区间')
  assert.equal(isQuietTime(quiet, at(12, 0)), false)
  assert.equal(isQuietTime(quiet, at(22, 59)), false)
})

test('isQuietTime：不跨零点区间与关闭状态', () => {
  const quiet = { enabled: true, start: '09:00', end: '12:00' }
  const at = (h) => new Date(2026, 10, 10, h, 30, 0)
  assert.equal(isQuietTime(quiet, at(9)), true)
  assert.equal(isQuietTime(quiet, at(11)), true)
  assert.equal(isQuietTime(quiet, at(12)), false)
  assert.equal(isQuietTime({ ...quiet, enabled: false }, at(10)), false)
  // 起止相同 = 不静默（否则一天都被静音，属于配置事故）
  assert.equal(isQuietTime({ enabled: true, start: '10:00', end: '10:00' }, at(10)), false)
  assert.equal(isQuietTime({ enabled: true, start: 'xx', end: '10:00' }, at(10)), false)
})

test('localDateKey 用本地日期而不是 UTC', () => {
  const date = new Date(2026, 10, 10, 1, 30, 0) // 本地 11-10 01:30
  assert.equal(localDateKey(date), '2026-11-10')
})

test('skippedToday 只认当天', () => {
  const today = new Date(2026, 10, 10, 9, 0, 0)
  assert.equal(skippedToday({ skipDates: ['2026-11-10'] }, today), true)
  assert.equal(skippedToday({ skipDates: ['2026-11-09'] }, today), false)
  assert.equal(skippedToday({ skipDates: [] }, today), false)
  assert.equal(skippedToday(null, today), false)
})

test('nextDueAt：以"上次结束"为基准', () => {
  const settings = { ...DEFAULTS, intervalMinutes: 120, firstDelayMinutes: 20, manualExtends: true }
  const lastHideAt = 1_760_000_000 // 秒
  const due = nextDueAt(settings, { lastHideAt, lastShownAt: lastHideAt - 180, installedAt: lastHideAt - 7200 }, 0)
  assert.equal(due, (lastHideAt + 7200) * 1000, '结束时间 + 120 分钟')
})

test('nextDueAt：手动看过就顺延（manualExtends）', () => {
  const settings = { ...DEFAULTS, intervalMinutes: 60, manualExtends: true }
  const rhythm = { lastHideAt: 1_000, lastShownAt: 5_000 }
  assert.equal(nextDueAt(settings, rhythm, 0), (5_000 + 3600) * 1000)

  const noextend = { ...settings, manualExtends: false }
  assert.equal(nextDueAt(noextend, rhythm, 0), (1_000 + 3600) * 1000)
})

test('nextDueAt：刚装没有记录 → installedAt + 首次延迟', () => {
  const settings = { ...DEFAULTS, intervalMinutes: 120, firstDelayMinutes: 20, manualExtends: true }
  const installedAt = 1_700_000_000
  const due = nextDueAt(settings, { lastHideAt: null, lastShownAt: null, installedAt }, 0)
  assert.equal(due, (installedAt + 1200) * 1000, '装完 20 分钟才可能首次浮现')

  // 连 installedAt 都没有（状态文件首次写入前）：从现在起算，不能立刻弹
  const nowMs = 1_700_000_000_000
  assert.equal(nextDueAt(settings, {}, nowMs), nowMs + 1200 * 1000)
})

test('inputSuppression：停手满 20 秒才放行，到点后等满 10 分钟则放弃', () => {
  const nowMs = 1_000_000
  // 没有输入记录 → 不抑制
  assert.deepEqual(inputSuppression(0, nowMs, nowMs), { waiting: false, giveUp: false })
  // 5 秒前刚打过字 → 等
  assert.deepEqual(inputSuppression(nowMs - 5_000, nowMs, nowMs), { waiting: true, giveUp: false })
  // 已经停手 20 秒 → 放行
  assert.deepEqual(inputSuppression(nowMs - 20_000, nowMs, nowMs), { waiting: false, giveUp: false })
  // 一直在打字、而且到点已经超过 10 分钟 → 放弃本次
  assert.deepEqual(inputSuppression(nowMs - 5_000, nowMs, nowMs - 11 * 60_000), { waiting: true, giveUp: true })
  // 刚刚到点、还在打字 → 只是等
  assert.deepEqual(inputSuppression(nowMs - 5_000, nowMs, nowMs - 60_000), { waiting: true, giveUp: false })
})

test('reducedMotionActive：auto 跟随系统，on/off 强制', () => {
  assert.equal(reducedMotionActive('auto', true), true)
  assert.equal(reducedMotionActive('auto', false), false)
  assert.equal(reducedMotionActive('on', false), true)
  assert.equal(reducedMotionActive('off', true), false)
})

test('抑制原因常量齐备且互不相同', () => {
  const values = Object.values(SUPPRESS)
  assert.equal(new Set(values).size, values.length)
  for (const value of values) assert.equal(typeof value, 'string')
})