import React, { useState, useCallback, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Editor from '@monaco-editor/react';

function cn(...inputs: (string | false | null | undefined)[]) {
  return twMerge(clsx(inputs));
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

  useEffect(() => {
    localStorage.setItem('quipu-code-font-size', String(fontSize));
  }, [fontSize]);

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
      className={cn(
        'flex-1 flex justify-center items-start overflow-y-auto relative',
        'py-8 px-16',
        'max-[1400px]:justify-start max-[1400px]:pl-12',
        'max-[1200px]:overflow-x-auto max-[1200px]:p-8',
        'max-[1150px]:py-6 max-[1150px]:px-4',
      )}
    >
      <div className={cn(
        'w-[816px] min-h-[400px] bg-page-bg rounded border border-page-border',
        'shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.06)]',
        'relative shrink-0 overflow-hidden',
        'max-[1150px]:w-full max-[1150px]:max-w-[816px]',
      )}>
        <Editor
          height="calc(100vh - 120px)"
          language={monacoLanguage}
          value={typeof content === 'string' ? content : ''}
          onChange={handleChange}
          onMount={handleEditorDidMount}
          theme="vs-dark"
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
    </div>
  );
};

export default CodeViewer;
