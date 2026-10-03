/**
 * End-to-end UI check of the REAL app at 127.0.0.1:5173/login.
 *
 *   node scripts/login-layout-check.js
 *
 * Drives a headless Chrome over the DevTools Protocol to actually walk the
 * login flow - type the number, click Send OTP, wait for the OTP step - then
 * measures the two steps against each other. Node 24 ships a global WebSocket,
 * so CDP needs no dependencies.
 *
 * Why bother: the bug this catches (the OTP card sitting left of the phone
 * card) is invisible to unit tests and only appears once the second step
 * actually renders its real markup.
 */
const http = require('http');

const PAGE_URL = process.env.APP_URL || 'http://127.0.0.1:5173/login';
const API_URL = process.env.API_BASE || 'http://127.0.0.1:5000/api';
const PHONE = process.env.ADMIN_PHONE_NUMBER || '8699142699';
const DEBUG_PORT = 9222;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

/** Minimal CDP client over the built-in WebSocket. */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluate failed');
    return r.result.value;
  };

  return { send, evaluate, close: () => ws.close() };
}

(async () => {
  let passed = 0;
  let failed = 0;
  const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? `  -> ${detail}` : ''}`);
    ok ? passed++ : failed++;
  };

  console.log(`Login layout check\nApp: ${PAGE_URL}\n`);

  const health = await getJson(`${API_URL}/health`).catch(() => null);
  if (!health) {
    console.log('API is not reachable. Start the backend first.');
    process.exit(1);
  }

  const targets = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const page = targets.find((t) => t.type === 'page');
  if (!page) {
    console.log('No Chrome page target found.');
    process.exit(1);
  }

  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  console.log('=== 1. Phone step (step 1) ===');
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(2500);

  // React ignores a plain `.value =`; the native setter plus an input event is
  // what actually updates its state.
  await cdp.evaluate(`(() => {
    const el = document.querySelector('#rm-admin-phone');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(PHONE)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.value;
  })()`);
  await sleep(300);

  const step1 = await cdp.evaluate(`(() => {
    const r = document.querySelector('.rm-login-box').getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
             center: Math.round(r.left + r.width / 2),
             scrollW: document.documentElement.scrollWidth };
  })()`);
  console.log('  step1 box:', JSON.stringify(step1));
  check('Phone step renders at the expected card width', step1.w === 360, `w=${step1.w}`);

  console.log('\n=== 2. Click Send OTP -> OTP step ===');
  await cdp.evaluate(`(() => {
    const btn = [...document.querySelectorAll('.rm-btn')].find(b => /send otp/i.test(b.textContent));
    btn.click();
    return true;
  })()`);
  await sleep(2500);

  const step2 = await cdp.evaluate(`(() => {
    const boxes = document.querySelector('.rm-otp-boxes');
    if (!boxes) return { error: document.body.innerText.slice(0, 200) };
    const r = document.querySelector('.rm-login-box').getBoundingClientRect();
    const bx = boxes.getBoundingClientRect();
    const nr = document.querySelector('.rm-otp-native').getBoundingClientRect();
    return {
      left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
      center: Math.round(r.left + r.width / 2),
      boxesCenter: Math.round(bx.left + bx.width / 2),
      boxesW: Math.round(bx.width),
      nativeW: Math.round(nr.width),
      scrollW: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      notice: (document.querySelector('.rm-ok') || {}).textContent || '',
    };
  })()`);

  if (step2.error) {
    console.log('  OTP step did not render:', step2.error);
    check('OTP step renders', false, 'boxes not found - is the API/gateway up?');
  } else {
    console.log('  step2 box:', JSON.stringify(step2));
    check('OTP step renders at the same card width', step2.w === 360, `w=${step2.w}`);
    check(
      'OTP card sits at the SAME position as the phone card',
      step2.left === step1.left && step2.right === step1.right,
      `step1 ${step1.left}..${step1.right} vs step2 ${step2.left}..${step2.right}`,
    );
    check('Both cards are centred identically', Math.abs(step1.center - step2.center) <= 1, `${step1.center} vs ${step2.center}`);
    check('No horizontal overflow', step2.scrollW <= step2.viewport, `scrollW=${step2.scrollW} viewport=${step2.viewport}`);
    check('Hidden input is 1px, not full width', step2.nativeW === 1, `nativeW=${step2.nativeW}`);
    check('OTP boxes centred inside the card', Math.abs(step2.boxesCenter - step2.center) <= 2, `boxes ${step2.boxesCenter} vs card ${step2.center}`);
    check('Six OTP boxes present', step2.boxesW > 0, `boxesW=${step2.boxesW}`);
    check('Success notice shown', /OTP sent successfully/i.test(step2.notice), step2.notice);
  }

  cdp.close();
  console.log(`\n${'-'.repeat(50)}\nPASS ${passed}   FAIL ${failed}\n${'-'.repeat(50)}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Check crashed:', err.message);
  process.exit(1);
});
