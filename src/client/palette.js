/**
 * 潮间 · palette —— 这一帧的天色、海色与天体位置
 *
 * 契约（docs/CONTRACTS.md §6）只需三个导出：
 *   paletteFor(now)   /intertidal/now 的响应体 → 一整套颜色 + 天体归一化坐标
 *   mix(a, b, t)      两个 '#rrggbb' 线性插值
 *   phasePalette(p)   五档时段基准色
 *
 * 设计要点（spec §4.2）：
 *  - 五档不是硬切：awn/noon/afternoon/dusk/night 只是「高度角锚点」上的基准色，
 *    中间按太阳高度角线性插值，所以天色随高度角连续变化；`phase` 只做兜底
 *    （低高度角时区分晨/昏，以及完全拿不到高度角时直接取基准色）。
 *  - 天体：y = 0.52 - sin(alt)·0.52，x = 0.5 + tan(方位角偏差)·0.5，
 *    钳制到 -0.2..1.2；altitude < -1° → null。
 *  - 纯函数、零 IO、绝不抛：字段缺失/NaN/类型错一律退回 afternoon 的合法结构。
 */

/* ---------- 契约常量 ---------- */
const HORIZON = 0.52; // 地平线 y（归一化）
const MIN_VISIBLE_ALT = -1; // 低于这个高度角的天体不画
const POS_MIN = -0.2; // 天体坐标钳制下界
const POS_MAX = 1.2; // 天体坐标钳制上界
const FALLBACK_PHASE = 'afternoon';
const PHASE_NAMES = Object.freeze(['dawn', 'noon', 'afternoon', 'dusk', 'night']);

/**
 * 高度角锚点（度）——插值用，不参与时段判定（判定是宿主 sky.js 的事）。
 * twilight 落在 0°，afternoon 落在 12°，于是 spec 的 6° 判定边界正好是
 * 「晨昏 ↔ 午后」的 50% 混合点，画面与时段的边界对得上。
 */
const ALT = Object.freeze({ night: -14, twilight: 0, afternoon: 16, noon: 48 });

/* ---------- 五档基准色 ---------- */
/**
 * 每档必带：天空三段 + 地平线辉光 + 三层海 + 泡沫 + 天体色 + 星密度 + 曝光。
 * 这些值可以直接改，渲染侧只吃这里的颜色（sea-canvas 不写死任何颜色）。
 */
const BASE = Object.freeze({
  // 晨曦：橘粉 → 淡青，低对比雾感（海面几乎与天同调）
  dawn: Object.freeze({
    skyTop: '#5d7f9d',
    skyMid: '#c69b9c',
    skyBottom: '#f3b78e',
    horizonGlow: '#ffd2a3',
    seaFar: '#9aa8b0',
    seaMid: '#6b8492',
    seaNear: '#4a6673',
    foam: '#f7e9dd',
    sunColor: '#ffd9a8',
    moonColor: '#eef2f8',
    stars: 0.18,
    exposure: 0.72,
  }),
  // 正午：高饱和蓝，强反光白浪
  noon: Object.freeze({
    skyTop: '#0f63c8',
    skyMid: '#3f9fe0',
    skyBottom: '#b7e1f6',
    horizonGlow: '#f4fbff',
    seaFar: '#3d8fc4',
    seaMid: '#1f74a8',
    seaNear: '#0d5182',
    foam: '#ffffff',
    sunColor: '#fffdf0',
    moonColor: '#eaf2ff',
    stars: 0,
    exposure: 1,
  }),
  // 午后：蓝偏暖（青蓝到米黄的地平线，海偏青），标准反差
  afternoon: Object.freeze({
    skyTop: '#2c78a8',
    skyMid: '#79b1c4',
    skyBottom: '#e8ddbd',
    horizonGlow: '#ffe9c2',
    seaFar: '#4a94a6',
    seaMid: '#2a7185',
    seaNear: '#194f63',
    foam: '#fdf8ea',
    sunColor: '#fff3cf',
    moonColor: '#eef2f8',
    stars: 0,
    exposure: 0.94,
  }),
  // 黄昏：金橙 → 绛紫，逆光金路
  dusk: Object.freeze({
    skyTop: '#372a5b',
    skyMid: '#8c4a77',
    skyBottom: '#f5a04f',
    horizonGlow: '#ffbe6a',
    seaFar: '#8a6172',
    seaMid: '#523a55',
    seaNear: '#2c2039',
    foam: '#ffe7cd',
    sunColor: '#ffb35a',
    moonColor: '#f0ecf4',
    stars: 0.22,
    exposure: 0.62,
  }),
  // 夜：深靛 → 近黑，月光带
  night: Object.freeze({
    skyTop: '#04060f',
    skyMid: '#0a1128',
    skyBottom: '#182a4a',
    horizonGlow: '#2c4570',
    seaFar: '#16253d',
    seaMid: '#0d1729',
    seaNear: '#060b16',
    foam: '#b9c8db',
    sunColor: '#ffeccd',
    moonColor: '#e6eeff',
    stars: 0.9,
    exposure: 0.3,
  }),
});

const COLOR_KEYS = Object.freeze([
  'skyTop',
  'skyMid',
  'skyBottom',
  'horizonGlow',
  'seaFar',
  'seaMid',
  'seaNear',
  'foam',
  'sunColor',
  'moonColor',
]);
const NUM_KEYS = Object.freeze(['stars', 'exposure']);

/* ---------- 小工具（全部容错） ---------- */

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function clamp01(value) {
  return clamp(num(value, 0), 0, 1);
}

function round(value, digits) {
  const base = Math.pow(10, digits);
  return Math.round(num(value, 0) * base) / base;
}

function parseHex(color) {
  if (typeof color !== 'string') return null;
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  return [r, g, b];
}

function toHex(channels) {
  const part = (value) => {
    const byte = Math.round(clamp(num(value, 0), 0, 255));
    return (byte < 16 ? '0' : '') + byte.toString(16);
  };
  return '#' + part(channels[0]) + part(channels[1]) + part(channels[2]);
}

/** 两个 '#rrggbb' 线性插值（t 钳制 0..1；坏输入退回另一侧，绝不抛）。 */
export function mix(a, b, t) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca && !cb) return '#000000';
  if (!ca) return toHex(cb);
  if (!cb) return toHex(ca);
  const k = clamp01(t);
  return toHex([
    ca[0] + (cb[0] - ca[0]) * k,
    ca[1] + (cb[1] - ca[1]) * k,
    ca[2] + (cb[2] - ca[2]) * k,
  ]);
}

function normalizePhase(phase) {
  if (typeof phase !== 'string') return null;
  const key = phase.trim().toLowerCase();
  return PHASE_NAMES.indexOf(key) >= 0 ? key : null;
}

/** 'dawn'|'noon'|'afternoon'|'dusk'|'night' → 基准色（未知一律 afternoon）。 */
export function phasePalette(phase) {
  const key = normalizePhase(phase) || FALLBACK_PHASE;
  const base = BASE[key];
  const out = { phase: key };
  for (const name of COLOR_KEYS) out[name] = base[name];
  for (const name of NUM_KEYS) out[name] = base[name];
  return out;
}

/** 最后一道兜底：连 computePalette 都抛了（理论上不会），给出写死的合法结构。 */
function hardFallback() {
  return {
    skyTop: '#1f6fb4',
    skyMid: '#63a7d2',
    skyBottom: '#dcd9c6',
    horizonGlow: '#ffeccb',
    seaFar: '#3b87ab',
    seaMid: '#21688d',
    seaNear: '#12486a',
    foam: '#fdfaf0',
    sun: null,
    moon: null,
    stars: 0,
    exposure: 0.93,
  };
}

/** 两套色阶按 k 混合（0=a, 1=b）。 */
function blendPalette(a, b, k) {
  const t = clamp01(k);
  const out = {};
  for (const name of COLOR_KEYS) out[name] = mix(a[name], b[name], t);
  for (const name of NUM_KEYS) out[name] = clamp01(a[name] + (b[name] - a[name]) * t);
  return out;
}

/**
 * 低高度角时晨/昏同高，只能靠 phase 区分。
 * phase 不可用时用方位角兜底：日出于东（az<180）、日落于西（az>180）。
 * 方位角是连续变化的，所以 altitude 越过 ±6°（宿主在此切 dawn/dusk→afternoon）
 * 时晨/昏的选择不会突然翻面 —— 色阶也就不会硬切。
 */
function twilightKey(phase, azimuth) {
  if (phase === 'dawn' || phase === 'dusk') return phase;
  if (typeof azimuth === 'number' && Number.isFinite(azimuth)) {
    const normalized = ((azimuth % 360) + 360) % 360;
    return normalized < 180 ? 'dawn' : 'dusk';
  }
  return 'dusk';
}

/** 高度角 → 连续色阶（锚点间线性插值，避免 5 档硬切）。 */
function ladder(altitude, phase, azimuth) {
  const alt = clamp(num(altitude, 0), -90, 90);
  const twilight = BASE[twilightKey(phase, azimuth)];
  if (alt <= ALT.night) return phasePalette('night');
  if (alt < ALT.twilight) {
    const k = (alt - ALT.night) / (ALT.twilight - ALT.night);
    return blendPalette(BASE.night, twilight, k);
  }
  if (alt < ALT.afternoon) return blendPalette(twilight, BASE.afternoon, alt / ALT.afternoon);
  if (alt < ALT.noon) {
    const k = (alt - ALT.afternoon) / (ALT.noon - ALT.afternoon);
    return blendPalette(BASE.afternoon, BASE.noon, k);
  }
  return phasePalette('noon');
}

/** 读太阳高度角：只要数值合法就用来算天色（**与「能不能看见太阳」无关**）。 */
function readAltitude(body) {
  if (!body || typeof body !== 'object') return null;
  const altitude = typeof body.altitude === 'number' ? body.altitude : NaN;
  return Number.isFinite(altitude) ? clamp(altitude, -90, 90) : null;
}

/**
 * 天体屏幕坐标（契约 §6）：
 *   y = 0.52 - sin(altitude)·0.52
 *   x = 0.5 + tan(归一化到 [-180,180] 的 (azimuth-180))·0.5
 * 结果钳制到 -0.2..1.2；altitude < -1° 或数值非法 → null。
 */
function bodyPosition(body) {
  if (!body || typeof body !== 'object') return null;
  const rawAltitude = typeof body.altitude === 'number' ? body.altitude : NaN;
  if (!Number.isFinite(rawAltitude)) return null;
  const altitude = clamp(rawAltitude, -90, 90);
  if (altitude < MIN_VISIBLE_ALT) return null;

  const azimuth = num(body.azimuth, 180);
  // 归一化到 [-180, 180)
  const deviation = ((((azimuth - 180) % 360) + 540) % 360) - 180;
  const radians = (deviation * Math.PI) / 180;
  const tan = Math.tan(radians);
  const x = clamp(0.5 + (Number.isFinite(tan) ? tan : Math.sign(radians) * 1e6) * 0.5, POS_MIN, POS_MAX);
  const y = clamp(HORIZON - Math.sin((altitude * Math.PI) / 180) * HORIZON, POS_MIN, POS_MAX);
  return { x: round(x, 4), y: round(y, 4), altitude };
}

function normalizeMoonPhase(value) {
  const phase = num(value, 0.5);
  return round(clamp(phase, 0, 1), 4);
}

/** 月面被照亮的比例：0 = 朔，0.5 = 望。 */
function illuminatedFraction(phase) {
  return clamp01((1 - Math.cos(Math.PI * 2 * phase)) / 2);
}

function sunOf(position, colors) {
  if (!position) return null;
  return {
    x: position.x,
    y: position.y,
    color: colors.sunColor,
    alpha: round(clamp01(0.55 + position.altitude * 0.045), 3),
  };
}

function moonOf(position, colors, phase) {
  if (!position) return null;
  const lit = illuminatedFraction(phase);
  const base = clamp01(0.45 + position.altitude * 0.05);
  return {
    x: position.x,
    y: position.y,
    color: colors.moonColor,
    alpha: round(base * (0.35 + 0.65 * lit), 3),
    phase,
  };
}

function computePalette(now) {
  const source = now && typeof now === 'object' ? now : {};
  const phase = normalizePhase(source.phase);
  // 「太阳挂多高」决定天色（太阳落到 -1° 以下看不见，但天色仍然由它决定）
  const sunAltitude = readAltitude(source.sun);
  const sunPosition = bodyPosition(source.sun);
  const moonPhase = normalizeMoonPhase(source.moon && source.moon.phase);

  // 有太阳高度角 → 连续插值；没有 → 用 phase 兜底（没有 phase 就是 afternoon）
  const colors =
    sunAltitude === null
      ? phasePalette(phase || FALLBACK_PHASE)
      : ladder(sunAltitude, phase, num(source.sun && source.sun.azimuth, NaN));

  // 星星：插值值再乘一个「太阳是否真的下去了」的门（白天不出星）
  let stars = clamp01(colors.stars);
  if (sunAltitude !== null) stars *= clamp01((-sunAltitude + 1) / 7);
  else if ((phase || FALLBACK_PHASE) !== 'night') stars = 0;

  const sun = sunOf(sunPosition, colors);
  let moon = moonOf(bodyPosition(source.moon), colors, moonPhase);

  // 夜里一定要有月亮：真实天象里月亮完全可能整夜在地平线下，但"夜里抬头就该看见月亮"是
  // 产品的取舍（用户明确要求）。所以夜间且真实月亮不可见时，按同一月相画一轮在天上，
  // 位置和亮度都取保守值 —— 月相仍然来自宿主的朔望周期计算，不是随机数。
  const nightish = sunAltitude !== null ? sunAltitude < -6 : (phase || FALLBACK_PHASE) === 'night';
  if (!moon && nightish) {
    const lit = illuminatedFraction(moonPhase);
    moon = {
      x: 0.62,
      y: 0.2,
      color: colors.moonColor,
      alpha: round(clamp01(0.4 + 0.55 * lit), 3),
      phase: moonPhase,
    };
  }

  return {
    skyTop: colors.skyTop,
    skyMid: colors.skyMid,
    skyBottom: colors.skyBottom,
    horizonGlow: colors.horizonGlow,
    seaFar: colors.seaFar,
    seaMid: colors.seaMid,
    seaNear: colors.seaNear,
    foam: colors.foam,
    sun,
    moon,
    stars: round(stars, 3),
    exposure: round(clamp01(colors.exposure), 3),
  };
}

/**
 * now 就是 GET /intertidal/now 的响应体：
 *   { t, sun:{altitude,azimuth}, moon:{altitude,azimuth,phase}, tide:{height,trend}, phase, dayLength }
 * 任何字段缺失/NaN/类型错都返回合法结构，绝不抛。
 */
export function paletteFor(now) {
  try {
    return computePalette(now);
  } catch (_error) {
    try {
      return computePalette(null);
    } catch (_ignored) {
      return hardFallback();
    }
  }
}