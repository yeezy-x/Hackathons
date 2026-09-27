// Shared domain rules: role ranks, last-owner protection, ending sessions.
//
// YOURS TO WRITE. This file ships as a stub.
//
// Put here the rules more than one route needs, so "what ends a session" has exactly
// one implementation. Sources: PERMISSIONS.md §7.2 and D8.
//
// Two traps worth naming before you start:
//   - `roles.rank` is MODIFICATION AUTHORITY ONLY. It must never answer a can()
//     question. operator and auditor are unordered by permission, and ranking them is
//     the modelling error the auditor role exists to catch.
//   - a permission change does NOT end a session in flight (grantfathering). Suspension,
//     membership removal and device transfer DO. See PERMISSIONS.md §7.

import { newId, nowIso } from './db.js';
import { badRequest, forbidden, lastOwner } from './http.js';

export function roleRanks(db) {
  const rows = db.prepare('SELECT key, rank FROM roles').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.rank]));
}

export function assertRoleExists(db, role) {
  const row = db.prepare('SELECT key FROM roles WHERE key = ?').get(role);
  if (!row) throw badRequest(`unknown role: ${role}`, 'unknown_role');
}

export function assertCanModify(db, callerRole, targetRole) {
  if (callerRole === 'owner') return;
  const ranks = roleRanks(db);
  if (ranks[callerRole] > ranks[targetRole]) return;
  throw forbidden('you cannot modify a user at or above your own role', 'insufficient_rank');
}

export function assertNotLastOwner(db, orgId, userId) {
  const target = db.prepare('SELECT role FROM memberships WHERE org_id = ? AND user_id = ?').get(orgId, userId);
  if (target?.role !== 'owner') return;
  const owners = db.prepare(
    `SELECT count(*) AS n FROM memberships
      WHERE org_id = ? AND role = 'owner' AND status = 'active'`
  ).get(orgId).n;
  if (owners <= 1) throw lastOwner();
}

export function endActiveSessions(db, { orgId, userId, deviceId = null, reason, exceptSessionId = null }) {
  const at = nowIso();
  const where = [
    'org_id = ?',
    "state = 'active'",
    userId ? 'user_id = ?' : null,
    deviceId ? 'device_id = ?' : null,
    exceptSessionId ? 'id != ?' : null,
  ].filter(Boolean).join(' AND ');

  const params = [orgId];
  if (userId) params.push(userId);
  if (deviceId) params.push(deviceId);
  if (exceptSessionId) params.push(exceptSessionId);

  const ids = db.prepare(`SELECT id FROM sessions WHERE ${where}`).all(...params).map((r) => r.id);
  if (ids.length === 0) return [];

  const stmt = db.prepare(`UPDATE sessions SET state='ended', ended_at=?, end_reason=? WHERE id=?`);
  for (const id of ids) stmt.run(at, reason, id);
  return ids;
}

export function snapshotAuthority(db, { userId, orgId, deviceId }) {
  const role = db.prepare('SELECT role FROM memberships WHERE org_id=? AND user_id=?').get(orgId, userId)?.role ?? null;
  const at = nowIso();
  const grantIds = db.prepare(
    `SELECT g.id FROM grants g
      WHERE g.user_id = ? AND g.org_id = ? AND g.revoked_at IS NULL
        AND (g.starts_at IS NULL OR g.starts_at <= ?)
        AND (g.expires_at IS NULL OR g.expires_at > ?)
        AND (g.device_id IS NULL OR g.device_id = ?)`
  ).all(userId, orgId, at, at, deviceId).map((r) => r.id);

  return JSON.stringify({ role, grantIds, snapshotAt: at });
}

export function sessionExpiry(db, orgId) {
  const minutes = db.prepare('SELECT max_session_minutes AS m FROM organizations WHERE id = ?').get(orgId)?.m ?? 60;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export { newId, nowIso };
