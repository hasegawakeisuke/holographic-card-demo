/**
 * JANコードの正規化と検証。
 * src/hands.ts と同じロジックだが、こちらは送信前にブラウザで弾くためのもの。
 * サーバー側の検証を省略してよいという意味ではない。
 */

/** 全角数字・ハイフン・空白を許容して 13 桁の数字列に正す */
export function normalize(input) {
  return input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\D/g, '');
}

export function isValidFormat(jan) {
  return /^\d{13}$/.test(jan);
}

/** EAN-13 チェックディジット */
export function hasValidCheckDigit(jan) {
  if (!isValidFormat(jan)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(jan[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10 === Number(jan[12]);
}

/** 商品画像 URL。API を待たずに表示できるよう、フロント側でも組み立てる */
export function imageUrl(jan, index = 1) {
  return `https://cdn.hands.net/images/${jan}-${index}.jpg`;
}
