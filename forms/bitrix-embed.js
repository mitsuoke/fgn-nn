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

const QD_INGRESS_URL =
  'https://fgn-qd-ingress.fgn-9c244031b99b.workers.dev' +
  '/v1/qualified-demand/form-start';
const QD_SCHEMA_VERSION = '1.0.0';
const QD_IDENTITY_STATE =
  'PROVISIONAL_FIRST_PARTY_BROWSER_IDENTITY';
const QD_EVENT_KIND = 'FIRST_MEANINGFUL_FORM_INPUT';
const QD_PROPERTY_REF = 'property:fgn-public-site';
const QD_COHORT_REF =
  'fgn:web-commercial-form-to-crm-cohort:v1';
const QD_SOURCE_REVISION = 'site:fgn-form-start:v1';
const QD_IDENTITY_STORAGE_KEY = 'fgn_qd_identity_v1';
const QD_PENDING_STORAGE_KEY = 'fgn_qd_pending_v1';
const QD_COMPLETED_STORAGE_KEY = 'fgn_qd_completed_v1';

const QD_ROUTE_REFS = Object.freeze({
  '/': 'route:home',
  '/index.html': 'route:home',
  '/start.html': 'route:start',
  '/kapsulirovanie/': 'route:kapsulirovanie',
  '/kapsulirovanie/index.html': 'route:kapsulirovanie',
  '/fasovka-sypuchih-produktov/':
    'route:fasovka-sypuchih-produktov',
  '/fasovka-sypuchih-produktov/index.html':
    'route:fasovka-sypuchih-produktov',
  '/fasovka-chaya-i-sborov/':
    'route:fasovka-chaya-i-sborov',
  '/fasovka-chaya-i-sborov/index.html':
    'route:fasovka-chaya-i-sborov',
  '/upakovka-i-markirovka-bad/':
    'route:upakovka-i-markirovka-bad',
  '/upakovka-i-markirovka-bad/index.html':
    'route:upakovka-i-markirovka-bad',
  '/kontraktnoe-proizvodstvo-bad/':
    'route:kontraktnoe-proizvodstvo-bad',
  '/kontraktnoe-proizvodstvo-bad/index.html':
    'route:kontraktnoe-proizvodstvo-bad'
});

const QD_EVENT_ID_PATTERN =
  /^fgnqd_evt_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const QD_IDENTITY_ID_PATTERN =
  /^fgnqd_id_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const QD_ALLOWED_RESULT_STATUSES = new Set([
  'RECORDED',
  'IDEMPOTENT_REPLAY',
  'DUPLICATE_IDENTITY_IGNORED'
]);

const formId = new URLSearchParams(location.search).get('form');
const config = forms[formId];

const createUuidV4 = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes]
    .map((value) => value.toString(16).padStart(2, '0'));

  return (
    hex.slice(0, 4).join('') + '-' +
    hex.slice(4, 6).join('') + '-' +
    hex.slice(6, 8).join('') + '-' +
    hex.slice(8, 10).join('') + '-' +
    hex.slice(10).join('')
  );
};

const readStorage = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return localStorage.getItem(key) === value;
  } catch {
    return false;
  }
};

const removeStorage = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Telemetry storage is optional; form UX must remain unaffected.
  }
};

const resolveRouteRef = () => {
  if (!document.referrer) return null;

  try {
    const referrer = new URL(document.referrer);

    if (referrer.origin !== location.origin) return null;

    return QD_ROUTE_REFS[referrer.pathname] || null;
  } catch {
    return null;
  }
};

const getOrCreateIdentityRef = () => {
  const stored = readStorage(QD_IDENTITY_STORAGE_KEY);

  if (stored && QD_IDENTITY_ID_PATTERN.test(stored)) {
    return stored;
  }

  const generated = 'fgnqd_id_' + createUuidV4();

  return writeStorage(
    QD_IDENTITY_STORAGE_KEY,
    generated
  )
    ? generated
    : null;
};

const readPendingEvent = (identityRef) => {
  const raw = readStorage(QD_PENDING_STORAGE_KEY);
  if (!raw) return null;

  try {
    const candidate = JSON.parse(raw);

    if (
      candidate?.schemaVersion !== QD_SCHEMA_VERSION ||
      !QD_EVENT_ID_PATTERN.test(candidate?.eventId || '') ||
      candidate?.identityRef !== identityRef ||
      candidate?.identityState !== QD_IDENTITY_STATE ||
      candidate?.eventKind !== QD_EVENT_KIND ||
      candidate?.propertyRef !== QD_PROPERTY_REF ||
      !/^bitrix:crm-form:(8|10|16)$/.test(
        candidate?.formRef || ''
      ) ||
      !Object.values(QD_ROUTE_REFS).includes(
        candidate?.routeRef
      ) ||
      candidate?.cohortRef !== QD_COHORT_REF ||
      typeof candidate?.occurredAt !== 'string' ||
      !Number.isFinite(Date.parse(candidate.occurredAt)) ||
      candidate?.sourceRevision !== QD_SOURCE_REVISION
    ) {
      removeStorage(QD_PENDING_STORAGE_KEY);
      return null;
    }

    return Object.freeze({
      schemaVersion: QD_SCHEMA_VERSION,
      eventId: candidate.eventId,
      identityRef,
      identityState: QD_IDENTITY_STATE,
      eventKind: QD_EVENT_KIND,
      propertyRef: QD_PROPERTY_REF,
      formRef: candidate.formRef,
      routeRef: candidate.routeRef,
      cohortRef: QD_COHORT_REF,
      occurredAt: candidate.occurredAt,
      sourceRevision: QD_SOURCE_REVISION
    });
  } catch {
    removeStorage(QD_PENDING_STORAGE_KEY);
    return null;
  }
};

const createPendingEvent = (
  identityRef,
  currentFormId,
  routeRef
) => {
  const event = Object.freeze({
    schemaVersion: QD_SCHEMA_VERSION,
    eventId: 'fgnqd_evt_' + createUuidV4(),
    identityRef,
    identityState: QD_IDENTITY_STATE,
    eventKind: QD_EVENT_KIND,
    propertyRef: QD_PROPERTY_REF,
    formRef: `bitrix:crm-form:${currentFormId}`,
    routeRef,
    cohortRef: QD_COHORT_REF,
    occurredAt: new Date().toISOString(),
    sourceRevision: QD_SOURCE_REVISION
  });

  return writeStorage(
    QD_PENDING_STORAGE_KEY,
    JSON.stringify(event)
  )
    ? event
    : null;
};

const isCompletedIdentity = (identityRef) =>
  readStorage(QD_COMPLETED_STORAGE_KEY) === identityRef;

const markCompletedIdentity = (identityRef) => {
  writeStorage(QD_COMPLETED_STORAGE_KEY, identityRef);
  removeStorage(QD_PENDING_STORAGE_KEY);
};

const isMeaningfulValueChange = (target) => {
  if (
    !(target instanceof HTMLInputElement) &&
    !(target instanceof HTMLTextAreaElement) &&
    !(target instanceof HTMLSelectElement)
  ) {
    return false;
  }

  if (!target.closest('.b24-form')) return false;

  if (target instanceof HTMLInputElement) {
    const type = target.type.toLowerCase();

    if (
      [
        'hidden',
        'button',
        'submit',
        'reset',
        'image'
      ].includes(type)
    ) {
      return false;
    }

    if (type === 'checkbox') {
      if (target.closest('.b24-form-control-agreement')) {
        return false;
      }

      return target.checked;
    }

    if (type === 'radio') return target.checked;
    if (type === 'file') return Boolean(target.files?.length);
  }

  return target.value.trim().length > 0;
};

let qualifiedDemandRequestInFlight = false;

const emitQualifiedDemandFormStart = async () => {
  if (qualifiedDemandRequestInFlight) return;

  const routeRef = resolveRouteRef();
  if (!routeRef) return;

  const identityRef = getOrCreateIdentityRef();
  if (!identityRef || isCompletedIdentity(identityRef)) return;

  const event =
    readPendingEvent(identityRef) ||
    createPendingEvent(identityRef, formId, routeRef);

  if (!event) return;

  qualifiedDemandRequestInFlight = true;

  try {
    const response = await fetch(QD_INGRESS_URL, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      keepalive: true,
      referrerPolicy: 'no-referrer',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

    if (!response.ok) return;

    const result = await response.json();

    if (
      !QD_ALLOWED_RESULT_STATUSES.has(result?.status) ||
      result?.trustState !== 'PUBLIC_CLIENT_UNAUTHENTICATED' ||
      result?.canonicalQualifiedDemandAllowed !== false
    ) {
      return;
    }

    markCompletedIdentity(identityRef);
  } catch {
    // Qualified Demand telemetry is fail-open by design.
  } finally {
    qualifiedDemandRequestInFlight = false;
  }
};

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

  const handleMeaningfulValueChange = (event) => {
    if (!isMeaningfulValueChange(event.target)) return;

    void emitQualifiedDemandFormStart();
  };

  document.addEventListener(
    'input',
    handleMeaningfulValueChange,
    true
  );
  document.addEventListener(
    'change',
    handleMeaningfulValueChange,
    true
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
