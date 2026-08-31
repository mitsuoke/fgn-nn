import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const host = '127.0.0.1';
const port = 4173;
const liveBitrix = process.env.BITRIX_LIVE === '1';
const baseUrl = liveBitrix ? `https://fgn-nn.ru:${port}` : `http://${host}:${port}`;
const productionUrl = 'https://fgn-nn.ru';
const healthUrl = `http://${host}:${port}`;
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

const mockExternalResources = (page, { useLiveBitrix = liveBitrix } = {}) => page.route(/^https?:\/\/(?!127\.0\.0\.1:4173|fgn-nn\.ru(?::4173)?\/)/, (request) => {
  if (useLiveBitrix && /^https:\/\/(?:cdn-ru\.bitrix24\.ru|b24-ud1314\.bitrix24\.ru)\//.test(request.request().url())) {
    return request.continue();
  }
  if (/cdn-ru\.bitrix24\.ru\/b28134326\/crm\/form\/loader_(?:10|16)\.js/.test(request.request().url())) {
    return request.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: "(function(){var wrapper=document.createElement('div');wrapper.className='b24-form-wrapper';wrapper.style.minHeight='720px';var form=document.createElement('form');form.className='b24-form';form.setAttribute('data-test-bitrix-form','');var input=document.createElement('input');input.setAttribute('aria-label','Имя');var button=document.createElement('button');button.type='submit';button.textContent='Отправить';form.append(input,button);wrapper.appendChild(form);document.body.appendChild(wrapper);}());"
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
      const response = await fetch(healthUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Локальный HTTP-сервер не запустился.');
};

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8'
};

const readLocalResponse = (url) => {
  const pathname = decodeURIComponent(new URL(url).pathname);
  const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const filePath = path.resolve(root, `.${relative}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return { status: 403, body: 'Forbidden' };
  try {
    return {
      status: 200,
      contentType: contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      body: fs.readFileSync(filePath)
    };
  } catch (error) {
    return { status: error.code === 'ENOENT' ? 404 : 500, body: error.code === 'ENOENT' ? 'Not found' : 'Server error' };
  }
};

const createHttpsServer = () => {
  const keyPath = process.env.BITRIX_TLS_KEY;
  const certPath = process.env.BITRIX_TLS_CERT;
  if (!keyPath || !certPath) throw new Error('Для live-проверки Bitrix нужны BITRIX_TLS_KEY и BITRIX_TLS_CERT.');
  return https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, baseUrl).pathname);
    const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const filePath = path.resolve(root, `.${relative}`);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(filePath, (error, body) => {
      if (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
        return;
      }
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      response.end(body);
    });
  });
};

const server = liveBitrix
  ? createHttpsServer()
  : spawn('python3', ['-m', 'http.server', String(port), '--bind', host], { cwd: root, stdio: 'ignore' });

let browser;
try {
  if (liveBitrix) {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
  } else {
    await waitForServer();
  }
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: process.env.BITRIX_HEADLESS !== '0',
    args: ['--host-resolver-rules=MAP fgn-nn.ru 127.0.0.1', '--ignore-certificate-errors']
  });

  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const runtimeErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.stack || error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('ERR_BLOCKED_BY_CLIENT')) runtimeErrors.push(message.text());
    });
    if (liveBitrix && commercialRoutes.includes(route)) {
      await page.route(/^https:\/\/fgn-nn\.ru\//, (request) => request.fulfill(readLocalResponse(request.request().url())));
    }
    await mockExternalResources(page);
    const routeBaseUrl = liveBitrix && commercialRoutes.includes(route) ? productionUrl : baseUrl;
    const response = await page.goto(`${routeBaseUrl}${route}`, { waitUntil: 'networkidle' });
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
        if (element.closest('.b24-form')) return false;
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
    if (commercialRoutes.includes(route)) {
      const expectedId = route === '/kapsulirovanie/' ? '10' : '16';
      const formId = await page.locator('[data-commercial-crm]').getAttribute('data-commercial-crm');

      if (formId !== expectedId) {
        fail(`${route}: ожидается CRM-форма №${expectedId}, найдена №${formId || '—'}.`);
      }

      const hostFrame = page.locator(`iframe[data-bitrix-form-frame="${expectedId}"]`).first();

      try {
        await hostFrame.waitFor({ state: 'visible', timeout: 20000 });
      } catch {
        fail(`${route}: изолированный iframe CRM-формы №${expectedId} не появился.`);
      }

      const isolatedFrame = page.frames().find((frame) =>
        frame.url().includes(`/forms/bitrix.html?form=${expectedId}`)
      );

      if (!isolatedFrame) {
        fail(`${route}: страница изолированной CRM-формы №${expectedId} не загрузилась.`);
      } else {
        const renderedForm = isolatedFrame.locator('.b24-form-wrapper, .b24-form').first();

        try {
          await renderedForm.waitFor({ state: 'visible', timeout: 20000 });
        } catch {
          const diagnostic = await isolatedFrame.evaluate(() => ({
            b24Nodes: [...document.querySelectorAll('[class*="b24"]')].map((element) => ({
              tag: element.tagName,
              className: element.className,
              text: element.textContent?.trim().slice(0, 120)
            })),
            scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
            body: document.body.innerHTML.slice(0, 1200)
          }));

          fail(`${route}: фактический интерфейс CRM-формы Bitrix24 не появился внутри изолированного iframe. Диагностика: ${JSON.stringify(diagnostic)}.`);
        }
      }

      if (await hostFrame.count()) {
        const size = await hostFrame.evaluate((element) => ({
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height
        }));

        if (size.width < 240 || size.height < 100) {
          fail(`${route}: iframe CRM-формы имеет некорректный размер ${Math.round(size.width)}×${Math.round(size.height)}.`);
        }
      }
    }

    const cspErrors = runtimeErrors.filter((message) => /content security policy|violates the following|refused to (?:frame|load|connect|execute)/i.test(message));
    if (cspErrors.length) fail(`${route}: ошибки CSP: ${[...new Set(cspErrors)].join(' | ')}.`);
    const otherRuntimeErrors = runtimeErrors.filter((message) => !cspErrors.includes(message));
    if (otherRuntimeErrors.length) fail(`${route}: ошибки браузера: ${[...new Set(otherRuntimeErrors)].join(' | ')}.`);

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
    await mockExternalResources(page, { useLiveBitrix: false });
    for (const route of commercialRoutes) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) fail(`${route} @ ${width}px: горизонтальное переполнение ${overflow}px.`);
      const expectedId = route === '/kapsulirovanie/' ? '10' : '16';
      const hostFrame = page.locator(`iframe[data-bitrix-form-frame="${expectedId}"]`);
      if (!await hostFrame.isVisible()) fail(`${route} @ ${width}px: iframe CRM-формы не виден.`);

      const isolatedFrame = page.frames().find((frame) =>
        frame.url().includes(`/forms/bitrix.html?form=${expectedId}`)
      );

      if (!isolatedFrame || !await isolatedFrame.locator('.b24-form-wrapper, .b24-form').first().isVisible()) {
        fail(`${route} @ ${width}px: CRM-форма внутри iframe не видна.`);
      }

      const frameSize = await hostFrame.evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height
      }));

      if (frameSize.width > width || frameSize.height < 100) {
        fail(`${route} @ ${width}px: некорректный размер iframe CRM-формы ${Math.round(frameSize.width)}×${Math.round(frameSize.height)}.`);
      }

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
  if (liveBitrix) await new Promise((resolve) => server.close(resolve));
  else server.kill('SIGTERM');
}

if (errors.length) {
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Браузерная проверка пройдена: ${routes.length} маршрутов, ${products.length} товаров, ${commercialRoutes.length} коммерческих страниц, ${5} мобильных ширин.`);
