// 弹出面板：设置 (总音量滑条 + 开关)、制作人员、提示卡、广告占位倒计时、确认框。
// 统一接口：buttons / render(ctx, dt) / down(p) / move(p) / up(p)，由场景的弹窗栈分发输入。
import { GameConfig } from '../config/GameConfig.js';
import { CHARACTERS } from '../config/VoiceConfig.js';
import { AudioConfig } from '../config/AudioConfig.js';
import { Button } from './Button.js';
import { Icons } from './Icons.js';
import { drawPanel, drawText, dimScreen, roundRectPath, drawParagraph, drawPortrait, ease } from './draw.js';

const W = GameConfig.width;
const C = GameConfig.colors;

export class Modal {
  constructor(game) {
    this.game = game;
    this.buttons = [];
    this.t = 0;
    this.closed = false;
  }
  btn(o) { const b = new Button(o); b.events = this.game.events; this.buttons.push(b); return b; }
  down(p) { for (const b of this.buttons) if (b.handleDown(p)) return true; return true; }
  move(p) { for (const b of this.buttons) b.handleMove(p); }
  up(p) { for (const b of this.buttons) if (b.handleUp(p)) return true; return true; }
  update(dt) { this.t += dt; }
  get pop() { return ease.backOut(Math.min(1, this.t / 0.25), 1.4); }
  renderButtons(ctx, dt) { for (const b of this.buttons) b.render(ctx, dt); }
  close() { this.closed = true; }
}

class Slider {
  constructor({ x, y, w, value, onChange }) { Object.assign(this, { x, y, w, value, onChange }); this.drag = false; }
  hit(p) { return p.x > this.x - 14 && p.x < this.x + this.w + 14 && Math.abs(p.y - this.y) < 22; }
  set(p) { this.value = Math.max(0, Math.min(1, (p.x - this.x) / this.w)); this.onChange(this.value); }
  down(p) { if (this.hit(p)) { this.drag = true; this.set(p); return true; } return false; }
  move(p) { if (this.drag) this.set(p); }
  up() { const was = this.drag; this.drag = false; return was; }
  render(ctx) {
    roundRectPath(ctx, this.x, this.y - 5, this.w, 10, 5);
    ctx.fillStyle = '#d9c8aa'; ctx.fill();
    roundRectPath(ctx, this.x, this.y - 5, this.w * this.value, 10, 5);
    ctx.fillStyle = C.copper; ctx.fill();
    const kx = this.x + this.w * this.value;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    ctx.beginPath(); ctx.arc(kx, this.y, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#fffaf0'; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(kx, this.y, 13, 0, Math.PI * 2);
    ctx.strokeStyle = C.copper; ctx.lineWidth = 2.5; ctx.stroke();
  }
}

export class SettingsPanel extends Modal {
  constructor(game, { onClose, inGame = false, onHome = null, onRestart = null } = {}) {
    super(game);
    this.onClose = onClose;
    this.inGame = inGame;
    const a = game.audio;
    this.slider = new Slider({ x: 150, y: 330, w: 260, value: a.master, onChange: (v) => a.setMaster(v) });
    const toggles = [
      ['语音', () => game.voice.enabled, (v) => game.voice.setEnabled(v)],
      ['音效', () => game.audio.enabled, (v) => game.audio.setEnabled(v)],
      ['音乐', () => game.bgm.enabled, (v) => game.bgm.setEnabled(v)],
    ];
    this.toggles = toggles.map(([label, get, set], i) => {
      const b = this.btn({ x: 160 + i * 110, y: 410, w: 96, h: 46, style: 'secondary', label, fontSize: 18, onClick: () => { set(!get()); } });
      b.get = get;
      return b;
    });
    let y = 490;
    if (inGame) {
      this.btn({ x: W / 2, y, w: 300, h: 52, style: 'secondary', label: '重新开始这一关', fontSize: 20, onClick: () => onRestart && onRestart() });
      y += 66;
      this.btn({ x: W / 2, y, w: 300, h: 52, style: 'secondary', label: '回到选关', fontSize: 20, onClick: () => onHome && onHome() });
      y += 66;
    } else {
      this.btn({ x: W / 2, y, w: 300, h: 52, style: 'secondary', label: '制作人员', fontSize: 20, onClick: () => game.pushModal(new CreditsPanel(game)) });
      y += 66;
      this.resetBtn = this.btn({ x: W / 2, y, w: 300, h: 52, style: 'secondary', label: '清空存档', fontSize: 20, onClick: () => this.askReset() });
      y += 66;
    }
    this.btn({ x: W / 2, y: y + 10, w: 220, h: 56, style: 'primary', label: inGame ? '继续' : '好了', fontSize: 24, onClick: () => { this.close(); onClose && onClose(); } });
    this.bottom = y + 60;
  }

  askReset() {
    this.game.pushModal(new ConfirmPanel(this.game, {
      title: '清空存档？', text: '拆过的画、攒的道具都会清掉，\n没法找回。', ok: '清空', cancel: '算了',
      onOk: () => { this.game.save.reset(); this.game.toast('存档已清空'); },
    }));
  }

  down(p) { if (this.slider.down(p)) return true; return super.down(p); }
  move(p) { this.slider.move(p); super.move(p); }
  up(p) { if (this.slider.up(p)) return true; return super.up(p); }

  render(ctx, dt) {
    dimScreen(ctx, 0.55);
    ctx.save();
    const s = this.pop;
    ctx.translate(W / 2, 480); ctx.scale(s, s); ctx.translate(-W / 2, -480);
    drawPanel(ctx, 40, 230, W - 80, this.bottom - 230 + 20, 22);
    drawText(ctx, '设置', W / 2, 270, { size: 26, serif: true });
    drawText(ctx, '总音量', 70, 330, { size: 18, align: 'left' });
    this.slider.render(ctx);
    drawText(ctx, `${Math.round(this.slider.value * 100)}`, W - 66, 331, { size: 15, color: C.inkLight, align: 'right', weight: 'normal' });
    for (const b of this.toggles) {
      const on = b.get();
      b.label = `${b.label.replace(/[ 开关]+$/, '')} ${on ? '开' : '关'}`;
      b.color = on ? '#f3e2bf' : '#cfc5b6';
    }
    this.renderButtons(ctx, dt);
    ctx.restore();
  }
}

export class CreditsPanel extends Modal {
  constructor(game) {
    super(game);
    this.btn({ x: W / 2, y: 852, w: 200, h: 52, label: '关闭', fontSize: 22, onClick: () => this.close() });
  }
  render(ctx, dt) {
    dimScreen(ctx, 0.6);
    drawPanel(ctx, 30, 110, W - 60, 790, 22);
    drawText(ctx, '制作人员', W / 2, 152, { size: 26, serif: true });
    drawText(ctx, `《${GameConfig.title}》 v${GameConfig.version}`, W / 2, 190, { size: 15, color: C.inkLight, weight: 'normal' });
    drawText(ctx, '出品：上海盖姆艾尔网络科技有限公司', W / 2, 216, { size: 15, color: C.ink, weight: 'normal' });
    drawText(ctx, '角色语音', W / 2, 262, { size: 18, color: C.copperDark });
    const chars = Object.values(CHARACTERS);
    chars.forEach((c, i) => {
      const y = 300 + i * 46;
      drawPortrait(ctx, this.game.assets.getImage(c.key), 82, y, 18);
      drawText(ctx, `${c.name}（${c.role}）`, 110, y, { size: 15, align: 'left', weight: 'normal' });
      drawText(ctx, c.credit, W - 60, y, { size: 15, align: 'right', color: '#5b3d26' });
    });
    let y = 300 + chars.length * 46 + 10;
    drawText(ctx, '语音合成软件 VOICEVOX（按各角色使用条款标注）', W / 2, y, { size: 13, color: C.inkLight, weight: 'normal' });
    y += 44;
    drawText(ctx, '其他', W / 2, y, { size: 18, color: C.copperDark });
    const lines = [
      `音乐：${Object.values(AudioConfig.bgm.tracks).map((t) => `《${t.title}》`).join('')}`,
      '全部原创，程序化作曲 (tools/compose_bgm.py)',
      '音效：WebAudio 实时合成',
      '角色立绘：沿用《美少女合成》原创素材',
      '插画背景：程序绘制 (tools/make_art.py)',
      '物理引擎 Matter.js（MIT）· 桌面版 Electron（MIT）',
    ];
    lines.forEach((l, i) => drawText(ctx, l, W / 2, y + 34 + i * 26, { size: 13, color: C.ink, weight: 'normal', maxWidth: W - 100 }));
    this.renderButtons(ctx, dt);
  }
}

export class ConfirmPanel extends Modal {
  constructor(game, { title, text, ok = '好', cancel = '取消', onOk, onCancel }) {
    super(game);
    Object.assign(this, { title, text });
    this.btn({ x: W / 2 - 90, y: 560, w: 150, h: 52, style: 'secondary', label: cancel, fontSize: 20, onClick: () => { this.close(); onCancel && onCancel(); } });
    this.btn({ x: W / 2 + 90, y: 560, w: 150, h: 52, style: 'primary', label: ok, fontSize: 20, onClick: () => { this.close(); onOk && onOk(); } });
  }
  render(ctx, dt) {
    dimScreen(ctx, 0.5);
    ctx.save();
    const s = this.pop;
    ctx.translate(W / 2, 480); ctx.scale(s, s); ctx.translate(-W / 2, -480);
    drawPanel(ctx, 60, 360, W - 120, 250, 22);
    drawText(ctx, this.title, W / 2, 404, { size: 24, serif: true });
    drawParagraph(ctx, this.text, W / 2, 452, W - 170, { size: 16, color: C.inkLight });
    this.renderButtons(ctx, dt);
    ctx.restore();
  }
}

/** 新机制提示卡 */
export class TipCard extends Modal {
  constructor(game, tip, onClose, drawIcon) {
    super(game);
    this.tip = tip;
    this.drawIcon = drawIcon;
    this.btn({ x: W / 2, y: 640, w: 200, h: 54, style: 'primary', label: '知道了', fontSize: 22, onClick: () => { this.close(); onClose && onClose(); } });
  }
  render(ctx, dt) {
    dimScreen(ctx, 0.45);
    ctx.save();
    const s = this.pop;
    ctx.translate(W / 2, 480); ctx.scale(s, s); ctx.translate(-W / 2, -480);
    drawPanel(ctx, 50, 300, W - 100, 380, 22);
    drawText(ctx, this.tip.title, W / 2, 342, { size: 24, serif: true, color: C.copperDark });
    ctx.save();
    roundRectPath(ctx, W / 2 - 110, 370, 220, 120, 14);
    ctx.fillStyle = '#5a4535'; ctx.fill();
    ctx.clip();
    if (this.drawIcon) this.drawIcon(ctx, W / 2, 430, this.t);
    ctx.restore();
    drawParagraph(ctx, this.tip.text, W / 2, 522, W - 150, { size: 16, color: C.ink });
    this.renderButtons(ctx, dt);
    ctx.restore();
  }
}

/** 广告占位：没有接入抖音广告时，显示 5 秒倒计时 */
export class AdOverlay {
  constructor(game) { this.game = game; this.closeBtn = new Button({ x: W - 50, y: 50, w: 56, h: 40, style: 'icon', icon: Icons.close, onClick: () => game.ads.cancel() }); this.closeBtn.events = game.events; }
  get active() { return !!this.game.ads.placeholder; }
  down(p) { this.closeBtn.handleDown(p); return true; }
  move(p) { this.closeBtn.handleMove(p); }
  up(p) { this.closeBtn.handleUp(p); return true; }
  render(ctx, dt) {
    const p = this.game.ads.placeholder;
    if (!p) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#17110d';
    ctx.fillRect(0, 0, W, GameConfig.height);
    const k = 1 - p.left / p.total;
    drawText(ctx, '广告', W / 2, 360, { size: 18, color: 'rgba(255,255,255,0.5)', weight: 'normal' });
    drawText(ctx, '这里是激励视频的位置', W / 2, 420, { size: 22, color: '#fff' });
    drawText(ctx, '（接入抖音广告位后会播放真实广告）', W / 2, 452, { size: 14, color: 'rgba(255,255,255,0.6)', weight: 'normal' });
    ctx.beginPath(); ctx.arc(W / 2, 560, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    ctx.strokeStyle = C.copper; ctx.lineWidth = 6; ctx.stroke();
    drawText(ctx, String(Math.max(1, Math.ceil(p.left))), W / 2, 561, { size: 34, color: '#fff' });
    drawText(ctx, '看完就发奖励', W / 2, 640, { size: 15, color: 'rgba(255,255,255,0.7)', weight: 'normal' });
    this.closeBtn.render(ctx, dt);
    drawText(ctx, '中途关掉没有奖励', W - 50, 86, { size: 10, color: 'rgba(255,255,255,0.5)', weight: 'normal', align: 'right' });
    ctx.restore();
  }
}
