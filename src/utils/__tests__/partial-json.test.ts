import { describe, expect, it } from 'vitest';
import {
  parsePartialJson,
  partialArrayItems,
  partialNumberTuple,
  partialObjectField,
  partialString,
  partialStringArray,
} from '../partial-json';

function ideogramPrefix(bboxJson = '[100, 200, 300, 400]'): string {
  return '```json\n{"high_level_description":"A scene","compositional_deconstruction":{"background":"studio","elements":[{"type":"obj","bbox":'
    + bboxJson;
}

describe('parsePartialJson', () => {
  it('exposes a bbox immediately after its closing bracket, before desc arrives', () => {
    const text = ideogramPrefix() + ',"desc":';
    const parsed = parsePartialJson(text, 'object');
    expect(parsed).not.toBeNull();
    if (!parsed) return;

    const deconstruction = partialObjectField(parsed.node, 'compositional_deconstruction');
    const elements = partialArrayItems(partialObjectField(deconstruction, 'elements'));
    expect(elements).toHaveLength(1);
    expect(partialNumberTuple(partialObjectField(elements[0], 'bbox'))).toEqual([100, 200, 300, 400]);
    expect(partialString(partialObjectField(elements[0], 'desc'))).toBeUndefined();
  });

  it('updates desc/text/color palette once their values close', () => {
    const text = ideogramPrefix() + ',"desc":"a cat with [brackets] and \\"quotes\\"","color_palette":["#FFFFFF"]}]}}';
    const parsed = parsePartialJson(text, 'object');
    if (!parsed) throw new Error('expected partial parse');
    const deconstruction = partialObjectField(parsed.node, 'compositional_deconstruction');
    const element = partialArrayItems(partialObjectField(deconstruction, 'elements'))[0];

    expect(partialString(partialObjectField(element, 'desc'))).toBe('a cat with [brackets] and "quotes"');
    expect(partialStringArray(partialObjectField(element, 'color_palette'))).toEqual(['#FFFFFF']);
  });

  it('does not expose a bbox whose closing bracket or fourth number is missing', () => {
    for (const bbox of ['[100, 200, 300, 400', '[100, 200, 300, 40']) {
      const parsed = parsePartialJson(ideogramPrefix(bbox), 'object');
      if (!parsed) continue;
      const deconstruction = partialObjectField(parsed.node, 'compositional_deconstruction');
      const element = partialArrayItems(partialObjectField(deconstruction, 'elements'))[0];
      expect(partialNumberTuple(partialObjectField(element, 'bbox'))).toBeUndefined();
    }
  });

  it('parses partial JSON arrays and ignores brackets inside prose strings', () => {
    const text = 'A prose [not json] and "[also string]".\n```json\n[{"id":"a","bbox":[10,20,30,40],"desc":"x"},{"id":"b","bbox":[50,60,70,80],';
    const parsed = parsePartialJson(text, 'array');
    if (!parsed) throw new Error('expected partial array');
    const rows = partialArrayItems(parsed.node);
    expect(rows).toHaveLength(2);
    expect(partialNumberTuple(partialObjectField(rows[1], 'bbox'))).toEqual([50, 60, 70, 80]);
  });

  it('skips a prose bracket and picks the JSON array on a later line', () => {
    const text = 'A poster with [not json] in the copy.\n[{"id":"a","bbox":[10,20,30,40],"desc":"x"},';
    const parsed = parsePartialJson(text, 'array');
    if (!parsed) throw new Error('expected partial array');
    expect(partialArrayItems(parsed.node)).toHaveLength(1);
  });

  it('never throws at any truncation point', () => {
    const full = ideogramPrefix() + ',"desc":"done"}]}}\n```';
    for (let end = 0; end <= full.length; end++) {
      expect(() => parsePartialJson(full.slice(0, end), 'object')).not.toThrow();
    }
  });
});
