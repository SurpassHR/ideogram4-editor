import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { IconClose } from '../ui/icons';
import type { Box } from '../../types';
import type { InteractionMode } from '../../types';
import { useEditorStore } from '../../store';
import ChatBubbleButton from './ChatBubbleButton';

interface BoundingBoxProps {
  box: Box;
  isSelected: boolean;
  boxRef: (el: HTMLDivElement | null) => void;
  interactionMode: InteractionMode;
  onContextMenu?: (e: React.MouseEvent, boxId: string) => void;
}

export default function BoundingBox({ box, isSelected, boxRef, interactionMode, onContextMenu }: BoundingBoxProps) {
  const editingBoxId = useEditorStore(s => s.editingBoxId);
  const setEditingBoxId = useEditorStore(s => s.setEditingBoxId);
  const updateBox = useEditorStore(s => s.updateBox);
  const clearBoxImage = useEditorStore(s => s.clearBoxImage);
  const canvasW = useEditorStore(s => s.canvasW);
  const canvasH = useEditorStore(s => s.canvasH);
  const isEditing = editingBoxId === box.id;
  const [editText, setEditText] = useState(box.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 进入编辑模式时，聚焦 textarea 并初始化文本
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      setEditText(box.text);
      const ta = textareaRef.current;
      ta.focus();
      ta.select();
    }
  }, [isEditing, box.text]);

  // 自动调整 textarea 高度
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta && isEditing) {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    }
  }, [editText, isEditing]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      updateBox(box.id, { text: editText });
      setEditingBoxId(null);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingBoxId(null);
    }
  }, [box.id, editText, updateBox, setEditingBoxId]);

  const handleInputBlur = useCallback(() => {
    updateBox(box.id, { text: editText });
    setEditingBoxId(null);
  }, [box.id, editText, updateBox, setEditingBoxId]);

  const displayText = box.text || box.desc || '';

  const handleDismissImage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    clearBoxImage(box.id);
  }, [box.id, clearBoxImage]);

  // 计算 clip-path：将实线边框裁切到画布边界内
  const clipStyle = useMemo(() => {
    const clipTop = Math.max(0, -box.y);
    const clipLeft = Math.max(0, -box.x);
    const clipBottom = Math.max(0, (box.y + box.h) - canvasH);
    const clipRight = Math.max(0, (box.x + box.w) - canvasW);
    return { clipPath: `inset(${clipTop}px ${clipRight}px ${clipBottom}px ${clipLeft}px)` };
  }, [box.x, box.y, box.w, box.h, canvasW, canvasH]);

  // 判断 box 是否完全在画布内/外，控制虚线/实线层的显隐
  const isFullyInside = useMemo(
    () => box.x >= 0 && box.y >= 0 && box.x + box.w <= canvasW && box.y + box.h <= canvasH,
    [box.x, box.y, box.w, box.h, canvasW, canvasH],
  );
  const isFullyOutside = useMemo(
    () => box.x + box.w <= 0 || box.y + box.h <= 0 || box.x >= canvasW || box.y >= canvasH,
    [box.x, box.y, box.w, box.h, canvasW, canvasH],
  );

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
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e, box.id);
      }}
    >
      {/* 虚线边框层（底层，始终完整显示） */}
      <div
        className="bounding-box-dashed"
        style={{ opacity: isFullyInside ? 0 : 1 }}
      />

      {/* 实线边框+背景填充层（clip-path 裁切到画布边界内） */}
      <div
        className="bounding-box-solid"
        style={{
          ...clipStyle,
          opacity: isFullyOutside ? 0 : 1,
        }}
      />

      {box.imageDataUrl && (
        <img
          className="bounding-box-bg-img"
          src={box.imageDataUrl}
          alt="reference"
          draggable={false}
        />
      )}
      {box.imageDataUrl && (
        <button
          className="bounding-box-img-dismiss"
          onClick={handleDismissImage}
          title="Remove image"
        >
          <IconClose size={10} />
        </button>
      )}
      <div className="bounding-box-content">
        {isEditing ? (
          <div className="bounding-box-input-wrapper">
            <textarea
              ref={textareaRef}
              className="bounding-box-input"
              rows={1}
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={handleInputBlur}
              onPointerDown={e => e.stopPropagation()}
            />
            {isSelected && (
              <ChatBubbleButton boxId={box.id} interactionMode={interactionMode} />
            )}
          </div>
        ) : (
          <span className="bounding-box-label">{displayText}</span>
        )}
      </div>
      {isSelected && !isEditing && (
        <ChatBubbleButton boxId={box.id} interactionMode={interactionMode} />
      )}
      <div className="resize-handle" />
    </div>
  );
}