Process the /pi command with arguments: $ARGUMENTS

PROJECT-INIT protocol — bootstrap tooling for THIS project with a human gate.
NEVER auto-install anything without explicit user approval.

MODES: (empty or "init") full protocol · "refresh" diff-only · "status" summarize.

PHASES:
1. DETECT — use the `project_init` tool with command "detect" to read the real stack
   (deps, versions, scripts, deploy guess). Cross-check with AGENTS.md/README.
   Write/update .opencode/project-profile.md IN THIS REPO: stack with pinned
   versions (flag version mismatches, e.g. "skill targets Svelte 5, repo is 4"),
   conventions, tooling already present.
2. SEARCH — for each key profile entry, search in order: official docs via
   context7; existing skills (skills.sh, awesome-claude-skills, GitHub);
   official MCP servers for the services used; relevant hook patterns.
   BEFORE proposing hooks, READ ~/.config/opencode/plugins/ to see which global
   hooks are already active (e.g. verify-gate runs typecheck/lint/test post-edit
   and blocks git --no-verify) and DO NOT propose duplicates.
   Per candidate: name, source URL, purpose, why THIS stack, context cost,
   version/date.
3. PROPOSE — write .opencode/pi-proposal.md with a table
   | candidate | type | source URL | rationale | context cost | risk |
   plus "Dropped (with reason)" and a third-party review checklist
   (SKILL.md read? scripts inspected? network documented?). STOP: present the
   table in chat and ask keep/cut. Do NOT continue without an answer.
4. APPLY (approved only) —
   · skill → `project_init` tool command "apply" with name, source URL, content
     (fetch the SKILL.md from the source; the tool writes it with a source
     header, sha1-locks it in .opencode/pi-lock.json, and enforces a citable
     source URL). NEVER paste third-party content without a URL.
   · MCP → mcp section of the PROJECT opencode.json (create if missing — never
     touch the global config).
   · hook → .opencode/plugins/<name>.ts using the verified plugin shape:
     `export default { id, async setup(ctx) { ctx.tool.hook("execute.before"|"after", fn) } }`
     with NO import of "@opencode/plugin" (the loader cannot resolve it).
5. VERIFY — run `project_init` "verify" (drift/missing) and "budget" (must stay
   ≤25 project skills — if over, warn and propose cuts). Every written skill
   needs valid name+description frontmatter. Remind: plugin/config changes
   need `opencode service restart`.

REFRESH — re-read profile, run "verify"/"status", propose ONLY the diff
(new deps → new candidates; already-applied → skip). Dropped duplicates of
global hooks with the reason.

HARD CONSTRAINTS:
- NEVER write to ~/.config/opencode/ or ~/.agents/ — only inside this repo.
- NEVER install without cited source URL AND explicit approval.
- Removals go through "quarantine" (never delete people's files silently).
- One skill = one job, trigger-specific description; split or drop multi-job proposals.
- No secrets/credentials in written files.
