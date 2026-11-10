# 《潮间》Spec 分析与实施记录

> 对应设计稿：`docs/superpowers/specs/2026-11-10-intertidal-design.md`（v1，2026-11-10）
> 实施仓库：`dsh-intertidal`（本目录）　实施者：DeepSeek Harness 智能体　日期：2026-11-10

---

## 一、Spec 读法：它到底在要求什么

设计稿写了 12 节、426 行，但真正的产品承诺只有一句：**工作是一块陆地，每两小时被海淹没三分钟，然后海自己退走。** 拆开来是三条硬约束，其余全是它们的实现手段：

| 承诺 | 落到代码里的判据 | 写错会怎样 |
| --- | --- | --- |
| **来得恰好** | 间隔基准是「上次结束」；首次延迟；静默时段；打字推迟；今天跳过 | 变成骚扰，第一天就卸载（spec R3） |
| **退得干净** | 到点必退、无残留、不弹确认、不写对话、聊天状态零损失 | 变成"关不掉的广告" |
| **是真的** | 天光由**太阳高度角**决定，地点来自设置，全部本地算 | 千篇一律的"壁纸"，承诺破产 |

还有一条容易被忽略但优先级最高的**铁律**（§8 末）：潮间是"可选的呼吸"，**任何情况下都不得让 DSH 主流程因为它出错而受损**。这条决定了本实现的两个结构选择：覆盖层自带错误边界、宿主每个 handler 自己兜错。

## 二、Spec 的技术判断，哪些成立、哪些要改

按"已在本机核对"的标注逐条验证（DSH 0.2.1-rc.5 web profile，2026-11-10）：

| Spec 的说法 | 核对结果 | 处置 |
| --- | --- | --- |
| 插件是 npm 包，`dsh.bundle.patch` + `dsh.client{platform:"web"}` 双半片 | ✅ 与 `dsh-workbench` / `dsh-media-desk` 一致 | 照做 |
| `main` 槽放覆盖层 | ⚠️ `main` 是 **keyed 面板槽**，占的是内容区，且必须与 `sidebar.panellist` 的 id 配对，否则点击侧栏会抛 `selectPanel` 错 | 覆盖层改挂 **`shell.overlay`**（`dsh-temp-chat` 已用此槽实现全局浮层）；`main` 只保留"手动进入的面板态"，与侧栏行配对 |
| `settings.section` 槽 | ✅ 与 `dsh-workbench` 一致 | 照做 |
| `inject: ["webServer","connection"]` | ⚠️ 把 `connection` 写进 inject 会让 fiber 等待一个可能更晚出现的服务（`dsh-workbench` 的加载事故记录） | **只 inject `webServer`**，`connection` 在 handler 里现取，取不到退回自写准入围栏 |
| `connection.requestRejection({ headers })` 做鉴权 | ⚠️ 签名是 `requestRejection(req)`，返回拒绝原因或 `undefined`；且 prefix 路由**绕过**框架给 `/api` 挂的围栏 | 先问框架、失败/缺失则走自写围栏（Host 必须 loopback、Origin 同源、`sec-fetch-site` 只允许 same-origin/none） |
| 浏览器产物结构 | ✅ 必须是 `window.__ModuleLoader__.load({id,factory})` 的 classic script，`id` = 包名，模块表只解析 11 个固定 specifier | `scripts/build.mjs` 用同款外壳 |
| 文件后缀 `.tsx` | —— | 改为 `.jsx`/`.js`：本机没有 TS 工具链，`esbuild --loader:.js=jsx` 即可，少一层构建依赖 |

### 2.1 一处 Spec 内部矛盾（已按产品意图消解）

§11.2 决策"手动入口 = 侧栏 `sidebar.panellist` 图标"，但 §5.1 要求覆盖层是 `position: fixed; inset: 0`。这两条在 DSH 里会打架：`sidebar.panellist` 的行点击**必须**选中一个同 id 的 `main` 面板，而选中面板会切走对话区。

处置：**一个实现，两个入口**——
- `shell.overlay` 负责所有"浮现"（定时的、设置页点预览的）：不切面板，不打断手头的事；
- `sidebar.panellist` + 同 id 的 `main` 面板负责"手动进入"：点开即开海，海退干净后自动 `selectPanel(null)` 回到原来的对话（对话内容与滚动位置零变化）。

## 三、实现结构

```
dsh-intertidal/
├─ package.json            dsh.bundle.patch + dsh.client{platform:web, immediately}
├─ cordis.patch.yml        insert: [{ id: intertidal, name: 'dsh-intertidal' }]
├─ scripts/build.mjs       esbuild → dist/client.js（ModuleLoader 外壳）
├─ src/
│  ├─ host.js              cordis 宿主插件：/intertidal/* 四个接口 + 准入围栏
│  ├─ sky.js               太阳/月亮/潮汐/时段/日照（纯函数，node --test）
│  ├─ settings.js          默认值 / 合并 / 范围钳制
│  ├─ store.js             state.json 原子读写 + rhythm 事件
│  ├─ cities.js            44 个内置城市 + 按系统时区猜
│  └─ client/
│     ├─ index.jsx         槽位接线（shell.overlay / main / sidebar.panellist / settings.section）
│     ├─ overlay.jsx       形态状态机 UI、键盘、小窗拖拽吸附、错误边界
│     ├─ sea-canvas.jsx    Canvas 2D 五层水面（30fps 预算、隐藏停帧、降级）
│     ├─ palette.js        五档色阶 + 天体归一化坐标
│     ├─ rhythm.js         计时器 + 抑制规则（R1–R5）+ 退场
│     ├─ api.js            /intertidal/* fetch（4 秒超时、localStorage 镜像）
│     ├─ sound.js          WebAudio 海浪（默认关，手势解锁）
│     ├─ styles.js         内联样式（data-plugin-css 单点清理）
│     └─ i18n.js           zh-CN / en
└─ test/                   sky / settings / store / rhythm / i18n（node --test）
```

**关键取舍**：天文计算在宿主（可 `node --test` 复现），渲染在客户端（拿 `sun.altitude=12.4°` 决定颜色）。这条 Spec 的判断是对的，本实现完整沿用。

## 四、与 Spec 的差异清单（都可回溯）

| # | 差异 | 原因 |
| --- | --- | --- |
| 1 | 覆盖层用 `shell.overlay` 而非 `main` | 见 §2.1；`main` 会切走对话区 |
| 2 | `main` 面板存在但只作"手动态"入口 | 侧栏行点击需要它配对，否则抛错 |
| 3 | 宿主只 inject `webServer` | 避免 fiber 等待 `connection` 卡住启动 |
| 4 | 客户端不信任宿主：`settings` 自己再 `mergeSettings` 一遍 | 宿主 500 时仍能用镜像设置正常工作（验收 7） |
| 5 | 增加"有模态对话则推迟浮现" | R1 的兜底：z-index 万一输给弹窗，也不至于遮住审批 |
| 6 | `.tsx → .jsx` | 本机无 TS 工具链，esbuild 直接吃 JSX |
| 7 | `dayLength` 用逐分钟扫描而非独立日出公式 | 天然处理极昼/极夜，且只用一套太阳函数（少一处不一致风险） |
| 8 | 静默时段/减少动态下"自动浮现"被强制视为关 | Spec「自动浮现默认关闭」无法区分"用户显式开"与"默认值"，按保守方向实现，设置页有提示 |
| 9 | 声音只能先点开才可能自动响 | 浏览器自动播放策略：没有手势的 AudioContext 会被挂起 |

## 五、验收标准对照（§9）

| # | 标准 | 本实现的落点 | 可自动验证的部分 |
| --- | --- | --- | --- |
| 1 | 手动 300ms 出现、Esc 600ms 消失、对话零变化 | `rhythm.show('manual')` 同步置形态；`FADE.manual = 600` | 人工 |
| 2 | 定时到点浮现/淡出、state.json 落盘、刷新不重置 | `nextDueAt` + `rhythmEvent` + 宿主持久化 | 单测（`rhythm.test.js`、`store.test.js`）+ 人工 |
| 3 | 同刻上海 vs 雷克雅未克天色明显不同 | `skyAt` 纯函数 + `paletteFor` | 单测（`sky.test.js`）+ 色值对比 |
| 4 | 静默时段不浮现、打字推迟而非覆盖 | `autoSuppression` 五条抑制 | 单测（`isQuietTime` / `inputSuppression`） |
| 5 | ≥28fps、CPU<10%、关闭后无 rAF | 1280 内部分辨率 + 30fps 节流 + 卸载 cancel | 人工（`onStats` 回调已埋点） |
| 6 | 减少动态时静止且自动关闭 | `reducedMotionActive` + `SeaCanvas` 静态帧 | 单测 + 人工 |
| 7 | `/state` 500 时仍正常、只告警一次 | `api.js` 镜像 + `logger.warn` 去重 | 人工（可用 `curl` 打挂宿主验证） |

## 六、风险台账（继承 Spec §11，标注实施后的状态）

| 编号 | 风险 | 实施后的状态 |
| --- | --- | --- |
| R1 | 覆盖层与设置面板/命令面板/审批弹窗 z-index 打架 | 覆盖层 z-index 固定为 900（`styles.js` 顶部 `--intertidal-z` 一处可调），并加"检测到 `[role=dialog]/[role=alertdialog]` 就推迟浮现"的第二道保险。**真机仍需逐个浮层实测** |
| R2 | 低端集显掉帧 | 内部分辨率 1280、30fps、隐藏即停帧、连续 3 秒 <20fps 降到 15fps |
| R3 | 自动浮现被当成骚扰 | 首次 20 分钟延迟、夜间静默、今天跳过、打字推迟、默认间隔 2 小时 |
| R4 | 路由鉴权漏做 | 每个请求第一行过围栏；框架围栏缺失时用自写围栏（loopback + 同源 + sec-fetch-site） |
| R5 | DSH 版本迭代导致槽位变化 | 四个槽位各自 try/catch，注册失败只告警；`engines.dsh` 声明 |
| R6 | 高纬极昼极夜/时区错乱 | `sky.test.js` 覆盖特罗姆瑟极夜、雷克雅未克极短日、非法时区回落 |

## 七、实施状态

见 `docs/STATUS.md`（构建/测试/装载的真实输出记录）。
---

## 八、v2 变更（2026-11-10 晚，用户实测反馈后）

用户三条反馈，对应三个改动：

### 8.1 「侧栏那一行看起来没有作用」→ 移除侧栏入口

侧栏 `sidebar.panellist` 的行点击语义是"选中一个同 id 的 `main` 面板"，也就是把内容区换成一整块面板——
而潮间的产品语义是"盖在内容之上、到点自己退"。两个语义本来就不合，实际体验就是"点了没区别"。

处置：**删掉 `sidebar.panellist` 与配套的 `main` 面板**（两处注册一并去掉，避免留一个死面板）。
手动开海改为两条非侵入路径：

- 设置页里的「看一眼海」按钮（常驻、可发现）；
- 命令 `intertidal.open`（**不带默认键位**，出现在 设置 → 快捷键 里由用户自己绑）。
  不给默认值是因为 `shortcuts.register` 在默认键位冲突时会**抛错并让插件激活失败**
  （dsh-workbench 记录过整页 boot 失败的教训）。

### 8.2 「海的效果太差了」→ 真实素材层 + 程序化海加强

程序化 Canvas 2D 的物理天花板就在那儿：再调参也不会像真海。所以加了**素材层**：

- `dir` 模式：用户给一个绝对路径目录，每次浮现随机取一张（避开"连续两次同一张"），全程不联网；
- `url` 模式：直链图片/视频直接下；给网页则挖 `og:image` → `twitter:image` → 首图兜底，
  下载后存 `~/.dsh/intertidal/cache/`（200 MB 上限、按最旧淘汰），之后离线可用；
- 素材之上再叠：天光着色（按太阳高度角调曝光与冷暖）、缓慢推拉（Ken Burns）、水面呼吸/高光扫过、
  地平线雾、轻暗角——让照片看起来像"此刻的海"而不是一张壁纸；
- 素材失败一律**静默退回程序化海**。

程序化海本身也加了一层真实感：透视（远密近疏的浪脊）、镜面碎光、海色随行深与太阳高度角插值、
地平线雾带、泡沫用噪声而非规则网格。

### 8.3 「支持设置动效的图片目录，或从给定链接获取」→ 设置项与接口

新设置字段 `media`（默认 `mode: 'off'`，即默认仍是程序化海，不改变任何人现有行为）：

```js
media: { mode: 'off'|'dir'|'url', dir, urls[], grade: 0.55, motion: 0.5, shuffle: true }
```

新增四个接口（全部复用同一道准入围栏）：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/intertidal/media` | 这一次浮现用哪张（`?fresh=1` 强制换） |
| GET | `/intertidal/media/file?name=` | 字节流，支持 Range（视频循环要用） |
| POST | `/intertidal/media/resolve` | 抓链接并缓存 |
| POST | `/intertidal/media/scan` | 设置页验证目录里有几个素材 |

安全边界：文件名只认 basename + 扩展名白名单 + 解析后必须落在目录内；链接只允许公网 http/https
（拒 loopback 与私有网段，防 SSRF）、下载 40 MB 上限、HTML 只读 2 MB。

### 8.4 v2 验证

- `node --test test/*.test.js`：**93 条全绿**（新增 `test/media.test.js` 10 条 + host 5 条媒体用例）。
- 真实网络抓取实测（不是模拟）：`https://picsum.photos/seed/intertidal/800/450` → 直链下载 53,802 字节
  `image/jpeg`；`https://commons.wikimedia.org/wiki/File:Ocean_waves.jpg` → 从网页挖到首图并缓存成功。
- 注：宿主半片换了代码，**需要重启一次 DSH 才生效**（客户端半片刷新页面即可）。


---

## 九、v3 变更（用户截图反馈后）

两条反馈：**配置页语言不跟随 DSH**、**素材来源两行的排版散架**。

### 9.1 语言不跟随 DSH —— 根因是 `ctx.get('locale')` 在 apply 时拿不到

原代码：

```js
const locale = ctx.get?.('locale') ?? null     // ← 这里可能是 undefined
const t = locale?.bind ? locale.bind(NS) : makeT(detectLang())
```

cordis 的服务是**后来才 provide** 的，`ctx.get` 拿到 undefined 之后不会重试（dsh-workbench 的
源码里专门写过这条教训）。于是插件的 `t` 落到 `makeT(detectLang())`，而 `detectLang()` 看的是
`document.documentElement.lang` —— DSH 的 HTML 外壳是 `lang="en"`，与用户设置的中文偏好无关。
三个错误叠在一起 = 界面中文、插件英文。

修法（两层）：

1. **把 locale 写进 inject**：`inject: ['slots', 'locale']`。这样 fiber 会等 locale 就绪，
   `ctx.locale` 一定有值（dsh-temp-chat / dsh-workbench 都是这么写的）。
2. **不用 `bind`，直接读 `locale.getSnapshot().active`**：`createTranslator()` 每次翻译时现算
   语言，因此运行时切换语言也立刻生效；拿不到 snapshot 才退 `documentElement.lang` → `navigator.language`。
   组件通过 `locale.subscribe` 订阅语言变化并重渲染。

回归测试：`test/i18n.test.js` 里新增 4 条，其中一条就是把现场复现成断言——
`locale.active='zh-CN'` 而 `documentElement.lang='en'` 时，`t('settings.media.mode')` 必须是「素材来源」。

### 9.2 排版散架 —— 标签列被挤成"一行一个词"

原 CSS：`.it-row { display:flex; justify-content:space-between }`，`.it-row-label` 只有
`min-width:0`（没有 flex-basis），`.it-row-control { flex:none }`。一行里有「输入框 + 两个按钮」时，
控件块要 ~450px，标签列被压到 100px 左右，于是每个词独占一行。

改法：

- 行容器 `flex-wrap: wrap`；标签列 `flex: 1 1 220px`（不够就整体折行，不再挤成竖条）；
- 控件列 `flex: 0 1 auto` + 自身 `flex-wrap: wrap`；
- 新增 `data-stack="1"` 变体：多控件行（目录、链接、时长、自定义经纬度）把控件块整行折到标签下面
  并左对齐，输入框 `flex: 1 1 220px` 撑满可用宽度；
- 去掉 JSX 里所有 `style={{ width: 260 }}` 这类硬编码宽度，改用 `.it-field` / `.it-field-sm`；
- textarea 改成整行宽 + 可竖向拉伸。

验收用 headless Chrome 在 620 / 900 / 1180 三个宽度实拍（`assets/screenshots/settings-narrow.png`、
`settings-wide.png`），确认标签不再逐词换行、按钮不再飘到行尾。

---

## 十、v4 变更（用户实测后）

### 10.1 「波浪方向不对，应该面向用户」

v2 的程序化海是"一行行独立相位推进的正弦线"——视觉上是**横向平移的条纹**，像滑动的壁纸，
不是海。真正的观感来自"波前朝观察者推过来"。

v3 把 L1–L4 整段重构成一个 surf-zone 模型：

- 10 条**横向贯通的波前**，深度 `depth = (i/N + t / period) % 1` **取模滚动**：在地平线生成、
  向画面下方推进、到底部消失；
- 透视 `y = horizon + (H - horizon) · depth^2.15`：实测行距从 6.77px（地平线附近）到 67.86px（近处），
  近处 0.25s 推进 30.37px、远处只有 8.52px；
- 波前的横向形状**挂在波前自己身上**（相位只由序号决定），所以它跟着波前一起往下走——
  这是"面向用户"与"横向平移"的区别；随时间只剩一个极慢的呼吸项；
- 每条浪面画成"浪脊曲线（上沿）→ 平线（下沿）"的带子，厚度随浪脊高低变化，
  竖向渐变=浪峰亮→波谷暗，再叠一条沿浪脊横向变化的高光带；
- 近景 breaking（画面下 22%）：浪后压暗 + 浪顶白沫沿波前铺开 + 单次大翻白；
- 碎光按"哪面朝向太阳"点亮，天体到天顶时为 0 —— 不再是固定竖光柱。

**方向是可量化的**：跟踪同一条波前，t = 0 → 2.5s 的高程 y 依次
`400.36 → 420.70 → 447.39 → 480.66 → 520.67 → 567.58 px`，严格单调（2.5 秒下移 167px，约 23% 屏高）。

随后又打磨了一轮"去塑感"：给每条波前加低频倾斜与横向相位错位（相邻浪脊不再平行等高）、
浪脊高光用低频包络打断成数段明暗、波谷内部叠横向明暗（互相遮蔽感）、地平线附近叠高频碎纹、
泡沫改成沿浪脊拉长的斑块并压掉多余白色（第一版把泡沫画成了"漂浮的圆棉球"，已回调为
4–8 处、长宽比 ≥4:1、贴着浪脊）。四档实拍见 `assets/screenshots/procedural-overview.png`。

**定位**：程序化海是"媒体不可用时的低保真兜底"，主路径仍是 v2 的媒体模式（真实照片/视频）。
2D canvas 做不出卷唇水幕与水面镜面倒影，这是画法天花板，不打算再往里投。

### 10.2 右上角倒计时

覆盖层右上角常驻一个 `m:ss` 倒计时（等宽数字、半透明药丸底），显示"还有多久退干净"：

- 起点显示 `3:00` 而不是 `2:59`（向上取整）；
- 暂停时数字冻结并降到 50% 不透明度；
- 三个操作按钮仍然只在悬停/聚焦时浮现，倒计时不在这个组里——它是唯一永远可见的元素；
- 小窗形态下缩小到 24px 高，仍在右上角；
- 文案走 i18n（`panel.remaining` / `panel.paused`），跟随 DSH 语言。

格式化函数单独放在 `src/client/format.js`（纯 JS），这样 `node --test` 能直接测它
（`.jsx` 在 node 里加载不了）。`test/overlay-format.test.js` 覆盖 4 组边界：起点取整、
负数/NaN/undefined 归零、超 1 小时用 `h:mm:ss`、两位补零。
