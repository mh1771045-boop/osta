import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { ProviderPlugins } from "@opencode/core/plugin/provider"
import { KiloPlugin } from "@opencode/core/plugin/provider/kilo"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { Money } from "@opencode/schema/money"
import { withEnv } from "../fixture/env"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

const addPlugin = Effect.fn(function* () {
  const plugin = yield* Plugin.Service
  const host = yield* PluginHost.make(plugin)
  yield* KiloPlugin.effect(host)
})

describe("KiloPlugin", () => {
  test("is registered so legacy referer headers can be applied", () => {
    expect(ProviderPlugins.map((item) => item.id)).toContain("opencode.provider.kilo")
  })

  it.effect("applies legacy referer headers only to Kilo endpoints", () =>
    Effect.gen(function* () {
      const catalog = yield* Provider.Service
      yield* catalog.transform((catalog) => {
        catalog.update(Provider.ID.make("kilo"), (provider) => {
          provider.package = "@opencode/ai/providers/openai-compatible"
          provider.settings = { baseURL: "https://api.kilo.ai/api/gateway" }
          provider.headers = { Existing: "value" }
        })
        catalog.update(Provider.ID.openrouter, () => {})
      })
      yield* addPlugin()
      expect((yield* catalog.get(Provider.ID.make("kilo")))?.headers).toEqual({
        Existing: "value",
        "HTTP-Referer": "https://opencode.ai/",
        "X-Title": "opencode",
      })
      expect((yield* catalog.get(Provider.ID.openrouter))?.headers).toBeUndefined()
    }),
  )

  it.effect("uses the exact legacy Kilo header casing and set", () =>
    Effect.gen(function* () {
      const catalog = yield* Provider.Service
      yield* catalog.transform((catalog) => {
        catalog.update(Provider.ID.make("kilo"), (provider) => {
          provider.package = "@opencode/ai/providers/openai-compatible"
          provider.settings = { baseURL: "https://api.kilo.ai/api/gateway" }
        })
      })
      yield* addPlugin()

      expect((yield* catalog.get(Provider.ID.make("kilo")))?.headers).toEqual({
        "HTTP-Referer": "https://opencode.ai/",
        "X-Title": "opencode",
      })
      expect((yield* catalog.get(Provider.ID.make("kilo")))?.headers).not.toHaveProperty("http-referer")
      expect((yield* catalog.get(Provider.ID.make("kilo")))?.headers).not.toHaveProperty("x-title")
      expect((yield* catalog.get(Provider.ID.make("kilo")))?.headers).not.toHaveProperty("X-Source")
    }),
  )

  it.effect("uses endpoint package matching instead of a provider ID guard", () =>
    Effect.gen(function* () {
      const catalog = yield* Provider.Service
      yield* catalog.transform((catalog) => {
        catalog.update(Provider.ID.make("kilo"), (provider) => {
          provider.package = Provider.aisdk("kilo")
        })
        catalog.update(Provider.ID.make("custom-kilo"), (provider) => {
          provider.package = "@opencode/ai/providers/openai-compatible"
          provider.settings = { baseURL: "https://api.kilo.ai/api/gateway" }
        })
      })
      yield* addPlugin()

      expect((yield* catalog.get(Provider.ID.make("kilo")))?.headers).toBeUndefined()
      expect((yield* catalog.get(Provider.ID.make("custom-kilo")))?.headers).toEqual({
        "HTTP-Referer": "https://opencode.ai/",
        "X-Title": "opencode",
      })
    }),
  )

  const kilo = Provider.ID.make("kilo")
  const price = (input: number) => [
    {
      input: Money.USDPerMillionTokens.make(input),
      output: Money.USDPerMillionTokens.make(input),
      cache: { read: Money.USDPerMillionTokens.zero, write: Money.USDPerMillionTokens.zero },
    },
  ]
  const seed = Effect.fn(function* () {
    const catalog = yield* Provider.Service
    yield* catalog.transform((catalog) => {
      catalog.update(kilo, () => {})
      catalog.models.update(kilo, Model.KILO_ULTRA, (draft) => {
        draft.cost = price(0)
      })
      catalog.models.update(kilo, Model.ID.make("anthropic/claude-sonnet-5"), (draft) => {
        draft.cost = price(2)
      })
    })
  })

  it.effect("serves Kilo's free models without a key and hides its paid ones", () =>
    withEnv({ KILO_API_KEY: undefined, OPENCODE_DISABLE_FREE_MODELS: undefined }, () =>
      Effect.gen(function* () {
        const catalog = yield* Provider.Service
        const models = yield* Model.Service
        yield* seed()
        yield* addPlugin()
        expect((yield* catalog.get(kilo))?.activation).toBe("enabled")
        expect((yield* catalog.get(kilo))?.settings?.apiKey).toBeUndefined()
        expect((yield* models.get(kilo, Model.KILO_ULTRA))?.enabled).toBe(true)
        expect((yield* models.get(kilo, Model.ID.make("anthropic/claude-sonnet-5")))?.enabled).toBe(false)
      }),
    ),
  )

  it.effect("leaves Kilo alone when KILO_API_KEY is set", () =>
    withEnv({ KILO_API_KEY: "secret" }, () =>
      Effect.gen(function* () {
        const catalog = yield* Provider.Service
        const models = yield* Model.Service
        yield* seed()
        yield* addPlugin()
        expect((yield* catalog.get(kilo))?.activation).not.toBe("enabled")
        const paid = (yield* models.all()).find((model) => model.id === "anthropic/claude-sonnet-5")
        expect(paid?.enabled).toBe(true)
      }),
    ),
  )
})
