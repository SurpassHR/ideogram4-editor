/**
 * Tolerant JSON-prefix parser for streaming LLM output.
 *
 * Unlike JSON.parse(), this keeps every value that was fully parsed before the
 * stream ended. Callers can therefore inspect e.g. a completed `bbox` array
 * even while the surrounding element object is still being generated.
 */

export type PartialJsonNode =
  | { kind: 'object'; complete: boolean; properties: Record<string, PartialJsonNode> }
  | { kind: 'array'; complete: boolean; items: PartialJsonNode[] }
  | { kind: 'string'; complete: boolean; value: string }
  | { kind: 'number'; complete: boolean; value: number }
  | { kind: 'boolean'; complete: boolean; value: boolean }
  | { kind: 'null'; complete: boolean; value: null }
  | { kind: 'invalid'; complete: false };

export interface PartialJsonResult {
  node: PartialJsonNode;
  /** Root value was syntactically closed. */
  complete: boolean;
  start: number;
}

function decodeString(raw: string): string | null {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return null;
  }
}

function findFencedContent(text: string): string {
  const opening = /```[ \t]*(?:json)?[ \t]*\r?\n?/i.exec(text);
  if (!opening) return text;

  const contentStart = opening.index + opening[0].length;
  const rest = text.slice(contentStart);
  const closing = rest.indexOf('```');
  return closing >= 0 ? rest.slice(0, closing) : rest;
}

function findRootStart(text: string, expected: 'object' | 'array'): number {
  const rootChar = expected === 'object' ? '{' : '[';
  const trimmedStart = text.search(/\S/);
  if (trimmedStart >= 0 && text[trimmedStart] === rootChar) return trimmedStart;

  // 优先选择行首的根结构，避免把正文里的 `[note]` / `{word}` 当成 JSON。
  const lineRoot = new RegExp(`(?:^|\\r?\\n)[ \\t]*${rootChar === '[' ? '\\[' : '\\{'}`).exec(text);
  if (lineRoot) return lineRoot.index + lineRoot[0].length - 1;

  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString && char === rootChar) return i;
  }
  return -1;
}

class PartialJsonParser {
  private pos: number;

  constructor(private readonly text: string, start: number) {
    this.pos = start;
  }

  parse(expected: 'object' | 'array'): PartialJsonResult | null {
    const start = findRootStart(this.text, expected);
    if (start < 0) return null;
    this.pos = start;
    const node = this.parseValue();
    if (!node || (node.kind !== expected)) return null;
    return { node, complete: node.complete, start };
  }

  private skipWhitespace(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos += 1;
  }

  private parseValue(): PartialJsonNode | null {
    this.skipWhitespace();
    const char = this.text[this.pos];
    if (char === '{') return this.parseObject();
    if (char === '[') return this.parseArray();
    if (char === '"') return this.parseString();
    if (char === 't' || char === 'f' || char === 'n') return this.parseLiteral();
    if (char === '-' || (char >= '0' && char <= '9')) return this.parseNumber();
    return null;
  }

  private parseString(): PartialJsonNode {
    const start = this.pos;
    this.pos += 1;
    const rawStart = this.pos;

    while (this.pos < this.text.length) {
      const char = this.text[this.pos];
      if (char === '\\') {
        this.pos += 2;
        continue;
      }
      if (char === '"') {
        const raw = this.text.slice(rawStart, this.pos);
        this.pos += 1;
        return { kind: 'string', complete: true, value: decodeString(raw) ?? raw };
      }
      this.pos += 1;
    }

    return {
      kind: 'string',
      complete: false,
      value: this.text.slice(rawStart, Math.max(rawStart, this.text.length)),
    };
  }

  private parseNumber(): PartialJsonNode {
    const start = this.pos;
    if (this.text[this.pos] === '-') this.pos += 1;

    while (this.pos < this.text.length) {
      const char = this.text[this.pos];
      if (/[0-9.eE+-]/.test(char)) {
        this.pos += 1;
      } else {
        break;
      }
    }

    const raw = this.text.slice(start, this.pos);
    const value = Number(raw);
    return {
      kind: 'number',
      // A number ending exactly at EOF may still receive more digits.
      complete: this.pos < this.text.length && Number.isFinite(value),
      value: Number.isFinite(value) ? value : 0,
    };
  }

  private parseLiteral(): PartialJsonNode {
    if (this.text.startsWith('true', this.pos)) {
      this.pos += 4;
      return { kind: 'boolean', complete: true, value: true };
    }
    if (this.text.startsWith('false', this.pos)) {
      this.pos += 5;
      return { kind: 'boolean', complete: true, value: false };
    }
    if (this.text.startsWith('null', this.pos)) {
      this.pos += 4;
      return { kind: 'null', complete: true, value: null };
    }
    this.pos = this.text.length;
    return { kind: 'invalid', complete: false };
  }

  private parseObject(): PartialJsonNode {
    this.pos += 1;
    const properties: Record<string, PartialJsonNode> = {};

    while (true) {
      this.skipWhitespace();
      if (this.pos >= this.text.length) return { kind: 'object', complete: false, properties };
      if (this.text[this.pos] === '}') {
        this.pos += 1;
        return { kind: 'object', complete: true, properties };
      }
      if (this.text[this.pos] !== '"') return { kind: 'object', complete: false, properties };

      const keyNode = this.parseString();
      if (keyNode.kind !== 'string' || !keyNode.complete) {
        return { kind: 'object', complete: false, properties };
      }

      this.skipWhitespace();
      if (this.text[this.pos] !== ':') return { kind: 'object', complete: false, properties };
      this.pos += 1;

      const value = this.parseValue();
      if (!value) return { kind: 'object', complete: false, properties };
      properties[keyNode.value] = value;

      this.skipWhitespace();
      if (this.pos >= this.text.length) return { kind: 'object', complete: false, properties };
      if (this.text[this.pos] === ',') {
        this.pos += 1;
        continue;
      }
      if (this.text[this.pos] === '}') {
        this.pos += 1;
        return { kind: 'object', complete: true, properties };
      }
      return { kind: 'object', complete: false, properties };
    }
  }

  private parseArray(): PartialJsonNode {
    this.pos += 1;
    const items: PartialJsonNode[] = [];

    while (true) {
      this.skipWhitespace();
      if (this.pos >= this.text.length) return { kind: 'array', complete: false, items };
      if (this.text[this.pos] === ']') {
        this.pos += 1;
        return { kind: 'array', complete: true, items };
      }

      const value = this.parseValue();
      if (!value) return { kind: 'array', complete: false, items };
      items.push(value);

      this.skipWhitespace();
      if (this.pos >= this.text.length) return { kind: 'array', complete: false, items };
      if (this.text[this.pos] === ',') {
        this.pos += 1;
        continue;
      }
      if (this.text[this.pos] === ']') {
        this.pos += 1;
        return { kind: 'array', complete: true, items };
      }
      return { kind: 'array', complete: false, items };
    }
  }
}

/** Parse a clipped JSON object/array, preserving every fully available field. */
export function parsePartialJson(text: string, expected: 'object' | 'array'): PartialJsonResult | null {
  const fenced = findFencedContent(text);
  return new PartialJsonParser(fenced, 0).parse(expected);
}

export function partialObjectField(
  node: PartialJsonNode | undefined,
  key: string,
): PartialJsonNode | undefined {
  return node?.kind === 'object' ? node.properties[key] : undefined;
}

export function partialArrayItems(node: PartialJsonNode | undefined): PartialJsonNode[] {
  return node?.kind === 'array' ? node.items : [];
}

export function partialString(node: PartialJsonNode | undefined): string | undefined {
  return node?.kind === 'string' && node.complete ? node.value : undefined;
}

export function partialNumber(node: PartialJsonNode | undefined): number | undefined {
  return node?.kind === 'number' && node.complete ? node.value : undefined;
}

export function partialNumberTuple(
  node: PartialJsonNode | undefined,
): [number, number, number, number] | undefined {
  if (!node || node.kind !== 'array' || !node.complete || node.items.length !== 4) return undefined;
  const values = node.items.map(item => partialNumber(item));
  if (values.some(value => value === undefined || value < 0)) return undefined;
  return values as [number, number, number, number];
}

export function partialStringArray(node: PartialJsonNode | undefined): string[] | undefined {
  if (!node || node.kind !== 'array' || !node.complete) return undefined;
  const values = node.items.map(item => partialString(item));
  if (values.some(value => value === undefined)) return undefined;
  return values as string[];
}
