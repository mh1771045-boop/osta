export * as Learnings from "./learnings.js"

// Osta's learning memory: short lessons the agent appends after meaningful work, kept in
// `learnings.md` in the global config directory and in each project's `.osta` directory.
// They load like AGENTS.md, with a size cap that keeps the newest lessons.

export const filename = "learnings.md"
export const projectDirectory = ".osta"
/** Each team member's own lessons, `learnings/<agent>.md` beside the shared file. */
export const agentDirectory = "learnings"
export const limit = 16_000

const header =
  "Lessons Osta recorded in earlier work (newest last). Apply them when they are relevant; the user's current instructions always win."

export function disabled(env: NodeJS.ProcessEnv = process.env) {
  const value = env.OSTA_DISABLE_LEARNINGS ?? env.OPENCODE_DISABLE_LEARNINGS
  return ["1", "true"].includes(value?.toLowerCase() ?? "")
}

/** Prepares a learnings file for the context: adds the header and keeps the newest lessons within the limit. */
export function present(content: string) {
  const text = content.trim()
  if (text.length <= limit) return `${header}\n\n${text}`
  const tail = text.slice(-limit)
  const start = tail.indexOf("\n")
  return `${header}\n\n(Older lessons trimmed to fit.)\n${start === -1 ? tail : tail.slice(start + 1)}`
}
