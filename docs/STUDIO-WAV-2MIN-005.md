# STUDIO-WAV-005 — essai progressif de 2 minutes sur Android

**But :** tester la durée de sauvegarde/récupération/export WAV avec la page expérimentale existante. Rien n'est changé dans `studio.html`, `studio/integration`, les anciens projets ou Supabase.

## Ce qui est construit

- Le lecteur local reste **limité à 30 secondes de prévisualisation**, même pour un long enregistrement.
- Téléchargement `blob:` Android d'une **prise complète** de **120 secondes maximum** et **24 Mio maximum**, sans troncature.
- Assemblage de tranches WAV OPFS avec vérification de l'en-tête, de la taille et de la continuité des fragments. Pas de décodage de tout le PCM en mémoire.
- En cas de dépassement, l'export est refusé et **tous les fragments originaux restent conservés**.
- Si le navigateur offre un sélecteur de fichiers streaming (`showSaveFilePicker`), celui-ci continue d'être privilégié.

## HUMAN GATE — à réaliser dans Brave Android

1. Même navigateur et même origine GitHub Pages, navigation normale (pas privée). **Ne pas nettoyer les données du site.**
2. Faire une **nouvelle prise sans valeur de 60 secondes**, garder le téléphone allumé et la page ouverte.
3. Appuyer ARRÊTER ; vérifier la durée et la « séquence continue » dans le journal.
4. Fermer/revenir à la page ; sélectionner la nouvelle prise et appuyer RETROUVER.
5. Appuyer ÉCOUTER : prévisualisation des 30 premières secondes (limite voulue).
6. Appuyer EXPORTER UN WAV, puis TÉLÉCHARGER MON WAV si proposé.
7. Ouvrir le WAV téléchargé dans Fichiers/Téléchargements ; vérifier qu'il dure environ **60 s** et contient la voix **du début à la fin**.
8. Seulement ensuite essayer 120 s. Une validation de 60 s **ne valide pas** 120 s ou 35 minutes.

## Retour humain Android — 29 octobre 2026

**PASS déclaré par Ludo pour l'essai de 1 minute :** le WAV téléchargé est présent dans les fichiers du téléphone et l'utilisateur confirme qu'il peut l'ouvrir et l'écouter **du début à la fin**. La durée exacte du fichier n'a pas été relevée indépendamment sur une capture. Ne pas extrapoler à 120 secondes ni à 35 minutes.

**Deux problèmes UX observés :** aucun compteur de secondes visible pendant la prise ; absence de message évident confirmant que la demande de téléchargement a été transmise au navigateur. La mission STUDIO-WAV-006 corrige seulement ces deux points et simplifie la page expérimentale. Un message « téléchargement demandé » n'est **pas** une confirmation du fichier dans Android.

## Non validé

- Durée longue 35 minutes, sortie en MP3, fonctionnement écran verrouillé, interruptions.
- Export WAV long sans sélecteur natif, intégration dans les clips et timeline de Studio.
- Sauvegarde permanente garantie : OPFS reste effaçable via les données du site.

**Ne pas promouvoir le moteur dans `studio/integration` avant les autres gates Android et la compatibilité avec les clips existants.**
