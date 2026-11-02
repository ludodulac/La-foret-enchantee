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
