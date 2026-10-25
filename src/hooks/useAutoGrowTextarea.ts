import { useCallback, useEffect, useRef } from 'react';

/**
 * 让 textarea 随内容自动增高，超过 maxHeight 后停止增高并转为内部滚动。
 *
 * 返回 ref 回调，可以同时绑定多个 textarea（Canvas Chat 普通面板 +
 * 最大化工作台是两个独立挂载的输入框）。已卸载的节点会在下次更新时清理。
 */
export function useAutoGrowTextarea(value: string, maxHeight = 160) {
  const nodes = useRef(new Set<HTMLTextAreaElement>());

  const resize = useCallback((el: HTMLTextAreaElement) => {
    if (!el.value) {
      el.style.height = '28px';
      el.style.overflowY = 'hidden';
      return;
    }
    el.style.height = 'auto';
    const next = Math.max(28, Math.min(el.scrollHeight, maxHeight));
    el.style.height = next + 'px';
    // 内容超出上限后允许内部滚动，避免把面板顶出屏幕
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [maxHeight]);

  const register = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    nodes.current.add(el);
    resize(el);
  }, [resize]);

  useEffect(() => {
    for (const el of [...nodes.current]) {
      if (!el.isConnected) {
        nodes.current.delete(el);
        continue;
      }
      resize(el);
    }
  }, [value, resize]);

  return register;
}

