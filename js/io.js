// ファイルの書き出し・読み込み（JSON バックアップ／PNG）。

const APP_ID = 'madori-layout';
const VERSION = 1;

export function isIOS() {
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** 画像込みで1ファイルの JSON にする */
export async function toJSONBlob({ image, layout }) {
  const data = {
    app: APP_ID,
    version: VERSION,
    savedAt: new Date().toISOString(),
    image: image ? { dataUrl: await blobToDataURL(image.blob), width: image.width, height: image.height } : null,
    layout,
  };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

/** JSON ファイル → { image: {blob,width,height} | null, layout } */
export async function fromJSONFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('JSON として読めなかった');
  }
  if (data?.app !== APP_ID) throw new Error('このアプリで書き出したファイルじゃないみたい');
  let image = null;
  if (data.image?.dataUrl) {
    const blob = await (await fetch(data.image.dataUrl)).blob();
    image = { blob, width: data.image.width, height: data.image.height };
  }
  return { image, layout: data.layout ?? null };
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * ファイルを保存する。iPhone/iPad は共有シート（「画像を保存」「ファイルに保存」）、それ以外はダウンロード。
 * 共有シートは「ユーザー操作の直後」でないと開けないので、準備に時間がかかって断られたときは
 * askAgain(file) でもう一度ボタンを押してもらう。
 */
export async function saveFile(blob, filename, askAgain) {
  const file = new File([blob], filename, { type: blob.type });
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // ユーザーが閉じた
      if (e.name === 'NotAllowedError' && askAgain) {
        await askAgain(() => navigator.share({ files: [file] }).catch((err) => {
          if (err.name !== 'AbortError') download(blob, filename);
        }));
        return;
      }
    }
  }
  download(blob, filename);
}
