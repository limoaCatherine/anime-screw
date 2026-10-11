// 字幕系统：角色说话时在屏幕最下方 (道具栏上) 显示 头像 + 台词气泡 —— 永远不挡画框里的螺丝。
// 语音台词：日文一行 + 中文小字；纯文字台词 (关卡开场的闲聊)：只有中文。
import { GameConfig } from '../config/GameConfig.js';
import { VoiceConfig } from '../config/VoiceConfig.js';
import { roundRectPath, drawText, drawPortrait, wrapLines, hexA } from '../ui/draw.js';

export class SubtitleSystem {
  constructor(game) {
    this.game = game;
    this.current = null;
    this.queue = [];         // 语音字幕放完之后再显示的文字 (开场闲聊)
    this.y = GameConfig.layout.subtitleY;
    this.off = game.events.on('voice:line', (e) => {
      // 语音台词：如果同一角色刚好在显示开场闲聊，合并显示 (闲聊 + 语音)
      // 字幕跟着语音走：显示时长 = 语音长度 + 0.7 秒 (拿不到长度就用默认值)
      const time = e.duration ? Math.max(1.8, e.duration + 0.7) : VoiceConfig.subtitleTime;
      this.show({ char: e.char, jp: e.line.text, zh: e.line.zh, time });
    });
  }

  /** 纯文字台词 */
  say(char, text, time = 3.6) {
    this.show({ char, jp: null, zh: text, time });
  }

  show({ char, jp, zh, time }) {
    this.current = { char, jp, zh, life: 0, max: time };
  }

  /** 排队：等当前这条 (通常是语音字幕) 显示完再显示 */
  sayAfter(char, text, time = 3.6) {
    if (!this.current) { this.say(char, text, time); return; }
    this.queue.push({ char, jp: null, zh: text, time });
  }

  clear() { this.current = null; this.queue = []; }

  update(dt) {
    if (this.current) {
      this.current.life += dt;
      if (this.current.life >= this.current.max) this.current = null;
    }
    if (!this.current && this.queue.length) this.show(this.queue.shift());
  }

  render(ctx) {
    const s = this.current;
    if (!s) return;
    const W = GameConfig.width;
    const appear = Math.min(1, s.life / 0.2);
    const k = s.life / s.max;
    const alpha = k > 0.85 ? (1 - k) / 0.15 : 1;
    const bx = 74; const bw = W - bx - 22;
    const lines = wrapLines(ctx, s.zh, bw - 28, s.jp ? 13 : 16, 'normal');
    const h = (s.jp ? 30 : 16) + lines.length * (s.jp ? 19 : 23) + 10;
    const y = this.y - 6 * (1 - appear);
    this.lastRect = { x: bx, y: y - 22, w: bw, h };   // 给测试用：气泡实际占的矩形
    ctx.save();
    ctx.globalAlpha = alpha * appear;
    // 气泡
    ctx.save();
    ctx.shadowColor = 'rgba(20,10,4,0.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    roundRectPath(ctx, bx, y - 22, bw, h, 14);
    ctx.fillStyle = 'rgba(251,244,230,0.96)'; ctx.fill();
    ctx.restore();
    roundRectPath(ctx, bx, y - 22, bw, h, 14);
    ctx.strokeStyle = hexA(s.char.color, 0.8); ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, y - 4); ctx.lineTo(bx - 10, y + 2); ctx.lineTo(bx, y + 8); ctx.closePath();
    ctx.fillStyle = 'rgba(251,244,230,0.96)'; ctx.fill();
    // 头像
    ctx.beginPath(); ctx.arc(40, y + 2, 29, 0, Math.PI * 2);
    ctx.fillStyle = s.char.color; ctx.fill();
    drawPortrait(ctx, this.game.assets.getImage(s.char.key), 40, y + 2, 27);
    drawText(ctx, s.char.name, 40, y + 38, { size: 12, color: '#fff', stroke: 'rgba(40,24,14,0.8)', strokeWidth: 3 });
    let ty = y - 4;
    if (s.jp) {
      drawText(ctx, s.jp, bx + 14, ty, { size: 16, color: GameConfig.colors.ink, align: 'left', maxWidth: bw - 28 });
      ty += 24;
      lines.forEach((l, i) => drawText(ctx, l, bx + 14, ty + i * 19, { size: 13, color: GameConfig.colors.inkLight, align: 'left', weight: 'normal' }));
    } else {
      lines.forEach((l, i) => drawText(ctx, l, bx + 14, ty + 2 + i * 23, { size: 16, color: GameConfig.colors.ink, align: 'left', weight: 'normal' }));
    }
    ctx.restore();
  }

  destroy() { this.off(); }
}
