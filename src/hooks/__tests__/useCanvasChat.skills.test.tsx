import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useCanvasChat } from '../useCanvasChat';
import { useEditorStore } from '../../store';
import { getLlmProviders } from '../../components/llm/api';
import { sendChatMessageWithOptions } from '../../services/llm-stream';
import { DEFAULT_SKILL_ID } from '../../types/skill';

vi.mock('../../components/llm/api', () => ({
  getLlmProviders: vi.fn(),
}));

vi.mock('../../services/llm-stream', () => ({
  sendChatMessageWithOptions: vi.fn(),
  abortActiveRequest: vi.fn(),
}));

function setupStore(activeSkillId: string, overrides: Record<string, { enabledReferencePaths?: string[] }> = {}) {
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
    photoArtStyleMode: 0,
    canvasBackgroundUrl: null,
    canvasChatMessages: [],
    canvasChatSessions: [{
      id: 'session_1',
      title: '新会话',
      createdAt: 1,
      updatedAt: 1,
      messages: [],
      pendingIdeogramOutput: null,
      pendingQualityReport: null,
      requestLogs: [],
    }],
    activeCanvasChatSessionId: 'session_1',
    activeCanvasChatRequestId: null,
    pendingIdeogramOutput: null,
    pendingQualityReport: null,
    pendingApply: null,
    isCanvasChatLoading: false,
    chatModel: 'mock:gpt-4',
    chatResponseLang: 'auto',
    importedSkills: [],
    skillPrefs: { activeSkillId, overrides },
  });
}

async function sendOnce(result: { current: ReturnType<typeof useCanvasChat> }, prompt = 'a cat on a mat') {
  await waitFor(() => expect(result.current.hasProviders).toBe(true));
  await act(async () => {
    await result.current.sendMessage(prompt);
  });
  const call = vi.mocked(sendChatMessageWithOptions).mock.calls[0];
  return { systemPrompt: call[3] as string, apiMessages: call[2] };
}

describe('useCanvasChat × skill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLlmProviders).mockResolvedValue([{
      id: 'mock',
      name: 'Mock',
      kind: 'openai',
      api_key: 'sk-mock',
      base_url: 'https://api.openai.com/v1',
      models: ['gpt-4'],
    }]);
    vi.mocked(sendChatMessageWithOptions).mockImplementation(
      async (_provider, _model, _messages, _systemPrompt, callbacks) => {
        callbacks.onDone('not json');
      },
    );
  });

  it('默认 skill 注入 Ideogram4 基础 prompt + SKILL.md + schema 参考', async () => {
    setupStore(DEFAULT_SKILL_ID);
    const { result } = renderHook(() => useCanvasChat());
    const { systemPrompt } = await sendOnce(result);

    expect(systemPrompt).toContain('Ideogram 4 JSON caption generator');
    expect(systemPrompt).toContain('Active skill: Ideogram 4 JSON Caption');
    expect(systemPrompt).toContain('Injected reference: references/schema.md');
  });

  it('关闭 reference 后不再注入 schema.md（SKILL.md 仍注入）', async () => {
    setupStore(DEFAULT_SKILL_ID, { [DEFAULT_SKILL_ID]: { enabledReferencePaths: [] } });
    const { result } = renderHook(() => useCanvasChat());
    const { systemPrompt } = await sendOnce(result);

    expect(systemPrompt).not.toContain('Injected reference: references/schema.md');
    expect(systemPrompt).toContain('Active skill: Ideogram 4 JSON Caption');
    expect(systemPrompt).toContain('Skipped skill references: references/schema.md');
  });

  it('切到 FLUX 3 skill 时使用其契约与上下文格式', async () => {
    setupStore('builtin:flux3-layout');
    const { result } = renderHook(() => useCanvasChat());
    const { systemPrompt, apiMessages } = await sendOnce(result, 'a serum bottle poster');

    expect(systemPrompt).toContain('Active skill: FLUX 3 Klein Layout');
    expect(systemPrompt).toContain('[top, left, bottom, right]');
    const lastUser = apiMessages[apiMessages.length - 1];
    expect(lastUser.content).toContain('"bbox_format": "0-1000 [top, left, bottom, right]"');
  });

  it('MOSS skill 使用像素 xyxy 草稿提示与草稿上下文', async () => {
    setupStore('builtin:moss-layout');
    const { result } = renderHook(() => useCanvasChat());
    const { systemPrompt, apiMessages } = await sendOnce(result, 'a cup poster');

    expect(systemPrompt).toContain('Active skill: MOSS-Image Layout');
    expect(systemPrompt).toMatch(/absolute pixels/i);
    const lastUser = apiMessages[apiMessages.length - 1];
    expect(lastUser.content).toContain('"draft_bbox_convention": "absolute pixels, xyxy, origin top-left"');
  });

  it('把画板比例传给模型（2:3 画板不再被当成 1:1）', async () => {
    setupStore(DEFAULT_SKILL_ID);
    useEditorStore.setState({ canvasW: 512, canvasH: 768, canvasChatTargetSize: 2048 });
    const { result } = renderHook(() => useCanvasChat());
    const { apiMessages } = await sendOnce(result);

    const lastUser = apiMessages[apiMessages.length - 1];
    expect(lastUser.content).toContain('Target output canvas: 1360 x 2048');
    expect(lastUser.content).toContain('aspect ratio 2:3');
    expect(lastUser.content).not.toContain('Target output canvas: 2048 x 2048');
  });

  it('模型返回的画布比例与画板不一致时保留画板并给出警告', async () => {
    setupStore(DEFAULT_SKILL_ID);
    useEditorStore.setState({ canvasW: 512, canvasH: 768, canvasChatTargetSize: 2048 });
    const { result } = renderHook(() => useCanvasChat());
    await waitFor(() => expect(result.current.hasProviders).toBe(true));

    const reply = JSON.stringify({
      high_level_description: 'A square scene',
      canvasW: 2048,
      canvasH: 2048,
      style_description: { aesthetics: 'a', lighting: 'l', medium: 'photograph', photo: 'p', color_palette: [] },
      compositional_deconstruction: {
        background: 'bg',
        elements: [{ type: 'obj', bbox: [100, 100, 900, 900], desc: 'a subject' }],
      },
    });
    const message = {
      id: 'msg_ratio_mismatch',
      role: 'assistant' as const,
      content: '```json\n' + reply + '\n```',
      timestamp: 1,
      skillId: DEFAULT_SKILL_ID,
    };

    const outcomes: Array<ReturnType<typeof result.current.applyMessageOutput>> = [];
    act(() => { outcomes.push(result.current.applyMessageOutput(message)); });

    const outcome = outcomes[0];
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.warnings.join(' ')).toContain('比例');
    // 画板比例保持不变
    expect(useEditorStore.getState().canvasW).toBe(512);
    expect(useEditorStore.getState().canvasH).toBe(768);
    expect(useEditorStore.getState().boxes).toHaveLength(1);
  });
});
