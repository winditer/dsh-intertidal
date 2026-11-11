window.__ModuleLoader__.load({
  id: "dsh-intertidal",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/client/overlay.jsx
var import_react2 = require("react");

// src/client/sea-canvas.jsx
var import_react = require("react");

// src/client/palette.js
var HORIZON = 0.52;
var MIN_VISIBLE_ALT = -1;
var POS_MIN = -0.2;
var POS_MAX = 1.2;
var FALLBACK_PHASE = "afternoon";
var PHASE_NAMES = Object.freeze(["dawn", "noon", "afternoon", "dusk", "night"]);
var ALT = Object.freeze({ night: -14, twilight: 0, afternoon: 16, noon: 48 });
var BASE = Object.freeze({
  // 晨曦：橘粉 → 淡青，低对比雾感（海面几乎与天同调）
  dawn: Object.freeze({
    skyTop: "#5d7f9d",
    skyMid: "#c69b9c",
    skyBottom: "#f3b78e",
    horizonGlow: "#ffd2a3",
    seaFar: "#9aa8b0",
    seaMid: "#6b8492",
    seaNear: "#4a6673",
    foam: "#f7e9dd",
    sunColor: "#ffd9a8",
    moonColor: "#eef2f8",
    stars: 0.18,
    exposure: 0.72
  }),
  // 正午：高饱和蓝，强反光白浪
  noon: Object.freeze({
    skyTop: "#0f63c8",
    skyMid: "#3f9fe0",
    skyBottom: "#b7e1f6",
    horizonGlow: "#f4fbff",
    seaFar: "#3d8fc4",
    seaMid: "#1f74a8",
    seaNear: "#0d5182",
    foam: "#ffffff",
    sunColor: "#fffdf0",
    moonColor: "#eaf2ff",
    stars: 0,
    exposure: 1
  }),
  // 午后：蓝偏暖（青蓝到米黄的地平线，海偏青），标准反差
  afternoon: Object.freeze({
    skyTop: "#2c78a8",
    skyMid: "#79b1c4",
    skyBottom: "#e8ddbd",
    horizonGlow: "#ffe9c2",
    seaFar: "#4a94a6",
    seaMid: "#2a7185",
    seaNear: "#194f63",
    foam: "#fdf8ea",
    sunColor: "#fff3cf",
    moonColor: "#eef2f8",
    stars: 0,
    exposure: 0.94
  }),
  // 黄昏：金橙 → 绛紫，逆光金路
  dusk: Object.freeze({
    skyTop: "#372a5b",
    skyMid: "#8c4a77",
    skyBottom: "#f5a04f",
    horizonGlow: "#ffbe6a",
    seaFar: "#8a6172",
    seaMid: "#523a55",
    seaNear: "#2c2039",
    foam: "#ffe7cd",
    sunColor: "#ffb35a",
    moonColor: "#f0ecf4",
    stars: 0.22,
    exposure: 0.62
  }),
  // 夜：深靛 → 近黑，月光带
  night: Object.freeze({
    skyTop: "#04060f",
    skyMid: "#0a1128",
    skyBottom: "#182a4a",
    horizonGlow: "#2c4570",
    seaFar: "#16253d",
    seaMid: "#0d1729",
    seaNear: "#060b16",
    foam: "#b9c8db",
    sunColor: "#ffeccd",
    moonColor: "#e6eeff",
    stars: 0.9,
    exposure: 0.3
  })
});
var COLOR_KEYS = Object.freeze([
  "skyTop",
  "skyMid",
  "skyBottom",
  "horizonGlow",
  "seaFar",
  "seaMid",
  "seaNear",
  "foam",
  "sunColor",
  "moonColor"
]);
var NUM_KEYS = Object.freeze(["stars", "exposure"]);
function num(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
  if (typeof color !== "string") return null;
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
    return (byte < 16 ? "0" : "") + byte.toString(16);
  };
  return "#" + part(channels[0]) + part(channels[1]) + part(channels[2]);
}
function mix(a, b, t) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca && !cb) return "#000000";
  if (!ca) return toHex(cb);
  if (!cb) return toHex(ca);
  const k = clamp01(t);
  return toHex([
    ca[0] + (cb[0] - ca[0]) * k,
    ca[1] + (cb[1] - ca[1]) * k,
    ca[2] + (cb[2] - ca[2]) * k
  ]);
}
function normalizePhase(phase) {
  if (typeof phase !== "string") return null;
  const key = phase.trim().toLowerCase();
  return PHASE_NAMES.indexOf(key) >= 0 ? key : null;
}
function phasePalette(phase) {
  const key = normalizePhase(phase) || FALLBACK_PHASE;
  const base = BASE[key];
  const out = { phase: key };
  for (const name2 of COLOR_KEYS) out[name2] = base[name2];
  for (const name2 of NUM_KEYS) out[name2] = base[name2];
  return out;
}
function hardFallback() {
  return {
    skyTop: "#1f6fb4",
    skyMid: "#63a7d2",
    skyBottom: "#dcd9c6",
    horizonGlow: "#ffeccb",
    seaFar: "#3b87ab",
    seaMid: "#21688d",
    seaNear: "#12486a",
    foam: "#fdfaf0",
    sun: null,
    moon: null,
    stars: 0,
    exposure: 0.93
  };
}
function blendPalette(a, b, k) {
  const t = clamp01(k);
  const out = {};
  for (const name2 of COLOR_KEYS) out[name2] = mix(a[name2], b[name2], t);
  for (const name2 of NUM_KEYS) out[name2] = clamp01(a[name2] + (b[name2] - a[name2]) * t);
  return out;
}
function twilightKey(phase, azimuth) {
  if (phase === "dawn" || phase === "dusk") return phase;
  if (typeof azimuth === "number" && Number.isFinite(azimuth)) {
    const normalized = (azimuth % 360 + 360) % 360;
    return normalized < 180 ? "dawn" : "dusk";
  }
  return "dusk";
}
function ladder(altitude, phase, azimuth) {
  const alt = clamp(num(altitude, 0), -90, 90);
  const twilight = BASE[twilightKey(phase, azimuth)];
  if (alt <= ALT.night) return phasePalette("night");
  if (alt < ALT.twilight) {
    const k = (alt - ALT.night) / (ALT.twilight - ALT.night);
    return blendPalette(BASE.night, twilight, k);
  }
  if (alt < ALT.afternoon) return blendPalette(twilight, BASE.afternoon, alt / ALT.afternoon);
  if (alt < ALT.noon) {
    const k = (alt - ALT.afternoon) / (ALT.noon - ALT.afternoon);
    return blendPalette(BASE.afternoon, BASE.noon, k);
  }
  return phasePalette("noon");
}
function readAltitude(body) {
  if (!body || typeof body !== "object") return null;
  const altitude = typeof body.altitude === "number" ? body.altitude : NaN;
  return Number.isFinite(altitude) ? clamp(altitude, -90, 90) : null;
}
function bodyPosition(body) {
  if (!body || typeof body !== "object") return null;
  const rawAltitude = typeof body.altitude === "number" ? body.altitude : NaN;
  if (!Number.isFinite(rawAltitude)) return null;
  const altitude = clamp(rawAltitude, -90, 90);
  if (altitude < MIN_VISIBLE_ALT) return null;
  const azimuth = num(body.azimuth, 180);
  const deviation = ((azimuth - 180) % 360 + 540) % 360 - 180;
  const radians = deviation * Math.PI / 180;
  const tan = Math.tan(radians);
  const x = clamp(0.5 + (Number.isFinite(tan) ? tan : Math.sign(radians) * 1e6) * 0.5, POS_MIN, POS_MAX);
  const y = clamp(HORIZON - Math.sin(altitude * Math.PI / 180) * HORIZON, POS_MIN, POS_MAX);
  return { x: round(x, 4), y: round(y, 4), altitude };
}
function normalizeMoonPhase(value) {
  const phase = num(value, 0.5);
  return round(clamp(phase, 0, 1), 4);
}
function illuminatedFraction(phase) {
  return clamp01((1 - Math.cos(Math.PI * 2 * phase)) / 2);
}
function sunOf(position, colors) {
  if (!position) return null;
  return {
    x: position.x,
    y: position.y,
    color: colors.sunColor,
    alpha: round(clamp01(0.55 + position.altitude * 0.045), 3)
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
    phase
  };
}
function computePalette(now) {
  const source = now && typeof now === "object" ? now : {};
  const phase = normalizePhase(source.phase);
  const sunAltitude = readAltitude(source.sun);
  const sunPosition = bodyPosition(source.sun);
  const moonPhase = normalizeMoonPhase(source.moon && source.moon.phase);
  const colors = sunAltitude === null ? phasePalette(phase || FALLBACK_PHASE) : ladder(sunAltitude, phase, num(source.sun && source.sun.azimuth, NaN));
  let stars = clamp01(colors.stars);
  if (sunAltitude !== null) stars *= clamp01((-sunAltitude + 1) / 7);
  else if ((phase || FALLBACK_PHASE) !== "night") stars = 0;
  const sun = sunOf(sunPosition, colors);
  const moon = moonOf(bodyPosition(source.moon), colors, moonPhase);
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
    exposure: round(clamp01(colors.exposure), 3)
  };
}
function paletteFor(now) {
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

// src/client/water.js
var TAU = Math.PI * 2;
var BUFFER_W = 430;
var MAX_BUFFER_H = 260;
var MIN_BUFFER_H = 40;
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbmSmooth(x, y) {
  return 0.55 * vnoise(x, y) + 0.3 * vnoise(x * 2.07 + 3.1, y * 2.07 + 1.7) + 0.15 * vnoise(x * 4.31 + 7.7, y * 4.31 + 3.3);
}
function fbmRidged(x, y) {
  let sum = 0;
  let amp = 0.6;
  let freq = 1;
  let total = 0;
  for (let o = 0; o < 4; o += 1) {
    const n = vnoise(x * freq + o * 13.7, y * freq + o * 7.3);
    sum += amp * (1 - Math.abs(2 * n - 1));
    total += amp;
    amp *= 0.52;
    freq *= 2.17;
  }
  return sum / total;
}
function hexToRgb(hex) {
  const text = String(hex ?? "").replace("#", "");
  if (text.length !== 6) return [0, 0, 0];
  return [parseInt(text.slice(0, 2), 16), parseInt(text.slice(2, 4), 16), parseInt(text.slice(4, 6), 16)];
}
var clamp012 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
var lerp = (a, b, t) => a + (b - a) * t;
function createWaterField(doc = globalThis.document) {
  const canvas = doc?.createElement?.("canvas") ?? null;
  return { width: 0, height: 0, canvas, ctx: canvas?.getContext?.("2d") ?? null, image: null, h: null };
}
function ensureSize(field2, width, height) {
  if (field2.width === width && field2.height === height && field2.image) return true;
  field2.width = width;
  field2.height = height;
  field2.h = new Float32Array(width * height);
  if (!field2.canvas || !field2.ctx) return false;
  field2.canvas.width = width;
  field2.canvas.height = height;
  field2.image = field2.ctx.createImageData(width, height);
  return true;
}
function drawWater(ctx, view, field2) {
  const { W, H, horizonY, t } = view;
  const pal = view.pal ?? {};
  const tideN = Number.isFinite(view.tideN) ? view.tideN : 0;
  const waterH = Math.max(1, H - horizonY);
  const bw = BUFFER_W;
  const bh = Math.max(MIN_BUFFER_H, Math.min(MAX_BUFFER_H, Math.round(bw * waterH / Math.max(1, W))));
  if (!ensureSize(field2, bw, bh)) return false;
  const exposure = clamp012(Number.isFinite(pal.exposure) ? pal.exposure : 0.8);
  const deep = hexToRgb(pal.seaNear ?? "#0d1729");
  const mid = hexToRgb(pal.seaMid ?? "#27728e");
  const far = hexToRgb(pal.seaFar ?? "#4793ae");
  const sky = hexToRgb(pal.skyBottom ?? "#b7e1f6");
  const foam = hexToRgb(pal.foam ?? "#ffffff");
  const glow = hexToRgb(pal.horizonGlow ?? "#ffd5a8");
  const body = pal.sun || pal.moon || null;
  const bodyX = body ? clamp012(body.x) : 0.5;
  const bodyColor = hexToRgb(body?.color ?? pal.horizonGlow ?? "#fff6e2");
  const bodyAlpha = body ? clamp012(body.alpha ?? 0.8) : 0.35;
  const heights = field2.h;
  const LAYERS = 6;
  const SPEED = 0.22;
  const scroll = t * 0.12;
  const XSPREAD = 6.2;
  const WFREQ = 5.4;
  const XFREQ = 1.45;
  let idx = 0;
  for (let j = 0; j < bh; j += 1) {
    const d = (j + 0.5) / bh;
    const zc = 1 / (0.38 + d * 2.4);
    const wz = zc - scroll;
    const phaseBase = d * LAYERS - t * SPEED;
    const swellAmp = 0.16 + 0.3 * d;
    for (let i = 0; i < bw; i += 1) {
      const wx = ((i + 0.5) / bw - 0.5) * zc * XSPREAD;
      const wobble = (vnoise(wx * 0.85 + 9.7, wz * 0.55 + 3.3) - 0.5) * 0.62;
      const swell = Math.sin((phaseBase + wobble) * TAU);
      const ridge = fbmRidged(wx * XFREQ + 3, wz * WFREQ);
      const detail = fbmSmooth(wx * XFREQ * 1.9 + 11.3, wz * WFREQ * 0.72 + 5.1);
      const h = 0.5 + 0.5 * swell * swellAmp + (ridge - 0.5) * 0.5 + (detail - 0.5) * 0.28;
      heights[idx] = h < 0 ? 0 : h > 1 ? 1 : h;
      idx += 1;
    }
  }
  const data = field2.image.data;
  let p = 0;
  for (let j = 0; j < bh; j += 1) {
    const d = (j + 0.5) / bh;
    const haze = (1 - d) * (1 - d) * (0.55 + 0.35 * exposure);
    const nearness = clamp012(d * 1.6);
    const rBase = lerp(lerp(far[0], mid[0], nearness), deep[0], Math.max(0, d - 0.35) / 0.65);
    const gBase = lerp(lerp(far[1], mid[1], nearness), deep[1], Math.max(0, d - 0.35) / 0.65);
    const bBase = lerp(lerp(far[2], mid[2], nearness), deep[2], Math.max(0, d - 0.35) / 0.65);
    const foamBand = clamp012((d - 0.78) / 0.22) * clamp012(0.45 + 0.45 * tideN);
    const rowLight = 0.5 + 0.5 * exposure;
    for (let i = 0; i < bw; i += 1) {
      const h = heights[j * bw + i];
      const hx = (heights[j * bw + Math.min(bw - 1, i + 1)] - heights[j * bw + Math.max(0, i - 1)]) * 0.5;
      const hz = (heights[Math.min(bh - 1, j + 1) * bw + i] - heights[Math.max(0, j - 1) * bw + i]) * 0.5;
      const tilt = -(hx * (bodyX - 0.5) * 4.4 + hz * 1.15);
      const shade = clamp012(0.64 + tilt * (2.2 - 0.9 * d));
      const crest = clamp012((h - 0.4) / 0.6);
      let r = rBase * shade;
      let g = gBase * shade;
      let b = bBase * shade;
      r = lerp(r, sky[0], haze * 0.62);
      g = lerp(g, sky[1], haze * 0.62);
      b = lerp(b, sky[2], haze * 0.62);
      const crestLight = crest * crest * clamp012(0.25 + tilt * 2.2) * rowLight;
      r += glow[0] * crestLight * 0.3;
      g += glow[1] * crestLight * 0.3;
      b += glow[2] * crestLight * 0.28;
      const spec = Math.pow(clamp012(0.26 - tilt * 1.35), 5) * crest * bodyAlpha;
      if (spec > 4e-3) {
        r += bodyColor[0] * spec * 1.35;
        g += bodyColor[1] * spec * 1.35;
        b += bodyColor[2] * spec * 1.35;
      }
      if (foamBand > 0.01) {
        const mask = clamp012((h - (0.72 - 0.1 * foamBand)) / 0.24) * foamBand;
        if (mask > 0.01) {
          const a = mask * 0.32;
          r = lerp(r, foam[0], a);
          g = lerp(g, foam[1], a);
          b = lerp(b, foam[2], a);
        }
      }
      data[p] = r > 255 ? 255 : r < 0 ? 0 : r;
      data[p + 1] = g > 255 ? 255 : g < 0 ? 0 : g;
      data[p + 2] = b > 255 ? 255 : b < 0 ? 0 : b;
      data[p + 3] = 255;
      p += 4;
    }
  }
  field2.ctx.putImageData(field2.image, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  try {
    ctx.imageSmoothingQuality = "high";
  } catch {
  }
  ctx.drawImage(field2.canvas, 0, horizonY, W, waterH);
  ctx.restore();
  try {
    drawGlitter(ctx, { W, H, horizonY, t, pal, exposure, bodyX, bodyAlpha, glow });
  } catch {
  }
  try {
    const hazeH = Math.max(2, waterH * 0.09);
    const grad = ctx.createLinearGradient(0, horizonY - hazeH * 0.4, 0, horizonY + hazeH);
    grad.addColorStop(0, `rgba(${sky[0] | 0},${sky[1] | 0},${sky[2] | 0},${0.55 + 0.35 * (1 - exposure)})`);
    grad.addColorStop(1, `rgba(${sky[0] | 0},${sky[1] | 0},${sky[2] | 0},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizonY - hazeH * 0.4, W, hazeH * 1.4);
  } catch {
  }
  return true;
}
function drawGlitter(ctx, { W, H, horizonY, t, pal, exposure, bodyX, bodyAlpha, glow }) {
  const waterH = H - horizonY;
  if (waterH <= 2) return;
  const count = Math.round((40 + 150 * exposure) * clamp012(bodyAlpha + 0.2));
  const sunU = bodyX;
  ctx.save();
  for (let n = 0; n < count; n += 1) {
    const seedA = hash2(n * 3 + 1, 7);
    const seedB = hash2(n * 5 + 2, 13);
    const seedC = hash2(n * 7 + 3, 19);
    const d = Math.pow(seedA, 0.72);
    const y = horizonY + d * waterH;
    const spread = 0.18 + 0.34 * d;
    const x = (sunU + (seedB - 0.5) * 2 * spread) * W;
    if (x < 0 || x > W) continue;
    const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.45 + seedC * 1.1) + seedC * TAU));
    const alpha = twinkle * (0.12 + 0.34 * exposure) * clamp012(1 - Math.abs(seedB - 0.5) * 1.9);
    if (alpha < 0.03) continue;
    const len = 1 + 1.6 * d + seedC;
    ctx.fillStyle = `rgba(${glow[0] | 0},${glow[1] | 0},${glow[2] | 0},${alpha.toFixed(3)})`;
    ctx.fillRect(x, y, len, 1);
  }
  ctx.restore();
}
var WATER_CONSTANTS = Object.freeze({ BUFFER_W, MAX_BUFFER_H, MIN_BUFFER_H, TAU });

// src/client/sea-canvas.jsx
var import_jsx_runtime = require("react/jsx-runtime");
var TAU2 = Math.PI * 2;
var TUNING = Object.freeze({
  maxBufferWidth: 1280,
  //       内部渲染缓冲宽度上限（程序化海）
  mediaBufferWidth: 2560,
  //     媒体模式的上限（照片要有清晰度，契约 A3）
  targetFps: 30,
  //              目标帧率（不是 60，省电）
  pipFps: 15,
  //                 form === 'pip' 的小窗帧率
  degradedFps: 15,
  //            降级帧率
  slowWindowMs: 3e3,
  //         连续 3 秒
  slowFps: 20,
  //                平均帧率低于它 → 降级
  resizeDebounceMs: 200,
  //      resize 防抖
  reducedRefreshMs: 6e4,
  //    reducedMotion：每 60 秒换一帧
  maxStepMs: 120,
  //             时间步长上限：单帧最多推进 120ms（防节流回来跳帧）
  stopOnBlur: false
  //          spec §4.3 提到「窗口失焦停帧」；默认关：
  //                             开 DevTools 会让页面 blur，验收时会被误判成卡死。
});
var HORIZON2 = 0.52;
var L3 = Object.freeze({
  coverageMin: 0.03,
  //          spec §4.1：覆盖率 3%–9%
  coverageMax: 0.09
});
var MEDIA = Object.freeze({
  kenBurnsPeriod: 40,
  //         秒，契约要求 ~40s 周期
  kenBurnsZoom: 0.06,
  //         1.0 → 1.06
  overscan: 1.008,
  //            恒定超采样，保证 1–2px 位移不漏边
  breathFreq: 0.11,
  //           Hz，水面呼吸
  breathPx: 2,
  //                横向位移幅度（契约 1–2px）
  sweepHeight: 0.09,
  //          高光扫过带的厚度（占画面高）
  skyMaskBottom: 0.62,
  //        顶部天光蒙版盖到画面的 62%
  vignette: 0.22
  //             暗角强度
});
var L4 = Object.freeze({
  freq: 0.6,
  //                  Hz
  band: 0.22,
  //                 占画面下 22%
  eventPeriod: 9.2,
  //           翻白事件的周期（秒）
  eventRise: 0.05,
  //            涨：周期的 5%（≈0.46s）
  eventDecay: 0.12
  //           落：周期的 12%（≈1.1s）
});
function num2(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function clamp2(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}
function clamp013(value) {
  return clamp2(num2(value, 0), 0, 1);
}
function lerp2(a, b, k) {
  return a + (b - a) * k;
}
function round2(value, digits) {
  const base = Math.pow(10, digits);
  return Math.round(num2(value, 0) * base) / base;
}
function rgba(color, alpha) {
  let r = 0;
  let g = 0;
  let b = 0;
  const match = typeof color === "string" ? /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim()) : null;
  if (match) {
    let hex = match[1];
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    r = parseInt(hex.slice(0, 2), 16) || 0;
    g = parseInt(hex.slice(2, 4), 16) || 0;
    b = parseInt(hex.slice(4, 6), 16) || 0;
  }
  return "rgba(" + r + "," + g + "," + b + "," + round2(clamp013(alpha), 3) + ")";
}
function hash1(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}
function drawSky(ctx, W, H, horizonY, pal) {
  const height = Math.max(1, horizonY);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, pal.skyTop);
  gradient.addColorStop(0.54, pal.skyMid);
  gradient.addColorStop(1, pal.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, height);
  const spread = H * (0.09 + 0.07 * (1 - clamp013(pal.exposure)));
  const glow = ctx.createLinearGradient(0, horizonY - spread, 0, horizonY + H * 4e-3);
  glow.addColorStop(0, rgba(pal.horizonGlow, 0));
  glow.addColorStop(0.72, rgba(pal.horizonGlow, 0.3));
  glow.addColorStop(1, rgba(pal.horizonGlow, 0.16));
  ctx.fillStyle = glow;
  ctx.fillRect(0, Math.max(0, horizonY - spread), W, Math.min(H, spread + H * 4e-3));
  const hazeTop = Math.max(0, horizonY - spread * 0.62);
  ctx.fillStyle = rgba(pal.skyBottom, 0.16);
  ctx.fillRect(0, hazeTop, W, horizonY - hazeTop);
}
function drawStars(ctx, W, H, horizonY, pal, t) {
  const density = clamp013(pal.stars);
  if (density <= 0.01) return;
  const count = Math.round(density * 120);
  const tint = mix(pal.foam, "#ffffff", 0.65);
  const ceiling = Math.max(1, horizonY * 0.95);
  for (let i = 0; i < count; i += 1) {
    const hx = hash1(i * 1.731 + 0.37);
    const hy = hash1(i * 2.917 + 0.11);
    const x = hx * W;
    const y = hy * hy * ceiling;
    const size = 0.7 + hash1(i * 3.77) * 1.1;
    const twinkle = 0.55 + 0.45 * Math.sin(t * (0.6 + hx * 1.9) + i * 1.3);
    ctx.fillStyle = rgba(tint, clamp013(density * twinkle) * 0.85);
    ctx.fillRect(x, y, size, size);
  }
}
function drawSun(ctx, W, H, pal) {
  const sun = pal.sun;
  if (!sun) return;
  const alpha = clamp013(sun.alpha);
  if (alpha <= 0.02) return;
  const cx = clamp2(sun.x, -0.2, 1.2) * W;
  const cy = clamp2(sun.y, -0.2, 1.2) * H;
  const radius = Math.max(6, H * 0.028);
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 7);
  halo.addColorStop(0, rgba(pal.horizonGlow, 0.42 * alpha));
  halo.addColorStop(0.35, rgba(pal.horizonGlow, 0.13 * alpha));
  halo.addColorStop(1, rgba(pal.horizonGlow, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 7, 0, TAU2);
  ctx.fill();
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  core.addColorStop(0, rgba(sun.color, alpha));
  core.addColorStop(0.72, rgba(sun.color, alpha * 0.92));
  core.addColorStop(1, rgba(sun.color, alpha * 0.5));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU2);
  ctx.fill();
}
function drawMoon(ctx, W, H, pal) {
  const moon = pal.moon;
  if (!moon) return;
  const alpha = clamp013(moon.alpha);
  if (alpha <= 0.02) return;
  const cx = clamp2(moon.x, -0.2, 1.2) * W;
  const cy = clamp2(moon.y, -0.2, 1.2) * H;
  const radius = Math.max(5, H * 0.019);
  const phase = clamp013(num2(moon.phase, 0.5));
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius * 6);
  halo.addColorStop(0, rgba(moon.color, 0.26 * alpha));
  halo.addColorStop(0.4, rgba(moon.color, 0.08 * alpha));
  halo.addColorStop(1, rgba(moon.color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 6, 0, TAU2);
  ctx.fill();
  const waxing = phase < 0.5;
  const p = waxing ? phase : 1 - phase;
  const rx = Math.max(0.01, radius * Math.abs(Math.cos(TAU2 * p)));
  ctx.save();
  if (!waxing) {
    ctx.translate(cx * 2, 0);
    ctx.scale(-1, 1);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, Math.PI / 2, false);
  if (typeof ctx.ellipse === "function") {
    ctx.ellipse(cx, cy, rx, radius, 0, Math.PI / 2, -Math.PI / 2, p < 0.25);
  } else {
    ctx.lineTo(cx, cy + radius);
    ctx.lineTo(cx, cy - radius);
  }
  ctx.closePath();
  ctx.fillStyle = rgba(moon.color, alpha);
  ctx.fill();
  ctx.restore();
}
function farSeaNoise(u, t) {
  const w = TAU2 * L1.freq;
  return Math.sin(u * L1.spatial + t * w) * 0.5 + Math.sin(u * L1.spatial * 2.6 - t * w * 1.7 + 1.1) * 0.3 + Math.sin(u * L1.spatial * 5.4 + t * w * 2.9 + 2.3) * 0.2;
}
function drawFarSea(ctx, W, H, horizonY, pal, t, px) {
  const amp = lerp2(L1.ampMin, L1.ampMax, 0.5 + 0.5 * Math.sin(t * TAU2 * L1.freq)) * px;
  const step = Math.max(8, W / 80);
  const curve = (x) => horizonY - amp * (0.5 + 0.5 * farSeaNoise(x / Math.max(1, W) * TAU2, t));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, curve(0));
  for (let x = step; x < W + step; x += step) {
    const xx = Math.min(x, W);
    ctx.lineTo(xx, curve(xx));
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.clip();
  const gradient = ctx.createLinearGradient(0, horizonY - amp - 2, 0, H);
  const mirror = 0.45 + 0.25 * (1 - clamp013(pal.exposure));
  gradient.addColorStop(0, mix(pal.seaFar, pal.skyBottom, mirror));
  gradient.addColorStop(0.18, mix(pal.seaFar, pal.skyBottom, mirror * 0.45));
  gradient.addColorStop(0.42, mix(pal.seaFar, pal.seaMid, 0.85));
  gradient.addColorStop(0.7, pal.seaMid);
  gradient.addColorStop(1, mix(pal.seaNear, pal.seaMid, 0.15));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, horizonY - amp - 2, W, H - horizonY + amp + 4);
  ctx.restore();
  const fogAmount = clamp013(0.3 + 0.5 * (1 - clamp013(pal.exposure)));
  const fogHeight = H * (0.045 + 0.085 * (1 - clamp013(pal.exposure)));
  const fogColor = mix(pal.skyBottom, pal.horizonGlow, 0.45);
  const fog = ctx.createLinearGradient(0, horizonY - fogHeight * 0.45, 0, horizonY + fogHeight * 0.9);
  fog.addColorStop(0, rgba(fogColor, 0));
  fog.addColorStop(0.34, rgba(fogColor, 0.26 * fogAmount));
  fog.addColorStop(0.55, rgba(fogColor, 0.18 * fogAmount));
  fog.addColorStop(1, rgba(fogColor, 0));
  ctx.fillStyle = fog;
  ctx.fillRect(0, horizonY - fogHeight * 0.45, W, fogHeight * 1.35);
  ctx.beginPath();
  ctx.moveTo(0, curve(0));
  for (let x = step; x < W + step; x += step) {
    const xx = Math.min(x, W);
    ctx.lineTo(xx, curve(xx));
  }
  ctx.strokeStyle = rgba(mix(pal.seaFar, pal.foam, 0.3), 0.06 + 0.16 * clamp013(pal.exposure));
  ctx.lineWidth = Math.max(0.6, 1.1 * px);
  ctx.stroke();
}
function gradeOf(media) {
  if (!media || typeof media !== "object") return 0.55;
  const flat = media.grade !== void 0 ? media.grade : media.settings && media.settings.grade;
  return clamp013(num2(flat, 0.55));
}
function motionOf(media) {
  if (!media || typeof media !== "object") return 0.5;
  const flat = media.motion !== void 0 ? media.motion : media.settings && media.settings.motion;
  return clamp013(num2(flat, 0.5));
}
function hashString(text) {
  const source = typeof text === "string" ? text : "";
  let h = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}
function withComposite(ctx, op, paint) {
  const previous = ctx.globalCompositeOperation;
  try {
    ctx.globalCompositeOperation = op;
  } catch (_error) {
  }
  if (ctx.globalCompositeOperation !== op) ctx.globalCompositeOperation = "source-over";
  try {
    paint();
  } finally {
    ctx.globalCompositeOperation = previous || "source-over";
  }
}
function compositeFill(ctx, op, color, alpha, W, H) {
  const a = clamp013(alpha);
  if (a <= 3e-3) return;
  withComposite(ctx, op, () => {
    ctx.fillStyle = rgba(color, a);
    ctx.fillRect(0, 0, W, H);
  });
}
function drawMediaGrade(ctx, W, H, pal, grade) {
  const g = clamp013(grade);
  if (g <= 0.01) return;
  const exposure = clamp013(pal.exposure);
  const lowSun = 1 - exposure;
  const darkness = clamp013((0.95 - exposure) / 0.65);
  const tint = mix(pal.seaMid, pal.horizonGlow, clamp013(0.2 + 0.75 * lowSun));
  const shade = mix(tint, "#03060e", clamp013(0.4 + 0.55 * darkness));
  compositeFill(ctx, "multiply", shade, clamp013(g * (0.08 + 0.9 * darkness)), W, H);
  if (darkness > 0.2) compositeFill(ctx, "multiply", "#04070f", clamp013(g * 0.4 * (darkness - 0.2) / 0.8), W, H);
  compositeFill(ctx, "screen", mix(pal.horizonGlow, "#ffffff", 0.5), clamp013(g * (0.1 + 0.16 * exposure)), W, H);
  compositeFill(ctx, "soft-light", tint, clamp013(g * 0.55), W, H);
}
function drawMediaSkyMask(ctx, W, H, pal, grade) {
  const g = clamp013(grade);
  if (g <= 0.01) return;
  const bottom = H * MEDIA.skyMaskBottom;
  const shade = ctx.createLinearGradient(0, 0, 0, bottom);
  shade.addColorStop(0, rgba(mix("#ffffff", pal.skyTop, 0.62), 0.9 * g));
  shade.addColorStop(0.45, rgba(mix("#ffffff", pal.skyMid, 0.5), 0.72 * g));
  shade.addColorStop(1, rgba(mix("#ffffff", pal.skyBottom, 0.3), 0));
  withComposite(ctx, "multiply", () => {
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, bottom);
  });
  const veil = ctx.createLinearGradient(0, 0, 0, bottom);
  veil.addColorStop(0, rgba(pal.skyTop, 0.34 * g));
  veil.addColorStop(0.5, rgba(pal.skyMid, 0.2 * g));
  veil.addColorStop(1, rgba(pal.skyBottom, 0));
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, W, bottom);
}
function drawMediaSweep(ctx, W, H, pal, t, motion, grade) {
  const phase = (t * MEDIA.breathFreq % 1 + 1) % 1;
  const bandHeight = H * MEDIA.sweepHeight;
  const y = -bandHeight + phase * (H + bandHeight * 2);
  const strength = Math.sin(Math.PI * phase);
  const alpha = 0.05 * strength * (0.45 + 0.75 * clamp013(grade)) * (0.5 + 0.5 * clamp013(motion));
  if (alpha <= 4e-3) return;
  const sweep = ctx.createLinearGradient(0, y, 0, y + bandHeight);
  sweep.addColorStop(0, rgba(pal.foam, 0));
  sweep.addColorStop(0.5, rgba(mix(pal.horizonGlow, "#ffffff", 0.4), alpha));
  sweep.addColorStop(1, rgba(pal.foam, 0));
  withComposite(ctx, "screen", () => {
    ctx.fillStyle = sweep;
    ctx.fillRect(0, y, W, bandHeight);
  });
}
function drawVignette(ctx, W, H, strength) {
  const s = clamp013(strength);
  if (s <= 0.01) return;
  const gradient = ctx.createRadialGradient(W * 0.5, H * 0.46, Math.min(W, H) * 0.34, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, rgba("#000000", s));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}
function renderMediaScene(ctx, W, H, t, pal, asset, media, warmth) {
  const el = asset && asset.el;
  if (!el) return false;
  let iw = 0;
  let ih = 0;
  if (asset.kind === "video") {
    if (num2(el.readyState, 0) < 2) return false;
    iw = num2(el.videoWidth, 0);
    ih = num2(el.videoHeight, 0);
  } else {
    iw = num2(el.naturalWidth, num2(asset.w, 0));
    ih = num2(el.naturalHeight, num2(asset.h, 0));
  }
  if (!iw || !ih) return false;
  const motion = motionOf(media);
  const grade = gradeOf(media);
  const seed = clamp013(num2(asset.seed, 0));
  const phase = ((t / MEDIA.kenBurnsPeriod + seed) % 1 + 1) % 1;
  const ease = 0.5 - 0.5 * Math.cos(TAU2 * phase);
  const zoom = MEDIA.overscan + MEDIA.kenBurnsZoom * motion * (0.35 + 0.65 * ease);
  const scale = Math.max(W / iw, H / ih) * zoom;
  const dw = Math.max(W + 2, iw * scale);
  const dh = Math.max(H + 2, ih * scale);
  const marginX = Math.max(0, (dw - W) / 2);
  const marginY = Math.max(0, (dh - H) / 2);
  const panX = marginX * 0.8 * motion * Math.sin(TAU2 * phase + seed * TAU2);
  const panY = marginY * 0.5 * motion * Math.cos(TAU2 * phase * 0.71 + seed * 5.1);
  const breath = motion > 0.02 ? Math.sin(TAU2 * MEDIA.breathFreq * t) * MEDIA.breathPx * (0.4 + 0.6 * motion) : 0;
  const dx = (W - dw) / 2 + clamp2(panX + breath, -marginX, marginX);
  const dy = (H - dh) / 2 + clamp2(panY, -marginY, marginY);
  ctx.drawImage(el, dx, dy, dw, dh);
  drawMediaGrade(ctx, W, H, pal, grade);
  drawMediaSweep(ctx, W, H, pal, t, motion, grade);
  drawMediaSkyMask(ctx, W, H, pal, grade);
  drawVignette(ctx, W, H, MEDIA.vignette * (0.5 + 0.5 * grade));
  if (warmth) {
    ctx.fillStyle = rgba(warmth > 0 ? "#ffb066" : "#6fa8ff", Math.abs(warmth) * 0.9);
    ctx.fillRect(0, 0, W, H);
  }
  return true;
}
var lastRenderTime = 0;
var lazyWaterField = null;
function resolveField(field2) {
  if (field2) return field2;
  if (!lazyWaterField) {
    try {
      lazyWaterField = createWaterField(typeof document !== "undefined" ? document : void 0);
    } catch (_error) {
      lazyWaterField = null;
    }
  }
  return lazyWaterField;
}
function renderScene(ctx, W, H, t, pal, tideN, warmth, field2) {
  lastRenderTime = t;
  field2 = resolveField(field2);
  const px = clamp2(H / 720, 0.65, 1.8);
  const nearLift = tideN * H * 6e-3;
  const horizonY = H * HORIZON2 + nearLift;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = true;
  drawSky(ctx, W, H, horizonY, pal);
  drawStars(ctx, W, H, horizonY, pal, t);
  drawSun(ctx, W, H, pal);
  drawMoon(ctx, W, H, pal);
  let drawn = false;
  if (field2) {
    try {
      drawn = drawWater(ctx, { W, H, horizonY, t, pal, tideN }, field2);
    } catch (_error) {
      drawn = false;
    }
  }
  if (!drawn) {
    drawFarSea(ctx, W, H, horizonY, pal, t, px);
  }
  if (warmth) {
    ctx.fillStyle = rgba(warmth > 0 ? "#ffb066" : "#6fa8ff", Math.abs(warmth) * 0.9);
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}
var HOST_STYLE = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  overflow: "hidden",
  pointerEvents: "none",
  // 装饰层：点击/拖拽都留给覆盖层自己处理
  background: "#0b1220"
};
var CANVAS_STYLE = {
  display: "block",
  width: "100%",
  height: "100%",
  border: "none",
  background: "transparent"
};
function SeaCanvas({ now, media, form, paused, reducedMotion, onStats }) {
  const hostRef = (0, import_react.useRef)(null);
  const canvasRef = (0, import_react.useRef)(null);
  const nowRef = (0, import_react.useRef)(now);
  const mediaRef = (0, import_react.useRef)(media);
  const formRef = (0, import_react.useRef)(form);
  const pausedRef = (0, import_react.useRef)(Boolean(paused));
  const reducedRef = (0, import_react.useRef)(Boolean(reducedMotion));
  const statsRef = (0, import_react.useRef)(onStats);
  const apiRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    nowRef.current = now;
    const api = apiRef.current;
    if (api) api.refreshNow();
  }, [now]);
  (0, import_react.useEffect)(() => {
    mediaRef.current = media;
    const api = apiRef.current;
    if (api) api.setMedia(media);
  }, [media]);
  (0, import_react.useEffect)(() => {
    formRef.current = form;
  }, [form]);
  (0, import_react.useEffect)(() => {
    statsRef.current = onStats;
  }, [onStats]);
  (0, import_react.useEffect)(() => {
    pausedRef.current = Boolean(paused);
    const api = apiRef.current;
    if (api) api.sync();
  }, [paused]);
  (0, import_react.useEffect)(() => {
    reducedRef.current = Boolean(reducedMotion);
    const api = apiRef.current;
    if (api) api.sync();
  }, [reducedMotion]);
  (0, import_react.useEffect)(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return void 0;
    const perfNow = typeof performance !== "undefined" && typeof performance.now === "function" ? () => performance.now() : () => Date.now();
    const state = {
      alive: true,
      mode: "off",
      //            'anim' | 'static' | 'off'
      hidden: typeof document !== "undefined" ? document.hidden === true : false,
      blurred: false,
      ctx: null,
      w: 0,
      h: 0,
      dpr: 0,
      raf: 0,
      staticTimer: 0,
      resizeTimer: 0,
      clockMs: 0,
      clockAnchor: 0,
      lastDrawMs: 0,
      curSecond: -1,
      curCount: 0,
      seconds: [],
      fps: 0,
      degraded: false,
      mediaCap: false,
      //         媒体就绪 → 缓冲上限提到 2560
      staticStep: 0,
      // 水面斑块场的低分辨率高度场缓冲：挂载时建一次，整个生命周期复用。
      // 建不出来就是 null，renderScene 会退回 drawFarSea（简单的远景渐变），不会留白。
      field: (() => {
        try {
          return createWaterField(typeof document !== "undefined" ? document : void 0);
        } catch (_error) {
          return null;
        }
      })()
    };
    try {
      state.ctx = canvas.getContext("2d", { alpha: false });
    } catch (_error) {
      state.ctx = null;
    }
    if (!state.ctx) {
      try {
        state.ctx = canvas.getContext("2d");
      } catch (_error) {
        state.ctx = null;
      }
    }
    if (!state.ctx) {
      try {
        canvas.style.display = "none";
      } catch (_error) {
      }
    }
    const asset = { key: "", kind: null, el: null, ready: false, failed: false, w: 0, h: 0, seed: 0 };
    const bufferCap = () => state.mediaCap ? TUNING.mediaBufferWidth : TUNING.maxBufferWidth;
    function teardownAsset() {
      const el = asset.el;
      asset.el = null;
      asset.kind = null;
      asset.key = "";
      asset.ready = false;
      asset.failed = false;
      asset.w = 0;
      asset.h = 0;
      asset.seed = 0;
      if (!el) return;
      try {
        if (typeof el.pause === "function") el.pause();
      } catch (_error) {
      }
      try {
        if (typeof el.removeAttribute === "function") el.removeAttribute("src");
      } catch (_error) {
      }
      try {
        if (typeof el.load === "function") el.load();
      } catch (_error) {
      }
    }
    function setVideoPlaying(playing) {
      const el = asset.el;
      if (!el || asset.kind !== "video") return;
      try {
        if (playing) {
          const started = el.play();
          if (started && typeof started.catch === "function") started.catch(() => {
          });
        } else if (typeof el.pause === "function") {
          el.pause();
        }
      } catch (_error) {
      }
    }
    function onMediaReady() {
      state.mediaCap = true;
      measureNow();
      if (state.mode !== "anim") draw(perfNow());
    }
    function onMediaFailed() {
      state.mediaCap = false;
      measureNow();
    }
    function loadAsset(next) {
      teardownAsset();
      if (!next || typeof next !== "object") return;
      const kind = next.kind === "video" ? "video" : next.kind === "image" ? "image" : null;
      const url = typeof next.url === "string" ? next.url.trim() : "";
      if (!kind || !url) return;
      asset.key = kind + "|" + url;
      asset.kind = kind;
      asset.seed = hashString(asset.key);
      try {
        if (kind === "image") {
          const img = new Image();
          asset.el = img;
          img.onload = () => {
            if (asset.el !== img) return;
            const w = num2(img.naturalWidth, 0);
            const h = num2(img.naturalHeight, 0);
            if (!w || !h) {
              asset.failed = true;
              onMediaFailed();
              return;
            }
            asset.w = w;
            asset.h = h;
            asset.failed = false;
            asset.ready = true;
            onMediaReady();
          };
          img.onerror = () => {
            if (asset.el !== img) return;
            asset.ready = false;
            asset.failed = true;
            onMediaFailed();
          };
          try {
            img.decoding = "async";
          } catch (_error) {
          }
          img.src = url;
        } else {
          const video = document.createElement("video");
          asset.el = video;
          video.muted = true;
          video.loop = true;
          video.autoplay = true;
          video.preload = "auto";
          try {
            video.setAttribute("playsinline", "");
            video.setAttribute("webkit-playsinline", "");
            video.setAttribute("muted", "");
            video.setAttribute("disableremoteplayback", "");
          } catch (_error) {
          }
          const markReady = () => {
            if (asset.el !== video) return;
            const w = num2(video.videoWidth, 0);
            const h = num2(video.videoHeight, 0);
            if (!w || !h) return;
            asset.w = w;
            asset.h = h;
            asset.failed = false;
            asset.ready = true;
            onMediaReady();
          };
          try {
            video.addEventListener("loadeddata", markReady);
            video.addEventListener("canplay", markReady);
            video.addEventListener("error", () => {
              if (asset.el !== video) return;
              asset.ready = false;
              asset.failed = true;
              onMediaFailed();
            });
          } catch (_error) {
          }
          video.src = url;
          setVideoPlaying(true);
        }
      } catch (_error) {
        asset.ready = false;
        asset.failed = true;
        onMediaFailed();
      }
    }
    const requestFrame = typeof requestAnimationFrame === "function" ? (fn) => requestAnimationFrame(fn) : (fn) => setTimeout(() => fn(perfNow()), 16);
    const cancelFrame = typeof cancelAnimationFrame === "function" ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);
    const currentPalette = () => {
      try {
        return paletteFor(nowRef.current);
      } catch (_error) {
        return paletteFor(null);
      }
    };
    const tideNormalized = () => {
      const source = nowRef.current;
      const height = source && source.tide ? source.tide.height : 0;
      return clamp2(num2(height, 0) / 1.2, -1, 1);
    };
    const advanceClock = (ms) => {
      const nowMs = num2(ms, perfNow());
      if (!state.clockAnchor) state.clockAnchor = nowMs;
      const delta = nowMs - state.clockAnchor;
      state.clockAnchor = nowMs;
      state.clockMs += clamp2(delta, 0, TUNING.maxStepMs);
      return state.clockMs;
    };
    const animTime = (ms) => advanceClock(ms) / 1e3;
    const staticWarmth = () => state.staticStep % 2 === 0 ? 0.022 : -0.022;
    const paintFallback = (pal, ms) => {
      try {
        const breathe = 0.97 + 0.03 * Math.sin(num2(ms, perfNow()) / 1e3 * 0.35);
        const horizonTint = mix(pal.skyBottom, pal.foam, 0.5);
        host.style.background = "linear-gradient(180deg, " + pal.skyTop + " 0%, " + pal.skyMid + " 32%, " + pal.skyBottom + " 50%, " + horizonTint + " 52%, " + pal.seaFar + " 56%, " + pal.seaMid + " 76%, " + pal.seaNear + " 100%)";
        host.style.filter = "brightness(" + round2(breathe, 3) + ")";
      } catch (_error) {
      }
    };
    const draw = (ms) => {
      const pal = currentPalette();
      if (!state.ctx) {
        paintFallback(pal, ms);
        return;
      }
      if (!state.w || !state.h) return;
      const t = animTime(ms);
      const warmth = state.mode === "static" ? staticWarmth() : 0;
      if (asset.el) {
        let drewMedia = false;
        try {
          drewMedia = renderMediaScene(state.ctx, state.w, state.h, t, pal, asset, mediaRef.current, warmth);
        } catch (_error) {
          drewMedia = false;
        }
        if (drewMedia) return;
      }
      try {
        renderScene(state.ctx, state.w, state.h, t, pal, tideNormalized(), warmth, state.field);
      } catch (_error) {
        state.ctx = null;
        try {
          canvas.style.display = "none";
        } catch (_ignored) {
        }
        paintFallback(pal, ms);
      }
    };
    const reportStats = () => {
      const callback = statsRef.current;
      if (typeof callback !== "function") return;
      try {
        callback({ fps: state.fps, downgraded: state.degraded });
      } catch (_error) {
      }
    };
    const trackFps = (ms, targetFps) => {
      const second = Math.floor(ms / 1e3);
      if (second !== state.curSecond) {
        if (state.curSecond >= 0) {
          state.seconds.push(state.curCount);
          while (state.seconds.length > 3) state.seconds.shift();
        }
        state.curSecond = second;
        state.curCount = 0;
        const n = state.seconds.length;
        if (n > 0) {
          let sum = 0;
          for (const count of state.seconds) sum += count;
          const average = sum / n;
          state.fps = Math.round(average * 10) / 10;
          if (n >= 3 && !state.degraded && targetFps === TUNING.targetFps && average < TUNING.slowFps) {
            state.degraded = true;
            state.lastDrawMs = 0;
          }
          reportStats();
        }
      }
      state.curCount += 1;
    };
    const stopRaf = () => {
      if (state.raf) {
        try {
          cancelFrame(state.raf);
        } catch (_error) {
        }
        state.raf = 0;
      }
    };
    const clearStatic = () => {
      if (state.staticTimer) {
        clearTimeout(state.staticTimer);
        state.staticTimer = 0;
      }
    };
    function frame(ms) {
      state.raf = 0;
      if (!state.alive) return;
      const target = state.degraded ? TUNING.degradedFps : formRef.current === "pip" ? TUNING.pipFps : TUNING.targetFps;
      const interval = 1e3 / target;
      const gate = state.ctx ? interval : 900;
      if (state.lastDrawMs && ms - state.lastDrawMs < gate - 0.5) {
        scheduleFrame();
        return;
      }
      state.lastDrawMs = ms;
      draw(ms);
      if (state.ctx) trackFps(ms, target);
      if (num2(typeof window !== "undefined" ? window.devicePixelRatio : 1, 1) !== state.dpr) scheduleResize();
      scheduleFrame();
    }
    function scheduleFrame() {
      if (!state.alive || state.raf) return;
      state.raf = requestFrame(frame);
    }
    function scheduleStatic() {
      clearStatic();
      state.staticTimer = setTimeout(() => {
        state.staticTimer = 0;
        if (!state.alive || state.mode !== "static") return;
        state.staticStep += 1;
        draw(perfNow());
        scheduleStatic();
      }, TUNING.reducedRefreshMs);
    }
    function measureNow() {
      if (!state.alive) return;
      let rect = { width: 0, height: 0 };
      try {
        rect = host.getBoundingClientRect();
      } catch (_error) {
        rect = { width: 0, height: 0 };
      }
      const dpr = clamp2(num2(typeof window !== "undefined" ? window.devicePixelRatio : 1, 1), 1, 3);
      const cssWidth = Math.max(64, Math.round(num2(rect.width, 0) || host.clientWidth || 640));
      const cssHeight = Math.max(64, Math.round(num2(rect.height, 0) || host.clientHeight || 360));
      const rawWidth = cssWidth * dpr;
      const width = Math.max(160, Math.min(bufferCap(), Math.round(rawWidth)));
      const height = Math.max(90, Math.round(cssHeight * dpr * (width / rawWidth)));
      state.dpr = dpr;
      if (width === state.w && height === state.h) return;
      state.w = width;
      state.h = height;
      if (state.ctx) {
        try {
          canvas.width = width;
          canvas.height = height;
        } catch (_error) {
          state.ctx = null;
        }
      }
      state.lastDrawMs = 0;
      if (state.mode === "static") draw(perfNow());
    }
    function scheduleResize() {
      if (!state.alive) return;
      if (state.resizeTimer) clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(() => {
        state.resizeTimer = 0;
        measureNow();
      }, TUNING.resizeDebounceMs);
    }
    function applyMode() {
      if (!state.alive) return;
      const invisible = pausedRef.current || state.hidden || TUNING.stopOnBlur && state.blurred;
      const want = invisible ? "off" : reducedRef.current ? "static" : "anim";
      if (want === state.mode) return;
      const previous = state.mode;
      state.mode = want;
      if (want === "off") {
        stopRaf();
        clearStatic();
        setVideoPlaying(false);
        return;
      }
      if (previous === "off") state.clockAnchor = 0;
      if (want === "anim") {
        clearStatic();
        state.curSecond = -1;
        state.curCount = 0;
        state.seconds = [];
        state.lastDrawMs = 0;
        setVideoPlaying(true);
        scheduleFrame();
      } else {
        stopRaf();
        setVideoPlaying(false);
        draw(perfNow());
        scheduleStatic();
      }
    }
    function onVisibilityChange() {
      state.hidden = typeof document !== "undefined" && document.hidden === true;
      applyMode();
    }
    const onResize = () => scheduleResize();
    function onWindowBlur() {
      state.blurred = true;
      if (TUNING.stopOnBlur) applyMode();
    }
    function onWindowFocus() {
      state.blurred = false;
      if (TUNING.stopOnBlur) applyMode();
    }
    let resizeObserver = null;
    try {
      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(() => scheduleResize());
        resizeObserver.observe(host);
      }
    } catch (_error) {
      resizeObserver = null;
    }
    try {
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);
      if (typeof window !== "undefined") {
        window.addEventListener("resize", onResize);
        window.addEventListener("blur", onWindowBlur);
        window.addEventListener("focus", onWindowFocus);
      }
    } catch (_error) {
    }
    apiRef.current = {
      sync: applyMode,
      refreshNow: () => {
        if (state.mode === "static") draw(perfNow());
      },
      setMedia: (next) => {
        const kind = next && typeof next === "object" ? next.kind === "video" ? "video" : next.kind === "image" ? "image" : "" : "";
        const url = next && typeof next.url === "string" ? next.url.trim() : "";
        const key = kind && url ? kind + "|" + url : "";
        if (key === asset.key) return;
        loadAsset(next);
      }
    };
    apiRef.current.setMedia(mediaRef.current);
    measureNow();
    applyMode();
    return () => {
      state.alive = false;
      stopRaf();
      clearStatic();
      if (state.resizeTimer) {
        clearTimeout(state.resizeTimer);
        state.resizeTimer = 0;
      }
      try {
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
        if (typeof window !== "undefined") {
          window.removeEventListener("resize", onResize);
          window.removeEventListener("blur", onWindowBlur);
          window.removeEventListener("focus", onWindowFocus);
        }
      } catch (_error) {
      }
      try {
        if (resizeObserver && typeof resizeObserver.disconnect === "function") resizeObserver.disconnect();
      } catch (_error) {
      }
      resizeObserver = null;
      teardownAsset();
      apiRef.current = null;
      try {
        canvas.width = 0;
        canvas.height = 0;
      } catch (_error) {
      }
      try {
        host.style.background = "";
        host.style.filter = "";
      } catch (_error) {
      }
    };
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { ref: hostRef, style: HOST_STYLE, "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", { ref: canvasRef, style: CANVAS_STYLE }) });
}

// src/cities.js
var CITIES = Object.freeze(
  [
    { id: "shanghai", zh: "上海", en: "Shanghai", lat: 31.23, lon: 121.47, tz: "Asia/Shanghai" },
    { id: "beijing", zh: "北京", en: "Beijing", lat: 39.9, lon: 116.41, tz: "Asia/Shanghai" },
    { id: "guangzhou", zh: "广州", en: "Guangzhou", lat: 23.13, lon: 113.26, tz: "Asia/Shanghai" },
    { id: "shenzhen", zh: "深圳", en: "Shenzhen", lat: 22.54, lon: 114.06, tz: "Asia/Shanghai" },
    { id: "chengdu", zh: "成都", en: "Chengdu", lat: 30.57, lon: 104.07, tz: "Asia/Shanghai" },
    { id: "hangzhou", zh: "杭州", en: "Hangzhou", lat: 30.27, lon: 120.15, tz: "Asia/Shanghai" },
    { id: "nanjing", zh: "南京", en: "Nanjing", lat: 32.06, lon: 118.8, tz: "Asia/Shanghai" },
    { id: "wuhan", zh: "武汉", en: "Wuhan", lat: 30.59, lon: 114.31, tz: "Asia/Shanghai" },
    { id: "xian", zh: "西安", en: "Xi'an", lat: 34.34, lon: 108.94, tz: "Asia/Shanghai" },
    { id: "chongqing", zh: "重庆", en: "Chongqing", lat: 29.56, lon: 106.55, tz: "Asia/Shanghai" },
    { id: "qingdao", zh: "青岛", en: "Qingdao", lat: 36.07, lon: 120.38, tz: "Asia/Shanghai" },
    { id: "xiamen", zh: "厦门", en: "Xiamen", lat: 24.48, lon: 118.09, tz: "Asia/Shanghai" },
    { id: "harbin", zh: "哈尔滨", en: "Harbin", lat: 45.8, lon: 126.53, tz: "Asia/Shanghai" },
    { id: "kunming", zh: "昆明", en: "Kunming", lat: 25.04, lon: 102.71, tz: "Asia/Shanghai" },
    { id: "urumqi", zh: "乌鲁木齐", en: "Urumqi", lat: 43.83, lon: 87.62, tz: "Asia/Shanghai" },
    { id: "lhasa", zh: "拉萨", en: "Lhasa", lat: 29.65, lon: 91.14, tz: "Asia/Shanghai" },
    { id: "hongkong", zh: "香港", en: "Hong Kong", lat: 22.32, lon: 114.17, tz: "Asia/Hong_Kong" },
    { id: "macau", zh: "澳门", en: "Macau", lat: 22.2, lon: 113.54, tz: "Asia/Macau" },
    { id: "taipei", zh: "台北", en: "Taipei", lat: 25.03, lon: 121.57, tz: "Asia/Taipei" },
    { id: "tokyo", zh: "东京", en: "Tokyo", lat: 35.68, lon: 139.69, tz: "Asia/Tokyo" },
    { id: "osaka", zh: "大阪", en: "Osaka", lat: 34.69, lon: 135.5, tz: "Asia/Tokyo" },
    { id: "seoul", zh: "首尔", en: "Seoul", lat: 37.57, lon: 126.98, tz: "Asia/Seoul" },
    { id: "singapore", zh: "新加坡", en: "Singapore", lat: 1.35, lon: 103.82, tz: "Asia/Singapore" },
    { id: "bangkok", zh: "曼谷", en: "Bangkok", lat: 13.76, lon: 100.5, tz: "Asia/Bangkok" },
    { id: "hochiminh", zh: "胡志明市", en: "Ho Chi Minh City", lat: 10.82, lon: 106.63, tz: "Asia/Ho_Chi_Minh" },
    { id: "jakarta", zh: "雅加达", en: "Jakarta", lat: -6.21, lon: 106.85, tz: "Asia/Jakarta" },
    { id: "kualalumpur", zh: "吉隆坡", en: "Kuala Lumpur", lat: 3.14, lon: 101.69, tz: "Asia/Kuala_Lumpur" },
    { id: "manila", zh: "马尼拉", en: "Manila", lat: 14.6, lon: 120.98, tz: "Asia/Manila" },
    { id: "mumbai", zh: "孟买", en: "Mumbai", lat: 19.08, lon: 72.88, tz: "Asia/Kolkata" },
    { id: "delhi", zh: "新德里", en: "New Delhi", lat: 28.61, lon: 77.21, tz: "Asia/Kolkata" },
    { id: "dubai", zh: "迪拜", en: "Dubai", lat: 25.2, lon: 55.27, tz: "Asia/Dubai" },
    { id: "istanbul", zh: "伊斯坦布尔", en: "Istanbul", lat: 41.01, lon: 28.98, tz: "Europe/Istanbul" },
    { id: "moscow", zh: "莫斯科", en: "Moscow", lat: 55.76, lon: 37.62, tz: "Europe/Moscow" },
    { id: "athens", zh: "雅典", en: "Athens", lat: 37.98, lon: 23.73, tz: "Europe/Athens" },
    { id: "rome", zh: "罗马", en: "Rome", lat: 41.9, lon: 12.5, tz: "Europe/Rome" },
    { id: "berlin", zh: "柏林", en: "Berlin", lat: 52.52, lon: 13.4, tz: "Europe/Berlin" },
    { id: "paris", zh: "巴黎", en: "Paris", lat: 48.86, lon: 2.35, tz: "Europe/Paris" },
    { id: "madrid", zh: "马德里", en: "Madrid", lat: 40.42, lon: -3.7, tz: "Europe/Madrid" },
    { id: "lisbon", zh: "里斯本", en: "Lisbon", lat: 38.72, lon: -9.14, tz: "Europe/Lisbon" },
    { id: "amsterdam", zh: "阿姆斯特丹", en: "Amsterdam", lat: 52.37, lon: 4.9, tz: "Europe/Amsterdam" },
    { id: "london", zh: "伦敦", en: "London", lat: 51.51, lon: -0.13, tz: "Europe/London" },
    { id: "stockholm", zh: "斯德哥尔摩", en: "Stockholm", lat: 59.33, lon: 18.07, tz: "Europe/Stockholm" },
    { id: "oslo", zh: "奥斯陆", en: "Oslo", lat: 59.91, lon: 10.75, tz: "Europe/Oslo" },
    { id: "helsinki", zh: "赫尔辛基", en: "Helsinki", lat: 60.17, lon: 24.94, tz: "Europe/Helsinki" },
    { id: "reykjavik", zh: "雷克雅未克", en: "Reykjavik", lat: 64.15, lon: -21.94, tz: "Atlantic/Reykjavik" },
    { id: "tromso", zh: "特罗姆瑟", en: "Tromso", lat: 69.65, lon: 18.96, tz: "Europe/Oslo" },
    { id: "longyearbyen", zh: "朗伊尔城", en: "Longyearbyen", lat: 78.22, lon: 15.65, tz: "Arctic/Longyearbyen" },
    { id: "newyork", zh: "纽约", en: "New York", lat: 40.71, lon: -74.01, tz: "America/New_York" },
    { id: "losangeles", zh: "洛杉矶", en: "Los Angeles", lat: 34.05, lon: -118.24, tz: "America/Los_Angeles" },
    { id: "sanfrancisco", zh: "旧金山", en: "San Francisco", lat: 37.77, lon: -122.42, tz: "America/Los_Angeles" },
    { id: "seattle", zh: "西雅图", en: "Seattle", lat: 47.61, lon: -122.33, tz: "America/Los_Angeles" },
    { id: "chicago", zh: "芝加哥", en: "Chicago", lat: 41.88, lon: -87.63, tz: "America/Chicago" },
    { id: "denver", zh: "丹佛", en: "Denver", lat: 39.74, lon: -104.99, tz: "America/Denver" },
    { id: "anchorage", zh: "安克雷奇", en: "Anchorage", lat: 61.22, lon: -149.9, tz: "America/Anchorage" },
    { id: "toronto", zh: "多伦多", en: "Toronto", lat: 43.65, lon: -79.38, tz: "America/Toronto" },
    { id: "vancouver", zh: "温哥华", en: "Vancouver", lat: 49.28, lon: -123.12, tz: "America/Vancouver" },
    { id: "mexicocity", zh: "墨西哥城", en: "Mexico City", lat: 19.43, lon: -99.13, tz: "America/Mexico_City" },
    { id: "bogota", zh: "波哥大", en: "Bogota", lat: 4.71, lon: -74.07, tz: "America/Bogota" },
    { id: "lima", zh: "利马", en: "Lima", lat: -12.05, lon: -77.04, tz: "America/Lima" },
    { id: "saopaulo", zh: "圣保罗", en: "Sao Paulo", lat: -23.55, lon: -46.63, tz: "America/Sao_Paulo" },
    { id: "buenosaires", zh: "布宜诺斯艾利斯", en: "Buenos Aires", lat: -34.6, lon: -58.38, tz: "America/Argentina/Buenos_Aires" },
    { id: "santiago", zh: "圣地亚哥", en: "Santiago", lat: -33.45, lon: -70.67, tz: "America/Santiago" },
    { id: "cairo", zh: "开罗", en: "Cairo", lat: 30.04, lon: 31.24, tz: "Africa/Cairo" },
    { id: "nairobi", zh: "内罗毕", en: "Nairobi", lat: -1.29, lon: 36.82, tz: "Africa/Nairobi" },
    { id: "lagos", zh: "拉各斯", en: "Lagos", lat: 6.52, lon: 3.38, tz: "Africa/Lagos" },
    { id: "capetown", zh: "开普敦", en: "Cape Town", lat: -33.92, lon: 18.42, tz: "Africa/Johannesburg" },
    { id: "sydney", zh: "悉尼", en: "Sydney", lat: -33.87, lon: 151.21, tz: "Australia/Sydney" },
    { id: "melbourne", zh: "墨尔本", en: "Melbourne", lat: -37.81, lon: 144.96, tz: "Australia/Melbourne" },
    { id: "brisbane", zh: "布里斯班", en: "Brisbane", lat: -27.47, lon: 153.03, tz: "Australia/Brisbane" },
    { id: "perth", zh: "珀斯", en: "Perth", lat: -31.95, lon: 115.86, tz: "Australia/Perth" },
    { id: "auckland", zh: "奥克兰", en: "Auckland", lat: -36.85, lon: 174.76, tz: "Pacific/Auckland" },
    { id: "wellington", zh: "惠灵顿", en: "Wellington", lat: -41.29, lon: 174.78, tz: "Pacific/Auckland" },
    { id: "honolulu", zh: "檀香山", en: "Honolulu", lat: 21.31, lon: -157.86, tz: "Pacific/Honolulu" }
  ].map(Object.freeze)
);
var FALLBACK_CITY = CITIES[0];
var REGION_CITY = Object.freeze({
  CN: "shanghai",
  TW: "taipei",
  HK: "hongkong",
  MO: "macau",
  JP: "tokyo",
  KR: "seoul",
  SG: "singapore",
  TH: "bangkok",
  VN: "hochiminh",
  ID: "jakarta",
  MY: "kualalumpur",
  PH: "manila",
  IN: "mumbai",
  AE: "dubai",
  TR: "istanbul",
  RU: "moscow",
  GR: "athens",
  IT: "rome",
  DE: "berlin",
  FR: "paris",
  ES: "madrid",
  PT: "lisbon",
  NL: "amsterdam",
  GB: "london",
  SE: "stockholm",
  NO: "oslo",
  FI: "helsinki",
  IS: "reykjavik",
  US: "newyork",
  CA: "toronto",
  MX: "mexicocity",
  BR: "saopaulo",
  AR: "buenosaires",
  CL: "santiago",
  CO: "bogota",
  PE: "lima",
  EG: "cairo",
  KE: "nairobi",
  NG: "lagos",
  ZA: "capetown",
  AU: "sydney",
  NZ: "auckland"
});
function findCity(id) {
  if (typeof id !== "string") return void 0;
  const key = id.trim().toLowerCase();
  if (!key) return void 0;
  return CITIES.find(
    (c) => c.id === key || c.zh === id.trim() || c.en.toLowerCase() === key
  );
}

// src/client/format.js
function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(Number(ms) / 1e3) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
function formatClock(date, tz) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz || void 0
    }).format(date);
  } catch {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
}

// src/client/overlay.jsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var Guarded = class extends import_react2.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.warn("[dsh-intertidal] 覆盖层渲染失败：", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "it-error", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: this.props.label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "it-btn", onClick: () => this.setState({ failed: false }), children: this.props.closeLabel })
    ] });
  }
};
function isEditableTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tag = String(target.tagName ?? "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return target.isContentEditable === true;
}
function placeName(location, lang) {
  if (!location) return "";
  const city = findCity?.(location.city);
  if (city) return lang === "en" ? city.en : city.zh;
  return location.city || "";
}
function useRuntime(runtime) {
  const [snapshot, setSnapshot] = (0, import_react2.useState)(() => runtime.getState());
  (0, import_react2.useEffect)(() => runtime.subscribe(setSnapshot), [runtime]);
  return snapshot;
}
function usePipDrag(runtime, form, enabled) {
  const ref = (0, import_react2.useRef)(null);
  const [dragging, setDragging] = (0, import_react2.useState)(false);
  const drag = (0, import_react2.useRef)(null);
  const onPointerDown = (0, import_react2.useCallback)((event) => {
    if (!enabled || form !== "pip") return;
    if (event.target?.closest?.(".it-btn")) return;
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, w: rect.width, h: rect.height };
    node.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }, [enabled, form]);
  const onPointerMove = (0, import_react2.useCallback)((event) => {
    const info = drag.current;
    const node = ref.current;
    if (!info || !node) return;
    const left = Math.min(Math.max(0, event.clientX - info.dx), window.innerWidth - info.w);
    const top = Math.min(Math.max(0, event.clientY - info.dy), window.innerHeight - info.h);
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.style.right = "auto";
    node.style.bottom = "auto";
  }, []);
  const onPointerUp = (0, import_react2.useCallback)((event) => {
    const node = ref.current;
    if (!drag.current || !node) return;
    drag.current = null;
    setDragging(false);
    node.releasePointerCapture?.(event.pointerId);
    const rect = node.getBoundingClientRect();
    const gap = 24;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const left = centerX < window.innerWidth / 2 ? gap : window.innerWidth - rect.width - gap;
    const top = centerY < window.innerHeight / 2 ? gap : window.innerHeight - rect.height - gap;
    node.style.left = `${Math.max(gap, left)}px`;
    node.style.top = `${Math.max(gap, top)}px`;
    node.style.right = "auto";
    node.style.bottom = "auto";
  }, []);
  return { ref, dragging, onPointerDown, onPointerMove, onPointerUp };
}
function Overlay({ runtime, t = (k) => k, getLang = () => "zh", subscribeLang }) {
  const snapshot = useRuntime(runtime);
  const lang = typeof getLang === "function" ? getLang() : "zh";
  const [, bumpLang] = (0, import_react2.useState)(0);
  (0, import_react2.useEffect)(() => {
    if (typeof subscribeLang !== "function") return void 0;
    const unsub = subscribeLang(() => bumpLang((value) => value + 1));
    return () => unsub?.();
  }, [subscribeLang]);
  const { form, exiting, settings, sky, paused } = snapshot;
  const visible = form !== "hidden";
  const drag = usePipDrag(runtime, form, visible);
  (0, import_react2.useEffect)(() => {
    if (!visible) return void 0;
    const onKeyDown = (event) => {
      if (event.defaultPrevented) return;
      const key = event.key;
      const editable = isEditableTarget(event.target);
      if (key === "Escape") {
        event.preventDefault();
        runtime.hide("manual");
        return;
      }
      if (editable) return;
      if (key === "c" || key === "C") {
        event.preventDefault();
        runtime.toggleForm();
      } else if (key === " " || key === "Spacebar") {
        event.preventDefault();
        runtime.togglePause();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [runtime, visible]);
  (0, import_react2.useEffect)(() => {
    const node = drag.ref.current;
    if (!node || form !== "full" || drag.dragging) return;
    node.style.left = "";
    node.style.top = "";
    node.style.right = "";
    node.style.bottom = "";
  }, [form, drag.dragging, drag.ref]);
  const caption = (0, import_react2.useMemo)(() => {
    if (!settings?.caption) return "";
    const when = formatClock(/* @__PURE__ */ new Date(), settings?.location?.tz);
    const where = placeName(settings?.location, lang);
    const phase = t(`phase.${sky?.phase ?? "afternoon"}`);
    return [t("panel.caption"), where, `${when} · ${phase}`].filter(Boolean).join(" · ");
  }, [settings?.caption, settings?.location?.city, settings?.location?.tz, sky?.phase, lang, t]);
  if (!visible) return null;
  const exitingAttr = exiting ? exiting.kind === "pip" || form === "pip" ? "pip" : "1" : "0";
  const dialogLabel = exiting ? "closing" : "open";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Guarded, { label: t("panel.crashed"), closeLabel: t("action.close"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      ref: drag.ref,
      className: "it-root",
      "data-form": form,
      "data-exit": exitingAttr,
      "data-dragging": drag.dragging ? "1" : "0",
      role: "region",
      "aria-label": t("panel.title"),
      "data-state": dialogLabel,
      onPointerDown: drag.onPointerDown,
      onPointerMove: drag.onPointerMove,
      onPointerUp: drag.onPointerUp,
      onPointerCancel: drag.onPointerUp,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "it-canvas-holder", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          SeaCanvas,
          {
            now: sky,
            media: snapshot.media,
            form,
            paused,
            reducedMotion: runtime.reducedMotion,
            onStats: (stats) => runtime.reportStats(stats)
          }
        ) }),
        caption ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "it-caption", children: caption }) : null,
        snapshot.note ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "it-toast", children: t(snapshot.note) }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "it-controls", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "span",
            {
              className: "it-countdown",
              "data-paused": paused ? "1" : "0",
              title: paused ? t("panel.paused") : t("panel.remaining"),
              "aria-label": paused ? t("panel.paused") : t("panel.remaining"),
              children: formatRemaining(snapshot.remainingMs)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "it-btnbar", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: "it-btn",
                "data-icon": "1",
                title: paused ? t("action.resume") : t("action.pause"),
                "aria-label": paused ? t("action.resume") : t("action.pause"),
                onClick: () => runtime.togglePause(),
                children: paused ? "▶" : "❚❚"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: "it-btn",
                "data-icon": "1",
                title: form === "full" ? t("action.pip") : t("action.expand"),
                "aria-label": form === "full" ? t("action.pip") : t("action.expand"),
                onClick: () => runtime.toggleForm(),
                children: form === "full" ? "⤡" : "⤢"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: "it-btn",
                "data-icon": "1",
                title: t("action.close"),
                "aria-label": t("action.close"),
                onClick: () => runtime.hide("manual"),
                children: "✕"
              }
            )
          ] })
        ] })
      ]
    }
  ) });
}

// src/client/settings-panel.jsx
var import_react3 = require("react");

// src/settings.js
var HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
var DEFAULTS = Object.freeze({
  auto: true,
  intervalMinutes: 120,
  durationSeconds: 180,
  firstDelayMinutes: 20,
  quietHours: Object.freeze({ enabled: true, start: "23:00", end: "07:00" }),
  deferOnTyping: true,
  manualExtends: true,
  form: "full",
  rememberForm: true,
  caption: true,
  location: Object.freeze({
    city: "shanghai",
    lat: 31.23,
    lon: 121.47,
    tz: "Asia/Shanghai"
  }),
  sound: Object.freeze({ enabled: false, volume: 0.35 }),
  /** v2：真实素材（图片/视频）替代程序化海；'off' 时仍用程序化海。 */
  media: Object.freeze({
    mode: "off",
    dir: "",
    urls: Object.freeze([]),
    grade: 0.55,
    motion: 0.5,
    shuffle: true
  }),
  reducedMotion: "auto"
});
var LIMITS = Object.freeze({
  intervalMinutes: Object.freeze([15, 480]),
  durationSeconds: Object.freeze([30, 1800]),
  firstDelayMinutes: Object.freeze([0, 120]),
  volume: Object.freeze([0, 1]),
  grade: Object.freeze([0, 1]),
  motion: Object.freeze([0, 1])
});
var FORMS = Object.freeze(["full", "pip"]);
var REDUCED_MOTION = Object.freeze(["auto", "on", "off"]);
var MEDIA_MODES = Object.freeze(["off", "dir", "url"]);
var MAX_MEDIA_URLS = 8;
var MEDIA_URL_RE = /^https?:\/\/[^\s]+$/i;
var ABS_PATH_RE = /^(\/|[A-Za-z]:[\\/])/;
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clone(v);
    return out;
  }
  return value;
}
var isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var field = (obj, key) => isPlainObject(obj) ? obj[key] : void 0;
function boolOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function numberIn(value, lo, hi, fallback) {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return n < lo ? lo : n > hi ? hi : n;
}
function intIn(value, lo, hi, fallback) {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  return rounded < lo ? lo : rounded > hi ? hi : rounded;
}
function timeOr(value, fallback) {
  if (typeof value !== "string") return fallback;
  return HHMM_RE.test(value.trim()) ? value.trim() : fallback;
}
function isValidTimeZone(tz) {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}
function oneOf(value, allowed, fallback) {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}
function locationDefaults(inputCity) {
  const known = findCity(inputCity) ?? findCity(DEFAULTS.location.city);
  return known ? { city: known.id, lat: known.lat, lon: known.lon, tz: known.tz } : clone(DEFAULTS.location);
}
function sanitizeSettings(input) {
  const src = isPlainObject(input) ? input : {};
  const rawLocation = field(src, "location");
  const locDefaults = locationDefaults(field(rawLocation, "city"));
  const rawCity = field(rawLocation, "city");
  const matchedCity = typeof rawCity === "string" ? findCity(rawCity) : void 0;
  const city = matchedCity?.id ?? (typeof rawCity === "string" && rawCity.trim() ? rawCity.trim() : DEFAULTS.location.city);
  const quiet = field(src, "quietHours");
  const sound = field(src, "sound");
  const media = field(src, "media");
  return {
    auto: boolOr(field(src, "auto"), DEFAULTS.auto),
    intervalMinutes: intIn(
      field(src, "intervalMinutes"),
      LIMITS.intervalMinutes[0],
      LIMITS.intervalMinutes[1],
      DEFAULTS.intervalMinutes
    ),
    durationSeconds: intIn(
      field(src, "durationSeconds"),
      LIMITS.durationSeconds[0],
      LIMITS.durationSeconds[1],
      DEFAULTS.durationSeconds
    ),
    firstDelayMinutes: intIn(
      field(src, "firstDelayMinutes"),
      LIMITS.firstDelayMinutes[0],
      LIMITS.firstDelayMinutes[1],
      DEFAULTS.firstDelayMinutes
    ),
    quietHours: {
      enabled: boolOr(field(quiet, "enabled"), DEFAULTS.quietHours.enabled),
      start: timeOr(field(quiet, "start"), DEFAULTS.quietHours.start),
      end: timeOr(field(quiet, "end"), DEFAULTS.quietHours.end)
    },
    deferOnTyping: boolOr(field(src, "deferOnTyping"), DEFAULTS.deferOnTyping),
    manualExtends: boolOr(field(src, "manualExtends"), DEFAULTS.manualExtends),
    form: oneOf(field(src, "form"), FORMS, DEFAULTS.form),
    rememberForm: boolOr(field(src, "rememberForm"), DEFAULTS.rememberForm),
    caption: boolOr(field(src, "caption"), DEFAULTS.caption),
    location: {
      city,
      lat: numberIn(field(rawLocation, "lat"), -90, 90, locDefaults.lat),
      lon: numberIn(field(rawLocation, "lon"), -180, 180, locDefaults.lon),
      tz: isValidTimeZone(field(rawLocation, "tz")) ? field(rawLocation, "tz").trim() : locDefaults.tz
    },
    sound: {
      enabled: boolOr(field(sound, "enabled"), DEFAULTS.sound.enabled),
      volume: numberIn(
        field(sound, "volume"),
        LIMITS.volume[0],
        LIMITS.volume[1],
        DEFAULTS.sound.volume
      )
    },
    media: {
      mode: oneOf(field(media, "mode"), MEDIA_MODES, DEFAULTS.media.mode),
      // 目录必须是绝对路径；写相对路径就没法在宿主侧做围栏，直接退回空
      dir: absPathOr(field(media, "dir"), DEFAULTS.media.dir),
      urls: urlListOr(field(media, "urls"), DEFAULTS.media.urls),
      grade: numberIn(field(media, "grade"), LIMITS.grade[0], LIMITS.grade[1], DEFAULTS.media.grade),
      motion: numberIn(field(media, "motion"), LIMITS.motion[0], LIMITS.motion[1], DEFAULTS.media.motion),
      shuffle: boolOr(field(media, "shuffle"), DEFAULTS.media.shuffle)
    },
    reducedMotion: oneOf(field(src, "reducedMotion"), REDUCED_MOTION, DEFAULTS.reducedMotion)
  };
}
function absPathOr(value, fallback) {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  if (!text) return fallback;
  return ABS_PATH_RE.test(text) ? text : fallback;
}
function urlListOr(value, fallback) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,]+/) : [];
  const out = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    if (!text || !MEDIA_URL_RE.test(text)) continue;
    if (out.includes(text)) continue;
    out.push(text);
    if (out.length >= MAX_MEDIA_URLS) break;
  }
  return out.length ? out : [...fallback];
}
function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return patch === void 0 ? clone(base) : clone(patch);
  const out = isPlainObject(base) ? clone(base) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === void 0) continue;
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : clone(value);
  }
  return out;
}
function mergeSettings(base, patch) {
  const merged = deepMerge(deepMerge(DEFAULTS, base), patch);
  return sanitizeSettings(merged);
}
var RHYTHM_EVENTS = Object.freeze(["shown", "hidden", "skip-today", "manual-open"]);

// src/client/settings-panel.jsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function Row({ label, hint, children, stack = false }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "it-row", "data-stack": stack ? "1" : "0", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "it-row-label", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: label }),
      hint ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { children: hint }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "it-row-control", children })
  ] });
}
function Switch({ checked, onChange, label }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "button",
    {
      type: "button",
      className: "it-switch",
      role: "switch",
      "aria-checked": checked ? "true" : "false",
      "aria-label": label,
      onClick: () => onChange(!checked)
    }
  );
}
var DURATIONS = [60, 180, 300, 600];
var INTERVALS = [15, 30, 60, 90, 120, 180, 240, 360, 480];
function SettingsPanel({ runtime, t = (k) => k, getLang = () => "zh", subscribeLang, pickDirectory }) {
  const [state, setState] = (0, import_react3.useState)(() => runtime.getState());
  const lang = typeof getLang === "function" ? getLang() : "zh";
  const [, bumpLang] = (0, import_react3.useState)(0);
  (0, import_react3.useEffect)(() => {
    if (typeof subscribeLang !== "function") return void 0;
    const unsub = subscribeLang(() => bumpLang((value) => value + 1));
    return () => unsub?.();
  }, [subscribeLang]);
  const [custom, setCustom] = (0, import_react3.useState)(false);
  const [scan, setScan] = (0, import_react3.useState)(null);
  const [fetchNote, setFetchNote] = (0, import_react3.useState)(null);
  (0, import_react3.useEffect)(() => runtime.subscribe(setState), [runtime]);
  const settings = state.settings ?? DEFAULTS;
  const save = (patch) => void runtime.saveSettings(patch);
  const cityName = (city) => lang === "en" ? city.en : city.zh;
  const nextText = (() => {
    if (!settings.auto) return t("settings.next.off");
    const due = state.nextDueMs;
    if (!due) return "—";
    const diff = due - Date.now();
    if (diff <= 0) return t("settings.next.soon");
    const mins = Math.round(diff / 6e4);
    return mins >= 60 ? `${Math.round(mins / 60)} ${lang === "en" ? "h" : "小时"}` : `${mins} ${t("unit.minutes")}`;
  })();
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "it-settings", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "it-group", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h4", { children: t("settings.group.rhythm") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.auto"), hint: t("settings.auto.hint"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Switch, { checked: settings.auto, label: t("settings.auto"), onChange: (value) => save({ auto: value }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.interval"), hint: t("settings.interval.hint"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "select",
        {
          value: settings.intervalMinutes,
          onChange: (event) => save({ intervalMinutes: Number(event.target.value) }),
          children: INTERVALS.map((minutes) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: minutes, children: [
            minutes,
            " ",
            t("unit.minutes")
          ] }, minutes))
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Row, { label: t("settings.duration"), stack: true, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "select",
          {
            value: DURATIONS.includes(settings.durationSeconds) ? settings.durationSeconds : "custom",
            onChange: (event) => {
              if (event.target.value === "custom") return;
              save({ durationSeconds: Number(event.target.value) });
            },
            children: [
              DURATIONS.map((seconds) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: seconds, children: seconds >= 60 ? `${seconds / 60} ${t("unit.minutes")}` : `${seconds} ${t("unit.seconds")}` }, seconds)),
              DURATIONS.includes(settings.durationSeconds) ? null : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: "custom", children: [
                settings.durationSeconds,
                " ",
                t("unit.seconds")
              ] })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "number",
            min: 30,
            max: 1800,
            step: 10,
            className: "it-field-sm",
            value: settings.durationSeconds,
            onChange: (event) => save({ durationSeconds: Number(event.target.value) })
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.firstDelay"), hint: t("settings.firstDelay.hint"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "input",
        {
          type: "number",
          min: 0,
          max: 120,
          step: 5,
          className: "it-field-sm",
          value: settings.firstDelayMinutes,
          onChange: (event) => save({ firstDelayMinutes: Number(event.target.value) })
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Row, { label: t("settings.quiet"), hint: t("settings.quiet.hint"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          Switch,
          {
            checked: settings.quietHours.enabled,
            label: t("settings.quiet"),
            onChange: (value) => save({ quietHours: { ...settings.quietHours, enabled: value } })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "time",
            value: settings.quietHours.start,
            onChange: (event) => save({ quietHours: { ...settings.quietHours, start: event.target.value } })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { opacity: 0.5 }, children: "–" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "time",
            value: settings.quietHours.end,
            onChange: (event) => save({ quietHours: { ...settings.quietHours, end: event.target.value } })
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.deferTyping"), hint: t("settings.deferTyping.hint"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        Switch,
        {
          checked: settings.deferOnTyping,
          label: t("settings.deferTyping"),
          onChange: (value) => save({ deferOnTyping: value })
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.manualExtends"), hint: t("settings.manualExtends.hint"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        Switch,
        {
          checked: settings.manualExtends,
          label: t("settings.manualExtends"),
          onChange: (value) => save({ manualExtends: value })
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.next"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "it-hint", children: nextText }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "it-group", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h4", { children: t("settings.group.form") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.form"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("select", { value: settings.form, onChange: (event) => save({ form: event.target.value }), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "full", children: t("settings.form.full") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "pip", children: t("settings.form.pip") })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.rememberForm"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        Switch,
        {
          checked: settings.rememberForm,
          label: t("settings.rememberForm"),
          onChange: (value) => save({ rememberForm: value })
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.caption"), hint: t("settings.caption.hint"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Switch, { checked: settings.caption, label: t("settings.caption"), onChange: (value) => save({ caption: value }) }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "it-group", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h4", { children: t("settings.group.media") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.media.mode"), hint: t("settings.media.hint"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "select",
        {
          value: settings.media.mode,
          onChange: (event) => save({ media: { ...settings.media, mode: event.target.value } }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "off", children: t("settings.media.off") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "dir", children: t("settings.media.dir") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "url", children: t("settings.media.url") })
          ]
        }
      ) }),
      settings.media.mode === "dir" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Row, { label: t("settings.media.dir"), hint: t("settings.media.dir.hint"), stack: true, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              type: "text",
              className: "it-field",
              placeholder: "/Users/you/Pictures/sea",
              value: settings.media.dir,
              onChange: (event) => save({ media: { ...settings.media, dir: event.target.value } })
            }
          ),
          typeof pickDirectory === "function" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: "it-action",
              onClick: async () => {
                try {
                  const picked = await pickDirectory();
                  if (typeof picked === "string" && picked) {
                    save({ media: { ...settings.media, dir: picked } });
                    const res = await runtime.scanMedia(picked);
                    setScan(res?.ok ? res.value : { ok: false });
                  }
                } catch {
                  setScan({ ok: false });
                }
              },
              children: t("settings.media.pick")
            }
          ) : null,
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: "it-action",
              onClick: async () => {
                const res = await runtime.scanMedia(settings.media.dir);
                setScan(res?.ok ? res.value : { ok: false });
              },
              children: t("settings.media.scan")
            }
          )
        ] }),
        scan ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "it-hint it-row-note", style: { paddingBottom: 6 }, children: scan.ok ? scan.count > 0 ? `${t("settings.media.scanOk")}：${scan.count}（${scan.images} / ${scan.videos}）` : t("settings.media.scanEmpty") : t("settings.media.scanFail") }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.media.shuffle"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          Switch,
          {
            checked: settings.media.shuffle,
            label: t("settings.media.shuffle"),
            onChange: (value) => save({ media: { ...settings.media, shuffle: value } })
          }
        ) })
      ] }) : null,
      settings.media.mode === "url" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.media.urls"), hint: t("settings.media.urls.hint"), stack: true, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "textarea",
          {
            rows: 4,
            className: "it-field",
            value: settings.media.urls.join("\n"),
            onChange: (event) => save({ media: { ...settings.media, urls: event.target.value.split("\n") } })
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Row, { label: t("settings.media.fetch"), children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: "it-action",
              onClick: async () => {
                setFetchNote(null);
                const urls = settings.media.urls.slice(0, 8);
                let ok = 0;
                for (const url of urls) {
                  const res = await runtime.resolveMedia(url);
                  if (res?.ok && res.value?.item) ok += 1;
                }
                setFetchNote(ok > 0 ? t("settings.media.fetchOk") : t("settings.media.fetchFail"));
              },
              children: t("settings.media.fetch")
            }
          ),
          fetchNote ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "it-hint", children: fetchNote }) : null
        ] })
      ] }) : null,
      settings.media.mode !== "off" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.media.grade"), hint: t("settings.media.grade.hint"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "range",
            min: 0,
            max: 1,
            step: 0.05,
            value: settings.media.grade,
            "aria-label": t("settings.media.grade"),
            onChange: (event) => save({ media: { ...settings.media, grade: Number(event.target.value) } })
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.media.motion"), hint: t("settings.media.motion.hint"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "range",
            min: 0,
            max: 1,
            step: 0.05,
            value: settings.media.motion,
            "aria-label": t("settings.media.motion"),
            onChange: (event) => save({ media: { ...settings.media, motion: Number(event.target.value) } })
          }
        ) })
      ] }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "it-group", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h4", { children: t("settings.group.place") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.city"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "select",
        {
          value: custom ? "__custom__" : settings.location.city,
          onChange: (event) => {
            if (event.target.value === "__custom__") {
              setCustom(true);
              return;
            }
            setCustom(false);
            const city = CITIES.find((item) => item.id === event.target.value);
            if (!city) return;
            save({ location: { city: city.id, lat: city.lat, lon: city.lon, tz: city.tz } });
          },
          children: [
            CITIES.map((city) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: city.id, children: cityName(city) }, city.id)),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "__custom__", children: t("settings.city.custom") })
          ]
        }
      ) }),
      custom ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Row, { label: t("settings.city.custom"), stack: true, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "number",
            step: "0.01",
            className: "it-field-sm",
            value: settings.location.lat,
            "aria-label": t("settings.lat"),
            onChange: (event) => save({ location: { ...settings.location, lat: Number(event.target.value) } })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "number",
            step: "0.01",
            className: "it-field-sm",
            value: settings.location.lon,
            "aria-label": t("settings.lon"),
            onChange: (event) => save({ location: { ...settings.location, lon: Number(event.target.value) } })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "text",
            className: "it-field",
            value: settings.location.tz,
            "aria-label": t("settings.tz"),
            onChange: (event) => save({ location: { ...settings.location, tz: event.target.value } })
          }
        )
      ] }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "it-group", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h4", { children: t("settings.group.sound") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Row, { label: t("settings.sound"), hint: t("settings.sound.hint"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          Switch,
          {
            checked: settings.sound.enabled,
            label: t("settings.sound"),
            onChange: (value) => {
              if (value) runtime.unlockSound();
              save({ sound: { ...settings.sound, enabled: value } });
              if (!value) runtime.getState().sound?.disable?.();
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "input",
          {
            type: "range",
            min: 0,
            max: 1,
            step: 0.01,
            value: settings.sound.volume,
            "aria-label": t("settings.volume"),
            onChange: (event) => save({ sound: { ...settings.sound, volume: Number(event.target.value) } })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "it-group", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h4", { children: t("settings.group.access") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Row, { label: t("settings.reducedMotion"), hint: t("settings.reducedMotion.hint"), children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "select",
        {
          value: settings.reducedMotion,
          onChange: (event) => save({ reducedMotion: event.target.value }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "auto", children: t("settings.reducedMotion.auto") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "on", children: t("settings.reducedMotion.on") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "off", children: t("settings.reducedMotion.off") })
          ]
        }
      ) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "it-group", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "it-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "it-action", "data-primary": "1", onClick: () => runtime.show("manual"), children: t("action.preview") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", className: "it-action", onClick: () => void runtime.skipToday(), children: t("action.skip") })
      ] }),
      state.offline ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "it-warn", children: t("hint.offline") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "it-hint", children: [
        t("hint.keys"),
        " · ",
        t("settings.stateFile"),
        ": ~/.dsh/intertidal/state.json"
      ] })
    ] })
  ] });
}

// src/client/api.js
var BASE2 = "/intertidal";
var MIRROR_KEY = "dsh-intertidal:settings";
var TIMEOUT_MS = 4e3;
function readMirror(storage = safeStorage()) {
  try {
    const raw = storage?.getItem(MIRROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
function writeMirror(settings, storage = safeStorage()) {
  try {
    storage?.setItem(MIRROR_KEY, JSON.stringify(settings));
  } catch {
  }
}
function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
async function call(path, { method = "GET", body, signal } = {}, fetchImpl) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") return { ok: false, status: 0, error: "no-fetch" };
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  try {
    const init = { method, cache: "no-store", credentials: "same-origin", signal: controller?.signal ?? signal };
    if (body !== void 0) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const res = await doFetch(`${BASE2}${path}`, init);
    if (!res.ok) return { ok: false, status: res.status, error: `http-${res.status}` };
    const value = await res.json();
    return { ok: true, value };
  } catch (error) {
    return { ok: false, status: 0, error: String(error?.name === "AbortError" ? "timeout" : error?.message ?? error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function createApi({ fetchImpl, storage = safeStorage(), onStatus } = {}) {
  let offline = false;
  const note = (ok) => {
    if (offline === !ok) return;
    offline = !ok;
    try {
      onStatus?.(offline);
    } catch {
    }
  };
  return {
    get offline() {
      return offline;
    },
    /** GET /state → `{ settings, rhythm, now }`；失败时退镜像 + null。 */
    async state() {
      const result = await call("/state", {}, fetchImpl);
      note(result.ok);
      if (result.ok) {
        writeMirror(result.value?.settings, storage);
        return result;
      }
      const mirror = readMirror(storage);
      return { ok: false, error: result.error, value: mirror ? { settings: mirror, rhythm: null, now: null } : null };
    },
    /** GET /now；带地点参数就按参数算，不带就用宿主设置。 */
    async now(location) {
      const query = location && Number.isFinite(location.lat) && Number.isFinite(location.lon) ? `?lat=${encodeURIComponent(location.lat)}&lon=${encodeURIComponent(location.lon)}&tz=${encodeURIComponent(location.tz ?? "")}` : "";
      const result = await call(`/now${query}`, {}, fetchImpl);
      note(result.ok);
      return result;
    },
    /** POST /settings：整份覆盖式提交（宿主做合并与钳制）。 */
    async saveSettings(patch) {
      const result = await call("/settings", { method: "POST", body: patch }, fetchImpl);
      note(result.ok);
      if (result.ok) writeMirror(result.value, storage);
      else {
        const mirror = readMirror(storage) ?? {};
        writeMirror({ ...mirror, ...patch }, storage);
      }
      return result;
    },
    /** POST /rhythm：`shown` / `hidden` / `skip-today` / `manual-open`。 */
    async rhythm(event) {
      const result = await call("/rhythm", { method: "POST", body: { event } }, fetchImpl);
      note(result.ok);
      return result;
    },
    /** GET /media：这一次浮现用哪张素材（`fresh` 强制重新抽一张）。 */
    async media(fresh = false) {
      const result = await call(`/media${fresh ? "?fresh=1" : ""}`, {}, fetchImpl);
      return result;
    },
    /** POST /media/scan：设置页验证目录里有多少素材。 */
    async scanMedia(dir) {
      return call("/media/scan", { method: "POST", body: { dir } }, fetchImpl);
    },
    /** POST /media/resolve：把一个网页/图片链接抓成本地缓存。 */
    async resolveMedia(url) {
      return call("/media/resolve", { method: "POST", body: { url } }, fetchImpl);
    }
  };
}

// src/client/rhythm.js
var SUPPRESS = Object.freeze({
  autoOff: "auto-off",
  quiet: "quiet",
  typing: "typing",
  dialog: "dialog",
  skippedToday: "skipped-today",
  reducedMotion: "reduced-motion"
});
var FADE = { manual: 600, timeout: 3e3, pip: 1500 };
var INPUT_IDLE_MS = 2e4;
var INPUT_MAX_WAIT_MS = 10 * 6e4;
var TICK_MS = 1e3;
function parseClock(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
function isQuietTime(quiet, date) {
  if (!quiet || quiet.enabled !== true) return false;
  const start = parseClock(quiet.start);
  const end = parseClock(quiet.end);
  if (start === null || end === null) return false;
  if (start === end) return false;
  const nowMin = date.getHours() * 60 + date.getMinutes();
  return start < end ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end;
}
function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function skippedToday(rhythm, date) {
  const list = Array.isArray(rhythm?.skipDates) ? rhythm.skipDates : [];
  return list.includes(localDateKey(date));
}
function nextDueAt(settings, rhythm, nowMs = Date.now()) {
  const intervalMs = Math.max(1, Number(settings?.intervalMinutes) || DEFAULTS.intervalMinutes) * 6e4;
  const firstDelayMs = Math.max(0, Number(settings?.firstDelayMinutes ?? DEFAULTS.firstDelayMinutes)) * 6e4;
  const hide = Number(rhythm?.lastHideAt) || 0;
  const shown = Number(rhythm?.lastShownAt) || 0;
  const anchorSec = settings?.manualExtends === false ? hide : Math.max(hide, shown);
  if (!anchorSec) {
    const installed = Number(rhythm?.installedAt) || 0;
    return (installed ? installed * 1e3 : nowMs) + firstDelayMs;
  }
  return anchorSec * 1e3 + intervalMs;
}
function inputSuppression(lastInputAt, nowMs, dueAt = nowMs, { idleMs = INPUT_IDLE_MS, maxWaitMs = INPUT_MAX_WAIT_MS } = {}) {
  if (!lastInputAt) return { waiting: false, giveUp: false };
  if (nowMs - lastInputAt >= idleMs) return { waiting: false, giveUp: false };
  return { waiting: true, giveUp: nowMs - dueAt > maxWaitMs };
}
function reducedMotionActive(setting, systemReduce) {
  if (setting === "on") return true;
  if (setting === "off") return false;
  return Boolean(systemReduce);
}
var PHASE_TEXT = { dawn: "dawn", noon: "noon", afternoon: "afternoon", dusk: "dusk", night: "night" };
function createRuntime({ api, storage = globalThis.localStorage, doc = globalThis.document, win = globalThis.window, now = () => Date.now() } = {}) {
  const listeners = /* @__PURE__ */ new Set();
  let timer = null;
  let disposed = false;
  let lastInputAt = 0;
  let soundUnlocked = false;
  const state = {
    ready: false,
    offline: false,
    settings: null,
    rhythm: null,
    sky: null,
    media: null,
    form: "hidden",
    exiting: null,
    paused: false,
    pausedRemaining: 0,
    deadline: 0,
    remainingMs: 0,
    nextDueMs: null,
    suppression: null,
    stats: null,
    note: null
  };
  const snapshot = () => ({
    ...state,
    settings: state.settings ? { ...state.settings } : null,
    rhythm: state.rhythm ? { ...state.rhythm } : null
  });
  function emit() {
    const value = snapshot();
    for (const fn of listeners) {
      try {
        fn(value);
      } catch {
      }
    }
  }
  function subscribe(fn) {
    listeners.add(fn);
    try {
      fn(snapshot());
    } catch {
    }
    return () => listeners.delete(fn);
  }
  function note(text) {
    state.note = text;
    emit();
    setTimeout(() => {
      if (state.note !== text) return;
      state.note = null;
      emit();
    }, 4e3);
  }
  const reducedMotion = () => reducedMotionActive(state.settings?.reducedMotion, systemReduceMotion());
  function systemReduceMotion() {
    try {
      return Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    } catch {
      return false;
    }
  }
  function markInput() {
    if (state.form !== "hidden") return;
    lastInputAt = now();
  }
  const inputEvents = ["keydown", "pointerdown", "mousemove", "wheel", "touchstart"];
  function bindInput() {
    for (const name2 of inputEvents) win?.addEventListener?.(name2, markInput, { passive: true });
  }
  function unbindInput() {
    for (const name2 of inputEvents) win?.removeEventListener?.(name2, markInput);
  }
  function hasBlockingDialog() {
    try {
      const nodes = doc?.querySelectorAll?.('[role="dialog"], [role="alertdialog"]') ?? [];
      for (const node of nodes) {
        if (node?.offsetParent !== null || node?.getClientRects?.().length) return true;
      }
    } catch {
    }
    return false;
  }
  function autoSuppression(at = now()) {
    if (!state.settings?.auto) return SUPPRESS.autoOff;
    if (reducedMotion()) return SUPPRESS.reducedMotion;
    if (isQuietTime(state.settings.quietHours, new Date(at))) return SUPPRESS.quiet;
    if (skippedToday(state.rhythm, new Date(at))) return SUPPRESS.skippedToday;
    if (state.settings.deferOnTyping && inputSuppression(lastInputAt, at, state.nextDueMs ?? at).waiting) return SUPPRESS.typing;
    if (hasBlockingDialog()) return SUPPRESS.dialog;
    return null;
  }
  function computeNextDue() {
    state.nextDueMs = nextDueAt(state.settings, state.rhythm, now());
    return state.nextDueMs;
  }
  async function show(kind) {
    if (state.form !== "hidden" || state.exiting) return;
    const settings = state.settings ?? DEFAULTS;
    const form = settings.form === "pip" ? "pip" : "full";
    const durationMs = Math.max(1, Number(settings.durationSeconds) || DEFAULTS.durationSeconds) * 1e3;
    state.form = form;
    state.deadline = now() + durationMs;
    state.remainingMs = durationMs;
    state.paused = false;
    state.pausedRemaining = 0;
    state.exiting = null;
    state.suppression = kind === "auto" ? state.suppression : null;
    if (settings.sound?.enabled && soundUnlocked) state.sound?.enable?.(settings.sound.volume);
    emit();
    void pickMedia(true);
    void api?.rhythm?.(kind === "auto" ? "shown" : "manual-open")?.then?.((res) => {
      if (res?.ok && res.value) {
        state.rhythm = { ...res.value };
        emit();
      }
    });
    refreshSky();
  }
  function hide(kind = "manual") {
    if (state.form === "hidden" || state.exiting) return;
    const fade = FADE[kind] ?? FADE.manual;
    state.exiting = { kind, until: now() + fade };
    emit();
    setTimeout(() => finalizeHide(), fade);
  }
  function finalizeHide() {
    if (state.form === "hidden") return;
    state.form = "hidden";
    state.exiting = null;
    state.deadline = 0;
    state.remainingMs = 0;
    state.paused = false;
    state.pausedRemaining = 0;
    state.sound?.disable?.();
    emit();
    void api?.rhythm?.("hidden")?.then?.((res) => {
      if (res?.ok && res.value) {
        state.rhythm = { ...res.value };
        computeNextDue();
        emit();
      }
    });
  }
  function toggleForm() {
    if (state.form === "hidden") return;
    state.form = state.form === "full" ? "pip" : "full";
    if (state.settings?.rememberForm) void saveSettings({ form: state.form });
    emit();
  }
  function toPip() {
    if (state.form !== "full") return;
    toggleForm();
  }
  function togglePause() {
    if (state.form === "hidden" || state.exiting) return;
    if (state.paused) {
      state.paused = false;
      state.deadline = now() + state.pausedRemaining;
      state.pausedRemaining = 0;
    } else {
      state.paused = true;
      state.pausedRemaining = Math.max(0, state.deadline - now());
      state.deadline = 0;
    }
    emit();
  }
  async function skipToday() {
    const res = await api?.rhythm?.("skip-today");
    if (res?.ok && res.value) {
      state.rhythm = { ...res.value };
    } else {
      const list = Array.isArray(state.rhythm?.skipDates) ? [...state.rhythm.skipDates] : [];
      const key = localDateKey(/* @__PURE__ */ new Date());
      if (!list.includes(key)) list.push(key);
      state.rhythm = { ...state.rhythm ?? {}, skipDates: list };
    }
    if (state.form !== "hidden") hide("manual");
    computeNextDue();
    emit();
    return state.rhythm;
  }
  async function saveSettings(patch) {
    const merged = mergeSettings(state.settings ?? DEFAULTS, patch);
    state.settings = merged;
    emit();
    if (patch?.sound && state.sound?.setVolume) state.sound.setVolume(merged.sound.volume);
    const res = await api?.saveSettings?.(patch);
    if (res?.ok && res.value) {
      state.settings = mergeSettings(res.value, {});
      state.offline = false;
    } else if (res) {
      state.offline = true;
      note("hint.offline");
    }
    computeNextDue();
    if (patch?.media) void pickMedia(true);
    emit();
    return state.settings;
  }
  async function pickMedia(fresh = false) {
    const media = state.settings?.media;
    if (!media || media.mode === "off") {
      if (state.media) {
        state.media = null;
        emit();
      }
      return null;
    }
    let res = null;
    try {
      res = await api?.media?.(fresh);
    } catch {
      res = null;
    }
    const item = res?.ok ? res.value?.item ?? null : null;
    state.media = item;
    emit();
    return item;
  }
  async function refreshSky() {
    const location = state.settings?.location;
    const res = await api?.now?.(location);
    if (res?.ok && res.value) state.sky = res.value;
    else if (!state.sky) state.sky = null;
    emit();
  }
  function tick() {
    if (disposed) return;
    const at = now();
    if (state.form !== "hidden") {
      if (!state.exiting) {
        if (state.paused) {
          state.remainingMs = state.pausedRemaining;
          emit();
        } else {
          state.remainingMs = Math.max(0, state.deadline - at);
          if (state.remainingMs <= 0) {
            hide(state.form === "pip" ? "pip" : "timeout");
            return;
          }
          emit();
        }
      }
      return;
    }
    computeNextDue();
    const due = state.nextDueMs !== null && at >= state.nextDueMs;
    if (!due) {
      emit();
      return;
    }
    const reason = autoSuppression(at);
    state.suppression = reason;
    if (!reason) {
      void show("auto");
      return;
    }
    if (reason === SUPPRESS.typing && state.settings?.deferOnTyping) {
      const input = inputSuppression(lastInputAt, at, state.nextDueMs ?? at);
      if (input.giveUp) {
        lastInputAt = 0;
        void api?.rhythm?.("hidden")?.then?.((res) => {
          if (res?.ok && res.value) {
            state.rhythm = { ...res.value };
            computeNextDue();
            emit();
          }
        });
      }
    }
    emit();
  }
  async function init() {
    if (state.ready || disposed) return;
    let res = null;
    try {
      res = await api?.state?.();
    } catch {
      res = null;
    }
    if (res?.ok && res.value) {
      state.settings = mergeSettings(res.value.settings, {});
      state.rhythm = res.value.rhythm ?? null;
      state.sky = res.value.now ?? null;
      state.offline = false;
    } else {
      state.settings = mergeSettings(res?.value?.settings ?? null, {});
      state.rhythm = res?.value?.rhythm ?? null;
      state.sky = res?.value?.now ?? null;
      state.offline = true;
    }
    if (disposed) return;
    state.ready = true;
    computeNextDue();
    bindInput();
    timer = setInterval(tick, TICK_MS);
    timer?.unref?.();
    emit();
  }
  function dispose() {
    disposed = true;
    if (timer) clearInterval(timer);
    timer = null;
    unbindInput();
    listeners.clear();
    state.sound?.dispose?.();
    state.form = "hidden";
  }
  function reportStats(stats) {
    state.stats = stats;
    emit();
  }
  function attachSound(sound) {
    state.sound = sound;
    return () => {
      sound?.dispose?.();
      if (state.sound === sound) state.sound = null;
    };
  }
  function unlockSound() {
    soundUnlocked = true;
    return state.sound?.enable?.(state.settings?.sound?.volume ?? DEFAULTS.sound.volume) ?? false;
  }
  return {
    getState: snapshot,
    subscribe,
    init,
    dispose,
    show,
    hide,
    toggleForm,
    toPip,
    togglePause,
    skipToday,
    saveSettings,
    refreshSky,
    tick,
    attachSound,
    pickMedia,
    /** 设置页"检查目录"用：交给宿主扫一遍，返回 {ok,count,images,videos,names}。 */
    async scanMedia(dir) {
      try {
        return await api?.scanMedia?.(dir) ?? { ok: false };
      } catch {
        return { ok: false };
      }
    },
    /** 设置页"抓取并缓存"用。 */
    async resolveMedia(url) {
      try {
        return await api?.resolveMedia?.(url) ?? { ok: false };
      } catch {
        return { ok: false };
      }
    },
    reportStats,
    unlockSound,
    phaseText: (phase) => PHASE_TEXT[phase] ?? "afternoon",
    get reducedMotion() {
      return reducedMotion();
    },
    get soundUnlocked() {
      return soundUnlocked;
    }
  };
}

// src/client/sound.js
var FADE_IN = 0.15;
var FADE_OUT = 0.4;
function createSurfSound() {
  let ctx = null;
  let source = null;
  let gain = null;
  let lfo = null;
  let lfoGain = null;
  let filter = null;
  let enabled = false;
  let volume = 0.35;
  function ensureContext() {
    if (ctx) return ctx;
    const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      return ctx;
    } catch {
      return null;
    }
  }
  function noiseBuffer(audio) {
    const length = Math.floor(audio.sampleRate * 2);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.92 + white * 0.08;
      data[i] = last * 3.2;
    }
    return buffer;
  }
  function enable(nextVolume = volume) {
    const audio = ensureContext();
    if (!audio) return false;
    try {
      volume = clampVolume(nextVolume);
      if (audio.state === "suspended") void audio.resume();
      if (!source) {
        source = audio.createBufferSource();
        source.buffer = noiseBuffer(audio);
        source.loop = true;
        filter = audio.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 700;
        filter.Q.value = 0.6;
        gain = audio.createGain();
        gain.gain.value = 0;
        lfo = audio.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.08;
        lfoGain = audio.createGain();
        lfoGain.gain.value = 400;
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start();
        source.connect(filter);
        filter.connect(gain);
        gain.connect(audio.destination);
        source.start();
      }
      const now = audio.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(volume, now + FADE_IN);
      enabled = true;
      return true;
    } catch {
      return false;
    }
  }
  function disable() {
    enabled = false;
    const audio = ctx;
    if (!audio || !gain) return;
    try {
      const now = audio.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE_OUT);
    } catch {
    }
  }
  function setVolume(next) {
    volume = clampVolume(next);
    if (!ctx || !gain || !enabled) return;
    try {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.linearRampToValueAtTime(volume, now + FADE_IN);
    } catch {
    }
  }
  function dispose() {
    disable();
    const audio = ctx;
    const nodes = { source, lfo };
    ctx = null;
    source = null;
    lfo = null;
    filter = null;
    lfoGain = null;
    gain = null;
    if (!audio) return;
    setTimeout(() => {
      try {
        nodes.source?.stop();
      } catch {
      }
      try {
        nodes.lfo?.stop();
      } catch {
      }
      void audio.close?.().catch?.(() => {
      });
    }, 500);
  }
  return {
    enable,
    disable,
    setVolume,
    dispose,
    get enabled() {
      return enabled;
    }
  };
}
function clampVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.35;
  return Math.min(1, Math.max(0, n));
}

// src/client/styles.js
var STYLE = `
:root { --intertidal-z: 900; }

.it-root {
  position: fixed;
  z-index: var(--intertidal-z);
  background: #0a1420;
  color: #f5f7fa;
  transition: opacity 800ms ease, transform 400ms cubic-bezier(.2,.7,.3,1), border-radius 400ms ease;
  will-change: opacity, transform;
  overflow: hidden;
  font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif;
}
.it-root[data-form="full"] {
  inset: 0;
  border-radius: 0;
  opacity: 1;
}
.it-root[data-form="pip"] {
  right: 24px; bottom: 24px; left: auto; top: auto;
  width: min(38vw, 640px);
  aspect-ratio: 16 / 9;
  border-radius: 14px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, .38), 0 1px 0 rgba(255, 255, 255, .08) inset;
  transform: none;
  opacity: 1;
  cursor: grab;
}
.it-root[data-dragging="1"] { cursor: grabbing; }
.it-root[data-exit="1"] { opacity: 0; }
.it-root[data-exit="pip"] { transform: translateY(8px) scale(.985); }

.it-canvas-holder { position: absolute; inset: 0; }
.it-canvas-holder canvas { display: block; width: 100%; height: 100%; }
.it-fallback {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, #7ea7c9 0%, #bcd3e2 52%, #2a5d80 52.2%, #10334d 100%);
  animation: it-breathe 16s ease-in-out infinite alternate;
}
@keyframes it-breathe { from { filter: brightness(.96) } to { filter: brightness(1.04) } }

.it-caption {
  position: absolute; left: 22px; bottom: 20px;
  font-size: 11px; letter-spacing: .04em;
  color: #fff; opacity: .45;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .35);
  pointer-events: none;
  user-select: none;
}
.it-root[data-form="pip"] .it-caption { left: 12px; bottom: 10px; font-size: 10px; }

.it-controls {
  position: absolute; top: 14px; right: 14px;
  display: flex; align-items: center; gap: 8px;
}
.it-root[data-form="pip"] .it-controls { top: 8px; right: 8px; }

/* 按钮组：悬停/聚焦才出现，别在沉浸时碍眼 */
.it-btnbar {
  display: flex; gap: 6px;
  opacity: 0; transition: opacity 220ms ease;
}
.it-root:hover .it-btnbar, .it-root:focus-within .it-btnbar { opacity: 1; }

/* 倒计时：一直可见，等宽数字，不抢画面 */
.it-countdown {
  display: inline-flex; align-items: center; justify-content: center;
  height: 30px; min-width: 52px; padding: 0 11px;
  font-size: 12px; line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: .02em;
  border-radius: 15px;
  color: rgba(255, 255, 255, .82);
  background: rgba(10, 18, 28, .32);
  border: 1px solid rgba(255, 255, 255, .14);
  backdrop-filter: blur(8px);
  text-shadow: 0 1px 2px rgba(0, 0, 0, .35);
  user-select: none; pointer-events: none;
  transition: opacity 400ms ease;
}
.it-countdown[data-paused="1"] { opacity: .5; }
.it-root[data-form="pip"] .it-countdown { height: 24px; min-width: 44px; padding: 0 8px; font-size: 11px; border-radius: 12px; }

.it-btn {
  -webkit-appearance: none; appearance: none;
  height: 30px; min-width: 30px; padding: 0 10px;
  border-radius: 15px;
  border: 1px solid rgba(255, 255, 255, .22);
  background: rgba(12, 22, 34, .38);
  color: rgba(255, 255, 255, .86);
  font: inherit; font-size: 12px; line-height: 1;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: background 160ms ease, border-color 160ms ease;
}
.it-btn:hover { background: rgba(12, 22, 34, .62); border-color: rgba(255, 255, 255, .4); }
.it-btn:focus-visible { outline: 2px solid rgba(255, 255, 255, .8); outline-offset: 2px; }
.it-btn[data-icon="1"] { width: 30px; padding: 0; font-size: 14px; }

.it-toast {
  position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%);
  padding: 6px 12px; border-radius: 12px;
  background: rgba(10, 18, 28, .62);
  font-size: 12px; color: rgba(255, 255, 255, .9);
  pointer-events: none;
}

.it-error {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  gap: 12px;
  background: linear-gradient(180deg, #12202e, #0a1420);
  font-size: 13px; color: rgba(255, 255, 255, .78);
}

/* —— 设置页 ——
   布局要点：DSH 的设置面板宽度不定（可能只有 500px），所以每一行都必须能换行：
   标签列给一个 220px 的 flex-basis（不够就整体折到下一行），控件列自己也能折行。
   早先标签列没有 flex-basis、控件是 flex:none，结果标签被挤成"一行一个词"。 */
.it-settings { display: flex; flex-direction: column; gap: 26px; max-width: 100%; }
.it-group { display: flex; flex-direction: column; gap: 4px; }
.it-group > h4 {
  margin: 0 0 6px; font-size: 12px; font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; opacity: .55;
}
.it-row {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 8px 18px; flex-wrap: wrap;
  padding: 9px 0; border-bottom: 1px solid rgba(127, 137, 150, .14);
}
.it-row:last-child { border-bottom: none; }
.it-row-label {
  display: flex; flex-direction: column; gap: 3px;
  flex: 1 1 220px; min-width: 0; padding-top: 4px;
}
.it-row-label > span { line-height: 1.45; }
.it-row-label small { opacity: .55; font-size: 11px; line-height: 1.5; }
.it-row-control {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  flex: 0 1 auto; justify-content: flex-end; max-width: 100%;
}
.it-row-note { flex: 1 1 100%; }
/* 一行里有多个控件（输入框 + 按钮 + 按钮）时，把控件块整体折到标签下面并左对齐，
   否则窄面板里会出现"输入框在左、按钮飘到下一行右端"的散架感。 */
.it-row[data-stack="1"] .it-row-control {
  flex: 1 1 100%; justify-content: flex-start; align-items: stretch;
}
.it-row[data-stack="1"] .it-row-control .it-field { flex: 1 1 220px; }
.it-row[data-stack="1"] .it-row-control .it-action { flex: 0 0 auto; }
.it-settings select,
.it-settings input[type="text"],
.it-settings input[type="number"],
.it-settings input[type="time"],
.it-settings textarea {
  height: 30px; padding: 0 10px;
  border-radius: 7px;
  border: 1px solid rgba(127, 137, 150, .34);
  background: transparent; color: inherit;
  font: inherit; font-size: 12px;
  max-width: 100%;
}
.it-settings textarea {
  height: auto; min-height: 62px; padding: 7px 10px;
  line-height: 1.5; resize: vertical;
  flex: 1 1 260px; min-width: 200px;
}
.it-field { flex: 1 1 200px; min-width: 160px; }
.it-field-sm { flex: 0 1 96px; min-width: 84px; }
.it-settings input[type="range"] { width: 140px; max-width: 100%; }
.it-settings select { min-width: 132px; }
.it-switch {
  position: relative; width: 38px; height: 22px; flex: none;
  border-radius: 11px; border: none; padding: 0;
  background: rgba(127, 137, 150, .38);
  cursor: pointer; transition: background 160ms ease;
}
.it-switch[aria-checked="true"] { background: #2f7d6b; }
.it-switch::after {
  content: ""; position: absolute; top: 3px; left: 3px;
  width: 16px; height: 16px; border-radius: 50%;
  background: #fff; transition: transform 160ms ease;
}
.it-switch[aria-checked="true"]::after { transform: translateX(16px); }
.it-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.it-action {
  height: 30px; padding: 0 14px; border-radius: 8px;
  border: 1px solid rgba(127, 137, 150, .34);
  background: transparent; color: inherit; font: inherit; font-size: 12px;
  cursor: pointer;
}
.it-action:hover { border-color: rgba(127, 137, 150, .6); }
.it-action[data-primary="1"] { background: #2f7d6b; border-color: #2f7d6b; color: #fff; }
.it-hint { font-size: 11px; opacity: .55; }
.it-warn { font-size: 11px; color: #c2823a; }
`;
var STYLE_ID = "dsh-intertidal";
var STYLE_ATTR = "data-plugin-css";
function injectStyles(doc = globalThis.document) {
  if (!doc) return () => {
  };
  for (const node of doc.querySelectorAll(`style[${STYLE_ATTR}="${STYLE_ID}"]`)) node.remove();
  const style = doc.createElement("style");
  style.setAttribute(STYLE_ATTR, STYLE_ID);
  style.textContent = STYLE;
  doc.head.appendChild(style);
  return () => {
    style.remove();
  };
}

// src/client/i18n.js
var NS = "intertidal";
var zh = {
  "panel.title": "潮间",
  "panel.caption": "此刻",
  "panel.remaining": "剩余",
  "panel.paused": "已暂停",
  "panel.crashed": "潮间出了点问题，点此关闭",
  "action.open": "涨一次潮",
  "action.close": "关闭",
  "action.pip": "缩成小窗",
  "action.expand": "展开整屏",
  "action.pause": "暂停计时",
  "action.resume": "继续计时",
  "action.skip": "今天跳过",
  "action.preview": "看一眼海",
  "hint.keys": "Esc 关闭 · C 缩窗 · Space 暂停",
  "hint.offline": "暂时无法保存设置",
  "sound.unlock": "点一下才能播放海浪声",
  "settings.title": "潮间",
  "settings.group.rhythm": "节奏",
  "settings.group.form": "形态",
  "settings.group.place": "地点",
  "settings.group.sound": "声音",
  "settings.group.access": "无障碍",
  "settings.auto": "自动浮现",
  "settings.auto.hint": "到点自己浮起来，到点自己退走",
  "settings.interval": "间隔",
  "settings.interval.hint": "两次浮现之间隔多久",
  "settings.duration": "每次时长",
  "settings.firstDelay": "首次投放延迟",
  "settings.firstDelay.hint": "装完先安静一会儿，别一装就糊一脸",
  "settings.quiet": "静默时段",
  "settings.quiet.hint": "这段时间内不自动浮现（手动不受限）",
  "settings.deferTyping": "输入中推迟",
  "settings.deferTyping.hint": "正在打字时等你停手 20 秒；最多等 10 分钟则跳过本次",
  "settings.manualExtends": "手动看过后顺延",
  "settings.manualExtends.hint": "你主动看一眼，下一次定时就往后挪",
  "settings.form": "浮现形式",
  "settings.form.full": "整屏",
  "settings.form.pip": "右下角小窗",
  "settings.rememberForm": "记住上次形态",
  "settings.caption": "角落小字",
  "settings.caption.hint": "「此刻 · 上海 · 17:18」，不显示任何数据源",
  "settings.city": "城市",
  "settings.city.custom": "自定义经纬度",
  "settings.lat": "纬度",
  "settings.lon": "经度",
  "settings.tz": "时区",
  "settings.sound": "海浪声",
  "settings.volume": "音量",
  "settings.sound.hint": "程序化合成，不需要任何素材文件",
  "settings.group.media": "画面素材",
  "settings.media.mode": "素材来源",
  "settings.media.off": "程序化海（默认）",
  "settings.media.dir": "本地目录",
  "settings.media.url": "网页 / 图片链接",
  "settings.media.hint": "用真实照片或视频当海的底子；不选就还是程序化海。素材加载失败会自动退回程序化海。",
  "settings.media.dir.hint": "从目录里随机取一张图片或视频，全程不联网",
  "settings.media.dir.empty": "还没选目录",
  "settings.media.pick": "选择目录",
  "settings.media.scan": "检查目录",
  "settings.media.scanOk": "目录里有素材",
  "settings.media.scanEmpty": "目录里没有图片或视频",
  "settings.media.scanFail": "读不到这个目录",
  "settings.media.urls": "链接",
  "settings.media.urls.hint": "一行一条，最多 8 条。直链图片/视频直接用；网页会尝试取 og:image 首图。",
  "settings.media.fetch": "抓取并缓存",
  "settings.media.fetchOk": "已缓存，下次浮现就会用",
  "settings.media.fetchFail": "抓不到，检查链接或网络",
  "settings.media.grade": "天光着色",
  "settings.media.grade.hint": "按此刻的太阳给素材压暗/提亮、偏暖/偏冷；0 = 保持原图",
  "settings.media.motion": "缓慢推拉",
  "settings.media.motion.hint": "Ken Burns，让静图不像壁纸；0 = 完全静止",
  "settings.media.shuffle": "每次浮现换一张",
  "settings.reducedMotion": "减少动态",
  "settings.reducedMotion.auto": "跟随系统",
  "settings.reducedMotion.on": "强制开",
  "settings.reducedMotion.off": "强制关",
  "settings.reducedMotion.hint": "开启后画面静止，且自动浮现默认关闭",
  "settings.next": "下一次浮现",
  "settings.next.soon": "马上就到",
  "settings.next.off": "自动已关闭",
  "settings.stateFile": "状态文件",
  "unit.minutes": "分钟",
  "unit.seconds": "秒",
  "phase.dawn": "晨曦",
  "phase.noon": "正午",
  "phase.afternoon": "午后",
  "phase.dusk": "黄昏",
  "phase.night": "夜"
};
var en = {
  "panel.title": "Intertidal",
  "panel.caption": "now",
  "panel.remaining": "remaining",
  "panel.paused": "paused",
  "panel.crashed": "Intertidal hit a problem — click to close",
  "action.open": "Raise the tide",
  "action.close": "Close",
  "action.pip": "Shrink to corner",
  "action.expand": "Expand",
  "action.pause": "Pause timer",
  "action.resume": "Resume timer",
  "action.skip": "Skip today",
  "action.preview": "Look at the sea",
  "hint.keys": "Esc close · C shrink · Space pause",
  "hint.offline": "Settings cannot be saved right now",
  "sound.unlock": "Click once to allow surf audio",
  "settings.title": "Intertidal",
  "settings.group.rhythm": "Rhythm",
  "settings.group.form": "Form",
  "settings.group.place": "Place",
  "settings.group.sound": "Sound",
  "settings.group.access": "Accessibility",
  "settings.auto": "Automatic",
  "settings.auto.hint": "It comes up on its own and leaves on its own",
  "settings.interval": "Interval",
  "settings.interval.hint": "How long between two appearances",
  "settings.duration": "Duration",
  "settings.firstDelay": "First appearance delay",
  "settings.firstDelay.hint": "Stay quiet right after install",
  "settings.quiet": "Quiet hours",
  "settings.quiet.hint": "No automatic appearance in this window (manual still works)",
  "settings.deferTyping": "Defer while typing",
  "settings.deferTyping.hint": "Waits 20s after you stop typing; gives up after 10 minutes",
  "settings.manualExtends": "Manual viewing pushes the next one",
  "settings.manualExtends.hint": "Looking on purpose moves the next timed appearance later",
  "settings.form": "Appearance",
  "settings.form.full": "Full screen",
  "settings.form.pip": "Corner window",
  "settings.rememberForm": "Remember last form",
  "settings.caption": "Corner caption",
  "settings.caption.hint": "“Now · Shanghai · 17:18” — no data source involved",
  "settings.city": "City",
  "settings.city.custom": "Custom coordinates",
  "settings.lat": "Latitude",
  "settings.lon": "Longitude",
  "settings.tz": "Time zone",
  "settings.sound": "Surf sound",
  "settings.volume": "Volume",
  "settings.sound.hint": "Synthesised, no asset files",
  "settings.group.media": "Scenery",
  "settings.media.mode": "Source",
  "settings.media.off": "Procedural sea (default)",
  "settings.media.dir": "Local folder",
  "settings.media.url": "Web / image links",
  "settings.media.hint": "Use real photos or video as the sea bed; leave it off for the procedural sea. Falls back automatically if a file fails to load.",
  "settings.media.dir.hint": "Picks a random image or video from the folder. No network at all.",
  "settings.media.dir.empty": "No folder chosen",
  "settings.media.pick": "Choose folder",
  "settings.media.scan": "Check folder",
  "settings.media.scanOk": "Files found",
  "settings.media.scanEmpty": "No images or videos in that folder",
  "settings.media.scanFail": "Cannot read that folder",
  "settings.media.urls": "Links",
  "settings.media.urls.hint": "One per line, up to 8. Direct image/video URLs are used as-is; pages are scraped for og:image.",
  "settings.media.fetch": "Fetch and cache",
  "settings.media.fetchOk": "Cached — the next appearance will use it",
  "settings.media.fetchFail": "Could not fetch; check the link or network",
  "settings.media.grade": "Time-of-day grade",
  "settings.media.grade.hint": "Darkens/brightens and warms/cools the photo to match the sun right now; 0 keeps the original",
  "settings.media.motion": "Slow push",
  "settings.media.motion.hint": "Ken Burns, so a still photo does not look like wallpaper; 0 is perfectly still",
  "settings.media.shuffle": "New one every appearance",
  "settings.reducedMotion": "Reduced motion",
  "settings.reducedMotion.auto": "Follow system",
  "settings.reducedMotion.on": "Force on",
  "settings.reducedMotion.off": "Force off",
  "settings.reducedMotion.hint": "Static frame, and automatic appearance defaults to off",
  "settings.next": "Next appearance",
  "settings.next.soon": "any moment",
  "settings.next.off": "automatic is off",
  "settings.stateFile": "State file",
  "unit.minutes": "min",
  "unit.seconds": "s",
  "phase.dawn": "dawn",
  "phase.noon": "noon",
  "phase.afternoon": "afternoon",
  "phase.dusk": "dusk",
  "phase.night": "night"
};
function normalizeLang(value) {
  return String(value ?? "").toLowerCase().startsWith("zh") ? "zh" : "en";
}
function createTranslator(locale, doc = globalThis.document, nav = globalThis.navigator) {
  const active = () => {
    try {
      const snapshot = locale?.getSnapshot?.();
      if (snapshot && snapshot.active) return normalizeLang(snapshot.active);
    } catch {
    }
    try {
      const attr = doc?.documentElement?.getAttribute?.("lang");
      if (attr) return normalizeLang(attr);
    } catch {
    }
    return normalizeLang(nav?.language ?? "zh");
  };
  const t = (key) => {
    const dict = active() === "en" ? en : zh;
    return dict[key] ?? zh[key] ?? key;
  };
  return {
    t,
    getLang: active,
    /** 语言变化时通知组件重渲染（拿得到 subscribe 才有）。 */
    subscribe(callback) {
      try {
        return locale?.subscribe?.(() => callback(active())) ?? (() => {
        });
      } catch {
        return () => {
        };
      }
    }
  };
}

// src/client/index.jsx
var logger = {
  warn: (...args) => console.warn("[dsh-intertidal]", ...args)
};
var PANEL_ID = "intertidal";
var plugin = {
  name: "dsh-intertidal",
  // `slots` 与 `locale` 都是 DSH 的常驻服务，一并声明：这样 apply 里拿到的 locale 一定是
  // 已就绪的那个（早先只 inject slots、用 ctx.get('locale') 现取，曾经拿到 undefined，
  // 于是插件语言跟着 documentElement.lang 跑 —— 表现就是"DSH 中文、插件英文"）。
  inject: ["slots", "locale"],
  apply(ctx) {
    const locale = ctx.locale ?? ctx.get?.("locale") ?? null;
    const { t, getLang, subscribe: subscribeLang } = createTranslator(locale);
    if (locale && typeof locale.register === "function") {
      ctx.effect(() => {
        try {
          return locale.register(NS, { zh, en });
        } catch (error) {
          logger.warn("注册文案失败（可能已被注册过）：", error);
          return () => {
          };
        }
      }, "dsh-intertidal: dictionaries");
    }
    ctx.effect(() => {
      const remove = injectStyles();
      return () => {
        remove();
        for (const node of globalThis.document?.querySelectorAll?.('style[data-plugin-css="dsh-intertidal"]') ?? []) {
          node.remove();
        }
      };
    }, "dsh-intertidal: styles");
    const api = createApi({
      onStatus: (offline) => {
        if (offline) logger.warn("宿主接口不可用，退镜像设置运行");
      }
    });
    const runtime = createRuntime({ api });
    ctx.effect(() => {
      const dropSound = runtime.attachSound(createSurfSound());
      void runtime.init();
      return () => {
        dropSound();
        runtime.dispose();
      };
    }, "dsh-intertidal: runtime");
    const withRuntime = () => ({
      runtime,
      ctx,
      t,
      getLang,
      subscribeLang,
      // 可选：DSH 的工作区选择器（`uiWorkspace.pickDirectory`），拿不到就让手输路径
      pickDirectory: () => {
        try {
          return ctx.get?.("uiWorkspace")?.pickDirectory?.();
        } catch {
          return null;
        }
      }
    });
    try {
      ctx.slots.inject(
        "shell.overlay",
        () => ctx.slots.register(
          {
            name: "shell.overlay",
            id: "intertidal.sea",
            order: 500,
            label: () => t("panel.title"),
            locale: NS,
            inject: withRuntime
          },
          Overlay
        )
      );
    } catch (error) {
      logger.warn("注册整窗覆盖层失败：", error);
    }
    try {
      ctx.slots.inject(
        "settings.section",
        () => ctx.slots.register(
          {
            name: "settings.section",
            id: PANEL_ID,
            order: 88,
            label: () => t("settings.title"),
            locale: NS,
            inject: withRuntime
          },
          SettingsPanel
        )
      );
    } catch (error) {
      logger.warn("注册设置页失败：", error);
    }
    try {
      ctx.inject(["shortcuts"], (scope) => {
        scope.effect(() => {
          try {
            const dispose = scope.shortcuts.register({
              id: "intertidal.open",
              label: () => t("action.open"),
              aliases: ["涨一次潮", "look at the sea", "intertidal"],
              defaults: {},
              regions: ["page"],
              modals: [],
              resolve: () => ({
                status: "handled",
                run: () => void runtime.show("manual")
              })
            });
            return () => dispose?.();
          } catch (error) {
            logger.warn("注册快捷键命令失败（不影响其他功能）：", error);
            return () => {
            };
          }
        });
      });
    } catch (error) {
      logger.warn("shortcuts 服务不可用：", error);
    }
  }
};
var inject = plugin.inject;
var apply = plugin.apply;
var name = plugin.name;

    return module.exports;
  }
});
