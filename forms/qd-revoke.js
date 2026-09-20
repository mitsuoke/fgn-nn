const QD_REVOKE_URL =
  'https://fgn-qd-ingress.fgn-9c244031b99b.workers.dev' +
  '/v1/qualified-demand/revoke';
const QD_SCHEMA_VERSION = '1.0.0';
const QD_COHORT_REF =
  'fgn:web-commercial-form-to-crm-cohort:v1';
const QD_IDENTITY_ID_PATTERN =
  /^fgnqd_id_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const QD_REVOKE_MAX_ATTEMPTS = 3;
const QD_REVOKE_RETRY_DELAYS_MS = Object.freeze([
  0,
  250,
  1000
]);
const QD_REVOKE_ATTEMPT_TIMEOUT_MS = 3000;

let revokeInFlight = false;

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const postParent = (payload) => {
  try {
    parent.postMessage(payload, location.origin);
  } catch {
    // The bridge is best-effort and must never affect site UX.
  }
};

const parseRevokeResponse = async (response) => {
  if (!response.ok) return false;

  try {
    const body = await response.json();

    return (
      body?.status === 'ERASURE_ACCEPTED' &&
      body?.trustState === 'PUBLIC_CLIENT_UNAUTHENTICATED' &&
      body?.canonicalQualifiedDemandAllowed === false
    );
  } catch {
    return false;
  }
};

const deliverRevoke = async (identityRef) => {
  for (
    let attempt = 0;
    attempt < QD_REVOKE_MAX_ATTEMPTS;
    attempt += 1
  ) {
    const delay = QD_REVOKE_RETRY_DELAYS_MS[attempt];

    if (delay > 0) {
      await sleep(delay);
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      QD_REVOKE_ATTEMPT_TIMEOUT_MS
    );

    try {
      const response = await fetch(QD_REVOKE_URL, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        keepalive: true,
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          schemaVersion: QD_SCHEMA_VERSION,
          identityRef,
          cohortRef: QD_COHORT_REF
        })
      });

      if (await parseRevokeResponse(response)) {
        return {
          delivered: true,
          attempts: attempt + 1
        };
      }
    } catch {
      // Network/timeout failures are retried only in memory.
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    delivered: false,
    attempts: QD_REVOKE_MAX_ATTEMPTS
  };
};

window.addEventListener('message', async (event) => {
  if (
    event.origin !== location.origin ||
    event.source !== parent ||
    revokeInFlight
  ) {
    return;
  }

  const data = event.data;

  if (
    !data ||
    typeof data !== 'object' ||
    Object.keys(data).length !== 2 ||
    data.type !== 'fgn-qd-revoke' ||
    !QD_IDENTITY_ID_PATTERN.test(data.identityRef || '')
  ) {
    return;
  }

  revokeInFlight = true;

  const result = await deliverRevoke(data.identityRef);

  postParent({
    type: 'fgn-qd-revoke-complete',
    delivered: result.delivered,
    attempts: result.attempts
  });
});

postParent({
  type: 'fgn-qd-revoke-ready'
});
