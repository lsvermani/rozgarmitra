/**
 * Isolates the OTP field's focus + typing, with no SMS provider involved.
 *
 *   node scripts/otp-input-focus-check.js
 *
 * Injects the exact markup the login page renders for the OTP step into the
 * live app (so the real stylesheet applies), then clicks and types.
 *
 * Separating this from the end-to-end run matters: when the SMS provider is
 * misconfigured the OTP step never renders, which from the outside looks
 * identical to "the OTP box is broken".
 */
const http = require('http');

const PAGE_URL = process.env.APP_URL || 'http://127.0.0.1:5173/login';
const DEBUG_PORT = 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => { let b = ''; r.on('data', (c) => { b += c; });
      r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (e) => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;
  return { send, evaluate };
}

async function typeChar(cdp, ch) {
  const c = ch.charCodeAt(0);
  const base = { key: ch, code: ch, windowsVirtualKeyCode: c, nativeVirtualKeyCode: c };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, ...base });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(60);
}

const MARKUP = `(() => {
  document.querySelector('.rm-login-box').innerHTML =
    '<h1 class="rm-login-title">Rozgar<span class="rm-login-title__accent">Mitra</span></h1>' +
    '<p class="tagline">Super Admin login</p><form>' +
    '<label for="rm-admin-otp">Enter OTP sent to 8699142699</label>' +
    '<input id="rm-admin-otp" class="rm-otp-native" type="text" inputmode="numeric" maxlength="6">' +
    '<div class="rm-otp-boxes" aria-hidden="true">' +
    ['a','b','c','d','e','f'].map(x => '<span class="rm-otp-box"></span>').join('') +
    '</div><button class="rm-btn rm-btn--primary">Verify OTP</button></form>';
  return true;
})()`;

const FOCUS = `(() => { const a = document.activeElement; return a.tagName + '#' + (a.id||'') + '.' + (a.className||''); })()`;
const VALUE = `document.querySelector('.rm-otp-native').value`;

(async () => {
  const page = (await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).find((t) => t.type === 'page');
  if (!page) { console.log('No Chrome target.'); process.exit(1); }
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: PAGE_URL }); await sleep(2500);
  await cdp.evaluate(MARKUP); await sleep(400);

  console.log('=== A. Hidden input geometry ===');
  console.log('  ', JSON.stringify(await cdp.evaluate(`(() => {
    const a = document.querySelector('.rm-otp-native'); const r = a.getBoundingClientRect();
    const cs = getComputedStyle(a);
    return { w: Math.round(r.width), h: Math.round(r.height), opacity: cs.opacity,
             position: cs.position, top: Math.round(r.top) };
  })()`)));

  console.log('\n=== B. Click the six boxes, then type (the natural gesture) ===');
  const at = await cdp.evaluate(`(() => { const b = document.querySelector('.rm-otp-boxes').getBoundingClientRect();
    return { x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2) }; })()`);
  for (const t of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type: t, x: at.x, y: at.y, button: 'left', clickCount: 1 });
  }
  await sleep(250);
  console.log('   focus after clicking the boxes:', await cdp.evaluate(FOCUS));
  for (const ch of '123456') await typeChar(cdp, ch);
  await sleep(300);
  const blind = await cdp.evaluate(VALUE);
  console.log('   value =', JSON.stringify(blind), blind ? ' <- typed' : ' <- NOTHING (bug)');

  console.log('\n=== C. Same, but focusing the input first ===');
  await cdp.evaluate(`(() => { const a = document.querySelector('.rm-otp-native'); a.value=''; a.focus(); return true; })()`);
  await sleep(200);
  console.log('   focus =', await cdp.evaluate(FOCUS));
  for (const ch of '123456') await typeChar(cdp, ch);
  await sleep(300);
  const focused = await cdp.evaluate(VALUE);
  console.log('   value =', JSON.stringify(focused), focused === '123456' ? ' <- typed' : ' <- FAILED');

  console.log('\n=== D. Click the label, then type ===');
  await cdp.evaluate(`document.querySelector('.rm-otp-native').value=''`);
  const lab = await cdp.evaluate(`(() => { const l = document.querySelector('label'); const r = l.getBoundingClientRect();
    return { x: Math.round(r.left + 5), y: Math.round(r.top + r.height/2) }; })()`);
  for (const t of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type: t, x: lab.x, y: lab.y, button: 'left', clickCount: 1 });
  }
  await sleep(250);
  console.log('   focus after label click:', await cdp.evaluate(FOCUS));
  for (const ch of '123456') await typeChar(cdp, ch);
  await sleep(300);
  console.log('   value =', JSON.stringify(await cdp.evaluate(VALUE)));

  process.exit(0);
})().catch((e) => { console.error('crashed:', e.message); process.exit(1); });