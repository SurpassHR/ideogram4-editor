import { useRef, useState, useCallback } from 'react';
import { useEditorStore } from '../../store';
import { usePointerInteraction } from '../../hooks/usePointerInteraction';
import { useI18n } from '../../i18n/context';
import BoundingBox from './BoundingBox';
import ContextMenu from './ContextMenu';
import type { ContextMenuItem } from './ContextMenu';
import ChatPanel from '../chat/ChatPanel';

interface CanvasAreaProps {
  zoom: number;
  panX: number;
  panY: number;
  screenToCanvas: (sx: number, sy: number) => { x: number; y: number };
  onFitToArtboard: () => void;
}

/** 通过文件选择器导入图像，返回 Data URL */
function pickImageFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } else {
        resolve(null);
      }
    };
    // 用户取消选择时也 resolve
    input.oncancel = () => resolve(null);
    // 兼容不支持 oncancel 的浏览器：focus 事件后短时间内无 change 即视为取消
    const cleanup = () => {
      window.removeEventListener('focus', onFocus);
      clearTimeout(timer);
    };
    const onFocus = () => {
      cleanup();
      const t = setTimeout(() => {
        resolve(null);
      }, 30000); // 30s 超时兜底
      input.onchange = async () => {
        clearTimeout(t);
        const file = input.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        } else {
          resolve(null);
        }
      };
    };
    let timer = setTimeout(() => {
      // 如果 100ms 内没有 focus 事件，说明对话框可能被阻止或用户取消了
      // 实际上无法可靠检测取消，这里只是兜底
    }, 500);
    window.addEventListener('focus', onFocus, { once: true });
    input.click();
  });
}

export default function CanvasArea({ zoom, panX, panY, screenToCanvas, onFitToArtboard }: CanvasAreaProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const boxes = useEditorStore(s => s.boxes);
  const selectedBoxId = useEditorStore(s => s.selectedBoxId);
  const generatedImageUrl = useEditorStore(s => s.generatedImageUrl);
  const canvasBackgroundUrl = useEditorStore(s => s.canvasBackgroundUrl);
  const setCanvasBackgroundUrl = useEditorStore(s => s.setCanvasBackgroundUrl);

  // Store actions
  const duplicateBox = useEditorStore(s => s.duplicateBox);
  const cutBox = useEditorStore(s => s.cutBox);
  const copyBox = useEditorStore(s => s.copyBox);
  const pasteBox = useEditorStore(s => s.pasteBox);
  const removeBox = useEditorStore(s => s.removeBox);
  const clearBoxes = useEditorStore(s => s.clearBoxes);
  const bringToFront = useEditorStore(s => s.bringToFront);
  const sendToBack = useEditorStore(s => s.sendToBack);
  const openChat = useEditorStore(s => s.openChat);
  const selectBox = useEditorStore(s => s.selectBox);
  const importImageToBox = useEditorStore(s => s.importImageToBox);
  const clearBoxImage = useEditorStore(s => s.clearBoxImage);

  const { t } = useI18n();

  const {
    registerBoxRef,
    drawingGhost,
    interactionMode,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
  } = usePointerInteraction({ canvasRef, zoom, panX, panY, screenToCanvas });

  // ─── 右键菜单状态 ────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: (ContextMenuItem | 'divider')[];
  } | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // ─── 框右键菜单 ──────────────────────────────────────────────
  const handleBoxContextMenu = useCallback((e: React.MouseEvent, boxId: string) => {
    selectBox(boxId);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: t('contextMenu.duplicate'), shortcut: 'Ctrl+D', onClick: () => duplicateBox(boxId) },
        { label: t('contextMenu.cut'), shortcut: 'Ctrl+X', onClick: () => cutBox(boxId) },
        { label: t('contextMenu.copy'), shortcut: 'Ctrl+C', onClick: () => copyBox(boxId) },
        { label: t('contextMenu.delete'), shortcut: 'Del', danger: true, onClick: () => removeBox(boxId) },
        'divider',
        { label: t('contextMenu.bringToFront'), onClick: () => bringToFront(boxId) },
        { label: t('contextMenu.sendToBack'), onClick: () => sendToBack(boxId) },
        'divider',
        { label: t('contextMenu.importReferenceImage'), onClick: async () => {
          const dataUrl = await pickImageFile();
          if (dataUrl) importImageToBox(boxId, dataUrl);
        }},
        { label: t('contextMenu.clearReferenceImage'), danger: true, onClick: () => clearBoxImage(boxId) },
        'divider',
        { label: t('contextMenu.openAiChat'), onClick: () => openChat(boxId) },
      ],
    });
  }, [selectBox, duplicateBox, cutBox, copyBox, removeBox, bringToFront, sendToBack, importImageToBox, clearBoxImage, openChat, t]);

  // ─── 画布空白右键菜单 ────────────────────────────────────────
  const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    // 仅当点击在画布背景（非 bounding-box）时触发
    const target = e.target as HTMLElement;
    if (target.closest('.bounding-box')) return;

    e.preventDefault();
    const { x: canvasX, y: canvasY } = screenToCanvas(e.clientX, e.clientY);

    const items: (ContextMenuItem | 'divider')[] = [
      { label: t('contextMenu.paste'), shortcut: 'Ctrl+V', onClick: () => pasteBox(canvasX, canvasY) },
      { label: t('contextMenu.importBackgroundImage'), onClick: async () => {
        const dataUrl = await pickImageFile();
        if (dataUrl) setCanvasBackgroundUrl(dataUrl);
      }},
    ];

    if (canvasBackgroundUrl) {
      items.push({ label: t('contextMenu.clearBackgroundImage'), danger: true, onClick: () => setCanvasBackgroundUrl(null) });
    }

    items.push('divider');
    items.push({ label: t('contextMenu.clearAllBoxes'), danger: true, onClick: clearBoxes });
    items.push({ label: t('contextMenu.fitToArtboard'), onClick: onFitToArtboard });

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  }, [screenToCanvas, pasteBox, setCanvasBackgroundUrl, canvasBackgroundUrl, clearBoxes, onFitToArtboard, t]);

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
      onContextMenu={handleCanvasContextMenu}
    >
      <div id="canvas-inner" style={{ position: 'absolute', inset: 0 }}>
        {/* 画布背景参考图（渲染在 boxes 下方） */}
        {canvasBackgroundUrl && (
          <img
            src={canvasBackgroundUrl}
            alt="Canvas background"
            className="canvas-background-img"
            draggable={false}
          />
        )}
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
            interactionMode={interactionMode}
            onContextMenu={handleBoxContextMenu}
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
      <ChatPanel />

      {/* 右键上下文菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}