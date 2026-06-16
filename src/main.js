import Phaser from 'phaser';
import './styles.css';

const WIDTH = 900;
const HEIGHT = 1000;
const BALL_RADIUS = 11;
const TABLE = {
  left: 150,
  right: 750,
  top: 48,
  bottom: 936,
  laneLeft: 778,
  laneRight: 846
};

const clamp = Phaser.Math.Clamp;

class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  boot() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.075;
    this.master.connect(this.ctx.destination);
  }

  tone(freq, duration = 0.08, type = 'square', sweep = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + sweep), now + duration);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(1, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  bumper() {
    this.tone(560, 0.06, 'triangle', 260);
    this.tone(1050, 0.05, 'square', -260);
  }

  flip() {
    this.tone(250, 0.04, 'square', 80);
  }

  launch() {
    this.tone(115, 0.18, 'sawtooth', 720);
  }

  drain() {
    this.tone(150, 0.16, 'sawtooth', -80);
    this.tone(82, 0.22, 'triangle', -24);
  }

  award() {
    [392, 523, 659, 988].forEach((freq, index) => {
      window.setTimeout(() => this.tone(freq, 0.06, 'triangle', 100), index * 50);
    });
  }
}

class PinballScene extends Phaser.Scene {
  constructor() {
    super('PinballScene');
    this.score = 0;
    this.highScore = Number.parseInt(localStorage.getItem('neoPinballHighScore') || '0', 10);
    this.balls = 3;
    this.multiplier = 1;
    this.plungerPower = 0;
    this.touchLeft = false;
    this.touchRight = false;
    this.synth = new Synth();
  }

  preload() {
    this.createTextures();
  }

  create() {
    this.segments = [];
    this.bumpers = [];
    this.sensors = [];
    this.movers = [];
    this.launchCurve = [];
    this.targetsLit = new Set();
    this.rolloversLit = new Set();

    this.drawBackplate();
    this.drawPlayfield();
    this.createCollisionMap();
    this.createBumpers();
    this.createRollovers();
    this.createTargets();
    this.createMovingDetails();
    this.createFlippers();
    this.createPlunger();
    this.createBall();
    this.createHud();
    this.createInput();
    this.updateHud();

    window.__pinball = this;
  }

  createTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(14, 14, 14);
    g.fillStyle(0xbdd6f3, 0.9);
    g.fillCircle(10, 9, 5);
    g.lineStyle(2, 0x6b7d9e, 0.7);
    g.strokeCircle(14, 14, 13);
    g.generateTexture('ball', 28, 28);

    g.clear();
    g.fillStyle(0xfff0a3, 1);
    g.fillRoundedRect(0, 0, 130, 24, 12);
    g.fillStyle(0xff675d, 1);
    g.fillRoundedRect(6, 5, 40, 14, 7);
    g.fillStyle(0xffffff, 0.8);
    g.fillRoundedRect(50, 5, 68, 7, 4);
    g.generateTexture('flipper', 130, 24);

    g.clear();
    g.fillStyle(0x68e6e8, 1);
    g.fillRoundedRect(0, 0, 74, 22, 11);
    g.fillStyle(0xffffff, 0.75);
    g.fillRoundedRect(8, 5, 36, 5, 3);
    g.lineStyle(3, 0x4663b8, 1);
    g.strokeRoundedRect(0, 0, 74, 22, 11);
    g.generateTexture('laneRubber', 74, 22);
  }

  drawBackplate() {
    this.cameras.main.setBackgroundColor('#050712');
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x050712, 0x091225, 0x1b0d2e, 0x050712, 1);
    bg.fillRect(0, 0, WIDTH, HEIGHT);

    bg.fillStyle(0x7c5cff, 0.08);
    bg.fillEllipse(270, 340, 480, 900);
    bg.fillStyle(0x00d4ff, 0.07);
    bg.fillEllipse(675, 470, 360, 720);
    for (let i = 0; i < 90; i += 1) {
      bg.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.12, 0.38));
      bg.fillCircle(Phaser.Math.Between(28, WIDTH - 28), Phaser.Math.Between(20, HEIGHT - 20), Phaser.Math.FloatBetween(0.6, 1.8));
    }

    bg.fillStyle(0x000000, 0.36);
    bg.fillRoundedRect(TABLE.left + 22, TABLE.top + 18, 644, 902, 10);
    bg.fillStyle(0x24282f, 1);
    bg.fillRoundedRect(TABLE.left - 22, TABLE.top - 18, 648, 920, 8);
    bg.lineStyle(6, 0x8b929e, 1);
    bg.strokeRoundedRect(TABLE.left - 22, TABLE.top - 18, 648, 920, 8);
    bg.fillStyle(0x11151b, 1);
    bg.fillRoundedRect(TABLE.left - 6, TABLE.top - 2, 616, 884, 4);
  }

  drawPlayfield() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x6a5ac4, 0x6951b8, 0x33275f, 0x46317e, 1);
    g.fillRoundedRect(TABLE.left, TABLE.top, 596, 874, 4);

    g.fillStyle(0x201c3f, 1);
    g.fillTriangle(TABLE.left, TABLE.top, TABLE.left + 92, TABLE.top, TABLE.left, TABLE.top + 92);
    g.fillTriangle(TABLE.right - 4, TABLE.top, TABLE.right - 96, TABLE.top, TABLE.right - 4, TABLE.top + 92);
    g.fillTriangle(TABLE.left, TABLE.bottom - 110, TABLE.left, TABLE.bottom - 18, TABLE.left + 92, TABLE.bottom - 18);
    g.fillTriangle(TABLE.right - 4, TABLE.bottom - 110, TABLE.right - 4, TABLE.bottom - 18, TABLE.right - 96, TABLE.bottom - 18);

    g.lineStyle(18, 0x1b1d2b, 1);
    this.strokeArc(g, 450, 248, 294, 202, 338, 48);
    g.lineStyle(4, 0x9f92f2, 0.6);
    this.strokeArc(g, 450, 248, 248, 205, 335, 48);

    this.drawLane(243, 176, 306, 254, 0x7565d5);
    this.drawLane(657, 176, 594, 254, 0x7565d5);
    this.drawLane(206, 562, 312, 704, 0x2b254e);
    this.drawLane(694, 562, 588, 704, 0x2b254e);

    const v = this.add.graphics();
    v.lineStyle(12, 0x68e6e8, 0.35);
    v.beginPath();
    v.moveTo(318, 690);
    v.lineTo(450, 806);
    v.lineTo(582, 690);
    v.strokePath();
    v.lineStyle(4, 0xfff0a3, 0.85);
    v.beginPath();
    v.moveTo(318, 690);
    v.lineTo(450, 806);
    v.lineTo(582, 690);
    v.strokePath();

    this.add.text(450, 560, 'PINBALL', {
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize: '34px',
      color: '#ffffff',
      stroke: '#47b56a',
      strokeThickness: 10
    }).setOrigin(0.5).setRotation(-0.09).setDepth(3);

    const badge = this.add.graphics();
    badge.fillStyle(0x4fc276, 1);
    badge.fillRoundedRect(352, 538, 196, 54, 10);
    badge.lineStyle(4, 0xffffff, 0.75);
    badge.strokeRoundedRect(352, 538, 196, 54, 10);
    badge.setDepth(2);

    this.add.text(450, 615, 'NEO TABLE', {
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize: '15px',
      color: '#fff6a8'
    }).setOrigin(0.5);
  }

  drawLane(x1, y1, x2, y2, color) {
    const g = this.add.graphics();
    g.lineStyle(20, color, 1);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();
    g.lineStyle(3, 0x8ee9ff, 0.7);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();
  }

  createCollisionMap() {
    this.addRail(150, 904, 150, 138, 0.82, 12);
    this.addRail(150, 138, 238, 48, 0.82, 12);
    this.addRail(238, 48, 660, 48, 0.82, 12);
    this.addRail(660, 48, 750, 138, 0.82, 12);
    this.addRail(750, 138, 750, 902, 0.82, 12);
    this.addRail(150, 904, 282, 842, 0.72, 14);
    this.addRail(750, 904, 618, 842, 0.72, 14);
    this.addRail(214, 790, 334, 704, 0.95, 16, 'slingLeft');
    this.addRail(686, 790, 566, 704, 0.95, 16, 'slingRight');
    this.addRail(306, 688, 450, 810, 1, 13, 'vLeft');
    this.addRail(594, 688, 450, 810, 1, 13, 'vRight');
    this.addRail(244, 760, 350, 824, 0.78, 10);
    this.addRail(656, 760, 550, 824, 0.78, 10);
    this.addRail(386, 880, 444, 923, 0.72, 14);
    this.addRail(514, 880, 456, 923, 0.72, 14);

    this.addRail(TABLE.laneLeft, 132, TABLE.laneLeft, 892, 0.82, 10);
    this.addRail(TABLE.laneRight, 118, TABLE.laneRight, 892, 0.82, 10);
    this.createLaunchCurve();

    this.addRail(236, 278, 316, 352, 0.9, 12);
    this.addRail(664, 278, 584, 352, 0.9, 12);
    this.addRail(254, 446, 336, 404, 0.9, 12);
    this.addRail(646, 446, 564, 404, 0.9, 12);
    this.addRail(258, 666, 334, 708, 0.92, 12);
    this.addRail(642, 666, 566, 708, 0.92, 12);
  }

  addRail(x1, y1, x2, y2, bounce = 0.8, radius = 10, tag = 'wall') {
    const segment = { ax: x1, ay: y1, bx: x2, by: y2, bounce, radius, tag, lastHit: 0 };
    this.segments.push(segment);
    const rail = this.add.graphics();
    segment.flash = rail;
    rail.lineStyle(radius * 2, tag.startsWith('sling') ? 0x20243a : 0x252839, 1);
    rail.beginPath();
    rail.moveTo(x1, y1);
    rail.lineTo(x2, y2);
    rail.strokePath();
    rail.lineStyle(3, tag.startsWith('sling') ? 0xfff0a3 : 0x7f7f95, 0.8);
    rail.beginPath();
    rail.moveTo(x1, y1);
    rail.lineTo(x2, y2);
    rail.strokePath();
  }

  createLaunchCurve() {
    const points = this.quadraticPoints({ x: 836, y: 88 }, { x: 718, y: 72 }, { x: 636, y: 122 }, 12);
    const points2 = this.quadraticPoints({ x: 636, y: 122 }, { x: 584, y: 160 }, { x: 724, y: 260 }, 14);
    this.launchCurve = [...points, ...points2.slice(1)];

    const chute = this.add.graphics().setDepth(6);
    chute.lineStyle(18, 0x20243a, 1);
    this.strokePolyline(chute, this.launchCurve);
    chute.lineStyle(4, 0x9ff6ff, 0.95);
    this.strokePolyline(chute, this.launchCurve);

    for (let i = 0; i < this.launchCurve.length - 1; i += 1) {
      const a = this.launchCurve[i];
      const b = this.launchCurve[i + 1];
      this.addRail(a.x, a.y, b.x, b.y, 0.92, 11, 'launchCurve');
    }
  }

  createBumpers() {
    [
      { x: 367, y: 288, radius: 35, label: '100', color: 0xffe66d },
      { x: 454, y: 254, radius: 36, label: '50', color: 0xf36eb2 },
      { x: 542, y: 318, radius: 32, label: '25', color: 0x7ee6a1 },
      { x: 342, y: 470, radius: 28, label: 'STAR', color: 0xffd24a },
      { x: 456, y: 445, radius: 28, label: 'STAR', color: 0xffd24a },
      { x: 570, y: 470, radius: 28, label: 'STAR', color: 0xffd24a },
      { x: 330, y: 650, radius: 28, label: '2X', color: 0xffd24a },
      { x: 570, y: 650, radius: 28, label: '2X', color: 0xffd24a }
    ].forEach((bumper) => {
      const view = this.drawBumper(bumper);
      this.bumpers.push({ ...bumper, hitAt: 0, view, baseScale: 1 });
    });
  }

  drawBumper({ x, y, radius, label, color }) {
    const group = this.add.container(x, y).setDepth(4);
    const g = this.add.graphics();
    g.fillStyle(0x2c2862, 1);
    g.fillCircle(0, 0, radius + 7);
    for (let i = 0; i < 12; i += 1) {
      const angle = (Math.PI * 2 * i) / 12;
      g.lineStyle(5, color, 1);
      g.beginPath();
      g.moveTo(Math.cos(angle) * (radius - 4), Math.sin(angle) * (radius - 4));
      g.lineTo(Math.cos(angle) * (radius + 9), Math.sin(angle) * (radius + 9));
      g.strokePath();
    }
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, radius);
    g.fillStyle(0xffffff, 0.82);
    g.fillCircle(0, 0, radius - 10);
    const text = this.add.text(0, 0, label, {
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize: label.length > 3 ? '10px' : '13px',
      color: '#59418a'
    }).setOrigin(0.5);
    const glow = this.add.circle(0, 0, radius + 18, color, 0).setBlendMode(Phaser.BlendModes.ADD);
    group.add([glow, g, text]);
    group.glow = glow;
    group.gear = g;
    return group;
  }

  createRollovers() {
    const points = [
      [334, 88, 'A'],
      [390, 80, 'B'],
      [450, 82, 'C'],
      [510, 80, 'D'],
      [566, 88, 'E']
    ];

    this.rolloverGraphics = new Map();
    points.forEach(([x, y, label]) => {
      this.sensors.push({ x, y, radius: 16, label: `rollover:${label}`, lit: false, hitAt: 0 });
      const group = this.add.container(x, y).setDepth(4);
      const ring = this.add.circle(0, 0, 13, 0x4bd47f, 1).setStrokeStyle(3, 0xffffff, 0.55);
      const text = this.add.text(0, 30, label, {
        fontFamily: 'Arial Black, Impact, sans-serif',
        fontSize: '12px',
        color: '#f7f1ff'
      }).setOrigin(0.5);
      group.add([ring, text]);
      this.rolloverGraphics.set(label, ring);
    });
  }

  createTargets() {
    const targets = [
      [300, 155, -90, 'JACKPOT'],
      [388, 160, -90, 'BONUS'],
      [512, 160, -90, 'BONUS'],
      [602, 155, -90, 'JACKPOT'],
      [188, 292, 0, 'L'],
      [712, 292, 0, 'R'],
      [222, 496, 0, 'KICK'],
      [680, 496, 0, 'KICK'],
      [386, 722, 0, '1'],
      [514, 722, 0, '2']
    ];

    this.targetViews = new Map();
    targets.forEach(([x, y, angle, label]) => {
      this.sensors.push({ x, y, radius: 21, label: `target:${label}:${x}:${y}`, lit: false, hitAt: 0 });
      const view = this.add.container(x, y).setDepth(5).setRotation(Phaser.Math.DegToRad(angle));
      const body = this.add.rectangle(0, 0, 20, 48, 0xfff2a6, 1)
        .setStrokeStyle(3, 0x6c5fc3, 1);
      const text = this.add.text(0, 0, label, {
        fontFamily: 'Arial Black, Impact, sans-serif',
        fontSize: '8px',
        color: '#513b7f'
      }).setOrigin(0.5).setRotation(Phaser.Math.DegToRad(90));
      view.add([body, text]);
      this.targetViews.set(`target:${label}:${x}:${y}`, body);
    });

    [
      [270, 220, -40],
      [630, 220, 40],
      [290, 735, 35],
      [610, 735, -35]
    ].forEach(([x, y, angle]) => {
      this.add.image(x, y, 'laneRubber').setAngle(angle).setDepth(4);
    });
  }

  createMovingDetails() {
    const spinner = this.add.container(450, 374).setDepth(5);
    const blades = this.add.graphics();
    blades.lineStyle(7, 0x8ff5ff, 0.85);
    for (let i = 0; i < 3; i += 1) {
      const angle = (Math.PI * 2 * i) / 3;
      blades.beginPath();
      blades.moveTo(Math.cos(angle) * 12, Math.sin(angle) * 12);
      blades.lineTo(Math.cos(angle) * 48, Math.sin(angle) * 48);
      blades.strokePath();
    }
    spinner.add([this.add.circle(0, 0, 14, 0xfff0a3, 1), blades]);
    this.movers.push({ type: 'spin', node: spinner, speed: 0.45 });

    [
      { x: 298, y: 598, dx: 32, color: 0x8ff5ff },
      { x: 602, y: 598, dx: -32, color: 0xff9ed1 },
      { x: 450, y: 690, dx: 42, color: 0xfff0a3 }
    ].forEach((data, index) => {
      const orb = this.add.circle(data.x, data.y, 7, data.color, 1)
        .setStrokeStyle(2, 0xffffff, 0.75)
        .setDepth(6);
      this.movers.push({ type: 'bob', node: orb, baseX: data.x, baseY: data.y, dx: data.dx, phase: index * 1.8 });
    });
  }

  createFlippers() {
    this.flippers = {
      left: this.createFlipper(342, 844, -14, -58, 'left'),
      right: this.createFlipper(558, 844, 194, 238, 'right')
    };
  }

  createFlipper(px, py, restDeg, activeDeg, side) {
    const sprite = this.add.image(px, py, 'flipper')
      .setOrigin(side === 'left' ? 0.1 : 0.9, 0.5)
      .setDepth(8);
    const flipper = {
      px,
      py,
      length: 132,
      radius: 15,
      angle: Phaser.Math.DegToRad(restDeg),
      rest: Phaser.Math.DegToRad(restDeg),
      active: Phaser.Math.DegToRad(activeDeg),
      side,
      sprite,
      wasActive: false
    };
    sprite.setRotation(flipper.angle);
    this.add.circle(px, py, 16, 0x53448f, 1).setStrokeStyle(4, 0xf6f0ff, 0.8).setDepth(9);
    return flipper;
  }

  createPlunger() {
    const g = this.add.graphics().setDepth(5);
    g.fillStyle(0x171923, 1);
    g.fillRoundedRect(TABLE.laneLeft + 14, 718, 38, 178, 18);
    g.lineStyle(4, 0xbfc4ce, 1);
    g.strokeRoundedRect(TABLE.laneLeft + 14, 718, 38, 178, 18);

    for (let i = 0; i < 6; i += 1) {
      this.add.triangle(800, 336 + i * 30, 0, 18, 18, 18, 9, 0, 0xffd34f, 1)
        .setStrokeStyle(2, 0xffffff, 0.55)
        .setDepth(5);
    }

    this.plungerSpring = this.add.graphics().setDepth(6);
    this.plungerKnob = this.add.circle(812, 956, 12, 0xc33135, 1)
      .setStrokeStyle(3, 0x7a1518, 1)
      .setDepth(7);
    this.drawPlungerSpring();
  }

  drawPlungerSpring() {
    this.plungerSpring.clear();
    this.plungerSpring.lineStyle(4, 0xf0f2f5, 1);
    const x = 813;
    const top = 742;
    const bottom = 872 + this.plungerPower * 42;
    this.plungerSpring.beginPath();
    this.plungerSpring.moveTo(x, top);
    for (let y = top; y <= bottom; y += 10) {
      this.plungerSpring.lineTo(x + (Math.floor((y - top) / 10) % 2 ? 12 : -12), y);
    }
    this.plungerSpring.strokePath();
    this.plungerKnob.y = 956 + this.plungerPower * 22;
  }

  createBall() {
    this.ball = {
      x: 812,
      y: 842,
      vx: 0,
      vy: 0,
      radius: BALL_RADIUS,
      locked: true
    };
    this.ballSprite = this.add.image(this.ball.x, this.ball.y, 'ball').setDepth(12);
  }

  createHud() {
    const panel = this.add.rectangle(450, 978, 650, 36, 0x151821, 1)
      .setStrokeStyle(3, 0x7f7f95, 1)
      .setDepth(20);
    this.scoreText = this.add.text(panel.x - 306, 964, '', {
      fontFamily: 'Courier New, monospace',
      fontSize: '18px',
      color: '#fff3a5'
    }).setDepth(21);
    this.ballText = this.add.text(450, 964, '', {
      fontFamily: 'Courier New, monospace',
      fontSize: '18px',
      color: '#8ff5ff'
    }).setOrigin(0.5, 0).setDepth(21);
    this.highText = this.add.text(panel.x + 306, 964, '', {
      fontFamily: 'Courier New, monospace',
      fontSize: '18px',
      color: '#f8a0ce',
      align: 'right'
    }).setOrigin(1, 0).setDepth(21);
  }

  createInput() {
    this.keys = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      r: Phaser.Input.Keyboard.KeyCodes.R
    });

    this.input.keyboard.on('keydown', () => this.synth.boot());
    this.input.on('pointerdown', (pointer) => {
      this.synth.boot();
      const gameX = pointer.worldX ?? pointer.x;
      this.touchLeft = gameX < WIDTH * 0.5;
      this.touchRight = gameX >= WIDTH * 0.5;
    });
    this.input.on('pointerup', () => {
      this.touchLeft = false;
      this.touchRight = false;
      this.releasePlunger();
    });
  }

  update(time, deltaMs) {
    const dt = Math.min(deltaMs / 1000, 1 / 30);
    const leftActive = this.touchLeft || this.keys.left.isDown || this.keys.a.isDown;
    const rightActive = this.touchRight || this.keys.right.isDown || this.keys.d.isDown;

    this.updateFlipper(this.flippers.left, leftActive, dt);
    this.updateFlipper(this.flippers.right, rightActive, dt);
    this.updatePlunger(dt);
    this.updateMovingDetails(time / 1000);

    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) this.restartGame();

    const steps = 4;
    for (let i = 0; i < steps; i += 1) {
      this.stepBall(dt / steps);
    }

    this.checkSensors();
    this.ballSprite.setPosition(this.ball.x, this.ball.y);
    this.ballSprite.rotation += (this.ball.vx * dt) / 20;

    if (this.ball.y > HEIGHT + 30) this.drainBall();
  }

  updateMovingDetails(time) {
    this.movers.forEach((mover) => {
      if (mover.type === 'spin') {
        mover.node.rotation += mover.speed * 0.016;
      }
      if (mover.type === 'bob') {
        mover.node.x = mover.baseX + Math.sin(time * 0.9 + mover.phase) * mover.dx;
        mover.node.y = mover.baseY + Math.cos(time * 0.7 + mover.phase) * 8;
      }
    });

    this.bumpers.forEach((bumper, index) => {
      bumper.view.gear.rotation += 0.006 + index * 0.0007;
    });
  }

  updateFlipper(flipper, active, dt) {
    const target = active ? flipper.active : flipper.rest;
    flipper.angle = Phaser.Math.Angle.RotateTo(flipper.angle, target, dt * 18);
    flipper.sprite.setRotation(flipper.angle);
    if (active && !flipper.wasActive) {
      this.synth.flip();
      flipper.kickTimer = 0.11;
    }
    flipper.wasActive = active;
    flipper.kickTimer = Math.max(0, (flipper.kickTimer || 0) - dt);
  }

  updatePlunger(dt) {
    const charging = this.keys.space.isDown || this.keys.enter.isDown;
    const inLane = this.ball.x > TABLE.laneLeft && this.ball.x < TABLE.laneRight && this.ball.y > 720;
    if (charging && inLane) {
      this.ball.locked = true;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.x = 812;
      this.ball.y = 842;
      this.plungerPower = clamp(this.plungerPower + dt * 0.95, 0, 1);
      this.drawPlungerSpring();
    } else if (this.plungerPower > 0 && !charging) {
      this.releasePlunger();
    }
  }

  releasePlunger() {
    if (this.plungerPower <= 0) return;
    this.ball.locked = false;
    this.ball.vx = -55 - this.plungerPower * 80;
    this.ball.vy = -930 - this.plungerPower * 560;
    this.synth.launch();
    this.plungerPower = 0;
    this.drawPlungerSpring();
  }

  stepBall(dt) {
    if (this.ball.locked) return;
    this.ball.vy += 900 * dt;
    this.ball.vx *= 0.999;
    this.ball.vy *= 0.999;
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;

    if (this.ball.x > TABLE.laneLeft - 6 && this.ball.y < 720 && this.ball.vy < -80) {
      const target = this.pointOnLaunchCurve(clamp((720 - this.ball.y) / 635, 0.45, 1));
      this.ball.x = target.x;
      this.ball.y = target.y;
      this.ball.vx = -760;
      this.ball.vy = 18;
      this.flashAt(target.x, target.y, 56, 0x8ff5ff);
    }

    this.segments.forEach((segment) => this.collideSegment(segment));
    Object.values(this.flippers).forEach((flipper) => this.collideFlipper(flipper));
    this.bumpers.forEach((bumper) => this.collideBumper(bumper));

    const speed = Math.hypot(this.ball.vx, this.ball.vy);
    if (speed > 1550) {
      this.ball.vx = (this.ball.vx / speed) * 1550;
      this.ball.vy = (this.ball.vy / speed) * 1550;
    }

    if (this.ball.y > TABLE.bottom + 28 && this.ball.x > 360 && this.ball.x < 540) {
      this.ball.y = HEIGHT + 40;
    }
    if (this.ball.y > TABLE.bottom + 18 && this.ball.x > TABLE.laneLeft) {
      this.ball.y = HEIGHT + 40;
    }
  }

  collideSegment(segment) {
    const hit = this.closestPointOnSegment(this.ball.x, this.ball.y, segment.ax, segment.ay, segment.bx, segment.by);
    const minDistance = this.ball.radius + segment.radius;
    const dx = this.ball.x - hit.x;
    const dy = this.ball.y - hit.y;
    const distance = Math.hypot(dx, dy) || 0.0001;
    if (distance >= minDistance) return;

    const nx = dx / distance;
    const ny = dy / distance;
    const penetration = minDistance - distance;
    this.ball.x += nx * penetration;
    this.ball.y += ny * penetration;
    this.reflectVelocity(nx, ny, segment.bounce);
    if (this.time.now - segment.lastHit > 80) {
      segment.lastHit = this.time.now;
      this.flashRail(segment);
      this.flashAt(hit.x, hit.y, 34, segment.tag === 'launchCurve' ? 0x8ff5ff : 0xfff0a3);
    }

    if (segment.tag === 'slingLeft') {
      this.ball.vx += 170;
      this.ball.vy -= 260;
      this.addScore(150);
    }
    if (segment.tag === 'slingRight') {
      this.ball.vx -= 170;
      this.ball.vy -= 260;
      this.addScore(150);
    }
  }

  collideFlipper(flipper) {
    const tip = {
      x: flipper.px + Math.cos(flipper.angle) * flipper.length,
      y: flipper.py + Math.sin(flipper.angle) * flipper.length
    };
    const hit = this.closestPointOnSegment(this.ball.x, this.ball.y, flipper.px, flipper.py, tip.x, tip.y);
    const minDistance = this.ball.radius + flipper.radius;
    const dx = this.ball.x - hit.x;
    const dy = this.ball.y - hit.y;
    const distance = Math.hypot(dx, dy) || 0.0001;
    if (distance >= minDistance) return;

    const nx = dx / distance;
    const ny = dy / distance;
    this.ball.x += nx * (minDistance - distance);
    this.ball.y += ny * (minDistance - distance);
    this.reflectVelocity(nx, ny, 0.9);
    this.flashObject(flipper.sprite, 0xfff0a3);

    if (flipper.kickTimer > 0 || flipper.wasActive) {
      const side = flipper.side === 'left' ? 1 : -1;
      this.ball.vx += side * 390;
      this.ball.vy -= 760;
      this.addScore(20);
    }
  }

  collideBumper(bumper) {
    const dx = this.ball.x - bumper.x;
    const dy = this.ball.y - bumper.y;
    const minDistance = this.ball.radius + bumper.radius;
    const distance = Math.hypot(dx, dy) || 0.0001;
    if (distance >= minDistance) return;

    const nx = dx / distance;
    const ny = dy / distance;
    this.ball.x += nx * (minDistance - distance);
    this.ball.y += ny * (minDistance - distance);
    this.reflectVelocity(nx, ny, 1.05);
    this.ball.vx += nx * 420;
    this.ball.vy += ny * 420;

    if (this.time.now - bumper.hitAt > 90) {
      bumper.hitAt = this.time.now;
      this.addScore(bumper.label === 'STAR' ? 250 : Number.parseInt(bumper.label, 10) * 10);
      this.synth.bumper();
      this.flashAt(bumper.x, bumper.y, bumper.radius + 35, bumper.color);
      this.flashObject(bumper.view, bumper.color);
    }
  }

  reflectVelocity(nx, ny, bounce) {
    const dot = this.ball.vx * nx + this.ball.vy * ny;
    if (dot >= 0) return;
    this.ball.vx -= (1 + bounce) * dot * nx;
    this.ball.vy -= (1 + bounce) * dot * ny;
    const tx = -ny;
    const ty = nx;
    const tangent = this.ball.vx * tx + this.ball.vy * ty;
    this.ball.vx = this.ball.vx * 0.992 + tx * tangent * 0.008;
    this.ball.vy = this.ball.vy * 0.992 + ty * tangent * 0.008;
  }

  checkSensors() {
    this.sensors.forEach((sensor) => {
      const distance = Phaser.Math.Distance.Between(this.ball.x, this.ball.y, sensor.x, sensor.y);
      if (distance > this.ball.radius + sensor.radius) return;
      if (this.time.now - sensor.hitAt < 170) return;
      sensor.hitAt = this.time.now;

      if (sensor.label.startsWith('rollover:')) {
        const label = sensor.label.replace('rollover:', '');
        this.flashObject(this.rolloverGraphics.get(label), 0xffef7a);
        this.flashAt(sensor.x, sensor.y, 30, 0xffef7a);
        if (!sensor.lit) {
          sensor.lit = true;
          this.rolloversLit.add(label);
          this.addScore(800);
        } else {
          this.addScore(80);
        }
        this.rolloverGraphics.get(label)?.setFillStyle(0xffef7a, 1);
        this.time.delayedCall(140, () => {
          this.rolloverGraphics.get(label)?.setFillStyle(sensor.lit ? 0x78f0a0 : 0x4bd47f, 1);
        });
        if (this.rolloversLit.size === 5) {
          this.multiplier = Math.min(5, this.multiplier + 1);
          this.addScore(5000);
          this.synth.award();
        }
      }

      if (sensor.label.startsWith('target:')) {
        const target = this.targetViews.get(sensor.label);
        target?.setFillStyle(0x78f0a0, 1);
        this.flashObject(target, 0x78f0a0);
        this.flashAt(sensor.x, sensor.y, 32, 0x78f0a0);
        this.time.delayedCall(120, () => {
          target?.setFillStyle(0xfff2a6, 1);
        });
        if (!sensor.lit) {
          sensor.lit = true;
          this.targetsLit.add(sensor.label);
          this.addScore(1200);
          this.synth.award();
        } else {
          this.addScore(160);
        }
      }
    });
  }

  closestPointOnSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const t = clamp(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby), 0, 1);
    return { x: ax + abx * t, y: ay + aby * t };
  }

  addScore(amount) {
    this.score += amount * this.multiplier;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('neoPinballHighScore', String(this.highScore));
    }
    this.updateHud();
  }

  updateHud() {
    this.scoreText.setText(`SCORE ${String(this.score).padStart(8, '0')}  X${this.multiplier}`);
    this.ballText.setText(`BALLS ${this.balls}`);
    this.highText.setText(`HIGH ${String(this.highScore).padStart(8, '0')}`);
  }

  drainBall() {
    this.synth.drain();
    this.balls -= 1;
    this.multiplier = 1;
    if (this.balls <= 0) {
      this.showGameOver();
      return;
    }
    this.resetBall();
    this.updateHud();
  }

  resetBall() {
    this.ball.x = 812;
    this.ball.y = 842;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.locked = true;
    this.plungerPower = 0;
    this.drawPlungerSpring();
  }

  restartGame() {
    this.score = 0;
    this.balls = 3;
    this.multiplier = 1;
    this.targetsLit.clear();
    this.rolloversLit.clear();
    this.sensors.forEach((sensor) => {
      sensor.lit = false;
    });
    this.rolloverGraphics.forEach((ring) => ring.setFillStyle(0x4bd47f, 1));
    this.targetViews.forEach((target) => target.setFillStyle(0xfff2a6, 1));
    this.gameOverGroup?.destroy(true);
    this.resetBall();
    this.updateHud();
  }

  showGameOver() {
    this.gameOverGroup?.destroy(true);
    this.gameOverGroup = this.add.container(450, 498).setDepth(30);
    const panel = this.add.rectangle(0, 0, 430, 180, 0x201c3f, 0.96)
      .setStrokeStyle(5, 0xfff0a3, 1);
    const title = this.add.text(0, -52, 'GAME OVER', {
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize: '34px',
      color: '#ffffff'
    }).setOrigin(0.5);
    const score = this.add.text(0, 6, `Score ${this.score.toLocaleString('es-MX')}`, {
      fontFamily: 'Arial Black, Impact, sans-serif',
      fontSize: '20px',
      color: '#8ff5ff'
    }).setOrigin(0.5);
    const hint = this.add.text(0, 56, 'Pulsa R para reiniciar', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      color: '#fff0a3'
    }).setOrigin(0.5);
    this.gameOverGroup.add([panel, title, score, hint]);
  }

  flashAt(x, y, radius, color) {
    const flash = this.add.circle(x, y, 10, color, 0.48).setDepth(14);
    this.tweens.add({
      targets: flash,
      radius,
      alpha: 0,
      duration: 280,
      ease: 'Quad.Out',
      onComplete: () => flash.destroy()
    });
  }

  flashObject(target, color = 0xffffff) {
    if (!target) return;
    if (target.glow) {
      target.glow.setFillStyle(color, 0.65);
      this.tweens.add({
        targets: target.glow,
        alpha: 0,
        duration: 180,
        yoyo: true,
        repeat: 1,
        onComplete: () => target.glow.setAlpha(0)
      });
    }
    this.tweens.add({
      targets: target,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 48,
      yoyo: true,
      repeat: 1,
      ease: 'Quad.Out'
    });
  }

  flashRail(segment) {
    const glow = this.add.graphics().setDepth(13);
    glow.lineStyle(segment.radius * 2 + 8, 0xfff0a3, 0.72);
    glow.beginPath();
    glow.moveTo(segment.ax, segment.ay);
    glow.lineTo(segment.bx, segment.by);
    glow.strokePath();
    this.tweens.add({
      targets: glow,
      alpha: 0,
      duration: 130,
      yoyo: true,
      repeat: 1,
      onComplete: () => glow.destroy()
    });
  }

  pointOnLaunchCurve(t) {
    if (!this.launchCurve.length) return { x: 724, y: 260 };
    const index = Math.floor(t * (this.launchCurve.length - 1));
    return this.launchCurve[index];
  }

  quadraticPoints(start, control, end, steps) {
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const inv = 1 - t;
      points.push({
        x: inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
        y: inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y
      });
    }
    return points;
  }

  strokePolyline(graphics, points) {
    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
    graphics.strokePath();
  }

  strokeArc(graphics, x, y, radius, startDeg, endDeg, steps) {
    graphics.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const angle = Phaser.Math.DegToRad(startDeg + ((endDeg - startDeg) * i) / steps);
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) graphics.moveTo(px, py);
      else graphics.lineTo(px, py);
    }
    graphics.strokePath();
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'app',
  width: WIDTH,
  height: HEIGHT,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: PinballScene
};

new Phaser.Game(config);
