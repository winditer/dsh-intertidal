/**
 * 潮间 · 状态文件读写
 *
 * 路径：<home>/intertidal/state.json（home 默认 $DSH_HOME ?? ~/.dsh）。
 * 装载期不碰文件系统：只有函数被调用时才 IO。
 * 写入一律原子（tmp + rename），文件 0o600、目录 0o700。
 * 读取遇到文件缺失 / 坏 JSON / 结构不对 → 返回 emptyState，绝不抛、也不删用户文件。
 */

import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import { DEFAULTS, LIMITS, mergeSettings, sanitizeSettings, sanitizeRhythm } from './settings.js';

const STATE_VERSION = 1;
const DIR_NAME = 'intertidal';
const FILE_NAME = 'state.json';

/** $DSH_HOME ?? ~/.dsh（支持以 ~ 开头的手写路径） */
export function resolveDshHome() {
  const raw = process.env.DSH_HOME;
  if (typeof raw === 'string' && raw.trim()) {
    const t = raw.trim();
    if (t === '~') return os.homedir();
    if (t.startsWith('~/') || t.startsWith('~\\')) return path.join(os.homedir(), t.slice(2));
    return t;
  }
  return path.join(os.homedir(), '.dsh');
}

/** <home>/intertidal/state.json */
export function statePath(home) {
  const base = typeof home === 'string' && home.trim() ? home : resolveDshHome();
  return path.join(base, DIR_NAME, FILE_NAME);
}

/** 空状态：版本 1 + 默认设置 + 空的 rhythm */
export function emptyState(nowMs) {
  const ms = nowMs instanceof Date ? nowMs.getTime() : Number(nowMs);
  const nowSec = Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  return {
    version: STATE_VERSION,
    settings: sanitizeSettings(DEFAULTS),
    rhythm: { lastShownAt: null, lastHideAt: null, installedAt: nowSec, skipDates: [] },
  };
}

/** 任意对象 → 合法 state（缺项补默认，非法项钳制；不抛） */
function normalizeState(input, nowMs) {
  const empty = emptyState(nowMs);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return empty;
  return {
    version: STATE_VERSION,
    settings: sanitizeSettings(input.settings),
    rhythm: sanitizeRhythm(input.rhythm, nowMs),
  };
}

/** 读 state；文件缺失 / 坏 JSON / 结构不对 → emptyState(now)。不抛、不删文件。 */
export async function readState(home) {
  const file = statePath(home);
  const now = Date.now();
  let text;
  try {
    text = await fsp.readFile(file, 'utf8');
  } catch {
    return emptyState(now);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return emptyState(now);
  }
  return normalizeState(parsed, now);
}

/** 原子写 state：建目录 → 写 tmp → fsync → rename；文件 0o600、目录 0o700 */
export async function writeState(home, state) {
  const file = statePath(home);
  const dir = path.dirname(file);
  const normalized = normalizeState(state, Date.now());
  const payload = JSON.stringify(normalized, null, 2) + '\n';

  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  // mkdir 的 mode 会被 umask 削，显式再 chmod 一次（best-effort）
  await fsp.chmod(dir, 0o700).catch(() => {});

  const tmp = path.join(
    dir,
    `.${FILE_NAME}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );

  try {
    const handle = await fsp.open(tmp, 'wx', 0o600);
    try {
      await handle.writeFile(payload, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fsp.chmod(tmp, 0o600).catch(() => {});
    await fsp.rename(tmp, file);
  } catch (err) {
    await fsp.unlink(tmp).catch(() => {});
    throw err;
  }

  return normalized;
}

/** 合并并落盘 settings，返回钳制后的完整 settings */
export async function patchSettings(home, patch) {
  const state = await readState(home);
  const settings = mergeSettings(state.settings, patch);
  const next = { ...state, settings };
  await writeState(home, next);
  return settings;
}

/** rhythm 事件：shown / hidden / skip-today / manual-open → 最新 rhythm */
export async function rhythmEvent(home, event, nowMs) {
  const ms = nowMs instanceof Date ? nowMs.getTime() : Number(nowMs);
  const now = Number.isFinite(ms) ? ms : Date.now();
  const nowSec = Math.floor(now / 1000);

  const state = await readState(home);
  const rhythm = sanitizeRhythm(state.rhythm, now);

  switch (event) {
    case 'shown':
      rhythm.lastShownAt = nowSec;
      break;
    case 'hidden':
      rhythm.lastHideAt = nowSec;
      break;
    case 'manual-open':
      // 手动看过 → 也写 lastShownAt，配合「手动看过后顺延」
      rhythm.lastShownAt = nowSec;
      break;
    case 'skip-today': {
      const today = localDate(now);
      // 追加当天日期，去重排序后只保留最近 7 天
      rhythm.skipDates = sanitizeRhythm(
        { ...rhythm, skipDates: [...rhythm.skipDates, today] },
        now,
      ).skipDates;
      break;
    }
    default:
      throw new TypeError(`unknown rhythm event: ${String(event)}`);
  }

  await writeState(home, { ...state, rhythm });
  return rhythm;
}

/** 系统本地日期 YYYY-MM-DD（不依赖实现里的时区设置：skipDates 记的是本机日历日） */
function localDate(nowMs) {
  const d = new Date(nowMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export { DEFAULTS, LIMITS };