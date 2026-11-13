// mint-agent cloud transport state.
//
// The desktop package talks to a loopback daemon that the browser page polls. In mint-agent the agent
// runs in AgentCore, so every canvas call becomes a `canvas_request` event on the chat's invocation
// stream and the page's answer comes back as a `tool_results` invocation. The host (app-agent
// src/canvas-bridge.ts) installs the bridge and registers one main session per chat here.
//
// The state lives on globalThis: Pi loads product extensions through its own module loader, so the
// products and the host can hold two instances of this package; both must see one registry.
import { AsyncLocalStorage } from "node:async_hooks";
import { CliError } from "./common.mjs";

const STATE = Symbol.for("mint.app-agent.canvas-cloud.v1");

function state() {
  globalThis[STATE] ??= {
    bridge: undefined,
    sessions: new Map(),
    stdin: new AsyncLocalStorage(),
  };
  return globalThis[STATE];
}

/** The host's bridge: `request(record, { requestId, method, params, turnId })` resolves to the page reply. */
export function installCanvasBridge(bridge) {
  if (typeof bridge?.request !== "function")
    throw new TypeError("installCanvasBridge expects { request(record, envelope) }");
  state().bridge = bridge;
}

export function canvasBridge() {
  const bridge = state().bridge;
  if (!bridge) throw new CliError("not_connected", "The cloud canvas bridge is not installed");
  return bridge;
}

/** Main session of one chat: its id is the chat session id, its workspace the chat's workspace. */
export function registerMainSession({ sessionId, name, workspace, canvasId, projectId }) {
  const previous = state().sessions.get(sessionId);
  const record = {
    version: 2,
    sessionId,
    role: "main",
    name,
    workspace,
    canvasId,
    projectId,
    createdAt: previous?.createdAt ?? new Date().toISOString(),
  };
  state().sessions.set(sessionId, record);
  return record;
}

export function registerWorkerSession(record) {
  state().sessions.set(record.sessionId, record);
  return record;
}

export function sessionRecord(sessionId) {
  return state().sessions.get(sessionId);
}

export function dropSession(sessionId) {
  state().sessions.delete(sessionId);
}

export function workerCount(parentSessionId) {
  let count = 0;
  for (const record of state().sessions.values())
    if (record.parentSessionId === parentSessionId) count += 1;
  return count;
}

/** The main session whose workspace is `workspace` (a realpath), if any. */
export function mainSessionForWorkspace(workspace) {
  for (const record of state().sessions.values())
    if (record.role === "main" && record.workspace === workspace) return record;
  return undefined;
}

/** Text a `--file -` argument reads; set per in-process CLI run. */
export function cliStdin() {
  return state().stdin;
}
