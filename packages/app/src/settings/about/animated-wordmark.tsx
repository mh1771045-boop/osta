import { createEffect, For, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { prefersReducedMotion } from "@opencode/ui/motion"
import { GLYPHS, HEIGHT, LETTERS, WIDTH } from "@opencode/ui/wordmark-geometry"

const target = LETTERS.map((letter) => letter.char)

const choices = Object.keys(GLYPHS)

export function AnimatedWordmark(props: { active: boolean }) {
  const [state, setState] = createStore({ letters: [...target] })
  const timers = new Set<ReturnType<typeof setTimeout>>()

  createEffect(
    on(
      () => props.active,
      (active) => {
        timers.forEach(clearTimeout)
        timers.clear()

        if (!active || prefersReducedMotion()) {
          setState("letters", [...target])

          return
        }

        const starts = target.map(() => choices[Math.floor(Math.random() * choices.length)])
        const settles = target.map(() => 6 + Math.floor(Math.random() * 8))
        const last = Math.max(...settles)
        setState("letters", starts)

        Array.from({ length: last }, (_, index) => index + 1).forEach((tick) => {
          const timer = setTimeout(() => {
            setState(
              "letters",
              target.map((letter, index) =>
                tick >= settles[index] ? letter : choices[Math.floor(Math.random() * choices.length)],
              ),
            )
            timers.delete(timer)
          }, tick * 75)

          timers.add(timer)
        })
      },
    ),
  )

  onCleanup(() => timers.forEach(clearTimeout))

  return (
    <svg class="settings-about-wordmark" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
      <defs>
        <For each={Object.entries(GLYPHS)}>
          {([char, glyph]) => (
            <symbol id={`settings-about-letter-${char}`} viewBox={`0 0 24 ${HEIGHT}`}>
              <path class="settings-about-letter-shadow" d={glyph.shadow} />
              <path d={glyph.body} />
            </symbol>
          )}
        </For>
      </defs>
      <For each={state.letters}>
        {(letter, index) => (
          <use href={`#settings-about-letter-${letter}`} x={LETTERS[index()].x} width="24" height={HEIGHT} />
        )}
      </For>
    </svg>
  )
}
