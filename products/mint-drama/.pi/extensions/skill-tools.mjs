import { execFile } from 'node:child_process';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Type } from '@earendil-works/pi-ai';

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_TREE_ENTRIES = 100_000;

// p = workspace path, t = text, i = segment ID, v = verdict, b = boolean flag.
// Optional/repeated positional arguments use ?, +, or * suffixes.
const op = (positionals = '', flags = '', writes = false) => ({
  positionals: positionals.split(' ').filter(Boolean),
  flags: Object.fromEntries(flags.split(' ').filter(Boolean).map(flag => flag.split('='))),
  writes,
});
const production = '--production=p --no-production=b';
const context = `--script=p --outline=p --cast=p --art=p --shots=p ${production}`;
const render = '--html=b --md=b --lang=t';
const plan = '--only=t --dry-run=b --out=p';
const migration = '--out=p --confirm=b';

// Every entrypoint and action is fixed here; no executable, script, or Node options
// come from the caller. These scripts and their imports must be trusted assets.
const REGISTRY = {
  'mint-setup': {
    init: op('', '--aspect=t --source=t --autopilot=b --asset-resolution=t --asset-aspect=t --image-model=t --video-model=t --video-resolution=t --creative-brief=t --style=p --lang=t --prompt-lang=t'),
    'migrate-v3': op('p', migration, true),
    'style-template': op(), style: op('p', '--for=t'),
    validate: op('p'), checkup: op('p'), show: op('p', '--md=b'),
    caps: op('', '--model=t'), duration: op('t', '--model=t'),
    resolve: op('', '--from=p --for=t'), find: op('', '--from=p'), models: op(),
  },
  'mint-outline': {
    chunk: op('p p', '--per-volume=t', true),
    validate: op('p', '--stage=t --production=p'),
    checkup: op('p', '--stage=t --production=p --json=b --downstream=b'),
    render: op('p', `${render} --stage=t --production=p`),
    assets: op('p', '--stage=t --production=p'),
    'migrate-v3': op('p', migration, true), slug: op('t'),
  },
  'mint-script': {
    seed: op('p', '--eps=t'),
    validate: op('p', `--outline=p --art=p --cast=p --stage=t --json=b ${production}`),
    checkup: op('p', `--outline=p --art=p --cast=p --stage=t --json=b ${production}`),
    render: op('p', `${render} --outline=p --art=p --cast=p --stage=t ${production}`),
    'migrate-v3': op('p', `${migration} --outline=p ${production}`, true), slug: op('t'),
  },
  'mint-characters': {
    seed: op('p'), chunk: op('p p', '', true), merge: op('p', '--apply=p'),
    assemble: op('p', '--source=t --lang=t --out=p --order=p', true),
    validate: op('p p?', `--lang=t ${production}`),
    checkup: op('p p?', `--lang=t ${production}`),
    images: op('p', `${plan} --images=t --style-ref=t ${production}`, true),
    render: op('p', `${render} --source=t --images=t ${production}`),
    slug: op('t'), 'ui-template': op('t?'), style: op('', `--from=p ${production}`),
  },
  'mint-art': {
    seed: op('p'), validate: op('p', `--cast=p ${production}`),
    checkup: op('p', `--cast=p ${production}`),
    images: op('p', `${plan} ${production}`, true),
    render: op('p', `${render} --cast=p ${production}`),
    style: op('', `--from=p ${production}`), slug: op('t'),
  },
  'mint-creation': {
    seed: op('p', `--eps=t ${context}`),
    'migrate-v3': op('p', `${migration} --script=p --outline=p`, true),
    validate: op('p', context), checkup: op('p', context),
    render: op('p', `${render} ${context}`),
    'prompts brief': op('p', `--ep=t --dir=p ${context}`),
    'prompts init': op('p', `--dir=p ${context}`, true),
    'prompts new': op('p i', `--scene=t --dir=p ${context}`, true),
    'prompts check': op('p', `--dir=p ${context}`),
    'prompts submit': op('p i*', `--dir=p ${context}`, true),
    'prompts verdict': op('p v i+', `--dir=p ${context}`, true),
    'prompts status': op('p', `--dir=p ${context}`),
    'prompts apply': op('p', `--dir=p ${context}`, true),
    export: op('p', `--out=p --dir=p ${context}`, true),
    videos: op('p', `${plan} ${context}`, true), slug: op('t'),
  },
  'mint-video-prompt': {
    guide: op('', '--model=t'), new: op('i', '--out=p --model=t --lang=t --scene=t', true),
    lint: op('p+'), submit: op('p+', '', 'worksheets'),
  },
  'mint-video-prompt-review': {
    show: op('p+', '--inputs=p'), verdict: op('v p+', '--inputs=p', 'worksheets'),
  },
};
const ROLES = {
  writer: { 'mint-video-prompt': ['guide', 'new', 'lint', 'submit'] },
  reviewer: { 'mint-video-prompt': ['lint'], 'mint-video-prompt-review': ['show', 'verdict'] },
};
const parameters = Type.Object({
  skill: Type.Union(Object.keys(REGISTRY).map(name => Type.Literal(name))),
  args: Type.Array(Type.String({ maxLength: 4096 }), { minItems: 1, maxItems: 64 }),
}, { additionalProperties: false });

function inside(root, target) {
  const rel = relative(root, target);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

function safePathText(value) {
  // Wildcards broaden Node permission grants; Windows device paths and ADS are
  // not ordinary files. Reject their aliases even when running on Unix.
  if (/[\0*?]/.test(value) || /^\\\\|^\/\//.test(value) || /:(?![\\/])/.test(value)) {
    throw new Error('Unsupported path syntax');
  }
  const withoutDrive = value.replace(/^[A-Za-z]:[\\/]/, '');
  if (withoutDrive.includes(':') || withoutDrive.split(/[\\/]/).some(part =>
    /[. ]$/.test(part) && part !== '.' && part !== '..' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error('Unsupported path alias');
  }
}

function workspacePath(root, value) {
  safePathText(value);
  // Interpret both separators as path syntax so Windows traversal is never text.
  const target = resolve(root, value.replaceAll('\\', sep));
  if (!inside(root, target)) throw new Error('Path must stay inside the workspace');
  return target;
}

async function checkAncestors(path) {
  for (let current = path; ; current = dirname(current)) {
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${current}`);
    if (dirname(current) === current) break;
  }
}

async function checkedRoot(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error('Roots must be absolute paths');
  safePathText(value);
  const path = resolve(value);
  await checkAncestors(path);
  if (!(await lstat(path)).isDirectory()) throw new Error('Root must be a directory');
  return realpath(path);
}

async function checkTree(root, signal) {
  // Node's permission model does not contain existing symlink targets. Reject
  // links (including junctions, dangling links, and hardlinks) before spawning.
  // The host must prevent concurrent filesystem/link replacement during a call.
  let entries = 0;
  const pending = [root];
  while (pending.length) {
    signal?.throwIfAborted();
    const path = pending.pop();
    if (++entries > MAX_TREE_ENTRIES) throw new Error('Workspace or skill tree exceeds the inspection limit');
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1)) {
      throw new Error(`Linked files and directories are not allowed: ${path}`);
    }
    if (stat.isDirectory()) {
      for (const name of await readdir(path)) pending.push(join(path, name));
    } else if (!stat.isFile()) {
      throw new Error(`Only regular files and directories are allowed: ${path}`);
    }
  }
}

function parseCall(params, role, root) {
  if (!params || Object.keys(params).some(key => !['skill', 'args'].includes(key))) throw new Error('Expected only skill and args');
  const { skill, args } = params;
  if (!Object.hasOwn(REGISTRY, skill)) throw new Error('Unknown skill');
  if (!Array.isArray(args) || !args.length || args.length > 64 || args.some(arg =>
    typeof arg !== 'string' || !arg || arg.length > 4096 || arg.includes('\0'))) throw new Error('Invalid arguments');
  const action = args[0] === 'prompts' ? `prompts ${args[1]}` : args[0];
  const help = ['--help', '-h'].includes(action);
  if (role !== 'main' && !(help ? Object.hasOwn(ROLES[role], skill) : ROLES[role][skill]?.includes(action))) {
    throw new Error(`Operation is not allowed for role ${role}`);
  }
  const spec = help ? op() : Object.hasOwn(REGISTRY[skill], action) ? REGISTRY[skill][action] : null;
  if (!spec) throw new Error('Unknown skill action');
  const offset = args[0] === 'prompts' ? 2 : 1;
  const positional = [];
  const flags = [];
  const seen = new Set();
  for (let i = offset; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      if (!Object.hasOwn(spec.flags, arg) || seen.has(arg)) throw new Error(`Unknown or duplicate flag: ${arg}`);
      seen.add(arg);
      flags.push(arg);
      if (spec.flags[arg] !== 'b') {
        const value = args[++i];
        if (!value || value.startsWith('-')) throw new Error(`Missing flag value: ${arg}`);
        if (arg === '--images' && !/^[\p{L}\p{N}_-]+$/u.test(value)) throw new Error('--images must be one directory name');
        flags.push(spec.flags[arg] === 'p' ? workspacePath(root, value) : value);
      }
    } else {
      // Normalize flag order for scripts whose first positional is rest[0].
      positional.push(arg);
    }
  }
  const normalized = [];
  let index = 0;
  for (const pattern of spec.positionals) {
    const kind = pattern[0], suffix = pattern[1];
    const remaining = positional.length - index;
    const count = ['*', '+'].includes(suffix) ? remaining : remaining > 0 ? 1 : 0;
    if (!count && suffix !== '?' && suffix !== '*') throw new Error('Missing positional argument');
    for (let i = 0; i < count; i++) {
      const value = positional[index++];
      if (kind === 'i' && !/^E\d{2,}-\d{2,}$/.test(value)) throw new Error('Invalid segment ID');
      if (kind === 'v' && !['approved', 'changes_requested', 'blocked'].includes(value)) throw new Error('Invalid verdict');
      normalized.push(kind === 'p' ? workspacePath(root, value) : value);
    }
  }
  if (index !== positional.length) throw new Error('Unexpected positional argument');
  if (seen.has('--html') && seen.has('--md')) throw new Error('Choose one render format');
  if (seen.has('--production') && seen.has('--no-production')) throw new Error('Conflicting production flags');
  return { skill, action, spec, positionals: normalized, argv: [...args.slice(0, offset), ...normalized, ...flags] };
}

function result(details) {
  return {
    content: [{ type: 'text', text: JSON.stringify(details) }],
    details,
    isError: details.exitCode !== 0 || details.aborted || details.timedOut || details.outputLimitExceeded,
  };
}

function run(script, argv, { cwd, workspaceRoot, skillRoot, writePaths, signal }) {
  return new Promise(resolveResult => {
    let timedOut = false, aborted = false, outputLimitExceeded = false;
    let size = 0, spawnError = null;
    const stdout = [], stderr = [];
    const nodeArgs = ['--permission', `--allow-fs-read=${workspaceRoot}`, `--allow-fs-read=${skillRoot}`,
      ...writePaths.map(path => `--allow-fs-write=${path}`), script, ...argv];
    // Inherit no credentials, NODE_OPTIONS, NODE_PATH, or preload configuration.
    const env = { LANG: 'C.UTF-8' };
    for (const key of ['SystemRoot', 'WINDIR']) if (process.env[key]) env[key] = process.env[key];
    const child = execFile(process.execPath, nodeArgs, { cwd, env, windowsHide: true, shell: false });
    const stop = () => child.kill('SIGKILL');
    const timer = setTimeout(() => { timedOut = true; stop(); }, TIMEOUT_MS);
    const abort = () => { aborted = true; stop(); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const capture = chunks => chunk => {
      const buffer = Buffer.from(chunk);
      const remaining = Math.max(0, MAX_OUTPUT_BYTES - size);
      chunks.push(buffer.subarray(0, remaining));
      size += buffer.length;
      if (size > MAX_OUTPUT_BYTES) { outputLimitExceeded = true; stop(); }
    };
    child.stdout.on('data', capture(stdout));
    child.stderr.on('data', capture(stderr));
    child.on('error', error => { spawnError = error.message; });
    child.on('close', (exitCode, terminationSignal) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolveResult(result({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'),
        exitCode, signal: terminationSignal, timedOut, aborted, outputLimitExceeded, ...(spawnError ? { error: spawnError } : {}) }));
    });
  });
}

/**
 * Trusted host inputs only. Requires Node 24+, immutable packaged skills, and a
 * host-owned workspace with no concurrent link replacement. This confines the
 * fixed trusted scripts' filesystem access; it is not an OS sandbox for hostile
 * JavaScript or a replacement for the host's network/process isolation.
 */
export function createSkillTools({ workspaceRoot, skillsRoot, role = 'main' }) {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('mint_skill requires Node 24 or newer');
  if (role !== 'main' && !Object.hasOwn(ROLES, role)) throw new Error(`Unknown role: ${role}`);
  return [{
    name: 'mint_skill', label: 'Mint skill scripts', parameters, executionMode: 'sequential',
    description: 'Run a fixed deterministic mint skill operation. Pass skill and argv tokens (action first), without node, script paths, shell syntax, or redirection. All file arguments are relative to the workspace root or absolute paths within it. Creation operations run beside their input document so embedded relative asset paths retain their meaning. Render/seed/init return stdout; save it with the host write tool when needed. Read exitCode and failure flags before claiming success. Runtime: 30 seconds; combined output: 1 MiB. Role: ' + role,
    async execute(_id, params, signal) {
      if (signal?.aborted) return result({ stdout: '', stderr: '', exitCode: null, signal: null, timedOut: false, aborted: true, outputLimitExceeded: false });
      const workspace = await checkedRoot(workspaceRoot);
      const skills = await checkedRoot(skillsRoot);
      if (inside(workspace, skills) || inside(skills, workspace)) throw new Error('Workspace and packaged skills must be disjoint');
      const call = parseCall(params, role, workspace);
      const skillRoot = join(skills, call.skill);
      await checkAncestors(skillRoot);
      await checkTree(skillRoot, signal);
      await checkTree(workspace, signal);
      const script = join(skillRoot, 'scripts', `${call.skill}.mjs`);
      if (!(await lstat(script)).isFile()) throw new Error('Skill entrypoint must be a regular file');
      let writePaths = call.spec.writes ? [workspace] : [];
      if (call.spec.writes === 'worksheets') {
        writePaths = call.positionals.filter(path => isAbsolute(path));
        for (const path of writePaths) {
          if (basename(path) !== 'prompt.md' || !(await lstat(path)).isFile()) throw new Error('Only existing prompt.md worksheets may be updated');
        }
      }
      const cwd = call.skill === 'mint-creation' && call.spec.positionals[0] === 'p'
        ? dirname(call.positionals[0]) : workspace;
      signal?.throwIfAborted();
      return run(script, call.argv, { cwd, workspaceRoot: workspace, skillRoot, writePaths, signal });
    },
  }];
}
