// "给朋友看看这幅画"：抖音 / 微信小游戏走 shareAppMessage (平台层 shareMessage)；桌面版存一张 PNG 到"图片"文件夹；
// 网页里生成一张 PNG 下载 (file:// 打开时浏览器不让读图，就提示截图)。
import { CHAPTERS } from '../config/LevelConfig.js';
import { GameConfig } from '../config/GameConfig.js';
import { drawCG, drawFrame } from '../render/CGView.js';
import { drawText } from '../ui/draw.js';
import { platform } from '../platform/index.js';

export function shareChapter(game, c) {
  const ch = CHAPTERS[c];
  const n = game.save.fragmentsOf(c);
  const title = n >= 10 ? `我把《${ch.title}》整幅拆出来了` : `《${ch.title}》拆到 ${n}/10 了`;
  if (platform.shareMessage) {
    // 抖音 tt.shareAppMessage / 微信 wx.shareAppMessage (平台层)
    if (!platform.shareMessage({ title, query: `chapter=${c}`, fail: () => game.toast('没分享出去，再试一次') })) game.toast('截个图发给朋友吧');
    return;
  }
  let url = null;
  try {
    const cv = platform.createCanvas(600, 860);
    const g = cv.getContext('2d');
    g.fillStyle = '#4a3a2e'; g.fillRect(0, 0, 600, 860);
    const fw = 460; const fh = fw * (891 / 726);
    drawFrame(g, 70, 60, fw, fh, ch.theme.frame, 14);
    drawCG(g, game, 70, 60, fw, fh, { chapter: c, owned: (i) => game.save.hasFragment(c * 10 + i), paper: false });
    drawText(g, title, 300, 60 + fh + 50, { size: 26, color: '#fbf0dc', serif: true });
    drawText(g, `《${GameConfig.title}》`, 300, 60 + fh + 90, { size: 16, color: 'rgba(251,240,220,0.6)', weight: 'normal' });
    url = cv.toDataURL('image/png');
  } catch (_) {
    url = null;
  }
  if (url && window.desktopSave && window.desktopSave.saveImage) {
    window.desktopSave.saveImage(`${ch.title}.png`, url).then((p) => game.toast(p ? '已存到"图片/拆封绘卷"' : '没存上，截个图吧'));
    return;
  }
  if (url) {
    const a = document.createElement('a');
    a.href = url; a.download = `拆封绘卷-${ch.title}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    game.toast('图片已经下载好了，发给朋友吧');
    return;
  }
  game.toast('截个图发给朋友吧');
}

/** 抖音：把这一关的录屏发成抖音视频 (tt.shareAppMessage channel:'video' + extra.videoPath) */
export function shareRecording(game, c) {
  const rec = platform.recorder;
  const v = rec && rec.video;
  if (!v || !platform.shareVideo) { game.toast('这次没录到，下一关再试试'); return; }
  const ch = CHAPTERS[c];
  platform.shareVideo({
    title: `《${GameConfig.title}》拆螺丝揭开《${ch.title}》`,
    desc: '一颗颗拧下来，画就露出来了',
    videoPath: v.path,
    topics: [GameConfig.title, '拆螺丝'],
  }).then((ok) => game.toast(ok ? '发出去啦' : '没发出去，再试一次'));
}
