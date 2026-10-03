/**
 * Unit tests for role-scoped pending-name storage.
 *
 * Reproduces the reported bug purely in the client: a name captured on /login-rm
 * for one role must never be offered to the other role on /entrywork.
 *
 *   node admin/scripts/pending-name-test.mjs
 */
// The module reads localStorage inside its functions, so a shim installed here
// (before any call) is enough - no import-time dependency.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const { getPendingName, claimPendingName, setPendingName, clearPendingNames } =
  await import('../src/utils/pendingName.js');

let pass = 0, fail = 0;
const check = (n, ok, extra = '') => {
  if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} -> ${extra}`); }
};

console.log('=== role-scoped pending name ===\n');

console.log('1. /login-rm captures a name before any role is chosen');
store.clear();
setPendingName(null, 'Ramesh');
check('stored as unassigned', store.get('rm_pending_name_unassigned') === 'Ramesh', String(store.get('rm_pending_name_unassigned')));
check('worker (default tab) claims it', claimPendingName('worker') === 'Ramesh');
check('unassigned copy is consumed', store.get('rm_pending_name_unassigned') === undefined);

console.log('\n2. THE BUG: the other role must NOT receive that name');
const forCreator = claimPendingName('job_creator');
check('job_creator gets no name from the worker step', forCreator === '', `got ${JSON.stringify(forCreator)}`);
check('worker still has its own name', getPendingName('worker') === 'Ramesh', getPendingName('worker'));

console.log('\n3. switching tabs back and forth stays isolated');
check('claiming worker again is stable', claimPendingName('worker') === 'Ramesh');
check('claiming job_creator again is still empty', claimPendingName('job_creator') === '');

console.log('\n4. the two roles can hold different names independently');
setPendingName('job_creator', 'Ramesh Events Pvt Ltd');
check('worker name unchanged', getPendingName('worker') === 'Ramesh', getPendingName('worker'));
check('job_creator has its own name', getPendingName('job_creator') === 'Ramesh Events Pvt Ltd', getPendingName('job_creator'));

console.log('\n5. clearPendingNames wipes every slot');
clearPendingNames();
check('worker cleared', getPendingName('worker') === '');
check('job_creator cleared', getPendingName('job_creator') === '');
check('unassigned cleared', store.get('rm_pending_name_unassigned') === undefined);

console.log('\n6. a pre-fix leftover key is migrated, not stranded');
store.clear();
store.set('rm_pending_name', 'Legacy User');
check('legacy key is claimed by the chosen role', claimPendingName('worker') === 'Legacy User');
check('old key is removed', store.get('rm_pending_name') === undefined);

console.log('\n7. nothing stored means an empty name (no crash)');
store.clear();
check('empty storage -> empty name', getPendingName('worker') === '');
check('empty storage -> empty claim', claimPendingName('job_creator') === '');

console.log(`\n${'='.repeat(50)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(50)}`);
process.exit(fail === 0 ? 0 : 1);