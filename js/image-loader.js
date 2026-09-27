// 画像の読み込みと縮小。
// iPhone の写真(4000px超)をそのまま canvas に載せるとメモリ不足で落ちるので、
// 長辺 MAX_SIDE px に縮めた JPEG にしてから使う。

const MAX_SIDE = 3000;

/** File/Blob → 縮小済み { blob, width, height } */
export async function loadAndResize(file, maxSide = MAX_SIDE) {
  const img = await blobToImage(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) throw new Error('画像を読み込めなかった');

  const r = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.round(w * r);
  const ch = Math.round(h * r);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // 透過PNGの背景を白に
  ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, cw, ch);

  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の変換に失敗'))), 'image/jpeg', 0.9)
  );
  // iOS は canvas のメモリをすぐ解放しないので明示的に 0 にする
  canvas.width = canvas.height = 0;
  return { blob, width: cw, height: ch };
}

/** Blob → 読み込み完了した HTMLImageElement */
export function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めなかった（対応していない形式かも）'));
    };
    img.src = url;
  });
}
