import { describe, it, expect } from 'vitest';
import { parseContentSegments } from '../code-block-parser';

describe('parseContentSegments', () => {
  it('无 code block 时返回单个 text 段', () => {
    const result = parseContentSegments('Hello world');
    expect(result).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('单个 ```json 代码块', () => {
    const input = 'Some text\n```json\n{"key": "value"}\n```\nEnd';
    const result = parseContentSegments(input);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 'text', text: 'Some text' });
    expect(result[1]).toEqual({ type: 'code', lang: 'json', code: '{"key": "value"}' });
    expect(result[2]).toEqual({ type: 'text', text: 'End' });
  });

  it('多个混合代码块', () => {
    const input = 'A\n```python\nprint(1)\n```\nB\n```json\n[1,2]\n```\nC';
    const result = parseContentSegments(input);
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ type: 'text', text: 'A' });
    expect(result[1]).toEqual({ type: 'code', lang: 'python', code: 'print(1)' });
    expect(result[2]).toEqual({ type: 'text', text: 'B' });
    expect(result[3]).toEqual({ type: 'code', lang: 'json', code: '[1,2]' });
    expect(result[4]).toEqual({ type: 'text', text: 'C' });
  });

  it('空代码块', () => {
    const input = 'text\n```json\n```\nend';
    const result = parseContentSegments(input);
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual({ type: 'code', lang: 'json', code: '' });
  });

  it('连续文本无代码块', () => {
    const input = 'Just text\nmultiple lines\nwithout code';
    const result = parseContentSegments(input);
    expect(result).toEqual([{ type: 'text', text: input }]);
  });

  it('空字符串返回单个空 text 段', () => {
    const result = parseContentSegments('');
    expect(result).toEqual([{ type: 'text', text: '' }]);
  });

  it('只有代码块时正确切分', () => {
    const input = '```json\n{"a":1}\n```';
    const result = parseContentSegments(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'code', lang: 'json', code: '{"a":1}' });
  });

  it('lang 被转为小写', () => {
    const input = '```JSON\n{"b":2}\n```';
    const result = parseContentSegments(input);
    expect(result[0].type === 'code' && result[0].lang).toBe('json');
  });

  it('trim 空文本段被跳过', () => {
    const input = '```json\n{}\n```\n\n```python\nx=1\n```';
    const result = parseContentSegments(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'code', lang: 'json', code: '{}' });
    expect(result[1]).toEqual({ type: 'code', lang: 'python', code: 'x=1' });
  });
});
