import { Effect, Scope, Stream } from "effect"
import { define } from "@opencode/plugin/effect/plugin"
import { Bus } from "../../bus.js"
import { Credential } from "../../credential.js"
import { Integration } from "../../integration.js"
import { Provider } from "../../provider.js"

export const KiloPlugin = define<Bus.Service | Scope.Scope>({
  id: "opencode.provider.kilo",
  effect: Effect.fn(function* (ctx) {
    const disableFree = ["1", "true"].includes(process.env.OPENCODE_DISABLE_FREE_MODELS?.toLowerCase() ?? "")
    const bus = yield* Bus.Service
    yield* ctx.provider.transform((evt) => {
      for (const item of evt.list()) {
        if (item.provider.package !== "@opencode/ai/providers/openai-compatible") continue
        if (item.provider.settings?.baseURL !== "https://api.kilo.ai/api/gateway") continue
        evt.update(item.provider.id, (provider) => {
          provider.headers = { ...provider.headers, "HTTP-Referer": "https://opencode.ai/", "X-Title": "opencode" }
        })
      }
    })

    // Kilo's gateway serves its `:free` models without an account, limited per IP, so Osta works before any sign-in.
    // Requests then carry no Authorization header, which is how the gateway expects anonymous use.
    const connected = Effect.map(ctx.integration.connection.active("kilo"), Boolean)
    let signedOut = !process.env.KILO_API_KEY && !(yield* connected)
    yield* ctx.provider.transform((providers) => {
      const item = providers.get(Provider.ID.make("kilo"))
      if (!item || disableFree || !signedOut || item.provider.settings?.apiKey) return
      providers.update(item.provider.id, (provider) => {
        provider.activation = "enabled"
      })
    })
    yield* ctx.model.transform((models) => {
      const item = models.provider.get(Provider.ID.make("kilo"))
      if (!item || !signedOut || item.provider.settings?.apiKey) return
      for (const model of models.list(item.provider.id)) {
        if (model.id.endsWith(":free") && !model.cost.some((cost) => cost.input > 0)) continue
        models.update(item.provider.id, model.id, (draft) => {
          draft.enabled = false
        })
      }
    })
    // Signing in to Kilo brings back its paid models without a restart.
    yield* bus.subscribe(Credential.Event.Switched).pipe(
      Stream.filter((event) => event.data.integrationID === Integration.ID.make("kilo")),
      Stream.runForEach(() =>
        connected.pipe(
          Effect.tap((value) =>
            Effect.sync(() => {
              signedOut = !process.env.KILO_API_KEY && !value
            }),
          ),
          Effect.andThen(ctx.provider.reload()),
        ),
      ),
      Effect.forkScoped({ startImmediately: true }),
    )
  }),
})
