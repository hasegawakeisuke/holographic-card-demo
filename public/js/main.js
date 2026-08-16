/**
 * 画面制御。
 *
 * 設計の要点は「画像とメタ情報を分離する」こと。
 *   1. 画像は JAN から URL を組み立てて即座に表示する（API を待たない）
 *   2. 商品名や価格は /api/goods/:jan から後追いで流し込む
 * こうすると体感が速く、API が落ちてもカード自体は必ず出る。
 *
 * カードの見た目は「自動判定 + ユーザーの上書き」の二段構え。
 * 状態はすべて URL のクエリに載るので、設定込みで共有できる。
 */

import { hasValidCheckDigit, imageUrl, isValidFormat, normalize } from './jan.js';
import { attachPointerEffect, starsFromRating } from './card.js';
import { isTouchDevice, setupCardModal } from './modal.js';
import {
  RARITIES,
  RARITY_LABEL,
  TYPES,
  buildAttacks,
  exFromRarity,
  layoutFromRarity,
  rarityFromPrice,
  retreatCost,
  typeDisplay,
  typeFromCategories,
  typeIcon,
  weaknessOf,
} from './pokecard.js';

const el = {
  form: document.getElementById('finder'),
  input: document.getElementById('jan'),
  submit: document.getElementById('submit'),
  hint: document.getElementById('hint'),
  card: document.getElementById('card'),
  stage: document.getElementById('c-stage'),
  name: document.getElementById('c-name'),
  ex: document.getElementById('c-ex'),
  hp: document.getElementById('c-hp'),
  type: document.getElementById('c-type'),
  image: document.getElementById('c-image'),
  badges: document.getElementById('c-badges'),
  attacks: document.getElementById('c-attacks'),
  stats: document.getElementById('c-stats'),
  flavor: document.getElementById('c-flavor'),
  stars: document.getElementById('c-stars'),
  jan: document.getElementById('c-jan'),
  placeholder: document.getElementById('c-placeholder'),
  thumbs: document.getElementById('thumbs'),
  meta: document.getElementById('meta'),
  controls: document.getElementById('controls'),
  ctlType: document.getElementById('ctl-type'),
  ctlRarity: document.getElementById('ctl-rarity'),
  ctlLayout: document.getElementById('ctl-layout'),
  ctlEx: document.getElementById('ctl-ex'),
  ctlReset: document.getElementById('ctl-reset'),
};

/** 画面の状態。goods は API の結果、overrides はユーザーの明示指定 */
const state = {
  jan: null,
  goods: null,
  /** 空文字 / null は「自動」を意味する */
  overrides: { type: '', rarity: '', layout: '', ex: null },
};

let inFlight = null;

/*
 * タッチ端末ではページ内のカードで傾きを拾わない（スクロールと取り合いになるため）。
 * モーダルを開いている間だけ有効になる。PC では常に有効で挙動は変わらない。
 */
const isCardModalOpen = setupCardModal(el.card);
attachPointerEffect(el.card, () => !isTouchDevice() || isCardModalOpen());

buildControlOptions();
bindEvents();
restoreFromUrl();

// ------------------------------------------------------------ 自動判定の解決

/**
 * 自動判定とユーザー指定を合成して、実際に適用する値を返す。
 * 「自動」が選ばれている項目だけ商品データから導出する。
 */
function resolve() {
  const goods = state.goods;
  const price = goods?.price?.includingTax ?? null;

  const autoType = typeFromCategories(goods?.categorySlugs ?? []);
  const autoRarity = rarityFromPrice(price);

  const rarity = state.overrides.rarity || autoRarity;
  const type = state.overrides.type || autoType;
  const layout = state.overrides.layout || layoutFromRarity(rarity);
  const ex = state.overrides.ex === null ? exFromRarity(rarity) : state.overrides.ex;

  return { type, rarity, layout, ex, autoType, autoRarity };
}

// ---------------------------------------------------------------- 入力・遷移

function bindEvents() {
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(normalize(el.input.value));
  });

  document.querySelectorAll('.samples button').forEach((btn) => {
    btn.addEventListener('click', () => {
      el.input.value = btn.dataset.jan;
      // サンプルは自動判定の見え方を試すものなので、上書きは捨てる
      state.overrides = { type: '', rarity: '', layout: '', ex: null };
      syncControls();
      run(btn.dataset.jan);
    });
  });

  for (const select of [el.ctlType, el.ctlRarity, el.ctlLayout]) {
    select.addEventListener('change', () => {
      state.overrides[select.dataset.param] = select.value;
      render();
      pushUrl();
    });
  }

  el.ctlEx.addEventListener('change', () => {
    state.overrides.ex = el.ctlEx.checked;
    render();
    pushUrl();
  });

  el.ctlReset.addEventListener('click', () => {
    state.overrides = { type: '', rarity: '', layout: '', ex: null };
    syncControls();
    render();
    pushUrl();
  });

  window.addEventListener('popstate', () => restoreFromUrl());
}

function restoreFromUrl() {
  const p = new URL(location.href).searchParams;
  state.overrides = {
    type: TYPES[p.get('type')] ? p.get('type') : '',
    rarity: RARITIES.includes(p.get('rarity')) ? p.get('rarity') : '',
    layout: ['regular', 'full-art'].includes(p.get('layout')) ? p.get('layout') : '',
    ex: p.has('ex') ? p.get('ex') === '1' : null,
  };
  syncControls();

  const jan = p.get('jan');
  if (jan) {
    el.input.value = jan;
    run(normalize(jan), { push: false });
  }
}

/** 状態を URL に書き戻す。既定値と同じものはクエリに載せない */
function pushUrl() {
  const url = new URL(location.href);
  const q = url.searchParams;
  if (state.jan) q.set('jan', state.jan);
  for (const key of ['type', 'rarity', 'layout']) {
    if (state.overrides[key]) q.set(key, state.overrides[key]);
    else q.delete(key);
  }
  if (state.overrides.ex === null) q.delete('ex');
  else q.set('ex', state.overrides.ex ? '1' : '0');
  history.replaceState({ jan: state.jan }, '', url);
}

// ------------------------------------------------------------------ 取得処理

async function run(jan, { push = true } = {}) {
  if (!isValidFormat(jan)) {
    setHint('スキャンコードは13桁の数字で入力してください。', 'error');
    return;
  }
  if (inFlight) inFlight.abort();

  state.jan = jan;
  if (push) pushUrl();

  const validCheckDigit = hasValidCheckDigit(jan);
  setHint(
    validCheckDigit
      ? '読み込んでいます…'
      : 'チェックディジットが一致しません。念のため取得を試みます…',
    validCheckDigit ? '' : 'warn',
  );
  setBusy(true);

  // --- 1. 画像だけ先に出す（API を待たない） -----------------------------
  state.goods = null;
  resetCard(jan);
  showImage(imageUrl(jan, 1));

  // --- 2. メタ情報を後追いで取得 -----------------------------------------
  const controller = new AbortController();
  inFlight = controller;

  try {
    const res = await fetch(`/api/goods/${jan}`, { signal: controller.signal });
    const body = await res.json();

    if (!res.ok) {
      handleApiError(body, jan);
      return;
    }
    state.goods = body;
    render();
    setHint('', '');
  } catch (err) {
    if (err.name === 'AbortError') return;
    // API が死んでいても画像は出ているので、致命扱いにはしない
    fallbackName(jan);
    setHint('商品情報を取得できませんでした（画像のみ表示しています）。', 'warn');
  } finally {
    if (inFlight === controller) inFlight = null;
    setBusy(false);
    el.card.classList.remove('is-loading');
  }
}

function handleApiError(body, jan) {
  const messages = {
    not_found: 'このスキャンコードの商品はハンズネットストアに見つかりませんでした。',
    invalid_jan: 'スキャンコードの形式が正しくありません。',
    upstream_timeout: 'ハンズネットストアの応答がありませんでした。時間をおいてお試しください。',
    upstream_error: 'ハンズネットストアへの接続に失敗しました。',
  };
  setHint(messages[body?.error] ?? '商品情報を取得できませんでした。', 'error');

  if (body?.error === 'not_found') {
    clearCard();
  } else {
    fallbackName(jan);
  }
}

/** 商品名が取れなかったときの繋ぎ。「読み込み中…」のまま残さない */
function fallbackName(jan) {
  el.name.textContent = `商品 ${jan}`;
  el.flavor.textContent = '商品情報を取得できませんでした。';
}

// -------------------------------------------------------------------- 描画

function render() {
  const goods = state.goods;
  if (!goods) return;

  const { type, rarity, layout, ex } = resolve();
  const price = goods.price?.includingTax ?? null;

  el.card.dataset.type = type;
  el.card.dataset.rarity = rarity;
  el.card.dataset.layout = layout;
  el.card.dataset.availability = goods.availability;
  el.card.dataset.ex = String(ex);

  // 進化段階。実物の左上表記に相当する飾り
  const stageIndex = RARITIES.indexOf(rarity);
  el.stage.textContent = stageIndex >= 4 ? '2進化' : stageIndex >= 2 ? '1進化' : 'たね';

  el.name.textContent = goods.name;
  el.name.title = goods.name;
  el.name.dataset.ex = String(ex);
  el.ex.hidden = !ex;

  el.hp.innerHTML = price == null ? '' : `<small>HP</small>${price.toLocaleString('ja-JP')}`;
  el.type.replaceChildren(typeIcon(type, { size: 22 }));

  el.flavor.textContent = goods.description ?? '';
  el.stars.textContent = starsFromRating(goods.rating);
  el.jan.textContent = goods.jan;

  renderBadges(goods);
  renderAttacks(goods, { type, rarity });
  renderStats(type, rarity);
  renderThumbs(goods.images ?? []);
  renderMeta(goods);

  el.controls.hidden = false;
  syncControls();
}

function renderBadges(goods) {
  const badges = [];
  const leaf = goods.categories?.at(-1);
  if (leaf) badges.push({ label: leaf, type: true });
  for (const tag of goods.tags ?? []) badges.push({ label: tag, type: false });

  el.badges.replaceChildren(
    ...badges.slice(0, 3).map(({ label, type: isType }) => {
      const span = document.createElement('span');
      span.className = isType ? 'card__badge card__badge--type' : 'card__badge';
      span.textContent = label;
      return span;
    }),
  );
}

function renderAttacks(goods, opts) {
  const attacks = buildAttacks(goods, opts);

  el.attacks.replaceChildren(
    ...attacks.map((atk) => {
      const row = document.createElement('div');
      row.className = 'attack';

      const cost = document.createElement('span');
      cost.className = 'attack__cost';
      cost.append(...atk.cost.map((t) => typeIcon(t, { size: 13, title: false })));

      const name = document.createElement('span');
      name.className = 'attack__name';
      name.textContent = atk.name;

      const dmg = document.createElement('span');
      dmg.className = 'attack__damage';
      dmg.textContent = String(atk.damage);

      row.append(cost, name, dmg);
      return row;
    }),
  );
}

function renderStats(type, rarity) {
  const weak = weaknessOf(type);

  const make = (label, node) => {
    const box = document.createElement('div');
    box.className = 'stat';
    const t = document.createElement('span');
    t.className = 'stat__label';
    t.textContent = label;
    const v = document.createElement('span');
    v.className = 'stat__value';
    v.append(node);
    box.append(t, v);
    return box;
  };

  const weakValue = document.createElement('span');
  weakValue.append(typeIcon(weak, { size: 12, title: false }), document.createTextNode('×2'));

  const retreat = document.createElement('span');
  retreat.append(
    ...Array(retreatCost(rarity))
      .fill(0)
      .map(() => typeIcon('colorless', { size: 12, title: false })),
  );

  el.stats.replaceChildren(
    make('弱点', weakValue),
    make('ていこう', document.createTextNode('—')),
    make('にげる', retreat),
  );
}

function renderThumbs(images) {
  if (images.length < 2) {
    el.thumbs.replaceChildren();
    return;
  }
  el.thumbs.replaceChildren(
    ...images.map((src, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb';
      btn.setAttribute('aria-current', String(i === 0));
      btn.title = `画像 ${i + 1}`;

      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      btn.append(img);

      btn.addEventListener('click', () => {
        showImage(src);
        el.thumbs
          .querySelectorAll('.thumb')
          .forEach((t) => t.setAttribute('aria-current', String(t === btn)));
      });
      return btn;
    }),
  );
}

function renderMeta(goods) {
  const { type, rarity, autoType, autoRarity } = resolve();

  const rows = [
    ['商品名', goods.name],
    [
      '価格',
      goods.price?.includingTax == null
        ? null
        : `${goods.price.includingTax.toLocaleString('ja-JP')}円（税込）`,
    ],
    ['在庫', goods.availabilityLabel],
    ['カテゴリ', goods.categories?.join(' > ') || null],
    [
      'タイプ',
      `${typeDisplay(type)}／${type === autoType ? '自動' : '手動'}`,
    ],
    [
      'レアリティ',
      `${RARITY_LABEL[rarity]}／${rarity === autoRarity ? '自動' : '手動'}`,
    ],
  ].filter(([, v]) => v);

  const nodes = rows.map(([label, value]) => {
    const div = document.createElement('div');
    div.className = 'meta__row';
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    div.append(dt, dd);
    return div;
  });

  const link = document.createElement('div');
  link.className = 'meta__row';
  const dt = document.createElement('dt');
  dt.textContent = '出典';
  const dd = document.createElement('dd');
  const a = document.createElement('a');
  a.href = goods.sourceUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = 'ハンズネットストア';
  dd.append(a);
  link.append(dt, dd);
  nodes.push(link);

  el.meta.replaceChildren(...nodes);
}

// -------------------------------------------------------------- カード初期化

function resetCard(jan) {
  el.card.classList.add('is-loading');
  el.card.dataset.rarity = 'common';
  el.card.dataset.layout = 'regular';
  el.card.dataset.type = 'colorless';
  el.card.dataset.ex = 'false';
  delete el.card.dataset.availability;
  el.placeholder.hidden = true;
  el.stage.textContent = '';
  el.name.textContent = '読み込み中…';
  el.ex.hidden = true;
  el.hp.textContent = '';
  el.type.replaceChildren();
  el.badges.replaceChildren();
  el.attacks.replaceChildren();
  el.stats.replaceChildren();
  el.flavor.textContent = '';
  el.stars.textContent = '';
  el.jan.textContent = jan;
  el.thumbs.replaceChildren();
  el.meta.replaceChildren();
}

function clearCard() {
  el.card.classList.remove('is-loading');
  el.placeholder.hidden = false;
  el.image.hidden = true;
  el.image.removeAttribute('src');
  el.controls.hidden = true;
  resetCard('');
  el.placeholder.hidden = false;
  el.name.textContent = 'カードを生成してください';
}

function showImage(src) {
  el.image.hidden = false;
  el.image.src = src;
  el.image.alt = '商品画像';
}

// ------------------------------------------------------------------ コントロール

function buildControlOptions() {
  for (const id of Object.keys(TYPES)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = typeDisplay(id);
    el.ctlType.append(opt);
  }
  for (const id of RARITIES) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = RARITY_LABEL[id];
    el.ctlRarity.append(opt);
  }
}

/** state → コントロールの表示を合わせる */
function syncControls() {
  el.ctlType.value = state.overrides.type;
  el.ctlRarity.value = state.overrides.rarity;
  el.ctlLayout.value = state.overrides.layout;
  el.ctlEx.checked =
    state.overrides.ex === null ? resolve().ex : state.overrides.ex;
}

// ---------------------------------------------------------------- 小道具

function setHint(message, tone) {
  el.hint.textContent = message;
  if (tone) el.hint.dataset.tone = tone;
  else delete el.hint.dataset.tone;
}

function setBusy(busy) {
  el.submit.disabled = busy;
  el.submit.textContent = busy ? '生成中…' : 'カード生成';
}
