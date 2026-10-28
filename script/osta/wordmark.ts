#!/usr/bin/env bun
// Turns the terminal wordmark in packages/tui/src/logo.ts into the vector geometry every other surface draws:
// the shared module packages/ui/src/components/wordmark-geometry.tsx (web logo, new-session wordmark, pin board,
// settings About), the OAuth callback page, and the README images. One cell of the terminal logo is a 6×6 unit
// square, so the result sits on the same 6px grid as opencode's original wordmark.
// Usage: bun script/osta/wordmark.ts            regenerate every file
//        bun script/osta/wordmark.ts --check    exit non-zero when a generated file is out of date
import path from "path"
import { format } from "prettier"
import { logo } from "../../packages/tui/src/logo"

const root = path.resolve(import.meta.dirname, "../..")
const CELL = 6
const PIN = 3

type Kind = "body" | "shadow"
// Each character covers a top and a bottom half cell.
const halves: Record<string, [Kind | undefined, Kind | undefined]> = {
  "█": ["body", "body"],
  "▀": ["body", undefined],
  "▄": [undefined, "body"],
  "^": ["body", "shadow"],
  _: ["shadow", "shadow"],
  "~": ["shadow", undefined],
  ",": [undefined, "shadow"],
}

const line = (row: number) => `${logo.left[row]} ${logo.right[row]}`
const columns = line(0).length
export const width = columns * CELL
export const height = 42
// Row 0 is the ascender row: its bottom half ends where the letters' x-height starts (y = 6).
const top = (row: number, half: number) => (row - 1) * 2 * CELL + half * CELL + CELL

/** Cells of one kind for the character columns [from, to), as [x, y] in units. */
function cells(kind: Kind, from: number, to: number) {
  const out: [number, number][] = []
  logo.left.forEach((_, row) => {
    ;[...line(row)].forEach((char, col) => {
      if (col < from || col >= to) return
      halves[char]?.forEach((part, half) => {
        if (part === kind) out.push([col * CELL, top(row, half)])
      })
    })
  })
  return out
}

/** Outlines a set of grid cells as one path: shared edges cancel, the rest link into loops. */
function outline(list: [number, number][], dx = 0) {
  const key = (x: number, y: number) => `${x},${y}`
  const edges = new Map<string, [number, number, number, number]>()
  for (const [x, y] of list) {
    const corners: [number, number][] = [
      [x, y],
      [x + CELL, y],
      [x + CELL, y + CELL],
      [x, y + CELL],
    ]
    corners.forEach(([ax, ay], index) => {
      const [bx, by] = corners[(index + 1) % 4]
      const reverse = `${key(bx, by)}>${key(ax, ay)}`
      if (edges.has(reverse)) edges.delete(reverse)
      else edges.set(`${key(ax, ay)}>${key(bx, by)}`, [ax, ay, bx, by])
    })
  }
  const from = new Map<string, [number, number, number, number][]>()
  for (const edge of edges.values()) {
    const start = key(edge[0], edge[1])
    from.set(start, [...(from.get(start) ?? []), edge])
  }
  const loops: [number, number][][] = []
  for (const first of edges.values()) {
    if (!from.get(key(first[0], first[1]))?.includes(first)) continue
    const points: [number, number][] = []
    let edge = first
    while (true) {
      const start = key(edge[0], edge[1])
      from.set(
        start,
        from.get(start)!.filter((item) => item !== edge),
      )
      points.push([edge[0], edge[1]])
      const next = from.get(key(edge[2], edge[3]))?.[0]
      if (!next) break
      edge = next
    }
    // Drop points that sit on a straight run.
    loops.push(
      points.filter((point, index) => {
        const prev = points[(index + points.length - 1) % points.length]
        const next = points[(index + 1) % points.length]
        return !((prev[0] === point[0] && point[0] === next[0]) || (prev[1] === point[1] && point[1] === next[1]))
      }),
    )
  }
  return loops.map((points) => `M${points.map(([x, y]) => `${x - dx} ${y}`).join("L")}Z`).join("")
}

export type Letter = { char: string; x: number; side: "left" | "right"; shadow: string; body: string }

// Letters are four cells wide with one blank cell between them, across both halves of the logo.
const LETTER = 4
const chars = ["o", "s", "t", "a"]

export function letters(): Letter[] {
  return Array.from({ length: Math.ceil(columns / (LETTER + 1)) }, (_, index) => {
    const from = index * (LETTER + 1)
    return {
      char: chars[index] ?? String(index),
      x: from * CELL,
      side: from < logo.left[0].length ? ("left" as const) : ("right" as const),
      shadow: outline(cells("shadow", from, from + LETTER)),
      body: outline(cells("body", from, from + LETTER)),
    }
  })
}

/** Pin grid at 3 units per pin: "." empty, 1 shadow, 2 left word, 3 right word. */
export function pins() {
  const rows = Math.ceil(height / PIN)
  const cols = width / PIN
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => "."))
  const split = (logo.left[0].length + 1) * CELL
  const paint = (kind: Kind) =>
    cells(kind, 0, columns).forEach(([x, y]) => {
      for (let py = y; py < y + CELL; py += PIN)
        for (let px = x; px < x + CELL; px += PIN) {
          if (py < 0 || py >= height) continue
          grid[py / PIN][px / PIN] = kind === "shadow" ? "1" : px < split ? "2" : "3"
        }
    })
  paint("shadow")
  paint("body")
  return grid.map((row) => row.join(""))
}

export function svgPaths(left: string, right: string, shadow: string) {
  return letters().flatMap((letter) => [
    `<path d="${letter.shadow}" fill="${shadow}" />`,
    `<path d="${letter.body}" fill="${letter.side === "left" ? left : right}" />`,
  ])
}

function geometryModule() {
  const list = letters()
  const glyphs = Object.fromEntries(
    list.map((letter) => [
      letter.char,
      {
        shadow: outline(cells("shadow", letter.x / CELL, letter.x / CELL + LETTER), letter.x),
        body: outline(cells("body", letter.x / CELL, letter.x / CELL + LETTER), letter.x),
      },
    ]),
  )
  return `// Generated by script/osta/wordmark.ts from packages/tui/src/logo.ts. Do not edit by hand.

/** Wordmark size in viewBox units; one terminal logo cell is 6×6 units. */
export const WIDTH = ${width}
export const HEIGHT = ${height}

export type Letter = {
  readonly char: string
  /** Left edge of the letter's 24-unit box. */
  readonly x: number
  /** "left" letters use the muted fill, "right" letters the strong one, like the terminal logo. */
  readonly side: "left" | "right"
  readonly shadow: string
  readonly body: string
}

/** The wordmark's letters, in wordmark coordinates. */
export const LETTERS: readonly Letter[] = ${JSON.stringify(list, null, 2)}

/** Each letter drawn in its own 24×42 box, for animations that place letters freely. */
export const GLYPHS: Readonly<Record<string, { readonly shadow: string; readonly body: string }>> = ${JSON.stringify(glyphs, null, 2)}

/** The wordmark as a pin grid, 3 units per pin: "." empty, "1" counter shadow, "2" left letters, "3" right letters. */
export const PINS: readonly string[] = ${JSON.stringify(pins(), null, 2)}
`
}

function readmeSvg(left: string, right: string, shadow: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * 3}" height="${height * 3}" fill="none" role="img" aria-label="Osta">
${svgPaths(left, right, shadow).join("\n")}
</svg>
`
}

async function oauthPage() {
  const file = path.join(root, "packages/core/src/oauth/page.ts")
  const source = await Bun.file(file).text()
  const start = source.indexOf("const WORDMARK = `")
  const end = source.indexOf("</svg>`", start)
  if (start === -1 || end === -1) throw new Error("WORDMARK not found in oauth/page.ts")
  const svg = `const WORDMARK = \`<svg class="wordmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none" aria-label="Osta" role="img">
${svgPaths("var(--oc-icon-base)", "var(--oc-icon-strong)", "var(--oc-icon-weak)")
  .map((item) => `        ${item}`)
  .join("\n")}
      `
  return source.slice(0, start) + svg + source.slice(end)
}

if (import.meta.main) {
  const check = process.argv.includes("--check")
  const outputs: [string, string][] = [
    [
      path.join(root, "packages/ui/src/components/wordmark-geometry.tsx"),
      await format(geometryModule(), { parser: "typescript", semi: false, printWidth: 120 }),
    ],
    [path.join(root, "packages/core/src/oauth/page.ts"), await oauthPage()],
    [path.join(root, ".github/assets/osta-light.svg"), readmeSvg("#8e8e93", "#1c1c1e", "#d1d1d6")],
    [path.join(root, ".github/assets/osta-dark.svg"), readmeSvg("#8e8e93", "#ffffff", "#3a3a3c")],
  ]
  let stale = 0
  for (const [file, content] of outputs) {
    const current = await Bun.file(file)
      .text()
      .catch(() => "")
    if (current === content) continue
    stale++
    if (check) console.log(`out of date: ${path.relative(root, file)}`)
    else await Bun.write(file, content)
  }
  console.log(check ? `${stale} generated files out of date` : `wrote ${stale} files`)
  if (check && stale) process.exit(1)
}
