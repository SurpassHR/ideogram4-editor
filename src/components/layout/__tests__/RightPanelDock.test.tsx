import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../../i18n/context';
import RightPanelDock from '../RightPanelDock';

describe('RightPanelDock', () => {
  beforeEach(() => {
    localStorage.removeItem('ideogram4-right-panel-pinned');
  });

  it('reveals the floating right panel on edge hover and hides it on leave', () => {
    render(
      <I18nProvider>
        <RightPanelDock />
      </I18nProvider>
    );

    const dock = screen.getByTestId('right-panel-dock');
    expect(dock).not.toHaveClass('is-visible');
    expect(screen.getByTestId('right-panel-hint')).toBeInTheDocument();

    fireEvent.mouseEnter(dock);
    expect(dock).toHaveClass('is-visible');

    fireEvent.mouseLeave(dock);
    expect(dock).not.toHaveClass('is-visible');
  });

  it('stays open while focus is inside the floating panel', () => {
    render(
      <I18nProvider>
        <RightPanelDock />
      </I18nProvider>
    );

    const dock = screen.getByTestId('right-panel-dock');
    const focusTarget = screen.getByRole('button', { name: /global settings/i });

    fireEvent.focus(focusTarget);
    expect(dock).toHaveClass('is-visible');

    fireEvent.mouseLeave(dock);
    expect(dock).toHaveClass('is-visible');

    fireEvent.blur(focusTarget);
    expect(dock).not.toHaveClass('is-visible');
  });

  it('pins the panel open and persists the preference', () => {
    render(
      <I18nProvider>
        <RightPanelDock />
      </I18nProvider>
    );

    const dock = screen.getByTestId('right-panel-dock');
    fireEvent.click(screen.getByRole('button', { name: 'Pin sidebar' }));
    expect(dock).toHaveClass('is-visible');
    expect(localStorage.getItem('ideogram4-right-panel-pinned')).toBe('1');

    fireEvent.mouseLeave(dock);
    expect(dock).toHaveClass('is-visible');

    fireEvent.click(screen.getByRole('button', { name: 'Unpin sidebar' }));
    expect(dock).not.toHaveClass('is-visible');
    expect(localStorage.getItem('ideogram4-right-panel-pinned')).toBe('0');
  });

  it('opens when the pointer reaches the outer right edge beside the hint', () => {
    render(
      <I18nProvider>
        <RightPanelDock />
      </I18nProvider>
    );

    const dock = screen.getByTestId('right-panel-dock');
    const hint = screen.getByTestId('right-panel-hint');
    vi.spyOn(hint, 'getBoundingClientRect').mockReturnValue({
      x: 1000,
      y: 400,
      top: 400,
      right: 1005,
      bottom: 464,
      left: 1000,
      width: 5,
      height: 64,
      toJSON: () => ({}),
    });

    fireEvent.pointerMove(window, { clientX: window.innerWidth, clientY: 430 });
    expect(dock).toHaveClass('is-visible');

    fireEvent.pointerMove(window, { clientX: 600, clientY: 430 });
    expect(dock).not.toHaveClass('is-visible');
  });

  it('stays open only at the right edge and closes after moving to the bottom', () => {
    render(
      <I18nProvider>
        <RightPanelDock />
      </I18nProvider>
    );

    const dock = screen.getByTestId('right-panel-dock');
    const hint = screen.getByTestId('right-panel-hint');
    vi.spyOn(hint, 'getBoundingClientRect').mockReturnValue({
      x: 1000, y: 400, top: 400, right: 1005, bottom: 464, left: 1000,
      width: 5, height: 64, toJSON: () => ({}),
    });

    fireEvent.pointerMove(window, { clientX: window.innerWidth, clientY: 430 });
    fireEvent.mouseLeave(document.documentElement);
    expect(dock).toHaveClass('is-visible');

    fireEvent.pointerMove(window, { clientX: 600, clientY: window.innerHeight - 1 });
    expect(dock).not.toHaveClass('is-visible');
  });
});
