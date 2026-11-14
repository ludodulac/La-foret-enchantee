# Ludodio — médiathèque de contes et Studio audio

Le site d'écoute Ludodio démarre **sans histoires, sans images et sans catégories prédéfinies**. Le Studio de montage audio reste une application distincte, avec sa propre sonothèque et ses projets de travail.

## Architecture actuelle

- Site public : GitHub Pages `ludodulac.github.io/La-foret-enchantee/`.
- API : Worker Cloudflare `ludodio-api`.
- Données d'écoute : D1 `ludodio` (catalogue initialement vide).
- Fichiers des contes/couvertures créés ensuite : R2 `ludodio-media` (initialement vide).
- Administration : code personnel `ADMIN_PIN` défini **exclusivement dans les secrets du Worker** ; `SESSION_SECRET` fort et aléatoire ; pas de compte Supabase.
- Liaison optionnelle des MP3 d'Espace Jeunesse via `ej:<uuid>` : pas de copie de fichier ; la médiathèque et les petits sons de montage ne sont pas mélangés.

La banque d'images proposées a été entièrement supprimée du site et du dépôt courant. L'éditeur conserve le bouton permettant d'importer une **nouvelle** couverture conçue par l'utilisateur ; aucun choix de couverture prédéfinie ne s'affiche.

## Sécurité

Les actions de création, modification et suppression passent par l'API Cloudflare avec jeton de session signé. Les visites anonymes ne peuvent lire que les histoires et articles explicitement publiés. Les médias publiés sont accessibles par lien direct ; les fichiers de travail du Studio restent séparés.

N'inscrire aucune valeur d'`ADMIN_PIN` ni de `SESSION_SECRET` dans le dépôt, les scripts du navigateur ou les journaux GitHub Actions. Le site public peut afficher son catalogue vide avant la création du code personnel, mais l'administration reste alors verrouillée.

## Préservation des autres projets

Le projet Supabase historique est partagé avec Célébrations : **ne pas le supprimer ni le désactiver**. Seules les anciennes données et fichiers strictement propres à Ludodio peuvent être nettoyés ; les tables, comptes et médias d'autres applications doivent rester intacts.

## Tests

La CI vérifie les parcours de connexion, la protection des API, la conservation du Studio, l'absence d'anciens modèles proposés et l'état vide de démarrage.

