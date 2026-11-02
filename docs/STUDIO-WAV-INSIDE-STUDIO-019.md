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

## Étape de raccordement 021–022 — clips longs avec référence OPFS (DRAFT, non validé sur Redmi)

- L'enregistreur expérimental valide **5 minutes en vrai sur Redmi** ; la présente intégration dans le Studio multipiste est **seulement testée techniquement**, pas en conditions réelles.
- Une prise de **30 secondes à 5 minutes** peut être liée à la timeline avec une **référence de quelques octets** enregistrée en tant que source IndexedDB v3 `origin='opfs-wav-long'`, sans recopier les ~29 Mo de son PCM dans la base. Le WAV découpé reste intact dans OPFS.
- Lors du raccordement, la forme d'onde est calculée en parcourant des tranches PCM de **32 768 échantillons maximum** et en rendant la main à l'interface après chaque tranche. Les crêtes (environ 256 octets par seconde) sont conservées pour la réouverture des projets.
- En lecture, un index contient uniquement les durées et noms des fragments ; le moteur ouvre des fenêtres **500 ms** à la demande, alimente le WebAudio juste à temps et ne passe **jamais** les 5 minutes dans `decodeAudioData`. Une lecture en retard génère une erreur explicite et s'arrête, au lieu de prétendre avoir joué l'intégralité du son.
- Les tests de contrat couvrent l'indexation et le déplacement jusqu'à l'extrémité d'une prise **virtuelle de 35 minutes** et la lecture simulée synchronisée en tranches. Ces tests **ne valident pas l'enregistrement, la lecture ni le montage réels de 35 minutes sur Android**.
- Les clips OPFS peuvent être affichés, déplacés, coupés, rendus muets et conservés avec le projet ; la relecture depuis la timeline et la réouverture après fermeture nécessitent encore le **test humain Android**.
- **Export du montage comportant une source OPFS longue encore bloqué volontairement** : le moteur historique de mixage exige un AudioBuffer complet. Le WAV individuel original reste téléchargeable jusqu'à 5 minutes, mais un fichier publié depuis le montage serait prématuré.
- Les références OPFS peuvent devenir invalides si l'utilisateur efface les données du navigateur : elles ne constituent pas une sauvegarde indépendante. Aucune suppression de WAV source n'est automatisée.

### Contrôles qui doivent réussir avant fusion

1. Sur un **projet d'essai**, enregistrer une prise de 15 s dans OUTILS → PRISES WAV SÉCURISÉES ; arrêter ; constater son ajout à la piste, puis lecture, coupe et réouverture.
2. Sur une prise de **3 à 5 minutes** déjà enregistrée, ajouter à la piste active ; parcourir la forme d'onde, écouter **le début puis un passage près de la fin**, arrêter/reprendre, fermer et rouvrir le projet.
3. Vérifier le comportement si la prise originale OPFS a disparu : erreur compréhensible, aucun écrasement d'un ancien projet et pas de faux succès.
4. Vérifier que **toutes les anciennes pistes** et la sonothèque continuent de fonctionner. Pas de déploiement avant résultats.

**Non livré :** compression Opus/MP3 automatique, export du montage OPFS long, fonctionnement écran verrouillé, lecture multitrack longue certifiée et 35 min réels.
