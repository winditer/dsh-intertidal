// 潮间 —— 文案一致性 + i18n 兜底。两种语言的键集合必须完全一致，否则英文界面会漏字。

import assert from 'node:assert/strict'
import test from 'node:test'

import { NS, createTranslator, detectLang, en, makeT, normalizeLang, zh } from '../src/client/i18n.js'

test('namespace 稳定（槽位 spec.locale 与 locale.register 共用它）', () => {
  assert.equal(NS, 'intertidal')
})

test('zh / en 键集合完全一致', () => {
  const zhKeys = Object.keys(zh).sort()
  const enKeys = Object.keys(en).sort()
  const missingInEn = zhKeys.filter((key) => !(key in en))
  const missingInZh = enKeys.filter((key) => !(key in zh))
  assert.deepEqual(missingInEn, [], `en 缺：${missingInEn.join(', ')}`)
  assert.deepEqual(missingInZh, [], `zh 缺：${missingInZh.join(', ')}`)
  assert.deepEqual(zhKeys, enKeys)
})

test('没有空文案', () => {
  for (const [key, value] of [...Object.entries(zh), ...Object.entries(en)]) {
    assert.equal(typeof value, 'string', key)
    assert.ok(value.trim().length > 0, `${key} 是空的`)
  }
})

test('makeT 找不到键时退中文、再退键名', () => {
  const t = makeT({ 'panel.title': 'Intertidal' })
  assert.equal(t('panel.title'), 'Intertidal')
  assert.equal(t('action.close'), zh['action.close'], '缺英文时退中文')
  assert.equal(t('nope.nope'), 'nope.nope', '两边都没有就回键名，不能是 undefined')
})

test('detectLang：zh* 走中文，其余走英文', () => {
  assert.equal(detectLang({ documentElement: { lang: 'zh-CN' } }, { language: 'en-US' }), 'zh')
  assert.equal(detectLang({ documentElement: {} }, { language: 'zh-Hant' }), 'zh')
  assert.equal(detectLang({ documentElement: {} }, { language: 'en-GB' }), 'en')
  assert.equal(detectLang({}, {}), 'zh', '全都没有默认中文')
})

test('normalizeLang：zh* → zh，其余 → en', () => {
  assert.equal(normalizeLang('zh-CN'), 'zh')
  assert.equal(normalizeLang('zh'), 'zh')
  assert.equal(normalizeLang('zh-Hant'), 'zh')
  assert.equal(normalizeLang('en-US'), 'en')
  assert.equal(normalizeLang('ja'), 'en')
  assert.equal(normalizeLang(undefined), 'en')
})

test('createTranslator 跟随 locale.getSnapshot().active，而不是 documentElement.lang', () => {
  // 这就是现场 bug：DSH 界面是中文，但 <html lang> 是 en —— 早先按 lang 判，插件就变英文了。
  const doc = { documentElement: { getAttribute: () => 'en' } }
  const nav = { language: 'en-US' }
  const locale = { getSnapshot: () => ({ active: 'zh-CN' }) }
  const { t, getLang } = createTranslator(locale, doc, nav)

  assert.equal(getLang(), 'zh')
  assert.equal(t('settings.media.mode'), '素材来源')
  assert.equal(t('settings.group.media'), '画面素材')

  // 运行时切换语言：下一次翻译立刻跟随
  locale.getSnapshot = () => ({ active: 'en' })
  assert.equal(getLang(), 'en')
  assert.equal(t('settings.media.mode'), 'Source')
})

test('createTranslator：locale 不可用 / API 变了也不崩，退回文档与浏览器语言', () => {
  const zhDoc = { documentElement: { getAttribute: () => 'zh-CN' } }
  assert.equal(createTranslator(null, zhDoc, { language: 'en-US' }).getLang(), 'zh')

  const broken = { getSnapshot: () => { throw new Error('boom') } }
  assert.equal(createTranslator(broken, { documentElement: { getAttribute: () => 'zh' } }, {}).getLang(), 'zh')

  assert.equal(createTranslator({}, { documentElement: {} }, { language: 'en-GB' }).getLang(), 'en')
})

test('createTranslator.subscribe：有 subscribe 才订阅，没有就返回空函数', () => {
  let listener = null
  const locale = { subscribe: (fn) => { listener = fn; return () => { listener = null } } }
  const { subscribe } = createTranslator(locale, {}, {})
  let hits = 0
  const unsub = subscribe(() => { hits += 1 })
  assert.equal(typeof listener, 'function')
  listener()
  assert.equal(hits, 1)
  unsub()
  assert.equal(listener, null)

  const noop = createTranslator({}, {}, {}).subscribe(() => {})
  assert.equal(typeof noop, 'function')
  noop()
})
