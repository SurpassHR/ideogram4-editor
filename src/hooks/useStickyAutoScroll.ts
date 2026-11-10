import { useCallback, useEffect, useRef } from 'react';

interface StickyAutoScrollOptions {
  /** 当前滚动容器是否可见/启用。 */
  active: boolean;
  /** 会话或布局模式变化时强制回到最新消息。 */
  resetKey: string | number;
  /** 新消息数量变化时强制回到最新消息。 */
  messageCount: number;
}

/**
 * 消息列表自动跟随：用户停留在底部时跟随内容增长；上滚后暂停，回到底部后恢复。
 * MutationObserver 可覆盖流式正文、思考内容增长以及 Reasoning details 展开。
 */
export function useStickyAutoScroll({ active, resetKey, messageCount }: StickyAutoScrollOptions) {
  const ref = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const rafRef = useRef<number | null>(null);

  const scrollToBottom = useCallback((force = false) => {
    const el = ref.current;
    if (!el) return;
    if (!force && !stickToBottomRef.current) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!force && !stickToBottomRef.current) return;
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    if (!active) return;
    stickToBottomRef.current = true;
    scrollToBottom(true);
  }, [active, messageCount, resetKey, scrollToBottom]);

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const observer = new MutationObserver(() => scrollToBottom());
    observer.observe(el, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    return () => observer.disconnect();
  }, [active, resetKey, scrollToBottom]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  return { ref, onScroll };
}
