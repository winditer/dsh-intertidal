// 潮间 —— 浏览器半片的"装载契约"测试（不启 DSH、不开浏览器）。
//
// 为什么值得写：web 模块加载器只接受一种产物形状（classic script 顶层一句
// `window.__ModuleLoader__.load({id,factory})`，factory 内只认 11 个固定 specifier）。
// 这些约束在真实客户端里一旦破了是"整页起不来"，本地又没有浏览器可调试，所以用桩把
// loader 复现一遍：能把 factory 跑完、apply 注册出四个槽位，就说明产物形状与接线是对的。

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(ROOT, 'dist/client.js')
const PKG = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))

const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/** 极简 react 桩：只够"模块期"用——组件函数不会被调用，所以 hooks 只需存在。 */
function reactStub() {
  class Component {
    constructor(props) {
      this.props = props
      this.state = {}
    }

    setState(next) {
      this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) }
    }
  }
  return {
    Component,
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    useLayoutEffect: () => {},
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }),
    memo: (fn) => fn,
    Fragment: 'fragment',
  }
}

const react = reactStub()
const jsxRuntime = {
  jsx: (type, props, key) => ({ type, props, key }),
  jsxs: (type, props, key) => ({ type, props, key }),
  Fragment: 'fragment',
}

function fakeRequire(spec) {
  if (spec === 'react') return react
  if (spec === 'react/jsx-runtime') return jsxRuntime
  if (spec === 'react-dom' || spec === 'react-dom/client') return { createRoot: () => ({ render() {}, unmount() {} }) }
  if (EXTERNALS.includes(spec)) return {}
  throw new Error(`产物 require 了模块表之外的 specifier：${spec}`)
}

/** 从产物里取出 `{ id, factory }`，并校验外壳形状。 */
async function loadBundle() {
  assert.ok(existsSync(DIST), 'dist/client.js 不存在，先跑 `npm run build`')
  const text = readFileSync(DIST, 'utf8')
  assert.match(text, /^window\.__ModuleLoader__\.load\(\{/, '顶层必须是 ModuleLoader.load 调用')

  const previous = globalThis.window
  const captured = []
  globalThis.window = Object.assign(globalThis, {
    __ModuleLoader__: {
      load(entry) {
        captured.push(entry)
      },
    },
  })
  try {
    await import(`${pathToFileURL(DIST).href}?t=${Date.now()}`)
  } finally {
    globalThis.window = previous ?? globalThis
  }
  assert.equal(captured.length, 1, '产物只能注册一个模块')
  return captured[0]
}

function makeCtx(record) {
  const effects = []
  const fakeLocale = {
    dictionaries: [],
    register(ns, dict) {
      this.dictionaries.push({ ns, dict })
      return () => {}
    },
    bind(ns) {
      return (key) => `t:${key}`
    },
  }
  return {
    get(name) {
      if (name === 'locale') return fakeLocale
      if (name === 'layout') return { selectPanel() {} }
      return undefined
    },
    effect(fn, label) {
      const dispose = fn()
      effects.push({ label, dispose })
      return dispose
    },
    inject() {},
    slots: {
      inject(name, cb) {
        record.injections.push(name)
        cb()
      },
      register(spec, component) {
        record.registrations.push({ spec, component })
        return () => {}
      },
    },
    record,
    fakeLocale,
    effects,
  }
}

test('产物只注册一个模块，且 id 等于包名', async () => {
  const entry = await loadBundle()
  assert.equal(entry.id, PKG.name)
  assert.equal(typeof entry.factory, 'function')
})

test('factory 能跑完，apply 注册出两个槽位且不抛', async () => {
  const entry = await loadBundle()
  const record = { injections: [], registrations: [] }
  const ctx = makeCtx(record)
  const mod = entry.factory(fakeRequire)

  assert.equal(typeof mod.apply, 'function', '客户端半片必须导出 apply')
  // locale 必须是硬依赖：早先只 inject slots、用 ctx.get('locale') 现取，apply 时拿到
  // undefined，插件语言就跟着 documentElement.lang 跑（现场表现：DSH 中文、插件英文）。
  assert.deepEqual(mod.inject, ['slots', 'locale'])

  mod.apply(ctx)

  // v2：侧栏那一行「潮间」与配套的 main 面板都已移除（用户反馈"看起来没有作用"）。
  assert.deepEqual(record.injections.sort(), ['settings.section', 'shell.overlay'])
  const names = record.registrations.map((item) => item.spec.name).sort()
  assert.deepEqual(names, ['settings.section', 'shell.overlay'])
  assert.equal(
    record.registrations.some((item) => item.spec.name === 'sidebar.panellist'),
    false,
    '不许再往侧栏塞入口',
  )
  for (const item of record.registrations) {
    assert.ok(item.spec.id, `${item.spec.name} 必须有 id`)
    assert.ok(item.spec.label(), `${item.spec.name} 必须有 label`)
  }

  // 每个槽位都必须是可渲染组件，而不是字面量
  for (const item of record.registrations) {
    assert.ok(item.component, `${item.spec.name} 缺组件`)
  }

  // 文案注册了 zh / en 两份
  assert.equal(ctx.fakeLocale.dictionaries.length, 1)
  assert.equal(ctx.fakeLocale.dictionaries[0].ns, 'intertidal')
  assert.ok(ctx.fakeLocale.dictionaries[0].dict.zh['panel.title'])
  assert.ok(ctx.fakeLocale.dictionaries[0].dict.en['panel.title'])

  // 卸载要能跑完（含 runtime.dispose 与样式清理），不能抛
  for (const effect of ctx.effects) {
    if (typeof effect.dispose === 'function') effect.dispose()
  }
})

test('产物里没有引入模块表之外的裸 specifier', () => {
  const text = readFileSync(DIST, 'utf8')
  const required = [...text.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1])
  for (const spec of required) {
    assert.ok(EXTERNALS.includes(spec), `产物 require 了不受支持的模块：${spec}`)
  }
})

test('产物不是 ESM（加载器只接受 classic script）', () => {
  const text = readFileSync(DIST, 'utf8')
  assert.doesNotMatch(text, /^\s*import\s+[\w{*]/m, '不能出现顶层 import 语句')
  assert.doesNotMatch(text, /^\s*export\s+/m, '不能出现顶层 export 语句')
})