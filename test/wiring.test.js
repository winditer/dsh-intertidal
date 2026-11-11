// 潮间 —— 接线测试：防"代码写好了但没接上"。
//
// 现场事故（v0.1.1）：water.js 本身没问题，但 sea-canvas 的调用点没把 `state.field` 传下去，
// 于是每帧都走 `drawFarSea` 兜底 —— 用户看到的是"波浪都没有了"。渲染没问题、测试全绿、
// 打包也过，唯独画面是平的。这类"漏接一根线"的 bug 只能靠断言接线本身来防。

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SEA = readFileSync(resolve(ROOT, 'src/client/sea-canvas.jsx'), 'utf8')

test('sea-canvas 引入了水面斑块场，并在 renderScene 里真正调用它', () => {
  assert.match(SEA, /import \{ createWaterField, drawWater \} from '\.\/water\.js'/)
  assert.match(SEA, /drawWater\(ctx, \{ W, H, horizonY, t, pal, tideN \}, field\)/)
  // renderScene 的参数表里必须有 field（否则 drawWater 永远拿不到缓冲）
  assert.match(SEA, /function renderScene\(ctx, W, H, t, pal, tideN, warmth, field\)/)
})

test('调用 renderScene 时把 state.field 传下去了（v0.1.1 就是漏了这一处）', () => {
  // 别用正则抠括号里的内容：参数里还有 `tideNormalized()`，第一次遇到 `)` 就断了。
  const line = SEA.split('\n').find((l) => l.includes('renderScene(state.'))
  assert.ok(line, '找不到真实的 renderScene 调用')
  assert.match(line.trim(), /^renderScene\(state\.ctx, state\.w, state\.h, t, pal, tideNormalized\(\), warmth, state\.field\);$/, `实际：${line.trim()}`)
})

test('组件挂载时就建好缓冲（而不是永远为 null）', () => {
  assert.match(SEA, /field:\s*\(\(\)\s*=>\s*\{[^}]*createWaterField/s, 'state 初始化里必须创建 field')
  assert.match(SEA, /catch\s*\(_error\)\s*\{\s*return null;/, '建不出来要退 null 而不是抛')
})

test('兜底顺序：斑块场失败才用 drawFarSea，且不会留白', () => {
  const i = SEA.indexOf('if (!drawn)')
  assert.ok(i > 0, '必须有"画不出来才兜底"的分支')
  const block = SEA.slice(i, i + 120)
  assert.ok(block.includes('drawFarSea(ctx, W, H, horizonY, pal, t, px)'), `实际：${JSON.stringify(block)}`)
})

test('旧的 surf 代码已彻底删除（避免两条画法并存、误读为"还在一条条"）', () => {
  for (const symbol of ['waveFronts', 'crestY', 'drawSurf', 'surfFoam', 'surfSpecular', 'drawBreakingFace', 'SURF =']) {
    assert.equal(SEA.includes(symbol), false, `${symbol} 不应再出现在 sea-canvas 里`)
  }
})
