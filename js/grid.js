// 1m グリッド。縮尺設定で測った端点を原点にして、壁に沿って線が揃うようにする。

const COLOR = 'rgba(47,128,237,0.55)';

/**
 * @param layer    グリッド用レイヤー
 * @param size     { width, height } 画像サイズ(px)
 * @param mmPerPx  1pxあたりのmm
 * @param origin   { x, y } 線を通す基準点(px)
 */
export function drawGrid(layer, size, mmPerPx, origin = { x: 0, y: 0 }) {
  layer.destroyChildren();
  if (!size || !(mmPerPx > 0)) return;
  const step = 1000 / mmPerPx;
  if (step < 4) return; // 縮尺がおかしいときに線が大量に出るのを防ぐ

  const { width, height } = size;
  const startX = origin.x - Math.floor(origin.x / step) * step;
  const startY = origin.y - Math.floor(origin.y / step) * step;

  for (let x = startX; x <= width; x += step) {
    layer.add(new Konva.Line({ points: [x, 0, x, height], stroke: COLOR, strokeWidth: 1, strokeScaleEnabled: false }));
  }
  for (let y = startY; y <= height; y += step) {
    layer.add(new Konva.Line({ points: [0, y, width, y], stroke: COLOR, strokeWidth: 1, strokeScaleEnabled: false }));
  }
  layer.batchDraw();
}
