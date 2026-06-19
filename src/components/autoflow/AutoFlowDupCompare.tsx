import React, { useState, useEffect, useMemo } from 'react';
import { AfPhoto } from './afUtils';

interface AutoFlowDupCompareProps {
  photos: AfPhoto[];
  onDecision: (id: string, changes: Partial<AfPhoto>) => void;
  onBack: () => void;
}

interface DupGroup {
  id: string;
  photos: AfPhoto[];
}

export const AutoFlowDupCompare: React.FC<AutoFlowDupCompareProps> = ({
  photos,
  onDecision,
  onBack,
}) => {
  const groups = useMemo<DupGroup[]>(() => {
    const map = new Map<string, AfPhoto[]>();
    photos
      .filter((p) => p.isDup && p.dupGroup)
      .forEach((p) => {
        const key = p.dupGroup!;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(p);
      });
    return Array.from(map.entries())
      .map(([id, phs]) => ({ id, photos: phs }))
      .filter((g) => g.photos.length >= 2);
  }, [photos]);

  const [gIdx, setGIdx] = useState(0);

  const advance = () => {
    if (gIdx < groups.length - 1) setGIdx((i) => i + 1);
    else onBack();
  };

  const handleKeep = (keptId: string) => {
    const g = groups[gIdx];
    g.photos.forEach((p) => {
      if (p.id === keptId)
        onDecision(p.id, {
          isPick: true,
          cls: 'keep',
          isRejected: false,
          isFavorite: false,
        });
      else
        onDecision(p.id, {
          isRejected: true,
          cls: 'reject',
          isPick: false,
          isFavorite: false,
        });
    });
    advance();
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const g = groups[gIdx];
      if (!g) return;
      if (e.key === 'ArrowLeft') handleKeep(g.photos[0].id);
      if (e.key === 'ArrowRight') handleKeep(g.photos[1].id);
      if (e.key === 'Enter') advance();
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // L'écouteur est réattaché quand le groupe courant change (gIdx/groups) ;
    // handleKeep/advance/onBack opèrent sur ce groupe — déps volontaires.
  }, [gIdx, groups]);

  if (groups.length === 0) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--af-bg)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        <div style={{ fontSize: 36, opacity: 0.3 }}>⊕</div>
        <p style={{ fontSize: 14, color: 'var(--af-t2)', margin: 0 }}>
          Aucun doublon a comparer.
        </p>
        <button
          onClick={onBack}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            background: 'rgba(var(--af-overlay-rgb),0.07)',
            border: '1px solid rgba(var(--af-overlay-rgb),0.1)',
            color: 'var(--af-t2)',
            cursor: 'pointer',
            outline: 'none',
            fontSize: 13,
          }}
        >
          Retour
        </button>
      </div>
    );
  }

  const group = groups[gIdx];
  const [pA, pB] = group.photos;
  const betterScoreId = pA.score >= pB.score ? pA.id : pB.id;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--af-bg)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 20px',
          borderBottom: '1px solid rgba(var(--af-overlay-rgb),0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: 'var(--af-s1)',
        }}
      >
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 12px',
            background: 'rgba(var(--af-overlay-rgb),0.05)',
            border: '1px solid rgba(var(--af-overlay-rgb),0.08)',
            borderRadius: 20,
            fontSize: 12,
            color: 'var(--af-t3)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          ← Tableau de bord
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--af-t1)' }}>
            Comparaison doublons
          </div>
          <div style={{ fontSize: 11, color: 'var(--af-t3)' }}>
            Groupe {gIdx + 1} sur {groups.length}
          </div>
        </div>

        {/* Progress pills */}
        <div style={{ display: 'flex', gap: 5 }}>
          {groups.map((_, i) => (
            <div
              key={i}
              style={{
                height: 6,
                borderRadius: 3,
                transition: 'all 0.25s',
                width: i === gIdx ? 22 : 6,
                background:
                  i < gIdx
                    ? 'rgba(var(--af-pick-rgb),0.7)'
                    : i === gIdx
                      ? 'var(--af-review)'
                      : 'rgba(var(--af-overlay-rgb),0.1)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Side-by-side */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: 10,
          padding: 14,
          overflow: 'hidden',
        }}
      >
        {[pA, pB].map((photo, i) => {
          const isBetter = photo.id === betterScoreId;
          const sc =
            photo.score >= 80
              ? 'var(--af-pick)'
              : photo.score >= 60
                ? 'var(--af-review)'
                : 'var(--af-reject)';

          return (
            <div
              key={photo.id}
              role="button"
              tabIndex={0}
              onClick={() => handleKeep(photo.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleKeep(photo.id);
                }
              }}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                cursor: 'pointer',
                borderRadius: 14,
                padding: 14,
                border: `1.5px solid ${isBetter ? 'rgba(var(--af-review-rgb),0.28)' : 'rgba(var(--af-overlay-rgb),0.05)'}`,
                background: isBetter
                  ? 'rgba(var(--af-review-rgb),0.04)'
                  : 'rgba(var(--af-overlay-rgb),0.02)',
                transition: 'all 0.15s',
              }}
            >
              {/* Photo */}
              <div
                style={{
                  flex: 1,
                  borderRadius: 10,
                  position: 'relative',
                  overflow: 'hidden',
                  minHeight: 180,
                  background: photo.previewUrl
                    ? `url(${photo.previewUrl}) center/cover`
                    : `linear-gradient(135deg,${photo.gradient[0]},${photo.gradient[1]})`,
                }}
              >
                {isBetter && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      padding: '4px 12px',
                      background: 'var(--af-review)',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#000',
                    }}
                  >
                    IA recommande ★
                  </div>
                )}
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    padding: '4px 10px',
                    background: 'rgba(0,0,0,0.65)',
                    backdropFilter: 'blur(6px)',
                    borderRadius: 7,
                    fontSize: 18,
                    fontWeight: 800,
                    color: sc,
                  }}
                >
                  {photo.score}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background:
                      'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)',
                    padding: '16px 12px 10px',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 11,
                      color: 'rgba(var(--af-overlay-rgb),0.5)',
                    }}
                  >
                    {photo.name}
                  </div>
                </div>
              </div>

              {/* Score bars */}
              <div style={{ padding: '0 2px' }}>
                {(
                  [
                    ['Nettete', photo.sharp],
                    ['Exposition', photo.expo],
                    ['Composition', photo.comp],
                  ] as [string, number][]
                ).map(([l, v]) => {
                  const c =
                    v >= 80
                      ? 'var(--af-pick)'
                      : v >= 60
                        ? 'var(--af-review)'
                        : 'var(--af-reject)';
                  return (
                    <div key={l} style={{ marginBottom: 7 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 3,
                        }}
                      >
                        <span style={{ fontSize: 11, color: 'var(--af-t3)' }}>
                          {l}
                        </span>
                        <span
                          style={{ fontSize: 11, color: c, fontWeight: 700 }}
                        >
                          {v}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 3,
                          background: 'rgba(var(--af-overlay-rgb),0.05)',
                          borderRadius: 2,
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${v}%`,
                            background: c,
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* CTA */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleKeep(photo.id);
                }}
                style={{
                  padding: '10px 0',
                  borderRadius: 9,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  outline: 'none',
                  background: isBetter
                    ? 'var(--af-review)'
                    : 'rgba(var(--af-overlay-rgb),0.08)',
                  color: isBetter ? '#000' : 'rgba(var(--af-overlay-rgb),0.6)',
                }}
              >
                {i === 0 ? '← Garder celle-ci' : 'Garder celle-ci →'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '10px 20px',
          borderTop: '1px solid rgba(var(--af-overlay-rgb),0.05)',
          display: 'flex',
          gap: 14,
          justifyContent: 'center',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <button
          onClick={advance}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            border: '1px solid rgba(var(--af-overlay-rgb),0.1)',
            background: 'transparent',
            color: 'var(--af-t3)',
            outline: 'none',
          }}
        >
          Passer ce groupe (Enter)
        </button>
      </div>

      {/* Keyboard hints */}
      <div
        style={{
          padding: '3px 0 8px',
          display: 'flex',
          gap: 14,
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {(
          [
            ['←', 'Garder gauche'],
            ['→', 'Garder droite'],
            ['Enter', 'Passer'],
            ['Esc', 'Retour'],
          ] as [string, string][]
        ).map(([k, l]) => (
          <div
            key={k}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <span
              style={{
                padding: '1px 5px',
                background: 'rgba(var(--af-overlay-rgb),0.07)',
                borderRadius: 3,
                fontSize: 10,
                fontFamily: 'monospace',
                color: 'rgba(var(--af-overlay-rgb),0.35)',
              }}
            >
              {k}
            </span>
            <span
              style={{ fontSize: 10, color: 'rgba(var(--af-overlay-rgb),0.2)' }}
            >
              {l}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
