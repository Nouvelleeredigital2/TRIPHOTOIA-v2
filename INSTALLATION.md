# 🚀 GUIDE D'INSTALLATION - TRIPHOTOIA

## Améliorations Phase 1 Implémentées

---

## ⚡ INSTALLATION RAPIDE

### 1. Installer les dépendances

```bash
npm install
```

Cette commande installera les nouvelles dépendances ajoutées:

- `jszip` - Pour l'export ZIP
- `react-hook-form` - Pour la gestion des formulaires
- `zod` - Pour la validation des schémas

### 2. Lancer l'application

```bash
npm run dev
```

L'application sera accessible sur `http://localhost:5173`

---

## 🎯 TESTER LES NOUVELLES FONCTIONNALITÉS

### ✅ 1. Export Réel (CRITIQUE)

**Comment tester:**

1. Charger des photos dans l'onglet "1. Ingestion"
2. Attendre que l'analyse IA se termine
3. Aller dans l'onglet "3. Exportation"
4. Configurer les options:
   - Format: JPEG, PNG, WebP ou Original
   - Qualité: 1-100%
   - Dimensions max (optionnel)
5. Cliquer sur "Exporter"
6. **Résultat attendu:** Un fichier ZIP se télécharge automatiquement

**Nom du fichier:** `collection-name_YYYY-MM-DD-HH-mm-ss.zip`

---

### ✅ 2. Confirmations Actions Destructives

#### A. Suppression de Collection

**Comment tester:**

1. Créer plusieurs collections
2. Cliquer sur l'icône poubelle 🗑️ d'une collection
3. **Résultat attendu:** Dialog de confirmation s'affiche
4. Vérifier le message: "Êtes-vous sûr de vouloir supprimer..."
5. Bouton "Supprimer" en rouge (variant destructive)

#### B. Reset Réglages Retouche

**Comment tester:**

1. Aller dans l'onglet "2. Triage"
2. Sélectionner des photos
3. Cliquer sur "Développer les photos sélectionnées"
4. Modifier des réglages (exposure, contrast, etc.)
5. Cliquer sur "Réinitialiser"
6. **Résultat attendu:** Dialog de confirmation s'affiche
7. Confirmer pour réinitialiser

---

### ✅ 3. Onboarding / Tour Guidé

**Comment tester:**

#### Première méthode (Navigation privée)

1. Ouvrir l'application en navigation privée
2. **Résultat attendu:** Le tour guidé s'affiche automatiquement après 1 seconde

#### Deuxième méthode (Effacer localStorage)

1. Ouvrir les DevTools (F12)
2. Console → Taper:

```javascript
localStorage.removeItem('triphotoia-onboarding-completed');
location.reload();
```

3. **Résultat attendu:** Le tour guidé s'affiche

#### Fonctionnalités à tester:

- ✅ 7 étapes guidées
- ✅ Barre de progression
- ✅ Navigation "Suivant" / "Précédent"
- ✅ Bouton "Passer le tutoriel"
- ✅ Fermeture avec X
- ✅ Overlay cliquable pour fermer
- ✅ Animations fluides

---

### ✅ 4. Système de Tooltips

**Comment utiliser:**

Le composant Tooltip est maintenant disponible pour tous les développeurs:

```tsx
import { Tooltip } from './components/ui/tooltip';

<Tooltip content="Description de l'action" side="top">
  <Button>Mon Bouton</Button>
</Tooltip>;
```

**Props:**

- `content`: string - Texte du tooltip
- `side`: 'top' | 'right' | 'bottom' | 'left' - Position
- `className`: string (optionnel) - Classes CSS additionnelles

**Exemple d'intégration:**

```tsx
// Dans un composant existant
<Tooltip content="Télécharger les photos sélectionnées" side="bottom">
  <Button onClick={handleExport}>
    <Download className="h-4 w-4" />
  </Button>
</Tooltip>
```

---

### ✅ 5. Couleurs Sémantiques

**Comment utiliser:**

Nouvelles classes Tailwind disponibles:

```tsx
// Success (vert)
<div className="bg-success text-success-foreground">
  Export réussi !
</div>

// Warning (orange)
<div className="bg-warning text-warning-foreground">
  Attention: Espace disque faible
</div>

// Info (bleu)
<div className="bg-info text-info-foreground">
  Analyse en cours...
</div>

// Error (rouge)
<div className="bg-error text-error-foreground">
  Erreur lors du chargement
</div>
```

**Variantes disponibles:**

- `bg-success` / `text-success` / `border-success`
- `bg-warning` / `text-warning` / `border-warning`
- `bg-info` / `text-info` / `border-info`
- `bg-error` / `text-error` / `border-error`

**Avec foreground:**

- `bg-success text-success-foreground`
- `bg-warning text-warning-foreground`
- `bg-info text-info-foreground`
- `bg-error text-error-foreground`

---

## 🐛 RÉSOLUTION DES PROBLÈMES

### Erreur: Cannot find module 'jszip'

**Solution:**

```bash
npm install
```

### Erreur: Cannot find module 'react-hook-form' ou 'zod'

**Solution:**

```bash
npm install
```

### L'onboarding ne s'affiche pas

**Solutions:**

1. Effacer localStorage:

```javascript
localStorage.removeItem('triphotoia-onboarding-completed');
location.reload();
```

2. Ou utiliser navigation privée

### L'export ne fonctionne pas

**Vérifications:**

1. Vérifier que jszip est installé: `npm list jszip`
2. Vérifier la console pour erreurs
3. Tester avec quelques photos d'abord (pas 1000+)

### Warnings CSS "@tailwind"

**Ces warnings sont normaux** et n'affectent pas le fonctionnement. Ils sont dus au linter CSS qui ne reconnaît pas les directives Tailwind.

---

## 📁 NOUVEAUX FICHIERS CRÉÉS

```
src/
├── lib/
│   └── export-utils.ts          # Utilitaires d'export ZIP
├── components/
│   ├── Onboarding.tsx            # Tour guidé
│   └── ui/
│       ├── confirmation-dialog.tsx  # Dialog de confirmation
│       └── tooltip.tsx              # Composant tooltip
```

---

## 🔧 FICHIERS MODIFIÉS

```
src/
├── App.tsx                       # Ajout Onboarding
├── index.css                     # Couleurs sémantiques
├── features/
│   ├── export/ExportTab.tsx     # Export réel
│   └── development/DevelopmentTab.tsx  # Confirmation reset
├── components/
│   └── CollectionManager.tsx    # Confirmation suppression
tailwind.config.js                # Couleurs sémantiques
package.json                      # Nouvelles dépendances
```

---

## 📊 VÉRIFICATION POST-INSTALLATION

### Checklist

- [ ] `npm install` exécuté sans erreurs
- [ ] `npm run dev` lance l'application
- [ ] Application accessible sur http://localhost:5173
- [ ] Onboarding s'affiche (navigation privée)
- [ ] Export télécharge un fichier ZIP
- [ ] Confirmations s'affichent pour suppressions
- [ ] Tooltips fonctionnent (si implémentés)
- [ ] Couleurs sémantiques disponibles

### Commandes de vérification

```bash
# Vérifier les dépendances
npm list jszip
npm list react-hook-form
npm list zod

# Vérifier le build
npm run build

# Lancer les tests
npm run test

# Vérifier le linting
npm run lint
```

---

## 🎨 EXEMPLES D'UTILISATION

### Exemple 1: Ajouter un Tooltip

```tsx
import { Tooltip } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

function MyComponent() {
  return (
    <Tooltip content="Supprimer la photo" side="top">
      <Button variant="destructive" size="icon">
        <Trash2 className="h-4 w-4" />
      </Button>
    </Tooltip>
  );
}
```

### Exemple 2: Utiliser ConfirmationDialog

```tsx
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { useState } from 'react';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = () => {
    // Logique de suppression
    console.log('Supprimé !');
  };

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Supprimer</Button>

      <ConfirmationDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        onConfirm={handleDelete}
        title="Supprimer l'élément ?"
        description="Cette action est irréversible."
        confirmText="Supprimer"
        cancelText="Annuler"
        variant="destructive"
      />
    </>
  );
}
```

### Exemple 3: Utiliser les Couleurs Sémantiques

```tsx
import { Badge } from '@/components/ui/badge';

function StatusBadge({ status }: { status: string }) {
  const getStatusClass = () => {
    switch (status) {
      case 'success':
        return 'bg-success text-success-foreground';
      case 'warning':
        return 'bg-warning text-warning-foreground';
      case 'error':
        return 'bg-error text-error-foreground';
      default:
        return 'bg-info text-info-foreground';
    }
  };

  return <Badge className={getStatusClass()}>{status}</Badge>;
}
```

---

## 📚 DOCUMENTATION COMPLÈTE

Pour plus de détails, consultez:

- `AUDIT_UI_UX.md` - Audit complet de l'application
- `AMELIORATIONS_IMPLEMENTEES.md` - Détails des améliorations
- `README.md` - Documentation générale du projet

---

## 🆘 SUPPORT

En cas de problème:

1. Vérifier que `npm install` a été exécuté
2. Vérifier la version de Node.js (>= 18)
3. Effacer `node_modules` et réinstaller:

```bash
rm -rf node_modules package-lock.json
npm install
```

---

**Bon développement ! 🚀**
