import { useEditorStore } from '../../store';

interface ChatBubbleButtonProps {
  boxId: string;
  interactionMode: 'idle' | 'drawing' | 'dragging' | 'resizing';
}

export default function ChatBubbleButton({ boxId, interactionMode }: ChatBubbleButtonProps) {
  const openChat = useEditorStore(s => s.openChat);

  if (interactionMode !== 'idle') return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    openChat(boxId);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <button
      className="chat-bubble-btn"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      title="✨ AI Chat"
    >
      ✨
    </button>
  );
}
