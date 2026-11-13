# FGN response security headers — prepared, not activated

`security-headers.rule.json` is one Cloudflare Response Header Transform Rule
for the `http_response_headers_transform` zone phase. It is source configuration
only. GitHub Pages ignores it; committing or merging it does not activate headers.
No workflow in this repository applies it.

The new trusted document loads `forms/bitrix-shell.js?v=1`. The old embed asset
remains byte-identical for previously cached HTML and safe source rollback.

The candidate appends `frame-ancestors 'self'` as an additional CSP policy,
preserving the existing page-specific meta policy and any upstream CSP header.
It also sets SAMEORIGIN, nosniff, the existing referrer policy, disables unused
camera/microphone/geolocation/payment permissions, and starts HSTS at seven days.
There is deliberately no `includeSubDomains` or preload commitment.

## Activation gate

Activation is a separate production change requiring explicit owner approval.
First inspect the actual FGN zone, current response rules, TLS mode and DNS.
The public audit found GitHub Pages answering directly; Cloudflare proxying for
this domain is not established. Do not assume that an existing Worker/D1 account
means the Site domain is already proxied. If proxying/DNS setup is needed,
prepare and approve that exact change separately. Preserve all mail records.

Append this single rule to the existing phase entrypoint; never overwrite the
whole ruleset. Check ordering against other response rules and verify that both
the apex and www routes have valid TLS. The scope is only these two HTTPS hosts.
No Worker, database, secret or new form processor is introduced.

Before accepting the release, verify actual HTTP headers and browser behavior:
normal Site → trusted shell → opaque vendor frame must work, while embedding
the Site from an unrelated origin must fail. Run all three forms at mobile and
desktop widths. A separately authorized test-portal submission must prove the
server accepts the opaque `Origin: null` form request and creates the expected
CRM record. Local mock responses do not prove Bitrix server acceptance.

The exploratory unauthenticated OPTIONS request to the production fill endpoint
returned 401 without CORS headers. The current library submits FormData and did
not require that preflight in the intercepted test. This OPTIONS result neither
confirms nor disproves acceptance of a real form POST; keep that release gate open.

## Verification without production changes

`npm run test:security` uses the reviewed header values in a fully intercepted
browser test. It checks normal rendering, cross-origin frame refusal, parent
DOM/storage isolation, message source/shape guards, required fields and mocked
submission success/failure. It makes no provider requests.

`node scripts/security-smoke.mjs --live-readonly` reads the current public Bitrix
libraries. All Site files come from the local checkout, every form POST is
fulfilled locally with a synthetic response, and all other provider writes are
blocked. This checks the real client library, not CRM record creation or storage.
The form's field values continue to go directly to Bitrix on an eventual real
submission; the trusted shell receives only input/success/height notifications.
Bitrix's technical form URL now points to the vendor document. The shell's
existing QD route mapping is preserved; check native CRM source/URL fields in
the test portal rather than assuming source attribution is unchanged.

## Published-form baseline — 2026-11-13

The owner declined the separate portal's registration terms and instead
explicitly authorized one disposable submission from the published Site into
the existing CRM, followed by removal of its test deal and newly created test
contact. The form's mandatory data-processing consent was separately confirmed
at action time. No separate portal was created.

One synthetic submission was sent through the homepage's existing form 8.
The Site displayed its success state. The CRM independently showed a new deal
in `Заявки с сайта FGN`, stage `Новая`, linked to the synthetic contact. The
order description, batch text, comment and technical URL
`https://fgn-nn.ru/forms/bitrix.html?form=8` were present. The deal and contact
timelines recorded the form completion and their creation.

Both test records were then deleted using their own CRM card actions. The
deal disappeared from the funnel; an all-contacts search for the exact test
marker returned `Ничего не найдено`. CRM trash was not purged. No real customer
record, form configuration, Site source/deployment or Cloudflare setting was
changed. Contact details, raw CRM record IDs and authenticated screenshots
are deliberately excluded from this public repository.

This proves the currently published, same-origin form 8 creates CRM records.
It does **not** test this PR's opaque-origin vendor frame, real server
acceptance of `Origin: null`, forms 10/16, or the proposed HTTP headers.
Those release gates remain open. The one-submission authorization is consumed;
it does not authorize further production submissions, merge or deployment.

## Rollback

Before release: close the draft PR. After a separately approved source release:
revert its commit through a normal PR. For headers: disable only this rule,
preserving the existing ruleset. HSTS already cached by clients persists for
up to the remaining seven-day max-age; deleting the rule does not immediately
clear that cache. Keep HTTPS working during rollback.

Provider references:
- https://developers.cloudflare.com/rules/transform/response-header-modification/create-api/
- https://developers.cloudflare.com/rules/transform/response-header-modification/reference/parameters/
