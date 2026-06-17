import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutRow {
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutRow[];
}

const SECTIONS: ShortcutSection[] = [
  {
    title: '🖼️ Navigation (Triage)',
    shortcuts: [
      { keys: ['←', '→'], description: 'Photo précédente / suivante' },
      {
        keys: ['K', 'J'],
        description: 'Photo précédente / suivante (Lightroom)',
      },
      {
        keys: ['L'],
        description: 'Mode culling plein écran (revue photo par photo)',
      },
      {
        keys: ['Ctrl', 'A'],
        description: 'Sélectionner toutes les photos visibles',
      },
    ],
  },
  {
    title: '⭐ Notation & Flags',
    shortcuts: [
      { keys: ['0–5'], description: 'Attribuer une note (0 = retirer)' },
      { keys: ['P'], description: 'Marquer comme Pick 🎯' },
      { keys: ['X'], description: 'Rejeter la photo ❌' },
      { keys: ['U'], description: 'Retirer tous les flags ⚪' },
    ],
  },
  {
    title: '🎨 Labels couleur',
    shortcuts: [
      { keys: ['6'], description: '🔴 Rouge' },
      { keys: ['7'], description: '🟡 Jaune' },
      { keys: ['8'], description: '🟢 Vert' },
      { keys: ['9'], description: '🔵 Bleu' },
      {
        keys: ['0+6–9'],
        description: 'Violet (via label couleur 5 = Violet dans fullscreen)',
      },
    ],
  },
  {
    title: '🔍 Plein écran',
    shortcuts: [
      { keys: ['F'], description: 'Ouvrir / fermer le plein écran' },
      { keys: ['Esc'], description: 'Fermer le plein écran' },
      { keys: ['I'], description: 'Afficher / masquer les infos' },
      { keys: ['+', '='], description: 'Zoom avant' },
      { keys: ['-'], description: 'Zoom arrière' },
      { keys: ['0–5'], description: 'Notation en plein écran' },
      { keys: ['6–9'], description: 'Labels couleur en plein écran' },
    ],
  },
  {
    title: '⚙️ Actions',
    shortcuts: [
      { keys: ['C'], description: 'Comparaison A/B de deux photos' },
      { keys: ['D'], description: 'Ajouter à la sélection Développement' },
      { keys: ['E'], description: "Aller à l'Export" },
      { keys: ['Del'], description: 'Supprimer la photo sélectionnée' },
    ],
  },
  {
    title: '📋 Presse-papier',
    shortcuts: [
      {
        keys: ['Ctrl', 'Shift', 'C'],
        description: 'Copier note / flag / label',
      },
      { keys: ['Ctrl', 'Shift', 'V'], description: 'Coller sur la sélection' },
    ],
  },
  {
    title: '🌐 Global',
    shortcuts: [
      { keys: ['Ctrl', 'Z'], description: 'Annuler la dernière action' },
      { keys: ['Caps Lock'], description: 'Auto-avance après chaque action' },
      { keys: ['?'], description: 'Afficher / masquer cette aide' },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.75rem] items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsHelp({
  open,
  onOpenChange,
}: KeyboardShortcutsHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] max-w-2xl overflow-y-auto"
        description="Liste des raccourcis clavier disponibles dans l'application."
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Raccourcis clavier
            <Badge variant="secondary" className="text-xs">
              Style Lightroom
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <div key={section.title} className="space-y-2">
              <h3 className="border-b border-border pb-1 text-xs font-semibold tracking-wider text-muted-foreground">
                {section.title}
              </h3>
              <div className="space-y-1.5">
                {section.shortcuts.map((shortcut, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-sm leading-tight text-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {shortcut.keys.map((k, ki) => (
                        <React.Fragment key={ki}>
                          <Kbd>{k}</Kbd>
                          {ki < shortcut.keys.length - 1 && (
                            <span className="text-xs text-muted-foreground">
                              +
                            </span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          Les raccourcis sont inactifs quand le curseur est dans un champ texte.
          Appuyez sur <Kbd>?</Kbd> pour ouvrir/fermer cette aide.
        </p>
      </DialogContent>
    </Dialog>
  );
}
