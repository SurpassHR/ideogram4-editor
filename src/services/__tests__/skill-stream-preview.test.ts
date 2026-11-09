import { describe, expect, it } from 'vitest';
import { getAdapter } from '../skill-adapters';

describe('skill stream previews', () => {
  it('Ideogram exposes bbox before desc and updates desc later', () => {
    const adapter = getAdapter('ideogram4');
    const prefix = '```json\n{"high_level_description":"x","compositional_deconstruction":{"background":"b","elements":[{"type":"obj","bbox":[100,200,300,400],';
    const first = adapter.extractPreview?.(prefix, { canvasW: 1024, canvasH: 1024 });
    expect(first?.elements).toHaveLength(1);
    expect(first?.elements[0].bbox).toEqual([100, 200, 300, 400]);
    expect(first?.elements[0].desc).toBe('');

    const later = adapter.extractPreview?.(prefix + '"desc":"a cat"', { canvasW: 1024, canvasH: 1024 });
    expect(later?.elements[0].desc).toBe('a cat');
  });

  it('Ideogram uses declared canvas dimensions for pixel bbox previews', () => {
    const adapter = getAdapter('ideogram4');
    const prefix = '{"canvasW":2000,"canvasH":1000,"compositional_deconstruction":{"elements":[{"type":"obj","bbox":[200,400,1000,1600],';
    const preview = adapter.extractPreview?.(prefix, { canvasW: 1024, canvasH: 1024 });
    expect(preview?.elements[0].bbox).toEqual([200, 200, 1000, 800]);
  });

  it('FLUX previews each completed row and keeps text rows', () => {
    const adapter = getAdapter('flux3-layout');
    const prefix = '```json\n[{"id":"headline","type":"text","bbox":[80,140,200,860],';
    const preview = adapter.extractPreview?.(prefix, { canvasW: 1024, canvasH: 1024 });
    expect(preview?.elements).toHaveLength(1);
    expect(preview?.elements[0]).toMatchObject({ type: 'text', bbox: [80, 140, 200, 860] });
  });

  it('MOSS waits for width/height, then converts absolute xyxy to normalized yxyx', () => {
    const adapter = getAdapter('moss-layout');
    const withoutSize = '{"items":[{"label":"object","bbox":[176,224,800,864],"caption":"cup"}]}';
    expect(adapter.extractPreview?.(withoutSize, { canvasW: 1024, canvasH: 1024 })).toBeNull();

    const prefix = '{"width":1536,"height":1024,"items":[{"label":"object","bbox":[176,224,800,864],';
    const preview = adapter.extractPreview?.(prefix, { canvasW: 1024, canvasH: 1024 });
    expect(preview?.canvas).toEqual({ width: 1536, height: 1024 });
    expect(preview?.elements[0].bbox).toEqual([219, 115, 844, 521]);
  });

  it('MOSS caption and none adapter do not expose boxes', () => {
    expect(getAdapter('moss-layout').extractPreview?.('{"caption":"a calm photo"}', {
      canvasW: 1024,
      canvasH: 1024,
    })).toBeNull();
    expect(getAdapter('none').extractPreview).toBeUndefined();
  });
});
