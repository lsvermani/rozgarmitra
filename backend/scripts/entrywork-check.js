/**
 * Static integrity check for the /entrywork page.
 *
 * Vite's dev server answers every SPA route with index.html, so an HTTP 200
 * proves nothing about whether the page renders. This resolves the page's real
 * dependencies and confirms every t('key') it asks for actually exists in the
 * language dictionary (a missing key renders blank/undefined text).
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'admin', 'src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

let pass = 0, fail = 0;
const check = (n, ok, extra = '') => {
  if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  ${extra ? 'FAIL' : 'PASS'}  ${n}${extra ? ` -> ${extra}` : ''}`); }
};

console.log('=== import targets exist ===');
const entry = read(path.join('pages', 'EntryWork.jsx'));
const imports = [...entry.matchAll(/from\s+'(\.[^']+)'/g)].map((m) => m[1]);
for (const imp of imports) {
  const base = path.join(SRC, path.dirname('pages/EntryWork.jsx'), imp);
  const hit = ['', '.jsx', '.js', '/index.jsx', '/index.js']
    .map((e) => base + e)
    .find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  check(`import '${imp}'`, Boolean(hit), 'file not found');
}

console.log('\n=== PublicShell is exported from PublicApp ===');
const publicApp = read(path.join('pages', 'PublicApp.jsx'));
check('export function PublicShell', /export\s+(function|const)\s+PublicShell/.test(publicApp));
check('PublicApp default export kept', /export\s+default\s+/.test(publicApp));

console.log('\n=== every t() key resolves through the t() fallback chain ===');
// t() checks statusTranslations -> publicTranslations -> translations[lang] ->
// translations.en. Keys are frequently written several to a line after a comma
// (e.g. `worker: 'Worker', creator: 'Job creator'`), so this must match every
// `key:` in the file, not just the ones at the start of a line.
const used = [...new Set([...entry.matchAll(/\bt\('([a-zA-Z0-9_]+)'\)/g)].map((m) => m[1]))];
const langFiles = ['context/LanguageContext.jsx', 'context/useLanguage.js'];
const langSrc = langFiles.filter((f) => fs.existsSync(path.join(SRC, f))).map((f) => read(f)).join('\n');
const defined = new Set([...langSrc.matchAll(/(?:^|[,{\s])([a-zA-Z0-9_]+)\s*:/gm)].map((m) => m[1]));
const missing = used.filter((k) => !defined.has(k));
check(`${used.length} t() keys all defined`, missing.length === 0, missing.join(', '));
if (missing.length) console.log('        missing:', missing.join(', '));

console.log('\n=== useLanguage hook is exported ===');
const useLangFile = fs.existsSync(path.join(SRC, 'context', 'useLanguage.js'))
  ? 'context/useLanguage.js'
  : 'context/LanguageContext.jsx';
const useLangSrc = read(useLangFile);
check('useLanguage exported', /export\s+(function|const)\s+useLanguage/.test(useLangSrc), useLangFile);

console.log('\n=== route registered ===');
const app = read('App.jsx');
check('path="/entrywork" route', app.includes('path="/entrywork"'));

console.log(`\n${'='.repeat(50)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(50)}`);
process.exit(fail === 0 ? 0 : 1);