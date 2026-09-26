# カードシステム設計分析レポート

## 実行日時
2026年9月26日

## 分析対象
- `styles.css`: カードのビジュアルスタイル、影、レイアウト
- `main.js`: カードのインタラクション、アニメーション、状態管理
- `index.html`: カード構造

---

## 1. カードの角度システム

### 現在の実装
```javascript
const stackLooks = [
  { x: -7, y: 4, angle: -1.15 },
  { x: 6, y: 1, angle: .72 },
  { x: -3, y: 5, angle: -.42 },
  { x: 8, y: 3, angle: 1.02 },
  { x: -6, y: 1, angle: -.78 },
  { x: 4, y: 5, angle: .48 },
  { x: -8, y: 2, angle: -.94 },
  { x: 3, y: 3, angle: .28 },
];
```

### 問題点 ❌

#### 1.1 インデックス計算の矛盾
**問題**: `lookFor(index)` 関数が `index % stackLooks.length` を使用
```javascript
function lookFor(index) {
  return stackLooks[index % stackLooks.length];
}
```

**影響**:
- カード9枚目（index=8）は1枚目（index=0）と同じ角度を持つ
- 8枚のカードしかないため現在は問題ないが、拡張性に欠ける

**推奨**: カード数が固定であれば、この計算は適切

---

#### 1.2 Neat Mode と通常モードの切り替え

**neat mode の適用箇所**:
- `alignStack()`: カードを揃える操作で `.is-neat` を追加
- `commitEnteredCard()`: 入場時に neat mode をクリア
- `commitNextCard()`: 次のカードへ移動時に neat mode をクリア

**Transform 計算の矛盾**:
```javascript
// restingTransform では neat を考慮
function restingTransform(index, extraY = 0) {
  if (isNeat(index)) return `translate(0, ${extraY}px) rotate(0deg)`;
  return stackTransform(index, extraY);
}

// しかし CSS 変数は常に設定されている
chapter.style.setProperty('--stack-angle', `${look.angle}deg`);
```

**問題**: CSS変数とJavaScript計算の二重管理
- CSS変数: `--stack-x`, `--stack-y`, `--stack-angle` は常に設定
- JS計算: `isNeat()` で動的に角度を0に変更

**推奨**: CSS変数を neat mode 時に更新するか、CSSで `.is-neat` クラスを使って上書きする

---

## 2. ドロップシャドウの状態遷移

### 影のバリエーション

#### 2.1 通常状態
```css
.story-card {
  box-shadow: 0 2px 3px #2d342f0a, 0 14px 34px -18px #2d342f45;
}
```

#### 2.2 ホールド状態
```css
.story-card.is-held {
  box-shadow: 0 6px 10px #2d342f0a, 0 28px 52px -16px #2d342f50;
}
```

#### 2.3 スタック状態
```css
.chapter.is-stacked:not(.is-sheet) .story-card {
  box-shadow: 0 2px 4px #2d342f12, 0 18px 38px -21px #2d342f66;
}
```

#### 2.4 タイルビュー
```css
.tile-card {
  box-shadow: 0 2px 3px #2d342f09, 0 14px 30px -22px #2d342f60;
}
```

### 問題点 ❌

#### 2.1 影の優先度の矛盾
**問題**: `.is-held` と `.is-stacked` が同時に適用される可能性

CSSの詳細度:
```css
.story-card.is-held { ... }                              /* 詳細度: 0,2,0 */
.chapter.is-stacked:not(.is-sheet) .story-card { ... }   /* 詳細度: 0,3,0 */
```

**結果**: スタック状態の影が常に優先される

**推奨**: 状態の相互排他を保証するか、詳細度を調整

---

#### 2.2 トランジション中の影の不整合

**問題**: トランジション中に影のスムーズな変化がない
```css
.story-card {
  transition: box-shadow .2s ease-out;
}
```

しかし:
```css
main.is-dragging .story-card,
main.is-dragging .card-stack {
  transition: none; /* トランジションを無効化 */
}
```

**影響**:
- ドラッグ中は影が即座に変化（滑らかさがない）
- ドラッグ終了時に影が遅れて変化

**推奨**: ドラッグ中も影のトランジションを維持

---

## 3. スワイプ/ドラッグジェスチャーの競合

### 3つのジェスチャーハンドラー

#### 3.1 Wheel ハンドラー
```javascript
window.addEventListener('wheel', (event) => { ... });
```

#### 3.2 Touch ハンドラー
```javascript
deck.addEventListener('touchstart', ...);
deck.addEventListener('touchmove', ...);
deck.addEventListener('touchend', ...);
```

#### 3.3 Pointer ハンドラー
```javascript
deck.addEventListener('pointerdown', ...);
deck.addEventListener('pointermove', ...);
deck.addEventListener('pointerup', ...);
```

### 問題点 ❌

#### 3.1 タッチイベントの重複発火

**問題**: タッチデバイスでは `touch` イベントと `pointer` イベントが両方発火

**現在の対策**:
```javascript
deck.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch' || ...) return; // タッチを除外
});
```

**問題**: `touchstart` が `passive: true` で登録されているため、スクロール防止ができない箇所がある

**推奨**: イベント処理の統一化を検討

---

#### 3.2 Wheel と Touch/Pointer の競合

**問題**: Wheelイベントハンドラーが `resetWheel()` を呼び出すが、Touch/Pointerハンドラーも同様の処理を行う

```javascript
function startDrag(x, y, interactive, source) {
  resetWheel(false); // Wheelをリセット
  captureLivePose();
  ...
}
```

**しかし**: Wheelハンドラー自体は他のジェスチャーを考慮していない

**推奨**: グローバルなジェスチャー管理システムの導入

---

#### 3.3 ジェスチャーモードの状態管理

**問題**: 複数の状態変数が散在
- `wheelGesture`
- `touchGesture`
- `pointerGesture`
- `tracking`
- `transitioning`
- `dragIntent`

**矛盾の例**:
```javascript
// touchGesture が null になった後も tracking が true のまま
touchGesture = null;
// tracking のクリアを忘れる可能性
```

**推奨**: 単一のジェスチャー状態オブジェクトに統合

---

## 4. カード描画処理のトランジション

### トランジションシステム

#### 4.1 Spring アニメーション
```javascript
function springPose(targetX, targetY, velocity, done) {
  // 物理ベースのスプリングアニメーション
  vx += (-220 * (x - targetX) - 26 * vx) * dt;
  vy += (-220 * (y - targetY) - 26 * vy) * dt;
}
```

#### 4.2 WAAPI (Web Animations API)
```javascript
card.animate([...], { duration, easing, fill: 'both' });
```

#### 4.3 CSS Transitions
```css
.story-card {
  transition: box-shadow .2s ease-out;
}
```

### 問題点 ❌

#### 4.1 アニメーションのキャンセル処理の不整合

**問題**: Spring と WAAPI の混在
```javascript
function cancelTransition() {
  clearTimeout(transitionTimer);
  runningAnimations.forEach((animation) => animation.cancel()); // WAAPI
  // しかし springFrame はここでキャンセルされない
}

function stopSpring() {
  if (springFrame) cancelAnimationFrame(springFrame);
  springFrame = 0;
  // しかし runningAnimations はクリアされない
}
```

**影響**:
- Spring アニメーション中に WAAPI トランジションが開始されると、両方が同時に実行される可能性
- `transitionVersion` の管理が不完全

**推奨**: 統一されたアニメーションキャンセル関数

---

#### 4.2 Transform の合成順序

**問題**: Transform の適用順序が一貫していない

```javascript
// パターン1: translate → rotate
`translate(${x}px, ${y}px) rotate(${angle}deg)`

// パターン2: translate3d → scale → rotate
`translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy}) rotate(${angle}deg)`
```

**影響**:
- 回転の原点が変わる
- モーフィングトランジション時に不自然な動きが発生する可能性

**推奨**: Transform の順序を統一し、`transform-origin` を明示的に設定

---

#### 4.3 Reduce Motion 対応の不整合

**問題**: `prefers-reduced-motion` の扱いが統一されていない

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

しかし JavaScript では:
```javascript
if (reduceMotion.matches) {
  finish(); // アニメーションをスキップ
} else {
  playTransition(...); // アニメーション実行
}
```

**矛盾**: CSS で全トランジションを無効化しているのに、JavaScript でトランジションを実行しようとする

**推奨**: CSS の `!important` を削除し、JavaScript で制御

---

## 5. その他の設計上の問題

### 5.1 CSS変数とインラインスタイルの混在

**問題**:
- CSS変数: `--stack-x`, `--stack-y`, `--stack-angle`, `--drag-x`, `--drag-y`
- インラインスタイル: `transform` プロパティを直接設定

**矛盾の例**:
```javascript
// CSS変数を使う場合
card.style.setProperty('--drag-x', '0px');
card.style.setProperty('--drag-y', `${y}px`);

// 直接transformを設定する場合
card.style.transform = restingTransform(index);
```

**問題**: どちらが優先されるかが不明確

**推奨**: 一貫したアプローチを選択

---

### 5.2 Z-index の管理

**問題**: Z-index が CSS変数とクラスで二重に管理されている

```css
.chapter { z-index: var(--stack-level, 1); }
.chapter.is-active, .chapter.is-preview, .chapter.is-leaving {
  z-index: var(--stack-level, 1) !important;
}
```

```javascript
chapter.style.setProperty('--stack-level', String(index + 1));
```

**矛盾**: `!important` があるため、CSS変数の値が反映されない可能性

---

## 6. 推奨される修正

### 優先度: 高

1. **ドロップシャドウのトランジション修正**
   - ドラッグ中も影のトランジションを維持
   - 状態の優先度を明確化

2. **アニメーションキャンセル処理の統一**
   - `cancelTransition()` と `stopSpring()` を統合
   - `transitionVersion` の管理を改善

3. **Transform の合成順序の統一**
   - すべての transform で同じ順序を使用
   - `transform-origin` を明示的に設定

### 優先度: 中

4. **Neat Mode の実装改善**
   - CSS変数を neat mode 時に更新
   - または CSS で `.is-neat` による上書きを追加

5. **ジェスチャー管理の統一**
   - グローバルなジェスチャー状態オブジェクトを導入
   - イベントハンドラーの優先度を明確化

### 優先度: 低

6. **CSS変数とインラインスタイルの統一**
   - どちらか一方に統一

7. **Reduce Motion 対応の改善**
   - CSS の `!important` を削除
   - JavaScript で完全に制御

---

## 結論

カードシステムは全体的によく設計されていますが、以下の矛盾が見つかりました:

1. **ドロップシャドウ**: トランジション中の不整合
2. **アニメーション**: Spring と WAAPI の混在によるキャンセル処理の問題
3. **Transform**: 合成順序の不統一
4. **ジェスチャー**: 複数のハンドラーの競合管理が不完全
5. **状態管理**: CSS と JavaScript の二重管理

これらの問題は、ユーザー体験に大きな影響を与える可能性は低いですが、コードの保守性と拡張性を向上させるために修正することを推奨します。
