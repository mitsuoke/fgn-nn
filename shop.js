(() => {
  const source = document.body.dataset.productsSrc;
  if (!source) return;
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[ch]);
  const productUrl = (slug) => `/products/${encodeURIComponent(slug)}/`;
  const renderCatalog = (products) => {
    const grid = document.querySelector('[data-products-grid]');
    if (!grid) return;
    const active = products.filter((product) => product.active !== false);
    if (!active.length) { grid.innerHTML = '<p class="shop-empty">Сейчас каталог обновляется. Загляните чуть позже.</p>'; return; }
    grid.innerHTML = active.map((product) => `
      <article class="shop-card">
        <a class="shop-card-image" href="${productUrl(product.slug)}" aria-label="Открыть карточку ${escapeHtml(product.name)}"><img src="${escapeHtml(product.images?.catalog || product.images?.gallery?.[0] || '')}" alt="${escapeHtml(product.name)}" loading="lazy" width="600" height="450"></a>
        <div class="shop-card-body"><span class="shop-kicker">${escapeHtml(product.category || 'Продукция FGN')}</span><h2><a href="${productUrl(product.slug)}">${escapeHtml(product.name)}</a></h2><p>${escapeHtml(product.short || '')}</p><div class="shop-card-meta"><span>${escapeHtml(product.application || '')}</span></div><a class="button button-primary" href="${productUrl(product.slug)}">Подробнее</a></div>
      </article>`).join('');
  };
  const hydrateProduct = (products) => {
    const slug = document.body.dataset.productSlug;
    if (!slug) return;
    const product = products.find((item) => item.slug === slug && item.active !== false);
    if (!product) return;
    document.querySelectorAll('[data-product-name]').forEach((el) => { el.textContent = product.name; });
    document.querySelectorAll('[data-product-short]').forEach((el) => { el.textContent = product.short || ''; });
    document.querySelectorAll('[data-product-application]').forEach((el) => { el.textContent = product.application || ''; });
    document.querySelectorAll('[data-product-description]').forEach((el) => { el.textContent = product.description || product.short || ''; });
    document.querySelectorAll('[data-product-warning]').forEach((el) => { el.textContent = product.warning || ''; });
    document.querySelectorAll('[data-product-facts]').forEach((list) => {
      const facts = Array.isArray(product.facts) ? product.facts.filter(Boolean).slice(0, 3) : [];
      if (facts.length) list.innerHTML = facts.map((fact) => `<div class="product-fact">${escapeHtml(fact)}</div>`).join('');
    });
    const ozon = product.ozon || {};
    document.querySelectorAll('[data-ozon-link]').forEach((link) => { if (ozon.active && ozon.url) { link.href = ozon.url; link.hidden = false; } else { link.hidden = true; } });
    document.querySelectorAll('[data-ozon-unavailable]').forEach((el) => { el.hidden = Boolean(ozon.active && ozon.url); });
    const docs = (product.documents || []).filter((doc) => doc.active !== false);
    const docsBlock = document.querySelector('[data-product-documents]');
    const docsList = document.querySelector('[data-product-documents-list]');
    if (docsBlock && docsList) {
      if (!docs.length) docsBlock.hidden = true;
      else { docsList.innerHTML = docs.map((doc) => `<div class="shop-document"><span>${escapeHtml(doc.type || 'Документ')}</span><strong>${escapeHtml(doc.number || '')}</strong>${doc.date ? `<small>от ${escapeHtml(doc.date)}</small>` : ''}</div>`).join(''); docsBlock.hidden = false; }
    }
  };
  fetch(source, { credentials: 'same-origin' }).then((response) => { if (!response.ok) throw new Error(`Products data: ${response.status}`); return response.json(); }).then((data) => { const products = Array.isArray(data.products) ? data.products : []; renderCatalog(products); hydrateProduct(products); }).catch((error) => { console.error('Не удалось загрузить данные каталога.', error); const grid = document.querySelector('[data-products-grid]'); if (grid) grid.innerHTML = '<p class="shop-empty">Каталог временно недоступен. Попробуйте обновить страницу позже.</p>'; });
})();
