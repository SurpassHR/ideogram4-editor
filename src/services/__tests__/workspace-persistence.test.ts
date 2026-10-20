import { beforeEach, describe, expect, it } from 'vitest';
import {
  CANVAS_CHAT_STORAGE_KEY,
  CANVAS_DOCUMENT_STORAGE_KEY,
  CANVAS_FAVORITES_STORAGE_KEY,
  loadCanvasChatState,
  loadCanvasDocument,
  loadCanvasFavorites,
  saveCanvasChatState,
  saveCanvasDocument,
  saveCanvasFavorites,
} from '../workspace-persistence';
import type { CanvasFavorite, PersistedCanvasChatStateV1, PersistedCanvasDocumentV1 } from '../../types/workspace';

describe('workspace-persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('应安全保存并加载 Canvas Chat 会话状态', () => {
    const persisted: PersistedCanvasChatStateV1 = {
      schemaVersion: 1,
      activeSessionId: 'session_1',
      savedAt: 1000,
      sessions: [
        {
          id: 'session_1',
          title: '构图会话',
          createdAt: 1000,
          updatedAt: 1000,
          messages: [{ id: 'msg_1', role: 'user', content: '海报', timestamp: 1000 }],
          pendingIdeogramOutput: null,
          pendingQualityReport: null,
          requestLogs: [],
        },
      ],
    };

    expect(saveCanvasChatState(persisted).ok).toBe(true);
    expect(loadCanvasChatState()).toMatchObject({
      activeSessionId: 'session_1',
      sessions: [{ title: '构图会话', messages: [{ content: '海报' }] }],
    });
  });

  it('损坏的 Canvas Chat JSON 应回退为 null', () => {
    localStorage.setItem(CANVAS_CHAT_STORAGE_KEY, '{bad json');

    expect(loadCanvasChatState()).toBeNull();
  });

  it('恢复页面刷新前 running 的请求日志时应标记为 error', () => {
    localStorage.setItem(CANVAS_CHAT_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      activeSessionId: 'session_1',
      savedAt: 1234,
      sessions: [
        {
          id: 'session_1',
          title: '刷新前会话',
          createdAt: 1000,
          updatedAt: 1000,
          messages: [],
          pendingIdeogramOutput: null,
          pendingQualityReport: null,
          requestLogs: [
            {
              id: 'request_1',
              sessionId: 'session_1',
              promptPreview: '生成海报',
              status: 'running',
              startedAt: 1000,
              steps: [],
            },
          ],
        },
      ],
    }));

    const state = loadCanvasChatState();

    expect(state?.sessions[0].requestLogs[0].status).toBe('error');
    expect(state?.sessions[0].requestLogs[0].steps.at(-1)?.detail).toContain('页面刷新前中断');
  });

  it('应加载 Canvas Chat 请求日志详情并过滤异常字段', () => {
    localStorage.setItem(CANVAS_CHAT_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      activeSessionId: 'session_1',
      savedAt: 1234,
      sessions: [
        {
          id: 'session_1',
          title: '调试会话',
          createdAt: 1000,
          updatedAt: 1000,
          messages: [],
          pendingIdeogramOutput: null,
          pendingQualityReport: null,
          requestLogs: [
            {
              id: 'request_1',
              sessionId: 'session_1',
              promptPreview: '生成海报',
              status: 'error',
              startedAt: 1000,
              steps: [],
              detail: {
                metadata: {
                  providerId: 'mock',
                  providerName: 'Mock',
                  modelName: 'gpt-4',
                  responseLang: 'auto',
                  streamEnabled: true,
                  thinkingLevel: 'medium',
                  targetSize: 2048,
                  canvasSize: { width: 1024, height: 1024 },
                  boxCount: 2,
                },
                systemPrompt: 'SYSTEM',
                messages: [
                  { role: 'user', content: '完整请求' },
                  { role: 'assistant', content: 123 },
                ],
                responseText: 'raw response',
                parsedJsonText: '{"ok":true}',
                parseError: 'bad bbox',
              },
            },
          ],
        },
      ],
    }));

    const log = loadCanvasChatState()?.sessions[0].requestLogs[0] as any;

    expect(log.detail.metadata).toMatchObject({
      providerId: 'mock',
      targetSize: 2048,
      canvasSize: { width: 1024, height: 1024 },
    });
    expect(log.detail.messages).toEqual([{ role: 'user', content: '完整请求' }]);
    expect(log.detail.responseText).toBe('raw response');
    expect(log.detail.parseError).toBe('bad bbox');
  });

  it('应保存并加载画布收藏列表', () => {
    const favorites: CanvasFavorite[] = [
      {
        id: 'favorite_1',
        title: 'Landing hero',
        createdAt: 1000,
        updatedAt: 1000,
        snapshot: {
          canvasW: 1024,
          canvasH: 768,
          canvasRatio: '4:3',
          canvasScale: 4,
          canvasCustomW: 16,
          canvasCustomH: 9,
          boxes: [],
          globalPalette: ['#FFFFFF'],
          highLevelDescription: 'Hero',
          aesthetics: 'Clean',
          lighting: 'Soft',
          medium: 'digital art',
          artStyle: 'flat',
          background: 'white',
          photoArtStyleMode: 1,
        },
      },
    ];

    expect(saveCanvasFavorites(favorites).ok).toBe(true);
    expect(localStorage.getItem(CANVAS_FAVORITES_STORAGE_KEY)).not.toBeNull();
    expect(loadCanvasFavorites()).toEqual(favorites);
  });

  describe('当前画布文档', () => {
    const document: PersistedCanvasDocumentV1 = {
      schemaVersion: 1,
      savedAt: 1000,
      canvasW: 1024,
      canvasH: 768,
      canvasRatio: '4:3',
      canvasScale: 8,
      canvasCustomW: 16,
      canvasCustomH: 9,
      boxes: [
        {
          id: 'box_0',
          x: 10,
          y: 20,
          w: 300,
          h: 200,
          mode: 'obj',
          text: '',
          desc: '主角',
          colors: ['#FFFFFF'],
          imageDataUrl: 'data:image/png;base64,AAAA',
          imageRole: 'both',
        },
      ],
      globalPalette: ['#FF0000'],
      highLevelDescription: '海报',
      aesthetics: 'clean',
      lighting: 'soft',
      medium: 'photo',
      artStyle: 'flat',
      background: 'white',
      photoArtStyleMode: 1,
      canvasBackgroundUrl: 'data:image/png;base64,BBBB',
    };

    it('应保存并还原画布结构、比例、倍数与文案', () => {
      expect(saveCanvasDocument(document).ok).toBe(true);

      const loaded = loadCanvasDocument();

      expect(loaded).toMatchObject({
        canvasW: 1024,
        canvasH: 768,
        canvasRatio: '4:3',
        canvasScale: 8,
        highLevelDescription: '海报',
        canvasBackgroundUrl: null,
      });
      expect(loaded?.boxes).toHaveLength(1);
      expect(loaded?.boxes[0]).toMatchObject({
        id: 'box_0',
        desc: '主角',
        imageDataUrl: null,
      });
    });

    it('图像 Data URL 不应写入 localStorage（改为 IndexedDB 存放）', () => {
      expect(saveCanvasDocument(document).ok).toBe(true);

      const raw = localStorage.getItem(CANVAS_DOCUMENT_STORAGE_KEY) ?? '';

      expect(raw).not.toContain('data:image');
      expect(raw).not.toContain('base64');
    });

    it('应兼容旧存档中的内联图像（供启动时迁移进 IndexedDB）', () => {
      localStorage.setItem(CANVAS_DOCUMENT_STORAGE_KEY, JSON.stringify(document));

      const loaded = loadCanvasDocument();

      expect(loaded?.boxes[0].imageDataUrl).toBe('data:image/png;base64,AAAA');
      expect(loaded?.canvasBackgroundUrl).toBe('data:image/png;base64,BBBB');
    });

    it('损坏或结构不符的文档应回退为 null', () => {
      localStorage.setItem(CANVAS_DOCUMENT_STORAGE_KEY, '{bad json');
      expect(loadCanvasDocument()).toBeNull();

      localStorage.setItem(CANVAS_DOCUMENT_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, canvasW: 1024 }));
      expect(loadCanvasDocument()).toBeNull();
    });

  });
});
