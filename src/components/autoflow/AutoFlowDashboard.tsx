import React, { useMemo, useState, useCallback } from 'react';
import JSZip from 'jszip';
import { AfPhoto, AfClass } from './afUtils';

// ── ZIP export ────────────────────────────────────────────────────────────────

async function downloadPicksAsZip(
  picks: AfPhoto[],
  onProgress: (pct: number) => void,
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder('TRIPHOTOIA_picks');
  if (!folder) throw new Error('Impossible de créer le dossier ZIP');

  const withUrl = picks.filter((p) => p.previewUrl);

  // Add each pick photo to the ZIP
  for (let i = 0; i < withUrl.length; i++) {
    const p = withUrl[i];
    try {
      const resp = await fetch(p.previewUrl!);
      const blob = await resp.blob();

      // Sanitize filename and ensure extension
      let filename = p.name.replace(/[/\\:*?"<>|]/g, '_');
      if (!filename.match(/\.(jpe?g|png|webp|heic|heif|tiff?|cr2|nef|dng|arw|raf|rw2)$/i)) {
        filename += '.jpg';
      }

      // Deduplicate filenames within the ZIP
      const base = filename.replace(/(\.\w+)$/, '');
      const ext  = filename.match(/(\.\w+)$/)?.[1] ?? '.jpg';
      const dedupedName = i === 0 ? filename : `${base}_${i}${ext}`;

      folder.file(dedupedName, blob);
    } catch {
      // Skip photos that can't be fetched (revoked blob URLs, etc.)
    }
    onProgress(Math.round(((i + 1) / withUrl.length) * 80));
  }

  // Generate ZIP
  onProgress(85);
  const content = await zip.generateAsync(
    { type: 'blob', compression: 'STORE' },
    (meta) => onProgress(85 + Math.round(meta.percent * 0.15)),
  );

  // Trigger browser download
  const url = URL.createObjectURL(content);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `TRIPHOTOIA_picks_${withUrl.length}_photos.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  onProgress(100);
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface MiniPhProps {
  photo: AfPhoto;
  size?: number;
}

const MiniPh: React.FC<MiniPhProps> = ({ photo, size = 46 }) => {
  const col = photo.score >= 80 ? 'var(--af-pick)' : photo.score >= 60 ? 'var(--af-review)' : 'var(--af-reject)';
  return (
    <div style={{
      width: size, height: Math.round(size * 0.67), borderRadius: 4, flexShrink: 0,
      background: photo.previewUrl
        ? `url(${photo.previewUrl}) center/cover`
        : `linear-gradient(135deg,${photo.gradient[0]},${photo.gradient[1]})`,
      border: '1.5px solid rgba(255,255,255,0.06)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 2, right: 2, fontSize: 8, fontWeight: 800, color: col, lineHeight: 1,
      }}>
        {photo.score}
      </div>
    </div>
  );
};

interface PileCardProps {
  icon: string;
  title: string;
  count: number;
  colRgb: string;
  confidence?: number;
  timeEst?: string;
  photos: AfPhoto[];
  primary?: (() => void) | null;
  primaryLabel?: React.ReactNode;
  secondary?: () => void;
  secondaryLabel?: string;
  /** Extra CTA slot — e.g. download button */
  extra?: React.ReactNode;
}

const PileCard: React.FC<PileCardProps> = ({
  icon, title, count, colRgb, confidence, timeEst, photos,
  primary, primaryLabel, secondary, secondaryLabel, extra,
}) => {
  const [hov, setHov] = React.useState(false);
  const iconPaths: Record<string, string> = {
    check:  'M20 6L9 17l-5-5',
    swipe:  'M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4',
    x:      'M18 6L6 18M6 6l12 12',
    timer:  'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
  };

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1, borderRadius: 16, padding: '22px 20px',
        display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0,
        background: hov ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        border: `1px solid rgba(255,255,255,${hov ? 0.1 : 0.05})`,
        transition: 'all 0.15s',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: 'rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width={17} height={17} viewBox="0 0 24 24"
              fill="none" stroke={`rgb(${colRgb})`} strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round">
              <path d={iconPaths[icon] ?? ''} />
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#ccd0da' }}>{title}</span>
        </div>
        {confidence != null && (
          <div style={{
            padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: 'rgba(255,255,255,0.06)', color: 'var(--af-t2)',
          }}>
            Conf. {confidence}%
          </div>
        )}
        {timeEst && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: 'rgba(255,255,255,0.06)', color: 'var(--af-t2)',
          }}>
            ~{timeEst}
          </div>
        )}
      </div>

      {/* Mini photo grid */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', minHeight: 30 }}>
        {photos.length > 0
          ? photos.slice(0, 9).map((p) => <MiniPh key={p.id} photo={p} size={46} />)
          : <span style={{ fontSize: 12, color: '#2a2a2a', fontStyle: 'italic', alignSelf: 'center' }}>Aucune photo</span>
        }
        {photos.length > 9 && (
          <div style={{
            width: 46, height: 31, borderRadius: 4, flexShrink: 0,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#444',
          }}>+{photos.length - 9}</div>
        )}
      </div>

      {/* Big count */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 40, fontWeight: 800, color: '#f0f0f7', lineHeight: 1 }}>{count}</span>
        <span style={{ fontSize: 14, color: '#444' }}>photos</span>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', gap: 7 }}>
          {primary && (
            <button onClick={primary} style={{
              flex: 1, padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', outline: 'none',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: '#e8e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              transition: 'background 0.1s',
            }}>{primaryLabel}</button>
          )}
          {secondary && (
            <button onClick={secondary} style={{
              padding: '10px 14px', borderRadius: 9, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', border: '1px solid rgba(255,255,255,0.07)',
              background: 'transparent', color: 'var(--af-t3)', outline: 'none',
            }}>{secondaryLabel}</button>
          )}
        </div>
        {extra}
      </div>
    </div>
  );
};

const Filmstrip: React.FC<{
  photos: AfPhoto[];
  onOpen: (id: string) => void;
}> = ({ photos, onOpen }) => {
  const sorted = useMemo(() => [...photos].sort((a, b) => b.score - a.score), [photos]);
  return (
    <div style={{
      borderTop: '1px solid rgba(255,255,255,0.05)',
      background: 'rgba(13,13,20,0.8)',
      padding: '8px 12px', display: 'flex', gap: 4, overflowX: 'auto',
      flexShrink: 0, alignItems: 'center',
    }}>
      <span style={{
        fontSize: 9, color: 'var(--af-t3)', flexShrink: 0, marginRight: 6,
        textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700,
      }}>Pellicule</span>
      {sorted.map((p) => (
        <div key={p.id} onClick={() => onOpen(p.id)} style={{
          flexShrink: 0, width: 70, height: 47, borderRadius: 4, cursor: 'pointer', position: 'relative',
          background: p.previewUrl
            ? `url(${p.previewUrl}) center/cover`
            : `linear-gradient(135deg,${p.gradient[0]},${p.gradient[1]})`,
          border: `2px solid ${p.isPick
            ? 'rgba(134,239,172,0.65)'
            : p.isRejected ? 'rgba(252,165,165,0.4)' : 'rgba(255,255,255,0.07)'}`,
          opacity: p.isRejected ? 0.32 : 1, transition: 'border-color 0.1s',
        }}>
          <div style={{
            position: 'absolute', bottom: 2, right: 3, fontSize: 8, fontWeight: 800, lineHeight: 1.3,
            color: 'rgba(255,255,255,0.75)', background: 'rgba(0,0,0,0.55)',
            borderRadius: 2, padding: '1px 3px',
          }}>{p.score}</div>
        </div>
      ))}
    </div>
  );
};

// ── Download button component ─────────────────────────────────────────────────

const DownloadZipButton: React.FC<{ picks: AfPhoto[] }> = ({ picks }) => {
  const [status, setStatus] = useState<'idle' | 'zipping' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);

  const handleDownload = useCallback(async () => {
    if (status === 'zipping') return;
    setStatus('zipping');
    setProgress(0);
    try {
      await downloadPicksAsZip(picks, setProgress);
      setStatus('done');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, [picks, status]);

  const hasPicks = picks.filter((p) => p.previewUrl).length > 0;

  if (status === 'zipping') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px', borderRadius: 9,
        background: 'rgba(134,239,172,0.08)', border: '1px solid rgba(134,239,172,0.2)',
      }}>
        <div style={{
          width: 13, height: 13, borderRadius: '50%',
          border: '2px solid rgba(134,239,172,0.3)',
          borderTopColor: 'var(--af-pick)',
          animation: 'af-spin 0.7s linear infinite', flexShrink: 0,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--af-pick)', fontWeight: 600, marginBottom: 3 }}>
            Compression… {progress}%
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progress}%`, borderRadius: 3,
              background: 'linear-gradient(90deg, var(--af-pick), #34d399)',
              transition: 'width 0.2s ease',
            }} />
          </div>
        </div>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        padding: '10px 0', borderRadius: 9,
        background: 'rgba(134,239,172,0.1)', border: '1px solid rgba(134,239,172,0.3)',
        color: 'var(--af-pick)', fontSize: 13, fontWeight: 700,
      }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        Téléchargé !
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        padding: '10px 0', borderRadius: 9,
        background: 'rgba(252,165,165,0.08)', border: '1px solid rgba(252,165,165,0.2)',
        color: 'var(--af-reject)', fontSize: 12, fontWeight: 600,
      }}>
        Erreur — réessayez
      </div>
    );
  }

  return (
    <button
      onClick={hasPicks ? handleDownload : undefined}
      disabled={!hasPicks}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '10px 0', borderRadius: 9, fontSize: 13, fontWeight: 700,
        cursor: hasPicks ? 'pointer' : 'not-allowed',
        outline: 'none', transition: 'all 0.15s',
        background: hasPicks
          ? 'linear-gradient(135deg, rgba(134,239,172,0.15), rgba(52,211,153,0.08))'
          : 'rgba(255,255,255,0.02)',
        border: hasPicks
          ? '1px solid rgba(134,239,172,0.35)'
          : '1px solid rgba(255,255,255,0.05)',
        color: hasPicks ? 'var(--af-pick)' : '#333',
        opacity: hasPicks ? 1 : 0.4,
      }}
    >
      {/* Download arrow icon */}
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
      Télécharger les picks ({picks.filter((p) => p.previewUrl).length})
      <svg width={10} height={10} viewBox="0 0 24 24" fill="none"
        stroke="rgba(134,239,172,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="rgba(134,239,172,0.2)" stroke="none" />
      </svg>
    </button>
  );
};

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface AutoFlowDashboardProps {
  photos: AfPhoto[];
  onStartSwipe: () => void;
  onGrid: (cls: AfClass) => void;
  onDupCompare: () => void;
  onClose: () => void;
  onPhotoOpen?: (id: string) => void;
}

export const AutoFlowDashboard: React.FC<AutoFlowDashboardProps> = ({
  photos, onStartSwipe, onGrid, onDupCompare, onClose, onPhotoOpen,
}) => {
  const keeps   = photos.filter((p) => p.cls === 'keep');
  const reviews = photos.filter((p) => p.cls === 'review');
  const rejects = photos.filter((p) => p.cls === 'reject');

  const avgScore = photos.length > 0
    ? Math.round(photos.reduce((a, p) => a + p.score, 0) / photos.length)
    : 0;

  const timeEst = reviews.length === 0
    ? '0 s'
    : reviews.length === 1
      ? '5 s'
      : `${Math.ceil(reviews.length * 5 / 60)} min`;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--af-bg)', zIndex: 100,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Space Grotesk', sans-serif",
    }}>
      {/* ── Top bar ── */}
      <div style={{
        padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(7,7,12,0.9)', backdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Logo */}
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'linear-gradient(135deg, var(--af-review), var(--af-reject))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#000" stroke="none" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', color: '#f0f0f7', lineHeight: 1 }}>
              TRIPHOTOIA
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--af-review)', textTransform: 'uppercase', lineHeight: 1.4 }}>
              AutoFlow v2
            </div>
          </div>
        </div>

        {/* Live counters */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {[
            { label: `${photos.length} photos`,   col: 'rgba(255,255,255,0.5)' },
            { label: `${keeps.length} picks`,      col: 'var(--af-pick)' },
            { label: `${rejects.length} rejetées`, col: 'var(--af-reject)' },
          ].map(({ label, col }) => (
            <div key={label} style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)',
              color: col,
            }}>{label}</div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* ⬇ Bouton ZIP dans la topbar aussi */}
          {keeps.length > 0 && (
            <DownloadZipButton picks={keeps} />
          )}
          <button onClick={onClose} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)', color: 'var(--af-t2)', outline: 'none',
          }}>
            Retour application
          </button>
        </div>
      </div>

      {/* ── Hero ── */}
      <div style={{ padding: '20px 28px 0', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--af-pick)', boxShadow: '0 0 10px var(--af-pick)',
            animation: 'af-pulse 1.6s ease infinite',
          }} />
          <span style={{
            fontSize: 11, fontWeight: 800, color: 'var(--af-pick)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>AutoFlow Terminé</span>
        </div>
        <h2 style={{
          fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px',
          color: 'var(--af-t1)',
        }}>
          L'IA a pré-trié vos {photos.length} photos
        </h2>
        <p style={{ fontSize: 13, color: 'var(--af-t3)', margin: 0 }}>
          {reviews.length > 0
            ? `Révisez seulement les ${reviews.length} incertaines — les autres sont automatiquement gérées.`
            : 'Tout a été trié automatiquement. Validez en un clic !'
          }
        </p>
      </div>

      {/* ── 3 Pile cards ── */}
      <div style={{
        display: 'flex', gap: 14, flex: 1, minHeight: 0,
        padding: '18px 28px 0',
      }}>
        <PileCard
          icon="check" title="IA Conservé" count={keeps.length}
          colRgb="16,185,129" confidence={91} photos={keeps}
          primary={() => onGrid('keep')}
          primaryLabel="Voir les picks"
          extra={<DownloadZipButton picks={keeps} />}
        />
        <PileCard
          icon="swipe" title="À Revoir" count={reviews.length}
          colRgb="245,158,11" timeEst={timeEst} photos={reviews}
          primary={reviews.length > 0 ? onStartSwipe : null}
          primaryLabel="Mode Swipe →"
          secondary={() => onGrid('review')}
          secondaryLabel="Grille"
        />
        <PileCard
          icon="x" title="IA Rejeté" count={rejects.length}
          colRgb="244,63,94" confidence={88} photos={rejects}
          secondary={() => onGrid('reject')}
          secondaryLabel="Voir / Restaurer"
        />
      </div>

      {/* ── Stats bar ── */}
      <div style={{
        margin: '14px 28px 0',
        display: 'flex', background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, overflow: 'hidden',
      }}>
        {[
          { label: 'Score moyen IA',     val: avgScore,                                     col: 'var(--af-review)', action: undefined },
          { label: 'Doublons détectés',  val: photos.filter((p) => p.isDup).length,         col: 'rgba(255,255,255,0.55)', action: onDupCompare },
          { label: 'Photos floues',      val: photos.filter((p) => p.isBlurry).length,      col: 'rgba(255,255,255,0.55)', action: undefined },
          { label: 'Picks automatiques', val: keeps.length,                                 col: 'rgba(255,255,255,0.55)', action: undefined },
        ].map(({ label, val, col, action }, i, arr) => (
          <div key={label} onClick={action} style={{
            flex: 1, padding: '14px 0', textAlign: 'center',
            borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            cursor: action ? 'pointer' : 'default', transition: 'background 0.1s',
          }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: col, lineHeight: 1, marginBottom: 4 }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--af-t3)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Filmstrip ── */}
      <div style={{ marginTop: 14, flexShrink: 0 }}>
        <Filmstrip photos={photos} onOpen={onPhotoOpen ?? (() => {})} />
      </div>
    </div>
  );
};
