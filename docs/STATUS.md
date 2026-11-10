# 实施状态（真实命令输出记录）

> 采集时间：2026-11-10 19:39（Asia/Shanghai）
> 机器：macOS / Node v26.0.0 / DSH profile `desktop`（`$DSH_HOME=/Users/haifeng/.dsh`）

## 1. 构建

```
$ node scripts/build.mjs
built /Users/haifeng/Documents/dsh-intertidal/dist/client.js (108.4 KiB)
```

产物形状（装载器契约）：顶层只有一条 `window.__ModuleLoader__.load({ id: "dsh-intertidal", factory })`，
factory 内 `require` 只出现模块表里的 specifier。`test/client-boot.test.js` 会对这两条做断言。

## 2. 测试

```
$ node --test test/*.test.js
ℹ tests 83
ℹ pass 83
ℹ fail 0
ℹ duration_ms 449.40
```

| 文件 | 条数 | 覆盖 |
| --- | --- | --- |
| `test/sky.test.js` | 18 | 太阳高度角/方位角、日出日落、极昼极夜、五档时段、脏输入兜底 |
| `test/settings.test.js` | 19 | 默认值、钳制、非法时区、非法枚举、深合并 |
| `test/store.test.js` | 16 | 原子写、坏 JSON 兜底、四种 rhythm 事件、skipDates 保留 7 天 |
| `test/rhythm.test.js` | 11 | 静默时段跨零点、首次延迟、手动顺延、输入抑制与放弃、减少动态 |
| `test/i18n.test.js` | 5 | zh/en 键集合一致、无空文案、t 兜底、语言检测 |
| `test/host.test.js` | 10 | 准入围栏正反例、四个接口、404/405、非法 JSON、地点回落 |
| `test/client-boot.test.js` | 4 | 产物只注册一个模块、id=包名、apply 注册四个槽位、无模块表外 specifier、非 ESM |

> 注：Node 26 的 `node --test` 不接受目录参数，脚本里统一用 `test/*.test.js`。

## 3. 装进本机 profile（M1 的验收前提）

```
$ ln -sfn /Users/haifeng/Documents/dsh-intertidal ~/.dsh/profiles/desktop/node_modules/dsh-intertidal
$ tail -4 ~/.dsh/profiles/desktop/cordis.patch.yml
- insert:
    - id: intertidal
      name: 'dsh-intertidal'
$ python3 …   # profile package.json 增加依赖，避免 pnpm prune 掉软链
$ curl -o /dev/null -w '%{http_code}' http://127.0.0.1:63994/intertidal/state
403
```

**403 是预期结果，也是好消息**：

- 装之前同一条路径返回 **404**（路由不存在）；
- 装之后返回 **403**（路由存在，但被准入围栏拒绝）。

宿主半片由此确认已在运行中的 profile 里热加载成功（`patchReload: live`），并且围栏对外部
`curl` 有效——这正是 spec §11 R4 要求的"不能开一个无认证接口"。

宿主侧的真实正例由 `test/host.test.js` 用假 req/res 覆盖（10 条全绿），因为浏览器侧需要
同源 cookie 才能通过框架围栏，命令行伪造不了。

## 4. 已验证 / 待人工确认

| 项 | 状态 |
| --- | --- |
| 产物能被打包成装载器接受的形状 | ✅ 自动（client-boot） |
| `apply` 能注册四个槽位且不抛 | ✅ 自动（client-boot，桩 ctx） |
| 四个接口行为 + 范围钳制 + 围栏 | ✅ 自动（host.test.js） |
| 天文数值精度（中用太阳角、白昼长度、潮汐周期） | ✅ 自动（sky.test.js） |
| 宿主在你的运行中 profile 里真实加载 | ✅ `curl` 404→403 |
| 覆盖层在浏览器里出现/退场/缩窗 | ✅ **人工验收通过**（2026-11-10 19:4x，用户刷新页面后确认：侧栏「潮间」入口出现，能开能关） |
| z-index 与审批弹窗的相对层级（R1） | ⏳ 需在真实界面里逐个浮层实测 |
| 30fps / CPU < 10% / DevTools 无持续 rAF（验收 5） | ⏳ 需在真实窗口里看（`onStats` 已埋点；headless 软件光栅下单帧 0.5–12ms，远低于 33ms 预算） |

## 4.5 v2（素材层 + 侧栏移除）的验证

```
$ node scripts/build.mjs
built dist/client.js (133.6 KiB)
$ node --test test/*.test.js
ℹ tests 98   ℹ pass 98   ℹ fail 0
```

新增覆盖：

| 项 | 证据 |
| --- | --- |
| 侧栏入口已移除 | `client-boot` 断言只有 `shell.overlay` + `settings.section` 两个槽位，且显式断言**不含** `sidebar.panellist` |
| 目录模式端到端 | `host.test.js`：写设置 → `GET /media` 抽到素材（含尺寸嗅探 640×360）→ `GET /media/file` 取回字节完全一致 |
| 路径穿越 / 未启用 | `GET /media/file?name=..%2Fstate.json` → 400/404 |
| SSRF | `resolve` 对 `127.0.0.1` / `file://` / `ftp://` 一律返回 `item:null`（不真的发请求） |
| 扩展名与 basename 白名单 | `media.test.js` 10 条（`../`、`/etc/x.jpg`、`.hidden.jpg`、`x.txt` 全拒） |
| HTML 挖首图 | og:image / twitter:image / 首图 / 相对转绝对 / `&amp;` 反转义 |
| 缓存淘汰 | 超上限按 mtime 从旧到新删 |
| 真实网络 | `picsum.photos` 直链 → 53,802 B image/jpeg；Wikimedia 网页 → 挖到首图并缓存 |
| 语言跟随 DSH | `createTranslator` 4 条（含"DSH 中文 / html lang=en"的现场复现） |
| 排版自适应 | headless Chrome 在 620/900/1180 三档宽度实拍，标签不再逐词换行 |
| 媒体渲染 | sea-render 的假 Canvas2D harness：image/video/未就绪/坏设置 108 次调用不抛、失败零 `drawImage`（不留黑帧）；缓冲 2560（媒体）/1280（程序化） |

## 5. 人工验收记录

- 2026-11-10：安装后刷新页面，**侧栏「潮间」入口正常出现，点击能开、Esc 能关**（用户确认）。
  这一条即 spec §10 M1 的完成判据："装进本机后能开能关，不影响对话"。
- 同一次操作留下了端到端证据 —— 状态文件被真实写入（宿主原子写、客户端 `fetch` 全部跑通）：

  ```
  $ cat ~/.dsh/intertidal/state.json
  ... "rhythm": { "lastShownAt": 1794310785, "lastHideAt": 1794310786,
                  "installedAt": 1794310785, "skipDates": [] }
  ```

  即：浏览器半片 → `GET /intertidal/state`（拿设置与天文参数）→ 覆盖层出现 →
  `POST /intertidal/rhythm {shown}` → 关闭 → `POST /intertidal/rhythm {hidden}`，
  四个接口里的三张都被真实调用过。

## 6. 回滚

```bash
# 1) 去掉 patch 里的 insert 段（文件末尾 4 行）
python3 - <<'PY'
import os
p = os.path.expanduser('~/.dsh/profiles/desktop/cordis.patch.yml')
s = open(p).read()
cut = s.find('# dsh-intertidal')
if cut != -1: open(p, 'w').write(s[:cut].rstrip() + '\n')
PY
# 2) 去掉 package.json 里的依赖条目 + node_modules 软链
rm ~/.dsh/profiles/desktop/node_modules/dsh-intertidal
```

插件本身是纯附加的：卸掉它不会动 DSH 的任何既有配置，状态文件留在 `~/.dsh/intertidal/state.json`。