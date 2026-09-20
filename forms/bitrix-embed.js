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

const QD_ENDPOINT =
  'https://fgn-qd-ingress.fgn-9c244031b99b.workers.dev' +
  '/v1/qualified-demand/form-start';
const QD_COHORT_REF =
  'fgn:web-commercial-form-to-crm-cohort:v1';
const QD_SOURCE_REVISION =
  'site:fgn-form-start:v1';

const createOpaqueId = (prefix) => {
  if (typeof crypto.randomUUID === 'function') {
    return prefix + crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');

  const uuid = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-');

  return prefix + uuid;
};

const readParentRouteRef = () => {
  try {
    const pathname = parent.location.pathname || '/';
    const normalized =
      '/' + pathname.split('/').filter(Boolean).join('/');

    return 'route:' + (normalized === '/' ? '/' : normalized + '/');
  } catch {
    return 'route:unknown';
  }
};

const hasMeaningfulValue = (element) => {
  if (
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLTextAreaElement) &&
    !(element instanceof HTMLSelectElement)
  ) {
    return false;
  }

  if (element.disabled) return false;

  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();

    if ([
      'hidden',
      'button',
      'submit',
      'reset',
      'image'
    ].includes(type)) {
      return false;
    }

    if (type === 'checkbox' || type === 'radio') {
      return element.checked;
    }

    if (type === 'file') {
      return Boolean(element.files?.length);
    }
  }

  return String(element.value || '').trim().length > 0;
};

const qdAttempt = {
  event: null,
  sent: false,
  inFlight: false
};

const ensureQdEvent = () => {
  if (qdAttempt.event) return qdAttempt.event;

  qdAttempt.event = Object.freeze({
    schemaVersion: '1.0.0',
    eventId: createOpaqueId('fgnqd_evt_'),
    identityRef: createOpaqueId('fgnqd_id_'),
    identityState:
      'PROVISIONAL_FIRST_PARTY_BROWSER_IDENTITY',
    eventKind: 'FIRST_MEANINGFUL_FORM_INPUT',
    propertyRef: 'property:fgn-public-site',
    formRef: `bitrix:crm-form:${formId}`,
    routeRef: readParentRouteRef(),
    cohortRef: QD_COHORT_REF,
    occurredAt: new Date().toISOString(),
    sourceRevision: QD_SOURCE_REVISION
  });

  return qdAttempt.event;
};

const sendQdEvent = () => {
  if (qdAttempt.sent || qdAttempt.inFlight) return;

  const event = ensureQdEvent();
  qdAttempt.inFlight = true;

  fetch(QD_ENDPOINT, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error('QD ingress rejected the event.');
      }

      qdAttempt.sent = true;
    })
    .catch(() => {
      // Measurement must never block or alter the Bitrix form.
    })
    .finally(() => {
      qdAttempt.inFlight = false;
    });
};

const reportMeaningfulFormStart = (event) => {
  if (
    qdAttempt.sent ||
    !hasMeaningfulValue(event.target)
  ) {
    return;
  }

  sendQdEvent();
};

document.addEventListener(
  'input',
  reportMeaningfulFormStart,
  true
);

document.addEventListener(
  'change',
  reportMeaningfulFormStart,
  true
);

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
