const menu = document.getElementById('site-menu');
const menuToggle = document.querySelector('.menu-toggle');
const deck = document.querySelector('main');
const hero = document.getElementById('top');
const cardStack = document.querySelector('.card-stack');
const chapters = [...cardStack.querySelectorAll(':scope > .chapter')];
const indexLinks = [...menu.querySelectorAll('a[href^="#"]')];
const tileToggle = document.querySelector('.tile-toggle');
const tileView = document.getElementById('card-list');
const tileClose = document.querySelector('.tile-close');
const tileGrid = document.querySelector('.tile-grid');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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

let view = 'top';
let activeIndex = -1;
let stashSide = 0;
let transitioning = false;
let transitionVersion = 0;
let runningAnimations = [];
let transitionTimer;
let preview = null;
let wheelGesture = null;
let wheelIdleTimer;
let touchGesture = null;
let pointerGesture = null;
let suppressClickUntil = 0;

chapters.forEach((chapter, index) => {
  const look = stackLooks[index];
  chapter.style.setProperty('--stack-level', String(index + 1));
  chapter.style.setProperty('--stack-x', `${look.x}px`);
  chapter.style.setProperty('--stack-y', `${look.y}px`);
  chapter.style.setProperty('--stack-angle', `${look.angle}deg`);

  const title = chapter.querySelector('h2')?.textContent.trim() || '';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tile-card';
  button.dataset.index = String(index);
  button.innerHTML = `<span class="card-meta"><span class="card-number">${String(index + 1).padStart(2, '0')}</span></span><span class="tile-card-copy"><span class="tile-heading"></span></span>`;
  button.querySelector('.tile-heading').textContent = title;
  button.setAttribute('aria-label', `${String(index + 1).padStart(2, '0')} ${title}へ移動`);
  tileGrid.append(button);

  if (index >= 2) {
    const meta = chapter.querySelector('.card-meta');
    const label = meta.lastElementChild;
    const actions = document.createElement('span');
    actions.className = 'card-meta-actions';
    const alignButton = document.createElement('button');
    alignButton.type = 'button';
    alignButton.className = 'align-stack';
    alignButton.textContent = 'トントンする';
    alignButton.setAttribute('aria-label', '積み重なったカードを揃える');
    actions.append(label, alignButton);
    meta.append(actions);
    alignButton.addEventListener('click', alignStack);
  }
});

function verticalThreshold() {
  return Math.max(110, Math.min(180, deck.clientHeight * .2));
}

function horizontalThreshold() {
  return Math.max(130, Math.min(240, deck.clientWidth * .24));
}

function bundleDistance() {
  return deck.clientWidth + Math.min(1100, deck.clientWidth * .8);
}

function cardFor(index) {
  return chapters[index]?.querySelector('.story-card');
}

function cardScrollFor(index) {
  return chapters[index]?.querySelector('.card-copy');
}

function stackTransform(index, extraY = 0) {
  const look = stackLooks[index];
  return `translate(${look.x}px, ${look.y + extraY}px) rotate(${look.angle}deg)`;
}

function restingTransform(index, extraY = 0) {
  if (cardStack.classList.contains('is-aligned')) return `translate(0, ${extraY}px) rotate(0deg)`;
  return stackTransform(index, extraY);
}

function restingAngle(index) {
  return cardStack.classList.contains('is-aligned') ? 0 : stackLooks[index].angle;
}

function setHash(id) {
  const hash = `#${id}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function updateCurrentLinks() {
  const currentHash = view === 'top' || activeIndex < 0 ? '#top' : `#${chapters[activeIndex].id}`;
  indexLinks.forEach((link) => {
    if (link.hash === currentHash) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  [...tileGrid.querySelectorAll('.tile-card')].forEach((button, index) => {
    if (index === activeIndex) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
}

function updateControls(nextView) {
  view = nextView;
  document.body.dataset.view = nextView;
  const onTop = nextView === 'top';
  menuToggle.hidden = !onTop;
  tileToggle.hidden = nextView !== 'card';
  tileToggle.setAttribute('aria-expanded', nextView === 'tiles' ? 'true' : 'false');
  hero.inert = !onTop;
  hero.toggleAttribute('aria-hidden', !onTop);
  chapters.forEach((chapter, index) => {
    const isCurrent = index === activeIndex && nextView === 'card';
    chapter.inert = !isCurrent;
    chapter.toggleAttribute('aria-hidden', !isCurrent);
  });
  updateCurrentLinks();
}

function hideChapter(index) {
  const chapter = chapters[index];
  if (!chapter) return;
  chapter.classList.remove('is-active', 'is-stacked', 'is-preview', 'is-leaving');
  chapter.inert = true;
  chapter.setAttribute('aria-hidden', 'true');
  cardFor(index).style.removeProperty('transform');
}

function renderStack(index) {
  chapters.forEach((chapter, chapterIndex) => {
    chapter.classList.remove('is-active', 'is-stacked', 'is-preview', 'is-leaving');
    cardFor(chapterIndex).style.removeProperty('transform');
    if (chapterIndex < index) chapter.classList.add('is-stacked');
    else if (chapterIndex === index) chapter.classList.add('is-active');
    chapter.inert = true;
    chapter.setAttribute('aria-hidden', 'true');
  });
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
  let done = false;
  const complete = () => {
    if (done || version !== transitionVersion) return;
    done = true;
    clearTimeout(transitionTimer);
    runningAnimations.forEach((animation) => animation.cancel());
    runningAnimations = [];
    transitioning = false;
    finish();
  };
  Promise.allSettled(animations.map((animation) => animation.finished)).then(complete);
  transitionTimer = setTimeout(complete, duration + 120);
}

function clearPreviewInstant() {
  if (!preview) return;
  if (preview.kind === 'next') hideChapter(preview.index);
  if (preview.card) {
    preview.card.style.removeProperty('transform');
    preview.card.classList.remove('is-held');
  }
  if (preview.kind === 'bundle') cardStack.style.transform = 'none';
  if (preview.kind === 'restore') {
    cardStack.style.transform = `translateX(${stashSide * bundleDistance()}px) rotate(${stashSide * 2}deg)`;
  }
  hero.style.opacity = view === 'top' ? '1' : '0';
  cardStack.classList.remove('is-held');
  deck.classList.remove('is-dragging');
  preview = null;
}

function settlePreview() {
  if (!preview || transitioning) return;
  const current = preview;
  const duration = reduceMotion.matches ? 0 : 170;
  if (!duration) {
    clearPreviewInstant();
    return;
  }
  const animations = [];
  if (current.kind === 'next') {
    animations.push(current.card.animate(
      [{ transform: getComputedStyle(current.card).transform }, { transform: restingTransform(current.index, deck.clientHeight + 60) }],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ));
  } else if (current.kind === 'previous') {
    animations.push(current.card.animate(
      [{ transform: getComputedStyle(current.card).transform }, { transform: restingTransform(current.index) }],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ));
  } else if (current.kind === 'bundle') {
    animations.push(cardStack.animate(
      [{ transform: getComputedStyle(cardStack).transform }, { transform: 'translateX(0) rotate(0deg)' }],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ));
    animations.push(hero.animate(
      [{ opacity: getComputedStyle(hero).opacity }, { opacity: 0 }],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ));
  } else if (current.kind === 'restore') {
    animations.push(cardStack.animate(
      [{ transform: getComputedStyle(cardStack).transform }, { transform: `translateX(${stashSide * bundleDistance()}px) rotate(${stashSide * 2}deg)` }],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ));
    animations.push(hero.animate(
      [{ opacity: getComputedStyle(hero).opacity }, { opacity: 1 }],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ));
  }
  playTransition(animations, duration, clearPreviewInstant);
}

function previewNext(distance) {
  const index = activeIndex + 1;
  if (index >= chapters.length) return;
  if (!preview || preview.kind !== 'next') {
    clearPreviewInstant();
    const chapter = chapters[index];
    chapter.classList.add('is-preview');
    chapter.style.setProperty('--stack-level', String(index + 1));
    chapter.inert = true;
    chapter.setAttribute('aria-hidden', 'true');
    preview = { kind: 'next', index, card: cardFor(index) };
  }
  const progress = Math.min(1.08, distance / verticalThreshold());
  preview.card.style.transform = restingTransform(index, (1 - progress) * (deck.clientHeight + 60));
  preview.card.classList.add('is-held');
  deck.classList.add('is-dragging');
}

function previewPrevious(distance) {
  if (activeIndex <= 0) return;
  if (!preview || preview.kind !== 'previous') {
    clearPreviewInstant();
    preview = { kind: 'previous', index: activeIndex, card: cardFor(activeIndex) };
  }
  preview.card.style.transform = restingTransform(activeIndex, distance * .9);
  preview.card.classList.add('is-held');
  deck.classList.add('is-dragging');
}

function previewBundle(dx) {
  if (!preview || preview.kind !== 'bundle') {
    clearPreviewInstant();
    preview = { kind: 'bundle' };
  }
  const x = Math.max(-deck.clientWidth * .8, Math.min(deck.clientWidth * .8, dx * .92));
  cardStack.style.transform = `translateX(${x}px) rotate(${x * .0025}deg)`;
  hero.style.opacity = String(Math.min(.95, Math.abs(dx) / horizontalThreshold() * .86));
  cardStack.classList.add('is-held');
  deck.classList.add('is-dragging');
}

function previewRestore(dx) {
  if (!stashSide || dx * stashSide >= 0) return;
  if (!preview || preview.kind !== 'restore') {
    clearPreviewInstant();
    preview = { kind: 'restore' };
  }
  const progress = Math.min(1.08, Math.abs(dx) / horizontalThreshold());
  const x = stashSide * bundleDistance() * (1 - progress);
  cardStack.style.transform = `translateX(${x}px) rotate(${stashSide * 2 * (1 - progress)}deg)`;
  hero.style.opacity = String(Math.max(0, 1 - progress));
  cardStack.classList.add('is-held');
  deck.classList.add('is-dragging');
}

function enterStack(index = 0, { animate = true, focus = true } = {}) {
  if (index < 0 || index >= chapters.length || transitioning) return;
  clearPreviewInstant();
  activeIndex = index;
  stashSide = 0;
  renderStack(index);
  const card = cardFor(index);
  card.style.transform = restingTransform(index, deck.clientHeight + 60);
  cardStack.style.transform = 'none';
  document.body.dataset.view = 'transition';
  menuToggle.hidden = true;
  tileToggle.hidden = true;
  hero.inert = true;
  setHash(chapters[index].id);
  const finish = () => {
    card.style.removeProperty('transform');
    hero.style.opacity = '0';
    updateControls('card');
    if (focus) chapters[index].focus({ preventScroll: true });
  };
  if (!animate || reduceMotion.matches) {
    finish();
    return;
  }
  const duration = 250;
  playTransition([
    card.animate(
      [{ transform: restingTransform(index, deck.clientHeight + 60) }, { transform: restingTransform(index) }],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ),
    hero.animate(
      [{ opacity: getComputedStyle(hero).opacity }, { opacity: 0 }],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ),
  ], duration, finish);
}

function addCard({ focus = true } = {}) {
  const index = activeIndex + 1;
  if (index >= chapters.length || transitioning) return;
  const incoming = chapters[index];
  const card = cardFor(index);
  const start = preview?.kind === 'next' ? getComputedStyle(card).transform : restingTransform(index, deck.clientHeight + 60);
  preview?.card?.classList.remove('is-held');
  preview = null;
  deck.classList.remove('is-dragging');
  chapters[activeIndex].classList.remove('is-active');
  chapters[activeIndex].classList.add('is-stacked');
  chapters[activeIndex].inert = true;
  chapters[activeIndex].setAttribute('aria-hidden', 'true');
  incoming.classList.remove('is-preview');
  incoming.classList.add('is-active');
  cardScrollFor(index).scrollTop = 0;
  activeIndex = index;
  setHash(incoming.id);
  updateCurrentLinks();
  const finish = () => {
    card.style.removeProperty('transform');
    updateControls('card');
    if (focus) incoming.focus({ preventScroll: true });
  };
  if (reduceMotion.matches) {
    finish();
    return;
  }
  const duration = 210;
  playTransition([
    card.animate(
      [{ transform: start }, { transform: restingTransform(index) }],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ),
  ], duration, finish);
}

function removeCard({ focus = true } = {}) {
  if (activeIndex <= 0 || transitioning) return;
  const outgoingIndex = activeIndex;
  const nextIndex = activeIndex - 1;
  const outgoing = chapters[outgoingIndex];
  const outgoingCard = cardFor(outgoingIndex);
  const start = preview?.kind === 'previous' ? getComputedStyle(outgoingCard).transform : restingTransform(outgoingIndex);
  preview?.card?.classList.remove('is-held');
  preview = null;
  deck.classList.remove('is-dragging');
  outgoing.classList.remove('is-active');
  outgoing.classList.add('is-leaving');
  chapters[nextIndex].classList.remove('is-stacked');
  chapters[nextIndex].classList.add('is-active');
  activeIndex = nextIndex;
  setHash(chapters[nextIndex].id);
  updateCurrentLinks();
  const finish = () => {
    hideChapter(outgoingIndex);
    updateControls('card');
    if (focus) chapters[nextIndex].focus({ preventScroll: true });
  };
  if (reduceMotion.matches) {
    finish();
    return;
  }
  const duration = 210;
  playTransition([
    outgoingCard.animate(
      [{ transform: start }, { transform: restingTransform(outgoingIndex, deck.clientHeight + 70) }],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ),
  ], duration, finish);
}

function stashBundle(side, { focus = true } = {}) {
  if (view !== 'card' || activeIndex < 0 || transitioning) return;
  const direction = side || 1;
  const start = getComputedStyle(cardStack).transform;
  preview = null;
  cardStack.classList.remove('is-held');
  deck.classList.remove('is-dragging');
  stashSide = direction;
  document.body.dataset.view = 'transition';
  menuToggle.hidden = true;
  tileToggle.hidden = true;
  hero.removeAttribute('aria-hidden');
  setHash('top');
  const target = `translateX(${direction * bundleDistance()}px) rotate(${direction * 2}deg)`;
  const finish = () => {
    cardStack.style.transform = target;
    hero.style.opacity = '1';
    updateControls('top');
    if (focus) hero.focus({ preventScroll: true });
  };
  if (reduceMotion.matches) {
    finish();
    return;
  }
  const duration = 230;
  playTransition([
    cardStack.animate(
      [{ transform: start }, { transform: target }],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ),
    hero.animate(
      [{ opacity: getComputedStyle(hero).opacity }, { opacity: 1 }],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ),
  ], duration, finish);
}

function restoreBundle({ focus = true } = {}) {
  if (view !== 'top' || activeIndex < 0 || !stashSide || transitioning) return;
  const start = getComputedStyle(cardStack).transform;
  preview = null;
  cardStack.classList.remove('is-held');
  deck.classList.remove('is-dragging');
  document.body.dataset.view = 'transition';
  menuToggle.hidden = true;
  tileToggle.hidden = true;
  setHash(chapters[activeIndex].id);
  const finish = () => {
    cardStack.style.transform = 'none';
    hero.style.opacity = '0';
    stashSide = 0;
    updateControls('card');
    if (focus) chapters[activeIndex].focus({ preventScroll: true });
  };
  if (reduceMotion.matches) {
    finish();
    return;
  }
  const duration = 230;
  playTransition([
    cardStack.animate(
      [{ transform: start }, { transform: 'translateX(0) rotate(0deg)' }],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ),
    hero.animate(
      [{ opacity: getComputedStyle(hero).opacity }, { opacity: 0 }],
      { duration, easing: 'ease-in-out', fill: 'both' },
    ),
  ], duration, finish);
}

function jumpToCard(index) {
  if (index < 0 || index >= chapters.length) return;
  activeIndex = index;
  renderStack(index);
  cardStack.style.transform = 'none';
  stashSide = 0;
  setHash(chapters[index].id);
  updateCurrentLinks();
}

function canReadFurther(direction) {
  if (view !== 'card' || activeIndex < 0) return false;
  const scroller = cardScrollFor(activeIndex);
  return direction > 0
    ? scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 2
    : scroller.scrollTop > 2;
}

function scrollCurrentCard(delta) {
  if (activeIndex >= 0) cardScrollFor(activeIndex).scrollTop += delta;
}

function alignStack() {
  if (view !== 'card' || activeIndex < 2 || transitioning) return;
  const cards = chapters.slice(0, activeIndex + 1).map((_, index) => cardFor(index));
  const starts = cards.map((card) => getComputedStyle(card).transform);
  cardStack.classList.add('is-aligned');
  transitioning = true;
  const animations = cards.map((card, index) => card.animate([
    { transform: starts[index] },
    { transform: 'translate(-3px, 1px) rotate(-.18deg)', offset: .45 },
    { transform: 'translate(2px, -1px) rotate(.12deg)', offset: .72 },
    { transform: 'translate(0, 0) rotate(0deg)' },
  ], {
    duration: 250,
    delay: (cards.length - index - 1) * 28,
    easing: 'ease-in-out',
    fill: 'both',
  }));
  Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    animations.forEach((animation) => animation.cancel());
    transitioning = false;
  });
}

function randomTileAngles() {
  [...tileGrid.children].forEach((button) => {
    const angle = (Math.random() * 4.2 - 2.1).toFixed(2);
    button.style.setProperty('--tile-angle', `${angle}deg`);
  });
}

function cardMorphBounds(index) {
  const card = cardFor(index);
  const rect = card.getBoundingClientRect();
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  };
}

function openTiles() {
  if (view !== 'card' || transitioning || activeIndex < 0) return;
  transitioning = true;
  resetWheel(false);
  randomTileAngles();
  const sourceBounds = chapters.map((_, index) => index <= activeIndex ? cardMorphBounds(index) : null);
  tileView.hidden = false;
  tileView.classList.add('is-active');
  tileView.setAttribute('aria-hidden', 'false');
  updateControls('tiles');
  const buttons = [...tileGrid.children];
  const animations = [];
  buttons.forEach((button, index) => {
    button.getAnimations().forEach((animation) => animation.cancel());
    const angle = button.style.getPropertyValue('--tile-angle') || '0deg';
    if (index > activeIndex || reduceMotion.matches) return;
    const source = sourceBounds[index];
    const target = button.getBoundingClientRect();
    const dx = source.left + source.width / 2 - (target.left + target.width / 2);
    const dy = source.top + source.height / 2 - (target.top + target.height / 2);
    const scaleX = source.width / target.width;
    const scaleY = source.height / target.height;
    animations.push(button.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY}) rotate(${restingAngle(index)}deg)`, borderRadius: '3px' },
      { transform: `translate(0, 0) scale(1, 1) rotate(${angle})`, borderRadius: '5px' },
    ], { duration: 420 + index * 28, delay: index * 18, easing: 'cubic-bezier(.22,.72,.2,1)', fill: 'both' }));
  });
  Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    animations.forEach((animation) => animation.cancel());
    transitioning = false;
    tileGrid.querySelector('.tile-card[aria-current="true"]')?.focus({ preventScroll: true });
  });
}

function closeTiles(targetIndex = activeIndex, { focus = true } = {}) {
  if (view !== 'tiles' || transitioning) return;
  transitioning = true;
  const buttons = [...tileGrid.children];
  const tileBounds = buttons.map((button) => button.getBoundingClientRect());
  jumpToCard(targetIndex);
  const animations = [];
  if (!reduceMotion.matches) {
    buttons.forEach((button, index) => {
      const angle = button.style.getPropertyValue('--tile-angle') || '0deg';
      if (index <= targetIndex) {
        const source = tileBounds[index];
        const target = cardMorphBounds(index);
        const dx = source.left + source.width / 2 - (target.left + target.width / 2);
        const dy = source.top + source.height / 2 - (target.top + target.height / 2);
        const scaleX = target.width / source.width;
        const scaleY = target.height / source.height;
        animations.push(button.animate([
          { transform: `translate(0, 0) scale(1, 1) rotate(${angle})`, borderRadius: '5px', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY}) rotate(${restingAngle(index)}deg)`, borderRadius: '3px', opacity: 1 },
        ], { duration: 340 + (targetIndex - index) * 22, delay: (targetIndex - index) * 12, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' }));
      } else {
        animations.push(button.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 130, easing: 'ease-in-out', fill: 'both' }));
      }
    });
  }
  const finish = () => {
    animations.forEach((animation) => animation.cancel());
    tileView.classList.remove('is-active');
    tileView.hidden = true;
    tileView.setAttribute('aria-hidden', 'true');
    transitioning = false;
    updateControls('card');
    if (focus) tileToggle.focus({ preventScroll: true });
    else chapters[targetIndex].focus({ preventScroll: true });
  };
  if (!animations.length) finish();
  else Promise.allSettled(animations.map((animation) => animation.finished)).then(finish);
}

tileToggle.addEventListener('click', openTiles);
tileClose.addEventListener('click', () => closeTiles());
tileGrid.addEventListener('click', (event) => {
  const button = event.target.closest('.tile-card');
  if (!button) return;
  closeTiles(Number(button.dataset.index), { focus: false });
});

const faqItems = [...document.querySelectorAll('.faq-item')];
faqItems.forEach((item) => {
  item.addEventListener('toggle', () => {
    if (!item.open) return;
    faqItems.forEach((other) => {
      if (other !== item && other.open) other.open = false;
    });
  });
});

menuToggle.addEventListener('click', () => {
  resetWheel(false);
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
    if (link.hash === '#top') return;
    const index = chapters.findIndex((chapter) => `#${chapter.id}` === link.hash);
    if (index < 0) return;
    if (activeIndex >= 0 && stashSide) {
      const side = stashSide;
      jumpToCard(index);
      stashSide = side;
      cardStack.style.transform = `translateX(${side * bundleDistance()}px) rotate(${side * 2}deg)`;
      restoreBundle();
    } else enterStack(index);
  });
});

function finishWheel(commit = true) {
  clearTimeout(wheelIdleTimer);
  const gesture = wheelGesture;
  wheelGesture = null;
  if (!gesture || gesture.mode === 'read' || gesture.used || !commit) {
    if (preview) settlePreview();
    return;
  }
  const threshold = gesture.axis === 'horizontal' ? horizontalThreshold() : verticalThreshold();
  if (gesture.total < threshold) {
    if (preview) settlePreview();
    return;
  }
  gesture.used = true;
  if (view === 'top') {
    if (stashSide && gesture.axis === 'horizontal' && -gesture.direction * stashSide < 0) restoreBundle();
    else if (!stashSide && gesture.axis === 'vertical' && gesture.direction > 0) enterStack(0);
    else if (preview) settlePreview();
    return;
  }
  if (view !== 'card') return;
  if (gesture.axis === 'horizontal') {
    stashBundle(-gesture.direction || 1);
    return;
  }
  if (gesture.direction > 0) addCard();
  else removeCard();
}

function resetWheel(commit = true) {
  finishWheel(commit);
}

window.addEventListener('wheel', (event) => {
  if (menu.open || view === 'tiles' || event.ctrlKey) return;
  const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? deck.clientHeight : 1;
  const dx = event.deltaX * factor;
  const dy = event.deltaY * factor;
  if (!dx && !dy) return;
  const axis = Math.abs(dx) > Math.abs(dy) * 1.08 ? 'horizontal' : 'vertical';
  const delta = axis === 'horizontal' ? dx : dy;
  const direction = Math.sign(delta);
  event.preventDefault();
  const now = performance.now();
  const previous = wheelGesture;
  const fresh = !previous || now - previous.lastAt > 150 || previous.axis !== axis || previous.direction !== direction;
  if (fresh) {
    if (previous && preview) clearPreviewInstant();
    wheelGesture = {
      axis, direction, lastAt: now, total: 0, used: false,
      mode: axis === 'vertical' && view === 'card' && canReadFurther(direction) ? 'read' : 'stack',
    };
  }
  const gesture = wheelGesture;
  gesture.lastAt = now;
  clearTimeout(wheelIdleTimer);
  wheelIdleTimer = setTimeout(() => finishWheel(true), 180);
  if (gesture.mode === 'read') {
    scrollCurrentCard(dy);
    if (!canReadFurther(direction)) {
      gesture.mode = 'boundary';
      gesture.total = 0;
    }
    return;
  }
  if (transitioning) return;
  gesture.total += Math.abs(delta);
  const distance = Math.min(gesture.total, (axis === 'horizontal' ? horizontalThreshold() : verticalThreshold()) * 1.08);
  if (view === 'top') {
    if (stashSide && axis === 'horizontal') previewRestore(-direction * distance);
    else if (!stashSide && axis === 'vertical' && direction > 0) {
      activeIndex = -1;
      previewNext(distance);
    }
    return;
  }
  if (view !== 'card') return;
  if (axis === 'horizontal') previewBundle(-direction * distance);
  else if (direction > 0) previewNext(distance);
  else previewPrevious(distance);
}, { passive: false, capture: true });

function startDrag(x, y, interactive, source) {
  resetWheel(false);
  return { x, y, lastY: y, dx: 0, dy: 0, mode: null, boundaryY: null, boundaryDirection: 0, interactive, source };
}

function moveDrag(gesture, x, y) {
  if (!gesture || transitioning) return;
  let dx = x - gesture.x;
  let dy = y - gesture.y;
  const step = gesture.lastY - y;
  gesture.lastY = y;
  if (gesture.mode === 'boundary' && gesture.boundaryY !== null) {
    const boundaryDy = y - gesture.boundaryY;
    const continuedDirection = Math.sign(-boundaryDy);
    if (continuedDirection && continuedDirection === gesture.boundaryDirection) {
      gesture.x = x;
      gesture.y = gesture.boundaryY;
      gesture.mode = 'stack';
      dx = 0;
      dy = boundaryDy;
    } else if (continuedDirection) {
      gesture.mode = 'read';
      gesture.boundaryY = null;
      gesture.boundaryDirection = 0;
    }
  }
  gesture.dx = dx;
  gesture.dy = dy;
  if (!gesture.mode && Math.max(Math.abs(dx), Math.abs(dy)) > 6) {
    if (view === 'top') {
      if (stashSide && Math.abs(dx) > Math.abs(dy) * .8) gesture.mode = 'restore';
      else if (!stashSide && Math.abs(dy) >= Math.abs(dx)) gesture.mode = 'enter';
    } else if (view === 'card' && Math.abs(dx) > Math.abs(dy) * .82) gesture.mode = 'bundle';
    else if (view === 'card' && canReadFurther(dy < 0 ? 1 : -1)) gesture.mode = 'read';
    else if (view === 'card') gesture.mode = 'stack';
  }
  if (gesture.mode === 'read') {
    const direction = Math.sign(step);
    if (gesture.source !== 'touch') scrollCurrentCard(step);
    if (direction && !canReadFurther(direction)) {
      gesture.mode = 'boundary';
      gesture.boundaryY = y;
      gesture.boundaryDirection = direction;
    }
    return;
  }
  else if (gesture.mode === 'enter') {
    activeIndex = -1;
    previewNext(Math.max(0, -dy));
  } else if (gesture.mode === 'restore') previewRestore(dx);
  else if (gesture.mode === 'bundle') previewBundle(dx);
  else if (gesture.mode === 'stack') {
    if (dy < 0) previewNext(-dy);
    else previewPrevious(dy);
  }
}

function endDrag(gesture) {
  if (!gesture) return;
  if (!gesture.mode || gesture.mode === 'read' || gesture.mode === 'boundary') {
    if (preview) settlePreview();
    return;
  }
  suppressClickUntil = performance.now() + 340;
  if (gesture.mode === 'enter' && -gesture.dy >= verticalThreshold()) {
    enterStack(0);
    return;
  }
  if (gesture.mode === 'restore' && gesture.dx * stashSide < 0 && Math.abs(gesture.dx) >= horizontalThreshold()) {
    restoreBundle();
    return;
  }
  if (gesture.mode === 'bundle' && Math.abs(gesture.dx) >= horizontalThreshold()) {
    stashBundle(Math.sign(gesture.dx) || 1);
    return;
  }
  if (gesture.mode === 'stack' && Math.abs(gesture.dy) >= verticalThreshold()) {
    if (gesture.dy < 0 && activeIndex < chapters.length - 1) {
      addCard();
      return;
    }
    if (gesture.dy > 0 && activeIndex > 0) {
      removeCard();
      return;
    }
  }
  settlePreview();
}

deck.addEventListener('touchstart', (event) => {
  if (menu.open || view === 'tiles' || event.touches.length !== 1) return;
  const touch = event.touches[0];
  touchGesture = startDrag(touch.clientX, touch.clientY, Boolean(event.target.closest('a, button, summary')), 'touch');
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
  if (preview) settlePreview();
  touchGesture = null;
}, { passive: true });

deck.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch' || event.button !== 0 || menu.open || view === 'tiles' ||
      event.target.closest('a, button, summary, input, textarea, select')) return;
  pointerGesture = startDrag(event.clientX, event.clientY, false, 'pointer');
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
deck.addEventListener('pointercancel', () => {
  if (preview) settlePreview();
  pointerGesture = null;
});
deck.addEventListener('lostpointercapture', () => {
  if (pointerGesture && preview) settlePreview();
  pointerGesture = null;
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
  if (view === 'tiles') {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeTiles();
    }
    return;
  }
  if (view === 'top') {
    if (!stashSide && ['ArrowDown', 'PageDown', ' '].includes(event.key)) {
      event.preventDefault();
      if (!event.repeat) enterStack(0);
    } else if (stashSide && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      if (!event.repeat) restoreBundle();
    }
    return;
  }
  if (view !== 'card') return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Escape') {
    event.preventDefault();
    if (!event.repeat) stashBundle(event.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
  const direction = ['ArrowDown', 'PageDown', ' '].includes(event.key) ? 1 : ['ArrowUp', 'PageUp'].includes(event.key) ? -1 : 0;
  if (!direction) return;
  event.preventDefault();
  if (canReadFurther(direction)) scrollCurrentCard(direction * (event.key.startsWith('Arrow') ? 48 : deck.clientHeight * .72));
  else if (!event.repeat) direction > 0 ? addCard() : removeCard();
});

function syncFromHash() {
  cancelTransition();
  preview = null;
  tileView.hidden = true;
  tileView.classList.remove('is-active');
  tileView.setAttribute('aria-hidden', 'true');
  const index = chapters.findIndex((chapter) => `#${chapter.id}` === location.hash);
  if (index < 0) {
    activeIndex = -1;
    stashSide = 0;
    chapters.forEach((_, chapterIndex) => hideChapter(chapterIndex));
    cardStack.style.transform = 'none';
    hero.style.opacity = '1';
    updateControls('top');
  } else {
    activeIndex = index;
    stashSide = 0;
    renderStack(index);
    cardStack.style.transform = 'none';
    hero.style.opacity = '0';
    updateControls('card');
  }
}

window.addEventListener('hashchange', syncFromHash);
window.addEventListener('blur', () => {
  resetWheel(false);
  if (preview) settlePreview();
  touchGesture = null;
  pointerGesture = null;
});
syncFromHash();
