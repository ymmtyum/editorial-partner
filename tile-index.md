# タイル一覧（いったん停止）

カード表示中の右下にあった 3×3 の一覧ボタンと、押したあとの正方形タイルは、画面からも操作からも外してある。スタイルと開閉の処理は残してあるので、HTML を戻すと再び使える。

## いまの画面

- 右上のハンバーガーはトップだけ。目次は `#site-menu`。
- カード表示中の中央下の × は `#top` に戻る。
- カードの移動は上下だけ。上で次、下で前。横には動かない。

## 戻すとき

`index.html` の `.back-top` の直前に、次を戻す。

```html
<button class="tile-toggle" type="button" aria-label="カード一覧を開く" aria-controls="card-list" aria-expanded="false" hidden>
  <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
</button>
<section id="card-list" class="tile-view" aria-labelledby="card-list-title" aria-hidden="true" hidden>
  <header class="tile-header">
    <h2 id="card-list-title">INDEX</h2>
    <button class="tile-close" type="button" aria-label="カード一覧を閉じる">×</button>
  </header>
  <nav class="tile-grid" aria-label="カードを選ぶ"></nav>
</section>
```

`main.js` は、この要素があるときだけタイルを作ってクリックを受け取る。要素が無いときは何もしない。

## 動き

- 起動時に各 `.chapter` の `.story-card` を複製し、`.tile-face` を付けて `.tile-grid` へ置く。複製側の `id` は外す。
- カード表示中だけ `.tile-toggle` を出す。押すと `openTiles`。閉じるボタン、Escape、タイル選択で `closeTiles`。
- 開くときと閉じるときは、カードの矩形とタイルの矩形のあいだを `transform` でつなぐ。角度は `--tile-angle`。動きを減らす設定では即時に切り替える。
- タイルを二度叩くと、カード側と同じ整列（トントン）になる。
- 見た目は `styles.css` の `.tile-toggle` `.tile-view` `.tile-grid` `.tile-card`。`.tile-view.is-active { opacity: 1 }` を消すと一覧が透明のままになる。
