import type { Box } from '../../types';
import type { InteractionMode } from '../../types';
import ChatBubbleButton from './ChatBubbleButton';

interface BoundingBoxProps {
  box: Box;
  isSelected: boolean;
  boxRef: (el: HTMLDivElement | null) => void;
  interactionMode: InteractionMode;
}

export default function BoundingBox({ box, isSelected, boxRef, interactionMode }: BoundingBoxProps) {
  return (
    <div
      id={box.id}
      ref={boxRef}
      className={`bounding-box ${isSelected ? 'selected' : ''}`}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
      }}
    >
      {isSelected && <ChatBubbleButton boxId={box.id} interactionMode={interactionMode} />}
      <div className="resize-handle" />
    </div>
  );
}