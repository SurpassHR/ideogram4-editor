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
  });
});
