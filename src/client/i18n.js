// 潮间 —— 文案。zh-CN 与 en 各一份，键集合必须完全一致（test/i18n.test.js 会查）。

export const NS = 'intertidal'

export const zh = {
  'panel.title': '潮间',
  'panel.caption': '此刻',
  'panel.remaining': '剩余',
  'panel.paused': '已暂停',
  'panel.crashed': '潮间出了点问题，点此关闭',
  'action.open': '涨一次潮',
  'action.close': '关闭',
  'action.pip': '缩成小窗',
  'action.expand': '展开整屏',
  'action.pause': '暂停计时',
  'action.resume': '继续计时',
  'action.skip': '今天跳过',
  'action.preview': '看一眼海',
  'hint.keys': 'Esc 关闭 · C 缩窗 · Space 暂停',
  'hint.offline': '暂时无法保存设置',
  'sound.unlock': '点一下才能播放海浪声',

  'settings.title': '潮间',
  'settings.group.rhythm': '节奏',
  'settings.group.form': '形态',
  'settings.group.place': '地点',
  'settings.group.sound': '声音',
  'settings.group.access': '无障碍',
  'settings.auto': '自动浮现',
  'settings.auto.hint': '到点自己浮起来，到点自己退走',
  'settings.interval': '间隔',
  'settings.interval.hint': '两次浮现之间隔多久',
  'settings.duration': '每次时长',
  'settings.firstDelay': '首次投放延迟',
  'settings.firstDelay.hint': '装完先安静一会儿，别一装就糊一脸',
  'settings.quiet': '静默时段',
  'settings.quiet.hint': '这段时间内不自动浮现（手动不受限）',
  'settings.deferTyping': '输入中推迟',
  'settings.deferTyping.hint': '正在打字时等你停手 20 秒；最多等 10 分钟则跳过本次',
  'settings.manualExtends': '手动看过后顺延',
  'settings.manualExtends.hint': '你主动看一眼，下一次定时就往后挪',
  'settings.form': '浮现形式',
  'settings.form.full': '整屏',
  'settings.form.pip': '右下角小窗',
  'settings.rememberForm': '记住上次形态',
  'settings.caption': '角落小字',
  'settings.caption.hint': '「此刻 · 上海 · 17:18」，不显示任何数据源',
  'settings.city': '城市',
  'settings.city.custom': '自定义经纬度',
  'settings.lat': '纬度',
  'settings.lon': '经度',
  'settings.tz': '时区',
  'settings.sound': '海浪声',
  'settings.volume': '音量',
  'settings.sound.hint': '程序化合成，不需要任何素材文件',
  'settings.group.media': '画面素材',
  'settings.media.mode': '素材来源',
  'settings.media.off': '程序化海（默认）',
  'settings.media.dir': '本地目录',
  'settings.media.url': '网页 / 图片链接',
  'settings.media.hint': '用真实照片或视频当海的底子；不选就还是程序化海。素材加载失败会自动退回程序化海。',
  'settings.media.dir.hint': '从目录里随机取一张图片或视频，全程不联网',
  'settings.media.dir.empty': '还没选目录',
  'settings.media.pick': '选择目录',
  'settings.media.scan': '检查目录',
  'settings.media.scanOk': '目录里有素材',
  'settings.media.scanEmpty': '目录里没有图片或视频',
  'settings.media.scanFail': '读不到这个目录',
  'settings.media.urls': '链接',
  'settings.media.urls.hint': '一行一条，最多 8 条。直链图片/视频直接用；网页会尝试取 og:image 首图。',
  'settings.media.fetch': '抓取并缓存',
  'settings.media.fetchOk': '已缓存，下次浮现就会用',
  'settings.media.fetchFail': '抓不到，检查链接或网络',
  'settings.media.grade': '天光着色',
  'settings.media.grade.hint': '按此刻的太阳给素材压暗/提亮、偏暖/偏冷；0 = 保持原图',
  'settings.media.motion': '缓慢推拉',
  'settings.media.motion.hint': 'Ken Burns，让静图不像壁纸；0 = 完全静止',
  'settings.media.shuffle': '每次浮现换一张',
  'settings.reducedMotion': '减少动态',
  'settings.reducedMotion.auto': '跟随系统',
  'settings.reducedMotion.on': '强制开',
  'settings.reducedMotion.off': '强制关',
  'settings.reducedMotion.hint': '开启后画面静止，且自动浮现默认关闭',
  'settings.next': '下一次浮现',
  'settings.next.soon': '马上就到',
  'settings.next.off': '自动已关闭',
  'settings.stateFile': '状态文件',

  'unit.minutes': '分钟',
  'unit.seconds': '秒',
  'phase.dawn': '晨曦',
  'phase.noon': '正午',
  'phase.afternoon': '午后',
  'phase.dusk': '黄昏',
  'phase.night': '夜',
}

export const en = {
  'panel.title': 'Intertidal',
  'panel.caption': 'now',
  'panel.remaining': 'remaining',
  'panel.paused': 'paused',
  'panel.crashed': 'Intertidal hit a problem — click to close',
  'action.open': 'Raise the tide',
  'action.close': 'Close',
  'action.pip': 'Shrink to corner',
  'action.expand': 'Expand',
  'action.pause': 'Pause timer',
  'action.resume': 'Resume timer',
  'action.skip': 'Skip today',
  'action.preview': 'Look at the sea',
  'hint.keys': 'Esc close · C shrink · Space pause',
  'hint.offline': 'Settings cannot be saved right now',
  'sound.unlock': 'Click once to allow surf audio',

  'settings.title': 'Intertidal',
  'settings.group.rhythm': 'Rhythm',
  'settings.group.form': 'Form',
  'settings.group.place': 'Place',
  'settings.group.sound': 'Sound',
  'settings.group.access': 'Accessibility',
  'settings.auto': 'Automatic',
  'settings.auto.hint': 'It comes up on its own and leaves on its own',
  'settings.interval': 'Interval',
  'settings.interval.hint': 'How long between two appearances',
  'settings.duration': 'Duration',
  'settings.firstDelay': 'First appearance delay',
  'settings.firstDelay.hint': 'Stay quiet right after install',
  'settings.quiet': 'Quiet hours',
  'settings.quiet.hint': 'No automatic appearance in this window (manual still works)',
  'settings.deferTyping': 'Defer while typing',
  'settings.deferTyping.hint': 'Waits 20s after you stop typing; gives up after 10 minutes',
  'settings.manualExtends': 'Manual viewing pushes the next one',
  'settings.manualExtends.hint': 'Looking on purpose moves the next timed appearance later',
  'settings.form': 'Appearance',
  'settings.form.full': 'Full screen',
  'settings.form.pip': 'Corner window',
  'settings.rememberForm': 'Remember last form',
  'settings.caption': 'Corner caption',
  'settings.caption.hint': '“Now · Shanghai · 17:18” — no data source involved',
  'settings.city': 'City',
  'settings.city.custom': 'Custom coordinates',
  'settings.lat': 'Latitude',
  'settings.lon': 'Longitude',
  'settings.tz': 'Time zone',
  'settings.sound': 'Surf sound',
  'settings.volume': 'Volume',
  'settings.sound.hint': 'Synthesised, no asset files',
  'settings.group.media': 'Scenery',
  'settings.media.mode': 'Source',
  'settings.media.off': 'Procedural sea (default)',
  'settings.media.dir': 'Local folder',
  'settings.media.url': 'Web / image links',
  'settings.media.hint': 'Use real photos or video as the sea bed; leave it off for the procedural sea. Falls back automatically if a file fails to load.',
  'settings.media.dir.hint': 'Picks a random image or video from the folder. No network at all.',
  'settings.media.dir.empty': 'No folder chosen',
  'settings.media.pick': 'Choose folder',
  'settings.media.scan': 'Check folder',
  'settings.media.scanOk': 'Files found',
  'settings.media.scanEmpty': 'No images or videos in that folder',
  'settings.media.scanFail': 'Cannot read that folder',
  'settings.media.urls': 'Links',
  'settings.media.urls.hint': 'One per line, up to 8. Direct image/video URLs are used as-is; pages are scraped for og:image.',
  'settings.media.fetch': 'Fetch and cache',
  'settings.media.fetchOk': 'Cached — the next appearance will use it',
  'settings.media.fetchFail': 'Could not fetch; check the link or network',
  'settings.media.grade': 'Time-of-day grade',
  'settings.media.grade.hint': 'Darkens/brightens and warms/cools the photo to match the sun right now; 0 keeps the original',
  'settings.media.motion': 'Slow push',
  'settings.media.motion.hint': 'Ken Burns, so a still photo does not look like wallpaper; 0 is perfectly still',
  'settings.media.shuffle': 'New one every appearance',
  'settings.reducedMotion': 'Reduced motion',
  'settings.reducedMotion.auto': 'Follow system',
  'settings.reducedMotion.on': 'Force on',
  'settings.reducedMotion.off': 'Force off',
  'settings.reducedMotion.hint': 'Static frame, and automatic appearance defaults to off',
  'settings.next': 'Next appearance',
  'settings.next.soon': 'any moment',
  'settings.next.off': 'automatic is off',
  'settings.stateFile': 'State file',

  'unit.minutes': 'min',
  'unit.seconds': 's',
  'phase.dawn': 'dawn',
  'phase.noon': 'noon',
  'phase.afternoon': 'afternoon',
  'phase.dusk': 'dusk',
  'phase.night': 'night',
}

/** 当前语言：优先 document.documentElement.lang / navigator.language。 */
export function detectLang(doc = globalThis.document, nav = globalThis.navigator) {
  const fromDoc = doc?.documentElement?.lang
  const raw = String(fromDoc || nav?.language || 'zh')
  return raw.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** 造一个 t：找不到键就退中文，再退键名本身。 */
export function makeT(dict, fallback = zh) {
  return (key) => dict[key] ?? fallback[key] ?? key
}

/** 'zh-CN' / 'zh' / 'zh-Hant' → 'zh'；其余 → 'en'。 */
export function normalizeLang(value) {
  return String(value ?? '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/**
 * 造一个**跟随 DSH 当前语言**的 t。
 *
 * 为什么不用 `locale.bind(NS)`：`apply` 执行时 `ctx.get('locale')` 可能还没就绪
 * （cordis 服务是后来才 provide 的，`get` 拿到 undefined 后不会重试），这时 bind 根本不存在，
 * 只能走兜底语言——那正是"DSH 是中文、插件却是英文"的现场。
 *
 * 这里直接读 `locale.getSnapshot().active`（temp-chat 也用它），拿不到才退
 * documentElement.lang / navigator.language。每次翻译时现算，所以语言切换即时生效。
 */
export function createTranslator(locale, doc = globalThis.document, nav = globalThis.navigator) {
  const active = () => {
    try {
      const snapshot = locale?.getSnapshot?.()
      if (snapshot && snapshot.active) return normalizeLang(snapshot.active)
    } catch {
      /* 服务还没起来 / API 变了 */
    }
    try {
      const attr = doc?.documentElement?.getAttribute?.('lang')
      if (attr) return normalizeLang(attr)
    } catch {
      /* ignore */
    }
    return normalizeLang(nav?.language ?? 'zh')
  }
  const t = (key) => {
    const dict = active() === 'en' ? en : zh
    return dict[key] ?? zh[key] ?? key
  }
  return {
    t,
    getLang: active,
    /** 语言变化时通知组件重渲染（拿得到 subscribe 才有）。 */
    subscribe(callback) {
      try {
        return locale?.subscribe?.(() => callback(active())) ?? (() => {})
      } catch {
        return () => {}
      }
    },
  }
}