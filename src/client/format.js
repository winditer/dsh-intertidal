// 潮间 —— 覆盖层里那些"给人看的小格式"。单独放一个纯 JS 文件，好让 node --test 直接 import
// （.jsx 在 node 里没法直接加载，测试只能绕）。

/** 剩余毫秒 → `m:ss`（不足 1 小时）或 `h:mm:ss`；向上取整，起点显示 3:00 而不是 2:59。 */
export function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(Number(ms) / 1000) || 0)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/** 某个地点的钟面时间（HH:MM）；时区非法就退回本机时区。 */
export function formatClock(date, tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz || undefined,
    }).format(date)
  } catch {
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
}
