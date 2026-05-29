import React, { useState } from 'react';
import { AfPhoto, AfClass } from './afUtils';

interface AutoFlowGalleryProps {
  photos: AfPhoto[];
  title: string;
  cls: AfClass;
  onBack: () => void;
  onDecision: (id: string, changes: Partial<AfPhoto>) => void;
}

const ScoreRing: React.FC<{ score: number; size?: number }> = ({ score, size = 44 }) => {
  const r = size * 0.36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const col = score >= 80 ? 'var(--af-pick)' : score >= 60 ? 'var(--af-review)' : 'var(--af-reject)';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="rgba(255,255,255,0.04)" strokeWidth={size * 0.07} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col}
        strokeWidth={size * 0.07}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.4s' }} />
      <text x={size / 2} y={size / 2 + 3} textAnchor="middle" fill={col}
        fontSize={size * 0.27} fontWeight="700" fontFamily="Space Grotesk,sans-serif">
        {score}
      </text>
    </svg>
  );
};

const Stars: React.FC<{ rating: number; size?: number }> = ({ rating, size = 18 }) => (
  <div style={{ display: 'flex', gap: 2 }}>
    {[1,2,3,4,5].map((n) => (
      <span key={n} style={{
        fontSize: size, lineHeight: 1, userSelect: 'none',
        color: n <= rating ? '#f59e0b' : 'rgba(255,255,255,0.1)',
      }}>★</span>
    ))}
  </div>
);

export const AutoFlowGallery: React.FC<AutoFlowGalleryProps> = ({
  photos, title, onBack, onDecision,
}) => {
  const [sel, setSel] = useState<string | null>(null);
  const [local, setLocal] = useState<AfPhoto[]>(photos);

  const upd = (id: string, changes: Partial<AfPhoto>) => {
    setLocal((prev) => prev.map((p) => p.id === id ? { ...p, ...changes } : p));
    onDecision(id, changes);
  };

  const selected = local.find((p) => p.id === sel);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--af-bg)', zIndex: 50,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Space Grotesk', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--af-s1)', flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, fontSize: 12, color: 'var(--af-t3)', cursor: 'pointer', outline: 'none',
        }}>
          ← Tableau de bord
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--af-t2)' }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--af-t3)' }}>({local.length})</span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Photo grid */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: 10,
          display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, alignContent: 'start',
        }}>
          {local.map((p) => {
            const col = p.score >= 80 ? 'var(--af-pick)' : p.score >= 60 ? 'var(--af-review)' : 'var(--af-reject)';
            const isSel = sel === p.id;
            return (
              <div key={p.id}
                onClick={() => setSel(p.id === sel ? null : p.id)}
                role="button"
                tabIndex={0}
                aria-label={p.name}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSel(p.id === sel ? null : p.id);
                  }
                }}
                style={{
                  aspectRatio: '3/2', borderRadius: 6, cursor: 'pointer', overflow: 'hidden', position: 'relative',
                  background: p.previewUrl
                    ? `url(${p.previewUrl}) center/cover`
                    : `linear-gradient(135deg,${p.gradient[0]},${p.gradient[1]})`,
                  border: `1.5px solid ${isSel ? 'var(--af-review)' : p.isPick ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  boxShadow: isSel ? '0 0 0 2px rgba(245,158,11,0.2)' : 'none',
                  opacity: p.isRejected ? 0.38 : 1, transition: 'all 0.1s',
                }}
              >
                <div style={{
                  position: 'absolute', top: 4, right: 4, fontSize: 9, fontWeight: 800, color: col,
                  background: 'rgba(0,0,0,0.6)', borderRadius: 3, padding: '1px 4px',
                }}>{p.score}</div>
                {p.isPick && (
                  <div style={{
                    position: 'absolute', top: 4, left: 4, width: 14, height: 14,
                    borderRadius: '50%', background: 'var(--af-pick)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 8, color: '#000', fontWeight: 800,
                  }}>✓</div>
                )}
                {p.isBlurry && (
                  <div style={{
                    position: 'absolute', bottom: 4, left: 4,
                    background: 'rgba(249,115,22,0.8)', borderRadius: 3,
                    fontSize: 8, fontWeight: 700, color: '#fff', padding: '1px 4px',
                  }}>FLOU</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Inline detail panel */}
        {selected && (
          <div style={{
            width: 240, borderLeft: '1px solid rgba(255,255,255,0.05)',
            background: 'var(--af-s1)', padding: 14,
            display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto',
          }}>
            {/* Thumbnail */}
            <div style={{
              aspectRatio: '3/2', flexShrink: 0,
              background: selected.previewUrl
                ? `url(${selected.previewUrl}) center/cover`
                : `linear-gradient(135deg,${selected.gradient[0]},${selected.gradient[1]})`,
              borderRadius: 8, position: 'relative',
            }}>
              <div style={{ position: 'absolute', bottom: 6, right: 6 }}>
                <ScoreRing score={selected.score} size={44} />
              </div>
            </div>

            {/* Meta */}
            <div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--af-t2)', marginBottom: 2 }}>
                {selected.name}
              </div>
            </div>

            <Stars rating={selected.rating} size={20} />

            {/* Pick / Reject buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => upd(selected.id, { isPick: !selected.isPick, isRejected: false })} style={{
                flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', border: 'none', outline: 'none',
                background: selected.isPick ? 'var(--af-pick)' : 'rgba(16,185,129,0.1)',
                color: selected.isPick ? '#000' : 'var(--af-pick)',
              }}>{selected.isPick ? '✓ Pick' : 'Pick'}</button>
              <button onClick={() => upd(selected.id, { isRejected: !selected.isRejected, isPick: false })} style={{
                flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', border: 'none', outline: 'none',
                background: selected.isRejected ? 'var(--af-reject)' : 'rgba(244,63,94,0.1)',
                color: selected.isRejected ? '#000' : 'var(--af-reject)',
              }}>{selected.isRejected ? '✓ Rejete' : 'Rejeter'}</button>
            </div>

            {/* AI suggestion */}
            {selected.suggestion && (
              <div style={{
                padding: 8, background: 'rgba(245,158,11,0.05)',
                border: '1px solid rgba(245,158,11,0.1)', borderRadius: 7,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, color: 'var(--af-review)',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                  }}>⚡ Suggestion IA</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--af-t3)', lineHeight: 1.5, fontStyle: 'italic', margin: 0 }}>
                  {selected.suggestion}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
