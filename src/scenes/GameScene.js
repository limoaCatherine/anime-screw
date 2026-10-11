// 关卡场景：画框里的板子与螺丝、收纳区、道具栏、开场/提示/通关/失败流程。
// 规则全部在 PuzzleSystem (与关卡校验器同一份代码)；这里只负责输入、表现与流程。
import { Scene } from '../core/Scene.js';
import { GameConfig } from '../config/GameConfig.js';
import { LEVELS, CHAPTERS, TIPS } from '../config/LevelConfig.js';
import { CHARACTERS } from '../config/VoiceConfig.js';
import { PuzzleSystem } from '../systems/PuzzleSystem.js';
import { EffectSystem } from '../systems/EffectSystem.js';
import { SubtitleSystem } from '../systems/SubtitleSystem.js';
import { pointInPoly } from '../systems/geom.js';
import { shareChapter } from '../systems/ShareService.js';
import { renderBoard, drawBoard, MATERIALS } from '../render/BoardArt.js';
import { drawScrew, drawChain, drawRope } from '../render/ScrewArt.js';
import { TrayView } from '../render/TrayView.js';
import { drawCG, drawFrame, fragmentRect } from '../render/CGView.js';
import { Button } from '../ui/Button.js';
import { Icons } from '../ui/Icons.js';
import { Modal, SettingsPanel, TipCard } from '../ui/Panels.js';
import { drawText, drawWall, drawPanel, dimScreen, roundRectPath, ease, hexA, drawParagraph } from '../ui/draw.js';

const W = GameConfig.width; const H = GameConfig.height;
const F = GameConfig.layout.frame;
const FW = F.right - F.left; const FH = F.bottom - F.top;
const CHAIN_COLORS = ['#e2b23c', '#c9cfd6', '#d98a4a'];
const ITEM_ICONS = { undo: Icons.undo, addHole: Icons.addHole, screwdriver: Icons.screwdriver, hammer: Icons.hammer, shuffle: Icons.shuffle };

export class GameScene extends Scene {
  constructor(game) { super(game, 'game'); }

  // ================================================================ 生命周期
  enter({ level = 0 } = {}) {
    const g = this.game;
    this.index = level;
    this.L = LEVELS[level];
    this.chIdx = Math.floor(level / 10);
    this.chapter = CHAPTERS[this.chIdx];
    this.char = CHARACTERS[this.chapter.char];
    g.bgm.play(this.chapter.bgm);
    g.voice.resetLevel();
    g.modals = [];

    this.puzzle = new PuzzleSystem(g.events, this.L, { rng: Math.random, jitter: 0.012 });
    this.arts = new Map();
    for (const b of this.puzzle.boards.boards) this.arts.set(b.id, renderBoard(b));
    this.tray = new TrayView(g, g.events);
    this.tray.reset(this.puzzle);
    this.tray.thirdOffer = this.L.thirdBox && this.puzzle.box.slots.length < 3;
    this.fx = new EffectSystem();
    if (this.subs) this.subs.destroy();
    this.subs = new SubtitleSystem(g);
    this.state = 'intro';
    this.mode = null;               // 'screwdriver' | 'hammer'
    this.freeDriver = false;
    this.usage = { undo: 0, addHole: 0, screwdriver: 0, hammer: 0, shuffle: 0 };
    this.revives = 0;
    this.shakes = new Map();
    this.flashes = new Map();
    this.idle = 0;
    this.failWait = 0;
    this.unstableT = 0;
    this.lastTap = null;            // 连点去抖
    this.reviving = false;
    this.shards = [];               // 小锤敲碎 / 板子碎裂的碎片动画
    this.swings = [];               // 小锤挥动动画
    this.winT = 0;
    this.reveal = null;
    this.warned = {};
    this.time = 0;
    this.rot = new Map(this.puzzle.screws.map((s) => [s.id, (s.id * 1.7) % Math.PI]));
    this.lockOf = new Map();
    (this.puzzle.obstacles.chains || []).forEach((c, k) => this.lockOf.set(c.lock, CHAIN_COLORS[k % CHAIN_COLORS.length]));

    this.makeButtons();
    this.bindEvents();
    g.events.emit('puzzle:start', { level });

    // 开场：关名 → 角色一句话 (+语音) → 新机制提示卡
    this.timeline = [
      { at: 0.9, fn: () => this.intro() },
      { at: 1.7, fn: () => this.showTip() },
    ];
  }

  exit() {
    if (this.mode && this.modePaid === 'ad') this.game.save.addItem(this.mode, 1);   // 看广告拿的道具没用掉，退出时存起来
    this.mode = null;
    if (this.puzzle) this.puzzle.destroy();
    this.puzzle = null;
    this.game.modals = [];
    if (this.subs) { this.subs.destroy(); this.subs = null; }
    this.game.voice.stop();
  }

  makeButtons() {
    const g = this.game;
    const mk = (o) => { const b = new Button(o); b.events = g.events; return b; };
    this.menuBtn = mk({ x: 34, y: 30, w: 46, h: 42, style: 'icon', icon: Icons.gear, onClick: () => this.openSettings() });
    this.items = GameConfig.itemOrder.map((key, k) => {
      const def = GameConfig.items[key];
      const b = mk({ x: 58 + k * 106, y: GameConfig.layout.itemY, w: 96, h: 92, style: 'item', label: def.name, icon: ITEM_ICONS[key], onClick: () => this.useItem(key) });
      b.key = key;
      b.onDisabled = () => this.itemDisabledHint(key);
      return b;
    });
    this.buttons = [this.menuBtn, ...this.items];
  }

  bindEvents() {
    const on = (n, f) => this.listen(n, f);
    const tray = this.tray;
    on('screw:out', (e) => this.onScrewOut(e));
    on('piece:box', (e) => tray.onPieceBox(e));
    on('piece:hole', (e) => { tray.onPieceHole(e); this.onHole(); });
    on('box:full', (e) => tray.onBoxFull(e));
    on('box:arrive', (e) => tray.onBoxArrive(e));
    on('boxes:shuffle', (e) => tray.onShuffle(e));
    on('holes:clear', (e) => tray.onHolesClear(e));
    on('tap:refused', (e) => this.onRefused(e));
    on('board:fall', (e) => this.onBoardFall(e.board));
    on('board:impact', () => this.fx.shake(2.2));
    on('board:break', (e) => this.onBoardBreak(e.board));
    on('chain:break', (e) => this.onChainBreak(e.chain));
    on('frost:crack', (e) => this.onFrost(e));
    on('lock:open', (e) => this.onUnlock(e.board));
    on('bomb:tick', (e) => this.onBombTick(e));
    on('rope:cut', (e) => { const r = e.board.rope; this.fx.burst(r.ax, r.ay, { n: 8, colors: ['#c9a777', '#8c6a43'], speed: 120, size: 2.5, kind: 'chip' }); });
    on('combo', (e) => this.onCombo(e.n));
    on('puzzle:fail', (e) => this.onFail(e));
    on('puzzle:win', () => this.onWin());
    on('puzzle:undo', () => { this.tray.snap(); this.fx.clear(); });
    on('puzzle:revive', () => { this.failWait = 0; });
  }

  // ================================================================ 开场
  intro() {
    const g = this.game;
    const who = CHARACTERS[this.L.who];
    // 有开场语音：先放语音 (日文 + 对应的中文字幕，和声音同步)，放完再显示这关的闲聊；没有就直接显示闲聊
    if (this.L.voice && g.voice.say(this.L.voice)) this.subs.sayAfter(who, this.L.say, 4.0);
    else this.subs.say(who, this.L.say, 4.2);
  }

  showTip() {
    const g = this.game;
    const key = this.L.tip;
    const begin = () => { if (this.state === 'intro') this.state = 'play'; };
    if (!key || g.save.data.tipsSeen[key]) { begin(); return; }
    g.save.data.tipsSeen[key] = true;
    if (GameConfig.items[key]) g.save.data.items[key] = (g.save.data.items[key] || 0) + 1;   // 新道具送一个
    g.save.flush();
    const tip = { ...TIPS[key] };
    if (GameConfig.items[key]) tip.text += '\n先送你一个。';
    g.pushModal(new TipCard(g, tip, begin, (ctx, x, y, t) => drawTipIcon(ctx, tip.icon, x, y, t)));
  }

  // ================================================================ 输入
  onPointerDown(p) {
    if (super.onPointerDown(p)) return true;
    if (this.state === 'intro') { this.state = 'play'; }
    if (this.state !== 'play' || this.puzzle.status !== 'play') return false;
    this.idle = 0;
    // 第三个盒位 (看广告)
    if (this.tray.thirdOffer) {
      const r = this.tray.slotRect(2);
      if (Math.abs(p.x - r.x) < r.w / 2 && Math.abs(p.y - r.y) < r.h / 2) { this.offerThirdBox(); return true; }
    }
    if (p.y < F.top - 10 || p.y > F.bottom + 40) return false;
    if (this.mode === 'hammer') {
      const b = this.pickBoard(p);
      if (b) this.doHammer(b, p);
      else this.game.toast('点一块板子');
      return true;
    }
    // 连点去抖：刚拧掉一颗，0.2 秒内在同一个位置再点 (手抖双击) 不算数，免得误拧到下面刚露出来的螺丝
    const lt = this.lastTap;
    if (lt && this.time - lt.t < 0.2 && Math.hypot(p.x - lt.x, p.y - lt.y) < GameConfig.screw.hitRadius * 1.2) return true;
    if (this.mode === 'screwdriver') {
      const s = this.pickScrew(p, { any: true });
      if (s) this.doDriver(s);
      return !!s;
    }
    const s = this.pickScrew(p);
    if (!s) {
      // 手指下只有被压住的螺丝：不拧，给个"咔"和压着它的板子闪一下
      const hidden = this.pickScrew(p, { any: true });
      if (hidden) this.puzzle.tap(hidden.id);      // 规则层会拒绝并发 tap:refused (covered / frozen / ...)
      return !!hidden;
    }
    const r = this.puzzle.tap(s.id);
    if (r.ok) this.lastTap = { x: p.x, y: p.y, t: this.time };
    return true;
  }

  /**
   * 找手指下的螺丝。默认只找"没被压住"的 (永远不会选中被上层板挡着的螺丝)；
   * any=true (螺丝刀 / 拒绝反馈) 时被压住的也算，取最上层、最近的一颗。
   */
  pickScrew(p, { any = false } = {}) {
    const R = GameConfig.screw.hitRadius;
    let best = null; let bestKey = -Infinity;
    for (const s of this.puzzle.screws) {
      if (s.state !== 'on') continue;
      const pos = this.puzzle.posOf(s);
      const d = Math.hypot(pos.x - p.x, pos.y - p.y);
      if (d > R) continue;
      const covered = !!this.puzzle.boards.coveredBy(s);
      if (covered && !any) continue;
      const layer = this.puzzle.boards.layerOf(s);
      const key = (covered ? 0 : 1000) - d + layer * 0.5;   // 没被压住的优先，其次离手指最近
      if (key > bestKey) { bestKey = key; best = s; }
    }
    return best;
  }

  pickBoard(p) {
    let best = null;
    for (const b of this.puzzle.boards.boards) {
      if (!this.puzzle.boards.isSolid(b)) continue;
      if (pointInPoly(p.x, p.y, b.body.vertices) && (!best || b.layer > best.layer)) best = b;
    }
    return best;
  }

  // ================================================================ 规则事件 → 表现
  onScrewOut(e) {
    this.tray.onScrewOut(e);
    const { x, y } = e.pos;
    if (!e.dumped) {
      const col = GameConfig.screwColors[e.piece.color];
      this.fx.burst(x, y, { n: 9, colors: ['#fff6d8', '#ffd27a', col.light], speed: 190, size: 3, life: 0.4, kind: 'spark', gravity: 300 });
      this.fx.ring(x, y, { color: 'rgba(255,248,230,0.9)', r0: 10, r1: 30, life: 0.28 });
    }
    if (e.piece.hidden) this.fx.text(x, y - 20, GameConfig.screwColors[e.piece.color].name, { size: 15, color: GameConfig.screwColors[e.piece.color].light });
  }

  onHole() {
    const free = this.puzzle.box.freeHoles;
    if (free === 1 && !this.warned.holes) {
      this.warned.holes = true;
      this.game.voice.say('riri_holes');
    }
  }

  onRefused(e) {
    const s = e.screw;
    this.idle = 0;
    if (s) this.shakes.set(s.id, this.time);
    if (e.reason === 'covered' && s) {
      const b = this.puzzle.boards.coveredBy(s);
      if (b) this.flashes.set(b.id, this.time);
    } else if (e.reason === 'full') {
      this.tray.holeFlash = 0.01;
      this.game.toast('孔满了，先腾个地方');
    } else if (e.reason === 'locked' && s) {
      this.flashes.set(s.board, this.time);
      this.game.toast('这块板锁着，先把钥匙钉收进盒子');
    } else if (e.reason === 'frozen') {
      this.fx.burst(this.puzzle.posOf(s).x, this.puzzle.posOf(s).y, { n: 4, colors: ['#e8f8ff'], speed: 60, size: 2, kind: 'chip' });
    } else if (e.reason === 'hammerFull') {
      this.game.toast('孔不够放这块板上的螺丝');
    } else if (e.reason === 'ropeFull') {
      this.tray.holeFlash = 0.01;
      this.game.toast('这块吊着的板上螺丝太多，孔放不下');
    } else if (e.reason === 'chained' && s) {
      this.game.toast('先拧掉挂锁那颗');
    }
  }

  onBoardFall(b) {
    const p = b.body.position;
    const m = MATERIALS[b.mat];
    const colors = m.kind === 'wood' ? ['#c9955c', '#8a5a33'] : m.kind === 'metal' ? ['#e6e9ec', '#b0b6bd'] : ['#ffffff', '#d8f2ff'];
    this.fx.burst(p.x, p.y, { n: 6, colors, speed: 80, size: 2.5, life: 0.5, kind: 'chip', gravity: 600 });
  }

  onBoardBreak(b) {
    const art = this.arts.get(b.id);
    const p = b.body.position;
    // 碎片：按板子轮廓切成三角片，各自带着板子的贴图飞散、旋转、淡出
    const vs = b.body.vertices.map((v) => ({ x: v.x, y: v.y }));
    const tris = [];
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i]; const c = vs[(i + 1) % vs.length];
      const m = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
      tris.push([{ x: p.x, y: p.y }, a, m], [{ x: p.x, y: p.y }, m, c]);
    }
    for (const t of tris) {
      const cx = (t[0].x + t[1].x + t[2].x) / 3; const cy = (t[0].y + t[1].y + t[2].y) / 3;
      const dx = cx - p.x; const dy = cy - p.y; const d = Math.hypot(dx, dy) || 1;
      const sp = 140 + Math.random() * 180;
      this.shards.push({ b, art, tri: t, cx, cy, x: 0, y: 0, vx: (dx / d) * sp, vy: (dy / d) * sp - 160, rot: 0, vr: (Math.random() - 0.5) * 9, life: 0, max: 0.75 + Math.random() * 0.25 });
    }
    const m = MATERIALS[b.mat];
    const colors = m.kind === 'wood' ? ['#d6a467', '#a8743f', '#f0cb92'] : m.kind === 'metal' ? ['#cfd5dc', '#8d959f'] : ['rgba(220,245,255,0.9)', '#ffffff'];
    this.fx.burst(p.x, p.y, { n: 40, colors, speed: 360, size: 6, life: 1.0, kind: 'chip', gravity: 900, drag: 0.6 });
    this.fx.shake(6);
    this.fx.flash('#fff8e8', 0.25);
    void art;
  }

  onChainBreak(c) {
    const a = this.puzzle.posOf(this.puzzle.screw(c.a)); const b = this.puzzle.posOf(this.puzzle.screw(c.b));
    for (let k = 0; k <= 4; k++) {
      const x = a.x + (b.x - a.x) * (k / 4); const y = a.y + (b.y - a.y) * (k / 4);
      this.fx.burst(x, y, { n: 3, colors: ['#c9cfd6', '#7b8087'], speed: 150, size: 4, kind: 'chip', gravity: 700 });
    }
    this.fx.text((a.x + b.x) / 2, (a.y + b.y) / 2, '链子开了', { size: 16, color: '#ffe7b0' });
  }

  onFrost(e) {
    const p = this.puzzle.posOf(e.screw);
    this.fx.burst(p.x, p.y, { n: e.left <= 0 ? 14 : 6, colors: ['#ffffff', '#cdeeff', '#9fd2f0'], speed: e.left <= 0 ? 200 : 110, size: 3, kind: 'chip', gravity: 500 });
  }

  onUnlock(b) {
    const p = b.body.position;
    this.fx.burst(p.x, p.y, { n: 18, colors: ['#ffe08a', '#fff6d8'], speed: 200, size: 3, kind: 'star', gravity: 120 });
    this.fx.text(p.x, p.y, '锁开了', { size: 18, color: '#ffe08a' });
  }

  onBombTick(e) {
    if (e.left === 3 && !this.warned.bomb) {
      this.warned.bomb = true;
      this.game.voice.say(`${this.chapter.char}_bomb`);
    }
    const p = this.puzzle.posOf(e.screw);
    if (e.left <= 3) this.fx.ring(p.x, p.y, { color: 'rgba(255,70,50,0.8)', r0: 16, r1: 34, life: 0.4 });
  }

  onCombo(n) {
    if (n >= 3) {
      const pos = this.tray.slotRect(0);
      this.fx.text(W / 2, pos.y + 56, n >= 8 ? `连收 ×${n}！` : `连收 ×${n}`, { size: 16 + Math.min(10, n), color: n >= 5 ? '#ffd27a' : '#fff4e0', life: 0.8, rise: 24 });
    }
    if (n === 5) this.game.voice.say(`${this.chapter.char}_combo`);
  }

  // ================================================================ 道具
  itemState(key) {
    const def = GameConfig.items[key];
    if (this.index + 1 < def.unlock) return { locked: `第${def.unlock}关` };
    const used = this.usage[key];
    const have = this.game.save.item(key);
    let can = used < def.perLevel && ((this.state === 'play' && this.puzzle.status === 'play') || (key === 'undo' && this.puzzle.status === 'fail'));
    if (key === 'undo' && !this.puzzle.history.length) can = false;
    if (key === 'addHole' && this.puzzle.box.holes.length >= 8) can = false;
    if (key === 'shuffle' && !this.puzzle.box.slots.some((b) => b && b.pieces.length === 0)) can = false;
    return { can, have, used, def };
  }

  itemDisabledHint(key) {
    const st = this.itemState(key);
    if (st.locked) { this.game.toast(`${GameConfig.items[key].name}${st.locked}解锁`); return; }
    if (st.used >= st.def.perLevel) { this.game.toast(`这关的${st.def.name}用完了`); return; }
    if (key === 'undo') this.game.toast('还没拧呢，退不了');
    if (key === 'shuffle') this.game.toast('盒子里已经有螺丝了，换不了');
  }

  useItem(key) {
    const g = this.game;
    const st = this.itemState(key);
    if (!st.can) { this.itemDisabledHint(key); return; }
    if ((key === 'screwdriver' || key === 'hammer') && this.mode === key) {   // 再点一次取消
      if (this.modePaid === 'ad') g.save.addItem(key, 1);    // 看广告拿的还没用，存起来，不浪费
      this.mode = null; this.modePaid = null;
      return;
    }
    const run = () => {
      if (key === 'undo') {
        if (this.puzzle.undo()) { this.usage.undo++; g.events.emit('item:use', { key }); this.closeFail(); }
      } else if (key === 'addHole') {
        this.puzzle.addHole(); this.usage.addHole++;
      } else if (key === 'shuffle') {
        if (this.puzzle.shuffle()) this.usage.shuffle++;
        else { g.toast('现在没什么可换的'); return false; }
      } else {
        this.mode = key;
        return 'mode';
      }
      return true;
    };
    if (st.have > 0) {
      const r = run();
      if (r === true) g.save.addItem(key, -1);
      if (r === 'mode') this.modePaid = 'stock';
      return;
    }
    // 没有库存：看个广告拿一次
    g.pushModal(new AdAskPanel(g, {
      title: `${st.def.name}用完了`,
      text: '看个广告，拿一次？',
      ok: '看个广告',
      onOk: () => g.ads.showRewardedAd(`item:${key}`).then((ok) => {
        if (!ok) { g.toast('没看完，就不给了'); return; }
        const r = run();
        if (r === 'mode') this.modePaid = 'ad';
      }),
    }));
  }

  doDriver(s) {
    const r = this.puzzle.tap(s.id, { force: true });
    if (!r.ok) return;
    if (this.freeDriver) this.freeDriver = false;
    else {
      this.usage.screwdriver++;
      if (this.modePaid === 'stock') this.game.save.addItem('screwdriver', -1);
    }
    this.mode = null;
    this.game.events.emit('item:use', { key: 'screwdriver' });
  }

  doHammer(b, p) {
    const at = p || b.body.position;
    this.swings.push({ x: at.x, y: at.y, t: 0 });
    const r = this.puzzle.hammer(b.id);
    if (!r.ok) return;
    this.usage.hammer++;
    if (this.modePaid === 'stock') this.game.save.addItem('hammer', -1);
    this.mode = null;
  }

  offerThirdBox() {
    const g = this.game;
    g.pushModal(new AdAskPanel(g, {
      title: '多一个盒子', text: '看个广告，这关多开一个收纳盒。', ok: '看个广告',
      onOk: () => g.ads.showRewardedAd('thirdBox').then((ok) => {
        if (!ok) return;
        this.tray.thirdOffer = false;
        this.puzzle.addSlot();
      }),
    }));
  }

  openSettings() {
    const g = this.game;
    g.pushModal(new SettingsPanel(g, {
      inGame: true,
      onRestart: () => g.scenes.change('game', { level: this.index }),
      onHome: () => g.scenes.change('select', { focus: this.index }),
    }));
  }

  // ================================================================ 输赢
  onFail(e) {
    this.state = 'failed';
    this.failT = 0;
    this.mode = null;
    if (e.reason === 'bomb') {
      const p = this.puzzle.posOf(e.screw);
      this.fx.burst(p.x, p.y, { n: 40, colors: ['#ffcf5a', '#ff7a3a', '#5a4a40'], speed: 380, size: 5, life: 0.9, kind: 'chip', gravity: 400 });
      this.fx.flash('#ffd9a0', 0.6);
      this.fx.shake(12);
    }
    const who = this.chapter.char;
    setTimeout(() => { if (this.state === 'failed') this.game.voice.say(e.reason === 'stuck' ? 'riri_fail' : `${who}_fail`); }, 300);
  }

  showFailPanel() {
    const g = this.game;
    this.failPanel = g.pushModal(new FailPanel(g, this));
  }

  closeFail() {
    if (this.failPanel) { this.failPanel.close(); this.failPanel = null; }
    if (this.state === 'failed') this.state = 'play';
  }

  revive() {
    const g = this.game;
    if (this.reviving || this.puzzle.status !== 'fail' || this.revives >= GameConfig.revivesPerLevel) return;   // 连点两下只算一次
    this.reviving = true;
    g.ads.showRewardedAd('revive').then((ok) => {
      this.reviving = false;
      if (!ok) { g.toast('没看完，就不算了'); return; }
      if (!this.puzzle || this.puzzle.status !== 'fail') return;
      const reason = this.puzzle.failReason;
      this.revives++;
      this.puzzle.revive({ bombSteps: GameConfig.bombReviveSteps, clearHoles: GameConfig.reviveClearHoles });
      this.closeFail();
      if (reason === 'stuck') { this.mode = 'screwdriver'; this.freeDriver = true; g.toast('送你一次螺丝刀，点哪颗拧哪颗'); }
      g.voice.say('riri_revive');
    });
  }

  onWin() {
    this.state = 'won';
    this.winT = 0;
    this.mode = null;
    const res = this.game.save.completeLevel(this.index, LEVELS.length);
    this.result = res;
    this.chapterDone = res.chapterComplete && !this.game.save.data.cgSeen[this.chapter.id];
  }

  startReveal() {
    const g = this.game;
    this.reveal = { t: 0 };
    g.events.emit('fx:reveal');
    g.events.emit('fx:winJingle');
    const r = fragmentRect(this.L.fragment, F.left, F.top, FW, FH);
    this.fx.burst(r.x + r.w / 2, r.y + r.h / 2, { n: 30, colors: ['#fff6d8', '#ffd27a', '#ffffff'], speed: 260, size: 4, life: 1.2, kind: 'star', gravity: 60, drag: 2 });
    if (this.chapterDone) {
      g.save.data.cgSeen[this.chapter.id] = true;
      g.save.flush();
      setTimeout(() => g.bgm.playSting(), 900);
      g.voice.say(`${this.chapter.char}_cg`);
    } else {
      g.voice.say(`${this.chapter.char}_win`);
    }
  }

  showWinPanel() {
    this.game.pushModal(new WinPanel(this.game, this));
  }

  nextLevel() {
    const n = this.index + 1;
    if (n >= LEVELS.length) this.game.scenes.change('gallery', { chapter: this.chIdx, from: 'menu' });
    else this.game.scenes.change('game', { level: n });
  }

  // ================================================================ 每帧
  update(dt) {
    super.update(dt);
    const g = this.game;
    if (!this.puzzle) return;
    for (const ev of this.timeline) if (!ev.done && this.time >= ev.at) { ev.done = true; ev.fn(); }
    // 有弹窗 (提示卡 / 设置 / 广告询问 / 失败面板) 或在放广告时，物理和判定全部停下；过关后让板子继续掉完
    const paused = (g.modals.length > 0 && this.state !== 'won') || !!g.ads.placeholder || g.ads.busy;
    if (!paused) this.puzzle.update(dt);
    this.updateShards(dt);
    this.tray.update(dt, this.fx);
    this.fx.update(dt);
    this.subs.update(dt);
    if (this.state === 'play' && !paused) {
      this.idle += dt;
      // 判负只在：没有螺丝在飞、没有盒子在换、板子都停稳且没有板子还在掉 的时候做；
      // 板子要是一直微微晃 (超过 stableTimeout 秒)，也照样判，不会永远不判
      const quiet = this.puzzle.quiet();
      this.unstableT = quiet ? 0 : this.unstableT + dt;
      const settled = quiet || (this.unstableT > GameConfig.physics.stableTimeout && this.puzzle.stable());
      if (this.puzzle.status === 'play' && !this.tray.busy && settled) {
        const reason = this.puzzle.checkFail();
        if (reason && !this.mode) {
          this.failWait += dt;
          if (this.failWait > 0.45) this.puzzle.fail(reason);
        } else this.failWait = 0;
      } else this.failWait = 0;
    }
    if (this.state === 'failed') {
      this.failT += dt;
      if (this.failT > 0.9 && !this.failPanel && this.puzzle.status === 'fail') this.showFailPanel();
      if (this.puzzle.status === 'play') this.closeFail();
    }
    if (this.state === 'won') {
      this.winT += dt;
      const gone = this.puzzle.boards.boards.every((b) => b.gone || b.broken);
      if (!this.reveal && !this.tray.busy && (gone || this.winT > 1.6) && this.winT > 0.5) this.startReveal();
      if (this.reveal) {
        this.reveal.t += dt;
        if (this.reveal.t > (this.chapterDone ? 3.2 : 1.7) && !this.reveal.panel) { this.reveal.panel = true; this.showWinPanel(); }
      }
    }
  }

  updateShards(dt) {
    for (const sh of this.shards) {
      sh.life += dt;
      sh.vy += 900 * dt;
      sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      sh.rot += sh.vr * dt;
    }
    this.shards = this.shards.filter((sh) => sh.life < sh.max);
    for (const w of this.swings) w.t += dt;
    this.swings = this.swings.filter((w) => w.t < 0.35);
  }

  renderShards(ctx) {
    const g = this.game;
    for (const sh of this.shards) {
      const k = sh.life / sh.max;
      ctx.save();
      ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      ctx.translate(sh.cx + sh.x, sh.cy + sh.y);
      ctx.rotate(sh.rot);
      ctx.translate(-sh.cx, -sh.cy);
      ctx.beginPath();
      ctx.moveTo(sh.tri[0].x, sh.tri[0].y); ctx.lineTo(sh.tri[1].x, sh.tri[1].y); ctx.lineTo(sh.tri[2].x, sh.tri[2].y); ctx.closePath();
      ctx.save(); ctx.clip();
      drawBoard(ctx, sh.b, sh.art, g.pixelScale, { flash: Math.max(0, 1 - k * 4) });
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }
    for (const w of this.swings) {
      const k = Math.min(1, w.t / 0.12);
      ctx.save();
      ctx.globalAlpha = w.t < 0.25 ? 1 : 1 - (w.t - 0.25) / 0.1;
      ctx.translate(w.x + 26, w.y - 26);
      ctx.rotate(-1.1 + k * 1.3);
      ctx.translate(0, -18);
      Icons.hammer(ctx, 46, '#5a3a26');
      ctx.restore();
    }
  }

  hintScrew() {
    if (this.state !== 'play' || this.puzzle.status !== 'play' || this.tray.busy) return null;
    const show = this.index <= 1 ? this.idle > 0.6 : this.idle > 12;
    if (!show) return null;
    for (const id of this.L.solution) {
      const s = this.puzzle.screw(id);
      if (s.state !== 'on') continue;
      if (this.puzzle.blockReason(s)) continue;
      return s;
    }
    return this.puzzle.tappable()[0] || null;
  }

  // ================================================================ 绘制
  render(ctx) {
    const g = this.game;
    if (!this.puzzle) return;
    const t = this.time;
    drawWall(ctx, this.chapter.theme.wall);
    const off = this.fx.offset;
    ctx.save();
    ctx.translate(off.x, off.y);

    // 顶栏
    drawText(ctx, this.L.name, W / 2 + 14, 30, { size: 18, color: '#fbf0dc', maxWidth: 400, serif: true });
    // 收纳区
    this.tray.render(ctx, t);
    // 画框 + 底下的画
    drawFrame(ctx, F.left, F.top, FW, FH, this.chapter.theme.frame, 12);
    const rv = this.reveal ? { index: this.L.fragment, k: ease.cubicInOut(Math.min(1, this.reveal.t / 1.1)) } : null;
    const owned = (i) => (this.chapterDone && this.reveal && this.reveal.t > 1.3) || (g.save.hasFragment(this.chIdx * 10 + i) && !(rv && i === this.L.fragment));
    drawCG(ctx, g, F.left, F.top, FW, FH, { chapter: this.chIdx, owned, reveal: rv, highlight: this.reveal ? null : this.L.fragment, time: t, dark: 0.68 });
    if (this.chapterDone && this.reveal) {
      const k = Math.min(1, Math.max(0, (this.reveal.t - 1.2) / 0.6));
      ctx.save(); ctx.globalAlpha = (1 - Math.abs(k * 2 - 1)) * 0.7; ctx.fillStyle = '#fff6e0'; ctx.fillRect(F.left, F.top, FW, FH); ctx.restore();
    }

    // 板子与螺丝 (按层)
    const pz = this.puzzle;
    const boards = pz.boards.boards.filter((b) => !b.gone && !b.broken);
    const layers = [...new Set([...boards.map((b) => b.layer), ...pz.screws.filter((s) => s.board < 0).map((s) => s.layer ?? -1)])].sort((a, b) => a - b);
    const hint = this.hintScrew();
    for (const layer of layers) {
      for (const b of boards) {
        if (b.layer !== layer) continue;
        const fl = this.flashes.get(b.id);
        const flash = fl != null && t - fl < 0.5 ? 1 - (t - fl) / 0.5 : 0;
        drawBoard(ctx, b, this.arts.get(b.id), g.pixelScale, { flash });
        if (b.locked) this.drawLockBadge(ctx, b);
      }
      for (const b of boards) {
        if (b.layer !== layer || !b.rope || b.rope.cut) continue;
        const r = b.rope;
        const lx = r.bx - b.c0.x; const ly = r.by - b.c0.y;
        const a = b.body.angle;
        drawRope(ctx, r.ax, r.ay, b.body.position.x + lx * Math.cos(a) - ly * Math.sin(a), b.body.position.y + lx * Math.sin(a) + ly * Math.cos(a));
      }
      for (const s of pz.screws) {
        if (s.state !== 'on') continue;
        if (pz.boards.layerOf(s) !== layer) continue;
        this.drawScrewAt(ctx, s, t, hint);
      }
      for (const c of pz.obstacles.chains) {
        if (c.broken) continue;
        const sa = pz.screw(c.a); const sb = pz.screw(c.b);
        if (Math.max(pz.boards.layerOf(sa), pz.boards.layerOf(sb)) !== layer) continue;
        const pa = pz.posOf(sa); const pb = pz.posOf(sb);
        const sh = this.shakes.get(c.a) ?? this.shakes.get(c.b);
        drawChain(ctx, pa.x, pa.y, pb.x, pb.y, this.lockOf.get(c.lock), t, sh != null && t - sh < 0.3 ? 1.5 : 0);
      }
    }
    // 碎片、飞行中的螺丝、特效
    this.renderShards(ctx);
    this.tray.renderFlights(ctx);
    this.fx.render(ctx);
    ctx.restore();

    // 提示手
    if (hint && this.index <= 1) this.drawHand(ctx, pz.posOf(hint), t);
    // 道具栏
    this.renderItems(ctx);
    this.menuBtn.render(ctx, 1 / 60);
    // 模式提示
    if (this.mode) {
      const txt = this.mode === 'hammer' ? '点一块板，整块敲掉' : this.freeDriver ? '点一颗螺丝，直接拧下来 (免费)' : '点一颗螺丝，直接拧下来';
      roundRectPath(ctx, W / 2 - 150, F.bottom - 44, 300, 36, 18);
      ctx.fillStyle = 'rgba(217,103,59,0.92)'; ctx.fill();
      drawText(ctx, txt, W / 2, F.bottom - 26, { size: 15, color: '#fff' });
    }
    // 开场关名
    if (this.time < 1.8) this.drawBanner(ctx);
    this.subs.render(ctx);
    if (this.chapterDone && this.reveal && this.reveal.t > 1.4) {
      const k = Math.min(1, (this.reveal.t - 1.4) / 0.5);
      ctx.save(); ctx.globalAlpha = k;
      roundRectPath(ctx, W / 2 - 170, F.top + FH / 2 - 40, 340, 80, 16);
      ctx.fillStyle = 'rgba(30,20,14,0.7)'; ctx.fill();
      drawText(ctx, `《${this.chapter.title}》`, W / 2, F.top + FH / 2 - 12, { size: 26, serif: true, color: '#fff3dc' });
      drawText(ctx, '整幅拆出来了', W / 2, F.top + FH / 2 + 20, { size: 16, color: '#ffd9a0' });
      ctx.restore();
    }
    this.fx.renderFlash(ctx, W, H);
  }

  drawScrewAt(ctx, s, t, hint) {
    const pz = this.puzzle;
    const pos = pz.posOf(s);
    let x = pos.x;
    const sh = this.shakes.get(s.id);
    if (sh != null && t - sh < 0.3) x += Math.sin((t - sh) * 70) * 3 * (1 - (t - sh) / 0.3);
    const hanger = s.board < 0;
    drawScrew(ctx, x, pos.y, {
      color: s.colors[0], inner: s.colors.length > 1 ? s.colors[1] : null, hidden: s.hidden,
      rot: this.rot.get(s.id), frost: s.frost, bomb: s.bomb, key: !!s.key, hanger,
      lockBadge: this.lockOf.get(s.id) || null, time: t,
      glow: (hint === s && this.index > 1) || (this.mode === 'screwdriver'),
    });
  }

  drawLockBadge(ctx, b) {
    const p = b.body.position;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40,28,10,0.55)'; ctx.fill();
    ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2; ctx.stroke();
    Icons.lock(ctx, 26, '#ffd34d');
    ctx.restore();
  }

  drawHand(ctx, p, t) {
    const bob = Math.sin(t * 6) * 6;
    ctx.save();
    ctx.translate(p.x + 16, p.y + 22 + bob);
    ctx.rotate(-0.4);
    ctx.fillStyle = '#fff4e6'; ctx.strokeStyle = '#5a3a26'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-4, -18); ctx.quadraticCurveTo(0, -24, 4, -18); ctx.lineTo(4, 0); ctx.lineTo(14, 2); ctx.quadraticCurveTo(20, 4, 18, 14);
    ctx.lineTo(14, 30); ctx.lineTo(-8, 30); ctx.lineTo(-14, 10); ctx.quadraticCurveTo(-14, 4, -8, 6); ctx.lineTo(-4, 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(p.x, p.y, 22 + Math.sin(t * 6) * 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,240,200,0.8)'; ctx.lineWidth = 3; ctx.stroke();
  }

  drawBanner(ctx) {
    const k = this.time / 1.8;
    const a = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
    ctx.save();
    ctx.globalAlpha = a;
    const y = F.top + FH / 2;
    const grd = ctx.createLinearGradient(0, y - 60, 0, y + 60);
    grd.addColorStop(0, 'rgba(30,20,14,0)'); grd.addColorStop(0.3, 'rgba(30,20,14,0.75)'); grd.addColorStop(0.7, 'rgba(30,20,14,0.75)'); grd.addColorStop(1, 'rgba(30,20,14,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, y - 60, W, 120);
    drawText(ctx, `${this.chapter.title} · 第 ${this.L.no} 块`, W / 2, y - 18, { size: 16, color: '#f1c48f', weight: 'normal' });
    drawText(ctx, this.L.sub, W / 2 + (1 - Math.min(1, k * 4)) * 30, y + 16, { size: 34, serif: true, color: '#fff3dc' });
    ctx.restore();
  }

  renderItems(ctx) {
    ctx.save();
    const y = GameConfig.layout.itemY;
    const g = ctx.createLinearGradient(0, y - 56, 0, H);
    g.addColorStop(0, 'rgba(30,20,14,0)'); g.addColorStop(0.3, 'rgba(30,20,14,0.55)'); g.addColorStop(1, 'rgba(30,20,14,0.75)');
    ctx.fillStyle = g; ctx.fillRect(0, y - 56, W, H - y + 56);
    ctx.restore();
    for (const b of this.items) {
      const st = this.itemState(b.key);
      b.locked = st.locked || null;
      b.enabled = !st.locked && !!st.can;
      b.active = this.mode === b.key;
      b.badge = st.locked ? null : (st.have > 0 ? st.have : '+');
      b.render(ctx, 1 / 60);
    }
  }
}

// ================================================================ 弹窗
class AdAskPanel extends Modal {
  constructor(game, { title, text, ok, onOk }) {
    super(game);
    Object.assign(this, { title, text });
    this.btn({ x: W / 2 - 90, y: 560, w: 150, h: 52, style: 'secondary', label: '算了', fontSize: 20, onClick: () => this.close() });
    this.btn({ x: W / 2 + 90, y: 560, w: 150, h: 52, style: 'primary', label: ok, fontSize: 19, onClick: () => { this.close(); onOk(); } });
  }
  render(ctx, dt) {
    dimScreen(ctx, 0.45);
    ctx.save();
    const s = this.pop;
    ctx.translate(W / 2, 480); ctx.scale(s, s); ctx.translate(-W / 2, -480);
    drawPanel(ctx, 60, 380, W - 120, 230, 22);
    drawText(ctx, this.title, W / 2, 424, { size: 23, serif: true });
    drawParagraph(ctx, this.text, W / 2, 472, W - 170, { size: 16, color: GameConfig.colors.inkLight });
    this.renderButtons(ctx, dt);
    ctx.restore();
  }
}

const FAIL_TEXT = {
  holes: { title: '孔满了', text: '临时孔都占满了，手上的螺丝没地方放。' },
  overflow: { title: '孔满了', text: '一下子掉下来太多螺丝，孔放不下了。' },
  stuck: { title: '卡住了', text: '能拧的都拧完了，剩下的被挡住了。' },
  bomb: { title: '炸了', text: '炸弹螺丝没赶上拧掉。' },
};

class FailPanel extends Modal {
  constructor(game, scene) {
    super(game);
    this.scene = scene;
    const reason = scene.puzzle.failReason;
    this.info = FAIL_TEXT[reason] || FAIL_TEXT.stuck;
    const canRevive = scene.revives < GameConfig.revivesPerLevel;
    let y = 560;
    if (canRevive) {
      const label = reason === 'bomb' ? `看个广告，引信多烧${GameConfig.bombReviveSteps}步` : reason === 'stuck' ? '看个广告，送一次螺丝刀' : '看个广告，多开一个孔';
      this.btn({ x: W / 2, y, w: 330, h: 60, style: 'primary', label, fontSize: 20, onClick: () => scene.revive() });
      y += 72;
    }
    const undo = scene.itemState('undo');
    if (!undo.locked && undo.can) {
      this.btn({ x: W / 2, y, w: 330, h: 52, style: 'secondary', label: `退一步${undo.have > 0 ? `（还有 ${undo.have} 次）` : '（看广告）'}`, fontSize: 19, onClick: () => scene.useItem('undo') });
      y += 64;
    }
    this.btn({ x: W / 2, y, w: 330, h: 52, style: 'secondary', label: '重来', fontSize: 20, onClick: () => game.scenes.change('game', { level: scene.index }) });
    this.bottom = y + 40;
  }
  render(ctx, dt) {
    dimScreen(ctx, 0.5);
    ctx.save();
    const s = this.pop;
    ctx.translate(W / 2, 520); ctx.scale(s, s); ctx.translate(-W / 2, -520);
    drawPanel(ctx, 50, 400, W - 100, this.bottom - 400 + 10, 22);
    drawText(ctx, this.info.title, W / 2, 446, { size: 30, serif: true, color: GameConfig.colors.danger });
    drawText(ctx, this.info.text, W / 2, 490, { size: 15, color: GameConfig.colors.inkLight, weight: 'normal', maxWidth: W - 140 });
    if (this.scene.revives >= GameConfig.revivesPerLevel) drawText(ctx, '这关的复活次数用完了', W / 2, 516, { size: 13, color: GameConfig.colors.inkLight, weight: 'normal' });
    this.renderButtons(ctx, dt);
    ctx.restore();
  }
}

class WinPanel extends Modal {
  constructor(game, scene) {
    super(game);
    this.scene = scene;
    const last = scene.index + 1 >= LEVELS.length;
    const chapterEnd = (scene.index + 1) % 10 === 0;
    this.btn({ x: W / 2, y: 790, w: 300, h: 62, style: 'primary', label: last ? '去画册看看' : chapterEnd ? '去下一幅画' : '下一块', fontSize: 26, onClick: () => { this.close(); scene.nextLevel(); } });
    this.btn({ x: W / 2 - 80, y: 866, w: 144, h: 50, style: 'secondary', label: '画册', fontSize: 19, onClick: () => game.scenes.change('gallery', { chapter: scene.chIdx, from: 'select' }) });
    this.btn({ x: W / 2 + 80, y: 866, w: 144, h: 50, style: 'secondary', label: '选关', fontSize: 19, onClick: () => game.scenes.change('select', { focus: scene.index + 1 }) });
    this.share = this.btn({ x: W / 2, y: 724, w: 240, h: 40, style: 'ghost', label: '给朋友看看这幅画', fontSize: 16, onClick: () => shareChapter(game, scene.chIdx) });
  }
  render(ctx, dt) {
    const sc = this.scene;
    const k = ease.cubicOut(Math.min(1, this.t / 0.35));
    ctx.save();
    ctx.translate(0, (1 - k) * 200);
    ctx.globalAlpha = k;
    const g = ctx.createLinearGradient(0, 560, 0, H);
    g.addColorStop(0, 'rgba(30,20,14,0)'); g.addColorStop(0.22, 'rgba(30,20,14,0.8)'); g.addColorStop(1, 'rgba(30,20,14,0.95)');
    ctx.fillStyle = g; ctx.fillRect(0, 560, W, H - 560);
    const n = sc.game.save.fragmentsOf(sc.chIdx);
    drawText(ctx, sc.chapterDone ? '整幅拆出来了' : '这块拆下来了', W / 2, 640, { size: 30, serif: true, color: '#fff3dc' });
    drawText(ctx, `《${sc.chapter.title}》 ${n} / 10`, W / 2, 676, { size: 15, color: '#f1c48f' });
    this.renderButtons(ctx, dt);
    ctx.restore();
  }
}

// 提示卡上的小插图
function drawTipIcon(ctx, icon, x, y, t) {
  const box = (bx, by, c) => { roundRectPath(ctx, bx - 26, by - 16, 52, 32, 8); ctx.fillStyle = GameConfig.screwColors[c].hex; ctx.fill(); };
  const plank = (px, py, w, h, color = '#d6a467', a = 1) => { ctx.save(); ctx.globalAlpha = a; roundRectPath(ctx, px - w / 2, py - h / 2, w, h, 8); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke(); ctx.restore(); };
  const bob = Math.sin(t * 4);
  switch (icon) {
    case 'screw':
      plank(x - 30, y + 10, 120, 50);
      drawScrew(ctx, x - 60, y + 10, { color: 'sky', rot: t * 2 });
      box(x + 70, y - 20 + bob * 2, 'sky');
      break;
    case 'hole':
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x - 60 + i * 40, y + 10, 15, 0, Math.PI * 2); ctx.fillStyle = '#1d140e'; ctx.fill(); }
      drawScrew(ctx, x - 60, y + 10, { color: 'pink', scale: 0.85 });
      drawScrew(ctx, x - 20, y + 10, { color: 'amber', scale: 0.85 });
      break;
    case 'cover':
      drawScrew(ctx, x - 20, y + 6, { color: 'green' });
      plank(x + 10, y - 4, 120, 46, '#82502f');
      drawScrew(ctx, x + 50, y - 4, { color: 'pink' });
      break;
    case 'glass':
      drawScrew(ctx, x - 20, y + 6, { color: 'green' });
      plank(x + 10, y - 4, 140, 56, 'rgba(216,242,255,0.45)');
      break;
    case 'chain':
      drawChain(ctx, x - 60, y + 12, x + 20, y + 12, '#e2b23c', t);
      drawScrew(ctx, x - 60, y + 12, { color: 'sky' });
      drawScrew(ctx, x + 20, y + 12, { color: 'pink' });
      drawScrew(ctx, x + 75, y - 20, { color: 'amber', lockBadge: '#e2b23c' });
      break;
    case 'frost': drawScrew(ctx, x, y, { color: 'violet', frost: 2, scale: 1.5 }); break;
    case 'lock':
      plank(x - 30, y, 110, 70, '#aab3bd');
      ctx.save(); ctx.translate(x - 30, y); Icons.lock(ctx, 30, '#ffd34d'); ctx.restore();
      drawScrew(ctx, x + 70, y, { color: 'amber', key: true, scale: 1.3 });
      break;
    case 'bomb': drawScrew(ctx, x, y + 6, { color: 'red', bomb: 3 - Math.floor(t) % 3, scale: 1.5, time: t }); break;
    case 'hidden': drawScrew(ctx, x, y, { hidden: true, scale: 1.6 }); break;
    case 'rope':
      drawRope(ctx, x, y - 50, x, y - 6);
      drawScrew(ctx, x, y - 50, { color: 'red', hanger: true, scale: 0.8 });
      plank(x, y + 18, 120, 44, '#c9773f');
      break;
    case 'double': drawScrew(ctx, x, y, { color: 'sky', inner: 'pink', scale: 1.5 }); break;
    default: {
      const fn = ITEM_ICONS[icon];
      if (fn) { ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fillStyle = '#fbf4e6'; ctx.fill(); fn(ctx, 80); ctx.restore(); }
    }
  }
  void hexA;
}
