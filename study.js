// Study mode: the user adds PDFs, photos of pages or pasted text, and Osta writes an
// interactive exam (multiple choice and true/false), grades each answer on the spot,
// explains it, and keeps the results on the device.
(() => {
  "use strict";

  const core = window.osta;
  const $ = (id) => document.getElementById(id);
  const esc = core.esc;
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  const MAX_TEXT = 60000;   // characters of material sent with a request
  const MAX_IMAGES = 8;     // page images sent with a request
  const KEY = "osta:study";
  const LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"];
  const num = (n) => Number(n).toLocaleString("ar-EG");

  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
  const study = {
    files: [],                       // {id, name, kind: "pdf"|"image", pages, text, images, busy}
    type: saved.type || "mix",       // "mcq" | "tf" | "mix"
    count: saved.count || 10,
    exams: Array.isArray(saved.exams) ? saved.exams : [], // {id, title, created, questions, answers, done}
    view: "home",                    // "home" | "loading" | "exam" | "result"
    exam: null,
    index: 0,
    explain: "",                     // streamed explanation of the material
    pasted: "",                      // text pasted instead of (or with) files
  };
  let ctl = null;
  const save = () => {
    const exams = study.exams.slice(0, 30);
    try { localStorage.setItem(KEY, JSON.stringify({ type: study.type, count: study.count, exams })); } catch {}
  };

  // ---- Opening and closing (a pushed page; the system back button closes it) ----
  const page = $("study");
  function openStudy() {
    if (!page.hidden) return;
    page.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => page.classList.add("open")));
    history.pushState({ study: true }, "");
    render();
  }
  function closeStudy(fromHistory) {
    if (page.hidden) return;
    ctl?.abort();
    page.classList.remove("open");
    setTimeout(() => { if (!page.classList.contains("open")) page.hidden = true; }, 450);
    if (!fromHistory && history.state?.study) history.back();
  }
  addEventListener("popstate", () => {
    if (page.hidden) return;
    if (study.view === "exam" || study.view === "result") { study.view = "home"; history.pushState({ study: true }, ""); render(); return; }
    closeStudy(true);
  });
  $("btn-study").addEventListener("click", openStudy);
  $("study-back").addEventListener("click", () => {
    if (study.view === "loading") ctl?.abort();
    if (study.view !== "home") { study.view = "home"; render(); return; }
    closeStudy(false);
  });
  $("study-scroll").addEventListener("scroll", (e) => $("study-nav").classList.toggle("scrolled", e.target.scrollTop > 4), { passive: true });

  // ---- Reading material ----
  let pdfjs = null;
  function loadPdfJs() {
    if (pdfjs) return pdfjs;
    pdfjs = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = PDFJS + "pdf.min.js";
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js";
        resolve(window.pdfjsLib);
      };
      s.onerror = () => { s.remove(); pdfjs = null; reject(new Error("pdf.js did not load")); };
      document.head.appendChild(s);
    });
    return pdfjs;
  }
  async function readPdf(file, entry) {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    entry.pages = doc.numPages;
    let text = "";
    for (let i = 1; i <= doc.numPages && text.length < MAX_TEXT; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      text += content.items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join("") + "\n\n";
    }
    entry.text = text.replace(/[ \t]+\n/g, "\n").trim();
    // Scanned PDFs have pictures of text and nothing to extract: send the pages as images.
    if (entry.text.replace(/\s/g, "").length < 80 * Math.min(doc.numPages, 5)) {
      entry.text = "";
      for (let i = 1; i <= Math.min(doc.numPages, MAX_IMAGES); i++) {
        const pg = await doc.getPage(i);
        const viewport = pg.getViewport({ scale: Math.min(2, 1400 / pg.getViewport({ scale: 1 }).width) });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width; canvas.height = viewport.height;
        await pg.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        entry.images.push(canvas.toDataURL("image/jpeg", 0.8));
      }
    }
  }
  async function readImage(file, entry) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    entry.images.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  async function addFiles(list) {
    for (const file of list) {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (!isPdf && !file.type.startsWith("image/")) { core.toast(`«${file.name}» مش PDF ولا صورة.`); continue; }
      const entry = { id: Math.random().toString(36).slice(2), name: file.name, kind: isPdf ? "pdf" : "image", pages: 0, text: "", images: [], busy: true };
      study.files.push(entry);
      render();
      try {
        await (isPdf ? readPdf(file, entry) : readImage(file, entry));
        if (isPdf && !entry.text && !entry.images.length) throw new Error("empty");
      } catch {
        study.files = study.files.filter((f) => f !== entry);
        core.toast(`مقدرتش أقرا «${file.name}». جرّب ملف تاني أو صوّر الصفحات.`);
      }
      entry.busy = false;
      render();
    }
  }
  function material() {
    const pasted = study.pasted.trim();
    const text = [...study.files.filter((f) => f.text).map((f) => `## ${f.name}\n${f.text}`), pasted].filter(Boolean).join("\n\n");
    return {
      text: text.slice(0, MAX_TEXT),
      cut: text.length > MAX_TEXT,
      images: study.files.flatMap((f) => f.images).slice(0, MAX_IMAGES),
      pasted,
    };
  }
  const hasMaterial = () => { const m = material(); return !!(m.text || m.images.length); };
  function materialMessage(m, intro) {
    const head = m.text ? `${intro}\n\n${m.text}${m.cut ? "\n\n[The material was cut here because it is long.]" : ""}` : `${intro}\n\nThe material is in the attached page images.`;
    return m.images.length
      ? { role: "user", content: [{ type: "text", text: head }, ...m.images.map((url) => ({ type: "image_url", image_url: { url } }))] }
      : { role: "user", content: head };
  }

  // ---- Talking to the model ----
  async function ready() {
    if (!navigator.onLine) { core.toast("مفيش إنترنت دلوقتي."); return null; }
    const p = await core.loadPuter();
    if (!p) { core.toast("مقدرتش أوصل لـ Puter. اتأكد من النت وجرّب تاني."); return null; }
    if (!core.signedIn()) { core.showSheet("sheet-signin"); return null; }
    return p;
  }
  // Streams a reply, calling onText with everything so far. Falls back to Puter's
  // default model when the chosen one is gone.
  async function ask(messages, onText) {
    const p = core.puter();
    let model = await core.modelFor();
    for (;;) {
      ctl = new AbortController();
      let text = "";
      try {
        const res = await p.ai.chat(messages, { stream: true, signal: ctl.signal, ...(model ? { model } : {}) });
        if (res && typeof res[Symbol.asyncIterator] === "function") {
          for await (const part of res) {
            if (part?.type === "error" || (part?.error && !part.type)) throw part.error || part;
            if (typeof part?.text === "string" && (!part.type || part.type === "text")) { text += part.text; onText?.(text); }
          }
        } else {
          const c = res?.message?.content;
          text = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x?.text || "").join("") : String(res ?? "");
          onText?.(text);
        }
        return text;
      } catch (e) {
        if (model && !text && core.errorKind(e) === "model") { model = null; continue; }
        throw e;
      }
    }
  }
  const failure = (e) => core.errorCopy(core.errorKind(e));

  // ---- Writing an exam ----
  const QUIZ_RULES = (count, type) => `You are Osta (أسطى) in study mode, a patient teacher. Write an exam from the study material the user sends (text and/or page images).
- Exactly ${count} questions. Types: ${type === "mcq" ? 'only "mcq"' : type === "tf" ? 'only "tf"' : 'a mix of "mcq" and "tf", about two thirds "mcq"'}.
- Cover the important ideas of the whole material, going from easier to harder. Every correct answer must be supported by the material; never test trivia like page numbers.
- "mcq": exactly 4 short, plausible choices with one correct answer; vary where the correct one sits. "answer" is the index of the correct choice, from 0.
- "tf": one clear statement that is plainly true or false according to the material. "answer" is true or false.
- "explain": 1 to 3 sentences on why the answer is right, pointing to the idea in the material; for "mcq" also say briefly why the most tempting wrong choice is wrong.
- Write everything in the language of the material. For Arabic material use clear Arabic; keep technical terms as the material writes them.
Return only JSON, with no Markdown and no text around it, in exactly this shape:
{"title": "a short title for the exam", "questions": [{"type": "mcq", "q": "...", "choices": ["...", "...", "...", "..."], "answer": 0, "explain": "..."}, {"type": "tf", "q": "...", "answer": true, "explain": "..."}]}`;

  function parseQuiz(text, count) {
    const raw = text.replace(/```(?:json)?/gi, "");
    const data = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const questions = (Array.isArray(data.questions) ? data.questions : []).map((q) => {
      if (!q || typeof q.q !== "string" || !q.q.trim()) return null;
      const explain = typeof q.explain === "string" ? q.explain : "";
      if (Array.isArray(q.choices) && q.choices.length >= 2) {
        const choices = q.choices.slice(0, 6).map(String);
        const answer = Number(q.answer);
        return Number.isInteger(answer) && answer >= 0 && answer < choices.length ? { type: "mcq", q: q.q.trim(), choices, answer, explain } : null;
      }
      const a = q.answer;
      const answer = a === true || a === "true" || a === "صح" || a === "صحيح" ? true : a === false || a === "false" || a === "خطأ" || a === "غلط" ? false : null;
      return answer === null ? null : { type: "tf", q: q.q.trim(), answer, explain };
    }).filter(Boolean).slice(0, count);
    if (!questions.length) throw new Error("no questions");
    return { title: typeof data.title === "string" && data.title.trim() ? data.title.trim().slice(0, 80) : "امتحان", questions };
  }

  async function startExam() {
    if (!hasMaterial()) { core.toast("ارفع ملف أو صورة، أو الصق النص الأول."); return; }
    if (study.files.some((f) => f.busy)) { core.toast("استنى لحد ما الملفات تخلص قراية."); return; }
    if (!(await ready())) return;
    const m = material();
    study.view = "loading"; study.progress = 0; render();
    const messages = [{ role: "system", content: QUIZ_RULES(study.count, study.type) }, materialMessage(m, "Study material:")];
    let quiz = null, problem = null;
    for (let attempt = 0; attempt < 2 && !quiz && study.view === "loading"; attempt++) {
      try {
        const text = await ask(messages, (t) => {
          const done = (t.match(/"q"\s*:/g) || []).length;
          if (done !== study.progress) { study.progress = done; paintLoading(); }
        });
        quiz = parseQuiz(text, study.count);
      } catch (e) {
        if (ctl?.signal.aborted) return;
        problem = e instanceof SyntaxError || e?.message === "no questions" ? "أسطى رجّع امتحان مش مظبوط. جرّب تاني." : failure(e);
        if (!(e instanceof SyntaxError) && e?.message !== "no questions") break;
      }
    }
    ctl = null;
    if (study.view !== "loading") return;
    if (!quiz) { study.view = "home"; render(); core.toast(problem || "مقدرتش أعمل الامتحان. جرّب تاني."); return; }
    study.exam = { id: Date.now().toString(36), title: quiz.title, created: Date.now(), questions: quiz.questions, answers: quiz.questions.map(() => null), done: false };
    study.exams.unshift(study.exam);
    save();
    study.index = 0; study.view = "exam"; render();
    core.haptic();
  }

  function retake(exam, onlyWrong) {
    const questions = onlyWrong ? exam.questions.filter((q, i) => exam.answers[i] !== q.answer) : exam.questions;
    if (!questions.length) return;
    study.exam = { id: Date.now().toString(36), title: onlyWrong ? `${exam.title}: الأخطاء` : exam.title, created: Date.now(), questions, answers: questions.map(() => null), done: false };
    study.exams.unshift(study.exam);
    save();
    study.index = 0; study.view = "exam"; render();
  }

  // ---- Answering ----
  function answer(value) {
    const exam = study.exam, i = study.index;
    if (exam.answers[i] !== null) return;
    exam.answers[i] = value;
    const right = value === exam.questions[i].answer;
    try { navigator.vibrate?.(right ? 12 : [20, 40, 20]); } catch {}
    save();
    render();
    $("study-scroll").scrollTo({ top: $("study-scroll").scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function next() {
    const exam = study.exam;
    if (study.index < exam.questions.length - 1) { study.index++; render(); $("study-scroll").scrollTo({ top: 0 }); return; }
    exam.done = true;
    save();
    study.view = "result"; render(); $("study-scroll").scrollTo({ top: 0 });
  }
  const answerText = (q, a) => (q.type === "tf" ? (a ? "صح" : "غلط") : `${LETTERS[a]}) ${q.choices[a]}`);
  async function explainMore(i, box) {
    if (!(await ready())) return;
    const q = study.exam.questions[i], mine = study.exam.answers[i];
    const m = material();
    const prompt = `A student answered this exam question${mine === q.answer ? " correctly" : " wrongly"}. Explain it like a patient teacher, in the language of the question: the idea behind it, why the right answer is right${mine === q.answer ? "" : ", and why the student's answer is wrong"}, and a tip or example that makes it stick. Keep it short and clear, with Markdown.

Question (${q.type === "tf" ? "true/false" : "multiple choice"}): ${q.q}
${q.type === "mcq" ? q.choices.map((c, k) => `${LETTERS[k]}) ${c}`).join("\n") + "\n" : ""}Correct answer: ${answerText(q, q.answer)}
Student's answer: ${answerText(q, mine)}
Short explanation already shown: ${q.explain}`;
    box.hidden = false;
    box.innerHTML = `<span class="thinking" aria-label="بيفكّر"><i></i><i></i><i></i></span>`;
    const messages = [{ role: "system", content: "You are Osta (أسطى), a patient teacher." }];
    messages.push(m.text || m.images.length ? materialMessage(m, prompt + "\n\nThe study material, for reference:") : { role: "user", content: prompt });
    try {
      await ask(messages, (t) => { box.innerHTML = core.markdown(core.splitLessons(t).shown); });
    } catch (e) {
      if (!ctl?.signal.aborted) box.innerHTML = `<p>${esc(failure(e))}</p>`;
    }
    ctl = null;
  }

  async function explainMaterial() {
    if (!hasMaterial()) { core.toast("ارفع ملف أو صورة، أو الصق النص الأول."); return; }
    if (!(await ready())) return;
    const m = material();
    study.explain = "";
    const btn = $("study-explain");
    if (btn) { btn.disabled = true; btn.textContent = "بيشرح…"; }
    const box = $("study-explain-box");
    box.hidden = false;
    box.innerHTML = `<span class="thinking" aria-label="بيفكّر"><i></i><i></i><i></i></span>`;
    const messages = [
      { role: "system", content: "You are Osta (أسطى), a patient teacher. Explain study material so a student understands and remembers it: start with a two-line summary, then the main ideas as short headed sections with simple examples, then the key terms, then 3 things students usually get wrong. Use the language of the material (clear Arabic for Arabic material) and Markdown." },
      materialMessage(m, "Explain this study material:"),
    ];
    try {
      await ask(messages, (t) => { study.explain = core.splitLessons(t).shown; box.innerHTML = core.markdown(study.explain); });
    } catch (e) {
      if (!ctl?.signal.aborted) box.innerHTML = `<p>${esc(failure(e))}</p>`;
    }
    ctl = null;
    if (btn) { btn.disabled = false; btn.textContent = "اشرحلي المادة"; }
  }

  // ---- Rendering ----
  const ICON_UP = `<svg viewBox="0 0 24 24"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>`;
  const scoreOf = (exam) => exam.questions.reduce((n, q, i) => n + (exam.answers[i] === q.answer ? 1 : 0), 0);
  function segment(name, value, options) {
    return `<div class="segmented" role="radiogroup" data-seg="${name}">${options.map(([v, label]) => `<button role="radio" aria-checked="${v === value}" data-value="${v}">${label}</button>`).join("")}</div>`;
  }
  function render() {
    $("study-title").textContent = study.view === "home" ? "المذاكرة" : study.exam?.title || "امتحان";
    $("study-back-label").textContent = study.view === "home" ? "رجوع" : "المذاكرة";
    const body = $("study-body");
    if (study.view === "loading") return paintLoading();
    if (study.view === "exam") return renderQuestion(body);
    if (study.view === "result") return renderResult(body);
    const pasted = study.pasted;
    const fmt = new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" });
    body.innerHTML = `
      <h1 class="large-title">المذاكرة</h1>
      <p class="lead">ارفع المادة، وأسطى يعملك امتحان تفاعلي ويصحّحلك ويشرحلك كل سؤال.</p>
      <div class="section">
        <button class="dropzone" id="study-drop">${ICON_UP}<b>ارفع PDF أو صور</b><span>صور صفحات الكتاب أو الملزمة تنفع كمان</span></button>
        ${study.files.length ? `<div class="group" style="margin-top:10px">${study.files.map((f) => `
          <div class="row file-row has-tile"><span class="tile ${f.kind === "pdf" ? "pdf" : "img"}">${f.kind === "pdf" ? "PDF" : "IMG"}</span>
            <div class="grow"><div class="t" dir="auto">${esc(f.name)}</div><div class="s">${f.busy ? "بيقرا…" : f.kind === "pdf" ? `${num(f.pages)} صفحة${f.images.length ? " · متصوّرة" : ""}` : "صورة"}</div></div>
            <button class="del" data-remove="${f.id}" aria-label="شيل الملف">شيل</button></div>`).join("")}</div>` : ""}
      </div>
      <div class="section">
        <p class="section-h">أو الصق النص</p>
        <textarea class="paste" id="study-text" dir="auto" placeholder="الصق الدرس أو الملخص هنا…" aria-label="نص المادة">${esc(pasted)}</textarea>
      </div>
      <div class="section">
        <p class="section-h">الامتحان</p>
        <div class="group">
          <p class="seg-label">نوع الأسئلة</p>
          ${segment("type", study.type, [["mix", "الاتنين"], ["mcq", "اختيار من متعدد"], ["tf", "صح وغلط"]])}
          <p class="seg-label">عدد الأسئلة</p>
          ${segment("count", String(study.count), [["5", num(5)], ["10", num(10)], ["15", num(15)], ["20", num(20)]])}
        </div>
        <button class="primary" id="study-start">ابدأ الامتحان</button>
        <button class="secondary" id="study-explain">اشرحلي المادة</button>
        <div class="card-md md" id="study-explain-box" ${study.explain ? "" : "hidden"}>${study.explain ? core.markdown(study.explain) : ""}</div>
      </div>
      <div class="section">
        <p class="section-h">امتحاناتك</p>
        <div class="group">${study.exams.length ? study.exams.slice(0, 30).map((e) => {
          const s = scoreOf(e), total = e.questions.length, pct = s / total;
          return `<div class="row"><button class="grow" data-exam="${esc(e.id)}"><div class="t" dir="auto">${esc(e.title)}</div><div class="s">${esc(fmt.format(e.created))} · ${e.done ? `${num(total)} سؤال` : `كمّل من سؤال ${num(e.answers.filter((a) => a !== null).length + 1)}`}</div></button>
            ${e.done ? `<span class="score ${pct >= 0.7 ? "good" : pct < 0.5 ? "bad" : ""}">${num(s)}/${num(total)}</span>` : ""}
            <button class="del" data-delete="${esc(e.id)}" aria-label="امسح الامتحان">امسح</button></div>`;
        }).join("") : `<div class="empty">لسه معملتش امتحانات.</div>`}</div>
      </div>`;
  }
  function paintLoading() {
    if (study.view !== "loading") return;
    $("study-body").innerHTML = `<div class="loading"><div class="spinner" aria-hidden="true"></div><h2>بيجهّز الامتحان…</h2>
      <p>${study.progress ? `كتب ${num(study.progress)} من ${num(study.count)} سؤال` : "بيقرا المادة"}</p>
      <button class="secondary" id="study-cancel">إلغاء</button></div>`;
  }
  function renderQuestion(body) {
    const exam = study.exam, i = study.index, q = exam.questions[i], mine = exam.answers[i];
    const answered = mine !== null, right = mine === q.answer;
    const total = exam.questions.length;
    const correctSoFar = exam.answers.filter((a, k) => a !== null && a === exam.questions[k].answer).length;
    const cls = (v) => !answered ? "" : v === q.answer ? " right" : v === mine ? " wrong" : " dim";
    const choices = q.type === "tf"
      ? `<div class="choices tf">${[true, false].map((v) => `<button class="choice${cls(v)}" data-answer="${v}" ${answered ? "disabled" : ""}>${v ? "صح" : "غلط"}</button>`).join("")}</div>`
      : `<div class="choices">${q.choices.map((c, k) => `<button class="choice${cls(k)}" data-answer="${k}" ${answered ? "disabled" : ""}><b>${LETTERS[k]}</b><span dir="auto">${esc(c)}</span></button>`).join("")}</div>`;
    body.innerHTML = `
      <div class="quiz-top"><span>سؤال ${num(i + 1)} من ${num(total)}</span><span>${num(correctSoFar)} صح</span></div>
      <div class="bar"><i style="width:${((i + (answered ? 1 : 0)) / total) * 100}%"></i></div>
      <span class="qtype">${q.type === "tf" ? "صح ولا غلط؟" : "اختار الإجابة الصح"}</span>
      <h3 class="question" dir="auto">${esc(q.q)}</h3>
      ${choices}
      ${answered ? `<div class="feedback ${right ? "yes" : "no"}" role="status">
        <h4>${right ? "إجابة صح!" : `غلط. الصح: ${esc(answerText(q, q.answer))}`}</h4>
        <p dir="auto">${esc(q.explain)}</p>
        <button class="more" data-more>اشرحلي أكتر</button>
        <div class="deep md" id="study-deep" hidden></div>
      </div>
      <button class="primary" data-next>${i < total - 1 ? "السؤال اللي بعده" : "شوف النتيجة"}</button>` : ""}`;
  }
  function renderResult(body) {
    const exam = study.exam, s = scoreOf(exam), total = exam.questions.length, pct = Math.round((s / total) * 100);
    const wrong = total - s;
    const r = 64, c = 2 * Math.PI * r;
    const verdict = pct >= 90 ? "ممتاز يا أسطى!" : pct >= 70 ? "شغل حلو، كمّل كده" : pct >= 50 ? "قرّبت، راجع أخطاءك" : "محتاج مراجعة، يلا نعيد";
    body.innerHTML = `
      <div class="result">
        <div class="ring ${pct >= 70 ? "" : pct >= 50 ? "mid" : "low"}"><svg viewBox="0 0 150 150"><circle class="track" cx="75" cy="75" r="${r}"/><circle class="fill" cx="75" cy="75" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c}"/></svg><span>${num(pct)}٪</span></div>
        <h2>${verdict}</h2>
        <p>${num(s)} صح من ${num(total)}</p>
      </div>
      ${wrong ? `<button class="primary" data-retake-wrong>عيد الأسئلة اللي غلطت فيها (${num(wrong)})</button>` : ""}
      <button class="${wrong ? "secondary" : "primary"}" data-new>امتحان جديد من نفس المادة</button>
      <button class="secondary" data-retake>عيد نفس الامتحان</button>
      <div class="section review"><p class="section-h">المراجعة</p><div class="group">${exam.questions.map((q, i) => {
        const ok = exam.answers[i] === q.answer;
        return `<details class="${ok ? "ok" : "ko"}" ${ok ? "" : "open"}><summary><i>${ok ? "✓" : "✗"}</i><span dir="auto">${esc(q.q)}</span></summary>
          <div class="ans" dir="auto">${ok ? "" : `إجابتك: ${esc(exam.answers[i] === null ? "—" : answerText(q, exam.answers[i]))}<br>`}<b>الصح: ${esc(answerText(q, q.answer))}</b><br>${esc(q.explain)}</div></details>`;
      }).join("")}</div></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => { const f = body.querySelector(".ring .fill"); if (f) f.style.strokeDashoffset = String(c * (1 - s / total)); }));
  }

  // ---- Events ----
  const fileInput = $("study-file");
  fileInput.addEventListener("change", () => { const list = [...(fileInput.files || [])]; fileInput.value = ""; addFiles(list); });
  const body = $("study-body");
  body.addEventListener("input", (e) => { if (e.target.id === "study-text") study.pasted = e.target.value; });
  body.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("#study-drop")) { fileInput.click(); return; }
    const remove = t.closest("[data-remove]");
    if (remove) { study.files = study.files.filter((f) => f.id !== remove.dataset.remove); render(); return; }
    const seg = t.closest("[data-seg] button");
    if (seg) {
      const name = seg.parentElement.dataset.seg;
      if (name === "type") study.type = seg.dataset.value; else study.count = Number(seg.dataset.value);
      seg.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b === seg)));
      core.haptic(); save(); return;
    }
    if (t.closest("#study-start")) { startExam(); return; }
    if (t.closest("#study-explain")) { explainMaterial(); return; }
    if (t.closest("#study-cancel")) { ctl?.abort(); study.view = "home"; render(); return; }
    const pick = t.closest("[data-answer]");
    if (pick && !pick.disabled) { const v = pick.dataset.answer; answer(v === "true" ? true : v === "false" ? false : Number(v)); return; }
    if (t.closest("[data-next]")) { next(); return; }
    if (t.closest("[data-more]")) { const b = t.closest("[data-more]"); b.hidden = true; explainMore(study.index, $("study-deep")); return; }
    if (t.closest("[data-retake-wrong]")) { retake(study.exam, true); return; }
    if (t.closest("[data-retake]")) { retake(study.exam, false); return; }
    if (t.closest("[data-new]")) {
      if (hasMaterial()) startExam();
      else { study.view = "home"; render(); core.toast("ارفع المادة تاني عشان أعمل امتحان جديد."); }
      return;
    }
    const open = t.closest("[data-exam]");
    if (open) {
      study.exam = study.exams.find((x) => x.id === open.dataset.exam);
      if (!study.exam) return;
      const first = study.exam.answers.findIndex((a) => a === null);
      study.index = first === -1 ? 0 : first;
      study.view = study.exam.done ? "result" : "exam";
      render(); $("study-scroll").scrollTo({ top: 0 });
      return;
    }
    const del = t.closest("[data-delete]");
    if (del) {
      if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "متأكد؟"; return; }
      study.exams = study.exams.filter((x) => x.id !== del.dataset.delete);
      save(); render();
    }
  });
  // Drag and drop on computers.
  body.addEventListener("dragover", (e) => { if (study.view === "home") { e.preventDefault(); $("study-drop")?.classList.add("over"); } });
  body.addEventListener("dragleave", () => $("study-drop")?.classList.remove("over"));
  body.addEventListener("drop", (e) => {
    if (study.view !== "home") return;
    e.preventDefault();
    $("study-drop")?.classList.remove("over");
    addFiles([...(e.dataTransfer?.files || [])]);
  });

  core.openStudy = openStudy;
  core.parseQuiz = parseQuiz;
  if (new URLSearchParams(location.search).get("study") === "1") openStudy();
})();
