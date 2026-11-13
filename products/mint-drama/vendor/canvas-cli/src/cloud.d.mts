export interface CloudSessionRecord {
  version: 2;
  sessionId: string;
  role: "main" | "worker";
  parentSessionId?: string;
  name: string;
  workspace: string;
  canvasId: string;
  projectId: string;
  createdAt: string;
}

export interface CanvasEnvelope {
  requestId: string;
  method: string;
  params: Record<string, unknown>;
  turnId: string;
}

export interface CanvasBridge {
  /** Resolves to the page's reply object (`{ ok: true, ... }` or `{ ok: false, error }`). */
  request(record: CloudSessionRecord, envelope: CanvasEnvelope): Promise<unknown>;
}

export declare function installCanvasBridge(bridge: CanvasBridge): void;
export declare function registerMainSession(input: {
  sessionId: string;
  name: string;
  workspace: string;
  canvasId: string;
  projectId: string;
}): CloudSessionRecord;
export declare function sessionRecord(sessionId: string): CloudSessionRecord | undefined;
export declare function dropSession(sessionId: string): void;
export declare function runCli(
  argv: string[],
  options?: { stdin?: string },
): Promise<{ exitCode: number; stdout: string; stderr: string; result: unknown }>;
