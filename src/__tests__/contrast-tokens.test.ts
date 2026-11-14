import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const llmPanel = readFileSync(resolve(process.cwd(), 'src/components/llm/LlmConfigPanel.tsx'), 'utf8');

describe('primary contrast tokens', () => {
  it('defines a dark foreground for light primary surfaces', () => {
    expect(css).toContain('--primary-contrast: #111111;');
  });

  it('does not combine a light primary background with white text', () => {
    expect(css).not.toMatch(
      /background:\s*(?:#fafafa|#fff(?:fff)?|var\(--primary\))[^}]{0,240}color:\s*(?:white|#fff(?:fff)?)/i,
    );
  });

  it('keeps the selected provider protocol readable', () => {
    expect(llmPanel).not.toMatch(/editing\.kind === kind[\s\S]{0,180}color:\s*'white'/);
    expect(llmPanel).toContain("'var(--primary-contrast)'");
  });
});
