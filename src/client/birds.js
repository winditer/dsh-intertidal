// 潮间 · 白天的海鸥。
//
// 设计约束（都在 spec 里）：不联网、不加载素材、**不依赖帧数**、随时可停帧、任何分支都不抛。
// 所以这里不用"状态机 + 随机生成器"，而是**时间函数**：第 i 只鸟的起飞时刻、航线、扇翅相位
// 全部由 t 和一个整数哈希决定。好处是：
//   - 同一 t 画出同一帧（可单测、可截图复现）；
//   - 暂停/隐藏再恢复时不会"补飞"一段突兀的动画；
//   - 不会因为掉帧而多出或少掉一只鸟。
//
// 视觉：远处的小剪影、两段贝塞尔翅膀 + 轻微上下起伏，一队 3 只错开飞过。做成"随机"的观感靠
// 每只鸟的周期/航线/相位互质，屏幕上不会出现明显规律。

const TAU = Math.PI * 2;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 整数哈希 → [0,1)，用来给每只鸟不同的参数。 */
function hash(n) {
  let x = Math.imul(n | 0, 2654435761);
  x = Math.imul(x ^ (x >>> 15), 2246822507);
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}

export const BIRD_CONSTANTS = Object.freeze({
  slots: 9, //        同时在"档期"里的鸟槽（不是同屏数量）
  minPeriod: 19, //   最短的一个轮回（秒）
  periodSpan: 23, //  周期跨度：每只鸟都不同，避免同拍
  minFlight: 7, //    飞过一整屏需要的秒数（下界）
  flightSpan: 5,
});

/**
 * 白天度：0 = 完全夜里（不出鸟），1 = 大白天。深夜/晨曦微光时自动降到 0。
 * @param {any} pal paletteFor() 的返回值
 */
export function daylightOf(pal) {
  if (!pal || typeof pal !== 'object') return 0;
  // 没有 exposure 就当作"不知道天光"——宁可不画鸟，也不要在大半夜画出一群海鸥。
  if (!Number.isFinite(pal.exposure)) return 0;
  const stars = Number.isFinite(pal.stars) ? pal.stars : 0;
  return clamp01((pal.exposure - 0.45) / 0.4) * clamp01(1 - stars * 1.6);
}

/**
 * 画一帧海鸥。
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ W:number, H:number, horizonY:number, t:number, pal:any }} view
 * @returns {number} 这一帧画出的鸟数（测试用）
 */
export function drawBirds(ctx, view) {
  const { W, H, horizonY, t } = view;
  const pal = view.pal ?? {};
  const daylight = daylightOf(pal);
  if (daylight <= 0.02) return 0;
  if (!Number.isFinite(W) || !Number.isFinite(H) || !Number.isFinite(horizonY)) return 0;
  if (horizonY <= 4 || !ctx || typeof ctx.beginPath !== 'function') return 0;

  const { slots, minPeriod, periodSpan, minFlight, flightSpan } = BIRD_CONSTANTS;
  const skyH = horizonY; // 鸟只在地平线以上的天空里
  const scale = Math.max(0.55, Math.min(2.2, H / 720));
  // 白天越亮，鸟越多；夜里 0
  const density = 0.55 + 0.45 * daylight;

  let drawn = 0;
  for (let i = 0; i < slots; i += 1) {
    const period = minPeriod + hash(i * 3 + 1) * periodSpan;
    const flight = minFlight + hash(i * 7 + 5) * flightSpan;
    const offset = hash(i * 11 + 2) * period;
    // 每一轮里"在飞"的时间占比 = flight/period，其余时间不出现
    const local = (t + offset) % period;
    if (local > flight) continue;
    // 密度筛选：不同的鸟按不同概率出现，视觉上不是固定 3 只
    if (hash(i * 13 + 9) > density) continue;

    const p = local / flight; // 0 → 1 航线进度
    const r1 = hash(i * 17 + 3);
    const r2 = hash(i * 19 + 11);
    const r3 = hash(i * 23 + 7);
    const leftToRight = r1 > 0.45;
    // 从屏幕外飞进来、再飞出屏幕外
    const x0 = leftToRight ? -0.08 * W : 1.08 * W;
    const x1 = leftToRight ? 1.08 * W : -0.08 * W;
    const x = x0 + (x1 - x0) * p;
    // 高度：地平线以上、偏上；越靠近地平线画得越小（远）
    const depth = 0.28 + 0.42 * r2; //     0.28(低/远) → 0.70(高/近)
    const bob = Math.sin((p * 2.0 + r3) * TAU) * skyH * 0.012;
    const y = horizonY * depth + bob;

    const size = (11 + 9 * r3) * scale * (0.55 + 0.6 * depth);
    // 翅膀扇动：每只鸟频率不同，period 内做 6–11 次
    const flaps = 6 + Math.floor(r3 * 5);
    const wing = Math.sin(p * flaps * TAU + r2 * TAU);
    // 侧倾：扇翅到极值时翅膀更"平"，中间更"折"，看起来像在滑翔与扇动之间切换
    const lift = 0.55 + 0.45 * Math.abs(wing);
    const alpha = clamp01((0.5 + 0.32 * daylight) * (0.7 + 0.3 * Math.sin(p * Math.PI)));

    ctx.save();
    ctx.strokeStyle = `rgba(28,34,44,${alpha.toFixed(3)})`;
    ctx.lineWidth = Math.max(1.1, 1.7 * scale);
    ctx.lineCap = 'round';
    if (typeof ctx.beginPath === 'function') {
      // 两段翅膀：左翼 + 右翼，用二次曲线做出"上反角"
      ctx.beginPath();
      ctx.moveTo(x - size, y - wing * size * 0.55 * lift);
      ctx.quadraticCurveTo(x - size * 0.35, y - size * 0.28 - wing * size * 0.35 * lift, x, y);
      ctx.quadraticCurveTo(x + size * 0.35, y - size * 0.28 - wing * size * 0.35 * lift, x + size, y - wing * size * 0.55 * lift);
      ctx.stroke();
    }
    drawn += 1;
  }
  return drawn;
}