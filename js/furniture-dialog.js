// 家具の追加・編集ダイアログ。
import { COLORS } from './furniture.js';

// よくある家具（幅×奥行 mm）。だいたいの標準サイズ
const PRESETS = [
  ['シングルベッド', 970, 1950],
  ['セミダブルベッド', 1200, 1950],
  ['ダブルベッド', 1400, 1950],
  ['2人掛けソファ', 1500, 850],
  ['3人掛けソファ', 1900, 900],
  ['ダイニングテーブル(4人)', 1350, 800],
  ['ダイニングチェア', 450, 500],
  ['ローテーブル', 1000, 500],
  ['テレビ台', 1500, 400],
  ['デスク', 1000, 600],
  ['本棚', 800, 300],
  ['冷蔵庫', 650, 700],
  ['洗濯機', 640, 650],
  ['食器棚', 1000, 450],
];

const $ = (sel) => document.querySelector(sel);

export function createFurnitureDialog() {
  const dlg = $('#dlg-furniture');
  const form = $('#furniture-form');
  const f = {
    title: $('#furniture-title'),
    preset: $('#f-preset'),
    name: $('#f-name'),
    w: $('#f-w'),
    d: $('#f-d'),
    colors: $('#f-colors'),
    submit: $('#f-submit'),
  };

  PRESETS.forEach(([name, w, d], i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${name}（${w}×${d}）`;
    f.preset.append(o);
  });
  f.preset.addEventListener('change', () => {
    const p = PRESETS[f.preset.value];
    if (!p) return;
    f.name.value = p[0].replace(/\(.*\)$/, '');
    f.w.value = p[1];
    f.d.value = p[2];
  });

  // 色の選択肢
  COLORS.forEach((c) => f.colors.append(swatch(c)));
  const custom = swatch('#ffffff', true);
  f.colors.append(custom);
  const customPicker = custom.querySelector('input[type=color]');
  customPicker.addEventListener('input', () => {
    custom.style.background = customPicker.value;
    custom.querySelector('input[type=radio]').value = customPicker.value;
    custom.querySelector('input[type=radio]').checked = true;
  });

  function swatch(color, isCustom = false) {
    const label = document.createElement('label');
    label.title = isCustom ? '好きな色' : color;
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'f-color';
    radio.value = color;
    label.append(radio);
    if (isCustom) {
      label.className = 'custom';
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = '#ffcc99';
      label.append(picker);
    } else {
      label.style.background = color;
    }
    return label;
  }

  function selectColor(color) {
    const radios = [...f.colors.querySelectorAll('input[type=radio]')];
    const hit = radios.find((r) => r.value.toLowerCase() === color.toLowerCase());
    if (hit) {
      hit.checked = true;
    } else {
      customPicker.value = color;
      custom.style.background = color;
      const r = custom.querySelector('input[type=radio]');
      r.value = color;
      r.checked = true;
    }
  }

  let resolver = null;

  function close(result) {
    if (dlg.open) dlg.close();
    if (resolver) resolver(result);
    resolver = null;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const w = parseInt(f.w.value.replace(/[^\d]/g, ''), 10);
    const d = parseInt(f.d.value.replace(/[^\d]/g, ''), 10);
    if (!(w > 0) || !(d > 0)) {
      (w > 0 ? f.d : f.w).focus();
      return;
    }
    const color = form.querySelector('input[name=f-color]:checked')?.value || COLORS[0];
    close({ name: f.name.value.trim() || '家具', w, d, color });
  });
  dlg.querySelector('[data-action=furniture-cancel]').addEventListener('click', () => close(null));
  dlg.addEventListener('cancel', () => close(null)); // Esc キー

  /**
   * ダイアログを開く。initial があれば編集モード
   * @returns Promise<{name,w,d,color} | null>
   */
  function open(initial = null) {
    f.title.textContent = initial ? '家具を編集' : '家具を追加';
    f.submit.textContent = initial ? '保存' : '追加';
    f.preset.value = '';
    f.name.value = initial?.name ?? '';
    f.w.value = initial?.w ?? '';
    f.d.value = initial?.d ?? '';
    selectColor(initial?.color ?? COLORS[0]);
    dlg.showModal();
    return new Promise((resolve) => (resolver = resolve));
  }

  return { open };
}
