// mint-agent cloud entry: the host installs the bridge and registers sessions; products and the host
// tool run the CLI in-process through `runCli`.
export {
  installCanvasBridge,
  registerMainSession,
  sessionRecord,
  dropSession,
} from "./cloud-state.mjs";
export { run as runCli } from "./cli.mjs";
