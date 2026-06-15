import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './i18n/context';
import App from './components/layout/App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);