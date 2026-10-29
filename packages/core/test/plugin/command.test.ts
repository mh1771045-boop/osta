import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Command } from "@opencode/core/command"
import { Bus } from "@opencode/core/bus"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { Location } from "@opencode/core/location"
import { Mcp } from "@opencode/core/mcp/index"
import { CommandPlugin } from "@opencode/core/plugin/command"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/schema/session"
import { SessionInbox } from "@opencode/schema/session-inbox"
import { SessionMessage } from "@opencode/schema/session-message"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { DateTime } from "effect"
import { emptyMcpLayer } from "../fixture/mcp"
import { location } from "../fixture/location"
import { testEffect } from "../lib/effect"
import { host } from "./host"
import PROMPT_INITIALIZE from "../../src/plugin/command/initialize.txt"
import PROMPT_REVIEW from "../../src/plugin/command/review.txt"
import PROMPT_LEARN from "../../src/plugin/command/learn.txt"
import PROMPT_LEARNINGS from "../../src/plugin/command/learnings.txt"

const directory = AbsolutePath.make("/repo/packages/app")
const project = AbsolutePath.make("/repo")
const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(location({ directory }, { projectDirectory: project })),
)
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Command.node, Mcp.node, Bus.node]), [
    Mcp.node.replace(emptyMcpLayer),
    Location.node.replace(locationLayer),
  ]),
)

describe("CommandPlugin.Plugin", () => {
  it.effect("registers Osta's learn and learnings commands", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const prompts: string[] = []
      yield* CommandPlugin.Plugin.effect(
        host({
          command: {
            list: () => Effect.die("unused command.list"),
            transform: command.transform,
            reload: command.reload,
          },
          session: {
            prompt: (input) =>
              Effect.sync(() => {
                prompts.push(input.text)
                return SessionInbox.User.make({
                  id: SessionMessage.ID.make("msg_test"),
                  sessionID: input.sessionID,
                  time: { created: DateTime.makeUnsafe(0) },
                  type: "user",
                  payload: { text: input.text },
                  delivery: input.delivery ?? "steer",
                })
              }),
          },
        }),
      ).pipe(
        Effect.provideService(
          Location.Service,
          Location.Service.of(location({ directory }, { projectDirectory: project })),
        ),
      )

      expect(yield* command.get("learn")).toMatchObject({ name: "learn" })
      expect(yield* command.get("learnings")).toMatchObject({ name: "learnings" })
      for (const name of ["learn", "learnings"])
        yield* command.execute({
          name,
          invocation: {
            sessionID: Session.ID.make("ses_test"),
            prompt: { text: "  run bun test from the package directory " },
            delivery: "steer",
          },
        })
      expect(prompts).toEqual([
        PROMPT_LEARN.replaceAll("${path}", project).replaceAll("$ARGUMENTS", "run bun test from the package directory"),
        PROMPT_LEARNINGS.replaceAll("${path}", project).replaceAll(
          "$ARGUMENTS",
          "run bun test from the package directory",
        ),
      ])
      expect(prompts[0]).toContain(`${project}/.osta/learnings.md`)
      expect(prompts[0]).not.toContain("${path}")
    }),
  )

  it.effect("registers built-in init and review commands", () =>
    Effect.gen(function* () {
      const command = yield* Command.Service
      const prompts: {
        text: string
        files?: readonly { readonly uri: string }[]
        delivery?: "steer" | "queue"
      }[] = []
      yield* CommandPlugin.Plugin.effect(
        host({
          command: {
            list: () => Effect.die("unused command.list"),
            transform: command.transform,
            reload: command.reload,
          },
          session: {
            prompt: (input) =>
              Effect.sync(() => {
                prompts.push({ text: input.text, files: input.files, delivery: input.delivery })
                return SessionInbox.User.make({
                  id: SessionMessage.ID.make("msg_test"),
                  sessionID: input.sessionID,
                  time: { created: DateTime.makeUnsafe(0) },
                  type: "user",
                  payload: { text: input.text },
                  delivery: input.delivery ?? "steer",
                })
              }),
          },
        }),
      ).pipe(
        Effect.provideService(
          Location.Service,
          Location.Service.of(location({ directory }, { projectDirectory: project })),
        ),
      )

      expect(yield* command.get("init")).toMatchObject({
        name: "init",
        description: "guided AGENTS.md setup",
      })
      expect(yield* command.get("review")).toMatchObject({
        name: "review",
        description: "review changes [commit|branch|pr], defaults to uncommitted",
      })
      yield* command.execute({
        name: "init",
        invocation: {
          sessionID: Session.ID.make("ses_test"),
          prompt: { text: "extra context", files: [{ uri: "file:///tmp/context.md" }] },
          delivery: "queue",
        },
      })
      yield* command.execute({
        name: "review",
        invocation: {
          sessionID: Session.ID.make("ses_test"),
          prompt: { text: "  branch $& $$ $` $'  " },
          delivery: "steer",
        },
      })
      yield* command.execute({
        name: "init",
        invocation: {
          sessionID: Session.ID.make("ses_test"),
          prompt: { text: "" },
          delivery: "steer",
        },
      })
      yield* command.execute({
        name: "review",
        invocation: {
          sessionID: Session.ID.make("ses_test"),
          prompt: { text: "   " },
          delivery: "steer",
        },
      })
      expect(prompts).toEqual([
        {
          text: PROMPT_INITIALIZE.replace("${path}", project).replaceAll("$ARGUMENTS", "extra context"),
          files: [{ uri: "file:///tmp/context.md" }],
          delivery: "queue",
        },
        {
          text: PROMPT_REVIEW.replace("${path}", project).replaceAll("$ARGUMENTS", () => "branch $& $$ $` $'"),
          files: undefined,
          delivery: "steer",
        },
        {
          text: PROMPT_INITIALIZE.replace("${path}", project).replaceAll("$ARGUMENTS", ""),
          files: undefined,
          delivery: "steer",
        },
        {
          text: PROMPT_REVIEW.replace("${path}", project).replaceAll("$ARGUMENTS", ""),
          files: undefined,
          delivery: "steer",
        },
      ])
    }),
  )
})
