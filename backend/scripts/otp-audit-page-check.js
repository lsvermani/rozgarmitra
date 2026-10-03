/**
 * Opens /admin/otp-verifications in the real app with a real admin session and
 * reports what rendered: row count, column headers, whether the mask is applied,
 * and whether any phone or code leaked into the DOM.
 *
 *   node scripts/otp-audit-page-check.js
 */
const http = require('http');

const PAGE_URL = process.env.APP_URL || 'http://127.0.0.1:5173';
const PHONE = process.env.ADMIN_PHONE_NUMBER || '8699142699';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getJson = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
  }).on('error', reject);
});

/** PUT variant, needed for Chrome's `/json/new`. */
const putJson = (url) => new Promise((resolve, reject) => {
  const req = http.request(url, { method: 'PUT' }, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
  });
  req.on('error', reject);
  req.end();
});

(async () => {
  // A real session, so the page is exercised through the same auth path a
  // person uses rather than with a stubbed token. The connection is opened
  // first because `issue()` writes to Mongo.
  require('dotenv').config();
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI);

  const adminOtp = require('../src/services/adminOtpService');
  const code = await adminOtp.issue(PHONE);
  const res = await fetch('http://127.0.0.1:5000/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, otp: code }),
  });
  const json = await res.json();
  if (!json.token) { console.log(`Could not get an admin session: ${JSON.stringify(json)}`); process.exit(1); }

  const targets = await getJson('http://127.0.0.1:9222/json/list');
  let page = targets.find((t) => t.type === 'page');
  // A previous run may have closed the last tab, so open one rather than
  // failing on a missing target. `/json/new` answers 405 to GET in current
  // Chrome and requires PUT, which is why this is not `getJson`.
  if (!page) {
    page = await putJson(`http://127.0.0.1:9222/json/new?${encodeURIComponent(`${PAGE_URL}/login`)}`);
    await sleep(1800);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || 'evaluate failed');
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable').catch(() => {});

  // Surface client-side errors, otherwise a render crash shows up only as
  // "an empty table" with no explanation.
  const consoleErrors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      consoleErrors.push(`${m.params.type}: ${(m.params.args || []).map((a) => a.value || a.description || '').join(' ')}`.slice(0, 300));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      consoleErrors.push(`exception: ${(d.exception && d.exception.description) || d.text}`.slice(0, 300));
    }
  });

  // Navigate to the app ORIGIN first: localStorage is per-origin, so setting it
  // while still on about:blank would write to the wrong origin and the session
  // would silently never apply.
  //
  // BOTH keys are required. `AuthProvider` seeds its state from
  // `rm_admin_user`, and the route guard redirects to /entrywork when that is
  // null - the token alone only lets the API client authenticate requests.
  await send('Page.navigate', { url: `${PAGE_URL}/login` });
  await sleep(2500);
  await ev(`localStorage.setItem('rm_admin_token', ${JSON.stringify(json.token)}); true`);
  await ev(`localStorage.setItem('rm_admin_user', ${JSON.stringify(JSON.stringify(json.user))}); true`);
  const stored = await ev(`localStorage.getItem('rm_admin_token') && localStorage.getItem('rm_admin_user') ? 'stored' : 'MISSING'`);
  if (stored !== 'stored') { console.log('Could not seed the admin session in localStorage.'); process.exit(1); }

  await send('Page.navigate', { url: `${PAGE_URL}/admin/otp-verifications` });
  await sleep(6000);

  console.log('url:      ', await ev('location.href'));
  console.log('heading:  ', await ev("(document.querySelector('.rm-page-heading h2')||{}).textContent"));
  console.log('stat cards:', await ev("document.querySelectorAll('.rm-stat').length"));
  console.log('columns:  ', JSON.stringify(await ev("[...document.querySelectorAll('.rm-table thead th')].map(t=>t.textContent)")));
  console.log('rows:     ', await ev("document.querySelectorAll('.rm-table tbody tr').length"));
  console.log('loading?  ', await ev("!!document.querySelector('.rm-loading')"));
  console.log('empty msg?', await ev("(document.querySelector('.rm-empty')||{}).textContent"));
  console.log('card text:', JSON.stringify(String(await ev("(document.querySelector('.rm-toolbar .rm-hint')||{}).textContent"))));
  console.log('first row:', JSON.stringify(await ev("(()=>{const r=document.querySelector('.rm-table tbody tr');return r?[...r.querySelectorAll('td')].map(c=>c.textContent.trim()):null})()")));
  console.log('\nconsole errors:');
  console.log(consoleErrors.length ? consoleErrors.slice(0, 6).map((e) => `  ${e}`).join('\n') : '  none');

  // The two things that must never appear in this page.
  const text = String(await ev('document.body.innerText'));
  console.log('\nleak checks:');
  console.log('  contains the live OTP code? ', text.includes(code) ? 'YES - LEAK' : 'no');
  console.log('  contains a full phone?      ', text.includes(PHONE) ? 'YES - LEAK' : 'no');
  console.log('  shows a masked phone?       ', /\+9186\d{2}\*{4}\d{4}/.test(text) ? 'yes' : 'no');

  await send('Page.close');
  process.exit(0);
})().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });