const header = document.querySelector('.site-header');
const menuButton = document.querySelector('.menu-button');
const mobileNav = document.querySelector('.mobile-nav');

const updateHeader = () => header?.classList.toggle('scrolled', window.scrollY > 20);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

menuButton?.addEventListener('click', () => {
  if (!mobileNav) return;
  const open = !mobileNav.classList.contains('open');
  mobileNav.classList.toggle('open', open);
  menuButton.classList.toggle('active', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  document.body.classList.toggle('menu-open', open);
});

mobileNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  mobileNav.classList.remove('open');
  menuButton?.classList.remove('active');
  menuButton?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('menu-open');
}));

const productCarousel = document.querySelector('[data-product-carousel]');
const productTrack = productCarousel?.querySelector('[data-carousel-track]');
const productPrev = productCarousel?.querySelector('[data-carousel-prev]');
const productNext = productCarousel?.querySelector('[data-carousel-next]');

if (productTrack && productPrev && productNext) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let carouselFrame = 0;

  const carouselStep = () => {
    const card = productTrack.querySelector('.product-card');
    if (!card) return productTrack.clientWidth;
    const gap = Number.parseFloat(getComputedStyle(productTrack).gap) || 0;
    return card.getBoundingClientRect().width + gap;
  };

  const updateCarouselButtons = () => {
    const maxScroll = Math.max(0, productTrack.scrollWidth - productTrack.clientWidth);
    productPrev.disabled = productTrack.scrollLeft <= 2;
    productNext.disabled = productTrack.scrollLeft >= maxScroll - 2;
  };

  const moveCarousel = (direction) => productTrack.scrollBy({
    left: carouselStep() * direction,
    behavior: reducedMotion.matches ? 'auto' : 'smooth',
  });

  productPrev.addEventListener('click', () => moveCarousel(-1));
  productNext.addEventListener('click', () => moveCarousel(1));
  productTrack.addEventListener('keydown', (event) => {
    if (event.target !== productTrack || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    moveCarousel(event.key === 'ArrowLeft' ? -1 : 1);
  });
  productTrack.addEventListener('scroll', () => {
    cancelAnimationFrame(carouselFrame);
    carouselFrame = requestAnimationFrame(updateCarouselButtons);
  }, { passive: true });
  window.addEventListener('resize', updateCarouselButtons);
  requestAnimationFrame(updateCarouselButtons);
}

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  }), { threshold: 0.08, rootMargin: '0px 0px -40px' });
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
} else {
  document.querySelectorAll('.reveal').forEach((element) => element.classList.add('visible'));
}

const METRIKA_ID = 111744945;
const ANALYTICS_CONSENT_KEY = 'fgn_analytics_consent';
const ANALYTICS_CONSENT_TTL = 365 * 24 * 60 * 60 * 1000;
let metrikaLoading = false;

const reachGoal = (goal) => {
  if (typeof window.ym === 'function') window.ym(METRIKA_ID, 'reachGoal', goal);
};

const loadMetrika = () => {
  if (metrikaLoading || typeof window.ym === 'function') return;
  metrikaLoading = true;

  window.ym = window.ym || function metrikaQueue() {
    (window.ym.a = window.ym.a || []).push(arguments);
  };
  window.ym.l = Date.now();

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}`;
  document.head.appendChild(script);

  window.ym(METRIKA_ID, 'init', {
    clickmap: true,
    accurateTrackBounce: true,
    trackLinks: true,
  });
};

const readAnalyticsChoice = () => {
  try {
    const stored = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    if (!stored) return null;
    const choice = JSON.parse(stored);
    if (!['granted', 'denied'].includes(choice.status) || !Number.isFinite(choice.expiresAt) || choice.expiresAt <= Date.now()) {
      localStorage.removeItem(ANALYTICS_CONSENT_KEY);
      return null;
    }
    return choice.status;
  } catch (error) {
    try {
      localStorage.removeItem(ANALYTICS_CONSENT_KEY);
    } catch (storageError) {
      // Storage is unavailable; the visitor will be asked again next time.
    }
    return null;
  }
};

let analyticsConsent = readAnalyticsChoice();

if (analyticsConsent === 'granted') loadMetrika();

const cookieNotice = document.querySelector('#cookie-notice');
const analyticsAccept = document.querySelector('#cookie-analytics-accept');
const analyticsDecline = document.querySelector('#cookie-analytics-decline');
const cookieSettingsButtons = document.querySelectorAll('[data-cookie-settings]');

const showCookieNotice = () => {
  if (!cookieNotice) return;
  cookieNotice.hidden = false;
  requestAnimationFrame(() => cookieNotice.classList.add('shown'));
};

const hideCookieNotice = () => {
  cookieNotice?.classList.remove('shown');
  setTimeout(() => {
    if (cookieNotice) cookieNotice.hidden = true;
  }, 250);
};

if (analyticsConsent !== 'granted' && analyticsConsent !== 'denied') showCookieNotice();

const clearMetrikaStorage = () => {
  document.cookie.split(';').forEach((part) => {
    const name = part.split('=')[0].trim();
    if (name.startsWith('_ym_')) {
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    }
  });
  try {
    Object.keys(localStorage).filter((key) => key.startsWith('_ym')).forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    // First-party analytics storage may be unavailable or already empty.
  }
};

const stopMetrika = () => {
  if (typeof window.ym === 'function') {
    try {
      window.ym(METRIKA_ID, 'destruct');
    } catch (error) {
      // The counter may still be loading; clearing first-party storage is sufficient here.
    }
  }
  clearMetrikaStorage();
};

const saveAnalyticsChoice = (choice) => {
  const now = Date.now();
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({
      status: choice,
      decidedAt: now,
      expiresAt: now + ANALYTICS_CONSENT_TTL,
    }));
    localStorage.removeItem('fgn_cookie_notice');
  } catch (error) {
    // The choice remains active for the current page if storage is unavailable.
  }
  analyticsConsent = choice;
  hideCookieNotice();
};

analyticsAccept?.addEventListener('click', () => {
  saveAnalyticsChoice('granted');
  loadMetrika();
});

analyticsDecline?.addEventListener('click', () => {
  saveAnalyticsChoice('denied');
  stopMetrika();
});

cookieSettingsButtons.forEach((button) => button.addEventListener('click', showCookieNotice));

document.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link) return;
  const href = link.getAttribute('href') || '';
  const path = (() => {
    try { return new URL(link.href, window.location.href).pathname.replace(/\/{2,}/g, '/'); }
    catch { return ''; }
  })();
  if (href.startsWith('tel:')) reachGoal('phone_click');
  else if (href.includes('max.ru/')) reachGoal('max_click');
  else if (href.startsWith('mailto:')) reachGoal('email_click');
  else if (/\/start\.html$/.test(path)) reachGoal('start_product_click');
  else if (/\/products\/?$/.test(path)) reachGoal('catalog_click');
  else if (/\/products\/[^/]+\/?$/.test(path)) reachGoal('product_card_click');
});


window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;

  const data = event.data;
  if (!data || data.type !== 'fgn-bitrix-height') return;

  const frame = document.querySelector(
    `iframe[data-bitrix-form-frame="${data.form}"]`
  );

  if (!frame || event.source !== frame.contentWindow) return;

  const height = Number(data.height);
  if (!Number.isFinite(height) || height < 100 || height > 5000) return;

  frame.style.height = `${Math.ceil(height)}px`;
});

const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();
