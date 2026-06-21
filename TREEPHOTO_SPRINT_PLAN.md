# TreePhoto Sprint Plan

## Objectif global

Transformer l'application locale actuelle TRIPHOTOIA en TreePhoto, une plateforme cloud professionnelle de tri photo pour photographes, avec:

- frontend React/Vite deployable sur Vercel;
- Supabase Cloud pour auth, base, storage, realtime et RLS;
- VPS Worker pour traitements lourds;
- conservation progressive du mode local existant;
- premier vertical metier: mariage, evenementiel et studio photo.

## Principes d'execution

1. Avancer par petits lots livrables.
2. Garder `src/` comme source active.
3. Ne pas casser le tri local pendant la migration cloud.
4. Zustand reste reserve a l'UI locale.
5. TanStack Query porte les donnees serveur.
6. Supabase devient la source de verite cloud progressivement.
7. Aucun secret serveur dans le frontend.
8. Chaque sprint finit par validation: type-check, tests utiles, build.
9. Les traitements lourds restent hors Vercel.
10. L'IA doit rester explicable pour l'utilisateur.

## Definition des jalons

| Jalon | Resultat attendu                                         |
| ----- | -------------------------------------------------------- |
| M0    | Base locale stabilisee et documentee                     |
| M1    | Socle Supabase minimal branche sans casser le mode local |
| M2    | Projets cloud utilisables                                |
| M3    | Upload Storage fonctionnel                               |
| M4    | Triage cloud persistant                                  |
| M5    | Jobs visibles et worker minimal                          |
| M6    | Smart collections cloud                                  |
| M7    | Recherche et IA avancee                                  |
| M8    | Workflow mariage vendable en V1                          |

## Sprint 0 - Audit et stabilisation

**Objectif:** obtenir une base saine avant migration.

**Taches:**

- Confirmer la structure active `src/`.
- Lister les fichiers racine obsoletes ou doublons (`App.tsx`, `components/`, `services/`, docs anciennes).
- Auditer imports croises entre racine et `src/`.
- Lancer `npm run type-check`, `npm run lint`, `npm run test`, `npm run build`.
- Corriger les erreurs TypeScript/JSX bloquantes.
- Identifier les tests instables ou obsoletes.
- Ajouter `AGENTS.md` et `CLAUDE.md`.
- Ajouter un rapport `docs/stabilization-audit.md`.

**Livrables:**

- Build vert.
- Liste claire des dettes restantes.
- Documentation agent presente.

**Critere de fin:**

- `npm run build` passe.
- Les erreurs type/lint/test restantes sont classees par priorite.

## Sprint 1 - Nettoyage structure et conventions

**Objectif:** rendre le repo lisible avant d'ajouter le cloud.

**Taches:**

- Decider le statut des fichiers racine doublons.
- Creer un dossier `docs/archive-notes/` si necessaire pour documenter l'ancien.
- Harmoniser les imports vers `src/types`, `src/services`, `src/components`.
- Supprimer les logs temporaires du repo si non suivis.
- Ajouter `.env.example`.
- Verifier `pnpm` vs `npm` et choisir une commande officielle.
- Documenter les commandes dans `AGENTS.md`.

**Livrables:**

- Arborescence clarifiee.
- Conventions projet documentees.

**Critere de fin:**

- Un nouvel agent peut comprendre quel code est actif en moins de 10 minutes.

## Sprint 2 - Socle Supabase frontend

**Objectif:** preparer TreePhoto au cloud sans migrer le workflow local.

**Taches:**

- Installer `@supabase/supabase-js`.
- Creer `src/lib/supabase/client.ts`.
- Ajouter validation d'environnement `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
- Creer types `Organization`, `Project`, `CloudPhoto`.
- Creer une feature `auth/` minimale.
- Ajouter provider auth et hook `useSession`.
- Ajouter etats UI: non configure, non connecte, connecte.
- Garder un bouton ou mode "continuer en local".

**Livrables:**

- Client Supabase isole.
- Auth minimale cote frontend.
- Mode local encore accessible.

**Critere de fin:**

- L'app demarre avec ou sans variables Supabase.
- Aucun secret serveur n'est expose.

## Sprint 3 - Migrations Supabase initiales

**Objectif:** creer le modele cloud minimum.

**Taches:**

- Creer dossier `supabase/migrations`.
- Ajouter migration extensions: `uuid-ossp`, `pg_trgm`, optionnellement `vector`.
- Creer tables `organizations`, `organization_members`, `projects`, `photos`.
- Ajouter enums ou checks pour `project_type`, `project_status`, `pick_status`.
- Activer RLS.
- Ajouter policies basiques proprietaire/membre.
- Ajouter seed de developpement optionnel.

**Livrables:**

- Migration SQL versionnee.
- Notes RLS dans `docs/supabase-rls.md`.

**Critere de fin:**

- Les tables de base existent.
- Les policies empechent l'acces hors organisation.

## Sprint 4 - Dashboard projets

**Objectif:** donner une entree cloud a l'application.

**Taches:**

- Creer `src/features/dashboard`.
- Creer `src/features/projects`.
- Ajouter liste projets via TanStack Query.
- Ajouter creation projet.
- Ajouter types de projet: wedding, event, corporate, portrait, family, archive, other.
- Ajouter empty state et loading/error states.
- Ajouter navigation local state vers projet ouvert.
- Garder le workflow local accessible.

**Livrables:**

- Dashboard projets.
- Creation projet.
- Ouverture d'un projet.

**Critere de fin:**

- Un utilisateur connecte peut creer un projet et le rouvrir apres refresh.

## Sprint 5 - Project layout et adaptation UX

**Objectif:** organiser l'app autour du projet cloud.

**Taches:**

- Creer `ProjectLayout`.
- Ajouter onglets V1: Overview, Import, Triage, Doublons, Collections, Export.
- Adapter la topbar pour distinguer projet cloud et session locale.
- Afficher stats projet: total, uploaded, analyzed, picked, rejected.
- Ajouter breadcrumbs ou selecteur projet.
- Eviter les pages marketing: interface outil directement.

**Livrables:**

- Vue projet centrale.
- Navigation claire entre dashboard et projet.

**Critere de fin:**

- L'utilisateur comprend s'il travaille en local ou dans un projet cloud.

## Sprint 6 - Upload Supabase Storage

**Objectif:** uploader les originaux dans un bucket prive.

**Taches:**

- Prevoir bucket `project-photos`.
- Creer service upload `src/features/ingestion/services/cloudUploadService.ts`.
- Uploader vers `organizations/{orgId}/projects/{projectId}/originals/{photoId}-{filename}`.
- Creer lignes `photos` apres upload.
- Gerer progression, annulation et erreurs.
- Afficher photos uploades dans le projet.
- Conserver preview locale immediate pendant upload.

**Livrables:**

- Upload cloud fonctionnel.
- Photos visibles depuis Supabase.

**Critere de fin:**

- Une photo importee cree un objet Storage et une ligne `photos`.

## Sprint 7 - Galerie cloud et miniatures V1

**Objectif:** afficher efficacement les photos cloud.

**Taches:**

- Creer queries photos paginees par projet.
- Ajouter signed URLs pour previews/originaux selon besoin.
- Integrer grille virtuelle existante.
- Ajouter fallback preview locale si thumbnail serveur absente.
- Ajouter colonnes `thumbnail_path`, `preview_path`, `upload_status`, `analysis_status`.
- Preparer future generation de thumbnails par job.

**Livrables:**

- Grille cloud performante.
- Statuts visibles sur les photos.

**Critere de fin:**

- 500 photos peuvent etre listees sans bloquer l'UI.

## Sprint 8 - Triage cloud persistant

**Objectif:** sauvegarder notes et statuts en cloud.

**Taches:**

- Mapper rating, pick/reject/maybe, color label vers `photos`.
- Creer mutations TanStack Query.
- Ajouter optimistic updates.
- Brancher raccourcis clavier existants.
- Gerer rollback en cas d'erreur.
- Ajouter filtres cloud par note/statut/label.
- Garder fallback local si aucun projet cloud.

**Livrables:**

- Triage cloud utilisable.
- Persistence apres refresh.

**Critere de fin:**

- Notes, pick/reject et labels restent apres rechargement.

## Sprint 9 - Collections cloud

**Objectif:** organiser les selections par projet.

**Taches:**

- Ajouter tables `collections` et `collection_photos`.
- Creer CRUD collections.
- Ajouter ajout/retrait photo.
- Synchroniser sidebar collections avec Supabase.
- Migrer les collections systeme minimales: Toutes, Non triees, Favorites, Rejetees.
- Ajouter tests de resolveur collection.

**Livrables:**

- Collections cloud manuelles.
- Sidebar projet utilisable.

**Critere de fin:**

- Une collection creee et remplie reste apres refresh.

## Sprint 10 - Doublons cloud V1

**Objectif:** reduire le volume avec pHash et groupes.

**Taches:**

- Ajouter tables ou colonnes pour `perceptual_hash`, `duplicate_group_id`, `duplicate_score`.
- Porter la detection locale actuelle en service reutilisable.
- Ajouter action "marquer tout sauf favori comme rejet suggere".
- Ajouter comparaison A/B sur groupe.
- Persister meilleur choix cloud.

**Livrables:**

- Vue doublons cloud V1.
- Decisions persistantes.

**Critere de fin:**

- Un groupe de doublons peut etre resolu et conserve en base.

## Sprint 11 - Jobs Supabase

**Objectif:** preparer la file de traitement pour le VPS.

**Taches:**

- Creer table `jobs`.
- Creer types `Job`, `JobType`, `JobStatus`.
- A chaque upload, creer jobs: `generate_thumbnail`, `quality_analysis`, `perceptual_hash`.
- Ajouter query jobs par projet.
- Ajouter panneau progression analyse.
- Ajouter retry job echoue.
- Ajouter logs d'activite simples.

**Livrables:**

- Jobs visibles dans l'UI.
- Etats pending/processing/completed/failed affiches.

**Critere de fin:**

- L'upload cree automatiquement des jobs consultables.

## Sprint 12 - Worker VPS minimal

**Objectif:** traiter les jobs hors frontend.

**Taches:**

- Creer dossier `worker/`.
- Choisir Node.js TypeScript pour V1.
- Creer client Supabase serveur avec service role key cote worker uniquement.
- Creer boucle polling jobs pending.
- Implementer lock simple ou claiming atomique.
- Implementer `generate_thumbnail`.
- Implementer `quality_analysis` simple.
- Mettre a jour `jobs`, `photos`, `photo_analysis`.
- Ajouter logs structures.
- Ajouter Dockerfile et README.

**Livrables:**

- Worker minimal deployable.
- Thumbnail et score qualite produits.

**Critere de fin:**

- Upload -> job -> worker -> resultat visible dans l'UI.

## Sprint 13 - Analyse qualite explicable

**Objectif:** produire des scores utiles et comprehensibles.

**Taches:**

- Ajouter table `photo_analysis`.
- Stocker blur, sharpness, exposure, contrast, composition.
- Ajouter `selection_score`.
- Ajouter `explanation_json`.
- Afficher explication dans panneau detail.
- Ajouter version d'analyse.
- Ajouter tests unitaires des scores.

**Livrables:**

- Score de selection explicable.
- Panneau detail enrichi.

**Critere de fin:**

- Une recommandation Pick/Reject explique pourquoi.

## Sprint 14 - Smart collections cloud

**Objectif:** automatiser les vues utiles.

**Taches:**

- Creer table `smart_collections`.
- Definir DSL JSON simple.
- Implementer resolveur cote client ou SQL.
- Ajouter collections systeme: Non triees, Favorites, Rejetees, Floues, A verifier, Exportees.
- Ajouter UI creation simple.
- Ajouter tests du DSL.

**Livrables:**

- Smart collections dynamiques.
- Collections systeme utiles.

**Critere de fin:**

- Les smart collections changent automatiquement selon les metadonnees.

## Sprint 15 - Export cloud V1

**Objectif:** livrer des selections propres.

**Taches:**

- Adapter export existant aux photos cloud.
- Export selection et collection.
- Renommage automatique.
- Qualite JPEG/WebP.
- Watermark si deja disponible.
- Creer ligne `exports`.
- Marquer photos exportees.
- Preparer export ZIP via frontend pour V1, worker pour gros volumes.

**Livrables:**

- Export projet/collection.
- Statut export visible.

**Critere de fin:**

- Une collection cloud peut etre exportee en ZIP.

## Sprint 16 - Recherche classique

**Objectif:** rendre le projet navigable a grand volume.

**Taches:**

- Recherche nom fichier.
- Filtres date, note, statut, label, collection.
- Recherche tag si tags presents.
- Requetes sauvegardees simples.
- Optimiser indexes SQL.

**Livrables:**

- Barre recherche et filtres.
- Performances correctes.

**Critere de fin:**

- L'utilisateur retrouve rapidement une selection dans un gros projet.

## Sprint 17 - Embeddings et recherche IA V1

**Objectif:** preparer la differenciation IA.

**Taches:**

- Activer `vector` si disponible.
- Creer table `photo_embeddings`.
- Choisir modele et dimension avant migration definitive.
- Ajouter job `semantic_embedding`.
- Ajouter fonction SQL recherche similarite.
- Ajouter recherche image-to-image V1.
- Ajouter recherche texte-image si modele disponible.
- Documenter limites et couts.

**Livrables:**

- Infrastructure embeddings.
- Recherche similaire basique.

**Critere de fin:**

- Depuis une photo, l'utilisateur trouve des images visuellement proches.

## Sprint 18 - Tags IA et recherche naturelle

**Objectif:** enrichir la recherche semantique.

**Taches:**

- Ajouter tables `tags` et `photo_tags`.
- Ajouter job `tag_generation`.
- Mapper categories: object, scene, mood, color, event_moment, technical, custom.
- Ajouter validation utilisateur pour tags importants.
- Ajouter recherche par texte naturel avec filtres.

**Livrables:**

- Tags IA persistants.
- Recherche hybride tags + filtres.

**Critere de fin:**

- Des requetes comme "photos de groupe nettes" retournent des resultats utiles.

## Sprint 19 - Personnes et visages structure

**Objectif:** preparer la V2 sans prendre de risque produit.

**Taches:**

- Ajouter tables `people` et `photo_faces`.
- Ajouter parametre projet "analyse visage activee".
- Ajouter UI desactivation/suppression donnees visage.
- Ajouter placeholders UI Personnes.
- Ne pas nommer automatiquement.
- Documenter confidentialite.

**Livrables:**

- Structure prete pour visages.
- Controle utilisateur clair.

**Critere de fin:**

- Le modele donnees existe, sans promesse automatique excessive.

## Sprint 20 - Detection et clustering visage V2

**Objectif:** rendre les personnes utiles pour mariage.

**Taches:**

- Ajouter job `face_detection`.
- Ajouter embeddings visage si modele choisi.
- Ajouter clustering par projet.
- Afficher groupes anonymes.
- Permettre nommage manuel.
- Ajouter roles mariage: bride, groom, parent, witness, guest, child, vendor, unknown.

**Livrables:**

- Groupes de personnes validables.
- Recherche par personne.

**Critere de fin:**

- L'utilisateur peut nommer un groupe et filtrer les photos correspondantes.

## Sprint 21 - Workflow mariage V1

**Objectif:** specialiser le produit.

**Taches:**

- Ajouter template projet mariage.
- Ajouter collections mariage recommandees.
- Ajouter moments: Preparatifs, Ceremonie, Couple, Famille, Groupes, Cocktail, Soiree, Details, Best of.
- Ajouter dashboard reportage.
- Ajouter selection recommandee.
- Ajouter export par chapitre.

**Livrables:**

- Workflow mariage complet V1.
- TreePhoto commence a avoir une proposition metier nette.

**Critere de fin:**

- Un reportage mariage peut etre importe, trie, organise et exporte par chapitre.

## Sprint 22 - Realtime et collaboration

**Objectif:** permettre le travail multi-session.

**Taches:**

- Ajouter subscriptions Supabase Realtime pour projets/photos/jobs.
- Gerer conflits simples.
- Afficher presence ou derniere activite si utile.
- Synchroniser changements de tri entre onglets.
- Ajouter activite logs.

**Livrables:**

- Mises a jour live.
- Base collaboration studio.

**Critere de fin:**

- Deux sessions voient les changements de tri et jobs sans refresh manuel.

## Sprint 23 - Qualite production

**Objectif:** preparer le deploiement.

**Taches:**

- Config Vercel.
- Variables environnement documentees.
- Tests regression principaux.
- Audit RLS.
- Audit accessibilite des ecrans critiques.
- Gestion erreurs globale.
- Monitoring minimal.
- Nettoyage bundle.

**Livrables:**

- Build production stable.
- Runbook deploiement.

**Critere de fin:**

- TreePhoto peut etre deploye en environnement staging.

## Sprint 24 - Beta V1

**Objectif:** livrer une beta utilisable par photographes.

**Taches:**

- Scenarios beta mariage/evenement.
- Import gros volume.
- Triage clavier.
- Export client.
- Collecte feedback.
- Corrections UX prioritaires.
- Documentation utilisateur courte.

**Livrables:**

- Beta testable.
- Backlog V1 finalise.

**Critere de fin:**

- Un utilisateur externe peut realiser un workflow complet sans assistance.

## Ordre de priorite recommande

1. Stabiliser la base locale.
2. Ajouter Supabase sans migration brutale.
3. Creer projet cloud.
4. Uploader et afficher photos cloud.
5. Persister le tri.
6. Ajouter jobs et worker minimal.
7. Ajouter smart collections.
8. Ajouter export cloud.
9. Ajouter recherche.
10. Specialiser mariage.

## Backlog transversal

### Tests

- Tests unitaires services analyse.
- Tests store Zustand.
- Tests hooks TanStack Query.
- Tests composants critiques: import, triage, export.
- Tests RLS SQL si possible.
- Tests worker jobs.

### UX

- Raccourcis clavier robustes.
- Empty states utiles.
- Feedback upload/analyse/export.
- Performance grille.
- Panneau detail dense et lisible.

### Securite

- RLS partout.
- Buckets originaux prives.
- URLs signees controlees.
- Service role seulement worker.
- Suppression donnees visage.

### Performance

- Virtualisation obligatoire.
- Pagination cloud.
- Lazy loading images.
- Upload non bloquant.
- Jobs asynchrones.
- Index SQL pour filtres.

## Definition V1 livrable

TreePhoto V1 est livrable quand:

- utilisateur connecte;
- projet cree;
- photos uploadees en storage prive;
- grille projet performante;
- tri persistant: note, pick/reject/maybe, label;
- collections manuelles et systeme;
- doublons simples;
- jobs thumbnail/quality visibles;
- export selection/collection;
- workflow mariage de base;
- build Vercel stable.

## Definition V2 livrable

TreePhoto V2 est livrable quand:

- worker VPS fiable;
- thumbnails serveur;
- analyse qualite explicable;
- smart collections avancees;
- recherche tags/filtres fluide;
- embeddings image;
- recherche similarite;
- premiers modules personnes/visages controles par utilisateur;
- export par chapitre mariage.
