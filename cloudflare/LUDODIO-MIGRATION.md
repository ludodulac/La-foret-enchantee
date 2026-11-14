# Ludodio — démarrage vierge sur Cloudflare (14 novembre 2026)

L'utilisateur a explicitement demandé de **repartir de zéro** : aucun ancien conte, article, MP3, image ou catégorie dans la médiathèque d'écoute ; aucune image préconçue proposée par l'éditeur.

## Ressources Cloudflare dédiées

- Worker API `ludodio-api`, déjà déployé.
- Base D1 `ludodio` : conserver le schéma mais vider les lignes historiques des tables `audios`, `articles`, `categories`, `subcategories`, `blog_categories`.
- Bucket R2 `ludodio-media` : retirer les 252 anciennes illustrations copiées de GitHub ; conserver ce bucket pour les nouvelles histoires et couvertures.
- Secret `SESSION_SECRET` déjà mis en place. Le propriétaire doit créer son secret `ADMIN_PIN` dans **Cloudflare > Workers & Pages > ludodio-api > Settings > Variables and Secrets** avant l'utilisation de l'administration. Ne pas inventer de code ni le publier dans GitHub.

## Déploiement du site et séparation des médias

Le site public continue sur GitHub Pages, mais lit désormais l'API Cloudflare D1/R2 au lieu de Supabase. Le catalogue vide affiche un accueil soigné.

Le Studio de montage reste distinct de la médiathèque d'écoute. L'administration Ludodio peut sélectionner **uniquement** les MP3 explicitement proposés depuis la médiathèque Espace Jeunesse ; cela ne duplique aucun objet R2 et n'importe pas les petits sons du Studio.

La banque prédéfinie de 252 illustrations a été supprimée du dépôt et de `assets/covers/manifest.json` ; `assets/covers/keywords.json` ne référence plus Supabase.

## Supabase partagé : à conserver

Le projet historique Supabase `La forêt enchantée` (`jwyayfkssyagvnablttg`) contient aussi des données Célébrations. **Ne jamais supprimer ce projet, son authentification globale, ni les tables/stockages Célébrations.**

La suppression des anciens fichiers de Ludodio sur Supabase ne doit se faire **que par l'API Supabase Storage** : une suppression SQL de `storage.objects` laisserait des fichiers orphelins. Le quota Supabase peut temporairement empêcher l'opération (HTTP 402 `exceed_cached_egress_quota`), qui doit alors être signalée sans prétendre l'avoir faite.

Les métadonnées propres à Ludodio peuvent être vidées dans les tables dédiées uniquement après vérification que le site GitHub Pages utilise Cloudflare.

## Contrôle de fin de mission

- D1 : 0 histoires, 0 articles, 0 catégorie ; tables `studio_*` conservées pour l'éditeur (ne pas perdre les projets).
- R2 `ludodio-media` : 0 objet initial ; Cloudflare Worker accessible.
- Banque d'images proposées : 0 image ; aucune référence Supabase au catalogue dans le code du navigateur.
- Pages publiques et administration du Studio fonctionnelles ; accès admin protégé par secret `ADMIN_PIN` avant tout téléversement.
- Aucun changement pour Célébrations ni Espace Jeunesse.
