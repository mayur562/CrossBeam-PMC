import React, { useState, useEffect } from 'react';

const ChecklistTab = () => {
  const [checklist, setChecklist] = useState([]);
  const [aiStatus, setAiStatus] = useState({});

  useEffect(() => {
    fetch('/data/checklist.json')
      .then((res) => res.json())
      .then((data) => setChecklist(data))
      .catch((err) => console.error("Failed to load checklist", err));
  }, []);

  const handleFileUpload = async (item, file) => {
    if (!file) return;

    // Check size limit (~3MB = 3 * 1024 * 1024 = 3145728 bytes)
    if (file.size > 3145728) {
      setAiStatus(prev => ({
        ...prev,
        [item.id]: { fileTooLarge: true }
      }));
      return;
    }

    setAiStatus(prev => ({
      ...prev,
      [item.id]: { loading: true }
    }));

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result.split(',')[1];
        
        const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
        const response = await fetch(`${API_BASE}/api/check-document`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            documentTitle: item.title,
            mimeType: file.type,
            documentBase64: base64String
          })
        });

        if (!response.ok) throw new Error('API Error');

        const data = await response.json();
        setAiStatus(prev => ({
          ...prev,
          [item.id]: { 
            status: data.status,
            reason: data.reason,
            loading: false 
          }
        }));
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setAiStatus(prev => ({
        ...prev,
        [item.id]: { error: true, loading: false }
      }));
    }
  };

  const renderAiBadge = (itemStatus) => {
    if (!itemStatus) return null;
    if (itemStatus.loading) return <div className="ai-badge loading">Checking document...</div>;
    if (itemStatus.fileTooLarge) return <div className="ai-badge error">File too large — try compressing it or uploading a single page (Max 3MB).</div>;
    if (itemStatus.error) return <div className="ai-badge error">Verification failed. Please check manually.</div>;

    switch (itemStatus.status) {
      case 'present_looks_complete':
        return <div className="ai-badge success">✅ Present — looks complete</div>;
      case 'needs_verification':
        return <div className="ai-badge warning">⚠️ Present but unclear/needs verification</div>;
      case 'not_detected':
        return <div className="ai-badge error">❌ Not detected — please check you uploaded the right file</div>;
      default:
        return null;
    }
  };

  return (
    <div className="tab-content">
      <h2>Document Checklist</h2>
      <p className="subtitle">Track the documents you need for building permission submission.</p>
      
      <div className="disclaimer" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
        <strong>AI Document Verification:</strong> This is a read-only inspection to help you check completeness. It does not determine legal validity. Uploaded documents are processed in real-time and are <strong>instantly discarded</strong>. They are never stored on any server.
      </div>

      <div className="checklist">
        {checklist.map((item) => (
          <div key={item.id} className="checklist-item">
            <div className="checklist-item-header">
              <div className="item-content-wrapper">
                <div className="item-text">
                  <span className="item-title">{item.title}</span>
                  <span className="item-desc">{item.description}</span>
                </div>
              </div>
              <div className="upload-section">
                <input 
                  type="file" 
                  id={`file-${item.id}`} 
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileUpload(item, e.target.files[0])}
                  disabled={aiStatus[item.id]?.loading}
                />
                <label htmlFor={`file-${item.id}`} className="ai-upload-btn" style={{ opacity: aiStatus[item.id]?.loading ? 0.5 : 1 }}>
                  Upload to check
                </label>
              </div>
            </div>
            {renderAiBadge(aiStatus[item.id])}
            {aiStatus[item.id]?.reason && (
              <div className="ai-reason">{aiStatus[item.id].reason}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChecklistTab;
