/**
 * タッチ端末向けのカード拡大モーダル。
 *
 * 背景:
 *   スマートフォンでは、カードを傾ける指の動きがページのスクロールと取り合いになる。
 *   カードは画面の6〜7割を占めるため、カード上のスクロールを止めてしまうと
 *   「ページが送れない」というより重い問題にすり替わる。
 *   そこでページ内のカードでは傾きを拾わず、タップでモーダルを開き、
 *   スクロールする対象が無いモーダルの中でだけ傾けられるようにしている。
 *
 * PC（hover が使える環境）ではモーダルは一切開かず、挙動は変わらない。
 */

const TOUCH = window.matchMedia('(hover: none) and (pointer: coarse)');

/** タッチ主体の端末か。タッチ対応PCは hover: hover なので false になる */
export function isTouchDevice() {
  return TOUCH.matches;
}

/**
 * @param cardEl カード要素
 * @returns モーダルが開いているかを返す関数
 */
export function setupCardModal(cardEl) {
  const dialog = document.getElementById('card-modal');
  const slot = document.getElementById('card-modal-slot');
  const closeBtn = document.getElementById('card-modal-close');
  if (!cardEl || !dialog || !slot || !closeBtn) return () => false;

  let open = false;
  /** 元の位置を覚えておくための目印。複製ではなく実体を移動させる */
  let anchor = null;
  let scrollY = 0;

  function openModal() {
    if (open || !TOUCH.matches) return;

    scrollY = window.scrollY;
    anchor = document.createComment('card-position');
    cardEl.replaceWith(anchor);
    slot.append(cardEl);

    dialog.showModal();
    document.body.classList.add('is-modal-open');
    open = true;
  }

  /** dialog の close イベント（閉じるボタン・背景タップ・Esc すべて）で呼ばれる */
  function restore() {
    if (!open) return;

    anchor.replaceWith(cardEl);
    anchor = null;
    document.body.classList.remove('is-modal-open');
    open = false;

    // モーダル内で傾けたまま閉じると角度が残るので戻す
    for (const [k, v] of [
      ['--o', '0'], ['--rx', '0deg'], ['--ry', '0deg'],
      ['--mx', '50%'], ['--my', '50%'], ['--hyp', '0'],
    ]) {
      cardEl.style.setProperty(k, v);
    }
    cardEl.classList.remove('is-active');

    // カードが抜けている間に本文が縮むため、閉じた位置を戻す
    window.scrollTo({ top: scrollY });
  }

  cardEl.addEventListener('click', () => {
    // PC ではここで何も起きない
    if (TOUCH.matches) openModal();
  });

  closeBtn.addEventListener('click', () => dialog.close());

  // 背景（カードの外側）のタップで閉じる
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  dialog.addEventListener('close', restore);

  return () => open;
}
