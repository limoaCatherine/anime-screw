// 小游戏构建 (抖音 / 微信共用)：
//   npm run build:douyin  →  douyin/dist/ (导入抖音开发者工具；交付时放在「抖音小游戏」文件夹)
//   npm run build:wechat  →  wechat/dist/ (导入微信开发者工具；交付时放在「微信小游戏」文件夹)
// - 同一份 src/ 玩法代码，打包时把平台层 src/platform/web 换成 src/platform/<douyin|wechat>，Matter.js 直接打进包里
// - 主包：game.js + game-config.js + js/main.js + 角色头像 (pngquant) + 预渲染音效 (assets/sfx，先跑 tools/render_sfx.mjs)
// - 分包 (tt/wx.loadSubpackage)：sub_voice 语音 / sub_bgm 音乐 (mp3 96k) / sub_cg 插画 (jpg 重新压缩)
// - 体积按各平台官方限制检查 (见 TARGETS)：
//     抖音：主包 ≤ 4MB、单个分包 ≤ 20MB、整包 ≤ 20MB (不计 . 开头文件)
//     微信：主包 ≤ 4MB、整包 (主包+分包) ≤ 30MB、普通分包单个不限 (独立分包 ≤ 4MB，本作不用独立分包)
//       —— developers.weixin.qq.com/minigame/dev/guide/base-ability/subPackage/useSubPackage.html
import { build } from 'esbuild';
import { promises as fs } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MB = 1024 * 1024;
const TARGETS = {
  douyin: { label: '抖音小游戏', api: 'tt', G: 'DY', cfgFile: 'douyin.config.json', limits: { main: 4 * MB, sub: 20 * MB, total: 20 * MB } },
  wechat: { label: '微信小游戏', api: 'wx', G: 'WX', cfgFile: 'wechat.config.json', limits: { main: 4 * MB, sub: Infinity, total: 30 * MB } },
};
const targetName = process.argv[2] || 'douyin';
const T = TARGETS[targetName];
if (!T) { console.error(`未知目标 ${targetName} (douyin | wechat)`); process.exit(1); }
const proj = path.join(root, targetName);
const out = path.join(proj, 'dist');
const LIMITS = T.limits;

const platformPlugin = {
  name: `${targetName}-platform`,
  setup(b) {
    b.onResolve({ filter: /^\.\/web\/index\.js$/ }, (args) => {
      if (args.importer.endsWith(path.join('src', 'platform', 'index.js'))) return { path: path.join(root, `src/platform/${targetName}/index.js`) };
      return undefined;
    });
    b.onResolve({ filter: /lib\/matter\.js$/ }, () => ({ path: path.join(root, 'src/platform/mini/matter-shim.js') }));
  },
};

async function dirSize(dir) {
  let n = 0;
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? await dirSize(p) : (await fs.stat(p)).size;
  }
  return n;
}

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

async function writeProjectFiles(cfg, pkg) {
  const subPackages = [
    { name: 'voice', root: 'sub_voice/' },
    { name: 'bgm', root: 'sub_bgm/' },
    { name: 'cg', root: 'sub_cg/' },
  ];
  if (targetName === 'douyin') {
    await fs.writeFile(path.join(out, 'game-config.js'), `// 抖音小游戏配置 (唯一需要改的地方)：appid + 激励视频广告位 ID。
// appid：抖音开放平台 → 小游戏 → 开发设置 里的 AppID (导入开发者工具时也要填同一个)
// rewardedAdUnitId：流量主 → 广告管理 → 激励视频广告位 ID。保持 YOUR_ 开头 (或留空) = 首发版没有广告：所有「看广告」按钮隐藏，
//   复活换成每关一次免费「再试一次」，道具用完每天可免费领一个；填上真实 ID 重新上传后，激励视频自动恢复
// shareTemplateId：(可选) 分享素材审核通过后的模板 ID
module.exports = {
  appid: ${JSON.stringify(cfg.appid)},
  rewardedAdUnitId: ${JSON.stringify(cfg.rewardedAdUnitId)},
  shareTemplateId: ${JSON.stringify(cfg.shareTemplateId || '')},
};
`, 'utf8');
    await fs.writeFile(path.join(out, 'game.js'), `// 《拆封绘卷》抖音小游戏入口  v${pkg.version}  出品：狸猫
GameGlobal.__DY_CONFIG__ = require('./game-config.js');
GameGlobal.__DY_BGM_LOOPS__ = require('./bgm-loops.js');
require('./js/main.js');
`, 'utf8');
    await fs.writeFile(path.join(out, 'game.json'), `${JSON.stringify({ deviceOrientation: 'portrait', showStatusBar: false, subPackages }, null, 2)}\n`, 'utf8');
    await fs.writeFile(path.join(out, 'project.config.json'), `${JSON.stringify({
      appid: cfg.appid,
      projectname: cfg.projectname || '拆封绘卷',
      setting: { es6: true, urlCheck: true, autoCompile: true, mockUpdate: false, mockLogin: false },
    }, null, 2)}\n`, 'utf8');
    return;
  }
  // 微信：字段按 developers.weixin.qq.com/minigame/dev/reference/configuration/app.html (game.json)
  //       与 /minigame/dev/devtools/projectconfig.html (project.config.json，compileType 有效值 minigame / gamePlugin) 核对
  await fs.writeFile(path.join(out, 'game-config.js'), `// 微信小游戏配置 (唯一需要改的地方)：激励视频广告位 ID + 转发文案。appid 在 project.config.json (导入微信开发者工具时也会让你填)。
// rewardedAdUnitId：MP 后台 → 流量主 → 广告管理 → 激励视频广告位 ID (adunit-xxxx)。保持 YOUR_ 开头 (或留空) = 首发版没有广告：
//   所有「看广告」按钮隐藏，复活换成每关一次免费「再试一次」，道具用完每天可免费领一个；填上真实 ID 重新上传后，激励视频自动恢复
// shareTitle：右上角「转发」和游戏内转发的默认标题；shareImageUrlId：(可选) MP 后台审核通过的转发图片编号
module.exports = {
  appid: ${JSON.stringify(cfg.appid)},
  rewardedAdUnitId: ${JSON.stringify(cfg.rewardedAdUnitId)},
  shareTitle: ${JSON.stringify(cfg.shareTitle || '')},
  shareImageUrlId: ${JSON.stringify(cfg.shareImageUrlId || '')},
};
`, 'utf8');
  await fs.writeFile(path.join(out, 'game.js'), `// 《拆封绘卷》微信小游戏入口  v${pkg.version}  出品：狸猫
GameGlobal.__WX_CONFIG__ = require('./game-config.js');
GameGlobal.__WX_BGM_LOOPS__ = require('./bgm-loops.js');
require('./js/main.js');
`, 'utf8');
  await fs.writeFile(path.join(out, 'game.json'), `${JSON.stringify({ deviceOrientation: 'portrait', showStatusBar: false, subpackages: subPackages }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(out, 'project.config.json'), `${JSON.stringify({
    description: `《拆封绘卷》v${pkg.version} 微信小游戏  出品：狸猫`,
    compileType: 'minigame',
    appid: cfg.appid,
    projectname: cfg.projectname || '拆封绘卷',
    libVersion: cfg.libVersion || 'latest',
    setting: { es6: true, enhance: false, postcss: false, minified: true, urlCheck: true, uglifyFileName: false, ignoreUploadUnusedFiles: true },
    packOptions: { ignore: [], include: [] },
  }, null, 2)}\n`, 'utf8');
}

async function main() {
  const t0 = Date.now();
  const cfg = JSON.parse(await fs.readFile(path.join(proj, T.cfgFile), 'utf8'));
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(path.join(out, 'js'), { recursive: true });

  // 1) 代码
  await build({
    entryPoints: [path.join(root, 'src/main.js')],
    bundle: true, format: 'iife', target: ['es2017'], minify: true, sourcemap: false,
    outfile: path.join(out, 'js/main.js'), legalComments: 'none', charset: 'utf8',
    plugins: [platformPlugin], logLevel: 'error',
  });
  await writeProjectFiles(cfg, pkg);

  // 2) 主包资源：头像 pngquant；音效
  const chars = path.join(out, 'assets/images/chars');
  await fs.mkdir(chars, { recursive: true });
  for (const f of (await fs.readdir(path.join(root, 'assets/images/chars'))).filter((n) => n.endsWith('.png'))) {
    const src = path.join(root, 'assets/images/chars', f); const dst = path.join(chars, f);
    try { run('pngquant', ['--quality=65-90', '--speed', '1', '--strip', '--force', '--output', dst, src]); } catch (_) { await fs.copyFile(src, dst); }
  }
  const sfxSrc = path.join(root, 'assets/sfx');
  const sfx = (await fs.readdir(sfxSrc).catch(() => [])).filter((n) => n.endsWith('.mp3'));
  if (sfx.length < 40) throw new Error('assets/sfx 里没有预渲染音效，先运行 node tools/render_sfx.mjs');
  await fs.mkdir(path.join(out, 'assets/sfx'), { recursive: true });
  for (const f of sfx) await fs.copyFile(path.join(sfxSrc, f), path.join(out, 'assets/sfx', f));

  // 3) 分包
  const stub = (name) => `// 分包「${name}」入口：只放资源，${T.api}.loadSubpackage 加载完成即可使用\n`;
  const voiceDir = path.join(out, 'sub_voice/voice'); await fs.mkdir(voiceDir, { recursive: true });
  await fs.writeFile(path.join(out, 'sub_voice/game.js'), stub('voice'));
  for (const f of (await fs.readdir(path.join(root, 'assets/audio/voice'))).filter((n) => n.endsWith('.mp3'))) {
    run('ffmpeg', ['-v', 'error', '-y', '-i', path.join(root, 'assets/audio/voice', f), '-ac', '1', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '64k', path.join(voiceDir, f)]);
  }
  const bgmDir = path.join(out, 'sub_bgm/bgm'); await fs.mkdir(bgmDir, { recursive: true });
  await fs.writeFile(path.join(out, 'sub_bgm/game.js'), stub('bgm'));
  // BGM：源用 .ogg (逐样本精确)，循环曲加首尾垫片编 mp3，播放侧两路接力 (src/systems/LoopTrack.js)，循环点无空白
  {
    const acfg = await fs.readFile(path.join(root, 'src/config/AudioConfig.js'), 'utf8');
    const stingFile = acfg.match(/sting:\s*\{[^}]*file:\s*'([^']+)'/)[1];
    const tracksBlock = acfg.slice(acfg.indexOf('tracks:'), acfg.indexOf('sting:'));
    const loops = [...tracksBlock.matchAll(/file:\s*'([^']+)'/g)].map((m) => m[1]);
    const loopsJson = path.join(proj, 'bgm-loops.json');
    run('python3', [path.join(root, 'tools/douyin_bgm.py'), path.join(root, 'assets/audio/bgm'), bgmDir, path.join(proj, 'bgm-loop-report.txt'), loopsJson, loops.join(','), stingFile]);
    const meta = JSON.parse(await fs.readFile(loopsJson, 'utf8'));
    await fs.writeFile(path.join(out, 'bgm-loops.js'), `// 自动生成 (tools/douyin_bgm.py)：循环曲的垫片与一圈长度 (秒)，LoopTrack 两路接力用。不要手改。\nmodule.exports = ${JSON.stringify(meta, null, 2)};\n`);
  }
  const cgDir = path.join(out, 'sub_cg/cg'); await fs.mkdir(cgDir, { recursive: true });
  await fs.writeFile(path.join(out, 'sub_cg/game.js'), stub('cg'));
  for (const f of (await fs.readdir(path.join(root, 'assets/images/cg'))).filter((n) => /\.jpe?g$/i.test(n))) {
    run('python3', ['-c', 'import sys;from PIL import Image;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],"JPEG",quality=84,optimize=True,progressive=False,subsampling=0)', path.join(root, 'assets/images/cg', f), path.join(cgDir, f)]);
    const a = (await fs.stat(path.join(root, 'assets/images/cg', f))).size; const b = (await fs.stat(path.join(cgDir, f))).size;
    if (b > a) await fs.copyFile(path.join(root, 'assets/images/cg', f), path.join(cgDir, f));   // 原图更小就用原图
  }

  // 4) 许可与说明
  await fs.mkdir(path.join(out, 'licenses'), { recursive: true });
  for (const f of await fs.readdir(path.join(root, 'docs/licenses'))) await fs.copyFile(path.join(root, 'docs/licenses', f), path.join(out, 'licenses', f));

  // 4b) 微信：右上角转发 / 游戏内转发用的 5:4 卡片图 (主包)
  if (targetName === 'wechat') {
    run('python3', ['-c', `import sys
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB'); w,h=im.size; ch=int(w*4/5); top=int((h-ch)*0.3)
im.crop((0,top,w,top+ch)).resize((500,400),Image.LANCZOS).save(sys.argv[2],'JPEG',quality=82,optimize=True)`, path.join(root, 'assets/images/cg', (await fs.readdir(path.join(root, 'assets/images/cg'))).filter((n) => /\.jpe?g$/i.test(n)).sort()[0]), path.join(out, 'assets/share.jpg')]);
  }

  // 5) 音频审计：抖音 / 微信 iOS 都播不了 .ogg，包里的语音 / BGM / 音效必须全是 .mp3；顺便量一下响度
  const walk = async (d) => (await Promise.all((await fs.readdir(d, { withFileTypes: true })).map((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])))).flat();
  const allFiles = await walk(out);
  const badAudio = allFiles.filter((f) => /\.(ogg|oga|opus|wav|m4a|aac|flac|webm)$/i.test(f));
  if (badAudio.length) { console.error(`${T.label}包里不能有非 mp3 音频：\n${badAudio.join('\n')}`); process.exit(3); }
  const lufs = (f) => {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
    const m = String(r.stderr || '').match(/I:\s+(-?[\d.]+) LUFS/g); return m ? parseFloat(m.at(-1).replace(/^I:\s+/, '')) : NaN;
  };
  const audioLines = [];
  for (const [label, re] of [['语音', /sub_voice[\\/].*\.mp3$/], ['BGM', /sub_bgm[\\/].*\.mp3$/], ['音效', /assets[\\/]sfx[\\/].*\.mp3$/]]) {
    const fsx = allFiles.filter((f) => re.test(f));
    const v = (label === '音效' ? [] : fsx.map(lufs)).filter((x) => Number.isFinite(x) && x > -70);
    const avg = v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '-';
    const rng = v.length ? `${Math.min(...v).toFixed(1)}~${Math.max(...v).toFixed(1)}` : '-';
    audioLines.push(`${label.padEnd(4)} ${String(fsx.length).padStart(3)} 个 mp3${v.length ? `  响度 平均 ${avg} LUFS (${rng})` : '  (短音效，按 sfxVolume 统一渲染)'}`);
  }

  // 6) 体积
  const total = await dirSize(out);
  const subs = {};
  for (const s of ['sub_voice', 'sub_bgm', 'sub_cg']) subs[s] = await dirSize(path.join(out, s));
  const main = total - Object.values(subs).reduce((a, b) => a + b, 0);
  const fmt = (n) => `${(n / MB).toFixed(2)} MB`;
  const lines = [
    `${T.label}包体 v${pkg.version} (${new Date().toLocaleString('zh-CN', { hour12: false })})`,
    `主包        ${fmt(main).padStart(9)}   上限 ${LIMITS.main / MB} MB   ${main <= LIMITS.main ? 'OK' : '超限!'}`,
    ...Object.entries(subs).map(([k, v]) => `分包 ${k.padEnd(9)} ${fmt(v).padStart(9)}   ${Number.isFinite(LIMITS.sub) ? `上限 ${LIMITS.sub / MB} MB ` : '单个不限 '} ${v <= LIMITS.sub ? 'OK' : '超限!'}`),
    `整包        ${fmt(total).padStart(9)}   上限 ${LIMITS.total / MB} MB  ${total <= LIMITS.total ? 'OK' : '超限!'}`,
    '音频 (全部 mp3，没有 ogg/wav)：',
    ...audioLines.map((l) => `  ${l}`),
  ];
  await fs.writeFile(path.join(proj, 'size-report.txt'), `${lines.join('\n')}\n`, 'utf8');
  console.log(lines.join('\n'));
  if (main > LIMITS.main || total > LIMITS.total || Object.values(subs).some((v) => v > LIMITS.sub)) { console.error('包体超过官方限制'); process.exit(2); }
  console.log(`构建完成 -> ${targetName}/dist/ (${Date.now() - t0} ms)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
