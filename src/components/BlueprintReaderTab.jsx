import React, { useState, useEffect } from 'react';
import { calculateCompliance } from '../utils/rulesCalculator';

const BlueprintReaderTab = () => {
  const [rulesData, setRulesData] = useState(null);
  
  const [inputs, setInputs] = useState({
    zone: 'residential',
    congestion: 'non-congested',
    tenementArea: '' // Optional
  });

  const [aiStatus, setAiStatus] = useState({ loading: false, error: null });
  const [extractedData, setExtractedData] = useState(null);
  const [results, setResults] = useState(null);

  useEffect(() => {
    fetch('/data/dcpr-rules.json')
      .then(res => res.json())
      .then(data => setRulesData(data))
      .catch(err => console.error("Failed to load rules", err));
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 3145728) {
      setAiStatus({ loading: false, error: 'File too large — try compressing it (Max 3MB).' });
      return;
    }

    setAiStatus({ loading: true, error: null });
    setExtractedData(null);
    setResults(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result.split(',')[1];
        
        const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
        const response = await fetch(`${API_BASE}/api/read-blueprint`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            mimeType: file.type,
            documentBase64: base64String
          })
        });

        if (!response.ok) throw new Error('API Error');

        const data = await response.json();
        setExtractedData(data);
        
        // Calculate expected values based on extracted inputs
        const calcInputs = {
          plotArea: data.plot_area_sqm || 0,
          roadWidth: data.road_width_m || 0,
          tenementArea: inputs.tenementArea,
          zone: inputs.zone,
          congestion: inputs.congestion
        };
        
        if (data.plot_area_sqm && data.road_width_m) {
           const compliance = calculateCompliance(calcInputs, rulesData);
           setResults(compliance);
        } else {
           setResults({ notFound: true, message: 'Missing Plot Area or Road Width labels on drawing.' });
        }
        
        setAiStatus({ loading: false, error: null });
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setAiStatus({ loading: false, error: 'Failed to read blueprint. Please try again.' });
    }
  };

  const renderComparisonRow = (label, labeledValue, requiredValue, isNumeric = true, isParking = false) => {
    let status = null;
    
    if (isParking && !inputs.tenementArea) {
      return (
        <tr>
          <td>{label}</td>
          <td>{labeledValue !== null && labeledValue !== undefined ? labeledValue : 'Not labeled'}</td>
          <td colSpan="2" style={{ color: 'var(--text-muted)' }}>Not provided — add Tenement Area above to check parking</td>
        </tr>
      );
    }

    if (labeledValue === null || labeledValue === undefined) {
      status = <span className="ai-badge" style={{ backgroundColor: '#f0f0f0', color: '#555' }}>Not labeled on drawing</span>;
    } else if (requiredValue === null || requiredValue === undefined) {
      status = <span className="ai-badge warning">⚠️ Unknown requirement</span>;
    } else if (isNumeric) {
      const numLabeled = parseFloat(labeledValue);
      const numRequired = parseFloat(requiredValue);
      if (!isNaN(numLabeled) && !isNaN(numRequired)) {
        if (numLabeled >= numRequired) {
          status = <span className="ai-badge success">✅ Meets/Exceeds</span>;
        } else {
          status = <span className="ai-badge error">⚠️ Appears below requirement</span>;
        }
      } else {
        status = <span className="ai-badge warning">⚠️ Manual verification needed</span>;
      }
    } else {
       status = <span className="ai-badge warning">⚠️ Manual verification needed</span>;
    }

    return (
      <tr>
        <td>{label}</td>
        <td>{labeledValue !== null && labeledValue !== undefined ? labeledValue : 'Not labeled'}</td>
        <td>{requiredValue !== null && requiredValue !== undefined ? requiredValue : 'N/A'}</td>
        <td>{status}</td>
      </tr>
    );
  };

  return (
    <div className="tab-content">
      <h2>Blueprint Label Reader</h2>
      <p className="subtitle">Upload your architectural site plan to cross-check its drawn dimensions against DCPR rules.</p>
      
      <div className="disclaimer" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
        <strong>Scope & Limitations:</strong> This reads dimension labels <em>already written</em> on your drawing — it does not measure the drawing itself geographically or geometrically. If your plan has no written dimensions, upload one with labels, or use the Calculator tab instead.
      </div>

      <div className="calc-container">
        <div className="calc-form">
          <div className="form-group">
            <label>Zone</label>
            <select name="zone" value={inputs.zone} onChange={handleInputChange}>
              <option value="residential">Residential (R1/R2)</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>
          <div className="form-group">
            <label>Area Type</label>
            <select name="congestion" value={inputs.congestion} onChange={handleInputChange}>
              <option value="non-congested">Non-congested</option>
              <option value="congested">Congested</option>
            </select>
          </div>
          <div className="form-group">
            <label>Tenement Carpet Area (sq m) <span style={{fontWeight: 'normal', color: 'var(--text-muted)'}}>(Optional)</span></label>
            <input 
              type="number" 
              name="tenementArea" 
              value={inputs.tenementArea} 
              onChange={handleInputChange} 
              placeholder="e.g. 100"
            />
            <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
              Used to calculate parking. Leave blank if unknown.
            </small>
          </div>
          <div className="form-group">
            <label>Upload Site Plan / Blueprint</label>
            <input 
              type="file" 
              accept="image/*,application/pdf"
              onChange={handleFileUpload}
              disabled={aiStatus.loading}
              className="file-input"
              style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>
          {aiStatus.loading && <div className="ai-badge loading">Reading Blueprint...</div>}
          {aiStatus.error && <div className="ai-badge error">{aiStatus.error}</div>}
        </div>

        <div className="calc-results">
          {extractedData && results ? (
            results.notFound ? (
              <div className="result-card error">
                <p>{results.message || 'No rules found for the provided plot inputs. Check if road width and plot area are labeled clearly.'}</p>
              </div>
            ) : (
              <div className="result-card success">
                <h3>Cross-Reference Results</h3>
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Dimension</th>
                      <th>Labeled on Drawing</th>
                      <th>DCPR Requires</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Core Plot Inputs Extracted */}
                    {renderComparisonRow('Plot Area (sq m)', extractedData.plot_area_sqm, 'N/A', false)}
                    {renderComparisonRow('Road Width (m)', extractedData.road_width_m, 'N/A', false)}
                    
                    {/* Setbacks */}
                    {inputs.congestion === 'congested' ? (
                       renderComparisonRow('Front Setback', extractedData.front_setback_m, results.setback?.residential_m, false)
                    ) : (
                      <>
                        {renderComparisonRow('Front Setback (m)', extractedData.front_setback_m, results.setback?.min_front_setback_m)}
                        {renderComparisonRow('Side Setback (m)', extractedData.side_setback_m, results.setback?.min_side_margin_m)}
                        {renderComparisonRow('Rear Setback (m)', extractedData.rear_setback_m, results.setback?.min_rear_margin_m)}
                      </>
                    )}

                    {/* Height */}
                    {renderComparisonRow('Building Height (m)', extractedData.building_height_m, results.heightRule, false)}

                    {/* Parking */}
                    {renderComparisonRow('Parking (Cars)', null, results.parking?.car, true, true)}
                    {renderComparisonRow('Parking (Scooters)', null, results.parking?.scooter, true, true)}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="result-card empty">
              <p>Upload a blueprint to extract labeled dimensions and compare them against rules.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlueprintReaderTab;
