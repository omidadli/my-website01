import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkChatReadability } from './chatReadability';
import { isPlainLeftClick, legacyHashToPath, navigate } from '../../utils/router';

/** Safe markdown: raw HTML is never rendered; Persian prose and LTR code stay separate. */
export const ChatAnswer: React.FC<{ text: string }> = ({ text }) => (
  <div className="chat-answer" dir="rtl" lang="fa">
    <Markdown remarkPlugins={[remarkGfm, remarkChatReadability]} components={{
      a: ({ href, children }) => {
        if (!href) return <span>{children}</span>;
        const external = /^https?:\/\//i.test(href);
        const path = href.startsWith('#/') ? legacyHashToPath(href) || href : href;
        return <a href={path} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          onClick={!external && path.startsWith('/') && !path.startsWith('//') ? (e) => {
            if (isPlainLeftClick(e)) { e.preventDefault(); navigate(path); }
          } : undefined}>{children}</a>;
      },
      pre: ({ children }) => <pre dir="ltr" tabIndex={0}>{children}</pre>,
      code: ({ children, className }) => <code dir="ltr" className={className}>{children}</code>,
      table: ({ children }) => <div className="chat-table-wrap" tabIndex={0} role="region" aria-label="جدول پاسخ"><table>{children}</table></div>,
    }}>{text}</Markdown>
  </div>
);
