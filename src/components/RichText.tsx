import React from 'react';
import { CheckSquare, ExternalLink, Quote } from 'lucide-react';
import { linkProps, navigate } from '../utils/router';

/**
 * RichText — renders the lightweight markdown used inside blog sections.
 *
 * Sections historically stored plain paragraphs (split on `\n\n`) plus the
 * structured `callout` / `keyPoints` fields. The batch-01 articles need more:
 * internal links (the whole topic-cluster strategy runs on them), bold, tables,
 * numbered lists and checklists. Instead of bloating the section schema, the
 * content string now carries a small markdown subset that this component
 * renders — and plain paragraphs keep rendering exactly as before.
 *
 * Supported blocks:  paragraphs, `#### headings`, `- ` / `1. ` lists,
 * `- [ ]` checklists, `| tables |`, `> ` quotes.
 * Supported inline:  [text](url), **bold**, `code`.
 */

const isInternal = (url: string) => url.startsWith('/') && !url.startsWith('//');

interface InlineProps {
  text: string;
  isDark: boolean;
}

/** Inline: links, bold, code. */
const Inline: React.FC<InlineProps> = ({ text, isDark }) => {
  const parts: React.ReactNode[] = [];
  // order matters: links first (their labels may contain bold/code), then bold, then code
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const label = m[1];
      const url = m[2];
      if (isInternal(url)) {
        parts.push(
          <a
            key={k++}
            {...linkProps(url, () => navigate(url))}
            className="font-extrabold text-[color:var(--nd-accent)] underline underline-offset-4 decoration-2 decoration-[color:var(--nd-accent)]/40 hover:decoration-[color:var(--nd-accent)] transition-colors cursor-pointer"
          >
            {label}
          </a>,
        );
      } else {
        parts.push(
          <a
            key={k++}
            href={url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 font-extrabold text-[color:var(--nd-accent)] underline underline-offset-4 decoration-2 decoration-[color:var(--nd-accent)]/40 hover:decoration-[color:var(--nd-accent)] transition-colors"
          >
            <span>{label}</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>,
        );
      }
    } else if (m[3] !== undefined) {
      parts.push(
        <strong key={k++} className={`font-extrabold ${isDark ? 'text-slate-100' : 'text-[color:var(--nd-ink)]'}`}>
          {m[3]}
        </strong>,
      );
    } else {
      parts.push(
        <code
          key={k++}
          className={`px-1.5 py-0.5 rounded-lg text-[11px] font-bold ${isDark ? 'bg-white/10 text-slate-200' : 'bg-[color:var(--nd-bg-soft)] text-[color:var(--nd-ink-2)]'}`}
          dir="ltr"
        >
          {m[4]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
};

const TableBlock: React.FC<{ rows: string[]; isDark: boolean }> = ({ rows, isDark }) => {
  const cells = (line: string) =>
    line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const header = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  return (
    <div className={`overflow-x-auto rounded-2xl border ${isDark ? 'border-white/10' : 'border-[color:var(--nd-line)]'}`}>
      <table className="w-full text-xs sm:text-sm border-collapse">
        <thead>
          <tr className={isDark ? 'bg-white/5' : 'bg-[color:var(--nd-bg-soft)]'}>
            {header.map((h, i) => (
              <th key={i} className={`px-3 py-2.5 text-right font-extrabold ${isDark ? 'text-slate-200' : 'text-[color:var(--nd-ink)]'} whitespace-nowrap`}>
                <Inline text={h} isDark={isDark} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className={`border-t ${isDark ? 'border-white/8' : 'border-[color:var(--nd-line)]'}`}>
              {row.map((c, ci) => (
                <td key={ci} className={`px-3 py-2.5 leading-relaxed ${isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}`}>
                  <Inline text={c} isDark={isDark} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ListBlock: React.FC<{ items: { text: string; checked?: boolean }[]; ordered: boolean; isDark: boolean }> = ({ items, ordered, isDark }) => (
  <ul className="space-y-2">
    {items.map((item, i) => (
      <li key={i} className="flex items-start gap-2.5 text-xs sm:text-sm leading-loose">
        {item.checked !== undefined ? (
          <CheckSquare className={`w-4 h-4 mt-1 shrink-0 ${item.checked ? 'text-[color:var(--nd-success)]' : isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`} />
        ) : ordered ? (
          <span className={`min-w-5 text-center font-extrabold ${isDark ? 'text-slate-500' : 'text-[color:var(--nd-faint)]'}`}>{i + 1}.</span>
        ) : (
          <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: 'var(--nd-accent)' }} aria-hidden />
        )}
        <span className={isDark ? 'text-slate-300' : 'text-[color:var(--nd-ink-2)]'}>
          <Inline text={item.text} isDark={isDark} />
        </span>
      </li>
    ))}
  </ul>
);

interface RichTextProps {
  text: string;
  isDark: boolean;
  /** Override the default paragraph classes (e.g. larger intro text). */
  paragraphClass?: string;
}

export const RichText: React.FC<RichTextProps> = ({ text, isDark, paragraphClass }) => {
  if (!text) return null;
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return (
    <div className="space-y-4">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

        // table
        if (lines[0].startsWith('|') && lines.some((l) => /^\|[\s:-|]+\|?$/.test(l))) {
          return <TableBlock key={bi} rows={lines} isDark={isDark} />;
        }
        // heading
        if (lines[0].startsWith('####')) {
          return (
            <h3 key={bi} className={`text-sm sm:text-base font-extrabold ${isDark ? 'text-white' : 'text-[color:var(--nd-ink)]'}`}>
              <Inline text={lines[0].replace(/^#+\s*/, '')} isDark={isDark} />
            </h3>
          );
        }
        // quote → callout
        if (lines[0].startsWith('>')) {
          const quote = lines.map((l) => l.replace(/^>\s*/, '')).join('\n');
          return (
            <div
              key={bi}
              className={`rounded-2xl p-5 text-xs sm:text-sm leading-loose flex items-start gap-3 ${isDark ? 'nd-glass-dark' : ''}`}
              style={isDark ? undefined : { background: 'var(--nd-accent-soft)', color: 'var(--nd-accent-strong)' }}
            >
              <Quote className="w-4 h-4 mt-0.5 shrink-0 opacity-70" />
              <span className="font-bold"><Inline text={quote} isDark={isDark} /></span>
            </div>
          );
        }
        // checklist
        if (lines.every((l) => /^-\s*\[[ xX]\]\s*/.test(l))) {
          return (
            <ListBlock
              key={bi}
              ordered={false}
              isDark={isDark}
              items={lines.map((l) => ({ text: l.replace(/^-\s*\[[ xX]\]\s*/, ''), checked: /^-\s*\[[xX]\]/.test(l) }))}
            />
          );
        }
        // bullet list
        if (lines.every((l) => /^[-•*]\s+/.test(l))) {
          return <ListBlock key={bi} ordered={false} isDark={isDark} items={lines.map((l) => ({ text: l.replace(/^[-•*]\s+/, '') }))} />;
        }
        // ordered list (1. / ۱. / 1-)
        if (lines.every((l) => /^(\d+\.|[\u06F0-\u06F9]+\.|[۰-۹]+\.)\s*/.test(l))) {
          return <ListBlock key={bi} ordered isDark={isDark} items={lines.map((l) => ({ text: l.replace(/^(\d+\.|[\u06F0-\u06F9]+\.|[۰-۹]+\.)\s*/, '') }))} />;
        }

        // paragraph (may contain soft line breaks)
        return (
          <p key={bi} className={paragraphClass || `text-sm leading-loose ${isDark ? 'text-slate-400' : 'nd-muted'}`}>
            {lines.map((line, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                <Inline text={line} isDark={isDark} />
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
};
