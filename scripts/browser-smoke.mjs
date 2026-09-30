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

const mockExternalResources = (
  page,
  {
    useLiveBitrix = liveBitrix,
    onQualifiedDemand = null,
    qualifiedDemandHttpStatus = 201,
    qualifiedDemandStatus = 'RECORDED',
    onQualifiedDemandRevoke = null,
    qualifiedDemandRevokeHttpStatus = 200
  } = {}
) => page.route(
  /^https?:\/\/(?!127\.0\.0\.1:4173|fgn-nn\.ru(?::4173)?\/)/,
  async (request) => {
    const url = request.request().url();

    if (
      /^https:\/\/fgn-qd-ingress\.fgn-9c244031b99b\.workers\.dev\/v1\/qualified-demand\/revoke$/.test(url)
    ) {
      const method = request.request().method();
      const requestHeaders = request.request().headers();
      const origin = requestHeaders.origin || '*';
      const corsHeaders = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store'
      };

      if (method === 'OPTIONS') {
        return request.fulfill({
          status: 204,
          headers: corsHeaders,
          body: ''
        });
      }

      let body = null;

      try {
        body = JSON.parse(
          request.request().postData() || 'null'
        );
      } catch {}

      if (onQualifiedDemandRevoke) {
        await onQualifiedDemandRevoke({
          body,
          headers: requestHeaders,
          method
        });
      }

      return request.fulfill({
        status: qualifiedDemandRevokeHttpStatus,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(
          qualifiedDemandRevokeHttpStatus >= 200 &&
          qualifiedDemandRevokeHttpStatus < 300
            ? {
                status: 'ERASURE_ACCEPTED',
                trustState: 'PUBLIC_CLIENT_UNAUTHENTICATED',
                canonicalQualifiedDemandAllowed: false
              }
            : {
                error: 'SYNTHETIC_FAILURE'
              }
        )
      });
    }

    if (
      /^https:\/\/fgn-qd-ingress\.fgn-9c244031b99b\.workers\.dev\/v1\/qualified-demand\/form-start$/.test(url)
    ) {
      const method = request.request().method();
      const requestHeaders = request.request().headers();
      const origin = requestHeaders.origin || '*';
      const corsHeaders = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store'
      };

      if (method === 'OPTIONS') {
        return request.fulfill({
          status: 204,
          headers: corsHeaders,
          body: ''
        });
      }

      let body = null;

      try {
        body = JSON.parse(
          request.request().postData() || 'null'
        );
      } catch {}

      if (onQualifiedDemand) {
        await onQualifiedDemand({
          body,
          headers: requestHeaders,
          method
        });
      }

      return request.fulfill({
        status: qualifiedDemandHttpStatus,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(
          qualifiedDemandHttpStatus >= 200 &&
          qualifiedDemandHttpStatus < 300
            ? {
                status: qualifiedDemandStatus,
                eventId: body?.eventId || null,
                trustState: 'PUBLIC_CLIENT_UNAUTHENTICATED',
                canonicalQualifiedDemandAllowed: false
              }
            : {
                error: 'SYNTHETIC_FAILURE'
              }
        )
      });
    }

    if (
      useLiveBitrix &&
      /^https:\/\/(?:cdn-ru\.bitrix24\.ru|b24-ud1314\.bitrix24\.ru)\//.test(url)
    ) {
      return request.continue();
    }

    if (
      /cdn-ru\.bitrix24\.ru\/b28134326\/crm\/form\/loader_(?:8|10|16)\.js/.test(url)
    ) {
      return request.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: "(function(){var wrapper=document.createElement('div');wrapper.className='b24-form-wrapper';wrapper.style.minHeight='720px';var form=document.createElement('form');form.className='b24-form';form.setAttribute('data-test-bitrix-form','');var input=document.createElement('input');input.setAttribute('aria-label','Имя');var button=document.createElement('button');button.type='submit';button.textContent='Отправить';form.append(input,button);wrapper.appendChild(form);document.body.appendChild(wrapper);}());"
      });
    }

    return request.fulfill({ status: 204, body: '' });
  }
);

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
    if (route === '/') {
      const hostFrame = page.locator(
        'iframe[data-bitrix-form-frame="8"]'
      ).first();

      try {
        await hostFrame.waitFor({
          state: 'visible',
          timeout: 20000
        });
      } catch {
        fail('/: изолированный iframe CRM-формы №8 не появился.');
      }

      const isolatedFrame = page.frames().find((frame) =>
        frame.url().includes('/forms/bitrix.html?form=8')
      );

      if (!isolatedFrame) {
        fail('/: страница изолированной CRM-формы №8 не загрузилась.');
      } else {
        const renderedForm = isolatedFrame
          .locator('.b24-form-wrapper, .b24-form')
          .first();

        try {
          await renderedForm.waitFor({
            state: 'visible',
            timeout: 20000
          });
        } catch {
          fail('/: фактический интерфейс CRM-формы №8 не появился.');
        }
      }

      if (await hostFrame.count()) {
        const size = await hostFrame.evaluate((element) => ({
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height
        }));

        if (size.width < 240 || size.height < 100) {
          fail(
            `/: iframe CRM-формы №8 имеет некорректный размер ` +
            `${Math.round(size.width)}×${Math.round(size.height)}.`
          );
        }
      }
    }

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

  const qdNoConsentRequests = [];
  const qdNoConsentPage = await browser.newPage({
    viewport: { width: 1366, height: 900 }
  });

  await mockExternalResources(qdNoConsentPage, {
    useLiveBitrix: false,
    onQualifiedDemand: ({ body, headers, method }) => {
      qdNoConsentRequests.push({ body, headers, method });
    }
  });

  await qdNoConsentPage.goto(`${baseUrl}/`, {
    waitUntil: 'networkidle'
  });

  const qdNoConsentFrame = qdNoConsentPage.frames().find((frame) =>
    frame.url().includes('/forms/bitrix.html?form=8')
  );

  if (!qdNoConsentFrame) {
    fail('/: no-consent QD test could not find form 8 iframe.');
  } else {
    await qdNoConsentFrame
      .locator('.b24-form input[aria-label="Имя"]')
      .fill('no-consent');

    await qdNoConsentPage.waitForTimeout(100);

    if (qdNoConsentRequests.length !== 0) {
      fail('/: QD emitted without analytics consent.');
    }

    const qdStorage = await qdNoConsentFrame.evaluate(() => ({
      identity: localStorage.getItem('fgn_qd_identity_v1'),
      pending: localStorage.getItem('fgn_qd_pending_v1'),
      completed: localStorage.getItem('fgn_qd_completed_v1')
    }));

    if (
      qdStorage.identity !== null ||
      qdStorage.pending !== null ||
      qdStorage.completed !== null
    ) {
      fail('/: QD localStorage was created without analytics consent.');
    }

    await qdNoConsentPage
      .locator('#cookie-analytics-accept')
      .click();

    await qdNoConsentFrame
      .locator('.b24-form input[aria-label="Имя"]')
      .fill('after-late-consent');

    await qdNoConsentPage.waitForTimeout(100);

    if (qdNoConsentRequests.length !== 0) {
      fail(
        '/: input after late consent was mislabeled as the first meaningful QD input.'
      );
    }

    const qdLateConsentStorage = await qdNoConsentFrame.evaluate(() => ({
      identity: localStorage.getItem('fgn_qd_identity_v1'),
      pending: localStorage.getItem('fgn_qd_pending_v1'),
      completed: localStorage.getItem('fgn_qd_completed_v1')
    }));

    if (
      qdLateConsentStorage.identity !== null ||
      qdLateConsentStorage.pending !== null ||
      qdLateConsentStorage.completed !== null
    ) {
      fail(
        '/: late consent created QD storage after the form had already started.'
      );
    }
  }

  await qdNoConsentPage.close();

  const qualifiedDemandRequests = [];
  const qdContext = await browser.newContext({
    viewport: { width: 1366, height: 900 }
  });

  await qdContext.addInitScript(() => {
    try {
      localStorage.setItem('fgn_analytics_consent', JSON.stringify({
        status: 'granted',
        decidedAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000
      }));
    } catch {}
  });

  const qdPage = await qdContext.newPage();

  await mockExternalResources(qdPage, {
    useLiveBitrix: false,
    onQualifiedDemand: ({ body, headers, method }) => {
      qualifiedDemandRequests.push({ body, headers, method });
    }
  });

  await qdPage.goto(`${baseUrl}/`, {
    waitUntil: 'networkidle'
  });

  const qdHomeFrame = qdPage.frames().find((frame) =>
    frame.url().includes('/forms/bitrix.html?form=8')
  );

  if (!qdHomeFrame) {
    fail('/: QD test could not find form 8 iframe.');
  } else {
    const input = qdHomeFrame.locator(
      '.b24-form input[aria-label="Имя"]'
    );

    await input.focus();
    await qdPage.waitForTimeout(50);

    if (qualifiedDemandRequests.length !== 0) {
      fail('/: QD emitted on focus instead of value change.');
    }

    await qdHomeFrame.evaluate(() => {
      const form = document.querySelector('.b24-form');
      const agreement = document.createElement('div');
      agreement.className = 'b24-form-control-agreement';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      agreement.appendChild(checkbox);
      form?.appendChild(agreement);
      checkbox.click();
    });

    await qdPage.waitForTimeout(50);

    if (qualifiedDemandRequests.length !== 0) {
      fail('/: QD emitted for checkbox-only change.');
    }

    await input.fill('');
    await qdPage.waitForTimeout(50);

    if (qualifiedDemandRequests.length !== 0) {
      fail('/: QD emitted for empty input.');
    }

    await input.fill('x');

    for (
      let attempt = 0;
      attempt < 20 &&
      qualifiedDemandRequests.length === 0;
      attempt += 1
    ) {
      await qdPage.waitForTimeout(50);
    }

    if (qualifiedDemandRequests.length !== 1) {
      fail(
        `/: first meaningful input emitted ${qualifiedDemandRequests.length} QD requests instead of 1.`
      );
    } else {
      const request = qualifiedDemandRequests[0];
      const payload = request.body || {};
      const exactKeys = [
        'schemaVersion',
        'eventId',
        'identityRef',
        'identityState',
        'eventKind',
        'propertyRef',
        'formRef',
        'routeRef',
        'cohortRef',
        'occurredAt',
        'sourceRevision'
      ].sort();

      if (
        JSON.stringify(Object.keys(payload).sort()) !==
        JSON.stringify(exactKeys)
      ) {
        fail(
          '/: QD payload does not have the exact strict event keys.'
        );
      }

      const expected = {
        schemaVersion: '1.0.0',
        identityState:
          'PROVISIONAL_FIRST_PARTY_BROWSER_IDENTITY',
        eventKind: 'FIRST_MEANINGFUL_FORM_INPUT',
        propertyRef: 'property:fgn-public-site',
        formRef: 'bitrix:crm-form:8',
        routeRef: 'route:home',
        cohortRef:
          'fgn:web-commercial-form-to-crm-cohort:v1',
        sourceRevision: 'site:fgn-form-start:v1'
      };

      for (const [key, value] of Object.entries(expected)) {
        if (payload[key] !== value) {
          fail(
            `/: QD payload ${key}=${payload[key]} instead of ${value}.`
          );
        }
      }

      if (
        !/^fgnqd_evt_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          payload.eventId || ''
        )
      ) {
        fail('/: QD eventId is not an opaque UUIDv4 event id.');
      }

      if (
        !/^fgnqd_id_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          payload.identityRef || ''
        )
      ) {
        fail('/: QD identityRef is not an opaque UUIDv4 identity id.');
      }

      if (
        request.method !== 'POST' ||
        request.headers['content-type'] !== 'application/json'
      ) {
        fail('/: QD request transport contract is incorrect.');
      }

      const serialized = JSON.stringify(payload);

      for (const forbidden of [
        'fieldName',
        'fieldValue',
        'contactEmail',
        'contactPhone',
        '"x"'
      ]) {
        if (serialized.includes(forbidden)) {
          fail(
            `/: QD payload leaked forbidden form data marker ${forbidden}.`
          );
        }
      }
    }

    await input.fill('xy');
    await qdPage.waitForTimeout(100);

    if (qualifiedDemandRequests.length !== 1) {
      fail('/: repeated meaningful input emitted duplicate QD request.');
    }
  }

  await qdPage.close();

  const qdSecondPage = await qdContext.newPage();

  await mockExternalResources(qdSecondPage, {
    useLiveBitrix: false,
    onQualifiedDemand: ({ body, headers, method }) => {
      qualifiedDemandRequests.push({ body, headers, method });
    }
  });

  await qdSecondPage.goto(
    `${baseUrl}/kapsulirovanie/`,
    { waitUntil: 'networkidle' }
  );

  const qdSecondFrame = qdSecondPage.frames().find((frame) =>
    frame.url().includes('/forms/bitrix.html?form=10')
  );

  if (!qdSecondFrame) {
    fail(
      '/kapsulirovanie/: QD dedup test could not find form 10 iframe.'
    );
  } else {
    await qdSecondFrame
      .locator('.b24-form input[aria-label="Имя"]')
      .fill('z');
    await qdSecondPage.waitForTimeout(100);

    if (qualifiedDemandRequests.length !== 1) {
      fail(
        '/kapsulirovanie/: same browser identity emitted a second QD request.'
      );
    }
  }

  await qdSecondPage.close();
  await qdContext.close();

  const qdFailurePage = await browser.newPage({
    viewport: { width: 1366, height: 900 }
  });
  const qdFailureErrors = [];
  let qdFailureRequests = 0;

  await qdFailurePage.addInitScript(() => {
    try {
      localStorage.setItem('fgn_analytics_consent', JSON.stringify({
        status: 'granted',
        decidedAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000
      }));
    } catch {}
  });

  qdFailurePage.on(
    'pageerror',
    (error) => qdFailureErrors.push(error.message)
  );

  await mockExternalResources(qdFailurePage, {
    useLiveBitrix: false,
    qualifiedDemandHttpStatus: 503,
    onQualifiedDemand: () => {
      qdFailureRequests += 1;
    }
  });

  await qdFailurePage.goto(
    `${baseUrl}/kontraktnoe-proizvodstvo-bad/`,
    { waitUntil: 'networkidle' }
  );

  const qdFailureFrame = qdFailurePage.frames().find((frame) =>
    frame.url().includes('/forms/bitrix.html?form=16')
  );

  if (!qdFailureFrame) {
    fail(
      '/kontraktnoe-proizvodstvo-bad/: QD failure test could not find form 16 iframe.'
    );
  } else {
    const input = qdFailureFrame.locator(
      '.b24-form input[aria-label="Имя"]'
    );
    await input.fill('q');
    await qdFailurePage.waitForTimeout(100);

    if (qdFailureRequests !== 1) {
      fail(
        '/kontraktnoe-proizvodstvo-bad/: failed Worker did not receive exactly one attempt.'
      );
    }

    if (!await input.isEnabled()) {
      fail(
        '/kontraktnoe-proizvodstvo-bad/: Worker failure disabled the form input.'
      );
    }

    if (
      !await qdFailureFrame
        .locator('.b24-form button[type="submit"]')
        .isEnabled()
    ) {
      fail(
        '/kontraktnoe-proizvodstvo-bad/: Worker failure disabled form submission.'
      );
    }

    if (qdFailureErrors.length) {
      fail(
        '/kontraktnoe-proizvodstvo-bad/: Worker failure surfaced page errors: ' +
        qdFailureErrors.join(' | ')
      );
    }
  }

  await qdFailurePage.close();

  const qdWithdrawPage = await browser.newPage({
    viewport: { width: 1366, height: 900 }
  });

  await qdWithdrawPage.addInitScript(() => {
    if (window.top !== window) return;

    try {
      const now = Date.now();
      localStorage.setItem('fgn_analytics_consent', JSON.stringify({
        status: 'granted',
        decidedAt: now,
        expiresAt: now + 60 * 60 * 1000
      }));
      localStorage.setItem(
        'fgn_qd_identity_v1',
        'fgnqd_id_00000000-0000-4000-8000-000000000001'
      );
      localStorage.setItem(
        'fgn_qd_pending_v1',
        '{"synthetic":true}'
      );
      localStorage.setItem(
        'fgn_qd_completed_v1',
        'fgnqd_id_00000000-0000-4000-8000-000000000001'
      );
    } catch {}
  });

  let qdWithdrawRequests = 0;
  const qdRevokeRequests = [];

  await mockExternalResources(qdWithdrawPage, {
    useLiveBitrix: false,
    onQualifiedDemand: () => {
      qdWithdrawRequests += 1;
    },
    onQualifiedDemandRevoke: ({ body, headers, method }) => {
      qdRevokeRequests.push({ body, headers, method });
    }
  });

  await qdWithdrawPage.goto(`${baseUrl}/`, {
    waitUntil: 'networkidle'
  });

  await qdWithdrawPage
    .locator('[data-cookie-settings]')
    .first()
    .click();

  await qdWithdrawPage
    .locator('#cookie-analytics-decline')
    .click();

  for (
    let attempt = 0;
    attempt < 40 &&
    qdRevokeRequests.length === 0;
    attempt += 1
  ) {
    await qdWithdrawPage.waitForTimeout(50);
  }

  if (qdRevokeRequests.length !== 1) {
    fail(
      `/: analytics withdrawal emitted ${qdRevokeRequests.length} revoke requests instead of 1.`
    );
  } else {
    const request = qdRevokeRequests[0];
    const payload = request.body || {};
    const exactKeys = [
      'schemaVersion',
      'identityRef',
      'cohortRef'
    ].sort();

    if (
      JSON.stringify(Object.keys(payload).sort()) !==
      JSON.stringify(exactKeys)
    ) {
      fail('/: QD revoke payload does not have the exact strict keys.');
    }

    if (
      payload.schemaVersion !== '1.0.0' ||
      payload.identityRef !==
        'fgnqd_id_00000000-0000-4000-8000-000000000001' ||
      payload.cohortRef !==
        'fgn:web-commercial-form-to-crm-cohort:v1'
    ) {
      fail('/: QD revoke payload coordinates are incorrect.');
    }

    if (
      request.method !== 'POST' ||
      request.headers['content-type'] !== 'application/json'
    ) {
      fail('/: QD revoke transport contract is incorrect.');
    }
  }

  const qdAfterWithdrawal = await qdWithdrawPage.evaluate(() => ({
    consent: JSON.parse(
      localStorage.getItem('fgn_analytics_consent') || 'null'
    )?.status || null,
    identity: localStorage.getItem('fgn_qd_identity_v1'),
    pending: localStorage.getItem('fgn_qd_pending_v1'),
    completed: localStorage.getItem('fgn_qd_completed_v1')
  }));

  if (qdAfterWithdrawal.consent !== 'denied') {
    fail('/: analytics consent withdrawal did not persist denied status.');
  }

  if (
    qdAfterWithdrawal.identity !== null ||
    qdAfterWithdrawal.pending !== null ||
    qdAfterWithdrawal.completed !== null
  ) {
    fail('/: QD analytics storage survived consent withdrawal.');
  }

  const qdWithdrawFrame = qdWithdrawPage.frames().find((frame) =>
    frame.url().includes('/forms/bitrix.html?form=8')
  );

  if (!qdWithdrawFrame) {
    fail('/: post-withdrawal QD test could not find form 8 iframe.');
  } else {
    await qdWithdrawFrame
      .locator('.b24-form input[aria-label="Имя"]')
      .fill('after-withdrawal');

    await qdWithdrawPage.waitForTimeout(100);

    if (qdWithdrawRequests !== 0) {
      fail('/: QD emitted after analytics consent withdrawal.');
    }

    const qdStorageAfterPostWithdrawalInput =
      await qdWithdrawFrame.evaluate(() => ({
        identity: localStorage.getItem('fgn_qd_identity_v1'),
        pending: localStorage.getItem('fgn_qd_pending_v1'),
        completed: localStorage.getItem('fgn_qd_completed_v1')
      }));

    if (
      qdStorageAfterPostWithdrawalInput.identity !== null ||
      qdStorageAfterPostWithdrawalInput.pending !== null ||
      qdStorageAfterPostWithdrawalInput.completed !== null
    ) {
      fail('/: QD storage was recreated after analytics withdrawal.');
    }
  }

  await qdWithdrawPage.close();

  const qdInitialDeclinePage = await browser.newPage({
    viewport: { width: 1366, height: 900 }
  });
  let qdInitialDeclineRevokes = 0;

  await mockExternalResources(qdInitialDeclinePage, {
    useLiveBitrix: false,
    onQualifiedDemandRevoke: () => {
      qdInitialDeclineRevokes += 1;
    }
  });

  await qdInitialDeclinePage.goto(`${baseUrl}/`, {
    waitUntil: 'networkidle'
  });

  await qdInitialDeclinePage
    .locator('#cookie-analytics-decline')
    .click();
  await qdInitialDeclinePage.waitForTimeout(150);

  if (qdInitialDeclineRevokes !== 0) {
    fail('/: initial analytics denial emitted revoke without a QD identity.');
  }

  const initialDeclineBridgeCount =
    await qdInitialDeclinePage
      .locator('iframe[data-qd-revoke-bridge]')
      .count();

  if (initialDeclineBridgeCount !== 0) {
    fail('/: initial analytics denial created an unnecessary revoke bridge.');
  }

  await qdInitialDeclinePage.close();

  const qdRevokeFailurePage = await browser.newPage({
    viewport: { width: 1366, height: 900 }
  });
  const qdFailedRevokes = [];
  const qdRevokeFailureErrors = [];

  await qdRevokeFailurePage.addInitScript(() => {
    if (window.top !== window) return;

    try {
      const now = Date.now();
      localStorage.setItem('fgn_analytics_consent', JSON.stringify({
        status: 'granted',
        decidedAt: now,
        expiresAt: now + 60 * 60 * 1000
      }));
      localStorage.setItem(
        'fgn_qd_identity_v1',
        'fgnqd_id_00000000-0000-4000-8000-000000000002'
      );
      localStorage.setItem(
        'fgn_qd_completed_v1',
        'fgnqd_id_00000000-0000-4000-8000-000000000002'
      );
    } catch {}
  });

  qdRevokeFailurePage.on(
    'pageerror',
    (error) => qdRevokeFailureErrors.push(error.message)
  );

  await mockExternalResources(qdRevokeFailurePage, {
    useLiveBitrix: false,
    qualifiedDemandRevokeHttpStatus: 503,
    onQualifiedDemandRevoke: ({ body }) => {
      qdFailedRevokes.push(body);
    }
  });

  await qdRevokeFailurePage.goto(`${baseUrl}/products/`, {
    waitUntil: 'networkidle'
  });

  await qdRevokeFailurePage
    .locator('[data-cookie-settings]')
    .first()
    .click();
  await qdRevokeFailurePage
    .locator('#cookie-analytics-decline')
    .click();

  for (
    let attempt = 0;
    attempt < 50 &&
    qdFailedRevokes.length < 3;
    attempt += 1
  ) {
    await qdRevokeFailurePage.waitForTimeout(50);
  }

  if (qdFailedRevokes.length !== 3) {
    fail(
      `/products/: failed revoke attempted ${qdFailedRevokes.length} times instead of bounded 3.`
    );
  }

  const qdAfterFailedRevoke =
    await qdRevokeFailurePage.evaluate(() => ({
      consent: JSON.parse(
        localStorage.getItem('fgn_analytics_consent') || 'null'
      )?.status || null,
      identity: localStorage.getItem('fgn_qd_identity_v1'),
      pending: localStorage.getItem('fgn_qd_pending_v1'),
      completed: localStorage.getItem('fgn_qd_completed_v1')
    }));

  if (
    qdAfterFailedRevoke.consent !== 'denied' ||
    qdAfterFailedRevoke.identity !== null ||
    qdAfterFailedRevoke.pending !== null ||
    qdAfterFailedRevoke.completed !== null
  ) {
    fail('/products/: failed revoke blocked immediate local consent cleanup.');
  }

  if (qdRevokeFailureErrors.length) {
    fail(
      '/products/: failed revoke surfaced page errors: ' +
      qdRevokeFailureErrors.join(' | ')
    );
  }

  await qdRevokeFailurePage.close();

  const bitrixGoalCases = [
    ['/', '8', 'B24_FORM_8_END', 'event'],
    ['/kapsulirovanie/', '10', 'B24_FORM_10_END', 'event'],
    ['/kontraktnoe-proizvodstvo-bad/', '16', 'B24_FORM_16_END', 'dom']
  ];

  for (const [route, formId, goal, trigger] of bitrixGoalCases) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

    await page.addInitScript(() => {
      try {
        localStorage.setItem('fgn_analytics_consent', JSON.stringify({
          status: 'granted',
          decidedAt: Date.now(),
          expiresAt: Date.now() + 60 * 60 * 1000
        }));
      } catch {}

      window.__fgnGoalCalls = [];
      window.ym = (...args) => window.__fgnGoalCalls.push(args);
    });

    await mockExternalResources(page, { useLiveBitrix: false });
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });

    const isolatedFrame = page.frames().find((frame) =>
      frame.url().includes(`/forms/bitrix.html?form=${formId}`)
    );

    if (!isolatedFrame) {
      fail(`${route}: goal bridge test could not find form ${formId} iframe.`);
      await page.close();
      continue;
    }

    if (trigger === 'event') {
      await isolatedFrame.evaluate((id) => {
        window.dispatchEvent(new CustomEvent('b24:form:send:success', {
          detail: {
            object: {
              identification: {
                id: Number(id)
              }
            }
          }
        }));
      }, formId);
    } else {
      await isolatedFrame.evaluate(() => {
        const success = document.createElement('div');
        success.className = 'b24-form-state b24-form-success';
        success.style.display = 'block';
        document.body.appendChild(success);
      });
    }

    try {
      await page.waitForFunction(
        (expectedGoal) =>
          window.__fgnGoalCalls?.some((args) =>
            args[0] === 111744945 &&
            args[1] === 'reachGoal' &&
            args[2] === expectedGoal
          ),
        goal,
        { timeout: 3000 }
      );
    } catch {
      fail(`${route}: successful form ${formId} did not emit ${goal}.`);
    }

    const calls = await page.evaluate((expectedGoal) =>
      window.__fgnGoalCalls.filter((args) =>
        args[0] === 111744945 &&
        args[1] === 'reachGoal' &&
        args[2] === expectedGoal
      ).length,
    goal);

    if (calls !== 1) {
      fail(`${route}: ${goal} emitted ${calls} times, expected exactly 1.`);
    }

    await page.close();
  }

  const deniedPage = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  await deniedPage.addInitScript(() => {
    try {
      localStorage.setItem('fgn_analytics_consent', JSON.stringify({
        status: 'denied',
        decidedAt: Date.now(),
        expiresAt: Date.now() + 60 * 60 * 1000
      }));
    } catch {}

    window.__fgnGoalCalls = [];
    window.ym = (...args) => window.__fgnGoalCalls.push(args);
  });

  await mockExternalResources(deniedPage, { useLiveBitrix: false });
  await deniedPage.goto(`${baseUrl}/kapsulirovanie/`, { waitUntil: 'networkidle' });

  const deniedFrame = deniedPage.frames().find((frame) =>
    frame.url().includes('/forms/bitrix.html?form=10')
  );

  if (!deniedFrame) {
    fail('/kapsulirovanie/: denied-consent goal test could not find form 10 iframe.');
  } else {
    await deniedFrame.evaluate(() => {
      window.dispatchEvent(new CustomEvent('b24:form:send:success', {
        detail: {
          object: {
            identification: {
              id: 10
            }
          }
        }
      }));
    });

    await deniedPage.waitForTimeout(250);

    const deniedCalls = await deniedPage.evaluate(() =>
      window.__fgnGoalCalls.filter((args) =>
        args[0] === 111744945 &&
        args[1] === 'reachGoal' &&
        args[2] === 'B24_FORM_10_END'
      ).length
    );

    if (deniedCalls !== 0) {
      fail('/kapsulirovanie/: B24_FORM_10_END fired without analytics consent.');
    }
  }

  await deniedPage.close();

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
