# Implementation Plan: User Accounts and Dashboard

## Overview

Adds a real Express + TypeScript backend (SQLite behind a repository interface) that owns password hashing, session issuance and authorization, plus the client-side auth layer, login/register pages, a signed-in dashboard, and a per-user IndexedDB migration that adopts existing pre-auth courses.

Build order is bottom-up: server primitives before the service that uses them, the service before the HTTP layer, and the HTTP layer before the UI. The IndexedDB migration is independent of the server and can proceed in parallel.

## Tasks

- [x] 1. Scaffold the server workspace
  - [x] 1.1 Create the server package and toolchain
    - Add `server/` with its own `package.json`, `tsconfig.json` and `src/` directory
    - Install `express`, `cookie-parser`, `better-sqlite3`, `argon2`
    - Install dev deps: `tsx`, `supertest`, `@types/express`, `@types/cookie-parser`, `@types/supertest`
    - Add root scripts: `dev:server`, `dev:all` (client + server concurrently), `build:server`
    - _Requirements: 5.1_

  - [x] 1.2 Create the configuration module
    - Create `server/src/config.ts` exporting: Argon2id parameters, session TTLs (30d absolute, 7d idle), cookie names, body size limit, rate-limit windows and thresholds
    - Read port and environment from `process.env` with safe defaults
    - Bundle the common-password list as a `Set` loaded once at startup
    - _Requirements: 1.2, 2.4, 4.1, 4.3, 4.5, 5.6_

  - [x] 1.3 Create the database layer and schema
    - Create `server/src/db/index.ts` opening SQLite and applying migrations at boot
    - Create the `users`, `sessions` and `login_attempts` tables with the indexes from the design, including the case-insensitive unique email index
    - Expose a narrow query interface so route code never writes SQL directly
    - Support an in-memory database for tests
    - _Requirements: 1.6, 5.1_

- [x] 2. Implement server auth primitives
  - [x] 2.1 Implement password hashing
    - Create `server/src/auth/password.ts` with `hashPassword()` and `verifyPassword()` using Argon2id
    - Generate and export `DUMMY_ARGON2_HASH` produced with identical parameters, for timing equalisation
    - _Requirements: 1.7, 2.3, 4.5_

  - [x] 2.2 Implement email normalization and registration validation
    - Create `server/src/auth/validation.ts` with `normalizeEmail()` and `validateRegistration()`
    - Enforce email syntax and the 254-character limit; enforce the 12-character minimum and common-password rejection
    - Return a field-keyed error map naming each unmet rule
    - _Requirements: 1.2, 1.3, 1.5, 1.6, 1.8, 10.4_

  - [ ]* 2.3 Write property tests for normalization and validation
    - **Property 2: Email Normalization Is Idempotent and Collapsing**
    - **Property 5: Validation Accepts Exactly the Policy**
    - **Validates: Requirements 1.2, 1.3, 1.5, 1.6**

  - [x] 2.4 Implement UserRepository
    - Create `server/src/repositories/userRepository.ts` with `findByEmail()`, `findById()`, `create()`
    - Store email lowercased and trimmed; default display name to the email local part
    - _Requirements: 1.1, 1.5, 1.6_

  - [x] 2.5 Implement SessionStore
    - Create `server/src/auth/sessionStore.ts` with `issue()`, `verify()`, `touch()`, `revoke()`, `revokeAllForUser()`, `deleteExpired()`
    - Generate 32-byte random tokens; persist only their SHA-256 hash
    - Enforce both expiry bounds in `verify()`, deleting rows found expired
    - `touch()` extends only the idle window, never the absolute expiry
    - Accept an injectable clock so expiry is testable
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 3.1, 3.2_

  - [ ]* 2.6 Write property tests for the session lifecycle
    - **Property 6: Revoked Sessions Never Verify**
    - **Property 7: Expiry Bounds Are Respected**
    - **Property 8: Session Tokens Are Unguessable and Unique**
    - **Validates: Requirements 2.4, 2.5, 3.1, 3.2**

- [x] 3. Implement rate limiting
  - [x] 3.1 Implement RateLimiter
    - Create `server/src/auth/rateLimiter.ts` with `checkLogin()`, `checkRegistration()`, `recordFailure()`, `clearFor()`
    - Fixed windows backed by `login_attempts` so limits survive a restart
    - Enforce 10 logins per email and 30 per IP per 15 minutes; 5 registrations per IP per hour
    - Never persist the submitted password; return `retryAfterSeconds` when denying
    - Add a periodic prune of rows older than the longest window
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 3.2 Write property tests for rate limiting
    - **Property 11: Rate Limiting Is Monotonic and Bounded**
    - **Property 12: Failed Attempts Never Record Secrets**
    - **Validates: Requirements 4.1, 4.2, 4.4**

- [x] 4. Implement AuthService
  - [x] 4.1 Implement registration
    - Create `server/src/auth/authService.ts` with `register()`
    - Order: rate limit check, validation, existing-email lookup, hash, insert, issue session
    - On an already-registered email, hash anyway and return the same success-shaped response without creating an account
    - _Requirements: 1.1, 1.3, 1.4, 1.7, 1.8, 4.3_

  - [x] 4.2 Implement login
    - Add `login()` verifying against `DUMMY_ARGON2_HASH` when the email is unknown, so timing does not disclose existence
    - Return one identical message for unknown email and wrong password
    - Revoke prior sessions then issue a fresh one (rotation); clear the rate-limit counter on success
    - _Requirements: 2.1, 2.2, 2.3, 2.7, 4.1, 4.2_

  - [x] 4.3 Implement logout and current-user lookup
    - Add `logout()` deleting the session server-side, succeeding even with no valid session
    - Add `currentUser()` returning the public user for a valid session, else null
    - _Requirements: 3.1, 3.2, 3.4_

  - [ ]* 4.4 Write property tests for AuthService guarantees
    - **Property 1: Passwords Are Never Recoverable**
    - **Property 3: Registration Responses Are Indistinguishable**
    - **Property 4: Login Failure Messages Are Uniform**
    - **Property 9: Login Rotates the Session**
    - **Property 10: Logout Is Idempotent**
    - **Validates: Requirements 1.4, 1.7, 2.2, 2.3, 2.7, 3.4**

- [x] 5. Build the HTTP layer
  - [x] 5.1 Implement middleware
    - Create `server/src/middleware/requireAuth.ts` verifying the session cookie, attaching `req.user`, clearing the cookie and returning 401 on failure
    - Create `server/src/middleware/csrf.ts` issuing a readable CSRF cookie and requiring a matching `X-CSRF-Token` on state-changing requests
    - Apply a 100KB body limit and `httpOnly`/`SameSite=Lax`/`Secure` cookie construction
    - _Requirements: 2.5, 2.6, 5.1, 5.2, 5.4, 5.5, 5.6, 9.1_

  - [x] 5.2 Implement auth routes and the error handler
    - Create `server/src/routes/auth.ts` with `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/csrf`
    - Map errors to the uniform response shape: 400 with `fieldErrors`, 401, 404, 429 with `Retry-After`, 413, 500 generic
    - Log server-side detail; never return stack traces or database messages
    - Create `server/src/app.ts` and `server/src/index.ts`, serving the client build in production
    - _Requirements: 1.8, 2.2, 4.2, 5.2, 5.3, 5.6, 10.3, 10.4, 10.5_

  - [ ]* 5.3 Write integration tests for the HTTP layer
    - Register → `/me` → logout → `/me` returns 401
    - Cross-user resource access returns 404, not 403
    - Missing CSRF token is rejected on state-changing requests
    - 11th login attempt in a window returns 429 with `Retry-After`
    - **Property 16: Protected Endpoints Reject Anonymous Requests**
    - **Property 17: Session Cookies Are Always Non-Readable**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Migrate IndexedDB to per-user ownership
  - [x] 7.1 Add the version 2 schema upgrade
    - Bump `clip2course-db` to version 2 in `src/services/courseStore.ts`
    - Add a nullable `userId` field plus a `userId` index on both `courses` and `progress`
    - The upgrade must only add fields and indexes, never delete or rewrite course content
    - _Requirements: 8.1, 8.7_

  - [x] 7.2 Scope all course reads and writes by user
    - Thread the owning user id through `saveCourse`, `getCourse`, `listCourses`, `deleteCourse`, `updateProgress`
    - `getCourse` returns null for a course owned by another user, identical to not-found
    - `listCourses` returns only the signed-in user's courses
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_

  - [x] 7.3 Implement claiming of pre-auth data
    - Add `claimUnownedData(userId)` adopting records whose `userId` is null, in a single transaction across both stores
    - Never modify records already owned by another user
    - Call it once after the first successful sign-in
    - _Requirements: 8.5, 8.7_

  - [ ]* 7.4 Write property tests for ownership isolation and migration safety
    - **Property 13: Course Reads Are Owner-Isolated**
    - **Property 14: Claiming Preserves All Course Data**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.5, 8.7**

  - [ ]* 7.5 Write migration tests with fake-indexeddb
    - Seed a version 1 database, upgrade, assert every course id and all content survive
    - A second user claims nothing already owned
    - A failed transaction leaves the store untouched
    - _Requirements: 8.5, 8.7_

- [x] 8. Build the client auth layer
  - [x] 8.1 Implement apiClient
    - Create `src/services/apiClient.ts` with `get()` and `post()`, always sending `credentials: 'include'`
    - Attach `X-CSRF-Token` from the readable cookie on state-changing calls
    - Produce a typed `ApiError` carrying `status`, `fieldErrors`, `retryAfterSeconds` and `isNetworkError`
    - Distinguish a network failure from a 401 so an outage does not sign the user out
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 8.2 Implement AuthContext and useAuth
    - Create `src/context/AuthContext.tsx` exposing `status`, `user`, `login`, `register`, `logout`
    - Restore the session on mount via `GET /api/auth/me`, holding `'checking'` until it resolves
    - Never persist the password to any client store; clear the cached user on logout or a 401
    - Call `claimUnownedData` after the first successful sign-in
    - _Requirements: 3.3, 6.8, 8.5, 9.2, 9.3_

  - [x] 8.3 Implement ProtectedRoute
    - Create `src/components/ProtectedRoute.tsx` rendering a loading state while `checking`
    - Redirect anonymous visitors to `/login`, preserving the attempted path in location state
    - _Requirements: 6.2, 6.7_

  - [ ]* 8.4 Write tests for the client auth layer
    - `ProtectedRoute` shows a spinner while checking, redirects when anonymous, renders children when authenticated
    - `apiClient` classifies 401 vs 429 vs network failure vs field errors correctly
    - A network failure does not clear the signed-in user
    - _Requirements: 6.7, 6.8, 10.1, 10.2_

- [x] 9. Build the auth and dashboard UI
  - [x] 9.1 Implement the login page
    - Create `src/pages/Login.tsx` with email and password fields
    - Use `autocomplete="current-password"`; disable submit while in flight
    - Render server errors as plain text against the right field; show wait time on 429
    - Redirect to the originally attempted path on success, else the dashboard
    - _Requirements: 6.1, 6.3, 9.4, 9.5, 9.6, 10.1, 10.3, 10.4_

  - [x] 9.2 Implement the registration page
    - Create `src/pages/Register.tsx` with email, password and optional display name
    - Use `autocomplete="new-password"`; show the password policy inline and validate before submit
    - Disable submit while in flight to prevent duplicate accounts from a double click
    - _Requirements: 1.2, 1.3, 6.1, 9.4, 9.5, 9.6_

  - [x] 9.3 Implement the dashboard stats calculation
    - Create `src/services/dashboardStats.ts` with `computeDashboardStats()`
    - Return zeros for an empty library; guard the average against division by zero
    - Select the most recently accessed incomplete course as the continue target
    - _Requirements: 7.2, 7.3, 7.6_

  - [ ]* 9.4 Write a property test for dashboard stats
    - **Property 15: Dashboard Stats Are Finite and Consistent**
    - **Validates: Requirements 7.2, 7.6**

  - [x] 9.5 Implement the UserDashboard page
    - Create `src/pages/UserDashboard.tsx` at `/app/dashboard`
    - Show display name and email, the four aggregate stats, and a continue-learning card
    - List the user's courses ordered by last accessed descending
    - Show an empty state with a link to `/app/create` when there are no courses
    - Provide navigation to create, view all courses, and log out
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7_

  - [x] 9.6 Add authenticated navigation
    - Show the signed-in display name and a logout control in the app navigation
    - Update the landing page and navbar links to point at `/app/dashboard` when signed in
    - _Requirements: 7.8, 3.3_

- [x] 10. Wire everything together
  - [x] 10.1 Add routing and the dev proxy
    - Add `/login`, `/register` and `/app/dashboard` routes; wrap the `/app/*` routes in `ProtectedRoute`
    - Keep `/` reachable without authentication
    - Wrap the app in `AuthProvider`
    - Add a Vite proxy for `/api/auth` to the Express port, without disturbing the existing video/caption proxy routes
    - _Requirements: 6.1, 6.4, 6.5, 6.6_

  - [x] 10.2 Connect course pages to the signed-in user
    - Pass the signed-in user id from `AuthContext` into every `courseStore` call in CreateCourse, CourseViewer and the courses list
    - Verify that logging out and signing in as another user shows none of the previous user's courses
    - _Requirements: 8.2, 8.3, 8.4, 8.6_

  - [ ]* 10.3 Write end-to-end integration tests
    - Register, create a course, log out, register a second user, confirm the first user's course is not visible
    - Sign back in as the first user and confirm the course reappears
    - Confirm a signed-in user can still read cached courses while the server is unreachable
    - _Requirements: 8.2, 8.4, 10.6_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked `*` are optional test tasks and can be skipped for a faster first pass
- Property tests reference the 17 correctness properties in `design.md`
- The IndexedDB migration (task 7) has no dependency on the server and can run alongside tasks 2-5
- Argon2id timing (Requirement 4.5) is verified by a one-off benchmark rather than a CI assertion, since it is hardware-dependent
- The existing video/caption proxy routes stay in `vite.config.ts` for now; moving them to this backend is tracked separately
- Test stack is unchanged: Vitest + fast-check + MSW, plus `supertest` for the server and `fake-indexeddb` for migration tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "7.1"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.4", "2.5", "3.1", "7.2"] },
    { "id": 3, "tasks": ["2.3", "2.6", "3.2", "4.1", "7.3", "8.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "7.4", "7.5", "8.2"] },
    { "id": 5, "tasks": ["4.4", "5.1", "8.3", "9.3"] },
    { "id": 6, "tasks": ["5.2", "8.4", "9.4"] },
    { "id": 7, "tasks": ["5.3", "9.1", "9.2", "9.5"] },
    { "id": 8, "tasks": ["6. Checkpoint - Ensure all tests pass", "9.6"] },
    { "id": 9, "tasks": ["10.1"] },
    { "id": 10, "tasks": ["10.2"] },
    { "id": 11, "tasks": ["10.3"] },
    { "id": 12, "tasks": ["11. Final checkpoint - Ensure all tests pass"] }
  ]
}
```
