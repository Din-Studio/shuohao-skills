# Mint cloud runtime integration plan

Status: implementation and local verification complete on feat/mint-cloud-runtime. Cloud integration remains deferred. The owner authorized committing and pushing this branch after local acceptance.

## Goal and agreed scope

Adapt the eight `mint-*` skills and their application packaging to the capabilities used by mint-agent's Pi runtime. Replace agent-facing bash execution, external media-generation commands, and standalone Pi subprocess delegation with product tools, `canvas_cli`, and the existing workflow integration pattern.

Owner decisions in this conversation:

- Work on `feat/mint-cloud-runtime` in `E:/Din-Studio/shuohao-skills`, based on `dev` at `637274eaf0be12bfec7601741fa7b9535559bdc2`.
- Validate deterministic script tools and workflow integration locally. Real canvas integration is deferred to the later cloud integration phase (option B).
- Give the application package its own manifest and lockfile, with dependencies aligned to app-agent. Deterministic skill scripts remain standard-library-only.
- Do not modify any file in `E:/Din-Studio/mint-agent` in this session. That checkout is a read-only reference.
- The skills maintainers finish this adaptation before mint-agent consumes it. Product registration, protocol changes, image builds, and deployment are outside this phase.

This document was the first deliverable. The initial implementation scope excluded staging and publishing; after local acceptance, the owner explicitly authorized one coherent commit and a push to the feature branch. Merge and deployment remain outside this authorization.

## Verified baseline

Read-only references under `mint-agent/app-agent`:

| Source | Relevant behavior |
| --- | --- |
| `src/products.ts` | Loads product resources and tools from a launcher; injects the host canvas tool when the launcher does not explicitly name `canvas_cli`. |
| `src/launch-config.ts` | Parses `exec pi` without executing the shell script; product resources must be under `.pi/`; host owns model, authentication, and session selection. |
| `src/canvas-cli-tool.ts` | Exposes argv-based `canvas_cli`, injects the chat session, executes sequentially, and calls the CLI in process. |
| `vendor/canvas-cli` | Cloud variant of CLI 0.18.7. Requires an installed bridge and registered session; has no local daemon. |
| `vendor/canvas-cli/src/policy.mjs` | Re-exports the app-web protocol through a relative path into `contracts/vendor/app-web/canvas-protocol`. Copying the CLI alone leaves broken imports. |
| `products/novel-to-script/.pi/extensions/novel-tools.ts` | Uses `execFile(process.execPath, ...)` for fixed deterministic scripts without a shell. A useful pattern, not a complete sandbox to copy unquestioningly. |
| `products/novel-to-script/.pi/extensions/orchestration.ts` | Integrates workflow execution, product-local role definitions, and role-specific tool allowlists. This behavior is not provided merely by installing the workflow package. |
| `products/novel-to-script/.pi/workflows/review_one.json` | Example of dispatching an isolated role through `workflow`. |
| `products/SOURCES.md`, `vendor/canvas-cli/README.md` | Provenance and cloud modifications to preserve when porting relevant content. |

Dependency baseline from app-agent's manifest:

- Node 24; pnpm 12.14.0.
- `@earendil-works/pi-coding-agent`: 1.3.0.
- `@earendil-works/pi-ai`: 1.3.0.
- `@quintinshaw/pi-dynamic-workflows`: 3.14.0.
- `@narumitw/pi-goal`: 0.54.13.

Before implementing imports, inspect the installed packages' exports and app-agent's lockfile. Do not assume a transitive `typebox` dependency is available to the new package; prefer the supported schema export already used by the host tool, or declare an exact direct dependency if required.

## Ownership and package boundary

The skills repository owns creative instructions, deterministic logic, role definitions, saved workflows, and the new product packaging. Mint remains the source of the canvas protocol and runtime integration reference. Record the actual mint source commit, original paths, licenses, and local changes in the package's `SOURCES.md` when importing files.

The production host continues to own the bridge, session identities, model access, credentials, event delivery, workspace lifecycle, and storage. Do not copy the AgentCore server or implement a second host in this repository.

Recommended layout:

```text
skills/mint-*/                         # Canonical creative skills and deterministic scripts
agents/                               # Existing role sources, adapted for cloud tool use
products/mint-drama/                   # Working package name, not a registered AgentId
  package.json
  pnpm-lock.yaml
  launch.sh                           # Configuration parsed by the future host
  SOURCES.md
  README.md
  .pi/
    SYSTEM.md
    extensions/                       # Script tools and workflow integration
    agents/                           # Packaged role definitions
    workflows/                        # Writer/reviewer workflow definitions
    skills/                           # Packaged mint skills and canvas guidance
  vendor/canvas-cli/                  # Runtime reference/local harness dependency if used
  contracts/vendor/app-web/canvas-protocol/
  scripts/                            # Assembly and verification commands
  test/                               # Local host and transport fakes
```

Keep one editable source for each creative skill. Assemble `.pi/skills/` from those sources with a deterministic package command; do not manually maintain two diverging copies. The assembled product must work without reading a sibling checkout or requiring global skill installation. Runtime resources must match the launcher's `.pi/` restriction.

The vendored CLI and protocol reproduce the matching runtime interface for local tests. The imported cloud-state implementation shares state through `Symbol.for("mint.app-agent.canvas-cloud.v1")` on globalThis, including across module instances in the same process. The eventual host must preserve this shared bridge/session contract and version compatibility. The product does not register a second canvas tool or install its own bridge.

## Required adaptations

### 1. Deterministic script tools

Inventory every agent-facing shell command in SKILL.md, references, role definitions, and application instructions. Map each required operation to an explicit tool action. Include validation, initialization, seeding, rendering, export, and prompt worksheet operations actually used by the pipeline.

Retain the scripts' existing deterministic behavior and tests. Wrap fixed scripts with direct Node execution following the current product pattern. Some scripts call `process.exit`; do not import and invoke these entrypoints inside the Pi host without first refactoring their process-level behavior.

The wrapper must:

- Select scripts and operations from a fixed registry. Never accept an arbitrary executable, script path, shell command, or Node flags.
- Resolve the workspace from trusted runtime context, not model-supplied cwd.
- Validate input/output paths, including paths inside manifests and relative upstream references. A fixed cwd alone does not enforce a workspace boundary.
- Reject traversal and symlink escapes; allow only explicitly required read-only packaged resources outside the workspace.
- Enforce role-specific access to mutating operations. A reviewer without `write` must not regain unrestricted writes through a generic script tool.
- Return actual exit status, stdout, stderr, and timeout/cancellation information. Validation failures remain visible and cannot be reported as a passed check.
- Apply bounded execution and propagate cancellation to child execution.

Tool names and action schemas are selected after the operation inventory. Avoid one unrestricted `script + argv` execution tool.

### 2. Canvas and generation

Replace the cloud application's ly-image/ly-video credential and command instructions with `canvas_cli` operations. The runtime provides the chat connection; cloud instructions must not require connection-code pairing, a local daemon, personal API keys, or shell invocation of the CLI binary.

Use the existing offline plans as inputs to a documented canvas handoff:

1. Read current canvas state and model capabilities.
2. Match plan items to canvas nodes and ordered reference inputs.
3. Create or update nodes through the supported CLI contract.
4. Request generation within the host's authorization and billing rules.
5. Inspect existing task state to resume; uncertain submission must not trigger automatic resubmission.
6. Download successful outputs into the workspace paths expected by downstream skills; verify them before rendering reports.

Preserve the mapping between plan item IDs, canvas node IDs, returned task/output identities, and local output paths. Keep dependency ordering and approved prompt content intact. Do not silently substitute models or omit unsupported parameters.

Port cloud-appropriate canvas guidance from the runtime, checking it against the implementation. Existing guidance still contains desktop connection and Jianying sections even though the cloud CLI does not support those operations; do not copy those promises into the new application.

Creative scripts remain self-contained and able to export plans without invoking another skill. Canvas execution belongs to the application integration layer. Each skill keeps its own references and examples; the application supplies canvas capabilities without introducing script imports from sibling skills.

### 3. Workflow and roles

Adapt the current product orchestration pattern to load the two prompt roles and their saved workflows from the packaged product. Reuse only the integration pieces needed here; do not copy the entire novel-to-script orchestration implementation and its unrelated business rules.

Replace agent-facing `subagent` and `pi -p` instructions with `workflow` and `workflow_control`. Preserve:

- Separate writer and reviewer contexts.
- Explicit tool allowlists for built-in and custom tools.
- Deterministic checks between writing and review.
- Approval bound to the reviewed inputs; relevant input changes invalidate approval.
- Existing stopping conditions for repeated rejection and blocked work.
- Main-session ownership of generation and restricted canvas operations.

Integrate pi-goal where the application uses it to track completion, waiting, and blocking. Creative `autopilot` does not grant new spending authorization or bypass validation.

### 4. Application packaging and instructions

Add the product manifest, exact dependency versions, lockfile, system prompt, launcher, extensions, roles, workflows, and assembly command. The launcher declares only tools that are actually registered. Follow the existing host-injection rule for `canvas_cli`; explicitly listing it requires a product extension that registers it.

Update the active skill instructions and application README so the supported agent execution path uses tools throughout. Developer self-tests and package assembly may still run Node commands from a developer terminal; removing agent bash does not mean deleting deterministic scripts.

Replace installation and multi-agent compatibility claims where they describe the new cloud application. Do not build a second desktop generation path or a fallback to shell execution. Preserve creative methods, schema v3 data, and existing examples unless a concrete runtime constraint requires changing them.

## Implementation sequence

1. Record the source revisions and operation inventory; identify all required tools and file paths.
2. Add the standalone package and deterministic resource assembly; validate launcher/resource layout.
3. Add bounded script tools and migrate their skill instructions; run focused existing self-tests plus boundary checks.
4. Adapt workflow integration and the writer/reviewer roles; test with a fake model and temporary workspace.
5. Integrate the canvas interface and rewrite generation handoff guidance; test with a fake bridge only.
6. Verify the assembled package independently of the mint checkout, run the complete existing deterministic suite, and record local results and deferred cloud checks.

## Acceptance and verification

Local acceptance requires:

- All existing deterministic skill and pipeline self-tests pass. Discover the full set under `skills/*/scripts/*selftest.mjs` and `scripts/*-selftest.mjs`; do not silently skip suites after changing their paths.
- The package installs from its frozen lockfile and its type checks and package tests pass.
- Assembly contains every declared resource and works from a separate temporary location without references to either original checkout.
- No main or worker session exposes bash, arbitrary process execution, or a `pi -p` delegation path.
- Script-tool tests cover a successful operation, validation failure, input/output escape, symlink escape, embedded path escape, role restrictions, cancellation, and timeout.
- A fake-model workflow runs writer -> deterministic check -> reviewer, verifies rejection/revision and stopping behavior, and enforces role tool permissions.
- A fake canvas bridge verifies session injection, policy refusal, plan-to-command mapping, stable reference order, output-path handling, and recovery without duplicate submission.
- Test outcomes distinguish transport acceptance from completed generation. Local fakes do not establish cloud approval, billing, or browser behavior.
- The only changed repository is shuohao-skills. No deployment, cloud mutation, real media generation, credential access, commit, or push occurs as part of this plan.

Deferred acceptance for the later mint integration session:

- Register the product and catalog entries through mint's normal contract and release process.
- Confirm the host loads the packaged product with the expected tools and a shared CLI bridge/session registry.
- Verify real browser canvas operations, approval, generation, billing, task recovery, output delivery, and chat persistence in the authorized cloud environment.

The final implementation report must identify the tested source revision and package, list the commands actually run and their results, and explicitly mark these cloud checks as pending.

## Implementation record (2026-11-13)

- Product: `products/mint-drama`, with exact dependency versions, a frozen lockfile, declarative launcher, pi-goal, fixed deterministic script tools, and two isolated workflow roles.
- Runtime source: mint-agent `327bb1ece8fe1d07a7b5637f8173481fc73ffde9`. `runtime-source.json` records SHA-256 hashes for all 58 imported files; the package test checks every hash. Later concurrent changes in the source checkout were not imported or modified by this session.
- Canonical skill instructions now use `mint_skill`, `workflow`, and host `canvas_cli({args})`. Assembly produces eight creative skills plus cloud canvas guidance and two role definitions. The generated directories are ignored by Git and must be included in the assembled artifact.
- Image/video plans retain ordering, references, dependencies and output paths while naming the canvas handoff. Setup returns a structured model search by configured name and media type; callers must choose the matching observed catalog ID.
- Independent review found Pi's implicit request retries beneath the workflow engine. Child session retries and provider retries are now disabled, with a real Pi / local HTTP 500 regression asserting exactly one request and a failed result.
- A local scripted model exercises writer submission, deterministic checks, reviewer rejection, writer response/resubmission, and input-bound approval. This proves orchestration and tool behavior, not creative judgment. The main-session prompt owns the three-submission stopping policy; it is not a separate automatic workflow loop.

### Verification record

Commands run from `products/mint-drama` unless specified otherwise.

| Verification | Result |
| --- | --- |
| `pnpm assemble` | Passed: eight creative skills, canvas guidance and two roles. |
| `pnpm verify:package` | Passed in a separate temporary package: frozen dependency installation, `tsc --noEmit`, and all 24 product tests; no failures or skips. |
| `node --test test/workflow.test.mjs` | Passed: five real-engine/local-model workflow tests, including revision/approval and retryable provider failure. |
| Complete deterministic suite via `node products/mint-drama/scripts/test-skills.mjs` in native offline Linux | Passed: all 34 suites, zero failed; includes cross-stage, migration, self-contained copies and their local documentation links. Native image: `mint-local/api:v2m1`, Node 24.22.2; entrypoint overridden to Node, network disabled. |
| `git diff --check` from repository root | Passed. |

The initial Windows full legacy suite did not pass: file-symlink privileges and POSIX path expectations prevent several existing suites from running there. Its changed-contract regressions were corrected. The first Linux attempt used an ARM image under emulation and hit suite timeouts; it was stopped. The replacement uses an existing native amd64 Node 24.22.2 image, copies only skills/scripts/agents and the test runner into the container's temporary filesystem, mounts the source read-only, and disables container networking.

Real AgentCore loading, browser canvas reference resolution, spending approval, generation, billing and persistence remain deferred. Unsupported negative prompts explicitly block media handoff until the creative requirement is revised and approved; they are never silently discarded. No source-host integration, staging, commit, push, publication or deployment was performed.
