// Osta on the web: a chat client for Osta's way of working, answered through Puter
// (free for the user, no API key). Chats and lessons stay in this browser.
(() => {
  "use strict";

  const VERSION = "1.0.0";
  const PUTER_SRC = "https://js.puter.com/v2/";
  const $ = (id) => document.getElementById(id);

  // ---- Wordmark (generated from Osta's terminal logo) ----
  const MARK = [
    ["l", "M6 18L18 18L18 30L6 30Z", "M0 6L24 6L24 36L0 36ZM6 12L6 30L18 30L18 12Z"],
    ["l", "M36 12L54 12L54 18L36 18ZM30 24L48 24L48 30L30 30Z", "M30 6L54 6L54 12L36 12L36 18L54 18L54 36L30 36L30 30L48 30L48 24L30 24Z"],
    ["r", "M66 18L84 18L84 30L66 30Z", "M60 0L66 0L66 6L84 6L84 12L66 12L66 30L84 30L84 36L60 36Z"],
    ["r", "M90 12L108 12L108 18L90 18ZM96 24L108 24L108 30L96 30Z", "M90 6L114 6L114 36L90 36L90 18L108 18L108 12L90 12ZM96 24L96 30L108 30L108 24Z"],
  ];
  const markSVG = () =>
    `<svg viewBox="0 0 114 42" aria-hidden="true">` +
    MARK.map(([side, weak, body]) =>
      `<path d="${weak}" fill="var(--mark-weak)"/><path d="${body}" fill="var(--mark-${side === "l" ? "left" : "right"})"/>`).join("") +
    `</svg>`;
  $("nav-mark").outerHTML = markSVG();

  // ---- Osta's instructions for chat ----
  const RULES = (lessons) => `You are Osta (أسطى), a coding agent. "Osta" is what Egyptians call a master craftsman: someone who does the job right the first time, quickly, and without being watched. Work like that.

You are talking with the user in Osta's web app. You cannot see or change their files and cannot run commands here, so when they want something built, give complete, working files they can copy, say exactly where each goes and how to run and check it. The full Osta that edits files and runs commands on their computer is at https://github.com/mh1771045-boop/osta; mention it only when that would clearly help.

# Language
- Reply in the language the user writes in. For Arabic, write natural, clear Arabic (Egyptian when the user writes Egyptian). Switch when the user switches.
- Code, identifiers, comments and file names stay in English.

# How you work
1. Understand: read the request and the lessons below. Don't ask what they already answer.
2. Decide: pick the simplest correct solution. Ask only when a choice really belongs to the user; otherwise state your assumption in one line and continue.
3. Act: give finished work, not a sketch: complete code, empty/error/edge cases handled. For user interfaces, aim for first-party polish and correct right-to-left layout for Arabic.
4. Verify: say how to test it and what to expect. Point out what you could not check.
5. Report: lead with the answer. Keep it short; no filler.
6. Learn: if this exchange taught you something durable and useful for future chats (a preference the user stated, their stack, a project detail, a mistake to avoid), add one or two lines at the very end of your reply, each exactly in this form:
LEARN: <the lesson in one short sentence, in the user's language>
Skip it for trivial chats and never record secrets.

# What you have learned about this user
${lessons.length ? lessons.map((l) => `- ${l.d}: ${l.t}`).join("\n") : "- Nothing yet."}`;

  const SUGGESTIONS = [
    "اعملّي صفحة هبوط لمطعم بالعربي",
    "اشرحلي الكود ده سطر سطر",
    "صمّملي قاعدة بيانات لمحل",
    "عندي Error ومش عارف أحلّه",
  ];

  // ---- Storage (this browser only) ----
  const K = { chats: "osta:chats", lessons: "osta:lessons", settings: "osta:settings" };
  const load = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };

  const state = {
    chats: [],      // {id, title, updated, turns: [{role, content, note?, hadImage?}]}
    currentId: null,
    lessons: [],    // {d, t}
    settings: { theme: "auto", tier: "best", installDismissed: false },
    busy: false,
    image: null,    // data URL for the next message
    pending: null,  // text waiting for sign-in
  };
  let ctl = null;

  const today = () => new Date().toISOString().slice(0, 10);
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const current = () => state.chats.find((c) => c.id === state.currentId);

  function trimChat(chat) {
    if (chat.turns.length > 80) chat.turns.splice(0, chat.turns.length - 80);
    while (chat.turns.length > 2 && JSON.stringify(chat.turns).length > 150000) chat.turns.splice(0, 2);
  }
  function saveChats() {
    state.chats.sort((a, b) => b.updated - a.updated);
    state.chats.forEach(trimChat);
    if (state.chats.length > 60) state.chats.length = 60;
    // When the browser runs out of room, let the oldest chats go first.
    while (!save(K.chats, state.chats) && state.chats.length > 1) state.chats.pop();
  }
  const saveLessons = () => save(K.lessons, state.lessons);
  const saveSettings = () => save(K.settings, state.settings);

  // ---- Puter (loaded from its CDN; cached by the service worker) ----
  let puter = null, puterLoading = null;
  function loadPuter() {
    if (puter) return Promise.resolve(puter);
    if (puterLoading) return puterLoading;
    puterLoading = new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = PUTER_SRC;
      s.async = true;
      s.onload = () => {
        puter = window.puter || null;
        try { if (puter) puter.quiet = true; } catch {}
        resolve(puter);
      };
      s.onerror = () => { s.remove(); resolve(null); };
      document.head.appendChild(s);
    }).then((p) => { if (!p) puterLoading = null; return p; });
    return puterLoading;
  }
  const signedIn = () => { try { return !!puter && puter.auth.isSignedIn(); } catch { return false; } };

  // Model tiers. The catalog changes often, so pick from what Puter lists now.
  const TIERS = {
    best: [/^claude-sonnet-\d/, /^gpt-5(\.\d+)?$/, /^gemini-[\d.]+-pro$/],
    balanced: [/^gpt-5(\.\d+)?-mini$/, /^claude-haiku-\d/, /^gemini-[\d.]+-flash$/],
  };
  const versionOf = (id) => (id.match(/\d+/g) || []).filter((n) => n.length < 6).map(Number);
  function newer(a, b) {
    const x = versionOf(a), y = versionOf(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) > (y[i] ?? -1);
    }
    return a.length < b.length; // same version: prefer the plain alias over a dated one
  }
  function pickModel(ids, tier) {
    const patterns = TIERS[tier];
    if (!patterns) return null;
    const plain = ids.filter((id) => typeof id === "string" && !/[/:]/.test(id));
    for (const re of patterns) {
      const found = plain.filter((id) => re.test(id.replace(/-\d{6,}$/, "")));
      if (found.length) return found.reduce((a, b) => (newer(b, a) ? b : a));
    }
    return null;
  }
  function modelLabel(id) {
    if (!id) return "النموذج الافتراضي في Puter";
    const parts = id.replace(/-\d{6,}$/, "").split("-");
    if (parts[0] === "gpt") return "GPT-" + parts.slice(1).join(" ");
    const out = [];
    for (const p of parts) {
      if (/^\d+$/.test(p) && /^\d[\d.]*$/.test(out[out.length - 1] || "")) out[out.length - 1] += "." + p;
      else out.push(/^\d/.test(p) ? p : p[0].toUpperCase() + p.slice(1));
    }
    return out.join(" ");
  }
  let catalog = null;
  async function modelFor(tier) {
    if (tier === "light") return null;
    if (!catalog) {
      try {
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000));
        const list = await Promise.race([puter.ai.listModels(), timeout]);
        catalog = (Array.isArray(list) ? list : []).map((m) => (typeof m === "string" ? m : m?.id || m?.name)).filter(Boolean);
      } catch { return null; }
    }
    return pickModel(catalog, tier);
  }

  // ---- Markdown (small, escape-first) ----
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = esc(s)
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code dir="ltr">${esc(codes[Number(i)])}</code>`);
  }
  const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  function markdown(src) {
    const out = [];
    const lines = src.replace(/\r\n/g, "\n").split("\n");
    let i = 0, para = [], list = null;
    const flushPara = () => { if (para.length) { out.push(`<p dir="auto">${para.map(inline).join("<br>")}</p>`); para = []; } };
    const flushList = () => { if (list) { out.push(`<${list.tag} dir="auto">${list.items.map((t) => `<li>${inline(t)}</li>`).join("")}</${list.tag}>`); list = null; } };
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^\s*(```|~~~)\s*([\w+#.-]*)\s*$/);
      if (fence) {
        flushPara(); flushList();
        const code = [];
        i++;
        while (i < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[i])) code.push(lines[i++]);
        i++;
        out.push(`<div class="codeblock" dir="ltr"><div class="bar"><span>${esc(fence[2] || "code")}</span><button data-copy>نسخ</button></div><pre><code>${esc(code.join("\n"))}</code></pre></div>`);
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1] || "")) {
        flushPara(); flushList();
        const head = cells(line);
        const rows = [];
        i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push(`<div class="table"><table dir="auto"><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
        continue;
      }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { flushPara(); flushList(); const n = Math.min(h[1].length, 3); out.push(`<h${n} dir="auto">${inline(h[2])}</h${n}>`); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); flushList(); out.push("<hr>"); i++; continue; }
      const li = line.match(/^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/);
      if (li) {
        flushPara();
        const tag = li[2] ? "ol" : "ul";
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push(li[3]); i++; continue;
      }
      const q = line.match(/^>\s?(.*)$/);
      if (q) { flushPara(); flushList(); out.push(`<blockquote dir="auto">${inline(q[1])}</blockquote>`); i++; continue; }
      if (!line.trim()) { flushPara(); flushList(); i++; continue; }
      flushList(); para.push(line); i++;
    }
    flushPara(); flushList();
    return out.join("");
  }
  // Lessons ride at the end of a reply; keep them out of what the user reads.
  function splitLessons(text) {
    const lessons = [];
    const shown = text.split("\n").filter((line) => {
      const m = line.match(/^\s*\*{0,2}LEARN\*{0,2}\s*:\*{0,2}\s*(.+)$/);
      if (m) { lessons.push(m[1].replace(/\*+$/, "").trim()); return false; }
      return !/^\s*L(E(A(R(N)?)?)?)?$/.test(line); // a lesson still being written
    }).join("\n").trimEnd();
    return { shown, lessons };
  }

  // ---- Elements ----
  const els = {
    thread: $("thread"), messages: $("messages"), input: $("input"), send: $("btn-send"), stop: $("btn-stop"),
    status: $("status"), nav: $("nav"), attach: $("btn-attach"), file: $("file"), preview: $("preview"),
    previewImg: $("preview-img"), scrim: $("scrim"), toast: $("toast"),
  };

  // ---- Rendering ----
  let deferredInstall = null;
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const canInstall = () => !isStandalone() && (!!deferredInstall || isIOS());

  // enter: how many of the newest messages slide in (the rest just appear).
  function render(enter = 0) {
    const chat = current();
    const turns = chat ? chat.turns : [];
    if (!turns.length) {
      const installCard = canInstall() && !state.settings.installDismissed
        ? `<div class="card" id="install-card"><img src="icons/icon-192.png" alt=""><div class="grow"><div class="t">ثبّت أسطى</div><div class="s">يفتح من الشاشة الرئيسية زي أي تطبيق.</div></div><button class="go" data-install>ثبّت</button><button class="x" data-dismiss-install aria-label="مش دلوقتي"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`
        : "";
      els.messages.innerHTML = `<div class="welcome">${markSVG()}<h1>أهلاً، أنا أسطى</h1>
        <p>مساعد برمجة بيشتغل زي الأسطى الشاطر. اسألني بالعربي أو بالإنجليزي، وأنا بفتكر اللي بتعلّمه عنك.</p>
        <div class="chips">${SUGGESTIONS.map((s) => `<button class="chip" data-suggest>${esc(s)}</button>`).join("")}</div>${installCard}</div>`;
      return;
    }
    const lastAssistant = turns[turns.length - 1].role === "assistant" ? turns.length - 1 : -1;
    els.messages.innerHTML = turns.map((t, i) => {
      const cls = i >= turns.length - enter ? " enter" : "";
      return t.role === "user" ? userHTML(t, cls) : assistantHTML(t, i === lastAssistant, cls);
    }).join("");
  }
  function userHTML(t, cls) {
    return `<div class="msg user${cls}">${t.hadImage ? `<span class="note">صورة مرفقة</span>` : ""}<div class="bubble" dir="auto">${esc(t.content)}</div></div>`;
  }
  const ICON_COPY = `<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`;
  const ICON_RETRY = `<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/></svg>`;
  function assistantHTML(t, last, cls) {
    const actions = last ? `<div class="actions"><button data-copy-reply>${ICON_COPY}نسخ</button><button data-retry>${ICON_RETRY}رد تاني</button></div>` : "";
    return `<div class="msg assistant${cls}"><div class="who">${markSVG()}</div><div class="md">${markdown(splitLessons(t.content).shown)}</div>${t.note ? `<span class="note">${esc(t.note)}</span>` : ""}${actions}</div>`;
  }
  function scrollToEnd(smooth) {
    els.thread.scrollTo({ top: els.thread.scrollHeight, behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
  }
  function setStatus() {
    const off = !navigator.onLine;
    els.status.textContent = state.busy ? "بيكتب…" : off ? "مفيش إنترنت" : "مساعد البرمجة";
    els.status.classList.toggle("off", off && !state.busy);
  }
  function setBusy(busy) {
    state.busy = busy;
    els.stop.hidden = !busy;
    els.send.hidden = busy;
    setStatus();
    updateSend();
  }
  function updateSend() {
    els.send.disabled = state.busy || (!els.input.value.trim() && !state.image);
  }

  let toastTimer = null;
  function toast(text, action, onAction) {
    clearTimeout(toastTimer);
    $("toast-text").textContent = text;
    const btn = $("toast-btn");
    btn.hidden = !action;
    btn.textContent = action || "";
    btn.onclick = onAction || null;
    els.toast.hidden = false;
    requestAnimationFrame(() => els.toast.classList.add("show"));
    if (!action) toastTimer = setTimeout(hideToast, 2600);
  }
  function hideToast() {
    els.toast.classList.remove("show");
    setTimeout(() => { if (!els.toast.classList.contains("show")) els.toast.hidden = true; }, 450);
  }
  const haptic = () => { try { navigator.vibrate?.(8); } catch {} };

  // ---- Errors ----
  function errorKind(e) {
    if (ctl?.signal.aborted) return "cancelled";
    if (!e || typeof e !== "object") return "other";
    const n = e.error && typeof e.error === "object" ? e.error : {};
    const code = String(e.code || n.code || (typeof e.error === "string" ? e.error : "") || "");
    const status = e.status || n.status;
    const message = String(n.message || e.message || "");
    if (/insufficient_funds|usage_limit/.test(code) || status === 402 || e.metadata?.usage_limited) return "funds";
    if (/auth_canceled|auth_window_closed/.test(code)) return "auth_canceled";
    if (code === "popup_blocked") return "popup_blocked";
    if (status === 401 || code === "token_auth_failed") return "auth";
    if (status === 429 || /rate_limit|too_many/.test(code)) return "rate";
    if (/model/i.test(code) || /model/i.test(message) && /not|unknown|unavailable|invalid|support/i.test(message)) return "model";
    if (/network|timeout/i.test(code) || (typeof XMLHttpRequest !== "undefined" && e instanceof XMLHttpRequest) || !navigator.onLine) return "network";
    return "other";
  }
  function errorCopy(kind) {
    switch (kind) {
      case "cancelled": return "وقّفته.";
      case "funds": return "الرصيد المجاني لحسابك في Puter خلص الشهر ده. اختار «الأوفر» من الإعدادات وجرّب تاني، أو استنى لما الرصيد يتجدد.";
      case "auth": return "محتاج تسجّل دخول Puter تاني.";
      case "auth_canceled": return "مكمّلتش تسجيل الدخول. اضغط «كمّل» وجرّب تاني.";
      case "popup_blocked": return "المتصفح منع نافذة Puter. اسمح بالنوافذ المنبثقة للموقع ده، أو افتح أسطى في Chrome وسجّل منه مرة واحدة.";
      case "rate": return "طلبات كتير ورا بعض. استنى دقيقة وجرّب تاني.";
      case "network": return "مفيش اتصال بالإنترنت أو Puter مش بيرد. اتأكد من النت وابعت تاني.";
      case "model": return "النموذج ده مش متاح دلوقتي. اختار نموذج تاني من الإعدادات.";
      default: return "حصلت مشكلة وأسطى مقدرش يرد. ابعت الرسالة تاني.";
    }
  }

  // ---- Sending ----
  async function send(text) {
    text = text.trim();
    if ((!text && !state.image) || state.busy) return;
    if (!navigator.onLine) { toast("مفيش إنترنت دلوقتي. هتقدر تبعت لما النت يرجع."); return; }
    setBusy(true);
    const p = await loadPuter();
    setBusy(false);
    if (!p) { toast("مقدرتش أوصل لـ Puter. اتأكد من النت وجرّب تاني."); return; }
    if (!signedIn()) { state.pending = text; showSheet("sheet-signin"); return; }

    let chat = current();
    if (!chat) {
      chat = { id: newId(), title: (text || "صورة").slice(0, 48), updated: Date.now(), turns: [] };
      state.chats.unshift(chat);
      state.currentId = chat.id;
    }
    const image = state.image;
    const content = text || "بص على الصورة دي.";
    chat.turns.push({ role: "user", content, ...(image ? { hadImage: true } : {}) });
    els.input.value = ""; autosize(); clearImage();
    saveChats(); // keep the question even if the app is closed mid-reply
    haptic();
    render(1);
    await respond(chat, image, { restore: text });
  }

  // restore: the text to give back to the composer if nothing comes back.
  // fallback: the reply to put back when a "reply again" attempt fails.
  async function respond(chat, image, { restore = "", fallback = null } = {}) {
    els.messages.insertAdjacentHTML("beforeend", `<div class="msg assistant enter" id="live"><div class="who">${markSVG()}</div><div class="md"><span class="thinking" aria-label="بيفكّر"><i></i><i></i><i></i></span></div></div>`);
    scrollToEnd(true);
    setBusy(true);
    const live = $("live").querySelector(".md");

    // The rules first, then the newest turns.
    let recent = chat.turns.map((t) => ({ role: t.role, content: t.content })).slice(-24);
    if (recent[0]?.role === "assistant") recent = recent.slice(1);
    if (image) {
      const last = recent[recent.length - 1];
      last.content = [{ type: "text", text: last.content }, { type: "image_url", image_url: { url: image } }];
    }
    const messages = [{ role: "system", content: RULES(state.lessons) }, ...recent];

    let reply = "", note = null, kind = null, frame = 0;
    const paint = () => {
      frame = 0;
      const nearEnd = els.thread.scrollHeight - els.thread.scrollTop - els.thread.clientHeight < 140;
      live.innerHTML = markdown(splitLessons(reply).shown) || `<span class="thinking" aria-label="بيفكّر"><i></i><i></i><i></i></span>`;
      if (nearEnd) scrollToEnd(false);
    };
    const run = async (model) => {
      ctl = new AbortController();
      const options = { stream: true, signal: ctl.signal, ...(model ? { model } : {}) };
      const res = await puter.ai.chat(messages, options);
      if (res && typeof res[Symbol.asyncIterator] === "function") {
        for await (const part of res) {
          if (part?.type === "error" || (part?.error && !part.type)) throw part.error || part;
          if (typeof part?.text === "string" && (!part.type || part.type === "text")) {
            reply += part.text;
            if (!frame) frame = requestAnimationFrame(paint);
          }
          if (part?.type === "usage" && part.finish_reason === "length") note = "الرد اتقطع لأنه طويل. اكتب «كمّل» عشان يكمّل.";
        }
      } else {
        const c = res?.message?.content;
        reply = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x?.text || "").join("") : String(res ?? "");
      }
    };

    let model = await modelFor(state.settings.tier);
    try {
      try {
        await run(model);
      } catch (e) {
        // A model that left the catalog: answer with Puter's default instead.
        if (model && !reply && errorKind(e) === "model") { model = null; catalog = null; await run(null); }
        else throw e;
      }
      if (!reply.trim()) { kind = "other"; note = "مجاش رد. جرّب تاني."; }
    } catch (e) {
      kind = errorKind(e);
      note = errorCopy(kind);
    }
    if (frame) cancelAnimationFrame(frame);
    ctl = null;

    const { lessons } = splitLessons(reply);
    if (reply.trim()) {
      chat.turns.push({ role: "assistant", content: reply, ...(note ? { note } : {}) });
    } else if (fallback) {
      chat.turns.push(fallback);
    } else {
      // Nothing came back: give the message back to the composer.
      if (chat.turns[chat.turns.length - 1]?.role === "user") chat.turns.pop();
      if (restore) { els.input.value = restore; autosize(); }
      if (image) { state.image = image; els.previewImg.src = image; els.preview.hidden = false; updateSend(); }
    }
    chat.updated = Date.now();
    setBusy(false);
    if (!chat.turns.length) { state.chats = state.chats.filter((c) => c !== chat); state.currentId = null; }
    render();
    if (!reply.trim() && note) {
      const fix = kind === "funds" ? `<button data-open-settings>افتح الإعدادات</button>` : kind === "auth" ? `<button data-signin>سجّل دخول</button>` : "";
      els.messages.insertAdjacentHTML("beforeend", `<div class="banner" role="alert">${esc(note)}${fix}</div>`);
    }
    if (lessons.length) {
      const fresh = lessons.filter((t) => !state.lessons.some((l) => l.t === t));
      fresh.forEach((t) => state.lessons.push({ d: today(), t }));
      if (fresh.length) {
        if (state.lessons.length > 60) state.lessons.splice(0, state.lessons.length - 60);
        saveLessons();
        els.messages.insertAdjacentHTML("beforeend", `<span class="learned">أسطى اتعلّم: ${esc(fresh.join(" · "))}</span>`);
      }
    }
    if (kind === "auth") { try { puter.auth.signOut(); } catch {} }
    saveChats();
    scrollToEnd(true);
  }

  async function retry() {
    const chat = current();
    if (!chat || state.busy || chat.turns[chat.turns.length - 1]?.role !== "assistant") return;
    if (!navigator.onLine) { toast("مفيش إنترنت دلوقتي."); return; }
    if (!signedIn()) { showSheet("sheet-signin"); return; }
    const previous = chat.turns.pop();
    render();
    await respond(chat, null, { fallback: previous });
  }

  // ---- Composer ----
  function autosize() {
    els.input.style.height = "auto";
    els.input.style.height = Math.min(els.input.scrollHeight, 160) + "px";
    updateSend();
  }
  els.input.addEventListener("input", autosize);
  els.input.addEventListener("keydown", (e) => {
    const touch = matchMedia("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !touch && !e.isComposing) { e.preventDefault(); send(els.input.value); }
  });
  els.send.addEventListener("click", () => send(els.input.value));
  els.stop.addEventListener("click", () => ctl?.abort());

  async function copyText(text, btn, label) {
    const done = () => { btn.innerHTML = btn.innerHTML.replace(label, "اتنسخ"); setTimeout(() => (btn.innerHTML = btn.innerHTML.replace("اتنسخ", label)), 1500); };
    try { await navigator.clipboard.writeText(text); done(); }
    catch {
      const r = document.createRange();
      const target = btn.closest(".codeblock")?.querySelector("code") || btn.closest(".msg")?.querySelector(".md");
      if (target) { r.selectNodeContents(target); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    }
  }
  els.messages.addEventListener("click", (e) => {
    const t = e.target;
    const chip = t.closest("[data-suggest]");
    if (chip) { els.input.value = chip.textContent; autosize(); els.input.focus(); return; }
    const copy = t.closest("[data-copy]");
    if (copy) { copyText(copy.closest(".codeblock").querySelector("code").textContent, copy, "نسخ"); return; }
    const copyReply = t.closest("[data-copy-reply]");
    if (copyReply) {
      const turns = current()?.turns || [];
      const last = turns[turns.length - 1];
      if (last) copyText(splitLessons(last.content).shown, copyReply, "نسخ");
      return;
    }
    if (t.closest("[data-retry]")) { retry(); return; }
    if (t.closest("[data-open-settings]")) { showSheet("sheet-settings"); return; }
    if (t.closest("[data-signin]")) { showSheet("sheet-signin"); return; }
    if (t.closest("[data-install]")) { install(); return; }
    if (t.closest("[data-dismiss-install]")) { state.settings.installDismissed = true; saveSettings(); render(); }
  });
  els.thread.addEventListener("scroll", () => els.nav.classList.toggle("scrolled", els.thread.scrollTop > 4), { passive: true });

  // Images: shrink before sending so big photos don't eat the free credit.
  els.attach.addEventListener("click", () => els.file.click());
  els.file.addEventListener("change", async () => {
    const f = els.file.files && els.file.files[0];
    els.file.value = "";
    if (!f) return;
    try {
      const bitmap = await createImageBitmap(f);
      const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      state.image = canvas.toDataURL("image/jpeg", 0.85);
      els.previewImg.src = state.image;
      els.preview.hidden = false;
      updateSend();
    } catch {
      toast("مقدرتش أفتح الصورة دي. جرّب صورة PNG أو JPG.");
    }
  });
  $("preview-remove").addEventListener("click", clearImage);
  function clearImage() {
    state.image = null; els.preview.hidden = true; els.previewImg.removeAttribute("src"); updateSend();
  }

  // ---- Sheets ----
  let openSheet = null, lastFocus = null;
  function showSheet(id) {
    if (openSheet) hideSheet(true);
    const sheet = $(id);
    openSheet = sheet;
    lastFocus = document.activeElement;
    els.scrim.hidden = false; sheet.hidden = false;
    document.body.classList.add("sheet-open");
    requestAnimationFrame(() => requestAnimationFrame(() => { els.scrim.classList.add("open"); sheet.classList.add("open"); }));
    ({ "sheet-chats": renderChatList, "sheet-memory": renderLessons, "sheet-settings": renderSettings, "sheet-install": renderInstall, "sheet-signin": () => ($("signin-error").textContent = "") })[id]?.();
    setTimeout(() => sheet.querySelector("[data-close]")?.focus({ preventScroll: true }), 50);
  }
  function hideSheet(instant) {
    const sheet = openSheet; if (!sheet) return;
    openSheet = null;
    els.scrim.classList.remove("open"); sheet.classList.remove("open");
    document.body.classList.remove("sheet-open");
    const finish = () => { if (openSheet !== sheet) { sheet.hidden = true; if (!openSheet) els.scrim.hidden = true; } };
    if (instant === true) finish(); else setTimeout(finish, 450);
    if (sheet.id === "sheet-signin") state.pending = null;
    lastFocus?.focus?.({ preventScroll: true });
  }
  els.scrim.addEventListener("click", hideSheet);
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", hideSheet));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideSheet(); });
  // Drag a sheet down by its top to dismiss it.
  document.querySelectorAll(".sheet").forEach((sheet) => {
    let startY = null;
    sheet.addEventListener("touchstart", (e) => { if (e.target.closest(".body")) return; startY = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener("touchmove", (e) => {
      if (startY === null) return;
      const dy = Math.max(0, e.touches[0].clientY - startY);
      sheet.style.transition = "none"; sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheet.addEventListener("touchend", (e) => {
      if (startY === null) return;
      const dy = e.changedTouches[0].clientY - startY;
      sheet.style.transition = ""; sheet.style.transform = "";
      startY = null;
      if (dy > 80) hideSheet();
    });
  });
  $("btn-chats").addEventListener("click", () => showSheet("sheet-chats"));
  $("btn-memory").addEventListener("click", () => showSheet("sheet-memory"));
  $("btn-settings").addEventListener("click", () => showSheet("sheet-settings"));
  $("btn-new").addEventListener("click", newChat);
  function newChat() {
    if (state.busy) return;
    state.currentId = null; render(); els.input.focus();
  }

  function renderChatList() {
    const list = $("chat-list");
    if (!state.chats.length) { list.innerHTML = `<div class="empty">مفيش محادثات لسه.</div>`; return; }
    const fmt = new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    list.innerHTML = state.chats.slice().sort((a, b) => b.updated - a.updated).map((c) =>
      `<div class="row${c.id === state.currentId ? " current" : ""}"><button class="grow" data-open="${esc(c.id)}"><div class="t" dir="auto">${esc(c.title)}</div><div class="s">${esc(fmt.format(c.updated).replace(/٬/g, " "))}</div></button><button class="del" data-del="${esc(c.id)}" aria-label="امسح المحادثة">امسح</button></div>`).join("");
  }
  $("chat-list").addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open && !state.busy) { state.currentId = open.dataset.open; hideSheet(); render(); scrollToEnd(false); return; }
    const del = e.target.closest("[data-del]");
    if (del) {
      if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "متأكد؟"; return; }
      const chat = state.chats.find((c) => c.id === del.dataset.del);
      if (chat && !(state.busy && chat.id === state.currentId)) {
        state.chats = state.chats.filter((c) => c !== chat);
        saveChats();
        if (state.currentId === chat.id) { state.currentId = null; render(); }
        renderChatList();
      }
    }
  });

  function renderLessons() {
    const list = $("lesson-list");
    if (!state.lessons.length) { list.innerHTML = `<div class="empty">أسطى لسه متعلّمش حاجة عنك. هيبدأ يتعلّم وانتو بتتكلموا.</div>`; return; }
    list.innerHTML = state.lessons.map((l, i) =>
      `<div class="row"><div class="grow"><div class="t lesson" dir="auto">${esc(l.t)}</div><div class="s">${esc(l.d)}</div></div><button class="del" data-forget="${i}" aria-label="انسى الدرس ده">انسى</button></div>`).join("");
  }
  $("lesson-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-forget]");
    if (!b) return;
    state.lessons.splice(Number(b.dataset.forget), 1);
    saveLessons(); renderLessons();
  });
  $("lesson-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("lesson-input");
    const t = input.value.trim();
    if (!t) return;
    state.lessons.push({ d: today(), t });
    input.value = "";
    saveLessons(); renderLessons();
  });

  // ---- Sign in ----
  $("btn-signin").addEventListener("click", () => {
    const btn = $("btn-signin"), err = $("signin-error");
    if (!puter) { err.textContent = "مقدرتش أوصل لـ Puter. اتأكد من النت وجرّب تاني."; loadPuter(); return; }
    err.textContent = "";
    btn.disabled = true; btn.textContent = "بيفتح Puter…";
    // signIn must run inside this click so the browser lets its window open.
    let attempt;
    try { attempt = puter.auth.signIn({ attempt_temp_user_creation: true }); } catch (e) { attempt = Promise.reject(e); }
    Promise.resolve(attempt).then(() => {
      const text = state.pending;
      hideSheet();
      toast("تمام، اتسجّلت ✓");
      refreshAccount();
      if (text !== null && text !== undefined) send(text);
    }, (e) => {
      err.textContent = errorCopy(errorKind(e) === "other" ? "auth_canceled" : errorKind(e));
    }).finally(() => { btn.disabled = false; btn.textContent = "كمّل"; });
  });

  // ---- Settings ----
  function applyTheme() {
    const t = state.settings.theme;
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = t;
    const light = $("theme-light"), dark = $("theme-dark");
    light.media = t === "dark" ? "not all" : t === "light" ? "all" : "(prefers-color-scheme: light)";
    dark.media = t === "light" ? "not all" : t === "dark" ? "all" : "(prefers-color-scheme: dark)";
  }
  function markSegment(group, attr, value) {
    group.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.getAttribute(attr) === value)));
  }
  let account = null, usage = null;
  async function refreshAccount() {
    if (!puter || !signedIn()) { account = null; usage = null; renderAccount(); return; }
    try { account = await puter.auth.getUser(); } catch { account = null; }
    try { usage = (await puter.auth.getMonthlyUsage())?.allowanceInfo || null; } catch { usage = null; }
    renderAccount();
  }
  function renderAccount() {
    const on = signedIn();
    const name = account?.username || (on ? "حساب Puter" : "مش مسجّل");
    $("acct-name").textContent = name;
    $("acct-avatar").textContent = on ? (name[0] || "؟").toUpperCase() : "؟";
    $("acct-sub").textContent = on ? (account?.is_temp ? "حساب Puter مؤقت على الجهاز ده" : "حساب Puter") : "سجّل عشان أسطى يقدر يرد";
    $("acct-btn").textContent = on ? "خروج" : "دخول";
    $("acct-btn").style.color = on ? "var(--danger)" : "var(--accent)";
    const row = $("credit-row");
    if (on && usage && usage.monthUsageAllowance > 0) {
      const pct = Math.max(0, Math.min(100, Math.round((usage.remaining / usage.monthUsageAllowance) * 100)));
      row.hidden = false;
      $("credit-value").textContent = `${pct.toLocaleString("ar-EG")}٪ متبقي`;
      const meter = $("credit-meter");
      meter.classList.toggle("low", pct < 20);
      requestAnimationFrame(() => (meter.firstElementChild.style.width = pct + "%"));
    } else row.hidden = true;
  }
  async function renderModel() {
    const nameEl = $("model-name");
    if (state.settings.tier === "light") { nameEl.textContent = modelLabel(null); return; }
    if (!puter) { nameEl.textContent = "هيتحدد أول ما تبعت"; return; }
    nameEl.textContent = "…";
    const id = await modelFor(state.settings.tier);
    nameEl.textContent = modelLabel(id);
  }
  function renderSettings() {
    markSegment($("tier"), "data-tier", state.settings.tier);
    markSegment($("theme"), "data-theme-choice", state.settings.theme);
    $("version").textContent = VERSION;
    $("btn-install").hidden = isStandalone();
    $("wipe-label").textContent = "امسح المحادثات والذاكرة";
    delete $("btn-wipe").dataset.armed;
    renderAccount();
    renderModel();
    refreshAccount();
  }
  $("tier").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tier]"); if (!b) return;
    state.settings.tier = b.dataset.tier; saveSettings();
    markSegment($("tier"), "data-tier", state.settings.tier);
    haptic(); renderModel();
  });
  $("theme").addEventListener("click", (e) => {
    const b = e.target.closest("[data-theme-choice]"); if (!b) return;
    state.settings.theme = b.dataset.themeChoice; saveSettings();
    markSegment($("theme"), "data-theme-choice", state.settings.theme);
    haptic(); applyTheme();
  });
  $("acct-btn").addEventListener("click", () => {
    if (signedIn()) {
      try { puter.auth.signOut(); } catch {}
      account = null; usage = null; renderAccount();
      toast("خرجت من Puter");
    } else showSheet("sheet-signin");
  });

  // Backup and restore
  function backupData() {
    return { app: "osta", version: 1, exported: new Date().toISOString(), chats: state.chats, lessons: state.lessons, settings: { theme: state.settings.theme, tier: state.settings.tier } };
  }
  $("btn-backup").addEventListener("click", async () => {
    const json = JSON.stringify(backupData(), null, 2);
    const name = `osta-backup-${today()}.json`;
    const file = new File([json], name, { type: "application/json" });
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "نسخة أسطى الاحتياطية" }); return; } catch (e) { if (e?.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("اتحفظت النسخة الاحتياطية ✓");
  });
  $("btn-restore").addEventListener("click", () => $("restore-file").click());
  $("restore-file").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data?.app !== "osta" || !Array.isArray(data.chats) || !Array.isArray(data.lessons)) throw new Error("not an Osta backup");
      const chats = data.chats.filter((c) => c && typeof c.id === "string" && Array.isArray(c.turns))
        .map((c) => ({ id: c.id, title: String(c.title || "محادثة"), updated: Number(c.updated) || Date.now(), turns: c.turns.filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string") }));
      const known = new Set(state.chats.map((c) => c.id));
      for (const c of chats) if (!known.has(c.id)) state.chats.push(c);
      for (const l of data.lessons) if (l && typeof l.t === "string" && !state.lessons.some((x) => x.t === l.t)) state.lessons.push({ d: String(l.d || today()), t: l.t });
      saveChats(); saveLessons();
      render();
      toast(`اترجعت ${chats.length.toLocaleString("ar-EG")} محادثة ✓`);
    } catch {
      toast("الملف ده مش نسخة احتياطية من أسطى.");
    }
  });
  $("btn-wipe").addEventListener("click", () => {
    const b = $("btn-wipe");
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; $("wipe-label").textContent = "متأكد؟ اضغط تاني للمسح"; return; }
    if (state.busy) ctl?.abort();
    state.chats = []; state.lessons = []; state.currentId = null;
    saveChats(); saveLessons();
    delete b.dataset.armed; $("wipe-label").textContent = "امسح المحادثات والذاكرة";
    hideSheet(); render();
    toast("اتمسح كل حاجة");
  });

  // ---- Install ----
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; if (!current()) render(); });
  addEventListener("appinstalled", () => { deferredInstall = null; if (!current()) render(); toast("اتثبّت أسطى ✓"); });
  async function install() {
    if (deferredInstall) {
      const prompt = deferredInstall;
      deferredInstall = null;
      prompt.prompt();
      try { await prompt.userChoice; } catch {}
      if (!current()) render();
      return;
    }
    showSheet("sheet-install");
  }
  $("btn-install").addEventListener("click", install);
  function renderInstall() {
    const share = `<svg viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1"/></svg>`;
    const plus = `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`;
    const dots = `<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/></svg>`;
    $("install-steps").innerHTML = isIOS()
      ? `<li><span>افتح الصفحة دي في Safari، واضغط زرار المشاركة ${share}</span></li><li><span>اختار «إضافة إلى الشاشة الرئيسية» ${plus}</span></li><li><span>اضغط «إضافة»، وافتح أسطى من الأيقونة</span></li>`
      : `<li><span>افتح قايمة المتصفح ${dots}</span></li><li><span>اختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»</span></li><li><span>وافق، وافتح أسطى من الأيقونة</span></li>`;
  }

  // ---- Offline and updates ----
  addEventListener("online", () => { setStatus(); if (!puter) loadPuter(); });
  addEventListener("offline", setStatus);
  let updateRequested = false;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      const offer = () => toast("في نسخة جديدة من أسطى", "حدّث", () => {
        updateRequested = true;
        (reg.waiting || reg.installing)?.postMessage({ type: "SKIP_WAITING" });
        hideToast();
      });
      if (reg.waiting && navigator.serviceWorker.controller) offer();
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(); });
      });
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
    }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (updateRequested) location.reload(); });
  }

  // Keep the composer above the on-screen keyboard.
  const vv = window.visualViewport;
  if (vv) {
    const fit = () => {
      document.documentElement.style.setProperty("--app-h", vv.height + "px");
      document.documentElement.style.setProperty("--app-top", vv.offsetTop + "px");
    };
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    fit();
  }

  // ---- Start ----
  state.chats = load(K.chats, []);
  state.lessons = load(K.lessons, []);
  state.settings = { ...state.settings, ...load(K.settings, {}) };
  applyTheme();
  setStatus();
  if (new URLSearchParams(location.search).get("new") === "1") history.replaceState(null, "", location.pathname);
  render();
  loadPuter().then((p) => { if (p && signedIn()) refreshAccount(); });

  // For tests.
  window.osta = { markdown, splitLessons, pickModel, modelLabel, version: VERSION };
})();
