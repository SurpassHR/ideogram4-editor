import type { DesktopBridge } from '../../shared/desktop-contract';

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export {};
