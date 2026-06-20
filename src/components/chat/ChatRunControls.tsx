import { useI18n } from '../../i18n/context';
import { useEditorStore } from '../../store';
import type { ChatThinkingLevel } from '../../types/chat';

const THINKING_LEVELS: ChatThinkingLevel[] = ['off', 'low', 'medium', 'high'];

export default function ChatRunControls() {
  const { t } = useI18n();
  const chatStreamEnabled = useEditorStore(s => s.chatStreamEnabled);
  const chatThinkingLevel = useEditorStore(s => s.chatThinkingLevel);
  const setChatStreamEnabled = useEditorStore(s => s.setChatStreamEnabled);
  const setChatThinkingLevel = useEditorStore(s => s.setChatThinkingLevel);
  const thinkingIndex = Math.max(0, THINKING_LEVELS.indexOf(chatThinkingLevel));

  return (
    <div className="chat-run-controls">
      <label className="chat-stream-toggle" title={t('chat.streamHint')}>
        <input
          type="checkbox"
          aria-label={t('chat.streamOutput')}
          checked={chatStreamEnabled}
          onChange={event => setChatStreamEnabled(event.currentTarget.checked)}
        />
        <span className="chat-stream-toggle-track" aria-hidden="true" />
        <span className="chat-run-label">{t('chat.streamShort')}</span>
      </label>

      <label className="chat-thinking-control" title={t('chat.thinkingHint')}>
        <span className="chat-run-label">
          {t('chat.thinkingShort')}: {t(`chat.thinkingLevels.${chatThinkingLevel}`)}
        </span>
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          aria-label={t('chat.thinkingStrength')}
          value={thinkingIndex}
          onChange={event => setChatThinkingLevel(THINKING_LEVELS[Number(event.currentTarget.value)])}
        />
      </label>
    </div>
  );
}
