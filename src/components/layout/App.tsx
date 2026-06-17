import { useHashRoute } from '../../hooks/useHashRoute';
import Header from './HeaderControls';
import CanvasPage from './MainContent';
import SettingsPage from './SettingsPage';

export default function App() {
  const { hash, navigate } = useHashRoute();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 40px)' }}>
      <Header currentHash={hash} onNavigate={navigate} />
      {hash === '#/settings' ? <SettingsPage /> : <CanvasPage />}
    </div>
  );
}