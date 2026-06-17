import { useHashRoute } from '../../hooks/useHashRoute';
import Header from './HeaderControls';
import CanvasPage, { CanvasBottom } from './MainContent';
import SettingsPage from './SettingsPage';

export default function App() {
  const { hash, navigate } = useHashRoute();
  const isCanvas = hash !== '#/settings';

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 40px)', overflow: 'hidden' }}>
        <Header currentHash={hash} onNavigate={navigate} />
        {isCanvas ? <CanvasPage /> : <SettingsPage />}
      </div>
      {isCanvas && <CanvasBottom />}
    </>
  );
}