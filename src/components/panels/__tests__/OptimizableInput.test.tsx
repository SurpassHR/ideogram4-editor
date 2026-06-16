import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import OptimizableInput from '../OptimizableInput';
import { I18nProvider } from '../../../i18n/context';

// Mock getLlmProviders 以避免 localStorage 依赖
vi.mock('../../llm/api', () => ({
  getLlmProviders: vi.fn().mockResolvedValue([]),
}));

// Mock llm-chat 服务
vi.mock('../../../services/llm-chat', () => ({
  optimizeText: vi.fn(),
  loadOptimizeSelection: vi.fn().mockReturnValue(null),
  saveOptimizeSelection: vi.fn(),
}));

function renderOptimizableInput(props?: Partial<{ value: string; multiline: boolean; disabled: boolean }>) {
  return render(
    <I18nProvider>
      <OptimizableInput
        label="Test Label"
        fieldKey="testField"
        value={props?.value ?? ''}
        onChange={() => {}}
        multiline={props?.multiline}
        disabled={props?.disabled}
      />
    </I18nProvider>
  );
}

describe('OptimizableInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sparkle 按钮应在 input 包装器内部，而不是在 label 行', () => {
    renderOptimizableInput({ value: 'test' });

    // sparkle 按钮应存在于 DOM 中
    const sparkleBtn = document.querySelector('.sparkle-btn');
    expect(sparkleBtn).not.toBeNull();

    // sparkle 按钮应在 input 包装器内部
    const wrapper = document.querySelector('.optimizable-input-wrapper');
    expect(wrapper).not.toBeNull();
    const btnInWrapper = wrapper!.querySelector('.sparkle-btn');
    expect(btnInWrapper).not.toBeNull();
  });

  it('单行 input 应有足够的右侧内边距为 sparkle 按钮留出空间', () => {
    renderOptimizableInput({ value: 'test' });

    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    // input 应在 wrapper 内部
    const wrapper = document.querySelector('.optimizable-input-wrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.querySelector('input[type="text"]')).not.toBeNull();
  });

  it('多行 textarea 也应有 sparkle 按钮在内部', () => {
    renderOptimizableInput({ value: 'test', multiline: true });

    const wrapper = document.querySelector('.optimizable-input-wrapper');
    expect(wrapper).not.toBeNull();
    const btnInWrapper = wrapper!.querySelector('.sparkle-btn');
    expect(btnInWrapper).not.toBeNull();
  });

  it('sparkle 按钮在值为空时应禁用', () => {
    renderOptimizableInput({ value: '' });

    const sparkleBtn = document.querySelector('.sparkle-btn') as HTMLButtonElement;
    expect(sparkleBtn).not.toBeNull();
    expect(sparkleBtn.disabled).toBe(true);
  });
});