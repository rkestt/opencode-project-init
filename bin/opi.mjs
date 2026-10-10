#!/usr/bin/env node
/**
 * opi — CLI di opencode-project-init.
 * Uso: opi <comando> [args]   (esegui dalla root del repo target)
 *
 *   opi detect
 *   opi apply <name> --source <url> [--file <path>]
 *   opi verify
 *   opi status
 *   opi quarantine <name>
 *   opi budget
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { detectStack, applySkill, verifyLock, refreshDiff, quarantineSkill, skillBudget, listQuarantine } from "../src/core.mjs"

const [cmd, ...rest] = process.argv.slice(2)
const root = process.cwd()

const flag = (name) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}

switch (cmd) {
  case "detect": {
    const s = detectStack(root)
    console.log(`stack: ${Object.keys(s.deps).length} deps · lock=${s.hasLock} · deploy=${s.deployGuess ?? "n/d"}`)
    console.log(`scripts: ${Object.keys(s.scripts).join(", ") || "n/d"}`)
    for (const [k, v] of Object.entries(s.deps).slice(0, 40)) console.log(`  ${k}@${v}`)
    break
  }
  case "apply": {
    const name = rest[0]
    const source = flag("source")
    if (!name || !source) {
      console.error("uso: opi apply <name> --source <url> [--file <path>] [--description <desc>]")
      process.exit(1)
    }
    const file = flag("file")
    const content = file ? readFileSync(resolve(root, file), "utf8") : readFileSync(0, "utf8")
    const r = applySkill(root, { name, source, content, description: flag("description") })
    console.log(`applied ${name} → ${r.path} (sha1 ${r.sha1.slice(0, 12)})`)
    break
  }
  case "verify": {
    const v = verifyLock(root)
    console.log(`ok=${v.ok.length} drift=${v.drift.join(",") || "-"} missing=${v.missing.join(",") || "-"} untracked=${v.untracked.join(",") || "-"}`)
    break
  }
  case "status": {
    const r = refreshDiff(root)
    const b = skillBudget(root)
    console.log(`installed=${r.ok.length} drift=${r.drift.join(",") || "-"} missing=${r.missing.join(",") || "-"}`)
    console.log(`untracked=${r.untracked.join(",") || "-"} quarantined=${r.quarantined.join(",") || "-"}`)
    console.log(`mcps=${r.mcps.join(",") || "-"} budget=${b.count}/${b.max}${b.over ? " OVER" : ""}`)
    break
  }
  case "quarantine": {
    if (!rest[0]) { console.error("uso: pi quarantine <name>"); process.exit(1) }
    console.log(`quarantined ${rest[0]} → ${quarantineSkill(root, rest[0])}`)
    break
  }
  case "budget": {
    const b = skillBudget(root)
    console.log(`skills=${b.count}/${b.max}${b.over ? " OVER BUDGET" : ""}`)
    break
  }
  default:
    console.log("pi — opencode-project-init CLI")
    console.log("comandi: detect | apply <name> --source <url> [--file] | verify | status | quarantine <name> | budget")
    console.log(`quarantine attive: ${listQuarantine(root).join(", ") || "nessuna"}`)
}
