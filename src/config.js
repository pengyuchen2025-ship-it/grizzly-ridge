// =============================================================
//  灰岭之夜 — 所有可调内容都在这里
// =============================================================

export const GAME = {
  title: '灰岭之夜',
  subtitle: '病毒爆发之夜，你是那只怪物',
  pixelScale: 2,          // 像素化程度：1 = 关闭，2 = 轻度，3 = 中度，4 = 重度（按 P 切换）
  mapBlocks: 6,           // 城市街区数量（每边）
  cell: 30,               // 每个街区 + 道路的宽度
  road: 10,               // 道路宽度
};

export const PLAYER = {
  startRadius: 1.25,      // 初始半径
  maxHp: 100,
  personVolume: 0.9,      // 吞一个人增加的“体积”
  carVolume: 4.5,         // 压爆一辆车增加的体积
  heliVolume: 9.0,
  healPerPerson: 10,      // 吃人回血
  crushRadius: 2.4,       // 达到这个半径才能压爆汽车 / 警车
  baseSpeed: 10,
  speedPerRadius: 1.4,
  jumpSpeed: 15,
  jumpPerRadius: 1.2,
  climbSpeed: 11,
  gravity: 32,
};

// 警力随时间升级（秒）
export const WAVES = [
  { t: 0,   label: '平静',     stars: 0, cops: 0,  cars: 0, helis: 0, news: 0 },
  { t: 12,  label: '报警',     stars: 1, cops: 3,  cars: 0, helis: 0, news: 0 },
  { t: 25,  label: '新闻直升机', stars: 1, cops: 4,  cars: 1, helis: 0, news: 1 },
  { t: 45,  label: '警车出动',  stars: 2, cops: 7,  cars: 3, helis: 0, news: 1 },
  { t: 65,  label: '警用直升机', stars: 3, cops: 9,  cars: 3, helis: 2, news: 1 },
  { t: 100, label: '全城戒严',  stars: 4, cops: 12, cars: 4, helis: 3, news: 1, roadblock: true },
  { t: 150, label: '末日',     stars: 5, cops: 16, cars: 5, helis: 5, news: 1, roadblock: true },
];
export const TRAFFIC = { count: 10, speed: 10, panicSpeed: 17, panicRadius: 16 };

export const CIVILIANS = { count: 80, fleeRadius: 22, walkSpeed: 2.2, runSpeed: 5.5 };

export const POLICE = {
  range: 30, keepDistance: 13, speed: 5,
  fireInterval: 1.2, hitChance: 0.4, damage: 2.2,
};

export const HELI = {
  altitudeMin: 17, altitudeMax: 27, orbitRadius: 26,
  fireInterval: 0.32, hitChance: 0.3, damage: 1.6,
};

// Hi3D 模型：把 GLB 放进 assets/models/ 并在 manifest.json 里写上 id 即可替换占位模型
// fit: 'height' | 'length' | 'size'  → 按高度 / 长度 / 最大边缩放
// rotY: 如果模型朝向不对，用弧度旋转修正
export const MODELS = {
  monster:    { fit: 'size',   value: 2.0, rotY: 0 },
  civ_man:    { fit: 'height', value: 2.3, rotY: 0 },
  civ_woman:  { fit: 'height', value: 2.2, rotY: 0 },
  police:     { fit: 'height', value: 2.35, rotY: 0 },
  police_car: { fit: 'length', value: 5.0, rotY: 0 },
  car:        { fit: 'length', value: 4.7, rotY: 0 },
  helicopter: { fit: 'length', value: 11,  rotY: 0 },
};
