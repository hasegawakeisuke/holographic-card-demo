/**
 * カードのポインタ追従。
 *
 * やっていることは「CSS カスタムプロパティを書き換えるだけ」で、
 * 見た目の計算は全部 CSS 側にある（card.css）。
 * JS で style を直接いじらないので、演出を変えたいときは CSS だけ触れば済む。
 */

/** 最大傾き */
const MAX_TILT_DEG = 16;

export function attachPointerEffect(cardEl) {
  const inner = cardEl.querySelector('.card__inner');
  if (!inner) return;

  let frame = 0;
  let pending = null;

  const apply = () => {
    frame = 0;
    if (!pending) return;
    const { px, py } = pending;

    // 中心を原点にした -0.5〜0.5
    const cx = px - 0.5;
    const cy = py - 0.5;

    cardEl.style.setProperty('--mx', `${px * 100}%`);
    cardEl.style.setProperty('--my', `${py * 100}%`);
    cardEl.style.setProperty('--ry', `${cx * MAX_TILT_DEG * 2}deg`);
    cardEl.style.setProperty('--rx', `${-cy * MAX_TILT_DEG * 2}deg`);
    // 中心からの距離（0〜1）。端ほど効果を強くするために使う
    cardEl.style.setProperty('--hyp', `${Math.min(1, Math.hypot(cx, cy) * 2)}`);
  };

  const onMove = (e) => {
    const rect = cardEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pending = {
      px: clamp01((e.clientX - rect.left) / rect.width),
      py: clamp01((e.clientY - rect.top) / rect.height),
    };
    if (!frame) frame = requestAnimationFrame(apply);
  };

  const onEnter = () => {
    cardEl.classList.add('is-active');
    cardEl.style.setProperty('--o', '1');
  };

  const onLeave = () => {
    cardEl.classList.remove('is-active');
    cardEl.style.setProperty('--o', '0');
    cardEl.style.setProperty('--rx', '0deg');
    cardEl.style.setProperty('--ry', '0deg');
    cardEl.style.setProperty('--mx', '50%');
    cardEl.style.setProperty('--my', '50%');
    cardEl.style.setProperty('--hyp', '0');
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    pending = null;
  };

  cardEl.addEventListener('pointerenter', onEnter);
  cardEl.addEventListener('pointermove', onMove);
  cardEl.addEventListener('pointerleave', onLeave);
  cardEl.addEventListener('pointercancel', onLeave);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 評価値を★表現にする（4.7 → ★★★★☆） */
export function starsFromRating(rating) {
  // レビュー0件の商品で「☆☆☆☆☆ 0.0 (0)」を出しても意味がないので何も表示しない
  if (!rating || rating.count === 0) return '';
  const filled = Math.round(rating.value);
  return `${'★'.repeat(filled)}${'☆'.repeat(Math.max(0, 5 - filled))} ${rating.value.toFixed(1)} (${rating.count})`;
}
