import { useState, useCallback, useEffect, useRef } from 'react';
import type { Box } from '../../types';
import type { InteractionMode } from '../../types';
import { useEditorStore } from '../../store';
import ChatBubbleButton from './ChatBubbleButton';

interface BoundingBoxProps {
  box: Box;
  isSelected: boolean;
  boxRef: (el: HTMLDivElement | null) => void;
  interactionMode: InteractionMode;
}

export default function BoundingBox({ box, isSelected, boxRef, interactionMode }: BoundingBoxProps) {
  const editingBoxId = useEditorStore(s => s.editingBoxId);
  const setEditingBoxId = useEditorStore(s => s.setEditingBoxId);
  const updateBox = useEditorStore(s => s.updateBox);
  const isEditing = editingBoxId === box.id;
  const [editText, setEditText] = useState(box.text);
  const inputRef = useRef<HTMLInputElement>(null);

  // 进入编辑模式时，聚焦 input 并初始化文本
  useEffect(() => {
    if (isEditing && inputRef.current) {
      setEditText(box.text);
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing, box.text]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
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
      <div className="bounding-box-content">
        {isEditing ? (
          <div className="bounding-box-input-wrapper">
            <input
              ref={inputRef}
              className="bounding-box-input"
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