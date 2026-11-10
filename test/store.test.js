/**
 * src/store.js 单测 —— node --test
 *
 * 全程用 mkdtemp 的临时目录，并把 DSH_HOME 指过去；测完清理。
 * 绝不碰用户真实的 ~/.dsh。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  resolveDshHome,
  statePath,
  emptyState,
  readState,
  writeState,
  patchSettings,
  rhythmEvent,
} from '../src/store.js';
import { DEFAULTS } from '../src/settings.js';

const ORIGINAL_DSH_HOME = process.env.DSH_HOME;
let tmpRoot = null;

test.before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-intertidal-test-'));
  process.env.DSH_HOME = tmpRoot;
});

test.after(async () => {
  if (ORIGINAL_DSH_HOME === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = ORIGINAL_DSH_HOME;
  if (tmpRoot) await fsp.rm(tmpRoot, { recursive: true, force: true });
});

/** 每个用例一个独立 home，互不干扰 */
let seq = 0;
async function freshHome() {
  seq += 1;
  const home = path.join(tmpRoot, `home-${seq}`);
  await fsp.mkdir(home, { recursive: true });
  return home;
}

/* ---------------------------- 路径解析 ---------------------------- */

test('resolveDshHome 认 $DSH_HOME，否则回 ~/.dsh', () => {
  assert.equal(resolveDshHome(), tmpRoot, '$DSH_HOME 优先');
  delete process.env.DSH_HOME;
  assert.equal(resolveDshHome(), path.join(os.homedir(), '.dsh'));
  process.env.DSH_HOME = tmpRoot;
  // 空串/空白也算没设
  process.env.DSH_HOME = '   ';
  assert.equal(resolveDshHome(), path.join(os.homedir(), '.dsh'));
  process.env.DSH_HOME = tmpRoot;
});

test('statePath 是 <home>/intertidal/state.json', () => {
  assert.equal(statePath('/tmp/abc'), path.join('/tmp/abc', 'intertidal', 'state.json'));
  assert.equal(statePath(tmpRoot), path.join(tmpRoot, 'intertidal', 'state.json'));
  // 不传 home 时按 resolveDshHome()
  assert.equal(statePath(), path.join(tmpRoot, 'intertidal', 'state.json'));
});

test('emptyState 结构与契约 §4 一致', () => {
  const nowMs = Date.parse('2026-11-10T12:00:00+08:00');
  const empty = emptyState(nowMs);
  assert.equal(empty.version, 1);
  assert.deepEqual(empty.settings, DEFAULTS);
  assert.deepEqual(empty.rhythm, {
    lastShownAt: null,
    lastHideAt: null,
    installedAt: Math.floor(nowMs / 1000),
    skipDates: [],
  });
  // 每次都是新对象，互不影响
  empty.settings.auto = false;
  assert.equal(DEFAULTS.auto, true);
  assert.deepEqual(emptyState(nowMs).settings, DEFAULTS);
});

/* ---------------------------- 读取兜底 ---------------------------- */

test('readState：文件缺失 → emptyState，不抛', async () => {
  const home = await freshHome();
  const state = await readState(home);
  assert.equal(state.version, 1);
  assert.deepEqual(state.settings, DEFAULTS);
  assert.equal(state.rhythm.installedAt !== null, true);
  assert.deepEqual(state.rhythm.skipDates, []);
});

test('readState：坏 JSON → emptyState，不抛，也不删用户文件', async () => {
  const home = await freshHome();
  const file = statePath(home);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const broken = '{ "version": 1, "settings": { 这不是合法 JSON ';
  await fsp.writeFile(file, broken, 'utf8');

  const state = await readState(home);
  assert.equal(state.version, 1);
  assert.deepEqual(state.settings, DEFAULTS);
  assert.deepEqual(state.rhythm.skipDates, []);

  // 用户文件必须原样还在
  assert.equal(await fsp.readFile(file, 'utf8'), broken);
});

test('readState：结构非法（数组/null/字段乱写）→ 规范化兜底', async () => {
  const home = await freshHome();
  const file = statePath(home);
  await fsp.mkdir(path.dirname(file), { recursive: true });

  for (const payload of ['null', '[]', '"字符串"', '42', '{"settings":"x","rhythm":[]}']) {
    await fsp.writeFile(file, payload, 'utf8');
    const state = await readState(home);
    assert.equal(state.version, 1);
    assert.deepEqual(state.settings, DEFAULTS, `${payload} 应退回默认设置`);
    assert.equal(state.rhythm.lastShownAt, null);
    assert.deepEqual(state.rhythm.skipDates, []);
  }
});

/* ---------------------------- 原子写入 ---------------------------- */

test('writeState：原子写后能读回，文件 0o600、目录 0o700、无残留 tmp', async () => {
  const home = await freshHome();
  const nowMs = Date.parse('2026-11-10T12:00:00+08:00');
  const state = {
    version: 1,
    settings: { auto: false, intervalMinutes: 60, location: { city: 'tokyo' } },
    rhythm: { lastShownAt: 10, lastHideAt: 20, installedAt: 5, skipDates: ['2026-11-09'] },
  };

  await writeState(home, state);

  const file = statePath(home);
  const dir = path.dirname(file);
  const dirStat = await fsp.stat(dir);
  assert.equal(dirStat.mode & 0o777, 0o700, `目录权限应为 0o700，实际 ${(dirStat.mode & 0o777).toString(8)}`);
  const fileStat = await fsp.stat(file);
  assert.equal(fileStat.mode & 0o777, 0o600, `文件权限应为 0o600，实际 ${(fileStat.mode & 0o777).toString(8)}`);

  // 没有 .tmp 残留
  const entries = await fsp.readdir(dir);
  assert.deepEqual(entries, ['state.json'], `目录里应只有 state.json，实际 ${entries.join(',')}`);

  // 读回：写入值保留，缺失字段被钳制/补默认
  const back = await readState(home);
  assert.equal(back.settings.auto, false);
  assert.equal(back.settings.intervalMinutes, 60);
  assert.deepEqual(back.settings.location, { city: 'tokyo', lat: 35.68, lon: 139.69, tz: 'Asia/Tokyo' });
  assert.equal(back.settings.durationSeconds, DEFAULTS.durationSeconds);
  assert.deepEqual(back.rhythm, {
    lastShownAt: 10,
    lastHideAt: 20,
    installedAt: 5,
    skipDates: ['2026-11-09'],
  });
  assert.ok(Number.isFinite(nowMs));
});

test('writeState：目录不存在时自动创建（含父级）', async () => {
  const home = path.join(tmpRoot, `deep-${Date.now()}`, 'a', 'b');
  await writeState(home, emptyState(Date.now()));
  const stat = await fsp.stat(statePath(home));
  assert.ok(stat.isFile());
});

test('writeState：连续写多次不破损（第二次覆盖第一次）', async () => {
  const home = await freshHome();
  const now = Date.now();
  await writeState(home, { ...emptyState(now), settings: { auto: false } });
  await writeState(home, { ...emptyState(now), settings: { auto: true, caption: false } });
  const back = await readState(home);
  assert.equal(back.settings.auto, true);
  assert.equal(back.settings.caption, false);
  const entries = await fsp.readdir(path.dirname(statePath(home)));
  assert.deepEqual(entries, ['state.json']);
});

/* ---------------------------- 设置合并落盘 ---------------------------- */

test('patchSettings：合并 + 钳制 + 落盘', async () => {
  const home = await freshHome();
  const merged = await patchSettings(home, { intervalMinutes: 9999, auto: false });
  assert.equal(merged.intervalMinutes, 480, '越界钳制到 480');
  assert.equal(merged.auto, false);
  assert.deepEqual(merged.quietHours, DEFAULTS.quietHours);

  const back = await readState(home);
  assert.equal(back.settings.intervalMinutes, 480);
  assert.equal(back.settings.auto, false);

  // 第二次 patch 只改一项，其余保留
  const again = await patchSettings(home, { form: 'pip' });
  assert.equal(again.form, 'pip');
  assert.equal(again.intervalMinutes, 480, '之前的设置不能被冲掉');
  assert.equal(again.auto, false);
});

/* ---------------------------- rhythm 事件 ---------------------------- */

test("rhythmEvent('shown') 写 lastShownAt，'hidden' 写 lastHideAt", async () => {
  const home = await freshHome();
  const t1 = Date.parse('2026-11-10T12:00:00+08:00');
  const t2 = t1 + 180000; // 三分钟后

  const afterShown = await rhythmEvent(home, 'shown', t1);
  assert.equal(afterShown.lastShownAt, Math.floor(t1 / 1000));
  assert.equal(afterShown.lastHideAt, null, 'shown 不该动 lastHideAt');

  const afterHidden = await rhythmEvent(home, 'hidden', t2);
  assert.equal(afterHidden.lastHideAt, Math.floor(t2 / 1000));
  assert.equal(afterHidden.lastShownAt, Math.floor(t1 / 1000), 'lastShownAt 必须保留');
  assert.deepEqual(afterHidden.skipDates, []);

  // 落盘了
  const back = await readState(home);
  assert.equal(back.rhythm.lastShownAt, Math.floor(t1 / 1000));
  assert.equal(back.rhythm.lastHideAt, Math.floor(t2 / 1000));
});

test("rhythmEvent('manual-open') 同时也写 lastShownAt（手动看过后顺延）", async () => {
  const home = await freshHome();
  const t = Date.parse('2026-11-10T20:00:00+08:00');
  const rhythm = await rhythmEvent(home, 'manual-open', t);
  assert.equal(rhythm.lastShownAt, Math.floor(t / 1000));
  assert.equal(rhythm.lastHideAt, null);
  const back = await readState(home);
  assert.equal(back.rhythm.lastShownAt, Math.floor(t / 1000));
});

test("rhythmEvent('skip-today') 追加当天本地日期", async () => {
  const home = await freshHome();
  const now = new Date(2026, 10, 10, 14, 0, 0); // 本地 2026-11-10
  const rhythm = await rhythmEvent(home, 'skip-today', now.getTime());
  assert.deepEqual(rhythm.skipDates, ['2026-11-10']);

  // 同一天再点一次不会重复
  const twice = await rhythmEvent(home, 'skip-today', now.getTime() + 3600000);
  assert.deepEqual(twice.skipDates, ['2026-11-10']);

  const back = await readState(home);
  assert.deepEqual(back.rhythm.skipDates, ['2026-11-10']);
});

test('rhythmEvent：skipDates 只保留最近 7 天', async () => {
  const home = await freshHome();
  // 先塞 6 个历史日期
  const seed = emptyState(Date.now());
  seed.rhythm.skipDates = [
    '2026-11-01', '2026-11-02', '2026-11-03',
    '2026-11-04', '2026-11-05', '2026-11-06',
  ];
  await writeState(home, seed);

  const day7 = new Date(2026, 10, 7, 9, 0, 0);
  const r7 = await rhythmEvent(home, 'skip-today', day7.getTime());
  assert.equal(r7.skipDates.length, 7);
  assert.deepEqual(r7.skipDates, [
    '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04',
    '2026-11-05', '2026-11-06', '2026-11-07',
  ]);

  // 第 8 天：最早的 11-01 被挤掉
  const day8 = new Date(2026, 10, 8, 9, 0, 0);
  const r8 = await rhythmEvent(home, 'skip-today', day8.getTime());
  assert.equal(r8.skipDates.length, 7, '永远不超过 7 条');
  assert.equal(r8.skipDates[0], '2026-11-02');
  assert.equal(r8.skipDates.at(-1), '2026-11-08');

  // 落盘后也一样
  const back = await readState(home);
  assert.deepEqual(back.rhythm.skipDates, r8.skipDates);
});

test('rhythmEvent：未知事件抛 TypeError（宿主路由应先校验）', async () => {
  const home = await freshHome();
  await assert.rejects(() => rhythmEvent(home, 'explode', Date.now()), TypeError);
  // 不写文件
  const state = await readState(home);
  assert.deepEqual(state.settings, DEFAULTS);
});

test('rhythmEvent：nowMs 传 Date 也行，非法时间落到当前时间且不抛', async () => {
  const home = await freshHome();
  const t = Date.parse('2026-11-10T12:00:00+08:00');
  const withDate = await rhythmEvent(home, 'shown', new Date(t));
  assert.equal(withDate.lastShownAt, Math.floor(t / 1000));

  const before = Math.floor(Date.now() / 1000);
  const withBad = await rhythmEvent(home, 'hidden', Number.NaN);
  const after = Math.floor(Date.now() / 1000);
  assert.ok(withBad.lastHideAt >= before - 1 && withBad.lastHideAt <= after + 1);
});