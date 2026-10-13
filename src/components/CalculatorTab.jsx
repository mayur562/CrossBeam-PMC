import React, { useState, useEffect } from 'react';
import { calculateCompliance } from '../utils/rulesCalculator';

const CalculatorTab = ({ outputLanguage }) => {
  const [rulesData, setRulesData] = useState(null);
  
  // Persisted inputs
  const [inputs, setInputs] = useState(() => {
    const saved = localStorage.getItem('pmc_calc_inputs');
    return saved ? JSON.parse(saved) : {
      plotArea: '',
      roadWidth: '',
      tenementArea: '',
      zone: 'residential',
      congestion: 'non-congested'
    };
  });

  const [results, setResults] = useState(null);

  // AI State
  const [aiText, setAiText] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [highlightedFields, setHighlightedFields] = useState({});
  const [isReviewingAi, setIsReviewingAi] = useState(false);
  const [explanations, setExplanations] = useState({});

  // Voice Input State
  const [isListening, setIsListening] = useState(false);
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supportsSpeech = !!SpeechRecognition;

  // Summary State
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  useEffect(() => {
    fetch('/data/dcpr-rules.json')
      .then(res => res.json())
      .then(data => setRulesData(data))
      .catch(err => console.error("Failed to load rules", err));
  }, []);

  useEffect(() => {
    localStorage.setItem('pmc_calc_inputs', JSON.stringify(inputs));
    if (!isReviewingAi) {
      calculateResults();
    }
  }, [inputs, rulesData, isReviewingAi]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({
      ...prev,
      [name]: value
    }));
    // Remove highlight when user manually edits
    if (highlightedFields[name]) {
      setHighlightedFields(prev => ({ ...prev, [name]: false }));
    }
  };

  const handleAiSubmit = async () => {
    if (!aiText.trim()) return;
    
    setIsAiLoading(true);
    setAiError('');
    setHighlightedFields({});
    
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${API_BASE}/api/extract-plot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ description: aiText })
      });
      
      if (!response.ok) {
        // Fallback silently by just logging if the API key isn't configured or fails
        console.warn('AI Extraction failed or not configured. Fallback to manual entry.', await response.text());
        setAiError('AI auto-fill is currently unavailable. Please fill the form manually.');
        setIsAiLoading(false);
        return;
      }
      
      const data = await response.json();
      
      // Merge extracted data into inputs
      const updates = {};
      const newHighlights = {};
      
      if (data.plot_area_sqm) {
        updates.plotArea = data.plot_area_sqm;
        newHighlights.plotArea = true;
      }
      if (data.road_width_m) {
        updates.roadWidth = data.road_width_m;
        newHighlights.roadWidth = true;
      }
      if (data.tenement_area_sqm) {
        updates.tenementArea = data.tenement_area_sqm;
        newHighlights.tenementArea = true;
      }
      if (data.zone) {
        updates.zone = data.zone;
        newHighlights.zone = true;
      }
      if (data.congestion_status) {
        updates.congestion = data.congestion_status;
        newHighlights.congestion = true;
      }
      
      if (Object.keys(updates).length > 0) {
        setInputs(prev => ({ ...prev, ...updates }));
        setHighlightedFields(newHighlights);
        setAiText(''); // clear on success
        setIsReviewingAi(true);
        setResults(null);
      } else {
        setAiError("Couldn't extract any valid details. Please fill manually.");
      }
      
    } catch (err) {
      console.error(err);
      setAiError('Something went wrong. Please fill manually.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleExplain = async (fieldName, fieldValue) => {
    setExplanations(prev => ({ ...prev, [fieldName]: { loading: true } }));
    
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${API_BASE}/api/explain-result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs, fieldName, fieldValue, language: outputLanguage })
      });
      
      if (!response.ok) {
        throw new Error('API Error');
      }
      
      const data = await response.json();
      setExplanations(prev => ({ ...prev, [fieldName]: { text: data.explanation, loading: false } }));
    } catch (err) {
      setExplanations(prev => ({ 
        ...prev, 
        [fieldName]: { 
          text: "Explanation unavailable — the number above is still accurate, it's from the DCPR-2017 rules table.", 
          loading: false,
          error: true
        } 
      }));
    }
  };

  const toggleListening = () => {
    if (isListening) {
      // Browser typically stops automatically on end of speech, but just in case
      setIsListening(false);
      return; 
    }

    if (!supportsSpeech) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; // Defaulting to Indian English for plot descriptions, though could be tied to UI lang
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setAiText(prev => (prev ? prev + ' ' + transcript : transcript));
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start speech recognition", e);
      setIsListening(false);
    }
  };

  const downloadSummary = async () => {
    if (!results || results.notFound) return;

    setIsGeneratingSummary(true);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
      const response = await fetch(`${API_BASE}/api/generate-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs, results, language: outputLanguage })
      });

      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }

      const data = await response.json();
      const text = data.summaryText;

      // Create blob and download
      const blob = new Blob([text], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CrossBeam_Summary.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (err) {
      console.error('Summary download error:', err);
      alert('Failed to generate summary. Please try again.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const calculateResults = () => {
    const complianceResults = calculateCompliance(inputs, rulesData);
    setResults(complianceResults);
  };

  const ExplainableResult = ({ label, value, fieldName }) => (
    <div className="result-item">
      <span className="result-label">{label}:</span>
      <span className="result-value">{value}</span>
      <button 
        className="explain-btn" 
        onClick={() => handleExplain(fieldName, value)}
        disabled={explanations[fieldName]?.loading}
      >
        {explanations[fieldName]?.loading ? 'Explaining...' : 'Explain'}
      </button>
      {explanations[fieldName]?.text && (
        <div className={`explanation-box ${explanations[fieldName].error ? 'error' : ''}`}>
          {explanations[fieldName].text}
        </div>
      )}
    </div>
  );

  return (
    <div className="tab-content">
      <h2>Calculator</h2>
      <p className="subtitle">Enter your plot details to check required setbacks, FSI, height, and parking.</p>
      
      {/* AI Extraction Section */}
      <div className="ai-section">
        <label htmlFor="aiText">Describe your plot to auto-fill:</label>
        <div className="ai-input-group">
          <textarea
            id="aiText"
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            placeholder="e.g. My plot is 200 sq m, facing a 9m road, residential, non-congested. The tenement is 100 sq m."
            rows="2"
            disabled={isAiLoading}
          />
          {supportsSpeech && (
            <button 
              onClick={toggleListening} 
              className={`mic-btn ${isListening ? 'listening' : ''}`}
              title={isListening ? 'Listening...' : 'Click to speak'}
              disabled={isAiLoading}
            >
              🎤
            </button>
          )}
          <button onClick={handleAiSubmit} disabled={isAiLoading || !aiText.trim()} className="ai-btn">
            {isAiLoading ? 'Extracting...' : 'Auto-fill Form'}
          </button>
        </div>
        {aiError && <p className="ai-error">{aiError}</p>}
      </div>

      <div className="calc-container">
        <div className="calc-form">
          <div className="form-group">
            <label>Plot Area (sq m)</label>
            <input 
              type="number" 
              name="plotArea" 
              value={inputs.plotArea} 
              onChange={handleInputChange} 
              placeholder="e.g. 200"
              className={highlightedFields.plotArea ? 'highlighted-input' : ''}
            />
          </div>
          <div className="form-group">
            <label>Abutting Road Width (m)</label>
            <input 
              type="number" 
              name="roadWidth" 
              value={inputs.roadWidth} 
              onChange={handleInputChange} 
              placeholder="e.g. 10"
              className={highlightedFields.roadWidth ? 'highlighted-input' : ''}
            />
          </div>
          <div className="form-group">
            <label>Tenement Carpet Area (sq m)</label>
            <input 
              type="number" 
              name="tenementArea" 
              value={inputs.tenementArea} 
              onChange={handleInputChange} 
              placeholder="e.g. 100"
              className={highlightedFields.tenementArea ? 'highlighted-input' : ''}
            />
            <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
              Used to calculate parking requirements.
            </small>
          </div>
          <div className="form-group">
            <label>Zone</label>
            <select 
              name="zone" 
              value={inputs.zone} 
              onChange={handleInputChange}
              className={highlightedFields.zone ? 'highlighted-input' : ''}
            >
              <option value="residential">Residential (R1/R2)</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>
          <div className="form-group">
            <label>Area Type</label>
            <select 
              name="congestion" 
              value={inputs.congestion} 
              onChange={handleInputChange}
              className={highlightedFields.congestion ? 'highlighted-input' : ''}
            >
              <option value="non-congested">Non-congested</option>
              <option value="congested">Congested</option>
            </select>
          </div>
        </div>

        <div className="calc-results">
          {isReviewingAi ? (
            <div className="result-card" style={{ textAlign: 'center', padding: '2rem', border: '2px solid var(--success-bg)' }}>
              <p style={{ marginBottom: '1.5rem', color: 'var(--primary-dark)', fontSize: '1.1rem', fontWeight: '500' }}>
                Please review the highlighted auto-filled values.
              </p>
              <button 
                onClick={() => setIsReviewingAi(false)} 
                className="ai-btn" 
                style={{ margin: '0 auto' }}
              >
                Looks good, calculate
              </button>
            </div>
          ) : results ? (
            results.notFound ? (
              <div className="result-card error">
                <p>No rules found for the provided inputs. Please verify the numbers.</p>
              </div>
            ) : (
              <div className="result-card success">
                <h3>Required Compliance</h3>
                
                {/* Setbacks */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.5rem', color: 'var(--primary-dark)' }}>Marginal Distances</h4>
                  {results.setback ? (
                    inputs.congestion === 'congested' ? (
                      <div className="result-grid">
                        <div className="result-item full-width">
                          <ExplainableResult label="Front Setback (Residential)" value={results.setback.residential_m} fieldName="Front Setback (Residential)" />
                        </div>
                      </div>
                    ) : (
                      <div className="result-grid">
                        <ExplainableResult label="Front Margin" value={`${results.setback.min_front_setback_m} m`} fieldName="Front Margin" />
                        <ExplainableResult label="Side Margin" value={`${results.setback.min_side_margin_m} m`} fieldName="Side Margin" />
                        <ExplainableResult label="Rear Margin" value={`${results.setback.min_rear_margin_m} m`} fieldName="Rear Margin" />
                      </div>
                    )
                  ) : (
                    <p style={{ color: 'var(--error-text)' }}>Plot Area too small for this road width per the standard tables.</p>
                  )}
                </div>

                {/* FSI */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.5rem', color: 'var(--primary-dark)' }}>FSI & Height</h4>
                  {results.fsi && (
                    <div className="result-grid">
                      <ExplainableResult label="Basic FSI" value={results.fsi.basic_fsi} fieldName="Basic FSI" />
                      <ExplainableResult label="Max Building Potential" value={results.fsi.max_building_potential} fieldName="Max Building Potential" />
                    </div>
                  )}
                  {results.heightRule && (
                    <div style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      <strong>Height Rule:</strong> {results.heightRule}
                    </div>
                  )}
                </div>

                {/* Parking */}
                <div>
                  <h4 style={{ marginBottom: '0.5rem', color: 'var(--primary-dark)' }}>Parking Requirements</h4>
                  {results.parking ? (
                    <>
                      <div className="result-grid">
                        <ExplainableResult label="Cars" value={results.parking.car} fieldName="Parking (Cars)" />
                        <ExplainableResult label="Scooters" value={results.parking.scooter} fieldName="Parking (Scooters)" />
                        <ExplainableResult label="Cycles" value={results.parking.cycle} fieldName="Parking (Cycles)" />
                      </div>
                      <div style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        Requirements apply per: <strong>{results.parking.spaces_per}</strong> (plus 5% visitor parking).
                      </div>
                    </>
                  ) : (
                    <p>No parking data found for this tenement area.</p>
                  )}
                </div>

                <div className="summary-section">
                  <button 
                    className="ai-btn summary-btn" 
                    onClick={downloadSummary}
                    disabled={isGeneratingSummary}
                  >
                    {isGeneratingSummary ? 'Generating...' : 'Download Summary'}
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="result-card empty">
              <p>Enter Plot Area, Road Width, and Tenement Area to see compliance results.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalculatorTab;
