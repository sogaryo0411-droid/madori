// Konva の Stage とパン・ズーム操作。
//
// ワールド座標 = 縮小後の画像のピクセル座標。Stage 自体を拡大・移動して表示する。
//  - 何もない所の1本指ドラッグ … Stage のドラッグ（パン）
//  - 図形の上の1本指ドラッグ   … 図形側のドラッグ（Konva が図形を優先する）
//  - 2本指                     … ピンチで拡大縮小＋2本指の移動でパン
//  - PC はホイールで拡大縮小

const MIN_SCALE = 0.05;
const MAX_SCALE = 20;

Konva.hitOnDragEnabled = true; // 2本指目のタッチでも touchmove を拾う
Konva.dragDistance = 6; // 少し指がブレてもタップ扱いにする

export function createViewport(container) {
  const stage = new Konva.Stage({
    container,
    width: container.clientWidth,
    height: container.clientHeight,
    draggable: true,
  });

  const layers = {
    image: new Konva.Layer({ listening: false }),
    grid: new Konva.Layer({ listening: false }),
    furniture: new Konva.Layer(),
    ui: new Konva.Layer(),
  };
  Object.values(layers).forEach((l) => stage.add(l));

  const zoomListeners = new Set();
  let content = null; // { width, height } 全体表示の対象

  function notifyZoom() {
    const s = stage.scaleX();
    zoomListeners.forEach((fn) => fn(s));
  }

  function clampScale(s) {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
  }

  /** 画面座標 p を固定点にして倍率を newScale に */
  function zoomAt(p, newScale) {
    const old = stage.scaleX();
    const s = clampScale(newScale);
    const wx = (p.x - stage.x()) / old;
    const wy = (p.y - stage.y()) / old;
    stage.scale({ x: s, y: s });
    stage.position({ x: p.x - wx * s, y: p.y - wy * s });
    notifyZoom();
  }

  /** content 全体が画面に収まるように表示 */
  function fit(padding = 16) {
    if (!content) return;
    const w = stage.width();
    const h = stage.height();
    const s = clampScale(Math.min((w - padding * 2) / content.width, (h - padding * 2) / content.height));
    stage.scale({ x: s, y: s });
    stage.position({ x: (w - content.width * s) / 2, y: (h - content.height * s) / 2 });
    notifyZoom();
  }

  // ---------- 2本指ピンチ ----------
  let lastCenter = null;
  let lastDist = 0;
  let pinching = false;

  function touchPoint(t) {
    const r = container.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  stage.on('touchstart', (e) => {
    if (e.evt.touches.length >= 2) {
      pinching = true;
      // 1本目で家具やステージをドラッグし始めていたら止める
      if (Konva.DD.isDragging) {
        stage.find((n) => n.isDragging && n.isDragging()).forEach((n) => n.stopDrag());
        if (stage.isDragging()) stage.stopDrag();
      }
    }
  });

  stage.on('touchmove', (e) => {
    const touches = e.evt.touches;
    if (touches.length < 2) return;
    e.evt.preventDefault();
    if (stage.isDragging()) stage.stopDrag();

    const p1 = touchPoint(touches[0]);
    const p2 = touchPoint(touches[1]);
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

    if (!lastCenter) {
      lastCenter = center;
      lastDist = dist;
      return;
    }
    const old = stage.scaleX();
    const s = clampScale(old * (dist / lastDist));
    const wx = (lastCenter.x - stage.x()) / old;
    const wy = (lastCenter.y - stage.y()) / old;
    stage.scale({ x: s, y: s });
    stage.position({ x: center.x - wx * s, y: center.y - wy * s });
    lastCenter = center;
    lastDist = dist;
    notifyZoom();
  });

  stage.on('touchend touchcancel', (e) => {
    if (e.evt.touches.length < 2) {
      lastCenter = null;
      lastDist = 0;
    }
    if (e.evt.touches.length === 0) {
      // ピンチの直後に指を離したときのタップを無視するため少し遅らせる
      setTimeout(() => (pinching = false), 50);
    }
  });

  // ---------- PC: ホイール ----------
  stage.on('wheel', (e) => {
    e.evt.preventDefault();
    const p = stage.getPointerPosition();
    if (!p) return;
    const factor = Math.pow(1.0015, -e.evt.deltaY);
    zoomAt(p, stage.scaleX() * factor);
  });

  // Safari のページ全体ピンチズームを止める
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) =>
    document.addEventListener(t, (e) => e.preventDefault(), { passive: false })
  );

  // ---------- リサイズ（回転・iPad の分割表示など） ----------
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    // 画面中央のワールド座標を保ったままサイズ変更
    const s = stage.scaleX();
    const cx = (stage.width() / 2 - stage.x()) / s;
    const cy = (stage.height() / 2 - stage.y()) / s;
    stage.size({ width: w, height: h });
    stage.position({ x: w / 2 - cx * s, y: h / 2 - cy * s });
  });
  ro.observe(container);

  return {
    stage,
    layers,
    get scale() {
      return stage.scaleX();
    },
    get isPinching() {
      return pinching;
    },
    setContent(size) {
      content = size;
    },
    fit,
    zoomAt,
    getView() {
      return { scale: stage.scaleX(), x: stage.x(), y: stage.y() };
    },
    setView({ scale, x, y }) {
      stage.scale({ x: scale, y: scale });
      stage.position({ x, y });
      notifyZoom();
    },
    onZoom(fn) {
      zoomListeners.add(fn);
    },
    /** 画面中央のワールド座標 */
    viewCenter() {
      const s = stage.scaleX();
      return { x: (stage.width() / 2 - stage.x()) / s, y: (stage.height() / 2 - stage.y()) / s };
    },
    /** 直近のポインタ位置のワールド座標 */
    pointerWorld() {
      const p = stage.getPointerPosition();
      if (!p) return null;
      const s = stage.scaleX();
      return { x: (p.x - stage.x()) / s, y: (p.y - stage.y()) / s };
    },
  };
}
