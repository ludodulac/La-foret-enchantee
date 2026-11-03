# STUDIO AUDIO — Étude des défaillances du microphone Android (mission 034)

**Date :** 3 novembre 2026 · **Périmètre :** Brave sur Redmi Note 12, Studio web dans le dépôt `ludodulac/La-foret-enchantee`.  
**Statut :** correctifs expérimentaux sur la PR #46 **DRAFT**, production non modifiée, validation matérielle Redmi non acquise.  
**Règle :** ne jamais confondre succès en Chromium Linux avec preuve de fonctionnement sur le Redmi/Brave.

## 1. Observations reproductibles fournies par l'utilisateur

- Dans la vidéo du 3 novembre à 12 h 22, la première tentative passe plusieurs secondes par « ouverture du microphone », puis une prise apparaît. La deuxième reste sur ce message **environ 15 secondes** avant de passer à la capture. La prise visible n'établit pas qu'elle contient la voix réelle.
- Analyse technique du MP4 fourni : durée **62,2814 s**, image 864×1920, audio AAC mono 48 kHz. Après décodage du flux audio du **MP4 de capture d'écran** en PCM16, les **2 982 912 échantillons sont tous nuls** (`max(abs(sample)) = 0`). Ceci prouve que la vidéo de capture elle-même est entièrement muette ; cela **ne mesure pas le fichier WAV conservé par Brave**. Impossible de diagnostiquer la qualité de la prise WAV uniquement avec cette vidéo.
- L'utilisateur a signalé une panne temporaire de dictée vocale après essais, corrigée après redémarrage du téléphone. Association temporelle réelle, mais **causalité du Studio non démontrée**.

## 2. Mécanismes étayés par les sources techniques

### A. Concurrence de microphones sous Android — cause plausible majeure

Android 10+ arbitre la capture entre applications. Deux applications dites « ordinaires » peuvent être simultanément en état d'enregistrement, mais **une seule reçoit les échantillons ; l'autre peut recevoir uniquement du silence**. Les priorités dépendent du premier plan et du caractère sensible de la source. La capture d'écran, Brave et la dictée Gboard constituent un scénario de compétition plausible ; le site web ne peut pas contourner ces règles natives.

Source officielle : [Android Developers — Sharing audio input](https://developer.android.com/media/platform/sharing-audio-input).

Le navigateur peut fournir une `MediaStreamTrack` « live » mais `muted`, ou des PCM nuls. La spécification Media Capture demande de surveiller `mute` / `unmute`, mais son comportement dépend du navigateur et du système. **La promesse résolue de `getUserMedia()` ne prouve pas que le signal acoustique existe.**

Source normative : [W3C Media Capture and Streams §4.3.1](https://www.w3.org/TR/mediacapture-streams/).

### B. Ouverture lente et autorisation en attente

`getUserMedia()` peut rester en attente sans jamais résoudre ni rejeter si la demande d'autorisation n'est pas traitée. Un délai JavaScript `Promise.race` borne l'attente de l'interface mais **n'annule pas l'appel natif** ; le logiciel doit fermer tout `MediaStream` délivré tardivement. Les anciennes versions n'appliquaient pas de limite générale ni d'annulation STOP pendant cette attente.

Sources : [MDN — getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [MDN — MediaStreamTrack.stop](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop).

### C. Démarrage Web Audio et activation utilisateur

La politique Chrome sur la lecture automatique impose que les `AudioContext` soient créés ou réactivés par interaction explicite. Historiquement, le Studio appelait `ac.resume()` **après** des étapes asynchrones (chargement `AudioWorklet` + ouverture du microphone) ; sur certains appareils cela peut prolonger un démarrage ou maintenir un contexte suspendu. Cette hypothèse **n'est pas prouvée sur le Redmi**, mais le code a été corrigé pour appeler `resume()` immédiatement lors du clic REC.

Sources : [Chrome — Autoplay policy](https://developer.chrome.com/blog/autoplay/), [MDN — Best practices Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).

### D. Durée de vie des ressources et stockage local

L'ancien flux d'arrêt attendait l'accusé `AudioWorklet`, puis **toutes les écritures OPFS asynchrones**, avant de libérer les pistes du micro. Une écriture lente pouvait donc prolonger l'occupation du matériel **après le clic STOP**. L'OPFS est un stockage privé soumis à quotas et dont les écritures peuvent être coûteuses selon l'appareil. Les opérations rapides avec `FileSystemSyncAccessHandle` requièrent un Web Worker dédié : c'est une option architecturale future, **pas un remède démontré au ralentissement initial du Redmi**.

Sources : [MDN — Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system), [MDN — FileSystemSyncAccessHandle](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle).

Sous Android, `visibilitychange=hidden` est plus fiable que `pagehide` pour libérer les ressources lors du passage à une autre application. La désactivation de la source est demandée par `MediaStreamTrack.stop()` ; elle ne garantit pas qu'un autre onglet ou le navigateur entier n'utilise pas la même source.

Sources : [MDN — visibilitychange](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event), [MediaStreamTrack.stop](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop).

## 3. Modifications apportées au moteur dans la branche d'essai

1. **REC et STOP dans l'éditeur** : plus de double chemin obligatoire par une fenêtre ; compte à rebours, curseur et waveform PCM visible pendant la prise.
2. **REC → AudioContext.resume immédiat** au geste utilisateur, avant les autorisations et les opérations asynchrones. Pré-vérification de l'accès OPFS avant acquisition du microphone.
3. **Budget total de 9 secondes** pour initialiser le moteur, le stockage et le microphone ; limites individuelles également. Aucune tentative de réouverture automatique qui prolongerait la contention.
4. **STOP disponible même pendant l'ouverture** : annulation immédiate de l'attente, nettoyage des flux accordés tardivement.
5. **STOP libère tout de suite les pistes micro** (avant les écritures OPFS) ; fermeture bornée du contexte audio, déconnexion explicite du nœud source.
6. **Application masquée / changement d'onglet** : arrêt de l'entrée micro et suspension de la lecture audio ; aucune reprise automatique.
7. **Vérification du signal** : surveillance de `MediaStreamTrack.muted`, des valeurs réelles PCM16, message persistant si le signal n'est que du silence. Une prise numérique muette n'est pas ajoutée automatiquement aux pistes, mais le WAV reste récupérable en OPFS.
8. **Watchdog AudioWorklet** : si aucune trame PCM n'est reçue pendant plusieurs secondes, afficher une alerte puis interrompre vers 7 s afin de rendre le micro à Android. Signaler un enregistrement vide au lieu de le présenter comme réussi.
9. **Protection de la donnée** : pas de suppression des prises ni des projets préexistants, pas de télémétrie réseau, publication externe désactivée dans la prévisualisation.

## 4. Validation automatisée et limites

Les tests Playwright utilisent le véritable navigateur Chromium et les véritables modules du Studio, avec **un flux audio synthétique** au lieu du microphone physique. Les tests individuels restent isolés du compte, de la production et du réseau. Ils couvrent :

| Test | Vérifie |
|---|---|
| 029 | Interface mobile et navigation / sauvegarde du projet |
| 030 | Capture PCM WAV, fragments OPFS, rattachement à la piste, réouverture |
| 031 | Progression visible 14 s, deux pistes, lecture, export WAV complet |
| 032 | Permission différée et annulée, flux tardif stoppé, microphone silencieux, arrêt en arrière-plan, écriture OPFS bloquée et libération du micro, STOP pendant l'attente |
| 033 | AudioWorklet ne délivrant aucun PCM ; `getUserMedia` qui reste sans réponse ; absence de clip fictif et erreur visible |

Les simulations **ne peuvent vérifier ni les politiques réelles d'arbitrage audio de MIUI, ni le firmware Redmi, ni le comportement particulier de Brave**. Il ne faut pas publier la PR #46 en production tant que le dernier test matériel « sans enregistreur d'écran » n'a pas montré une prise audible, sa réouverture et sa lecture, puis la dictée vocale toujours fonctionnelle.

## 5. Diagnostic différentiel et décision

**Faits établis :** ouverture lente visible ; capture d'écran muette ; dictée rétablie par redémarrage ; anciens défauts du flux JS d'attente/arrêt constatés dans le code.  
**Hypothèse principale (plausible, non prouvée) :** conflit d'accès au micro entre capture vidéo/Brave et dictée Android.  
**Hypothèses secondaires :** politique d'activation Web Audio, permission navigateur/OS lente, OPFS lent, code ancien retenant le micro après STOP. Aucune mesure provenant du Redmi ne permet encore d'attribuer des pourcentages de causalité.

**Expérience décisive minimale sur le matériel réel :** après redémarrage, sans capture vidéo et sans autre application micro active, lancer une prise de 5 à 10 s, constater une forme d'onde non plate, l'écouter après réouverture, puis vérifier la dictée Gboard. Ne pas demander d'enregistreur d'écran pour cette expérience : il modifierait précisément la variable étudiée. L'utilisateur n'a pas à effectuer cette expérience avant que les tests CI soient verts.

**Précaution générale :** ne pas effacer les données Brave — elles peuvent contenir des projets locaux et des fragments WAV non exportés.
