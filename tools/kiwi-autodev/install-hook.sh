#!/usr/bin/env bash
#
# Install the Kiwi auto-dev pre-push guard into the repo's hooks directory
# WITHOUT clobbering the existing gitleaks pre-commit. Idempotent: running it
# twice is a no-op the second time.
#
# It resolves the hooks dir from `git config core.hooksPath` (the .husky dir on
# this machine) and falls back to .git/hooks. If a pre-push already exists, it
# chains ours via a sidecar instead of overwriting. It NEVER touches pre-commit.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SOURCE_HOOK="${SCRIPT_DIR}/githooks/pre-push"

if [ ! -f "${SOURCE_HOOK}" ]; then
  echo "install-hook: source hook not found at ${SOURCE_HOOK}" >&2
  exit 1
fi

# Resolve the hooks dir: prefer core.hooksPath (absolute .husky path here),
# otherwise the default .git/hooks.
HOOKS_PATH="$(git -C "${REPO}" config core.hooksPath || true)"
if [ -n "${HOOKS_PATH}" ]; then
  # core.hooksPath may be relative to the repo root; normalize to absolute.
  case "${HOOKS_PATH}" in
    /*) HOOKS_DIR="${HOOKS_PATH}" ;;
    *)  HOOKS_DIR="${REPO}/${HOOKS_PATH}" ;;
  esac
else
  HOOKS_DIR="${REPO}/.git/hooks"
fi

mkdir -p "${HOOKS_DIR}"

SIDECAR="${HOOKS_DIR}/kiwi-autodev-pre-push"
PREPUSH="${HOOKS_DIR}/pre-push"
SENTINEL="# >>> kiwi-autodev pre-push guard >>>"

# Always (re)install our guard to the stable sidecar location.
cp "${SOURCE_HOOK}" "${SIDECAR}"
chmod +x "${SIDECAR}"

if [ ! -e "${PREPUSH}" ]; then
  # No existing pre-push: install a thin dispatcher that execs our sidecar with
  # the same stdin and args.
  cat > "${PREPUSH}" <<DISPATCH
#!/usr/bin/env sh
${SENTINEL}
# Installed by tools/kiwi-autodev/install-hook.sh. Delegates to the sidecar
# guard. Safe to remove this whole file if you no longer want the guard.
exec "${SIDECAR}" "\$@"
# <<< kiwi-autodev pre-push guard <<<
DISPATCH
  chmod +x "${PREPUSH}"
  echo "install-hook: installed pre-push dispatcher at ${PREPUSH} (sidecar: ${SIDECAR})"
else
  # A pre-push already exists: chain ours without overwriting. Append the guard
  # block only once, guarded by the sentinel so repeated runs do not duplicate.
  if grep -qF "${SENTINEL}" "${PREPUSH}"; then
    echo "install-hook: pre-push already chains the kiwi-autodev guard; nothing to do"
  else
    {
      echo ""
      echo "${SENTINEL}"
      echo "# Installed by tools/kiwi-autodev/install-hook.sh. Runs the kiwi-autodev"
      echo "# guard with the same stdin and args; fails the push if the guard fails."
      echo "\"${SIDECAR}\" \"\$@\" || exit \$?"
      echo "# <<< kiwi-autodev pre-push guard <<<"
    } >> "${PREPUSH}"
    chmod +x "${PREPUSH}"
    echo "install-hook: chained the kiwi-autodev guard into existing ${PREPUSH} (sidecar: ${SIDECAR})"
  fi
fi

# Never touch pre-commit (it runs gitleaks + the cache gate); leave it intact.
echo "install-hook: pre-commit left untouched (gitleaks + cache gate)"
echo "install-hook: done."
