# STUDIO-WAV-019 — première intégration dans le Studio Audio existant

## Résultats humains déjà validés

Sur Redmi/Brave, Ludo a validé l'enregistrement, la récupération de prises, le téléchargement et l'écoute du WAV hors navigateur, puis les essais d'environ 1 min, 1 min 45, 3 min et enfin **5 minutes** (« Ok ça a fonctionné »). Ce sont des preuves pour **la page expérimentale** `experiments/studio-recording-wav-001.html`, pas pour cette intégration.

## Livrable de cette PR (DRAFT)

- Le **Studio Audio existant** reste sur `studio.html` avec ses pistes, sonothèque, projets et contrôles inchangés.
- En choisissant **OUTILS → PRISES WAV SÉCURISÉES**, l'utilisateur accède à une petite interface dans **le même Studio**, sans naviguer vers une seconde application.
- Cette interface peut enregistrer par fragments WAV de ~1 s dans l'OPFS existant `studio-wav-takes-v1`, avec compteur, arrêt, récupération de prises et prévisualisation 30 s.
- Elle peut préparer un téléchargement du WAV complet jusqu'à **5 minutes / 32 Mio**, puis le proposer à Brave pour sauvegarde.
- Elle peut retrouver les prises précédentes faites sur la page de test, car elle emploie **exactement le même stockage OPFS local sur le même domaine**.
- Elle empêche d'ouvrir une prise WAV pendant qu'un enregistrement normal est actif, et verrouille la fermeture du panneau pendant la capture WAV. Aucun enregistrement n'est envoyé sur le réseau.

## Frontières à respecter

**IMPORTANT : ce n'est PAS encore l'intégration des nouvelles prises dans le montage.**

- Les nouvelles prises WAV sécurisées restent disponibles dans la liste locale ; **elles ne sont pas encore des clips de la timeline**. L'utilisateur doit le voir clairement dans le panneau. Les fichiers ne sont pas ajoutés au projet automatiquement.
- L'ancien bouton REC utilise toujours MediaRecorder : **aucune bascule de l'ancien moteur**, ni suppression ou modification des projets IndexedDB existants.
- Aucun changement de schéma IndexedDB, de Supabase, ni de mise en ligne des fichiers audio ; pas d'abonnement.
- Ne pas confondre « fichier WAV dans OPFS du navigateur » et « fichier présent dans les Téléchargements du téléphone ».
- Le niveau de preuve **5 min sur la page expérimentale** ne démontre ni 5 min dans ce nouveau panneau, ni 35 min, ni l'intégration au montage.

## Gate de validation

- CI sur HEAD exact, avec `node tests/studio-wav-inside-studio-019.test.cjs` et tests Studio déjà en place.
- Prévisualiser une version **sans publication de production**. À faire sur téléphone avec une prise sans valeur : ouvrir un projet, ouvrir OUTILS / PRISES WAV SÉCURISÉES ; retrouver une prise de 5 min enregistrée auparavant, écouter un extrait et télécharger. Puis enregistrer 15–30 s depuis le panneau, arrêter, retrouver après rechargement, lire et télécharger.
- Vérifier qu'une ancienne piste, les projets locaux et le REC historique sont toujours accessibles.
- Aucun merge dans `studio/integration`, `main`, ni déploiement de production **avant ce test humain**.

## Étape ultérieure (non réalisée)

Concevoir un raccordement `OPFS WAV → clip sur la timeline → autosave compatible` **sans décoder 35 min d'un seul coup ni recopier un gros WAV dans IndexedDB**, avec persistance/reprise réelles et compatibilité des anciens projets.
