import { useMemo, useRef, useState, useCallback } from 'react';
import { useEditorStore } from '../../store';
import { usePointerInteraction } from '../../hooks/usePointerInteraction';
import { useI18n } from '../../i18n/context';
import BoundingBox from './BoundingBox';
import ContextMenu from './ContextMenu';
import type { ContextMenuItem } from './ContextMenu';
import ChatPanel from '../chat/ChatPanel';

const SELECTED_BOUNDS_PADDING = 10;

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
  const selectedBoxIds = useEditorStore(s => s.selectedBoxIds);
  const generatedImageUrl = useEditorStore(s => s.generatedImageUrl);
  const canvasBackgroundUrl = useEditorStore(s => s.canvasBackgroundUrl);
  const setCanvasBackgroundUrl = useEditorStore(s => s.setCanvasBackgroundUrl);
  const setCanvasDimensions = useEditorStore(s => s.setCanvasDimensions);
  const setCanvasRatio = useEditorStore(s => s.setCanvasRatio);

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
    marqueeGhost,
    dragPreviewOffset,
    interactionMode,
    altPressed,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
  } = usePointerInteraction({ canvasRef, zoom, panX, panY, screenToCanvas });

  const selectedBounds = useMemo(() => {
    const selectedBoxes = boxes.filter(box => selectedBoxIds.includes(box.id));
    if (selectedBoxes.length <= 1) return null;
    const previewOffset = dragPreviewOffset && selectedBoxIds.every(id => dragPreviewOffset.boxIds.includes(id))
      ? dragPreviewOffset
      : null;
    const offsetX = previewOffset?.dx ?? 0;
    const offsetY = previewOffset?.dy ?? 0;
    const left = Math.min(...selectedBoxes.map(box => box.x + offsetX));
    const top = Math.min(...selectedBoxes.map(box => box.y + offsetY));
    const right = Math.max(...selectedBoxes.map(box => box.x + box.w + offsetX));
    const bottom = Math.max(...selectedBoxes.map(box => box.y + box.h + offsetY));
    const paddedLeft = Math.max(0, left - SELECTED_BOUNDS_PADDING);
    const paddedTop = Math.max(0, top - SELECTED_BOUNDS_PADDING);
    const paddedRight = Math.min(canvasW, right + SELECTED_BOUNDS_PADDING);
    const paddedBottom = Math.min(canvasH, bottom + SELECTED_BOUNDS_PADDING);

    return {
      x: paddedLeft,
      y: paddedTop,
      w: paddedRight - paddedLeft,
      h: paddedBottom - paddedTop,
    };
  }, [boxes, canvasH, canvasW, dragPreviewOffset, selectedBoxIds]);

  // ─── 右键菜单状态 ────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: (ContextMenuItem | 'divider')[];
  } | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // ─── 框右键菜单 ──────────────────────────────────────────────
  const handleBoxContextMenu = useCallback((e: React.MouseEvent, boxId: string) => {
    const isContextOnSelectedGroup = selectedBoxIds.length > 1 && selectedBoxIds.includes(boxId);
    const actionBoxIds = isContextOnSelectedGroup ? selectedBoxIds : [boxId];
    if (!isContextOnSelectedGroup) {
      selectBox(boxId);
    }
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: t('contextMenu.duplicate'), shortcut: 'Ctrl+D', onClick: () => duplicateBox(actionBoxIds) },
        { label: t('contextMenu.cut'), shortcut: 'Ctrl+X', onClick: () => cutBox(actionBoxIds) },
        { label: t('contextMenu.copy'), shortcut: 'Ctrl+C', onClick: () => copyBox(actionBoxIds) },
        { label: t('contextMenu.delete'), shortcut: 'Del', danger: true, onClick: () => removeBox(actionBoxIds) },
        'divider',
        { label: t('contextMenu.bringToFront'), onClick: () => bringToFront(actionBoxIds) },
        { label: t('contextMenu.sendToBack'), onClick: () => sendToBack(actionBoxIds) },
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
  }, [selectedBoxIds, selectBox, duplicateBox, cutBox, copyBox, removeBox, bringToFront, sendToBack, importImageToBox, clearBoxImage, openChat, t]);

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
        if (!dataUrl) return;
        // 先读取图片尺寸，再同步设置画布大小和背景图
        const img = new Image();
        img.onload = () => {
          const clampDim = (n: number) => Math.max(256, Math.min(4096, Math.round(n / 16) * 16));
          setCanvasDimensions(clampDim(img.naturalWidth), clampDim(img.naturalHeight));
          setCanvasRatio('custom');
          setCanvasBackgroundUrl(dataUrl);
        };
        img.onerror = () => setCanvasBackgroundUrl(dataUrl);
        img.src = dataUrl;
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
      className={`canvas-bg${altPressed ? ' alt-create-mode' : ''}`}
      style={{
        width: canvasW,
        height: canvasH,
        position: 'relative',
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
            isSelected={selectedBoxIds.includes(box.id)}
            boxRef={registerBoxRef(box.id)}
            interactionMode={interactionMode}
            onContextMenu={handleBoxContextMenu}
          />
        ))}

        {/* 交互层容器（overflow: hidden 裁切拖拽/框选时的溢出元素） */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
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
          {marqueeGhost && (
            <div
              className="marquee-selection"
              style={{
                left: marqueeGhost.x,
                top: marqueeGhost.y,
                width: marqueeGhost.w,
                height: marqueeGhost.h,
              }}
            >
              <svg
                className="marquee-ants"
                viewBox={`0 0 ${marqueeGhost.w} ${marqueeGhost.h}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <rect
                  className="marquee-ants-path"
                  x="1"
                  y="1"
                  width={Math.max(0, marqueeGhost.w - 2)}
                  height={Math.max(0, marqueeGhost.h - 2)}
                  rx="2"
                  ry="2"
                />
              </svg>
            </div>
          )}
          {selectedBounds && !marqueeGhost && (
            <div
              className="marquee-selection selected-bounds-marquee"
              style={{
                left: selectedBounds.x,
                top: selectedBounds.y,
                width: selectedBounds.w,
                height: selectedBounds.h,
              }}
            >
              <svg
                className="marquee-ants"
                viewBox={`0 0 ${selectedBounds.w} ${selectedBounds.h}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <rect
                  className="marquee-ants-path"
                  x="1"
                  y="1"
                  width={Math.max(0, selectedBounds.w - 2)}
                  height={Math.max(0, selectedBounds.h - 2)}
                  rx="2"
                  ry="2"
                />
              </svg>
            </div>
          )}
        </div>
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
