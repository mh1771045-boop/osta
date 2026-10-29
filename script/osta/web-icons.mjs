// Draws Osta's app icons for the web app (web/icons): the wordmark in white and gray
// on a graphite gradient, like the terminal logo. Run with node after changing the design; the PNGs are committed.
//   node script/osta/web-icons.mjs
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const { chromium } = require("playwright")
const out = join(dirname(fileURLToPath(import.meta.url)), "../../web/icons")
mkdirSync(out, { recursive: true })

// The wordmark from packages/ui/src/components/wordmark-geometry.tsx: [side, faint fill, letter].
const MARK = [
  ["l", "M6 18L18 18L18 30L6 30Z", "M0 6L24 6L24 36L0 36ZM6 12L6 30L18 30L18 12Z"],
  ["l", "M36 12L54 12L54 18L36 18ZM30 24L48 24L48 30L30 30Z", "M30 6L54 6L54 12L36 12L36 18L54 18L54 36L30 36L30 30L48 30L48 24L30 24Z"],
  ["r", "M66 18L84 18L84 30L66 30Z", "M60 0L66 0L66 6L84 6L84 12L66 12L66 30L84 30L84 36L60 36Z"],
  ["r", "M90 12L108 12L108 18L90 18ZM96 24L108 24L108 30L96 30Z", "M90 6L114 6L114 36L90 36L90 18L108 18L108 12L90 12ZM96 24L96 30L108 30L108 24Z"],
]

function icon({ radius, scale }) {
  const x = (512 - 114 * scale) / 2
  const y = (512 - 36 * scale) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a3a3c"/>
      <stop offset="1" stop-color="#0c0c0d"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#bg)"/>
  <g transform="translate(${x} ${y}) scale(${scale})">
    ${MARK.map(([side, faint, letter]) => `<path d="${faint}" fill="#ffffff" fill-opacity="0.2"/><path d="${letter}" fill="${side === "l" ? "#a1a1a6" : "#ffffff"}"/>`).join("\n    ")}
  </g>
</svg>
`
}

const rounded = icon({ radius: 115, scale: 3.3 })
const fullBleed = icon({ radius: 0, scale: 3.3 })
const maskable = icon({ radius: 0, scale: 2.7 })
writeFileSync(join(out, "icon.svg"), rounded)

const browser = await chromium.launch()
const page = await browser.newPage()
async function png(svg, size, file) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`,
  )
  await page.locator("svg").screenshot({ path: join(out, file), omitBackground: true })
}
await png(rounded, 32, "icon-32.png")
await png(rounded, 192, "icon-192.png")
await png(rounded, 512, "icon-512.png")
await png(maskable, 512, "icon-maskable-512.png")
await png(fullBleed, 180, "apple-touch-icon.png")
await browser.close()
console.log("icons written to", out)
