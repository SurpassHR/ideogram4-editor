import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '../../shared/desktop-contract.ts';

const bridge = ipcRenderer.sendSync('desktop:bridge-sync') as DesktopBridge;

contextBridge.exposeInMainWorld('desktop', {
  ...bridge,
  openDataDir: () => ipcRenderer.invoke('desktop:open-data-dir'),
  openLogs: () => ipcRenderer.invoke('desktop:open-logs'),
});
