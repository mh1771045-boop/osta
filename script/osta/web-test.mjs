// End-to-end checks for the web app (web/) in Chromium, with Puter replaced by a local fake.
// Serves web/ under /osta/ like GitHub Pages does, then walks every main flow.
//   node script/osta/web-test.mjs [screenshot-dir]
import { createRequire } from "node:module"
import { createServer } from "node:http"
import { mkdirSync, readFileSync, existsSync } from "node:fs"
import { dirname, extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const { chromium, devices } = require("playwright")
const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
const web = join(root, "web")
const shots = process.argv[2] || join(root, "tmp/web-test")
mkdirSync(shots, { recursive: true })

// ---- Static server: /osta/* -> web/*, with a switch to publish a "new" service worker ----
let swSuffix = ""
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" }
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname)
  if (path === "/osta") return res.writeHead(301, { location: "/osta/" }).end()
  if (!path.startsWith("/osta/")) return res.writeHead(404).end()
  const file = normalize(join(web, path.slice(6) || "index.html"))
  if (!file.startsWith(web) || !existsSync(file)) return res.writeHead(404).end()
  let body = readFileSync(file)
  if (path === "/osta/sw.js" && swSuffix) body = Buffer.from(body.toString().replace(/const VERSION = "([^"]+)"/, `const VERSION = "$1${swSuffix}"`))
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(body)
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const base = `http://127.0.0.1:${server.address().port}/osta/`

// ---- Fake Puter: same surface the app uses, steered through localStorage ----
const REPLY = [
  "تمام، ده مثال بسيط:",
  "",
  "```js",
  'console.log("أهلاً")',
  "```",
  "",
  "- خطوة أولى",
  "- خطوة تانية",
  "",
  "| العمود | القيمة |",
  "|---|---|",
  "| أ | ١ |",
  "",
  "LEARN: المستخدم بيكتب JavaScript",
].join("\n")
const QUIZ = JSON.stringify({
  title: "الخلية",
  questions: [
    { type: "mcq", q: "إيه وحدة بناء الكائن الحي؟", choices: ["الذرة", "الخلية", "العضو", "النسيج"], answer: 1, explain: "الملف بيقول إن الخلية هي وحدة بناء الكائن الحي." },
    { type: "tf", q: "النواة بتتحكم في أنشطة الخلية.", answer: true, explain: "النواة هي مركز التحكم في الخلية." },
    { type: "mcq", q: "فين بتتنتج الطاقة في الخلية؟", choices: ["النواة", "الجدار", "الميتوكوندريا", "الفجوة"], answer: 2, explain: "الميتوكوندريا هي بيت الطاقة." },
  ],
})
const MODELS = ["gpt-5.4-nano", "gpt-5.4-mini", "gpt-5.4", "claude-sonnet-4-5", "claude-sonnet-4-6", "claude-sonnet-4-20250514", "claude-haiku-4-5", "gemini-2.5-pro", "gemini-2.5-flash", "openrouter:anthropic/claude-sonnet-9"]
const FAKE_PUTER = `(() => {
  const ls = localStorage;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const calls = (window.__puterCalls = []);
  window.puter = {
    auth: {
      isSignedIn: () => ls.getItem("mock.signed") === "1",
      signIn: async () => {
        if (ls.getItem("mock.signin") === "cancel") throw { error: "auth_window_closed", msg: "closed" };
        ls.setItem("mock.signed", "1");
        return { username: "tester" };
      },
      signOut: () => ls.removeItem("mock.signed"),
      getUser: async () => ({ username: "tester", is_temp: true }),
      getMonthlyUsage: async () => ({ allowanceInfo: { monthUsageAllowance: 1000, remaining: 640 } }),
    },
    ai: {
      listModels: async () => ${JSON.stringify(MODELS)}.map((id) => ({ id, provider: "x" })),
      chat: async (messages, options) => {
        calls.push({ messages: JSON.parse(JSON.stringify(messages)), model: options?.model ?? null, stream: options?.stream });
        const mode = ls.getItem("mock.mode") || "ok";
        if (mode === "funds") throw { success: false, error: { code: "insufficient_funds", message: "Your account does not have enough funding." } };
        if (mode === "badmodel" && options?.model) throw { success: false, error: { code: "model_not_found", message: "Model not found" } };
        const quiz = typeof messages[0]?.content === "string" && messages[0].content.includes("Return only JSON");
        const pieces = (quiz ? "\`\`\`json\\n" + ${JSON.stringify(QUIZ)} + "\\n\`\`\`" : ls.getItem("mock.reply") || ${JSON.stringify(REPLY)}).match(/[\\s\\S]{1,12}/g);
        const delay = Number(ls.getItem("mock.delay") || 5);
        return (async function* () {
          for (const piece of pieces) {
            await sleep(delay);
            if (options?.signal?.aborted) throw { code: "aborted", message: "aborted" };
            yield { type: "text", text: piece };
          }
          yield { type: "usage", usage: { cost: 1 }, finish_reason: "stop" };
        })();
      },
    },
  };
})();`

// Keep the run offline from the real CDNs: page requests are answered by the routes
// below, and the service worker's own refreshes fail instead of fetching the real
// Puter over the fake one in its cache (CI machines can reach the internet).
const browser = await chromium.launch({
  args: ["--host-resolver-rules=" + ["js.puter.com", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"].map((h) => `MAP ${h} 127.0.0.1:9`).join(", ")],
})
const results = []
async function test(name, fn) {
  try {
    await fn()
    results.push([true, name])
    console.log("PASS", name)
  } catch (e) {
    results.push([false, name, e])
    console.log("FAIL", name, "\n   ", String(e?.message || e).split("\n").slice(0, 6).join("\n    "))
  }
}
function assert(ok, message) {
  if (!ok) throw new Error(message)
}

async function newContext(options = {}) {
  const context = await browser.newContext({ locale: "ar-EG", acceptDownloads: true, ...options })
  await context.route("https://js.puter.com/**", (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_PUTER }))
  await context.route("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/**", (route) => route.fulfill({ contentType: "text/javascript", body: readFileSync(pdfjsFile(route.request().url())) }))
  await context.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" }))
  await context.route("https://fonts.gstatic.com/**", (route) => route.abort())
  return context
}
// The service worker fetches Puter's script itself once it controls the page, and
// context.route() can't see those requests, so put the fake where a returning user
// has the real one: in the worker's runtime cache.
async function seedPuter(page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  const files = { "https://js.puter.com/v2/": FAKE_PUTER }
  for (const name of ["pdf.min.js", "pdf.worker.min.js"]) files[PDFJS + name] = readFileSync(pdfjsFile(name), "utf8")
  await page.evaluate((files) => caches.open("osta-web-runtime").then((c) => Promise.all(Object.entries(files).map(([url, body]) => c.put(url, new Response(body, { headers: { "content-type": "text/javascript" } }))))), files)
}
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/"
const pdfjsFile = (url) => require.resolve("pdfjs-dist/build/" + url.split("/").pop())
function watchErrors(page) {
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.gstatic|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  return errors
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.querySelector(".app").scrollWidth <= document.querySelector(".app").clientWidth)
const calls = (page) => page.evaluate(() => window.__puterCalls)
const idle = (page) => page.waitForFunction(() => !document.getElementById("btn-send").hidden && !document.getElementById("live"), null, { timeout: 15000 })
async function sendMessage(page, text) {
  await page.fill("#input", text)
  await page.click("#btn-send")
}
async function openSheet(page, button, sheet) {
  await page.click(button)
  await page.waitForSelector(`${sheet}.open`)
  await page.waitForTimeout(500)
}
async function closeSheet(page, sheet) {
  await page.click(`${sheet} [data-close]`)
  await page.waitForSelector(sheet, { state: "hidden" })
}

// ---- Phone, light ----
const phone = await newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: "light" })
const page = await phone.newPage()
const errors = watchErrors(page)

await test("loads clean on a phone", async () => {
  await page.goto(base)
  await page.waitForSelector(".welcome h1")
  await seedPuter(page)
  assert(await noOverflow(page), "horizontal overflow at 390px")
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(shots, "01-welcome-light.png") })
  assert(errors.length === 0, "page errors: " + errors.join(" | "))
})

await test("asks to sign in once, and a cancelled sign-in says so", async () => {
  await page.evaluate(() => localStorage.setItem("mock.signin", "cancel"))
  await sendMessage(page, "اعملّي زرار")
  await page.waitForSelector("#sheet-signin.open")
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(shots, "02-signin.png") })
  await page.click("#btn-signin")
  await page.waitForFunction(() => document.getElementById("signin-error").textContent.includes("مكمّلتش"))
  assert((await page.inputValue("#input")) === "اعملّي زرار", "the message left the composer before sign-in")
})

await test("signs in, streams the reply, hides LEARN and remembers the lesson", async () => {
  await page.evaluate(() => localStorage.removeItem("mock.signin"))
  await page.click("#btn-signin")
  await page.waitForSelector("#sheet-signin", { state: "hidden" })
  await idle(page)
  const md = await page.textContent(".msg.assistant .md")
  assert(md.includes("مثال بسيط"), "reply text missing: " + md)
  assert(!md.includes("LEARN"), "LEARN line shown to the user")
  assert(await page.isVisible(".msg.assistant .codeblock"), "code block missing")
  assert(await page.isVisible(".msg.assistant table"), "table missing")
  assert((await page.textContent(".learned")).includes("JavaScript"), "lesson chip missing")
  const [call] = await calls(page)
  assert(call.stream === true, "not streaming")
  assert(call.messages[0].role === "system" && call.messages[0].content.includes("Nothing yet"), "system prompt missing")
  assert(call.model === null, "the default should be Puter's cheapest model, got " + call.model)
  await page.screenshot({ path: join(shots, "03-reply-light.png") })
})

await test("the next message carries the lesson and the history", async () => {
  await sendMessage(page, "كمّل")
  await idle(page)
  const list = await calls(page)
  const last = list[list.length - 1]
  assert(last.messages[0].content.includes("المستخدم بيكتب JavaScript"), "lesson not in the system prompt")
  assert(last.messages.length === 4, "expected system + 3 turns, got " + last.messages.length)
  assert((await page.locator(".learned").count()) === 0, "a known lesson was announced again")
})

await test("settings: account, credit, and the balanced model", async () => {
  await openSheet(page, "#btn-settings", "#sheet-settings")
  await page.waitForFunction(() => document.getElementById("acct-name").textContent === "tester")
  assert(await page.isVisible("#credit-row"), "credit row hidden")
  assert((await page.textContent("#credit-value")).includes("٦٤"), "credit value wrong")
  assert((await page.getAttribute("[data-tier=light]", "aria-checked")) === "true", "«الأوفر» is not the default")
  await page.waitForFunction(() => document.getElementById("model-name").textContent === "النموذج الافتراضي في Puter")
  await page.click("[data-tier=best]")
  await page.waitForFunction(() => document.getElementById("model-name").textContent.includes("Claude Sonnet 4.6"))
  await page.screenshot({ path: join(shots, "04-settings-light.png") })
  await page.click("[data-tier=balanced]")
  await page.waitForFunction(() => document.getElementById("model-name").textContent === "GPT-5.4 mini")
  await closeSheet(page, "#sheet-settings")
  await sendMessage(page, "سؤال سريع")
  await idle(page)
  const list = await calls(page)
  assert(list[list.length - 1].model === "gpt-5.4-mini", "balanced tier not used")
})

await test("out of free credit: clear message, nothing lost", async () => {
  await page.evaluate(() => localStorage.setItem("mock.mode", "funds"))
  const turns = await page.locator(".msg").count()
  await sendMessage(page, "اختبار الرصيد")
  await idle(page)
  await page.waitForSelector(".banner[role=alert]")
  assert((await page.textContent(".banner")).includes("الرصيد"), "funds copy missing")
  assert((await page.inputValue("#input")) === "اختبار الرصيد", "message not given back")
  assert((await page.locator(".msg").count()) === turns, "failed message stayed in the chat")
  await page.screenshot({ path: join(shots, "05-funds.png") })
  await page.evaluate(() => localStorage.removeItem("mock.mode"))
  await page.fill("#input", "")
})

await test("stop keeps what arrived", async () => {
  await page.evaluate(() => localStorage.setItem("mock.delay", "80"))
  await sendMessage(page, "رد طويل")
  await page.waitForSelector("#btn-stop:not([hidden])")
  await page.waitForTimeout(400)
  await page.click("#btn-stop")
  await idle(page)
  assert((await page.locator(".msg.assistant .note").last().textContent()).includes("وقّفته"), "stop note missing")
  await page.evaluate(() => localStorage.removeItem("mock.delay"))
})

await test("reply again replaces the last answer", async () => {
  const before = await page.locator(".msg").count()
  await page.click("[data-retry]")
  await idle(page)
  assert((await page.locator(".msg").count()) === before, "turn count changed")
  assert(!(await page.locator(".msg.assistant").last().textContent()).includes("وقّفته"), "old reply still there")
})

await test("a model that disappeared falls back to Puter's default", async () => {
  await page.evaluate(() => localStorage.setItem("mock.mode", "badmodel"))
  await sendMessage(page, "جرّب")
  await idle(page)
  const list = await calls(page)
  assert(list[list.length - 2].model && list[list.length - 1].model === null, "no fallback call")
  assert((await page.locator(".msg.assistant").last().textContent()).includes("مثال"), "no reply after fallback")
  await page.evaluate(() => localStorage.removeItem("mock.mode"))
})

await test("markdown is escaped and lessons parse strictly", async () => {
  const out = await page.evaluate(() => ({
    html: window.osta.markdown("<img src=x onerror=alert(1)> **b** `<i>`"),
    learning: window.osta.splitLessons("LEARNING is fun").lessons.length,
    bold: window.osta.splitLessons("hi\n**LEARN:** uses Vue").lessons[0],
  }))
  assert(!out.html.includes("<img") && out.html.includes("&lt;img") && out.html.includes("<strong>b</strong>"), "unsafe markdown: " + out.html)
  assert(out.learning === 0, "LEARNING matched as a lesson")
  assert(out.bold === "uses Vue", "bold LEARN not parsed: " + out.bold)
})

await test("model tiers pick the newest fitting model", async () => {
  const r = await page.evaluate(() => {
    const o = window.osta
    return [
      o.pickModel(["gpt-5.4", "gpt-5.2", "gemini-2.5-pro"], "best"),
      o.pickModel(["gemini-2.5-pro", "gemini-3-pro"], "best"),
      o.pickModel([], "best"),
      o.pickModel(["claude-sonnet-4-5"], "light"),
      o.pickModel(["claude-haiku-4-5", "gemini-2.5-flash"], "balanced"),
      o.modelLabel("claude-sonnet-4-6"),
      o.modelLabel("gemini-2.5-pro"),
      o.modelLabel("claude-sonnet-4-5-20250929"),
    ]
  })
  const want = ["gpt-5.4", "gemini-3-pro", null, null, "claude-haiku-4-5", "Claude Sonnet 4.6", "Gemini 2.5 Pro", "Claude Sonnet 4.5"]
  assert(JSON.stringify(r) === JSON.stringify(want), JSON.stringify(r))
})

await test("memory sheet: add and forget a lesson", async () => {
  await openSheet(page, "#btn-memory", "#sheet-memory")
  await page.fill("#lesson-input", "بحب الردود القصيرة")
  await page.click("#lesson-form button")
  await page.waitForSelector("text=بحب الردود القصيرة")
  await page.screenshot({ path: join(shots, "06-memory.png") })
  const count = await page.locator("[data-forget]").count()
  await page.locator("[data-forget]").last().click()
  assert((await page.locator("[data-forget]").count()) === count - 1, "forget failed")
  await closeSheet(page, "#sheet-memory")
})

await test("chats, lessons and settings survive a reload", async () => {
  await page.reload()
  await page.waitForSelector(".welcome")
  await openSheet(page, "#btn-chats", "#sheet-chats")
  assert((await page.locator("[data-open]").count()) === 1, "chat list wrong")
  await page.screenshot({ path: join(shots, "07-chats.png") })
  await page.click("[data-open]")
  await page.waitForSelector(".msg.assistant")
  assert((await page.locator(".msg.user").count()) >= 4, "turns missing after reload")
  const saved = await page.evaluate(() => [JSON.parse(localStorage.getItem("osta:lessons")).length, JSON.parse(localStorage.getItem("osta:settings")).tier])
  assert(saved[0] === 1 && saved[1] === "balanced", "lessons or settings lost: " + saved)
})

await test("backup, wipe and restore", async () => {
  await openSheet(page, "#btn-settings", "#sheet-settings")
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#btn-backup")])
  const file = join(shots, "backup.json")
  await download.saveAs(file)
  const data = JSON.parse(readFileSync(file, "utf8"))
  assert(data.app === "osta" && data.chats.length === 1 && data.lessons.length === 1, "backup content wrong")
  await page.click("#btn-wipe")
  assert((await page.textContent("#wipe-label")).includes("متأكد"), "wipe did not ask first")
  await page.click("#btn-wipe")
  await page.waitForSelector(".welcome")
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem("osta:chats")).length === 0), "wipe failed")
  await openSheet(page, "#btn-settings", "#sheet-settings")
  await page.setInputFiles("#restore-file", file)
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("osta:chats")).length === 1)
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem("osta:lessons")).length === 1), "lessons not restored")
  await page.setInputFiles("#restore-file", { name: "x.json", mimeType: "application/json", buffer: Buffer.from("{\"nope\":1}") })
  await page.waitForSelector("#toast.show >> text=مش نسخة")
  await closeSheet(page, "#sheet-settings")
})

await test("dark theme from settings, kept after reload", async () => {
  await openSheet(page, "#btn-settings", "#sheet-settings")
  await page.click("[data-theme-choice=dark]")
  await page.waitForFunction(() => document.getElementById("model-name").textContent === "GPT-5.4 mini")
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(shots, "08-settings-dark.png") })
  await closeSheet(page, "#sheet-settings")
  await page.reload()
  await page.waitForSelector(".welcome")
  assert((await page.getAttribute("html", "data-theme")) === "dark", "theme not kept")
  await openSheet(page, "#btn-chats", "#sheet-chats")
  await page.click("[data-open]")
  await page.waitForSelector(".msg.assistant")
  await page.waitForTimeout(300)
  assert(await noOverflow(page), "overflow in dark chat")
  await page.screenshot({ path: join(shots, "09-reply-dark.png") })
  assert(errors.length === 0, "page errors: " + errors.join(" | "))
})
await test("study: PDF and image in, exam out", async () => {
  const maker = await browser.newPage()
  await maker.setContent(`<html dir="rtl"><body style="font:16px sans-serif;padding:40px"><h1>Biology: the cell</h1>
    <p>The cell is the basic unit of life. Every living thing is made of one or more cells.</p>
    <p>The nucleus controls the activities of the cell. Mitochondria produce the energy the cell needs.</p>
    <p>الخلية هي وحدة بناء الكائن الحي، والنواة بتتحكم في أنشطتها.</p></body></html>`)
  const pdf = join(shots, "material.pdf")
  await maker.pdf({ path: pdf, format: "A4" })
  await maker.close()
  await page.click("#btn-study")
  await page.waitForSelector("#study.open")
  await page.waitForTimeout(500)
  await page.setInputFiles("#study-file", [pdf, join(web, "icons/icon-192.png")])
  await page.waitForFunction(() => document.querySelectorAll(".file-row").length === 2 && !document.getElementById("study-body").textContent.includes("بيقرا"), null, { timeout: 20000 })
  assert((await page.textContent(".file-row")).includes("صفحة"), "PDF page count missing")
  await page.click("[data-seg=count] [data-value='5']")
  assert((await page.getAttribute("[data-seg=count] [data-value='5']", "aria-checked")) === "true", "count segment not updated")
  await page.screenshot({ path: join(shots, "15-study-home.png") })
  await page.click("#study-start")
  await page.waitForSelector(".choice", { timeout: 15000 })
  const list = await calls(page)
  const call = list[list.length - 1]
  assert(call.messages[0].content.includes("Exactly 5 questions"), "count not in the prompt")
  const parts = call.messages[1].content
  assert(Array.isArray(parts) && parts[0].text.includes("basic unit of life"), "PDF text not sent")
  assert(parts.some((x) => x.type === "image_url"), "image not sent")
  await page.screenshot({ path: join(shots, "16-question.png") })
})

await test("study: grades, explains, and keeps the result", async () => {
  await page.click("[data-answer='1']")
  await page.waitForSelector(".choice.right")
  assert(await page.isVisible(".feedback.yes"), "right answer not confirmed")
  await page.click("[data-next]")
  await page.click("[data-answer='false']")
  await page.waitForSelector(".feedback.no")
  assert((await page.textContent(".feedback h4")).includes("الصح: صح"), "correct answer not shown")
  await page.click("[data-more]")
  await page.waitForFunction(() => document.getElementById("study-deep").textContent.includes("مثال"), null, { timeout: 15000 })
  assert(!(await page.textContent("#study-deep")).includes("LEARN"), "LEARN shown in an explanation")
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(shots, "17-explain.png") })
  await page.click("[data-next]")
  await page.click("[data-answer='2']")
  await page.click("[data-next]")
  await page.waitForSelector(".result")
  assert((await page.textContent(".result p")).includes("٢ صح من ٣"), "score wrong: " + (await page.textContent(".result p")))
  await page.waitForTimeout(1100)
  await page.screenshot({ path: join(shots, "18-result.png") })
  await page.click("[data-retake-wrong]")
  await page.waitForSelector(".choice")
  assert((await page.textContent(".quiz-top")).includes("من ١"), "retake should hold only the wrong question")
  await page.click("[data-answer='true']")
  await page.click("[data-next]")
  await page.waitForSelector(".result")
  await page.click("#study-back")
  await page.waitForSelector("[data-exam]")
  assert((await page.locator("[data-exam]").count()) === 2, "exam history wrong")
  assert((await page.textContent(".score")).includes("١/١"), "retake score missing")
  await page.screenshot({ path: join(shots, "19-study-history.png") })
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("osta:study")).exams.length)
  assert(kept === 2, "exams not saved")
  await page.click("#study-back")
  await page.waitForSelector("#study", { state: "hidden" })
})

await test("study: tolerant quiz parsing", async () => {
  const r = await page.evaluate(() => {
    const q = window.osta.parseQuiz('Here:\n```json\n{"title":"T","questions":[{"type":"tf","q":"x","answer":"صح","explain":"e"},{"type":"mcq","q":"y","choices":["a","b"],"answer":5},{"q":"z","choices":["a","b","c"],"answer":"2"}]}\n```', 10)
    return q.questions.map((x) => x.type + ":" + x.answer)
  })
  assert(JSON.stringify(r) === JSON.stringify(["tf:true", "mcq:2"]), JSON.stringify(r))
})
await phone.close()

// ---- Desktop ----
await test("desktop layout, dark system theme", async () => {
  const context = await newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" })
  const p = await context.newPage()
  const errs = watchErrors(p)
  await p.goto(base)
  await p.evaluate(() => localStorage.setItem("osta:settings", JSON.stringify({ theme: "auto", tier: "best" })))
  await p.reload()
  await p.waitForSelector(".welcome")
  assert(await p.evaluate(() => JSON.parse(localStorage.getItem("osta:settings")).tier === "light"), "old settings kept the expensive tier")
  assert(await noOverflow(p), "overflow at 1440px")
  await p.screenshot({ path: join(shots, "10-desktop-dark.png") })
  await p.click("#btn-settings")
  await p.waitForSelector("#sheet-settings.open")
  await p.waitForTimeout(400)
  await p.screenshot({ path: join(shots, "11-desktop-settings.png") })
  assert(errs.length === 0, "page errors: " + errs.join(" | "))
  await context.close()
})

// ---- iPhone Safari: install instructions ----
await test("iPhone gets add-to-home-screen steps", async () => {
  const context = await newContext({ ...devices["iPhone 13"] })
  const p = await context.newPage()
  await p.goto(base)
  await p.waitForSelector("#install-card")
  await p.click("[data-install]")
  await p.waitForSelector("#sheet-install.open")
  await p.waitForTimeout(500)
  assert((await p.textContent("#install-steps")).includes("الشاشة الرئيسية"), "iOS steps missing")
  await p.screenshot({ path: join(shots, "12-install-ios.png") })
  await p.click("#sheet-install [data-close]")
  await p.click("[data-dismiss-install]")
  assert((await p.locator("#install-card").count()) === 0, "install card not dismissed")
  await context.close()
})

// ---- PWA: service worker, installability, offline, update ----
await test("installable, works offline, offers updates", async () => {
  const context = await newContext({ viewport: { width: 390, height: 844 } })
  const p = await context.newPage()
  await p.goto(base)
  await seedPuter(p)
  await p.reload()
  await p.waitForSelector(".welcome")
  assert(await p.evaluate(() => !!navigator.serviceWorker.controller), "service worker not controlling")
  const cdp = await context.newCDPSession(p)
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors")
  assert(installabilityErrors.length === 0, "not installable: " + JSON.stringify(installabilityErrors))
  const manifest = await cdp.send("Page.getAppManifest")
  assert(!manifest.errors?.length, "manifest errors: " + JSON.stringify(manifest.errors))

  await context.setOffline(true)
  await p.reload()
  await p.waitForSelector(".welcome")
  await p.waitForFunction(() => document.getElementById("status").textContent === "مفيش إنترنت")
  await p.screenshot({ path: join(shots, "13-offline.png") })
  await context.setOffline(false)
  await p.reload()
  await p.waitForSelector(".welcome")

  swSuffix = "-next"
  await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()))
  await p.waitForSelector("#toast.show >> text=نسخة جديدة", { timeout: 10000 })
  await p.screenshot({ path: join(shots, "14-update.png") })
  await Promise.all([p.waitForEvent("load"), p.click("#toast-btn")])
  await p.waitForSelector(".welcome")
  const keys = await p.evaluate(() => caches.keys())
  const shell = readFileSync(join(web, "sw.js"), "utf8").match(/const VERSION = "([^"]+)"/)[1]
  assert(keys.includes(shell + "-next") && !keys.includes(shell), "caches after update: " + keys)
  swSuffix = ""
  await context.close()
})

await browser.close()
server.close()
const failed = results.filter((r) => !r[0])
console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots: ${shots}`)
process.exit(failed.length ? 1 : 0)
