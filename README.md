# pokecard-hands

JANコードを入力すると、[ハンズネットストア](https://hands.net/)の商品をポケモンカード風の
ホログラフィックカードとして表示するデモ。

## 動かす

Node.js 22 以上が必要（`.node-version` で 22.23.2 に固定済み）。

```bash
npm install
npm run dev      # http://localhost:8787
```

**Cloudflare アカウントは不要**。`wrangler dev` は既定でローカルモードで動く。

## デプロイ

```bash
npm run login    # ブラウザで Cloudflare にログイン（ここで初めてアカウントが要る）
npm run deploy   # https://pokecard-hands.<subdomain>.workers.dev に公開される
```

## 構成

```
public/            静的アセット（ビルド不要。そのまま配信される）
  index.html
  styles/card.css  ホログラフィック効果
  styles/app.css   ページレイアウト
  js/main.js       画面制御
  js/card.js       ポインタ追従（CSS変数の書き換えのみ）
  js/jan.js        JANコードの正規化・検証
src/
  index.ts         Cloudflare Workers エントリ
  app.ts           Hono ルート定義（プラットフォーム非依存）
  hands.ts         商品情報の抽出（純関数・依存ゼロ）
  types.ts         API 契約
wrangler.jsonc     Workers 設定（静的アセット + Worker）
```

### 設計方針

**1. 画像とメタ情報を分離する**

商品画像の URL は JAN コードから機械的に決まる（`https://cdn.hands.net/images/{JAN}-{n}.jpg`）。
しかも CORS が `*` で開いており、ホットリンク制限もない。

そのためフロントは API を待たずに画像を表示し、商品名・価格は後追いで流し込む。
結果として体感が速く、**API が落ちてもカード自体は必ず表示される**。

**2. プラットフォーム固有 API を使わない**

将来 AWS へ移す前提で、以下を徹底している。

- HTML 解析は正規表現（`HTMLRewriter` は Cloudflare 専用のため不使用）
- キャッシュは `Cache-Control` ヘッダで表現（`caches.default` や KV は不使用）。
  Cloudflare のエッジも CloudFront も同じヘッダを解釈する
- ルーティングは Hono（Workers と Lambda の両方に公式アダプタがある）

### AWS への移行手順

1. `src/lambda.ts` を追加する（`src/index.ts` は消さない）

   ```ts
   import { handle } from 'hono/aws-lambda';
   import app from './app';
   export const handler = handle(app);
   ```

2. CDK で S3 + CloudFront + Lambda Function URL を構築する
   - デフォルトビヘイビア → S3（`public/` をアップロード）
   - `/api/*` ビヘイビア → Lambda Function URL
   - CachePolicy はオリジンの `Cache-Control` を尊重する設定にする

`src/app.ts` `src/hands.ts` `src/types.ts` と `public/` 配下は**一切変更不要**。

## API

### `GET /api/goods/:jan`

| ステータス | 内容 |
| --- | --- |
| 200 | 商品情報（`src/types.ts` の `Goods`） |
| 400 | `invalid_jan` — 13桁の数字でない |
| 404 | `not_found` — 商品が存在しない |
| 502 | `upstream_error` — ハンズ側への接続失敗 |
| 504 | `upstream_timeout` — ハンズ側が 8 秒以内に応答しない |

レスポンスは `s-maxage=86400`（24時間）でキャッシュされる。同じ JAN で
何度アクセスしても、ハンズ側へのリクエストは 1 日 1 回に抑えられる。

チェックディジットが一致しない場合も取得は試み、`x-jan-checkdigit: mismatch`
ヘッダで警告するだけに留めている（ハンズには JAN 以外の独自コード商品もあるため）。

## レアリティ

税込価格でホロの強さが変わる。

| 価格 | レアリティ |
| --- | --- |
| 〜999円 | common |
| 1,000〜2,999円 | rare |
| 3,000〜9,999円 | holo |
| 10,000〜29,999円 | ultra |
| 30,000円〜 | secret |

## ライセンスと注意

- ホログラフィック効果は [simeydotme/pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css)
  (GPL-3.0) を参考にしている。本プロジェクトも **GPL-3.0**。
- 商品情報・画像の著作権はハンズおよび各メーカーに帰属する。**個人利用・デモ目的**に留めること。
- 取得は 24 時間キャッシュ + User-Agent 明示で行っている。この方針は変更しないこと。
