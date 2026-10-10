// Test plugin: registrazione tool + dispatch comandi su repo fittizio.
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const plugin = (await import("../src/plugin.mjs")).default

async function makeTool(root) {
  let tool = null
  await plugin.setup({
    directory: root,
    tool: { transform: async (fn) => { const t = { add: (d) => { tool = d } }; fn(t) } },
  })
  assert.ok(tool, "tool non registrato")
  assert.equal(tool.name, "project_init")
  return tool
}

test("plugin: id valido e tool registrato", () => {
  assert.equal(plugin.id, "opencode-project-init")
  assert.equal(typeof plugin.setup, "function")
})

test("plugin: detect su repo fittizio", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-plugin-"))
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { next: "^15" }, scripts: { dev: "next dev" } }))
  writeFileSync(join(root, "README.md"), "deploy su Vercel")
  const tool = await makeTool(root)
  const out = await tool.execute({ command: "detect" })
  assert.match(out.output, /next@\^15/)
  assert.match(out.output, /deploy=vercel/)
})

test("plugin: apply + verify + status + quarantine end-to-end", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-plugin-"))
  const tool = await makeTool(root)
  const out = await tool.execute({ command: "apply", name: "demo-skill", source: "https://github.com/x/y", content: "# Demo\n\nbody\n", description: "Demo skill" })
  assert.match(out.output, /applied demo-skill/)
  assert.ok(existsSync(join(root, ".opencode", "skills", "demo-skill", "SKILL.md")))

  const v = await tool.execute({ command: "verify" })
  assert.match(v.output, /ok=1/)

  const s = await tool.execute({ command: "status" })
  assert.match(s.output, /installed=1/)

  const q = await tool.execute({ command: "quarantine", name: "demo-skill" })
  assert.match(q.output, /quarantined demo-skill/)
  assert.ok(!existsSync(join(root, ".opencode", "skills", "demo-skill")))
  const s2 = await tool.execute({ command: "status" })
  assert.match(s2.output, /quarantined=demo-skill-/)
})

test("plugin: comando sconosciuto → help con lista comandi", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-plugin-"))
  const tool = await makeTool(root)
  const out = await tool.execute({ command: "boh" })
  assert.match(out.output, /detect \| apply/)
})
