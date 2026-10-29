# STUDIO-REC-WAV-001A — capture WAV persistante (prototype isolé)

**État : expérimental. Ne pas fusionner ni promouvoir dans studio/integration sans HUMAN GATE Android.**

## Ce qui est réellement construit

- Capture PCM16 **mono** dans un AudioWorklet, par blocs proches de 1 seconde.
- Chaque bloc devient un véritable WAV autonome, écrit et fermé dans OPFS.
- Récupération par ID après rechargement : contrôle de la continuité des fragments, en-têtes WAV, taux d'échantillonnage et tailles de fichiers. Aucun effacement automatique.
- Écriture progressive d'un WAV complet vers un flux de fichier fourni par le navigateur : pas de grosse allocation PCM globale.
- Contraintes microphone écho, réduction du bruit et gain automatique demandées à false ; Wake Lock demandé si autorisé ; file d'écriture limitée à cinq segments dans le banc manuel.
- Fichiers : js/studio-recording-wav-core.js, js/studio-recording-wav-worklet.js, experiments/studio-recording-wav-001.html et tests/studio-recording-wav-001.test.cjs.

## Préservation

Le fichier studio.html et son ancien record() ne sont pas modifiés. Aucun changement dans IndexedDB v3 foret-studio-autosave, Supabase, les buckets, les médias ni les pages pour les enfants. Baseline de départ : studio/integration au commit 985909dddaef734aaf65e7f165f3db67dffdea61.

## Correction 001B — récupération après fermeture d'onglet

- Le banc manuel recense maintenant les prises disponibles dans OPFS, sans devoir mémoriser l'identifiant de la prise.
- La liste indique les prises dont les métadonnées sont illisibles ; elle ne les supprime ni ne les modifie.
- Le stockage simulé du test Node représente désormais correctement les sous-répertoires OPFS indépendants.
- Test ajouté : plusieurs prises, métadonnées endommagées, fichiers étrangers ignorés, aucune suppression.
- Le navigateur peut malgré tout effacer OPFS si les données de site sont effacées ; ce test ne constitue **pas** une sauvegarde externe sur le téléphone.

## Tester

1. En local, lancer node tests/studio-recording-wav-001.test.cjs.
2. Sur un domaine HTTPS de prévisualisation distinct, ouvrir experiments/studio-recording-wav-001.html.
3. Autoriser le micro, enregistrer 15 secondes, arrêter et noter l'ID.
4. Recharger ; ressaisir l'ID ; choisir RETROUVER LA PRISE. Comparer durée et nombre de segments.
5. Faire une courte prise de test ; fermer l'onglet brutalement ; rouvrir et récupérer l'ID. Les fragments fermés doivent réapparaître.
6. Tester aussi une durée plus longue et un téléphone proche de la saturation du stockage, **sans prise importante**.

## HUMAN GATE Android — vérification réelle du 29 octobre 2026

**PASS partiel — prototype public isolé (GitHub Pages), pas le Studio complet.**

Témoignage et captures de Ludo, sur Android dans Brave :
- Capture initiale d'une courte prise micro, puis fermeture/réouverture du navigateur.
- Récupération confirmée : **11 fragments WAV**, **10,81 secondes**, **séquence continue**.
- Nouveau bouton d'écoute publié sur la page expérimentale via la PR #39 : Ludo confirme ensuite **« Oui j'ai bien entendu ma voix correctement »**.
- Cela valide l'enregistrement, la persistance locale courte et la lecture audible sur cet appareil dans ce scénario.

**NON TESTÉ / NON VALIDÉ :** 35 minutes, écran verrouillé, interruptions système, espace saturé, export WAV vers le dossier du téléphone, intégration au montage multipiste, sauvegarde/restauration des projets existants et robustesse de la reprise après plantage. Il ne faut **pas** promouvoir le prototype tel quel dans `studio/integration`.

**Traçabilité :** version de la page testée : `main` après fusion de la PR #39 (commit `b8243ccb36debf19195288bd6751536da685cf1c`). Le code de cette PR #36, qui repose sur une autre branche, ne doit pas être traité comme un HEAD identique au code de la page publiée.

**Prochaine action ciblée :** proposer une sauvegarde WAV réelle sur Android, sans modifier `studio.html`, puis tester le téléchargement d'une courte prise avant toute intégration.

## Limites connues

- Les WAV sont dans l'OPFS du navigateur, **pas automatiquement dans le dossier Fichiers du téléphone**. Un nettoyage des données du site peut les effacer. Export via showSaveFilePicker uniquement si l'appareil le propose ; l'export Android universel reste à concevoir.
- L'arrêt du navigateur peut perdre le fragment de la dernière seconde non encore écrit. Le microphone ne redémarre pas de lui-même après un plantage ni en arrière-plan.
- Le test Node certifie des contrats synthétiques, pas un vrai microphone Android, son écran verrouillé ni 35 minutes de prise.
- La détection de corruption vérifie les tailles et l'en-tête mais **pas encore une somme de contrôle** du PCM.
- Ce prototype **ne relie pas encore ses segments aux clips de Studio** et ne corrige pas encore la lecture en RAM.
- Une prise de 35 minutes à 48 kHz PCM16 mono occuperait environ 202 Mo ; il faut mesurer le quota réel OPFS.

## Prochaine petite mission

Vérification Chromium/Android réelle, export Android sans allocation globale, index de récupération accessible sans saisir l'ID, puis connexion réversible au modèle de clips en conservant les anciens projets. Lecture audio segmentée avant tout usage de 35 minutes en production.
