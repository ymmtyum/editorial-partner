# Implementation Notes: Missing UI Elements

## Overview
The JavaScript code in `main.js` contains complete implementations for several features, but the corresponding HTML UI elements are missing from `index.html`.

## Missing UI Elements

### 1. Tile View System

#### Required HTML Elements (not present):

```html
<!-- Tile toggle button (should be in header area) -->
<button class="tile-toggle" type="button" aria-label="タイル表示に切り替え" aria-expanded="false" aria-controls="card-list">
  <!-- Icon here -->
</button>

<!-- Tile view container (should be after main) -->
<div id="card-list" class="tile-view" hidden aria-hidden="true" role="dialog">
  <button class="tile-close" type="button" aria-label="タイルビューを閉じる">×</button>
  <div class="tile-grid"></div>
</div>
```

#### JavaScript References:
- Line 8: `const tileToggle = document.querySelector('.tile-toggle');`
- Line 10: `const tileView = document.getElementById('card-list');`
- Line 11: `const tileClose = document.querySelector('.tile-close');`
- Line 12: `const tileGrid = document.querySelector('.tile-grid');`
- Line 949-996: `openTiles()` function (complete implementation)
- Line 999-1049: `closeTiles()` function (complete implementation)
- Line 1051: Event listener for tile toggle

#### What the code does:
1. Creates tile buttons dynamically from cards (line 52-69)
2. Animates morphing transition from cards to tiles
3. Applies random angles to tiles
4. Handles tile click to return to specific card
5. Manages ARIA attributes and focus

### 2. "Ton-ton" (Align) Feature

#### Current Implementation:
The feature works via **double-clicking** on the card area:
- First click (within 420ms): Triggers `nudgeStack()` - cards shake
- Second click (within 420ms of first): Triggers `alignStack()` - cards align

#### JavaScript References:
- Line 822-848: `alignStack()` function
- Line 853-869: `nudgeStack()` function  
- Line 896-908: `registerKnock()` function (detects double-click)
- Line 1348: Event listener on deck for click

#### Potential UI Addition:

```html
<!-- Option 1: Explicit button -->
<button class="align-stack-button" type="button" aria-label="カードを整列する">
  トントンする
</button>

<!-- Option 2: Hint text -->
<div class="interaction-hint">
  <small>カードをダブルクリックで整列</small>
</div>
```

#### Alternative: Document the double-click behavior
Since the double-click mechanism is already implemented, you could:
1. Add a tooltip or hint on first visit
2. Include in user guide/help section
3. Add to keyboard shortcuts documentation

## CSS Considerations

The missing HTML elements will need corresponding CSS. The JavaScript already applies these classes dynamically:
- `.is-morphing` - Applied during transitions
- `.is-active` - Applied to active tile view
- `.tile-face` - Face of tile cards
- Various transform and positioning styles via inline styles

## Verification Checklist

To complete the implementation:

- [ ] Add `.tile-toggle` button to HTML
- [ ] Add `#card-list` container to HTML
- [ ] Add `.tile-grid` container to HTML  
- [ ] Add `.tile-close` button to HTML
- [ ] Add CSS styles for tile view elements
- [ ] Test tile view opening
- [ ] Test tile view closing
- [ ] Test tile selection
- [ ] Test tile morphing animations
- [ ] Decide on "ton-ton" UI approach (button vs. documentation)
- [ ] Add CSS for align button (if adding button)
- [ ] Test double-click alignment
- [ ] Add user documentation for interactions

## Current Code Quality

**Positive aspects:**
- Complete functionality in JavaScript
- Proper animation cancellation
- Accessibility attributes managed
- Event cleanup handled
- Reduce-motion support

**Just needs:**
- HTML markup for UI triggers
- CSS styling for those elements
- User-facing documentation

## Suggested Placement

### Tile Toggle Button
Place near the hamburger menu in header:
```html
<p class="hero-brand">エディトリアル・パートナー</p>
<button class="tile-toggle" ...><!-- icon --></button>
<button class="menu-toggle" ...></button>
```

### Tile View Container
Place after `</main>` closing tag:
```html
</main>
<div id="card-list" class="tile-view" ...>
  <!-- tile view content -->
</div>
<button class="back-top" ...>×</button>
```

## Testing After Implementation

Once HTML elements are added:
1. Verify tile toggle button appears
2. Click tile toggle - should morph to tile view
3. Verify all cards appear as tiles
4. Click a tile - should morph back to that card
5. Test tile close button
6. Verify animations are smooth
7. Test keyboard navigation in tile view
8. Test with reduced motion preference
