import { useMemo } from 'react';
import { cn } from '@/lib/cn';

/**
 * Render de markdown mínimo y seguro, sin dependencias: escapa el HTML de
 * entrada y sólo interpreta encabezados, listas, énfasis, código y enlaces.
 * Suficiente para los artículos de `help_articles`.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,
      '<a href="$2" rel="noopener noreferrer">$1</a>',
    );
}

function toHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inList = false;
  let inCode = false;

  const closeList = (): void => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      closeList();
      out.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(escapeHtml(line));
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1]!.length;
      out.push(`<h${level}>${renderInline(heading[2] ?? '')}</h${level}>`);
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${renderInline(bullet[1] ?? '')}</li>`);
      continue;
    }

    closeList();
    if (line.trim() === '') continue;
    out.push(`<p>${renderInline(line)}</p>`);
  }

  closeList();
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

export interface MarkdownViewProps {
  source: string;
  className?: string;
}

export function MarkdownView({ source, className }: MarkdownViewProps): React.JSX.Element {
  const html = useMemo(() => toHtml(source ?? ''), [source]);

  return (
    <div
      className={cn(
        'space-y-2 text-sm text-content-secondary',
        '[&_h1]:font-display [&_h1]:text-lg [&_h1]:text-content-primary',
        '[&_h2]:font-display [&_h2]:text-base [&_h2]:text-content-primary',
        '[&_h3]:font-display [&_h3]:text-sm [&_h3]:text-content-primary',
        '[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5',
        '[&_code]:rounded [&_code]:bg-surface-overlay [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
        '[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line [&_pre]:bg-surface-overlay [&_pre]:p-3',
        className,
      )}
      // El contenido se escapa en toHtml(): sólo se reinyectan las etiquetas
      // generadas aquí, nunca HTML del autor del artículo.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
