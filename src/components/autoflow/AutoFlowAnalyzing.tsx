import React from 'react';

interface AutoFlowAnalyzingProps {
  total: number;
  processed: number;
}

const STEPS = [
  'Netteté',
  'Exposition',
  'Composition',
  'Doublons',
  'Score IA',
  'Classification',
];

export const AutoFlowAnalyzing: React.FC<AutoFlowAnalyzingProps> = ({ total, processed }) => {
  const progress = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90,
      background: 'rgba(7,7,12,0.92)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 28,
      fontFamily: "'Space Grotesk', sans-serif",
    }}>
      {/* Spinning icon */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', margin: '0 auto 18px',
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'af-spin 2s linear infinite',
        }}>
          <svg width={26} height={26} viewBox="0 0 24 24"
            fill="var(--af-review)" stroke="none">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <h2 style={{
          fontSize: 22, fontWeight: 800, marginBottom: 6, letterSpacing: '-0.02em',
          color: 'var(--af-t1)', margin: '0 0 6px',
        }}>Analyse AutoFlow…</h2>
        <p style={{ fontSize: 13, color: 'var(--af-t3)', margin: 0 }}>
          Triage IA en cours · Netteté · Doublons · Score qualité
        </p>
      </div>

      {/* Progress bar */}
      <div style={{ width: 290 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--af-t3)' }}>
            {processed} / {total} photos
          </span>
          <span style={{ fontSize: 12, color: 'var(--af-review)', fontWeight: 700 }}>
            {progress}%
          </span>
        </div>
        <div style={{
          height: 4, background: 'rgba(255,255,255,0.05)',
          borderRadius: 4, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${progress}%`, borderRadius: 4,
            transition: 'width 0.3s ease',
            background: 'linear-gradient(90deg, var(--af-review), var(--af-reject))',
          }} />
        </div>
      </div>

      {/* 6-step indicators */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        {STEPS.map((step, i) => {
          const done = progress > i * 15 + 6;
          return (
            <div key={step} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: done ? 1 : 0.15,
              transition: `opacity 0.35s ${i * 0.07}s`,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: done ? 'var(--af-pick)' : 'rgba(255,255,255,0.15)',
                boxShadow: done ? '0 0 6px var(--af-pick)' : 'none',
                transition: 'background 0.3s, box-shadow 0.3s',
              }} />
              <span style={{ fontSize: 12, color: done ? 'var(--af-t2)' : 'rgba(255,255,255,0.2)' }}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
