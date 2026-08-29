(() => {
  const lightbox = document.querySelector('[data-product-lightbox]');
  const lightboxImage = lightbox?.querySelector('img');
  const closeButton = lightbox?.querySelector('[data-product-lightbox-close]');
  const triggers = document.querySelectorAll('[data-product-zoom]');

  if (!lightbox || !lightboxImage || !triggers.length) return;

  let lastTrigger = null;
  let currentIndex = 0;
  let touchStartX = 0;

  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.setAttribute('aria-label', 'Галерея изображений товара');

  const previousButton = document.createElement('button');
  previousButton.type = 'button';
  previousButton.className = 'product-lightbox-nav product-lightbox-prev';
  previousButton.setAttribute('aria-label', 'Предыдущее изображение');
  previousButton.textContent = '‹';

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'product-lightbox-nav product-lightbox-next';
  nextButton.setAttribute('aria-label', 'Следующее изображение');
  nextButton.textContent = '›';

  const counter = document.createElement('div');
  counter.className = 'product-lightbox-counter';
  counter.setAttribute('aria-live', 'polite');

  let hint = lightbox.querySelector('.product-lightbox-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'product-lightbox-hint';
  }
  hint.textContent = '← → — листать · Esc — закрыть';

  lightbox.append(previousButton, nextButton, counter, hint);

  const show = (index) => {
    currentIndex = (index + triggers.length) % triggers.length;
    const trigger = triggers[currentIndex];
    lightboxImage.src = trigger.dataset.full || trigger.querySelector('img')?.src || '';
    lightboxImage.alt = trigger.querySelector('img')?.alt || '';
    counter.textContent = `${currentIndex + 1} / ${triggers.length}`;
  };

  const open = (trigger) => {
    lastTrigger = trigger;
    show(Array.from(triggers).indexOf(trigger));
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lightbox-open');
    document.documentElement.style.overflow = 'hidden';
    closeButton?.focus();
  };

  const close = () => {
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lightbox-open');
    lightboxImage.src = '';
    document.documentElement.style.overflow = '';
    lastTrigger?.focus();
  };

  triggers.forEach((trigger) => trigger.addEventListener('click', () => open(trigger)));
  previousButton.addEventListener('click', () => show(currentIndex - 1));
  nextButton.addEventListener('click', () => show(currentIndex + 1));
  closeButton?.addEventListener('click', close);
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) close();
  });
  document.addEventListener('keydown', (event) => {
    if (lightbox.getAttribute('aria-hidden') !== 'false') return;
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowLeft') show(currentIndex - 1);
    else if (event.key === 'ArrowRight') show(currentIndex + 1);
    else if (event.key === 'Tab') {
      const controls = [closeButton, previousButton, nextButton].filter(Boolean);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  lightbox.addEventListener('touchstart', (event) => { touchStartX = event.changedTouches[0]?.clientX || 0; }, { passive: true });
  lightbox.addEventListener('touchend', (event) => {
    const distance = (event.changedTouches[0]?.clientX || 0) - touchStartX;
    if (Math.abs(distance) < 45) return;
    show(currentIndex + (distance < 0 ? 1 : -1));
  }, { passive: true });
})();
