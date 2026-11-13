# Runtime sources

The runtime reference is imported from the owner's local mint-agent checkout, `app-agent/`, at commit `327bb1ece8fe1d07a7b5637f8173481fc73ffde9`. `runtime-source.json` records source/destination paths and SHA-256 hashes for every copied file. The import script refuses dirty source files and refuses to overwrite an existing snapshot. Refreshing it requires inspecting and replacing the existing reference deliberately.

| Local path | Source path under app-agent | Changes |
| --- | --- | --- |
| `vendor/canvas-cli/` | `vendor/canvas-cli/` | None; includes upstream MIT LICENSE and the cloud-patch README. |
| `contracts/vendor/app-web/canvas-protocol/` | Same path | None; preserve the provider contract and relative CLI imports. |
| `runtime/canvas-cli-tool.ts` | `src/canvas-cli-tool.ts` | None; used by the local host harness, not registered by the product. |
| `runtime/workspace-file-guard.ts` | `src/workspace-file-guard.ts` | None; used for child-session file containment. |
| `runtime/launch-config.ts` | `src/launch-config.ts` | None; verifies the assembled launcher against the host parser. |

The original CLI is @scenemint/canvas-cli 0.18.7 as vendored by lingying-agent and adapted by mint-agent. Its README records the cloud changes. The copied skill inside `vendor/canvas-cli/skills` is retained as source evidence; it is not loaded as an active product skill. The active `canvas-skill` reference is adapted here to remove desktop pairing/export promises and describe creative-plan delivery.

New `.pi/extensions/skill-tools.mjs` follows the fixed-Node-entrypoint approach from `products/novel-to-script/.pi/extensions/novel-tools.ts`, with an explicit registry, role-specific permissions, child filesystem permissions, and link checks. New workflow integration follows the same product's isolated-session and tool-allowlist approach, using the installed workflow engine's public exports. It does not copy the source product's unrelated business orchestration, desktop UI or background-delivery system.

Creative skill and Pi role sources remain at repository root. Assembly copies them without rewriting creative content. Existing repository LICENSE and NOTICE continue to apply. Node/Pi/workflow/goal versions are pinned in package.json and pnpm-lock.yaml; no third-party package is fetched by a model tool at runtime.
