/**
 * 画面制御。
 *
 * 設計の要点は「画像とメタ情報を分離する」こと。
 *   1. 画像は JAN から URL を組み立てて即座に表示する（API を待たない）
 *   2. 商品名や価格は /api/goods/:jan から後追いで流し込む
 * こうすると体感が速く、API が落ちてもカード自体は必ず出る。
 */

import { hasValidCheckDigit, imageUrl, isValidFormat, normalize } from './jan.js';
import { attachPointerEffect, rarityFromPrice, starsFromRating } from './card.js';

const el = {
  form: document.getElementById('finder'),
  input: document.getElementById('jan'),
  submit: document.getElementById('submit'),
  hint: document.getElementById('hint'),
  card: document.getElementById('card'),
  name: document.getElementById('c-name'),
  hp: document.getElementById('c-hp'),
  image: document.getElementById('c-image'),
  badges: document.getElementById('c-badges'),
  flavor: document.getElementById('c-flavor'),
  stars: document.getElementById('c-stars'),
  jan: document.getElementById('c-jan'),
  placeholder: document.getElementById('c-placeholder'),
  thumbs: document.getElementById('thumbs'),
  meta: document.getElementById('meta'),
};

attachPointerEffect(el.card);

/** 連打・多重送信の抑止 */
let inFlight = null;

el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  run(normalize(el.input.value));
});

document.querySelectorAll('.samples button').forEach((btn) => {
  btn.addEventListener('click', () => {
    el.input.value = btn.dataset.jan;
    run(btn.dataset.jan);
  });
});

// 直リンク・リロードで復元できるようにしておく
window.addEventListener('popstate', () => {
  const jan = new URL(location.href).searchParams.get('jan');
  if (jan) {
    el.input.value = jan;
    run(normalize(jan), { push: false });
  }
});

const initial = new URL(location.href).searchParams.get('jan');
if (initial) {
  el.input.value = initial;
  run(normalize(initial), { push: false });
}

// ---------------------------------------------------------------- 本処理

async function run(jan, { push = true } = {}) {
  if (!isValidFormat(jan)) {
    setHint('JANコードは13桁の数字で入力してください。', 'error');
    return;
  }
  if (inFlight) inFlight.abort();

  if (push) {
    const url = new URL(location.href);
    url.searchParams.set('jan', jan);
    history.pushState({ jan }, '', url);
  }

  setHint(
    hasValidCheckDigit(jan)
      ? '読み込んでいます…'
      : 'チェックディジットが一致しません。念のため取得を試みます…',
    hasValidCheckDigit(jan) ? '' : 'warn',
  );
  setBusy(true);

  // --- 1. 画像だけ先に出す（API を待たない） -----------------------------
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
    applyGoods(body);
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
    not_found: 'この JAN コードの商品はハンズネットストアに見つかりませんでした。',
    invalid_jan: 'JANコードの形式が正しくありません。',
    upstream_timeout: 'ハンズネットストアの応答がありませんでした。時間をおいてお試しください。',
    upstream_error: 'ハンズネットストアへの接続に失敗しました。',
  };
  setHint(messages[body?.error] ?? '商品情報を取得できませんでした。', 'error');

  if (body?.error === 'not_found') {
    // 画像も存在しないはずなので、カードを空に戻す
    clearCard();
  } else {
    // 画像は出ているので、名前だけ埋めてカードとして成立させる
    fallbackName(jan);
  }
}

/** 商品名が取れなかったときの繋ぎ。「読み込み中…」のまま残さない */
function fallbackName(jan) {
  el.name.textContent = `商品 ${jan}`;
  el.flavor.textContent = '商品情報を取得できませんでした。';
}

// ---------------------------------------------------------------- 描画

function resetCard(jan) {
  el.card.classList.add('is-loading');
  el.card.dataset.rarity = 'common';
  delete el.card.dataset.availability;
  el.placeholder.hidden = true;
  el.name.textContent = '読み込み中…';
  el.hp.textContent = '';
  el.badges.replaceChildren();
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
  el.name.textContent = 'カードを生成してください';
  el.hp.textContent = '';
  el.badges.replaceChildren();
  el.flavor.textContent = '';
  el.stars.textContent = '';
  el.jan.textContent = '';
  el.thumbs.replaceChildren();
  el.meta.replaceChildren();
}

function showImage(src) {
  el.image.hidden = false;
  el.image.src = src;
  el.image.alt = '商品画像';
}

function applyGoods(goods) {
  const price = goods.price?.includingTax ?? null;

  el.card.dataset.rarity = rarityFromPrice(price);
  el.card.dataset.availability = goods.availability;

  el.name.textContent = goods.name;
  el.name.title = goods.name;
  el.hp.innerHTML = price == null ? '' : `<small>HP</small>${price.toLocaleString('ja-JP')}`;
  el.flavor.textContent = goods.description ?? '';
  el.stars.textContent = starsFromRating(goods.rating);
  el.jan.textContent = goods.jan;

  // 最下層カテゴリを「タイプ」バッジに、商品タグをそのままバッジに
  const badges = [];
  const type = goods.categories?.at(-1);
  if (type) badges.push({ label: type, type: true });
  for (const tag of goods.tags ?? []) badges.push({ label: tag, type: false });

  el.badges.replaceChildren(
    ...badges.slice(0, 4).map(({ label, type: isType }) => {
      const span = document.createElement('span');
      span.className = isType ? 'card__badge card__badge--type' : 'card__badge';
      span.textContent = label;
      return span;
    }),
  );

  renderThumbs(goods.images ?? []);
  renderMeta(goods);
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
    ['レアリティ', el.card.dataset.rarity],
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
