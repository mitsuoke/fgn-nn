import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const errors = [];
const fail = (message) => errors.push(message);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const text = (html = '') => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
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
  if (product.slug === 'ezhovik' ? product.category !== 'БАД к пище' : product.category !== 'Пищевая добавка') fail(`${prefix}: неверная категория продукта.`);
  if (product.slug === 'ezhovik' ? !/^БАД\./.test(product.warning) : !/^Пищевая добавка\./.test(product.warning)) fail(`${prefix}: неверное предупреждение.`);
  if (!product.ozon || (product.ozon.active && !/^https:\/\/www\.ozon\.ru\//.test(product.ozon.url || ''))) fail(`${prefix}: некорректная активная ссылка Ozon.`);
  for (const image of [product.images?.catalog, product.images?.bottle, ...(product.images?.gallery || [])].filter(Boolean)) {
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
  const galleryCount = [...html.matchAll(/data-product-zoom/g)].length;
  if (galleryCount !== (product.images?.gallery || []).length) fail(`${page}: HTML-резерв галереи (${galleryCount}) не совпадает с JSON (${product.images?.gallery?.length || 0}).`);
  const schemas = [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => { try { return JSON.parse(match[1]); } catch { return null; } })
    .filter(Boolean);
  const productSchema = schemas.find((schema) => schema['@type'] === 'Product');
  if (!productSchema) fail(`${page}: отсутствует Product JSON-LD.`);
  else {
    if (String(productSchema.sku) !== String(product.sku)) fail(`${page}: SKU в Product JSON-LD не совпадает с products.json.`);
    if (productSchema.category !== product.category) fail(`${page}: категория в Product JSON-LD не совпадает с products.json.`);
    if (!String(productSchema.name || '').includes(product.catalog.name)) fail(`${page}: название в Product JSON-LD не связано с products.json.`);
  }
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
if (versions.size !== 1 || !versions.has('18')) fail(`Версия styles.css должна быть единой: v=18; найдено ${[...versions].join(', ')}.`);

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
