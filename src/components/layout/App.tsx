import { useEffect } from 'react';
import { useHashRoute } from '../../hooks/useHashRoute';
import Header from './HeaderControls';
import CanvasPage from './MainContent';
import SettingsPage from './SettingsPage';
import BottomBar from './BottomBar';
import ShortcutsModal from '../shortcuts/ShortcutsModal';
import { useEditorStore } from '../../store';

const SHORTCUTS_SEEN_KEY = 'ideogram4-shortcuts-seen';

export default function App() {
  const { hash, navigate } = useHashRoute();
  const isCanvas = hash !== '#/settings';
  const setShortcutsModalOpen = useEditorStore(s => s.setShortcutsModalOpen);

  // 首次进入应用：自动弹出一次快捷键引导（localStorage 标记，一次性）
  useEffect(() => {
    if (!localStorage.getItem(SHORTCUTS_SEEN_KEY)) {
      setShortcutsModalOpen(true);
      localStorage.setItem(SHORTCUTS_SEEN_KEY, '1');
    }
  }, [setShortcutsModalOpen]);

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: 'calc(100vh - 40px)', overflow: 'hidden' }}>
        <Header currentHash={hash} onNavigate={navigate} />
        {isCanvas ? <CanvasPage /> : <SettingsPage />}
        {isCanvas && <BottomBar />}
      </div>
      <ShortcutsModal />
    </>
  );
}
