import React, { useState, useEffect } from 'react';
import CalculatorTab from './components/CalculatorTab';
import ChecklistTab from './components/ChecklistTab';
import RejectionHelperTab from './components/RejectionHelperTab';
import Disclaimer from './components/Disclaimer';
import BlueprintReaderTab from './components/BlueprintReaderTab';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('calculator');
  const [outputLanguage, setOutputLanguage] = useState(() => {
    return localStorage.getItem('pmc_output_language') || 'English';
  });

  useEffect(() => {
    localStorage.setItem('pmc_output_language', outputLanguage);
  }, [outputLanguage]);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div>
            <h1>CrossBeam</h1>
            <p>An AI-Assisted Building Compliance Pre-Checker for Pune Homeowners</p>
          </div>
          <div className="language-selector">
            <label htmlFor="lang-select">AI Language: </label>
            <select 
              id="lang-select" 
              value={outputLanguage} 
              onChange={(e) => setOutputLanguage(e.target.value)}
            >
              <option value="English">English</option>
              <option value="Marathi">मराठी</option>
              <option value="Hindi">हिंदी</option>
            </select>
          </div>
        </div>
      </header>
      
      <main className="app-main">
        <div className="tab-navigation">
          <button 
            className={`tab-btn ${activeTab === 'calculator' ? 'active' : ''}`}
            onClick={() => setActiveTab('calculator')}
          >
            Calculator
          </button>
          <button 
            className={`tab-btn ${activeTab === 'checklist' ? 'active' : ''}`}
            onClick={() => setActiveTab('checklist')}
          >
            Checklist
          </button>
          <button 
            className={`tab-btn ${activeTab === 'rejection' ? 'active' : ''}`}
            onClick={() => setActiveTab('rejection')}
          >
            Rejection Helper
          </button>
          <button 
            className={`tab-btn ${activeTab === 'blueprint' ? 'active' : ''}`}
            onClick={() => setActiveTab('blueprint')}
          >
            Blueprint Reader
          </button>
        </div>

        <div className="tab-content-container">
          {activeTab === 'calculator' && <CalculatorTab outputLanguage={outputLanguage} />}
          {activeTab === 'blueprint' && <BlueprintReaderTab />}
          {activeTab === 'checklist' && <ChecklistTab />}
          {activeTab === 'rejection' && <RejectionHelperTab outputLanguage={outputLanguage} />}
        </div>
      </main>

      <footer className="app-footer">
        <Disclaimer />
      </footer>
    </div>
  );
}

export default App;
