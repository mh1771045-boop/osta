export * as TeamPlugin from "./team.js"

import { SystemPart } from "@opencode/ai/effect"
import { define } from "@opencode/plugin/effect/plugin"
import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"
import { Global } from "@opencode/util/global"
import { Effect } from "effect"
import path from "path"
import { Learnings } from "../learnings.js"
import { SessionSystemPrompt } from "../session/system-prompt.js"
import OSTA from "./agents/osta.txt"
import BASHMOHANDES from "./agents/bashmohandes.txt"
import MOFATTESH from "./agents/mofattesh.txt"
import HAKIM from "./agents/hakim.txt"
import OSTAZ from "./agents/ostaz.txt"

const ref = (providerID: string, id: string) =>
  Model.Ref.make({ providerID: Provider.ID.make(providerID), id: Model.ID.make(id) })

/**
 * Osta's five minds. Each has its own prompt in `agents/` on top of Osta's, and its own free model, so each draws on
 * its own limit where the sources allow it. An unavailable model falls back to the default like any agent's.
 */
export const Minds = [
  {
    id: Agent.ID.make("osta"),
    name: "الأسطى",
    description: "Osta, the lead: understands, decides, builds, verifies, and hands work to the rest of the team.",
    role: OSTA,
    mode: "primary",
    model: ref("kilo", "nvidia/nemotron-3-ultra-550b-a55b:free"),
    writes: true,
  },
  {
    id: Agent.ID.make("bashmohandes"),
    name: "الباشمهندس",
    description:
      "The planner. Read-only. Use before a change that touches several files or has design choices: returns a numbered plan with the files, steps, risks, and how to verify.",
    role: BASHMOHANDES,
    mode: "all",
    model: ref("kilo", "nvidia/nemotron-3-super-120b-a12b:free"),
    writes: false,
  },
  {
    id: Agent.ID.make("mofattesh"),
    name: "المفتّش",
    description:
      "The reviewer. Read-only. Use after a non-trivial change: reviews the diff and reports only real problems, most severe first, with file and line.",
    role: MOFATTESH,
    mode: "all",
    model: ref("opencode", "deepseek-v4.1-flash-free"),
    writes: false,
  },
  {
    id: Agent.ID.make("hakim"),
    name: "الحكيم",
    description:
      "The debugger. Use for a bug whose cause isn't obvious: reproduces it, finds the root cause, compares fixes, fixes it, and verifies.",
    role: HAKIM,
    mode: "all",
    model: ref("opencode", "glm-5.3-flash-free"),
    writes: true,
  },
  {
    id: Agent.ID.make("ostaz"),
    name: "الأستاذ",
    description:
      "The teacher. Read-only. Use to explain code or a concept: quotes the real code with line numbers, draws diagrams, and ends with a short quiz.",
    role: OSTAZ,
    mode: "all",
    model: ref("opencode", "big-pickle"),
    writes: false,
  },
] as const

// Commands worth a question even for minds that otherwise work without asking.
const DANGEROUS = [
  "rm -rf *",
  "rm -fr *",
  "sudo *",
  "git push --force*",
  "git push -f*",
  "git push * --force*",
  "git push * -f*",
  "git reset --hard*",
  "git clean *",
  "git checkout -- *",
  "npm publish*",
  "bun publish*",
  "mkfs*",
  "dd *",
]

export const Plugin = define({
  id: "osta.team",
  effect: Effect.fn(function* (ctx) {
    const global = yield* Global.Service
    const lessons = (id: string) => [
      path.join(ctx.location.project.directory, Learnings.projectDirectory, Learnings.agentDirectory, `${id}.md`),
      path.join(global.config, Learnings.agentDirectory, `${id}.md`),
    ]
    yield* ctx.agent.transform((editor) => {
      for (const mind of Minds) {
        editor.update(mind.id, (item) => {
          item.name = Agent.Name.make(mind.name)
          item.description = mind.description
          item.mode = mind.mode
          item.model = mind.model
          item.system = SessionSystemPrompt.withRole(`${mind.role.trim()}\n\n${memory(mind.id, lessons(mind.id))}`)
          item.permissions.push(
            { action: "question", resource: "*", effect: "allow" },
            ...DANGEROUS.map((command) => ({ action: "shell", resource: command, effect: "ask" as const })),
          )
          if (mind.writes) return
          item.permissions.push(
            { action: "edit", resource: "*", effect: "deny" },
            // A read-only mind still keeps its own lessons.
            ...lessons(mind.id).map((file) => ({ action: "edit", resource: file, effect: "allow" as const })),
          )
        })
      }
      // The minds replace Build and Plan as the agents people pick; both stay for configs that name them.
      for (const id of [Agent.ID.make("build"), Agent.ID.make("plan")])
        editor.update(id, (item) => {
          item.hidden = true
        })
      editor.default(Minds[0].id)
    })

    // Each mind also reads the lessons of its own craft, next to the shared ones every agent gets.
    yield* ctx.session.hook("context", (event) =>
      Effect.gen(function* () {
        if (Learnings.disabled()) return
        const mind = Minds.find((item) => item.id === event.agent)
        if (!mind) return
        const files = yield* Effect.promise(() =>
          Promise.all(
            lessons(mind.id).map((file) =>
              Bun.file(file)
                .text()
                .catch(() => ""),
            ),
          ),
        )
        const text = files.map((content) => content.trim()).filter(Boolean)
        if (text.length === 0) return
        event.system.push(SystemPart.make(Learnings.present(text.join("\n"))))
      }),
    )
  }),
})

function memory(id: string, files: string[]) {
  return `# Your own lessons
Lessons every mind shares go to \`${Learnings.projectDirectory}/${Learnings.filename}\` as usual. Lessons about your own craft go to \`${files[0]}\` for this project, or to \`${files[1]}\` when they apply everywhere, in the same dated-bullet form. They load for you only (${id}).`
}
