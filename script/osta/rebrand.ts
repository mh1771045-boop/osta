#!/usr/bin/env bun
// Rewrites user-visible "OpenCode"/"opencode <command>" text to Osta in string literals,
// template text and JSX text. Identifiers, imports, package names, config file names and
// upstream service names (OpenCode Zen, Go, Console, ...) are left alone, so the script can
// be re-run after every upstream merge. Usage: bun script/osta/rebrand.ts [--dry | --check]
// --check exits non-zero when anything still needs rebranding (used in CI).
import ts from "typescript"
import path from "path"
import { Glob } from "bun"

const root = path.resolve(import.meta.dirname, "../..")
const check = process.argv.includes("--check")
const dry = check || process.argv.includes("--dry")

const packages = ["cli", "tui", "core", "server", "util", "client", "app", "ui", "session-ui", "desktop"]
const skip = [
  /models-dev[/\\]snapshot/,
  /plugin[/\\]provider[/\\]/,
  // Provider tests mirror those sources, which name the upstream services.
  /test[/\\]plugin[/\\]provider-/,
  /github-copilot[/\\]/,
  /[/\\]node_modules[/\\]/,
  /[/\\]dist[/\\]/,
  /\.d\.ts$/,
]

const commands =
  "upgrade|update|uninstall|acp|api|debug|auth|mcp|plugin|models|stats|mini|run|session|service|reload|pair|serve|github|agent|export|import|web|tui|providers|db"

export function rewrite(text: string) {
  return text
    .replace(/\bOpenCode(?![A-Za-z0-9_]|\.[a-z])(?! (?:Zen|Go|Console|Black|Enterprise|Desktop app store)\b)/g, "Osta")
    .replace(new RegExp(`\\bopencode(?= (?:${commands})\\b| -{1,2}[a-zA-Z])`, "g"), "osta")
    .replace(/`opencode`/g, "`osta`")
}

function edits(file: string, source: string) {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
  const out: { start: number; end: number; text: string }[] = []
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportTypeNode(node)) return
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) return
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      // Object keys and element access keys are data, not display text.
      if (ts.isStringLiteral(node) && node.parent && ts.isPropertyAssignment(node.parent) && node.parent.name === node)
        return
      const start = node.getStart(sf)
      // `osta-keep` on the line or the line above keeps upstream names, such as the opencode provider's own.
      const { line } = sf.getLineAndCharacterOfPosition(start)
      const lines = sf.getLineStarts()
      const context = source.slice(lines[Math.max(0, line - 1)], lines[line + 1] ?? source.length)
      if (context.includes("osta-keep")) return
      const original = source.slice(start, node.end)
      const next = rewrite(original)
      if (next !== original) out.push({ start, end: node.end, text: next })
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

let changed = 0
for (const pkg of packages) {
  const dir = path.join(root, "packages", pkg)
  for await (const rel of new Glob("{src,test}/**/*.{ts,tsx}").scan({ cwd: dir })) {
    const file = path.join(dir, rel)
    if (skip.some((re) => re.test(file))) continue
    const source = await Bun.file(file).text()
    if (!/OpenCode|opencode/.test(source)) continue
    const list = edits(file, source)
    if (!list.length) continue
    changed++
    let next = source
    for (const edit of list.sort((a, b) => b.start - a.start)) {
      if (dry) console.log(`${path.relative(root, file)}: ${source.slice(edit.start, edit.end).slice(0, 160)}\n   -> ${edit.text.slice(0, 160)}`)
      next = next.slice(0, edit.start) + edit.text + next.slice(edit.end)
    }
    if (!dry) await Bun.write(file, next)
  }
}
console.log(`${dry ? "would change" : "changed"} ${changed} files`)
if (check && changed > 0) process.exit(1)
