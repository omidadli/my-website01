import type { Root, Paragraph, PhrasingContent, RootContent } from 'mdast';

/** Add breathing room to dense prose, without rewriting words or touching code,
 * tables, links, list items or quotes. Operates on parsed Markdown, not its source. */
export function remarkChatReadability() {
  return (tree: Root) => {
    // Promote an explicit bold-only title; preserve its words and emphasis.
    tree.children = tree.children.map((block): RootContent => {
      if (block.type === 'paragraph' && block.children.length === 1 &&
          block.children[0].type === 'strong') {
        const title = block.children[0];
        const text = title.children.map(n => 'value' in n ? String(n.value) : '').join('');
        if (text.length > 0 && text.length <= 80) return { type: 'heading', depth: 3, children: title.children };
      }
      return block;
    });
    tree.children = tree.children.flatMap((block): RootContent[] => {
      if (block.type !== 'paragraph') return [block];
      const result: Paragraph[] = [];
      let children: PhrasingContent[] = [];
      let length = 0;
      const flush = () => {
        if (children.length) result.push({ type: 'paragraph', children });
        children = [];
        length = 0;
      };
      for (const child of block.children) {
        if (child.type !== 'text') {
          children.push(child);
          // Preserve inline formatting and links as indivisible nodes.
          length += 'value' in child ? String(child.value).length : 20;
          continue;
        }
        // Sentence boundaries only: do not split decimals, URLs or abbreviations.
        const sentences = child.value.split(/(?<=[.!؟?!؛])(?=\s)|(?=\n)/u)
          .flatMap(part => {
            // Unpunctuated answers still need paragraphs; split only at spaces,
            // never within Persian words or ZWNJ-connected compounds.
            if (part.length <= 400) return [part];
            const chunks: string[] = [];
            let chunk = '';
            for (const word of part.match(/\S+\s*|\s+/gu) || []) {
              if (chunk.length >= 280) { chunks.push(chunk); chunk = ''; }
              chunk += word;
            }
            if (chunk) chunks.push(chunk);
            return chunks;
          });
        for (const sentence of sentences) {
          if (length >= 200 && sentence.trim()) flush();
          const value = children.length ? sentence : sentence.trimStart();
          if (!value) continue;
          children.push({ type: 'text', value });
          length += value.length;
        }
      }
      flush();
      return result;
    });

    // Old transcripts / models that ignore Markdown still get visible sections.
    // Labels are deliberately neutral: do not invent topical claims or summaries.
    const prose = tree.children.filter(b => b.type === 'paragraph');
    const proseLength = prose.reduce((total, p) => total + p.children.reduce((n, c) => n + ('value' in c ? String(c.value).length : 0), 0), 0);
    if (!tree.children.some(b => b.type === 'heading') && proseLength >= 850 && prose.length >= 3) {
      let paragraphs = 0;
      let section = 0;
      tree.children = tree.children.flatMap((block): RootContent[] => {
        if (block.type !== 'paragraph') return [block];
        const addHeading = paragraphs++ % 2 === 0;
        if (!addHeading) return [block];
        section++;
        const label = section === 1 ? 'توضیحات' : `ادامهٔ توضیحات · بخش ${section.toLocaleString('fa-IR')}`;
        return [{ type: 'heading', depth: 3, children: [{ type: 'text', value: label }] }, block];
      });
    }
  };
}
