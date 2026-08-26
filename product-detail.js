(() => {
  const lightbox = document.querySelector('[data-product-lightbox]');
  const lightboxImage = lightbox?.querySelector('img');
  const closeButton = lightbox?.querySelector('[data-product-lightbox-close]');
  const triggers = document.querySelectorAll('[data-product-zoom]');

  if (!lightbox || !lightboxImage || !triggers.length) return;

  let lastTrigger = null;

  const open = (trigger) => {
    lastTrigger = trigger;
    lightboxImage.src = trigger.dataset.full || trigger.querySelector('img')?.src || '';
    lightboxImage.alt = trigger.querySelector('img')?.alt || '';
    lightbox.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    closeButton?.focus();
  };

  const close = () => {
    lightbox.setAttribute('aria-hidden', 'true');
    lightboxImage.src = '';
    document.documentElement.style.overflow = '';
    lastTrigger?.focus();
  };

  triggers.forEach((trigger) => trigger.addEventListener('click', () => open(trigger)));
  closeButton?.addEventListener('click', close);
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && lightbox.getAttribute('aria-hidden') === 'false') close();
  });
})();
