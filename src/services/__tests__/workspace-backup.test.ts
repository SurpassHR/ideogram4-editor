import { describe, expect, it } from 'vitest';
import {
  buildCanvasSnapshotLite,
  buildWorkspaceBackupPackage,
  createRestorePreview,
  parseWorkspaceBackupPackage,
} from '../workspace-backup';
import type { Box } from '../../types';

const boxes: Box[] = [
  {
    id: 'box_7',
    x: 10,
    y: 20,
    w: 100,
    h: 80,
    mode: 'obj',
    text: '',
    desc: '产品图',
    colors: ['#FF0000'],
    imageDataUrl: 'data:image/png;base64,abc',
    imageRole: 'both',
  },
];

const storeState = {
  canvasW: 1024,
  canvasH: 768,
  canvasRatio: '4:3',
  canvasScale: 4,
  canvasCustomW: 16,
  canvasCustomH: 9,
  boxes,
  canvasBackgroundUrl: 'data:image/png;base64,bg',
  globalPalette: ['#FFFFFF'],
  highLevelDescription: '品牌海报',
  aesthetics: 'Clean',
  lighting: 'Soft',
  medium: 'digital art',
  artStyle: 'flat',
  background: 'studio',
  photoArtStyleMode: 1 as const,
  canvasChatSessions: [],
  activeCanvasChatSessionId: 'session_1',
  canvasFavorites: [],
};

describe('workspace-backup', () => {
  it('buildCanvasSnapshotLite 应丢弃所有图片 Data URL', () => {
    const snapshot = buildCanvasSnapshotLite(storeState);

    expect(snapshot.boxes[0].imageDataUrl).toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain('data:image');
    expect('canvasBackgroundUrl' in snapshot).toBe(false);
  });

  it('组包应包含所有模块且保留 LLM provider API key', () => {
    const backup = buildWorkspaceBackupPackage(storeState, {
      chatPresets: [],
      llmProviders: [
        {
          id: 'openai',
          name: 'OpenAI',
          kind: 'openai',
          api_key: 'sk-secret',
          base_url: 'https://api.openai.com/v1',
          models: ['gpt-4.1'],
        },
      ],
      uiPreferences: {
        lang: 'zh',
        chatModel: 'openai:gpt-4.1',
        chatResponseLang: 'zh',
        chatStreamEnabled: true,
        chatThinkingLevel: 'medium',
      },
    });

    expect(backup.app).toBe('ideogram4-editor');
    expect(backup.modules.currentCanvas.highLevelDescription).toBe('品牌海报');
    expect(backup.modules.llmProviders[0].api_key).toBe('sk-secret');
    expect(backup.modules.uiPreferences.lang).toBe('zh');
  });

  it('schema 不匹配时 parseWorkspaceBackupPackage 应返回失败结果', () => {
    const result = parseWorkspaceBackupPackage(JSON.stringify({
      app: 'ideogram4-editor',
      schemaVersion: 99,
      exportedAt: Date.now(),
      modules: {},
    }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected parseWorkspaceBackupPackage to fail');
    expect(result.error).toContain('版本');
  });

  it('备份缺少必要模块时 parseWorkspaceBackupPackage 应返回失败结果', () => {
    const result = parseWorkspaceBackupPackage(JSON.stringify({
      app: 'ideogram4-editor',
      schemaVersion: 1,
      exportedAt: Date.now(),
      modules: {
        currentCanvas: { canvasW: 1024, canvasH: 1024, boxes: [] },
      },
    }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected parseWorkspaceBackupPackage to fail');
    expect(result.error).toContain('缺少必要模块');
  });

  it('createRestorePreview 应统计模块并默认不勾选 LLM provider', () => {
    const backup = buildWorkspaceBackupPackage(storeState, {
      chatPresets: [{ id: 'p1', name: 'Preset', description: '', promptTemplate: 'x', tags: [], createdAt: 1, updatedAt: 1 }],
      llmProviders: [{ id: 'openai', name: 'OpenAI', kind: 'openai', api_key: 'sk-secret', base_url: '', models: [] }],
      uiPreferences: {
        lang: 'en',
        chatModel: '',
        chatResponseLang: 'auto',
        chatStreamEnabled: true,
        chatThinkingLevel: 'low',
      },
    });

    const preview = createRestorePreview(backup);

    expect(preview.find(item => item.module === 'currentCanvas')?.summary).toContain('1024 x 768');
    expect(preview.find(item => item.module === 'chatPresets')?.summary).toContain('1');
    expect(preview.find(item => item.module === 'llmProviders')?.defaultSelected).toBe(false);
  });
});
