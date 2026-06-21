# TreePhoto — Scénario beta « Mariage »

Parcours de recette de bout en bout pour valider un reportage complet. À exécuter en
mode local, puis (optionnellement) en mode cloud pour vérifier la persistance.

## Étapes

1. **Créer un projet mariage** (mode cloud) ou ouvrir une collection (mode local).
2. **Importer** un jeu d'exemple (rafales, doublons, photos floues volontaires).
3. **Analyser** — laisser l'analyse qualité se terminer (scores + classes AutoFlow).
4. **Lancer AutoFlow** — trier dans l'ordre `review → keep → reject` au clavier
   (→ garder, ← rejeter, ↑ favori+5★).
5. **Résoudre les doublons** — utiliser le comparateur A/B des rafales détectées.
6. **Smart collections** — vérifier les regroupements automatiques (picks, favoris).
7. **Exporter les picks** — depuis AutoFlow → bascule sur Export en `picks-only`,
   générer le ZIP.
8. **Exporter par chapitres** — vérifier l'export structuré (préparatifs, cérémonie…).
9. **Persistance cloud** (mode cloud uniquement) — rafraîchir le navigateur et
   confirmer que les décisions (picks/rejets/favoris/notes) sont conservées.

## Critères de réussite

- Aucune erreur console pendant le parcours.
- Les décisions AutoFlow se reflètent dans le store puis dans la sélection d'export.
- Le ZIP `picks-only` ne contient que les photos gardées (favoris inclus, rejetées
  exclues).
- En cloud : les décisions survivent au rafraîchissement (cf. [CLOUD_MODE.md](CLOUD_MODE.md)).

## Limites beta

Voir [SECURITY.md](SECURITY.md) : gardez une sauvegarde de vos originaux, traitez les
projets de recette comme jetables, et considérez les tokens de partage comme des
secrets (potentiellement conservés par les destinataires après suppression du lien).
