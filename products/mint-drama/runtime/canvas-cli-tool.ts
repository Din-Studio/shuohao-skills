// The host's `canvas_cli` tool, a reduced port of lingying-agent `src/lib/pi/canvas-cli-tool.ts`. Same
// name, label and argument shape; the host registers it only for launchers whose `--tools` does not
// name `canvas_cli` (a product that ships its own copy keeps it). In the cloud the CLI runs in this
// process (`@scenemint/canvas-cli/cloud`) and its canvas calls go through the cloud bridge, so the
// desktop pieces are gone: no spawned executable, no host attestation, no page-away and timeout
// budgets (a pending call suspends the turn instead), no Jianying export.
import { Type, type Static } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { runCli } from "@scenemint/canvas-cli/cloud";
import { injectSession } from "@scenemint/canvas-cli/host";

export const CANVAS_CLI_TOOL_NAME = "canvas_cli";
export const CANVAS_SKILL_NAME = "scenemint-canvas";
const CANVAS_CLI_COMMAND = "scenemint-canvas";
const CANVAS_CLI_MAX_ARGS = 64;
const CANVAS_CLI_MAX_ARG_LENGTH = 4096;

/** A launcher that names `canvas_cli` in `--tools` registers it from its own extension. */
export function hostRegistersCanvasCli(toolNames: readonly string[] | undefined): boolean {
  return !toolNames?.includes(CANVAS_CLI_TOOL_NAME);
}

/** The allowlist to hand Pi when the host registers `canvas_cli`. */
export function withCanvasCliToolName(
  toolNames: readonly string[] | undefined,
): string[] | undefined {
  if (!toolNames?.length) return toolNames ? [...toolNames] : undefined;
  if (toolNames.includes(CANVAS_CLI_TOOL_NAME)) return [...toolNames];
  return [...toolNames, CANVAS_CLI_TOOL_NAME];
}

const SESSIONLESS_COMMANDS: ReadonlySet<string> = new Set(["connect", "help", "skill-path"]);
// The CLI's boolean flags (cli.mjs `BOOLEANS`), as lingying mirrors them.
const BOOLEAN_FLAGS: ReadonlySet<string> = new Set([
  "all",
  "fit-frames",
  "fit",
  "absorb-strays",
  "rerun-succeeded",
  "fresh",
  "force",
  "approved",
  "overwrite",
  "long",
  "fixed",
  "ignore-case",
  "files-only",
  "has-output",
  "probe",
  "wait",
  "dry-run",
  "help",
  "version",
]);

function canvasCliFlagTakesValue(
  key: string,
  command: string | undefined,
  next: string | undefined,
): boolean {
  if (key !== "count") return !BOOLEAN_FLAGS.has(key);
  if (command === "frames") return true;
  if (command !== undefined) return false;
  return next !== undefined && /^\d+(\.\d+)?$/.test(next);
}

/**
 * The command an argv names, read the way the CLI's parser reads it: the first
 * token that is neither a flag nor a flag's value, before any `--`. `undefined`
 * is what the CLI turns into `help`.
 */
export function canvasCliCommandOf(args: readonly string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--") return undefined;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const key = arg.slice(2, eq === -1 ? undefined : eq);
      if (eq === -1 && canvasCliFlagTakesValue(key, undefined, args[index + 1])) index += 1;
      continue;
    }
    return arg;
  }
  return undefined;
}

/** True when the CLI would answer this argv without a session. */
export function canvasCliArgsNeedNoSession(args: readonly string[]): boolean {
  if (args.some((arg) => arg === "--help" || arg === "--version")) return true;
  const command = canvasCliCommandOf(args);
  return command === undefined || SESSIONLESS_COMMANDS.has(command);
}

const CanvasCliParameters = Type.Object(
  {
    args: Type.Array(Type.String(), {
      description:
        'Command line for scenemint-canvas as separate argv tokens, without the command name and without --session. Example: ["ls","/","--long"].',
      minItems: 1,
      maxItems: CANVAS_CLI_MAX_ARGS,
    }),
  },
  { additionalProperties: false },
);

export interface CanvasCliToolOptions {
  /** The chat workspace (a realpath): `connect` finds the chat's canvas session by it. */
  cwd: string;
  /** The chat's main canvas session id; injected into every command that needs one. */
  canvasSessionId: () => string;
}

export function createCanvasCliTool(
  options: CanvasCliToolOptions,
): ToolDefinition<typeof CanvasCliParameters> {
  return {
    name: CANVAS_CLI_TOOL_NAME,
    label: "SceneMint Canvas CLI",
    description:
      `Run the \`${CANVAS_CLI_COMMAND}\` command-line tool, which is the complete control surface for the user's SceneMint canvas this chat is attached to: list/read/search nodes, edit text and prompts, apply batched changes, arrange layout, discover models, run and cancel generation, undo/redo, and upload/download/inspect media. ` +
      `Pass the command line as separate argv tokens in \`args\`, without the command name — for example \`["status"]\` or \`["ls","/","--long"]\`. Arguments are passed straight to the program: there is no shell, so quotes, \`$(...)\`, backticks and pipes are literal text. ` +
      `Never pass \`--session\`: the host injects this chat's canvas session on every command that needs one, and an argv carrying \`--session\` anywhere is refused. The chat is already connected to its canvas; \`["connect","--origin",ORIGIN,"--name",NAME]\` only reports that connection. ` +
      `Read the \`${CANVAS_SKILL_NAME}\` Skill before the first call; \`["help"]\` prints the command map. The tool returns the CLI's stdout — one JSON value per command — and reports a non-zero exit code instead of failing, because the CLI answers refusals and canvas errors as \`{"ok":false,...}\`. Long text and structured batches go through workspace files with \`--file\` / \`--text-file\`, not inline.`,
    promptSnippet: `Drive the chat's SceneMint canvas through the ${CANVAS_CLI_COMMAND} CLI.`,
    promptGuidelines: [
      `Load the ${CANVAS_SKILL_NAME} Skill before using ${CANVAS_CLI_TOOL_NAME}; it owns the authorization and media rules.`,
      `Pass one command per ${CANVAS_CLI_TOOL_NAME} call as argv tokens, never with --session (the host injects this chat's session), and check both the exit code and \`ok\` in the returned JSON before using any field.`,
    ],
    parameters: CanvasCliParameters,
    // A canvas mutation must not race another one from the same turn.
    executionMode: "sequential",
    async execute(_toolCallId, params: Static<typeof CanvasCliParameters>, signal) {
      signal?.throwIfAborted();
      const args = params.args;
      for (const arg of args) {
        if (typeof arg !== "string")
          throw new Error(`${CANVAS_CLI_TOOL_NAME} args must be strings.`);
        if (arg.includes("\0")) {
          throw new Error(`${CANVAS_CLI_TOOL_NAME} args must not contain NUL bytes.`);
        }
        if (arg.length > CANVAS_CLI_MAX_ARG_LENGTH) {
          throw new Error(
            `${CANVAS_CLI_TOOL_NAME} arguments are limited to ${CANVAS_CLI_MAX_ARG_LENGTH} characters; put long text in a workspace file and pass --text-file.`,
          );
        }
      }
      let argv: string[];
      try {
        argv = canvasCliArgsNeedNoSession(args)
          ? [...args]
          : injectSession(args, options.canvasSessionId());
      } catch (error) {
        const failure = error as Error & { code?: unknown };
        throw new Error(
          failure.code === "SESSION_NOT_ALLOWED"
            ? `${CANVAS_CLI_TOOL_NAME} refused the arguments (SESSION_NOT_ALLOWED): ${failure.message}. Omit --session; this chat's canvas session is injected by the host.`
            : failure.message,
          { cause: error },
        );
      }
      // `connect` defaults to this chat's workspace, as lingying's parseConnectArgs does.
      if (
        canvasCliCommandOf(argv) === "connect" &&
        !argv.some((arg) => /^--workspace(=|$)/.test(arg))
      )
        argv.push("--workspace", options.cwd);
      const result = await runCli(argv);
      signal?.throwIfAborted();
      const text =
        result.exitCode === 0
          ? result.stdout
          : `${CANVAS_CLI_COMMAND} exited with code ${result.exitCode}.\n${result.stdout}`;
      return {
        content: [{ type: "text", text }],
        details: { command: CANVAS_CLI_COMMAND, args: [...args], exitCode: result.exitCode },
      };
    },
  };
}
