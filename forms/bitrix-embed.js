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

  new MutationObserver(reportHeight)
    .observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true
    });

  window.addEventListener('load', reportHeight);
  setTimeout(reportHeight, 1000);
  setTimeout(reportHeight, 3000);
}
