import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '../SettingsPage';
import { I18nProvider } from '../../../i18n/context';
import { useEditorStore } from '../../../store';

vi.mock('../../llm/LlmConfigPanel', () => ({
  default: () => <div>LLM panel</div>,
}));

vi.mock('../../chat/PresetManagerPanel', () => ({
  default: () => <div>Preset panel</div>,
}));

describe('SettingsPage Workspace 区域', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ideogram4-lang', 'en');
    useEditorStore.setState({
      canvasFavorites: [],
      workspaceBackupSettings: {
        schemaVersion: 1,
        githubToken: '',
        gistId: null,
        lastBackupAt: null,
        lastRestoreAt: null,
      },
    } as Partial<ReturnType<typeof useEditorStore.getState>>);
  });

  it('应展示 Workspace Backup 区域，并在缺少 token 时禁用备份和恢复', () => {
    render(<I18nProvider><SettingsPage /></I18nProvider>);

    expect(screen.getByRole('heading', { name: 'Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back Up Now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restore From Gist' })).toBeDisabled();
    expect(screen.getByText(/Private Gist is not end-to-end encrypted/)).toBeInTheDocument();
  });
});
