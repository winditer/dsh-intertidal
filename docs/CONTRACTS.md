# 潮间 dsh-intertidal —— 内部分契约（唯一真相）

> 这份文件是并行实现的接口契约。**先读它，再动手**；改契约必须同时在对话里说明。
> 任何人不得改动别人"写作用域"里的文件。

## 0. 目录与写作用域

| 文件 | 归属 | 说明 |
| --- | --- | --- |
| `src/sky.js` | **host-math** | 太阳/月亮/潮汐/时段/日照长度，纯函数，零 IO |
| `src/cities.js` | **host-math** | 内置城市表 + 按系统时区猜城市 |
| `src/settings.js` | **host-math** | 默认值、合并、范围钳制 |
| `src/store.js` | **host-math** | `~/.dsh/intertidal/state.json` 原子读写 + rhythm 事件 |
| `test/sky.test.js` `test/settings.test.js` `test/store.test.js` | **host-math** | `node --test` |
| `src/client/palette.js` | **sea-render** | 五档色阶 + 插值 + 天体屏幕坐标 |
| `src/client/sea-canvas.jsx` | **sea-render** | Canvas 2D 五层水面渲染 |
| `src/client/index.jsx` | lead | 插件入口、槽位注册、样式注入 |
| `src/client/overlay.jsx` | lead | 形态状态机 UI（full / pip / hidden） |
| `src/client/rhythm.js` | lead | 客户端计时器 + 抑制规则 |
| `src/client/api.js` | lead | `/intertidal/*` fetch 封装 |
| `src/client/sound.js` | lead | WebAudio 海浪（默认关） |
| `src/client/i18n.js` | lead | zh-CN / en 文案 |
| `src/client/settings-panel.jsx` | lead | 设置页 |
| `src/host.js` | lead | cordis 宿主插件 + 路由 + 准入围栏 |
| `scripts/build.mjs` `package.json` `cordis.patch.yml` | lead | 已就绪，勿改 |

## 1. `src/sky.js`

纯 ESM，**无 IO、无 Date.now() 隐含依赖**：所有函数接受显式时间参数。

```js
/** 太阳位置。date: Date | number(ms)。返回角度制。 */
export function solarPosition(date, lat, lon)      // -> { altitude, azimuth }  方位角 0..360（正北起顺时针）
/** 月亮位置与月相。phase: 0..1，0=朔、0.5=望。 */
export function moonPosition(date, lat, lon)       // -> { altitude, azimuth, phase }
/** 半日潮：h = A·sin(2π(t-t₀)/12.42h)，A = 1.2 m。 */
export function tideAt(date, lon)                  // -> { height, trend: 'rising'|'falling' }
/** 时段：按太阳高度角 + 升落趋势判定。 */
export function classifyPhase(altitude, rising)    // -> 'dawn'|'noon'|'afternoon'|'dusk'|'night'
/** 日出日落；极昼/极夜返回 null（不得出现 00:00）。 */
export function dayLength(date, lat, lon, tz)      // -> { sunrise:'HH:MM', sunset:'HH:MM' } | null
/** 一次拿全，给 GET /intertidal/now 用。tz 为 IANA 时区名。 */
export function skyAt(date, { lat, lon, tz })      // -> { t, sun, moon, tide, phase, dayLength }
```

**时段阈值**（specc §4.2，按高度角不按钟点）：

| altitude | 判定 |
| --- | --- |
| `> 40` | `noon` |
| `6 ~ 40` | `afternoon` |
| `-6 ~ 6` 且上升 | `dawn` |
| `-6 ~ 6` 且下降 | `dusk` |
| `< -6` | `night` |

算法用 NOAA 简化式（经度时差 → 赤纬 → 时角 → 高度角/方位角），误差 ±0.5° 可接受。
`dayLength` 用逐分钟扫描高度角找 `-0.833°` 的穿越（简单、天然处理极昼极夜），结果按 `tz` 格式化成 `HH:MM`。
`t` 是 `Math.floor(date/1000)`（Unix 秒）。

**数值异常一律兜底**：输入非法（NaN lat/lon、时区非法）时 `skyAt` 返回 `phase: 'afternoon'` 的合法结构，绝不抛。

## 2. `src/cities.js`

```js
export const CITIES = [ { id:'shanghai', zh:'上海', en:'Shanghai', lat:31.23, lon:121.47, tz:'Asia/Shanghai' }, ... ]  // ≥ 40 个
export function guessCity({ tz, locale, lat, lon })  // -> city（永不 undefined：猜不到就返回上海）
export function findCity(id)                         // -> city | undefined
```

## 3. `src/settings.js`

```js
export const DEFAULTS = { /* spec §6 的完整默认值 */ }
/** 任意输入 → 合法 settings。非法/越界/类型错一律退回默认该字段。 */
export function sanitizeSettings(input)   // -> settings
/** 默认值 + 已存盘 + 本次 patch 的深合并，再做钳制。 */
export function mergeSettings(base, patch) // -> settings
export const LIMITS = { intervalMinutes:[15,480], durationSeconds:[30,1800], firstDelayMinutes:[0,120], volume:[0,1] }
/** 给 GET /intertidal/state 的完整结构。 */
export function publicState(settings, rhythm, now)  // -> { settings, rhythm, now }
```

设置结构（spec §6）：

```js
{
  auto: true, intervalMinutes: 120, durationSeconds: 180, firstDelayMinutes: 20,
  quietHours: { enabled: true, start: '23:00', end: '07:00' },
  deferOnTyping: true, manualExtends: true,
  form: 'full' | 'pip', rememberForm: true, caption: true,
  location: { city: 'shanghai', lat: 31.23, lon: 121.47, tz: 'Asia/Shanghai' },
  sound: { enabled: false, volume: 0.35 },
  reducedMotion: 'auto' | 'on' | 'off'
}
```

## 4. `src/store.js`

```js
export function resolveDshHome()                      // $DSH_HOME ?? ~/.dsh
export function statePath(home)                       // <home>/intertidal/state.json
export function emptyState(nowMs)                     // { version:1, settings: DEFAULTS, rhythm: { lastShownAt:null, lastHideAt:null, installedAt: nowSec, skipDates: [] } }
export async function readState(home)                 // -> state（文件缺失/损坏 → emptyState）
export async function writeState(home, state)         // 原子写（tmp + rename，mode 0o600）
export async function patchSettings(home, patch)      // -> 合并钳制后的完整 settings
export async function rhythmEvent(home, event, nowMs) // event: 'shown'|'hidden'|'skip-today'|'manual-open' -> 最新 rhythm
```

`rhythm` 字段全部是 Unix **秒**：`lastShownAt` `lastHideAt` `installedAt`；`skipDates` 是本地日期字符串数组（`YYYY-MM-DD`），只保留最近 7 天。
`rhythmEvent`：`shown` → `lastShownAt`；`hidden` → `lastHideAt`；`manual-open` → 同时写 `lastShownAt`（配合"手动看过后顺延"）；`skip-today` → 追加当天日期。

## 5. `/intertidal/*` 接口（lead 实现，host-math 只需供纯函数）

| 方法 | 路径 | 请求 | 响应 |
| --- | --- | --- | --- |
| GET | `/intertidal/state` | — | `{ settings, rhythm, now }` |
| POST | `/intertidal/settings` | 部分 settings | 完整 settings |
| POST | `/intertidal/rhythm` | `{ event }` | 最新 rhythm |
| GET | `/intertidal/now` | `?lat=&lon=&tz=` | `{ t, sun, moon, tide, phase, dayLength }` |

## 6. 浏览器半片：海上屏契约

`src/client/palette.js`：

```js
/** 由 /intertidal/now 的 now 对象算出这一帧的全部颜色与天体位置。 */
export function paletteFor(now) // -> {
//   skyTop, skyMid, skyBottom,      // '#rrggbb' 天空三段
//   horizonGlow,                    // 地平线辉光色
//   seaFar, seaMid, seaNear,        // 三层海色
//   foam,                           // 泡沫白
//   sun:  { x, y, color, alpha } | null,   // x/y 是 0..1 归一化屏幕坐标
//   moon: { x, y, color, alpha, phase } | null,
//   stars: number,                  // 0..1 星点密度
//   exposure: number                // 0..1 整体亮度
// }
export function mix(a, b, t)        // 两个 '#rrggbb' 线性插值
export function phasePalette(phase) // 'dawn'|'noon'|'afternoon'|'dusk'|'night' -> 基准色
```

坐标：`y = horizon - sin(altitude) * H`，`x = W/2 + tan(方位角偏差) * W/2`，**归一化到 0..1**（越界钳制到 -0.2..1.2，地平线在 0.52）。
天体在地平线以下（altitude < -1°）→ `sun/moon` 为 `null`。

`src/client/sea-canvas.jsx`：

```jsx
export default function SeaCanvas({ now, form, paused, reducedMotion, onStats })
```

- 自己 `requestAnimationFrame`，`t` 用 `performance.now()/1000`，**不依赖帧数**；
- 内部离屏缓冲宽度上限 1280，再 CSS 撑满父容器；`devicePixelRatio` 变化与 resize（防抖 200ms）重建；
- 五层：L0 天空渐变 + 地平线辉光、L1 远海地平线、L2 三组正弦浪脊、L3 泡沫带、L4 前景浪尖（占画面下 22%）；
- 隐藏（`document.hidden` / 传入 `paused`）→ 停帧（`cancelAnimationFrame`），恢复时从 `performance.now()` 续上，不跳变；
- `reducedMotion` → 只画静态一帧，每 60 秒换一帧；
- 目标 30 fps（小窗 15 fps，由 `form` 决定），连续 3 秒平均 < 20 fps 降到 15 fps（只降不升）；
- `onStats` 可选回调，传 `{ fps, downgraded }`，用于验收与降级；
- 卸载必须 `cancelAnimationFrame` 并释放离屏 canvas；**组件绝不允许抛异常**（必要时退回 CSS 渐变）。

## 7. 客户端插件入口的槽位（lead）

- `shell.overlay`：全局覆盖层（`{ name:'shell.overlay', id:'intertidal.sea', order: 500, label }`）；
- `sidebar.panellist`：侧栏行（`{ name:'sidebar.panellist', id:'intertidal', order: 60, label }`）+ 同名 `main` key 面板（点侧栏才不抛）；
- `settings.section`：设置页（`{ name:'settings.section', id:'intertidal', order: 88, label }`）。
---

# 附录 A（2026-11-10 v2）：媒体模式 —— 用真实图片/视频替换程序化海

> 用户反馈：程序化海"不够逼真"；且要求能指定一个图片目录（随机取一张）或给一个网址取图。
> 这一层是"基底素材"，程序化海降级为**兜底**。

## A1. 设置结构（`src/settings.js`）

在 `settings` 里新增 `media` 字段（默认值见下），其余字段不动：

```js
media: {
  mode: 'off',          // 'off' | 'dir' | 'url'
  dir: '',              // mode=dir：绝对路径，图片/视频目录
  urls: [],             // mode=url：网页或图片链接（1..8 条）
  grade: 0.55,          // 0..1：按"此刻"的天光给素材上色的强度，0=原图
  motion: 0.5,          // 0..1：Ken Burns 缓慢推拉的强度，0=完全静止
  shuffle: true         // true=每次浮现随机换一张；false=固定用第一张
}
```

钳制：`mode` 非法 → `'off'`；`dir` 必须是绝对路径字符串（非法 → `''`）；`urls` 只留 `http/https`
且最多 8 条；`grade`/`motion` 钳进 `[0,1]`。

## A2. 宿主接口（`src/host.js`）

| 方法 | 路径 | 请求 | 响应 |
| --- | --- | --- | --- |
| GET | `/intertidal/media` | `?fresh=1` 时强制重新抽 | `{ item }`，`item` 为 `null` 或媒体描述 |
| GET | `/intertidal/media/file?name=<basename>` | — | 文件字节流，支持 Range（视频要用） |
| POST | `/intertidal/media/resolve` | `{ url }` | `{ item }`（下载/解析并缓存后的描述） |
| POST | `/intertidal/media/scan` | `{ dir }` | `{ dir, count, kinds, sample }`（设置页验证目录用） |

媒体描述（`item`）：

```js
{ kind: 'image' | 'video', url: '/intertidal/media/file?name=xxx.jpg', name: 'xxx.jpg', width?: number, height?: number, source: 'dir' | 'url' }
```

**安全**：`name` 只能是目录内的 basename（拒绝任何 `/`、`\`、`..`、非白名单扩展名）；
`resolve` 只接受 http/https，拒绝 loopback 与私有网段（SSRF），下载上限 40 MB，缓存
`~/.dsh/intertidal/cache/`（总上限 200 MB，超出按最旧淘汰）。

## A3. 浏览器半片（`src/client/sea-canvas.jsx`）

```jsx
export default function SeaCanvas({ now, media, form, paused, reducedMotion, onStats })
```

- `media` 为 `null`/`undefined` → **保持现有程序化海**（兜底，不许退化成空白）。
- `media.kind === 'image'` → `new Image()` 加载（`crossOrigin` 不设，不读像素），`cover` 铺满，
  按 `media.motion` 做缓慢 Ken Burns（缩放 1.0→1.06 + 轻微平移，周期 ~40s，方向随机会话固定）。
- `media.kind === 'video'` → `<video muted loop playsinline autoplay>`，`drawImage` 每帧取当前帧。
- 两者之上再叠：
  1. **天光罩**：用 `paletteFor(now)` 的 `exposure` 与冷暖色做一层 `multiply`/`overlay` 混合，
     强度 = `media.grade`（设置里可关）。夜里要真的压暗，正午要提亮，晨昏要偏橘/紫。
  2. **水面呼吸感**：极薄的横向位移/高光扫过（幅度 1–2px，0.11Hz），让静态照片不像壁纸。
  3. **地平线雾**：素材顶部按 palette 的天空色做一层柔和渐变蒙版。
  4. 可选：`vignette` 轻微暗角。
- 加载失败/解码失败/跨域被拒 → **静默退回程序化海**，不报错不黑屏。
- 性能：媒体模式内部缓冲宽度上限提到 **2560**（照片需要清晰度），程序化模式仍是 1280。
- 帧率目标不变（全窗 30fps、小窗 15fps），`paused`/`document.hidden` 仍然完全停帧。
