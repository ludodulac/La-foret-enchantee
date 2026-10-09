# STUDIO-PLAYBACK-LONG-016 — contrat de compatibilité
Baseline main: `fdfdb73decb32552e663c9fce8400fae61433e54`. Aucun changement de schéma ou migration.
## Schémas réels
IndexedDB `foret-studio-autosave`, version 3 : `meta` (clé libre), `projects` (keyPath `generation`), `sources` (keyPath `id`), `waveforms` (keyPath `sourceId`), `projectLibrary` (keyPath `id`). Snapshot schéma 1 ou 2, `tracks[]`, `clips[]`, et propriétés de session. `projectLibrary` stocke `id,name,createdAt,updatedAt,lastOpenedAt,latestGeneration`. Les générations portent `generation,projectId,snapshot`; `snapshot` porte notamment `schema,projectId,tracks,clips,cursor,zoom,selectionStart,selectionEnd`.
Sources : `id,blob,sourceSchema,mimeType,originalName,origin,size,createdAt` ; les sources legacy sans métadonnées sont normalisées sans modifier les octets du Blob.
Clips : `id,track,name,sourceId,start,trim,len,gain,muted`. Pistes : `id,name,gain,muted` et éventuels champs supplémentaires préservés.
## Invariants
`projectId`, `sourceId`, tous les clips, positions, trims, gains, mute et champs additionnels restent inchangés. Les Blobs originaux ne sont ni réencodés ni réécrits par une sauvegarde sans nouvelle source. Aucune conversion audio à l'ouverture. Les champs `generation`, `savedAt`, `updatedAt`, `lastOpenedAt` sont des métadonnées de cycle de vie qui peuvent évoluer et ne doivent pas être comparés byte-for-byte.
## Manifest futur
Un manifest doit être un *sidecar* dérivé, indexé par `sourceId` et version/empreinte du Blob original, dans un stockage indépendant. Ne jamais ajouter de champ obligatoire au snapshot ni remplacer `sourceId`. Absence/erreur du sidecar = lecture historique. Cette mission ne crée aucun stockage sidecar et ne certifie pas sa persistance.
## Limites de la preuve
Le test 016 exerce l'API mémoire fidèle aux chemins de projets, pas un navigateur IndexedDB réel. La fixture « long-mp3 » porte des métadonnées de clip de 900 s et un petit Blob de signature MP3, pas 900 s de données audio. Les tests ne décodent ni ne convertissent l'audio. L'absence de régression réelle IndexedDB devra être vérifiée dans une mission dédiée avant intégration.
