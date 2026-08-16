/**
 * API 契約。
 *
 * この形はホスティング先に依存しない。Cloudflare Workers から AWS Lambda へ
 * 移行しても、フロントエンドはこの型だけを知っていればよい。
 * ハンズ側の生の HTML 構造をここに漏らさないことが移植性の要。
 */

export type Availability = 'in_stock' | 'out_of_stock' | 'unknown';

export interface Rating {
  value: number;
  count: number;
}

export interface Price {
  /** 税込価格（円） */
  includingTax: number | null;
  /** 本体価格（円） */
  excludingTax: number | null;
}

export interface Goods {
  jan: string;
  name: string;
  description: string | null;
  price: Price;
  currency: 'JPY';
  availability: Availability;
  /** 在庫欄の原文（例: "○ ネット在庫あり"） */
  availabilityLabel: string | null;
  rating: Rating | null;
  /** 商品タグ（例: ["ネットで人気", "店舗で人気"]） */
  tags: string[];
  /** パンくずのカテゴリ（先頭の "ハンズ" は除去済み） */
  categories: string[];
  /** 獲得ポイント */
  point: number | null;
  /** 商品画像 URL。先頭がメイン画像 */
  images: string[];
  sourceUrl: string;
  /** ISO8601。キャッシュ鮮度の判断用 */
  fetchedAt: string;
}

export type ApiErrorCode =
  | 'invalid_jan'
  | 'not_found'
  | 'upstream_error'
  | 'upstream_timeout';

export interface ApiError {
  error: ApiErrorCode;
  message: string;
}
