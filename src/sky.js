/**
 * 潮间 · 太阳 / 月亮 / 潮汐 / 时段 / 日照长度
 *
 * 纯函数模块：零依赖、零网络、**零 IO**。
 * 所有时间由调用方显式传入（Date | number(ms)），本文件绝不调用 Date.now()。
 * 任何非法输入都不得抛异常——最差情况返回结构合法、数值有限的结果。
 *
 * 算法：NOAA 简化太阳位置（儒略日 → 平黄经/平近点角 → 黄赤交角 → 赤纬 →
 * 恒星时/时角 → 高度角、方位角）。方位角 0..360，正北为 0、顺时针。
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const MS_PER_DAY = 86400000;
/** J2000 历元对应的「儒略日 - 2451545」基准毫秒：2000-01-01T12:00:00Z */
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
/** 朔望月长度（天） */
const SYNODIC_DAYS = 29.530588853;
/** 参考朔（新月）时刻：2000-01-06T18:14:00Z，JD 2451550.26 附近 */
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);
/** 半日潮周期（小时） */
const TIDE_PERIOD_H = 12.42;
/** 半日潮振幅（米） */
const TIDE_AMPLITUDE = 1.2;
/** 日出日落判定用的太阳高度角（含大气折射与日面半径），度 */
const SUNRISE_ALTITUDE = -0.833;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** 归一化到 [0, 360) */
function norm360(deg) {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** 归一化到 (-180, 180] */
function norm180(deg) {
  const d = norm360(deg);
  return d > 180 ? d - 360 : d;
}

/** Date | number(ms) -> ms；非法返回 NaN */
function toMs(date) {
  if (date instanceof Date) return date.getTime();
  if (finite(date)) return date;
  return NaN;
}

/** ms -> 儒略日（UT） */
function julianDay(ms) {
  return ms / MS_PER_DAY + 2440587.5;
}

/** 赤道坐标 + 时角 -> 地平坐标（角度制） */
function horizontal(latDeg, decDeg, hourAngleDeg) {
  const lat = latDeg * RAD;
  const dec = decDeg * RAD;
  const H = hourAngleDeg * RAD;

  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  const altitude = Math.asin(clamp(sinAlt, -1, 1)) * DEG;

  // 以「正南为 0、向西为正」的方位，再加 180° 换成「正北为 0、顺时针」
  const azSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat));
  const azimuth = norm360(azSouth * DEG + 180);

  return { altitude, azimuth };
}

/** 格林尼治平恒星时（度） */
function gmstDeg(jd) {
  const d = jd - 2451545.0;
  const T = d / 36525;
  return norm360(
    280.46061837 +
      360.98564736629 * d +
      0.000387933 * T * T -
      (T * T * T) / 38710000,
  );
}

/** 太阳黄经与黄赤交角（度），供太阳与月亮共用 */
function sunEcliptic(ms) {
  const jd = julianDay(ms);
  const d = jd - 2451545.0;
  const L = 280.46 + 0.9856474 * d; // 平黄经
  const g = 357.528 + 0.9856003 * d; // 平近点角
  const lambda = L + 1.915 * Math.sin(g * RAD) + 0.02 * Math.sin(2 * g * RAD); // 黄经
  const eps = 23.439 - 0.0000004 * d; // 黄赤交角
  return { jd, d, lambda: norm360(lambda), eps, gmst: gmstDeg(jd) };
}

const FALLBACK = Object.freeze({ altitude: 0, azimuth: 0 });

/**
 * 太阳位置。date: Date | number(ms)。返回角度制。
 * @returns {{altitude:number, azimuth:number}} 方位角 0..360（正北起顺时针）
 */
export function solarPosition(date, lat, lon) {
  const ms = toMs(date);
  const phi = Number(lat);
  const lam = Number(lon);
  if (!Number.isFinite(ms) || !Number.isFinite(phi) || !Number.isFinite(lam)) {
    return { ...FALLBACK };
  }
  if (phi < -90 || phi > 90) return { ...FALLBACK };

  const { lambda, eps, gmst } = sunEcliptic(ms);
  const sinDec = Math.sin(eps * RAD) * Math.sin(lambda * RAD);
  const dec = Math.asin(clamp(sinDec, -1, 1)) * DEG;
  const ra = Math.atan2(Math.cos(eps * RAD) * Math.sin(lambda * RAD), Math.cos(lambda * RAD)) * DEG;
  const hourAngle = norm180(gmst + lam - ra);

  return horizontal(phi, dec, hourAngle);
}

/**
 * 月亮位置与月相。phase: 0..1，0=朔、0.5=望。
 * @returns {{altitude:number, azimuth:number, phase:number}}
 */
export function moonPosition(date, lat, lon) {
  const ms = toMs(date);
  const phi = Number(lat);
  const lam = Number(lon);
  if (!Number.isFinite(ms) || !Number.isFinite(phi) || !Number.isFinite(lam)) {
    return { ...FALLBACK, phase: 0 };
  }
  if (phi < -90 || phi > 90) return { ...FALLBACK, phase: 0 };

  const { d, lambda: sunLambda, eps, gmst } = sunEcliptic(ms);

  // 低精度月球位置：平黄经 + 主要摄动项
  const Lm = 218.316 + 13.176396 * d;
  const Mm = 134.963 + 13.064993 * d;
  const Fm = 93.272 + 13.22935 * d;
  const moonLambda = norm360(Lm + 6.289 * Math.sin(Mm * RAD));
  const moonBeta = 5.128 * Math.sin(Fm * RAD);

  const sinBeta = Math.sin(moonBeta * RAD);
  const cosBeta = Math.cos(moonBeta * RAD);
  const sinLam = Math.sin(moonLambda * RAD);
  const cosLam = Math.cos(moonLambda * RAD);
  const sinEps = Math.sin(eps * RAD);
  const cosEps = Math.cos(eps * RAD);

  const dec =
    Math.asin(clamp(sinBeta * cosEps + cosBeta * sinEps * sinLam, -1, 1)) * DEG;
  const ra =
    Math.atan2(sinLam * cosEps - (sinBeta / Math.max(cosBeta, 1e-9)) * sinEps, cosLam) * DEG;

  const hourAngle = norm180(gmst + lam - ra);
  const { altitude, azimuth } = horizontal(phi, dec, hourAngle);

  // 月相＝日月黄经差占一圈的比例：0=朔，0.5=望
  const elongation = norm360(moonLambda - sunLambda);

  return { altitude, azimuth, phase: elongation / 360 };
}

/**
 * 半日潮：h = A·sin(2π(t-t₀)/12.42h)，A = 1.2 m。
 * t₀ 取距朔日的近似（新月时刻），lon 用来给潮时一个经度相位偏移。
 * @returns {{height:number, trend:'rising'|'falling'}}
 */
export function tideAt(date, lon) {
  const ms = toMs(date);
  if (!Number.isFinite(ms)) return { height: 0, trend: 'rising' };
  const lam = Number(lon);
  const lonPhase = Number.isFinite(lam) && Math.abs(lam) <= 180 ? lam / 360 : 0;

  const hoursSinceNewMoon = (ms - NEW_MOON_MS) / 3600000;
  const cycles = hoursSinceNewMoon / TIDE_PERIOD_H - lonPhase;
  const angle = 2 * Math.PI * cycles;

  const height = TIDE_AMPLITUDE * Math.sin(angle);
  // 导数 d/dt sin(angle) ∝ cos(angle)，正为涨、负为落
  const trend = Math.cos(angle) >= 0 ? 'rising' : 'falling';

  return {
    height: Number.isFinite(height) ? height : 0,
    trend,
  };
}

/**
 * 时段：按太阳高度角 + 升落趋势判定。
 * > 40 noon；6~40 afternoon；-6~6 上升 dawn / 下降 dusk；< -6 night。
 * 非法输入（非有限数）返回 'afternoon'（与 skyAt 的兜底一致，不抛）。
 * @returns {'dawn'|'noon'|'afternoon'|'dusk'|'night'}
 */
export function classifyPhase(altitude, rising) {
  const alt = Number(altitude);
  if (!Number.isFinite(alt)) return 'afternoon';
  if (alt > 40) return 'noon';
  if (alt >= 6) return 'afternoon';
  if (alt >= -6) return rising ? 'dawn' : 'dusk';
  return 'night';
}

/* ------------------------------------------------------------------ *
 * 时区工具（只用传入的时间，不碰 Date.now；Intl 失败一律退回 UTC）
 * ------------------------------------------------------------------ */

const tzCache = new Map();
const dtfCache = new Map();

const DTF_OPTIONS = Object.freeze({
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** 取（并缓存）某时区的格式化器；非法时区返回 null */
function getFormatter(timeZone) {
  const hit = dtfCache.get(timeZone);
  if (hit !== undefined) return hit;
  let dtf = null;
  try {
    dtf = new Intl.DateTimeFormat('en-US', { ...DTF_OPTIONS, timeZone });
  } catch {
    dtf = null;
  }
  dtfCache.set(timeZone, dtf);
  return dtf;
}

/** 校验并缓存时区；非法时区退回 'UTC'（不抛） */
function safeTimeZone(tz) {
  if (typeof tz !== 'string' || tz.trim() === '') return 'UTC';
  const key = tz.trim();
  const hit = tzCache.get(key);
  if (hit !== undefined) return hit;
  let resolved = 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { ...DTF_OPTIONS, timeZone: key });
    resolved = key;
  } catch {
    resolved = 'UTC';
  }
  tzCache.set(key, resolved);
  return resolved;
}

/** 某时刻某时区相对 UTC 的偏移（ms）。失败返回 0。 */
function tzOffsetMs(timeZone, ms) {
  try {
    const dtf = getFormatter(timeZone);
    if (!dtf) return 0;
    const parts = dtf.formatToParts(new Date(ms));
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour') % 24,
      get('minute'),
      get('second'),
    );
    if (!Number.isFinite(asUtc)) return 0;
    return asUtc - Math.floor(ms / 1000) * 1000;
  } catch {
    return 0;
  }
}

/** 某时刻在该时区的当地日期 + 当地 0 点对应的 UTC ms */
function localDayStart(timeZone, ms) {
  const offset = tzOffsetMs(timeZone, ms);
  const localMs = ms + offset;
  const localMidnight = Math.floor(localMs / MS_PER_DAY) * MS_PER_DAY;
  const guess = localMidnight - offset;
  // 用落点再算一次偏移，跨夏令时那天也能对得上
  const offset2 = tzOffsetMs(timeZone, guess);
  return localMidnight - offset2;
}

/** 把 UTC ms 按某时区格式化成 HH:MM */
function formatHHMM(timeZone, ms) {
  const offset = tzOffsetMs(timeZone, ms);
  const tod = ((ms + offset) % MS_PER_DAY + MS_PER_DAY) % MS_PER_DAY;
  const totalMinutes = Math.floor(tod / 60000);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * 日出日落；极昼/极夜返回 null（不得出现 00:00）。
 * 逐分钟扫描高度角穿越 -0.833°：先在该时区的当地一天内找太阳中天，
 * 再由中天向两侧各扫一段找上下穿越（天然处理极昼极夜）。
 * tz 非法不抛，退回 UTC 并仍返回可读结果。
 * @returns {{sunrise:string, sunset:string} | null}
 */
export function dayLength(date, lat, lon, tz) {
  const ms = toMs(date);
  const phi = Number(lat);
  const lam = Number(lon);
  if (!Number.isFinite(ms) || !Number.isFinite(phi) || !Number.isFinite(lam)) return null;
  if (phi < -90 || phi > 90) return null;

  const timeZone = safeTimeZone(tz);
  const start = localDayStart(timeZone, ms);
  const MINUTE = 60000;
  const altAt = (offsetMinutes) => solarPosition(start + offsetMinutes * MINUTE, phi, lam).altitude;

  // 1) 当地这一天里的太阳中天（最高点）
  let transitIndex = 0;
  let transitAltitude = -Infinity;
  for (let i = 0; i <= 1440; i += 1) {
    const alt = altAt(i);
    if (alt > transitAltitude) {
      transitAltitude = alt;
      transitIndex = i;
    }
  }
  // 中天都到不了 -0.833° → 极夜
  if (transitAltitude < SUNRISE_ALTITUDE) return null;

  // 2) 由中天向两侧找一次上/下穿越（最多各扫 18 小时，覆盖极区最长白昼）
  const REACH = 18 * 60;
  let sunriseMs = null;
  let sunsetMs = null;

  for (let i = transitIndex - 1; i >= transitIndex - REACH; i -= 1) {
    if (altAt(i) < SUNRISE_ALTITUDE) {
      sunriseMs = start + (i + 0.5) * MINUTE; // 穿越落在 i 与 i+1 分钟之间
      break;
    }
  }
  for (let i = transitIndex + 1; i <= transitIndex + REACH; i += 1) {
    if (altAt(i) < SUNRISE_ALTITUDE) {
      sunsetMs = start + (i - 0.5) * MINUTE;
      break;
    }
  }

  // 极昼：太阳整天都在 -0.833° 之上，没有穿越
  if (sunriseMs === null || sunsetMs === null) return null;

  return {
    sunrise: formatHHMM(timeZone, sunriseMs),
    sunset: formatHHMM(timeZone, sunsetMs),
  };
}

/** 输入非法时给 skyAt 的合法兜底结构（phase 固定 afternoon，全数值有限） */
function fallbackSky(t) {
  return {
    t,
    sun: { ...FALLBACK },
    moon: { ...FALLBACK, phase: 0 },
    tide: { height: 0, trend: 'rising' },
    phase: 'afternoon',
    dayLength: null,
  };
}

/**
 * 一次拿全，给 GET /intertidal/now 用。tz 为 IANA 时区名。
 * 非法 lat/lon/tz/date 一律不抛：返回 phase='afternoon' 的合法结构。
 * @param {Date|number} date
 * @param {{lat:number, lon:number, tz?:string}} location
 * @returns {{t:number, sun:object, moon:object, tide:object, phase:string, dayLength:object|null}}
 */
export function skyAt(date, location) {
  const ms = toMs(date);
  const t = Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;

  try {
    const loc = location && typeof location === 'object' ? location : {};
    const phi = Number(loc.lat);
    const lam = Number(loc.lon);

    if (!Number.isFinite(ms) || !Number.isFinite(phi) || !Number.isFinite(lam)) {
      return fallbackSky(t);
    }
    if (phi < -90 || phi > 90 || lam < -180 || lam > 180) return fallbackSky(t);

    const sun = solarPosition(ms, phi, lam);
    const moon = moonPosition(ms, phi, lam);
    const tide = tideAt(ms, lam);

    // 升落趋势：以 1 分钟前后的高度角之差判定
    const step = 60000;
    const altBefore = solarPosition(ms - step, phi, lam).altitude;
    const altAfter = solarPosition(ms + step, phi, lam).altitude;
    const rising = altAfter >= altBefore;

    const sky = {
      t,
      sun: { altitude: sun.altitude, azimuth: sun.azimuth },
      moon: { altitude: moon.altitude, azimuth: moon.azimuth, phase: moon.phase },
      tide: { height: tide.height, trend: tide.trend },
      phase: classifyPhase(sun.altitude, rising),
      dayLength: dayLength(ms, phi, lam, loc.tz),
    };

    // 极端数值检查：任何非有限值都退回兜底，绝不把 NaN 送到画布
    const ok =
      Number.isFinite(sky.t) &&
      Number.isFinite(sky.sun.altitude) &&
      Number.isFinite(sky.sun.azimuth) &&
      Number.isFinite(sky.moon.altitude) &&
      Number.isFinite(sky.moon.azimuth) &&
      Number.isFinite(sky.moon.phase) &&
      Number.isFinite(sky.tide.height) &&
      typeof sky.phase === 'string';
    if (!ok) return fallbackSky(t);

    return sky;
  } catch {
    return fallbackSky(t);
  }
}

export const SKY_CONSTANTS = Object.freeze({
  SYNODIC_DAYS,
  NEW_MOON_MS,
  TIDE_PERIOD_H,
  TIDE_AMPLITUDE,
  SUNRISE_ALTITUDE,
});