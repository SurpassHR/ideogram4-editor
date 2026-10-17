/** 从 LLM 回复里收集候选 JSON 片段：代码块优先，其次正文中平衡的括号片段（都从后往前）。 */

function collectFencedBlocks(text: string): string[] {
  const blocks: string[] = [];
  const fences = [...text.matchAll(/```[ \t]*[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)```/g)];
  for (let i = fences.length - 1; i >= 0; i--) blocks.push(fences[i][1].trim());
  return blocks;
}

function collectBalancedSegments(text: string, open: string, close: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (inString) {
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === open) {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === close && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        segments.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return segments.reverse();
}

export function collectJsonCandidates(text: string, kind: 'array' | 'object'): string[] {
  const [open, close] = kind === 'array' ? ['[', ']'] : ['{', '}'];
  return [...collectFencedBlocks(text), ...collectBalancedSegments(text, open, close)];
}
