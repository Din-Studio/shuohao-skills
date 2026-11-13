# Mint drama application

This package adapts the repository's eight creative skills to the Mint Pi cloud runtime. It is a product artifact for later host integration, not a running AgentCore service or a standalone local canvas client.

## Developer setup

Use Node 24.22.1+ and pnpm 12.14.0. From this directory:

```text
pnpm install --frozen-lockfile --ignore-scripts
pnpm assemble
pnpm typecheck
pnpm test
pnpm verify:package
pnpm test:skills
```

`assemble` copies the canonical `../../skills/mint-*` and `../../agents/pi` sources into `.pi/skills` and `.pi/agents`, and includes the cloud canvas guidance from `canvas-skill`. Edit the canonical files, not generated copies. Generated resources are ignored by Git, but must be included in the artifact handed to the host. Re-run assembly after changing any skill or role. The only operation that reads the parent repository is developer assembly/testing; the assembled application's execution reads its own package and the host's chat workspace.

`verify:package` copies the assembled package into a temporary directory, installs from the frozen lockfile (using the registry for packages absent from the local cache), and runs its type checks and product tests. Run it after the first successful dependency installation. `test:skills` runs every existing skill and repository self-test. Some legacy suites require Unix symbolic links and POSIX installer behavior; run the complete suite on Linux when the Windows account cannot create symlinks. Do not count those failures as passed or silently skip them.

## Model-facing tools

| Tool | Ownership and behavior |
| --- | --- |
| `mint_skill({skill,args})` | Product extension. Fixed script/action registry, direct Node execution, no shell. File args are workspace-relative or absolute within the workspace. Render/seed/init stdout is saved through the host write tool. |
| `workflow({name:"mint_prompt",args:{role,task}})` | Product wrapper over pi-dynamic-workflows 3.14.0. One isolated writer or reviewer per foreground call, inheriting the host's model/auth registry. |
| `workflow_control({action,runId})` | Product status/cancel control for the current extension session. No arbitrary scripts, detached work, automatic replay or retries. |
| `canvas_cli({args})` | Host-provided tool. In-process CLI; the host supplies the connection and session. No `--session` argument from the model. |
| `goal_complete`, `goal_blocked`, `goal_wait` | Existing pi-goal extension, declared by the launcher. |
| `read`, `write`, `edit`, `find`, `grep`, `ls` | Pi file tools under the host workspace guard; child sessions get the imported guard and role allowlist. |

`mint_skill` has a 30-second timeout and 1 MiB combined stdout/stderr limit. It uses Node permissions and rejects links before execution. Scripts are trusted, immutable product code; this is a boundary for their data access, not a sandbox for arbitrary JavaScript. The host must keep package sources immutable and prevent concurrent link replacement. The tools inherit no credential environment. Script operations and flags are enumerated in `.pi/extensions/skill-tools.mjs`; unsupported operations fail explicitly.

The writer can use mint-video-prompt operations. The reviewer can lint, inspect and record a verdict in existing named prompt.md worksheets, but cannot invoke generic creation/export/migration writes. Neither child receives shell, canvas, workflow or shared-store tools. Reviewer edit instructions remain scoped to the review section; the file guard enforces workspace containment, not semantic ownership of Markdown sections.

A workflow dispatch returns the role result; the main session performs deterministic checks between writer and reviewer and applies the three-round stopping rule from the creative skill. The worksheet is the durable review record. After an interruption, inspect it before dispatching the unfinished phase. Cancelling a role does not undo its existing file edits.

## Host integration contract

The product launcher is configuration parsed by app-agent; its shell wrapper is not executed in the cloud. It names the product extension and the existing pi-goal dependency path. The host resolves `.pi/vendor/node_modules/` to its own dependencies. The launcher deliberately omits `canvas_cli` from its explicit list so app-agent adds its registered host tool.

The runtime reference snapshot in `runtime`, `vendor/canvas-cli` and `contracts/vendor/app-web/canvas-protocol` supports local tests and integration review. The host continues to own model credentials, canvas bridge installation, chat session identities, events, approval/billing and persistence. The imported CLI uses `Symbol.for("mint.app-agent.canvas-cloud.v1")` on globalThis, so loader instances in the same process share state. Preserve that contract and version compatibility. Do not register a separate host or bridge from this product extension.

Before adding this product to mint-agent, the host maintainers must review dependency resolution, product ID/catalog contracts, artifact installation and workspace behavior. No mint-agent file or deployed service is changed by this repository's adaptation.

## Media handoff

Creative scripts emit offline plans pointing to `scenemint-canvas`; they do not submit generation. Follow `canvas-skill/references/cloud-handoff.md` and commands.md to prepare nodes, preserve reference order, obtain authorization, submit once, recover existing tasks and download verified outputs. An unsupported parameter or missing live schema blocks generation rather than silently changing the plan. `mint-setup resolve` returns a structured `canvas_cli` model-discovery call, not a shell command string.

Local tests use a fake model and a fake canvas bridge. They verify real Pi resource loading, role isolation, script execution, CLI policy/session behavior and download handling. They do not verify a browser, actual generation, billing, approval UI or cloud persistence. Those checks belong to the later authorized cloud integration phase.
