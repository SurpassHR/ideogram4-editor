import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  });
});

