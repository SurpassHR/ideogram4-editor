import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
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

// ─── 剪贴板粘贴辅助函数 ──────────────────────────────────────────

/** 从 HTML 字符串中提取第一个 <img> 的 src 属性 */
function extractImgSrc(html: string): string | null {
  const d = document.createElement('div');
  d.innerHTML = html;
  const img = d.querySelector('img');
  return img?.getAttribute('src') || null;
}

/** 判断纯文本是否为图片 URL */
function isImageUrl(text: string): boolean {
  try {
    const u = new URL(text.trim());
    return /\.(jpe?g|png|gif|webp|bmp|svg)([?#]|$)/i.test(u.pathname);
  } catch { return false; }
}

/** 从文本中提取图片 URL */
function extractUrlFromText(text: string): string | null {
  const m = text.match(/(https?:\/\/[^\s"'<>]+\.(jpe?g|png|gif|webp|bmp|svg)(\?[^\s"'<>]*)?)/i);
  return m ? m[1] : null;
}

/**
 * 下载远程图片并创建 Blob URL（即时显示，不阻塞主线程）
 * 失败时返回原始 URL 作为 fallback
 */
async function loadRemoteImageAsBlobUrl(url: string): Promise<string> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 15000);
    const r = await fetch(url, { mode: 'cors', signal: c.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    return URL.createObjectURL(blob);
  } catch {
    // fallback: 直接用原始 URL
    return url;
  }
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

  // ─── 画布粘贴（外部图片：document 级原生事件监听） ────────────
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      const wrapper = canvasRef.current;

      if (!wrapper) return;

      // 检查粘贴是否发生在画布区域内（target 可能是 wrapper 的祖先如 BODY）
      const isCanvasArea = wrapper === target || wrapper.contains(target) || (target instanceof Node && target.contains(wrapper));
      if (!isCanvasArea) return;

      // 不拦截输入框/富文本编辑器
      if (
        target.closest('[contenteditable]') ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA'
      ) return;

      const items = Array.from(e.clipboardData?.items || []);
      if (items.length === 0) return;

      e.preventDefault();

      let imageDataUrl: string | null = null;

      // 1. 优先处理直接图片（image/*）→ 用 Blob URL 避免大图 base64 解码卡顿
      const imageItem = items.find(i => i.type.startsWith('image/'));
      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
          imageDataUrl = URL.createObjectURL(file);
        }
      }

      // 2. text/html → 提取 <img src>
      if (!imageDataUrl) {
        const htmlItem = items.find(i => i.type === 'text/html');
        if (htmlItem) {
          const html = await new Promise<string>(resolve => {
            htmlItem.getAsString(resolve);
          });
          const src = extractImgSrc(html);
          if (src) {
            imageDataUrl = await loadRemoteImageAsBlobUrl(src);
          }
        }
      }

      // 3. text/plain → URL / HTML / 提取 URL
      if (!imageDataUrl) {
        const textItem = items.find(i => i.type === 'text/plain');
        if (textItem) {
          const text = await new Promise<string>(resolve => {
            textItem.getAsString(resolve);
          });
          const trimmed = text.trim();

          if (isImageUrl(trimmed)) {
            imageDataUrl = await loadRemoteImageAsBlobUrl(trimmed);
          } else if (/<img[\s>]/i.test(trimmed)) {
            const src = extractImgSrc(trimmed);
            if (src) imageDataUrl = await loadRemoteImageAsBlobUrl(src);
          } else {
            const url = extractUrlFromText(trimmed);
            if (url) imageDataUrl = await loadRemoteImageAsBlobUrl(url);
          }
        }
      }

      if (!imageDataUrl) return;

      const state = useEditorStore.getState();
      const selectedIds = state.selectedBoxIds;

      if (selectedIds.length > 0) {
        // 有选中 box → 设为所有选中 box 的参考图
        for (const boxId of selectedIds) {
          state.importImageToBox(boxId, imageDataUrl);
        }
      } else {
        // 无选中 box → 设为画布背景图，自动匹配画布尺寸
        const img = new Image();
        img.onload = () => {
          const clampDim = (n: number) => Math.max(256, Math.min(4096, Math.round(n / 16) * 16));
          state.setCanvasDimensions(clampDim(img.naturalWidth), clampDim(img.naturalHeight));
          state.setCanvasRatio('custom');
          state.setCanvasBackgroundUrl(imageDataUrl!);
        };
        img.onerror = () => state.setCanvasBackgroundUrl(imageDataUrl);
        img.src = imageDataUrl;
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

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
        backgroundSize: `${Math.round(20 / zoom)}px ${Math.round(20 / zoom)}px`,
        '--box-zoom': zoom,
      } as React.CSSProperties}
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
              className="bounding-box drawing-ghost"
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
