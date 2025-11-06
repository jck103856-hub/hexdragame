// Hex Drag Sum – Phaser.js 포팅 (룰/색감/배치 그대로)
(() => {
  const WIDTH = 800, HEIGHT = 600;
  const COLORS = {
    WHITE: 0xffffff,
    GRAY: 0xb4b4b4,
    BLACK: 0x000000,
    YELLOW: 0xffe664,
    BLUE: 0x50a0ff,
    RED: 0xff3c3c
  };

  // 폰트는 CanvasText로 렌더 (Phaser 기본 텍스트)
  const FONT = { fontFamily: 'Arial', fontSize: '24px', fontStyle: 'bold', color: '#000000' };

  // 보드/헥사 설정 (pygame 버전과 동일)
  const HEX_RADIUS = 35;
  const ROWS = 6, COLS = 12;
  const HEX_H = Math.sqrt(3) * HEX_RADIUS;
  const board_w = COLS * (HEX_RADIUS * 1.5) + HEX_RADIUS / 2;
  const board_h = ROWS * HEX_H + HEX_H / 2;
  const start_x = (WIDTH - board_w) / 2 + HEX_RADIUS;
  const start_y = (HEIGHT - board_h) / 2 + 80;

  // 상단 목표 숫자 UI
  const target_w = 85, target_h = 65, gap = 8;
  const targets_sx = Math.floor((WIDTH - (8 * target_w + 7 * gap)) / 2) + 30;
  const targets_sy = 40;

  // 유틸
  const hexCenter = (r, c) => {
    const x = start_x + c * HEX_RADIUS * 1.5;
    const y = start_y + r * HEX_H + ((c % 2 === 1) ? HEX_H / 2 : 0);
    return { x, y };
  };

  const hexCorners = (cx, cy) => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 180) * (60 * i);
      pts.push({ x: cx + HEX_RADIUS * Math.cos(ang), y: cy + HEX_RADIUS * Math.sin(ang) });
    }
    return pts;
  };

  const pointInPolygon = (px, py, poly) => {
    // ray casting
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
                        (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const pixelToCell = (mx, my) => {
    const est_c = Math.floor((mx - start_x) / (HEX_RADIUS * 1.5));
    const cand = [];
    for (let c = Math.max(0, est_c - 2); c < Math.min(COLS, est_c + 3); c++) {
      const base_y = start_y + ((c % 2 === 1) ? HEX_H / 2 : 0);
      const est_r = Math.floor((my - base_y) / HEX_H);
      for (let r = Math.max(0, est_r - 2); r < Math.min(ROWS, est_r + 3); r++) {
        const { x: cx, y: cy } = hexCenter(r, c);
        const poly = hexCorners(cx, cy);
        if (pointInPolygon(mx, my, poly)) return { r, c };
        const d = Math.hypot(mx - cx, my - cy);
        cand.push({ d, r, c });
      }
    }
    if (cand.length) {
      cand.sort((a, b) => a.d - b.d);
      const head = cand[0];
      if (head.d <= HEX_RADIUS * 0.9) return { r: head.r, c: head.c };
    }
    return null;
  };

  // odd-q <-> cube 좌표
  const oddq_to_cube = (r, c) => {
    const x = c;
    const z = r - ((c - (c & 1)) >> 1);
    const y = -x - z;
    return { x, y, z };
  };
  const cube_to_oddq = (x, y, z) => {
    const c = x;
    const r = z + ((x - (x & 1)) >> 1);
    return { r, c };
  };
  const cube_lerp = (A, B, t) => ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, z: A.z + (B.z - A.z) * t });
  const cube_round = (x, y, z) => {
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { x: rx, y: ry, z: rz };
  };
  const hex_linedraw = (a, b) => {
    const A = oddq_to_cube(a.r, a.c);
    const B = oddq_to_cube(b.r, b.c);
    const N = Math.max(1, Math.abs(A.x - B.x) + Math.abs(A.y - B.y) + Math.abs(A.z - B.z));
    const path = [];
    for (let i = 0; i <= N; i++) {
      const t = i / Math.max(1, N);
      const L = cube_lerp(A, B, t);
      const R = cube_round(L.x, L.y, L.z);
      const { r, c } = cube_to_oddq(R.x, R.y, R.z);
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
        const last = path[path.length - 1];
        if (!last || last.r !== r || last.c !== c) path.push({ r, c });
      }
    }
    return path;
  };
  const is_neighbor = (r1, c1, r2, c2) => {
    const A = oddq_to_cube(r1, c1);
    const B = oddq_to_cube(r2, c2);
    const dist = Math.max(Math.abs(A.x - B.x), Math.abs(A.y - B.y), Math.abs(A.z - B.z));
    return dist === 1;
  };

  // Phaser Scene
  class MainScene extends Phaser.Scene {
    constructor() { super('main'); }

    init() {
      // 게임 상태
      this.board = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => Phaser.Math.Between(1, 10)));
      this.targets = Array.from({ length: 8 }, () => Phaser.Math.Between(5, 50));
      this.score = 0;

      this.selected = []; // [{r,c}, ...]
      this.dragging = false;

      // 타이머
      this.startTime = this.time.now; // ms
      this.limitSec = 60;
      this.gameOver = false;
    }

    preload() {}

    create() {
      // 입력
      this.input.on('pointerdown', (p) => {
        if (this.gameOver) return;
        this.dragging = true;
        this.selected = [];
        const cell = pixelToCell(p.x, p.y);
        if (cell) this.selected.push(cell);
      });

      this.input.on('pointerup', (p) => {
        if (this.gameOver) return;
        if (this.dragging && this.selected.length > 0) {
          this.dragging = false;
          const vals = this.selected.map(({ r, c }) => this.board[r][c]);
          const total = vals.reduce((a, b) => a + b, 0);
          const hitIdx = this.targets.indexOf(total);
          if (hitIdx !== -1) {
            this.score += total;
            // 리필
            for (const { r, c } of this.selected) {
              this.board[r][c] = Phaser.Math.Between(1, 10);
            }
            this.targets[hitIdx] = Phaser.Math.Between(5, 50);
          }
          this.selected = [];
        }
      });
    }

    update() {
      // 드래그 처리
      if (this.dragging && !this.gameOver && this.selected.length > 0) {
        const p = this.input.activePointer;
        const cur = pixelToCell(p.x, p.y);
        if (cur && (cur.r !== this.selected[this.selected.length - 1].r || cur.c !== this.selected[this.selected.length - 1].c)) {
          let last = this.selected[this.selected.length - 1];
          const path = hex_linedraw(last, cur);
          for (let i = 1; i < path.length; i++) {
            const cell = path[i];
            // 이미 선택된 칸은 무시
            if (this.selected.find(s => s.r === cell.r && s.c === cell.c)) continue;
            // 마지막 기준 인접 칸만 허용
            if (is_neighbor(last.r, last.c, cell.r, cell.c)) {
              this.selected.push(cell);
              last = cell;
            } else {
              break;
            }
          }
        }
      }

      // 타이머 처리
      if (!this.gameOver) {
        const elapsedSec = Math.floor((this.time.now - this.startTime) / 1000);
        this.timeLeft = Math.max(0, this.limitSec - elapsedSec);
        if (this.timeLeft <= 0) this.gameOver = true;
      }

      // 렌더링
      this.cameras.main.setBackgroundColor(COLORS.WHITE);
      this.drawScene();
    }

    drawScene() {
      // 모든 기존 Graphics/Text 지우고 다시 그림
      this.children.removeAll();

      // 상단 Score/Time
      this.add.text(30, 20, `SCORE: ${this.score}`, FONT);
      this.add.text(WIDTH - 150, 20, `TIME: ${String(this.timeLeft ?? this.limitSec).padStart(2, '0')}s`, FONT);

      // 상단 목표 숫자 8칸
      for (let i = 0; i < 8; i++) {
        const x = targets_sx + i * (target_w + gap);
        const y = targets_sy;
        const g = this.add.graphics();
        g.lineStyle(2, COLORS.GRAY, 1);
        g.strokeRect(x, y, target_w, target_h);
        this.add.text(x + target_w / 2, y + target_h / 2, String(this.targets[i]), {
          ...FONT, color: '#000000', align: 'center'
        }).setOrigin(0.5);
      }

      // 보드 타일
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const { x: cx, y: cy } = hexCenter(r, c);
          const corners = hexCorners(cx, cy);
          const g = this.add.graphics();

          // 선택 상태에 따라 테두리/채움
          const inSel = this.selected.find(s => s.r === r && s.c === c);
          if (inSel) {
            // 채움
            g.fillStyle(COLORS.YELLOW, 1).beginPath();
            g.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < corners.length; i++) g.lineTo(corners[i].x, corners[i].y);
            g.closePath().fillPath();
            // 테두리
            const isLast = (this.selected.length > 0 && this.selected[this.selected.length - 1].r === r && this.selected[this.selected.length - 1].c === c);
            g.lineStyle(4, isLast ? COLORS.RED : COLORS.BLUE, 1).beginPath();
            g.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < corners.length; i++) g.lineTo(corners[i].x, corners[i].y);
            g.closePath().strokePath();
          } else {
            g.lineStyle(2, COLORS.GRAY, 1).beginPath();
            g.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < corners.length; i++) g.lineTo(corners[i].x, corners[i].y);
            g.closePath().strokePath();
          }

          // 숫자
          this.add.text(cx, cy, String(this.board[r][c]), FONT).setOrigin(0.5);
        }
      }

      // 게임 오버 오버레이
      if (this.gameOver) {
        const overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, COLORS.WHITE, 0.92);
        const over = this.add.text(WIDTH / 2, HEIGHT / 2 - 60, 'TIME UP!', {
          fontFamily: 'Arial', fontSize: '48px', fontStyle: 'bold', color: '#000000'
        }).setOrigin(0.5);
        const final = this.add.text(WIDTH / 2, HEIGHT / 2, `Final Score: ${this.score}`, FONT).setOrigin(0.5);

        const btn = this.add.rectangle(WIDTH / 2, HEIGHT / 2 + 40, 140, 50)
          .setStrokeStyle(2, COLORS.GRAY)
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true });
        const btnText = this.add.text(WIDTH / 2, HEIGHT / 2 + 40, 'Restart', FONT).setOrigin(0.5);

        btn.on('pointerdown', () => {
          // 리셋 (룰/UI 그대로)
          this.board = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => Phaser.Math.Between(1, 10)));
          this.targets = Array.from({ length: 8 }, () => Phaser.Math.Between(5, 50));
          this.score = 0;
          this.selected = [];
          this.dragging = false;
          this.startTime = this.time.now;
          this.gameOver = false;
        });
      }
    }
  }

  const config = {
    type: Phaser.AUTO,
    parent: 'game-root',
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: '#ffffff',
    scene: [MainScene]
  };

  new Phaser.Game(config);
})();