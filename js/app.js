import { createViewport } from './viewport.js';
import { loadAndResize, blobToImage } from './image-loader.js';
import { createCalibration, WARN_RATIO } from './calibration.js';
import { drawGrid } from './grid.js';
import { createFurnitureLayer, newId } from './furniture.js';
import { createFurnitureDialog } from './furniture-dialog.js';
import { saveImage, saveLayout, loadAll, clearAll, requestPersist } from './storage.js';
import { toJSONBlob, fromJSONFile, saveFile, timestamp } from './io.js';

// ---------- 状態 ----------
const state = {
  image: null, // { blob, width, height }
  mmPerPx: null, // 1pxあたりのmm
  calibration: null, // { h: {p1,p2,mm,mmPerPx}, v: {...} }
  gridOn: true,
  furniture: [], // { id, name, w, d, color, x, y, rot }
};

// ---------- DOM ----------
const $ = (sel) => document.querySelector(sel);
const els = {
  stage: $('#stage'),
  empty: $('#empty'),
  status: $('#status'),
  toast: $('#toast'),
  fileImage: $('#file-image'),
  fileJson: $('#file-json'),
  dlgMenu: $('#dlg-menu'),
  dlgShare: $('#dlg-share'),
  barMain: $('#bar-main'),
  barCalib: $('#bar-calib'),
  barFurn: $('#bar-furn'),
  btnGrid: $('#btn-grid'),
  calibPanel: $('#calib-panel'),
  calibHint: $('#calib-hint'),
  calibForm: $('#calib-form'),
  calibMm: $('#calib-mm'),
  calibOk: $('#calib-ok'),
  loupe: $('#loupe'),
  dlgWarn: $('#dlg-warn'),
  warnMsg: $('#warn-msg'),
};

const vp = createViewport(els.stage);
let imageNode = null;
let imageEl = null;

// ---------- トースト（iPhone でもエラーが見えるように） ----------
let toastTimer = 0;
function toast(msg, { error = false, ms = 2500 } = {}) {
  els.toast.textContent = msg;
  els.toast.classList.toggle('error', error);
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
}
window.addEventListener('error', (e) => toast('エラー: ' + (e.message || e.error), { error: true, ms: 6000 }));
window.addEventListener('unhandledrejection', (e) =>
  toast('エラー: ' + (e.reason?.message || e.reason), { error: true, ms: 6000 })
);

// ---------- 画面の状態を反映 ----------
function refreshUI() {
  const has = { image: !!state.image, scale: !!state.mmPerPx };
  document.querySelectorAll('[data-need]').forEach((b) => (b.disabled = !has[b.dataset.need]));
  els.btnGrid.classList.toggle('on', state.gridOn && has.scale);
  els.empty.hidden = has.image;

  const parts = [];
  if (state.image) parts.push(`${state.image.width}×${state.image.height}px`);
  parts.push(state.mmPerPx ? `1px=${state.mmPerPx.toFixed(2)}mm` : '縮尺未設定');
  els.status.textContent = state.image ? parts.join(' / ') : '';
}

function showBar(name) {
  els.barMain.hidden = name !== 'main';
  els.barCalib.hidden = name !== 'calib';
  els.barFurn.hidden = name !== 'furn';
}

// ---------- 自動保存 ----------
function layoutData() {
  return {
    mmPerPx: state.mmPerPx,
    calibration: state.calibration,
    gridOn: state.gridOn,
    furniture: state.furniture,
  };
}

let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 500);
}
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  return saveLayout(layoutData()).catch((e) => toast('自動保存に失敗: ' + e.message, { error: true, ms: 5000 }));
}
// アプリを閉じる・切り替える直前に書き込む
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && saveTimer) saveNow();
});

/** 画像と配置をまとめて反映（起動時の復元・JSON 読み込み） */
async function applyProject({ image, layout }) {
  furn.clear();
  await setImage(image);
  state.gridOn = layout?.gridOn ?? true;
  state.furniture = Array.isArray(layout?.furniture) ? layout.furniture : [];
  setScale(layout?.mmPerPx ?? null, layout?.calibration ?? null);
  if (state.mmPerPx) state.furniture.forEach((item) => furn.add(item));
  else state.furniture = [];
  refreshUI();
}

// ---------- 画像 ----------
async function setImage(img) {
  state.image = img;
  if (imageNode) imageNode.destroy();
  imageNode = imageEl = null;
  if (!img) return;
  imageEl = await blobToImage(img.blob);
  imageNode = new Konva.Image({ image: imageEl, x: 0, y: 0, width: img.width, height: img.height });
  vp.layers.image.add(imageNode);
  vp.setContent({ width: img.width, height: img.height });
  vp.fit();
}

async function onPickImage(file) {
  if (!file) return;
  if (state.image && (state.mmPerPx || state.furniture.length)) {
    if (!confirm('画像を差し替えると、縮尺と家具はリセットされる。いい？')) return;
  }
  toast('読み込み中…');
  const img = await loadAndResize(file);
  // 画像が変わったら縮尺と家具はリセット
  await applyProject({ image: img, layout: { gridOn: state.gridOn } });
  await saveImage(img);
  await saveNow();
  requestPersist();
  toast('読み込んだよ。次は「縮尺」を設定してね', { ms: 3500 });
}

// ---------- 縮尺・グリッド ----------
function setScale(mmPerPx, calibration) {
  state.mmPerPx = mmPerPx;
  state.calibration = calibration;
  redrawGrid();
  if (mmPerPx) furn.relayout();
}

function redrawGrid() {
  const layer = vp.layers.grid;
  if (!state.gridOn || !state.mmPerPx) {
    layer.destroyChildren();
    layer.batchDraw();
    return;
  }
  const c = state.calibration;
  const origin = c
    ? { x: Math.min(c.h.p1.x, c.h.p2.x), y: Math.min(c.v.p1.y, c.v.p2.y) }
    : { x: 0, y: 0 };
  drawGrid(layer, state.image, state.mmPerPx, origin);
}

const calib = createCalibration(vp, {
  getImageElement: () => imageEl,
  loupe: els.loupe,
  onUpdate({ axis, count }) {
    const dir = axis === 'h' ? '横' : '縦';
    const step = axis === 'h' ? '1/2' : '2/2';
    if (count < 2) {
      els.calibHint.textContent =
        `【${step} ${dir}】長さが分かる${dir}方向の区間の両端を、2点タップしてね（${count}/2）。` +
        'ピンチで拡大すると正確に置けるよ。';
      els.calibForm.hidden = true;
    } else {
      els.calibHint.textContent = `【${step} ${dir}】端点はドラッグで微調整できる。この区間の実際の長さは？`;
      els.calibForm.hidden = false;
      els.calibMm.value = '';
      els.calibOk.textContent = axis === 'h' ? '次へ' : '確定';
    }
  },
  onDone({ h, v, mmPerPx, diff }) {
    endCalibration();
    const pct = (diff * 100).toFixed(1);
    if (diff >= WARN_RATIO) {
      els.warnMsg.textContent =
        `横は 1px=${h.mmPerPx.toFixed(2)}mm、縦は 1px=${v.mmPerPx.toFixed(2)}mm で、${pct}% ずれてる。` +
        '点の位置か入力した長さが間違ってるか、画像がゆがんでるかも。';
      els.dlgWarn.returnValue = '';
      els.dlgWarn.showModal();
      els.dlgWarn.addEventListener(
        'close',
        () => {
          if (els.dlgWarn.returnValue === 'accept') applyScale();
          else startCalibration();
        },
        { once: true }
      );
    } else {
      applyScale();
    }
    function applyScale() {
      setScale(mmPerPx, { h, v });
      refreshUI();
      scheduleSave();
      toast(`縮尺を設定したよ（縦横の差 ${pct}%）`);
    }
  },
});

function startCalibration() {
  furn.select(null);
  vp.layers.furniture.listening(false);
  els.calibPanel.hidden = false;
  showBar('calib');
  calib.start();
}

function endCalibration() {
  vp.layers.furniture.listening(true);
  els.calibPanel.hidden = true;
  els.calibMm.blur();
  showBar('main');
}

els.calibForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const mm = parseFloat(els.calibMm.value.replace(/[^\d.]/g, ''));
  const err = calib.confirm(mm);
  if (err) toast(err, { error: true });
  else els.calibMm.blur();
});

// ---------- 家具 ----------
const furn = createFurnitureLayer(vp, {
  getMmPerPx: () => state.mmPerPx,
  onSelect: (item) => showBar(item ? 'furn' : 'main'),
  onMove: () => scheduleSave(),
});
const furnDialog = createFurnitureDialog();

function placeFurniture(item) {
  state.furniture.push(item);
  furn.add(item);
  furn.select(item.id);
  scheduleSave();
}

async function addFurniture() {
  const v = await furnDialog.open();
  if (!v) return;
  const c = vp.viewCenter();
  placeFurniture({ id: newId(), ...v, x: c.x, y: c.y, rot: 0 });
}

const furnActions = {
  rotate(item) {
    item.rot = (item.rot + 90) % 360;
    furn.update(item);
    scheduleSave();
  },
  duplicate(item) {
    const off = 300 / state.mmPerPx; // 30cm ずらす
    placeFurniture({ ...item, id: newId(), x: item.x + off, y: item.y + off });
  },
  async edit(item) {
    const v = await furnDialog.open(item);
    if (!v) return;
    Object.assign(item, v);
    furn.update(item);
    scheduleSave();
  },
  delete(item) {
    if (!confirm(`「${item.name}」を削除する？`)) return;
    furn.remove(item.id);
    state.furniture = state.furniture.filter((f) => f.id !== item.id);
    scheduleSave();
  },
};

// ---------- ステージのタップ ----------
vp.stage.on('click tap', (e) => {
  if (vp.isPinching) return;
  if (calib.active) {
    if (e.target === vp.stage) calib.tap(vp.pointerWorld());
    return;
  }
  // 何もない所をタップしたら選択解除
  if (e.target === vp.stage) furn.select(null);
});

// ---------- 書き出し・読み込み ----------
/** 共有シートを開き直すためにもう一度ボタンを押してもらう */
function askShareAgain(doShare) {
  return new Promise((resolve) => {
    const dlg = els.dlgShare;
    const onClick = (e) => {
      const b = e.target.closest('[data-share]');
      if (!b) return;
      dlg.removeEventListener('click', onClick);
      dlg.close();
      if (b.dataset.share === 'ok') doShare(); // ボタンのタップ中に呼ぶのが大事
      resolve();
    };
    dlg.addEventListener('click', onClick);
    dlg.showModal();
  });
}

async function exportPNG() {
  furn.select(null);
  const { width, height } = state.image;
  const saved = vp.getView();
  vp.setView({ scale: 1, x: 0, y: 0 });
  // 書き出し画像の中で文字が読める大きさに（長辺の約1.8%）
  furn.setLabelScale((Math.max(width, height) * 0.018) / 13);
  vp.layers.ui.hide();
  let canvas;
  try {
    canvas = vp.stage.toCanvas({ x: 0, y: 0, width, height, pixelRatio: 1 });
  } finally {
    vp.layers.ui.show();
    vp.setView(saved); // 文字サイズもここで元に戻る
  }
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG の作成に失敗'))), 'image/png')
  );
  canvas.width = canvas.height = 0;
  await saveFile(blob, `madori-${timestamp()}.png`, askShareAgain);
}

async function exportJSON() {
  await saveNow();
  const blob = await toJSONBlob({ image: state.image, layout: layoutData() });
  await saveFile(blob, `madori-${timestamp()}.json`, askShareAgain);
}

async function importJSON(file) {
  if (!file) return;
  const project = await fromJSONFile(file);
  if (state.image && !confirm('今のレイアウトは上書きされる。いい？')) return;
  await applyProject(project);
  await saveImage(state.image);
  await saveNow();
  toast('バックアップから復元したよ');
}

async function resetAll() {
  if (!confirm('画像・縮尺・家具をすべて消す。いい？（元に戻せない）')) return;
  await applyProject({ image: null, layout: null });
  await clearAll();
  toast('すべて消したよ');
}

function runFromMenu(fn) {
  return () => {
    if (els.dlgMenu.open) els.dlgMenu.close();
    return fn();
  };
}

// ---------- ボタン ----------
const actions = {
  menu: () => {
    refreshUI();
    els.dlgMenu.showModal();
  },
  'menu-close': () => els.dlgMenu.close(),
  'export-png': runFromMenu(exportPNG),
  'export-json': runFromMenu(exportJSON),
  'import-json': runFromMenu(() => {
    els.fileJson.value = '';
    els.fileJson.click();
  }),
  'reset-all': runFromMenu(resetAll),
  'pick-image': runFromMenu(() => {
    els.fileImage.value = '';
    els.fileImage.click();
  }),
  fit: () => vp.fit(),
  calibrate: () => startCalibration(),
  'calib-cancel': () => {
    calib.cancel();
    endCalibration();
  },
  'calib-retry': () => calib.retry(),
  'add-furniture': () => addFurniture(),
  'furn-rotate': () => furn.selected && furnActions.rotate(furn.selected),
  'furn-duplicate': () => furn.selected && furnActions.duplicate(furn.selected),
  'furn-edit': () => furn.selected && furnActions.edit(furn.selected),
  'furn-delete': () => furn.selected && furnActions.delete(furn.selected),
  'furn-done': () => furn.select(null),
  grid: () => {
    state.gridOn = !state.gridOn;
    redrawGrid();
    refreshUI();
    scheduleSave();
  },
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  const fn = actions[btn.dataset.action];
  if (fn) fn(btn);
});

els.fileImage.addEventListener('change', () => onPickImage(els.fileImage.files[0]));
els.fileJson.addEventListener('change', () => importJSON(els.fileJson.files[0]));

// ---------- 起動：前回の状態を復元 ----------
refreshUI();
loadAll()
  .then((project) => (project.image ? applyProject(project) : null))
  .catch((e) => toast('前回のデータを読めなかった: ' + e.message, { error: true, ms: 5000 }));
