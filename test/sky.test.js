/**
 * src/sky.js 单测 —— node --test
 *
 * 期望值一律与实现无关地推导（天文几何、官方日出日落常识、有限差分），
 * 绝不「跑一遍实现，把输出抄成期望」。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  solarPosition,
  moonPosition,
  tideAt,
  classifyPhase,
  dayLength,
  skyAt,
  SKY_CONSTANTS,
} from '../src/sky.js';

/* ------------------------------ 小工具 ------------------------------ */

const SH = { lat: 31.23, lon: 121.47, tz: 'Asia/Shanghai' };
const RV = { lat: 64.15, lon: -21.94, tz: 'Atlantic/Reykjavik' };
const TROMSO = { lat: 69.65, lon: 18.96, tz: 'Europe/Oslo' };

const MINUTE = 60000;
const ms = (iso) => Date.parse(iso);

/** 'HH:MM' -> 当日分钟数 */
function toMinutes(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  assert.ok(m, `时间格式必须是 HH:MM，实际收到 ${JSON.stringify(hhmm)}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 跨零点也安全的白昼长度（分钟） */
function daylightMinutes({ sunrise, sunset }) {
  const rise = toMinutes(sunrise);
  const set = toMinutes(sunset);
  return set >= rise ? set - rise : set + 1440 - rise;
}

const validPhase = (p) => ['dawn', 'noon', 'afternoon', 'dusk', 'night'].includes(p);

/* --------------------------- 太阳位置 --------------------------- */

test('上海 2026-11-10 12:00(+08:00) 太阳高度角约 40°', () => {
  // 独立推导：11 月 10 日太阳赤纬约 -17.1°，上海纬度 31.23°；
  // 该日真太阳时中天在后钟 11:38 前后（均时差 +16min、经度 121.47°E 比东八区中央经线早 6min），
  // 所以 12:00 时太阳已过中天约 22min（时角 ≈ 5.5°），
  // 中天高度 = 90 - 31.23 - 17.1 ≈ 41.7°，12:00 时约 41.5°，取 ±3° 容差。
  const pos = solarPosition(ms('2026-11-10T12:00:00+08:00'), SH.lat, SH.lon);
  assert.ok(Number.isFinite(pos.altitude) && Number.isFinite(pos.azimuth));
  assert.ok(
    Math.abs(pos.altitude - 40) <= 3,
    `高度角应在 40°±3°，实际 ${pos.altitude.toFixed(2)}°`,
  );
  // 正午前后太阳应在正南附近（北半球）：方位角 175..200
  assert.ok(
    pos.azimuth > 175 && pos.azimuth < 200,
    `正午前后方位角应接近正南 180°，实际 ${pos.azimuth.toFixed(2)}°`,
  );
});

test('中天时刻经纬度关系：上海冬至正午高度角 ≈ 90 - 31.23 - 23.44', () => {
  // 冬至真太阳时中天：均时差约 +2min，经度修正 -6min → 钟面约 11:52。
  // 冬至赤纬取 -23.44°，正午高度角理论值 = 90 - lat - 23.44 = 35.33°。
  const pos = solarPosition(ms('2026-12-21T11:52:00+08:00'), SH.lat, SH.lon);
  assert.ok(
    Math.abs(pos.altitude - (90 - SH.lat - 23.44)) <= 1,
    `冬至中天高度角应约 35.33°，实际 ${pos.altitude.toFixed(2)}°`,
  );
  // 中天时方位角必须是正南 180°（北半球、太阳在南边）
  assert.ok(
    Math.abs(pos.azimuth - 180) <= 2,
    `中天方位角应约 180°，实际 ${pos.azimuth.toFixed(2)}°`,
  );
});

test('方位角恒在 0..360，高度角恒在 -90..90（扫一整天）', () => {
  for (let i = 0; i < 288; i += 1) {
    const pos = solarPosition(ms('2026-11-10T00:00:00Z') + i * 5 * MINUTE, SH.lat, SH.lon);
    assert.ok(pos.azimuth >= 0 && pos.azimuth < 360, `方位角越界: ${pos.azimuth}`);
    assert.ok(pos.altitude >= -90 && pos.altitude <= 90, `高度角越界: ${pos.altitude}`);
  }
});

test('太阳位置只依赖传入时间：同一入参结果稳定（无隐含 Date.now）', () => {
  const t = ms('2026-11-10T04:00:00Z');
  const a = solarPosition(t, SH.lat, SH.lon);
  const b = solarPosition(t, SH.lat, SH.lon);
  assert.deepEqual(a, b);
  // 同一钟点的不同年份应该给出不同结果（证明真的按传入时间算，而非按当前时间）
  const nextYear = solarPosition(t + 365 * 86400000, SH.lat, SH.lon);
  assert.notEqual(a.altitude, nextYear.altitude);
});

/* --------------------------- 月亮 --------------------------- */

test('月亮：phase 在 0..1、角度合法、月相按朔望周期推进', () => {
  const t = ms('2026-11-10T04:00:00Z');
  const m = moonPosition(t, SH.lat, SH.lon);
  assert.ok(Number.isFinite(m.altitude) && Number.isFinite(m.azimuth) && Number.isFinite(m.phase));
  assert.ok(m.altitude >= -90 && m.altitude <= 90);
  assert.ok(m.azimuth >= 0 && m.azimuth < 360);
  assert.ok(m.phase >= 0 && m.phase < 1);

  // 推进半个朔望月（29.53/2 ≈ 14.77 天），月相应向前走约 0.5
  const half = moonPosition(t + (SKY_CONSTANTS.SYNODIC_DAYS / 2) * 86400000, SH.lat, SH.lon);
  const diff = Math.abs(half.phase - m.phase);
  assert.ok(Math.abs(diff - 0.5) <= 0.06, `半月后月相应推进约 0.5，实际差 ${diff.toFixed(3)}`);
});

/* ---------------------------- 潮汐 ---------------------------- */

test('潮汐：振幅 ≤ 1.2m、trend 与高度变化方向一致、周期 12.42h', () => {
  const t = ms('2026-11-10T04:00:00Z');
  const h = tideAt(t, SH.lon);
  assert.ok(Math.abs(h.height) <= SKY_CONSTANTS.TIDE_AMPLITUDE + 1e-9);
  assert.ok(h.trend === 'rising' || h.trend === 'falling');

  // trend 用有限差分独立校验：之后 1 分钟高度上升 ⇔ rising
  for (let i = 0; i < 120; i += 1) {
    const at = t + i * 7 * MINUTE;
    const a = tideAt(at, SH.lon);
    const b = tideAt(at + MINUTE, SH.lon);
    const delta = b.height - a.height;
    if (Math.abs(delta) > 1e-9) {
      assert.equal(a.trend, delta > 0 ? 'rising' : 'falling', `t=${at} 趋势与导数不符`);
    }
  }

  // 半日潮：12.42 小时后应回到同一高度
  const later = tideAt(t + SKY_CONSTANTS.TIDE_PERIOD_H * 3600000, SH.lon);
  assert.ok(Math.abs(later.height - h.height) < 1e-6);
});

test('潮汐：经度只改变相位，不改变振幅', () => {
  const t = ms('2026-11-10T04:00:00Z');
  for (const lon of [-180, -90, 0, 60, 121.47, 180]) {
    const h = tideAt(t, lon);
    assert.ok(Math.abs(h.height) <= SKY_CONSTANTS.TIDE_AMPLITUDE + 1e-9);
    assert.ok(h.trend === 'rising' || h.trend === 'falling');
  }
});

/* --------------------------- 时段判定 --------------------------- */

test('classifyPhase：五个分支 + -6~6 的升落两分支', () => {
  // > 40 → noon
  assert.equal(classifyPhase(41, true), 'noon');
  assert.equal(classifyPhase(60, false), 'noon');
  assert.equal(classifyPhase(90, true), 'noon');
  // 6 ~ 40 → afternoon（含两端）
  assert.equal(classifyPhase(40, true), 'afternoon');
  assert.equal(classifyPhase(20, false), 'afternoon');
  assert.equal(classifyPhase(6, true), 'afternoon');
  // -6 ~ 6：升 → dawn，降 → dusk（同一高度两种结果）
  assert.equal(classifyPhase(0, true), 'dawn');
  assert.equal(classifyPhase(0, false), 'dusk');
  assert.equal(classifyPhase(-6, true), 'dawn');
  assert.equal(classifyPhase(-6, false), 'dusk');
  assert.equal(classifyPhase(5.9, true), 'dawn');
  assert.equal(classifyPhase(5.9, false), 'dusk');
  // < -6 → night
  assert.equal(classifyPhase(-6.1, true), 'night');
  assert.equal(classifyPhase(-45, false), 'night');

  // 全部结果都必须是合法枚举值
  for (const alt of [-90, -7, -6, 0, 6, 39.9, 40.1, 90]) {
    for (const rising of [true, false]) {
      assert.ok(validPhase(classifyPhase(alt, rising)));
    }
  }
});

/* --------------------------- 日出日落 --------------------------- */

test('上海 2026-11-10 日出约 06:1x–06:5x、日落约 16:5x–17:1x', () => {
  // 独立推导：该日白昼长度 ≈ 2·acos((sin(-0.833°) - sinφsinδ)/(cosφcosδ)) / 15 ≈ 10h42m，
  // 中天在钟面 11:38 前后 → 日出 ≈ 11:38 - 5:21 = 06:17、日落 ≈ 16:59。
  // 因此断言区间取 06:10–06:59 / 16:50–17:19（覆盖 -0.833° 折射口径的几钟差异）。
  const dl = dayLength(ms('2026-11-10T12:00:00+08:00'), SH.lat, SH.lon, SH.tz);
  assert.ok(dl, '上海 11 月 10 日不应返回 null');
  const rise = toMinutes(dl.sunrise);
  const set = toMinutes(dl.sunset);
  assert.ok(rise >= 6 * 60 + 10 && rise <= 6 * 60 + 59, `日出应在 06:10–06:59，实际 ${dl.sunrise}`);
  assert.ok(set >= 16 * 60 + 50 && set <= 17 * 60 + 19, `日落应在 16:50–17:19，实际 ${dl.sunset}`);
  // 白昼应在 10h20m–11h00m 之间
  const day = daylightMinutes(dl);
  assert.ok(day >= 620 && day <= 660, `白昼长度应约 10h30m，实际 ${day} 分钟`);
});

test('雷克雅未克 2026-11-10 白昼极短（约 7 小时）', () => {
  // 独立推导：δ ≈ -17.1°、φ = 64.15° →
  // cosH0 = (sin(-0.833°) - sin64.15°·sin(-17.1°)) / (cos64.15°·cos(-17.1°)) ≈ 0.63 → H0 ≈ 51°，
  // 白昼 = 2·51/15 h ≈ 6.8h。**注**：任务书里「≤ 6h」在 11-10 这天物理上做不到
  // （冰岛当天实际约 7 小时），故这里断言 ≤ 8h 且 ≥ 6.5h（真正「极短」的含义），
  // 另外用同城冬至日（约 4.1h）单独覆盖 ≤ 6h 的强断言，见下一条。
  const dl = dayLength(ms('2026-11-10T12:00:00Z'), RV.lat, RV.lon, RV.tz);
  assert.ok(dl, '雷克雅未克 11 月 10 日不应返回 null');
  const day = daylightMinutes(dl);
  assert.ok(day >= 390 && day <= 480, `白昼应约 7 小时（390–480 分钟），实际 ${day} 分钟`);
  // 与上海同一天比较：必须明显更短
  const shanghai = daylightMinutes(dayLength(ms('2026-11-10T12:00:00Z'), SH.lat, SH.lon, SH.tz));
  assert.ok(shanghai - day > 180, `雷克雅未克应比上海少日照 3h 以上，实际差 ${shanghai - day} 分钟`);
});

test('雷克雅未克 2026-12-21 白昼 ≤ 6 小时（冬至最短日）', () => {
  const dl = dayLength(ms('2026-12-21T12:00:00Z'), RV.lat, RV.lon, RV.tz);
  assert.ok(dl);
  const day = daylightMinutes(dl);
  assert.ok(day <= 360, `冬至白昼应 ≤ 6 小时，实际 ${day} 分钟`);
  assert.ok(day >= 180, `冬至白昼也不该短到离谱（≥3h），实际 ${day} 分钟`);
});

test('特罗姆瑟 2026-12-21 极夜 → dayLength 为 null（不出现 00:00）', () => {
  // 极夜判据：日上中天高度角 = 90 - 69.65 - 23.44 = -3.09° < -0.833°，太阳整天不升起。
  const dl = dayLength(ms('2026-12-21T12:00:00+01:00'), TROMSO.lat, TROMSO.lon, TROMSO.tz);
  assert.equal(dl, null);
  const sky = skyAt(ms('2026-12-21T12:00:00+01:00'), TROMSO);
  assert.equal(sky.dayLength, null);
  assert.ok(sky.sun.altitude < 0, `极夜正午太阳也应在地平线下，实际 ${sky.sun.altitude}`);
});

test('特罗姆瑟 2026-06-21 极昼 → dayLength 为 null', () => {
  const dl = dayLength(ms('2026-06-21T12:00:00+02:00'), TROMSO.lat, TROMSO.lon, TROMSO.tz);
  assert.equal(dl, null);
});

test('时区非法不抛，退回 UTC 且仍给出可读结果', () => {
  const dl = dayLength(ms('2026-11-10T12:00:00+08:00'), SH.lat, SH.lon, 'Mars/Olympus_Mons');
  assert.ok(dl, '时区非法也应返回可读的日出日落（按 UTC）');
  assert.match(dl.sunrise, /^\d{2}:\d{2}$/);
  assert.match(dl.sunset, /^\d{2}:\d{2}$/);
  assert.notEqual(dl.sunrise, '00:00');

  // 与显式传 UTC 的结果一致
  const utc = dayLength(ms('2026-11-10T12:00:00+08:00'), SH.lat, SH.lon, 'UTC');
  assert.deepEqual(dl, utc);
});

/* ---------------------------- skyAt ---------------------------- */

test('skyAt：字段齐全、数值有限、上海 vs 雷克雅未克同一时刻明显不同', () => {
  const t = ms('2026-11-10T04:00:00Z'); // 北京时间 12:00，雷克雅未克约 04:00

  const sh = skyAt(t, SH);
  assert.equal(sh.t, Math.floor(t / 1000));
  for (const v of [sh.sun.altitude, sh.sun.azimuth, sh.moon.altitude, sh.moon.azimuth, sh.moon.phase, sh.tide.height]) {
    assert.ok(Number.isFinite(v));
  }
  assert.ok(validPhase(sh.phase));
  assert.ok(sh.dayLength && typeof sh.dayLength.sunrise === 'string');

  const rv = skyAt(t, RV);
  // 上海正午、雷克雅未克清晨 4 点：高度角差必须很大
  assert.ok(
    Math.abs(sh.sun.altitude - rv.sun.altitude) > 30,
    `两地高度角应明显不同，实际 ${sh.sun.altitude.toFixed(1)} vs ${rv.sun.altitude.toFixed(1)}`,
  );
  assert.notEqual(sh.phase, rv.phase);
  assert.equal(sh.phase, 'noon');
  assert.equal(rv.phase, 'night');
});

test('skyAt：同一地点的日变化符合日出日落（日出前是 night、正午是 noon）', () => {
  const sunrise = dayLength(ms('2026-11-10T12:00:00+08:00'), SH.lat, SH.lon, SH.tz);
  const before = skyAt(ms(`2026-11-10T${sunrise.sunrise}:00+08:00`) - 60 * MINUTE, SH);
  const noon = skyAt(ms('2026-11-10T11:38:00+08:00'), SH);
  assert.equal(before.phase, 'night');
  assert.equal(noon.phase, 'noon');
});

test('非法输入一律不抛，且返回结构合法、数值有限', () => {
  const t = ms('2026-11-10T04:00:00Z');
  const weird = [
    [Number.NaN, SH],
    [t, { lat: Number.NaN, lon: 121.47, tz: 'Asia/Shanghai' }],
    [t, { lat: 31.23, lon: Number.POSITIVE_INFINITY, tz: 'Asia/Shanghai' }],
    [t, { lat: '31.23', lon: '121.47', tz: 'Asia/Shanghai' }],
    [t, { lat: 200, lon: 400, tz: 'Asia/Shanghai' }],
    [t, { lat: 31.23, lon: 121.47, tz: 'Not/AZone' }],
    [t, null],
    [t, undefined],
    [undefined, SH],
    [null, SH],
    ['2026-11-10', SH],
    [new Date(Number.NaN), SH],
    [{}, SH],
  ];

  for (const [date, loc] of weird) {
    let sky;
    assert.doesNotThrow(() => {
      sky = skyAt(date, loc);
    }, `skyAt(${String(date)}, ${JSON.stringify(loc)}) 不应抛`);
    assert.ok(Number.isFinite(sky.t));
    assert.ok(Number.isFinite(sky.sun.altitude) && Number.isFinite(sky.sun.azimuth));
    assert.ok(Number.isFinite(sky.moon.altitude) && Number.isFinite(sky.moon.azimuth));
    assert.ok(Number.isFinite(sky.moon.phase) && sky.moon.phase >= 0 && sky.moon.phase <= 1);
    assert.ok(Number.isFinite(sky.tide.height) && Math.abs(sky.tide.height) <= 1.2 + 1e-9);
    assert.ok(sky.tide.trend === 'rising' || sky.tide.trend === 'falling');
    assert.ok(validPhase(sky.phase), `phase 非法: ${sky.phase}`);
  }

  // 非法定点（NaN 经纬度 / NaN 时间）必须落到 afternoon 兜底
  assert.equal(skyAt(t, { lat: Number.NaN, lon: 121.47 }).phase, 'afternoon');
  assert.equal(skyAt(Number.NaN, SH).phase, 'afternoon');
  assert.equal(skyAt(t, { lat: 200, lon: 400 }).phase, 'afternoon');
  assert.equal(skyAt(Number.NaN, SH).dayLength, null);

  // 单独导出的函数也不许抛
  assert.doesNotThrow(() => solarPosition('不是时间', 'x', 'y'));
  assert.doesNotThrow(() => moonPosition(undefined, undefined, undefined));
  assert.doesNotThrow(() => tideAt(Number.NaN, Number.NaN));
  assert.doesNotThrow(() => dayLength(Number.NaN, 31.23, 121.47, 'Asia/Shanghai'));
  assert.doesNotThrow(() => classifyPhase(Number.NaN, true));

  const badSun = solarPosition('x', SH.lat, SH.lon);
  assert.ok(Number.isFinite(badSun.altitude) && Number.isFinite(badSun.azimuth));
  const badTide = tideAt(Number.NaN, 121.47);
  assert.ok(Number.isFinite(badTide.height) && (badTide.trend === 'rising' || badTide.trend === 'falling'));
  assert.equal(dayLength(Number.NaN, 31.23, 121.47, 'Asia/Shanghai'), null);
});

test('skyAt 不修改传入的 location 对象', () => {
  const loc = { lat: 31.23, lon: 121.47, tz: 'Asia/Shanghai' };
  const snapshot = { ...loc };
  skyAt(ms('2026-11-10T04:00:00Z'), loc);
  assert.deepEqual(loc, snapshot);
});