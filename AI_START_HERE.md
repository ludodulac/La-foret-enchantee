# AI_START_HERE — La Forêt Enchantée

Ce fichier est un routeur, pas une seconde documentation.

## Contexte transversal

La Forêt appartient à l'écosystème **`ludodulac/Grand-pere`**. Grand Père est documenté dans le dépôt `ludodulac/Grand-pere`. En nouvelle conversation : lire Grand Père `AI_START_HERE.md`, la fiche La Forêt via `projects/_INDEX.md` et `LOOP_ENGINEERING.md`, puis revenir ici. **La Forêt reste l'autorité sur code, Supabase, médias, sécurité et production.**

## Commencer par l'état réel

Vérifier `main`, commits/PR/issues, CI/Pages, puis utiliser `PROJECT_MAP.md` et seulement les fichiers de la zone. Hiérarchie : code + données + RLS + comportement déployé > contrats > contexte > historique.

Wikignose a été retiré de `main` : ne pas le réintroduire depuis l'historique sans décision explicite.

## Routage essentiel

- Bibliothèque → `index.html` + JS/CSS réellement chargés.
- Écoute → `audio.html` + lecteur/styles réellement chargés ; préserver le mode calme.
- Admin → `admin.html` + scripts de la capacité touchée.
- Données/auth → `js/supabase.js` + migrations/policies réelles.
- Journal → pages/scripts dédiés ; préserver sanitation du contenu riche.
- Médias → identifier DB + bucket avant mutation.
- **Studio Audio** → `studio.html`, puis la zone **Studio Audio** de `PROJECT_MAP.md`. Sa branche canonique est `studio/integration` : elle représente le dernier état Studio **techniquement validé + humainement accepté**, pas automatiquement le développement Git le plus récent. Pour Android/Web Audio, mémoire, tactile ou OPFS, une CI verte ne suffit pas : conserver un **HUMAN GATE réel** avant de promouvoir un nouvel état dans `studio/integration`.

Mutation média sûre : `upload nouveau → vérifier → mettre à jour SQL → vérifier → supprimer ancien` ; nettoyer le nouveau si l'écriture échoue lorsque sûr.

## Produit / simplicité

Cible enfant : `ouvrir → voir quoi écouter → reconnaître → toucher → écouter → interface s'efface`.

Pas de navigation vocale, profils enfants complexes, onboarding ou recommandation lourde par défaut. Simplicité enfant ≠ suppression des capacités utiles à l'adulte. Si l'enfant ne comprend pas l'écran, simplifier l'écran plutôt qu'ajouter une couche explicative.

## Boucle

`écran/parcours réel → geste attendu → friction observée → première couche responsable → simplification minimale → test mobile/réel → CONTINUE/PIVOT/STOP`.

Une vérification automatisée ne remplace pas une observation visuelle réelle lorsque la question est perceptive.

## Passation

Privilégier PR/commit et sources existantes plutôt qu'un journal massif. Laisser reconstructibles **objectif / dernière boucle / preuve / prochaine décision**. Une nouvelle conversation doit pouvoir découvrir Grand Père depuis ce fichier sans que l'utilisateur fournisse le contexte.
