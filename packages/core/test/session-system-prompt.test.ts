import { expect, test } from "bun:test"
import { SessionSystemPrompt } from "@opencode/core/session/system-prompt"

test("renders the default system prompt instructions", () => {
  const prompt = SessionSystemPrompt.make(["edit", "read", "shell"])
  expect(prompt).not.toContain("${OPENCODE_TOOL_GUIDANCE}")
  expect(prompt).toContain("Use the edit tool for targeted changes to existing text files")
})

test("gives every prompt Osta's identity and way of working", async () => {
  const base = SessionSystemPrompt.make([])
  expect(base).toStartWith("You are Osta (أسطى)")
  expect(base).not.toContain("${OSTA_METHOD}")
  expect(base).toContain("# How you work")
  expect(base).toContain(".osta/learnings.md")

  for (const name of ["gpt", "gpt-astra", "kimi", "meta", "trinity"]) {
    const overlay = await Bun.file(new URL(`../src/plugin/system-prompt/${name}.txt`, import.meta.url)).text()
    const rendered = SessionSystemPrompt.render(overlay, [])
    expect(rendered).toContain("You are Osta (أسطى)")
    expect(rendered).toContain("# How you work")
    expect(rendered).not.toContain("${OSTA_METHOD}")
    expect(rendered).not.toMatch(/\bOpenCode\b|\bopencode\b/)
  }
})
