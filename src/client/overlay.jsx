// 潮间 —— 覆盖层：形态状态机（full / pip / hidden）的 UI 与键盘处理。
//
// 三条硬规则，来自 spec §5：
//   1. 浮现后**不**因为你打字就自己躲开——只有到点、Esc/关闭、或你按 C 才改变形态；
//   2. 全窗状态下只接管 Esc / C / Space 三个键，其余一律放行；
//   3. 整屏与小窗共享同一次浮现的剩余时长，缩窗不重置计时。
//
// 这一层不自己计时，也不自己算颜色：计时在 rhythm.js，颜色在 palette.js。这里只做渲染
// 和交互，出任何错都由 Guarded 兜住，退成一行"潮间出了点问题，点此关闭"，绝不拖垮 DSH。

import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SeaCanvas from './sea-canvas.jsx'
import { findCity } from '../cities.js'
import { formatClock, formatRemaining } from './format.js'

/** 覆盖层内部的错误边界：DSH 主流程不能因为一片海而受损。 */
class Guarded extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.warn('[dsh-intertidal] 覆盖层渲染失败：', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="it-error">
        <span>{this.props.label}</span>
        <button type="button" className="it-btn" onClick={() => this.setState({ failed: false })}>
          {this.props.closeLabel}
        </button>
      </div>
    )
  }
}

/** 输入框/可编辑区里按空格是打字，不是暂停。 */
function isEditableTarget(target) {
  if (!target || typeof target !== 'object') return false
  const tag = String(target.tagName ?? '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  return target.isContentEditable === true
}



function placeName(location, lang) {
  if (!location) return ''
  const city = findCity?.(location.city)
  if (city) return lang === 'en' ? city.en : city.zh
  return location.city || ''
}

function useRuntime(runtime) {
  const [snapshot, setSnapshot] = useState(() => runtime.getState())
  useEffect(() => runtime.subscribe(setSnapshot), [runtime])
  return snapshot
}

/** 小窗拖拽 + 四角吸附。只在 pip 形态下绑定。 */
function usePipDrag(runtime, form, enabled) {
  const ref = useRef(null)
  const [dragging, setDragging] = useState(false)
  const drag = useRef(null)

  const onPointerDown = useCallback((event) => {
    if (!enabled || form !== 'pip') return
    if (event.target?.closest?.('.it-btn')) return
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, w: rect.width, h: rect.height }
    node.setPointerCapture?.(event.pointerId)
    setDragging(true)
  }, [enabled, form])

  const onPointerMove = useCallback((event) => {
    const info = drag.current
    const node = ref.current
    if (!info || !node) return
    const left = Math.min(Math.max(0, event.clientX - info.dx), window.innerWidth - info.w)
    const top = Math.min(Math.max(0, event.clientY - info.dy), window.innerHeight - info.h)
    node.style.left = `${left}px`
    node.style.top = `${top}px`
    node.style.right = 'auto'
    node.style.bottom = 'auto'
  }, [])

  const onPointerUp = useCallback((event) => {
    const node = ref.current
    if (!drag.current || !node) return
    drag.current = null
    setDragging(false)
    node.releasePointerCapture?.(event.pointerId)
    // 吸附到最近的四角
    const rect = node.getBoundingClientRect()
    const gap = 24
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const left = centerX < window.innerWidth / 2 ? gap : window.innerWidth - rect.width - gap
    const top = centerY < window.innerHeight / 2 ? gap : window.innerHeight - rect.height - gap
    node.style.left = `${Math.max(gap, left)}px`
    node.style.top = `${Math.max(gap, top)}px`
    node.style.right = 'auto'
    node.style.bottom = 'auto'
  }, [])

  return { ref, dragging, onPointerDown, onPointerMove, onPointerUp }
}

export default function Overlay({ runtime, t = (k) => k, getLang = () => 'zh', subscribeLang }) {
  const snapshot = useRuntime(runtime)
  const lang = typeof getLang === 'function' ? getLang() : 'zh'
  // 语言切换时重渲染（locale.subscribe 拿不到就只是不跟随，不报错）
  const [, bumpLang] = useState(0)
  useEffect(() => {
    if (typeof subscribeLang !== 'function') return undefined
    const unsub = subscribeLang(() => bumpLang((value) => value + 1))
    return () => unsub?.()
  }, [subscribeLang])
  const { form, exiting, settings, sky, paused } = snapshot
  const visible = form !== 'hidden'
  const drag = usePipDrag(runtime, form, visible)

  // 键盘：只在覆盖层可见时接管 Esc / C / Space，别的一概放行。
  useEffect(() => {
    if (!visible) return undefined
    const onKeyDown = (event) => {
      if (event.defaultPrevented) return
      const key = event.key
      const editable = isEditableTarget(event.target)
      if (key === 'Escape') {
        event.preventDefault()
        runtime.hide('manual')
        return
      }
      if (editable) return
      if (key === 'c' || key === 'C') {
        event.preventDefault()
        runtime.toggleForm()
      } else if (key === ' ' || key === 'Spacebar') {
        event.preventDefault()
        runtime.togglePause()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [runtime, visible])

  // 从 pip 拖拽回整屏时，必须清掉拖拽写进内联样式的 left/top/right/bottom，
  // 否则 `inset: 0` 会被内联值盖住，海会停在小窗的位置上。
  useEffect(() => {
    const node = drag.ref.current
    if (!node || form !== 'full' || drag.dragging) return
    node.style.left = ''
    node.style.top = ''
    node.style.right = ''
    node.style.bottom = ''
  }, [form, drag.dragging, drag.ref])

  // 覆盖层出现时不要让焦点飘走：不主动 focus，输入框的光标与滚动位置必须原地不动。
  const caption = useMemo(() => {
    if (!settings?.caption) return ''
    const when = formatClock(new Date(), settings?.location?.tz)
    const where = placeName(settings?.location, lang)
    const phase = t(`phase.${sky?.phase ?? 'afternoon'}`)
    return [t('panel.caption'), where, `${when} · ${phase}`].filter(Boolean).join(' · ')
  }, [settings?.caption, settings?.location?.city, settings?.location?.tz, sky?.phase, lang, t])

  if (!visible) return null

  const exitingAttr = exiting ? (exiting.kind === 'pip' || form === 'pip' ? 'pip' : '1') : '0'
  const dialogLabel = exiting ? 'closing' : 'open'

  // role 用 region 而不是 dialog：这是氛围层不是模态框，而且 rhythm 里"有对话框就推迟"
  // 的逻辑会把自己的浮层误判成阻断源。
  return (
    <Guarded label={t('panel.crashed')} closeLabel={t('action.close')}>
      <div
        ref={drag.ref}
        className="it-root"
        data-form={form}
        data-exit={exitingAttr}
        data-dragging={drag.dragging ? '1' : '0'}
        role="region"
        aria-label={t('panel.title')}
        data-state={dialogLabel}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerUp}
      >
        <div className="it-canvas-holder">
          <SeaCanvas
            now={sky}
            media={snapshot.media}
            form={form}
            paused={paused}
            reducedMotion={runtime.reducedMotion}
            onStats={(stats) => runtime.reportStats(stats)}
          />
        </div>

        {caption ? <div className="it-caption">{caption}</div> : null}
        {snapshot.note ? <div className="it-toast">{t(snapshot.note)}</div> : null}

        <div className="it-controls">
          {/* 倒计时：一直在，不跟着按钮一起淡入淡出 —— 它是"还有多久退干净"的唯一提示 */}
          <span
            className="it-countdown"
            data-paused={paused ? '1' : '0'}
            title={paused ? t('panel.paused') : t('panel.remaining')}
            aria-label={paused ? t('panel.paused') : t('panel.remaining')}
          >
            {formatRemaining(snapshot.remainingMs)}
          </span>
          <span className="it-btnbar">
          <button
            type="button"
            className="it-btn"
            data-icon="1"
            title={paused ? t('action.resume') : t('action.pause')}
            aria-label={paused ? t('action.resume') : t('action.pause')}
            onClick={() => runtime.togglePause()}
          >
            {paused ? '▶' : '❚❚'}
          </button>
          <button
            type="button"
            className="it-btn"
            data-icon="1"
            title={form === 'full' ? t('action.pip') : t('action.expand')}
            aria-label={form === 'full' ? t('action.pip') : t('action.expand')}
            onClick={() => runtime.toggleForm()}
          >
            {form === 'full' ? '⤡' : '⤢'}
          </button>
          <button
            type="button"
            className="it-btn"
            data-icon="1"
            title={t('action.close')}
            aria-label={t('action.close')}
            onClick={() => runtime.hide('manual')}
          >
            ✕
          </button>
          </span>
        </div>
      </div>
    </Guarded>
  )
}