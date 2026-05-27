import { useEffect, useRef } from 'react';

export interface KeyboardShortcutHandlers {
  onRating?: (rating: number) => void;       // 0-5
  onColorLabel?: (index: number) => void;    // 6=rouge 7=jaune 8=vert 9=bleu 0+shift=violet
  onPick?: () => void;        // P
  onReject?: () => void;      // X
  onUnflag?: () => void;      // U
  onNext?: () => void;        // → ou J
  onPrevious?: () => void;    // ← ou K
  onFullscreen?: () => void;  // F
  onCompare?: () => void;     // C
  onDevelop?: () => void;     // D
  onExport?: () => void;      // E
  onDelete?: () => void;      // Del / Backspace
  onUndo?: () => void;        // Ctrl+Z / Cmd+Z
  onHelpToggle?: () => void;  // ?
  onSelectAll?: () => void;   // Ctrl+A
  onCopyMeta?: () => void;    // Ctrl+Shift+C
  onPasteMeta?: () => void;   // Ctrl+Shift+V
  onCulling?: () => void;     // L
}

const SINGLE_KEY_SHORTCUTS = new Set([
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'p', 'x', 'u', 'l', 'f', 'c', 'd', 'e',
  'j', 'k',
  'ArrowLeft', 'ArrowRight', 'Delete', 'Backspace',
  '?',
]);

export function useKeyboardShortcuts(
  handlers: KeyboardShortcutHandlers,
  enabled: boolean = true
) {
  // Stable ref so adding/removing the listener only depends on `enabled`
  const handlersRef = useRef<KeyboardShortcutHandlers>(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const h = handlersRef.current;
      const target = event.target as HTMLElement;
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Ctrl+Z / Cmd+Z — Undo (autorisé partout sauf input)
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !inInput) {
        event.preventDefault();
        h.onUndo?.();
        return;
      }

      // Ctrl+A / Cmd+A — Select All (autorisé hors input)
      if ((event.ctrlKey || event.metaKey) && event.key === 'a' && !inInput) {
        event.preventDefault();
        h.onSelectAll?.();
        return;
      }

      // Ctrl+Shift+C — Copier métadonnées
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'c' && !inInput) {
        event.preventDefault();
        h.onCopyMeta?.();
        return;
      }

      // Ctrl+Shift+V — Coller métadonnées
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'v' && !inInput) {
        event.preventDefault();
        h.onPasteMeta?.();
        return;
      }

      // Ignorer les raccourcis simples si on est dans un champ texte
      if (inInput) return;

      // Ignorer si une touche modificatrice est pressée (sauf Shift pour ?)
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key;

      if (SINGLE_KEY_SHORTCUTS.has(key) || SINGLE_KEY_SHORTCUTS.has(key.toLowerCase())) {
        event.preventDefault();
      }

      // Notation par étoiles (0-5)
      if (['0', '1', '2', '3', '4', '5'].includes(key)) {
        h.onRating?.(parseInt(key));
        return;
      }

      // Labels couleur (6=rouge 7=jaune 8=vert 9=bleu — index 0-3 dans COLOR_LABEL_KEYS)
      if (['6', '7', '8', '9'].includes(key)) {
        h.onColorLabel?.(parseInt(key) - 6); // 6→0, 7→1, 8→2, 9→3
        return;
      }

      // Flags Lightroom
      switch (key.toLowerCase()) {
        case 'p': h.onPick?.();   return;
        case 'x': h.onReject?.(); return;
        case 'u': h.onUnflag?.(); return;
      }

      // Navigation (flèches + J/K style vim/Lightroom)
      switch (key) {
        case 'ArrowRight':
        case 'j':
        case 'J':
          h.onNext?.();
          return;
        case 'ArrowLeft':
        case 'k':
        case 'K':
          h.onPrevious?.();
          return;
      }

      // Actions
      switch (key.toLowerCase()) {
        case 'l':         h.onCulling?.();    return;
        case 'f':         h.onFullscreen?.(); return;
        case 'c':         h.onCompare?.();    return;
        case 'd':         h.onDevelop?.();    return;
        case 'e':         h.onExport?.();     return;
        case 'delete':
        case 'backspace': h.onDelete?.();     return;
      }

      // Aide (? = Shift+/ en QWERTY ou touche dédiée)
      if (key === '?') {
        h.onHelpToggle?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]); // ← le listener n'est (re)créé que si enabled change
}
