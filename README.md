# opencode-project-init

**Project-scoped bootstrap for OpenCode.** Detects your stack, searches for the right skills/MCP/hooks, proposes them with cited sources and a human gate, then applies only what you approved — with sha1 lock and quarantine instead of silent deletes.

Zero dependencies. Node ≥20. Works with any model.

## Install

```bash
npm i -g opencode-project-init        # or: npm i -g github:<you>/opencode-project-init
```
Se l'install si blocca sugli script di `msgpackr-extract` (dip transitiva):
`npm i -g --allow-scripts=msgpackr-extract opencode-project-init`

Then register in your **global** `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugin": ["opencode-project-init"],
  "command": {
    "pi": {
      "description": "Project-init: detect stack, search tools/skills/MCP/hooks, propose with gate, apply approved only.",
      "agent": "build",
      "template": "Process the /pi command with arguments: $ARGUMENTS\n\n(usa il protocollo in commands/pi.md del package opencode-project-init)"
    }
  }
}
```

Restart: `opencode service restart`.

## Use

In any project: **`/pi init`** → profilo + proposta in chat → rispondi
`tutto` / `minimo` / `solo 1,2,4` / `niente` → apply solo l'approvato.

- `/pi refresh` — diff-only quando cambia una dipendenza
- `/opi status` — cosa ha installato il bootstrap in questo repo

## CLI (no agent needed)

```bash
opi detect                                  # profilo stack
opi apply my-skill --source https://github.com/x/y --file ./SKILL.md [--description "..."]
opi verify                                  # drift/missing vs lock
opi status                                  # riepilogo + budget
opi quarantine my-skill                     # mai delete: sposta in .opencode/quarantine/
opi budget                                  # skill vs soglia 25
```

## What it writes (repo-scoped only, never global)

| Path | What |
|---|---|
| `.opencode/project-profile.md` | stack pinnato + convenzioni rilevate |
| `.opencode/pi-proposal.md` | proposta con URL fonti + checklist review |
| `.opencode/pi-lock.json` | source + sha1 di ogni skill vendorizzata |
| `.opencode/skills/<n>/SKILL.md` | skill con header fonte+hash |
| `.opencode/quarantine/<n>-<ts>/` | skill rimosse + manifest (ripristinabili) |
| `opencode.json` (progetto) | MCP approvati |

## Design (from a deep-research study, 2026-10)

- **Human gate on everything**: single-prompt bootstrap is the documented anti-pattern; skills from the internet need review, not auto-install.
- **sha1 lock**: every vendored skill is hash-locked; `opi verify` catches drift and missing files. Immutable-snapshot idea borrowed from `agent-skill-bootstrap`.
- **Quarantine, not delete** (same source). Nothing disappears silently.
- **Budget ≤25 project skills**: past that, routing misfires multiply.
- **Never touches global config**: project-scoped by construction, everything lands in the repo and shows up in `git diff`.

## Dev

```bash
node --test test/     # 13 test: core + plugin
```

Core (`src/core.mjs`) is pure Node, no deps. Plugin registers one tool (`project_init`) with the runtime-verified shape `{ id, setup(ctx) }` + `ctx.tool.transform(add)` — **no `@opencode/plugin` import** (the local plugin loader cannot resolve it; verified in server logs).
