import { useState, useEffect, useCallback } from 'react';
import SuggestionBar from './SuggestionBar';
import { useI18n } from '../../i18n/context';
import { getLlmProviders } from '../llm/api';
import {
  optimizeText,
  loadOptimizeSelection,
  saveOptimizeSelection,
} from '../../services/llm-chat';
import type { LlmProvider } from '../llm/types';

interface OptimizableInputProps {
  label: string;
  fieldKey: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

interface SuggestionState {
  original: string;
  suggested: string;
  status: 'idle' | 'loading' | 'ready' | 'dismissed';
}

export default function OptimizableInput({
  label,
  fieldKey,
  value,
  onChange,
  multiline,
  disabled,
  placeholder,
}: OptimizableInputProps) {
  const { t } = useI18n();
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [suggestion, setSuggestion] = useState<SuggestionState>({
    original: '',
    suggested: '',
    status: 'idle',
  });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    getLlmProviders().then(setProviders);
  }, []);

  /** 查找可用于优化的 provider+model */
  const findProviderModel = useCallback(() => {
    const saved = loadOptimizeSelection();
    if (saved) {
      const provider = providers.find(p => p.id === saved.providerId);
      if (provider && provider.models.includes(saved.model) && provider.api_key) {
        return { provider, model: saved.model };
      }
    }
    for (const p of providers) {
      if (p.models.length > 0 && p.api_key) {
        return { provider: p, model: p.models[0] };
      }
    }
    return null;
  }, [providers]);

  const handleOptimize = async () => {
    const pm = findProviderModel();
    if (!pm) {
      setToast(t('optimize.noProvider'));
      setTimeout(() => setToast(null), 2500);
      return;
    }

    setSuggestion({ original: value, suggested: '', status: 'loading' });
    saveOptimizeSelection({ providerId: pm.provider.id, model: pm.model });

    const result = await optimizeText(pm.provider, pm.model, value, fieldKey);

    if (result.ok && result.content) {
      setSuggestion({ original: value, suggested: result.content.trim(), status: 'ready' });
    } else {
      setSuggestion({ original: '', suggested: '', status: 'dismissed' });
      setToast(t('optimize.failed', { error: result.error || 'Unknown error' }));
      setTimeout(() => setToast(null), 2500);
    }
  };

  const handleAdopt = () => {
    onChange(suggestion.suggested);
    setSuggestion(prev => ({ ...prev, status: 'dismissed' }));
  };

  const handleDismiss = () => {
    setSuggestion(prev => ({ ...prev, status: 'dismissed' }));
  };

  const isOptimizing = suggestion.status === 'loading';
  const hasValue = value.trim().length > 0;
  const sparkleDisabled = !hasValue || !!disabled || isOptimizing;

  const inputProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    disabled: disabled || isOptimizing,
    placeholder,
    style: isOptimizing ? { opacity: 0.6 } : undefined,
  };

  return (
    <div className="input-group">
      <label>{label}</label>
      <div className="optimizable-input-wrapper">
        {multiline ? (
          <textarea {...inputProps} />
        ) : (
          <input type="text" {...inputProps} />
        )}
        <button
          className="sparkle-btn"
          disabled={sparkleDisabled}
          onClick={handleOptimize}
          title={t('optimize.sparkleTooltip')}
        >
          ✨
        </button>
      </div>
      <SuggestionBar
        original={suggestion.original}
        suggested={suggestion.suggested}
        status={suggestion.status}
        onAdopt={handleAdopt}
        onDismiss={handleDismiss}
      />
      {toast && <div className="optimize-toast">{toast}</div>}
    </div>
  );
}
