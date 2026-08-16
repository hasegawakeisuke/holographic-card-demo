/**
 * ハンズネットストアからの商品情報抽出。
 *
 * 依存パッケージゼロ・Web 標準 API のみ。Cloudflare Workers / AWS Lambda /
 * Node.js のいずれでも無改変で動く。HTMLRewriter のようなプラットフォーム固有
 * API は意図的に使っていない（移植時に書き直しになるため）。
 */

import type { Availability, Goods, Price, Rating } from './types';

export const HANDS_ORIGIN = 'https://hands.net';
export const CDN_ORIGIN = 'https://cdn.hands.net';

/** 商品ページ URL */
export function productPageUrl(jan: string): string {
  return `${HANDS_ORIGIN}/goods/${jan}/`;
}

/** 商品画像 URL。index は 1 始まりで 1 がメイン画像 */
export function imageUrl(jan: string, index = 1): string {
  return `${CDN_ORIGIN}/images/${jan}-${index}.jpg`;
}

// ---------------------------------------------------------------- JAN 検証

/** 13 桁の数字であるか */
export function isValidJanFormat(jan: string): boolean {
  return /^\d{13}$/.test(jan);
}

/**
 * EAN-13 チェックディジット検証。
 * ハンズには JAN 以外の独自コードの商品も存在しうるため、呼び出し側では
 * これを「弾く条件」ではなく「警告を出す条件」として扱っている。
 */
export function hasValidCheckDigit(jan: string): boolean {
  if (!isValidJanFormat(jan)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(jan[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10 === Number(jan[12]);
}

// ------------------------------------------------------------ HTML ヘルパ

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  yen: '¥',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** タグを剥がして実体参照を戻し、空白を整える */
function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function first(re: RegExp, html: string): string | null {
  const m = re.exec(html);
  return m ? (m[1] ?? null) : null;
}

/** "3,800" → 3800 */
function toNumber(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function meta(html: string, property: string): string | null {
  // property= と name= の両方、属性順の入れ替わりにも耐える
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`,
    'i',
  );
  const tag = re.exec(html)?.[0];
  if (!tag) return null;
  const content = first(/content=["']([^"']*)["']/i, tag);
  return content ? decodeEntities(content).trim() : null;
}

// ---------------------------------------------------------------- 個別抽出

function extractName(html: string, jan: string): string {
  const h1 = first(/<h1[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i, html);
  if (h1) {
    const name = text(h1);
    if (name) return name;
  }
  // フォールバック: og:title から店舗名サフィックスを除去
  const og = meta(html, 'og:title');
  if (og) {
    const name = og.replace(/[｜|]\s*【?ハンズネットストア】?\s*$/, '').trim();
    if (name) return name;
  }
  return jan;
}

function extractDescription(html: string): string | null {
  const p = first(/<p[^>]*class=["'][^"']*\bdescription\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i, html);
  if (p) {
    const desc = text(p);
    if (desc) return desc;
  }
  return meta(html, 'og:description');
}

/**
 * 価格は #item-info 配下にある。おすすめ商品欄にも .price が多数あるため、
 * スコープを限定しないと別商品の価格を拾ってしまう。
 */
function extractPrice(html: string): Price {
  const start = html.search(/id=["']item-info["']/i);
  if (start < 0) return { includingTax: null, excludingTax: null };
  const scope = html.slice(start, start + 3000);

  const includingTax = toNumber(
    first(/class=["'][^"']*\binclude\b[^"']*["'][^>]*>\s*(?:<span[^>]*>)?\s*([\d,]+)/i, scope),
  );
  const excludingTax = toNumber(
    first(/class=["'][^"']*\bexclude\b[^"']*["'][^>]*>\s*(?:<span[^>]*>)?\s*([\d,]+)/i, scope),
  );
  return { includingTax, excludingTax };
}

function extractRating(html: string): Rating | null {
  const value = Number(first(/<span[^>]*class=["']rating["'][^>]*>\s*([\d.]+)\s*<\/span>/i, html));
  const count = Number(first(/<span[^>]*class=["']reviewNum["'][^>]*>\s*(\d+)\s*<\/span>/i, html));
  if (!Number.isFinite(value) || !Number.isFinite(count)) return null;
  return { value, count };
}

function extractAvailability(html: string): {
  availability: Availability;
  availabilityLabel: string | null;
} {
  const start = html.search(/class=["'][^"']*\bstockStatus\b[^"']*["']/i);
  if (start < 0) return { availability: 'unknown', availabilityLabel: null };
  const scope = html.slice(start, start + 1200);

  const m = /<span[^>]*class=["']stock-([a-z]+)["'][^>]*>([\s\S]*?)<\/span>/i.exec(scope);
  if (!m) return { availability: 'unknown', availabilityLabel: null };

  const kind = m[1].toLowerCase();
  const label = text(m[2]) || null;
  // "enough" / "few" などは在庫あり、"none" / "out" は在庫なし
  const availability: Availability =
    kind === 'none' || kind === 'out' || kind === 'nothing'
      ? 'out_of_stock'
      : 'in_stock';
  return { availability, availabilityLabel: label };
}

function extractTags(html: string): string[] {
  const ul = first(/<ul[^>]*class=["'][^"']*\btag\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i, html);
  if (!ul) return [];
  const tags: string[] = [];
  for (const m of ul.matchAll(/<li[^>]*class=["'][^"']*\bmodTagItem\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    const t = text(m[1]);
    if (t) tags.push(t);
  }
  return tags;
}

/**
 * パンくずの範囲だけを切り出す。
 * itemprop="name" はページ内の別ブロックにも現れるため、スコープを絞らないと
 * 無関係なカテゴリが混ざる（実際に混ざっていた）。
 */
function breadcrumbScope(html: string): string {
  const start = html.search(/id=["']modBreadcrumbs["']/i);
  if (start < 0) return '';
  const end = html.indexOf('</ol>', start);
  return end < 0 ? html.slice(start, start + 2000) : html.slice(start, end);
}

function extractCategories(html: string): string[] {
  const scope = breadcrumbScope(html);
  const names: string[] = [];
  for (const m of scope.matchAll(/<span[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>/gi)) {
    const t = text(m[1]);
    // 先頭の "ハンズ" はサイト名なのでカテゴリではない
    if (t && t !== 'ハンズ' && !names.includes(t)) names.push(t);
  }
  return names;
}

/** パンくずのリンクから /cate/{slug}/ を上位→下位の順に取り出す */
function extractCategorySlugs(html: string): string[] {
  const scope = breadcrumbScope(html);
  const slugs: string[] = [];
  for (const m of scope.matchAll(/href=["'][^"']*\/cate\/([a-z0-9-]+(?:\/[a-z0-9-]+)*)\/?["']/gi)) {
    const leaf = m[1].split('/').filter(Boolean).at(-1);
    if (leaf && !slugs.includes(leaf)) slugs.push(leaf);
  }
  return slugs;
}

function extractPoint(html: string): number | null {
  return toNumber(first(/獲得ポイント[：:]\s*([\d,]+)\s*ポイント/, decodeEntities(html)));
}

/**
 * 商品画像。ギャラリーの img が静的 HTML に含まれているので、
 * 連番を総当たりで叩く必要はない。
 */
function extractImages(html: string, jan: string): string[] {
  const found = new Set<number>();
  const re = new RegExp(`${CDN_ORIGIN}/images/${jan}-(\\d+)\\.jpg`, 'g');
  for (const m of html.matchAll(re)) found.add(Number(m[1]));

  // メイン画像は必ず先頭に置く（og:image と一致する）
  found.add(1);
  return [...found].sort((a, b) => a - b).map((n) => imageUrl(jan, n));
}

// ---------------------------------------------------------------- 公開関数

/**
 * 商品ページの HTML から正規化済みの商品情報を組み立てる。
 * 純関数なのでテストしやすく、実行環境にも依存しない。
 */
export function extractGoods(html: string, jan: string, fetchedAt: string): Goods {
  const { availability, availabilityLabel } = extractAvailability(html);
  return {
    jan,
    name: extractName(html, jan),
    description: extractDescription(html),
    price: extractPrice(html),
    currency: 'JPY',
    availability,
    availabilityLabel,
    rating: extractRating(html),
    tags: extractTags(html),
    categories: extractCategories(html),
    categorySlugs: extractCategorySlugs(html),
    point: extractPoint(html),
    images: extractImages(html, jan),
    sourceUrl: productPageUrl(jan),
    fetchedAt,
  };
}
