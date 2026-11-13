import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSkillTools } from './skill-tools.mjs';
import { createWorkflowTools } from './workflow-tools.mjs';

const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const skillsRoot = join(productRoot, '.pi/skills');

export default function mintRuntime(pi) {
  let tools;
  let workspace;
  const toolsFor = (context) => {
    if (!context?.cwd) throw new Error('The host must supply the chat workspace.');
    if (!tools) {
      workspace = resolve(context.cwd);
      tools = new Map([
        ...createSkillTools({ workspaceRoot: workspace, skillsRoot, role: 'main' }),
        ...createWorkflowTools({ productRoot, workspaceRoot: workspace }),
      ].map(tool => [tool.name, tool]));
    }
    if (workspace !== resolve(context.cwd)) throw new Error('A product extension instance cannot change chat workspaces.');
    return tools;
  };
  // Registration needs only schemas. Executions always bind to the trusted ExtensionContext cwd.
  const definitions = [
    ...createSkillTools({ workspaceRoot: process.cwd(), skillsRoot, role: 'main' }),
    ...createWorkflowTools({ productRoot, workspaceRoot: process.cwd() }),
  ];
  for (const definition of definitions) {
    pi.registerTool({ ...definition, execute(id, params, signal, onUpdate, context) {
      return toolsFor(context).get(definition.name).execute(id, params, signal, onUpdate, context);
    } });
  }
}
