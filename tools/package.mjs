// 桌面版打包脚本 (Electron)。
//   node tools/package.mjs win     -> release/拆封绘卷/拆封绘卷.exe  (Windows x64)
//   node tools/package.mjs linux   -> build/linux-x64/                    (仅用于在 Linux 上自动化测试)
// 步骤: 构建 dist -> 组装最小应用目录 (desktop/ + dist/ + package.json) -> @electron/packager 打包
//       -> Windows: 用 resedit (纯 JS, 无需 wine) 写入图标与版本信息。
import { packager } from '@electron/packager';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { embedWinResources } from './win-resources.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = require(path.join(root, 'package.json'));
const electronVersion = require('electron/package.json').version;

export const APP = {
  productName: '拆封绘卷',
  exeName: '拆封绘卷',
  company: '上海盖姆艾尔网络科技有限公司',
  description: '拆封绘卷 AnimeScrew - 二次元拧螺丝解谜小游戏',
  copyright: `Copyright © 2026 上海盖姆艾尔网络科技有限公司`,
  version: pkg.version,
  appId: 'com.gamel.animescrew',
};

async function rmrf(p) { await fs.rm(p, { recursive: true, force: true }); }
async function copyDir(src, dst) { await fs.cp(src, dst, { recursive: true }); }

async function stage() {
  const dir = path.join(root, 'build', 'app-stage');
  await rmrf(dir);
  await fs.mkdir(dir, { recursive: true });
  await copyDir(path.join(root, 'desktop'), path.join(dir, 'desktop'));
  await copyDir(path.join(root, 'dist'), path.join(dir, 'dist'));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
    name: 'anime-screw',
    productName: APP.productName,
    version: APP.version,
    description: APP.description,
    author: APP.company,
    main: 'desktop/main.js',
    license: 'UNLICENSED',
  }, null, 2));
  return dir;
}

async function main() {
  const target = process.argv[2] || 'win';
  console.log(`[package] 构建 dist ...`);
  execFileSync(process.execPath, [path.join(root, 'tools/build.mjs')], { stdio: 'inherit' });
  const dir = await stage();
  const isWin = target === 'win';
  const tmpOut = path.join(root, 'build', `pack-${target}`);
  await rmrf(tmpOut);
  console.log(`[package] Electron ${electronVersion} -> ${isWin ? 'win32' : 'linux'}-x64 ...`);
  const [outDir] = await packager({
    dir,
    out: tmpOut,
    name: APP.productName,
    executableName: isWin ? APP.exeName : 'anime-screw',
    platform: isWin ? 'win32' : 'linux',
    arch: 'x64',
    electronVersion,
    appVersion: APP.version,
    buildVersion: APP.version,
    appCopyright: APP.copyright,
    asar: true,
    overwrite: true,
    prune: false,
    quiet: true,
    // 图标与版本信息由 win-resources.mjs 写入，这里不传 icon/win32metadata (避免依赖 wine/rcedit)
  });

  const finalDir = isWin ? path.join(root, 'release', APP.productName) : path.join(root, 'build', 'linux-x64');
  await rmrf(finalDir);
  await fs.mkdir(path.dirname(finalDir), { recursive: true });
  await fs.rename(outDir, finalDir);
  await rmrf(tmpOut);

  if (isWin) {
    const exe = path.join(finalDir, `${APP.exeName}.exe`);
    await embedWinResources(exe, path.join(root, 'assets/icons/app.ico'), APP);
    // 默认 LICENSE 文件保留 (Electron/Chromium 许可证)；删掉无用的 version 文件以外不做改动
    console.log(`[package] 完成: ${path.relative(root, exe)}`);
  } else {
    console.log(`[package] 完成: ${path.relative(root, finalDir)}/anime-screw`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
