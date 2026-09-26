/**
 * Strip the lightweight markdown used in blog content down to plain text —
 * for list cards, search previews and any place that renders a string as-is.
 * `[label](url)` → `label`, `**bold**` → `bold`, backticks and list markers drop.
 */
export const mdToPlainText = (s: string | undefined | null): string =>
  String(s || '')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*(#{2,4}|>|[-•*]|\d+\.)\s+/gm, '')
    .replace(/⟨[^⟩]*⟩/g, '')
    .replace(/\s+/g, ' ')
    .trim();
