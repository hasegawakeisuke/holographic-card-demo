/**
 * Cloudflare Workers 用エントリポイント。
 *
 * 静的アセット（public/）は Workers 側が先に処理するため、ここに到達するのは
 * アセットに一致しなかったリクエストだけ = 実質 /api/* のみ。
 *
 * AWS へ移行する際は、このファイルを消さずに src/lambda.ts を追加する:
 *
 *   import { handle } from 'hono/aws-lambda';
 *   import app from './app';
 *   export const handler = handle(app);
 */

import app from './app';

export default app;
