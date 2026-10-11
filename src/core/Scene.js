// 场景基类：生命周期 enter/exit/update/render，以及按钮输入分发。
export class Scene {
  constructor(game, name) {
    this.game = game;
    this.name = name;
    this.buttons = [];
    this.time = 0;
    this._subs = [];
  }

  /** 订阅全局事件，场景退出时自动取消 */
  listen(event, fn) {
    this._subs.push(this.game.events.on(event, fn));
  }

  unlistenAll() {
    this._subs.forEach((off) => off());
    this._subs = [];
  }

  enter(_data) {}
  exit() {}
  update(dt) { this.time += dt; }
  render(_ctx) {}

  /** 当前可交互的按钮列表 (子类可重写) */
  activeButtons() { return this.buttons; }

  onPointerDown(p) {
    for (const b of this.activeButtons()) if (b.handleDown(p)) return true;
    return false;
  }

  onPointerMove(p) {
    for (const b of this.activeButtons()) b.handleMove(p);
    return false;
  }

  onPointerUp(p) {
    let consumed = false;
    for (const b of this.activeButtons()) if (b.handleUp(p)) consumed = true;
    return consumed;
  }

  onKeyDown(_e) {}
}
