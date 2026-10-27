# Contributing to Unvendor

Thanks for your interest. Unvendor is in early development and no component is usable yet, so the most useful contributions right now are real-world migration stories and test cases.

## Share what broke

If you've moved off a Backend-as-a-Service platform (Supabase, Firebase, Appwrite, Nhost, PocketBase, ...), or tried and gave up, open an issue and describe:

- What you were migrating (database and RLS policies, auth, storage, functions, ...).
- Where you were moving to (plain PostgreSQL, an OIDC provider such as Keycloak, Authentik or Zitadel, S3-compatible storage such as MinIO or Ceph, something else).
- What broke, what you had to do by hand, and any scripts you wrote.

Links to public discussions, blog posts or repos are welcome. These shape the roadmap and the test suite.

## Test cases

A migration tool is only as good as the cases it is checked against. Supabase is the first source platform, so Supabase cases are the most useful right now:

- RLS policies that use `auth.uid()`, `auth.jwt()` or `auth.role()` in ways you suspect are hard to translate.
- Auth setups with OAuth identities, unconfirmed emails or MFA factors.
- Storage bucket policies that depend on database state.
- Client code that relies on `supabase-js` behaviour, which a later client compatibility shim would need to cover.

Strip anything private before sharing. A minimal SQL snippet that reproduces the shape of the problem is enough.

The Supabase test fixture in [`fixtures/supabase/`](fixtures/supabase/) is the source project used during development. Cases that fit its shape can be added to it.

## Code

The project is written in TypeScript and licensed under Apache-2.0. Before starting a larger change, open an issue so we can agree on the approach. Keep pull requests focused on one thing.

Rules the tool must follow, and that every change must respect:

- Never write to the source project.
- Every change made to the target must be recorded in the report.
- Anything that cannot be converted automatically goes into the report instead of being silently skipped.
- Every RLS rewrite needs a negative test proving that forbidden rows stay hidden.
- Platform-specific code belongs behind the source adapter interface, so other platforms can be added later.

## Roadmap

Work is organised in milestones M1 to M5, one per component: inventory and source adapter interface, auth migration, RLS translation, storage migration, verification and release. See the [roadmap in README.md](README.md#roadmap) and the [milestone issues](https://github.com/djokobozinov/unvendor/issues).

## Generative AI

You may use generative AI tools when contributing. Say so in the commit message or pull request, review the output yourself, and make sure it can be published under Apache-2.0. Unedited AI output is not accepted.

## Mirrors

The project is on [GitHub](https://github.com/djokobozinov/unvendor) and [Codeberg](https://codeberg.org/gjokob/unvendor). Issues and pull requests are welcome on either.

## License

By contributing you agree that your contributions are licensed under the Apache-2.0 license. See [LICENSE](LICENSE).
