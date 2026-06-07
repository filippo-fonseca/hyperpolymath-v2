<!--
One change per PR. If your diff touches three unrelated things, it's three PRs.
Reference the issue you're closing with "Closes #123".
-->

## What

<!-- One paragraph. What does this PR change? -->

## Why

<!-- One paragraph. Why does it need to change? Link the issue if there is one. -->

## How

<!-- Bullet points are fine. Key implementation notes that aren't obvious from the diff. -->

## Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm --filter web test --run` passes
- [ ] `pnpm lint` passes
- [ ] No secrets in the diff (gitleaks runs locally; please don't disable it)
- [ ] Touched the landing page? Re-read the component docstrings first.
