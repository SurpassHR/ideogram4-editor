import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '../SettingsPage';
import { I18nProvider } from '../../../i18n/context';
import { useEditorStore } from '../../../store';

vi.mock('../../llm/LlmConfigPanel', () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div data-embedded={embedded ? 'true' : 'false'}>LLM panel</div>
  ),
}));

vi.mock('../../chat/PresetManagerPanel', () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div data-embedded={embedded ? 'true' : 'false'}>Preset panel</div>
  ),
}));

describe('SettingsPage 配置中心', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ideogram4-lang', 'en');
    useEditorStore.setState({
      chatPresets: [
        {
          id: 'preset_test_1',
          name: 'Preset A',
          description: 'Test preset',
          promptTemplate: 'Prompt',
          tags: ['test'],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
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

  it('默认展示 LLM providers 模块并标记当前导航项', () => {
    render(<I18nProvider><SettingsPage /></I18nProvider>);

    expect(screen.getByRole('heading', { name: 'Configuration Center' })).toBeInTheDocument();

    const llmNav = screen.getByRole('button', { name: /LLM Providers/ });
    expect(llmNav).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('LLM panel')).toHaveAttribute('data-embedded', 'true');
    expect(screen.queryByText('Preset panel')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Workspace' })).not.toBeInTheDocument();
  });

  it('点击 Prompt presets 模块后展示预设管理面板', async () => {
    const user = userEvent.setup();
    render(<I18nProvider><SettingsPage /></I18nProvider>);

    const presetsNav = screen.getByRole('button', { name: /Prompt Presets/ });
    await user.click(presetsNav);

    expect(presetsNav).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Preset panel')).toHaveAttribute('data-embedded', 'true');
    expect(screen.queryByText('LLM panel')).not.toBeInTheDocument();
  });

  it('点击 Workspace 模块后展示 Workspace Backup 区域，并在缺少 token 时禁用备份和恢复', async () => {
    const user = userEvent.setup();
    render(<I18nProvider><SettingsPage /></I18nProvider>);

    const workspaceNav = screen.getByRole('button', { name: /Workspace/ });
    await user.click(workspaceNav);

    expect(workspaceNav).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Canvas Favorites' })).toHaveClass('workspace-pane-title');
    expect(screen.getByRole('heading', { name: 'Workspace Backup' })).toHaveClass('workspace-pane-title');
    expect(screen.getByRole('button', { name: 'Back Up Now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restore From Gist' })).toBeDisabled();
    expect(screen.getByText(/Private Gist is not end-to-end encrypted/)).toBeInTheDocument();
  });
});
