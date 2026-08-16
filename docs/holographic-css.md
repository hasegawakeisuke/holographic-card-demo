# ホログラフィックCSSの仕組み

[public/styles/card.css](../public/styles/card.css) と [public/js/card.js](../public/js/card.js) の技術解説。

画像やWebGLを一切使わず、**グラデーション・合成モード・3D変形**の3つだけでトレカの箔を再現している。
JavaScript がやるのはカスタムプロパティを4つ書き込むことだけで、見た目の計算はすべてCSS側にある。
そのため演出を変えたいときは CSS だけを触ればよい。

---

## 全体像 — 4枚の板を重ねる

カードは4層の重ね合わせでできている。すべて同じ位置に `position: absolute; inset: 0` で置かれ、
重なり順は `z-index` で固定している。

```
                         ┌───────────────────────┐
   ④ .card__glare        │ 光沢（overlay）        │  z-index: 3
                         ├───────────────────────┤
   ③ .card__shine--dodge │ 虹色（color-dodge）    │  z-index: 2
                         ├───────────────────────┤
   ② .card__shine        │ 虹色（multiply）       │  z-index: 2
                         ├───────────────────────┤
   ① .card__face         │ 商品画像・文字         │  （通常フロー）
                         └───────────────────────┘
                              ↑ すべて .card__inner の子。
                                .card__inner が rotateX/rotateY で傾く
```

層を分けるのは、**合成モードが層ごとにしか指定できない**ため。
1枚の要素に「白地には色を乗せ、暗部は光らせる」を同時にやらせることはできない。

---

## ① 立体感 — perspective と rotate

カードが傾いて見えるのは `rotateX()` / `rotateY()` の2行だけ。
重要なのは**回転させる要素の親に `perspective` を置く**こと。
これが無いと回転しても平行投影のまま潰れて見え、奥行きが出ない。

```css
.card {
  perspective: 1400px;   /* 視点の距離。小さいほど強い遠近感 */
  isolation: isolate;    /* 合成をカード内で完結させる（⑥参照） */
}

.card__inner {
  transform-style: preserve-3d;
  transform: rotateX(var(--rx)) rotateY(var(--ry));
  transition: transform .6s cubic-bezier(.23, 1, .32, 1);
  will-change: transform;
}
```

| プロパティ | 役割 |
| --- | --- |
| `perspective` | 子要素に遠近法を与える。値は「画面から視点までの距離」で、小さいほど歪みが強い |
| `transform-style` | `preserve-3d` で子要素も同じ3D空間に置く。既定の `flat` だと子が平面に潰れる |
| `rotateX` / `rotateY` | 横方向のポインタ移動を Y軸回転に、縦方向を X軸回転に割り当てる（符号は反転） |
| `will-change` | 変形をGPU側に持ち上げ、毎フレームの再描画を避ける |
| `transition` | ポインタが離れたときだけ効かせる |

追従中は `.is-active` を付けて `transition` を切っている。
付けたままだと指の動きにカードが遅れて付いてきて、粘ついた感触になる。

```css
.card.is-active .card__inner {
  transition: box-shadow .2s ease;   /* transform の transition を外す */
}
```

---

## ② 追従 — JavaScriptは変数を書くだけ

JavaScript の仕事は `pointermove` でカスタムプロパティを更新することだけ。
要素のスタイルを直接いじらない。

```js
// public/js/card.js
const cx = px - 0.5, cy = py - 0.5;          // 中心を原点にした -0.5〜0.5

cardEl.style.setProperty('--mx', `${px * 100}%`);
cardEl.style.setProperty('--my', `${py * 100}%`);
cardEl.style.setProperty('--ry', `${ cx * MAX_TILT_DEG * 2}deg`);
cardEl.style.setProperty('--rx', `${-cy * MAX_TILT_DEG * 2}deg`);
```

| 変数 | 使われ先 |
| --- | --- |
| `--mx` / `--my` | 虹色層の `background-position`、光沢の `radial-gradient` の中心 |
| `--rx` / `--ry` | `transform` の回転角 |
| `--o` | 効果全体の不透明度。ホバーで 0 → 1 |
| `--rest` | 静止時の下限値。0 にすると触るまでただの写真に見えてしまう |
| `--hyp` | 中心からの距離（0〜1）。端ほど効果を強める用 |

更新は `requestAnimationFrame` で1フレームに1回へ間引いている。
`pointermove` は毎秒120回以上発火することがあり、そのたびに書き込むと無駄になる。

---

## ③ 虹色 — グラデーション＋合成モード

虹色そのものは `repeating-linear-gradient` で作った**ただの縞模様**。
これを `mix-blend-mode` で下の層と混ぜることで、光を反射しているように見せている。
`background-size` を 200% にして余白を作り、`background-position` をポインタ位置に
連動させることで縞が流れる。

```css
.card__shine {
  background-image: repeating-linear-gradient(-22deg,
      #ff7773 4%, #ffed5f 10%, #a8ff5f 16%,
      #83fff7 22%, #7894ff 28%, #d875ff 34%, #ff7773 40%);
  background-size: 200% 200%;
  background-position: calc(var(--mx) * 1.2) calc(var(--my) * 1.2);
  mix-blend-mode: multiply;
  filter: saturate(1.4) contrast(.9);
}
```

### なぜ2層必要か

本家 pokemon-cards-css は `color-dodge` の1層で成立する。ポケカの絵柄は色が濃く、暗部が多いからだ。
ところが**ハンズの商品写真は白背景**で、`color-dodge` は明るい部分をさらに明るくする性質があるため、
白地では完全に飛んで何も見えなくなる。そこで性質が逆の `multiply` を重ねている。

| 合成モード | 性質 | この実装での役割 |
| --- | --- | --- |
| `multiply` | 掛け算。明るい部分ほど下の色に染まる | 白い背景に虹色を乗せる |
| `color-dodge` | 除算。下が明るいほど飛ぶ、暗部が発光する | 枠や被写体の影を光らせる |
| `overlay` | 下の明暗を保ったままコントラストを付ける | ポインタ位置の光沢 |

2層目は角度（`98deg` と `-22deg`）と背景位置の向き（`calc(100% - var(--mx))`）を
1層目と変えてある。同じ向きだと2枚が完全に重なり、単に濃くなるだけで深みが出ない。

`filter` は合成の**前処理**。`color-dodge` 側に `brightness(.85) contrast(1.6)` を掛けて、
飛びすぎないよう素材を沈めてから混ぜている。

---

## ④ 光沢 — 中心が動く放射グラデーション

`radial-gradient` の**中心座標に変数を直接埋め込む**だけ。
中心が白、外周が黒のグラデーションを `overlay` で合成すると、
中心は明るく周辺は締まって見え、球面で光を反射しているように感じられる。

```css
.card__glare {
  background-image: radial-gradient(farthest-corner circle at var(--mx) var(--my),
      rgba(255,255,255,.85)  8%,
      rgba(255,255,255,.5)  20%,
      rgba(0,0,0,.35)      100%);
  mix-blend-mode: overlay;
  opacity: calc(var(--o) * var(--glare-opacity));
}
```

`farthest-corner` は「最も遠い角までを半径とする」指定。
中心が端に寄っても光が途中で途切れず、カード全面を覆い続ける。

---

## ⑤ 強さの制御 — calc と max だけで分岐する

レアリティやタイプによる差は、**すべて変数の掛け算**で表している。
CSSに条件分岐は無いが、`calc()` と `max()` を使えば
「静止時は最低これだけ光り、ホバー時はここまで強くなる」を1行で書ける。

```css
opacity: calc(max(var(--rest), var(--o)) * var(--shine-opacity) * .85);
/*                ↑静止時の下限  ↑追従値    ↑レアリティで変わる係数 */
```

そのうえで、**同じ詳細度のセレクタを記述順で競わせて**優先順位を作っている。

```css
.card[data-rarity='ultra'] { --shine-opacity: .78; }  /* 光り方だけを決める */
.card[data-type='fire']    { --frame-b: #c2461c; }    /* 後に書いた方が勝つ */
.card[data-ex='true']      { --frame-b: #a8781f; }    /* さらに上書き */
```

役割分担は次のとおり。

| | 決めるもの |
| --- | --- |
| タイプ | 枠の色 `--frame-*`、カード面の地色 `--face-*` |
| レアリティ | ホロの強さ `--shine-opacity` / `--glare-opacity` |
| ex | 枠を金一色に上書き（タイプの色より優先） |

---

## ⑥ 合成の閉じ込め — isolation: isolate

`mix-blend-mode` は既定では**ページ全体の背景まで巻き込んで**混ざる。
カードの外の背景色が変わると箔の見え方まで変わってしまうし、
背景に敷いたグラデーションと干渉して意図しない色になる。

`.card` に `isolation: isolate` を置くと、そこが合成の境界（スタッキングコンテキスト）になり、
混ざる相手はカード内部の層だけに限定される。**1行だが、これが無いと成立しない。**

> `overflow: hidden` や `filter`、`transform` も同じく合成コンテキストを作る。
> 意図せず効果が閉じ込められて「なぜか混ざらない」ときは、
> たいてい祖先のどれかがこれらを持っている。

---

## ⑦ 静止時のゆらぎ

ホバーしないと何も起きない作りだと、初見やスクリーンショットでただの商品写真に見える。
そこで**触っていないときだけ**、背景位置をゆっくり往復させている。

```css
.card:not(.is-active) .card__shine {
  animation: shine-drift 9s ease-in-out infinite alternate;
}
@keyframes shine-drift {
  from { background-position: 12% 18%; }
  to   { background-position: 88% 82%; }
}
```

`:not(.is-active)` で限定しているのは、追従中にアニメーションが `background-position` を
奪い合うのを防ぐため。`alternate` により終端で巻き戻らず、折り返して自然に見える。

---

## 全面絵柄レイアウト

`data-layout="full-art"` は**マークアップを変えずCSSだけ**で切り替えている。

```css
.card[data-layout='full-art'] .card__window {
  position: absolute; inset: 0;   /* 画像をカード全面へ */
  aspect-ratio: auto;
  z-index: 0;
}
.card[data-layout='full-art'] .card__face::before {
  /* 文字が載る上端と下端だけを暗くする */
  background: linear-gradient(180deg,
    rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 40%,
    rgba(0,0,0,0) 52%, rgba(0,0,0,.72) 100%);
  /* 地色が見えないぶん、下端にタイプ色を差し込む */
  box-shadow: inset 0 -7em 6em -3.5em var(--frame-b);
}
```

タイプ色の差し込みに `color-mix()` を使っていないのは、非対応環境で
`background` の宣言ごと無効になり、暗幕が消えて文字が読めなくなるため。
`inset box-shadow` のぼかしで減衰させれば単独の宣言で済み、失敗しても暗幕は残る。

---

## 支えている細かい指定

| プロパティ | 効かせている場所 |
| --- | --- |
| `aspect-ratio: 63/88` | 実物のカードの縦横比。幅が変わっても形が崩れない |
| `container-type: inline-size` | 文字サイズを `cqw`（カード幅基準）で決め、縮小時も比率を保つ |
| `border-image` | 画像枠の縁取りにグラデーションを流す。`border-color` では単色しか置けない |
| `border-radius: 4.5% / 3.2%` | 縦横で別々の半径。実物の角丸は真円ではない |
| `object-fit: cover` | 正方形の商品写真を、カード比率の枠へ切り抜いて充填 |
| `flex: 1` + `min-height: 0` | 画像枠に余った高さを全部渡す。わざの行数が商品ごとに変わっても崩れない |
| `-webkit-line-clamp` | 長い商品名・説明文を指定行数で打ち切る |
| `prefers-reduced-motion` | 回転とアニメーションを停止。効果自体は残す |

---

## ライセンス

効果の考え方は [simeydotme/pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css)（GPL-3.0）を
参考にしている。2層構成・タイプ別配色・商品写真への適応は本プロジェクト独自の実装だが、
参照して書いた以上は派生物とみなし、本プロジェクトも GPL-3.0 とする。
