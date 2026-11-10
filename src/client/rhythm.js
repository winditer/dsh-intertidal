// 潮间 —— 客户端节奏（计时器 + 抑制规则 + 退场计时）。这是"来得多恰好、退得多干净"的地方。
//
// 设计约束：
//   * 计时以**上次浮现结束**（lastHideAt）为基准，不是 lastShownAt —— 否则浮现三分钟里
//     间隔就在走，等于每 1 小时 57 分来一次。
//   * 客户端负责秒级计时（无 IPC 开销），宿主只记 lastShownAt/lastHideAt，刷新后节奏不重置。
//   * 浮现后**不再**因为你打字而缩窗/退出（spec §5.3 末段）。只有到点、Esc、或自己按 C 才变。
//   * 所有副作用都可失败：宿主不在，就按镜像设置 + 本地计时继续工作。

import { DEFAULTS, mergeSettings } from '../settings.js'

export const SUPPRESS = Object.freeze({
  autoOff: 'auto-off',
  quiet: 'quiet',
  typing: 'typing',
  dialog: 'dialog',
  skippedToday: 'skipped-today',
  reducedMotion: 'reduced-motion',
})

const FADE = { manual: 600, timeout: 3000, pip: 1500 }
const INPUT_IDLE_MS = 20_000
const INPUT_MAX_WAIT_MS = 10 * 60_000
const TICK_MS = 1000

// ---------------------------------------------------------------------------
// 纯函数（可单测，不碰 DOM）

/** 'HH:MM' → 当天分钟数；非法返回 null。 */
export function parseClock(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? '').trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** 是否落在静默时段（支持跨零点，如 23:00–07:00）。 */
export function isQuietTime(quiet, date) {
  if (!quiet || quiet.enabled !== true) return false
  const start = parseClock(quiet.start)
  const end = parseClock(quiet.end)
  if (start === null || end === null) return false
  if (start === end) return false
  const nowMin = date.getHours() * 60 + date.getMinutes()
  return start < end ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end
}

/** 本地日期 YYYY-MM-DD。 */
export function localDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function skippedToday(rhythm, date) {
  const list = Array.isArray(rhythm?.skipDates) ? rhythm.skipDates : []
  return list.includes(localDateKey(date))
}

/**
 * 下一次定时浮现的时刻（ms）。
 * anchor = max(lastHideAt, 手动看过时的 lastShownAt)；都没有 → installedAt + firstDelay。
 */
export function nextDueAt(settings, rhythm, nowMs = Date.now()) {
  const intervalMs = Math.max(1, Number(settings?.intervalMinutes) || DEFAULTS.intervalMinutes) * 60_000
  const firstDelayMs = Math.max(0, Number(settings?.firstDelayMinutes ?? DEFAULTS.firstDelayMinutes)) * 60_000
  const hide = Number(rhythm?.lastHideAt) || 0
  const shown = Number(rhythm?.lastShownAt) || 0
  const anchorSec = settings?.manualExtends === false ? hide : Math.max(hide, shown)
  if (!anchorSec) {
    const installed = Number(rhythm?.installedAt) || 0
    // 刚装、还没写过 installedAt：从现在起算首次延迟
    return (installed ? installed * 1000 : nowMs) + firstDelayMs
  }
  return anchorSec * 1000 + intervalMs
}

/**
 * 输入抑制：刚有输入就等（R3）。等的是"从到点开始算"的 10 分钟——超时就放弃本次。
 * @param lastInputAt 最后一次键盘/鼠标事件的时间（ms），0 表示没记录
 * @param nowMs 现在
 * @param dueAt 本次原本该浮现的时刻
 */
export function inputSuppression(lastInputAt, nowMs, dueAt = nowMs, { idleMs = INPUT_IDLE_MS, maxWaitMs = INPUT_MAX_WAIT_MS } = {}) {
  if (!lastInputAt) return { waiting: false, giveUp: false }
  if (nowMs - lastInputAt >= idleMs) return { waiting: false, giveUp: false }
  return { waiting: true, giveUp: nowMs - dueAt > maxWaitMs }
}

/** prefers-reduced-motion 与设置合并成"本次是否要减动态"。 */
export function reducedMotionActive(setting, systemReduce) {
  if (setting === 'on') return true
  if (setting === 'off') return false
  return Boolean(systemReduce)
}

const PHASE_TEXT = { dawn: 'dawn', noon: 'noon', afternoon: 'afternoon', dusk: 'dusk', night: 'night' }

// ---------------------------------------------------------------------------
// 运行时

/**
 * @param {{ api: any, storage?: Storage, doc?: Document, win?: Window, now?: () => number }} deps
 */
export function createRuntime({ api, storage = globalThis.localStorage, doc = globalThis.document, win = globalThis.window, now = () => Date.now() } = {}) {
  const listeners = new Set()
  let timer = null
  let disposed = false
  let lastInputAt = 0
  let soundUnlocked = false

  const state = {
    ready: false,
    offline: false,
    settings: null,
    rhythm: null,
    sky: null,
    media: null,
    form: 'hidden',
    exiting: null,
    paused: false,
    pausedRemaining: 0,
    deadline: 0,
    remainingMs: 0,
    nextDueMs: null,
    suppression: null,
    stats: null,
    note: null,
  }

  const snapshot = () => ({
    ...state,
    settings: state.settings ? { ...state.settings } : null,
    rhythm: state.rhythm ? { ...state.rhythm } : null,
  })

  function emit() {
    const value = snapshot()
    for (const fn of listeners) {
      try {
        fn(value)
      } catch {
        /* 订阅者自己抛，别连坐 */
      }
    }
  }

  function subscribe(fn) {
    listeners.add(fn)
    try {
      fn(snapshot())
    } catch {
      /* 忽略 */
    }
    return () => listeners.delete(fn)
  }

  function note(text) {
    state.note = text
    emit()
    setTimeout(() => {
      if (state.note !== text) return
      state.note = null
      emit()
    }, 4000)
  }

  const reducedMotion = () => reducedMotionActive(state.settings?.reducedMotion, systemReduceMotion())

  function systemReduceMotion() {
    try {
      return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
    } catch {
      return false
    }
  }

  // ---- 输入空闲 -------------------------------------------------------------

  function markInput() {
    // 只在"没在看海"时记——看得正开心的时候按键盘不该影响下一次。
    if (state.form !== 'hidden') return
    lastInputAt = now()
  }

  const inputEvents = ['keydown', 'pointerdown', 'mousemove', 'wheel', 'touchstart']
  function bindInput() {
    for (const name of inputEvents) win?.addEventListener?.(name, markInput, { passive: true })
  }
  function unbindInput() {
    for (const name of inputEvents) win?.removeEventListener?.(name, markInput)
  }

  /** 有模态对话在就推迟：R1 的兜底，宁可晚来一次，也不能遮住审批。 */
  function hasBlockingDialog() {
    try {
      const nodes = doc?.querySelectorAll?.('[role="dialog"], [role="alertdialog"]') ?? []
      for (const node of nodes) {
        if (node?.offsetParent !== null || node?.getClientRects?.().length) return true
      }
    } catch {
      /* 查询失败就当没有 */
    }
    return false
  }

  // ---- 触发判定 -------------------------------------------------------------

  /** 现在该不该自动浮现；不该则给出抑制原因。 */
  function autoSuppression(at = now()) {
    if (!state.settings?.auto) return SUPPRESS.autoOff
    if (reducedMotion()) return SUPPRESS.reducedMotion
    if (isQuietTime(state.settings.quietHours, new Date(at))) return SUPPRESS.quiet
    if (skippedToday(state.rhythm, new Date(at))) return SUPPRESS.skippedToday
    if (state.settings.deferOnTyping && inputSuppression(lastInputAt, at, state.nextDueMs ?? at).waiting) return SUPPRESS.typing
    if (hasBlockingDialog()) return SUPPRESS.dialog
    return null
  }

  function computeNextDue() {
    state.nextDueMs = nextDueAt(state.settings, state.rhythm, now())
    return state.nextDueMs
  }

  // ---- 浮现 / 退场 -----------------------------------------------------------

  async function show(kind) {
    if (state.form !== 'hidden' || state.exiting) return
    const settings = state.settings ?? DEFAULTS
    const form = settings.form === 'pip' ? 'pip' : 'full'
    const durationMs = Math.max(1, Number(settings.durationSeconds) || DEFAULTS.durationSeconds) * 1000
    state.form = form
    state.deadline = now() + durationMs
    state.remainingMs = durationMs
    state.paused = false
    state.pausedRemaining = 0
    state.exiting = null
    state.suppression = kind === 'auto' ? state.suppression : null
    // 声音只在用户已经给过手势（设置里点过"开"）时才自动响，否则静默排队。
    if (settings.sound?.enabled && soundUnlocked) state.sound?.enable?.(settings.sound.volume)
    emit()
    // 每次浮现换一张素材（目录/链接模式）；拿不到就继续用程序化海。
    void pickMedia(true)

    // 宿主只记时间戳（用于重启后节奏不重置）；失败不影响看海。
    void api?.rhythm?.(kind === 'auto' ? 'shown' : 'manual-open')?.then?.((res) => {
      if (res?.ok && res.value) {
        state.rhythm = { ...res.value }
        emit()
      }
    })
    refreshSky()
  }

  function hide(kind = 'manual') {
    if (state.form === 'hidden' || state.exiting) return
    const fade = FADE[kind] ?? FADE.manual
    state.exiting = { kind, until: now() + fade }
    emit()
    setTimeout(() => finalizeHide(), fade)
  }

  function finalizeHide() {
    if (state.form === 'hidden') return
    state.form = 'hidden'
    state.exiting = null
    state.deadline = 0
    state.remainingMs = 0
    state.paused = false
    state.pausedRemaining = 0
    state.sound?.disable?.()
    emit()
    void api?.rhythm?.('hidden')?.then?.((res) => {
      if (res?.ok && res.value) {
        state.rhythm = { ...res.value }
        computeNextDue()
        emit()
      }
    })
  }

  function toggleForm() {
    if (state.form === 'hidden') return
    state.form = state.form === 'full' ? 'pip' : 'full'
    if (state.settings?.rememberForm) void saveSettings({ form: state.form })
    emit()
  }

  function toPip() {
    if (state.form !== 'full') return
    toggleForm()
  }

  function togglePause() {
    if (state.form === 'hidden' || state.exiting) return
    if (state.paused) {
      state.paused = false
      state.deadline = now() + state.pausedRemaining
      state.pausedRemaining = 0
    } else {
      state.paused = true
      state.pausedRemaining = Math.max(0, state.deadline - now())
      state.deadline = 0
    }
    emit()
  }

  async function skipToday() {
    const res = await api?.rhythm?.('skip-today')
    if (res?.ok && res.value) {
      state.rhythm = { ...res.value }
    } else {
      // 宿主不在也要能止损：本地记一天。
      const list = Array.isArray(state.rhythm?.skipDates) ? [...state.rhythm.skipDates] : []
      const key = localDateKey(new Date())
      if (!list.includes(key)) list.push(key)
      state.rhythm = { ...(state.rhythm ?? {}), skipDates: list }
    }
    if (state.form !== 'hidden') hide('manual')
    computeNextDue()
    emit()
    return state.rhythm
  }

  // ---- 设置与天文 ------------------------------------------------------------

  async function saveSettings(patch) {
    const merged = mergeSettings(state.settings ?? DEFAULTS, patch)
    state.settings = merged
    emit()
    if (patch?.sound && state.sound?.setVolume) state.sound.setVolume(merged.sound.volume)
    const res = await api?.saveSettings?.(patch)
    if (res?.ok && res.value) {
      state.settings = mergeSettings(res.value, {})
      state.offline = false
    } else if (res) {
      state.offline = true
      note('hint.offline')
    }
    computeNextDue()
    if (patch?.media) void pickMedia(true)
    emit()
    return state.settings
  }

  /**
   * 抽一张素材。`fresh` 为真时换一张（每次浮现都换）；失败或未启用就让 media 保持 null，
   * SeaCanvas 会退回程序化海。
   */
  async function pickMedia(fresh = false) {
    const media = state.settings?.media
    if (!media || media.mode === 'off') {
      if (state.media) {
        state.media = null
        emit()
      }
      return null
    }
    let res = null
    try {
      res = await api?.media?.(fresh)
    } catch {
      res = null
    }
    const item = res?.ok ? (res.value?.item ?? null) : null
    state.media = item
    emit()
    return item
  }

  async function refreshSky() {
    const location = state.settings?.location
    const res = await api?.now?.(location)
    if (res?.ok && res.value) state.sky = res.value
    else if (!state.sky) state.sky = null
    emit()
  }

  // ---- 主循环 ----------------------------------------------------------------

  function tick() {
    if (disposed) return
    const at = now()

    if (state.form !== 'hidden') {
      if (!state.exiting) {
        if (state.paused) {
          state.remainingMs = state.pausedRemaining
          emit()
        } else {
          state.remainingMs = Math.max(0, state.deadline - at)
          if (state.remainingMs <= 0) {
            hide(state.form === 'pip' ? 'pip' : 'timeout')
            return
          }
          emit()
        }
      }
      return
    }

    computeNextDue()
    const due = state.nextDueMs !== null && at >= state.nextDueMs
    if (!due) {
      emit()
      return
    }
    const reason = autoSuppression(at)
    state.suppression = reason
    if (!reason) {
      void show('auto')
      return
    }
    // 输入抑制等到"给放弃为止"：放弃本次 → 直接把节奏往后推一个间隔。
    if (reason === SUPPRESS.typing && state.settings?.deferOnTyping) {
      const input = inputSuppression(lastInputAt, at, state.nextDueMs ?? at)
      if (input.giveUp) {
        lastInputAt = 0
        void api?.rhythm?.('hidden')?.then?.((res) => {
          if (res?.ok && res.value) {
            state.rhythm = { ...res.value }
            computeNextDue()
            emit()
          }
        })
      }
    }
    emit()
  }

  // ---- 生命周期 --------------------------------------------------------------

  async function init() {
    if (state.ready || disposed) return
    let res = null
    try {
      res = await api?.state?.()
    } catch {
      res = null
    }
    if (res?.ok && res.value) {
      state.settings = mergeSettings(res.value.settings, {})
      state.rhythm = res.value.rhythm ?? null
      state.sky = res.value.now ?? null
      state.offline = false
    } else {
      state.settings = mergeSettings(res?.value?.settings ?? null, {})
      state.rhythm = res?.value?.rhythm ?? null
      state.sky = res?.value?.now ?? null
      state.offline = true
    }
    // dispose 可能在 await 期间已经发生过（插件被卸载 / 测试收尾）——不能再留一个计时器。
    if (disposed) return
    state.ready = true
    computeNextDue()
    bindInput()
    timer = setInterval(tick, TICK_MS)
    timer?.unref?.()
    emit()
    // 首帧不开海，先等一个 tick：避免"刚打开 DSH 就糊一脸"。
  }

  function dispose() {
    disposed = true
    if (timer) clearInterval(timer)
    timer = null
    unbindInput()
    listeners.clear()
    state.sound?.dispose?.()
    state.form = 'hidden'
  }

  /** 覆盖层把实测帧率报回来（验收用；也用于设置页显示降级状态）。 */
  function reportStats(stats) {
    state.stats = stats
    emit()
  }

  function attachSound(sound) {
    state.sound = sound
    return () => {
      sound?.dispose?.()
      if (state.sound === sound) state.sound = null
    }
  }

  /** 设置页里"开声音"必须走一次手势。 */
  function unlockSound() {
    soundUnlocked = true
    return state.sound?.enable?.(state.settings?.sound?.volume ?? DEFAULTS.sound.volume) ?? false
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
        return (await api?.scanMedia?.(dir)) ?? { ok: false }
      } catch {
        return { ok: false }
      }
    },
    /** 设置页"抓取并缓存"用。 */
    async resolveMedia(url) {
      try {
        return (await api?.resolveMedia?.(url)) ?? { ok: false }
      } catch {
        return { ok: false }
      }
    },
    reportStats,
    unlockSound,
    phaseText: (phase) => PHASE_TEXT[phase] ?? 'afternoon',
    get reducedMotion() {
      return reducedMotion()
    },
    get soundUnlocked() {
      return soundUnlocked
    },
  }
}