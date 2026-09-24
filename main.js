const menu = document.getElementById('site-menu');
const menuToggle = document.querySelector('.menu-toggle');
const deck = document.querySelector('main');
const slides = [...deck.querySelectorAll(':scope > section')];
const indexLinks = [...menu.querySelectorAll('a[href^="#"]')];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let activeIndex = 0;
let transitioning = false;
let transitionVersion = 0;
let runningAnimations = [];
let transitionTimer;
let pendingDirection = 0;
let wheelGesture = null;
let wheelIdleTimer;
let previewCard = null;
let previewSource = null;
let returnAnimation = null;
let returnTimer;

function dragThreshold() {
  return Math.max(70, Math.min(110, deck.clientHeight * 0.13));
}

function clearPreview() {
  clearTimeout(returnTimer);
  returnAnimation?.cancel();
  returnAnimation = null;
  if (previewCard) {
    previewCard.style.removeProperty('transform');
    previewCard.classList.remove('is-held');
  }
  previewCard = null;
  previewSource = null;
  deck.classList.remove('is-dragging');
}

function followGesture(offsetY, offsetX = 0, source = 'touch') {
  if (transitioning) return;
  clearTimeout(returnTimer);
  returnAnimation?.cancel();
  returnAnimation = null;
  previewCard = slides[activeIndex].querySelector('.story-card') || slides[activeIndex];
  previewSource = source;
  const direction = offsetY < 0 ? 1 : -1;
  const atEdge = activeIndex + direction < 0 || activeIndex + direction >= slides.length;
  const travel = offsetY * (atEdge ? 0.2 : 0.82);
  const sideways = Math.max(-deck.clientWidth * 0.42, Math.min(deck.clientWidth * 0.42, offsetX * 0.9));
  const tilt = reduceMotion.matches ? 0 : Math.max(-1.1, Math.min(1.1, offsetX * 0.012 + offsetY * 0.003));
  previewCard.style.transform = `translate(${sideways}px, ${travel}px) rotate(${tilt}deg)`;
  previewCard.classList.add('is-held');
  deck.classList.add('is-dragging');
}

function settleCard() {
  if (!previewCard || transitioning) return;
  const card = previewCard;
  const from = getComputedStyle(card).transform;
  clearPreview();
  if (reduceMotion.matches) return;
  previewCard = card;
  const animation = card.animate([
    { transform: from }, { transform: 'translate(0, 0) rotate(0deg)' },
  ], { duration: 140, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'both' });
  returnAnimation = animation;
  const finish = () => { if (returnAnimation === animation) clearPreview(); };
  animation.finished.then(finish, () => {});
  returnTimer = setTimeout(finish, 190);
}

function commitDrag(offsetY) {
  const direction = offsetY < 0 ? 1 : -1;
  if (Math.abs(offsetY) < dragThreshold() || activeIndex + direction < 0 || activeIndex + direction >= slides.length) return false;
  requestStep(direction);
  return true;
}

function resetWheel() {
  clearTimeout(wheelIdleTimer);
  wheelGesture = null;
  if (previewSource === 'wheel') settleCard();
}

menuToggle.addEventListener('click', () => {
  resetWheel();
  clearPreview();
  pendingDirection = 0;
  menu.showModal();
  menuToggle.setAttribute('aria-expanded', 'true');
});
menu.addEventListener('close', () => {
  menuToggle.setAttribute('aria-expanded', 'false');
  resetWheel();
});
let menuPointerOutside = false;
function isOutsideMenu(event) {
  const rect = menu.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right ||
    event.clientY < rect.top || event.clientY > rect.bottom;
}
menu.addEventListener('pointerdown', (event) => {
  menuPointerOutside = event.target === menu && isOutsideMenu(event);
});
menu.addEventListener('click', (event) => {
  if (menuPointerOutside && event.target === menu && isOutsideMenu(event)) menu.close();
  menuPointerOutside = false;
});

function updateIndex() {
  indexLinks.forEach((link) => {
    if (link.hash === `#${slides[activeIndex].id}`) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

function goToSlide(index, { force = false, animate = true, focus = true, updateHash = true, resetScroll = false, snap = false } = {}) {
  if (index < 0 || index >= slides.length || (transitioning && !force)) return;
  if (index === activeIndex) {
    if (resetScroll) slides[index].scrollTop = 0;
    if (focus) slides[index].focus({ preventScroll: true });
    return;
  }
  const version = ++transitionVersion;
  clearTimeout(transitionTimer);
  runningAnimations.forEach((animation) => animation.cancel());
  runningAnimations = [];
  slides.forEach((slide) => slide.classList.remove('is-leaving'));
  const outgoing = slides[activeIndex];
  const incoming = slides[index];
  const direction = index > activeIndex ? 1 : -1;
  const outgoingCard = outgoing.querySelector('.story-card') || outgoing;
  const incomingCard = incoming.querySelector('.story-card') || incoming;
  // Continue from the exact position under the finger, without snapping back first.
  const outgoingStart = getComputedStyle(outgoingCard).transform;
  clearPreview();
  activeIndex = index;
  transitioning = true;
  pendingDirection = 0;
  outgoing.classList.remove('is-active');
  outgoing.classList.add('is-leaving');
  incoming.inert = false;
  incoming.removeAttribute('aria-hidden');
  incoming.classList.add('is-active');
  if (resetScroll || direction > 0) incoming.scrollTop = 0;
  if (focus) incoming.focus({ preventScroll: true });
  outgoing.inert = true;
  outgoing.setAttribute('aria-hidden', 'true');
  updateIndex();
  if (updateHash) history.replaceState(null, '', `#${incoming.id}`);

  const finish = () => {
    if (version !== transitionVersion || !transitioning) return;
    clearTimeout(transitionTimer);
    outgoing.classList.remove('is-leaving');
    runningAnimations.forEach((animation) => animation.cancel());
    runningAnimations = [];
    transitioning = false;
    const next = pendingDirection;
    pendingDirection = 0;
    if (next && !menu.open) goToSlide(activeIndex + next, { snap: true });
  };
  if (!animate || reduceMotion.matches) {
    finish();
    return;
  }
  // Move the physical cards a full screen; no opacity or scale animation.
  // Their parent panels stay stationary so wheel targeting does not move away.
  const frame = deck.getBoundingClientRect();
  const outgoingBounds = outgoingCard.getBoundingClientRect();
  const incomingBounds = incomingCard.getBoundingClientRect();
  // Even a long, partially scrolled card must move completely offscreen.
  const outgoingDistance = direction > 0 ? outgoingBounds.bottom - frame.top + 40 : frame.bottom - outgoingBounds.top + 40;
  const incomingDistance = direction > 0 ? frame.bottom - incomingBounds.top + 40 : incomingBounds.bottom - frame.top + 40;
  const timing = { duration: snap ? 190 : 240, easing: 'ease-in-out', fill: 'both' };
  runningAnimations = [
    outgoingCard.animate([
      { transform: outgoingStart },
      { transform: `translateY(${-direction * outgoingDistance}px)` },
    ], timing),
    incomingCard.animate([
      { transform: `translateY(${direction * incomingDistance}px)` },
      { transform: 'translateY(0)' },
    ], timing),
  ];
  Promise.allSettled(runningAnimations.map((animation) => animation.finished)).then(finish);
  // Also release the lock if the browser interrupts an animation.
  transitionTimer = setTimeout(finish, timing.duration + 100);
}

function requestStep(direction) {
  if (transitioning) pendingDirection = direction;
  else goToSlide(activeIndex + direction, { snap: true });
}

indexLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    const index = slides.findIndex((slide) => `#${slide.id}` === link.hash);
    if (index < 0) return;
    event.preventDefault();
    menu.close();
    goToSlide(index, { force: true, resetScroll: true });
  });
});
function syncHash() {
  const index = slides.findIndex((slide) => `#${slide.id}` === location.hash);
  goToSlide(index < 0 ? 0 : index, { force: true, animate: false, focus: false, updateHash: false, resetScroll: true });
}
window.addEventListener('hashchange', syncHash);
syncHash();
updateIndex();

function canReadFurther(direction) {
  const slide = slides[activeIndex];
  return direction > 0 ? slide.scrollTop + slide.clientHeight < slide.scrollHeight - 2 : slide.scrollTop > 2;
}
function scrollCurrentCard(delta) {
  slides[activeIndex].scrollTop += delta;
}

// Capture input on the stationary window/deck, not the card under the cursor.
// Idle or renewed acceleration starts a fresh gesture; a decaying momentum tail
// remains part of the old one. Mouse movement is never needed to re-arm input.
window.addEventListener('wheel', (event) => {
  if (menu.open || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? deck.clientHeight : 1);
  if (!delta) return;
  event.preventDefault();
  const now = performance.now();
  const magnitude = Math.abs(delta);
  const direction = Math.sign(delta);
  const previous = wheelGesture;
  const renewed = previous && now - previous.started > 250 && previous.decayed &&
    magnitude >= Math.max(14, previous.lastMagnitude * 2.2);
  const fresh = !previous || now - previous.lastAt > 160 || direction !== previous.direction || renewed;
  if (fresh) {
    wheelGesture = {
      direction, started: now, lastAt: now, lastMagnitude: magnitude,
      peak: magnitude, decayed: false, total: 0, used: false,
      mode: !transitioning && canReadFurther(direction) ? 'read' : 'switch',
    };
  }
  const gesture = wheelGesture;
  gesture.lastAt = now;
  gesture.lastMagnitude = magnitude;
  gesture.peak = Math.max(gesture.peak, magnitude);
  if (magnitude < gesture.peak * 0.45) gesture.decayed = true;
  clearTimeout(wheelIdleTimer);
  wheelIdleTimer = setTimeout(resetWheel, 170);

  if (gesture.mode === 'read') {
    // Reaching the end does not spill the same gesture into a card change.
    if (!transitioning) scrollCurrentCard(delta);
    return;
  }
  if (gesture.used) return;
  gesture.total += magnitude;
  if (!transitioning) followGesture(-direction * Math.min(gesture.total, dragThreshold()), 0, 'wheel');
  if (gesture.total >= dragThreshold()) {
    gesture.used = true;
    if (activeIndex + direction >= 0 && activeIndex + direction < slides.length) requestStep(direction);
    else settleCard();
  }
}, { passive: false, capture: true });

let touchGesture = null;
let mouseGesture = null;
let suppressClickUntil = 0;
const holdDelay = 160;

function startDrag(x, y, source, interactive = false) {
  resetWheel();
  clearPreview();
  const gesture = { x, y, lastY: y, mode: null, source, interactive, holdTimer: null };
  if (!interactive && !transitioning) {
    // Holding picks the memo up; a quick vertical swipe can still read long text.
    gesture.holdTimer = setTimeout(() => {
      if (gesture.mode || menu.open || transitioning) return;
      gesture.mode = 'switch';
      followGesture(0, 0, source);
    }, holdDelay);
  }
  return gesture;
}
function moveDrag(gesture, x, y) {
  if (gesture.mode === 'committed') return;
  const dx = x - gesture.x;
  const dy = gesture.y - y;
  const step = gesture.lastY - y;
  gesture.lastY = y;
  if (!gesture.mode && Math.max(Math.abs(dx), Math.abs(dy)) > 6) {
    clearTimeout(gesture.holdTimer);
    // A horizontal movement always grabs the card. Only a quick vertical gesture
    // on overflowing content is interpreted as reading instead of picking it up.
    gesture.mode = Math.abs(dy) > Math.abs(dx) && !transitioning && canReadFurther(Math.sign(dy)) ? 'read' : 'switch';
  }
  if (gesture.mode === 'read' && !transitioning) scrollCurrentCard(step);
  if (gesture.mode === 'switch') {
    followGesture(-dy, dx, gesture.source);
    // Horizontal travel never changes cards; only the vertical threshold commits.
    if (commitDrag(-dy)) {
      gesture.mode = 'committed';
      suppressClickUntil = performance.now() + 350;
    }
  }
}
function endDrag(gesture) {
  if (!gesture) return;
  clearTimeout(gesture.holdTimer);
  if (['read', 'switch', 'committed'].includes(gesture.mode)) suppressClickUntil = performance.now() + 350;
  if (gesture.mode !== 'committed') settleCard();
}

deck.addEventListener('touchstart', (event) => {
  if (menu.open || event.touches.length !== 1) {
    endDrag(touchGesture);
    touchGesture = null;
    return;
  }
  const touch = event.touches[0];
  touchGesture = startDrag(touch.clientX, touch.clientY, 'touch', Boolean(event.target.closest('a, button, summary')));
}, { passive: true });
deck.addEventListener('touchmove', (event) => {
  if (!touchGesture || event.touches.length !== 1) {
    endDrag(touchGesture);
    touchGesture = null;
    return;
  }
  const touch = event.touches[0];
  moveDrag(touchGesture, touch.clientX, touch.clientY);
  if (['read', 'switch', 'committed'].includes(touchGesture.mode) && event.cancelable) event.preventDefault();
}, { passive: false });
deck.addEventListener('touchend', (event) => {
  if (touchGesture && event.changedTouches[0]) {
    const touch = event.changedTouches[0];
    moveDrag(touchGesture, touch.clientX, touch.clientY);
  }
  if (touchGesture && ['read', 'switch', 'committed'].includes(touchGesture.mode) && event.cancelable) event.preventDefault();
  endDrag(touchGesture);
  touchGesture = null;
}, { passive: false });
deck.addEventListener('touchcancel', () => {
  endDrag(touchGesture);
  touchGesture = null;
}, { passive: true });

// Desktop users can also pick up the paper directly with a mouse or pen.
deck.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch' || event.button !== 0 || menu.open ||
      event.target.closest('a, button, summary, input, textarea, select')) return;
  mouseGesture = startDrag(event.clientX, event.clientY, 'pointer');
  deck.setPointerCapture(event.pointerId);
});
deck.addEventListener('pointermove', (event) => {
  if (!mouseGesture || event.pointerType === 'touch') return;
  moveDrag(mouseGesture, event.clientX, event.clientY);
});
deck.addEventListener('pointerup', (event) => {
  if (!mouseGesture || event.pointerType === 'touch') return;
  moveDrag(mouseGesture, event.clientX, event.clientY);
  endDrag(mouseGesture);
  mouseGesture = null;
  if (deck.hasPointerCapture(event.pointerId)) deck.releasePointerCapture(event.pointerId);
});
function cancelMouseDrag() {
  endDrag(mouseGesture);
  mouseGesture = null;
}
deck.addEventListener('pointercancel', cancelMouseDrag);
deck.addEventListener('lostpointercapture', cancelMouseDrag);
window.addEventListener('blur', () => {
  endDrag(touchGesture);
  touchGesture = null;
  cancelMouseDrag();
  resetWheel();
});
deck.addEventListener('contextmenu', (event) => {
  if (!event.target.closest('a, button, summary')) event.preventDefault();
});
deck.addEventListener('click', (event) => {
  if (performance.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

window.addEventListener('keydown', (event) => {
  if (menu.open || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const directions = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 };
  let direction = directions[event.key];
  if (event.key === ' ' && !event.target.closest('button, a, summary')) direction = event.shiftKey ? -1 : 1;
  if (direction) {
    event.preventDefault();
    if (!transitioning && canReadFurther(direction)) {
      const distance = event.key.startsWith('Arrow') ? 48 : deck.clientHeight * 0.75;
      scrollCurrentCard(direction * distance);
    } else if (!event.repeat) requestStep(direction);
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    if (!event.repeat) goToSlide(event.key === 'Home' ? 0 : slides.length - 1);
  }
});
