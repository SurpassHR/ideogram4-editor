/** 内容段类型 */
export type ContentSegment =
  | { type: 'text'; text: string }
  | { type: 'code'; lang: string; code: string };

/**
 * 将 markdown 文本按 fenced code block 切分为文本段和代码段。
 *
 * - 正则匹配所有 fenced code blocks: ```lang\\n...```
 * - lang 取 backtick 后第一 token，`.toLowerCase()`
 * - text 段 `.trim()` 后为空则跳过
 * - 无 code block 时返回单个 text 段
 */
export function parseContentSegments(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const regex = /^```(\S*)\n([\s\S]*?)```/gm;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    // 前一段文本（trim 空则跳过）
    const text = content.slice(lastIndex, match.index).trim();
    if (text) {
      segments.push({ type: 'text', text });
    }

    const lang = match[1].toLowerCase();
    // 去除尾随换行（fence 结束标记前的换行）
    const code = match[2].replace(/\n$/, '');

    segments.push({ type: 'code', lang, code });

    lastIndex = match.index + match[0].length;
  }

  // 剩余文本
  const remaining = content.slice(lastIndex).trim();
  if (remaining) {
    segments.push({ type: 'text', text: remaining });
  }

  // 没有 code block 且无文本时返回空，但调用方期望至少一个段
  if (segments.length === 0) {
    segments.push({ type: 'text', text: content });
  }

  return segments;
}
