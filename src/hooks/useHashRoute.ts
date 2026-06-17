import { useState, useEffect, useCallback } from 'react';

/**
 * 简易 Hash 路由 Hook
 * 监听 window.location.hash 变化，返回当前 hash 和 navigate 函数
 */
export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');

  useEffect(() => {
    const handler = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = useCallback((path: string) => {
    window.location.hash = path;
  }, []);

  return { hash, navigate };
}