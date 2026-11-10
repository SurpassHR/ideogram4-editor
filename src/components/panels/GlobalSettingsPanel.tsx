import { useEditorStore } from '../../store';
import Flux3GlobalSettingsPanel from './Flux3GlobalSettingsPanel';
import IdeogramGlobalSettingsPanel from './IdeogramGlobalSettingsPanel';
import MossGlobalSettingsPanel from './MossGlobalSettingsPanel';

export default function GlobalSettingsPanel() {
  const activeJsonScheme = useEditorStore(s => s.activeJsonScheme);

  switch (activeJsonScheme) {
    case 'flux3-layout':
      return <Flux3GlobalSettingsPanel />;
    case 'moss-layout':
      return <MossGlobalSettingsPanel />;
    case 'ideogram4':
    default:
      return <IdeogramGlobalSettingsPanel />;
  }
}
