# La Forêt Enchantée — carte de navigation

Commencer par `AI_START_HERE.md`. Ce fichier évite de parcourir tout le dépôt lorsqu'une zone suffit.

## Bibliothèque publique

- `index.html` + JS/CSS réellement chargés — choix d'une histoire, recherche, catégories et hiérarchie de bibliothèque.
- `audio.html` + lecteur associé — expérience d'écoute ; préserver le mode calme.
- `blog.html` / `article.html` — Journal, séparé de la tâche d'écoute principale.

## Administration

- `admin.html` + scripts admin réellement chargés — gestion histoires/articles.
- `js/auth.js` et couches de sécurité associées — accès admin : vérifier avant toute modification.
- Pour remplacement média : préserver le principe sûr **nouveau média valide → mise à jour DB → suppression de l'ancien**, avec nettoyage du nouveau si l'écriture échoue.

## Studio Audio

Sous-projet actif. Interface : `studio.html`. **Baseline canonique : `studio/integration`**, qui doit rester le dernier état à la fois techniquement validé et humainement accepté ; `LATEST` n'est donc pas automatiquement `ACCEPTED`.

Routes à vérifier depuis cette branche avant modification :
- scripts réellement chargés par `studio.html` : `js/supabase.js`, `js/auth.js`, `js/studio-export-core.js`, `js/studio-waveform-core.js`, `js/studio-autosave.js`, `js/studio-audio-runtime.js` ;
- persistance locale / IndexedDB : `js/studio-autosave.js` ; export WAV : `js/studio-export-core.js` + appels dans `studio.html` ;
- tests Studio : `tests/studio-*.test.cjs` ; checks Studio : `.github/workflows/static-checks.yml` (et vérifier les autres workflows applicables au HEAD/PR) ;
- publication audio vers La Forêt : ne pas présumer qu'elle appartient au baseline ; retrouver le chapitre/PR qui l'implémente, puis vérifier les chemins réellement modifiés et les contrats Supabase/bucket avant action.

Pour reprendre l'état courant, reconstruire depuis GitHub + `studio/integration` les champs : `CURRENT_STUDIO_BASELINE` = HEAD de `studio/integration` ; `CURRENT_ACCEPTED_HEAD` = même HEAD tant que la branche canonique n'a pas été déplacée ; `CURRENT_OPEN_CHAPTER`, `CURRENT_BRANCH`, `CURRENT_PR` = chapitre/branche/PR de développement actif ; `DEPENDENCIES` = base et chaîne réelle de la PR ; `CI_STATUS` = checks du HEAD exact ; `HUMAN_TEST_STATUS` = dernier gate physique explicitement attesté ; `NEXT_ALLOWED_ACTION` = action autorisée par ces gates. Ne jamais graver un HEAD de développement temporaire comme baseline.

Validation : toute modification sensible Android/Web Audio, mémoire, tactile ou OPFS exige **CI du HEAD exact + HUMAN GATE Android réel** avant promotion dans `studio/integration`. Une CI verte seule ne certifie pas le comportement physique. Ne demander le gate humain qu'après préparation d'une version testable et définition du scénario attendu.

## Données / backend

- `supabase/` et requêtes réelles — source de vérité pour schéma, RLS et capacités de publication.
- Ne pas inventer un statut brouillon/publié pour les audios sans migration cohérente du schéma, des politiques et des requêtes publiques.

## Principes UX durables

- simplicité enfant : ouvrir → voir quoi écouter → reconnaître → toucher → écouter ;
- pas de navigation vocale, profil enfant complexe, onboarding ou recommandation lourde par défaut ;
- simplicité enfant ≠ suppression des capacités utiles à l'adulte ;
- pendant l'écoute, l'interface doit s'effacer plutôt que se complexifier ;
- si l'enfant ne comprend pas l'écran, simplifier l'écran au lieu d'ajouter une couche explicative.

Toujours vérifier le comportement réel et l'état déployé avant de conclure qu'une fonction est opérationnelle.
