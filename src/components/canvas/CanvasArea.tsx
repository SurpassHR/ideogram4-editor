import { useRef, useState } from 'react';
import { useEditorStore } from '../../store';
import { usePointerInteraction } from '../../hooks/usePointerInteraction';
import BoundingBox from './BoundingBox';

interface CanvasAreaProps {
  zoom: number;
  panX: number;
  panY: number;
  screenToCanvas: (sx: number, sy: number) => { x: number; y: number };
}

export default function CanvasArea({ zoom, panX, panY, screenToCanvas }: CanvasAreaProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const boxes = useEditorStore(s => s.boxes);
  const selectedBoxId = useEditorStore(s => s.selectedBoxId);
  const generatedImageUrl = useEditorStore(s => s.generatedImageUrl);

  const {
    registerBoxRef,
    drawingGhost,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
  } = usePointerInteraction({ canvasRef, zoom, panX, panY, screenToCanvas });

  return (
    <div
      ref={canvasRef}
      id="canvas-wrapper"
      className="canvas-bg"
      style={{
        width: canvasW,
        height: canvasH,
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
        touchAction: 'none',
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
    >
      <div id="canvas-inner" style={{ position: 'absolute', inset: 0 }}>
        {generatedImageUrl && (
          <img
            src={generatedImageUrl}
            alt="Generated"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              pointerEvents: 'none',
            }}
          />
        )}
        {boxes.map(box => (
          <BoundingBox
            key={box.id}
            box={box}
            isSelected={box.id === selectedBoxId}
            boxRef={registerBoxRef(box.id)}
          />
        ))}
        {drawingGhost && (
          <div
            className="bounding-box"
            style={{
              left: drawingGhost.x,
              top: drawingGhost.y,
              width: drawingGhost.w,
              height: drawingGhost.h,
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
        )}
      </div>
    </div>
  );
}