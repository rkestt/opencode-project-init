// Test core: node:test, progetto fittizio in tmp.
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  detectStack, applySkill, readLock, writeLock, verifyLock,
  quarantineSkill, listQuarantine, refreshDiff, addMcp, sha1, skillBudget,
} from "../src/core.mjs"

const mk = () => mkdtempSync(join(tmpdir(), "pi-core-"))

test("detectStack: deps + scripts + deploy guess", () => {
  const root = mk()
  writeFileSync(join(root, "package.json"), JSON.stringify({
    dependencies: { next: "^15.1.0" }, devDependencies: { typescript: "^5" },
    scripts: { dev: "next dev", typecheck: "tsc --noEmit" },
  }))
  writeFileSync(join(root, "README.md"), "app deployed on Vercel")
  const s = detectStack(root)
  assert.equal(s.deps.next, "^15.1.0")
  assert.equal(s.deployGuess, "vercel")
  assert.equal(s.hasLock, false)
})

test("applySkill: scrive SKILL.md con fonte+hash, aggiorna lock, verificabile", () => {
  const root = mk()
  const content = "# My Skill\n\nDo the thing.\n"
  const { path, sha1: h } = applySkill(root, { name: "my-skill", source: "https://github.com/x/y", content })
  assert.ok(existsSync(path))
  const text = readFileSync(path, "utf8")
  assert.match(text, /Source:\*\* https:\/\/github\.com\/x\/y/)
  assert.ok(h && h.length === 40)
  const lock = readLock(root)
  assert.equal(lock.skills["my-skill"].sha1, h)
  const v = verifyLock(root)
  assert.deepEqual(v.ok, ["my-skill"])
  assert.deepEqual(v.drift, [])
})

test("applySkill senza fonte URL: rifiuta", () => {
  const root = mk()
  assert.throws(() => applySkill(root, { name: "bad", source: "", content: "x" }), /fonte mancante/)
})

test("applySkill nome non-valido: rifiuta", () => {
  const root = mk()
  assert.throws(() => applySkill(root, { name: "../evil", source: "https://x.com", content: "x" }), /nome skill non valido/)
})

test("verifyLock: drift se il file su disco cambia", () => {
  const root = mk()
  applySkill(root, { name: "s1", source: "https://x.com", content: "orig", description: "d" })
  // riscrivi a mano il corpo (dopo header)
  const p = join(root, ".opencode", "skills", "s1", "SKILL.md")
  writeFileSync(p, readFileSync(p, "utf8") + "\nmodifica manuale\n")
  const v = verifyLock(root)
  assert.deepEqual(v.drift, ["s1"])
})

test("verifyLock: missing se cancellata dal disco", () => {
  const root = mk()
  applySkill(root, { name: "s1", source: "https://x.com", content: "orig", description: "d" })
  const lock = readLock(root)
  lock.skills["s1"].sha1 = "deadbeef" // simula lock con hash noto
  rmSync(join(root, ".opencode", "skills", "s1"), { recursive: true })
  const v = verifyLock(root)
  assert.deepEqual(v.missing, ["s1"])
})

test("quarantine: sposta e registra, poi compare in listQuarantine e refresh", () => {
  const root = mk()
  applySkill(root, { name: "old", source: "https://x.com", content: "vecchia", description: "d" })
  const dest = quarantineSkill(root, "old")
  assert.ok(existsSync(join(dest, "SKILL.md")))
  assert.ok(existsSync(join(dest, "manifest.json")))
  assert.ok(!existsSync(join(root, ".opencode", "skills", "old")))
  const r = refreshDiff(root)
  assert.equal(r.quarantined.length, 1)
  assert.ok(r.quarantined[0].startsWith("old-"))
})

test("addMcp: scrive opencode.json progetto, merge senza perdere chiavi", () => {
  const root = mk()
  writeFileSync(join(root, "opencode.json"), '{\n  // commento jsonc\n  "model": "x"\n}\n')
  const p = addMcp(root, "supabase", { type: "remote", url: "https://mcp.supabase.com/mcp" })
  const cfg = JSON.parse(readFileSync(p, "utf8"))
  assert.equal(cfg.model, "x")
  assert.equal(cfg.mcp.supabase.url, "https://mcp.supabase.com/mcp")
})

test("skillBudget: conta e soglia", () => {
  const root = mk()
  assert.equal(skillBudget(root).over, false)
  for (let i = 0; i < 26; i++) applySkill(root, { name: `s${i}`, source: "https://x.com", content: "c", description: "d" })
  const b = skillBudget(root)
  assert.equal(b.count, 26)
  assert.equal(b.over, true)
})

test("applySkill preserva frontmatter esistente (nessun raddoppio)", async () => {
  const root = mk()
  const content = "---\nname: fm-skill\ndescription: Descrizione originale della skill\n---\n\n# Corpo\n\ncontenuto\n"
  applySkill(root, { name: "fm-skill", source: "https://github.com/x/y", content })
  const text = readFileSync(join(root, ".opencode", "skills", "fm-skill", "SKILL.md"), "utf8")
  const fmCount = (text.match(/^---$/gm) || []).length
  assert.equal(fmCount, 2, "deve esserci UN solo blocco frontmatter (2 righe ---)")
  assert.ok(text.includes("Descrizione originale"))
  assert.ok(text.includes("> **Source:** https://github.com/x/y"))
  assert.ok(!text.includes("(vedi fonte)"))
  const v = verifyLock(root)
  assert.deepEqual(v.ok, ["fm-skill"], "hash lock deve combaciare")
})

test("applySkill senza frontmatter: genera da description esplicita", () => {
  const root = mk()
  applySkill(root, { name: "nofm", source: "https://x.com", content: "# Body\n", description: "Desc esplicita" })
  const text = readFileSync(join(root, ".opencode", "skills", "nofm", "SKILL.md"), "utf8")
  assert.match(text, /description: >\n {2}Desc esplicita/)
  const v = verifyLock(root)
  assert.deepEqual(v.ok, ["nofm"])
})
