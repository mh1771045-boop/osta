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

- **Built-in free models.** They come from the free tier of OpenCode Zen, the model service run by the opencode team. The models on offer, their limits and their data policy are set by that service and can change.
- **GitHub Copilot Free.** Run `osta auth login`, pick GitHub Copilot, and sign in with your GitHub account in the browser.
- **Local models.** Run models on your own machine with Ollama or LM Studio and add them as a provider. Osta uses the same provider config as opencode ([OpenCode V2 docs](https://opencode.ai/v2/docs/)).

Paid providers such as Anthropic, OpenAI and Google work too, but you never need them.

### What Osta adds to opencode

| | |
|---|---|
| **A craftsman's way of working** | Every model gets the same loop: understand, decide, act, verify, report, learn. Osta proves a change works (tests, types, build) before saying it does, and says plainly what it could not check. |
| **Learning memory** | After meaningful work Osta writes short lessons to `.osta/learnings.md` in the project, or to `~/.config/osta/learnings.md` when a lesson applies everywhere. Both load at the start of every session, newest lessons first when space runs out. They are plain Markdown you can read, edit or delete. Set `OSTA_DISABLE_LEARNINGS=1` to turn it off. |
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

- Some parts of the web and desktop apps still show opencode artwork, such as the animated wordmark on the new-session screen. The terminal app, CLI and sign-in pages are fully Osta.
- Osta is not published to npm, Homebrew or WinGet yet. Install it with the script above or from Releases.

### Credits and license

Osta is based on [opencode](https://github.com/anomalyco/opencode) by Anomaly, released under the MIT license. Osta is also MIT licensed; see [LICENSE](LICENSE). Osta is an independent project and is not affiliated with or endorsed by the opencode team.

Made by Muhammad Elsheikh · [WhatsApp](https://wa.me/201206580045)
