export default function LlmPanel() {
  return (
    <div className="panel">
      <h3>LLM Tools</h3>
      <p style={{ fontSize: 13, color: '#666' }}>
        LLM configuration panel will be integrated here using the llm-config-panel pattern.
      </p>
      <div style={{ marginTop: 12 }}>
        <button className="btn" disabled style={{ marginRight: 8, opacity: 0.5 }}>
          Generate Description
        </button>
        <button className="btn" disabled style={{ opacity: 0.5 }}>
          Optimize Prompt
        </button>
      </div>
    </div>
  );
}