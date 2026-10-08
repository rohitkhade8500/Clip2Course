# Requirements Document

## Introduction

Clip2Course currently runs entirely in the browser with no accounts: every course lives in one shared IndexedDB database, and anyone using the browser sees everything. This feature adds real user accounts backed by our own server — registration, login, sessions, logout — plus a signed-in dashboard where a user sees their own courses and learning stats.

Because we are running our own backend, authentication is genuine: passwords are hashed server-side, sessions are issued and revocable by the server, and protected data is enforced on the server rather than hidden in the UI. This is the deliberate difference from a local-profile approach, where anyone with DevTools could bypass the login screen.

## Scope Decisions

These choices shape the requirements below. Flag any you want changed.

- **Stack**: Node + Express + TypeScript, colocated in this repo as a `server/` workspace.
- **Database**: SQLite via file storage for development, accessed through a thin data layer so Postgres can replace it without touching route code.
- **Session transport**: opaque session token in an `httpOnly`, `SameSite=Lax`, `Secure` cookie. Not a JWT in `localStorage`, which is readable by any injected script.
- **Password hashing**: Argon2id, with bcrypt as the fallback if the native module is unavailable.
- **Course data stays in IndexedDB** for this feature, scoped per user. Cross-device sync is a non-goal here (see Out of Scope) but the schema is designed not to block it.

## Out of Scope

- Syncing course content between devices or browsers
- Social/OAuth sign-in (Google, GitHub)
- Password reset via email, and email verification
- Teams, sharing, or role-based permissions
- Moving the existing video/caption proxy routes to this backend (a natural follow-up, tracked separately)

## Glossary

- **AuthService**: Server component owning registration, login, logout and session verification
- **SessionStore**: Server-side record of issued sessions, allowing revocation
- **AuthContext**: Client React context exposing the current user and auth actions
- **ProtectedRoute**: Client route wrapper that redirects unauthenticated visitors to login
- **UserDashboard**: Signed-in landing page showing the user's courses and learning stats
- **User**: An account identified by a unique email address
- **Session**: A server-issued, expiring credential identifying a signed-in user
- **CourseOwnership**: The association between a stored course and the user who created it

## Requirements

### Requirement 1: Account Registration

**User Story:** As a new user, I want to create an account with my email and a password, so that my courses are private to me.

#### Acceptance Criteria

1. WHEN a visitor submits the registration form with an email not already registered and a password meeting the strength policy, THE AuthService SHALL create a User record, issue a Session, and return the signed-in user's id, email and display name
2. THE AuthService SHALL enforce a password policy of at least 12 characters, and SHALL reject passwords appearing in the bundled list of the 10,000 most common passwords
3. IF a visitor submits a password shorter than 12 characters or on the common-password list, THEN THE AuthService SHALL reject the request with a message naming the unmet rule, and SHALL NOT create a User record
4. IF a visitor submits an email address that is already registered, THEN THE AuthService SHALL return the same generic success-shaped response used for new registrations without creating a duplicate account, so that the response cannot be used to discover which emails exist
5. WHEN validating an email address, THE AuthService SHALL require a syntactically valid address of at most 254 characters, and SHALL store it lowercased and trimmed
6. THE AuthService SHALL treat email addresses as case-insensitive for uniqueness and login
7. WHEN a User record is created, THE AuthService SHALL store only a hash of the password and SHALL NOT store, log, or return the plaintext password
8. IF the registration request omits a required field, THEN THE AuthService SHALL respond with HTTP 400 and identify every missing field

### Requirement 2: Login and Session Issuance

**User Story:** As a returning user, I want to sign in, so that I can reach my own courses.

#### Acceptance Criteria

1. WHEN a user submits credentials matching a stored account, THE AuthService SHALL issue a new Session and set it in an `httpOnly`, `SameSite=Lax` cookie
2. IF the submitted email is unknown OR the password does not match, THEN THE AuthService SHALL respond with HTTP 401 and the single message "Email or password is incorrect", using the same message for both cases so neither can be distinguished
3. WHEN verifying a login attempt for an unknown email, THE AuthService SHALL still perform a password hash comparison against a dummy hash, so response timing does not reveal whether the email exists
4. THE AuthService SHALL create Sessions with an absolute expiry of 30 days and an inactivity expiry of 7 days
5. WHEN a request arrives with a valid, unexpired Session, THE AuthService SHALL extend the inactivity window without changing the absolute expiry
6. IF a request arrives with a Session that is expired, revoked, or unknown, THEN THE AuthService SHALL treat the request as unauthenticated and clear the session cookie
7. WHEN a user signs in successfully, THE AuthService SHALL rotate the session identifier, so that a token captured before login cannot be reused afterwards

### Requirement 3: Logout and Session Revocation

**User Story:** As a signed-in user, I want to log out, so that the next person using this browser cannot reach my courses.

#### Acceptance Criteria

1. WHEN a signed-in user logs out, THE AuthService SHALL delete the Session server-side and instruct the browser to clear the session cookie
2. WHEN a Session has been revoked, THE AuthService SHALL reject any subsequent request presenting it, even if the cookie is still held by the client
3. WHEN a user logs out, THE AuthContext SHALL clear the cached user from client memory and redirect to the landing page
4. THE AuthService SHALL respond successfully to a logout request that carries no valid Session, so that logging out is idempotent

### Requirement 4: Brute-force and Abuse Protection

**User Story:** As a user, I want my account protected from password guessing, so that a weak moment isn't exploitable at scale.

#### Acceptance Criteria

1. THE AuthService SHALL limit login attempts to 10 per email address per 15-minute window, and 30 per client IP address per 15-minute window
2. IF a rate limit is exceeded, THEN THE AuthService SHALL respond with HTTP 429 and a `Retry-After` header, and SHALL NOT reveal whether the attempted credentials were valid
3. THE AuthService SHALL limit registration to 5 accounts per client IP address per hour
4. WHEN a login attempt fails, THE AuthService SHALL record the attempt with a timestamp and the target email, and SHALL NOT record the submitted password
5. THE AuthService SHALL apply a password hashing cost that takes at least 100ms on the target hardware, so offline cracking of a leaked database is expensive

### Requirement 5: Server-Side Authorization

**User Story:** As a user, I want my data protected by the server, so that hiding a button in the UI isn't the only thing standing between my data and someone else.

#### Acceptance Criteria

1. THE AuthService SHALL verify the Session on every request to a protected endpoint, and SHALL NOT rely on any client-supplied user identifier
2. IF an unauthenticated request reaches a protected endpoint, THEN THE AuthService SHALL respond with HTTP 401 and no resource data
3. IF an authenticated user requests a resource belonging to a different user, THEN THE AuthService SHALL respond with HTTP 404, so that resource existence is not disclosed
4. THE AuthService SHALL require a matching CSRF token on every state-changing request that relies on cookie authentication
5. THE AuthService SHALL set `Secure` on session cookies whenever served over HTTPS
6. THE AuthService SHALL reject request bodies larger than 100KB on auth endpoints

### Requirement 6: Client Route Protection

**User Story:** As a user, I want the app to send me to login when I'm not signed in, so that navigation is predictable.

#### Acceptance Criteria

1. THE Application SHALL provide a login page at `/login` and a registration page at `/register`
2. WHEN an unauthenticated visitor navigates to a protected path, THE ProtectedRoute SHALL redirect to `/login` and preserve the attempted path
3. WHEN a user signs in after being redirected, THE Application SHALL navigate to the originally attempted path, or to the dashboard when there was none
4. WHEN an already-authenticated user navigates to `/login` or `/register`, THE Application SHALL redirect to the dashboard
5. THE Application SHALL treat `/app/create`, `/app/courses`, `/app/course/:id` and `/app/dashboard` as protected paths
6. THE Application SHALL keep the landing page at `/` reachable without authentication
7. WHILE the initial session check is in flight, THE ProtectedRoute SHALL render a loading state rather than briefly showing the login page to a signed-in user
8. IF a request fails with HTTP 401 during normal use, THEN THE AuthContext SHALL clear the cached user and redirect to `/login`

### Requirement 7: User Dashboard

**User Story:** As a signed-in user, I want a dashboard showing my courses and progress, so that I can pick up where I left off.

#### Acceptance Criteria

1. THE Application SHALL provide a dashboard at `/app/dashboard` showing the signed-in user's display name and email
2. WHEN the dashboard loads, THE UserDashboard SHALL display aggregate stats: total courses, courses completed, total questions answered, and average quiz score
3. WHEN the user has at least one course, THE UserDashboard SHALL show a continue-learning entry for the most recently accessed incomplete course, linking to that course
4. WHEN the user has no courses, THE UserDashboard SHALL show an empty state explaining how to create one, with a link to `/app/create`
5. THE UserDashboard SHALL list the user's courses ordered by last accessed descending, showing title, completion count and creation date
6. WHEN a stat cannot be computed because no courses exist, THE UserDashboard SHALL display zero rather than an error or a blank value
7. THE UserDashboard SHALL provide navigation to create a course, view all courses, and log out
8. THE Application SHALL display the signed-in user's display name in the app navigation while a Session is active

### Requirement 8: Per-User Course Scoping

**User Story:** As a user sharing a computer, I want to see only my own courses, so that another person's courses don't appear in my dashboard.

#### Acceptance Criteria

1. WHEN a course is saved while a user is signed in, THE CourseStore SHALL record the owning user's id on the stored course
2. WHEN listing courses, THE CourseStore SHALL return only courses owned by the currently signed-in user
3. WHEN retrieving a course by id that belongs to a different user, THE CourseStore SHALL return null, exactly as it does for a course that does not exist
4. WHEN a user logs out and a different user signs in, THE Application SHALL show no courses or progress belonging to the previous user
5. WHEN the first user signs in on a browser holding courses created before this feature existed, THE CourseStore SHALL assign those unowned courses to that user, so existing work is not orphaned
6. WHEN progress is recorded, THE CourseStore SHALL scope it to the owning user, so two users tracking the same video keep independent progress
7. IF the IndexedDB schema upgrade required for ownership fails, THEN THE CourseStore SHALL surface an error and SHALL NOT delete or overwrite existing course records

### Requirement 9: Credential Handling in the Client

**User Story:** As a user, I want the app to handle my password carefully in the browser, so that it isn't leaked by accident.

#### Acceptance Criteria

1. THE Application SHALL submit credentials only over HTTPS in production builds
2. THE Application SHALL NOT persist the password to `localStorage`, `sessionStorage`, IndexedDB, or any client-side store
3. THE Application SHALL NOT include the password in any log, analytics event, or error report
4. THE Application SHALL render server-supplied error messages as plain text, so a crafted message cannot inject markup
5. THE Application SHALL mark password fields with the appropriate `autocomplete` attributes (`new-password` when registering, `current-password` when signing in), so password managers behave correctly
6. WHEN a form is submitted, THE Application SHALL disable the submit control until the response arrives, preventing duplicate account creation from a double click

### Requirement 10: Error Handling and Availability

**User Story:** As a user, I want clear feedback when something goes wrong, so that I know whether to retry.

#### Acceptance Criteria

1. IF the backend is unreachable when a user submits the login or registration form, THEN THE Application SHALL display a message distinguishing a connection problem from rejected credentials, and SHALL offer a retry
2. IF a request to a protected endpoint fails due to a network error rather than a 401, THEN THE Application SHALL keep the user signed in and report the failure as temporary
3. WHEN the backend returns HTTP 429, THE Application SHALL display how long the user must wait, derived from the `Retry-After` header
4. WHEN a validation error is returned, THE Application SHALL show the message against the specific field that failed
5. IF an unexpected server error occurs, THEN THE AuthService SHALL log the detail server-side and return a generic message, without exposing a stack trace or database detail to the client
6. WHILE offline, THE Application SHALL allow a signed-in user to keep using already-loaded courses stored in IndexedDB
