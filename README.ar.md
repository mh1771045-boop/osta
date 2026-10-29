<div dir="rtl">

<p align="center">
  <picture>
    <source srcset=".github/assets/osta-dark.svg" media="(prefers-color-scheme: dark)">
    <source srcset=".github/assets/osta-light.svg" media="(prefers-color-scheme: light)">
    <img src=".github/assets/osta-light.svg" alt="أسطى" width="342">
  </picture>
</p>
<p align="center"><b>أسطى (Osta)</b>: مساعد برمجة بالذكاء الاصطناعي، مفتوح المصدر، وبيشتغل زي الأسطى الشاطر.<br>موديلات مجانية من أول تشغيل، من غير حساب ومن غير مفتاح API.</p>
<p align="center">
  <a href="README.md">English</a> | <a href="README.ar.md">العربية</a>
</p>

---

«الأسطى» هو الصنايعي الشاطر اللي بيعمل الشغلانة صح من أول مرة، بسرعة، ومن غير ما حد يقف على راسه. «أسطى» مساعد برمجة بيشتغل في التيرمينال، ومبني على [opencode](https://github.com/anomalyco/opencode). بيعمل كل اللي opencode بيعمله، وفوقه طريقة شغل خاصة بيه، وبيفتكر اللي اتعلّمه من كل مشروع.

### التثبيت

على ماك ولينكس:

<div dir="ltr">

```bash
curl -fsSL https://raw.githubusercontent.com/mh1771045-boop/osta/main/install | bash
```

</div>

على ويندوز: شغّل نفس الأمر في Git Bash أو WSL.

بعد كده افتح تيرمينال جديد، ادخل على فولدر المشروع، واكتب:

<div dir="ltr">

```bash
osta
```

</div>

النسخ الجاهزة لكل الأنظمة موجودة في [صفحة الإصدارات](https://github.com/mh1771045-boop/osta/releases).

### ببلاش ومن غير مفتاح API

أسطى بيبدأ بموديلات مجانية، ومش هيطلب منك أي مفتاح في أول تشغيل.

- **موديلات مجانية جاهزة:** جاية من الباقة المجانية في OpenCode Zen، وهي خدمة الموديلات بتاعة فريق opencode. الخدمة دي هي اللي بتحدد الموديلات المتاحة وحدودها وسياسة البيانات، وده ممكن يتغير.
- **GitHub Copilot المجاني:** اكتب `osta auth login`، اختار GitHub Copilot، وسجّل دخول بحساب GitHub من المتصفح.
- **موديلات على جهازك:** شغّل موديلات على جهازك بـ [Ollama](https://ollama.com) أو LM Studio وضيفها كـ provider (المثال تحت).

الخدمات المدفوعة زي Anthropic وOpenAI وGoogle شغالة برضه، بس عمرك ما هتحتاجها.

#### موديل على جهازك

نزّل Ollama، وهات موديل برمجة (`ollama pull qwen2.5-coder:7b`)، وبعدين حط ده في `~/.config/osta/osta.json`:

<div dir="ltr">

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

</div>

اختاره من `/models` جوه أسطى، أو شغّل `osta run -m ollama/qwen2.5-coder:7b "..."`. أسطى بيستخدم نفس طريقة opencode في الإعدادات، فـ[شرح الـ providers بتاع OpenCode V2](https://opencode.ai/v2/docs/providers) ينفع معاه.

### أسطى زوّد إيه على opencode

- **طريقة شغل الأسطى:** كل الموديلات بتمشي على نفس الخطوات: يفهم، يقرر، ينفّذ، يتأكد، يبلّغ، يتعلّم. أسطى بيثبت إن التعديل شغال (اختبارات، تايبس، بيلد) قبل ما يقول إنه خلص، وبيقول بوضوح إيه اللي مقدرش يتأكد منه.
- **ذاكرة التعلّم:** بعد أي شغل مهم، أسطى بيكتب دروس قصيرة في `.osta/learnings.md` جوه المشروع، أو في `~/.config/osta/learnings.md` لو الدرس ينفع في كل حاجة. الملفين بيتقروا مع بداية كل جلسة، ولو المساحة ضاقت بيحتفظ بالأحدث. دول ملفات Markdown عادية تقدر تقراها وتعدّلها وتمسحها. وتقدر تعلّمه درس بإيدك بـ `/learn <الدرس>`، وتشوف الدروس وتنضّفها بـ `/learnings`. ولو عايز تقفل الميزة دي: `OSTA_DISABLE_LEARNINGS=1`.
- **عربي وإنجليزي:** أسطى بيرد باللغة اللي بتكتب بيها، حتى بالمصري، والكود والتعليقات والـ commits بتفضل بالإنجليزي.
- **بيته الخاص ومتوافق مع opencode:** الإعدادات في `~/.config/osta` و`osta.json` و`.osta/`. ملفات `opencode.json` و`.opencode/` و`AGENTS.md` اللي عندك هتفضل شغالة. ومتغيرات `OSTA_*` شغالة في أي مكان opencode بيقرا فيه `OPENCODE_*`.

وكل الباقي من opencode: واجهة التيرمينال، الـ agents اللي اسمهم `build` و`plan`، الـ subagents، أكتر من 75 provider، سيرفرات MCP، الـ LSP، الإضافات، الثيمات، الجلسات، `osta run` للسكريبتات، و`osta serve` و`osta pair` عشان تستخدمه من المتصفح.

### استخدامه من الموبايل

أسطى بيشتغل على كمبيوتر. عشان تتحكم فيه من الموبايل وانتو على نفس الواي فاي: شغّل `osta service set hostname 0.0.0.0` مرة واحدة على الكمبيوتر، وبعدين `osta pair`، وافتح اللينك اللي هيطلعلك في متصفح الموبايل. ولو عايز لينك يشتغل من أي مكان استخدم `osta pair --remote`، وهو هيسألك الأول لأنه بيفتح جهازك على الإنترنت.

### البناء من الكود

محتاج [Bun](https://bun.sh) نسخة 1.4.4 أو أحدث.

<div dir="ltr">

```bash
git clone https://github.com/mh1771045-boop/osta.git
cd osta
bun install
bun dev            # تشغيل أسطى من الكود
cd packages/cli && bun run script/build.ts --single   # بناء نسخة لجهازك
```

</div>

السكريبت `script/osta/rebrand.ts` بيرجّع أسماء أسطى بعد ما تدمج تحديثات جديدة من opencode.

### حدود معروفة

- تطبيق الديسكتوب لسه متجهّزش باسم أسطى. استخدم تطبيق التيرمينال، أو نسخة المتصفح عن طريق `osta serve` أو `osta pair`.
- أسطى لسه مش منشور على npm أو Homebrew أو WinGet. ثبّته بالسكريبت اللي فوق أو من صفحة الإصدارات.

### الشكر والرخصة

أسطى مبني على [opencode](https://github.com/anomalyco/opencode) من شركة Anomaly، المنشور برخصة MIT. وأسطى كمان برخصة MIT، شوف ملف [LICENSE](LICENSE). أسطى مشروع مستقل، ومالوش علاقة رسمية بفريق opencode.

تصميم وتطوير: محمد الشيخ · [واتساب](https://wa.me/201206580045)

</div>
