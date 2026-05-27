# TRIPHOTOIA — Roadmap des améliorations de flux

> Document de travail — généré le 2026-05-27  
> Base de code : Vite + React 19 + Zustand + Tailwind + Framer Motion + Gemini AI

---

## Statut global

| # | Fonctionnalité | Priorité | Effort | Statut |
|---|---------------|----------|--------|--------|
| 1 | Auto-avance après action | 🔴 Critique | S | ✅ Livré |
| 2 | Mode culling plein écran | 🔴 Critique | M | ☐ À faire |
| 3 | Export filtré par note / flag | 🟠 Haute | S | ✅ Livré |
| 4 | Copier / coller métadonnées | 🟠 Haute | S | ✅ Livré |
| 5 | Compteur de progression session | 🟡 Moyenne | XS | ✅ Livré |
| 6 | Renommage batch à l'export | 🟡 Moyenne | M | ☐ À faire |
| 7 | IA : suggestion de note automatique | 🟢 Basse | M | ☐ À faire |
| 8 | Vue comparaison multiple (Survey) | 🟢 Basse | L | ☐ À faire |

**Effort** : XS < 50 lignes · S 50-150 · M 150-400 · L 400+

---

## 1 — Auto-avance après action (Cap Lock mode)

### Valeur utilisateur
Après avoir noté, pické ou rejeté une photo, passer **automatiquement** à la suivante sans appuyer sur `→`. Multiplie la vitesse de culling par 2-3. Comportement identique à Lightroom avec `Caps Lock` activé.

### Comportement attendu
- Touche `Caps Lock` (ou bouton toggle dans la toolbar) active/désactive le mode
- En mode actif : toute action `1-5`, `P`, `X`, `U` déclenche `handleNextPhoto()` après 250 ms
- Indicateur visuel dans la barre d'outils (`⏩ Auto-avance ON/OFF`)
- Persisté en `localStorage` entre sessions

### Fichiers à modifier
```
src/features/triage/TriageTab.tsx        — état autoAdvance + wrappers des handlers
src/features/triage/components/          — nouveau : AutoAdvanceToggle.tsx
src/hooks/useKeyboardShortcuts.ts        — ajouter handler onCapsLock (facultatif)
src/components/FullscreenViewer.tsx      — même logique en plein écran
```

### Plan technique

**1. État dans TriageTab.tsx**
```ts
const [autoAdvance, setAutoAdvance] = useState<boolean>(
  () => localStorage.getItem('triphotoia_autoAdvance') === 'true'
);

const triggerAutoAdvance = useCallback(() => {
  if (autoAdvance) {
    setTimeout(() => handleNextPhoto(), 250);
  }
}, [autoAdvance, handleNextPhoto]);
```

**2. Wrapper des handlers clavier**
```ts
onRating: (rating) => {
  if (selectedPhotoId) {
    setPhotoRating(selectedPhotoId, rating);
    showRatingHUD(rating);
    triggerAutoAdvance();        // ← ajout
  }
},
onPick: () => {
  if (selectedPhotoId) {
    togglePhotoPick(selectedPhotoId);
    triggerAutoAdvance();        // ← ajout
  }
},
onReject: () => {
  if (selectedPhotoId) {
    togglePhotoReject(selectedPhotoId);
    triggerAutoAdvance();        // ← ajout
  }
},
```

**3. Composant AutoAdvanceToggle.tsx**
```tsx
export function AutoAdvanceToggle({ enabled, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title="Auto-avance (Caps Lock)"
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        enabled
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      }`}
    >
      <SkipForward className="w-3.5 h-3.5" />
      Auto {enabled ? 'ON' : 'OFF'}
    </button>
  );
}
```

**4. Persistance**
```ts
useEffect(() => {
  localStorage.setItem('triphotoia_autoAdvance', String(autoAdvance));
}, [autoAdvance]);
```

### Tests à écrire
- `autoAdvance=false` → aucune navigation après rating
- `autoAdvance=true` → `handleNextPhoto` appelé après 250 ms
- Toggle persiste dans localStorage

---

## 2 — Mode culling plein écran (Loupe view)

### Valeur utilisateur
Un mode immersif dédié au tri initial : **une photo à la fois**, en grand, avec une bande de film (filmstrip) en bas. On ne sort jamais de la vue pour noter/picker. Équivalent du Loupe view de Lightroom.

### Comportement attendu
- Touche `L` ou bouton "Mode Culling" dans la toolbar pour entrer/sortir
- Photo courante en plein écran (fond noir)
- Filmstrip horizontal en bas (miniatures, 80px de hauteur, scroll centré sur la photo courante)
- Overlays sur la photo : étoiles, pick/reject badge, label couleur
- Raccourcis : `1-5`, `P`, `X`, `U`, `←→`, `Del`, `F` (zoom)
- Si `autoAdvance` actif : avance automatiquement
- Bouton `Esc` pour quitter

### Fichiers à créer / modifier
```
src/components/CullingView.tsx           — nouveau composant principal
src/components/Filmstrip.tsx             — nouveau : bande de film bas
src/features/triage/TriageTab.tsx        — état cullingOpen + raccourci L
src/hooks/useKeyboardShortcuts.ts        — ajouter onCulling handler
src/components/KeyboardShortcutsHelp.tsx — documenter L
```

### Plan technique

**Structure CullingView.tsx**
```tsx
<div className="fixed inset-0 z-[300] bg-black flex flex-col">
  {/* Photo principale */}
  <div className="flex-1 relative flex items-center justify-center">
    <img src={currentPhoto.previewUrl} className="max-h-full max-w-full object-contain" />
    {/* Overlay étoiles + badges */}
    <CullingOverlay photo={currentPhoto} />
  </div>

  {/* Filmstrip */}
  <Filmstrip
    photos={photos}
    currentId={currentPhoto.id}
    onSelect={setSelectedPhotoId}
  />
</div>
```

**Filmstrip.tsx** — virtualisation avec `@tanstack/react-virtual` (déjà présent)
```tsx
// Scroll automatique pour centrer la photo active
useEffect(() => {
  rowVirtualizer.scrollToIndex(currentIndex, { align: 'center', behavior: 'smooth' });
}, [currentIndex]);
```

**Overlay note (inspiration Lightroom)**
```tsx
function CullingOverlay({ photo }) {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
      <StarRating rating={photo.analysis?.rating ?? 0} size="lg" />
      <div className="flex gap-2">
        {photo.analysis?.isPick && <Badge>🎯 Pick</Badge>}
        {photo.analysis?.isRejected && <Badge variant="destructive">❌</Badge>}
      </div>
    </div>
  );
}
```

### Tests à écrire
- Ouverture/fermeture par touche `L`
- Navigation filmstrip scroll to active
- Raccourcis actifs en mode culling

---

## 3 — Export filtré par note / flag

### Valeur utilisateur
Exporter exactement ce qu'on veut : *"Tous mes picks"*, *"Photos 4 étoiles et +"*, *"Tout sauf les rejetées"*. Bout logique du pipeline de tri.

### État actuel
`ExportTab.tsx` a déjà `includeRejected`, `includeDuplicates`, `picksOnly`, et `minRating` dans l'état local — mais l'interface utilisateur ne les expose pas tous clairement.

### Comportement attendu
- Section "Filtre d'export" dans ExportTab avec des presets rapides :
  - `Tous` · `Picks uniquement` · `≥ 3★` · `≥ 4★` · `≥ 5★` · `Sans rejetées`
- Compteur dynamique : "→ 47 photos à exporter"
- Option "Renommage" (voir feature 6)

### Fichiers à modifier
```
src/features/export/ExportTab.tsx        — afficher les filtres existants + presets
src/features/export/components/          — nouveau : ExportFilterBar.tsx
```

### Plan technique

**ExportFilterBar.tsx**
```tsx
const PRESETS = [
  { label: 'Tout', filter: {} },
  { label: '🎯 Picks', filter: { picksOnly: true } },
  { label: '≥ 3★',  filter: { minRating: 3 } },
  { label: '≥ 4★',  filter: { minRating: 4 } },
  { label: '≥ 5★',  filter: { minRating: 5 } },
  { label: 'Sans ❌', filter: { includeRejected: false } },
];

export function ExportFilterBar({ current, onChange, count }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {PRESETS.map(p => (
        <button key={p.label} onClick={() => onChange(p.filter)}
          className={isActive(current, p.filter) ? 'ring-2 ring-primary ...' : '...'}>
          {p.label}
        </button>
      ))}
      <span className="ml-auto text-sm text-muted-foreground">
        {count} photo{count > 1 ? 's' : ''} à exporter
      </span>
    </div>
  );
}
```

### Tests à écrire
- Preset "Picks" → seules les photos `isPick=true`
- `minRating=4` → exclut les photos ≤ 3 étoiles
- Compteur se met à jour en temps réel

---

## 4 — Copier / coller métadonnées (Ctrl+Shift+C / V)

### Valeur utilisateur
Copier la note, le flag, le label couleur d'une photo et les coller sur une ou plusieurs autres (multi-sélection). Gain de temps pour les séries similaires.

### Comportement attendu
- `Ctrl+Shift+C` : copie les métadonnées de la photo sélectionnée dans un clipboard interne
- `Ctrl+Shift+V` : colle sur la sélection courante (ou la photo active si pas de multi-sélection)
- Toast de confirmation : *"Métadonnées copiées"* / *"Collées sur 12 photos"*
- Indicateur visuel : puce "Presse-papier" dans la toolbar montrant ce qui est copié

### Fichiers à modifier
```
src/hooks/useKeyboardShortcuts.ts        — ajouter onCopyMeta / onPasteMeta
src/features/triage/TriageTab.tsx        — état metaClipboard + handlers
src/store/photoStore.ts                  — nouvelle action pasteMetadata(ids, meta)
src/components/KeyboardShortcutsHelp.tsx — documenter Ctrl+Shift+C/V
```

### Plan technique

**Type du presse-papier**
```ts
interface MetaClipboard {
  rating?: number;
  isPick?: boolean;
  isRejected?: boolean;
  colorLabel?: ColorLabel | null;
}
```

**Dans useKeyboardShortcuts.ts**
```ts
// Ajouter dans l'interface :
onCopyMeta?: () => void;   // Ctrl+Shift+C
onPasteMeta?: () => void;  // Ctrl+Shift+V

// Dans le handler :
if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'c') {
  h.onCopyMeta?.(); return;
}
if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'v') {
  h.onPasteMeta?.(); return;
}
```

**Dans TriageTab.tsx**
```ts
const [metaClipboard, setMetaClipboard] = useState<MetaClipboard | null>(null);

// Copier
const handleCopyMeta = () => {
  const photo = filteredPhotos.find(p => p.id === selectedPhotoId);
  if (!photo?.analysis) return;
  setMetaClipboard({
    rating: photo.analysis.rating,
    isPick: photo.analysis.isPick,
    isRejected: photo.analysis.isRejected,
    colorLabel: photo.analysis.colorLabel,
  });
  toast.success('Métadonnées copiées');
};

// Coller
const handlePasteMeta = () => {
  if (!metaClipboard) return;
  const targets = triageMultiSelection.size > 0
    ? Array.from(triageMultiSelection)
    : selectedPhotoId ? [selectedPhotoId] : [];
  targets.forEach(id => pasteMetadata(id, metaClipboard));
  toast.success(`Collé sur ${targets.length} photo${targets.length > 1 ? 's' : ''}`);
};
```

**Action store pasteMetadata**
```ts
pasteMetadata: (photoId, meta) => set((state) => {
  const photo = state.photos.find(p => p.id === photoId);
  if (photo?.analysis) {
    if (meta.rating !== undefined) photo.analysis.rating = meta.rating;
    if (meta.isPick !== undefined) photo.analysis.isPick = meta.isPick;
    if (meta.isRejected !== undefined) photo.analysis.isRejected = meta.isRejected;
    if (meta.colorLabel !== undefined) photo.analysis.colorLabel = meta.colorLabel;
  }
}),
```

### Tests à écrire
- `Ctrl+Shift+C` sans sélection → no-op
- Copier → coller sur multi-sélection → toutes les photos mises à jour
- `metaClipboard` persiste entre navigation de photos

---

## 5 — Compteur de progression de session

### Valeur utilisateur
Savoir en un coup d'œil où on en est : *"47 / 120 triées"*, *"12 picks · 8 rejetées · 27 sans note"*. Sentiment de progression, motivation.

### Comportement attendu
- Bandeau discret en haut de TriageTab (sous le titre)
- Barre de progression linéaire (% de photos avec au moins une action : note > 0, pick, ou reject)
- Stats rapides : `✅ X picks` · `❌ X rejetées` · `⭐ X notées` · `⬜ X sans action`
- Mise à jour réactive (live via Zustand)

### Fichiers à créer / modifier
```
src/features/triage/components/SessionProgress.tsx  — nouveau composant
src/features/triage/TriageTab.tsx                   — insérer <SessionProgress>
```

### Plan technique

**SessionProgress.tsx**
```tsx
export function SessionProgress({ photos }: { photos: Photo[] }) {
  const analyzed = photos.filter(p => p.analysis && !p.analysis.error);
  const picks     = analyzed.filter(p => p.analysis?.isPick).length;
  const rejected  = analyzed.filter(p => p.analysis?.isRejected).length;
  const rated     = analyzed.filter(p => (p.analysis?.rating ?? 0) > 0).length;
  const actioned  = new Set([
    ...analyzed.filter(p => p.analysis?.isPick).map(p => p.id),
    ...analyzed.filter(p => p.analysis?.isRejected).map(p => p.id),
    ...analyzed.filter(p => (p.analysis?.rating ?? 0) > 0).map(p => p.id),
  ]).size;
  const pct = analyzed.length > 0 ? Math.round((actioned / analyzed.length) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{actioned} / {analyzed.length} triées ({pct}%)</span>
        <div className="flex gap-3">
          <span>🎯 {picks}</span>
          <span>❌ {rejected}</span>
          <span>⭐ {rated}</span>
          <span>⬜ {analyzed.length - actioned}</span>
        </div>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
```

### Tests à écrire
- 0 photos actionnées → 0%
- Toutes picks → 100%
- La barre s'anime lors du changement

---

## 6 — Renommage batch à l'export

### Valeur utilisateur
Renommer les fichiers selon un pattern lors de l'export ZIP : `{nom_original}`, `{date}_{sequence}`, `{session}_{sequence}_{note}★`, etc. Standard dans tout logiciel photo pro.

### Comportement attendu
- Section "Renommage" dans ExportTab (collapsible)
- Champ de pattern avec tokens cliquables : `{nom}` `{date}` `{seq}` `{note}` `{pick}`
- Prévisualisation live : `DSC_0042.jpg → 2024-06-15_001_4★.jpg`
- Séquence commence à un numéro configurable (défaut: 001)
- Format de séquence : 001, 0001, 1

### Fichiers à créer / modifier
```
src/features/export/ExportTab.tsx              — ajouter section renommage
src/features/export/components/RenamePanel.tsx — nouveau composant
src/lib/rename-utils.ts                        — nouvelle lib de renommage
```

### Plan technique

**lib/rename-utils.ts**
```ts
export interface RenameOptions {
  pattern: string;      // ex: "{date}_{seq}_{note}"
  startIndex: number;   // ex: 1
  padLength: number;    // ex: 3 → "001"
  sessionName?: string; // ex: "Mariage_Dupont"
}

export function applyRename(
  photo: Photo,
  index: number,
  opts: RenameOptions
): string {
  const analysis = photo.analysis;
  const date = new Date(photo.file.lastModified).toISOString().slice(0, 10);
  const seq  = String(opts.startIndex + index).padStart(opts.padLength, '0');
  const note = analysis?.rating ? `${analysis.rating}star` : '0star';
  const ext  = photo.file.name.split('.').pop() ?? 'jpg';

  return opts.pattern
    .replace('{nom}',  photo.file.name.replace(/\.[^.]+$/, ''))
    .replace('{date}', date)
    .replace('{seq}',  seq)
    .replace('{note}', note)
    .replace('{pick}', analysis?.isPick ? 'pick' : '')
    .replace('{session}', opts.sessionName ?? 'session')
    + '.' + ext;
}
```

**RenamePanel.tsx**
```tsx
const TOKENS = ['{nom}', '{date}', '{seq}', '{note}', '{pick}', '{session}'];

export function RenamePanel({ photos, onChange }) {
  const [enabled, setEnabled] = useState(false);
  const [pattern, setPattern] = useState('{nom}');
  const [startIndex, setStartIndex] = useState(1);

  const preview = photos.slice(0, 3).map((p, i) =>
    `${p.file.name} → ${applyRename(p, i, { pattern, startIndex, padLength: 3 })}`
  );

  return (
    <Collapsible>
      {/* Pattern input + tokens + preview */}
    </Collapsible>
  );
}
```

### Tests à écrire
- `{date}_{seq}` → `2024-06-15_001.jpg`
- `{nom}` → nom original conservé
- Séquence pad sur 3 chiffres
- Extension préservée

---

## 7 — IA : suggestion de note automatique

### Valeur utilisateur
Sur la base des scores déjà calculés (netteté, composition, tags, yeux ouverts), proposer une pré-notation automatique. L'utilisateur valide, ajuste ou ignore. Accélère le culling de 80%.

### Comportement attendu
- Bouton "Auto-noter" dans TriageTab (toolbar ou menu contextuel)
- Modal de configuration :
  - Sévérité : `Strict` · `Équilibré` · `Généreux`
  - Options : `Tenir compte de la netteté` · `Tenir compte de la composition`
  - Aperçu : distribution prévisionnelle (histogramme 0-5★)
- Appliquer → toast avec résumé : "47 photos notées automatiquement"
- Chaque note auto est marquée `autoRated: true` (undo possible en lot)
- `Ctrl+Z` annule toutes les notes auto en une seule action

### Fichiers à modifier
```
src/store/photoStore.ts                           — autoRateAllPhotos existe déjà (ligne ~1042)
src/features/triage/components/AutoRateModal.tsx  — nouveau composant
src/features/triage/TriageTab.tsx                 — bouton + état modal
src/types/index.ts                                — ajouter autoRated?: boolean
```

### Plan technique

**La logique d'autoRating existe déjà dans le store** (`autoRateAllPhotos`, lignes ~1042-1099). Il faut surtout créer l'interface.

**AutoRateModal.tsx**
```tsx
export function AutoRateModal({ open, onOpenChange, photos }) {
  const [preset, setPreset] = useState<'strict'|'balanced'|'generous'>('balanced');
  const autoRateAllPhotos = usePhotoStore(s => s.autoRateAllPhotos);

  // Distribution prévisionnelle (calcul côté client)
  const distribution = useMemo(() =>
    computeDistributionPreview(photos, preset), [photos, preset]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Preset selector + histogram + confirm */}
    </Dialog>
  );
}

function computeDistributionPreview(photos, preset) {
  // Utilise les mêmes seuils que autoRateAllPhotos mais sans écrire dans le store
  return [0,1,2,3,4,5].map(stars => ({
    stars,
    count: photos.filter(p => simulateRating(p, preset) === stars).length
  }));
}
```

**Histogramme de distribution**
```tsx
{distribution.map(({ stars, count }) => (
  <div key={stars} className="flex items-center gap-2">
    <span>{stars}★</span>
    <div className="flex-1 bg-muted rounded h-2">
      <div style={{ width: `${(count/total)*100}%` }} className="bg-primary h-2 rounded" />
    </div>
    <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
  </div>
))}
```

### Tests à écrire
- Preset `strict` → moins de 5★ qu'en `generous`
- Photos sans analyse → ignorées
- Annulable via Ctrl+Z

---

## 8 — Vue comparaison multiple (Survey mode)

### Valeur utilisateur
Afficher 2, 4 ou 6 photos côte à côte pour choisir la meilleure d'une série. Plus puissant que le A/B actuel limité à 2 photos.

### Comportement attendu
- Touche `S` ou bouton "Survey" dans la toolbar (actif si ≥ 2 photos en multi-sélection)
- Grille responsive : 2, 3, ou 4 colonnes selon le nombre de photos (max 6)
- Clic sur une photo = la sélectionner comme meilleure (pick + note 5★)
- Raccourcis : `1-4` pour sélectionner par index de position, `Esc` ferme
- Photo sélectionnée : bordure verte + badge "Meilleure"
- Autres photos : possibilité de les rejeter depuis la vue

### Fichiers à créer / modifier
```
src/components/SurveyView.tsx            — nouveau composant principal
src/features/triage/TriageTab.tsx        — état surveyOpen + raccourci S
src/hooks/useKeyboardShortcuts.ts        — ajouter onSurvey
src/components/KeyboardShortcutsHelp.tsx — documenter S
```

### Plan technique

**SurveyView.tsx**
```tsx
interface SurveyViewProps {
  photos: Photo[];        // 2 à 6 photos
  open: boolean;
  onClose: () => void;
  onSelectBest: (photoId: string) => void;
}

const GRID_COLS = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 grid-rows-2',
  5: 'grid-cols-3',
  6: 'grid-cols-3 grid-rows-2',
};

export function SurveyView({ photos, open, onClose, onSelectBest }) {
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const cols = GRID_COLS[Math.min(photos.length, 6) as keyof typeof GRID_COLS];

  // Raccourcis 1-N pour sélectionner par index
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < photos.length) {
        setWinnerId(photos[idx].id);
      }
      if (e.key === 'Enter' && winnerId) {
        handleConfirm();
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [photos, winnerId]);

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col">
      <div className={`flex-1 grid ${cols} gap-1 p-2`}>
        {photos.slice(0, 6).map((photo, i) => (
          <SurveyCell
            key={photo.id}
            photo={photo}
            index={i + 1}
            isWinner={photo.id === winnerId}
            onClick={() => setWinnerId(photo.id)}
          />
        ))}
      </div>
      <SurveyToolbar
        winnerId={winnerId}
        onConfirm={handleConfirm}
        onClose={onClose}
      />
    </div>
  );
}
```

**SurveyCell.tsx**
```tsx
function SurveyCell({ photo, index, isWinner, onClick }) {
  return (
    <div
      className={`relative cursor-pointer rounded overflow-hidden transition-all ${
        isWinner ? 'ring-4 ring-green-500' : 'ring-1 ring-white/10 hover:ring-white/30'
      }`}
      onClick={onClick}
    >
      <img src={photo.previewUrl} className="w-full h-full object-cover" />
      {/* Badge index */}
      <div className="absolute top-2 left-2 bg-black/70 rounded px-1.5 py-0.5 text-white text-xs font-bold">
        {index}
      </div>
      {/* Badge winner */}
      {isWinner && (
        <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded font-medium">
          ✓ Meilleure
        </div>
      )}
      {/* Note + pick overlay */}
      <div className="absolute bottom-2 left-2">
        <StarRating rating={photo.analysis?.rating ?? 0} size="sm" readOnly />
      </div>
    </div>
  );
}
```

### Tests à écrire
- `photos.length = 6` → grille 3×2
- Touche `2` → photo index 1 sélectionnée comme winner
- Confirmation → `onSelectBest` appelé avec le bon ID
- `Esc` → ferme sans sélectionner

---

## Ordre d'implémentation recommandé

```
Sprint 1 (< 1 jour)
  ✓ Feature 5 — Compteur de progression (XS)
  ✓ Feature 3 — Export filtré (S, UI déjà en partie présente)

Sprint 2 (1 jour)
  ✓ Feature 1 — Auto-avance après action (S)
  ✓ Feature 4 — Copier / coller métadonnées (S)

Sprint 3 (1-2 jours)
  ✓ Feature 6 — Renommage batch à l'export (M)
  ✓ Feature 7 — IA suggestion de note (M, logique store existante)

Sprint 4 (2-3 jours)
  ✓ Feature 2 — Mode culling plein écran (M)
  ✓ Feature 8 — Survey mode (L)
```

---

## Conventions de code du projet

- **Store** : Zustand + Immer — toujours muter dans `set((state) => { ... })`
- **Animation** : Framer Motion — `motion.div` + `AnimatePresence`
- **Styles** : Tailwind CSS — pas de CSS inline sauf couleurs dynamiques
- **Raccourcis** : passer par `useKeyboardShortcuts.ts` — ne jamais poser d'écouteur `keydown` ad hoc en dehors du hook
- **Toasts** : `toast.success()` / `toast.error()` de react-hot-toast
- **Types** : tous dans `src/types/index.ts` — ne pas créer de types locaux sauf interfaces de props
- **Tests** : Vitest + Testing Library — un fichier par feature dans `src/test/`

---

*Ce document est vivant. Mettre à jour le tableau de statut au fil des implémentations.*
