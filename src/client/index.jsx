// 潮间 —— 浏览器半片入口。
//
// 本文件只做"接线"：造 runtime、注入样式、注册四个槽位。任何槽位注册失败都只打告警，
// 绝不让插件把 DSH 的 web boot 拖垮（spec §11 R5）。
//
// 槽位用哪几个、为什么：
//   shell.overlay            整窗覆盖层（不抢面板、不改变 content 区），是"到点浮现"的唯一载体；
//   settings.section         设置页（含「看一眼海」「今天跳过」，是主要的手动入口）。
//
// v2 起**不再注册** `sidebar.panellist` 与 `main` 面板：用户反馈侧栏那一行"看起来没有作用"
// （它只是再开一次海，而海本来就会自己来）。手动入口保留在设置页，加上可自配的快捷键。

import Overlay from './overlay.jsx'
import SettingsPanel from './settings-panel.jsx'
import { createApi } from './api.js'
import { createRuntime } from './rhythm.js'
import { createSurfSound } from './sound.js'
import { injectStyles } from './styles.js'
import { NS, createTranslator, en, zh } from './i18n.js'

const logger = {
  warn: (...args) => console.warn('[dsh-intertidal]', ...args),
}

const PANEL_ID = 'intertidal'

const plugin = {
  name: 'dsh-intertidal',
  // `slots` 与 `locale` 都是 DSH 的常驻服务，一并声明：这样 apply 里拿到的 locale 一定是
  // 已就绪的那个（早先只 inject slots、用 ctx.get('locale') 现取，曾经拿到 undefined，
  // 于是插件语言跟着 documentElement.lang 跑 —— 表现就是"DSH 中文、插件英文"）。
  inject: ['slots', 'locale'],
  apply(ctx) {
    const locale = ctx.locale ?? ctx.get?.('locale') ?? null
    const { t, getLang, subscribe: subscribeLang } = createTranslator(locale)

    if (locale && typeof locale.register === 'function') {
      ctx.effect(() => {
        try {
          return locale.register(NS, { zh, en })
        } catch (error) {
          logger.warn('注册文案失败（可能已被注册过）：', error)
          return () => {}
        }
      }, 'dsh-intertidal: dictionaries')
    }

    ctx.effect(() => {
      const remove = injectStyles()
      return () => {
        remove()
        for (const node of globalThis.document?.querySelectorAll?.('style[data-plugin-css="dsh-intertidal"]') ?? []) {
          node.remove()
        }
      }
    }, 'dsh-intertidal: styles')

    // ---- runtime：一次创建，整个插件生命周期共用 -----------------------------
    const api = createApi({
      onStatus: (offline) => {
        if (offline) logger.warn('宿主接口不可用，退镜像设置运行')
      },
    })
    const runtime = createRuntime({ api })
    ctx.effect(() => {
      const dropSound = runtime.attachSound(createSurfSound())
      void runtime.init()
      return () => {
        dropSound()
        runtime.dispose()
      }
    }, 'dsh-intertidal: runtime')

    // ---- 槽位 ---------------------------------------------------------------
    const withRuntime = () => ({
      runtime,
      ctx,
      t,
      getLang,
      subscribeLang,
      // 可选：DSH 的工作区选择器（`uiWorkspace.pickDirectory`），拿不到就让手输路径
      pickDirectory: () => {
        try {
          return ctx.get?.('uiWorkspace')?.pickDirectory?.()
        } catch {
          return null
        }
      },
    })

    try {
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          {
            name: 'shell.overlay',
            id: 'intertidal.sea',
            order: 500,
            label: () => t('panel.title'),
            locale: NS,
            inject: withRuntime,
          },
          Overlay,
        ),
      )
    } catch (error) {
      logger.warn('注册整窗覆盖层失败：', error)
    }



    try {
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: PANEL_ID,
            order: 88,
            label: () => t('settings.title'),
            locale: NS,
            inject: withRuntime,
          },
          SettingsPanel,
        ),
      )
    } catch (error) {
      logger.warn('注册设置页失败：', error)
    }

    // ---- 快捷键（可选服务）---------------------------------------------------
    // 侧栏入口已移除，手动开海除了设置页按钮，还留一个**不带默认绑定**的命令：
    // 它出现在 设置 → 快捷键 里，用户自己绑定（不给默认值是为了不跟已装插件抢键位）。
    try {
      ctx.inject(['shortcuts'], (scope) => {
        scope.effect(() => {
          try {
            const dispose = scope.shortcuts.register({
              id: 'intertidal.open',
              label: () => t('action.open'),
              aliases: ['涨一次潮', 'look at the sea', 'intertidal'],
              defaults: {},
              regions: ['page'],
              modals: [],
              resolve: () => ({
                status: 'handled',
                run: () => void runtime.show('manual'),
              }),
            })
            return () => dispose?.()
          } catch (error) {
            logger.warn('注册快捷键命令失败（不影响其他功能）：', error)
            return () => {}
          }
        })
      })
    } catch (error) {
      logger.warn('shortcuts 服务不可用：', error)
    }
  },
}

export const inject = plugin.inject
export const apply = plugin.apply
export const name = plugin.name