/**
 * Reproduces "cannot type the OTP" against the REAL app.
 *
 *   node scripts/otp-typing-check.js
 *
 * Drives headless Chrome over CDP, walks the login flow, then sends genuine key
 * events (Input.dispatchKeyEvent, not a synthetic `value =`) so it exercises the
 * same path a person does: focus, then type.
 *
 * Reports where focus actually is at each stage - "typing does nothing" is
 * almost always a focus problem, not a value problem.
 */
const http = require('http');

const PAGE_URL = process.env.APP_URL || 'http://127.0.0.1:5173/login';
const API_URL = process.env.API_BASE || 'http://127.0.0.1:5000/api';
// Which page to drive. All three sign-in entry points render the same
// OtpField, so one script covers all of them; only the selectors differ.
//   APP_URL=http://127.0.0.1:5173/entrywork  PHONE_SEL=#rm-entry-mobile  OTP_SEL=#rm-entry-otp
const PHONE = process.env.CHECK_PHONE || '8699142699';
const PHONE_SEL = process.env.PHONE_SEL || '#rm-admin-phone';
const OTP_SEL = process.env.OTP_SEL || '#rm-admin-otp';
// Submits only once six digits are entered, so its enabled state is the
// assertion that typing actually reached the page state. Given as a source
// pattern rather than a literal, because this runs inside a JS template string
// and a regex literal cannot be interpolated there.
const SUBMIT_RE_FLAGS = process.env.SUBMIT_RE || 'verify';
const DEBUG_PORT = 9222;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

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
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      // `text` is only ever "Uncaught"; the actual reason lives on the nested
      // exception. Reporting just the former hides which step broke.
      const d = r.exceptionDetails;
      const why = (d.exception && (d.exception.description || d.exception.value)) || d.text;
      throw new Error(`${why}\n  while evaluating: ${expression.slice(0, 300)}`);
    }
    return r.result.value;
  };
  return { send, evaluate };
}

/** Sends one real keystroke. */
async function typeChar(cdp, char) {
  const code = char.charCodeAt(0);
  const base = { key: char, code: char, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: char, ...base });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(60);
}

/** Describes where focus and caret currently are. */
const FOCUS_PROBE = `(() => {
  const a = document.activeElement;
  if (!a) return { tag: 'none' };
  const cs = getComputedStyle(a);
  const r = a.getBoundingClientRect();
  return {
    tag: a.tagName, id: a.id || '', cls: a.className || '', type: a.type || '',
    len: a.value === undefined ? -1 : String(a.value).length,
    pointerEvents: cs.pointerEvents, disabled: !!a.disabled, readOnly: !!a.readOnly,
    w: Math.round(r.width), h: Math.round(r.height),
  };
})()`;
(async () => {
  const health = await getJson(`${API_URL}/health`).catch(() => null);
  if (!health) { console.log('API down. Start the backend.'); process.exit(1); }

  const targets = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const page = targets.find((t) => t.type === 'page');
  if (!page) { console.log('No Chrome page target.'); process.exit(1); }

  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  await cdp.send('Page.navigate', { url: PAGE_URL });

  // Poll for the form rather than sleeping a fixed amount: Vite's cold start
  // compiles on demand and regularly takes longer than a fixed wait.
  await cdp.evaluate(`new Promise((resolve) => {
    let tries = 0;
    const tick = () => {
      if (document.querySelector('${PHONE_SEL}')) return resolve(true);
      if (++tries > 60) return resolve(false);
      setTimeout(tick, 250);
    };
    tick();
  })`);

  console.log('=== 1. Type the phone number ===');
  await cdp.evaluate(`document.querySelector('${PHONE_SEL}').focus()`);
  for (const ch of PHONE) await typeChar(cdp, ch);
  console.log('  phone value =', await cdp.evaluate(`document.querySelector('${PHONE_SEL}').value`));

  console.log('\n=== 2. Click Send OTP ===');
  await cdp.evaluate(`(() => {
    const b = [...document.querySelectorAll('.rm-btn')].find(x => /send otp/i.test(x.textContent));
    b.click(); return true;
  })()`);
  await sleep(2500);

  const exists = await cdp.evaluate(`!!document.querySelector('.rm-otp-boxes')`);
  console.log('  OTP step rendered:', exists);
  if (!exists) { console.log('  OTP step did not render.'); process.exit(1); }

  console.log('\n=== 3. Is the OTP field usable? ===');
  console.log('  focus after step change:', JSON.stringify(await cdp.evaluate(FOCUS_PROBE)));

  console.log('  element under the centre of the boxes:', JSON.stringify(await cdp.evaluate(`(() => {
    const b = document.querySelector('.rm-otp-boxes').getBoundingClientRect();
    const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { tag: el.tagName, cls: el.className || '', id: el.id || '' };
  })()`)));

  console.log('\n=== 4. Click the boxes, then check focus ===');
  const at = await cdp.evaluate(`(() => {
    const b = document.querySelector('.rm-otp-boxes').getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  })()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
  }
  await sleep(250);
  console.log('  focus after clicking the boxes:', JSON.stringify(await cdp.evaluate(FOCUS_PROBE)));

  console.log('\n=== 5. Type 6 digits for real ===');
  // In demo mode the server returns the code and the page auto-fills it, so the
  // field already holds six digits and `maxLength` would reject anything typed.
  // Clearing through the native setter keeps React's state in step, then the
  // keystrokes below are a genuine "can a person type into this?" test.
  await cdp.evaluate(`(() => {
    const el = document.querySelector('${OTP_SEL}');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(250);
  for (const ch of '123456') await typeChar(cdp, ch);
  await sleep(400);

  const after = await cdp.evaluate(`(() => ({
    nativeValue: (document.querySelector('${OTP_SEL}') || {}).value,
    boxes: [...document.querySelectorAll('.rm-otp-box')].map(b => b.textContent).join(''),
    verifyEnabled: !([...document.querySelectorAll('.rm-btn, button')].find(b => (new RegExp('${SUBMIT_RE_FLAGS}', 'i')).test(b.textContent)) || {}).disabled,
    focus: (a => a.tagName + '#' + (a.id || '') + '.' + (a.className || ''))(document.activeElement),
  }))()`);
  console.log('  native input value:', JSON.stringify(after.nativeValue));
  console.log('  digits shown in boxes:', JSON.stringify(after.boxes));
  console.log('  focus now:', after.focus);
  console.log('  Verify button enabled:', after.verifyEnabled);

  const typed = (after.nativeValue || '').length;
  console.log(`\nRESULT: ${typed === 6 ? 'TYPING WORKS' : `BROKEN - only ${typed}/6 digits reached the input`}`);
  process.exit(typed === 6 ? 0 : 1);
})().catch((err) => {
  // The stack, not just err.message: a rejected CDP command reports only
  // "Uncaught (in promise)", which says nothing about which step failed.
  console.error('crashed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
