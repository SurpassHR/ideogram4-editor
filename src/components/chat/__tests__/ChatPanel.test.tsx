import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatPanel from '../ChatPanel';
import { I18nProvider } from '../../../i18n/context';
import { useEditorStore } from '../../../store';
import { useChatPanel } from '../../../hooks/useChatPanel';

vi.mock('../../../hooks/useChatPanel', () => ({
  useChatPanel: vi.fn(),
}));

function mockChatPanel() {
  vi.mocked(useChatPanel).mockReturnValue({
    isChatOpen: true,
    activeChatBoxId: 'box_0',
    currentBox: {
      id: 'box_0',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      mode: 'obj',
      text: '',
      desc: 'Box',
      colors: [],
      imageDataUrl: null,
      imageRole: 'both',
    },
    messages: [],
    providers: [],
    modelOptions: [{ value: 'mock:gpt-4', label: 'Mock · gpt-4', provider: {} }],
    chatModel: 'mock:gpt-4',
    isLoading: false,
    error: null,
    sendMessage: vi.fn(),
    adoptResponse: vi.fn(),
    dismissResponse: vi.fn(),
    handleClearHistory: vi.fn(),
    handleClose: vi.fn(),
    handleSelectModel: vi.fn(),
    refreshProviders: vi.fn(),
    chatPresets: [],
    addPreset: vi.fn(),
    updatePreset: vi.fn(),
    deletePreset: vi.fn(),
    selectedPresetId: null,
    selectedPreset: null,
    handleSelectPreset: vi.fn(),
    chatResponseLang: 'auto',
    setChatResponseLang: vi.fn(),
  } as unknown as ReturnType<typeof useChatPanel>);
}

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('ideogram4-lang', 'en');
    useEditorStore.setState({
      chatStreamEnabled: true,
      chatThinkingLevel: 'medium',
    });
    mockChatPanel();
  });

  it('工具条应显示 Stream 开关和 Think 四档滑块，并写入共享设置', () => {
    render(<I18nProvider><ChatPanel /></I18nProvider>);

    const streamToggle = screen.getByLabelText('Stream output') as HTMLInputElement;
    expect(streamToggle.checked).toBe(true);
    fireEvent.click(streamToggle);
    expect(useEditorStore.getState().chatStreamEnabled).toBe(false);

    const thinkingSlider = screen.getByLabelText('Thinking strength') as HTMLInputElement;
    expect(thinkingSlider.value).toBe('2');
    fireEvent.change(thinkingSlider, { target: { value: '0' } });
    expect(useEditorStore.getState().chatThinkingLevel).toBe('off');
  });
});
