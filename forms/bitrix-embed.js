const forms = {
  '8': {
    sec: 'kodg8f',
    loader:
      'https://' +
      'cdn-ru.bitrix24.ru/b28134326/crm/form/loader_8.js'
  },
  '10': {
    sec: '20s329',
    loader:
      'https://' +
      'cdn-ru.bitrix24.ru/b28134326/crm/form/loader_10.js'
  },
  '16': {
    sec: '5s6fmf',
    loader:
      'https://' +
      'cdn-ru.bitrix24.ru/b28134326/crm/form/loader_16.js'
  }
};

const formId = new URLSearchParams(location.search).get('form');
const config = forms[formId];

if (!config) {
  document.body.textContent = 'Форма недоступна.';
} else {
  const marker = document.createElement('script');
  marker.setAttribute(
    'data-b24-form',
    `inline/${formId}/${config.sec}`
  );
  marker.setAttribute('data-skip-moving', 'true');
  document.body.appendChild(marker);

  const loader = document.createElement('script');
  loader.async = true;
  loader.src =
    config.loader + '?' + Math.floor(Date.now() / 180000);

  document.head.appendChild(loader);

  let lastHeight = 0;
  let successStateVisible = false;
  let lastSuccessAt = 0;

  const emitSuccess = () => {
    const now = Date.now();

    if (now - lastSuccessAt < 2000) return;

    lastSuccessAt = now;

    parent.postMessage(
      {
        type: 'fgn-bitrix-success',
        form: formId
      },
      location.origin
    );
  };

  const reportSuccessState = () => {
    const success = document.querySelector(
      '.b24-form-state.b24-form-success'
    );

    const visible = Boolean(
      success &&
      getComputedStyle(success).display !== 'none' &&
      getComputedStyle(success).visibility !== 'hidden'
    );

    if (!visible) {
      successStateVisible = false;
      return;
    }

    if (successStateVisible) return;

    successStateVisible = true;
    emitSuccess();
  };

  window.addEventListener(
    'b24:form:send:success',
    (event) => {
      const emittedFormId =
        event.detail?.object?.identification?.id;

      if (String(emittedFormId) !== formId) return;

      successStateVisible = true;
      emitSuccess();
    }
  );

  const reportHeight = () => {
    const wrapper = document.querySelector('.b24-form-wrapper');

    const height = Math.ceil(
      Math.max(
        document.body.scrollHeight,
        document.body.getBoundingClientRect().height,
        wrapper?.getBoundingClientRect().bottom || 0
      )
    );

    if (height < 100 || height === lastHeight) return;

    lastHeight = height;

    parent.postMessage(
      {
        type: 'fgn-bitrix-height',
        form: formId,
        height
      },
      location.origin
    );
  };

  new ResizeObserver(reportHeight)
    .observe(document.body);

  new MutationObserver(() => {
    reportHeight();
    reportSuccessState();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true
  });

  window.addEventListener('load', () => {
    reportHeight();
    reportSuccessState();
  });

  setTimeout(() => {
    reportHeight();
    reportSuccessState();
  }, 1000);

  setTimeout(() => {
    reportHeight();
    reportSuccessState();
  }, 3000);
}
