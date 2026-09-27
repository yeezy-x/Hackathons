# BUILD-LOG

Append to this as you go. Commit it with the code it describes — the timestamps are part of the
evidence, and a log that arrives in one commit at the end reads as what it is.

Five lines is a real entry. Short and dated is better than long and reconstructed.

The categories we look for are listed in `DISCOVERY-BRIEF.md`. The example below shows the
*shape* of a good entry; it is a recreation of something already printed in `README.md`, so it
gives nothing away.

---

<!-- EXAMPLE — delete this block, keep the shape.

## 2026-03-04 · Phase 0 — orientation

Expected the unknown-permission test to fail on my validation code.
Observed: it passed, with foreign_keys ON, and *also* passed with the pragma removed — so the
check was never running, and the "pass" was the schema loading fine while enforcing nothing.
Changed: moved `foreign_keys = ON` to connection open and re-ran; now it raises
`FOREIGN KEY constraint failed` as the README said it would.
Note: this is the failure mode where a passing test is worse than a failing one.

-->

## Phase 0 — orientation

_Installed, reset the database, read the documents, ran the suites against the untouched skeleton.
What did the starting line actually look like, and which failure surprised you?_

## 2026-09-26
Installation done, database reset done , read the documents, ran the server it says to move further we have to implement the folllowing in this order

server/auth.js -> server/context.js -> server/permissions.js

run : node scripts/check-jwt.js
FAIL have to implement verfiyAccessToken()

## Phase 1 — token verification

_What did you expect each failure mode to look like before you ran it? Which one behaved
differently from your expectation, and what did that tell you?_

## 2026-09-26 Phase 1 - Token Verification
So after running it , I got 43 fails. It fails on every valid token cases . It wants Http Error:401 Unauthenticated
Changed: implemented the function . Reject 'alg' other than HS256 before checking the signature. Compare the signature with `timingSafeEqual` only after the lengths match — a truncated signature makes that function throw, which the suite reports as a crash rather than `401 UNAUTHENTICATED`. Treat `exp <= now` as expired, including the exact current second.

## Phase 2 — caller context and the resolution engine

_This is where most people's first model is wrong. Write down the model you started with, the
observation that broke it, and the model you moved to. Be specific about the observation._

## 2026-09-26 · Phase 2 — permissions.js (first pass)

Ran `node scripts/check-permissions.js` after stub: everything threw `NOT_IMPLEMENTED`.
Implemented `resolve` by reading `role_permissions` + `grants`.
Model I used first: collect allows, then denies override only on the same device.
Predicted: org-wide deny `device:terminal` + device-scoped allow on `lab-win-01` would allow
terminal on that one machine.
Observed: test `device-scoped ALLOW does NOT carve out org-wide DENY` failed — still `deny`.

Changed: D1 means evaluate **deny grants first** and never let a device allow undo an org deny;
`buildPermissions` checks `denied.has(key)` before `allowed.has(key)` when emitting the catalogue.

Re-ran: discriminating case + Sam terminal cases passed.

## 2026-09-26 · Phase 2 — org-level vs device-level grants

Observation: viewer `session:start` on `lab-mac-01` only (seed grant) — org-level behaviour wasn't the failing test, but device-scoped allow on one row required `collectGrants` with `deviceId === null` to return **all** grants (no `device_id` filter), and per-device resolve to filter
`(device_id IS NULL OR device_id = ?)`.
`resolveDevices` loads all grants once, filters per row in memory — avoids N+1 from calling
`resolve()` per device (README warning).

## 2026-09-26 · Phase 2 — context.js (caller, not permissions)

Read `WORKFLOW.md`: Phase 2 is not only `check-permissions.js` — authenticated requests need
`authenticate()` in `server/context.js`.

Implemented: Bearer extract, `verifyAccessToken`, membership join with `org_deleted_at`, path
`params.org` vs token org → `notFound()`, return `{ userId, orgId, role, membership, claims }`.

Wrong assumption: JWT payload fields are `userId` / `orgId` because `issueAccessToken` takes those names in its argument object.
Observed: tokens encode `sub` and `org` (`server/auth.js` `issueAccessToken`). Lookup used undefined keys → "not a member" / broken caller before any route ran.
Changed: use `claims.sub` and `claims.org` for DB lookup and `ctx` fields.

Second mistake: treated every non-`active` status as 401 before `assertFresh`.
Observed: q1 `context.js` skips `assertFresh` only for `suspended` so API can return 403
`suspended` from `permissions.resolve`, not 401 `TOKEN_STALE` after a suspension bump.
Changed plan: allow `suspended` through authenticate; call `assertFresh` only when
`status !== 'suspended'` (`AUTH-DATA-MODEL.md` / q1 comment).


## Phase 3 — orgs, members, invites

_Anything you had to work out that no document states. Invite lifecycle states are a common
source of this._

## 2026-09-27 · Phase 3 — audit + auth routes (prerequisite)
Implemented `audit()` and `auditDenials()`. `routes/auth.js` logs successful login and failed
password when the user has an active membership (`org_id` on the row). `auditDenials` wraps
permission-gated handlers: `FORBIDDEN` → one `deny` row with `reason_code` from `err.reason`,
then rethrow. Allows inside the wrapper are not double-logged.

## 2026-09-27 · Phase 3a — lifecycle.js
Ported `roleRanks`, `assertRoleExists`, `assertCanModify`, `assertNotLastOwner`,
`endActiveSessions`, `snapshotAuthority`, `sessionExpiry` from q1 reference. Used only for
**modification authority** and tenancy cascades — never inside `can()` / `resolve()`.

## 2026-09-27 · Phase 3b — routes/orgs.js
Org CRUD, members (list / PATCH role / suspend / remove / `DELETE .../members/me`), effective
permissions (`resolve` with optional `deviceId`), audit list with strict pagination (400 outside
1–200 limit or negative offset — not clamped). Route order: `/members/me` before
`/members/:userId`. Role PATCH bumps `perm_version` but does **not** call `endActiveSessions`
(grandfathering §7.1). Suspend/remove do end sessions (`user_suspended`, `membership_removed`).

## 2026-09-27 · Phase 3c — routes/invites.js
Authenticated create/list/revoke; public `GET /invites/:token` and `POST .../accept`. Raw token
returned once; DB stores `hashInviteToken(raw)` only. Peek body: `email`, `role`, `orgName`,
`expiresAt` — no `org_id`, no device names. Accept uses `UPDATE ... WHERE accepted_at IS NULL`
for single-use (409 on reuse). Existing platform user by email gets membership attached, not a
second user row. Surprise: inviting an email that already has a user row pre-creates
`memberships.status='invited'` so the people list has one source of truth before accept.

## 2026-09-27 · Phase 3 wiring — routes/index.js
Registration order: auth → orgs → invites → devices → sessions. Order matters only where paths
could overlap; invites are under `/orgs/:org/invites` and public `/invites/:token`.

## Phase 4 — devices and grants

_What happens at the boundary where two grants disagree, or where a grant's scope and the
question's scope differ? Say what you predicted and what you got._

## 2026-09-27 · Phase 4 — routes/devices.js (devices + grants)
`GET /orgs/:org/devices`: `device:list` on the endpoint; per row `resolveDevices` then **omit**
the row if `device:view` is not `allow` (kiosk absent for Acme viewer — not redacted). Each
included row ships full `permissions` for the caller on that device (UI reads `data-state` from
API, §8.2). Grant POST: validate member/device existence (404 invisible), then `assertMayGrant`
(D9), then insert; FK on `grant_permissions` → catch `FOREIGNKEY` → 400 `unknown_permission`
(D19). Empty `permissions` array → 400 before DB. Self-grant → 403 `FORBIDDEN`. Revoke bumps
`perm_version` only — no session kill (grandfathering).

## 2026-09-27 · check-api.js (end-to-end)
`node scripts/check-api.js` — **66/66 ALL PASS** after devices + invites + orgs. Sessions
(`routes/sessions.js`) were required by the same script (§9 compound check, D10 busy, §7.1–7.2);
implemented in the same pass so the public suite stays green.

## Phase 5 — sessions

_Two permissions, one device. What did you have to resolve, and in what order, to keep the two
failure reasons distinguishable?_

## 2026-09-27 · Phase 5 — routes/sessions.js (with check-api)
`assertCanStartSession` already in `permissions.js`: check `session:start` first, then mode
permission — so `missing_permission` vs `missing_device_permission` stay distinct (§9).
Exclusive control/terminal enforced by partial unique index → 409 `DEVICE_BUSY`; view sessions
are concurrent. `snapshotAuthority` stored on INSERT for grandfathered authority. Lazy
`sweepExpired` before reads.

## Phase 6 — audit

_What did you decide counts as an auditable event, and what pushed you to that line?_

## Phase 7 — the console

_Where did the server's answer and your instinct disagree about what should be on screen?_

## Phase 8 — hardening

_What did you measure, what did you fix, and what did you deliberately leave alone? Anything you
chose not to build belongs here with its reason._

## Open threads

_Things you know are wrong, unfinished, or that you would do differently with another day. Listing
these honestly is worth more than pretending they do not exist — we will find them anyway._
