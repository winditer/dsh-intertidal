/**
 * dsh-intertidal build —— 把浏览器半片打成 DSH web-module loader 唯一接受的产物。
 *
 * 契约（DSH 0.2.1-rc.5，与 dsh-workbench / dsh-media-desk 同款）：
 *  - 产物必须是 classic script，顶层只有一条语句 `window.__ModuleLoader__.load({id,factory})`；
 *  - `id` 必须等于包名（loader 用包名匹配图里的行）；
 *  - factory 内部 `require` 只能解析 shell 的静态模块表（下面 ALLOWED_EXTERNALS 里的 11 条）
 *    与其它插件包名，所以本地模块必须全部内联，模块表项保持 `require("...")` 原样。
 *
 * esbuild 定位顺序：`ESBUILD_BIN` → 若干已知本地安装 → PATH。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const ENTRY = resolve(ROOT, 'src/client/index.jsx');
const OUT_FILE = resolve(ROOT, 'dist/client.js');

/** 浏览器模块表保证可解析的 specifier（恰好 11 条）。 */
export const ALLOWED_EXTERNALS = Object.freeze([
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
]);

const ESBUILD_CANDIDATES = [
  resolve(ROOT, 'node_modules/esbuild/bin/esbuild'),
  '/Users/haifeng/Documents/dsh/node_modules/esbuild/bin/esbuild',
  '/Users/haifeng/Documents/dsh-dynamicsWorld/node_modules/esbuild/bin/esbuild',
  '/Users/haifeng/Documents/dsh-elf/node_modules/esbuild/bin/esbuild',
  '/Users/haifeng/Documents/AIWriter/node_modules/esbuild/bin/esbuild',
  '/Users/haifeng/Documents/Mole/node_modules/esbuild/bin/esbuild',
  '/Users/haifeng/Documents/dsh-freedom-space/dsh-workbench/node_modules/esbuild/bin/esbuild',
];

/** 找一个可用的 esbuild；找不到就抛出可读错误。 */
export function findEsbuild() {
  const explicit = process.env.ESBUILD_BIN;
  if (explicit && existsSync(explicit)) return explicit;
  for (const candidate of ESBUILD_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  const which = spawnSync('which', ['esbuild'], { encoding: 'utf8' });
  const found = which.status === 0 ? which.stdout.trim() : '';
  if (found) return found;
  throw new Error('找不到 esbuild。请设置 ESBUILD_BIN=/path/to/esbuild，或在本包内 `npm i -D esbuild`。');
}

/** loader 要求的外壳；`id` 取自 package.json。 */
export function wrapBundle(body, id) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) {
    throw new Error(`bundle load id 必须是合法包名，收到：${JSON.stringify(id)}`);
  }
  return `window.__ModuleLoader__.load({
  id: "${id}",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${body}
    return module.exports;
  }
});
`;
}

/** 把入口打成 dist/client.js，返回最终文本。 */
export async function buildClientBundle({ outFile = OUT_FILE, minify = false, entry = ENTRY } = {}) {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
  const id = String(pkg.name ?? '').trim();
  mkdirSync(dirname(outFile), { recursive: true });
  const raw = resolve(dirname(outFile), '_client.bundle.js');
  const bin = findEsbuild();

  const args = [
    entry,
    '--bundle',
    `--outfile=${raw}`,
    '--format=cjs',
    '--platform=browser',
    '--target=chrome114,safari16',
    '--jsx=automatic',
    '--loader:.js=jsx',
    '--loader:.jsx=jsx',
    '--loader:.css=text',
    '--define:process.env.NODE_ENV="production"',
    '--legal-comments=none',
    '--charset=utf8',
    '--log-level=warning',
    ...ALLOWED_EXTERNALS.map((spec) => `--external:${spec}`),
  ];
  if (minify) args.push('--minify');

  const result = spawnSync(bin, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`esbuild 失败（${result.status}）：\n${result.stderr || result.stdout}`);
  }

  const body = readFileSync(raw, 'utf8');
  rmSync(raw, { force: true });
  const wrapped = wrapBundle(body, id);
  writeFileSync(outFile, wrapped, 'utf8');
  return wrapped;
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const minify = process.argv.includes('--minify');
  // `--check` 只验证浏览器图能打包，不落 dist/：并行工作时用它验证而不互相踩产物。
  const check = process.argv.includes('--check');
  const entryArg = process.argv.find((arg) => arg.startsWith('--entry='));
  const entry = entryArg ? resolve(ROOT, entryArg.slice('--entry='.length)) : ENTRY;
  if (check) {
    const scratch = resolve(tmpdir(), `dsh-intertidal-check-${process.pid}.js`);
    try {
      const text = await buildClientBundle({ outFile: scratch, minify, entry });
      process.stdout.write(`checked ${entry} (${(text.length / 1024).toFixed(1)} KiB)\n`);
    } finally {
      rmSync(scratch, { force: true });
      rmSync(resolve(dirname(scratch), '_client.bundle.js'), { force: true });
    }
  } else {
    const text = await buildClientBundle({ minify });
    process.stdout.write(`built ${OUT_FILE} (${(text.length / 1024).toFixed(1)} KiB)\n`);
  }
}