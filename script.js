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

let analyticsConsent = null;
try {
  analyticsConsent = localStorage.getItem(ANALYTICS_CONSENT_KEY);
} catch (error) {
  analyticsConsent = null;
}

if (analyticsConsent === 'granted') loadMetrika();

const cookieNotice = document.querySelector('#cookie-notice');
const analyticsAccept = document.querySelector('#cookie-analytics-accept');
const analyticsDecline = document.querySelector('#cookie-analytics-decline');

if (cookieNotice && analyticsConsent !== 'granted' && analyticsConsent !== 'denied') {
  cookieNotice.hidden = false;
  requestAnimationFrame(() => cookieNotice.classList.add('shown'));
}

const saveAnalyticsChoice = (choice) => {
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
    localStorage.removeItem('fgn_cookie_notice');
  } catch (error) {
    // The choice remains active for the current page if storage is unavailable.
  }
  cookieNotice?.classList.remove('shown');
  setTimeout(() => {
    if (cookieNotice) cookieNotice.hidden = true;
  }, 250);
};

analyticsAccept?.addEventListener('click', () => {
  saveAnalyticsChoice('granted');
  loadMetrika();
});

analyticsDecline?.addEventListener('click', () => saveAnalyticsChoice('denied'));

document.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link) return;
  const href = link.getAttribute('href') || '';
  if (href.startsWith('tel:')) reachGoal('phone_click');
  else if (href.includes('max.ru/')) reachGoal('max_click');
  else if (href.startsWith('mailto:')) reachGoal('email_click');
  else if (href === 'start.html' || href.endsWith('/start.html')) reachGoal('start_product_click');
});

const form = document.querySelector('#request-form');
form?.addEventListener('submit', (event) => {
  event.preventDefault();
  reachGoal('request_submit');
  const data = new FormData(form);
  const subject = `Заявка с сайта FGN — ${data.get('name') || 'новый клиент'}`;
  const body = [
    `Имя: ${data.get('name')}`,
    `Контакт: ${data.get('contact')}`,
    `Продукт: ${data.get('product')}`,
    `Партия: ${data.get('volume') || 'не указана'}`,
    `Сырьё: ${data.get('material')}`,
    `Комментарий: ${data.get('message') || 'нет'}`,
  ].join('\n');
  const status = document.querySelector('.form-status');
  if (status) status.textContent = 'Открываем письмо с заполненной заявкой…';
  window.location.href = `mailto:Burunduk.shop@mail.ru?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});

const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();
