import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { BottomCommandBar } from '../BottomCommandBar';
import { I18nProvider } from '../../../i18n/context';

describe('BottomCommandBar Component', () => {
  it('renders command bar with input and action buttons', () => {
    render(
      <I18nProvider>
        <BottomCommandBar />
      </I18nProvider>
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByTestId('btn-autocomplete-scene')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-command-bar-hint')).toBeInTheDocument();
  });

  it('reveals the command bar when the pointer reaches the bottom dock', () => {
    render(
      <I18nProvider>
        <BottomCommandBar />
      </I18nProvider>
    );

    const dock = screen.getByTestId('bottom-command-bar-dock');
    expect(dock).not.toHaveClass('is-visible');

    fireEvent.mouseEnter(dock);
    expect(dock).toHaveClass('is-visible');

    fireEvent.mouseLeave(dock);
    expect(dock).not.toHaveClass('is-visible');
  });

  it('keeps the command bar visible while its input is focused', () => {
    render(
      <I18nProvider>
        <BottomCommandBar />
      </I18nProvider>
    );

    const dock = screen.getByTestId('bottom-command-bar-dock');
    fireEvent.focus(screen.getByRole('textbox'));
    expect(dock).toHaveClass('is-visible');

    fireEvent.mouseLeave(dock);
    expect(dock).toHaveClass('is-visible');

    fireEvent.blur(screen.getByRole('textbox'));
    expect(dock).not.toHaveClass('is-visible');
  });

  it('stays open after the pointer leaves through the bottom edge', () => {
    render(
      <I18nProvider>
        <BottomCommandBar />
      </I18nProvider>
    );

    const dock = screen.getByTestId('bottom-command-bar-dock');
    fireEvent.mouseEnter(dock);
    expect(dock).toHaveClass('is-visible');

    fireEvent.pointerMove(window, { clientX: 500, clientY: window.innerHeight - 1 });
    fireEvent.mouseLeave(dock);
    expect(dock).toHaveClass('is-visible');

    fireEvent.pointerMove(window, { clientX: 500, clientY: 400 });
    expect(dock).not.toHaveClass('is-visible');
  });
});

