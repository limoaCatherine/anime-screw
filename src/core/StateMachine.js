// 有限状态机：用于场景内部的状态切换 (如 GameScene 的 playing / paused / over)。
export class StateMachine {
  constructor(owner) {
    this.owner = owner;
    this.states = {};
    this.current = null;
    this.name = null;
    this.time = 0; // 进入当前状态后经过的时间
  }

  add(name, handlers = {}) {
    this.states[name] = handlers;
    return this;
  }

  change(name, data) {
    if (!this.states[name]) throw new Error(`[StateMachine] 未知状态: ${name}`);
    const prev = this.name;
    if (this.current && this.current.exit) this.current.exit.call(this.owner, name);
    this.current = this.states[name];
    this.name = name;
    this.time = 0;
    if (this.current.enter) this.current.enter.call(this.owner, prev, data);
  }

  is(name) {
    return this.name === name;
  }

  update(dt) {
    this.time += dt;
    if (this.current && this.current.update) this.current.update.call(this.owner, dt);
  }
}
