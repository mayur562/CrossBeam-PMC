import React, { useState } from 'react';

const RejectionHelperTab = ({ outputLanguage }) => {
  const [remarksText, setRemarksText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remarksData, setRemarksData] = useState(null);

  const handleExplain = async () => {
    if (!remarksText.trim()) return;
    
    setLoading(true);
    setError('');
    setRemarksData(null);

    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${API_BASE}/api/explain-rejection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ remarksText, language: outputLanguage })
      });

      if (!response.ok) {
        throw new Error('API Error');
      }

      const data = await response.json();
      setRemarksData(data.remarks);
    } catch (err) {
      console.error(err);
      setError('Could not translate the remarks at this time. Please ensure you are connected to the internet, or try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-content">
      <h2>Rejection & Query Helper</h2>
      <p className="subtitle">Paste the remarks from your PMC rejection letter to understand them in plain English.</p>

      <div className="disclaimer" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
        <strong>Important:</strong> This tool is an aid to help you understand PMC's remarks in plain language. It does <strong>not</strong> confirm whether a fix is correct or provide new numbers to build to. Always verify any required changes with your architect, engineer, or the PMC office.
      </div>

      <div className="rejection-input-section">
        <label htmlFor="remarks-textarea" className="rejection-label">
          Paste PMC Remarks:
        </label>
        <textarea
          id="remarks-textarea"
          className="rejection-textarea"
          placeholder="e.g. Reg 17.2.1 not complied, provide revised set back plan..."
          value={remarksText}
          onChange={(e) => setRemarksText(e.target.value)}
          disabled={loading}
          rows={6}
        />
        <div className="rejection-actions">
          <button 
            className="ai-btn rejection-btn" 
            onClick={handleExplain} 
            disabled={loading || !remarksText.trim()}
          >
            {loading ? 'Analyzing...' : 'Explain These Remarks'}
          </button>
        </div>
        
        {error && <div className="ai-error rejection-error">{error}</div>}
      </div>

      {remarksData && remarksData.length > 0 && (
        <div className="rejection-results">
          <h3>Decoded Remarks ({remarksData.length})</h3>
          <div className="rejection-cards">
            {remarksData.map((remark, index) => (
              <div key={index} className="rejection-card">
                <div className="remark-section">
                  <span className="remark-title">Original Remark:</span>
                  <div className="remark-content original">{remark.original_text}</div>
                </div>
                
                <div className="remark-section">
                  <span className="remark-title">Plain Meaning:</span>
                  <div className="remark-content meaning">{remark.plain_meaning}</div>
                </div>
                
                <div className="remark-section">
                  <span className="remark-title">Related Regulation:</span>
                  <div className={`remark-badge ${remark.related_regulation.toLowerCase() === 'unclear' ? 'warning' : 'info'}`}>
                    {remark.related_regulation}
                  </div>
                </div>
                
                <div className="remark-section">
                  <span className="remark-title">Suggested Next Step:</span>
                  <div className="remark-content next-step">{remark.next_step}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RejectionHelperTab;
