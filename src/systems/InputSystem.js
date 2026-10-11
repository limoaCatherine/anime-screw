// 输入系统：统一鼠标/触摸 (Pointer Events) 与键盘，转换为逻辑坐标后通过事件总线派发。
export class InputSystem {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.pointer = { x: game.width / 2, y: game.height / 2, down: false };
    this.activePointerId = null;

    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.repeat && (e.code === 'Space' || e.code === 'Enter')) return;
      game.events.emit('input:key', e);
    });
  }

  toLogical(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * this.game.width,
      y: ((e.clientY - r.top) / r.height) * this.game.height,
      type: e.pointerType,
    };
  }

  _down(e) {
    e.preventDefault();
    if (this.activePointerId !== null && this.activePointerId !== e.pointerId) return; // 只处理单指
    this.activePointerId = e.pointerId;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const p = this.toLogical(e);
    Object.assign(this.pointer, p, { down: true });
    this.game.events.emit('input:down', p);
  }

  _move(e) {
    if (this.activePointerId !== null && this.activePointerId !== e.pointerId) return;
    const p = this.toLogical(e);
    Object.assign(this.pointer, p);
    this.game.events.emit('input:move', p);
  }

  _up(e) {
    if (this.activePointerId !== e.pointerId) return;
    this.activePointerId = null;
    const p = this.toLogical(e);
    Object.assign(this.pointer, p, { down: false });
    this.game.events.emit('input:up', p);
  }
}
