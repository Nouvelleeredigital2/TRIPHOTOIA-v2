# Bench analyse (P1-4)

Mesure les performances **réelles** du chemin d'analyse pixel de l'app
(`WorkerAnalysisService` → Web Worker → OffscreenCanvas), exactement le même
code que l'import de photos. **Aucun chiffre n'est inventé** : il faut fournir un
dossier de vraies photos, et la mesure tourne dans un vrai Chromium.

## Pourquoi un navigateur ?

L'analyse s'appuie sur `OffscreenCanvas` dans un Web Worker — indisponible en
Node pur. Un bench Node produirait des chiffres faux. Le runner pilote donc un
Chromium réel via Playwright.

## Prérequis (dépendance optionnelle, non installée par défaut)

```bash
pnpm add -D playwright
npx playwright install chromium
```

## Lancer

```bash
# place tes photos dans ./samples (ou pointe ailleurs)
BENCH_DIR=./samples pnpm bench:analysis

# dossier absolu
BENCH_DIR=/chemin/vers/photos pnpm bench:analysis
```

Variables : `BENCH_DIR` (dossier d'images, défaut `./samples`),
`BENCH_PORT` (port Vite, défaut `5234`).

## Sortie

- **Latence séquentielle** (une image à la fois) : moyenne, p50, p95, min, max.
- **Débit du pool** (lot complet) : durée, images/s, Mo/s.
- Taille du pool de workers + `hardwareConcurrency` de la machine.

Les nombres dépendent de la machine et du corpus : exécute-le sur la machine
cible avec un échantillon représentatif. Reporte les valeurs obtenues, ne les
suppose pas.

## Statut

Harnais livré **non exécuté ici** (Playwright + navigateur requis, à installer
côté machine cible). Le code de page (`bench-entry.ts`) utilise le service réel
de `src/` ; le runner (`run-bench.mts`) est un script Node optionnel.
