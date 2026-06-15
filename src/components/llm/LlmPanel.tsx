import { useState, useEffect } from 'react';
import GlowPanel from '../panels/GlowPanel';
import LlmConfigPanel from './LlmConfigPanel';
import { getLlmProviders } from './api';
import type { LlmProvider } from './types';
import { KIND_LABELS } from './types';

export default function LlmPanel() {
  const [showConfig, setShowConfig] = useState(false);
  const [providers, setProviders] = useState<LlmProvider[]>([]);

  useEffect(() => {
    getLlmProviders().then(setProviders);
  }, []);

  // Refresh when config panel closes
  const handleClose = () => {
    setShowConfig(false);
    getLlmProviders().then(setProviders);
  };

  return (
    <>
      <GlowPanel>
        <h3>LLM Tools</h3>
        {providers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
              配置 LLM 提供商以使用 AI 辅助生成 prompt
            </p>
            <button className="btn" onClick={() => setShowConfig(true)} style={{ fontSize: 12, padding: '5px 14px' }}>
              配置 LLM
            </button>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 10 }}>
              {providers.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 12 }}>
                  <span className="llm-dot active" style={{ display: 'inline-block' }} />
                  <span style={{ fontWeight: 500 }}>{p.name || p.id}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {KIND_LABELS[p.kind]} · {p.models.length} 模型
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => setShowConfig(true)} style={{ fontSize: 12, padding: '5px 14px' }}>
                管理配置
              </button>
              <button className="btn" disabled style={{ fontSize: 12, padding: '5px 14px', opacity: 0.4 }}>
                优化 Prompt
              </button>
            </div>
          </div>
        )}
      </GlowPanel>

      {showConfig && <LlmConfigPanel onClose={handleClose} />}
    </>
  );
}