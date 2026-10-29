import { describe, expect } from "bun:test"
import { Effect, Types } from "effect"
import fs from "fs/promises"
import path from "path"
import type { SessionContext } from "@opencode/plugin/effect/session"
import { Agent } from "@opencode/core/agent"
import { Location } from "@opencode/core/location"
import { Model } from "@opencode/core/model"
import { Permission } from "@opencode/core/permission"
import { Project } from "@opencode/core/project"
import { Provider } from "@opencode/core/provider"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { TeamPlugin } from "@opencode/core/plugin/team"
import { Global } from "@opencode/util/global"
import { tmpdirScoped } from "../fixture/tmpdir"
import { it } from "../lib/effect"
import { host } from "./host"

const names = ["osta", "bashmohandes", "mofattesh", "hakim", "ostaz"]

/** Runs the team plugin against an in-memory agent editor rooted at a temporary project. */
const run = Effect.fnUntraced(function* (root: string) {
  const agents = new Map<string, Types.DeepMutable<Agent.Info>>(
    ["build", "plan"].map((id) => [
      id,
      structuredClone(Agent.Info.default(Agent.ID.make(id))) as Types.DeepMutable<Agent.Info>,
    ]),
  )
  const state: { default?: Agent.ID; context?: (input: SessionContext) => Effect.Effect<void> } = {}
  yield* TeamPlugin.Plugin.effect(
    host({
      location: new Location.Info({
        directory: AbsolutePath.make(root),
        project: { id: Project.ID.global, directory: AbsolutePath.make(root), canonical: AbsolutePath.make(root) },
      }),
      agent: {
        get: () => Effect.die("unused agent.get"),
        list: () => Effect.die("unused agent.list"),
        reload: () => Effect.die("unused agent.reload"),
        transform: (callback) => {
          callback({
            list: () => [...agents.values()],
            get: (id) => agents.get(id),
            default: (id) => {
              state.default = id === undefined ? undefined : Agent.ID.make(id)
            },
            update: (id, update) => {
              const current =
                agents.get(id) ??
                (structuredClone(Agent.Info.default(Agent.ID.make(id))) as Types.DeepMutable<Agent.Info>)
              agents.set(id, current)
              update(current)
            },
            remove: (id) => {
              agents.delete(id)
            },
          })
          return Effect.succeed({ dispose: Effect.void })
        },
      },
      session: {
        hook: (name, callback) => {
          if (name === "context") state.context = callback as (input: SessionContext) => Effect.Effect<void>
          return Effect.succeed({ dispose: Effect.void })
        },
      },
    }),
  ).pipe(
    Effect.provideService(Global.Service, Global.Service.of({ ...Global.make(), config: path.join(root, "config") })),
  )
  return { agents, state }
})

const request = (agent: string): SessionContext => ({
  sessionID: Session.ID.make("ses_team_test"),
  agent: Agent.ID.make(agent),
  model: { id: Model.ID.make("test-model"), providerID: Provider.ID.make("test") },
  system: [],
  messages: [],
  tools: {},
  options: {},
})

describe("TeamPlugin", () => {
  it.live("registers the five minds with Osta as the default and hides Build and Plan", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const { agents, state } = yield* run(tmp.path)
      expect(names.every((id) => agents.has(id))).toBe(true)
      expect(state.default).toBe(Agent.ID.make("osta"))
      expect(agents.get("osta")?.mode).toBe("primary")
      expect(names.slice(1).map((id) => agents.get(id)?.mode)).toEqual(["all", "all", "all", "all"])
      expect(agents.get("build")?.hidden).toBe(true)
      expect(agents.get("plan")?.hidden).toBe(true)
      expect(agents.get("osta")?.model).toMatchObject({ providerID: "kilo", id: Model.KILO_ULTRA })
      // Every mind keeps Osta's own prompt and adds its role.
      for (const id of names) expect(agents.get(id)?.system).toStartWith("You are Osta")
      expect(agents.get("ostaz")?.system).toContain("الأستاذ")
    }),
  )

  it.live("keeps read-only minds out of files except their own lessons, and asks before dangerous commands", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const { agents } = yield* run(tmp.path)
      const rule = (id: string, action: string, resource: string) =>
        Permission.evaluate(action, resource, agents.get(id)?.permissions ?? []).effect
      const own = path.join(tmp.path, ".osta", "learnings", "mofattesh.md")
      expect(rule("mofattesh", "edit", path.join(tmp.path, "src", "index.ts"))).toBe("deny")
      expect(rule("mofattesh", "edit", own)).toBe("allow")
      expect(rule("bashmohandes", "edit", own)).toBe("deny")
      expect(rule("osta", "edit", path.join(tmp.path, "src", "index.ts"))).toBe("allow")
      expect(rule("osta", "shell", "bun test")).toBe("allow")
      expect(rule("osta", "shell", "git push --force origin main")).toBe("ask")
      expect(rule("hakim", "shell", "rm -rf build")).toBe("ask")
    }),
  )

  it.live("adds a mind's own lessons to its context only", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      yield* Effect.promise(async () => {
        await fs.mkdir(path.join(tmp.path, ".osta", "learnings"), { recursive: true })
        await Bun.write(
          path.join(tmp.path, ".osta", "learnings", "hakim.md"),
          "- 2026-10-29: Reproduce with bun test first.",
        )
      })
      const { state } = yield* run(tmp.path)
      const hook = state.context
      if (!hook) return yield* Effect.die("team plugin did not register a context hook")
      const hakim = request("hakim")
      yield* hook(hakim)
      expect(hakim.system.map((part) => part.text).join("\n")).toContain("Reproduce with bun test first.")
      const ostaz = request("ostaz")
      yield* hook(ostaz)
      expect(ostaz.system).toEqual([])
    }),
  )
})
