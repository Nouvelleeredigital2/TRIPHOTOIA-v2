import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AfPhoto } from './afUtils';
import { AfStars } from './AfStars';

type SwipeDecision = 'pick' | 'reject' | 'favorite' | 'review';

interface SwipeModeProps {
  photos: AfPhoto[];
  onDecision: (id: string, action: SwipeDecision) => void;
  onRate?: (id: string, rating: number) => void;
  onUndoLast?: () => boolean;
  decisionHistory?: Array<{ id: string; name: string; action: SwipeDecision }>;
  onDone: () => void;
}

const S = {
  fixed: {
    position: 'fixed' as const,
    inset: 0,
    background: 'var(--af-bg)',
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column' as const,
    fontFamily: "'Space Grotesk', sans-serif",
  },
};

const AfIcon: React.FC<{ n: string; sz?: number; c?: string }> = ({
  n,
  sz = 15,
  c = 'currentColor',
}) => {
  const paths: Record<string, string> = {
    chevL: 'M15 18l-6-6 6-6',
    x: 'M18 6L6 18M6 6l12 12',
    check: 'M20 6L9 17l-5-5',
    star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  };
  return (
    <svg
      width={sz}
      height={sz}
      viewBox="0 0 24 24"
      fill={n === 'star' ? c : 'none'}
      stroke={n === 'star' ? 'none' : c}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[n] ?? ''} />
    </svg>
  );
};


const CardBackground: React.FC<{
  photo: AfPhoto;
  style?: React.CSSProperties;
}> = ({ photo, style }) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      borderRadius: 14,
      background: photo.previewUrl
        ? undefined
        : `linear-gradient(135deg,${photo.gradient[0]},${photo.gradient[1]})`,
      backgroundImage: photo.previewUrl
        ? `url(${photo.previewUrl})`
        : undefined,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      ...style,
    }}
  />
);

export const SwipeMode: React.FC<SwipeModeProps> = ({
  photos,
  onDecision,
  onRate,
  onUndoLast,
  decisionHistory = [],
  onDone,
}) => {
  const [idx, setIdx] = useState(0);
  const [offset, setOffset] = useState(0);
  const [exiting, setExiting] = useState<'left' | 'right' | null>(null);
  const [finished, setFinished] = useState(false);
  const [localHistory, setLocalHistory] = useState<
    Array<{ id: string; index: number }>
  >([]);
  const dragStart = useRef<number | null>(null);
  const isDragging = useRef(false);

  const photo = photos[idx];
  const nextPh = photos[idx + 1];
  const next2Ph = photos[idx + 2];

  const decide = useCallback(
    (action: SwipeDecision) => {
      if (exiting || finished || !photo) return;
      const dir = action === 'reject' ? 'left' : 'right';
      setExiting(dir);
      setTimeout(() => {
        setLocalHistory((prev) =>
          [{ id: photo.id, index: idx }, ...prev].slice(0, 5)
        );
        onDecision(photo.id, action);
        if (idx >= photos.length - 1) {
          setFinished(true);
          setTimeout(onDone, 1200);
        } else {
          setIdx((i) => i + 1);
          setOffset(0);
          setExiting(null);
        }
      }, 270);
    },
    [exiting, finished, photo, idx, photos.length, onDecision, onDone]
  );

  const undoLast = useCallback(() => {
    const lastLocalDecision = localHistory[0];
    if (!lastLocalDecision) return;

    const restored = onUndoLast?.();
    if (restored === false) return;

    setLocalHistory((prev) => prev.slice(1));
    setFinished(false);
    setExiting(null);
    setOffset(0);
    setIdx(lastLocalDecision.index);
  }, [localHistory, onUndoLast]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') decide('reject');
      if (e.key === 'ArrowRight') decide('pick');
      if (e.key === 'ArrowUp') decide('favorite');
      if (/^[1-5]$/.test(e.key) && photo) {
        e.preventDefault();
        onRate?.(photo.id, Number(e.key));
      }
      if (
        e.key === 'Backspace' ||
        (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey))
      ) {
        e.preventDefault();
        undoLast();
      }
      if (e.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [decide, onDone, onRate, photo, undoLast]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragStart.current = e.clientX;
    isDragging.current = false;

    const onMove = (e: MouseEvent) => {
      if (dragStart.current == null) return;
      const dx = e.clientX - dragStart.current;
      if (Math.abs(dx) > 4) isDragging.current = true;
      setOffset(dx);
    };
    const onUp = (e: MouseEvent) => {
      if (dragStart.current == null) return;
      const dx = e.clientX - dragStart.current;
      if (isDragging.current) {
        if (dx < -80) decide('reject');
        else if (dx > 80) decide('pick');
        else setOffset(0);
      }
      dragStart.current = null;
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (finished || !photo) {
    return (
      <div
        style={{
          ...S.fixed,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 60 }}>🎉</div>
        <h2
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--af-t1)',
            margin: 0,
          }}
        >
          Revision terminee !
        </h2>
        <p style={{ fontSize: 14, color: 'var(--af-t2)', margin: 0 }}>
          Retour au tableau de bord...
        </p>
      </div>
    );
  }

  const pickOp = Math.min(1, Math.max(0, offset / 110));
  const rejectOp = Math.min(1, Math.max(0, -offset / 110));
  const scoreCol =
    photo.score >= 80
      ? 'var(--af-pick)'
      : photo.score >= 60
        ? 'var(--af-review)'
        : 'var(--af-reject)';

  const cardTransform = exiting
    ? `translateX(${exiting === 'left' ? '-160vw' : '160vw'}) rotate(${exiting === 'left' ? -16 : 16}deg)`
    : `translateX(${offset}px) rotate(${offset * 0.022}deg)`;

  const behindScale = Math.min(1, 0.96 + Math.abs(offset) / 4000);
  const behindY = Math.max(0, 14 - Math.abs(offset) / 14);
  const progress = (idx / Math.max(1, photos.length)) * 100;

  return (
    <div style={S.fixed}>
      {/* ── Header ── */}
      <div
        style={{
          padding: '10px 20px',
          borderBottom: '1px solid rgba(var(--af-overlay-rgb),0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          gap: 16,
        }}
      >
        <button
          onClick={onDone}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 12px',
            cursor: 'pointer',
            background: 'rgba(var(--af-overlay-rgb),0.05)',
            border: '1px solid rgba(var(--af-overlay-rgb),0.08)',
            borderRadius: 20,
            fontSize: 12,
            color: 'var(--af-t3)',
            outline: 'none',
            flexShrink: 0,
          }}
        >
          <AfIcon n="chevL" sz={12} c="var(--af-t3)" /> Retour
        </button>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            maxWidth: 280,
          }}
        >
          <div
            style={{
              height: 3,
              background: 'rgba(var(--af-overlay-rgb),0.08)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                background: 'var(--af-review)',
                borderRadius: 2,
                width: `${progress}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: 'var(--af-t3)' }}>
              {idx} triee{idx > 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: 10, color: 'var(--af-t3)' }}>
              {photos.length - idx} restante{photos.length - idx > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <span
          style={{
            fontSize: 12,
            color: 'var(--af-t3)',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {idx + 1}{' '}
          <span style={{ color: 'rgba(var(--af-overlay-rgb),0.15)' }}>
            / {photos.length}
          </span>
        </span>

        <button
          onClick={undoLast}
          disabled={localHistory.length === 0}
          style={{
            padding: '5px 10px',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            cursor: localHistory.length > 0 ? 'pointer' : 'not-allowed',
            border: '1px solid rgba(var(--af-overlay-rgb),0.08)',
            background:
              localHistory.length > 0
                ? 'rgba(var(--af-overlay-rgb),0.06)'
                : 'rgba(var(--af-overlay-rgb),0.025)',
            color:
              localHistory.length > 0
                ? 'var(--af-t2)'
                : 'rgba(var(--af-overlay-rgb),0.2)',
          }}
        >
          Annuler
        </button>
      </div>

      {/* ── Swipe Arena ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Reject hint — left */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '20%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            zIndex: 1,
            opacity: Math.max(0.12, rejectOp * 0.9),
            transition: 'opacity 0.1s',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontSize: 42,
              filter: 'drop-shadow(0 0 16px var(--af-reject))',
            }}
          >
            ✗
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: 'var(--af-reject)',
              letterSpacing: '0.06em',
            }}
          >
            REJETER
          </span>
          <span
            style={{ fontSize: 10, color: 'rgba(var(--af-overlay-rgb),0.15)' }}
          >
            ← ou drag
          </span>
        </div>

        {/* Pick hint — right */}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: '20%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            zIndex: 1,
            opacity: Math.max(0.12, pickOp * 0.9),
            transition: 'opacity 0.1s',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontSize: 42,
              filter: 'drop-shadow(0 0 16px var(--af-pick))',
            }}
          >
            ✓
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: 'var(--af-pick)',
              letterSpacing: '0.06em',
            }}
          >
            PICK
          </span>
          <span
            style={{ fontSize: 10, color: 'rgba(var(--af-overlay-rgb),0.15)' }}
          >
            → ou drag
          </span>
        </div>

        {/* Card stack */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* N+2 background card */}
          {next2Ph && (
            <div
              style={{
                position: 'absolute',
                zIndex: 1,
                width: 'min(52vw, 580px)',
                aspectRatio: '3/2',
                borderRadius: 14,
                overflow: 'hidden',
                transform: 'translateY(28px) scale(0.91)',
                opacity: 0.25,
              }}
            >
              <CardBackground photo={next2Ph} />
            </div>
          )}

          {/* N+1 card */}
          {nextPh && (
            <div
              style={{
                position: 'absolute',
                zIndex: 2,
                width: 'min(52vw, 580px)',
                aspectRatio: '3/2',
                borderRadius: 14,
                overflow: 'hidden',
                transform: `translateY(${behindY}px) scale(${behindScale})`,
                opacity: 0.5 + Math.abs(offset) / 400,
                transition: 'transform 0.15s, opacity 0.15s',
              }}
            >
              <CardBackground photo={nextPh} />
            </div>
          )}

          {/* Current card — surface de swipe (drag), pas un bouton ; les décisions
              clavier (flèches) sont gérées par l'effet keydown global d'AutoFlow. */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            onMouseDown={handleMouseDown}
            className="af-grab"
            style={{
              position: 'relative',
              zIndex: 3,
              userSelect: 'none',
              width: 'min(52vw, 580px)',
              aspectRatio: '3/2',
              borderRadius: 14,
              overflow: 'hidden',
              boxShadow: '0 32px 72px rgba(0,0,0,0.75)',
              transform: cardTransform,
              transition: exiting
                ? 'transform 0.27s ease-out'
                : offset
                  ? 'none'
                  : 'transform 0.12s ease',
            }}
          >
            <CardBackground photo={photo} />

            {/* Pick tint */}
            {pickOp > 0.04 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 5,
                  pointerEvents: 'none',
                  background: `rgba(var(--af-pick-rgb),${pickOp * 0.22})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingRight: 28,
                }}
              >
                <span
                  style={{
                    fontSize: 38,
                    fontWeight: 900,
                    color: 'var(--af-pick)',
                    opacity: pickOp,
                    transform: `scale(${0.7 + pickOp * 0.3})`,
                  }}
                >
                  PICK ✓
                </span>
              </div>
            )}

            {/* Reject tint */}
            {rejectOp > 0.04 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 5,
                  pointerEvents: 'none',
                  background: `rgba(var(--af-reject-rgb),${rejectOp * 0.22})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  paddingLeft: 28,
                }}
              >
                <span
                  style={{
                    fontSize: 38,
                    fontWeight: 900,
                    color: 'var(--af-reject)',
                    opacity: rejectOp,
                    transform: `scale(${0.7 + rejectOp * 0.3})`,
                  }}
                >
                  ✗ REJETER
                </span>
              </div>
            )}

            {/* Score badge */}
            <div
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                zIndex: 6,
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 800,
                background: 'rgba(0,0,0,0.65)',
                backdropFilter: 'blur(6px)',
                color: scoreCol,
              }}
            >
              {photo.score}
            </div>

            {/* Badges */}
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                zIndex: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {photo.isDup && (
                <div
                  style={{
                    padding: '1px 6px',
                    background: 'rgba(139,92,246,0.85)',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#fff',
                  }}
                >
                  x2
                </div>
              )}
              {photo.isBlurry && (
                <div
                  style={{
                    padding: '1px 6px',
                    background: 'rgba(249,115,22,0.85)',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#fff',
                  }}
                >
                  FLOU
                </div>
              )}
            </div>

            {/* Bottom overlay */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 6,
                background:
                  'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 65%)',
                borderRadius: '0 0 14px 14px',
                padding: '30px 16px 14px',
              }}
            >
              <AfStars
                rating={photo.rating}
                size={22}
                onRate={(n) => onRate?.(photo.id, n)}
              />
              <div style={{ marginTop: 7, display: 'flex', gap: 12 }}>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: 'rgba(var(--af-overlay-rgb),0.4)',
                  }}
                >
                  {photo.name}
                </span>
                {photo.iso && (
                  <span
                    style={{
                      fontSize: 11,
                      color: 'rgba(var(--af-overlay-rgb),0.25)',
                    }}
                  >
                    {photo.iso}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action buttons ── */}
      {decisionHistory.length > 0 && (
        <div
          style={{
            padding: '8px 20px 0',
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          {decisionHistory.slice(0, 3).map((entry) => (
            <div
              key={`${entry.id}-${entry.action}`}
              style={{
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                padding: '4px 8px',
                borderRadius: 7,
                fontSize: 10,
                background: 'rgba(var(--af-overlay-rgb),0.045)',
                color: 'rgba(var(--af-overlay-rgb),0.34)',
                border: '1px solid rgba(var(--af-overlay-rgb),0.06)',
              }}
            >
              {entry.action.toUpperCase()} · {entry.name}
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          padding: '14px 20px',
          borderTop: '1px solid rgba(var(--af-overlay-rgb),0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        {[
          {
            action: 'reject' as const,
            label: 'REJETER',
            sub: '← drag',
            col: 'var(--af-reject)',
            icon: 'x',
          },
          {
            action: 'favorite' as const,
            label: 'FAVORI',
            sub: '↑',
            col: 'var(--af-ai)',
            icon: 'star',
          },
          {
            action: 'pick' as const,
            label: 'PICK',
            sub: '→ drag',
            col: 'var(--af-pick)',
            icon: 'check',
          },
        ].map((b) => (
          <button
            key={b.action}
            onClick={() => decide(b.action)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
              padding: '10px 28px',
              borderRadius: 12,
              cursor: 'pointer',
              outline: 'none',
              border: '1px solid rgba(var(--af-overlay-rgb),0.08)',
              background: 'rgba(var(--af-overlay-rgb),0.05)',
              transition: 'all 0.1s',
            }}
          >
            <AfIcon n={b.icon} sz={20} c={b.col} />
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: 'rgba(var(--af-overlay-rgb),0.65)',
              }}
            >
              {b.label}
            </span>
            <span
              style={{ fontSize: 9, color: 'rgba(var(--af-overlay-rgb),0.2)' }}
            >
              {b.sub}
            </span>
          </button>
        ))}
      </div>

      {/* ── Keyboard hints ── */}
      <div
        style={{
          padding: '3px 0 8px',
          display: 'flex',
          gap: 16,
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {(
          [
            ['←', 'Rejeter'],
            ['→', 'Pick'],
            ['↑', 'Favori 5★'],
            ['1-5', 'Note'],
            ['Backspace', 'Annuler'],
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
