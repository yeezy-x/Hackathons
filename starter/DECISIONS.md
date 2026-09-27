# DECISIONS

One section per decision that a reviewer might reasonably have made differently. Every section has
the same four parts, and the third and fourth are the ones we weigh most.

Rules, from `DISCOVERY-BRIEF.md`:

- cite something real in `Why` — a commit, a test, an error string, a file and line
- do not restate what a document says; describe what you did when the documents ran out
- six to twelve decisions is the expected range

---

### <the decision, as a claim — not "permissions", but "the org-level view counts device-scoped grants">

**What I chose:**
**Why:** _(evidence: test, log line, commit)_
**What I rejected:** _(the plausible alternative, and the specific reason it fails)_
**What would change my mind:**

<!-- Copy the block above per decision. The two stubs below show the required shape and contain no
     engineering content — replace or delete them. -->

---

### Stub — the shape of a weak "Why"

**What I chose:** the obvious thing.
**Why:** it is what the brief says to do.
**What I rejected:** nothing, the alternative seemed worse.
**What would change my mind:** I do not know.

_Reads as a memory of the document, not a model of the system. Scores nothing._

---

### Stub — the shape of a strong "Why"

**What I chose:** X.
**Why:** I implemented Y first, because Y is the intuitive precedence rule. `node scripts/check-
permissions.js` reported `<the actual reason string it reported>` on the case where the two grants
disagree. That is only reachable if the two are evaluated in a different order than Y assumes.
Moved to X in `<commit>` and the case passed. Logged in `BUILD-LOG.md` under Phase 2.
**What I rejected:** Y, and also "resolve the narrower one last" — both fail the same case for the
same reason.
**What would change my mind:** a case where a narrower grant is expected to survive a broader
refusal. I could not construct one, which is itself evidence for X.

_Shows what you believed, what disproved it, and what you did next._

---

## Where this repo argues with itself

The documents contradict each other, or contradict the schema, in at least one place. Name each
one you found. For each: quote both statements, say which you built against, and say why.

Building against the written rule and arguing in writing is a **full-marks** answer. Silently
working around it, or quietly picking one and saying nothing, scores zero on the section — we
cannot tell the difference between a decision and an oversight.

## Deliberately not built

What you chose not to build, and the reason. A scope cut with a stated reason is a senior
judgement. An unmentioned gap is a gap.

----

## Phase 0 — orientation
### Foreign keys must be ON at connection open, not assumed from schema load
**What I chose:** Enable `foreign_keys` when opening the DB connection before relying on constraint errors.
**Why:** README/check behaviour: validation could “pass” while enforcing nothing until pragma was set on open (`BUILD-LOG.md` Phase 0 / README foreign-key story).
**What I rejected:** Trusting “schema loaded” as proof constraints run.
**What would change my mind:** A suite that proves enforcement without per-connection pragma (none observed).
---
## Phase 1 — token verification (`server/auth.js`)
### Reject wrong algorithm before verify; compare signatures with length-safe `timingSafeEqual`
**What I chose:** Allow only `HS256`; compare HMAC with `timingSafeEqual` only when buffer lengths match.
**Why:** `node scripts/check-jwt.js`: valid-token cases wanted `401 UNAUTHENTICATED`; mismatched-length signatures crashed instead of clean 401 (`BUILD-LOG.md` 2026-09-26 Phase 1).
**What I rejected:** Calling `timingSafeEqual` on unequal lengths (throws → suite “crash”).
**What would change my mind:** Checker accepting other algs or unequal-length compare without 401.
---
### Treat `exp <= now` as expired (including the current second)
**What I chose:** Expiry when `exp` is less than or equal to current time.
**Why:** JWT suite failure modes for expired tokens.
**What I rejected:** Strict `<` only (would leave “expires this second” ambiguous vs spec).
**What would change my mind:** `check-jwt.js` case requiring `exp` still valid at `exp === now`.
---
## Phase 2 — caller context (`server/context.js`) + resolution (`server/permissions.js`)
### JWT payload uses `sub` and `org`, not `userId` / `orgId`
**What I chose:** Map `claims.sub` → user, `claims.org` → org for membership lookup and `ctx`.
**Why:** `issueAccessToken` encodes `sub`/`org` (`server/auth.js`); using `claims.userId` broke membership → false “not a member”
**What I rejected:** Renaming token fields in issue without matching verify.
**What would change my mind:** Tokens that encode different claim names and a green `check-jwt` + API using those names.
---
### `suspended` memberships authenticate but skip `assertFresh` until permission resolve
**What I chose:** After verify, if membership is `suspended`, do not call `assertFresh`; let `permissions.resolve` return 403 `suspended`.
**Why:** q1/reference pattern: suspension bumps version; stale check would 401 `TOKEN_STALE` instead of 403 `suspended`.
**What I rejected:** Treating all non-active statuses as 401 at authenticate.
**What would change my mind:** API tests requiring 401 for suspended callers before resolve.
---
### Explicit deny wins over allow with no device carve-out (D1)
**What I chose:** In `buildPermissions`, apply denies first; for each catalogue key, `denied` beats `allowed`.
**Why:** `node scripts/check-permissions.js` — `device-scoped ALLOW does NOT carve out org-wide DENY` (Sam / `device:terminal` on `dev_lab_win_01`). First model was “device allow overrides org deny locally”; test still `deny`
**What I rejected:** “More specific grant wins” or device allow after org deny on same permission/device.
**What would change my mind:** Shipped test expecting `allow` when org deny + device allow disagree on same permission.
---
### Single combiner `buildPermissions` for `resolve` and `resolveDevices`
**What I chose:** One function for deny/allow/baseline/wildcards; batch device list filters grants in memory.
**What I rejected:** Separate list vs check logic; per-device `resolve()` in a loop.
**What would change my mind:** Profiling where combiner cost dominates (would still keep one combiner, change loading only).
---
### Catalogue and role baseline loaded from DB at runtime
**What I chose:** `permissions` table + `role_permissions` for baseline; no hardcoded matrix.
**Why:** `scripts/check-personalisation.js` adds permissions/roles not in prose (`permissions.js` header).
**What I rejected:** PERMISSIONS.md table as JS constant.
**What would change my mind:** Grading only on fixed DB with no overlay (still risky given personalisation script).
---
### Grant windows: half-open; `expires_at == now` is inactive (D7)
**What I chose:** Active if `revoked_at IS NULL`, `starts_at <= at` (or null), `expires_at > at` (or null).
**Why:** `check-permissions.js` — `expired grant is inert`, `not-yet-started grant is inert`; inclusive end failed until `>` on expiry.
**What I rejected:** `expires_at === now` still active.
**What would change my mind:** Tests/schema requiring inclusive expiry end.
---
### HTTP denials use `forbidden()` so clients see `error.reason`
**What I chose:** `assertCan` / `assertMayGrant` / `assertCanStartSession` throw `forbidden(...)` from `http.js`.
**Why:** 33/35 with `got undefined want "missing_device_permission"`
**What I rejected:** Plain `Error` without `.reason`.
**What would change my mind:** Suite reading only `e.code`, not `e.reason`.
---
## Phase 3 — orgs, members, invites, audit
### Audit successful login and failed password when org context exists
**What I chose:** `routes/auth.js` calls `audit()` on good login and on bad password when user + active membership exist (`org_id` set on rows).
**Why:** Minimal audit before full API; matches need for attributable auth events (`BUILD-LOG.md` 2026-09-27).
**What I rejected:** Auditing only successes (loses denied login trail).
**What would change my mind:** Spec saying never log failed password attempts.
---
### Lifecycle helpers ported from reference (rank, last-owner, sessions snapshot)
**What I chose:** `lifecycle.js`: rank rules, last-owner guard, `endActiveSessions`, authority snapshot — routes call these instead of duplicating PERMISSIONS.md rules.
**What I rejected:** Inlining owner-count and session-end logic in every route file.
**What would change my mind:** None — duplication would be harder to keep consistent with D8/D9-style rules.
---
### Member role change bumps `perm_version` but does not end sessions
**What I chose:** `PATCH .../members/:userId` calls `bumpPermVersion` only; no `endActiveSessions`.
**Why:** `check-api.js` §7.1 — Sam demoted to viewer while control session on `dev_lab_win_01` stays `active` with `end_reason` null; new session blocked and stale token `TOKEN_STALE`.
**What I rejected:** Ending sessions on role change (would fail grandfathering test).
**What would change my mind:** Spec requiring immediate session termination on role change.
---
### Audit pagination rejects out-of-range query params (no clamping)
**What I chose:** `limit` must be integer 1–200; `offset` non-negative integer; `limit=0`, `limit=99999`, `offset=-1` → 400.
**Why:** `check-api.js` lines 188–191 — `offset=99999` returns 200 with empty slice, not an error.
**What I rejected:** Clamping `limit=99999` to 200 (would hide client bugs).
**What would change my mind:** API contract explicitly specifying clamp behaviour.
---
### Invite peek is org-name only; accept is atomic single-use
**What I chose:** Public GET returns `orgName` not `orgId`; accept claims row with `UPDATE ... WHERE accepted_at IS NULL`, 409 on reuse.
**Why:** `check-api.js` invites block — no `org_acme` or `lab-mac` in peek JSON; second accept → 409.
**What I rejected:** Returning org id on peek for “convenience” (leaks tenancy to unauthenticated holder).
**What would change my mind:** Product requirement for org branding that needs stable org id pre-login (would still avoid device lists).
---
## Phase 4 — devices and grants
### Device list excludes rows without `device:view`, does not redact
**What I chose:** After `resolveDevices`, skip devices where `permissions['device:view'].effect !== 'allow'`; list length shrinks (viewer sees 4 devices, not 5 with hidden fields).
**Why:** `check-api.js` §2 — `kiosk-lobby-01 is ABSENT (not redacted)` for Acme viewer.
**What I rejected:** Returning all devices with `name: null` or a `visible: false` flag (forbidden vs invisible semantics differ).
**What would change my mind:** Shipped test expecting redacted placeholders in the list.
---
### Unknown grant permissions: FK error mapped to 400, not a JS catalogue check only
**What I chose:** Insert `grant_permissions` inside a transaction; on SQLite `FOREIGNKEY` failure throw `badRequest(..., 'unknown_permission')`.
**Why:** `check-api.js` D19 — `device:teleport` → 400 with `reason unknown_permission`; README Phase 0 showed FK only fires with `foreign_keys=ON`.
**What I rejected:** Pre-validating only against a hardcoded permission list (breaks `check-personalisation.js` / DB-driven catalogue).
**What would change my mind:** Removing FK and requiring app-only validation with a test that adds patterns at runtime without migration.
---
### Grant validation order: 404 invisibility before `assertMayGrant`, FK after
**What I chose:** Unknown member or cross-org `deviceId` → 404; then `assertMayGrant`; then insert + FK for permission strings.
**Why:** PERMISSIONS.md §6 / q1 comment — do not turn cross-tenant probes into 403; D19 still needs FK for unknown pattern names.
**What I rejected:** Running `assertMayGrant` before membership lookup (would leak “not allowed to grant” for non-members).
**What would change my mind:** Explicit spec that non-member grant target returns 403.
---
### Device list rows include resolved permissions for the caller
**What I chose:** Each device in `GET /orgs/:org/devices` includes full `permissions` map from `resolveDevices` (batch, not N× `resolve`).
**Why:** Globex desk vs kiosk control effects in `check-api.js` §7.4; aligns with §8.2 “server is source of truth for UI state”.
**What I rejected:** List endpoint returning device metadata only with a second round-trip per row.
**What would change my mind:** Performance contract capping list payload size without permissions (none in brief).
---
## Phase 5 — sessions

### Session start checks `session:start` before mode permission
**What I chose:** `assertCanStartSession` in `permissions.js` orders checks so missing `session:start` vs missing `device:control` produce different `error.reason` values.
**Why:** `check-api.js` §9 — qa-android view → `missing_permission`; control on lab-mac → `missing_device_permission`.
**What I rejected:** Single combined “cannot start session” reason.
**What would change my mind:** Spec collapsing reasons for clients that ignore `reason`.
---
### Exclusive control via DB constraint, not application lock
**What I chose:** Rely on partial unique index on active control/terminal sessions; catch `SQLITE_CONSTRAINT` → 409 `DEVICE_BUSY`.
**Why:** `check-api.js` D10 — second control on same device 409; concurrent view 201.
**What I rejected:** `SELECT` then `INSERT` race in JS only.
**What would change my mind:** SQLite without the index (would add explicit transactional locking).
---
## Phase 6 — audit (read path + denial logging)

---
## Phase 7–8 — console and hardening
---

## Deliberately not built
- **Permission resolution cache** — grants expire per request (D7); no TTL in `permissions.js`.
- **`roles.rank` inside `can()`** — rank is for who may change whom (D8), not effective permissions.
- **`web/` console** — API core complete for `check-api.js`; UI phases remain.
- **Copy entire q1 tree** — q1 as reference; `starter/` built incrementally with scripts as gate.
- **Re-returning invite raw token** — by design one-time on create; no recovery endpoint.