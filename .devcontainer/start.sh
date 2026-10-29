#!/usr/bin/env bash
# Starts Osta when the Codespace opens: a one-time sign-in link for the web app (opened in a new browser tab
# when the editor allows it) and the terminal app in this terminal. Leaving Osta drops to a normal shell.
cd /workspaces/projects 2>/dev/null || cd "$HOME"

if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  url="https://${CODESPACE_NAME}-4096.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  link=$(osta pair --url "$url" 2>/dev/null | grep -o "$url/auth/connect/[^[:space:]]*" | head -n 1)
  if [ -n "$link" ]; then
    printf '\n  Osta web app (works well on a phone): %s\n  The link works once and expires soon. Run osta-start again for a new one.\n\n' "$link"
    if [ -n "${BROWSER:-}" ]; then "$BROWSER" "$link" >/dev/null 2>&1 || true; fi
    sleep 2
  fi
fi

osta
exec bash -l
