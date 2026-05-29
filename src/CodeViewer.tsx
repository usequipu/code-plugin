import React, { useState, useCallback, useEffect, useRef } from 'react';
import Editor, { loader, useMonaco, type Monaco } from '@monaco-editor/react';
import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';

// Point @monaco-editor/loader at the bundled monaco copy so the plugin works
// without internet (Electron production builds load from `file://`, and the
// CDN fallback can fail or — when the script tag injection happens before
// the React tree is ready — surface as an uncaught error that bubbles to
// the App root and blanks the window). Monaco's default inline-worker
// transport (data: URI) works without an explicit `MonacoEnvironment`.
// Calling `loader.config` is idempotent; safe to run at module load.
loader.config({ monaco: monacoEditor as unknown as Monaco });

// Three Monaco themes that mirror Quipu's three theme tokens. Instead of
// hard-coding colors, we read Quipu's CSS variables off
// `documentElement` at registration time so the Monaco surface always
// tracks whatever the host has set for `--color-page-bg`,
// `--color-text-primary`, etc. — including future token tweaks without a
// plugin rebuild. Syntax / token colors come from the Monaco base
// theme (`vs` / `vs-dark`); we only override the surface + gutter.
type QuipuMonacoTheme = 'quipu-light' | 'quipu-dark' | 'quipu-tinted';

function resolveQuipuTheme(): QuipuMonacoTheme {
  if (typeof document === 'undefined') return 'quipu-light';
  const cl = document.documentElement.classList;
  if (cl.contains('dark')) return 'quipu-dark';
  if (cl.contains('tinted')) return 'quipu-tinted';
  return 'quipu-light';
}

// Read a CSS variable off `documentElement`. Trimmed because computed
// values often come back with surrounding whitespace.
function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function registerMonacoThemes(monaco: Monaco) {
  const themes: Array<{
    id: QuipuMonacoTheme;
    base: 'vs' | 'vs-dark';
    selectionLight: string;
    selectionDark: string;
  }> = [
    { id: 'quipu-light',  base: 'vs',      selectionLight: '#dadada', selectionDark: '#e8e8e8' },
    { id: 'quipu-dark',   base: 'vs-dark', selectionLight: '#4a4a4a', selectionDark: '#3a3a3a' },
    { id: 'quipu-tinted', base: 'vs',      selectionLight: '#e0d4b8', selectionDark: '#efe3c4' },
  ];

  // We register all three but only the currently-active one will use
  // computed CSS values that reflect the live theme. The other two get
  // the same computed values (which is fine — Monaco will replace them
  // next time the theme changes and `registerMonacoThemes` is re-run).
  const bg = readCssVar('--color-page-bg', '#ffffff');
  const fg = readCssVar('--color-text-primary', '#1e1e1e');
  const gutter = readCssVar('--color-text-tertiary', '#9e9e9e');
  const lineHighlight = readCssVar('--color-bg-elevated', '#f5f5f5');

  for (const t of themes) {
    monaco.editor.defineTheme(t.id, {
      base: t.base,
      inherit: true,
      rules: [],
      colors: {
        'editor.background': bg,
        'editor.foreground': fg,
        'editorLineNumber.foreground': gutter,
        'editorLineNumber.activeForeground': fg,
        'editor.lineHighlightBackground': lineHighlight,
        'editorGutter.background': bg,
        'editorCursor.foreground': fg,
        'editor.selectionBackground': t.selectionLight,
        'editor.inactiveSelectionBackground': t.selectionDark,
        'editorWhitespace.foreground': gutter,
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

  // Re-register the Monaco themes whenever the Quipu theme flips so the
  // new CSS-var values (--color-page-bg etc.) propagate. The themes
  // are read at registration time, not at theme-application time, so we
  // need to redefine them after every Quipu class swap.
  const monaco = useMonaco();
  useEffect(() => {
    if (!monaco) return;
    registerMonacoThemes(monaco);
  }, [monaco, activeTheme]);

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
