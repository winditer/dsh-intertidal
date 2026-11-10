/**
 * src/settings.js（含 src/cities.js）单测 —— node --test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULTS,
  LIMITS,
  sanitizeSettings,
  mergeSettings,
  publicState,
  isValidTimeZone,
  sanitizeRhythm,
  localDateString,
  RHYTHM_EVENTS,
  guessCity,
  findCity,
} from '../src/settings.js';
import { CITIES } from '../src/cities.js';

/* --------------------------- 默认值与结构 --------------------------- */

test('DEFAULTS 与契约 §3 逐字段一致', () => {
  assert.deepEqual(DEFAULTS, {
    auto: true,
    intervalMinutes: 120,
    durationSeconds: 180,
    firstDelayMinutes: 20,
    quietHours: { enabled: true, start: '23:00', end: '07:00' },
    deferOnTyping: true,
    manualExtends: true,
    form: 'full',
    rememberForm: true,
    caption: true,
    location: { city: 'shanghai', lat: 31.23, lon: 121.47, tz: 'Asia/Shanghai' },
    sound: { enabled: false, volume: 0.35 },
    // v2（契约附录 A1）：素材层，默认关闭 → 行为与 v1 完全一致
    media: { mode: 'off', dir: '', urls: [], grade: 0.55, motion: 0.5, shuffle: true },
    reducedMotion: 'auto',
  });
});

test('LIMITS 与契约一致', () => {
  assert.deepEqual(LIMITS, {
    intervalMinutes: [15, 480],
    durationSeconds: [30, 1800],
    firstDelayMinutes: [0, 120],
    volume: [0, 1],
    grade: [0, 1],
    motion: [0, 1],
  });
});

test('sanitizeSettings(空) 返回默认值的深拷贝，不共享引用', () => {
  for (const empty of [undefined, null, {}, 'nope', 42, []]) {
    assert.deepEqual(sanitizeSettings(empty), DEFAULTS);
  }
  const a = sanitizeSettings(undefined);
  a.quietHours.start = '05:00';
  a.location.lat = 0;
  a.sound.volume = 0;
  assert.equal(DEFAULTS.quietHours.start, '23:00', 'DEFAULTS.quietHours 被污染');
  assert.equal(DEFAULTS.location.lat, 31.23, 'DEFAULTS.location 被污染');
  assert.equal(DEFAULTS.sound.volume, 0.35, 'DEFAULTS.sound 被污染');
});

/* ------------------------------ 钳制 ------------------------------ */

test('数值越界一律钳制到 LIMITS 边界', () => {
  const lo = sanitizeSettings({
    intervalMinutes: 0,
    durationSeconds: 1,
    firstDelayMinutes: -50,
    sound: { volume: -2 },
  });
  assert.equal(lo.intervalMinutes, 15);
  assert.equal(lo.durationSeconds, 30);
  assert.equal(lo.firstDelayMinutes, 0);
  assert.equal(lo.sound.volume, 0);

  const hi = sanitizeSettings({
    intervalMinutes: 9999,
    durationSeconds: 99999,
    firstDelayMinutes: 999,
    sound: { volume: 9 },
  });
  assert.equal(hi.intervalMinutes, 480);
  assert.equal(hi.durationSeconds, 1800);
  assert.equal(hi.firstDelayMinutes, 120);
  assert.equal(hi.sound.volume, 1);

  // 区间内的值原样保留
  const mid = sanitizeSettings({
    intervalMinutes: 240,
    durationSeconds: 600,
    firstDelayMinutes: 30,
    sound: { volume: 0.5 },
  });
  assert.equal(mid.intervalMinutes, 240);
  assert.equal(mid.durationSeconds, 600);
  assert.equal(mid.firstDelayMinutes, 30);
  assert.equal(mid.sound.volume, 0.5);
});

test('类型错：字符串/布尔/NaN/Infinity 数字退回默认值', () => {
  const s = sanitizeSettings({
    intervalMinutes: '60', // 字符串不认（不是数字）
    durationSeconds: Number.NaN,
    firstDelayMinutes: Number.POSITIVE_INFINITY,
    auto: 'false', // 字符串不认
    deferOnTyping: 0,
    sound: { enabled: 'yes', volume: '0.2' },
  });
  assert.equal(s.intervalMinutes, DEFAULTS.intervalMinutes);
  assert.equal(s.durationSeconds, DEFAULTS.durationSeconds);
  assert.equal(s.firstDelayMinutes, DEFAULTS.firstDelayMinutes);
  assert.equal(s.auto, DEFAULTS.auto);
  assert.equal(s.deferOnTyping, DEFAULTS.deferOnTyping);
  assert.equal(s.sound.enabled, DEFAULTS.sound.enabled);
  assert.equal(s.sound.volume, DEFAULTS.sound.volume);
});

test('枚举：form / reducedMotion 非法值退回默认', () => {
  assert.equal(sanitizeSettings({ form: 'pip' }).form, 'pip');
  assert.equal(sanitizeSettings({ form: 'full' }).form, 'full');
  assert.equal(sanitizeSettings({ form: 'windowed' }).form, 'full');
  assert.equal(sanitizeSettings({ form: null }).form, 'full');

  for (const v of ['auto', 'on', 'off']) {
    assert.equal(sanitizeSettings({ reducedMotion: v }).reducedMotion, v);
  }
  assert.equal(sanitizeSettings({ reducedMotion: 'maybe' }).reducedMotion, 'auto');
});

test('静默时段：非法时刻退回默认，段落缺失逐项补默认', () => {
  assert.deepEqual(sanitizeSettings({ quietHours: { start: '25:00' } }).quietHours, {
    enabled: true,
    start: '23:00',
    end: '07:00',
  });
  assert.deepEqual(sanitizeSettings({ quietHours: { start: '7:00' } }).quietHours.start, '23:00');
  assert.deepEqual(sanitizeSettings({ quietHours: { end: '07:60' } }).quietHours.end, '07:00');
  assert.deepEqual(sanitizeSettings({ quietHours: { enabled: false, start: '22:30', end: '06:15' } }).quietHours, {
    enabled: false,
    start: '22:30',
    end: '06:15',
  });
  // '00:00' 与 '23:59' 是合法边界
  assert.equal(sanitizeSettings({ quietHours: { start: '00:00', end: '23:59' } }).quietHours.start, '00:00');
});

/* ------------------------------ 地点 ------------------------------ */

test('地点：时区非法退回默认时区；未知城市 id 保留原样', () => {
  const badTz = sanitizeSettings({ location: { city: 'shanghai', lat: 31.23, lon: 121.47, tz: 'Nope/Zone' } });
  assert.equal(badTz.location.tz, 'Asia/Shanghai');
  assert.equal(badTz.location.lat, 31.23);

  const custom = sanitizeSettings({
    location: { city: 'my-house', lat: 22.5, lon: 114.1, tz: 'Asia/Hong_Kong' },
  });
  assert.equal(custom.location.city, 'my-house');
  assert.equal(custom.location.lat, 22.5);
  assert.equal(custom.location.lon, 114.1);
  assert.equal(custom.location.tz, 'Asia/Hong_Kong');
});

test('地点：换成城市 id 时用城市表补全缺失的经纬度与时区', () => {
  const tokyo = sanitizeSettings({ location: { city: 'tokyo' } });
  assert.deepEqual(tokyo.location, {
    city: 'tokyo',
    lat: 35.68,
    lon: 139.69,
    tz: 'Asia/Tokyo',
  });

  // 中文城市名也要认（spec §6 的示例里 city 写的是「上海」）
  const byZh = sanitizeSettings({ location: { city: '上海' } });
  assert.equal(byZh.location.city, 'shanghai');
  assert.equal(byZh.location.tz, 'Asia/Shanghai');

  // 经纬度越界 → 钳到物理边界
  const clamped = sanitizeSettings({ location: { city: 'shanghai', lat: 999, lon: -999 } });
  assert.equal(clamped.location.lat, 90);
  assert.equal(clamped.location.lon, -180);
});

test('isValidTimeZone 认得合法时区、拒掉垃圾串', () => {
  for (const tz of ['Asia/Shanghai', 'Europe/London', 'UTC', 'America/New_York']) {
    assert.equal(isValidTimeZone(tz), true, `${tz} 应合法`);
  }
  for (const tz of ['', 'Mars/Olympus', '1234', null, undefined, {}, 'Asia/Shanghaix']) {
    assert.equal(isValidTimeZone(tz), false, `${JSON.stringify(tz)} 应非法`);
  }
});

/* ------------------------------ 城市表 ------------------------------ */

test('城市表：≥ 40 个、id 唯一、时区全部是合法 IANA、坐标在物理范围内', () => {
  assert.ok(CITIES.length >= 40, `城市数应 ≥ 40，实际 ${CITIES.length}`);
  const ids = new Set();
  for (const c of CITIES) {
    assert.ok(c.id && c.zh && c.en, `城市字段不全: ${JSON.stringify(c)}`);
    assert.ok(!ids.has(c.id), `重复 id: ${c.id}`);
    ids.add(c.id);
    assert.equal(isValidTimeZone(c.tz), true, `${c.id} 的时区非法: ${c.tz}`);
    assert.ok(c.lat >= -90 && c.lat <= 90, `${c.id} 纬度越界`);
    assert.ok(c.lon >= -180 && c.lon <= 180, `${c.id} 经度越界`);
  }
  // 契约点名的上海必须一字不差
  assert.deepEqual(CITIES[0], { id: 'shanghai', zh: '上海', en: 'Shanghai', lat: 31.23, lon: 121.47, tz: 'Asia/Shanghai' });
  // 高纬测试城市必须在表里
  for (const id of ['reykjavik', 'tromso']) assert.ok(findCity(id), `缺少 ${id}`);
});

test('findCity：按 id / 中文 / 英文查，找不到返回 undefined', () => {
  assert.equal(findCity('shanghai').zh, '上海');
  assert.equal(findCity('Shanghai').id, 'shanghai');
  assert.equal(findCity('  TOKYO ').id, 'tokyo');
  assert.equal(findCity('上海').id, 'shanghai');
  assert.equal(findCity('Tokyo').id, 'tokyo');
  assert.equal(findCity('Atlantis'), undefined);
  assert.equal(findCity(''), undefined);
  assert.equal(findCity(null), undefined);
  assert.equal(findCity(42), undefined);
});

test('guessCity：永不 undefined，按 tz → 坐标 → locale → 上海 兜底', () => {
  assert.equal(guessCity({ tz: 'Asia/Tokyo' }).id, 'tokyo');
  assert.equal(guessCity({ tz: 'Europe/London' }).id, 'london');
  // 同 tz 多城市时取最近的一个
  assert.equal(guessCity({ tz: 'Asia/Shanghai', lat: 39.9, lon: 116.4 }).id, 'beijing');
  assert.equal(guessCity({ tz: 'Asia/Shanghai', lat: 31.2, lon: 121.5 }).id, 'shanghai');
  // 时区不认识但给了坐标 → 最近城市
  assert.equal(guessCity({ tz: 'Nope/Nope', lat: 35.7, lon: 139.7 }).id, 'tokyo');
  // 只有 locale
  assert.equal(guessCity({ locale: 'zh-CN' }).id, 'shanghai');
  assert.equal(guessCity({ locale: 'is-IS' }).id, 'reykjavik');
  assert.equal(guessCity({ locale: 'en-US' }).id, 'newyork');
  // 什么都没有 → 上海
  assert.equal(guessCity().id, 'shanghai');
  assert.equal(guessCity(null).id, 'shanghai');
  assert.equal(guessCity({}).id, 'shanghai');
  assert.equal(guessCity({ tz: 'Mars/Olympus', locale: 'xx-YY' }).id, 'shanghai');

  // 返回值永远是城市对象
  for (const input of [undefined, {}, { tz: 42 }, { lat: 'x', lon: 'y' }]) {
    const city = guessCity(input);
    assert.ok(city && typeof city.id === 'string' && typeof city.tz === 'string');
  }
});

/* ------------------------------ 合并 ------------------------------ */

test('mergeSettings：默认 + 已存盘 + patch 深合并后再钳制', () => {
  const merged = mergeSettings({ auto: false, quietHours: { start: '22:00' } }, { intervalMinutes: 30 });
  assert.equal(merged.auto, false, '已存盘的 auto 必须保留');
  assert.equal(merged.intervalMinutes, 30, 'patch 生效');
  assert.equal(merged.quietHours.start, '22:00', '已存盘的 start 必须保留');
  assert.equal(merged.quietHours.end, '07:00', '未覆盖的字段补默认');
  assert.equal(merged.quietHours.enabled, true);
  assert.equal(merged.durationSeconds, DEFAULTS.durationSeconds);

  // patch 里的越界值被钳制
  assert.equal(mergeSettings({}, { intervalMinutes: 1 }).intervalMinutes, 15);
  // patch 里的类型错退回默认
  assert.equal(mergeSettings({ intervalMinutes: 60 }, { intervalMinutes: 'abc' }).intervalMinutes, 120);
  // 空 patch = 规范化后的既存设置
  assert.deepEqual(mergeSettings(DEFAULTS, {}), DEFAULTS);
  assert.deepEqual(mergeSettings(undefined, undefined), DEFAULTS);
  // 嵌套对象不能被整体冲掉
  const nested = mergeSettings({ location: { lat: 1, lon: 2, tz: 'UTC', city: 'custom' } }, { location: { lat: 3 } });
  assert.deepEqual(nested.location, { city: 'custom', lat: 3, lon: 2, tz: 'UTC' });
});

/* ------------------------------ 对外状态 ------------------------------ */

test('publicState：settings/rhythm/now 三段齐全，now 是 Unix 秒', () => {
  const nowMs = Date.parse('2026-11-10T12:00:00+08:00');
  const state = publicState({ auto: false }, { lastShownAt: 1, lastHideAt: 2, installedAt: 3, skipDates: [] }, nowMs);
  assert.deepEqual(Object.keys(state).sort(), ['now', 'rhythm', 'settings']);
  assert.equal(state.now, Math.floor(nowMs / 1000), 'now 必须是秒');
  assert.equal(state.settings.auto, false);
  assert.deepEqual(state.rhythm, { lastShownAt: 1, lastHideAt: 2, installedAt: 3, skipDates: [] });

  // Date 也能吃，且同样输出秒
  assert.equal(publicState(DEFAULTS, {}, new Date(nowMs)).now, Math.floor(nowMs / 1000));
  // 垃圾 now 不抛，落到 0
  assert.equal(publicState(DEFAULTS, {}, Number.NaN).now, 0);
  assert.equal(publicState(DEFAULTS, {}, null).now, 0);
  assert.deepEqual(publicState(undefined, undefined, undefined).settings, DEFAULTS);
});

test('RHYTHM_EVENTS 是契约的四种事件', () => {
  assert.deepEqual([...RHYTHM_EVENTS].sort(), ['hidden', 'manual-open', 'shown', 'skip-today']);
});

/* ------------------------------ rhythm ------------------------------ */

test('sanitizeRhythm：非法字段兜底', () => {
  const now = Date.parse('2026-11-10T12:00:00+08:00');
  const r = sanitizeRhythm(
    { lastShownAt: 1000, lastHideAt: 'x', installedAt: undefined, skipDates: ['2026-11-10'] },
    now,
  );
  assert.equal(r.lastShownAt, 1000);
  assert.equal(r.lastHideAt, null, '非数字必须落成 null');
  assert.equal(r.installedAt, Math.floor(now / 1000), 'installedAt 缺失时用 now');
  assert.deepEqual(r.skipDates, ['2026-11-10']);

  // 空 / 垃圾输入不抛
  assert.deepEqual(sanitizeRhythm(undefined, now).skipDates, []);
  assert.deepEqual(sanitizeRhythm({ skipDates: 'nope' }, now).skipDates, []);
  assert.deepEqual(sanitizeRhythm(null, now).skipDates, []);
});

test('sanitizeRhythm：skipDates 去重、排序、只保留最近 7 天', () => {
  const now = Date.parse('2026-11-10T12:00:00+08:00');
  const tenDays = [
    '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05',
    '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10',
  ];
  // 乱序 + 重复 + 垃圾混在一起
  const r = sanitizeRhythm(
    { skipDates: [...tenDays.slice().reverse(), ...tenDays, 'garbage', 42, null, '2026-13-01'] },
    now,
  );
  assert.deepEqual(r.skipDates, [
    '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
    '2026-11-08', '2026-11-09', '2026-11-10',
  ]);
  assert.equal(r.skipDates.length, 7, '只保留最近 7 天');
});

test('localDateString 输出本地 YYYY-MM-DD', () => {
  const d = new Date(2026, 10, 9, 23, 30, 0); // 本地 2026-11-09 23:30
  assert.equal(localDateString(d.getTime()), '2026-11-09');
  assert.match(localDateString(0), /^\d{4}-\d{2}-\d{2}$/);
});