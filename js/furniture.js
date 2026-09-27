// 家具の描画。
// 家具は mm で持ち、描画時に縮尺(mm/px)で px に直す。位置 x, y は家具の中心のワールド座標(px)。
// item = { id, name, w, d, color, x, y, rot }   w=幅(mm) d=奥行(mm) rot=0/90/180/270

const LABEL_NAME_PX = 13; // 画面上の文字サイズ
const LABEL_SIZE_PX = 11;

export const COLORS = ['#f4a261', '#e9c46a', '#90be6d', '#8ecae6', '#a0c4ff', '#cdb4db', '#f28482', '#adb5bd'];

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * @param opts.getMmPerPx   () => 現在の縮尺
 * @param opts.onSelect     (item | null) => void
 * @param opts.onMove       (item) => void  ドラッグで位置が変わった
 */
export function createFurnitureLayer(vp, { getMmPerPx, onSelect, onMove }) {
  const layer = vp.layers.furniture;
  const nodes = new Map(); // id -> { item, group }
  let labelScale = 1 / vp.scale;
  let selectedId = null;

  function build(item) {
    let dragStartAbs = null;
    const group = new Konva.Group({
      id: item.id,
      draggable: true,
      // 2本指ピンチが始まったら家具は動かさず、掴んだ位置に戻す
      dragBoundFunc: (pos) => (vp.isPinching && dragStartAbs ? dragStartAbs : pos),
    });
    group.on('dragstart', () => {
      dragStartAbs = group.absolutePosition();
      select(item.id);
    });
    group.on('dragend', () => {
      item.x = group.x();
      item.y = group.y();
      onMove(item);
    });
    group.on('click tap', (e) => {
      e.cancelBubble = true;
      select(item.id);
    });
    group.on('mouseenter', () => (vp.stage.container().style.cursor = 'move'));
    group.on('mouseleave', () => (vp.stage.container().style.cursor = ''));
    group.add(
      new Konva.Rect({ name: 'body', opacity: 0.8, strokeScaleEnabled: false }),
      new Konva.Group({ name: 'label', listening: false })
    );
    const label = group.findOne('.label');
    label.add(
      new Konva.Text({ name: 'title', fontSize: LABEL_NAME_PX, fontStyle: 'bold', fill: '#111', align: 'center' }),
      new Konva.Text({ name: 'size', fontSize: LABEL_SIZE_PX, fill: '#333', align: 'center' })
    );
    layer.add(group);
    const entry = { item, group };
    nodes.set(item.id, entry);
    apply(entry);
    return entry;
  }

  /** item の内容を Konva ノードに反映 */
  function apply({ item, group }) {
    const k = 1 / getMmPerPx();
    const w = item.w * k;
    const h = item.d * k;
    group.position({ x: item.x, y: item.y });
    group.rotation(item.rot);

    const selected = item.id === selectedId;
    const body = group.findOne('.body');
    body.setAttrs({
      x: -w / 2,
      y: -h / 2,
      width: w,
      height: h,
      fill: item.color,
      stroke: selected ? '#2f80ed' : 'rgba(0,0,0,0.6)',
      strokeWidth: selected ? 4 : 1.5,
    });

    // 文字は常に読める向き・画面上で一定サイズ
    const label = group.findOne('.label');
    label.rotation(-item.rot);
    label.scale({ x: labelScale, y: labelScale });
    const title = label.findOne('.title');
    const size = label.findOne('.size');
    title.text(item.name || '');
    size.text(`${item.w}×${item.d}`);
    title.offsetX(title.width() / 2);
    size.offsetX(size.width() / 2);
    title.y(-LABEL_NAME_PX - 1);
    size.y(1);
  }

  function setLabelScale(k) {
    labelScale = k;
    nodes.forEach(({ group }) => group.findOne('.label').scale({ x: k, y: k }));
  }
  vp.onZoom((s) => setLabelScale(1 / s));

  function select(id) {
    if (id === selectedId) return;
    const prev = nodes.get(selectedId);
    selectedId = id && nodes.has(id) ? id : null;
    if (prev) apply(prev);
    const cur = nodes.get(selectedId);
    if (cur) {
      cur.group.moveToTop();
      apply(cur);
    }
    layer.batchDraw();
    onSelect(cur ? cur.item : null);
  }

  return {
    select,
    setLabelScale,
    get selected() {
      return nodes.get(selectedId)?.item ?? null;
    },
    add(item) {
      build(item);
      layer.batchDraw();
    },
    /** item を書き換えた後に呼ぶ */
    update(item) {
      const e = nodes.get(item.id);
      if (e) apply(e);
      layer.batchDraw();
    },
    remove(id) {
      if (id === selectedId) select(null);
      const e = nodes.get(id);
      if (!e) return;
      e.group.destroy();
      nodes.delete(id);
      layer.batchDraw();
    },
    /** 縮尺が変わったときなどに全部描き直す */
    relayout() {
      nodes.forEach(apply);
      layer.batchDraw();
    },
    clear() {
      select(null);
      nodes.clear();
      layer.destroyChildren();
      layer.batchDraw();
    },
  };
}
