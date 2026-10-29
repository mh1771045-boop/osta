import { describe, expect, test } from "bun:test"
import { AIError, QuotaExceededError, RateLimitError, TransportError } from "@opencode/ai/effect"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { SessionRunnerFallback } from "@opencode/core/session/runner/fallback"
import { Money } from "@opencode/schema/money"

const info = (providerID: string, id: string, input = 0) => ({
  ...Model.Info.default(Provider.ID.make(providerID), Model.ID.make(id)),
  cost: [
    {
      input: Money.USDPerMillionTokens.make(input),
      output: Money.USDPerMillionTokens.make(input),
      cache: { read: Money.USDPerMillionTokens.zero, write: Money.USDPerMillionTokens.zero },
    },
  ],
})
const ref = (model: { providerID: Provider.ID; id: Model.ID }) =>
  Model.Ref.make({ providerID: model.providerID, id: model.id })
const name = (model: { providerID: string; id: string } | undefined) => model && `${model.providerID}/${model.id}`

const ultra = info("kilo", Model.KILO_ULTRA)
const lightning = info("kilo", Model.KILO_LIGHTNING)
const zen = info("opencode", "big-pickle")
const zenPaid = info("opencode", "claude-opus-5-5", 4)
const copilotPremium = info("github-copilot", "claude-opus-5.5", 4)
const copilotMini = info("github-copilot", "gpt-5.4-mini", 0.75)
const ollama = info("ollama", "qwen3:8b")
const all = [ultra, lightning, zenPaid, zen, copilotPremium, copilotMini, ollama]

describe("SessionRunnerFallback.next", () => {
  test("walks Kilo Ultra, Kilo Lightning, Zen, Copilot, then Ollama", () => {
    expect(name(SessionRunnerFallback.next(ref(ultra), all))).toBe(`kilo/${Model.KILO_LIGHTNING}`)
    expect(name(SessionRunnerFallback.next(ref(lightning), all))).toBe("opencode/big-pickle")
    expect(name(SessionRunnerFallback.next(ref(zen), all))).toBe("github-copilot/gpt-5.4-mini")
    expect(name(SessionRunnerFallback.next(ref(copilotPremium), all))).toBe("ollama/qwen3:8b")
    expect(SessionRunnerFallback.next(ref(ollama), all)).toBeUndefined()
  })

  test("moves any other Kilo free model to Lightning first", () => {
    const superModel = info("kilo", "nvidia/nemotron-3-super-120b-a12b:free")
    expect(name(SessionRunnerFallback.next(ref(superModel), all))).toBe(`kilo/${Model.KILO_LIGHTNING}`)
  })

  test("skips sources that are not available", () => {
    expect(name(SessionRunnerFallback.next(ref(ultra), [ultra, ollama]))).toBe("ollama/qwen3:8b")
  })

  test("never moves a model outside the free chain", () => {
    expect(SessionRunnerFallback.next(ref(zenPaid), all)).toBeUndefined()
    expect(SessionRunnerFallback.next(ref(info("anthropic", "claude-opus-5-5", 4)), all)).toBeUndefined()
  })
})

describe("SessionRunnerFallback.exhausted", () => {
  test("is true for rate limits and quotas only", () => {
    expect(SessionRunnerFallback.exhausted(new AIError({ reason: new RateLimitError({ message: "429" }) }))).toBe(
      true,
    )
    expect(
      SessionRunnerFallback.exhausted(new AIError({ reason: new QuotaExceededError({ message: "quota" }) })),
    ).toBe(true)
    expect(
      SessionRunnerFallback.exhausted(
        new AIError({ reason: new TransportError({ message: "down", transport: "http", operation: "request" }) }),
      ),
    ).toBe(false)
  })
})
