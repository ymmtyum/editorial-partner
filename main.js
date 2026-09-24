const menu = document.getElementById('site-menu');
const menuToggle = document.querySelector('.menu-toggle');
const deck = document.querySelector('main');
const hero = document.getElementById('top');
const chapters = [...deck.querySelectorAll(':scope > .chapter')];
const indexLinks = [...menu.querySelectorAll('a[href^="#"]')];
const tileToggle = document.querySelector('.tile-toggle');
const tileView = document.getElementById('card-index');
const tileClose = document.querySelector('.tile-close');
const tileGrid = document.querySelector('.tile-grid');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let view = 'top';
let activeIndex = -1;
let transitioning = false;
let transitionVersion = 0;
let runningAnimations = [];
let transitionTimer;
let wheelGesture = null;
let wheelIdleTimer;
let preview = null;
let touchGesture = null;
let pointerGesture = null;
let suppressClickUntil = 0;
const holdDelay = 150;

function verticalThreshold() {
  return Math.max(66, Math.min(104, deck.clientHeight * 0.12));
}

function horizontalThreshold() {
  return Math.max(82, Math.min(150, deck.clientWidth * 0.18));
}

function cardFor(index) {
  return chapters[index]?.querySelector('.story-card');
}

function setHash(id) {
  const hash = `#${id}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function updateControls(nextView) {
  view = nextView;
  document.body.dataset.view = nextView;
  const onTop = nextView === 'top';
  menuToggle.hidden = !onTop;
  menuToggle.classList.toggle('is-hiding', !onTop);
  tileToggle.hidden = nextView !== 'card';
  tileToggle.setAttribute('aria-expanded', nextView === 'tiles' ? 'true' : 'false');
  hero.inert = !onTop;
  if (onTop) hero.removeAttribute('aria-hidden');
  else hero.setAttribute('aria-hidden', 'true');
}

function updateCurrentLinks() {
  const currentHash = activeIndex < 0 ? '#top' : `#${chapters[activeIndex].id}`;
  indexLinks.forEach((link) => {
    if (link.hash === currentHash) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  [...tileGrid.querySelectorAll('.tile-card')].forEach((button, index) => {
    if (index === activeIndex) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
}

function showChapterElement(index, className = 'is-active') {
  const chapter = chapters[index];
  chapter.classList.add(className);
  chapter.inert = className !== 'is-active';
  chapter.removeAttribute('aria-hidden');
}

function hideChapterElement(index) {
  const chapter = chapters[index];
  if (!chapter) return;
  chapter.classList.remove('is-active', 'is-preview', 'is-leaving');
  chapter.inert = true;
  chapter.setAttribute('aria-hidden', 'true');
  cardFor(index)?.style.removeProperty('transform');
}

function cancelTransition() {
  clearTimeout(transitionTimer);
  runningAnimations.forEach((animation) => animation.cancel());
  runningAnimations = [];
  transitionVersion += 1;
  transitioning = false;
}

function playTransition(animations, duration, finish) {
  const version = ++transitionVersion;
  transitioning = true;
  runningAnimations = animations;
  let finished = false;
  const complete = () => {
    if (finished || version !== transitionVersion) return;
    finished = true;
    clearTimeout(transitionTimer);
    runningAnimations.forEach((animation) => animation.cancel());
    runningAnimations = [];
    transitioning = false;
    finish();
  };
  Promise.allSettled(animations.map((animation) => animation.finished)).then(complete);
  transitionTimer = setTimeout(complete, duration + 100);
}

function clearPreviewStyles() {
  if (!preview) return;
  preview.card.classList.remove('is-held');
  preview.card.style.removeProperty('transform');
  if (preview.kind === 'top') hideChapterElement(preview.index);
  hero.style.removeProperty('opacity');
  deck.classList.remove('is-dragging');
  preview = null;
}

function beginTopPreview(distance = 0) {
  if (transitioning || view !== 'top') return;
  const index = 0;
  const card = cardFor(index);
  if (!preview) {
    showChapterElement(index, 'is-preview');
    preview = { kind: 'top', index, card };
  }
  const progress = Math.min(1, Math.max(0, distance / verticalThreshold()));
  const startY = deck.clientHeight + 48;
  const y = Math.max(0, startY - distance * 5.2);
  card.style.transform = `translateY(${y}px)`;
  hero.style.opacity = String(1 - progress * 0.82);
  card.classList.add('is-held');
  deck.classList.add('is-dragging');
}

function followCard(dx, dy, axis) {
  if (transitioning || view !== 'card' || activeIndex < 0) return;
  const card = cardFor(activeIndex);
  preview = preview || { kind: 'card', index: activeIndex, card };
  const isHorizontal = axis === 'horizontal';
  const x = isHorizontal ? Math.max(-deck.clientWidth * .72, Math.min(deck.clientWidth * .72, dx * .92)) : dx * .16;
  const y = isHorizontal ? dy * .08 : dy * .82;
  const tilt = reduceMotion.matches ? 0 : Math.max(-2.2, Math.min(2.2, x * .012));
  card.style.transform = `translate(${x}px, ${y}px) rotate(${tilt}deg)`;
  if (isHorizontal) {
    const reveal = Math.min(.96, Math.abs(dx) / horizontalThreshold() * .88);
    hero.style.opacity = String(reveal);
  }
  card.classList.add('is-held');
  deck.classList.add('is-dragging');
}

function settlePreview() {
  if (!preview || transitioning) return;
  const current = preview;
  const from = getComputedStyle(current.card).transform;
  const heroFrom = getComputedStyle(hero).opacity;
  const targetY = current.kind === 'top' ? deck.clientHeight + 48 : 0;
  const duration = reduceMotion.matches ? 0 : 150;
  if (!duration) {
    clearPreviewStyles();
    return;
  }
  const cardAnimation = current.card.animate(
    [{ transform: from }, { transform: current.kind === 'top' ? `translateY(${targetY}px)` : 'translate(0, 0) rotate(0deg)' }],
    { duration, easing: 'ease-in-out', fill: 'both' },
  );
  const heroAnimation = hero.animate(
    [{ opacity: heroFrom }, { opacity: current.kind === 'top' ? 1 : 0 }],
    { duration, easing: 'ease-in-out', fill: 'both' },
  );
  playTransition([cardAnimation, heroAnimation], duration, clearPreviewStyles);
}

function enterCard(index, { animate = true, focus = true, updateHash = true } = {}) {
  if (index < 0 || index >= chapters.length) return;
  cancelTransition();
  const chapter = chapters[index];
  const card = cardFor(index);
  const cameFromPreview = preview?.kind === 'top' && preview.index === index;
  const startTransform = cameFromPreview ? getComputedStyle(card).transform : `translateY(${deck.clientHeight + 48}px)`;
  preview?.card.classList.remove('is-held');
  preview = null;
  deck.classList.remove('is-dragging');
  chapters.forEach((_, chapterIndex) => {
    if (chapterIndex !== index) hideChapterElement(chapterIndex);
  });
  chapter.classList.remove('is-preview', 'is-leaving');
  showChapterElement(index);
  chapter.scrollTop = 0;
  activeIndex = index;
  menuToggle.hidden = true;
  tileToggle.hidden = true;
  hero.inert = true;
  hero.setAttribute('aria-hidden', 'true');
  document.body.dataset.view = 'transition';
  updateCurrentLinks();
  if (updateHash) setHash(chapter.id);

  const finish = () => {
    card.style.removeProperty('transform');
    hero.style.opacity = '0';
    updateControls('card');
    if (focus) chapter.focus({ preventScroll: true });
  };
  if (!animate || reduceMotion.matches) {
    finish();
    return;
  }
  const duration = 220;
  const cardAnimation = card.animate(
    [{ transform: startTransform }, { transform: 'translateY(0)' }],
    { duration, easing: 'ease-in-out', fill: 'both' },
  );
  const heroAnimation = hero.animate(
    [{ opacity: getComputedStyle(hero).opacity }, { opacity: 0 }],
    { duration, easing: 'ease-in-out', fill: 'both' },
  );
  playTransition([cardAnimation, heroAnimation], duration, finish);
}

function returnToTop(direction = 1, { animate = true, focus = true, updateHash = true } = {}) {
  if (activeIndex < 0) return;
  cancelTransition();
  const oldIndex = activeIndex;
  const chapter = chapters[oldIndex];
  const card = cardFor(oldIndex);
  const startTransform = getComputedStyle(card).transform;
  const bounds = card.getBoundingClientRect();
  const distance = deck.clientWidth + bounds.width;
  preview?.card.classList.remove('is-held');
  preview = null;
  deck.classList.remove('is-dragging');
  menuToggle.hidden = true;
  tileToggle.hidden = true;
  tileView.hidden = true;
  tileView.classList.remove('is-active');
  document.body.dataset.view = 'transition';
  hero.inert = true;
  hero.removeAttribute('aria-hidden');
  if (updateHash) setHash('top');

  const finish = () => {
    hideChapterElement(oldIndex);
    activeIndex = -1;
    card.style.removeProperty('transform');
    hero.style.removeProperty('opacity');
    updateControls('top');
    updateCurrentLinks();
    if (focus) hero.focus({ preventScroll: true });
  };
  if (!animate || reduceMotion.matches) {
    finish();
    return;
  }
  const duration = 210;
  const cardAnimation = card.animate(
    [{ transform: startTransform }, { transform: `translateX(${direction * distance}px) rotate(${direction * 2.5}deg)` }],
    { duration, easing: 'ease-in-out', fill: 'both' },
  );
  const heroAnimation = hero.animate(
    [{ opacity: getComputedStyle(hero).opacity }, { opacity: 1 }],
    { duration, easing: 'ease-in-out', fill: 'both' },
  );
  playTransition([cardAnimation, heroAnimation], duration, finish);
}

function switchCard(index, { animate = true, focus = true, updateHash = true } = {}) {
  if (index < 0 || index >= chapters.length || index === activeIndex) return;
  if (activeIndex < 0) {
    enterCard(index, { animate, focus, updateHash });
    return;
  }
  cancelTransition();
  const oldIndex = activeIndex;
  const direction = index > oldIndex ? 1 : -1;
  const outgoing = chapters[oldIndex];
  const incoming = chapters[index];
  const outgoingCard = cardFor(oldIndex);
  const incomingCard = cardFor(index);
  const outgoingStart = getComputedStyle(outgoingCard).transform;
  preview?.card.classList.remove('is-held');
  preview = null;
  deck.classList.remove('is-dragging');
  outgoing.classList.remove('is-active');
  outgoing.classList.add('is-leaving');
  outgoing.inert = true;
  outgoing.setAttribute('aria-hidden', 'true');
  showChapterElement(index);
  incoming.scrollTop = 0;
  activeIndex = index;
  updateCurrentLinks();
  if (updateHash) setHash(incoming.id);

  const frame = deck.getBoundingClientRect();
  const outgoingBounds = outgoingCard.getBoundingClientRect();
  const incomingBounds = incomingCard.getBoundingClientRect();
  const outgoingDistance = direction > 0 ? outgoingBounds.bottom - frame.top + 40 : frame.bottom - outgoingBounds.top + 40;
  const incomingDistance = direction > 0 ? frame.bottom - incomingBounds.top + 40 : incomingBounds.bottom - frame.top + 40;
  const finish = () => {
    hideChapterElement(oldIndex);
    incomingCard.style.removeProperty('transform');
    if (focus) incoming.focus({ preventScroll: true });
  };
  if (!animate || reduceMotion.matches) {
    finish();
    return;
  }
  const duration = 190;
  const outgoingAnimation = outgoingCard.animate(
    [{ transform: outgoingStart }, { transform: `translateY(${-direction * outgoingDistance}px)` }],
    { duration, easing: 'ease-in-out', fill: 'both' },
  );
  const incomingAnimation = incomingCard.animate(
    [{ transform: `translateY(${direction * incomingDistance}px)` }, { transform: 'translateY(0)' }],
    { duration, easing: 'ease-in-out', fill: 'both' },
  );
  playTransition([outgoingAnimation, incomingAnimation], duration, finish);
}

function canReadFurther(direction) {
  if (view !== 'card' || activeIndex < 0) return false;
  const chapter = chapters[activeIndex];
  return direction > 0
    ? chapter.scrollTop + chapter.clientHeight < chapter.scrollHeight - 2
    : chapter.scrollTop > 2;
}

function scrollCurrentCard(delta) {
  if (activeIndex >= 0) chapters[activeIndex].scrollTop += delta;
}

function openTiles() {
  if (view !== 'card' || transitioning) return;
  resetWheel();
  tileView.hidden = false;
  tileView.setAttribute('aria-hidden', 'false');
  chapters[activeIndex].inert = true;
  updateControls('tiles');
  const finish = () => tileView.querySelector('.tile-card[aria-current="true"]')?.focus({ preventScroll: true });
  tileView.classList.add('is-active');
  if (reduceMotion.matches) {
    finish();
    return;
  }
  tileView.animate(
    [{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'scale(1)' }],
    { duration: 170, easing: 'ease-in-out' },
  ).finished.then(finish, () => {});
}

function closeTiles({ focus = true } = {}) {
  if (view !== 'tiles') return;
  tileView.classList.remove('is-active');
  tileView.hidden = true;
  tileView.setAttribute('aria-hidden', 'true');
  chapters[activeIndex].inert = false;
  updateControls('card');
  if (focus) tileToggle.focus({ preventScroll: true });
}

chapters.forEach((chapter, index) => {
  const title = chapter.querySelector('h2')?.textContent.trim() || '';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tile-card';
  button.dataset.index = String(index);
  button.innerHTML = `<span class="tile-number">#${String(index + 1).padStart(2, '0')}</span><span class="tile-title"></span>`;
  button.querySelector('.tile-title').textContent = title;
  button.setAttribute('aria-label', `${String(index + 1).padStart(2, '0')} ${title}へ移動`);
  tileGrid.append(button);
});

tileToggle.addEventListener('click', openTiles);
tileClose.addEventListener('click', () => closeTiles());
tileGrid.addEventListener('click', (event) => {
  const button = event.target.closest('.tile-card');
  if (!button) return;
  const index = Number(button.dataset.index);
  closeTiles({ focus: false });
  switchCard(index, { focus: true });
});

menuToggle.addEventListener('click', () => {
  resetWheel();
  menu.showModal();
  menuToggle.setAttribute('aria-expanded', 'true');
});
menu.addEventListener('close', () => menuToggle.setAttribute('aria-expanded', 'false'));
let menuPointerOutside = false;
function isOutsideMenu(event) {
  const rect = menu.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
}
menu.addEventListener('pointerdown', (event) => {
  menuPointerOutside = event.target === menu && isOutsideMenu(event);
});
menu.addEventListener('click', (event) => {
  if (menuPointerOutside && event.target === menu && isOutsideMenu(event)) menu.close();
  menuPointerOutside = false;
});
indexLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    menu.close();
    if (link.hash === '#top') returnToTop(1);
    else {
      const index = chapters.findIndex((chapter) => `#${chapter.id}` === link.hash);
      if (index >= 0) enterCard(index);
    }
  });
});

function resetWheel() {
  clearTimeout(wheelIdleTimer);
  wheelGesture = null;
  if (preview) settlePreview();
}

window.addEventListener('wheel', (event) => {
  if (menu.open || view === 'tiles' || event.ctrlKey) return;
  const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? deck.clientHeight : 1;
  const dx = event.deltaX * factor;
  const dy = event.deltaY * factor;
  if (!dx && !dy) return;
  event.preventDefault();
  const axis = Math.abs(dx) > Math.abs(dy) * 1.08 ? 'horizontal' : 'vertical';
  const delta = axis === 'horizontal' ? dx : dy;
  const now = performance.now();
  const direction = Math.sign(delta);
  const previous = wheelGesture;
  const fresh = !previous || now - previous.lastAt > 150 || previous.axis !== axis || previous.direction !== direction;
  if (fresh) {
    wheelGesture = { axis, direction, lastAt: now, total: 0, used: false,
      mode: axis === 'vertical' && view === 'card' && canReadFurther(direction) ? 'read' : 'switch' };
  }
  const gesture = wheelGesture;
  gesture.lastAt = now;
  clearTimeout(wheelIdleTimer);
  wheelIdleTimer = setTimeout(resetWheel, 170);
  if (gesture.mode === 'read') {
    scrollCurrentCard(dy);
    return;
  }
  if (gesture.used || transitioning) return;
  gesture.total += Math.abs(delta);

  if (view === 'top') {
    if (axis !== 'vertical' || direction < 0) return;
    beginTopPreview(Math.min(gesture.total, verticalThreshold()));
    if (gesture.total >= verticalThreshold()) {
      gesture.used = true;
      enterCard(0);
    }
    return;
  }
  if (view !== 'card') return;
  if (axis === 'horizontal') {
    const offset = -direction * Math.min(gesture.total, horizontalThreshold());
    followCard(offset, 0, 'horizontal');
    if (gesture.total >= horizontalThreshold()) {
      gesture.used = true;
      returnToTop(Math.sign(offset) || 1);
    }
    return;
  }
  const nextIndex = activeIndex + direction;
  followCard(0, -direction * Math.min(gesture.total, verticalThreshold()), 'vertical');
  if (gesture.total >= verticalThreshold()) {
    gesture.used = true;
    if (nextIndex >= 0 && nextIndex < chapters.length) switchCard(nextIndex);
    else settlePreview();
  }
}, { passive: false, capture: true });

function startDrag(x, y, interactive) {
  resetWheel();
  const gesture = { x, y, lastY: y, mode: null, interactive, held: false, holdTimer: null };
  if (!interactive && view === 'card' && !transitioning) {
    gesture.holdTimer = setTimeout(() => {
      if (gesture.mode || transitioning || view !== 'card') return;
      gesture.held = true;
      followCard(0, 0, 'vertical');
    }, holdDelay);
  }
  return gesture;
}

function moveDrag(gesture, x, y) {
  if (!gesture || gesture.mode === 'committed' || transitioning) return;
  const dx = x - gesture.x;
  const dy = y - gesture.y;
  const step = gesture.lastY - y;
  gesture.lastY = y;
  if (!gesture.mode && Math.max(Math.abs(dx), Math.abs(dy)) > 6) {
    clearTimeout(gesture.holdTimer);
    if (view === 'top') gesture.mode = 'top';
    else if (view === 'card' && Math.abs(dx) > Math.abs(dy) * .82) gesture.mode = 'horizontal';
    else if (view === 'card' && canReadFurther(dy < 0 ? 1 : -1) && !gesture.held) gesture.mode = 'read';
    else gesture.mode = 'vertical';
  }
  if (gesture.mode === 'read') scrollCurrentCard(step);
  if (gesture.mode === 'top') {
    beginTopPreview(Math.max(0, -dy));
    if (-dy >= verticalThreshold()) {
      gesture.mode = 'committed';
      suppressClickUntil = performance.now() + 320;
      enterCard(0);
    }
  }
  if (gesture.mode === 'horizontal') {
    followCard(dx, dy, 'horizontal');
    if (Math.abs(dx) >= horizontalThreshold()) {
      gesture.mode = 'committed';
      suppressClickUntil = performance.now() + 320;
      returnToTop(Math.sign(dx) || 1);
    }
  }
  if (gesture.mode === 'vertical') {
    followCard(dx, dy, 'vertical');
    const direction = dy < 0 ? 1 : -1;
    if (Math.abs(dy) >= verticalThreshold() && activeIndex + direction >= 0 && activeIndex + direction < chapters.length) {
      gesture.mode = 'committed';
      suppressClickUntil = performance.now() + 320;
      switchCard(activeIndex + direction);
    }
  }
}

function endDrag(gesture) {
  if (!gesture) return;
  clearTimeout(gesture.holdTimer);
  if (gesture.mode && gesture.mode !== 'committed') suppressClickUntil = performance.now() + 320;
  if (gesture.mode !== 'committed') settlePreview();
}

deck.addEventListener('touchstart', (event) => {
  if (menu.open || view === 'tiles' || event.touches.length !== 1) return;
  const touch = event.touches[0];
  touchGesture = startDrag(touch.clientX, touch.clientY, Boolean(event.target.closest('a, button, summary')));
}, { passive: true });
deck.addEventListener('touchmove', (event) => {
  if (!touchGesture || event.touches.length !== 1) return;
  const touch = event.touches[0];
  moveDrag(touchGesture, touch.clientX, touch.clientY);
  if (touchGesture.mode && touchGesture.mode !== 'read' && event.cancelable) event.preventDefault();
}, { passive: false });
deck.addEventListener('touchend', (event) => {
  if (touchGesture && event.changedTouches[0]) {
    const touch = event.changedTouches[0];
    moveDrag(touchGesture, touch.clientX, touch.clientY);
  }
  endDrag(touchGesture);
  touchGesture = null;
}, { passive: false });
deck.addEventListener('touchcancel', () => {
  endDrag(touchGesture);
  touchGesture = null;
}, { passive: true });

deck.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch' || event.button !== 0 || menu.open || view === 'tiles' ||
      event.target.closest('a, button, summary, input, textarea, select')) return;
  pointerGesture = startDrag(event.clientX, event.clientY, false);
  deck.setPointerCapture(event.pointerId);
});
deck.addEventListener('pointermove', (event) => {
  if (!pointerGesture || event.pointerType === 'touch') return;
  moveDrag(pointerGesture, event.clientX, event.clientY);
});
deck.addEventListener('pointerup', (event) => {
  if (!pointerGesture || event.pointerType === 'touch') return;
  moveDrag(pointerGesture, event.clientX, event.clientY);
  endDrag(pointerGesture);
  pointerGesture = null;
  if (deck.hasPointerCapture(event.pointerId)) deck.releasePointerCapture(event.pointerId);
});
function cancelPointerDrag() {
  endDrag(pointerGesture);
  pointerGesture = null;
}
deck.addEventListener('pointercancel', cancelPointerDrag);
deck.addEventListener('lostpointercapture', cancelPointerDrag);
deck.addEventListener('contextmenu', (event) => {
  if (!event.target.closest('a, button, summary')) event.preventDefault();
});
deck.addEventListener('click', (event) => {
  if (performance.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

window.addEventListener('blur', () => {
  endDrag(touchGesture);
  touchGesture = null;
  cancelPointerDrag();
  resetWheel();
});

window.addEventListener('keydown', (event) => {
  if (menu.open || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (view === 'tiles') {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeTiles();
    }
    return;
  }
  if (view === 'top' && ['ArrowDown', 'PageDown', ' '].includes(event.key)) {
    event.preventDefault();
    if (!event.repeat) enterCard(0);
    return;
  }
  if (view !== 'card') return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Escape' || event.key === 'Home') {
    event.preventDefault();
    if (!event.repeat) returnToTop(event.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
  const direction = ['ArrowDown', 'PageDown', ' '].includes(event.key) ? 1 : ['ArrowUp', 'PageUp'].includes(event.key) ? -1 : 0;
  if (!direction) return;
  event.preventDefault();
  if (canReadFurther(direction)) {
    const distance = event.key.startsWith('Arrow') ? 48 : deck.clientHeight * .72;
    scrollCurrentCard(direction * distance);
  } else if (!event.repeat) {
    switchCard(activeIndex + direction);
  }
});

function syncFromHash() {
  cancelTransition();
  clearPreviewStyles();
  const index = chapters.findIndex((chapter) => `#${chapter.id}` === location.hash);
  chapters.forEach((_, chapterIndex) => hideChapterElement(chapterIndex));
  tileView.hidden = true;
  tileView.classList.remove('is-active');
  tileView.setAttribute('aria-hidden', 'true');
  if (index < 0) {
    activeIndex = -1;
    hero.style.removeProperty('opacity');
    updateControls('top');
  } else {
    activeIndex = index;
    showChapterElement(index);
    hero.style.opacity = '0';
    updateControls('card');
  }
  updateCurrentLinks();
}

window.addEventListener('hashchange', syncFromHash);
syncFromHash();
