// 关卡生成器用到的模块 (不含 LevelData，生成前它可能还不存在)
export { PuzzleSystem } from '../../src/systems/PuzzleSystem.js';
export { EventBus } from '../../src/core/EventBus.js';
export { makeRng, pointInPoly, distToPolyEdge } from '../../src/systems/geom.js';
export { BLUEPRINTS } from '../../src/config/LevelBlueprints.js';
export { DIFFICULTY, GENERATOR } from '../../src/config/DifficultyConfig.js';
export { GameConfig } from '../../src/config/GameConfig.js';
export { rect, plank, ngon, disc, trap } from '../../src/config/shapes.js';
export { circleHitsPoly, polygonCentroid, rotate } from '../../src/systems/geom.js';
