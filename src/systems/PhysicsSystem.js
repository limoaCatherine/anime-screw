// 物理系统：封装 Matter.js 引擎。板子 = 动态刚体；每颗螺丝 = 一条把板子钉在画框上的约束 (Constraint)。
// - 拧下一颗螺丝就删掉对应的那一条约束：剩 1 颗时板子绕它下垂摆动，0 颗时自由落体掉出屏幕
// - 板子之间互不碰撞 (同一负碰撞组)，避免叠放卡死；绳吊板用一条有长度的约束吊着
// - 固定步长推进；无 DOM 依赖，浏览器与 tools/verify_levels.mjs (Node) 共用
import Matter from '../lib/matter.js';
import { GameConfig } from '../config/GameConfig.js';

const { Engine, Bodies, Body, Composite, Constraint } = Matter;

export class PhysicsSystem {
  constructor(events, rules = {}) {
    const cfg = GameConfig.physics;
    this.cfg = cfg;
    this.events = events;
    this.engine = Engine.create({
      positionIterations: cfg.positionIterations,
      velocityIterations: cfg.velocityIterations,
      constraintIterations: cfg.constraintIterations,
      enableSleeping: false,
    });
    this.engine.gravity.y = rules.gravityY || cfg.gravityY;
    this.world = this.engine.world;
    this.accumulator = 0;
    this.steps = 0;
    this.afterStep = null;
  }

  /** 用世界坐标顶点 ([[x,y],...]，凸多边形) 创建板子刚体，质心即刚体位置 */
  createBoard(verts, centroid) {
    const body = Bodies.fromVertices(centroid.x, centroid.y, [verts.map(([x, y]) => ({ x, y }))], {
      label: 'board',
      frictionAir: this.cfg.frictionAir,
      density: this.cfg.density,
      collisionFilter: { group: -1, category: 0x0002, mask: 0 },
      isSensor: true,
    });
    // fromVertices 会把顶点重新居中到质心；对齐到我们算的质心，保证螺丝局部坐标一致
    Body.setPosition(body, { x: centroid.x, y: centroid.y });
    Composite.add(this.world, body);
    return body;
  }

  /** 螺丝钉：把刚体上的一点钉在世界坐标 (wx, wy) */
  pin(body, wx, wy) {
    const c = Constraint.create({
      pointA: { x: wx, y: wy },
      bodyB: body,
      pointB: { x: wx - body.position.x, y: wy - body.position.y },
      length: 0,
      stiffness: this.cfg.pinStiffness,
      damping: this.cfg.pinDamping,
      label: 'pin',
    });
    Composite.add(this.world, c);
    return c;
  }

  /** 绳子：世界点 (ax, ay) 吊住刚体上的世界点 (bx, by) */
  rope(body, ax, ay, bx, by) {
    const c = Constraint.create({
      pointA: { x: ax, y: ay },
      bodyB: body,
      pointB: { x: bx - body.position.x, y: by - body.position.y },
      length: Math.hypot(bx - ax, by - ay),
      stiffness: this.cfg.ropeStiffness,
      damping: 0.02,
      label: 'rope',
    });
    Composite.add(this.world, c);
    return c;
  }

  removeConstraint(c) {
    if (c) Composite.remove(this.world, c);
  }

  removeBody(body) {
    Composite.remove(this.world, body);
  }

  addBody(body) {
    if (!Composite.get(this.world, body.id, 'body')) Composite.add(this.world, body);
  }

  setState(body, s) {
    Body.setAngle(body, s.angle);
    Body.setPosition(body, { x: s.x, y: s.y });
    Body.setVelocity(body, { x: s.vx, y: s.vy });
    Body.setAngularVelocity(body, s.av);
  }

  getState(body) {
    return { x: body.position.x, y: body.position.y, angle: body.angle, vx: body.velocity.x, vy: body.velocity.y, av: body.angularVelocity };
  }

  nudge(body, av) {
    Body.setAngularVelocity(body, body.angularVelocity + av);
  }

  /** 推进一个固定步长 */
  stepFixed() {
    Engine.update(this.engine, this.cfg.timestep);
    this.steps++;
    if (this.afterStep) this.afterStep();
  }

  /** 按真实时间推进 (累加器 + 固定步长) */
  step(dt) {
    const ts = this.cfg.timestep;
    this.accumulator += dt * 1000;
    let n = 0;
    while (this.accumulator >= ts && n < this.cfg.maxSubSteps) {
      this.stepFixed();
      this.accumulator -= ts;
      n++;
    }
    if (n >= this.cfg.maxSubSteps) this.accumulator = 0;
    return n;
  }

  destroy() {
    Composite.clear(this.world, false);
    Engine.clear(this.engine);
    this.afterStep = null;
  }
}
