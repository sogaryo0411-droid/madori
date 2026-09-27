// 縮尺設定。
// 横 → 縦 の順に「長さが分かっている2点」をタップして実寸(mm)を入力し、1pxあたりのmmを求める。
//  - 横のときは水平、縦のときは垂直にスナップ
//  - 端点はドラッグで微調整でき、ドラッグ中はルーペで拡大表示
//  - 横と縦の縮尺差が WARN_RATIO 以上なら警告

export const WARN_RATIO = 0.03;
const HANDLE_R = 22; // 画面上の半径(px)。指で掴める大きさ
const COLOR = '#e5484d';

/**
 * @param vp viewport
 * @param ui {
 *   getImageElement(): HTMLImageElement,
 *   loupe: HTMLCanvasElement,
 *   onUpdate({ axis, count }): 表示の更新,
 *   onDone({ h, v, mmPerPx, diff }): 2軸とも確定した
 * }
 */
export function createCalibration(vp, ui) {
  const layer = vp.layers.ui;
  let active = false;
  let axis = 'h';
  let handles = [];
  let line = null;
  const results = { h: null, v: null };

  function update() {
    layer.batchDraw();
    ui.onUpdate({ axis, count: handles.length });
  }

  function clearMarks() {
    handles.forEach((h) => h.destroy());
    handles = [];
    if (line) line.destroy();
    line = null;
  }

  function beginAxis(a) {
    axis = a;
    clearMarks();
    update();
  }

  function makeHandle(pos) {
    const s = 1 / vp.scale;
    const g = new Konva.Group({ x: pos.x, y: pos.y, draggable: true, scaleX: s, scaleY: s });
    g.add(
      new Konva.Circle({ radius: HANDLE_R, fill: 'rgba(229,72,77,0.15)', stroke: COLOR, strokeWidth: 2 }),
      new Konva.Line({ points: [-HANDLE_R - 6, 0, HANDLE_R + 6, 0], stroke: COLOR, strokeWidth: 1 }),
      new Konva.Line({ points: [0, -HANDLE_R - 6, 0, HANDLE_R + 6], stroke: COLOR, strokeWidth: 1 })
    );
    g.on('dragmove', () => {
      const other = handles.find((h) => h !== g);
      // 相手の端点も動かして、線を水平/垂直に保つ
      if (other) {
        if (axis === 'h') other.y(g.y());
        else other.x(g.x());
      }
      redrawLine();
      showLoupe(g);
    });
    g.on('dragend', () => hideLoupe());
    g.on('mouseenter', () => (vp.stage.container().style.cursor = 'grab'));
    g.on('mouseleave', () => (vp.stage.container().style.cursor = ''));
    return g;
  }

  function redrawLine() {
    if (handles.length < 2) return;
    const [a, b] = handles;
    if (!line) {
      line = new Konva.Line({ stroke: COLOR, strokeWidth: 2, strokeScaleEnabled: false, listening: false, dash: [8, 4] });
      layer.add(line);
      line.moveToBottom();
    }
    line.points([a.x(), a.y(), b.x(), b.y()]);
  }

  // ---------- ルーペ ----------
  function showLoupe(handle) {
    const img = ui.getImageElement();
    const cv = ui.loupe;
    if (!img || !cv) return;
    const size = cv.width; // 実ピクセル
    const cssSize = cv.clientWidth || size / 2;
    // 画面表示の3倍で拡大
    const src = cssSize / (vp.scale * 3);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, handle.x() - src / 2, handle.y() - src / 2, src, src, 0, 0, size, size);
    ctx.strokeStyle = COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
    // 指と反対側の上隅に出す
    const screenX = handle.getAbsolutePosition().x;
    cv.classList.toggle('right', screenX < vp.stage.width() / 2);
    cv.hidden = false;
  }
  function hideLoupe() {
    if (ui.loupe) ui.loupe.hidden = true;
  }

  vp.onZoom((s) => {
    handles.forEach((h) => h.scale({ x: 1 / s, y: 1 / s }));
  });

  return {
    get active() {
      return active;
    },
    get axis() {
      return axis;
    },
    start() {
      active = true;
      results.h = results.v = null;
      beginAxis('h');
    },
    cancel() {
      active = false;
      clearMarks();
      hideLoupe();
      layer.batchDraw();
    },
    /** 今の軸をやり直す */
    retry() {
      beginAxis(axis);
    },
    /** 画面タップ。端点を置いたら true */
    tap(world) {
      if (!active || !world || handles.length >= 2) return false;
      let pos = world;
      if (handles.length === 1) {
        const first = handles[0];
        pos = axis === 'h' ? { x: world.x, y: first.y() } : { x: first.x(), y: world.y };
      }
      const h = makeHandle(pos);
      layer.add(h);
      handles.push(h);
      redrawLine();
      update();
      return true;
    },
    /** 今の2点の距離(px) */
    pxLength() {
      if (handles.length < 2) return 0;
      const [a, b] = handles;
      return axis === 'h' ? Math.abs(a.x() - b.x()) : Math.abs(a.y() - b.y());
    },
    /** 入力された mm で今の軸を確定。エラーなら文字列を返す */
    confirm(mm) {
      const px = this.pxLength();
      if (!(mm > 0)) return '長さ(mm)を入力してね';
      if (px < 10) return '2点が近すぎる。もう少し離してね';
      const [a, b] = handles;
      results[axis] = {
        p1: { x: a.x(), y: a.y() },
        p2: { x: b.x(), y: b.y() },
        mm,
        mmPerPx: mm / px,
      };
      if (axis === 'h') {
        beginAxis('v');
        return null;
      }
      const { h, v } = results;
      const diff = Math.abs(h.mmPerPx - v.mmPerPx) / ((h.mmPerPx + v.mmPerPx) / 2);
      active = false;
      clearMarks();
      hideLoupe();
      layer.batchDraw();
      ui.onDone({ h, v, mmPerPx: (h.mmPerPx + v.mmPerPx) / 2, diff });
      return null;
    },
  };
}
