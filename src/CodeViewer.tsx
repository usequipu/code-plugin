import React, { useState, useCallback, useEffect, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';

// Three Monaco themes that mirror Quipu's three theme tokens. Each one
// pins `editor.background` to the same color as Quipu's
// `--color-bg-surface` so the code area visually blends with the rest of
// the shell (per the unified-background pass in the visual overhaul).
// Syntax / token colors come from the Monaco base theme (`vs` or
// `vs-dark`); we only override the surface + gutter so the rest of the
// chrome stays consistent.
type QuipuMonacoTheme = 'quipu-light' | 'quipu-dark' | 'quipu-tinted';

interface MonacoThemeDef {
  base: 'vs' | 'vs-dark';
  bg: string;
  fg: string;
  gutter: string;
  lineHighlight: string;
}

const MONACO_THEMES: Record<QuipuMonacoTheme, MonacoThemeDef> = {
  // Match Quipu's `:root` (default light) tokens.
  'quipu-light': {
    base: 'vs',
    bg: '#ffffff',
    fg: '#1e1e1e',
    gutter: '#9e9e9e',
    lineHighlight: '#f5f5f5',
  },
  // Match Quipu's `:root.dark` tokens — the warm dark from the old chat.
  'quipu-dark': {
    base: 'vs-dark',
    bg: '#2b2926',
    fg: '#e8e8e0',
    gutter: '#666666',
    lineHighlight: '#2d2d2d',
  },
  // Match Quipu's `:root.tinted` (warm cream) tokens.
  'quipu-tinted': {
    base: 'vs',
    bg: '#fdf9ec',
    fg: '#5a4e48',
    gutter: '#c4b3a3',
    lineHighlight: '#f5ecd0',
  },
};

function resolveQuipuTheme(): QuipuMonacoTheme {
  if (typeof document === 'undefined') return 'quipu-light';
  const cl = document.documentElement.classList;
  if (cl.contains('dark')) return 'quipu-dark';
  if (cl.contains('tinted')) return 'quipu-tinted';
  return 'quipu-light';
}

function registerMonacoThemes(monaco: Monaco) {
  for (const [id, def] of Object.entries(MONACO_THEMES)) {
    monaco.editor.defineTheme(id, {
      base: def.base,
      inherit: true,
      rules: [],
      colors: {
        'editor.background': def.bg,
        'editor.foreground': def.fg,
        'editorLineNumber.foreground': def.gutter,
        'editorLineNumber.activeForeground': def.fg,
        'editor.lineHighlightBackground': def.lineHighlight,
        'editorGutter.background': def.bg,
        'editorCursor.foreground': def.fg,
        'editor.selectionBackground': def.base === 'vs-dark' ? '#4a4a4a' : '#dadada',
        'editor.inactiveSelectionBackground': def.base === 'vs-dark' ? '#3a3a3a' : '#e8e8e8',
        'editorWhitespace.foreground': def.gutter,
      },
    });
  }
}

const EXT_TO_LANG: Record<string, string> = {
  '.js': 'javascript', '.jsx': 'javascript', '.cjs': 'javascript', '.mjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.json': 'json', '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.html': 'xml', '.xml': 'xml', '.svg': 'xml',
  '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java',
  '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'ini',
  '.sql': 'sql', '.rb': 'ruby', '.php': 'php',
};

const MONACO_LANG_MAP: Record<string, string> = {
  javascript: 'javascript', typescript: 'typescript', json: 'json',
  css: 'css', xml: 'xml', html: 'html', python: 'python', go: 'go',
  rust: 'rust', java: 'java', c: 'c', cpp: 'cpp', shell: 'shell',
  yaml: 'yaml', sql: 'sql', ruby: 'ruby', php: 'php', ini: 'ini',
  scss: 'scss', less: 'less',
};

function getMonacoLanguage(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  const ext = i >= 0 ? fileName.substring(i).toLowerCase() : '';
  const lang = EXT_TO_LANG[ext];
  return (lang && MONACO_LANG_MAP[lang]) || 'plaintext';
}

interface CodeViewerProps {
  activeFile: { name: string; content: string | unknown | null };
  onContentChange?: (content: string) => void;
}

const CodeViewer = ({ activeFile, onContentChange }: CodeViewerProps) => {
  const { content, name: fileName } = activeFile;
  const monacoLanguage = getMonacoLanguage(fileName);
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('quipu-code-font-size');
    return saved ? parseInt(saved, 10) : 14;
  });
  const editorRef = useRef<unknown>(null);

  // Reactive: which Quipu theme is currently active? A MutationObserver
  // watches `documentElement.class` for `.dark` / `.tinted` swaps so the
  // Monaco editor restyles immediately when the user changes themes
  // (the same hook fires on initial mount via `resolveQuipuTheme()`).
  const [activeTheme, setActiveTheme] = useState<QuipuMonacoTheme>(() => resolveQuipuTheme());
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(() => setActiveTheme(resolveQuipuTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    localStorage.setItem('quipu-code-font-size', String(fontSize));
  }, [fontSize]);

  // Register the three Monaco themes once Monaco is available — runs
  // before the editor mounts so the initial render already uses the
  // correct background.
  const handleBeforeMount = useCallback((monaco: Monaco) => {
    registerMonacoThemes(monaco);
  }, []);

  const handleEditorDidMount = useCallback((editor: unknown) => {
    editorRef.current = editor;
  }, []);

  const handleChange = useCallback((value: string | undefined) => {
    onContentChange?.(value || '');
  }, [onContentChange]);

  const codeContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = codeContainerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setFontSize(prev => Math.min(32, Math.max(8, prev + (e.deltaY > 0 ? -1 : 1))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  return (
    <div
      ref={codeContainerRef}
      className="flex-1 h-full w-full overflow-hidden relative"
    >
      <Editor
        height="100%"
        width="100%"
        language={monacoLanguage}
        value={typeof content === 'string' ? content : ''}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        onMount={handleEditorDidMount}
        theme={activeTheme}
        options={{
          fontSize,
          minimap: { enabled: false },
          lineNumbers: 'on',
          wordWrap: 'on',
          scrollBeyondLastLine: true,
          renderWhitespace: 'selection',
          tabSize: 2,
          padding: { top: 16, bottom: 16 },
          fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
          automaticLayout: true,
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        }}
        loading={
          <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
            Loading editor...
          </div>
        }
      />
    </div>
  );
};

export default CodeViewer;
