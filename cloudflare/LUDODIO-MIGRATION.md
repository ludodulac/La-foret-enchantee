# Ludodio — sortie de Supabase, accès simple (préparation non déployée)

## Parcours proposé

Site des contes → « Administration » en bas → **un seul code** → administration des histoires et du journal → « Ouvrir Ludodio · Studio audio ».

Aucune deuxième adresse e-mail ni deuxième mot de passe. Le code est **comparé dans le Worker Cloudflare** à `ADMIN_PIN`, jamais dans un script visible du navigateur. Le code est modifiable sans republier GitHub Pages : remplacer la variable secrète `ADMIN_PIN` sur le Worker puis redémarrer/republier ce Worker. Le navigateur reçoit seulement un jeton temporaire de huit heures. Cinq erreurs successives déclenchent un blocage de 15 minutes par visiteur.

Cette branche **ne doit pas être fusionnée avant migration réelle et test utilisateur** : elle remplace la lecture et l'écriture de Supabase par une API Cloudflare qui n'est pas encore déployée.

## Ce qui est préparé

- `cloudflare/ludodio-api-worker.js` : API D1, login, filtre des brouillons, gestion et lecture des médias R2.
- `cloudflare/ludodio-d1-schema.sql` : schéma minimal des histoires, catégories, articles, sonothèque.
- `js/supabase.js` devient un adaptateur D1/R2 pour ne pas réécrire toute l'interface de Ludodio.
- Le bouton Administration du site des contes vérifie le code dans Cloudflare et dirige vers `admin.html`.
- `login.html` (anciens favoris) redirige vers le même formulaire unique ; le Studio garde un contrôle de session.
- Le journal n'a plus de bouton Administration supplémentaire (PR #61, déjà fusionnée).

## Ce qui reste indispensable avant mise en ligne

1. **Cloudflare** : créer une base D1 `ludodio`, saisir son véritable `database_id` dans une configuration Wrangler issue de `wrangler.ludodio.example.toml`. Lier un bucket R2 `LUDODIO_MEDIA` (possiblement le bucket existant `foret-enchantee-contes`, sans effacer ses objets).
2. Ajouter **deux secrets serveur**, `ADMIN_PIN` (code choisi par le propriétaire ; `lfe` possible mais très court) et `SESSION_SECRET` (aléatoire et long, non partagé). Ne jamais les mettre dans GitHub.
3. Créer les tables : `wrangler d1 execute ludodio --remote --file cloudflare/ludodio-d1-schema.sql` après vérification de la configuration.
4. **Sauvegarder et transférer sans suppression** les contenus existants. Inventaire Supabase contrôlé le 13 novembre 2026 : 2 contes, 2 articles, 2 catégories de contes, 2 sous-catégories, 2 catégories de journal ; 2 médias audio et 256 images (253 couvertures/illustrations et 3 images du journal), soit environ **19 Mo** de fichiers. Préserver IDs, catégories, dates, texte riche, booléens et références média.
5. Placer les fichiers dans R2 sous les préfixes `audios/`, `images/`, `blog-images/`, et les sons studio sous `studio-sounds/`. Normaliser les chemins D1 vers `r2:<bucket>/<chemin>`; vérifier chaque GET/HEAD avant tout basculement. Pour les anciens chemins `r2:contes/...`, le lecteur historique est conservé.
6. Déployer le nouveau Worker à `https://ludodio-api.rondes.workers.dev` (ou modifier la constante `LUDODIO_API` du client si Cloudflare choisit une autre URL) **sans remplacer** le Worker R2 déjà utilisé.
7. Vérifier en environnement isolé : code incorrect, code exact, connexion à un seul formulaire, chargement public, lecture de chaque conte, images, journal, ajout d'une histoire, import MP3, publication d'un brouillon, upload/écoute d'un son Studio, déconnexion et refus d'écriture non authentifiée.
8. Uniquement lorsque le transfert et les tests passent, fusionner cette branche pour basculer GitHub Pages. Garder l'ancienne base Supabase en lecture/backup durant la période de vérification.

**Important** : le projet Supabase actuel contient aussi des tables de Célébrations. **Ne jamais supprimer, désactiver ou vider ce projet** dans le cadre de Ludodio.

## Coût / quotas

La migration supprime la dépendance de Ludodio aux quotas **Supabase**, pas les limites de tous les fournisseurs. Cloudflare Workers/D1/R2 ont eux aussi des limites sur leur offre gratuite. L'architecture vise à rester dans la tranche gratuite pour ce petit site, sans promettre une gratuité illimitée. Au-delà des limites gratuites, les services peuvent également se bloquer jusqu'au renouvellement.

## Sécurité minimale

Un code écrit en clair dans JavaScript **ne protège pas** une administration publique : les internautes peuvent afficher ce fichier. Le Worker conserve donc le code côté serveur, sans e-mail ni second formulaire, avec une durée de session et une limite de tentatives. Ce n'est pas un abonnement d'authentification.

## État réel

- PR #61 : **fusionnée**, suppression du bouton redondant du Journal, lien Ludodio Studio explicite.
- Cette migration : **code préparé, données non transférées, Worker non déployé, site officiel non basculé**.
