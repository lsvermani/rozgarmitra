/**
 * Central permission catalogue for Role-Based Access Control.
 *
 * Design notes
 * ------------
 * The existing `authorize(...roles)` allowlist in `middleware/auth.js` is left
 * untouched and keeps working. `requirePermission` is layered *on top* of it so
 * that already-shipped routes do not change behaviour, while new admin modules
 * can guard individual capabilities.
 *
 * `super_admin` is granted every permission by definition. A role that is not
 * listed in ROLE_PERMISSIONS has no administrative permissions at all, which is
 * the safe default for `worker` / `job_creator` end users.
 */

const PERMISSIONS = Object.freeze({
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_DELETE: 'users.delete',

  WORKERS_VIEW: 'workers.view',
  WORKERS_CREATE: 'workers.create',
  WORKERS_EDIT: 'workers.edit',
  WORKERS_DELETE: 'workers.delete',

  JOBS_VIEW: 'jobs.view',
  JOBS_CREATE: 'jobs.create',
  JOBS_EDIT: 'jobs.edit',
  JOBS_DELETE: 'jobs.delete',
  JOBS_ASSIGN: 'jobs.assign',

  ASSIGNMENTS_VIEW: 'assignments.view',
  ASSIGNMENTS_EDIT: 'assignments.edit',

  PROFILES_VIEW: 'profiles.view',
  PROFILES_CREATE: 'profiles.create',
  PROFILES_EDIT: 'profiles.edit',
  PROFILES_APPROVE: 'profiles.approve',

  DATABASE_CONFIGURE: 'database.configure',
  SERVER_CONFIGURE: 'server.configure',
  SETTINGS_CONFIGURE: 'settings.configure',
  REPORTS_VIEW: 'reports.view',
  LOGS_VIEW: 'logs.view',
  SECURITY_MANAGE: 'security.manage',
  NOTIFICATIONS_SEND: 'notifications.send',

  // WhatsApp OTP. Split from SETTINGS_CONFIGURE so viewing delivery health can
  // be granted to a manager without handing over the ability to change settings.
  // Both still require an administrative role; neither is granted to workers or
  // job creators.
  WHATSAPP_VIEW: 'whatsapp.view',
  WHATSAPP_CONFIGURE: 'whatsapp.configure',
});

/** Every permission value, in declaration order. */
const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

/** Roles that may reach the administrative surface at all. */
const ADMIN_ROLES = Object.freeze(['super_admin', 'admin', 'manager']);

/**
 * Job status mapping (§7 of the brief).
 *
 * The brief names Draft/Pending/Assigned/... but the shipped app has always
 * used POSTED/APPLICATIONS_RECEIVED/WORKER_SELECTED/... and both the website and
 * the Flutter app compare those exact strings. Rather than migrate 21 existing
 * documents and every screen that reads them, the new names are mapped onto the
 * stored values. `UNDER_REVIEW` and `REJECTED` are genuinely new and are added to
 * the Job enum in the same change.
 */
const JOB_STATUS_MAP = Object.freeze({
  DRAFT: 'POSTED',
  PENDING: 'APPLICATIONS_RECEIVED',
  ASSIGNED: 'WORKER_SELECTED',
  IN_PROGRESS: 'IN_PROGRESS',
  UNDER_REVIEW: 'UNDER_REVIEW',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
});

/** Reverse lookup so the admin UI can show "Assigned (WORKER_SELECTED)". */
const JOB_STATUS_LABEL = Object.freeze(
  Object.entries(JOB_STATUS_MAP).reduce((acc, [label, stored]) => {
    acc[stored] = label;
    return acc;
  }, {})
);

const VIEWER_PERMISSIONS = Object.freeze([
  PERMISSIONS.USERS_VIEW,
  PERMISSIONS.WORKERS_VIEW,
  PERMISSIONS.JOBS_VIEW,
  PERMISSIONS.ASSIGNMENTS_VIEW,
  PERMISSIONS.PROFILES_VIEW,
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.LOGS_VIEW,
]);

const MANAGER_PERMISSIONS = Object.freeze([
  ...VIEWER_PERMISSIONS,
  // Managers can read WhatsApp delivery health (recent failures, statistics)
  // but cannot change the configuration - that stays with admins.
  PERMISSIONS.WHATSAPP_VIEW,
  PERMISSIONS.USERS_CREATE,
  PERMISSIONS.USERS_EDIT,
  PERMISSIONS.WORKERS_CREATE,
  PERMISSIONS.WORKERS_EDIT,
  PERMISSIONS.JOBS_CREATE,
  PERMISSIONS.JOBS_EDIT,
  PERMISSIONS.JOBS_ASSIGN,
  PERMISSIONS.ASSIGNMENTS_EDIT,
  PERMISSIONS.PROFILES_CREATE,
  PERMISSIONS.PROFILES_EDIT,
  PERMISSIONS.PROFILES_APPROVE,
  PERMISSIONS.NOTIFICATIONS_SEND,
]);

const ADMIN_PERMISSIONS = Object.freeze([
  ...MANAGER_PERMISSIONS,
  PERMISSIONS.WHATSAPP_CONFIGURE,
  PERMISSIONS.USERS_DELETE,
  PERMISSIONS.WORKERS_DELETE,
  PERMISSIONS.JOBS_DELETE,
  PERMISSIONS.SETTINGS_CONFIGURE,
  PERMISSIONS.SERVER_CONFIGURE,
]);

const ROLE_PERMISSIONS = Object.freeze({
  super_admin: ALL_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  viewer: VIEWER_PERMISSIONS,
  job_creator: Object.freeze([PERMISSIONS.JOBS_VIEW, PERMISSIONS.JOBS_CREATE, PERMISSIONS.JOBS_EDIT]),
  worker: Object.freeze([]),
});

function isSuperAdmin(role) {
  return role === 'super_admin';
}

function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

/**
 * Core RBAC check. `super_admin` always passes; unknown roles get nothing.
 * `*` inside a role's list is treated as a wildcard so a role can be widened
 * later without touching every call site.
 */
function hasPermission(role, permission) {
  const granted = ROLE_PERMISSIONS[role];
  if (!granted) return false;
  if (granted.includes('*')) return true;
  return granted.includes(permission);
}

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  ADMIN_ROLES,
  JOB_STATUS_MAP,
  JOB_STATUS_LABEL,
  isSuperAdmin,
  isAdminRole,
  hasPermission,
};
