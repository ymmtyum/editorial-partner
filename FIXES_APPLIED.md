# カードシステム修正ログ

## 実施日
2026年9月26日

## 適用された修正

### 1. ドロップシャドウのトランジション改善 ✅

**問題**: ドラッグ中に影のトランジションが無効化され、影が突然変化していた

**修正内容**:
```css
/* 修正前 */
main.is-dragging .story-card,
main.is-dragging .card-stack { transition: none; }

/* 修正後 */
main.is-dragging .story-card { transition: box-shadow .2s ease-out; }
main.is-dragging .card-stack { transition: none; }
```

また、`.story-card.is-held` にも明示的にトランジションを追加:
```css
.story-card.is-held {
  box-shadow: 0 6px 10px #2d342f0a, 0 28px 52px -16px #2d342f50;
  transition: box-shadow .2s ease-out;
}
```

**効果**: ドラッグ中も影がスムーズに変化するようになった

---

### 2. アニメーションキャンセル処理の統一 ✅

**問題**: Spring アニメーションと WAAPI アニメーションのキャンセル処理が別々で、競合が発生する可能性があった

**修正内容**:
```javascript
// 新しい統一関数を追加
function cancelAllAnimations() {
  stopSpring();  // Spring アニメーションをキャンセル
  clearTimeout(transitionTimer);
  runningAnimations.forEach((animation) => animation.cancel());  // WAAPI をキャンセル
  runningAnimations = [];
  cardStack.classList.remove('is-morph-source');
  tileView?.classList.remove('is-morphing');
  tileGrid?.querySelectorAll('.is-morphing').forEach((button) => button.classList.remove('is-morphing'));
  transitionVersion += 1;
  transitioning = false;
}

// 既存の関数を更新
function cancelTransition() {
  cancelAllAnimations();
}
```

**stopSpring 関数の簡素化**:
```javascript
// 修正前
function stopSpring() {
  if (springFrame) cancelAnimationFrame(springFrame);
  springFrame = 0;
  transitionVersion += 1;  // 重複した処理
  transitioning = false;    // 重複した処理
}

// 修正後
function stopSpring() {
  if (springFrame) cancelAnimationFrame(springFrame);
  springFrame = 0;
}
```

**全関数の更新**:
以下の関数で `cancelAllAnimations()` を使用するように統一:
- `captureLivePose()`
- `clearPreviewInstant()`
- `enterStack()`
- `addCard()`
- `removeCard()`
- `stashBundle()`
- `restoreBundle()`
- `syncFromHash()`

**効果**: アニメーションの状態管理が一元化され、競合が発生しにくくなった

---

### 3. Neat Mode のCSS対応改善 ✅

**問題**: Neat mode の角度がJavaScriptでのみ計算されており、CSS変数との整合性が不明確だった

**修正内容**:
```css
/* 修正前 */
.chapter.is-neat, .chapter.is-neat.is-preview {
  --rest-x: 0px;
  --rest-y: 0px;
  --rest-angle: 0deg;
}
.chapter.is-preview {
  --rest-x: var(--stack-x, 0px);
  --rest-y: var(--stack-y, 0px);
  --rest-angle: var(--stack-angle, 0deg);
}

/* 修正後 - より明確な優先順位 */
.chapter {
  --rest-x: var(--stack-x, 0px);
  --rest-y: var(--stack-y, 0px);
  --rest-angle: var(--stack-angle, 0deg);
}
.chapter.is-neat {
  --rest-x: 0px;
  --rest-y: 0px;
  --rest-angle: 0deg;
}
.chapter.is-neat.is-preview {
  --rest-x: 0px;
  --rest-y: 0px;
  --rest-angle: 0deg;
}
.chapter.is-preview:not(.is-neat) {
  --rest-x: var(--stack-x, 0px);
  --rest-y: var(--stack-y, 0px);
  --rest-angle: var(--stack-angle, 0deg);
}
```

**効果**: Neat mode とプレビュー状態の組み合わせが明確になった

---

### 4. Reduce Motion 対応の改善 ✅

**問題**: CSS で `!important` を使っていたため、JavaScript の制御と競合していた

**修正内容**:
```css
/* 修正前 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
}

/* 修正後 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms;
    transition-duration: 0.01ms;
  }
}
```

**効果**:
- JavaScript でのアニメーション制御が優先される
- アクセシビリティ設定が尊重される
- より柔軟なアニメーション制御が可能

---

## 修正によって改善された点

### パフォーマンス
- アニメーションのキャンセル処理が効率化
- 不要な再計算が減少

### ビジュアル品質
- ドラッグ中の影の変化がスムーズに
- 状態遷移がより自然に

### コードの保守性
- アニメーション管理が一元化
- CSS と JavaScript の役割分担が明確に
- デバッグが容易に

### アクセシビリティ
- Reduce Motion 設定への対応が改善
- より柔軟な制御が可能に

---

## 今後の改善提案

### 優先度: 中
1. **Transform の合成順序の統一**
   - 現在: `translate` → `rotate` と `translate3d` → `scale` → `rotate` が混在
   - 推奨: すべての transform で順序を統一

2. **Z-index の管理改善**
   - 現在: CSS変数と `!important` が混在
   - 推奨: CSS変数のみで管理

### 優先度: 低
3. **ジェスチャー管理の統一**
   - 現在: `wheelGesture`, `touchGesture`, `pointerGesture` が別々
   - 推奨: 単一のジェスチャー状態オブジェクトに統合

4. **CSS変数とインラインスタイルの統一**
   - 現在: 両方が混在
   - 推奨: どちらか一方に統一

---

## 検証項目

以下の動作を手動テストで確認する必要があります:

- [ ] カードのドラッグ時の影の変化がスムーズ
- [ ] カードの切り替えアニメーションがスムーズ
- [ ] 「トントンする」機能が正常に動作
- [ ] タイルビューへの切り替えが正常
- [ ] Reduce Motion 設定時の動作
- [ ] 各種ブラウザでの互換性
- [ ] タッチデバイスでの動作
- [ ] マウスホイールでの操作

---

## ファイル変更サマリー

### styles.css
- ドロップシャドウのトランジション追加
- Neat mode の CSS 優先順位改善
- Reduce Motion 対応の改善

### main.js
- `cancelAllAnimations()` 関数の追加
- `stopSpring()` 関数の簡素化
- 各種関数でのアニメーションキャンセル処理の統一

### 新規ファイル
- `CARD_SYSTEM_ANALYSIS.md`: 詳細な分析レポート
- `FIXES_APPLIED.md`: このファイル（修正ログ）
