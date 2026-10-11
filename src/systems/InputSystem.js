// 输入系统：平台层把鼠标 / 触摸 (网页 Pointer Events，抖音 tt.onTouch*) 统一成画布像素坐标，
// 这里转换为逻辑坐标后通过事件总线派发 (input:down / input:move / input:up / input:key)。只处理单指。
import { platform } from '../platform/index.js';

export class InputSystem {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.pointer = { x: game.width / 2, y: game.height / 2, down: false };
    this.activePointerId = null;
    platform.bindInput(this.canvas, {
      down: (id, x, y, type) => this._down(id, x, y, type),
      move: (id, x, y, type) => this._move(id, x, y, type),
      up: (id, x, y, type) => this._up(id, x, y, type),
      key: (e) => game.events.emit('input:key', e),
    });
  }

  toLogical(x, y, type) {
    const p = this.game.toLogical(x, y);
    p.type = type;
    return p;
  }

  _down(id, x, y, type) {
    if (this.activePointerId !== null && this.activePointerId !== id) return; // 只处理单指
    this.activePointerId = id;
    const p = this.toLogical(x, y, type);
    Object.assign(this.pointer, p, { down: true });
    this.game.events.emit('input:down', p);
  }

  _move(id, x, y, type) {
    if (this.activePointerId !== null && this.activePointerId !== id) return;
    const p = this.toLogical(x, y, type);
    Object.assign(this.pointer, p);
    this.game.events.emit('input:move', p);
  }

  _up(id, x, y, type) {
    if (this.activePointerId !== id) return;
    this.activePointerId = null;
    const p = this.toLogical(x, y, type);
    Object.assign(this.pointer, p, { down: false });
    this.game.events.emit('input:up', p);
  }
}
