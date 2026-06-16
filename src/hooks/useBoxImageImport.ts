import { useState, useCallback } from 'react';
import { useEditorStore } from '../store';

/** 检查是否为图像文件类型 */
function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/** 将 File 转换为 Data URL */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Hook: 处理 Box 图像导入
 *
 * 支持三种导入方式：
 * - 拖放（drag & drop）
 * - 文件选择（input[type=file]）
 * - 粘贴（clipboard paste）
 */
export function useBoxImageImport(boxId: string) {
  const importImageToBox = useEditorStore(s => s.importImageToBox);
  const [isDragging, setIsDragging] = useState(false);
  const [fileInputRef] = useState(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    return input;
  });

  /** 处理文件并导入到 box */
  const processFile = useCallback(async (file: File) => {
    if (!isImageFile(file)) return;
    const dataUrl = await fileToDataUrl(file);
    importImageToBox(boxId, dataUrl);
  }, [boxId, importImageToBox]);

  /** 拖放进入 */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  /** 拖放离开 */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  /** 拖放放下 */
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (isImageFile(file)) {
      await processFile(file);
    }
  }, [processFile]);

  /** 文件选择 */
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (isImageFile(file)) {
      await processFile(file);
    }
    // 重置 input 以便再次选择同一文件
    e.target.value = '';
  }, [processFile]);

  /** 粘贴图像 */
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await processFile(file);
        }
        break;
      }
    }
  }, [processFile]);

  /** 触发文件选择对话框 */
  const triggerFileSelect = useCallback(() => {
    fileInputRef.click();
  }, [fileInputRef]);

  return {
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handlePaste,
    handleFileSelect,
    triggerFileSelect,
    isDragging,
  };
}