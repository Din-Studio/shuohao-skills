/**
 * Confine Pi's file tools to the session's Workspace.
 *
 * mint-agent: ported from lingying-agent `src/lib/pi/workspace-file-guard.ts` unchanged. In the cloud the
 * Workspace is the chat's directory under PI_DATA_DIR and the product roots are `products/<id>`.
 *
 * The built-in products run with `read/ls/find/grep/write/edit` and no path
 * restriction of their own, so a user could ask the model to read the product's
 * own `.pi/*.md` (its system prompt and personas) under
 * `~/.lingying/products/<key>/agents/<product>/`, or anything else on disk.
 * This is an in-process Pi extension (`extensionFactories`) that hooks
 * `tool_call` and blocks those six tools whenever the path they were given
 * resolves outside the Workspace root, or anywhere under the expanded product
 * tree. It is a tool-layer gate only: the products' `.pi/lib` runtime code runs
 * at process level and keeps reading its own files.
 *
 * One read-only opening: a product's Agent Skills (`.pi/skills/<name>/`) are
 * written for the model and tell it to `read` their `references/*.md`, so the
 * four read tools may look inside any `.pi/skills/` tree under a listed product
 * root. Everything else there — `SYSTEM.md`, `*.persona.md`, `agents/`,
 * `extensions/`, `lib/`, `vendor/` — stays refused, and `write`/`edit` never
 * touch the product tree at all.
 *
 * read, ls, find and grep share that one rule: wherever read may open a file,
 * ls / find / grep may list and search, and nowhere else. A search rooted
 * above a skills tree (`.pi` itself, or the product directory) would also walk
 * the prompt set, so it is refused for all four alike; the refusal names the
 * skills directory below it instead of only saying "Workspace" (S11, A233).
 *
 * The decision is made on the file the tool will actually open, not on the
 * string it was given. Pi's file tools rewrite `path` first (pi-coding-agent
 * `core/tools/path-utils.js`): one leading `@` is dropped, Unicode spaces
 * become plain ones, `~` is the home directory, a `file://` URL is decoded,
 * Windows also takes Git Bash / WSL drive paths, and `read` retries a missing
 * name under macOS screenshot spellings. Judged literally, `@../other` or
 * `@<abs>/.pi/SYSTEM.md` looked like names inside the Workspace and went
 * through; `resolvePiToolTarget` repeats pi's resolution so they are judged
 * where they land.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";

const WORKSPACE_FILE_GUARD_EXTENSION_NAME = "lingying-workspace-file-guard";
/** The one refusal of all six tools; it states the whole readable range. */
export const WORKSPACE_FILE_GUARD_REASON =
  "只能访问当前工作区里的文件；工作区外只有内置技能目录（路径中 .pi/skills/ 这一层及以下）可以用 read、grep、find、ls 只读查看";
/** Appended for read/ls/find/grep when the refused directory holds a readable skills tree. */
const SKILLS_BELOW_HINT = "。这一层不能查；要查技能文件，把 path 换成 ";

/** Pi's own file tools; their `path` input is the one that is checked. */
const GUARDED_FILE_TOOLS = new Set(["read", "ls", "find", "grep", "write", "edit"]);
/** The subset that only looks; these alone may enter a product's skills tree. */
const READ_ONLY_FILE_TOOLS = new Set(["read", "ls", "find", "grep"]);
/** `<product root>/…/.pi/skills/…` — the path segments that mark a skills tree. */
const SKILLS_TREE_SEGMENTS = [".pi", "skills"] as const;

export interface WorkspaceFileGuardOptions {
  /** The session's Workspace root — the only tree the tools may touch. */
  workspaceRoot: string;
  /** Trees that are refused even if the Workspace somehow contained them. */
  forbiddenRoots?: readonly string[];
  /**
   * Product roots (the same trees as `forbiddenRoots`, typically) whose
   * `.pi/skills/` subtrees the read-only tools may enter. Nothing else under
   * them opens up, and `write`/`edit` are never let in.
   */
  readableSkillRoots?: readonly string[];
}

interface ToolCallLike {
  toolName: string;
  input: Record<string, unknown>;
}

/**
 * Canonical form of a path for containment checks: the deepest existing
 * ancestor is realpath'd so a symlink planted inside the Workspace cannot
 * point out of it, and the missing tail (a file about to be written) rides
 * along unchanged.
 */
function canonicalizeForContainment(target: string): string {
  const resolved = path.resolve(target);
  const missing: string[] = [];
  let current = resolved;
  for (;;) {
    try {
      const real = fs.realpathSync(current);
      return missing.length ? path.join(real, ...missing.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return resolved;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

function isInside(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** The `path` argument of a guarded tool call, or undefined when it has none (ls/find/grep default to cwd). */
function guardedToolPath(call: ToolCallLike): string | undefined {
  const value = call.input?.path;
  return typeof value === "string" ? value : undefined;
}

/* ── Where a pi file tool lands ─────────────────────────────────────────────
 * A copy of pi-coding-agent 1.3.0 `utils/paths.js` (normalizePath,
 * normalizeWindowsShellPath, resolvePath) and `core/tools/path-utils.js`
 * (resolveToCwd, resolveReadPath). The package exports neither, and the guard
 * must not judge a different file than the tool opens, so
 * tests/workspace-file-guard-pi-parity.test.mts compares this copy with pi's
 * own functions over every spelling; a pi upgrade that changes them fails it.
 */

/** The Unicode spaces pi turns into plain spaces in a tool's `path`. */
const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const NARROW_NO_BREAK_SPACE = "\u202F";

/** Windows only: Git Bash / MSYS / Cygwin / WSL drive paths (`/c/Users/…`, `/mnt/c/…`) → `C:\…`. */
function normalizeWindowsShellPath(filePath: string): string {
  if (!filePath.startsWith("/") || filePath.startsWith("//") || filePath.includes("\\")) {
    return filePath;
  }
  const match = filePath.match(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i);
  if (!match) return filePath;
  const suffix = match[2]?.replaceAll("/", "\\");
  return `${match[1]!.toUpperCase()}:\\${suffix ?? ""}`;
}

/**
 * pi's `normalizePath`. A tool's `path` (`toolInput`) also gets Unicode spaces
 * flattened and one leading `@` dropped; the cwd it is resolved against does
 * not. Both get `~` → home and `file://` decoding.
 */
function normalizePiPath(input: string, toolInput: boolean): string {
  let normalized = input;
  if (toolInput) {
    normalized = normalized.replace(UNICODE_SPACES, " ");
    if (normalized.startsWith("@")) normalized = normalized.slice(1);
  }
  if (process.platform === "win32") normalized = normalizeWindowsShellPath(normalized);
  const home = os.homedir();
  if (normalized === "~") return home;
  if (
    normalized.startsWith("~/") ||
    (process.platform === "win32" && normalized.startsWith("~\\"))
  ) {
    return path.join(home, normalized.slice(2));
  }
  if (normalized.startsWith("file://")) return fileURLToPath(normalized);
  return normalized;
}

function pathExists(target: string): boolean {
  try {
    fs.accessSync(target, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * pi's `resolveReadPath`: when the file is missing, `read` opens the first
 * existing macOS screenshot spelling of the whole path instead (narrow space
 * before AM/PM, NFD, curly apostrophe, NFD + curly).
 */
function piReadFallback(resolved: string): string {
  if (pathExists(resolved)) return resolved;
  const amPm = resolved.replace(/ (AM|PM)\./gi, `${NARROW_NO_BREAK_SPACE}$1.`);
  if (amPm !== resolved && pathExists(amPm)) return amPm;
  const nfd = resolved.normalize("NFD");
  if (nfd !== resolved && pathExists(nfd)) return nfd;
  const curly = resolved.replace(/'/g, "\u2019");
  if (curly !== resolved && pathExists(curly)) return curly;
  const nfdCurly = nfd.replace(/'/g, "\u2019");
  if (nfdCurly !== resolved && pathExists(nfdCurly)) return nfdCurly;
  return resolved;
}

/**
 * The absolute path pi's `toolName` tool opens for the `path` input `input`
 * from `cwd` (ls / find / grep without a path: the cwd). Throws where pi
 * throws (a `file://` URL with a host, or with an encoded `/`).
 */
export function resolvePiToolTarget(
  toolName: string,
  input: string | undefined,
  cwd: string,
): string {
  // pi: `searchDir || "."` for ls/find/grep; read/write/edit resolve '' to cwd too.
  const normalized = normalizePiPath(input || ".", true);
  const resolved = path.isAbsolute(normalized)
    ? path.resolve(normalized)
    : path.resolve(normalizePiPath(cwd, false), normalized);
  return toolName === "read" ? piReadFallback(resolved) : resolved;
}

/** The canonical Workspace root and the canonical target of a tool's `path`. */
function resolveCandidate(
  candidate: string,
  options: WorkspaceFileGuardOptions,
): { workspaceRoot: string; target: string } {
  const workspaceRoot = canonicalizeForContainment(options.workspaceRoot);
  const expanded = candidate.startsWith("~") ? path.join("/", candidate.slice(1)) : candidate;
  const target = canonicalizeForContainment(path.resolve(workspaceRoot, expanded));
  return { workspaceRoot, target };
}

/**
 * True when `candidate` (absolute or relative to `workspaceRoot`) stays inside
 * the Workspace and outside every forbidden tree.
 */
export function isWorkspaceToolPathAllowed(
  candidate: string,
  options: WorkspaceFileGuardOptions,
): boolean {
  const { workspaceRoot, target } = resolveCandidate(candidate, options);
  if (!isInside(target, workspaceRoot)) return false;
  for (const forbidden of options.forbiddenRoots ?? []) {
    if (isInside(target, canonicalizeForContainment(forbidden))) return false;
  }
  return true;
}

/**
 * True when `candidate` resolves (realpath, `..` folded) to a file or directory
 * inside a `.pi/skills/` tree under one of `readableSkillRoots`. The check runs
 * on the canonical path, so a `..` or a symlink planted in a skill that lands
 * on `SYSTEM.md` or a persona is judged by where it lands, not where it starts.
 */
export function isReadableSkillPath(
  candidate: string,
  options: WorkspaceFileGuardOptions,
): boolean {
  const { target } = resolveCandidate(candidate, options);
  for (const root of options.readableSkillRoots ?? []) {
    const canonicalRoot = canonicalizeForContainment(root);
    if (!isInside(target, canonicalRoot)) continue;
    const segments = path.relative(canonicalRoot, target).split(path.sep);
    for (let index = 0; index + SKILLS_TREE_SEGMENTS.length <= segments.length; index += 1) {
      if (SKILLS_TREE_SEGMENTS.every((segment, offset) => segments[index + offset] === segment)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * The readable skills tree directly below a refused directory — `skills/` of
 * a product's `.pi`, or `.pi/skills/` of the product directory — so the
 * refusal can say where to search instead. Only a tree read/ls/find/grep may
 * enter is ever named; anything else gets the plain refusal.
 */
function readableSkillsTreeBelow(
  target: string,
  options: WorkspaceFileGuardOptions,
): string | undefined {
  const directory = canonicalizeForContainment(target);
  const [piDir, skillsDir] = SKILLS_TREE_SEGMENTS;
  const candidate =
    path.basename(directory) === piDir
      ? path.join(directory, skillsDir)
      : path.join(directory, piDir, skillsDir);
  try {
    if (!fs.statSync(candidate).isDirectory()) return undefined;
  } catch {
    return undefined;
  }
  return isReadableSkillPath(candidate, options)
    ? canonicalizeForContainment(candidate)
    : undefined;
}

/**
 * The `tool_call` decision: block with the user-facing reason, or let it
 * through. Judged on the file pi's tool will open (`resolvePiToolTarget`).
 */
export function checkWorkspaceToolCall(
  call: ToolCallLike,
  options: WorkspaceFileGuardOptions,
): { block: true; reason: string } | undefined {
  if (!GUARDED_FILE_TOOLS.has(call.toolName)) return undefined;
  let target: string;
  try {
    target = resolvePiToolTarget(call.toolName, guardedToolPath(call), options.workspaceRoot);
  } catch {
    // pi cannot resolve it either, so the tool would only fail; nothing to let through.
    return { block: true, reason: WORKSPACE_FILE_GUARD_REASON };
  }
  if (isWorkspaceToolPathAllowed(target, options)) return undefined;
  if (!READ_ONLY_FILE_TOOLS.has(call.toolName)) {
    return { block: true, reason: WORKSPACE_FILE_GUARD_REASON };
  }
  // A skill's references live in the product tree; only looking is allowed there.
  if (isReadableSkillPath(target, options)) return undefined;
  const skillsBelow = readableSkillsTreeBelow(target, options);
  return {
    block: true,
    reason: skillsBelow
      ? `${WORKSPACE_FILE_GUARD_REASON}${SKILLS_BELOW_HINT}${skillsBelow}`
      : WORKSPACE_FILE_GUARD_REASON,
  };
}

export function createWorkspaceFileGuardExtension(
  options: WorkspaceFileGuardOptions,
): InlineExtension {
  return {
    name: WORKSPACE_FILE_GUARD_EXTENSION_NAME,
    hidden: true,
    factory: (pi: ExtensionAPI) => {
      pi.on("tool_call", (event, ctx) =>
        checkWorkspaceToolCall(event, {
          // The session's cwd is the Workspace; pi reports it on every event
          // and it is what the tools resolve relative paths against.
          workspaceRoot: ctx.cwd || options.workspaceRoot,
          forbiddenRoots: options.forbiddenRoots,
          readableSkillRoots: options.readableSkillRoots,
        }),
      );
    },
  };
}
