/**
 * API のルート定義。
 *
 * このファイルはプラットフォーム非依存。Cloudflare 用のエントリ (index.ts) と
 * AWS Lambda 用のエントリ (lambda.ts) が、どちらもこの app をそのまま読み込む。
 * 移行時にここは 1 行も変更しない。
 */

import { Hono } from 'hono';
import { extractGoods, hasValidCheckDigit, isValidJanFormat, productPageUrl } from './hands';
import type { ApiError, Goods } from './types';

/** 取得元に名乗る User-Agent。問い合わせ先を含めるのが作法 */
const USER_AGENT =
  'PokeCardHands/0.1 (holographic card demo; contact via repository issues)';

/** 上流の応答を待つ上限 */
const UPSTREAM_TIMEOUT_MS = 8000;

/**
 * キャッシュ方針。
 * 商品情報はほぼ静的なので強めに効かせる。プラットフォーム固有のキャッシュ API
 * ではなくヘッダで表現しているため、Cloudflare のエッジでも CloudFront でも
 * 同じように解釈される（＝移行時に書き換え不要）。
 */
const CACHE_CONTROL = 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800';

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/goods/:jan', async (c) => {
  const jan = c.req.param('jan').trim();

  if (!isValidJanFormat(jan)) {
    return c.json<ApiError>(
      { error: 'invalid_jan', message: 'JANコードは13桁の数字で指定してください。' },
      400,
    );
  }

  let res: Response;
  try {
    res = await fetch(productPageUrl(jan), {
      headers: {
        'user-agent': USER_AGENT,
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'ja,en;q=0.8',
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return c.json<ApiError>(
      timedOut
        ? { error: 'upstream_timeout', message: 'ハンズネットストアの応答がありませんでした。' }
        : { error: 'upstream_error', message: 'ハンズネットストアへの接続に失敗しました。' },
      timedOut ? 504 : 502,
    );
  }

  if (res.status === 404) {
    return c.json<ApiError>(
      { error: 'not_found', message: 'この JAN コードの商品は見つかりませんでした。' },
      404,
    );
  }
  if (!res.ok) {
    return c.json<ApiError>(
      { error: 'upstream_error', message: `ハンズネットストアが ${res.status} を返しました。` },
      502,
    );
  }

  const html = await res.text();
  const goods: Goods = extractGoods(html, jan, new Date().toISOString());

  return c.json(goods, 200, {
    'cache-control': CACHE_CONTROL,
    // チェックディジット不一致でも取得自体は成功しうるので、警告として返すだけ
    ...(hasValidCheckDigit(jan) ? {} : { 'x-jan-checkdigit': 'mismatch' }),
  });
});

app.notFound((c) =>
  c.req.path.startsWith('/api/')
    ? c.json<ApiError>({ error: 'not_found', message: 'そのAPIは存在しません。' }, 404)
    : c.text('Not Found', 404),
);

export default app;
