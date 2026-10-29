<p align="center">
  <picture>
    <source srcset=".github/assets/osta-dark.svg" media="(prefers-color-scheme: dark)">
    <source srcset=".github/assets/osta-light.svg" media="(prefers-color-scheme: light)">
    <img src=".github/assets/osta-light.svg" alt="Osta" width="342">
  </picture>
</p>
<p align="center"><b>Osta (أسطى)</b>: an open-source AI coding agent that works like a master craftsman.<br>Free models out of the box. No account, no API key.</p>
<p align="center">
  <a href="README.md">English</a> | <a href="README.ar.md">العربية</a>
</p>

---

"Osta" is what Egyptians call a master craftsman: someone who does the job right the first time, quickly, and without being watched. Osta is a coding agent for your terminal built on [opencode](https://github.com/anomalyco/opencode). It does everything opencode does, adds its own way of working, and remembers what it learns from every project.

### Chat with Osta in your browser

**[mh1771045-boop.github.io/osta](https://mh1771045-boop.github.io/osta/)**: open it and start talking, or install it on your phone like an app. It is free and needs no API key: answers come through [Puter](https://puter.com), and you create a free Puter account in one tap the first time. Your chats and what Osta learns about you stay on your device. The web app can't touch your files; for that, use Osta itself below.

### Try the full Osta, nothing to install

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/mh1771045-boop/osta?quickstart=1)

Press the button, sign in to GitHub if asked, and wait a minute or two. Osta opens by itself in the terminal of a browser editor, and the terminal prints a link to Osta's web app, which works well on a phone. Codespaces is free for personal GitHub accounts up to a monthly limit.

### Install

macOS and Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/mh1771045-boop/osta/main/install | bash
```

Windows: run the same command in Git Bash or WSL.

Then open a new terminal, go to a project folder and run:

```bash
osta
```

Prebuilt downloads for every platform are on the [Releases page](https://github.com/mh1771045-boop/osta/releases).

### Free, with no API key

Osta starts with free models and never asks for a key on first run.

- **Kilo's free Nemotron models (the default).** Osta starts on NVIDIA Nemotron 3 Ultra through the [Kilo gateway](https://kilo.ai), with Nemotron 3.5 Lightning as its fast second. Kilo serves its `:free` models without an account, limited per IP address (about 200 requests an hour today).
- **OpenCode Zen's free models.** They come from the free tier of OpenCode Zen, the model service run by the opencode team.
- **GitHub Copilot Free.** Osta offers the sign-in on first launch. Later, run `/connect` (or `osta auth login`), pick GitHub Copilot, and sign in with your GitHub account in the browser.

When one source runs out (a 429 or a used-up free limit), Osta quietly moves the same task to the next one and keeps going: Kilo Ultra, then Kilo Lightning, then Zen, then Copilot, then a local Ollama if you run one. Osta's personality and way of working come from its own prompt, so they stay the same on every model. The models on offer, their limits and their data policies are set by each service and can change.
- **Local models.** Run models on your own machine with [Ollama](https://ollama.com) or LM Studio and add them as a provider (example below).

Paid providers such as Anthropic, OpenAI and Google work too, but you never need them.

#### A model on your own computer

Install Ollama, pull a coding model (`ollama pull qwen2.5-coder:7b`), then add this to `~/.config/osta/osta.json`:

```jsonc
{
  "providers": {
    "ollama": {
      "name": "Ollama",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "http://localhost:11434/v1" },
      "models": { "qwen2.5-coder:7b": { "name": "Qwen 2.5 Coder 7B" } }
    }
  }
}
```

Pick it with `/models` in Osta, or run `osta run -m ollama/qwen2.5-coder:7b "..."`. Osta uses opencode's provider format, so the [OpenCode V2 provider docs](https://opencode.ai/v2/docs/providers) apply.

### What Osta adds to opencode

| | |
|---|---|
| **A craftsman's way of working** | Every model gets the same loop: understand, decide, act, verify, report, learn. Osta proves a change works (tests, types, build) before saying it does, and says plainly what it could not check. |
| **Learning memory** | After meaningful work Osta writes short lessons to `.osta/learnings.md` in the project, or to `~/.config/osta/learnings.md` when a lesson applies everywhere. Both load at the start of every session, newest lessons first when space runs out. They are plain Markdown you can read, edit or delete. `/learn <lesson>` records one by hand, `/learnings` lists and tidies them, and `OSTA_DISABLE_LEARNINGS=1` turns the memory off. |
| **Arabic and English** | Osta replies in the language you write in, including natural Egyptian Arabic, while code, comments and commits stay in English. |
| **Its own home, compatible with opencode** | Settings live in `~/.config/osta`, `osta.json` and `.osta/`. Your existing `opencode.json`, `.opencode/` and `AGENTS.md` files keep working. `OSTA_*` environment variables work wherever opencode reads `OPENCODE_*`. |

Everything else comes from opencode: the terminal UI, the `build` and `plan` agents, subagents, 75+ providers, MCP servers, LSP, plugins, themes, sessions, `osta run` for scripts, and `osta serve` / `osta pair` to use Osta from a browser.

### Use it from your phone

Osta runs on a computer. To drive it from your phone on the same Wi-Fi, run `osta service set hostname 0.0.0.0` once on that computer, then `osta pair`, and open the link it prints in your phone's browser. `osta pair --remote` gives a link that works from anywhere; it asks first because it exposes your machine to the internet.

### Build from source

You need [Bun](https://bun.sh) 1.4.4 or newer.

```bash
git clone https://github.com/mh1771045-boop/osta.git
cd osta
bun install
bun dev            # run Osta from source
cd packages/cli && bun run script/build.ts --single   # build a binary for this machine
```

`script/osta/rebrand.ts` re-applies Osta's naming after merging changes from upstream opencode.

### Known limitations

- The desktop app is not packaged for Osta yet. Use the terminal app, or the web app through `osta serve` / `osta pair`.
- Osta is not published to npm, Homebrew or WinGet yet. Install it with the script above or from Releases.

### Credits and license

Osta is based on [opencode](https://github.com/anomalyco/opencode) by Anomaly, released under the MIT license. Osta is also MIT licensed; see [LICENSE](LICENSE). Osta is an independent project and is not affiliated with or endorsed by the opencode team.

Made by Muhammad Elsheikh · [WhatsApp](https://wa.me/201206580045)
