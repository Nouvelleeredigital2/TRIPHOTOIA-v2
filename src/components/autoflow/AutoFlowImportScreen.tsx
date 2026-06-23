import React, { useRef, useState } from 'react';
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME,
  RAW_IMPORT_EXTENSIONS,
} from '../../lib/import-policy';

interface AutoFlowImportScreenProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

// P1-A : même politique d'import que Studio Grid. L'attribut `accept` liste les
// formats raster navigateur + les extensions RAW (décodées en proxy à
// l'ingestion). La validation faisant autorité (extension + taille + signature
// réelle) est appliquée en aval dans `handleFilesSelected`.
const ACCEPT_ATTR = [
  ...ALLOWED_IMAGE_MIME,
  ...ALLOWED_IMAGE_EXTENSIONS,
  ...RAW_IMPORT_EXTENSIONS,
].join(',');

const FEATURE_PILLS = [
  { icon: '⚡', label: 'Classement auto 3 piles', col: 'var(--af-review)' },
  { icon: '↔', label: 'Mode Swipe ultra-rapide', col: 'var(--af-pick)' },
  { icon: '⊕', label: 'Détection doublons', col: 'var(--af-ai)' },
  { icon: '◎', label: 'Score netteté (heuristique)', col: 'var(--af-reject)' },
];

export const AutoFlowImportScreen: React.FC<AutoFlowImportScreenProps> = ({
  onFilesSelected,
  disabled,
}) => {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || disabled) return;
    const files = Array.from(fileList);
    // La validation (et le signalement des refus) est faite par le puits commun.
    if (files.length > 0) onFilesSelected(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 26,
        padding: 40,
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Hero copy */}
      <div style={{ textAlign: 'center', maxWidth: 520 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.1em',
            fontWeight: 700,
            color: 'var(--af-review)',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          AutoFlow — Nouveau workflow
        </div>
        <h2
          style={{
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            marginBottom: 12,
            color: 'var(--af-t1)',
            margin: '0 0 12px',
          }}
        >
          Triez 500 photos en{' '}
          <span
            style={{
              color: 'var(--af-pick)',
              textDecoration: 'underline',
              textDecorationColor: 'rgba(var(--af-pick-rgb),0.3)',
            }}
          >
            3 minutes
          </span>
        </h2>
        <p
          style={{
            fontSize: 15,
            color: 'var(--af-t3)',
            lineHeight: 1.65,
            margin: 0,
          }}
        >
          L'IA classe automatiquement chaque photo. Vous ne révisez que les cas
          incertains — en mode Swipe ultra-rapide.
        </p>
      </div>

      {/* Dropzone */}
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        style={{
          width: '100%',
          maxWidth: 480,
          borderRadius: 18,
          padding: '46px 32px',
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          border: `2px dashed ${drag ? 'var(--af-review)' : 'rgba(var(--af-overlay-rgb),0.09)'}`,
          background: drag
            ? 'rgba(var(--af-review-rgb),0.05)'
            : 'rgba(var(--af-overlay-rgb),0.02)',
          transition: 'all 0.15s',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {/* Upload icon */}
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 15,
            margin: '0 auto 14px',
            background: 'rgba(var(--af-review-rgb),0.1)',
            border: '1px solid rgba(var(--af-review-rgb),0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--af-review)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
        </div>
        <p
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--af-t2)',
            marginBottom: 4,
          }}
        >
          Glissez vos photos ici
        </p>
        <p style={{ fontSize: 13, color: 'var(--af-t3)', marginBottom: 16 }}>
          ou{' '}
          <span style={{ color: 'var(--af-review)', fontWeight: 600 }}>
            cliquer pour sélectionner
          </span>
        </p>
        {/* Format badges */}
        <div
          style={{
            display: 'flex',
            gap: 5,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          {['JPEG', 'PNG', 'WebP', 'AVIF', 'GIF'].map((f) => (
            <span
              key={f}
              style={{
                padding: '2px 8px',
                background: 'rgba(var(--af-overlay-rgb),0.05)',
                border: '1px solid rgba(var(--af-overlay-rgb),0.08)',
                borderRadius: 4,
                fontSize: 11,
                color: 'rgba(var(--af-overlay-rgb),0.3)',
              }}
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Feature pills */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {FEATURE_PILLS.map((f) => (
          <div
            key={f.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 14px',
              background: 'rgba(var(--af-overlay-rgb),0.04)',
              border: '1px solid rgba(var(--af-overlay-rgb),0.07)',
              borderRadius: 20,
            }}
          >
            <span style={{ fontSize: 13, color: f.col }}>{f.icon}</span>
            <span style={{ fontSize: 12, color: 'var(--af-t3)' }}>
              {f.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
