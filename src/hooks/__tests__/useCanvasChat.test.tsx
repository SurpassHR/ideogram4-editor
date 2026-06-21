import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCanvasChat } from '../useCanvasChat';
import { useEditorStore } from '../../store';
import { getLlmProviders } from '../../components/llm/api';
import { sendChatMessageWithOptions } from '../../services/llm-stream';
import type { ChatMessage } from '../../types/chat';

vi.mock('../../components/llm/api', () => ({
  getLlmProviders: vi.fn(),
}));

vi.mock('../../services/llm-stream', () => ({
  sendChatMessageWithOptions: vi.fn(),
}));

function makeCanvasSession(id: string, messages: ChatMessage[] = []) {
  return {
    id,
    title: '新会话',
    createdAt: 1000,
    updatedAt: 1000,
    messages,
    pendingIdeogramOutput: null,
    pendingQualityReport: null,
    requestLogs: [],
  };
}

describe('useCanvasChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLlmProviders).mockResolvedValue([
      {
        id: 'mock',
        name: 'Mock',
        kind: 'openai',
        api_key: 'sk-mock',
        base_url: 'https://api.openai.com/v1',
        models: ['gpt-4'],
      },
    ]);
    useEditorStore.setState({
      boxes: [],
      canvasW: 1024,
      canvasH: 1024,
      canvasRatio: '1:1',
      canvasScale: 4,
      canvasCustomW: 16,
      canvasCustomH: 9,
      globalPalette: [],
      highLevelDescription: '',
      aesthetics: '',
      lighting: '',
      medium: '',
      artStyle: '',
      background: '',
      canvasChatMessages: [],
      canvasChatSessions: [makeCanvasSession('session_1')],
      activeCanvasChatSessionId: 'session_1',
      activeCanvasChatRequestId: null,
      pendingIdeogramOutput: null,
      pendingQualityReport: null,
      isCanvasChatLoading: false,
      chatModel: 'mock:gpt-4',
      chatResponseLang: 'auto',
    });
  });

  it('JSON 解析失败时只请求一次并写入 parse_failed 请求日志', async () => {
    vi.mocked(sendChatMessageWithOptions).mockImplementation(
      async (_provider, _model, _messages, _systemPrompt, callbacks) => {
        callbacks.onDone('This response does not contain a JSON code block.');
      },
    );

    const { result } = renderHook(() => useCanvasChat());

    await waitFor(() => {
      expect(result.current.hasProviders).toBe(true);
    });

    await act(async () => {
      await result.current.sendMessage('生成一张咖啡海报');
    });

    expect(sendChatMessageWithOptions).toHaveBeenCalledTimes(1);

    const state = useEditorStore.getState();
    expect(state.isCanvasChatLoading).toBe(false);
    expect(state.canvasChatSessions[0].requestLogs).toHaveLength(1);
    expect(state.canvasChatSessions[0].requestLogs[0].status).toBe('error');
    expect(state.canvasChatSessions[0].requestLogs[0].steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'parse_failed', status: 'error' }),
      ]),
    );
    expect(state.canvasChatSessions[0].requestLogs[0].detail).toMatchObject({
      metadata: {
        providerId: 'mock',
        providerName: 'Mock',
        modelName: 'gpt-4',
        responseLang: 'auto',
        streamEnabled: true,
        thinkingLevel: 'medium',
        targetSize: 1024,
        canvasSize: { width: 1024, height: 1024 },
        boxCount: 0,
      },
      responseText: 'This response does not contain a JSON code block.',
      parseError: expect.stringContaining('No ```json code block was found'),
    });
    const detail = state.canvasChatSessions[0].requestLogs[0].detail;
    expect(detail?.systemPrompt).toContain('Ideogram');
    expect(detail?.messages).toBeDefined();
    expect(detail!.messages!.at(-1)?.content).toContain('Target output canvas: 1024 x 1024');
  });

  it('JSON 代码块结构错误时应记录原始返回、提取片段和具体解析错误', async () => {
    const badJsonResponse = `\`\`\`json
{
  "high_level_description": "bad poster",
  "style_description": {
    "aesthetics": "clean",
    "lighting": "soft",
    "medium": "digital art",
    "art_style": "flat",
    "color_palette": []
  },
  "compositional_deconstruction": {
    "background": "studio",
    "elements": [
      {
        "type": "obj",
        "bbox": [100, 100],
        "desc": "broken subject",
        "color_palette": []
      }
    ]
  }
}
\`\`\``;
    vi.mocked(sendChatMessageWithOptions).mockImplementation(
      async (_provider, _model, _messages, _systemPrompt, callbacks) => {
        callbacks.onDone(badJsonResponse);
      },
    );

    const { result } = renderHook(() => useCanvasChat());

    await waitFor(() => {
      expect(result.current.hasProviders).toBe(true);
    });

    await act(async () => {
      await result.current.sendMessage('生成一张错误结构海报');
    });

    const detail = useEditorStore.getState().canvasChatSessions[0].requestLogs[0].detail;
    expect(detail?.responseText).toBe(badJsonResponse);
    expect(detail?.parsedJsonText).toContain('"bbox": [100, 100]');
    expect(detail?.parseError).toContain('elements[0].bbox must be an array of 4 numbers');
  });

  it('发送请求时应把 Canvas Chat 目标尺寸写入提示词', async () => {
    vi.mocked(sendChatMessageWithOptions).mockImplementation(
      async (_provider, _model, _messages, _systemPrompt, callbacks) => {
        callbacks.onDone(`\`\`\`json
{
  "high_level_description": "4K poster",
  "canvasW": 4096,
  "canvasH": 4096,
  "style_description": {
    "aesthetics": "clean",
    "lighting": "soft",
    "medium": "digital art",
    "art_style": "flat",
    "color_palette": []
  },
  "compositional_deconstruction": {
    "background": "studio",
    "elements": [
      {
        "type": "obj",
        "bbox": [100, 100, 600, 600],
        "desc": "large centered subject",
        "color_palette": []
      }
    ]
  }
}
\`\`\``);
      },
    );
    useEditorStore.setState({
      canvasChatTargetSize: 4096,
    } as Partial<ReturnType<typeof useEditorStore.getState>>);

    const { result } = renderHook(() => useCanvasChat());

    await waitFor(() => {
      expect(result.current.hasProviders).toBe(true);
    });

    await act(async () => {
      await result.current.sendMessage('生成一张 4K 海报');
    });

    const [, , apiMessages, systemPrompt] = vi.mocked(sendChatMessageWithOptions).mock.calls[0];
    const lastUserMessage = apiMessages[apiMessages.length - 1];
    expect(systemPrompt).toContain('target output canvas');
    expect(lastUserMessage.content).toContain('Target output canvas: 4096 x 4096');
    expect(lastUserMessage.content).toContain('"canvasW": 1024');
    expect(lastUserMessage.content).toContain('"canvasH": 1024');

    const detail = useEditorStore.getState().canvasChatSessions[0].requestLogs[0].detail;
    expect(detail?.metadata).toMatchObject({
      providerId: 'mock',
      modelName: 'gpt-4',
      targetSize: 4096,
      canvasSize: { width: 1024, height: 1024 },
    });
    expect(detail?.messages).toBeDefined();
    expect(detail!.messages!.at(-1)?.content).toContain('Target output canvas: 4096 x 4096');
    expect(detail?.responseText).toContain('"canvasW": 4096');
    expect(detail?.parsedJsonText).toContain('"canvasH": 4096');
  });

  it('应用带 canvasW/canvasH 的 Canvas Chat 输出时应同步比例下拉状态', () => {
    useEditorStore.setState({
      pendingIdeogramOutput: {
        high_level_description: '横版海报',
        canvasW: 1024,
        canvasH: 768,
        style_description: {
          aesthetics: 'clean',
          lighting: 'soft',
          medium: 'digital art',
          art_style: 'flat',
          color_palette: [],
        },
        compositional_deconstruction: {
          background: 'studio',
          elements: [
            {
              type: 'obj',
              bbox: [100, 100, 500, 700],
              desc: '主视觉对象',
              color_palette: [],
            },
          ],
        },
      },
    });

    const { result } = renderHook(() => useCanvasChat());

    act(() => {
      expect(result.current.applyOutput()).toBe(1);
    });

    const state = useEditorStore.getState();
    expect(state.canvasW).toBe(1024);
    expect(state.canvasH).toBe(768);
    expect(state.canvasRatio).toBe('4:3');
  });
});
