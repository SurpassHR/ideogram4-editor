import HeaderControls from './HeaderControls';
import MainContent from './MainContent';

export default function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <HeaderControls />
      <MainContent />
    </div>
  );
}