import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const host = '127.0.0.1';
const port = 4173;
const baseUrl = `http://${host}:${port}`;
const errors = [];
const fail = (message) => errors.push(message);
const products = JSON.parse(fs.readFileSync(path.join(root, 'data/products.json'), 'utf8')).products.filter((product) => product.active !== false);
const commercialRoutes = [
  '/kapsulirovanie/',
  '/fasovka-sypuchih-produktov/',
  '/fasovka-chaya-i-sborov/',
  '/upakovka-i-markirovka-bad/',
  '/kontraktnoe-proizvodstvo-bad/'
];
const routes = ['/', '/products/', ...products.map((product) => `/products/${product.slug}/`), ...commercialRoutes];

const mockExternalResources = (page) => page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (request) => {
  if (/cdn-ru\.bitrix24\.ru\/b28134326\/crm\/form\/loader_(?:10|16)\.js/.test(request.request().url())) {
    return request.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: "(function(){var host=document.querySelector('[data-commercial-crm]');if(!host)return;var form=document.createElement('form');form.className='b24-form';form.setAttribute('data-test-bitrix-form','');var input=document.createElement('input');input.setAttribute('aria-label','Имя');var button=document.createElement('button');button.type='submit';button.textContent='Отправить';form.append(input,button);host.appendChild(form);}());"
    });
  }
  return request.fulfill({ status: 204, body: '' });
});

const loadPlaywright = async () => {
  try {
    const module = await import('playwright');
    return module.chromium ? module : module.default;
  } catch (error) {
    const runtimeRoot = process.env.CODEX_PRIMARY_RUNTIME_ROOT;
    if (!runtimeRoot) throw error;
    const module = await import(path.join(runtimeRoot, 'dependencies/node/node_modules/playwright/index.js'));
    return module.chromium ? module : module.default;
  }
};

const waitForServer = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Локальный HTTP-сервер не запустился.');
};

const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', host], {
  cwd: root,
  stdio: 'ignore'
});

let browser;
try {
  await waitForServer();
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: true });

  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const runtimeErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('ERR_BLOCKED_BY_CLIENT')) runtimeErrors.push(message.text());
    });
    await mockExternalResources(page);
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    if (!response?.ok()) fail(`${route}: HTTP ${response?.status() || 'без ответа'}.`);
    await page.evaluate(async () => {
      document.querySelectorAll('img').forEach((image) => { image.loading = 'eager'; });
      await Promise.all([...document.images].map((image) => image.complete ? null : new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      })));
    });

    const audit = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map((element) => element.id).filter(Boolean);
      const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
      const unnamedControls = [...document.querySelectorAll('button, a[href]')].filter((element) => {
        const name = element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent?.trim() || element.querySelector('img')?.alt;
        return !name;
      }).length;
      const brokenImages = [...document.images].filter((image) => image.currentSrc && (!image.complete || image.naturalWidth === 0)).map((image) => image.currentSrc);
      return {
        h1: document.querySelectorAll('h1').length,
        duplicates,
        unnamedControls,
        brokenImages,
        horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth
      };
    });
    if (audit.h1 !== 1) fail(`${route}: найдено h1 — ${audit.h1}, ожидается 1.`);
    if (audit.duplicates.length) fail(`${route}: повторяющиеся id: ${audit.duplicates.join(', ')}.`);
    if (audit.unnamedControls) fail(`${route}: элементы управления без доступного имени — ${audit.unnamedControls}.`);
    if (audit.brokenImages.length) fail(`${route}: не загрузились изображения: ${audit.brokenImages.join(', ')}.`);
    if (audit.horizontalOverflow > 1) fail(`${route}: горизонтальное переполнение ${audit.horizontalOverflow}px.`);
    if (runtimeErrors.length) fail(`${route}: ошибки браузера: ${[...new Set(runtimeErrors)].join(' | ')}.`);

    if (commercialRoutes.includes(route)) {
      if (await page.locator('[data-test-bitrix-form]').count() !== 1) fail(`${route}: CSP или embed-код не позволили загрузить CRM-форму.`);
      const formId = await page.locator('[data-commercial-crm]').getAttribute('data-commercial-crm');
      const expectedId = route === '/kapsulirovanie/' ? '10' : '16';
      if (formId !== expectedId) fail(`${route}: ожидается CRM-форма №${expectedId}, найдена №${formId || '—'}.`);
    }

    if (route.startsWith('/products/') && route !== '/products/') {
      const product = products.find((item) => route.includes(`/${item.slug}/`));
      const ozonHrefs = await page.locator('[data-ozon-link]').evaluateAll((links) => links.map((link) => link.href));
      if (!ozonHrefs.length || ozonHrefs.some((href) => href !== product.ozon.url)) fail(`${route}: не все ссылки Ozon совпадают с products.json.`);
    }
    await page.close();
  }

  const catalog = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await catalog.goto(`${baseUrl}/products/`, { waitUntil: 'networkidle' });
  if (await catalog.locator('[data-product-slug]').count() !== products.length) fail('/products/: в браузере отображаются не все товары.');
  if (!await catalog.locator('.mobile-quick').isVisible()) fail('/products/: мобильная панель связи не видна.');
  await catalog.locator('.menu-button').click();
  if (!await catalog.locator('.mobile-nav').isVisible()) fail('/products/: мобильное меню не открывается.');
  await catalog.close();

  const detail = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await detail.goto(`${baseUrl}/products/bio-hart/`, { waitUntil: 'networkidle' });
  if (!await detail.locator('.product-mobile-quick').isVisible()) fail('/products/bio-hart/: мобильная панель действий не видна.');
  await detail.locator('[data-product-zoom]').first().click();
  if (await detail.locator('[data-product-lightbox]').getAttribute('aria-hidden') !== 'false') fail('/products/bio-hart/: галерея не открывается.');
  if (!await detail.locator('.product-lightbox-counter').isVisible()) fail('/products/bio-hart/: счётчик галереи не виден.');
  await detail.locator('.product-lightbox-next').click();
  if ((await detail.locator('.product-lightbox-counter').innerText()).trim() !== '2 / 4') fail('/products/bio-hart/: галерея не листается вперёд.');
  await detail.keyboard.press('Escape');
  if (await detail.locator('[data-product-lightbox]').getAttribute('aria-hidden') !== 'true') fail('/products/bio-hart/: галерея не закрывается по Escape.');
  await detail.close();

  const mobileWidths = [320, 360, 375, 390, 430];
  for (const width of mobileWidths) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    for (const route of ['/products/', '/products/pueraria-mirifica/', '/products/psyllium-slim/']) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) fail(`${route} @ ${width}px: горизонтальное переполнение ${overflow}px.`);
      if (route !== '/products/') {
        const heading = page.locator('h1');
        const box = await heading.boundingBox();
        if (!box || box.width > width) fail(`${route} @ ${width}px: заголовок выходит за экран.`);
      }
    }
    await page.close();
  }

  for (const width of mobileWidths) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await mockExternalResources(page);
    for (const route of commercialRoutes) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) fail(`${route} @ ${width}px: горизонтальное переполнение ${overflow}px.`);
      if (!await page.locator('[data-test-bitrix-form]').isVisible()) fail(`${route} @ ${width}px: CRM-форма не видна.`);
      const quickLink = page.locator('.commercial-mobile-quick a[href="#contact"]');
      if (!await quickLink.isVisible()) fail(`${route} @ ${width}px: мобильный CTA расчёта не виден.`);
    }
    await page.close();
  }

  const home = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await home.goto(baseUrl, { waitUntil: 'networkidle' });
  const track = home.locator('[data-carousel-track]');
  const before = await track.evaluate((element) => element.scrollLeft);
  await home.locator('[data-carousel-next]').click();
  await home.waitForTimeout(500);
  const after = await track.evaluate((element) => element.scrollLeft);
  if (after <= before) fail('/: карусель товаров не листается вперёд.');
  await track.press('ArrowLeft');
  await home.close();
} catch (error) {
  fail(error.stack || error.message);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

if (errors.length) {
  console.error(`Браузерная проверка не пройдена: ${errors.length}`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Браузерная проверка пройдена: ${routes.length} маршрутов, ${products.length} товаров, ${commercialRoutes.length} коммерческих страниц, ${5} мобильных ширин.`);
