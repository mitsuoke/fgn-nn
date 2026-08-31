import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const errors = [];
const fail = (message) => errors.push(message);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const text = (html = '') => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
const absoluteUrl = (relative) => `https://fgn-nn.ru${relative}`;
const metaContent = (html, attribute, value) => html.match(new RegExp(`<meta\\s+${attribute}="${value}"\\s+content="([^"]*)"`))?.[1]?.trim() || '';
const schemaNodes = (html) => [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((match) => { try { return JSON.parse(match[1]); } catch { return null; } })
  .filter(Boolean)
  .flatMap((schema) => schema['@graph'] || [schema]);
const htmlFiles = [];

const walk = (directory = '.') => {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    if (['.git', 'upload', 'node_modules'].includes(entry.name)) continue;
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(relative);
    else if (relative.endsWith('.html')) htmlFiles.push(relative);
  }
};
walk();

let productData;
try {
  productData = JSON.parse(read('data/products.json'));
} catch (error) {
  fail(`data/products.json: ${error.message}`);
  productData = { products: [] };
}

const products = Array.isArray(productData.products) ? productData.products : [];
const active = products.filter((product) => product.active !== false);
const slugs = products.map((product) => product.slug);
if (new Set(slugs).size !== slugs.length) fail('В products.json есть повторяющиеся slug.');
if (new Set(products.map((product) => product.catalogOrder)).size !== products.length) fail('catalogOrder должен быть уникальным.');

for (const product of products) {
  const prefix = `products.json:${product.slug}`;
  if (!/^[a-z0-9-]+$/.test(product.slug || '')) fail(`${prefix}: некорректный slug.`);
  if (!product.name || !product.description || !product.warning) fail(`${prefix}: не заполнены обязательные тексты.`);
  if (!product.catalog?.name || !product.catalog?.package || !product.catalog?.capsule || !product.catalog?.composition) fail(`${prefix}: не заполнены данные каталога.`);
  if (!product.images?.hero || !product.seo?.title || !product.seo?.description || !product.seo?.ogTitle || !product.seo?.ogDescription || !product.seo?.schemaName || !product.seo?.schemaDescription || !product.seo?.breadcrumbName || !product.seo?.schemaImages?.length) fail(`${prefix}: не заполнен SEO-контракт.`);
  for (const field of ['description', 'schemaDescription']) {
    if (!product.seo?.[field]?.includes(product.catalog.package) || !product.seo?.[field]?.includes(product.catalog.capsule)) fail(`${prefix}: ${field} не содержит актуальные упаковку и массу капсулы.`);
  }
  const socialSummary = [product.seo?.title, product.seo?.ogTitle, product.seo?.ogDescription].join(' ');
  if (!socialSummary.includes(product.catalog.package) || !socialSummary.includes(product.catalog.capsule)) fail(`${prefix}: title/OpenGraph не содержат актуальные упаковку и массу капсулы.`);
  if (product.slug === 'ezhovik' ? product.category !== 'БАД к пище' : product.category !== 'Пищевая добавка') fail(`${prefix}: неверная категория продукта.`);
  if (product.slug === 'ezhovik' ? !/^БАД\./.test(product.warning) : !/^Пищевая добавка\./.test(product.warning)) fail(`${prefix}: неверное предупреждение.`);
  if (!product.ozon || (product.ozon.active && !/^https:\/\/www\.ozon\.ru\//.test(product.ozon.url || ''))) fail(`${prefix}: некорректная активная ссылка Ozon.`);
  for (const image of [product.images?.hero, product.images?.catalog, product.images?.bottle, ...(product.images?.gallery || []), ...(product.seo?.schemaImages || [])].filter(Boolean)) {
    if (!exists(image.replace(/^\//, ''))) fail(`${prefix}: отсутствует ${image}.`);
  }

  const page = `products/${product.slug}/index.html`;
  if (!exists(page)) {
    fail(`${prefix}: отсутствует ${page}.`);
    continue;
  }
  const html = read(page);
  if (!html.includes(`data-product-slug="${product.slug}"`)) fail(`${page}: slug страницы не совпадает с JSON.`);
  if (!html.includes('data-product-gallery')) fail(`${page}: галерея не подключена к products.json.`);
  const fallbackName = text(html.match(/<h1[^>]*data-product-name[^>]*>([\s\S]*?)<\/h1>/)?.[1]);
  const fallbackDescription = text(html.match(/<p[^>]*data-product-description[^>]*>([\s\S]*?)<\/p>/)?.[1]);
  const fallbackWarning = text(html.match(/<[^>]*data-product-warning[^>]*>([\s\S]*?)<\/[^>]+>/)?.[1]);
  if (fallbackName !== product.name) fail(`${page}: резервное название не совпадает с products.json.`);
  if (fallbackDescription !== product.description) fail(`${page}: резервное описание не совпадает с products.json.`);
  if (fallbackWarning !== product.warning) fail(`${page}: резервное предупреждение не совпадает с products.json.`);
  const expectedCanonical = `https://fgn-nn.ru/products/${product.slug}/`;
  const title = text(html.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
  const description = metaContent(html, 'name', 'description');
  const ogTitle = metaContent(html, 'property', 'og:title');
  const ogDescription = metaContent(html, 'property', 'og:description');
  const ogImage = metaContent(html, 'property', 'og:image');
  const ogUrl = metaContent(html, 'property', 'og:url');
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)?.[1]?.trim() || '';
  if (title !== product.seo.title) fail(`${page}: title не совпадает с products.json.`);
  if (description !== product.seo.description) fail(`${page}: meta description не совпадает с products.json.`);
  if (ogTitle !== product.seo.ogTitle) fail(`${page}: og:title не совпадает с products.json.`);
  if (ogDescription !== product.seo.ogDescription) fail(`${page}: og:description не совпадает с products.json.`);
  if (ogImage !== absoluteUrl(product.images.hero)) fail(`${page}: og:image не совпадает с products.json.`);
  if (canonical !== expectedCanonical || ogUrl !== expectedCanonical) fail(`${page}: canonical или og:url не соответствует slug.`);
  const galleryCount = [...html.matchAll(/data-product-zoom/g)].length;
  if (galleryCount !== (product.images?.gallery || []).length) fail(`${page}: HTML-резерв галереи (${galleryCount}) не совпадает с JSON (${product.images?.gallery?.length || 0}).`);
  const schemas = schemaNodes(html);
  const productSchema = schemas.find((schema) => schema['@type'] === 'Product');
  const breadcrumbSchema = schemas.find((schema) => schema['@type'] === 'BreadcrumbList');
  if (!productSchema) fail(`${page}: отсутствует Product JSON-LD.`);
  else {
    if (String(productSchema.sku) !== String(product.sku)) fail(`${page}: SKU в Product JSON-LD не совпадает с products.json.`);
    if (productSchema.category !== product.category) fail(`${page}: категория в Product JSON-LD не совпадает с products.json.`);
    if (productSchema.name !== product.seo.schemaName) fail(`${page}: название в Product JSON-LD не совпадает с products.json.`);
    if (productSchema.description !== product.seo.schemaDescription) fail(`${page}: описание в Product JSON-LD не совпадает с products.json.`);
    const schemaImages = (Array.isArray(productSchema.image) ? productSchema.image : [productSchema.image]).filter(Boolean);
    if (JSON.stringify(schemaImages) !== JSON.stringify(product.seo.schemaImages.map(absoluteUrl))) fail(`${page}: изображения в Product JSON-LD не совпадают с products.json.`);
    if (productSchema.url && productSchema.url !== expectedCanonical) fail(`${page}: URL в Product JSON-LD не соответствует slug.`);
  }
  const breadcrumbItems = breadcrumbSchema?.itemListElement || [];
  const expectedBreadcrumbs = [
    { name: 'Главная', item: 'https://fgn-nn.ru/' },
    { name: 'Продукция', item: 'https://fgn-nn.ru/products/' },
    { name: product.seo.breadcrumbName, item: expectedCanonical }
  ];
  if (JSON.stringify(breadcrumbItems.map(({ name, item }) => ({ name, item }))) !== JSON.stringify(expectedBreadcrumbs)) fail(`${page}: BreadcrumbList не совпадает с products.json и маршрутом.`);
}

const activeSlugs = active.sort((a, b) => a.catalogOrder - b.catalogOrder).map((product) => product.slug);
for (const file of ['index.html', 'products/index.html']) {
  const html = read(file);
  const collection = html.match(/data-product-collection=["'][^"']+["'][\s\S]*?(?:<\/div>\s*<\/div>|<\/section>)/)?.[0] || html;
  const pageSlugs = [...collection.matchAll(/data-product-slug="([^"]+)"/g)].map((match) => match[1]);
  if (JSON.stringify(pageSlugs) !== JSON.stringify(activeSlugs)) fail(`${file}: порядок или состав HTML-резерва товаров не совпадает с products.json.`);
  if (!html.includes('shop.js?v=4')) fail(`${file}: не подключён актуальный shop.js.`);
}

const catalogHtml = read('products/index.html');
const homeHtml = read('index.html');
for (const product of active) {
  const catalogCard = catalogHtml.match(new RegExp(`<article[^>]*data-product-slug="${product.slug}"[^>]*>([\\s\\S]*?)<\\/article>`))?.[1] || '';
  const catalogValues = [...catalogCard.matchAll(/<dd>([\s\S]*?)<\/dd>/g)].map((match) => text(match[1]));
  const expectedValues = [product.catalog.package, product.catalog.capsule, product.catalog.composition];
  if (JSON.stringify(catalogValues) !== JSON.stringify(expectedValues)) fail(`products/index.html:${product.slug}: резервные характеристики не совпадают с products.json.`);
  if (text(catalogCard.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1]) !== product.catalog.name) fail(`products/index.html:${product.slug}: резервное название не совпадает с products.json.`);

  const homeCard = homeHtml.match(new RegExp(`<a[^>]*data-product-slug="${product.slug}"[^>]*>([\\s\\S]*?)<\\/a>`))?.[1] || '';
  if (text(homeCard.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1]) !== product.catalog.name) fail(`index.html:${product.slug}: резервное название не совпадает с products.json.`);
  if (text(homeCard.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1]) !== `${product.catalog.package} · ${product.catalog.capsule}`) fail(`index.html:${product.slug}: резервная сводка не совпадает с products.json.`);
}

const catalogSchemas = [...catalogHtml.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((match) => JSON.parse(match[1]));
const itemList = catalogSchemas.flatMap((schema) => schema['@graph'] || [schema]).find((schema) => schema['@type'] === 'ItemList');
const schemaSlugs = (itemList?.itemListElement || []).map((item) => item.url?.match(/\/products\/([^/]+)\/$/)?.[1]);
if (itemList?.numberOfItems !== active.length || JSON.stringify(schemaSlugs) !== JSON.stringify(activeSlugs)) fail('products/index.html: ItemList JSON-LD не совпадает с products.json.');

const commercialForms = [
  { file: 'kapsulirovanie/index.html', id: '10' },
  { file: 'fasovka-sypuchih-produktov/index.html', id: '16' },
  { file: 'fasovka-chaya-i-sborov/index.html', id: '16' },
  { file: 'upakovka-i-markirovka-bad/index.html', id: '16' },
  { file: 'kontraktnoe-proizvodstvo-bad/index.html', id: '16' }
];

const shortFormFrames = new Set();

for (const config of commercialForms) {
  const html = read(config.file);

  const frames = [
    ...html.matchAll(
      new RegExp(
        `<iframe\\b[^>]*data-bitrix-form-frame="${config.id}"[^>]*>`,
        'g'
      )
    )
  ].map((match) => match[0]);

  if (frames.length !== 1) {
    fail(
      `${config.file}: ожидается один iframe CRM-формы №${config.id}, найдено ${frames.length}.`
    );
    continue;
  }

  const frame = frames[0];

  if (!frame.includes(`src="../forms/bitrix.html?form=${config.id}"`)) {
    fail(`${config.file}: iframe ведёт на неверную CRM-форму.`);
  }

  if (!frame.includes('loading="eager"')) {
    fail(`${config.file}: CRM iframe должен загружаться eagerly.`);
  }

  if (/<script\s+data-b24-form=/.test(html)) {
    fail(`${config.file}: осталась прямая вставка Bitrix на коммерческой странице.`);
  }

  if (!html.includes(`data-commercial-crm="${config.id}"`)) {
    fail(`${config.file}: контейнер CRM-формы не соответствует форме №${config.id}.`);
  }

  if (!html.includes('commercial-pages.css?v=4')) {
    fail(`${config.file}: подключена неактуальная версия commercial-pages.css.`);
  }

  if (!html.includes('commercial-pages.js?v=2')) {
    fail(`${config.file}: подключена неактуальная версия commercial-pages.js.`);
  }

  if (!html.includes(
    '<a href="https://fgn-nn.ru/consent.html">Согласие на обработку персональных данных</a>'
  )) {
    fail(`${config.file}: рядом с CRM-формой отсутствует ссылка на согласие.`);
  }

  if (!html.includes(
    'class="commercial-mobile-quick" aria-label="Быстрые действия"><a href="#contact">Получить расчёт</a>'
  )) {
    fail(`${config.file}: мобильный CTA не ведёт к форме на странице.`);
  }

  const contactBlock =
    html.match(
      /<section class="section section-tint" id="contact">([\s\S]*?)<\/section>/
    )?.[1] || '';

  if (/mailto:|contact-email/.test(contactBlock)) {
    fail(`${config.file}: в основном блоке расчёта осталась ссылка e-mail.`);
  }

  const csp = metaContent(
    html,
    'http-equiv',
    'Content-Security-Policy'
  );

  const frameSrc =
    csp.match(/frame-src\s+([^;]+)/)?.[1] || '';

  if (!frameSrc.split(/\s+/).includes("'self'")) {
    fail(`${config.file}: frame-src не разрешает локальную изолированную CRM-форму.`);
  }

  if (/bitrix24\.ru/.test(csp)) {
    fail(`${config.file}: Bitrix-домены не должны быть разрешены в CSP основной страницы.`);
  }

  if (/script-src[^;]*(?:'unsafe-inline'|'unsafe-eval'|\*)/.test(csp)) {
    fail(`${config.file}: script-src основной страницы содержит широкое разрешение.`);
  }

  if (config.id === '16') shortFormFrames.add(frame);
}

if (shortFormFrames.size !== 1) {
  fail('Iframe CRM-формы №16 должен быть одинаковым на четырёх коммерческих страницах.');
}

const isolatedFormHtml = read('forms/bitrix.html');
const isolatedFormScript = read('forms/bitrix-embed.js');

if (!isolatedFormHtml.includes('src="bitrix-embed.js?v=2"')) {
  fail('forms/bitrix.html: подключена неактуальная версия bitrix-embed.js.');
}

if (!isolatedFormHtml.includes(
  '<meta name="robots" content="noindex,nofollow">'
)) {
  fail('forms/bitrix.html: служебная страница должна быть noindex,nofollow.');
}

const isolatedCsp = metaContent(
  isolatedFormHtml,
  'http-equiv',
  'Content-Security-Policy'
);

const isolatedScriptSrc =
  isolatedCsp.match(/script-src\s+([^;]+)/)?.[1] || '';

for (const source of [
  "'unsafe-eval'",
  'https://cdn-ru.bitrix24.ru',
  'https://b24-ud1314.bitrix24.ru'
]) {
  if (!isolatedScriptSrc.split(/\s+/).includes(source)) {
    fail(`forms/bitrix.html: script-src не содержит ${source}.`);
  }
}

if (/frame-ancestors/.test(isolatedCsp)) {
  fail('forms/bitrix.html: frame-ancestors нельзя задавать через meta CSP.');
}

for (const required of [
  "'8'",
  "sec: 'kodg8f'",
  'loader_8.js',
  "'10'",
  "sec: '20s329'",
  'loader_10.js',
  "'16'",
  "sec: '5s6fmf'",
  'loader_16.js',
  'fgn-bitrix-height',
  'parent.postMessage'
]) {
  if (!isolatedFormScript.includes(required)) {
    fail(`forms/bitrix-embed.js: отсутствует обязательный фрагмент ${required}.`);
  }
}

for (const file of htmlFiles) {
  if (
    file !== 'forms/bitrix.html' &&
    read(file).includes("'unsafe-eval'")
  ) {
    fail(`${file}: unsafe-eval разрешён вне изолированной CRM-страницы.`);
  }
}

const commonScript = read('script.js');

for (const required of [
  'fgn-bitrix-height',
  'event.origin !== window.location.origin',
  'event.source !== frame.contentWindow'
]) {
  if (!commonScript.includes(required)) {
    fail(`script.js: отсутствует безопасный CRM resize-bridge: ${required}.`);
  }
}

if (read('commercial-pages.js').includes('fgn-bitrix-height')) {
  fail('commercial-pages.js: CRM resize-bridge должен находиться только в общем script.js.');
}

const homeIsolatedHtml = read('index.html');

if (
  !homeIsolatedHtml.includes('data-bitrix-form-frame="8"') ||
  !homeIsolatedHtml.includes('src="forms/bitrix.html?form=8"')
) {
  fail('index.html: изолированная CRM-форма №8 отсутствует или подключена неверно.');
}

if (/<script\s+data-b24-form=/.test(homeIsolatedHtml)) {
  fail('index.html: на главной осталась прямая вставка Bitrix.');
}

const homeCsp = metaContent(
  homeIsolatedHtml,
  'http-equiv',
  'Content-Security-Policy'
);

if (!homeCsp) {
  fail('index.html: отсутствует Content Security Policy.');
}

const homeFrameSrc =
  homeCsp.match(/frame-src\s+([^;]+)/)?.[1] || '';

if (!homeFrameSrc.split(/\s+/).includes("'self'")) {
  fail('index.html: frame-src не разрешает локальную изолированную CRM-форму.');
}

if (/bitrix24\.ru/.test(homeCsp)) {
  fail('index.html: Bitrix-домены не должны быть разрешены в CSP главной страницы.');
}

if (/script-src[^;]*(?:'unsafe-inline'|'unsafe-eval'|\*)/.test(homeCsp)) {
  fail('index.html: script-src главной страницы содержит широкое разрешение.');
}

const versions = new Set();
for (const file of htmlFiles) {
  const html = read(file);
  for (const match of html.matchAll(/styles\.css\?v=(\d+)/g)) versions.add(match[1]);
  if (/\sstyle="/.test(html)) fail(`${file}: найден inline-стиль, несовместимый со строгой CSP.`);
  for (const match of html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(match[1]); } catch (error) { fail(`${file}: невалидный JSON-LD (${error.message}).`); }
  }
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (canonical && !canonical.startsWith('https://fgn-nn.ru/')) fail(`${file}: canonical ведёт не на fgn-nn.ru.`);

  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = match[1];
    if (!target || /^(?:https?:|tel:|mailto:|data:|#)/.test(target)) continue;
    const clean = target.split(/[?#]/)[0];
    if (!clean) continue;
    const resolved = clean.startsWith('/') ? clean.slice(1) : path.normalize(path.join(path.dirname(file), clean));
    const candidate = resolved.endsWith('/') ? path.join(resolved, 'index.html') : resolved;
    if (!exists(candidate)) fail(`${file}: локальная ссылка не найдена: ${target}.`);
  }
}
if (versions.size !== 1 || !versions.has('19')) fail(`Версия styles.css должна быть единой: v=19; найдено ${[...versions].join(', ')}.`);

const sitemap = read('sitemap.xml');
for (const product of active) {
  const url = `https://fgn-nn.ru/products/${product.slug}/`;
  if (!sitemap.includes(`<loc>${url}</loc><lastmod>${productData.updated}</lastmod>`)) fail(`sitemap.xml: нет актуальной записи ${url}.`);
}
if (!sitemap.includes(`<loc>https://fgn-nn.ru/products/</loc><lastmod>${productData.updated}</lastmod>`)) fail('sitemap.xml: дата каталога не совпадает с products.json.');

for (const file of ['script.js', 'shop.js', 'product-detail.js', 'commercial-pages.js']) {
  try { execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' }); }
  catch { fail(`${file}: синтаксическая ошибка JavaScript.`); }
}

for (const file of [
  'scripts/production-bitrix-smoke.mjs',
  '.github/workflows/bitrix-production-smoke.yml'
]) {
  if (!exists(file)) {
    fail(`${file}: отсутствует обязательная production-проверка.`);
  }
}

const packageJson = JSON.parse(read('package.json'));

if (
  packageJson.scripts?.['test:production-bitrix'] !==
  'node scripts/production-bitrix-smoke.mjs'
) {
  fail('package.json: неверная команда test:production-bitrix.');
}

const productionWorkflow = read(
  '.github/workflows/bitrix-production-smoke.yml'
);

for (const required of [
  'workflow_dispatch:',
  'schedule:',
  'npm run test:production-bitrix'
]) {
  if (!productionWorkflow.includes(required)) {
    fail(
      `.github/workflows/bitrix-production-smoke.yml: ` +
      `отсутствует ${required}`
    );
  }
}

for (const doc of [
  'README.md',
  'DEVELOPER_GUIDE.md'
]) {
  const content = read(doc);

  for (const required of [
    'forms/bitrix.html',
    'forms/bitrix-embed.js',
    'production-bitrix-smoke.mjs',
    'bitrix-production-smoke.yml'
  ]) {
    if (!content.includes(required)) {
      fail(`${doc}: документация не описывает ${required}.`);
    }
  }

  for (const stale of [
    'точные CSP-хэши embed-кодов форм №10 и №16',
    'CSP коммерческих страниц разрешает только `cdn-ru.bitrix24.ru`'
  ]) {
    if (content.includes(stale)) {
      fail(`${doc}: осталось устаревшее описание Bitrix: ${stale}.`);
    }
  }
}

const secretFiles = [...htmlFiles, 'script.js', 'shop.js', 'product-detail.js', 'commercial-pages.js', 'data/products.json'];
const secretPatterns = [
  ['закрытый ключ', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['AWS access key', /AKIA[0-9A-Z]{16}/]
];
for (const file of secretFiles) {
  const content = read(file);
  for (const [label, pattern] of secretPatterns) if (pattern.test(content)) fail(`${file}: возможный секрет (${label}).`);
}

if (errors.length) {
  console.error(`Проверка не пройдена: ${errors.length}`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`Проверка пройдена: ${htmlFiles.length} HTML-страниц, ${products.length} товаров, ${active.length} активных.`);
