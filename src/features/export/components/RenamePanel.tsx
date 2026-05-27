import React, { useRef } from 'react';
import { Photo } from '../../../types';

const TOKENS = [
  { token: '{name}',    label: 'Nom',     title: 'Nom original sans extension' },
  { token: '{index}',   label: '0001',    title: 'Numéro de séquence (4 chiffres)' },
  { token: '{date}',    label: 'Date',    title: 'Date du jour AAAAMMJJ' },
  { token: '{rating}',  label: '★',       title: 'Note (0–5)' },
  { token: '{label}',   label: 'Label',   title: 'Label couleur (red, yellow…)' },
  { token: '{pick}',    label: 'Pick',    title: '"pick" si la photo est marquée Pick, sinon vide' },
];

const todayISO = new Date().toISOString().slice(0, 10).replace(/-/g, '');

function expandPreview(pattern: string, photo: Photo, index: number): string {
  const nameWithoutExt = photo.file.name.replace(/\.[^/.]+$/, '');
  const ext = photo.file.name.split('.').pop() ?? 'jpg';
  if (!pattern.trim()) return photo.file.name;

  const base = pattern
    .replace(/\{name\}/g, nameWithoutExt)
    .replace(/\{index\}/g, String(index + 1).padStart(4, '0'))
    .replace(/\{date\}/g, todayISO)
    .replace(/\{rating\}/g, String(photo.analysis?.rating ?? 0))
    .replace(/\{label\}/g, photo.analysis?.colorLabel ?? '')
    .replace(/\{pick\}/g, photo.analysis?.isPick ? 'pick' : '')
    .replace(/\{session\}/g, 'session')
    .replace(/[_-]{2,}/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');

  return `${base}.${ext}`;
}

interface RenamePanelProps {
  pattern: string;
  photos: Photo[];
  onPatternChange: (value: string) => void;
}

export function RenamePanel({ pattern, photos, onPatternChange }: RenamePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const insertToken = (token: string) => {
    const input = inputRef.current;
    if (!input) {
      onPatternChange(pattern + token);
      return;
    }
    const start = input.selectionStart ?? pattern.length;
    const end   = input.selectionEnd   ?? pattern.length;
    const next  = pattern.slice(0, start) + token + pattern.slice(end);
    onPatternChange(next);
    // Repositionner le curseur après le token
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + token.length;
      input.setSelectionRange(pos, pos);
    });
  };

  const previews = photos.slice(0, 3);

  return (
    <div className="space-y-3">
      {/* Input + tokens */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="export-rename">
          Patron de renommage
        </label>
        <input
          id="export-rename"
          ref={inputRef}
          type="text"
          value={pattern}
          onChange={(e) => onPatternChange(e.target.value)}
          placeholder="Laisser vide = nom original"
          className="w-full p-2 border rounded-md bg-background text-sm font-mono"
        />

        {/* Token chips */}
        <div className="flex flex-wrap gap-1.5">
          {TOKENS.map(({ token, label, title }) => (
            <button
              key={token}
              type="button"
              title={title}
              onClick={() => insertToken(token)}
              className="px-2 py-0.5 rounded border border-border bg-muted hover:bg-primary hover:text-primary-foreground hover:border-primary text-xs font-mono transition-colors"
            >
              {token.slice(1, -1) !== label.toLowerCase() ? label : token}
            </button>
          ))}
          {pattern && (
            <button
              type="button"
              onClick={() => onPatternChange('')}
              className="px-2 py-0.5 rounded border border-destructive/40 text-destructive text-xs hover:bg-destructive/10 transition-colors"
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      {/* Prévisualisation live */}
      {previews.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Aperçu
          </p>
          <div className="rounded-md border border-border/50 bg-muted/30 divide-y divide-border/30">
            {previews.map((photo, i) => (
              <div key={photo.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <span className="text-muted-foreground truncate max-w-[35%]" title={photo.file.name}>
                  {photo.file.name}
                </span>
                <span className="text-muted-foreground shrink-0">→</span>
                <span className="font-mono text-foreground truncate" title={expandPreview(pattern, photo, i)}>
                  {expandPreview(pattern, photo, i)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
