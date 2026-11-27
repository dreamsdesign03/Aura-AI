/**
 * Role-based access control (client side).
 *
 * Roles come from the users table and are normalised to three levels:
 *   - admin      → full access to every page
 *   - leader     → restricted access (branch selection, leads, clinic OS subset)
 *   - executive  → same restricted access as leader
 *
 * Keep this in sync with server/permissions.js.
 */

export const ROLE_LABELS = {
  admin: "Admin",
  leader: "Leader",
  executive: "Executive",
};

const ADMIN_ALIASES = new Set(["owner", "admin", "administrator", "superadmin", "super_admin", "org_admin", "organization_admin"]);
const LEADER_ALIASES = new Set(["leader", "lead", "team_lead", "teamleader", "manager", "supervisor"]);
const EXECUTIVE_ALIASES = new Set(["executive", "exec", "member", "staff", "agent", "user", "employee", "sales_executive", "sales_rep"]);

/** Paths that are accessible to every authenticated user regardless of role. */
const PUBLIC_PATHS = ["/login", "/register", "/verify", "/invite", "/audit/share", "/book", "/form-quest", "/chatbot-preview"];

/**
 * Pages a Leader may open (includes Bulk Calling).
 * `prefix: true` allows child routes (e.g. /leads/123).
 */
export const LEADER_ROUTES = [
  { path: "/leads", prefix: true },
  { path: "/clinic/appointments", prefix: true },
  { path: "/clinic/dialer", prefix: true },
  // Legacy links that immediately redirect to an allowed clinic page.
  { path: "/appointments", exact: true },
  { path: "/meetings", exact: true },
];

/**
 * Pages an Executive may open (no Bulk Calling).
 */
export const EXECUTIVE_ROUTES = [
  { path: "/leads", prefix: true },
  { path: "/clinic/appointments", prefix: true },
  { path: "/clinic/dialer", prefix: true },
  // Legacy links that immediately redirect to an allowed clinic page.
  { path: "/appointments", exact: true },
  { path: "/meetings", exact: true },
];

export function normalizePath(pathname) {
  let p = String(pathname || "/").split("?")[0].split("#")[0];
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

function asAlias(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isKnownAdminIdentity(user) {
  if (!user) return false;
  const email = String(user.email || "").toLowerCase();
  const username = String(user.username || "").toLowerCase();
  return (
    email === "krishadmin@auraai.app" ||
    email === "admin@aurai.clinic" ||
    username === "auraadmin"
  );
}

/** Normalise any stored role value into admin | leader | executive. */
export function normalizeRole(role, user) {
  const value = asAlias(role);
  if (ADMIN_ALIASES.has(value)) return "admin";
  if (LEADER_ALIASES.has(value)) return "leader";
  if (EXECUTIVE_ALIASES.has(value)) return "executive";
  // Missing / unknown role: preserve the existing admin identity, otherwise
  // default to least privilege.
  return isKnownAdminIdentity(user) ? "admin" : "executive";
}

export function roleLabel(role, user) {
  return ROLE_LABELS[normalizeRole(role, user)] || "Executive";
}

export function isAdminRole(role, user) {
  return normalizeRole(role, user) === "admin";
}

export function isRestrictedRole(role, user) {
  return !isAdminRole(role, user);
}

function matchesRoute(path, routes) {
  return routes.some((rule) => {
    if (rule.prefix) return path === rule.path || path.startsWith(`${rule.path}/`);
    return path === rule.path;
  });
}

/** Can this role open this page? */
export function canAccessPath(role, pathname, user) {
  const path = normalizePath(pathname);
  if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return true;
  if (isAdminRole(role, user)) return true;
  if (role === "leader") return matchesRoute(path, LEADER_ROUTES);
  if (role === "executive") return matchesRoute(path, EXECUTIVE_ROUTES);
  return false;
}

/** Landing page for a role after login / when an unauthorised page is opened. */
export function homePathForRole(role, user) {
  if (isAdminRole(role, user)) return "/";
  return "/clinic/dialer";
}

export function allowedNavHrefs(role, user) {
  return (href) => canAccessPath(role, href, user);
}
