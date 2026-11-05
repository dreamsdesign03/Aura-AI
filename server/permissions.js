/**
 * Role-based access control (server side).
 *
 * Roles come from users.role and are normalised to:
 *   admin | leader | executive
 *
 * Admin = full access. Leader + Executive share a restricted allowlist
 * (branch selection, leads, clinic command center, appointments, inbox, dialer).
 *
 * Keep this in sync with src/lib/permissions.js.
 */

const ADMIN_ALIASES = new Set(['owner', 'admin', 'administrator', 'superadmin', 'super_admin', 'org_admin', 'organization_admin']);
const LEADER_ALIASES = new Set(['leader', 'lead', 'team_lead', 'teamleader', 'manager', 'supervisor']);
const EXECUTIVE_ALIASES = new Set(['executive', 'exec', 'member', 'staff', 'agent', 'user', 'employee', 'sales_executive', 'sales_rep']);

const ADMIN_EMAILS = new Set(['krishadmin@auraai.app', 'admin@aurai.clinic']);
const ADMIN_USERNAMES = new Set(['auraadmin']);

function asAlias(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function isKnownAdminIdentity(user) {
  if (!user) return false;
  return (
    ADMIN_EMAILS.has(String(user.email || '').toLowerCase()) ||
    ADMIN_USERNAMES.has(String(user.username || '').toLowerCase())
  );
}

function normalizeRole(role, user) {
  const value = asAlias(role);
  if (ADMIN_ALIASES.has(value)) return 'admin';
  if (LEADER_ALIASES.has(value)) return 'leader';
  if (EXECUTIVE_ALIASES.has(value)) return 'executive';
  return isKnownAdminIdentity(user) ? 'admin' : 'executive';
}

function isAdminRole(role, user) {
  return normalizeRole(role, user) === 'admin';
}

function normalizePath(pathname) {
  let p = String(pathname || '/').split('?')[0].split('#')[0];
  const mount = '/api/clinic';
  if (p.startsWith(mount)) p = p.slice(mount.length) || '/';
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

/**
 * Clinic API allowlist for restricted roles.
 * Everything used by the allowed pages stays open; admin-only modules are blocked.
 */
function canAccessClinicApi(method, pathname) {
  const path = normalizePath(pathname);
  const verb = String(method || 'GET').toUpperCase();

  // Branch selection in the header reads clinic settings.
  if (path === '/settings') return verb === 'GET';

  // Appointments page needs the patient picker and the recent-calls list.
  if (path === '/patients' || /^\/patients\/[^/]+$/.test(path)) return verb === 'GET';
  if (path === '/call-review' || /^\/call-review\/[^/]+$/.test(path)) return verb === 'GET';

  const allowedPrefixes = [
    '/overview',
    '/journey-stats',
    '/appointments',
    '/visits',
    '/tasks',
    '/notes',
    '/inbox',
    '/dialer',
  ];

  return allowedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

module.exports = {
  normalizeRole,
  isAdminRole,
  canAccessClinicApi,
  normalizePath,
};
