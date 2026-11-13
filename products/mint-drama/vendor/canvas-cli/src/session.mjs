import { promises as fs, constants } from "node:fs";
import path from "node:path";
import { CliError, UUID } from "./common.mjs";
import { sessionRecord } from "./cloud-state.mjs";

// mint-agent: sessions are in-process records registered by the cloud host (cloud-state.mjs), not
// 0600 credential files written by a loopback daemon. The workspace file boundary below is unchanged.
export async function readSession(id) {
  if (!UUID.test(id || ""))
    throw new CliError("invalid_session", "--session must be the UUID returned by connect");
  const record = sessionRecord(id);
  if (!record)
    throw new CliError(
      "session_not_found",
      "Session does not exist or cannot be read; run connect for this task",
    );
  return record;
}

function inside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}
export async function workspaceRoot(input) {
  const root = await fs.realpath(path.resolve(input));
  if (!(await fs.stat(root)).isDirectory())
    throw new CliError("invalid_workspace", "Workspace must be a directory");
  return root;
}
/** Resolve every component without accepting symlinks, including parent directories. */
export async function workspacePath(root, input, { output = false } = {}) {
  if (typeof input !== "string" || !input || input.includes("\0"))
    throw new CliError("invalid_path", "A workspace file path is required");
  const candidate = path.resolve(root, input);
  // B9-FX-26: say which absolute path was tried and where the workspace is, so the caller can
  // move the file (or fix the relative path) instead of guessing from the message.
  const where = { path: candidate, workspace: root };
  if (input.split(/[\\/]/).includes(".."))
    throw new CliError("workspace_boundary", "Parent traversal is not allowed", where);
  if (!inside(root, candidate) || candidate === root)
    throw new CliError(
      "workspace_boundary",
      "Path must name a file inside the session workspace",
      where,
    );
  const rel = path.relative(root, candidate).split(path.sep);
  let current = root;
  // Detect a workspace replaced by a symlink since connect.
  if ((await fs.lstat(root)).isSymbolicLink() || (await fs.realpath(root)) !== root)
    throw new CliError("workspace_boundary", "Workspace location changed");
  for (let i = 0; i < rel.length; i++) {
    current = path.join(current, rel[i]);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (output && i === rel.length - 1 && error.code === "ENOENT") return candidate;
      throw new CliError(
        "file_not_found",
        "File or parent directory does not exist inside the workspace",
        where,
      );
    }
    if (stat.isSymbolicLink())
      throw new CliError("workspace_boundary", "Symlinks are not allowed inside workspace paths");
    if (i < rel.length - 1 && !stat.isDirectory())
      throw new CliError("invalid_path", "Parent path must be a directory");
    if (i === rel.length - 1 && (!stat.isFile() || stat.nlink !== 1))
      throw new CliError("workspace_boundary", "Expected an independent regular file");
  }
  return candidate;
}
export async function readWorkspaceFile(root, input, limit) {
  const file = await workspacePath(root, input);
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1)
      throw new CliError("workspace_boundary", "Expected an independent regular file");
    if (stat.size > limit) throw new CliError("too_large", `File exceeds ${limit} bytes`);
    const bytes = await handle.readFile();
    if (bytes.length > limit) throw new CliError("too_large", `File exceeds ${limit} bytes`);
    return { file, bytes };
  } finally {
    await handle.close();
  }
}
