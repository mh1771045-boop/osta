export * as SessionRunnerFallback from "./fallback.js"

import type { AIError } from "@opencode/ai/effect"
import { Model } from "../../model.js"

/**
 * Osta's free sources, in the order a Session moves through them when one runs out: Kilo's Nemotron Ultra for
 * accuracy, Kilo's Nemotron Lightning for speed, OpenCode Zen's free models, GitHub Copilot, then a local Ollama.
 * Only a model inside the chain falls back, so a model the user brought a key for keeps the usual retries.
 */
const CHAIN: ReadonlyArray<(model: Pick<Model.Info, "providerID" | "id" | "cost">) => boolean> = [
  (model) => model.providerID === "kilo" && model.id === Model.KILO_ULTRA,
  (model) => model.providerID === "kilo" && model.id === Model.KILO_LIGHTNING,
  (model) => model.providerID === "opencode" && !model.cost.some((cost) => cost.input > 0),
  (model) => model.providerID === "github-copilot",
  (model) => model.providerID === "ollama",
]

/** A source is out of requests: rate limited (429) or past its free or paid quota. */
export const exhausted = (cause: AIError) =>
  cause.reason._tag === "RateLimit" || cause.reason._tag === "QuotaExceeded"

/** The first available model in a later source than `current`, cheapest first within a source. */
export function next(current: Model.Ref, available: ReadonlyArray<Model.Info>) {
  const cost = available.find((model) => model.providerID === current.providerID && model.id === current.id)?.cost
  const tier = CHAIN.findIndex((matches) => matches({ ...current, cost: cost ?? [] }))
  if (tier === -1) return undefined
  return CHAIN.slice(tier + 1)
    .map(
      (matches) =>
        available
          .filter((model) => matches(model) && Model.supportsText(model))
          .toSorted((left, right) => price(left) - price(right))[0],
    )
    .find((model) => model !== undefined)
}

function price(model: Model.Info) {
  return Math.max(0, ...model.cost.map((cost) => cost.input + cost.output))
}
