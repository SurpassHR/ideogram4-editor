import { describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { WorkspaceArchiveManifestV2 } from '../../../shared/desktop-contract';

vi.mock('../canvas-image-store', () => ({
  loadCanvasImages: vi.fn(async () => ({
    boxes: { box_1: 'data:image/png;base64,AQID' },
    background: null,
  })),
}));

import { buildWebMigrationArchive } from '../desktop-migration';

describe('web desktop migration archive', () => {
  it('packages workspace data, images, and strips provider API keys', async () => {
    localStorage.clear();
    localStorage.setItem('ideogram4-canvas-document:v1', JSON.stringify({
      schemaVersion: 1,
      canvasW: 1024,
      canvasH: 1024,
      boxes: [{ id: 'box_1', imageDataUrl: null }],
    }));
    localStorage.setItem('ideogram4-llm-providers', JSON.stringify([{
      id: 'openai',
      name: 'OpenAI',
      kind: 'openai',
      base_url: 'https://api.openai.com/v1',
      api_key: 'super-secret',
      models: ['gpt-5.1'],
    }]));
    localStorage.setItem('ideogram4-workspace-backup-settings:v1', JSON.stringify({ githubToken: 'pat-secret' }));

    const archive = await buildWebMigrationArchive();
    const files = unzipSync(archive);
    const manifest = JSON.parse(strFromU8(files['manifest.json'])) as WorkspaceArchiveManifestV2;

    expect(manifest.kind).toBe('web-migration');
    expect(manifest.assets).toHaveLength(1);
    expect(files[`assets/${manifest.assets[0].id}`]).toEqual(Uint8Array.from([1, 2, 3]));
    expect(JSON.stringify(manifest)).not.toContain('super-secret');
    expect(JSON.stringify(manifest)).not.toContain('pat-secret');
    expect((manifest.modules.canvas as { boxes: Array<{ imageDataUrl: string }> }).boxes[0].imageDataUrl)
      .toBe(`/v1/assets/${manifest.assets[0].id}`);
  });
});
