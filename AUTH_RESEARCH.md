# Authentication options for Marga Run Club

**Checked:** 2026-09-27
**Scope:** Google sign-in and future account-based access for the existing Marga Run Club application.
**Sources:** Official product documentation and pricing pages only.

## Executive recommendation

Use **Better Auth with PostgreSQL on the existing Neon database** as the default direction for public launch.

It is the best architectural fit because it is a framework-agnostic TypeScript authentication library, has an official PostgreSQL adapter, supports Google OAuth, exposes a Node/Express integration, and stores users, linked accounts, sessions, and verification data in the application-selected database. That matches the existing plain React/Vite frontend, Node HTTP API, Vercel function entrypoint, and the already-planned `app_users`, `auth_accounts`, and `auth_sessions` tables. Better Auth does require the project to own the authentication UI, migrations, secrets, security updates, and operational support; it is a library rather than a hosted auth dashboard. [B1–B6]

Choose **Clerk** instead if the priority is the fastest polished sign-in/profile experience and a hosted user-management dashboard. Choose **Supabase Auth** if accepting a second managed backend/auth user store is worthwhile for its generous free tier and ready-made auth primitives. Choose **Firebase Authentication** when the team already prefers the Firebase console/SDK ecosystem. Do not start a new standalone implementation around **Auth.js/NextAuth**: the official Auth.js project now says it is part of Better Auth and recommends Better Auth for new projects except for specific gaps such as database-free stateless sessions. [A1]

This is a recommendation for the current architecture, not an implementation. No application code or database schema has been changed by this research.

## Current application constraints

The repository currently has:

- a plain **React 19 + Vite** frontend (`ui/`), not Next.js;
- a plain **Node.js HTTP API** (`server/`) that is also exposed through a Vercel serverless entrypoint;
- PostgreSQL accessed through `pg` using `DATABASE_URL`, with Neon as the intended database;
- public event registration and organizer endpoints currently protected by the `x-admin-key` / `ADMIN_API_KEY` gate;
- an `app_users` table plus `auth_accounts` and `auth_sessions` tables already reserved for an eventual identity/session boundary.

The production design should replace the shared admin API key with authenticated user identity plus an organizer role/permission check. Public event registration can remain available without an account if that is a product decision, while account creation and organizer access should use the same identity mapping.

Vercel Functions can run server-side JavaScript/Node handlers, so none of the candidates requires moving the frontend or API to Next.js. The relevant integration question is how much authentication state is hosted by the provider versus stored and operated alongside the existing Neon application. [V1]

## At-a-glance comparison

| Option | Free tier / principal limits | Google OAuth | Neon and data ownership | Session model | Fit for this repository |
|---|---|---|---|---|---|
| **Better Auth** | No hosted per-user auth tier: the open-source library runs in the project’s own infrastructure. Cost and limits come from Neon, Vercel, email/OAuth services, and the project’s own capacity. | Built-in Google OAuth provider; the project supplies Google client credentials and callback configuration. [B3] | **Direct fit.** Official PostgreSQL support uses the configured database and the standard Better Auth tables. Application tables can use the Better Auth user ID or a local mapping. [B2, B5] | Database-backed sessions by default; the docs describe a seven-day default expiration and refresh according to `updateAge`. Cookies carry the session token. [B4] | **Best overall.** Works with plain Node/HTTP and keeps the identity boundary close to the existing schema, but requires the most engineering ownership. |
| **Supabase Auth** | Free plan currently lists **50,000 monthly active users**, unlimited API requests, social OAuth, and a **500 MB database**. Free projects may be paused after one week of inactivity. Limits and plan terms can change. [S2] | Supported through the dashboard/provider configuration and documented Google OAuth flow. [S3] | Supabase Auth is managed by the Supabase project. It can be used independently of the Neon application database, but the auth user store is not the existing Neon `app_users` table. Link Supabase user IDs to local application users if Neon remains authoritative for event data. [S1, S4] | JWT access tokens plus refresh tokens; the documented default is an indefinite session unless timeout controls are configured. Some session-timeout controls are paid-plan features. [S5, S6] | **Fast managed option.** Good free allowance and mature primitives, but adds a second platform and makes Neon/Supabase identity synchronization part of the design. |
| **Clerk** | Hobby currently lists **50,000 monthly retained users (MRUs) per application**, up to **three social connections**, unlimited applications, and fixed **seven-day sessions**. Confirm current commercial terms before launch because pricing is plan-specific. [C1] | Supported; development instances can use shared development credentials, while production Google OAuth requires the application’s own Google credentials/configuration. [C5] | Clerk owns identity. Clerk documents a Neon integration, but its official example is Next.js-oriented; with this repository, keep event/application data in Neon and key it by the Clerk user ID rather than moving the database. [C4] | Clerk sessions are managed by Clerk and the Hobby plan documents a fixed seven-day session duration. API calls can use cookies for same-origin requests or bearer session tokens for cross-origin requests. [C2, C3] | **Best managed UX.** React/Vite and backend request support reduce UI work, but the project accepts Clerk’s user/session model and its external identity store. |
| **Firebase Authentication** | Firebase has a no-cost **Spark** plan and a paid **Blaze** plan; Authentication quotas and provider-specific limits are documented separately and must be checked against expected sign-in volume. [F1, F4] | First-party JavaScript SDK flow is documented for Google sign-in. [F2] | Firebase owns authentication records. Keep Neon as the application database and store the Firebase UID in a local user mapping; do not assume Firebase Auth records are PostgreSQL rows available to the Neon connection. [F2, F3] | Browser SDK maintains the signed-in user state and provides an ID token; the Node API verifies that ID token with the Firebase Admin SDK. Firebase also documents server-managed cookie sessions when a traditional cookie boundary is preferred. [F3, F5] | **Strong managed alternative.** Familiar and capable, but introduces Firebase SDK/Admin SDK and a provider-specific UID/token boundary alongside Neon. |
| **Auth.js / NextAuth** | Open-source packages rather than a hosted auth quota. Hosting/database/email/OAuth costs remain the project’s responsibility. | Broad provider ecosystem, including Google, but setup and persistence are application-owned. [A2] | Can use an adapter/database, but the project would own the schema and integration. It is not a hosted Neon-compatible auth service. [A2, A3] | Supports database-backed or JWT-style approaches depending on configuration; exact behavior is application configuration. [A2] | **Do not select for a new standalone build.** The official project says Auth.js is now part of Better Auth and directs new projects to Better Auth except for particular gaps. Treat existing Auth.js deployments as migration/maintenance work, not the preferred greenfield choice. [A1, A4] |

## Detailed evaluation

### 1. Better Auth — recommended

**What it provides.** Better Auth is an open-source, framework-agnostic authentication framework. Its documentation supports a separate client/server setup, Google OAuth, PostgreSQL through `pg`, database schema generation/migrations, and an Express integration that can be mounted in a Node server. [B1–B5]

**Free tier and limits.** There is no Better Auth-hosted monthly active user allowance to compare with Clerk or Supabase: the project installs and runs the library. The practical limits are the Neon database plan, Vercel/runtime limits, OAuth provider limits, email delivery if email authentication is added, and the project’s own capacity. This can be cheaper and more portable at small scale, but it transfers availability, abuse protection, migrations, upgrades, and incident response to the project.

**Google and sessions.** Google is a documented social provider. Better Auth’s database-backed session model stores session records and uses cookies for the browser session; the documentation describes a seven-day default expiration and refresh behavior controlled by `updateAge`. Treat these as defaults to verify against the installed Better Auth version, not as immutable policy. [B3, B4]

**Neon/Vercel fit.** Configure the PostgreSQL adapter with the existing `DATABASE_URL`. Keep Better Auth’s generated tables separate from event tables, or deliberately map the existing auth tables only after comparing the generated schema and migration behavior. The Node handler can be mounted in the existing API before route dispatch, and Vercel can invoke the same handler through the current function entrypoint. The project should use secure cookies, a stable auth secret, correct production callback URLs, and a connection strategy appropriate for serverless PostgreSQL.

**Dashboard and registration management.** Better Auth does not provide a hosted provider console comparable to Clerk’s or Firebase’s user dashboard. Its Admin plugin provides administrative operations such as listing users, banning users, impersonation, and session management through APIs; Marga Run Club would need to build and protect an organizer-facing UI, or continue using its existing registration dashboard plus add user-management views. [B6]

**Main risks.** The project owns the security-sensitive implementation boundary. It must protect admin endpoints, validate OAuth callbacks, manage cookie settings and CSRF/origin behavior, run schema migrations, handle account linking, add rate limiting/abuse controls, and keep dependencies current. The direct-Neon advantage is substantial, but it is not a zero-maintenance service.

### 2. Supabase Auth

**Free tier and limits.** Supabase’s pricing page currently lists 50,000 MAU on the Free plan, unlimited API requests, social OAuth, and 500 MB of database storage. Supabase also documents that free projects may be paused after a week of inactivity. The plan is attractive for an early club app, but the database allowance and inactivity behavior should be treated as launch constraints, especially if Supabase is used only for auth while Neon remains the application database. [S2]

**Google and sessions.** Google OAuth is a first-party documented flow. Supabase Auth uses JWT access tokens and refresh tokens; the sessions documentation describes indefinite sessions by default and configurable timeouts, with some timeout controls limited to paid plans. [S3, S5, S6]

**Neon compatibility.** Supabase Auth can be used as an identity service while application data stays in Neon. That is a valid architecture, but it does not make the Neon `app_users` table the Supabase auth user store. The API must verify Supabase tokens, obtain the Supabase user ID, and create/find a local `app_users` record. If the app later adds row-level security or Supabase data services, using a second database may become more confusing rather than less.

**Dashboard and implementation effort.** Supabase provides a hosted project dashboard and auth user management, and its client/server documentation supplies the token/session patterns. The frontend still needs a sign-in flow and the Node API needs token verification/middleware. It is less UI-heavy than Better Auth if the Supabase client patterns are adopted, but it does not automatically replace the existing organizer authorization policy.

**Migration risk.** Existing public registrations are not authenticated accounts. A migration should not silently claim an email address as an OAuth identity without an account-linking policy. For users who later sign in with Google, match/link only under an explicit, verified-email policy and preserve the local `app_users` ID used by registrations, payments, and organizer records.

### 3. Clerk

**Free tier and limits.** Clerk’s current pricing page lists a Hobby allowance of 50,000 MRUs per application, up to three social connections, unlimited applications, and seven-day sessions. MRU is not the same measurement as a total registered-user count, so usage should be modeled using monthly activity rather than registrations alone. Verify the current plan and production terms before launch. [C1]

**Google and frontend effort.** Clerk has an official React quickstart and prebuilt components/hooks, which can substantially reduce sign-up, sign-in, profile, and session UI work. Its Google social-connection documentation distinguishes development setup from production credentials. [C2, C5]

**API and Neon.** Clerk’s backend request documentation supports authenticating requests with cookies or bearer session tokens. For this repository, the React frontend and API may be deployed under the same origin, making cookies convenient; if the API is called cross-origin, use the documented bearer-token pattern and verify the request server-side. Keep event data in Neon and store Clerk’s user ID in `app_users` or a dedicated external-ID column. Clerk’s Neon integration is useful evidence that the two products work together, but its documented example is Next.js-specific and should not be mistaken for a drop-in integration for this plain Node API. [C3, C4]

**Dashboard and migration.** Clerk is the strongest candidate for a ready-made user registration/user-management dashboard and profile flows. Clerk also documents user migration tooling. Migration planning still needs to address password hashes, rate limiting, duplicate emails, Google account linking, and the distinction between existing event participants and actual authenticated users. [C6]

**Main risks.** Identity, sessions, UI behavior, and pricing are coupled to a hosted provider. The fixed seven-day Hobby session duration may be acceptable for an event app but should be tested against organizer workflows. Moving away later requires exporting/linking users, replacing provider IDs, replacing UI/components, and changing API verification.

### 4. Firebase Authentication

**Free tier and limits.** Firebase documents a no-cost Spark plan and a pay-as-you-go Blaze plan. Authentication has separate usage quotas/limits, so the team should check the current Authentication limits page and billing implications for the enabled providers; this report intentionally does not convert those changing quotas into a false fixed allowance. [F1, F4]

**Google and API verification.** Firebase’s web documentation provides a Google sign-in flow. The server can verify the resulting Firebase ID token with the Admin SDK and use the verified UID as the durable external identity. Firebase also documents converting verified ID tokens into server-side cookie sessions if the API should use an HTTP-only cookie rather than accept a bearer ID token on every request. [F2, F3, F5]

**Neon and dashboard.** Firebase Authentication records live in Firebase’s auth service, not in the Neon PostgreSQL connection. The application should maintain a local mapping from Firebase UID to `app_users.id`. The Firebase console provides the managed user administration surface; any organizer-specific role and event permissions still belong in the application database and API authorization layer.

**Main risks.** The app gains a second provider-specific SDK and token vocabulary, plus Firebase Admin credentials on the server. Migration away later requires preserving the Firebase UID mapping and reimplementing client/session behavior. It is a good managed alternative, especially for teams already operating Firebase, but it is less aligned with the repository’s deliberately PostgreSQL-centered auth table design than Better Auth.

### 5. Auth.js / NextAuth

Auth.js remains useful context for existing deployments and for teams that need its particular provider/session behavior, but it should not be the new default here. The official Auth.js site says the project is now part of Better Auth and its repository README recommends Better Auth for new projects unless there is a specific feature gap, notably stateless sessions without a database. [A1]

Auth.js is not a hosted auth dashboard or a Neon service. The application owns the adapter/database, UI, deployment, secrets, and user administration. That makes it possible to fit the existing API, but Better Auth is the actively recommended successor for the framework-agnostic, self-hosted direction. If an existing Auth.js deployment were being migrated, use the official migration guidance and preserve provider-account identifiers and local application-user IDs. [A3, A4]

## User registration and organizer dashboard implications

The requirement is not only “can a person sign in?” The organizer needs to see registrations, control events/forms/tickets, and eventually manage account access.

| Option | Hosted user dashboard | What remains in Marga Run Club |
|---|---|---|
| Better Auth | No provider dashboard by default; Admin plugin exposes APIs. [B6] | Build user-management UI, organizer roles, event registration dashboard, audit policy, and all authorization checks. |
| Supabase | Supabase project dashboard provides managed auth operations. [S1] | Add the local-user mapping, organizer role policy, event/registration UI, and API authorization. |
| Clerk | Strongest prebuilt account/profile and hosted user-management experience among these candidates. [C1, C2] | Keep event registrations, organizer permissions, and domain-specific dashboard data in Neon. |
| Firebase | Firebase console provides managed Authentication user administration. [F1, F3] | Build domain-specific organizer controls, local UID mapping, and API authorization. |
| Auth.js | No hosted auth dashboard; application-owned. [A2, A3] | Build everything, as with Better Auth, with less strategic reason to choose it for a new project. |

Regardless of provider, do not use an email string alone as the authorization key. Persist a stable provider subject/ID and a local `app_users.id`; make organizer role membership an explicit server-side authorization decision. Never expose provider admin credentials, database credentials, or OAuth client secrets to the Vite bundle.

## Migration plan and risk assessment

### Existing data

The current public registration data is not automatically a set of authenticated accounts. Existing rows should remain linked to a stable local `app_users.id`. Add an external identity mapping when a person completes the first verified sign-in. Avoid automatically linking an OAuth account solely because its email text matches an old registration unless the provider’s email verification and the application’s account-linking policy make that safe.

### Current organizer access

`ADMIN_API_KEY` is a shared secret and should be treated as a temporary development gate. The replacement sequence should be:

1. authenticate the request and resolve the provider subject to a local user;
2. load organizer membership/role from Neon;
3. authorize each organizer route server-side;
4. remove the client’s ability to supply an admin credential as the authority;
5. keep a carefully scoped break-glass procedure only if operations require one.

### Provider-specific migration difficulty

- **Better Auth:** Lowest conceptual migration risk because identity, accounts, sessions, and local data can live in Neon. The schema must be compared carefully with the generated Better Auth schema, and the application owns password/credential migration if those are added later.
- **Supabase:** Moderate risk. The local user table remains useful, but Supabase user IDs/tokens and a second project/database lifecycle become durable dependencies.
- **Clerk:** Moderate-to-high exit risk relative to a self-hosted library because UI components, session semantics, provider IDs, and migration tooling become part of the application boundary. Clerk does provide migration tooling, which lowers entry migration effort. [C6]
- **Firebase:** Moderate-to-high exit risk for the same reason: Firebase UIDs, SDK calls, Admin SDK verification, and Firebase console workflows become provider-specific dependencies.
- **Auth.js:** Existing Auth.js users require a deliberate migration path; for a new build, selecting Better Auth avoids starting on the predecessor direction identified by the official project. [A1, A4]

## Suggested decision rule

Select **Better Auth + Neon** when these are true:

- Neon should remain the source of truth for both application users and event data;
- the team can own a small amount of auth UI and operational code;
- avoiding a second auth database/provider is more valuable than a turnkey dashboard;
- a direct fit for the existing Node API matters more than prebuilt components.

Select **Clerk** when the team wants the least frontend auth work and accepts hosted identity, fixed Hobby session behavior, and provider migration costs. Select **Supabase Auth** when its free MAU allowance and managed primitives outweigh the architectural cost of an auth service separate from Neon. Select **Firebase** when the Firebase ecosystem is already a team standard. Select Auth.js only for a specific existing-system or feature constraint, not as the greenfield default.

## Implementation checkpoint before coding

Before adding a dependency, confirm:

1. whether public registrations require accounts or remain guest registrations;
2. whether Google-only sign-in is sufficient for launch;
3. the organizer role model (one organizer, organization membership, or multiple roles);
4. whether sessions should be cookie-based for same-origin Vercel requests;
5. production and preview OAuth callback URLs;
6. the Neon/serverless connection and migration approach;
7. the account-linking policy for existing email registrations;
8. rate limiting, audit logging, account disablement, and recovery requirements.

## Official sources

All links below were checked on **2026-09-27**. Pricing, quotas, plan names, and defaults are subject to change; the cited pages are the authority to re-check before implementation and launch.

### Better Auth / Auth.js

- **[B1]** Better Auth introduction: <https://www.better-auth.com/docs/introduction>
- **[B2]** PostgreSQL adapter: <https://www.better-auth.com/docs/adapters/postgresql>
- **[B3]** OAuth concepts and providers: <https://www.better-auth.com/docs/concepts/oauth>
- **[B4]** Session management: <https://www.better-auth.com/docs/concepts/session-management>
- **[B5]** Database concepts and Express integration: <https://www.better-auth.com/docs/concepts/database>, <https://www.better-auth.com/docs/integrations/express>
- **[B6]** Better Auth Admin plugin: <https://www.better-auth.com/docs/plugins/admin>
- **[A1]** Auth.js project status / recommendation: <https://authjs.dev/getting-started> and <https://github.com/nextauthjs/next-auth>
- **[A2]** Auth.js core and OAuth references: <https://authjs.dev/reference/core>, <https://authjs.dev/getting-started/authentication/oauth>
- **[A3]** Auth.js database guide: <https://authjs.dev/getting-started/database>
- **[A4]** Auth.js migration to Better Auth: <https://authjs.dev/getting-started/migrate-to-better-auth>

### Supabase

- **[S1]** Supabase Auth overview: <https://supabase.com/docs/guides/auth>
- **[S2]** Supabase pricing and Free plan limits: <https://supabase.com/pricing>
- **[S3]** Google social login: <https://supabase.com/docs/guides/auth/social-login/auth-google>
- **[S4]** Server-side Auth overview: <https://supabase.com/docs/guides/auth/server-side/overview>
- **[S5]** JWTs: <https://supabase.com/docs/guides/auth/jwts>
- **[S6]** Sessions and session controls: <https://supabase.com/docs/guides/auth/sessions>

### Clerk

- **[C1]** Pricing: <https://clerk.com/pricing>
- **[C2]** React quickstart: <https://clerk.com/docs/quickstarts/react>
- **[C3]** Backend request authentication: <https://clerk.com/docs/backend-requests/overview>
- **[C4]** Neon integration: <https://clerk.com/docs/guides/development/integrations/databases/neon>
- **[C5]** Google social connection: <https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google>
- **[C6]** User migration overview: <https://clerk.com/docs/guides/development/migrating/overview>

### Firebase

- **[F1]** Firebase pricing and plans: <https://firebase.google.com/pricing>
- **[F2]** Google sign-in for web: <https://firebase.google.com/docs/auth/web/google-signin>
- **[F3]** Verify Firebase ID tokens on a server: <https://firebase.google.com/docs/auth/admin/verify-id-tokens>
- **[F4]** Authentication limits: <https://firebase.google.com/docs/auth/limits>
- **[F5]** Server-side cookie sessions: <https://firebase.google.com/docs/auth/admin/manage-cookies>

### Vercel

- **[V1]** Vercel Functions: <https://vercel.com/docs/functions>
