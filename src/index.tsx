import type { PluginApi } from './plugin-types';
import CodeViewer from './CodeViewer';

const CODE_EXT = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.less',
  '.html', '.xml', '.py', '.go', '.rs', '.java', '.c', '.cpp',
  '.h', '.hpp', '.sh', '.bash', '.zsh', '.yaml', '.yml', '.toml',
  '.sql', '.rb', '.php', '.swift', '.kt', '.lua', '.r',
  '.dockerfile', '.makefile', '.gitignore', '.env', '.cjs', '.mjs',
]);

function ext(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.substring(i).toLowerCase() : '';
}

export function init(api: PluginApi): void {
  api.register({
    id: 'code-plugin',
    canHandle: (_tab, activeFile) => {
      const name = activeFile?.name ?? '';
      return CODE_EXT.has(ext(name)) && !activeFile?.isQuipu;
    },
    priority: 5,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: CodeViewer as any,
    onSave: async (tab) => (typeof tab.content === 'string' ? tab.content : null),
  });
}
