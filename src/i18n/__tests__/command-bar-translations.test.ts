import { describe, it, expect } from 'vitest';
import { translations } from '../translations';

describe('Command Bar I18n Translations', () => {
  it('contains command bar translation keys in both en and zh', () => {
    expect((translations.en as any).commandBar).toBeDefined();
    expect((translations.zh as any).commandBar).toBeDefined();
    expect((translations.en as any).commandBar.autoComplete).toBeDefined();
    expect((translations.zh as any).commandBar.autoComplete).toBeDefined();
    expect((translations.en as any).commandBar.invertImage).toBeDefined();
    expect((translations.zh as any).commandBar.invertImage).toBeDefined();
  });
});

