# La Forêt Enchantée — stockage R2 des contes (version de test)

**Statut : non déployé, PR DRAFT.** Ne pas fusionner et ne pas modifier Célébrations.

## Ressources Cloudflare déjà créées manuellement

- Bucket privé : `foret-enchantee-contes`
- Worker existant : `foret-enchantee-stockage.rondes.workers.dev`
- Liaison Workers → R2 : `CONTES_BUCKET`
- `GET /media/contes/test.mp3` déjà validé manuellement par le propriétaire.
- Le Worker public **actuel** ne fait que la lecture. Le code d'écriture de cette branche n'a pas été déployé.

## Sécurité pour une étape ultérieure (avec autorisation explicite)

Ajouter dans **Cloudflare → Workers et Pages → foret-enchantee-stockage → Paramètres → Variables et secrets** :

- `SUPABASE_URL` : URL HTTPS du projet Supabase La Forêt Enchantée.
- `SUPABASE_ANON_KEY` : clé publique/publishable (jamais une clé `service_role` ou secrète).
- `ALLOWED_ORIGIN` : `https://ludodulac.github.io` (optionnelle, valeur par défaut).
- La liaison R2 `CONTES_BUCKET` doit rester inchangée.

Le Worker valide la session dans Supabase Auth, **puis** appelle le RPC serveur existant `public.is_app_admin()` avec le jeton. Une simple clé publique ne donne aucun droit d'écriture.

## Contrat de stockage

- Les **nouveaux** MP3 : `contes/<uuid>.mp3`, 60 MiB maximum.
- Les **nouvelles** couvertures : `couvertures/<uuid>.{jpg,png,webp}`, 10 MiB maximum.
- Le Worker attribue lui-même les chemins uniques ; l'interface ne choisit pas le chemin d'écriture.
- La table existante `public.audios` conserve `audio_path = 'r2:contes/…'` et `image_path = 'r2:couvertures/…'`.
- `getPublicUrl` continue de lire les anciennes valeurs Supabase et sait résoudre les nouvelles valeurs `r2:`.
- Pour l'instant, la publication de contes depuis l'administration exige un **fichier MP3 déjà préparé**. L'export MP3 du Studio est un chantier distinct, qui n'est pas modifié ici.
- Les petits sons de la sonothèque du Studio restent sur Supabase.
- Les autres images du site et le journal/blog conservent leur gestion actuelle.

## Validation avant fusion

1. CI `tests/foret-r2-media-gateway-001.test.cjs` PASS (mocks isolés, aucun service réel).
2. Vérifier que le Worker configuré sait toujours lire l'ancien `contes/test.mp3`, `HEAD` et `Range` partiel 206.
3. Vérifier qu'une requête sans session ou d'un non-admin ne peut ni écrire ni supprimer.
4. Sur un environnement de test isolé, téléverser un MP3 et une couverture depuis l'admin, vérifier lecteur et ancienne histoire inchangée.
5. Évaluer la gestion du nettoyage de fichiers et les éventuels liens externes avant de migrer d'anciens contes.
6. Obtenir l'accord explicite avant de déployer ce Worker ou fusionner la PR et publier le site.

**Ne pas** coller les clés API dans GitHub, les captures ou cette conversation.
