/**
 * A product's Pi launch configuration, read from its launcher script.
 *
 * The products ship POSIX launchers (`ly.sh`, `ns.sh`, `sd.sh`) whose last command is
 * `exec pi <flags> "$@"`. lingying-agent runs the launcher with a capture-only `pi` shim and parses the
 * captured argv (`builtin-agent-launcher.ts`, `launch-args.ts`). The cloud image runs no shell for this:
 * `readProductLaunch` extracts the `exec pi` command and the `mkdir -p "$PROJECT_DIR/..."` bootstrap
 * directories from the script text, then parses the command with the port of lingying's constrained
 * tokenizer and flag parser below (no shell expansion, no operators, resources only under `.pi/`).
 *
 * Mapped on top of lingying: the products vendored pi-goal under `.pi/vendor/node_modules/`; app-agent
 * installs it as a dependency, so an extension under `.pi/vendor/node_modules/<package>/...` resolves to
 * `<app-agent>/node_modules/<package>/...`. `npm:` sources and `--package` are not accepted: product
 * dependencies are installed in the image, never at session start.
 */
import fs from "node:fs";
import path from "node:path";

const MAX_COMMAND_LENGTH = 16 * 1024;
const MAX_TOKEN_COUNT = 128;
const MAX_RESOURCE_COUNT = 32;
const MAX_RESOURCE_SOURCE_LENGTH = 1024;
const MAX_RESOURCE_TREE_ENTRIES = 10_000;
const VENDOR_PREFIX = ".pi/vendor/node_modules/";

const PROTECTED_FLAGS = new Set([
  "--api-key",
  "--provider",
  "--model",
  "--models",
  "--continue",
  "--resume",
  "--session",
  "--session-id",
  "--session-dir",
  "--no-session",
  "--fork",
  "--mode",
  "--print",
  "--export",
  "--offline",
  "--append-system-prompt",
  "--thinking",
  "--name",
  "--help",
  "--version",
  "--list-models",
  "--verbose",
]);

export interface PiLaunchConfig {
  command: string;
  projectTrustOverride?: boolean;
  noContextFiles?: boolean;
  noExtensions?: boolean;
  /** Ordered `.pi/...` extension paths. */
  extensionSources: string[];
  noSkills?: boolean;
  skillPaths: string[];
  noPromptTemplates?: boolean;
  promptTemplatePaths: string[];
  noThemes?: boolean;
  themePaths: string[];
  /** Product file that fully replaces Pi's default system prompt. */
  systemPromptPath?: string;
  /** Strict allowlist across built-in, extension, and custom tools. */
  toolNames?: string[];
  /** Built-in or extension tool names disabled after resource registration. */
  excludeTools?: string[];
}

/** A launch config whose resources are absolute paths that exist. */
export interface ProductLaunch extends PiLaunchConfig {
  productRoot: string;
  /** Workspace-relative directories the launcher creates before starting Pi. */
  bootstrapDirectories: string[];
}

/**
 * Parse the constrained Pi command accepted by Lingying.
 *
 * This is deliberately not a shell parser and never executes the input. Only
 * project-resource flags that map directly to Pi's SDK resource loader are
 * accepted; the host continues to own model, authentication, and JSONL session
 * selection.
 */
export function parsePiLaunchCommand(command: string, resourceRoot: string): PiLaunchConfig {
  if (typeof command !== "string" || !command.trim()) {
    throw new Error("Pi launch command is required.");
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    throw new Error(`Pi launch command must not exceed ${MAX_COMMAND_LENGTH} characters.`);
  }
  const tokens = tokenizePiLaunchCommand(command);
  if (tokens.length === 0 || tokens[0] !== "pi") {
    throw new Error('Pi launch command must begin with the bare "pi" command.');
  }
  if (tokens.length > MAX_TOKEN_COUNT) {
    throw new Error(`Pi launch command must not contain more than ${MAX_TOKEN_COUNT} tokens.`);
  }

  const config: PiLaunchConfig = {
    command: command.trim(),
    extensionSources: [],
    skillPaths: [],
    promptTemplatePaths: [],
    themePaths: [],
  };

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const flag = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
    const inlineValue = token.includes("=") ? token.slice(token.indexOf("=") + 1) : undefined;

    if (PROTECTED_FLAGS.has(flag)) {
      throw new Error(`${flag} is managed by app-agent and cannot be set in Pi launch arguments.`);
    }
    if (token.startsWith("@")) {
      throw new Error("Prompt files are not supported in Pi launch arguments.");
    }

    switch (flag) {
      case "--approve":
      case "-a":
        assertNoInlineValue(flag, inlineValue);
        config.projectTrustOverride = true;
        break;
      case "--no-approve":
      case "-na":
        assertNoInlineValue(flag, inlineValue);
        config.projectTrustOverride = false;
        break;
      case "--no-context-files":
      case "-nc":
        assertNoInlineValue(flag, inlineValue);
        config.noContextFiles = true;
        break;
      case "--no-extensions":
      case "-ne":
        assertNoInlineValue(flag, inlineValue);
        config.noExtensions = true;
        break;
      case "--extension":
      case "-e": {
        const consumed = readFlagValue(tokens, index, flag, inlineValue);
        config.extensionSources.push(validateResourcePath(consumed.value, resourceRoot));
        index = consumed.index;
        break;
      }
      case "--no-skills":
      case "-ns":
        assertNoInlineValue(flag, inlineValue);
        config.noSkills = true;
        break;
      case "--skill": {
        const consumed = readFlagValue(tokens, index, flag, inlineValue);
        config.skillPaths.push(validateResourcePath(consumed.value, resourceRoot));
        index = consumed.index;
        break;
      }
      case "--no-prompt-templates":
      case "-np":
        assertNoInlineValue(flag, inlineValue);
        config.noPromptTemplates = true;
        break;
      case "--prompt-template": {
        const consumed = readFlagValue(tokens, index, flag, inlineValue);
        config.promptTemplatePaths.push(validateResourcePath(consumed.value, resourceRoot));
        index = consumed.index;
        break;
      }
      case "--no-themes":
        assertNoInlineValue(flag, inlineValue);
        config.noThemes = true;
        break;
      case "--theme": {
        const consumed = readFlagValue(tokens, index, flag, inlineValue);
        config.themePaths.push(validateResourcePath(consumed.value, resourceRoot));
        index = consumed.index;
        break;
      }
      case "--system-prompt": {
        const consumed = readFlagValue(tokens, index, flag, inlineValue);
        config.systemPromptPath = validateResourcePath(consumed.value, resourceRoot);
        index = consumed.index;
        break;
      }
      case "--tools":
      case "-t": {
        const consumed = readFlagValue(tokens, index, flag, inlineValue);
        config.toolNames = validateToolNames(consumed.value, "--tools", 64);
        index = consumed.index;
        break;
      }
      case "--exclude-tools":
      case "-xt": {
        const consumed = readFlagValue(tokens, index, flag, inlineValue);
        config.excludeTools = validateToolNames(consumed.value, "--exclude-tools", 32);
        index = consumed.index;
        break;
      }
      default:
        if (token.startsWith("-")) {
          throw new Error(`Unsupported Pi launch option: ${flag}`);
        }
        throw new Error("Pi launch arguments cannot contain prompts or extra commands.");
    }
  }

  const resourceCount =
    config.extensionSources.length +
    config.skillPaths.length +
    config.promptTemplatePaths.length +
    config.themePaths.length +
    Number(Boolean(config.systemPromptPath));
  if (resourceCount > MAX_RESOURCE_COUNT) {
    throw new Error(`Pi launch arguments support at most ${MAX_RESOURCE_COUNT} resources.`);
  }
  return config;
}

/**
 * Read `products/<id>/<launcher>`: the `exec pi` command (from `exec pi` to the end of its line
 * continuations) and the `mkdir -p "$PROJECT_DIR/..."` lines. The launchers' only expansions in that
 * command are `"$PRODUCT_DIR/` prefixes, the optional watch probe (`${WATCH_ARGS[@]+...}`, never
 * shipped) and the trailing `"$@"`; anything else is left in and refused by the tokenizer.
 */
export function readProductLaunch(
  productRoot: string,
  launcher: string,
  appRoot: string,
): ProductLaunch {
  const script = fs.readFileSync(path.join(productRoot, launcher), "utf8").replaceAll("\r\n", "\n");
  const lines = script.split("\n");
  const start = lines.findIndex((line) => line.startsWith("exec pi "));
  if (start === -1) throw new Error(`${launcher} has no "exec pi" command.`);
  const commandLines: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index]!;
    commandLines.push(line);
    if (!line.endsWith("\\")) break;
  }
  const command = commandLines
    .join("\n")
    .replace(/^exec /, "")
    .replaceAll('${WATCH_ARGS[@]+"${WATCH_ARGS[@]}"}', "")
    .replaceAll('"$@"', "")
    .replaceAll('"$PRODUCT_DIR/', '"');
  const config = parsePiLaunchCommand(command, productRoot);

  const bootstrapDirectories: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("mkdir -p ")) continue;
    const tokens = tokenizePiLaunchCommand(
      line.slice("mkdir -p ".length).replaceAll('"$PROJECT_DIR/', '"'),
    );
    for (const directory of tokens) {
      const portable = directory.replaceAll("\\", "/");
      if (!portable || path.posix.isAbsolute(portable) || portable.split("/").includes("..")) {
        throw new Error(`${launcher} creates a directory outside the project: ${directory}`);
      }
      bootstrapDirectories.push(portable);
    }
  }

  const resolve = (resource: string): string => {
    if (resource.startsWith(VENDOR_PREFIX)) {
      const installed = path.join(appRoot, "node_modules", resource.slice(VENDOR_PREFIX.length));
      if (!fs.statSync(installed).isFile()) throw new Error(`Not a file: ${installed}`);
      return fs.realpathSync(installed);
    }
    const resolved = resolveResourceIfPresent(resource, productRoot);
    if (!resolved) throw new Error(`${launcher} names a missing resource: ${resource}`);
    return resolved;
  };
  return {
    ...config,
    productRoot,
    bootstrapDirectories,
    extensionSources: config.extensionSources.map(resolve),
    skillPaths: config.skillPaths.map(resolve),
    promptTemplatePaths: config.promptTemplatePaths.map(resolve),
    themePaths: config.themePaths.map(resolve),
    ...(config.systemPromptPath ? { systemPromptPath: resolve(config.systemPromptPath) } : {}),
  };
}

function validateToolNames(
  value: string,
  flag: "--tools" | "--exclude-tools",
  limit: number,
): string[] {
  const tools = value
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
  if (tools.length === 0 || tools.length > limit) {
    throw new Error(`${flag} requires between 1 and ${limit} tool names.`);
  }
  const unique = new Set<string>();
  for (const tool of tools) {
    if (!/^[a-zA-Z][a-zA-Z0-9_.:-]*$/.test(tool)) {
      throw new Error(`Invalid tool name in ${flag}: ${tool}`);
    }
    if (unique.has(tool)) throw new Error(`Duplicate tool name in ${flag}: ${tool}`);
    unique.add(tool);
  }
  return tools;
}

export function tokenizePiLaunchCommand(command: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let tokenStarted = false;
  let quote: "'" | '"' | undefined;

  const pushToken = () => {
    if (!tokenStarted) return;
    tokens.push(token);
    token = "";
    tokenStarted = false;
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!;

    if (quote === "'") {
      if (character === "'") {
        quote = undefined;
      } else {
        token += character;
      }
      tokenStarted = true;
      continue;
    }

    if (quote === '"') {
      if (character === '"') {
        quote = undefined;
        tokenStarted = true;
        continue;
      }
      if (character === "$" || character === "`") {
        throw new Error("Shell expansion is not supported in Pi launch arguments.");
      }
      if (character === "\\") {
        const escaped = readEscapedCharacter(command, index);
        if (escaped) {
          index = escaped.index;
          if (escaped.value !== undefined) {
            token += escaped.value;
            tokenStarted = true;
          }
          continue;
        }
      }
      token += character;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(character)) {
      pushToken();
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (character === "$" || character === "`") {
      throw new Error("Shell expansion is not supported in Pi launch arguments.");
    }
    if (";|&<>".includes(character)) {
      throw new Error("Shell operators are not supported in Pi launch arguments.");
    }
    if (character === "\\") {
      const escaped = readEscapedCharacter(command, index);
      if (escaped) {
        index = escaped.index;
        if (escaped.value !== undefined) {
          token += escaped.value;
          tokenStarted = true;
        }
        continue;
      }
    }
    token += character;
    tokenStarted = true;
  }

  if (quote) throw new Error("Pi launch arguments contain an unterminated quote.");
  pushToken();
  return tokens;
}

function readEscapedCharacter(
  command: string,
  index: number,
): { index: number; value?: string } | undefined {
  const next = command[index + 1];
  if (next === undefined) {
    throw new Error("Pi launch arguments end with an incomplete escape.");
  }
  if (next === "\n") return { index: index + 1 };
  if (next === "\r" && command[index + 2] === "\n") return { index: index + 2 };
  if (/\s/.test(next) || next === "'" || next === '"' || next === "\\") {
    return { index: index + 1, value: next };
  }
  // Preserve Windows-style resource separators rather than interpreting them
  // as shell escapes. They are canonicalized to '/' during path validation.
  return { index, value: "\\" };
}

function readFlagValue(
  tokens: readonly string[],
  index: number,
  flag: string,
  inlineValue: string | undefined,
): { value: string; index: number } {
  if (inlineValue !== undefined) {
    if (!inlineValue) throw new Error(`${flag} requires a resource path.`);
    return { value: inlineValue, index };
  }
  const value = tokens[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a resource path.`);
  }
  return { value, index: index + 1 };
}

function assertNoInlineValue(flag: string, value: string | undefined): void {
  if (value !== undefined) throw new Error(`${flag} does not accept a value.`);
}

function validateResourcePath(resourcePath: string, workspacePath: string): string {
  if (
    !resourcePath ||
    resourcePath.length > MAX_RESOURCE_SOURCE_LENGTH ||
    resourcePath.includes("\0")
  ) {
    throw new Error("Pi resource path is empty or too long.");
  }
  const portable = resourcePath.replaceAll("\\", "/");
  if (
    portable.startsWith("/") ||
    portable.startsWith("~") ||
    /^[a-zA-Z]:\//.test(portable) ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(portable)
  ) {
    throw new Error("Pi resources must use relative paths inside the product .pi folder.");
  }
  const segments = portable.split("/");
  if (segments.includes("..")) {
    throw new Error("Pi resource paths cannot traverse outside the product.");
  }
  const canonical = path.posix.normalize(portable);
  if (canonical === ".pi" || !canonical.startsWith(".pi/")) {
    throw new Error("Pi resources must be located inside the product .pi folder.");
  }
  if (canonical.toLowerCase() === ".pi/npm" || canonical.toLowerCase().startsWith(".pi/npm/")) {
    throw new Error("Product .pi/npm resource paths are not supported.");
  }
  // The vendored packages are installed app-agent dependencies (see the file header).
  if (canonical.startsWith(VENDOR_PREFIX)) return canonical;

  // Inspect every existing ancestor for symlink escapes.
  resolveResourceIfPresent(canonical, workspacePath);
  return canonical;
}

function resolveResourceIfPresent(resourcePath: string, workspacePath: string): string | undefined {
  let workspaceRealPath: string;
  try {
    workspaceRealPath = fs.realpathSync(workspacePath);
  } catch {
    throw new Error("The product directory is unavailable.");
  }

  const piPath = path.join(workspaceRealPath, ".pi");
  let piRootPath: string;
  try {
    piRootPath = fs.realpathSync(piPath);
  } catch {
    throw new Error("The product .pi folder is unavailable.");
  }
  assertResourceInsidePiRoot(piRootPath, workspaceRealPath);

  const relativePath = resourcePath.slice(".pi/".length);
  const segments = relativePath.split("/").filter(Boolean);
  let candidatePath = piPath;
  let resourceRealPath = piRootPath;
  for (const segment of segments) {
    candidatePath = path.join(candidatePath, segment);
    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(candidatePath);
    } catch (error) {
      if (isMissingPathError(error)) return undefined;
      throw new Error(`Pi resource could not be inspected: ${resourcePath}`, { cause: error });
    }
    try {
      resourceRealPath = fs.realpathSync(candidatePath);
    } catch {
      if (stats.isSymbolicLink()) {
        throw new Error(`Pi resource contains an unavailable symlink: ${resourcePath}`);
      }
      throw new Error(`Pi resource could not be inspected: ${resourcePath}`);
    }
    assertResourceInsidePi(resourceRealPath, workspaceRealPath, piRootPath);
  }

  validateResourceTree(resourceRealPath, workspaceRealPath, piRootPath);
  return resourceRealPath;
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

function assertResourceInsidePiRoot(piRootPath: string, workspaceRealPath: string): void {
  const relativeToWorkspace = path.relative(workspaceRealPath, piRootPath);
  if (isOutsidePath(relativeToWorkspace) || relativeToWorkspace.length === 0) {
    throw new Error("The product .pi folder resolves outside the product.");
  }
}

function validateResourceTree(
  resourceRealPath: string,
  workspaceRealPath: string,
  piRootPath: string,
): void {
  let rootStats: fs.Stats;
  try {
    rootStats = fs.statSync(resourceRealPath);
  } catch {
    throw new Error("Pi resource could not be inspected.");
  }
  if (!rootStats.isDirectory()) return;

  const pending = [resourceRealPath];
  const visitedDirectories = new Set<string>();
  let entryCount = 0;
  while (pending.length > 0) {
    const directory = pending.pop()!;
    const realDirectory = fs.realpathSync(directory);
    assertResourceInsidePi(realDirectory, workspaceRealPath, piRootPath);
    if (visitedDirectories.has(realDirectory)) continue;
    visitedDirectories.add(realDirectory);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(realDirectory, { withFileTypes: true });
    } catch {
      throw new Error("Pi resource directory could not be inspected.");
    }
    for (const entry of entries) {
      entryCount += 1;
      if (entryCount > MAX_RESOURCE_TREE_ENTRIES) {
        throw new Error(
          `Pi resource directories support at most ${MAX_RESOURCE_TREE_ENTRIES} entries.`,
        );
      }
      const entryPath = path.join(realDirectory, entry.name);
      let entryRealPath: string;
      try {
        entryRealPath = fs.realpathSync(entryPath);
      } catch {
        throw new Error(`Pi resource contains an unavailable entry: ${entry.name}`);
      }
      assertResourceInsidePi(entryRealPath, workspaceRealPath, piRootPath);
      if (fs.statSync(entryRealPath).isDirectory()) pending.push(entryRealPath);
    }
  }
}

function assertResourceInsidePi(
  resourceRealPath: string,
  workspaceRealPath: string,
  piRootPath: string,
): void {
  const relativeToWorkspace = path.relative(workspaceRealPath, resourceRealPath);
  const relativeToPi = path.relative(piRootPath, resourceRealPath);
  if (
    isOutsidePath(relativeToWorkspace) ||
    isOutsidePath(relativeToPi) ||
    relativeToPi.length === 0
  ) {
    throw new Error("Pi resource resolves outside the product .pi folder.");
  }
}

function isOutsidePath(relativePath: string): boolean {
  return (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  );
}
