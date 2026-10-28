#!/usr/bin/env bun
// Turns the terminal wordmark in packages/tui/src/logo.ts into SVG paths on the same 6px grid
// the web and OAuth wordmarks use, so all three stay in sync. Prints the <path> elements.
// Usage: bun script/osta/wordmark.ts <left fill> <right fill> <shadow fill>
import { logo } from "../../packages/tui/src/logo"

export function wordmarkPaths(left: string, right: string, shadow: string) {
  const halves: Record<string, [string, string]> = {
    "█": ["fill", "fill"],
    "▀": ["fill", ""],
    "▄": ["", "fill"],
    "^": ["fill", "shadow"],
    _: ["shadow", "shadow"],
    "~": ["shadow", ""],
    ",": ["", "shadow"],
  }
  const rects = new Map<string, string[]>()
  const add = (color: string, x: number, y: number) =>
    rects.set(color, [...(rects.get(color) ?? []), `M${x} ${y}H${x + 6}V${y + 6}H${x}Z`])
  logo.left.forEach((_, row) => {
    const line = `${logo.left[row]} ${logo.right[row]}`
    ;[...line].forEach((char, col) => {
      const parts = halves[char]
      if (!parts) return
      parts.forEach((part, half) => {
        if (!part) return
        const color = part === "shadow" ? shadow : col < logo.left[row].length ? left : right
        // Row 0 is the ascender row; the letters' x-height starts at y=6.
        add(color, col * 6, (row - 1) * 12 + half * 6 + 6)
      })
    })
  })
  return [...rects].map(([color, d]) => `<path d="${d.join("")}" fill="${color}" />`)
}

export const width = (logo.left[0].length + 1 + logo.right[0].length) * 6

if (import.meta.main) {
  const [left = "currentColor", right = "currentColor", shadow = "currentColor"] = process.argv.slice(2)
  console.log(wordmarkPaths(left, right, shadow).join("\n"))
}
