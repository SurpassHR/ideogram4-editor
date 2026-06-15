import { useRef } from 'react';
import { useEditorStore } from '../../store';
import { usePointerInteraction } from '../../hooks/usePointerInteraction';
import BoundingBox from './BoundingBox';

export default function CanvasArea() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const scale = useEditorStore(s => s.scale);
  const boxes = useEditorStore(s => s.boxes);
  const selectedBoxId = useEditorStore(s => s.selectedBoxId);
  const generatedImageUrl = useEditorStore(s => s.generatedImageUrl);

  const {
    registerBoxRef,
    drawingGhost,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
  } = usePointerInteraction({ canvasRef, scale });

  return (
    <div style={{ width: canvasW * scale, overflow: 'hidden' }}>
      <div
        ref={canvasRef}
        id="canvas-wrapper"
        className="canvas-bg"
        style={{
          width: canvasW,
          height: canvasH,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
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
    </div>
  );
}