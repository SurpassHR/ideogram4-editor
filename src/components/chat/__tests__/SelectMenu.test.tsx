import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import SelectMenu from '../SelectMenu';

describe('SelectMenu', () => {
  it('靠近视口底部时应向上展开并限制下拉高度', () => {
    Object.defineProperty(window, 'innerHeight', {
      value: 360,
      configurable: true,
    });

    render(
      <SelectMenu
        options={[
          { value: 'a', label: '选项 A' },
          { value: 'b', label: '选项 B' },
          { value: 'c', label: '选项 C' },
        ]}
        value="a"
        onChange={() => {}}
      />,
    );

    const trigger = screen.getByRole('button');
    trigger.getBoundingClientRect = () => ({
      x: 24,
      y: 320,
      top: 320,
      left: 24,
      right: 184,
      bottom: 348,
      width: 160,
      height: 28,
      toJSON: () => {},
    } as DOMRect);

    fireEvent.click(trigger);

    const dropdown = document.querySelector('.select-menu-dropdown') as HTMLElement;
    expect(dropdown).not.toBeNull();
    expect(dropdown.style.bottom).toBe('42px');
    expect(dropdown.style.maxHeight).toBe('220px');
    expect(dropdown.style.top).toBe('auto');
  });
});
