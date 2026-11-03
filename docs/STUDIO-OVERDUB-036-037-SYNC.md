# STUDIO AUDIO — 036–037 : diagnostic du doublage décalé

**3 novembre 2026 · Dépôt :** `ludodulac/La-foret-enchantee`  
**Branche :** `feat/studio-opus-compact-025` · **PR #46 : DRAFT** · ne pas fusionner sans vérification réelle sur Redmi/Brave.

## Observation utilisateur

Ludo a enregistré « un un un quatre » sur la première piste, puis la même phrase sur la seconde en écoutant la première. À la lecture, les voix ne tombent pas ensemble (« un un un un … quatre quatre »). La capture envoyée montre deux régions de clips démarrant à des abscisses proches, mais des attaques de waveform décalées. **Il n'est pas possible de déterminer la latence exacte à partir d'une capture fixe.** Les projets du navigateur privé de l'utilisateur ne sont pas accessibles à la CI et n'ont pas été modifiés.

## Cause logicielle confirmée dans le code

Dans l'implémentation antérieure au correctif :
```js
const success = await wavController.start(); // l'AudioWorklet commence à capturer
if (success && clips.length) {
  await play(snapshot.start, true);  // réactive le contexte ET décode les pistes ici
}
```

`play()` appelle `preparePlayback()`, qui peut télécharger la source depuis IndexedDB, décoder le WAV, calculer une waveform, indexer des fragments OPFS et seulement **ensuite** lancer les sources WebAudio. La nouvelle voix est capturée pendant toute cette préparation, alors que le chanteur n'entend pas encore le guide. Il répète donc logiquement après un départ tardif, et ses syllabes restent enregistrées plus loin sur la timeline, malgré le même début de clip. La durée du retard varie avec le navigateur, le processeur, le cache et la taille des fichiers.

**Ce défaut était réel et indépendant des autres latences matérielles.** Les anciens tests vérifiaient la présence de deux prises et leur début nominal, mais pas la concordance des attaques sonores ni l'ordre exact décodage → microphone → écoute.

## Correctif implémenté

1. Au clic **REC WAV**, mémoriser le projet, la piste armée et la position temporelle ; désactiver les opérations concurrentes.
2. Si le Studio contient un guide audible, **réactiver le contexte audio puis entièrement préparer/décoder le guide avant de demander le microphone**. Durant cette préparation, ne pas dessiner de prise et ne pas faire défiler le temps d'enregistrement.
3. **STOP peut annuler la préparation** ; le micro n'est pas encore ouvert, et une préparation asynchrone qui se termine tardivement ne relance jamais l'enregistrement.
4. Lorsque le microphone et son AudioWorklet sont enfin prêts, fournir `onCaptureStart` et **lancer les sources WebAudio déjà préparées de façon synchrone dans le même tour JavaScript**. Il ne reste aucun décodage asynchrone entre le début de la capture et le début du guide.
5. Enregistrer de simples mesures locales `secureOverdubSync` pour les tests : déclenchement des sources et de la capture, `AudioContext.outputLatency`, `baseLatency`, sans enregistrer ni transmettre les sons.
6. Maintenir le réglage des pistes, la position du curseur et les sauvegardes existants. **Ne jamais déplacer ou re-trimmer rétroactivement les prises de l'utilisateur.**
7. Signal visuel « 🎧 CASQUE CONSEILLÉ » durant un doublage, afin de prévenir la recapture du guide par le microphone quand le haut-parleur du téléphone est actif.

## Preuves expérimentales CI

### 036 — Ordonnancement et contrôle

- Injecte un décodage artificiellement lent de **1 250 ms** dans le vrai Studio Chromium mobile.
- Vérifie qu'à **+350 ms**, le microphone n'a **pas encore été sollicité** et la deuxième piste n'enregistre pas.
- Vérifie que STOP peut interrompre cette préparation sans perdre la première piste et sans ouvrir tardivement le micro.
- Nouvelle tentative : mesure `getUserMedia` après la fin du décodage et `AudioBufferSource.start` dans le même tour que `onCaptureStart`.
- Sur le passage documenté du 3 novembre : `decodeStart=6229.9 ms`, `decodeDone=7480.0 ms`, `micRequestedAt=7489.5 ms`, `captureActivationAt=7496.1 ms`, `outputStartedAt=7496.4 ms`. Écart d'appel JavaScript ≈ **0,3 ms** dans Chromium CI.
- Deux régions conservées sur deux pistes différentes à la position 0 et avec les fichiers WAV récupérables.

### 037 — Épreuve acoustique synthétique, pas seulement des horodatages

- Crée un guide WAV avec des clics rythmiques dont le premier est à **0,280 s**, puis injecte un décodage de **1 250 ms**.
- Utilise un microphone WebAudio **synthétique** qui produit une impulsion au même rythme **quand le guide est réellement déclenché** ; capture le PCM par le vrai AudioWorklet et vérifie le WAV sauvegardé.
- Passage documenté : premier clic capturé à **0,3046 s** dans le WAV, contre une cible de 0,280 s. Écart ≈ **25 ms** dans ce banc d'essai. Le dépassement de 1,2 s causé par l'ancien ordonnancement a disparu dans cette simulation.
- Vérifie deux clips à la position temporelle 0 et un signal PCM non silencieux.

Les tests 029–033 restent nécessaires : capture normale, OPFS, réouverture, lecture, export, micro muet, STOP immédiat, prévention des blocages et restauration Android.

**Limite capitale :** aucun test synthétique Chromium ne mesure les délais analogiques d'entrée/sortie du matériel du Redmi 12 et de Brave. Les tests ne garantissent pas le même écart de 25 ms sur ce téléphone.

## Deux sources distinctes de latence restantes

### Latence matérielle et système

La latence de sortie correspond au temps entre l'ordre audio du logiciel et l'arrivée du son aux oreilles ; la latence d'entrée est le trajet inverse (voix → micro → tampon logiciel). Android indique que la latence aller-retour combine entrée, sortie et traitement. Le Web Audio standard expose `AudioContext.baseLatency`, `outputLatency` et `getOutputTimestamp()`, mais aucune de ces valeurs ne constitue **à elle seule** une mesure fiable de la latence aller-retour du Redmi. Le paramètre `getSettings().latency` d'un `MediaStreamTrack` est une valeur de configuration cible, non un étalonnage acoustique.

Sources :
- [Android Developers — Audio latency](https://developer.android.com/ndk/guides/audio/audio-latency)
- [W3C Web Audio API](https://www.w3.org/TR/webaudio/)
- [MDN — AudioContext.getOutputTimestamp](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp)
- [MDN — MediaStreamTrack.getSettings](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings)

**Bonne pratique des stations audio :** Audacity utilise une correction de latence propre à chaque combinaison microphone/sortie, idéalement étalonnée par un clic lu et réenregistré. La correction s'applique à la prise finale, non au contenu audio source.
- [Audacity — Latency Compensation](https://github.com/audacity/audacity-support/blob/main/troubleshooting/solving-recording-problems/latency-compensation.md)
- [Audacity Manual — Recording FAQ](https://manual.audacityteam.org/man/faq_recording_troubleshooting.html)

### Repisse acoustique du haut-parleur

Si la première piste sort par le haut-parleur du Redmi, le microphone peut la capturer **en plus** de la nouvelle voix. La lecture du mix donne alors un « doublage » ou un écho, même si les clips sont parfaitement calés. Dans le moteur WAV pilote, `echoCancellation:false` protège le timbre musical mais **ne retire pas** cette repisse. Préférer des écouteurs **filaires** pour les essais musicaux ; des casques Bluetooth peuvent eux-mêmes ajouter une latence variable. C'est une hypothèse pour la vidéo de Ludo, **pas un fait vérifié**, car l'utilisation de casque n'est pas connue.

Source : [web.dev — Synchronize audio and video playback on the web](https://web.dev/articles/audio-output-latency).

## Décision et prochaine qualification

- Conserver les corrections et la CI sur la PR **DRAFT** ; prévisualisation isolée uniquement.
- Ne pas prétendre que les **prises anciennes** sont automatiquement réalignées : leurs échantillons et positions ne sont pas modifiés.
- Une fois le nouveau moteur essayé **sans capture d'écran et avec écouteurs**, il reste à mesurer la latence aller-retour **sur le vrai téléphone** avec un guide cliqué et un retour micro ; calibrer éventuellement l'alignement des nouvelles prises sur la base de cette mesure. Ne pas appliquer un décalage fixe inventé.
- En cas d'écho par haut-parleur, considérer les prises déjà enregistrées comme contenant potentiellement un mélange de deux sources ; une simple translation temporelle ne peut pas supprimer un son qui a été physiquement réenregistré.
