import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './i18n/context';
import App from './components/layout/App';
import './index.css';
import { bootstrapDesktop, isDesktopRuntime } from './services/desktop-api';
import { useEditorStore } from './store';

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
      panel.innerHTML = '<h1>Ideogram4 Editor could not start</h1><p></p><button type="button">Restart</button>';
      panel.querySelector('p')!.textContent = error instanceof Error ? error.message : String(error);
      panel.querySelector('button')!.addEventListener('click', () => window.location.reload());
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
