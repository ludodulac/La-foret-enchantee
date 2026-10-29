# STUDIO-WAV-004 — Enregistrer un WAV dans les fichiers Android

**Portée : page expérimentale `experiments/studio-recording-wav-001.html` uniquement.** Le Studio de montage `studio.html`, les projets locaux IndexedDB v3 et Supabase ne sont pas modifiés.

## Parcours de test Brave/Android (prise courte déjà récupérée)

1. Ouvrir la page expérimentale **dans le même Brave, en navigation normale**.
2. Cliquer **RETROUVER LA PRISE** et vérifier la durée affichée (première prise observée : 10,81 secondes).
3. Cliquer **EXPORTER UN WAV**.
4. Si le navigateur propose un sélecteur de fichiers, enregistrer le WAV dans un dossier voulu ; sinon, appuyer ensuite sur le lien **TÉLÉCHARGER MON WAV** qui apparaît.
5. Ouvrir l'application Fichiers/Téléchargements d'Android. Vérifier que `studio-<id>.wav` existe et qu'il se lit. Vérifier la durée et la voix.
6. Revenir à la page, cliquer **RETROUVER LA PRISE** : elle doit toujours exister. **Ne pas effacer les données du site.**

## Contrats de sécurité

- Pour le téléchargement `blob:` Android sans sélecteur : **30 secondes maximum**, et **fichier complet seulement**. Si la prise dépasse cette durée, refuser l'export plutôt que livrer un fichier tronqué.
- Si `showSaveFilePicker` est disponible : utiliser le flux d'export WAV complet vers son `FileSystemWritableFileStream`.
- Pour Android, l'existence du WAV dans **Téléchargements** et sa lecture dépendent du comportement réel de Brave : **HUMAN GATE nécessaire**. La CI ne peut pas le certifier.
- Les fragments sources OPFS ne sont jamais supprimés ou modifiés par cette opération ; la nouvelle sauvegarde est distincte.
- Aucun serveur, aucun service payant, aucun transfert de voix sur le réseau.
- La procédure de sauvegarde Android de **35 minutes sans sélecteur** reste à construire et tester séparément. Ne pas promettre une prise longue avant preuve.
