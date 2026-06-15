import GlowPanel from '../panels/GlowPanel';

export default function LlmPanel() {
  return (
    <GlowPanel>
      <h3>LLM Tools</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
        Configure an LLM provider to generate and optimize prompts.
      </p>
      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button className="btn" disabled>Generate Description</button>
        <button className="btn" disabled>Optimize Prompt</button>
      </div>
    </GlowPanel>
  );
}