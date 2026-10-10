/**
 * opencode-project-init — core library (zero dipendenze, node puro, ESM).
 *
 * Parte DETERMINISTICA del bootstrap: detect stack, apply verificato con
 * hash, drift detection, quarantine. La parte agentica (search/propose)
 * vive nel comando /pi, che chiama questi strumenti.
 *
 * Regole hard:
 *  - mai scrivere fuori da root (guardia anti path traversal)
 *  - ogni skill vendorizzata porta header con fonte + hash nel lock
 *  - rimozione = quarantine (mai delete silenziosa)
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, statSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"

export const LOCK_VERSION = 1

/** Guardia: il path risolto deve stare dentro root. */
function assertInside(root, target) {
  const abs = resolve(root, target)
  const r = resolve(root)
  if (abs !== r && !abs.startsWith(r + sep)) throw new Error(`path fuori dal repo rifiutato: ${target}`)
  return abs
}

function atomicWrite(path, content) {
  const tmp = path + ".tmp"
  writeFileSync(tmp, content)
  renameSync(tmp, path)
}

export function sha1(text) {
  return createHash("sha1").update(text, "utf8").digest("hex")
}

// ---------------------------------------------------------------- detect

export function detectStack(root) {
  const pkgPath = join(root, "package.json")
  let pkg = null
  if (existsSync(pkgPath)) {
    try { pkg = JSON.parse(readFileSync(pkgPath, "utf8")) } catch { pkg = null }
  }
  const readmePath = ["README.md", "readme.md", "README"].map((f) => join(root, f)).find((p) => existsSync(p))
  const readme = readmePath ? readFileSync(readmePath, "utf8").slice(0, 4000) : null
  const readmeLower = (readme ?? "").toLowerCase()
  const deployGuess =
    readmeLower.includes("vercel") ? "vercel"
    : readmeLower.includes("netlify") ? "netlify"
    : readmeLower.includes("cloudflare") ? "cloudflare"
    : readmeLower.includes("railway") ? "railway"
    : readmeLower.includes("heroku") ? "heroku"
    : null
  return {
    packageJson: pkg,
    deps: { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) },
    scripts: pkg?.scripts ?? {},
    readme,
    deployGuess,
    hasLock: ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"].some((f) => existsSync(join(root, f))),
  }
}

// ------------------------------------------------------------------ lock

export function lockPath(root) {
  return join(root, ".opencode", "pi-lock.json")
}

export function readLock(root) {
  const p = lockPath(root)
  if (!existsSync(p)) return { version: LOCK_VERSION, skills: {}, mcps: {} }
  try {
    const l = JSON.parse(readFileSync(p, "utf8"))
    return { version: LOCK_VERSION, skills: l.skills ?? {}, mcps: l.mcps ?? {} }
  } catch {
    return { version: LOCK_VERSION, skills: {}, mcps: {} }
  }
}

export function writeLock(root, lock) {
  assertInside(root, lockPath(root))
  mkdirSync(dirname(lockPath(root)), { recursive: true })
  atomicWrite(lockPath(root), JSON.stringify({ version: LOCK_VERSION, ...lock }, null, 2) + "\n")
}

// ------------------------------------------------------------ apply skill

/**
 * Vendorizza una skill nel repo. Ritorna sempre l'hash: il chiamante
 * (agente o CLI) lo mette nella proposta prima di scrivere, cosi' il lock
 * e il disco non possono divergere.
 */
export function applySkill(root, { name, source, content, description }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`nome skill non valido: ${name}`)
  if (!source || !/^https?:\/\//.test(source)) throw new Error(`fonte mancante o non-URL per skill ${name}: serve almeno un URL citabile`)

  // Se il content ha già frontmatter valido lo PRESERVA (mai duplicare).
  let fm = ""
  let body = content
  const fmMatch = content.match(/^---\n[\s\S]*?\n---\n/)
  if (fmMatch) {
    fm = fmMatch[0]
    body = content.slice(fm.length)
    if (!/description:/.test(fm)) throw new Error(`frontmatter senza description per skill ${name}`)
  } else {
    let desc = description ?? ""
    if (!desc.length || desc.length > 300) throw new Error(`description mancante o troppo lunga per skill ${name} (max 300)`)
    fm = `---\nname: ${name}\ndescription: >\n  ${desc}\n---\n`
  }

  const hash = sha1(fm + body)
  const fileHeader = `${fm}\n> **Source:** ${source}\n> **sha1:** ${hash}\n> **Installed by:** opencode-project-init\n\n`
  const dir = assertInside(root, join(".opencode", "skills", name))
  mkdirSync(dir, { recursive: true })
  atomicWrite(join(dir, "SKILL.md"), fileHeader + body)

  // lock subito: disco e lock non possono divergere
  const lock = readLock(root)
  lock.skills[name] = { source, sha1: hash, installedAt: new Date().toISOString() }
  writeLock(root, lock)
  return { path: join(dir, "SKILL.md"), sha1: hash }
}

// ---------------------------------------------------------------- verify

/** Confronta lock e disco: drift (modificata), missing (cancellata), untracked (mai lockata). */
export function verifyLock(root) {
  const lock = readLock(root)
  const res = { ok: [], drift: [], missing: [], untracked: [] }
  const skillsDir = join(root, ".opencode", "skills")
  const onDisk = existsSync(skillsDir)
    ? readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : []

  for (const [name, entry] of Object.entries(lock.skills)) {
    const sk = join(skillsDir, name, "SKILL.md")
    if (!existsSync(sk)) { res.missing.push(name); continue }
    // struttura file: frontmatter + header source + corpo → togli header, sha1 del resto
    let text = readFileSync(sk, "utf8")
    const fmM = text.match(/^---\n[\s\S]*?\n---\n/)
    const fm = fmM ? fmM[0] : ""
    const rest = text.slice(fm.length).replace(/^\n?> \*\*Source:\*\*.*\n(> \*\*sha1:\*\*.*\n)?(> \*\*Installed by:\*\*.*\n)?\n/, "")
    if (sha1(fm + rest) === entry.sha1) res.ok.push(name)
    else res.drift.push(name)
  }
  res.untracked = onDisk.filter((n) => !(n in lock.skills))
  return res
}

// ------------------------------------------------------------- quarantine

export function quarantineSkill(root, name) {
  const src = assertInside(root, join(".opencode", "skills", name))
  if (!existsSync(src)) throw new Error(`skill non trovata: ${name}`)
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const dest = assertInside(root, join(".opencode", "quarantine", `${name}-${stamp}`))
  mkdirSync(dest, { recursive: true })
  renameSync(src, dest)
  writeFileSync(join(dest, "manifest.json"), JSON.stringify({ name, quarantinedAt: new Date().toISOString() }, null, 2))
  const lock = readLock(root)
  delete lock.skills[name]
  writeLock(root, lock)
  return dest
}

export function listQuarantine(root) {
  const dir = join(root, ".opencode", "quarantine")
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
}

// ---------------------------------------------------------------- refresh

/** Diff lock vs disco vs profilo: cosa c'è, cosa manca, cosa è orfano. */
export function refreshDiff(root) {
  const v = verifyLock(root)
  const lock = readLock(root)
  return { ...v, quarantined: listQuarantine(root), mcps: Object.keys(lock.mcps) }
}

// ------------------------------------------------------------------- mcp

/** Aggiunge/aggiorna un MCP nella opencode.json del PROGETTO (mai globale). */
export function addMcp(root, name, config) {
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(name)) throw new Error(`nome MCP non valido: ${name}`)
  const cfgPath = assertInside(root, "opencode.json")
  let cfg = {}
  if (existsSync(cfgPath)) {
    try { cfg = JSON.parse(stripJsonc(readFileSync(cfgPath, "utf8"))) } catch { cfg = {} }
  }
  cfg.mcp ??= {}
  cfg.mcp[name] = config
  atomicWrite(cfgPath, JSON.stringify(cfg, null, 2) + "\n")
  return cfgPath
}

/** Rimuove commenti // e /* *\/ da jsonc (minimale, senza virgole finali). */
export function stripJsonc(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1")
}

// ------------------------------------------------------------ budget hook

/** Budget routing: avvisa se le skill progetto superano la soglia. */
export function skillBudget(root, max = 25) {
  const dir = join(root, ".opencode", "skills")
  const count = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).length
    : 0
  return { count, max, over: count > max }
}
