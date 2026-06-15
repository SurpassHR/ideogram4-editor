import { useRef, useState, useEffect } from 'react';
import { useEditorStore } from '../../store';
import { usePointerInteraction } from '../../hooks/usePointerInteraction';
import BoundingBox from './BoundingBox';

export default function CanvasArea() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const boxes = useEditorStore(s => s.boxes);
  const selectedBoxId = useEditorStore(s => s.selectedBoxId);
  const generatedImageUrl = useEditorStore(s => s.generatedImageUrl);

  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = wrapperRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const MAX_VISUAL_H = 800;
  const scale = Math.min(
    containerWidth > 0 ? containerWidth / canvasW : 1,
    canvasH > MAX_VISUAL_H ? MAX_VISUAL_H / canvasH : 1,
    1,
  );

  const {
    registerBoxRef,
    drawingGhost,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
  } = usePointerInteraction({ canvasRef, scale });

  return (
    <div ref={wrapperRef} style={{ width: canvasW * scale, overflow: 'hidden' }}>
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