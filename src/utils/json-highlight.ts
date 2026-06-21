/**
 * 轻量级 JSON 语法高亮工具。
 *
 * 使用单遍正则匹配 token（key / string / number / boolean/null / 结构性字符），
 * 每个 token 先 HTML 转义再包裹 <span class="hl-json-xxx"> 标签。
 * 零外部依赖，适合 LLM 回复中的代码块高亮渲染。
 */

/**
 * HTML 转义（&、<、> 三个危险字符）
 */
function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 匹配 token 的正则（按优先级依次为 key → string → number → bool/null → 结构性字符 → 兜底）
 *
 * - Key:   `"..."` 后跟可选的空白 + 冒号
 * - Str:   `"..."` 非 key 的普通字符串值
 * - Num:   整数/浮点数/科学计数法
 * - Bool:  `true` / `false` / `null`
 * - Punct: 结构性字符 `{}[]:,` + 空白
 * - Other: 单字符兜底（不应出现，用于防崩溃）
 */
const TOKEN_RE =
  /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)|([{}[\]:,\s]+)|(.)/g;

/**
 * 将 JSON 字符串语法高亮为带 span 标签的 HTML。
 *
 * 输入是纯文本 JSON，输出是安全的 HTML（所有特殊字符均已转义）。
 * 使用方式：`<code dangerouslySetInnerHTML={{ __html: highlightJson(json) }} />`
 */
export function highlightJson(json: string): string {
  if (!json) return '';

  return json.replace(TOKEN_RE, (match, key, str, num, bool, punct, other) => {
    if (key) {
      // Full match is "key": (with optional whitespace), key is just "key"
      // The colon + whitespace is in match but not in the captured group
      const name = key.slice(1, -1); // key name without surrounding quotes
      const suffix = match.slice(key.length); // whitespace + colon after the key string
      return `<span class="hl-json-key">&quot;${htmlEscape(
        name,
      )}&quot;</span>${htmlEscape(suffix)}`;
    }
    if (str) {
      // "value"  →  <span class="hl-json-str">"value"</span>
      const content = str.slice(1, -1);
      return `<span class="hl-json-str">&quot;${htmlEscape(content)}&quot;</span>`;
    }
    if (num) {
      return `<span class="hl-json-num">${htmlEscape(num)}</span>`;
    }
    if (bool) {
      return `<span class="hl-json-bool">${htmlEscape(bool)}</span>`;
    }
    // punct / other → HTML 转义原样输出
    return htmlEscape(match);
  });
}
