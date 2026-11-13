# @scenemint/canvas-cli (mint-agent cloud build)

A copy of `@scenemint/canvas-cli` 0.18.7 as vendored by lingying-agent (`vendor/canvas-cli`), changed so
it runs inside the app-agent worker process instead of talking to a loopback daemon. The products and
the host `canvas_cli` tool import it by its package name (`link:` dependency of app-agent).

What changed against 0.18.7:

- `src/client.mjs` is rewritten. `call()` checks `enforceRequestPolicy` and hands the request to the
  bridge the host installs (`src/cloud-state.mjs`); the host emits it as a `canvas_request` event and
  resolves it with the page's `tool_results` answer. `/v1/status`, `/v1/delegate`, `/v1/revoke` and
  `/v1/stop` are answered from the in-process session registry. A registered session is always
  `connected`; the chat's main session cannot be stopped from the agent.
- `src/session.mjs` reads sessions from that registry instead of 0600 credential files. The workspace
  file boundary (`workspaceRoot`, `workspacePath`, `readWorkspaceFile`) is unchanged.
- `src/cli.mjs` gains `run(argv, { stdin })`, the in-process form of `main()`; `--file -` reads the
  `stdin` given to `run`. `jianying-roots` and `export-jianying` answer `unsupported_in_cloud`.
- `src/{policy,contract,host-text,layout-policy,scene3d-*,tidy-summary,echo,connection-code}.mjs`
  re-export the app-web canvas protocol copy in `contracts/vendor/app-web/canvas-protocol/`.
- `src/cloud.mjs` (`./cloud`) is new: `installCanvasBridge`, `registerMainSession`, `runCli`.
- Removed: `src/daemon.mjs` and `src/jianying/` (desktop only), `CHANGELOG.md`, `PROTOCOL.md`.
- Removed on 2026-10-29 with the project document library (doc@1): the `docs ls|read|create|update|delete`
  commands (`src/docs.mjs`, their specs, flags and dispatch in `src/spec.mjs` and `src/cli.mjs`, the `docs`
  case of `src/host-argv.mjs`), the `documents_*` methods in `src/common.mjs`, and the library sections of
  `skills/scenemint-canvas`. The protocol provider dropped `DOCUMENTS` and the `documents_*` policy.
- Added on 2026-11-09 with the project asset library (EchoJoyAsset through app-api; the provider's policy
  gained the read method `assets` and the main-only apply command `insert_asset`):
  - `src/spec.mjs`: the `assets` and `insert-asset` command specs, and `insertAssetCommand` (the
    `apply{insert_asset}` body built from `<asset-id> --kind K [--x --y --title | --into NODE]`).
  - `src/cli.mjs`: the boolean `--archived` flag (FLAGS and BOOLEANS), the `assets` params (positional asset
    id, `--kind`, `--tags`, `--archived`, `--limit`, `--offset`) and the `insert-asset` apply.
  - `src/common.mjs`: `assets` in `METHODS`.
  - `skills/scenemint-canvas/SKILL.md`: `assets` in L0, `insert-asset` in L1 and the main-only list, and the
    section 项目资产库. `references/commands.md`: the index row, scene 14b, and the `insert_asset` and
    project assets reference sections. The same two files are copied into every product's
    `.pi/skills/scenemint-canvas/`.
- Changed on 2026-11-10 when the canvas dropped node style presets and the negative prompt:
  `references/commands.md`, the gen field notes say `stylePresetId` no longer changes the prompt and
  `negativePrompt` is no longer sent, and the Midjourney example no longer sets it (copied into every product).
