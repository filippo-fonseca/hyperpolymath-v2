# Contributing to Hyperpolymath

Thanks for your interest. Hyperpolymath is open source under MIT, built in public by [Filippo Fonseca](https://filippofonseca.com). There are two equally welcome ways to engage: **fork it** and adapt the framework to your own life, or **contribute upstream** with focused changes that fit the existing scope.

If you came here from the landing page's "Fork it" door, you're in the right place.

## Two paths

**Fork it.** The framework is the artifact. The same five primitives (Areas, Projects, Building Blocks, Calendar, JARVIS) are documented in [FRAMEWORK.md](./FRAMEWORK.md). Take them as-is, rename them, restructure them, or rip them out and build your own. MIT means whatever-you-want.

**Contribute upstream.** Issues, bug reports, small fixes, and focused PRs are all welcome. Be patient — this is a single-maintainer project during the build-in-public phase, so triage will not be instant.

## Local setup

```bash
git clone https://github.com/filippo-fonseca/hyperpolymath-v2.git
cd hyperpolymath-v2
pnpm install
pnpm --filter web dev
```

You'll need:
- A Supabase project (Postgres + Auth + Realtime)
- An Anthropic API key (for JARVIS)
- Google OAuth credentials (for Calendar integration)

See `.env.example` at the repo root for the full list of environment variables.

## Filing a bug

1. Search existing issues first. Most things are already known.
2. If it's new, open an issue with:
   - **What you tried** (the input or the interaction).
   - **What you expected** to happen.
   - **What actually happened**.
   - Browser, OS, and commit SHA (`git rev-parse HEAD`).
3. If JARVIS is involved, paste the receipt or the error message verbatim.

## Proposing a feature

Hyperpolymath has a tight scope on purpose. The five primitives are deliberately the smallest set that covers a life without forcing specialization. Most feature requests that broaden the scope will be politely declined — that's the methodology, not gatekeeping.

Best path for a new idea:

1. Open an issue describing the **use case** (not the implementation).
2. Tag it `proposal`.
3. We discuss whether it belongs in the framework or as a personal fork.

## Pull requests

- **One change per PR.** Keep it focused.
- Match the existing code style. The web app is TypeScript strict + Biome.
- Run `pnpm tsc --noEmit` and `pnpm --filter web test --run` before submitting.
- Reference the related issue in the PR description.
- The landing page in particular has a strict typography discipline (canonical text sizes, no scroll-reveal animations, restrained motion). If you're touching the landing, read the existing component docstrings first.

## Commit conventions

Conventional Commits with phase-aware prefixes:

- `feat(<scope>): …` — new functionality
- `fix(<scope>): …` — bug fix
- `docs(<scope>): …` — docs only
- `refactor(<scope>): …` — code change with no feature or fix

`<scope>` is usually a phase number (`08-06`) or a domain (`jarvis`, `voice`, `auth`).

## Code of conduct

Be kind, be specific, and assume the other person is reading carefully. That's it.

## License

MIT. See [LICENSE](./LICENSE) for the full text.
