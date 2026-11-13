// mint-agent cloud client. Same exports as the desktop client.mjs, but every request goes to the
// in-process bridge (cloud-state.mjs) instead of a loopback daemon: `call` checks the protocol policy
// and hands the envelope to the host, which emits it as a `canvas_request` event and resolves it with
// the page's `tool_results` answer. The daemon routes the products use (`/v1/status`, `/v1/delegate`,
// `/v1/revoke`, `/v1/stop`) are answered from the session registry.
import { randomUUID } from "node:crypto";
import { CliError, errorResult, validateOrigin } from "./common.mjs";
import { readSession, workspaceRoot } from "./session.mjs";
import { enforceRequestPolicy, methodCallTimeoutMs, PROTOCOL_VERSION } from "./policy.mjs";
import {
  canvasBridge,
  dropSession,
  mainSessionForWorkspace,
  registerWorkerSession,
  sessionRecord,
  workerCount,
} from "./cloud-state.mjs";

/** Default `--wait-ms`: how long a mutation waits for an absent page before `page_away`. */
export const DEFAULT_WAIT_MS = 30000;
/** A `reconnecting` daemon whose page has been silent this long is not worth reusing. */
export const STALE_PAGE_MS = 60000;
const PACKAGE_VERSION = "0.18.7";
const MAX_DELEGATES = 64;

export function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

/** The cloud page is reached through the chat, so a registered session is always `connected`. */
function status(record) {
  return {
    ok: true,
    protocolVersion: PROTOCOL_VERSION,
    packageVersion: PACKAGE_VERSION,
    sessionId: record.sessionId,
    role: record.role,
    ...(record.parentSessionId ? { parentSessionId: record.parentSessionId } : {}),
    name: record.name,
    state: "connected",
    connected: true,
    pageAway: false,
    queuedCommands: 0,
    pageLastSeenAt: null,
    pageEpoch: 1,
    hostAttested: true,
    agentName: record.name,
    canvasId: record.canvasId,
    projectId: record.projectId,
  };
}

export async function probeSession(sessionId) {
  let record;
  try {
    record = await readSession(sessionId);
  } catch (error) {
    return { alive: false, reason: error?.code || "session_not_found" };
  }
  if (record.role !== "main") return { alive: false, reason: "not_main", record };
  return { alive: true, status: status(record), record };
}

/**
 * The cloud host connects the chat's canvas before the turn starts, so `connect` only finds that
 * session again: by `--session` when given, otherwise by workspace.
 */
export async function connect(options) {
  validateOrigin(options.origin);
  if (typeof options.name !== "string" || !options.name.trim() || options.name.length > 120)
    throw new CliError("invalid_argument", "--name must contain 1–120 characters");
  if (!options.workspace) throw new CliError("invalid_workspace", "--workspace is required");
  const bySession = options.session === undefined ? undefined : sessionRecord(options.session);
  const record =
    bySession?.role === "main"
      ? bySession
      : mainSessionForWorkspace(await workspaceRoot(options.workspace));
  if (!record)
    throw new CliError(
      "not_connected",
      "This chat has no canvas connection; open the chat from a canvas and send the message again",
    );
  return { ...status(record), reused: true };
}

/** Kept for callers that size their own timeouts from it; the cloud bridge has no socket deadline. */
export function callDeadlineMs(session, input) {
  const away =
    input?.wait === true
      ? session.resumeMs || 600000
      : Math.max(input?.waitMs ?? DEFAULT_WAIT_MS, 5000);
  return methodCallTimeoutMs(input?.method, session.callTimeoutMs || 120000) + away + 5000;
}

function keys(input, allowed) {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    throw new CliError("invalid_request", "Request body must be a JSON object");
  for (const key of Object.keys(input))
    if (!allowed.includes(key)) throw new CliError("invalid_request", `Unexpected field: ${key}`);
}

async function route(session, path, input) {
  const record = await readSession(session.sessionId);
  if (path === "/v1/status") return status(record);
  if (path === "/v1/call") {
    keys(input, ["requestId", "method", "params", "turnId", "wait", "waitMs"]);
    return call(record, input.method, input.params, {
      requestId: input.requestId,
      turnId: input.turnId,
    });
  }
  if (path === "/v1/stop") {
    keys(input, []);
    if (record.role !== "worker")
      throw new CliError(
        "cloud_managed",
        "The chat owns this canvas connection; it cannot be stopped from the agent",
      );
    dropSession(record.sessionId);
    return { ok: true, stopped: true, sessionId: record.sessionId };
  }
  if (path === "/v1/delegate" || path === "/v1/revoke") {
    if (record.role !== "main")
      throw new CliError(
        "worker_forbidden",
        "Only the parent session may delegate or revoke workers",
      );
    if (path === "/v1/revoke") {
      keys(input, ["sessionId"]);
      const child = sessionRecord(input.sessionId);
      if (child?.parentSessionId !== record.sessionId)
        throw new CliError("delegate_not_found", "Unknown delegated session");
      dropSession(child.sessionId);
      return { ok: true, revoked: true, sessionId: child.sessionId };
    }
    keys(input, ["name", "workspace"]);
    if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 120)
      throw new CliError("invalid_argument", "Delegated name must contain 1–120 characters");
    if (typeof input.workspace !== "string" || !input.workspace)
      throw new CliError("invalid_workspace", "An existing worker workspace is required");
    if (workerCount(record.sessionId) >= MAX_DELEGATES)
      throw new CliError(
        "session_limit",
        "Parent reached 64 delegated sessions; create a new parent session",
      );
    const child = registerWorkerSession({
      version: 2,
      sessionId: randomUUID(),
      role: "worker",
      parentSessionId: record.sessionId,
      name: input.name.trim(),
      workspace: await workspaceRoot(input.workspace),
      canvasId: record.canvasId,
      projectId: record.projectId,
      createdAt: new Date().toISOString(),
    });
    return { ...status(child), parentSessionId: record.sessionId };
  }
  throw new CliError("not_found", `Unknown session route ${path}`);
}

export async function sessionRequest(session, path, input) {
  try {
    return await route(session, path, input);
  } catch (error) {
    if (error instanceof CliError || typeof error?.code === "string") return errorResult(error);
    throw error;
  }
}

export async function call(
  session,
  method,
  params,
  { requestId = randomUUID(), turnId = requestId } = {},
) {
  // 策略拒绝在这里就回成 {ok:false,error}，和守护进程的拒绝同一个形状（B-4：以前是往上抛，
  // 调用方一律当「连不上」）。
  try {
    enforceRequestPolicy(session.role, method, params);
  } catch (error) {
    return errorResult(error);
  }
  try {
    return await canvasBridge().request(session, { requestId, method, params, turnId });
  } catch (error) {
    if (error instanceof CliError || typeof error?.code === "string") return errorResult(error);
    throw error;
  }
}

export function requireSuccess(result) {
  if (result?.ok === false)
    throw new CliError(
      result.error?.code || "request_failed",
      result.error?.message || "Canvas command failed",
      Object.fromEntries(
        Object.entries(result.error || {}).filter(([key]) => !["code", "message"].includes(key)),
      ),
    );
  return result;
}
