#!/usr/bin/env bash
# Installs Osta into a GitHub Codespace. Runs once, when the Codespace is created.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)

# The latest release, the same way users install it on their own machines.
curl -fsSL https://raw.githubusercontent.com/mh1771045-boop/osta/main/install | bash -s -- --no-modify-path
sudo ln -sf "$HOME/.osta/bin/osta" /usr/local/bin/osta
sudo install -m 755 "$here/start.sh" /usr/local/bin/osta-start

# Osta works in its own folder, so it never edits its own source by accident.
sudo mkdir -p /workspaces/projects
sudo chown "$(id -u):$(id -g)" /workspaces/projects

# A fixed port, so the Codespace can forward the web app.
osta service set port 4096 >/dev/null

# Codespaces sets GITHUB_TOKEN, which would make GitHub Copilot the default model even for accounts without Copilot.
# Start on Osta's free default instead; Copilot stays one `osta auth login` away.
models=$(osta models --standalone 2>/dev/null || true)
pick() { printf '%s\n' "$models" | grep -m 1 "$@"; }
free=$(pick -x 'kilo/nvidia/nemotron-3-ultra-550b-a55b:free' || pick -x 'opencode/big-pickle' || pick '^opencode/' || true)
if [ -n "$free" ] && [ ! -e "$HOME/.config/osta/osta.json" ]; then
  mkdir -p "$HOME/.config/osta"
  printf '{\n  "agents": {\n    "build": { "model": "%s" },\n    "plan": { "model": "%s" }\n  }\n}\n' "$free" "$free" \
    > "$HOME/.config/osta/osta.json"
fi

osta --version
