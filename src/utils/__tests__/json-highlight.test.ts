import { describe, it, expect } from 'vitest';
import { highlightJson } from '../json-highlight';

describe('highlightJson', () => {
  it('高亮空字符串返回空', () => {
    expect(highlightJson('')).toBe('');
  });

  it('高亮单个 key-value', () => {
    const html = highlightJson('{"name": "张三"}');
    expect(html).toContain('<span class="hl-json-key">');
    expect(html).toContain('<span class="hl-json-str">');
    expect(html).toContain('&quot;name&quot;');
    expect(html).toContain('&quot;张三&quot;');
  });

  it('高亮数字', () => {
    const html = highlightJson('{"age": 28}');
    expect(html).toContain('<span class="hl-json-num">');
    expect(html).toContain('28');
  });

  it('高亮布尔值和 null', () => {
    const html = highlightJson('{"active": true, "data": null, "flag": false}');
    expect(html).toContain('<span class="hl-json-bool">true</span>');
    expect(html).toContain('<span class="hl-json-bool">null</span>');
    expect(html).toContain('<span class="hl-json-bool">false</span>');
  });

  it('高亮数组中的字符串（非 key）', () => {
    const html = highlightJson('["apple", "banana"]');
    // 不应有 key 高亮
    expect(html).not.toContain('hl-json-key');
    // 应有字符串值高亮
    const matches = html.match(/hl-json-str/g);
    expect(matches).toHaveLength(2);
  });

  it('嵌套对象正确高亮', () => {
    const json = JSON.stringify({ user: { name: 'Alice', scores: [98, 87, 92] } });
    const html = highlightJson(json);
    expect(html).toContain('hl-json-key');
    expect(html).toContain('hl-json-str');
    expect(html).toContain('hl-json-num');
  });

  it('HTML 特殊字符被转义', () => {
    const html = highlightJson('{"x": "<script>alert(1)</script>"}');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('& 字符被正确转义', () => {
    const html = highlightJson('{"name": "AT&T"}');
    expect(html).not.toContain('AT&T');
    expect(html).toContain('AT&amp;T');
  });

  it('带转义引号的字符串', () => {
    // 使用 JSON.stringify 构造包含转义引号的 JSON
    const obj = { text: '他说:"你好"' };
    const json = JSON.stringify(obj);
    const html = highlightJson(json);
    expect(html).toContain('hl-json-str');
    // 验证转义引号 \\" 被保留在输出中
    expect(html).toMatch(/\\"/);
  });

  it('空对象/空数组', () => {
    expect(highlightJson('{}')).not.toContain('hl-json');
    expect(highlightJson('[]')).not.toContain('hl-json');
  });

  it('浮点数科学计数法', () => {
    const html = highlightJson('{"val": 1.5e10}');
    expect(html).toContain('<span class="hl-json-num">1.5e10</span>');
  });

  it('负数', () => {
    const html = highlightJson('{"temp": -5}');
    expect(html).toContain('<span class="hl-json-num">-5</span>');
  });

  it('跨行 JSON 对象', () => {
    const json = [
      '{',
      '  "name": "Alice",',
      '  "age": 30,',
      '  "active": true',
      '}',
    ].join('\n');
    const html = highlightJson(json);
    expect(html).toContain('hl-json-key');
    expect(html).toContain('hl-json-num');
    expect(html).toContain('hl-json-bool');
    expect(html).toContain('hl-json-str');
  });
});
