// 简单的发布/订阅事件总线，系统之间只通过事件通信，避免互相直接依赖。
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /** 订阅事件，返回取消订阅函数 */
  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  once(event, fn) {
    const off = this.on(event, (...args) => { off(); fn(...args); });
    return off;
  }

  off(event, fn) {
    const set = this.listeners.get(event);
    if (set) set.delete(fn);
  }

  emit(event, ...args) {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[EventBus] "${event}" 处理出错:`, err);
      }
    }
  }

  clear() {
    this.listeners.clear();
  }
}
