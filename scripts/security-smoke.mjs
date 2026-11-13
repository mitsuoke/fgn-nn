import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const origin = 'https://fgn-nn.ru';
const foreign = 'https://untrusted.test';
const live = process.argv.includes('--live-readonly');
const rule = JSON.parse(await fs.readFile(path.join(root,
  'deploy/cloudflare/security-headers.rule.json'), 'utf8'));
assert.equal(rule.action, 'rewrite');
assert.equal(rule.expression, '(http.host in {"fgn-nn.ru" "www.fgn-nn.ru"} and http.request.scheme eq "https")');
assert.equal(rule.action_parameters.headers['content-security-policy'].operation, 'add');
assert.equal(rule.action_parameters.headers['content-security-policy'].value, "frame-ancestors 'self'");
assert.equal(rule.action_parameters.headers['strict-transport-security'].value, 'max-age=604800');
const headers = Object.fromEntries(Object.entries(rule.action_parameters.headers)
  .map(([name, change]) => [name, change.value]));
const types = { '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.ttf': 'font/ttf' };
const mockLoader = `
  const w=document.createElement('div');w.className='b24-form-wrapper';w.style.minHeight='350px';
  w.innerHTML='<form class="b24-form"><input required name="name" aria-label="Имя"><input required name="phone" type="tel" aria-label="Телефон"><button>Отправить</button></form>';
  document.body.append(w);
  w.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();
    const response=await fetch('https://b24-ud1314.bitrix24.ru/bitrix/services/main/ajax.php?action=crm.site.form.fill',{method:'POST',body:new FormData(e.target)});
    const r=await response.json();if(!response.ok||!r.data?.resultId)return;
    const s=document.createElement('div');s.className='b24-form-state b24-form-success';s.textContent='Test success';w.append(s);
    window.dispatchEvent(new CustomEvent('b24:form:send:success',{detail:{object:{identification:{id:new URLSearchParams(location.search).get('form')}}}}));
  });
`;
const routes = [['/', '8'], ['/start.html', '16'], ['/kapsulirovanie/', '10'],
  ['/fasovka-sypuchih-produktov/', '16'], ['/fasovka-chaya-i-sborov/', '16'],
  ['/upakovka-i-markirovka-bad/', '16'], ['/kontraktnoe-proizvodstvo-bad/', '16']];
let renders = 0, submissions = 0, blockedWrites = 0, qd = 0;
let rejectSubmission = false;
const blockedActions = new Set();
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem('fgn_analytics_consent', JSON.stringify({status:'granted',expiresAt:Date.now()+3600000}));
    localStorage.setItem('fgn-security-test-marker', 'synthetic-private-marker');
    window.__goals = [];
    window.ym = (...args) => window.__goals.push(args);
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const cors = { 'Access-Control-Allow-Origin': request.headers().origin || 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (url.origin === origin) {
      if (request.method() !== 'GET') throw new Error('Unexpected Site write');
      if (url.pathname === '/security-sibling.js') return route.fulfill({contentType:'application/javascript',body:`parent.postMessage({type:'fgn-bitrix-vendor-height',form:'8',height:4999},'${origin}');parent.postMessage({type:'fgn-bitrix-vendor-success',form:'8'},'${origin}');parent.postMessage({type:'fgn-bitrix-vendor-input',form:'8'},'${origin}');`});
      if (url.pathname === '/security-sibling.html') return route.fulfill({contentType:'text/html',body:'<script src="/security-sibling.js"></script>'});
      const relative = url.pathname.endsWith('/') ? url.pathname+'index.html' : url.pathname;
      const target = path.resolve(root, '.'+relative);
      if (!target.startsWith(root+path.sep)) return route.abort();
      try { return route.fulfill({status:200,headers,contentType:types[path.extname(target)]||'application/octet-stream',body:await fs.readFile(target)}); }
      catch { return route.fulfill({status:404,headers,body:'Not found'}); }
    }
    if (url.origin === foreign) return route.fulfill({contentType:'text/html',body:`<iframe src="${origin}/start.html"></iframe>`});
    if (url.hostname === 'fgn-qd-ingress.fgn-9c244031b99b.workers.dev') {
      if (request.method() === 'OPTIONS') return route.fulfill({status:204,headers:cors,body:''});
      qd++;
      return route.fulfill({status:201,headers:cors,contentType:'application/json',body:JSON.stringify({status:'RECORDED',trustState:'PUBLIC_CLIENT_UNAUTHENTICATED',canonicalQualifiedDemandAllowed:false})});
    }
    if (['cdn-ru.bitrix24.ru','b24-ud1314.bitrix24.ru'].includes(url.hostname)) {
      if (request.method() === 'OPTIONS') return route.fulfill({status:204,headers:cors,body:''});
      if (request.method() !== 'GET') {
        // Always intercepted locally, including in the optional real-library check.
        if (url.searchParams.get('action') === 'crm.site.form.fill') {
          submissions++;
          assert.equal(request.headers().origin, 'null');
          if (rejectSubmission) return route.fulfill({status:503,headers:cors,
            contentType:'application/json',body:JSON.stringify({errors:[{code:'SYNTHETIC_FAILURE'}]})});
          return route.fulfill({status:200,headers:cors,contentType:'application/json',body:JSON.stringify({status:'success',data:{resultId:'SYNTHETIC_LOCAL_ONLY'}})});
        }
        blockedWrites++;
        blockedActions.add(url.pathname + ':' + (url.searchParams.get('action') || 'NONE'));
        return route.abort();
      }
      if (live && /\.(?:js|css|woff2?|ttf|svg|png|jpe?g|webp)$/.test(url.pathname)) return route.continue();
      if (/loader_(8|10|16)\.js$/.test(url.pathname)) return route.fulfill({contentType:'application/javascript',body:mockLoader});
    }
    return route.fulfill({status:204,body:''});
  });

  for (const width of [390,1366]) for (const [route,id] of routes) {
    // The real-library lane covers each actual form once per viewport.
    if (live && !['/', '/start.html', '/kapsulirovanie/'].includes(route)) continue;
    const page = await context.newPage();
    await page.setViewportSize({width,height:1000});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin+route, {waitUntil:'networkidle'});
    const host = page.frames().find(f=>f.url().includes('/forms/bitrix.html?form='+id));
    assert.ok(host);
    const vendor = page.frames().find(f=>f.url().includes('/forms/bitrix-vendor.html?form='+id));
    assert.ok(vendor);
    await vendor.locator('.b24-form-wrapper').waitFor({timeout:30000});
    assert.equal(await host.locator('iframe').getAttribute('sandbox'), 'allow-scripts allow-forms');
    const boundary = await vendor.evaluate(() => {
      const result = {origin:window.origin,domBlocked:false,storageBlocked:false};
      try { parent.document.body.dataset.compromised='yes'; } catch { result.domBlocked=true; }
      try { parent.localStorage.getItem('fgn-security-test-marker'); } catch { result.storageBlocked=true; }
      return result;
    });
    assert.deepEqual(boundary, {origin:'null',domBlocked:true,storageBlocked:true});
    assert.equal(await page.locator('body').getAttribute('data-compromised'), null);
    const height = await page.locator('iframe[data-bitrix-form-frame]').evaluate(e=>e.getBoundingClientRect().height);
    const actual = await vendor.locator('.b24-form-wrapper').evaluate(e=>Math.ceil(e.getBoundingClientRect().bottom));
    assert.ok(Math.abs(height-actual)<=2, 'Iframe sizing must survive sandbox');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1);
    if (route==='/' && width===390) {
      const qdBefore=qd;
      await host.evaluate(() => { const other=document.createElement('iframe');other.setAttribute('sandbox','allow-scripts');other.src='/security-sibling.html';document.body.append(other); });
      await page.waitForTimeout(150);
      assert.equal(qd,qdBefore,'A different opaque frame must not trigger telemetry');
      assert.equal(await page.evaluate(()=>window.__goals.length),0);
      assert.notEqual(await page.locator('iframe[data-bitrix-form-frame]').evaluate(e=>e.style.height),'4999px');
      await host.locator('iframe').nth(1).evaluate(e=>e.remove());
      await vendor.evaluate(() => parent.postMessage({type:'fgn-bitrix-vendor-success',form:'8',fieldValue:'forbidden'},location.origin));
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(()=>window.__goals.length),0,'Unexpected vendor message fields must be rejected');
    }
    // Validation must prevent an empty form from reaching even the mock transport.
    const before=submissions;
    await vendor.locator('button[type="submit"], .b24-form-btn, form button').first().click();
    await page.waitForTimeout(150);
    assert.equal(submissions,before,'Empty required fields must prevent sending');
    await vendor.locator('input[name="name"]').fill('FGN SANDBOX TEST');
    await vendor.locator('input[type="tel"]').fill('+79000000000');
    const agreement=vendor.locator('.b24-form-control-agreement input[type="checkbox"]');
    if (await agreement.count()) {
      await page.locator('iframe[data-bitrix-form-frame]').scrollIntoViewIfNeeded();
      await agreement.first().click();
      if (!await agreement.first().isChecked()) {
        await page.locator('iframe[data-bitrix-form-frame]').scrollIntoViewIfNeeded();
        const accept=vendor.getByRole('button', {name:'Принимаю', exact:true});
        await accept.click();
      }
      if (!await agreement.first().isChecked()) await agreement.first().check();
      assert.ok(await agreement.first().isChecked());
    }
    await vendor.locator('button[type="submit"], .b24-form-btn, form button').first().click();
    await vendor.locator('.b24-form-state.b24-form-success').waitFor({timeout:15000});
    await page.waitForFunction(goal=>window.__goals.some(args=>args[1]==='reachGoal'&&args[2]===goal),'B24_FORM_'+id+'_END');
    assert.equal(submissions,before+1,'Exactly one mock submission expected');
    assert.equal(await page.evaluate(goal=>window.__goals.filter(args=>args[1]==='reachGoal'&&args[2]===goal).length,'B24_FORM_'+id+'_END'),1);
    assert.deepEqual(errors,[]);
    renders++;
    if(live) console.log(JSON.stringify({id,width,clientSubmission:'PASS'}));
    await page.close();
  }
  if (!live) {
    const failed=await context.newPage();
    await failed.goto(origin+'/');
    const vendor=failed.frames().find(f=>f.url().includes('/forms/bitrix-vendor.html?form=8'));
    await vendor.locator('input[name="name"]').fill('SYNTHETIC RETRY');
    await vendor.locator('input[type="tel"]').fill('+70000000000');
    rejectSubmission=true;
    await vendor.locator('form button').click();
    await failed.waitForTimeout(150);
    assert.equal(await vendor.locator('.b24-form-success').count(),0);
    assert.equal(await failed.evaluate(()=>window.__goals.length),0,'A failed submit must not become a success goal');
    assert.ok(await vendor.locator('form button').isEnabled());
    rejectSubmission=false;
    await vendor.locator('form button').click();
    await vendor.locator('.b24-form-success').waitFor();
    await failed.waitForFunction(()=>window.__goals.length===1);
    await failed.close();
  }
  const framed = await context.newPage();
  let refused=false;
  framed.on('console', m=>{if(/frame-ancestors|X-Frame-Options/i.test(m.text()))refused=true;});
  await framed.goto(foreign+'/');
  await framed.waitForTimeout(300);
  assert.ok(refused,'Foreign framing must be refused by actual browser policy');
  await framed.close();
  const direct=await context.newPage();
  await direct.goto(origin+'/forms/bitrix-vendor.html?form=8');
  assert.equal(await direct.locator('body').innerText(),'Форма недоступна.');
  await direct.close();
  await context.close();
  console.log(JSON.stringify({lane:live?'REAL_LIBRARY_MOCKED_SUBMIT':'OFFLINE',renders,
    interceptedSubmissions:submissions,blockedOtherWrites:blockedWrites,
    blockedActions:[...blockedActions],
    realFormSubmissions:0,parentIsolation:'PASS',messageBoundary:'PASS',headers:'PASS'}));
} finally { await browser.close(); }
