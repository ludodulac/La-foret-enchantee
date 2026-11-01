# STUDIO-WAV-019 — première intégration dans le Studio Audio existant

## Résultats humains déjà validés

Sur Redmi/Brave, Ludo a validé l'enregistrement, la récupération de prises, le téléchargement et l'écoute du WAV hors navigateur, puis les essais d'environ 1 min, 1 min 45, 3 min et enfin **5 minutes** (« Ok ça a fonctionné »). Ce sont des preuves pour **la page expérimentale** `experiments/studio-recording-wav-001.html`, pas pour cette intégration.

## Livrable de cette PR (DRAFT)

- Le **Studio Audio existant** reste sur `studio.html` avec ses pistes, sonothèque, projets et contrôles inchangés.
- En choisissant **OUTILS → PRISES WAV SÉCURISÉES**, l'utilisateur accède à une petite interface dans **le même Studio**, sans naviguer vers une seconde application.
- Cette interface peut enregistrer par fragments WAV de ~1 s dans l'OPFS existant `studio-wav-takes-v1`, avec compteur, arrêt, récupération de prises et prévisualisation 30 s.
- Elle peut préparer un téléchargement du WAV complet jusqu'à **5 minutes / 32 Mio**, puis le proposer à Brave pour sauvegarde.
- Elle peut retrouver les prises précédentes faites sur la page de test, car elle emploie **exactement le même stockage OPFS local sur le même domaine**.
- **Étape de raccordement 020 :** les prises de **30 s maximum**, après arrêt confirmé du microphone, sont automatiquement ajoutées à la piste active du projet (forme d'onde calculée progressivement sans décodage complet). Les prises courtes anciennes peuvent être ajoutées avec « AJOUTER SUR LA PISTE ». La source sonore est enregistrée dans la bibliothèque du projet local, sans changement de schéma.
- Elle empêche d'ouvrir une prise WAV pendant qu'un enregistrement normal est actif, et verrouille la fermeture du panneau pendant la capture WAV. Aucun enregistrement n'est envoyé sur le réseau.

## Frontières à respecter

**IMPORTANT : seul le montage de courtes prises (30 s maximum) est proposé dans ce brouillon.**

- Pour les prises de 30 s ou moins, le WAV est assemblé à partir des slices OPFS (taille limitée) et enregistré comme source locale du projet dans IndexedDB v3. Les morceaux apparaissent sur la timeline et sont déplaçables/coupables. La lecture passe encore par le décodeur paresseux historique, à valider sur Redmi avant fusion.
- Les prises de **plus de 30 s**, dont les 5 minutes déjà validées, restent **hors timeline** jusqu'à la conception d'une source longue OPFS ou compressée avec lecture progressive, sans décodage global. Le panneau annonce honnêtement cette limite.
- L'ancien bouton REC utilise toujours MediaRecorder : **aucune bascule de l'ancien moteur**, ni suppression ou modification des projets IndexedDB existants.
- Aucun changement de schéma IndexedDB, de Supabase, ni de mise en ligne des fichiers audio ; pas d'abonnement.
- Ne pas confondre « fichier WAV dans OPFS du navigateur » et « fichier présent dans les Téléchargements du téléphone ».
- Le niveau de preuve **5 min sur la page expérimentale** ne démontre ni 5 min dans ce nouveau panneau, ni 35 min, ni l'intégration au montage.

## Gate de validation

- CI sur HEAD exact, avec `node tests/studio-wav-inside-studio-019.test.cjs` et tests Studio déjà en place.
- Prévisualiser une version **sans publication de production**. Sur Redmi, ouvrir un projet et OUTILS / PRISES WAV SÉCURISÉES. Essayer une prise de 10–15 s et ARRÊTER : vérifier qu'un clip apparaît automatiquement sur la piste, puis peut être écouté, coupé et déplacé. Fermer et rouvrir le projet, vérifier son retour et la sauvegarde. Retrouver aussi une ancienne prise WAV, puis télécharger une prise de 5 min (qui ne doit pas apparaître comme clip).
- Vérifier qu'une ancienne piste, les projets locaux et le REC historique sont toujours accessibles.
- Aucun merge dans `studio/integration`, `main`, ni déploiement de production **avant ce test humain**.

## Étape ultérieure (non réalisée)

Concevoir la version **longue** du raccordement `OPFS WAV → compression Opus si disponible → source segmentée sur la timeline → export MP3/WAV` **sans décoder 35 minutes d'un seul coup ni recopier de gros WAV dans IndexedDB**, avec reprise de conversion interrompue, contrôle de durée, vérification du fichier compressé, et conservation des fragments originaux jusqu'à validation. Le MP3 nécessite une bibliothèque d'encodage distincte (WebCodecs encode Opus/AAC, pas MP3 directement). Aucune compression automatique n'est encore livrée.
