// Per-request context: turn a bearer token into an authenticated caller.
//
// YOURS TO WRITE. This file ships as a stub so the server boots and every
// authenticated request fails loudly instead of appearing to work.
//
// What it has to do (BRIEF.md §3, PERMISSIONS.md §6):
//   - read the bearer token, verify it with verifyAccessToken() from ./auth.js
//   - look the membership up and refuse a token whose org or membership is gone
//   - THE TOKEN'S org CLAIM IS THE ONLY ORG THE CALLER MAY ADDRESS. A request that
//     names a different org is INVISIBLE — 404, never 403. Isolation is structural:
//     the caller cannot name another org, rather than being filtered afterwards.
//   - check freshness against memberships.perm_version (AUTH-DATA-MODEL.md §3), so a
//     role or grant change takes effect on the NEXT request, not at token expiry
//   - throw through the one error path in ./http.js
//
// authenticate(db, secret) returns (req, params) => caller, where caller carries at
// least { userId, orgId, role, membership, claims }.

import {unauthenticated} from './http.js'
import {assertFresh, verifyAccessToken} from './auth.js'
import {notFound} from './http.js'
const todo = () =>
  Object.assign(
    new Error('TODO: server/context.js — authenticate() is yours to write (BRIEF.md §3).'),
    { code: 'NOT_IMPLEMENTED' }
  );

export function membershipOf(db,orgId,userId){
  return db.prepare(`SELECT m.*, o.deleted_at AS org_deleted_at
  FROM memberships m
  JOIN organizations o ON o.id = m.org_id
 WHERE m.org_id = ? AND m.user_id = ?`).get(orgId,userId);
}

export function authenticate(db, secret) {
  return function buildContext(req, params) {
    const header = req.headers.authorization ?? '';
    const raw = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!raw) throw unauthenticated('missing bearer token');
    const payload = verifyAccessToken(raw, secret);
    const orgId=payload.orgId;
    const userId=payload.userId;
    const membership=membershipOf(db,orgId,userId);
    if(!membership) throw unauthenticated('not a member');
    if(membership.org_deleted_at) throw notFound();
    if(membership.status === 'removed') throw unauthenticated('membership removed');
    if(membership.status!=='active') throw unauthenticated('inactive membership');
    if (membership.status !== 'suspended') assertFresh(payload, membership);
    if(params.org && params.org !== payload.org) throw notFound();
    return {userId,orgId,role:membership.role,membership,claims:payload};
  };
}
