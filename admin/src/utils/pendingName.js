/**
 * Pending-registration-name storage, scoped by role.
 *
 * A mobile number can hold two separate accounts - one `worker`, one
 * `job_creator` - and each has its own profile. Names must therefore never be
 * shared between them.
 *
 * Previously a single `rm_pending_name` key held whatever was typed on
 * /login-rm. That value was resent to the backend for whichever role tab was
 * active, so registering as a worker and then switching to job creator stamped
 * the worker's name onto the brand-new job-creator account.
 *
 * /login-rm collects the name before a role is chosen, so it is parked under an
 * UNASSIGNED key. The first role chosen on /entrywork claims it (and it is
 * consumed in the process); from then on each role reads only its own value.
 */

const KEY = (role) => `rm_pending_name_${role}`;
const UNASSIGNED = 'rm_pending_name_unassigned';
const LEGACY = 'rm_pending_name';

/**
 * Moves any pre-fix `rm_pending_name` value to the unassigned slot, so someone
 * part-way through the old flow is not left stranded with an orphaned key.
 */
function migrateLegacy() {
  try {
    const legacy = localStorage.getItem(LEGACY);
    if (legacy === null) return;
    if (!localStorage.getItem(UNASSIGNED)) localStorage.setItem(UNASSIGNED, legacy);
    localStorage.removeItem(LEGACY);
  } catch { /* storage unavailable */ }
}

export function getPendingName(role) {
  migrateLegacy();
  try {
    return localStorage.getItem(KEY(role)) || '';
  } catch {
    return '';
  }
}

/** Called by /entrywork when a role is selected: claims the unassigned name once. */
export function claimPendingName(role) {
  migrateLegacy();
  try {
    const existing = localStorage.getItem(KEY(role));
    if (existing) return existing;
    const unassigned = localStorage.getItem(UNASSIGNED);
    if (!unassigned) return '';
    // Bind it to this role only, and drop the neutral copy so it cannot be
    // claimed by the other role later.
    localStorage.setItem(KEY(role), unassigned);
    localStorage.removeItem(UNASSIGNED);
    return unassigned;
  } catch {
    return '';
  }
}

export function setPendingName(role, name) {
  try {
    if (role) localStorage.setItem(KEY(role), name);
    else localStorage.setItem(UNASSIGNED, name);
  } catch { /* storage unavailable - the name is simply re-entered */ }
}

export function clearPendingNames() {
  try {
    for (const role of ['worker', 'job_creator']) localStorage.removeItem(KEY(role));
    localStorage.removeItem(UNASSIGNED);
  } catch { /* ignore */ }
}