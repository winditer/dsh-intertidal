/**
 * 潮间 · 海 —— Canvas 2D 五层视差水面
 *
 * 只用 Canvas 2D，全部程序化绘制：没有图片 / 字体 / 音频 / 网络。
 *
 * 铁律（docs/CONTRACTS.md §6 + spec §4.1/§4.3/§4.5）：
 *   1. 所有层共用一个 t = performance.now()/1000，**绝不依赖帧计数** ——
 *      掉帧只会少画几帧，不会让海变慢；
 *   2. 不可见（paused / document.hidden）→ cancelAnimationFrame 完全停帧；
 *      恢复时把暂停时长累进偏移量，相位连续、不跳变；
 *   3. 背衬缓冲（离屏缓冲）宽度上限 1280，由 CSS 撑满父容器；devicePixelRatio
 *      参与，resize 防抖 200ms 重建；
 *   4. 目标 30fps（form === 'pip' 时 15fps），连续 3 秒平均 < 20fps → 降到 15fps
 *      （只降不升），通过 onStats({ fps, downgraded }) 反馈；
 *   5. reducedMotion → 只画一帧静态海，之后每 60 秒换一帧（仅色温微变）；
 *   6. 任何分支都不抛：拿不到 2D context（或绘制抛错）就退回 CSS 渐变静态海，
 *      仍随时间变色。
 */
import { useEffect, useRef } from 'react';
import { paletteFor, mix } from './palette.js';

const TAU = Math.PI * 2;

/* ==========================================================================
 * 可调参数表：改画风只动这里
 * ========================================================================== */

/** 生命周期 / 性能预算（spec §4.3）。 */
const TUNING = Object.freeze({
  maxBufferWidth: 1280, //       内部渲染缓冲宽度上限（程序化海）
  mediaBufferWidth: 2560, //     媒体模式的上限（照片要有清晰度，契约 A3）
  targetFps: 30, //              目标帧率（不是 60，省电）
  pipFps: 15, //                 form === 'pip' 的小窗帧率
  degradedFps: 15, //            降级帧率
  slowWindowMs: 3000, //         连续 3 秒
  slowFps: 20, //                平均帧率低于它 → 降级
  resizeDebounceMs: 200, //      resize 防抖
  reducedRefreshMs: 60000, //    reducedMotion：每 60 秒换一帧
  maxStepMs: 120, //             时间步长上限：单帧最多推进 120ms（防节流回来跳帧）
  stopOnBlur: false, //          spec §4.3 提到「窗口失焦停帧」；默认关：
  //                             开 DevTools 会让页面 blur，验收时会被误判成卡死。
});

/** 画面几何与五层参数（spec §4.1）。 */
const HORIZON = 0.52; //         地平线 y（与 palette.js 的坐标约定一致）

/** L1 远海：一条低频起伏的地平线 —— 噪声 × 0.08Hz，振幅 2–4px。 */
const L1 = Object.freeze({ freq: 0.08, ampMin: 2, ampMax: 4, spatial: 1.6 });

/** L2 中景浪：三组正弦叠加的横向浪脊 —— 0.11/0.23/0.37Hz，相位差 1.7rad。 */
const L2 = Object.freeze({
  // 三组正弦：现在横向驱动每条波前的形状（波长随 depth 放大），
  // 相位差 1.7rad 保留；契约里的 0.11/0.23/0.37Hz 由波前滚动 + 拍岸节奏承担
  freqs: [0.11, 0.23, 0.37], //  Hz（三组基底频率，契约 §4.1）
  phaseGap: 1.7, //              rad，相邻组相位差
  weights: [0.55, 0.3, 0.15], //  波前高程里三组各占的权重
  waves: [0.9, 1.6, 2.7], //      横向波数（× 2π）
});

/** L3 泡沫带：浪脊处阈值触发的白斑 —— 覆盖率 3%–9%。 */
const L3 = Object.freeze({
  coverageMin: 0.03, //          spec §4.1：覆盖率 3%–9%
  coverageMax: 0.09,
});

/** 媒体层（契约 A3）：Ken Burns + 天光罩 + 水面呼吸 + 地平线雾 + 暗角。 */
const MEDIA = Object.freeze({
  kenBurnsPeriod: 40, //         秒，契约要求 ~40s 周期
  kenBurnsZoom: 0.06, //         1.0 → 1.06
  overscan: 1.008, //            恒定超采样，保证 1–2px 位移不漏边
  breathFreq: 0.11, //           Hz，水面呼吸
  breathPx: 2, //                横向位移幅度（契约 1–2px）
  sweepHeight: 0.09, //          高光扫过带的厚度（占画面高）
  skyMaskBottom: 0.62, //        顶部天光蒙版盖到画面的 62%
  vignette: 0.22, //             暗角强度
});

/** L4 前景浪尖：更大更快的近处浪头，偶尔翻白 —— 0.6Hz + 单次事件，占画面下 22%。 */
const L4 = Object.freeze({
  freq: 0.6, //                  Hz
  band: 0.22, //                 占画面下 22%
  eventPeriod: 9.2, //           翻白事件的周期（秒）
  eventRise: 0.05, //            涨：周期的 5%（≈0.46s）
  eventDecay: 0.12, //           落：周期的 12%（≈1.1s）
});

/* ==========================================================================
 * 小工具（全部容错，任何输入都不抛）
 * ========================================================================== */

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function clamp01(value) {
  return clamp(num(value, 0), 0, 1);
}

function lerp(a, b, k) {
  return a + (b - a) * k;
}

function round(value, digits) {
  const base = Math.pow(10, digits);
  return Math.round(num(value, 0) * base) / base;
}

/** '#rrggbb' → 'rgba(r,g,b,a)'；坏颜色退回透明，不抛。 */
function rgba(color, alpha) {
  let r = 0;
  let g = 0;
  let b = 0;
  const match = typeof color === 'string' ? /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim()) : null;
  if (match) {
    let hex = match[1];
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    r = parseInt(hex.slice(0, 2), 16) || 0;
    g = parseInt(hex.slice(2, 4), 16) || 0;
    b = parseInt(hex.slice(4, 6), 16) || 0;
  }
  return 'rgba(' + r + ',' + g + ',' + b + ',' + round(clamp01(alpha), 3) + ')';
}

/** 确定性哈希（0..1）：同一格每帧同一值，泡沫才不会乱闪。 */
function hash1(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** 椭圆斑（兼容没有 ctx.ellipse 的实现）。 */
function blob(ctx, x, y, rx, ry) {
  const rw = Math.max(0.1, num(rx, 0.5));
  const rh = Math.max(0.1, num(ry, 0.5));
  ctx.beginPath();
  if (typeof ctx.ellipse === 'function') {
    ctx.ellipse(x, y, rw, rh, 0, 0, TAU);
  } else {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rw, rh);
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.restore();
  }
  ctx.fill();
}

/* ==========================================================================
 * L0 天空：垂直三分渐变 + 地平线辉光（随太阳高度角变化，颜色全来自 palette）
 * ========================================================================== */

function drawSky(ctx, W, H, horizonY, pal) {
  const height = Math.max(1, horizonY);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, pal.skyTop);
  gradient.addColorStop(0.54, pal.skyMid);
  gradient.addColorStop(1, pal.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, height);

  // 地平线辉光：太阳越低（exposure 越小）铺得越宽
  const spread = H * (0.09 + 0.07 * (1 - clamp01(pal.exposure)));
  const glow = ctx.createLinearGradient(0, horizonY - spread, 0, horizonY + H * 0.004);
  glow.addColorStop(0, rgba(pal.horizonGlow, 0));
  glow.addColorStop(0.72, rgba(pal.horizonGlow, 0.3));
  glow.addColorStop(1, rgba(pal.horizonGlow, 0.16));
  ctx.fillStyle = glow;
  ctx.fillRect(0, Math.max(0, horizonY - spread), W, Math.min(H, spread + H * 0.004));

  // 地平线上方一层薄雾：压对比，晨昏的「雾感」靠它
  const hazeTop = Math.max(0, horizonY - spread * 0.62);
  ctx.fillStyle = rgba(pal.skyBottom, 0.16);
  ctx.fillRect(0, hazeTop, W, horizonY - hazeTop);
}

/* ==========================================================================
 * 星（数量由 palette.stars 控制）
 * ========================================================================== */

function drawStars(ctx, W, H, horizonY, pal, t) {
  const density = clamp01(pal.stars);
  if (density <= 0.01) return;
  const count = Math.round(density * 120);
  const tint = mix(pal.foam, '#ffffff', 0.65);
  const ceiling = Math.max(1, horizonY * 0.95);
  for (let i = 0; i < count; i += 1) {
    const hx = hash1(i * 1.731 + 0.37);
    const hy = hash1(i * 2.917 + 0.11);
    const x = hx * W;
    const y = hy * hy * ceiling; // hy² 让星更密于天顶
    const size = 0.7 + hash1(i * 3.77) * 1.1;
    const twinkle = 0.55 + 0.45 * Math.sin(t * (0.6 + hx * 1.9) + i * 1.3);
    ctx.fillStyle = rgba(tint, clamp01(density * twinkle) * 0.85);
    ctx.fillRect(x, y, size, size);
  }
}

/* ==========================================================================
 * 太阳（画在海面之前，地平线以下的部分由海水盖住）
 * ========================================================================== */

function drawSun(ctx, W, H, pal) {
  const sun = pal.sun;
  if (!sun) return;
  const alpha = clamp01(sun.alpha);
  if (alpha <= 0.02) return;
  const cx = clamp(sun.x, -0.2, 1.2) * W;
  const cy = clamp(sun.y, -0.2, 1.2) * H;
  const radius = Math.max(6, H * 0.028);

  const halo = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 7);
  halo.addColorStop(0, rgba(pal.horizonGlow, 0.42 * alpha));
  halo.addColorStop(0.35, rgba(pal.horizonGlow, 0.13 * alpha));
  halo.addColorStop(1, rgba(pal.horizonGlow, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 7, 0, TAU);
  ctx.fill();

  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  core.addColorStop(0, rgba(sun.color, alpha));
  core.addColorStop(0.72, rgba(sun.color, alpha * 0.92));
  core.addColorStop(1, rgba(sun.color, alpha * 0.5));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.fill();
}

/* ==========================================================================
 * 月亮：带缺口的圆盘，phase 决定亮面（0 = 朔，0.5 = 望）
 * ========================================================================== */

function drawMoon(ctx, W, H, pal) {
  const moon = pal.moon;
  if (!moon) return;
  const alpha = clamp01(moon.alpha);
  if (alpha <= 0.02) return;
  const cx = clamp(moon.x, -0.2, 1.2) * W;
  const cy = clamp(moon.y, -0.2, 1.2) * H;
  const radius = Math.max(5, H * 0.019);
  const phase = clamp01(num(moon.phase, 0.5));

  // 月晕
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius * 6);
  halo.addColorStop(0, rgba(moon.color, 0.26 * alpha));
  halo.addColorStop(0.4, rgba(moon.color, 0.08 * alpha));
  halo.addColorStop(1, rgba(moon.color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 6, 0, TAU);
  ctx.fill();

  // 亮面 = 半个圆盘 + 终结线椭圆回扫：rx = r·|cos(2πp)|，
  // 新月时椭圆与圆重合（面积 0），上下弦时退化成直线，望月时铺满整圆。
  const waxing = phase < 0.5;
  const p = waxing ? phase : 1 - phase;
  const rx = Math.max(0.01, radius * Math.abs(Math.cos(TAU * p)));

  ctx.save();
  if (!waxing) {
    // 亏月＝把上弦的亮面镜像到左半边
    ctx.translate(cx * 2, 0);
    ctx.scale(-1, 1);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, Math.PI / 2, false);
  if (typeof ctx.ellipse === 'function') {
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

/* ==========================================================================
 * L1 远海：低频起伏的地平线（噪声 × 0.08Hz，振幅 2–4px）+ 海面底色
 * ========================================================================== */

function farSeaNoise(u, t) {
  const w = TAU * L1.freq;
  return (
    Math.sin(u * L1.spatial + t * w) * 0.5 +
    Math.sin(u * L1.spatial * 2.6 - t * w * 1.7 + 1.1) * 0.3 +
    Math.sin(u * L1.spatial * 5.4 + t * w * 2.9 + 2.3) * 0.2
  );
}

function drawFarSea(ctx, W, H, horizonY, pal, t, px) {
  const amp = lerp(L1.ampMin, L1.ampMax, 0.5 + 0.5 * Math.sin(t * TAU * L1.freq)) * px;
  const step = Math.max(8, W / 80);
  const curve = (x) => horizonY - amp * (0.5 + 0.5 * farSeaNoise((x / Math.max(1, W)) * TAU, t));

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
  // 地平线附近是「把天空倒下来」的反射色，往下逐渐变成深水色
  const mirror = 0.45 + 0.25 * (1 - clamp01(pal.exposure)); // 太阳越低，掠射反射越亮
  gradient.addColorStop(0, mix(pal.seaFar, pal.skyBottom, mirror));
  gradient.addColorStop(0.18, mix(pal.seaFar, pal.skyBottom, mirror * 0.45));
  gradient.addColorStop(0.42, mix(pal.seaFar, pal.seaMid, 0.85));
  gradient.addColorStop(0.7, pal.seaMid);
  gradient.addColorStop(1, mix(pal.seaNear, pal.seaMid, 0.15));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, horizonY - amp - 2, W, H - horizonY + amp + 4);
  ctx.restore();

  // 水平雾带：厚度与浓度随曝光变化（越暗/越低的天越厚），把海天接缝糊掉
  const fogAmount = clamp01(0.3 + 0.5 * (1 - clamp01(pal.exposure)));
  const fogHeight = H * (0.045 + 0.085 * (1 - clamp01(pal.exposure)));
  const fogColor = mix(pal.skyBottom, pal.horizonGlow, 0.45);
  // 跨在地平线上的窄雾带：峰值正好压在地平线，天光不被糊成一条灰带
  const fog = ctx.createLinearGradient(0, horizonY - fogHeight * 0.45, 0, horizonY + fogHeight * 0.9);
  fog.addColorStop(0, rgba(fogColor, 0));
  fog.addColorStop(0.34, rgba(fogColor, 0.26 * fogAmount));
  fog.addColorStop(0.55, rgba(fogColor, 0.18 * fogAmount));
  fog.addColorStop(1, rgba(fogColor, 0));
  ctx.fillStyle = fog;
  ctx.fillRect(0, horizonY - fogHeight * 0.45, W, fogHeight * 1.35);

  // 地平线亮边
  ctx.beginPath();
  ctx.moveTo(0, curve(0));
  for (let x = step; x < W + step; x += step) {
    const xx = Math.min(x, W);
    ctx.lineTo(xx, curve(xx));
  }
  ctx.strokeStyle = rgba(mix(pal.seaFar, pal.foam, 0.3), 0.06 + 0.16 * clamp01(pal.exposure));
  ctx.lineWidth = Math.max(0.6, 1.1 * px);
  ctx.stroke();
}

/* ==========================================================================
 * 浪区（surf zone）—— 面向观察者推过来的浪
 *
 * 关键改变：波不再是「一行行各自横向平移的正弦线」，而是 N 条**横向贯通的波前**。
 * 每条波前有一个 depth ∈ (0,1]：depth 越大 = 越靠近观察者 = 画面越靠下、
 * 振幅越大、在屏幕上推进得越快。深度用取模滚动推进：
 *
 *     raw   = i / N + t / period
 *     depth = raw - floor(raw)          // 0 在地平线生成 → 1 在画面底部消失
 *
 * 波前横向的形状（三组正弦叠加）**挂在波前自己身上**：相位只由它的「编号」
 * （serial）决定，随波前一起往下走。所以看到的是「同一条浪朝我推过来」，
 * 而不是「条纹在横向滑动」。唯一随时间变化的相位是一个极慢的公共呼吸项
 * （让浪形轻微起伏），幅度小到不产生横向漂移感。
 * ========================================================================== */

const SURF = Object.freeze({
  fronts: 10, //                 同屏波前条数（再多就成了铺瓦）
  period: 5.4, //                秒：一条波前从地平线走到画面底部
  depthPower: 2.15, //           y = horizon + (H - horizon)·depth^p（近处行距更大）
  ampFar: 0.004, //              振幅（占海面高度比）——地平线附近几乎是平的
  ampNear: 0.075, //             最靠前的浪
  ampGuard: 0.55, //             振幅不超过「到下一条波前间距」的这个比例（防穿插）
  waveGrow: 0.85, //             近处横向波数乘这个（波长随 depth 变大，但别长到看不出起伏）
  overlap: 1.4, //               浪面的带高 = 到下一条波前间距 × 这个（>1 会重叠，近的盖住远的）
  foamStep: 0.035, //            泡沫沿波前的采样步长（占画面宽）
  foamSize: 5.6, //              泡沫斑块基准半高（px，1280 基准）
  breakDepth: 0.78, //           超过它进入 breaking（= 画面下 22%）
  tiltMax: 0.022, //             每条波前的低频倾斜幅度（占海面高度比，±）
  phaseShell: 2.6, //            横向相位错开幅度（rad，±）—— 相邻浪脊不同步，必须接近一整个周期
  grainPx: 2.0, //               地平线碎纹振幅（px）
  grainDepth: 0.25, //           碎纹只加在 depth 小于它的区域（= 地平线附近 1/4 屏）
  bandLight: 0.11, //            浪面内部的横向明暗幅度（互相遮蔽感）
  foamAspect: 5.5, //            泡沫长宽比（横向至少 4:1，贴着浪脊拉长）
  foamAlphaMax: 0.5, //          泡沫最大不透明度（太亮就像棉花）
  foamVisible: 0.22, //          低于它就算「不明显」的底层白气
});

/** 画面 y 随 depth 的映射（透视压缩：地平线附近密、近处疏）。 */
function depthToY(depth, H, horizonY) {
  return horizonY + Math.max(0, H - horizonY) * Math.pow(clamp01(depth), SURF.depthPower);
}

/**
 * 当前这一帧的全部波前（按 y 从远到近排好）。
 * 每条：depth / y / amp / waveScale / phase / serial / breaking
 */
function waveFronts(t, H, horizonY) {
  const scroll = t / SURF.period;
  const span = Math.max(1, H - horizonY);
  const list = [];

  for (let i = 0; i < SURF.fronts; i += 1) {
    const raw = i / SURF.fronts + scroll;
    const serial = Math.floor(raw); // 第几条浪（同一条浪的编号不变 → 形状不变）
    const depth = raw - serial;
    list.push({
      i,
      serial,
      depth: Math.max(0.0001, depth),
      y: depthToY(depth, H, horizonY),
      key: serial * 0.37 + i * 1.91,
    });
  }

  list.sort((a, b) => a.y - b.y); // 远 → 近，后画的盖住先画的

  for (let k = 0; k < list.length; k += 1) {
    const front = list[k];
    const nextY = k + 1 < list.length ? list[k + 1].y : H;
    const gap = Math.max(2, nextY - front.y);
    // 振幅：越近越大；breaking 的浪头再鼓一点（0.6Hz 起伏，L4 的节奏）
    let amp = span * lerp(SURF.ampFar, SURF.ampNear, Math.pow(front.depth, 0.85));
    amp *= 0.86 + 0.28 * hash1(front.key);
    front.breaking = front.depth >= SURF.breakDepth;
    if (front.breaking) {
      const bulge = 0.5 + 0.5 * Math.sin(TAU * L4.freq * t + hash1(front.key + 2.2) * TAU);
      amp *= 1 + 0.4 * bulge;
      front.bulge = bulge;
    }
    front.amp = Math.min(amp, gap * SURF.ampGuard); // 不许和下一条波前穿插
    // 每条浪的波长还各自差 ±18%：相邻浪脊的起伏节奏不同，才不会看出「同一条线往下搬」
    front.waveScale = lerp(1, SURF.waveGrow, front.depth) * (0.82 + 0.36 * hash1(front.serial * 11.7 + front.i * 5.3));
    front.phase = hash1(front.key + 7.7) * TAU; // 形状跟着浪走，不随时间推进

    // ── 去「一排排管子」：每条波前自己的低频倾斜与相位错开 ──
    const hTilt = hash1(front.serial * 3.11 + front.i * 7.77);
    const hShift = hash1(front.serial * 5.93 + front.i * 2.31);
    // 倾斜：近处更明显（±2.2% 屏高），让浪脊斜着走、相邻两条会交叉
    front.tiltPx = (hTilt - 0.5) * 2 * SURF.tiltMax * span * (0.3 + 0.7 * front.depth);
    // 横向相位错开 ±0.35rad：相邻波前的起伏不同步（同一条线不再被原样往下搬）
    front.shift = (hShift - 0.5) * 2 * SURF.phaseShell;
    // 高光「断成几段」用的低频包络相位
    front.envA = hash1(front.serial * 9.17 + front.i * 4.13) * TAU;
    front.envB = hash1(front.serial * 1.37 + front.i * 8.19) * TAU;
    // 行距本身也别等距：每条波前带一个随它走的竖向抖动（±0.22 间距），
    // 排序仍严格（<半个间距），但相邻高差不再是一条平滑的透视曲线
    front.jitterY = (hash1(front.serial * 7.31 + front.i * 3.17) - 0.5) * 0.44 * gap;
    // 地平线附近 1/4 屏的碎纹：振幅 1–2px（绝对像素），过了 0.25 就没有
    front.grainPx = SURF.grainPx * clamp01(1 - front.depth / SURF.grainDepth);
  }
  return list;
}

/**
 * 波前在横向 u01∈[0,1] 处的高程（-1..1，正数=浪峰抬起）。
 * 三组正弦叠加，横向波数随 depth 变小（近处波长更长）；相位来自波前自身。
 */
function crestOffset(front, u01, t) {
  const breathe = Math.sin(t * 0.13 + front.depth * 2.6) * 0.12; // 极慢呼吸，不是横向漂移
  let value = 0;
  for (let j = 0; j < 3; j += 1) {
    const waves = L2.waves[j] * front.waveScale;
    value += Math.sin(TAU * u01 * waves + front.phase + num(front.shift, 0) + j * L2.phaseGap + breathe * (j + 1)) * L2.weights[j];
  }
  // 高频细节：浪脊不是一根光滑的缎带，边缘总是碎的
  const detail = 4.5 + 2.5 * front.depth;
  value += Math.sin(TAU * u01 * detail + front.phase * 2.3 + num(front.shift, 0) * 2 + breathe * 2) * 0.06;
  value += Math.sin(TAU * u01 * (detail * 3.1) - front.phase * 1.4) * 0.03;
  return clamp(value, -1.35, 1.35);
}

/** 波前在 u01 处的屏幕 y：浪脊高程 + 低频倾斜 + 地平线附近的高频碎纹。 */
function crestY(front, u01, t) {
  const tilt = (u01 - 0.5) * num(front.tiltPx, 0);
  const grainPx = num(front.grainPx, 0);
  let grain = 0;
  if (grainPx > 0.01) {
    // 碎纹：两条高频正弦，挂在波前上（跟着浪走），只为把带隙抹糊
    grain =
      grainPx *
      (Math.sin(TAU * u01 * 37 + front.phase * 3.1) * 0.6 + Math.sin(TAU * u01 * 71 - front.phase * 1.7) * 0.4);
  }
  return front.y + num(front.jitterY, 0) - front.amp * crestOffset(front, u01, t) + tilt + grain;
}

/**
 * 画整片浪区：从远到近，每条波前 =「浪峰面（亮）+ 波谷（暗）」一整条竖向渐变，
 * 下边界正好是下一条波前的浪脊，所以相邻两条严丝合缝、不重叠也不留缝。
 * 返回 fronts 供泡沫/碎光继续用。
 */
function drawSurf(ctx, W, H, t, pal, tideN, px) {
  const horizonY = H * HORIZON + tideN * H * 0.006;
  const fronts = waveFronts(t, H, horizonY);
  const exposure = clamp01(pal.exposure);
  const light = 0.35 + 0.65 * exposure; // 没光了就别描白线
  const skyMirror = mix(pal.skyBottom, pal.seaFar, 0.35);
  const deep = mix(pal.seaNear, pal.seaMid, 0.15);
  const troughTint = mix(pal.seaNear, '#02040a', 0.55);
  const crestTint = mix(pal.foam, pal.horizonGlow, 0.45);
  const steps = Math.max(36, Math.round(W / 14));
  const STOPS = 28; // 横向高光的渐变档数（沿浪脊平滑变化，不是一条平齐的亮线）

  for (let k = 0; k < fronts.length; k += 1) {
    const front = fronts[k];
    const nextY = k + 1 < fronts.length ? fronts[k + 1].y : H;
    const gap = Math.max(3, nextY - front.y);
    const bandH = Math.max(6, gap * SURF.overlap); // 带子跨过下一条波前 → 重叠，近的盖远的

    // 这一行的水色：掠射的远水反射天空，近水是深水色
    const reflect = clamp01(1 - front.depth) * lerp(0.42, 0.84, 1 - exposure);
    const water = mix(deep, skyMirror, reflect);
    const frontLight = 0.7 + 0.55 * hash1(front.key + 11.1); // 每条浪的醒目程度不同
    const crestColor = mix(water, crestTint, (0.09 + 0.3 * front.depth) * light * frontLight);
    const midColor = mix(water, troughTint, 0.14 + 0.16 * front.depth);
    const troughColor = mix(water, troughTint, 0.3 + 0.18 * front.depth);

    // 浪面：上边界是浪脊曲线，下边界是一条平线 → 带子厚度随浪脊高低变化
    // （若下边界也跟着弯，每条带就成了等宽的「管子」，一眼假）
    const bottomY = Math.min(H + bandH, front.y + gap * 1.15);
    ctx.beginPath();
    for (let s0 = 0; s0 <= steps; s0 += 1) {
      const u = s0 / steps;
      const y = crestY(front, u, t) - front.amp * 0.5;
      if (s0 === 0) ctx.moveTo(u * W, y);
      else ctx.lineTo(u * W, y);
    }
    ctx.lineTo(W, bottomY);
    ctx.lineTo(0, bottomY);
    ctx.closePath();
    const faceTop = Math.max(0, front.y - front.amp * 1.05);
    const face = ctx.createLinearGradient(0, faceTop, 0, bottomY);
    // 上沿先用透明过渡（软边界），再进入浪峰亮色 → 不会出现「亮边压在暗块上」的岩层感
    face.addColorStop(0, rgba(crestColor, 0.25));
    face.addColorStop(0.14, rgba(crestColor, 0.95));
    face.addColorStop(0.45, midColor);
    face.addColorStop(1, troughColor);
    ctx.fillStyle = face;
    ctx.fill();

    // 同一块浪面再叠一层横向低频明暗：这一段被前面的浪遮住、那一段被照亮
    // （路径还在，直接换 fillStyle 再 fill 一次即可）
    const occl = ctx.createLinearGradient(0, 0, W, 0);
    for (let s0 = 0; s0 < 8; s0 += 1) {
      const u0 = s0 / 8;
      const k = 0.5 + 0.5 * Math.sin(TAU * 2.1 * u0 + front.envA * 1.7);
      occl.addColorStop(u0, rgba(troughTint, SURF.bandLight * (0.35 + 0.65 * k)));
    }
    occl.addColorStop(1, rgba(troughTint, 0.02));
    ctx.fillStyle = occl;
    ctx.fill();

    // 沿浪脊的明暗（横向渐变）：浪脊高的地方亮、低的地方暗。
    // 同一条渐变既用来铺浪面上半部、也用来描浪脊线 —— 横向有明暗，才不像肋条。
    const sheen = ctx.createLinearGradient(0, 0, W, 0);
    for (let s0 = 0; s0 < STOPS; s0 += 1) {
      const u0 = s0 / STOPS;
      const u1 = (s0 + 1) / STOPS;
      // 沿浪脊的哈希抖动：让「亮斑/暗斑」沿一条浪脊不匀（等距就会看出虚纹）
      const patch = (hash1(front.key + s0 * 3.7) - 0.5) * 0.85;
      const h = crestOffset(front, (u0 + u1) / 2, t) + patch;
      // 低频包络：把高光打断成「几段亮、几段暗」，暗处回到水色
      const env = Math.pow(0.5 + 0.5 * Math.sin(TAU * 3.1 * u0 + front.envA) * Math.sin(TAU * 1.7 * u0 + front.envB), 1.7);
      const a = clamp01(0.34 + 0.66 * h) * env;
      sheen.addColorStop(clamp01(u0), rgba(mix(water, crestTint, (0.3 + 0.45 * front.depth) * light), (0.05 + 0.3 * front.depth) * light * a * frontLight));
    }
    sheen.addColorStop(1, rgba(mix(water, crestTint, 0.3 * light), 0.02));

    ctx.beginPath();
    for (let s0 = 0; s0 <= steps; s0 += 1) {
      const u = s0 / steps;
      const y = crestY(front, u, t);
      if (s0 === 0) ctx.moveTo(u * W, y);
      else ctx.lineTo(u * W, y);
    }
    const hlThick = Math.max(1.5, front.amp * (0.3 + 0.22 * front.depth));
    for (let s0 = steps; s0 >= 0; s0 -= 1) {
      const u = s0 / steps;
      ctx.lineTo(u * W, crestY(front, u, t) + hlThick);
    }
    ctx.closePath();
    ctx.fillStyle = sheen;
    ctx.fill();

    // 浪脊线：用同一条横向渐变描，亮暗跟着浪脊走
    ctx.beginPath();
    for (let s0 = 0; s0 <= steps; s0 += 1) {
      const u = s0 / steps;
      const y = crestY(front, u, t);
      if (s0 === 0) ctx.moveTo(u * W, y);
      else ctx.lineTo(u * W, y);
    }
    ctx.strokeStyle = sheen;
    ctx.lineWidth = (0.4 + 1.1 * front.depth) * px;
    ctx.stroke();

    // breaking：浪后压暗 + 浪顶白沫沿波前横向铺开（近景才有）
    if (front.breaking) drawBreakingFace(ctx, W, H, pal, t, front, px);
  }

  return fronts;
}

/** 单次翻白事件的包络：一次涨、一次落，一个周期只翻一次（契约 L4）。 */
function whitecapEnvelope(t) {
  const period = L4.eventPeriod;
  const phase = (((t % period) + period) % period) / period;
  if (phase < L4.eventRise) return clamp01(phase / L4.eventRise);
  const decay = (phase - L4.eventRise) / L4.eventDecay;
  return decay >= 1 ? 0 : clamp01(1 - decay);
}

/**
 * breaking 浪头：浪后（屏幕上方的背面）压暗，浪顶一条逐渐变宽的白沫卷边。
 * 白沫的强弱与横向范围由 0.6Hz 的鼓起程度 + 单次翻白事件共同决定。
 */
function drawBreakingFace(ctx, W, H, pal, t, front, px) {
  void H;
  const steps = Math.max(24, Math.round(W / 20));
  const bulge = clamp01(num(front.bulge, 0.5));
  const burst = whitecapEnvelope(t); // 单次大翻白（保留 L4 的事件）
  const strength = clamp01(0.25 + 0.55 * bulge + 0.5 * burst);
  const crestTint = mix(pal.foam, pal.horizonGlow, 0.35);
  const shadeDepth = (0.045 + 0.03 * front.depth) * H; // 浪后压暗的厚度

  // 1) 浪后压暗：从浪脊往上（更远处）一层深色，制造「浪头立起来」的体量
  ctx.beginPath();
  for (let s = 0; s <= steps; s += 1) {
    const u = s / steps;
    ctx.lineTo(u * W, crestY(front, u, t));
  }
  ctx.lineTo(W, crestY(front, 1, t) - shadeDepth);
  ctx.lineTo(0, crestY(front, 0, t) - shadeDepth);
  ctx.closePath();
  const shade = ctx.createLinearGradient(0, front.y - front.amp - shadeDepth, 0, front.y);
  shade.addColorStop(0, rgba('#04070f', 0));
  shade.addColorStop(1, rgba('#04070f', 0.18 + 0.24 * strength));
  ctx.fillStyle = shade;
  ctx.fill();

  // 2) 浪顶白沫：沿波前连续铺开的一条白边（浪脊越高越白越厚）
  ctx.beginPath();
  for (let s = 0; s <= steps; s += 1) {
    const u = s / steps;
    const h = crestOffset(front, u, t);
    const thick = front.amp * (0.12 + 0.5 * clamp01(h)) * (0.5 + 0.9 * strength);
    ctx.lineTo(u * W, crestY(front, u, t) + thick);
  }
  for (let s = steps; s >= 0; s -= 1) {
    const u = s / steps;
    ctx.lineTo(u * W, crestY(front, u, t) - front.amp * 0.06);
  }
  ctx.closePath();
  const foam = ctx.createLinearGradient(0, front.y - front.amp * 0.2, 0, front.y + front.amp * 0.7);
  foam.addColorStop(0, rgba(crestTint, clamp01(0.3 * strength)));
  foam.addColorStop(0.55, rgba(crestTint, clamp01(0.62 * strength)));
  foam.addColorStop(1, rgba(crestTint, clamp01(0.1 * strength)));
  ctx.fillStyle = foam;
  ctx.fill();

  // 3) 大翻白：一个横向位置上的爆白团，随波前一起下移
  if (burst > 0.05) {
    const centerU = clamp(0.5 + 0.32 * Math.sin(t * 0.19), 0.08, 0.92);
    const width = (0.1 + 0.07 * front.depth) * W;
    ctx.fillStyle = rgba(crestTint, clamp01(0.5 * burst));
    for (let i = 0; i < 4; i += 1) {
      const u = clamp(centerU + (hash1(i * 4.3 + front.serial) - 0.5) * 0.12, 0.02, 0.98);
      const y = crestY(front, u, t) + front.amp * (0.08 + 0.3 * hash1(i * 2.1 + front.key));
      blob(ctx, u * W, y, width * (0.12 + 0.2 * hash1(i * 7.3)), Math.max(1, front.amp * 0.18 * (0.7 + hash1(i * 3.9))));
    }
  }
  void px;
}

/**
 * 细碎纹理：整片海面撒一层很小的亮点/暗点。
 * 没有这一层，浪面就是大片平滑渐变 —— 一眼就能看出是画的。
 * 密度与亮度跟着「离浪脊多近」和「还有多少光」走，越远越密（透视）。
 */
function surfTexture(ctx, W, H, t, pal, tideN, px, fronts) {
  const horizonY = H * HORIZON + tideN * H * 0.006;
  const exposure = clamp01(pal.exposure);
  const count = Math.round(clamp(W / 3.2, 200, 700));
  const skyMirror = mix(pal.skyBottom, pal.seaFar, 0.35);
  const deep = mix(pal.seaNear, pal.seaMid, 0.15);
  const lightTint = mix(pal.foam, pal.horizonGlow, 0.35);
  const darkTint = mix(pal.seaNear, '#02040a', 0.6);

  for (let i = 0; i < count; i += 1) {
    const r1 = hash1(i * 1.7 + 0.31);
    const r2 = hash1(i * 3.9 + 0.77);
    const r3 = hash1(i * 7.1 + 0.13);
    // 透视：u² 让样本在地平线附近更密
    const depth = Math.pow(r1, 1.7) * 0.98 + 0.01;
    const y = depthToY(depth, H, horizonY) + (r2 - 0.5) * H * 0.006;
    if (y < horizonY || y > H) continue;
    const u = r3;
    // 离最近的一条浪脊多近（越近越亮）
    let near = 0;
    for (let k = 0; k < fronts.length; k += 1) {
      const front = fronts[k];
      if (Math.abs(front.depth - depth) > 0.06) continue;
      const h = crestOffset(front, u, t);
      if (h > 0) near = Math.max(near, h);
    }
    const water = mix(deep, skyMirror, clamp01(1 - depth) * lerp(0.42, 0.84, 1 - exposure));
    const bright = hash1(i * 11.3 + t * 0.13) > 0.42;
    const alpha = (0.07 + 0.26 * near) * (0.4 + 0.6 * exposure) * (0.5 + 0.5 * r2);
    if (alpha <= 0.02) continue;
    ctx.fillStyle = rgba(bright ? mix(water, lightTint, 0.5) : darkTint, alpha);
    const w = (1 + 2.4 * r2) * px * (0.7 + 1.2 * depth);
    ctx.fillRect(u * W, y, w, Math.max(0.7, 0.9 * px));
  }
}

/**
 * 泡沫：沿每条波前的**浪脊**连续分布的斑块（不是网格、不是虚线）。
 * 位置由 (波前编号, 沿浪脊的采样序号) 哈希决定 → 斑块跟着浪一起往下走。
 */
function surfFoam(ctx, W, H, t, pal, tideN, px, fronts) {
  const exposure = clamp01(pal.exposure);
  const coverage = clamp(lerp(L3.coverageMin, L3.coverageMax, clamp01(0.55 + 0.45 * tideN)), L3.coverageMin, L3.coverageMax);
  const foamTint = mix(pal.foam, pal.horizonGlow, 0.4);
  const step = Math.max(0.012, SURF.foamStep);
  const alphaBase = clamp01(0.35 + 0.75 * exposure);

  for (let k = 0; k < fronts.length; k += 1) {
    const front = fronts[k];
    // 只在浪脊最高的那几段起白：一屏能数出来的白斑就 4–8 处
    const gate = 0.55 - 0.5 * coverage * 6;
    const density = 0.12 + coverage * 1.6;
    const slots = Math.max(20, Math.round(1 / step));
    for (let s0 = 0; s0 < slots; s0 += 1) {
      const pick = hash1(front.key * 5.3 + s0 * 1.37);
      if (pick > density) continue;
      // 位置抖开 ±0.1 屏宽：相邻斑块可以并成一片，也不会排成等距虚线
      const u = clamp01((s0 + 0.5 + (hash1(front.key * 2.9 + s0 * 2.7) - 0.5) * 2.6) / slots);
      const h = crestOffset(front, u, t);
      if (h < gate) continue;
      const jitter = hash1(front.key * 4.1 + s0 * 3.3);
      const x = (u + (jitter - 0.5) * step * 0.6) * W;
      const life = 0.55 + 0.45 * Math.sin(t * TAU * 0.23 + u * 9.0 + front.depth * 4.0);
      const scale = 0.55 + 0.9 * hash1(front.key + u * 13.0);
      const alpha = Math.min(
        SURF.foamAlphaMax,
        clamp01((h - gate) / (1 - gate)) * alphaBase * (0.55 + 0.35 * front.depth) * (0.6 + 0.4 * life),
      );
      if (alpha <= 0.03) continue;
      // 贴着浪脊走：半宽随 depth 放大，长宽比 ≥ 4:1（不再是圆斑）
      const y0 = crestY(front, u, t) + front.amp * 0.06;
      const height = Math.max(0.8, SURF.foamSize * px * (0.55 + 0.9 * front.depth) * scale);
      const width = height * (SURF.foamAspect + 1.5 * front.depth);
      ctx.fillStyle = rgba(foamTint, alpha);
      blob(ctx, x, y0, width, height);
      // 拖尾：朝观察者（画面下方）淡出的一小片，像被浪推着走
      ctx.fillStyle = rgba(foamTint, alpha * 0.34);
      blob(ctx, x + width * 0.1, y0 + height * 1.9, width * 0.45, Math.max(0.6, height * 0.5));
    }

    // 底层白气：沿浪脊拉得很长、很薄、很淡。铺出「白沫沿着浪脊走」的连续感，
    // 同时把覆盖率顶进契约的 3%–9%，但不会出现一粒粒可见的白斑。
    for (let k = 0; k < 3; k += 1) {
      const u2 = clamp01(hash1(front.key * 6.1 + k * 17.3) * 0.8 + 0.1);
      const h2 = crestOffset(front, u2, t);
      if (h2 < gate - 0.25) continue;
      const breathe2 = 0.5 + 0.5 * Math.sin(t * TAU * 0.19 + k * 2.1 + front.depth * 3);
      ctx.fillStyle = rgba(foamTint, 0.05 + 0.04 * breathe2);
      blob(
        ctx,
        u2 * W,
        crestY(front, u2, t) + front.amp * 0.04,
        W * (0.055 + 0.05 * front.depth),
        Math.max(0.9, SURF.foamSize * px * 0.3 * (0.7 + 0.8 * front.depth)),
      );
    }
  }
}

/**
 * 碎光：在浪脊上按「哪一面朝向太阳」点亮（不是一条固定的竖光柱）。
 * 横向斜率决定是左坡还是右坡朝光，离太阳方位角越近越亮，逐片自己的闪灭相位。
 */
function surfSpecular(ctx, W, H, t, pal, fronts, px) {
  const body = pal.sun || pal.moon;
  if (!body) return;
  const sunU = clamp(body.x, 0, 1);
  const floorY = pal.sun ? 0.34 : 0.1;
  const spanK = pal.sun ? 0.18 : 0.3;
  const intensity = clamp01((body.y - floorY) / spanK) * clamp01(body.alpha);
  if (intensity <= 0.05) return;
  const tint = pal.sun ? mix(pal.horizonGlow, '#ffffff', 0.62) : mix(pal.moon.color, '#ffffff', 0.45);
  const step = Math.max(0.02, SURF.foamStep * 0.7);
  const eps = 0.004;

  for (let k = 0; k < fronts.length; k += 1) {
    const front = fronts[k];
    if (front.depth < 0.04) continue;
    for (let u = 0; u < 1; u += step) {
      const h = crestOffset(front, u, t);
      if (h < 0.3) continue; // 只有浪脊顶才反光
      // 朝光的那一侧：横向斜率 × 太阳在左/在右
      const slope = (crestOffset(front, u + eps, t) - crestOffset(front, u - eps, t)) / (2 * eps);
      const facing = clamp01(0.5 + 0.5 * slope * (u < sunU ? 1 : -1));
      const nearSun = 1 - Math.min(1, Math.abs(u - sunU) * 1.6);
      const seed = hash1(front.key * 3.3 + u * 71.0);
      const twinkle = Math.pow(0.5 + 0.5 * Math.sin(t * (1.2 + seed * 3.4) + u * 33.0), 3);
      const alpha = intensity * facing * (0.3 + 0.7 * nearSun) * (0.18 + 0.82 * twinkle) * (0.35 + 0.55 * front.depth);
      if (alpha <= 0.03) continue;
      ctx.fillStyle = rgba(tint, alpha);
      blob(
        ctx,
        u * W,
        crestY(front, u, t) + front.amp * 0.06,
        (1.1 + 3.2 * front.depth) * (0.55 + 0.8 * twinkle) * px,
        Math.max(0.7, (0.6 + 0.9 * front.depth) * px),
      );
    }
  }
}
/* ==========================================================================
 * 媒体层（契约 A3）：真实照片/视频做基底，上叠天光罩 / 水面呼吸 / 地平线雾 / 暗角
 * 加载失败、解码失败、跨域被拒一律静默退回程序化海（见组件里的 asset 控制器）
 * ========================================================================== */

/** 设置里的 media.grade（0..1，0=原图）。缺字段/非法 → 0.55。 */
function gradeOf(media) {
  if (!media || typeof media !== 'object') return 0.55;
  const flat = media.grade !== undefined ? media.grade : media.settings && media.settings.grade;
  return clamp01(num(flat, 0.55));
}

/** 设置里的 media.motion（0..1，0=完全静止）。缺字段/非法 → 0.5。 */
function motionOf(media) {
  if (!media || typeof media !== 'object') return 0.5;
  const flat = media.motion !== undefined ? media.motion : media.settings && media.settings.motion;
  return clamp01(num(flat, 0.5));
}

/** 字符串 → 0..1 的稳定哈希（同一张素材每次浮现推拉方向一致）。 */
function hashString(text) {
  const source = typeof text === 'string' ? text : '';
  let h = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}

/** 设合成模式并执行；浏览器不支持该模式时自动退回 source-over（不抛）。 */
function withComposite(ctx, op, paint) {
  const previous = ctx.globalCompositeOperation;
  try {
    ctx.globalCompositeOperation = op;
  } catch (_error) {
    /* ignore */
  }
  if (ctx.globalCompositeOperation !== op) ctx.globalCompositeOperation = 'source-over';
  try {
    paint();
  } finally {
    ctx.globalCompositeOperation = previous || 'source-over';
  }
}

/** 全屏一次混色（alpha 用来减弱合成强度）。 */
function compositeFill(ctx, op, color, alpha, W, H) {
  const a = clamp01(alpha);
  if (a <= 0.003) return;
  withComposite(ctx, op, () => {
    ctx.fillStyle = rgba(color, a);
    ctx.fillRect(0, 0, W, H);
  });
}

/**
 * 天光罩：把素材按「此刻的天光」调色。
 * 夜里真的压暗（multiply），正午提亮（screen），晨昏偏橘/紫（soft-light 统一色温）。
 */
function drawMediaGrade(ctx, W, H, pal, grade) {
  const g = clamp01(grade);
  if (g <= 0.01) return;
  const exposure = clamp01(pal.exposure);
  const lowSun = 1 - exposure; //            0 正午 → 1 深夜
  const darkness = clamp01((0.95 - exposure) / 0.65); // 正午 0 → 深夜 1（按五档 exposure 标定）
  const tint = mix(pal.seaMid, pal.horizonGlow, clamp01(0.2 + 0.75 * lowSun));
  const shade = mix(tint, '#03060e', clamp01(0.4 + 0.55 * darkness));

  // 1) multiply 压暗 + 上色（夜里真的压下去）
  compositeFill(ctx, 'multiply', shade, clamp01(g * (0.08 + 0.9 * darkness)), W, H);
  // 2) 深夜再压一层：一张正午照片要变成夜，一层 multiply 不够
  if (darkness > 0.2) compositeFill(ctx, 'multiply', '#04070f', clamp01((g * 0.4 * (darkness - 0.2)) / 0.8), W, H);
  // 3) screen 提亮（正午要更亮）
  compositeFill(ctx, 'screen', mix(pal.horizonGlow, '#ffffff', 0.5), clamp01(g * (0.1 + 0.16 * exposure)), W, H);
  // 4) soft-light 统一色温（晨昏偏橘/紫、夜里偏靛）
  compositeFill(ctx, 'soft-light', tint, clamp01(g * 0.55), W, H);
}

/**
 * 顶部天光蒙版：让照片的天变成「此刻的天」。
 * 两道：先 multiply 用调亮过的天空色把亮度拉到位（同时把色相带过去），
 * 再叠一层很淡的同色纱，让色相更明确（multiply 对色相改动有限）。
 */
function drawMediaSkyMask(ctx, W, H, pal, grade) {
  const g = clamp01(grade);
  if (g <= 0.01) return;
  const bottom = H * MEDIA.skyMaskBottom;

  const shade = ctx.createLinearGradient(0, 0, 0, bottom);
  shade.addColorStop(0, rgba(mix('#ffffff', pal.skyTop, 0.62), 0.9 * g));
  shade.addColorStop(0.45, rgba(mix('#ffffff', pal.skyMid, 0.5), 0.72 * g));
  shade.addColorStop(1, rgba(mix('#ffffff', pal.skyBottom, 0.3), 0));
  withComposite(ctx, 'multiply', () => {
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

/** 水面呼吸的高光扫过：极薄一条亮带自上而下，0.11Hz，两端淡出。 */
function drawMediaSweep(ctx, W, H, pal, t, motion, grade) {
  const phase = (((t * MEDIA.breathFreq) % 1) + 1) % 1;
  const bandHeight = H * MEDIA.sweepHeight;
  const y = -bandHeight + phase * (H + bandHeight * 2);
  const strength = Math.sin(Math.PI * phase);
  const alpha = 0.05 * strength * (0.45 + 0.75 * clamp01(grade)) * (0.5 + 0.5 * clamp01(motion));
  if (alpha <= 0.004) return;
  const sweep = ctx.createLinearGradient(0, y, 0, y + bandHeight);
  sweep.addColorStop(0, rgba(pal.foam, 0));
  sweep.addColorStop(0.5, rgba(mix(pal.horizonGlow, '#ffffff', 0.4), alpha));
  sweep.addColorStop(1, rgba(pal.foam, 0));
  withComposite(ctx, 'screen', () => {
    ctx.fillStyle = sweep;
    ctx.fillRect(0, y, W, bandHeight);
  });
}

/** 轻暗角。 */
function drawVignette(ctx, W, H, strength) {
  const s = clamp01(strength);
  if (s <= 0.01) return;
  const gradient = ctx.createRadialGradient(W * 0.5, H * 0.46, Math.min(W, H) * 0.34, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, rgba('#000000', s));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

/**
 * 画一帧媒体素材。成功画了返回 true；不可画（未就绪 / 没有帧 / 元素缺失）
 * 返回 false，调用方据此退回程序化海 —— 绝不留黑帧。
 */
function renderMediaScene(ctx, W, H, t, pal, asset, media, warmth) {
  const el = asset && asset.el;
  if (!el) return false;
  let iw = 0;
  let ih = 0;
  if (asset.kind === 'video') {
    if (num(el.readyState, 0) < 2) return false; // 还没有可画帧
    iw = num(el.videoWidth, 0);
    ih = num(el.videoHeight, 0);
  } else {
    iw = num(el.naturalWidth, num(asset.w, 0));
    ih = num(el.naturalHeight, num(asset.h, 0));
  }
  if (!iw || !ih) return false;

  const motion = motionOf(media);
  const grade = gradeOf(media);
  const seed = clamp01(num(asset.seed, 0));

  // Ken Burns：40s 一个来回，缩放 1.0→1.06 + 轻微平移；方向由素材哈希决定，会话内固定
  const phase = (((t / MEDIA.kenBurnsPeriod + seed) % 1) + 1) % 1;
  const ease = 0.5 - 0.5 * Math.cos(TAU * phase);
  const zoom = MEDIA.overscan + MEDIA.kenBurnsZoom * motion * (0.35 + 0.65 * ease);
  const scale = Math.max(W / iw, H / ih) * zoom;
  const dw = Math.max(W + 2, iw * scale);
  const dh = Math.max(H + 2, ih * scale);
  const marginX = Math.max(0, (dw - W) / 2);
  const marginY = Math.max(0, (dh - H) / 2);
  const panX = marginX * 0.8 * motion * Math.sin(TAU * phase + seed * TAU);
  const panY = marginY * 0.5 * motion * Math.cos(TAU * phase * 0.71 + seed * 5.1);
  // 水面呼吸的横向位移（1–2px）：叠在平移上，钳在超采样余量内，永不留边
  const breath = motion > 0.02 ? Math.sin(TAU * MEDIA.breathFreq * t) * MEDIA.breathPx * (0.4 + 0.6 * motion) : 0;
  const dx = (W - dw) / 2 + clamp(panX + breath, -marginX, marginX);
  const dy = (H - dh) / 2 + clamp(panY, -marginY, marginY);

  ctx.drawImage(el, dx, dy, dw, dh);

  drawMediaGrade(ctx, W, H, pal, grade); // 1) 天光罩
  drawMediaSweep(ctx, W, H, pal, t, motion, grade); // 2) 水面呼吸（高光扫过）
  drawMediaSkyMask(ctx, W, H, pal, grade); // 3) 地平线雾 / 顶部天光蒙版
  drawVignette(ctx, W, H, MEDIA.vignette * (0.5 + 0.5 * grade)); // 4) 暗角

  if (warmth) {
    ctx.fillStyle = rgba(warmth > 0 ? '#ffb066' : '#6fa8ff', Math.abs(warmth) * 0.9);
    ctx.fillRect(0, 0, W, H);
  }
  return true;
}

/* ==========================================================================
 * 整帧
 * ========================================================================== */

/**
 * 仅测试用：最近一帧真正用的 t（秒）。
 * 假 canvas 环境里没法从绘图指令反解 t，用它验证「停帧恢复不跳变 / 掉帧不改海速」。
 */
let lastRenderTime = 0;
export function __lastRenderTime() {
  return lastRenderTime;
}

function renderScene(ctx, W, H, t, pal, tideN, warmth) {
  lastRenderTime = t;
  const px = clamp(H / 720, 0.65, 1.8);
  const nearLift = tideN * H * 0.006; // 潮位只让水位线轻微起伏，不喧宾夺主
  const horizonY = H * HORIZON + nearLift;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;

  // L0 天空（+ 星）
  drawSky(ctx, W, H, horizonY, pal);
  drawStars(ctx, W, H, horizonY, pal, t);

  // 天体在海面之前画：地平线以下的部分自然被海水盖住
  drawSun(ctx, W, H, pal);
  drawMoon(ctx, W, H, pal);

  // L1 远海
  drawFarSea(ctx, W, H, horizonY, pal, t, px);

  // 浪区：N 条波前从地平线朝观察者推过来（一次画完，返回 fronts 给泡沫/碎光用）
  const fronts = drawSurf(ctx, W, H, t, pal, tideN, px);
  surfTexture(ctx, W, H, t, pal, tideN, px, fronts);
  surfFoam(ctx, W, H, t, pal, tideN, px, fronts);
  surfSpecular(ctx, W, H, t, pal, fronts, px);

  // reducedMotion 的「色温微变」：极薄一层冷暖罩，alpha ≈ 0.02
  if (warmth) {
    ctx.fillStyle = rgba(warmth > 0 ? '#ffb066' : '#6fa8ff', Math.abs(warmth) * 0.9);
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

/* ==========================================================================
 * 组件
 * ========================================================================== */

const HOST_STYLE = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  overflow: 'hidden',
  pointerEvents: 'none', // 装饰层：点击/拖拽都留给覆盖层自己处理
  background: '#0b1220',
};

const CANVAS_STYLE = {
  display: 'block',
  width: '100%',
  height: '100%',
  border: 'none',
  background: 'transparent',
};

export default function SeaCanvas({ now, media, form, paused, reducedMotion, onStats }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const nowRef = useRef(now);
  const mediaRef = useRef(media);
  const formRef = useRef(form);
  const pausedRef = useRef(Boolean(paused));
  const reducedRef = useRef(Boolean(reducedMotion));
  const statsRef = useRef(onStats);
  const apiRef = useRef(null);

  // ── props 变化只更新 ref，不重建渲染循环 ───────────────────────────────
  useEffect(() => {
    nowRef.current = now;
    const api = apiRef.current;
    if (api) api.refreshNow();
  }, [now]);

  useEffect(() => {
    mediaRef.current = media;
    const api = apiRef.current;
    // 只换设置（grade/motion）不重载素材：加载器内部按 kind|url 判重
    if (api) api.setMedia(media);
  }, [media]);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    statsRef.current = onStats;
  }, [onStats]);

  useEffect(() => {
    pausedRef.current = Boolean(paused);
    const api = apiRef.current;
    if (api) api.sync();
  }, [paused]);

  useEffect(() => {
    reducedRef.current = Boolean(reducedMotion);
    const api = apiRef.current;
    if (api) api.sync();
  }, [reducedMotion]);

  // ── 挂载一次：建缓冲、起循环、装监听；卸载全部收干净 ────────────────────
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;

    const perfNow =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? () => performance.now()
        : () => Date.now();

    const state = {
      alive: true,
      mode: 'off', //            'anim' | 'static' | 'off'
      hidden: typeof document !== 'undefined' ? document.hidden === true : false,
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
      mediaCap: false, //         媒体就绪 → 缓冲上限提到 2560
      staticStep: 0,
    };

    // 2D context：拿不到（或抛错）就退回 CSS 渐变静态海，绝不抛
    try {
      state.ctx = canvas.getContext('2d', { alpha: false });
    } catch (_error) {
      state.ctx = null;
    }
    if (!state.ctx) {
      try {
        state.ctx = canvas.getContext('2d');
      } catch (_error) {
        state.ctx = null;
      }
    }
    if (!state.ctx) {
      try {
        canvas.style.display = 'none';
      } catch (_error) {
        /* ignore */
      }
    }

    /* ---------- 媒体素材（image / video）---------- */

    const asset = { key: '', kind: null, el: null, ready: false, failed: false, w: 0, h: 0, seed: 0 };

    const bufferCap = () => (state.mediaCap ? TUNING.mediaBufferWidth : TUNING.maxBufferWidth);

    function teardownAsset() {
      const el = asset.el;
      asset.el = null;
      asset.kind = null;
      asset.key = '';
      asset.ready = false;
      asset.failed = false;
      asset.w = 0;
      asset.h = 0;
      asset.seed = 0;
      if (!el) return;
      try {
        if (typeof el.pause === 'function') el.pause();
      } catch (_error) {
        /* ignore */
      }
      try {
        if (typeof el.removeAttribute === 'function') el.removeAttribute('src');
      } catch (_error) {
        /* ignore */
      }
      try {
        if (typeof el.load === 'function') el.load(); // 停掉解码、释放缓冲
      } catch (_error) {
        /* ignore */
      }
    }

    function setVideoPlaying(playing) {
      const el = asset.el;
      if (!el || asset.kind !== 'video') return;
      try {
        if (playing) {
          const started = el.play();
          if (started && typeof started.catch === 'function') started.catch(() => {});
        } else if (typeof el.pause === 'function') {
          el.pause();
        }
      } catch (_error) {
        /* ignore：自动播放被拒也无所谓，帧还在 */
      }
    }

    function onMediaReady() {
      state.mediaCap = true; // 照片要清晰度：上限 1280 → 2560
      measureNow();
      if (state.mode !== 'anim') draw(perfNow());
    }

    function onMediaFailed() {
      state.mediaCap = false; // 退回程序化海，缓冲也缩回去
      measureNow();
    }

    /**
     * 载入一轮媒体素材。失败（加载/解码/跨域/不支持）一律静默：
     * 只剩 failed 标记，画面照旧走程序化海，不抛、不黑屏。
     */
    function loadAsset(next) {
      teardownAsset();
      if (!next || typeof next !== 'object') return;
      const kind = next.kind === 'video' ? 'video' : next.kind === 'image' ? 'image' : null;
      const url = typeof next.url === 'string' ? next.url.trim() : '';
      if (!kind || !url) return;

      asset.key = kind + '|' + url;
      asset.kind = kind;
      asset.seed = hashString(asset.key); // 会话内固定：同一张图推拉方向一致

      try {
        if (kind === 'image') {
          const img = new Image();
          asset.el = img;
          img.onload = () => {
            if (asset.el !== img) return;
            const w = num(img.naturalWidth, 0);
            const h = num(img.naturalHeight, 0);
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
          // 契约：不设 crossOrigin、不读像素（同源 /media/file 就够）
          try {
            img.decoding = 'async';
          } catch (_error) {
            /* ignore */
          }
          img.src = url;
        } else {
          const video = document.createElement('video');
          asset.el = video;
          video.muted = true;
          video.loop = true;
          video.autoplay = true;
          video.preload = 'auto';
          try {
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.setAttribute('muted', '');
            video.setAttribute('disableremoteplayback', '');
          } catch (_error) {
            /* ignore */
          }
          const markReady = () => {
            if (asset.el !== video) return;
            const w = num(video.videoWidth, 0);
            const h = num(video.videoHeight, 0);
            if (!w || !h) return;
            asset.w = w;
            asset.h = h;
            asset.failed = false;
            asset.ready = true;
            onMediaReady();
          };
          try {
            video.addEventListener('loadeddata', markReady);
            video.addEventListener('canplay', markReady);
            video.addEventListener('error', () => {
              if (asset.el !== video) return;
              asset.ready = false;
              asset.failed = true;
              onMediaFailed();
            });
          } catch (_error) {
            /* ignore */
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

    const requestFrame =
      typeof requestAnimationFrame === 'function'
        ? (fn) => requestAnimationFrame(fn)
        : (fn) => setTimeout(() => fn(perfNow()), 16);
    const cancelFrame =
      typeof cancelAnimationFrame === 'function'
        ? (id) => cancelAnimationFrame(id)
        : (id) => clearTimeout(id);

    /* ---------- 颜色 / 时间 ---------- */

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
      return clamp(num(height, 0) / 1.2, -1, 1);
    };

    /**
     * 动画时钟：由 performance.now() 累加而来（**不是帧计数**），
     * 单帧最多推进 TUNING.maxStepMs，避免被浏览器节流后回来时一帧跳很远。
     * 正常帧（16–120ms）时它就是绝对时间 —— 掉帧不会改变海的速度。
     * 停帧期间不推进；恢复时把锚点归零，delta=0，相位连续不跳变。
     */
    const advanceClock = (ms) => {
      const nowMs = num(ms, perfNow());
      if (!state.clockAnchor) state.clockAnchor = nowMs;
      const delta = nowMs - state.clockAnchor;
      state.clockAnchor = nowMs;
      state.clockMs += clamp(delta, 0, TUNING.maxStepMs);
      return state.clockMs;
    };
    const animTime = (ms) => advanceClock(ms) / 1000;

    const staticWarmth = () => (state.staticStep % 2 === 0 ? 0.022 : -0.022);

    /* ---------- CSS 兜底海（无 canvas 或绘制失败时） ---------- */

    const paintFallback = (pal, ms) => {
      try {
        const breathe = 0.97 + 0.03 * Math.sin((num(ms, perfNow()) / 1000) * 0.35); // 仍随时间变色
        const horizonTint = mix(pal.skyBottom, pal.foam, 0.5);
        host.style.background =
          'linear-gradient(180deg, ' +
          pal.skyTop +
          ' 0%, ' +
          pal.skyMid +
          ' 32%, ' +
          pal.skyBottom +
          ' 50%, ' +
          horizonTint +
          ' 52%, ' +
          pal.seaFar +
          ' 56%, ' +
          pal.seaMid +
          ' 76%, ' +
          pal.seaNear +
          ' 100%)';
        host.style.filter = 'brightness(' + round(breathe, 3) + ')';
      } catch (_error) {
        /* ignore：兜底本身也不许抛 */
      }
    };

    /* ---------- 一帧 ---------- */

    const draw = (ms) => {
      const pal = currentPalette();
      if (!state.ctx) {
        paintFallback(pal, ms);
        return;
      }
      if (!state.w || !state.h) return;
      const t = animTime(ms);
      const warmth = state.mode === 'static' ? staticWarmth() : 0;

      // 有素材就先画素材；画不成（未就绪/没有帧/异常）立刻退回程序化海 —— 绝不留黑帧
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
        renderScene(state.ctx, state.w, state.h, t, pal, tideNormalized(), warmth);
      } catch (_error) {
        // 绘制异常不外泄：永久退回 CSS 渐变，海还在（只是不再是 canvas 的）
        state.ctx = null;
        try {
          canvas.style.display = 'none';
        } catch (_ignored) {
          /* ignore */
        }
        paintFallback(pal, ms);
      }
    };

    /* ---------- fps 统计与降级（只降不升） ---------- */

    const reportStats = () => {
      const callback = statsRef.current;
      if (typeof callback !== 'function') return;
      try {
        callback({ fps: state.fps, downgraded: state.degraded });
      } catch (_error) {
        /* 回调自己抛错不许影响渲染 */
      }
    };

    /**
     * 帧率结算：每秒一个桶，评估**最近 3 秒**（滑动窗口）。
     * 连续 3 秒平均 < 20fps → 降级 15fps，只降不升。
     * 每秒都通过 onStats 汇报一次，UI 能拿到 fps 与是否已降级。
     */
    const trackFps = (ms, targetFps) => {
      const second = Math.floor(ms / 1000);
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
          // 只有本来就奔着 30fps 跑的时候才判定「太慢」，否则 pip 的 15fps 会被误降
          if (n >= 3 && !state.degraded && targetFps === TUNING.targetFps && average < TUNING.slowFps) {
            state.degraded = true; // 只降不升
            state.lastDrawMs = 0;
          }
          reportStats();
        }
      }
      state.curCount += 1;
    };

    /* ---------- rAF 循环 ---------- */

    const stopRaf = () => {
      if (state.raf) {
        try {
          cancelFrame(state.raf);
        } catch (_error) {
          /* ignore */
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
      const target = state.degraded ? TUNING.degradedFps : formRef.current === 'pip' ? TUNING.pipFps : TUNING.targetFps;
      const interval = 1000 / target;
      const gate = state.ctx ? interval : 900; // 无 canvas 的 CSS 海 1Hz 足够
      if (state.lastDrawMs && ms - state.lastDrawMs < gate - 0.5) {
        scheduleFrame();
        return;
      }
      state.lastDrawMs = ms;
      draw(ms);
      if (state.ctx) trackFps(ms, target);
      // devicePixelRatio 变了（换屏 / 缩放）也走一次防抖重建
      if (num(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 1) !== state.dpr) scheduleResize();
      scheduleFrame();
    }

    function scheduleFrame() {
      if (!state.alive || state.raf) return;
      state.raf = requestFrame(frame);
    }

    /* ---------- reducedMotion：只画一帧，之后每 60 秒换一帧 ---------- */

    function scheduleStatic() {
      clearStatic();
      state.staticTimer = setTimeout(() => {
        state.staticTimer = 0;
        if (!state.alive || state.mode !== 'static') return;
        state.staticStep += 1;
        draw(perfNow());
        scheduleStatic();
      }, TUNING.reducedRefreshMs);
    }

    /* ---------- 尺寸：缓冲上限 1280，resize 防抖 200ms ---------- */

    function measureNow() {
      if (!state.alive) return;
      let rect = { width: 0, height: 0 };
      try {
        rect = host.getBoundingClientRect();
      } catch (_error) {
        rect = { width: 0, height: 0 };
      }
      const dpr = clamp(num(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 1), 1, 3);
      const cssWidth = Math.max(64, Math.round(num(rect.width, 0) || host.clientWidth || 640));
      const cssHeight = Math.max(64, Math.round(num(rect.height, 0) || host.clientHeight || 360));
      const rawWidth = cssWidth * dpr;
      const width = Math.max(160, Math.min(bufferCap(), Math.round(rawWidth)));
      const height = Math.max(90, Math.round(cssHeight * dpr * (width / rawWidth)));
      state.dpr = dpr;
      if (width === state.w && height === state.h) return;
      state.w = width;
      state.h = height;
      if (state.ctx) {
        try {
          canvas.width = width; // 改背衬尺寸会顺带清空并重置 ctx 状态
          canvas.height = height;
        } catch (_error) {
          state.ctx = null;
        }
      }
      state.lastDrawMs = 0;
      if (state.mode === 'static') draw(perfNow());
    }

    function scheduleResize() {
      if (!state.alive) return;
      if (state.resizeTimer) clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(() => {
        state.resizeTimer = 0;
        measureNow();
      }, TUNING.resizeDebounceMs);
    }

    /* ---------- 模式机：anim / static / off ---------- */

    function applyMode() {
      if (!state.alive) return;
      const invisible = pausedRef.current || state.hidden || (TUNING.stopOnBlur && state.blurred);
      const want = invisible ? 'off' : reducedRef.current ? 'static' : 'anim';
      if (want === state.mode) return;
      const previous = state.mode;
      state.mode = want;

      if (want === 'off') {
        stopRaf(); // 完全停帧：不在后台偷偷跑 rAF
        clearStatic();
        setVideoPlaying(false); // 视频也一起停，别在后台解码
        return;
      }

      // 从停帧里回来：把时钟锚点归零 → 下一帧 delta=0，从 performance.now()
      // 续上而不跳变（海不会被“补算”停掉的那段时间）
      if (previous === 'off') state.clockAnchor = 0;

      if (want === 'anim') {
        clearStatic();
        // 帧率窗口不跨「停帧」结算，否则回来那一秒会被误判成掉帧
        state.curSecond = -1;
        state.curCount = 0;
        state.seconds = [];
        state.lastDrawMs = 0;
        setVideoPlaying(true);
        scheduleFrame();
      } else {
        // static：只画一帧静态海，之后每 60 秒换一帧（仅色温微变）
        stopRaf();
        setVideoPlaying(false);
        draw(perfNow());
        scheduleStatic();
      }
    }

    /* ---------- 监听 ---------- */

    function onVisibilityChange() {
      state.hidden = typeof document !== 'undefined' && document.hidden === true;
      applyMode();
    }

    const onResize = () => scheduleResize();

    // spec §4.3 还提到「窗口失焦即停帧」。默认不接（TUNING.stopOnBlur=false）：
    // 开 DevTools 会让页面 blur，验收会把它误判成卡死。要接就把它置 true。
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
      if (typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => scheduleResize());
        resizeObserver.observe(host);
      }
    } catch (_error) {
      resizeObserver = null;
    }

    try {
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', onResize);
        window.addEventListener('blur', onWindowBlur);
        window.addEventListener('focus', onWindowFocus);
      }
    } catch (_error) {
      /* ignore */
    }

    // 对外暴露给 props 副作用用的小接口
    apiRef.current = {
      sync: applyMode,
      refreshNow: () => {
        if (state.mode === 'static') draw(perfNow());
      },
      setMedia: (next) => {
        const kind = next && typeof next === 'object' ? (next.kind === 'video' ? 'video' : next.kind === 'image' ? 'image' : '') : '';
        const url = next && typeof next.url === 'string' ? next.url.trim() : '';
        const key = kind && url ? kind + '|' + url : '';
        if (key === asset.key) return; // 同一张素材：grade/motion 实时读，不必重载
        loadAsset(next);
      },
    };

    // 首帧：先接住初始素材 → 量尺寸 → 起模式
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
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
        if (typeof window !== 'undefined') {
          window.removeEventListener('resize', onResize);
          window.removeEventListener('blur', onWindowBlur);
          window.removeEventListener('focus', onWindowFocus);
        }
      } catch (_error) {
        /* ignore */
      }
      try {
        if (resizeObserver && typeof resizeObserver.disconnect === 'function') resizeObserver.disconnect();
      } catch (_error) {
        /* ignore */
      }
      resizeObserver = null;
      teardownAsset();
      apiRef.current = null;
      // 释放离屏缓冲：背衬清零，GPU/内存立刻回收
      try {
        canvas.width = 0;
        canvas.height = 0;
      } catch (_error) {
        /* ignore */
      }
      try {
        host.style.background = '';
        host.style.filter = '';
      } catch (_error) {
        /* ignore */
      }
    };
  }, []);

  return (
    <div ref={hostRef} style={HOST_STYLE} aria-hidden="true">
      <canvas ref={canvasRef} style={CANVAS_STYLE} />
    </div>
  );
}