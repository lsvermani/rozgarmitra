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

  // Widths that break flex layouts: a narrow phone, and one wide enough that the
  // six boxes would overflow if `flex: 1 1 0` / `min-width: 0` were ever lost.
  // A single-row bug that only appears at one width is still a bug.
  const VIEWPORTS = [
    { width: 320, height: 720, label: '320  small phone' },
    { width: 375, height: 812, label: '375  modern phone' },
    { width: 768, height: 900, label: '768  tablet' },
    { width: 1280, height: 900, label: '1280 desktop' },
  ];

  console.log('\n=== 0. Six boxes must stay on one row at EVERY width ===');
  for (const vp of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send('Page.navigate', { url: PAGE_URL });
    await sleep(1800);
    // Render the OTP step directly, so the loop tests the boxes rather than
    // re-driving the whole send-and-wait flow four times.
    const geom = await cdp.evaluate(`(() => {
      const box = document.querySelector('.rm-login-box');
      if (!box) return { error: 'no login box' };
      // Mirror exactly what components/OtpField.jsx renders, INCLUDING the
      // .rm-otp-field wrapper. The OTP CSS is scoped to that wrapper, so a
      // fixture that omits it tests markup the product never produces and
      // reports a false failure.
      const old = box.querySelector('.rm-otp-field');
      if (old) old.remove();
      const field = document.createElement('div');
      field.className = 'rm-otp-field';
      const native = document.createElement('input');
      native.className = 'rm-otp-native';
      field.appendChild(native);
      const lbl = document.createElement('label');
      lbl.className = 'rm-otp-boxes';
      lbl.setAttribute('for', native.id = 'rm-otp-probe');
      for (let i = 0; i < 6; i += 1) {
        const s = document.createElement('span');
        s.className = 'rm-otp-box';
        lbl.appendChild(s);
      }
      field.appendChild(lbl);
      box.appendChild(field);
      const cells = [...lbl.querySelectorAll('.rm-otp-box')].map((b) => {
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) };
      });
      const rows = new Set(cells.map((c) => c.y));
      const cols = new Set(cells.map((c) => c.x));
      return {
        rows: rows.size, cols: cols.size, count: cells.length,
        display: getComputedStyle(lbl).display,
        narrowest: Math.min(...cells.map((c) => c.w)),
        scrollW: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      };
    })()`);
    if (geom.error) {
      check(`${vp.label}: boxes render`, false, geom.error);
    } else {
      check(`${vp.label}: one row, six columns`, geom.rows === 1 && geom.cols === 6,
        `rows=${geom.rows} cols=${geom.cols} display=${geom.display}`);
      check(`${vp.label}: boxes stay usable width`, geom.narrowest >= 24, `narrowest=${geom.narrowest}px`);
      check(`${vp.label}: no horizontal overflow`, geom.scrollW <= geom.viewport,
        `scrollW=${geom.scrollW} viewport=${geom.viewport}`);
    }
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await sleep(1800);

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
    const cells = [...document.querySelectorAll('.rm-otp-box')].map((b) => {
      const q = b.getBoundingClientRect();
      return { x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height) };
    });
    const rows = new Set(cells.map((c) => c.y));
    const cols = new Set(cells.map((c) => c.x));
    return {
      left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
      center: Math.round(r.left + r.width / 2),
      boxesCenter: Math.round(bx.left + bx.width / 2),
      boxesW: Math.round(bx.width),
      boxesDisplay: getComputedStyle(boxes).display,
      boxesTag: boxes.tagName,
      nativeW: Math.round(nr.width),
      cellCount: cells.length,
      rowCount: rows.size,
      colCount: cols.size,
      firstCell: cells[0],
      lastCell: cells[cells.length - 1],
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
    check('Six OTP boxes present', step2.cellCount === 6, `count=${step2.cellCount}`);
    // The regression this catches: `.rm-login-box label { display: block }`
    // (0,1,1) beating `.rm-otp-boxes { display: flex }` (0,1,0), which stacked
    // all six boxes vertically. Asserted on measured geometry, not on the class
    // name, so any future cause of the same visual break also fails here.
    check(
      'All six OTP boxes sit on ONE row',
      step2.rowCount === 1,
      `rows=${step2.rowCount} display=${step2.boxesDisplay} tag=${step2.boxesTag}`,
    );
    check(
      'All six OTP boxes sit in distinct columns',
      step2.colCount === 6,
      `cols=${step2.colCount} (duplicate x means boxes overlap)`,
    );
    check(
      'Boxes increase left-to-right',
      step2.firstCell && step2.lastCell && step2.lastCell.x > step2.firstCell.x,
      `first.x=${step2.firstCell && step2.firstCell.x} last.x=${step2.lastCell && step2.lastCell.x}`,
    );
    check('Each OTP box is visibly sized', step2.firstCell && step2.firstCell.w > 20 && step2.firstCell.h > 20, `w=${step2.firstCell && step2.firstCell.w} h=${step2.firstCell && step2.firstCell.h}`);
    check('Success notice shown', /OTP sent successfully/i.test(step2.notice), step2.notice);
  }

  cdp.close();
  console.log(`\n${'-'.repeat(50)}\nPASS ${passed}   FAIL ${failed}\n${'-'.repeat(50)}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Check crashed:', err.message);
  process.exit(1);
});
