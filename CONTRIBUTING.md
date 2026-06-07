# Contributing

Hyperpolymath is a personal life-OS built in public by [Filippo Fonseca](https://filippofonseca.com). It's MIT-licensed, single-maintainer, and pre-1.0. Most of the codebase changes in a given week, so issues and PRs get triaged in batches, not in real time.

There are two ways to use the repo:

1. **Fork it.** Take the framework, rename the primitives, rip out what you don't want, build your own thing. The five primitives are documented in [FRAMEWORK.md](./FRAMEWORK.md). MIT means whatever you want.
2. **Contribute upstream.** Bug reports, small focused fixes, and tightly scoped features are welcome. Read the rest of this file first.

## Local setup

You need Node 20.9+, pnpm 9.12+, Docker (for local Supabase), and an Anthropic API key. Google Calendar and the voice stack are optional.

```bash
git clone https://github.com/filippo-fonseca/hyperpolymath-v2.git
cd hyperpolymath-v2
pnpm install

# env
cp .env.example apps/web/.env.local
# then fill in real values. see comments in the file.

# local supabase (postgres + auth + realtime in docker)
cd apps/web
pnpm dlx supabase start
pnpm db:migrate

# run
pnpm dev    # http://localhost:3000
```

If `supabase start` fails, it's almost always Docker. Make sure Docker Desktop is running and you have ~4GB free.

## Project layout

```
apps/web                Next.js 16 app (the main thing)
apps/desktop            Tauri shell (in flight; not needed to run the web app)
packages/jarvis-core    shared agent logic
tools/jarvis-physical   macropad bridge (hardware-side, optional)
supabase                local config + edge functions
.planning               GSD workflow artifacts. roadmap and per-phase plans.
```

Most contributions touch `apps/web`. The rest is in active development and changes shape week to week.

## Filing a bug

Search existing issues first. If it's new, include:

- What you did, what you expected, what happened.
- Browser, OS, commit SHA (`git rev-parse HEAD`).
- If JARVIS misrouted, paste the input verbatim and the resulting actions.

If you found something a screenshot would explain in two seconds, attach the screenshot.

## Proposing a feature

The five primitives (Areas, Projects, Building Blocks, Calendar, JARVIS) are the smallest set that covers a life without forcing specialization. Most feature requests that broaden scope get declined. That's the methodology, not gatekeeping.

Open an issue describing the use case (not the implementation) and tag it `proposal`. We can decide together whether it belongs upstream or in a fork.

## Pull requests

- One change per PR. If your diff touches three unrelated things, it's three PRs.
- Match the existing style. The web app is TypeScript strict with Biome.
- Before opening: `pnpm typecheck && pnpm --filter web test --run && pnpm lint`.
- Reference the issue you're closing.
- The landing page has a strict typography discipline (canonical text sizes, no scroll-reveal animations, restrained motion). Read the component docstrings before editing it.

I rebase-merge most PRs, so a clean linear history matters. Squash before requesting review.

## Commits

Conventional Commits with scoped prefixes:

```
feat(jarvis):    new functionality
fix(voice):      bug fix
refactor(db):    no behaviour change
docs(readme):    docs only
```

Scope is usually a domain (`jarvis`, `voice`, `auth`, `landing`) or a phase number (`08-06`). Look at recent `git log` for the local style.

## Security

Don't file public issues for security bugs. See [SECURITY.md](./SECURITY.md) for the disclosure flow.

## Code of conduct

Be specific, be kind, assume the other person is reading carefully. That's the whole thing.

## License

MIT. See [LICENSE](./LICENSE).
