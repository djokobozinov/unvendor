# Unvendor

**An exit toolkit for Backend-as-a-Service platforms, starting with Supabase.**

Website: [unvendor.dev](https://unvendor.dev)

Unvendor is an open source toolkit for converting a Backend-as-a-Service deployment into standard, self-hostable components: plain PostgreSQL, any OIDC identity provider and S3-compatible storage. The goal is to do this without a full rewrite of the app. Supabase is the first source platform and the reference implementation; others are planned through a source adapter interface.

> **Status: early development.** Only a first version of the inventory exists; nothing can be migrated yet. See [What it does](#what-it-does) and the [roadmap](#roadmap).

## Why

Backend-as-a-Service platforms (Supabase, Firebase, Appwrite, Nhost, PocketBase) bundle database, auth, storage and functions behind platform-specific APIs. Apps built on them become hard to self-host, migrate or audit, even when parts of the platform are open source.

On Supabase, for example:

- RLS policies call `auth.uid()`, `auth.jwt()` and `auth.role()`, which only exist in Supabase.
- Users live in `auth.users`, and application tables reference their IDs.
- Storage access rules are database policies. The object store knows nothing about them.

Today, leaving means a dump, one-off scripts and rewriting access control by hand. Self-hosting the platform itself changes where it runs, not what the app depends on: you still operate its services and stay on its schemas.

Unvendor is for teams that need to run their backend on infrastructure they control: small teams, NGOs, public bodies, and anyone who needs data sovereignty, GDPR-compliant self-hosting, or protection against pricing or platform changes.

## What it does

Each component moves one part of the platform onto a standard replacement that can be swapped independently.

| # | Component | Target | Status |
|---|-----------|--------|--------|
| 1 | Inventory and source adapter interface | Report of everything that has to move | In progress |
| 2 | Auth migration | Any OIDC provider (Keycloak first; Authentik, Zitadel and others via SCIM 2.0 export) | Planned |
| 3 | RLS translation | Plain PostgreSQL with a small shim schema | Planned |
| 4 | Storage migration | S3-compatible storage (MinIO, Garage, Ceph) | Planned |
| 5 | Verification and release | End-to-end test harness, docs, npm package | Planned |

1. **Inventory and source adapter interface.** Reads schemas, roles, RLS policies that use `auth.*`, buckets, functions and secrets from the source project and reports what has to move. Platform-specific reading sits behind an adapter interface, so other platforms can be added as sources later.
2. **Auth migration.** Exports users, identities, password hashes, email confirmation state and MFA factors. Imports into Keycloak through its native user import, keeping user IDs and bcrypt hashes so users don't have to reset their passwords. A SCIM 2.0 export covers other OIDC providers such as Authentik and Zitadel.
3. **RLS translation.** Rewrites policies that call `auth.uid()`, `auth.jwt()` and `auth.role()` into portable SQL on top of a small shim schema. Anything that can't be converted is listed in the report. Every rewritten policy gets a negative test, and differential tests compare the rows visible to each user on source and target.
4. **Storage migration.** Copies buckets and objects to any S3-compatible backend and translates the access rules into rules the new backend enforces, with access checks per bucket and per user.
5. **Verification and release.** An end-to-end harness runs the whole migration on a copy and compares row counts, logins and access. Documentation, reproducible packaging on npm, and fixes from a security review.

### Runtime model after migration

Once the platform's API layer is gone, something has to set the JWT claims that the translated policies read. Unvendor documents and tests one model: the app's server side, or [PostgREST](https://postgrest.org/) (which is independent of Supabase), validates the OIDC token and sets the claims as a transaction-local setting before each query. The shim's `auth.uid()`, `auth.jwt()` and `auth.role()` read from that setting. Apps that reach the database only through `supabase-js` need a server-side layer first; the inventory flags this.

### Later

Not part of the first five components. The inventory reports them so a team knows what remains to do by hand.

- Client compatibility shim, so an app using `supabase-js` can keep running against the new components while client code is ported step by step.
- Edge Functions, Realtime subscriptions and database webhooks.
- Further source adapters: Firebase, Appwrite and others.

### Design rules

These apply to every component as it is built:

- Never write to the source project.
- Can be run against a copy any number of times before the real cutover.
- Every change made to the target is recorded in a report.
- Anything that can't be converted automatically goes into the report instead of being skipped.
- Every RLS rewrite has a negative test proving that forbidden rows stay hidden.

### What exists today

- A Supabase test fixture in [`fixtures/supabase/`](fixtures/supabase/): tables with RLS policies that call `auth.uid()`, `auth.jwt()` and `auth.role()`, storage buckets with per-user folder policies, and a seed script. It is the source project used to develop and test the components above.
- A first version of `unvendor inventory` for Supabase. See [Quick start](#quick-start).
- The project website in [`site/`](site/).

## Quick start

The inventory command reads a Supabase project and reports what has to move. It only reads; it never writes to the project.

Requires Node.js 22.9 or later. Put the project's database connection string in `.env` (see [`.env.example`](.env.example)):

```
SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

Then run:

```bash
npm install
npm run inventory                          # Markdown report to stdout
npm run inventory -- --json --out inventory.json
```

To try it on the test fixture, set up a hosted Supabase project as described in [`fixtures/supabase/README.md`](fixtures/supabase/README.md).

### Example

Run against the fixture, the report starts like this (shortened):

```markdown
# Unvendor inventory

Source: supabase, database `postgres`, PostgreSQL 17.11.

## Summary

| Item | Count | Has to move |
|---|---|---|
| App schemas | 1 | public |
| Custom roles | 0 |  |
| RLS policies using auth.* | 10 | Rewrite onto the shim schema (M3) |
| Other RLS policies | 2 | Copy as is |
| Storage buckets | 2 | avatars, documents |
| App functions | 0 | 0 call auth.* |

## RLS policies using auth.*

| Table | Policy | Command | auth.* calls | USING |
|---|---|---|---|---|
| public.notes | notes: admin read | SELECT | auth.jwt() | `(((auth.jwt() -> 'app_metadata') ->> 'role') = 'admin')` |
| public.notes | notes: own | ALL | auth.uid() | `(auth.uid() = owner_id)` |
| public.orgs | orgs: create if logged in | INSERT | auth.role() |  |
| storage.objects | documents: read own folder | SELECT | auth.uid() | `((bucket_id = 'documents') AND ((storage.foldername(name))[1] = (auth.uid())::text))` |
| ... | | | | |

## Not checked

- Edge Functions and secrets: need the platform's management API, not read yet.
- auth.* calls outside policies and functions (column defaults, views, triggers).
```

The full report also lists every schema, role, bucket and function, marks which ones the platform manages, and includes each policy's `WITH CHECK` clause.

## Roadmap

One milestone per component, tracked as [issues on GitHub](https://github.com/djokobozinov/unvendor/issues).

- [ ] **M1: Inventory.** Source adapter interface; Supabase adapter reading schemas, roles, `auth.*` RLS policies, buckets, functions and secrets; Markdown/JSON report.
  - Done when: `unvendor inventory` runs against `fixtures/supabase` and reports everything that has to move.
- [ ] **M2: Auth migration.** Users, identities, bcrypt hashes and MFA to Keycloak, keeping UUIDs and hashes; SCIM 2.0 export for Authentik and Zitadel.
  - Done when: fixture users log in to Keycloak with their original passwords.
- [ ] **M3: RLS translation.** Shim for `auth.uid()`, `auth.jwt()` and `auth.role()` on transaction-local claims; policy rewriter; negative and differential tests.
  - Done when: every fixture policy is rewritten or reported, and the tests pass on plain PostgreSQL.
- [ ] **M4: Storage migration.** Buckets and objects to S3-compatible storage (MinIO, Garage, Ceph); storage policies translated into rules the backend enforces.
  - Done when: every fixture object is copied and the per-bucket, per-user access checks pass on the target.
- [ ] **M5: Verification and release.** End-to-end harness on a copy comparing row counts, logins and access; documentation; reproducible npm package; security review fixes.
  - Done when: the full migration of `fixtures/supabase` passes the harness and the package is published on npm.

## Contributing

If you've moved off a Backend-as-a-Service platform, or tried and gave up, open an issue and describe what broke. Real migration cases shape the roadmap and the test suite.

The project is written in TypeScript. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Use of generative AI

Parts of the documentation and code in this repository are written with help from a generative AI assistant (Claude). Commits with AI-assisted content say so in the commit message, and each AI-assisted session is logged in [`docs/ai-log/`](docs/ai-log/). A human reviews every change, is responsible for its correctness, and makes sure it can be published under Apache-2.0.

## License

Apache-2.0. See [LICENSE](LICENSE).

Unvendor is not affiliated with or endorsed by Supabase or any other platform mentioned here.

## Mirrors

- GitHub: [github.com/djokobozinov/unvendor](https://github.com/djokobozinov/unvendor)
- Codeberg: [codeberg.org/gjokob/unvendor](https://codeberg.org/gjokob/unvendor)
