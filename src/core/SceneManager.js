// 场景管理器：注册、切换场景 (带淡入淡出转场)，并把输入转发给当前场景。
export class SceneManager {
  constructor(game) {
    this.game = game;
    this.scenes = new Map();
    this.current = null;
    this.fade = 0;         // 0 = 透明, 1 = 全黑
    this.pending = null;   // { name, data }
    this.phase = 'idle';   // idle | out | in

    const ev = game.events;
    ev.on('input:down', (p) => this.forward('onPointerDown', p));
    ev.on('input:move', (p) => this.forward('onPointerMove', p));
    ev.on('input:up', (p) => this.forward('onPointerUp', p));
    ev.on('input:key', (e) => this.forward('onKeyDown', e));
  }

  get currentName() {
    return this.current ? this.current.name : null;
  }

  get transitioning() {
    return this.phase !== 'idle';
  }

  register(scene) {
    this.scenes.set(scene.name, scene);
  }

  /** 切换场景；options.transition=false 时立即切换 */
  change(name, data = {}, options = {}) {
    if (!this.scenes.has(name)) throw new Error(`[SceneManager] 未注册的场景: ${name}`);
    const useTransition = options.transition !== false && this.current;
    if (!useTransition) {
      this._swap(name, data);
      return;
    }
    if (this.phase === 'out') return; // 已经在切换中
    this.pending = { name, data };
    this.phase = 'out';
  }

  _swap(name, data) {
    if (this.current) {
      this.current.exit();
      this.current.unlistenAll();
    }
    this.current = this.scenes.get(name);
    this.current.time = 0;
    this.current.enter(data);
    this.game.events.emit('scene:changed', name);
  }

  forward(method, arg) {
    if (!this.current || this.phase === 'out') return;
    if (this.game.captureInput && this.game.captureInput(method, arg)) return;  // 弹窗 / 广告优先
    this.current[method](arg);
  }

  update(dt) {
    if (this.phase === 'out') {
      this.fade = Math.min(1, this.fade + dt / 0.22);
      if (this.fade >= 1) {
        const { name, data } = this.pending;
        this.pending = null;
        this._swap(name, data);
        this.phase = 'in';
      }
    } else if (this.phase === 'in') {
      this.fade = Math.max(0, this.fade - dt / 0.28);
      if (this.fade <= 0) this.phase = 'idle';
    }
    if (this.current && this.phase !== 'out') this.current.update(dt);
  }

  render(ctx) {
    if (this.current) this.current.render(ctx);
    if (this.fade > 0) {
      ctx.save();
      ctx.globalAlpha = this.fade;
      ctx.fillStyle = '#f3e6d3';
      ctx.fillRect(0, 0, this.game.width, this.game.height);
      ctx.restore();
    }
  }
}
