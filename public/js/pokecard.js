/**
 * ポケモンカードとしての「型」の定義。
 *
 *  - タイプ（くさ・ほのお…）とハンズの商品カテゴリの対応
 *  - タイプごとのアイコン（インラインSVG。外部画像を持たないため CSP に強い）
 *  - レアリティ / レイアウトの導出ルール
 *
 * アイコンは実物のポケモンカードの記号を複製したものではなく、
 * 同じ役割を果たす抽象的な図形を独自に描いている。
 */

// ---------------------------------------------------------------- タイプ定義

/**
 * `id` は URL クエリや data 属性で使う。`label` は表示名。
 * `color` はタイプの色、`icon` は 24x24 の viewBox を前提とした SVG パス。
 */
export const TYPES = {
  grass: {
    label: 'くさ',
    color: '#4a9e3f',
    icon: '<path d="M12 3c5 2 8 5 8 9a8 8 0 0 1-13.6 5.7C4.7 16 4 13 4 10c3 1 5 2.5 6.5 4.5C11 11 11 6.5 12 3z"/>',
  },
  fire: {
    label: 'ほのお',
    color: '#e0532f',
    icon: '<path d="M12 2c1 3.5-1 5-2.5 6.8C8 10.5 7 12 7 14a5 5 0 0 0 10 0c0-2-1-3.6-2.2-5.2C15.5 11 14.5 12 13.5 12c1.5-3.5 0-7.5-1.5-10z"/>',
  },
  water: {
    label: 'みず',
    color: '#3d94d6',
    icon: '<path d="M12 2.5c3.2 4.3 6.5 8 6.5 11.6A6.5 6.5 0 0 1 5.5 14C5.5 10.5 8.8 6.8 12 2.5z"/>',
  },
  lightning: {
    label: 'かみなり',
    color: '#eab308',
    icon: '<path d="M13.5 2 5 13.2h5.2L9.4 22 19 10.2h-5.4L13.5 2z"/>',
  },
  psychic: {
    label: 'ちょうのうりょく',
    color: '#9d55c4',
    icon: '<path d="M12 4c4.5 0 8 4.2 8 8s-3.5 8-8 8-8-4.2-8-8 3.5-8 8-8zm0 4.6A3.4 3.4 0 1 0 12 15.4 3.4 3.4 0 0 0 12 8.6z"/>',
  },
  fighting: {
    label: 'かくとう',
    color: '#c05a28',
    icon: '<path d="M7 5h7a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H7a2 2 0 0 1-2-2v-2h4v-2H5v-2h4v-2H5V7a2 2 0 0 1 2-2z"/>',
  },
  darkness: {
    label: 'あく',
    color: '#3d4451',
    icon: '<path d="M15.5 3A9 9 0 1 0 21 13.2 7.2 7.2 0 0 1 15.5 3z"/>',
  },
  metal: {
    label: 'はがね',
    color: '#7e8794',
    icon: '<path d="M12 2.5 20 7v10l-8 4.5L4 17V7l8-4.5zm0 5.2L8.2 9.9v4.2L12 16.3l3.8-2.2V9.9L12 7.7z"/>',
  },
  fairy: {
    label: 'フェアリー',
    color: '#d95d93',
    icon: '<path d="M12 2.5 14.2 9l6.8.3-5.3 4.2 1.8 6.5L12 16.4 6.5 20l1.8-6.5L3 9.3 9.8 9 12 2.5z"/>',
  },
  dragon: {
    label: 'ドラゴン',
    color: '#c19a2b',
    icon: '<path d="M3 8.5 9 10l3-6.5L15 10l6-1.5-3.5 5.2 3 5.8-6.5-2L12 21l-2-3.5-6.5 2 3-5.8L3 8.5z"/>',
  },
  colorless: {
    label: 'ノーマル',
    color: '#b9b3a7',
    icon: '<path d="M12 3.2c2.6 0 4 2.2 4.6 4.4.5 1.8 2.2 2.6 2.2 4.9a6.8 6.8 0 0 1-13.6 0c0-2.3 1.7-3.1 2.2-4.9C8 5.4 9.4 3.2 12 3.2z"/>',
  },
};

/** 弱点の対応。実物のカードの相性をおおまかになぞっている */
const WEAKNESS = {
  grass: 'fire',
  fire: 'water',
  water: 'lightning',
  lightning: 'fighting',
  psychic: 'darkness',
  fighting: 'psychic',
  darkness: 'fighting',
  metal: 'fire',
  fairy: 'metal',
  dragon: 'fairy',
  colorless: 'fighting',
};

/**
 * ハンズのトップレベルカテゴリ（hands.net/cate/ の15分類）とタイプの対応。
 * キーは日本語名ではなくURLのスラッグ。日本語名は表記ゆれがあるため。
 */
const CATEGORY_TYPE = {
  kitchen: 'fire', // キッチン用品・調理器具 → 火を使う
  bathtoiletries: 'water', // お風呂・トイレタリー
  cleanlaundry: 'water', // 掃除用品・洗濯用品
  electronics: 'lightning', // 家電・AV機器
  outdoor: 'grass', // レイングッズ・アウトドア
  pet: 'grass', // ペット用品 → 生き物
  beauty: 'fairy', // ビューティ（旧スラッグ）
  'beauty-healthcare': 'fairy', // ビューティ・ヘルスケア
  crafts: 'psychic', // ハンドメイド・クラフト → 創造
  party: 'dragon', // パーティグッズ・バラエティ → 華やか
  diy: 'metal', // DIY・工具
  prevention: 'fighting', // 防災・防犯 → 備え
  shoecare: 'darkness', // 靴磨き・シューケア
  stationery: 'colorless', // 文房具・オフィス用品
  interior: 'colorless', // インテリア・収納
  travel: 'colorless', // バッグ・財布・旅行用品
};

/** 商品のカテゴリスラッグからタイプを決める。未知のカテゴリは colorless */
export function typeFromCategories(slugs = []) {
  for (const slug of slugs) {
    if (CATEGORY_TYPE[slug]) return CATEGORY_TYPE[slug];
  }
  return 'colorless';
}

export function weaknessOf(typeId) {
  return WEAKNESS[typeId] ?? 'fighting';
}

/** タイプアイコンの SVG 要素をつくる */
export function typeIcon(typeId, { size = 20, title = true } = {}) {
  const type = TYPES[typeId] ?? TYPES.colorless;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'type-icon');
  svg.setAttribute('aria-hidden', title ? 'false' : 'true');
  svg.style.setProperty('--type-color', type.color);
  if (title) {
    svg.setAttribute('role', 'img');
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    t.textContent = type.label;
    svg.append(t);
  }
  // icon は自前で定義した固定文字列のみ。外部入力は入らない
  svg.insertAdjacentHTML('beforeend', type.icon);
  return svg;
}

// ------------------------------------------------------------ レアリティ

/** 弱い順。インデックスをエネルギー数などに使う */
export const RARITIES = ['common', 'rare', 'holo', 'ultra', 'secret'];

export const RARITY_LABEL = {
  common: 'C（コモン）',
  rare: 'R（レア）',
  holo: 'RH（ホロ）',
  ultra: 'UR（ウルトラ）',
  secret: 'SR（シークレット）',
};

/** 税込価格からレアリティを決める */
export function rarityFromPrice(price) {
  if (price == null) return 'common';
  if (price >= 30000) return 'secret';
  if (price >= 10000) return 'ultra';
  if (price >= 3000) return 'holo';
  if (price >= 1000) return 'rare';
  return 'common';
}

/**
 * レイアウトの既定値。
 * ultra 以上は全面絵柄にすると、実物の特別なカードらしい迫力が出る。
 */
export function layoutFromRarity(rarity) {
  return rarity === 'ultra' || rarity === 'secret' ? 'full-art' : 'regular';
}

/** ex 表記の既定値。最上位だけ ex 扱いにする */
export function exFromRarity(rarity) {
  return rarity === 'secret';
}

// -------------------------------------------------------------- わざ・数値

/**
 * ダメージを価格から決める。
 * 線形だと安い商品が全部 10 に潰れ、高い商品が上限に張り付くので対数で写像する。
 * 980円→180、3,800円→230、27,940円→300 くらいに散る。
 */
export function damageFromPrice(price) {
  if (price == null) return 30;
  const raw = (Math.log10(Math.max(price, 10)) - 1) * 90;
  return Math.min(300, Math.max(10, Math.round(raw / 10) * 10));
}

/** エネルギー数（1〜3）。レアリティが高いほど重い */
export function energyCount(rarity) {
  return Math.min(3, Math.floor(RARITIES.indexOf(rarity) / 2) + 1);
}

/** にげるコスト（1〜3） */
export function retreatCost(rarity) {
  return Math.min(3, Math.max(1, RARITIES.indexOf(rarity)));
}

/**
 * わざを組み立てる。名前は商品タグ、無ければ最下層カテゴリを使う。
 * 2つ目のわざはタグが2つ以上あるときだけ生やす。
 */
export function buildAttacks(goods, { type, rarity }) {
  const price = goods.price?.includingTax ?? null;
  const names = [...(goods.tags ?? [])];
  const leaf = goods.categories?.at(-1);
  if (names.length === 0 && leaf) names.push(leaf);
  if (names.length === 0) names.push('たいあたり');

  const attacks = [
    {
      name: names[0],
      cost: Array(energyCount(rarity)).fill(type),
      damage: damageFromPrice(price),
    },
  ];

  if (names[1]) {
    attacks.push({
      name: names[1],
      cost: Array(Math.max(1, energyCount(rarity) - 1)).fill('colorless'),
      damage: Math.max(10, Math.round((damageFromPrice(price) * 0.5) / 10) * 10),
    });
  }
  return attacks;
}
