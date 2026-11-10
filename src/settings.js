/**
 * 潮间 · 设置默认值、合并、范围钳制
 *
 * 零依赖、零 IO。宿主侧不信任任何客户端输入：
 * 类型错、越界、时区非法一律退回该字段的默认值。
 */

import { findCity, guessCity } from './cities.js';

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 是不是一个真实存在的日历日（'2026-13-01' 不算） */
function isDateString(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 契约 §3 的完整默认值 */
export const DEFAULTS = Object.freeze({
  auto: true,
  intervalMinutes: 120,
  durationSeconds: 180,
  firstDelayMinutes: 20,
  quietHours: Object.freeze({ enabled: true, start: '23:00', end: '07:00' }),
  deferOnTyping: true,
  manualExtends: true,
  form: 'full',
  rememberForm: true,
  caption: true,
  location: Object.freeze({
    city: 'shanghai',
    lat: 31.23,
    lon: 121.47,
    tz: 'Asia/Shanghai',
  }),
  sound: Object.freeze({ enabled: false, volume: 0.35 }),
  /** v2：真实素材（图片/视频）替代程序化海；'off' 时仍用程序化海。 */
  media: Object.freeze({
    mode: 'off',
    dir: '',
    urls: Object.freeze([]),
    grade: 0.55,
    motion: 0.5,
    shuffle: true,
  }),
  reducedMotion: 'auto',
});

/** 契约 §3 的范围 */
export const LIMITS = Object.freeze({
  intervalMinutes: Object.freeze([15, 480]),
  durationSeconds: Object.freeze([30, 1800]),
  firstDelayMinutes: Object.freeze([0, 120]),
  volume: Object.freeze([0, 1]),
  grade: Object.freeze([0, 1]),
  motion: Object.freeze([0, 1]),
});

const FORMS = Object.freeze(['full', 'pip']);
const REDUCED_MOTION = Object.freeze(['auto', 'on', 'off']);
const MEDIA_MODES = Object.freeze(['off', 'dir', 'url']);
const MAX_MEDIA_URLS = 8;
const MEDIA_URL_RE = /^https?:\/\/[^\s]+$/i;
const ABS_PATH_RE = /^(\/|[A-Za-z]:[\\/])/;

/* ---------------------------- 小工具 ---------------------------- */

/** 深拷贝一份普通对象（DEFAULTS 里有冻结对象，不能直接外泄引用） */
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clone(v);
    return out;
  }
  return value;
}

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** 取对象里的值；非对象当空对象 */
const field = (obj, key) => (isPlainObject(obj) ? obj[key] : undefined);

/** 布尔：只接受真正的 boolean，其余回默认 */
function boolOr(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

/** 数字：有限数才认，然后钳制到 [lo, hi] */
function numberIn(value, lo, hi, fallback) {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return n < lo ? lo : n > hi ? hi : n;
}

/** 整数：有限数才认，四舍五入后钳制 */
function intIn(value, lo, hi, fallback) {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  return rounded < lo ? lo : rounded > hi ? hi : rounded;
}

/** 'HH:MM' 且是真实存在的时刻 */
function timeOr(value, fallback) {
  if (typeof value !== 'string') return fallback;
  return HHMM_RE.test(value.trim()) ? value.trim() : fallback;
}

/** IANA 时区名是否可用 */
export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || tz.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/** 枚举：命中才认 */
function oneOf(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

/** 某个 location 字段的默认值：优先用城市表里的坐标，否则用 DEFAULTS */
function locationDefaults(inputCity) {
  const known = findCity(inputCity) ?? findCity(DEFAULTS.location.city);
  return known
    ? { city: known.id, lat: known.lat, lon: known.lon, tz: known.tz }
    : clone(DEFAULTS.location);
}

/* ------------------------- 设置校验（核心） ------------------------- */

/** 任意输入 → 合法 settings。非法/越界/类型错一律退回默认该字段。 */
export function sanitizeSettings(input) {
  const src = isPlainObject(input) ? input : {};
  const rawLocation = field(src, 'location');
  const locDefaults = locationDefaults(field(rawLocation, 'city'));

  const rawCity = field(rawLocation, 'city');
  // 认得出来就用城市表里的规范 id + 用它补全缺失的经纬度/时区；
  // 认不出来就把用户写的 id 原样保留（自定义地点），缺失项退回默认。
  const matchedCity = typeof rawCity === 'string' ? findCity(rawCity) : undefined;
  const city =
    matchedCity?.id ??
    (typeof rawCity === 'string' && rawCity.trim() ? rawCity.trim() : DEFAULTS.location.city);

  const quiet = field(src, 'quietHours');
  const sound = field(src, 'sound');
  const media = field(src, 'media');

  return {
    auto: boolOr(field(src, 'auto'), DEFAULTS.auto),
    intervalMinutes: intIn(
      field(src, 'intervalMinutes'),
      LIMITS.intervalMinutes[0],
      LIMITS.intervalMinutes[1],
      DEFAULTS.intervalMinutes,
    ),
    durationSeconds: intIn(
      field(src, 'durationSeconds'),
      LIMITS.durationSeconds[0],
      LIMITS.durationSeconds[1],
      DEFAULTS.durationSeconds,
    ),
    firstDelayMinutes: intIn(
      field(src, 'firstDelayMinutes'),
      LIMITS.firstDelayMinutes[0],
      LIMITS.firstDelayMinutes[1],
      DEFAULTS.firstDelayMinutes,
    ),
    quietHours: {
      enabled: boolOr(field(quiet, 'enabled'), DEFAULTS.quietHours.enabled),
      start: timeOr(field(quiet, 'start'), DEFAULTS.quietHours.start),
      end: timeOr(field(quiet, 'end'), DEFAULTS.quietHours.end),
    },
    deferOnTyping: boolOr(field(src, 'deferOnTyping'), DEFAULTS.deferOnTyping),
    manualExtends: boolOr(field(src, 'manualExtends'), DEFAULTS.manualExtends),
    form: oneOf(field(src, 'form'), FORMS, DEFAULTS.form),
    rememberForm: boolOr(field(src, 'rememberForm'), DEFAULTS.rememberForm),
    caption: boolOr(field(src, 'caption'), DEFAULTS.caption),
    location: {
      city,
      lat: numberIn(field(rawLocation, 'lat'), -90, 90, locDefaults.lat),
      lon: numberIn(field(rawLocation, 'lon'), -180, 180, locDefaults.lon),
      tz: isValidTimeZone(field(rawLocation, 'tz'))
        ? field(rawLocation, 'tz').trim()
        : locDefaults.tz,
    },
    sound: {
      enabled: boolOr(field(sound, 'enabled'), DEFAULTS.sound.enabled),
      volume: numberIn(
        field(sound, 'volume'),
        LIMITS.volume[0],
        LIMITS.volume[1],
        DEFAULTS.sound.volume,
      ),
    },
    media: {
      mode: oneOf(field(media, 'mode'), MEDIA_MODES, DEFAULTS.media.mode),
      // 目录必须是绝对路径；写相对路径就没法在宿主侧做围栏，直接退回空
      dir: absPathOr(field(media, 'dir'), DEFAULTS.media.dir),
      urls: urlListOr(field(media, 'urls'), DEFAULTS.media.urls),
      grade: numberIn(field(media, 'grade'), LIMITS.grade[0], LIMITS.grade[1], DEFAULTS.media.grade),
      motion: numberIn(field(media, 'motion'), LIMITS.motion[0], LIMITS.motion[1], DEFAULTS.media.motion),
      shuffle: boolOr(field(media, 'shuffle'), DEFAULTS.media.shuffle),
    },
    reducedMotion: oneOf(field(src, 'reducedMotion'), REDUCED_MOTION, DEFAULTS.reducedMotion),
  };
}

/** 绝对路径字符串：不是字符串/不是绝对路径 → 默认值（空串）。 */
function absPathOr(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  if (!text) return fallback;
  return ABS_PATH_RE.test(text) ? text : fallback;
}

/** 链接列表：只留 http/https、去重、最多 MAX_MEDIA_URLS 条。 */
function urlListOr(value, fallback) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,]+/) : [];
  const out = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    if (!text || !MEDIA_URL_RE.test(text)) continue;
    if (out.includes(text)) continue;
    out.push(text);
    if (out.length >= MAX_MEDIA_URLS) break;
  }
  return out.length ? out : [...fallback];
}

/** 深合并（普通对象递归，数组与标量整体覆盖，undefined 跳过） */
function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return patch === undefined ? clone(base) : clone(patch);
  const out = isPlainObject(base) ? clone(base) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : clone(value);
  }
  return out;
}

/** 默认值 + 已存盘 + 本次 patch 的深合并，再做钳制。 */
export function mergeSettings(base, patch) {
  const merged = deepMerge(deepMerge(DEFAULTS, base), patch);
  return sanitizeSettings(merged);
}

/* --------------------------- rhythm 归一化 --------------------------- */

const RHYTHM_EVENTS = Object.freeze(['shown', 'hidden', 'skip-today', 'manual-open']);
/** skipDates 只保留最近 7 天 */
const SKIP_KEEP = 7;

/** 毫秒 → Unix 秒；非法返回 null */
function toUnixSeconds(value) {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(ms)) return null;
  const sec = ms > 1e11 ? Math.floor(ms / 1000) : Math.floor(ms);
  return sec >= 0 ? sec : null;
}

/** 系统本地日期 YYYY-MM-DD */
export function localDateString(nowMs) {
  const ms = nowMs instanceof Date ? nowMs.getTime() : Number(nowMs);
  const d = new Date(Number.isFinite(ms) ? ms : 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 归一化 rhythm：三个时间戳为 Unix 秒（可 null），skipDates 为本地日期串、
 * 去重排序后只保留最近 7 天。
 */
export function sanitizeRhythm(input, nowMs) {
  const src = isPlainObject(input) ? input : {};
  const nowSec = toUnixSeconds(nowMs) ?? 0;

  const rawSkip = Array.isArray(src.skipDates) ? src.skipDates : [];
  const skipDates = [...new Set(rawSkip.filter(isDateString))].sort().slice(-SKIP_KEEP);

  return {
    lastShownAt: toUnixSeconds(src.lastShownAt),
    lastHideAt: toUnixSeconds(src.lastHideAt),
    installedAt: toUnixSeconds(src.installedAt) ?? nowSec,
    skipDates,
  };
}

/* ------------------------------ 对外状态 ------------------------------ */

/** 给 GET /intertidal/state 的完整结构。now 接受 Date 或 ms，输出 Unix 秒。 */
export function publicState(settings, rhythm, now) {
  return {
    settings: sanitizeSettings(settings),
    rhythm: sanitizeRhythm(rhythm, now),
    now: toUnixSeconds(now) ?? 0,
  };
}

/** 时区非法时给 store/settings 的兜底时区（不抛） */
export function safeTimeZoneOr(tz, fallback) {
  return isValidTimeZone(tz) ? tz.trim() : fallback;
}

/** rhythm 事件白名单（宿主路由用它校验入参） */
export { RHYTHM_EVENTS, SKIP_KEEP };

/** 猜城市 / 查城市（转发 cities，方便宿主一处引入） */
export { guessCity, findCity };