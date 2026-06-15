import type { Box } from '../../types';

interface BoundingBoxProps {
  box: Box;
  isSelected: boolean;
  boxRef: (el: HTMLDivElement | null) => void;
}

export default function BoundingBox({ box, isSelected, boxRef }: BoundingBoxProps) {
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
      <div className="resize-handle" />
    </div>
  );
}