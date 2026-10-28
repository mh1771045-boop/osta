import "../settings.css"
import { AnimatedWordmark } from "./animated-wordmark"

export default {
  title: "App/Settings/About wordmark",
  id: "app-settings-about-wordmark",
  component: AnimatedWordmark,
}

export const Settled = {
  render: () => (
    <div class="flex h-40 items-center justify-center bg-v2-background-bg-base">
      <AnimatedWordmark active={false} />
    </div>
  ),
}

export const Shuffling = {
  render: () => (
    <div class="flex h-40 items-center justify-center bg-v2-background-bg-base">
      <AnimatedWordmark active={true} />
    </div>
  ),
}
