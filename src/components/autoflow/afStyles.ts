// Helpers de style partagés pour le « chrome sombre » AutoFlow.
//
// Les composants AutoFlow stylent en inline via les tokens CSS `--af-*` (choix
// de marque assumé). Ce module factorise les motifs les plus répétés pour
// réduire la duplication SANS changer le rendu : chaque helper produit la même
// chaîne CSS que les littéraux d'origine. Migration complète vers Tailwind
// volontairement non faite (risque élevé, gain faible).

/** Overlay neutre piloté par --af-overlay-rgb : `rgba(var(--af-overlay-rgb), a)`. */
export const afOverlay = (alpha: number): string =>
  `rgba(var(--af-overlay-rgb),${alpha})`;

/** Couleurs sémantiques AutoFlow (tokens). */
export const afColor = {
  review: 'var(--af-review)',
  pick: 'var(--af-pick)',
  reject: 'var(--af-reject)',
  t1: 'var(--af-t1)',
  t2: 'var(--af-t2)',
  bg: 'var(--af-bg)',
} as const;

/** Style d'un bouton « nu » (réinitialise l'apparence native). */
export const afResetButton = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
} as const;
