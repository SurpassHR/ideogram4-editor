import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StreamingLayoutRecoveryDialog from '../StreamingLayoutRecoveryDialog';
import { I18nProvider } from '../../../i18n/context';
import { useEditorStore } from '../../../store';

function renderDialog() {
  return render(
    <I18nProvider>
      <StreamingLayoutRecoveryDialog />
    </I18nProvider>,
  );
}

describe('StreamingLayoutRecoveryDialog', () => {
  beforeEach(() => {
    localStorage.setItem('ideogram4-lang', 'en');
    useEditorStore.setState({
      layoutStreamTransaction: null,
      isLayoutStreaming: false,
      streamingLayoutBoxCount: 0,
      layoutStreamRecovery: null,
    });
  });

  it('renders the recovery count and reason', () => {
    useEditorStore.setState({
      layoutStreamRecovery: {
        requestId: 'req_1',
        reason: 'Network disconnected',
        boxCount: 3,
      },
    });

    renderDialog();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/Already written to the canvas: 3/i)).toBeTruthy();
    expect(screen.getByText(/Network disconnected/i)).toBeTruthy();
  });

  it('keep and restore actions resolve the pending recovery', () => {
    useEditorStore.setState({
      layoutStreamRecovery: {
        requestId: 'req_1',
        reason: 'parse failed',
        boxCount: 1,
      },
    });

    const { rerender } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Keep generated layout' }));
    expect(useEditorStore.getState().layoutStreamRecovery).toBeNull();

    useEditorStore.setState({
      layoutStreamRecovery: {
        requestId: 'req_2',
        reason: 'network failed',
        boxCount: 2,
      },
    });
    rerender(
      <I18nProvider>
        <StreamingLayoutRecoveryDialog />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restore previous canvas' }));
    expect(useEditorStore.getState().layoutStreamRecovery).toBeNull();
  });
});
