# STUDIO OPUS 025–027 — fichiers légers (prototype DRAFT)

## Pourquoi ?

Le mixage actuel génère un WAV stéréo 16 bits à 44,1 kHz. Un conte de 35 minutes représente **environ 370 Mo**. Le but est de pouvoir proposer un fichier compact, sans sacrifier la sécurité des WAV sources.

## Chemin utilisateur envisagé (dans le Studio existant)

1. Enregistrer par fragments WAV sécurisés, éditer les pistes, puis cliquer **EXPORT**.
2. Le Studio prépare un **WAV mixé** dans OPFS (comme dans PR #45).
3. Dans la même fenêtre, un bouton optionnel **FICHIER LÉGER (OPUS) · ESSAI** est activé seulement si `AudioEncoder.isConfigSupported` confirme `opus`, 48 kHz, deux canaux.
4. Sur clic, le WAV est lu en **tranches d'environ 20 ms**, converti de 44,1 kHz à 48 kHz, encodé en paquets Opus, et écrit en pages **Ogg/Opus** contrôlées (BOS/EOS, CRC32, granule/durée).
5. Un lien **TÉLÉCHARGER OGG OPUS** est proposé. L'utilisateur vérifie ensuite le fichier, y compris le début et la fin. Le Studio ne prétend pas savoir si Brave a fini de télécharger.
6. Le WAV source ne change pas ; le WAV final et le Ogg compressé peuvent être supprimés manuellement depuis **Options avancées → EFFACER LES WAV TEMPORAIRES** après vérification du téléchargement. Rien n'est supprimé automatiquement.

**Attention : ce n'est pas du MP3.** Le format Ogg Opus est léger et approprié aux voix, mais la compatibilité avec le téléphone et les services de publication doit être vérifiée.

À 96 kb/s, **35 minutes de son représenteraient théoriquement environ 25 Mo** (variable selon le codec et l'en-tête) contre ~370 Mo en WAV stéréo. Ce n'est pas encore une mesure de fichier réel.

## Précautions mises en place

- **Non destructif** : source WAV intacte, suppression des temporaires uniquement sur action explicite et confirmation.
- **Mémoire** : génération d'AudioData de **960 échantillons × 2 canaux** (20 ms) et lecture de petites fenêtres WAV; alimentation du WebCodecs par paquets, avec flush et attente régulière des écritures OPFS.
- **Support vérifié** : pas de promesse de compression lorsque AudioEncoder/Opus est indisponible.
- **Conformité** : entête WAV source strictement PCM16 stéréo 44,1 kHz; en-têtes Ogg Opus, CRC et longueur finale vérifiés ; refus d'émettre une fausse réussite si le nombre de paquets est incorrect ou si le fichier compact est trop gros.
- **Séparation** : nouvelle PR #46 basée sur la branche de développement de PR #45 ; **aucune fusion**, aucune publication sur GitHub Pages, aucune modification du Studio actuel.
- **Ancien projets** : malgré l'autorisation de s'en passer, aucun effacement automatique d'IndexedDB ni des prises OPFS originales.

## État exact des preuves

Les tests automatisés Node valident :
- le multiplexeur Ogg Opus et son checksum CRC32, la chronologie des pages et la fermeture EOS ;
- l'encodage « simulé » avec un **faux AudioEncoder** (lecture WAV bornée, cadence 20 ms, conversion, écriture locale, dimensions et durée de l'en-tête) ;
- le garde-fou de disponibilité, l'interface optionnelle et la suppression ciblée des temporaires.

**Ces tests ne prouvent PAS** qu'un véritable navigateur produit un Opus audible, ni que le Redmi le relit, ni que la compensation du délai de codec (pre-skip 312 échantillons) est parfaitement calée. Un test **avec un véritable AudioEncoder Chromium** puis décodage indépendant doit être effectué **avant de fusionner**. Il faudra vérifier l'alignement audio (sans silence ou coupure au début), le nombre d'échantillons réels, la fin de fichier et les sorties longues.

## Prochaines vérifications avant diffusion

- Test WebCodecs Opus natif et lecture d'un .ogg réel, d'abord sur 10 s, puis 3–5 min.
- Contrôle de décalage/granule Opus, synchronisation des pistes, traitement des sorties de navigateur différentes.
- Mesure de l'espace disque temporaire pendant une conversion ; ne pas prétendre que la compression 35 min est certifiée.
- Si l'encodeur n'est pas supporté sur Brave/Redmi : solution de repli étudiée séparément plutôt que de modifier l'enregistrement fiable.

**La version actuelle en production reste inchangée.**

## STUDIO OPUS 028 — première validation Chromium réel (2 novembre 2026)

La PR contient maintenant `tests/studio-opus-browser-native-028.test.cjs` et le workflow isolé `.github/workflows/studio-opus-native.yml`.

**Premier essai réel (Chromium Linux headless, pas Redmi)** : encoder WebCodecs natif disponible. Le test a initialement détecté un défaut réel : 78 paquets Opus émis pour 76 paquets soumis, dû au délai/vidage de l'encodeur. Le code accepte désormais un nombre strictement borné de paquets de vidage, puis arrête la lecture à la bonne durée via le granule EOS.

**Deuxième défaut corrigé** : un silence artificiel de 312 échantillons avait été ajouté alors que le codec applique déjà sa propre latence. Après suppression de ce faux pré-roll, le test Chromium a mesuré pour 1,5 s de WAV stéréo synthétique :
- WAV source : **264 644 octets** ; Ogg/Opus : **19 087 octets**.
- Fichier Ogg relu par `AudioContext.decodeAudioData` **indépendamment** de l'encodeur : 1,500 s, 48 kHz, deux canaux.
- Voix/test synthétique audible au début, au milieu et à la fin. Corrélation de phase source-sortie : **0,99996** gauche ; **0,99989** droite.
- La validation native couvre un fichier court **dans Chromium de CI uniquement**. La compatibilité Redmi/Brave, les longs fichiers, le montage multipiste réel sur téléphone et l'export dans La Forêt Enchantée **restent non validés**.

La PR reste **DRAFT** : aucun projet utilisateur ni enregistrement original supprimé, aucune publication automatique.

### 028 — vérification supplémentaire sur une minute (Chromium réel)

La vérification native a ensuite été étendue à **60 secondes** pour détecter une anomalie invisible sur 1,5 seconde : le code appelait `AudioEncoder.flush()` toutes les 40 trames, ce qui créait **75 paquets Opus supplémentaires** par minute et faussait la durée. Il utilise désormais `encodeQueueSize` pour limiter la file d'attente et n'appelle `flush()` **qu'une seule fois à la fin**.

**Résultat après correction, CI native Chromium Linux headless :**
- Source synthétique stéréo PCM16 44,1 kHz : **10 584 044 octets** pour 60 secondes.
- Ogg Opus : **729 855 octets** ; **3 001 paquets** (3 000 trames d'entrée et 1 paquet final d'encodeur).
- Décodeur audio Chromium indépendant : **60 secondes exactement**, fin du signal audible (RMS **0,3695** sur la dernière seconde).
- L'essai court de 1,5 seconde demeure correct : corrélation de phase **0,99996** / **0,99989**, durée exacte, taille réduite.

Ce test est un **vrai encodage/décodage en navigateur** (pas un mock), mais pas un essai sur Redmi ni un enregistrement réellement capté par microphone. Aucun WAV source ou ancien projet n'est effacé.
