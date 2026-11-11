import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './i18n/context';
import App from './components/layout/App';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import { bootstrapDesktop, flushDesktopWrites, isDesktopRuntime } from './services/desktop-api';
import { useEditorStore } from './store';

window.addEventListener('pagehide', () => { void flushDesktopWrites(); });

async function start() {
  const root = document.getElementById('root')!;
  if (isDesktopRuntime()) {
    root.textContent = 'Loading Ideogram4 Editor…';
    try {
      useEditorStore.getState().hydrateDesktop(await bootstrapDesktop());
    } catch (error) {
      root.innerHTML = '';
      const panel = document.createElement('div');
      panel.className = 'desktop-fatal-error';
      panel.innerHTML = '<h1>Ideogram4 Editor could not start</h1><p></p><div class="desktop-fatal-actions"><button type="button" data-action="restart">Restart</button><button type="button" data-action="data">Open Data Folder</button></div>';
      panel.querySelector('p')!.textContent = error instanceof Error ? error.message : String(error);
      panel.querySelector('[data-action="restart"]')!.addEventListener('click', () => window.location.reload());
      panel.querySelector('[data-action="data"]')!.addEventListener('click', () => void window.desktop?.openDataDir?.());
      root.append(panel);
      return;
    }
    root.innerHTML = '';
  }

  createRoot(root).render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
}

void start();
