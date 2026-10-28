// Osta accepts OSTA_* environment variables everywhere opencode reads OPENCODE_* ones.
// Imported first by the entry point so every module, and the background service it
// spawns, sees the aliases.
for (const [key, value] of Object.entries(process.env)) {
  if (!key.startsWith("OSTA_") || value === undefined) continue
  const target = `OPENCODE_${key.slice("OSTA_".length)}`
  if (process.env[target] === undefined) process.env[target] = value
}
