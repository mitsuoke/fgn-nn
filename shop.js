(() => {
  const source = document.body.dataset.productsSrc;
  if (!source) return;
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[ch]);
  const siteRoot = new URL(document.body.dataset.siteRoot || './', document.baseURI);
  const siteUrl = (path = '') => new URL(String(path).replace(/^\//, ''), siteRoot).href;
  const productUrl = (slug) => siteUrl(`products/${encodeURIComponent(slug)}/`);
  const activeProducts = (products) => products
    .filter((product) => product.active !== false)
    .sort((a, b) => (a.catalogOrder || 999) - (b.catalogOrder || 999));

  const hydrateCollections = (products) => {
    const productBySlug = new Map(products.map((product) => [product.slug, product]));
    document.querySelectorAll('[data-product-collection]').forEach((collection) => {
      const cards = Array.from(collection.querySelectorAll('[data-product-slug]'));
      cards.forEach((card) => {
        const product = productBySlug.get(card.dataset.productSlug);
        if (!product || product.active === false) {
          card.hidden = true;
          return;
        }

        const catalog = product.catalog || {};
        const name = catalog.name || product.name;
        const link = productUrl(product.slug);
        card.hidden = false;
        if (card.matches('a')) card.href = link;
        card.querySelectorAll('a').forEach((anchor) => { anchor.href = link; });
        const image = card.querySelector('img');
        if (image && product.images?.catalog) {
          image.src = siteUrl(product.images.catalog);
          image.alt = `${name} FGN, ${catalog.package || ''}${catalog.capsule ? ` по ${catalog.capsule}` : ''}`.trim();
        }
        const heading = card.querySelector('h3');
        if (heading) {
          const headingLink = heading.querySelector('a');
          (headingLink || heading).textContent = name;
        }
        const values = card.querySelectorAll('.product-card-specs dd');
        [catalog.package, catalog.capsule, catalog.composition].forEach((value, index) => {
          if (values[index] && value) values[index].textContent = value;
        });
        const summary = card.matches('a') ? card.querySelector('p') : null;
        if (summary && catalog.package && catalog.capsule) summary.textContent = `${catalog.package} · ${catalog.capsule}`;
        const imageLink = card.querySelector('.product-card-image');
        if (imageLink) imageLink.setAttribute('aria-label', `Состав и применение продукта ${name}`);
      });

      activeProducts(products).forEach((product) => {
        const card = cards.find((item) => item.dataset.productSlug === product.slug);
        if (card) collection.append(card);
      });
    });

    document.querySelectorAll('[data-product-count]').forEach((element) => {
      element.textContent = String(activeProducts(products).length);
    });
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

    const gallery = document.querySelector('[data-product-gallery]');
    if (gallery && Array.isArray(product.images?.gallery)) {
      const buttons = Array.from(gallery.querySelectorAll('[data-product-zoom]'));
      buttons.forEach((button, index) => {
        const path = product.images.gallery[index];
        if (!path) return;
        const url = siteUrl(path);
        button.dataset.full = url;
        const image = button.querySelector('img');
        if (image) image.src = url;
      });
    }
  };
  fetch(source, { credentials: 'same-origin' })
    .then((response) => { if (!response.ok) throw new Error(`Products data: ${response.status}`); return response.json(); })
    .then((data) => {
      const products = Array.isArray(data.products) ? data.products : [];
      hydrateCollections(products);
      hydrateProduct(products);
    })
    .catch((error) => {
      console.warn('Не удалось загрузить данные каталога. Используется HTML-резерв.', error);
      document.documentElement.dataset.productsFallback = 'true';
    });
})();
