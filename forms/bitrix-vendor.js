(() => {
  const forms = {
    '8': { sec: 'kodg8f', loader: 'loader_8.js' },
    '10': { sec: '20s329', loader: 'loader_10.js' },
    '16': { sec: '5s6fmf', loader: 'loader_16.js' }
  };
  const formId = new URLSearchParams(location.search).get('form');
  const config = Object.hasOwn(forms, formId) ? forms[formId] : null;
  // Never run the vendor without the browser's opaque-origin boundary,
  // including when this URL is opened directly or framed without sandbox.
  if (!config || parent === window || window.origin !== 'null') {
    document.body.textContent = 'Форма недоступна.';
    return;
  }

  // Bitrix eagerly reads Storage even when the browser disallows it.
  // Provide document-lifetime memory only, never the parent's storage/cookies.
  for (const name of ['localStorage', 'sessionStorage']) {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(String(key)) ?? null,
      setItem: (key, value) => { values.set(String(key), String(value)); },
      removeItem: (key) => { values.delete(String(key)); },
      clear: () => values.clear(),
      key: (index) => [...values.keys()][index] ?? null,
      get length() { return values.size; }
    };
    Object.defineProperty(window, name, { value: storage });
  }
  // Bitrix submit/consent helpers also use cookies. Keep a document-lifetime
  // jar: no real browser cookies are read, written or sent by this facade.
  const cookies = new Map();
  Object.defineProperty(document, 'cookie', {
    get: () => [...cookies].map(([key, value]) => key + '=' + value).join('; '),
    set: (raw) => {
      const [pair, ...attributes] = String(raw).split(';');
      const separator = pair.indexOf('=');
      if (separator < 1) return;
      const key = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1);
      const expired = attributes.some((attribute) => {
        const [name, ...rest] = attribute.trim().split('=');
        const setting = rest.join('=');
        return (name.toLowerCase() === 'max-age' && Number(setting) <= 0) ||
          (name.toLowerCase() === 'expires' && Date.parse(setting) <= Date.now());
      });
      if (expired) cookies.delete(key);
      else cookies.set(key, value);
    }
  });

  const post = (type, extra = {}) => parent.postMessage({
    type, form: formId, ...extra
  }, location.origin);

  const meaningful = (target) => {
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLTextAreaElement) &&
      !(target instanceof HTMLSelectElement)
    ) return false;
    if (!target.closest('.b24-form')) return false;
    if (target instanceof HTMLInputElement) {
      const type = target.type.toLowerCase();
      if (['hidden', 'button', 'submit', 'reset', 'image'].includes(type)) return false;
      if (type === 'checkbox') {
        if (target.closest('.b24-form-control-agreement')) return false;
        return target.checked;
      }
      if (type === 'radio') return target.checked;
      if (type === 'file') return Boolean(target.files?.length);
    }
    return target.value.trim().length > 0;
  };
  for (const event of ['input', 'change']) {
    document.addEventListener(event, ({ target }) => {
      if (meaningful(target)) post('fgn-bitrix-vendor-input');
    }, true);
  }

  let successVisible = false;
  let lastSuccessAt = 0;
  const success = () => {
    const now = Date.now();
    if (now - lastSuccessAt < 2000) return;
    lastSuccessAt = now;
    post('fgn-bitrix-vendor-success');
  };
  window.addEventListener('b24:form:send:success', (event) => {
    if (String(event.detail?.object?.identification?.id) !== formId) return;
    successVisible = true;
    success();
  });
  let lastHeight = 0;
  const report = () => {
    const wrapper = document.querySelector('.b24-form-wrapper');
    if (!wrapper) return;
    // scrollHeight includes the current iframe viewport and prevents shrinking.
    const height = Math.ceil(Math.max(
      wrapper.getBoundingClientRect().bottom,
      document.body.getBoundingClientRect().height
    ));
    if (height >= 100 && height <= 5000 && height !== lastHeight) {
      lastHeight = height;
      post('fgn-bitrix-vendor-height', { height });
    }
    const state = document.querySelector('.b24-form-state.b24-form-success');
    const visible = Boolean(state && getComputedStyle(state).display !== 'none' &&
      getComputedStyle(state).visibility !== 'hidden');
    if (visible && !successVisible) success();
    successVisible = visible;
  };
  new ResizeObserver(report).observe(document.body);
  new MutationObserver(report).observe(document.body, {
    childList: true, subtree: true, attributes: true
  });
  window.addEventListener('load', report);

  const marker = document.createElement('script');
  marker.setAttribute('data-b24-form', `inline/${formId}/${config.sec}`);
  marker.setAttribute('data-skip-moving', 'true');
  document.body.appendChild(marker);
  const loader = document.createElement('script');
  loader.async = true;
  loader.src = 'https://cdn-ru.bitrix24.ru/b28134326/crm/form/' +
    config.loader + '?' + Math.floor(Date.now() / 180000);
  document.head.appendChild(loader);
})();
