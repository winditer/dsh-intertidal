// 潮间 —— 客户端样式。单文件注入：<style data-plugin-css="dsh-intertidal">，卸载时整段移除。
//
// z-index 是 spec §11 的 R1：覆盖层要高过内容区，但要低过审批弹窗/命令面板。这里用 900
// 这个保守值（内容区通常 < 100，模态层通常 ≥ 1000），并配合 rhythm.js 的"有对话框就推迟"
// 双重保险。真机上若发现层级打架，只改这一个变量。

export const STYLE = `
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
`

const STYLE_ID = 'dsh-intertidal'
const STYLE_ATTR = 'data-plugin-css'

/** 注入样式；返回卸载函数。重复调用是幂等的。 */
export function injectStyles(doc = globalThis.document) {
  if (!doc) return () => {}
  for (const node of doc.querySelectorAll(`style[${STYLE_ATTR}="${STYLE_ID}"]`)) node.remove()
  const style = doc.createElement('style')
  style.setAttribute(STYLE_ATTR, STYLE_ID)
  style.textContent = STYLE
  doc.head.appendChild(style)
  return () => {
    style.remove()
  }
}