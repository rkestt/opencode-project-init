/**
 * opencode-project-init — plugin OpenCode.
 *
 * Registra il tool `project_init`: la parte deterministica del bootstrap
 * (detect stack, apply con lock/hash, verify drift, quarantine, budget)
 * chiamabile dall'agente. La parte agentica (search/propose/gate) resta
 * nel template del comando /pi.
 *
 * Nessun import esterno: il loader dei plugin locali NON risolve
 * "@opencode/plugin" (verificato: "Cannot find package" nei log).
 * Firma tool verificata sul runtime: { name, description, execute }.
 */
import { detectStack, applySkill, verifyLock, refreshDiff, quarantineSkill, listQuarantine, skillBudget } from "./core.mjs"

const HELP = "project_init comandi: detect | apply <name> <source> [content] | verify | status | quarantine <name> | budget"

export default {
  id: "opencode-project-init",
  async setup(ctx) {
    const root = () => ctx?.directory ?? ctx?.location?.directory ?? process.cwd()

    await ctx.tool.transform((tools) => {
      tools.add({
        name: "project_init",
        description:
          "Deterministic core of the /pi project-init bootstrap. " +
          "Commands: detect | apply <name> <source> [content] | verify | status | quarantine <name> | budget. " +
          "All writes are repo-scoped and hash-locked; removals go to quarantine, never deleted.",
        async execute(args) {
          const run = async () => {
            try {
              const input = typeof args === "string" ? { command: args }
                : args?.input ?? args ?? {}
              const cmd = String(input.command ?? "").trim()
              const dir = root()

              switch (cmd) {
                case "detect": {
                  const s = detectStack(dir)
                  return [
                    `stack: ${Object.keys(s.deps).length} deps, lock=${s.hasLock}, deploy=${s.deployGuess ?? "n/d"}`,
                    `scripts: ${Object.keys(s.scripts).join(", ") || "n/d"}`,
                    `deps: ${Object.entries(s.deps).slice(0, 30).map(([k, v]) => `${k}@${v}`).join(", ")}`,
                  ].join("\n")
                }
                case "apply": {
                  const content = input.content ?? (await readStdin())
                  if (!content) throw new Error("apply richiede il contenuto della skill (args.content o stdin)")
                  const r = applySkill(dir, { name: input.name, source: input.source, content: String(content) })
                  return `applied ${input.name} → ${r.path} (sha1 ${r.sha1.slice(0, 12)})`
                }
                case "verify": {
                  const v = verifyLock(dir)
                  return `ok=${v.ok.length} drift=${v.drift.join(",") || "-"} missing=${v.missing.join(",") || "-"} untracked=${v.untracked.join(",") || "-"}`
                }
                case "status": {
                  const r = refreshDiff(dir)
                  const b = skillBudget(dir)
                  return [
                    `installed=${r.ok.length} drift=${r.drift.join(",") || "-"} missing=${r.missing.join(",") || "-"}`,
                    `untracked=${r.untracked.join(",") || "-"} quarantined=${r.quarantined.join(",") || "-"}`,
                    `mcps=${r.mcps.join(",") || "-"} budget=${b.count}/${b.max}${b.over ? " OVER" : ""}`,
                  ].join("\n")
                }
                case "quarantine": {
                  if (!input.name) throw new Error("quarantine richiede name")
                  const dest = quarantineSkill(dir, input.name)
                  return `quarantined ${input.name} → ${dest}`
                }
                case "budget": {
                  const b = skillBudget(dir)
                  return `skills=${b.count}/${b.max}${b.over ? " OVER BUDGET" : ""}`
                }
                default:
                  return HELP
              }
            } catch (err) {
              return `project_init ERROR: ${err?.message ?? err}\n\n${HELP}`
            }
          }
          return await run()
        },
      })
    })
  },
}

/** Legge stdin se piped (per pi apply da file), altrimenti "". */
async function readStdin() {
  try {
    if (process.stdin.isTTY) return ""
    const chunks = []
    for await (const c of process.stdin) chunks.push(c)
    return Buffer.concat(chunks).toString("utf8")
  } catch {
    return ""
  }
}
