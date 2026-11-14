# Ludodio — sortie de Supabase, accès simple (copie Cloudflare partielle, bascule en attente)

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

1. **Cloudflare** : créer une base D1 `ludodio`, saisir son véritable `database_id` dans une configuration Wrangler issue de `wrangler.ludodio.example.toml`. Créer le **nouveau bucket R2 dédié** `ludodio-media` et le lier comme `LUDODIO_MEDIA`. Ne pas réutiliser les buckets de Célébrations ou de l'ancien Worker des contes.
2. Ajouter **deux secrets serveur**, `ADMIN_PIN` (code choisi par le propriétaire ; `lfe` possible mais très court) et `SESSION_SECRET` (aléatoire et long, non partagé). Ne jamais les mettre dans GitHub.
3. Créer les tables : `wrangler d1 execute ludodio --remote --file cloudflare/ludodio-d1-schema.sql` après vérification de la configuration.
4. **Sauvegarder et transférer sans suppression** les contenus existants. Inventaire Supabase contrôlé le 13 novembre 2026 : 2 contes, 2 articles, 2 catégories de contes, 2 sous-catégories, 2 catégories de journal ; 2 médias audio et 256 images (253 couvertures/illustrations et 3 images du journal), soit environ **19 Mo** de fichiers. Préserver IDs, catégories, dates, texte riche, booléens et références média.
5. Préparer une copie privée avec `python scripts/ludodio_prepare_migration.py --output /tmp/ludodio-export` (`requests` et les secrets Supabase `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` en variables d'environnement). **L'export lit uniquement les données Ludodio, sans rien supprimer de Supabase**. Ensuite exécuter `python scripts/ludodio_import_r2.py --source /tmp/ludodio-export` pour simuler et ajouter `--apply` pour transférer/contrôler les médias (boto3, `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, bucket `ludodio-media`). N'envoyer ni données privées ni clés dans GitHub. Importer `/tmp/ludodio-export/ludodio-data.sql` dans D1 une fois les médias confirmés. 
5bis. Placer les fichiers dans R2 sous les préfixes `audios/`, `images/`, `blog-images/`, et les sons studio sous `studio-sounds/`. Normaliser les chemins D1 vers `r2:<bucket>/<chemin>`; vérifier chaque GET/HEAD avant tout basculement. Pour les anciens chemins `r2:contes/...`, le lecteur historique est conservé.
6. Déployer le nouveau Worker à `https://ludodio-api.rondes.workers.dev` (ou modifier la constante `LUDODIO_API` du client si Cloudflare choisit une autre URL) **sans remplacer** le Worker R2 déjà utilisé.
7. Vérifier en environnement isolé : code incorrect, code exact, connexion à un seul formulaire, chargement public, lecture de chaque conte, images, journal, ajout d'une histoire, import MP3, publication d'un brouillon, upload/écoute d'un son Studio, déconnexion et refus d'écriture non authentifiée.
8. Uniquement lorsque le transfert et les tests passent, fusionner cette branche pour basculer GitHub Pages. Garder l'ancienne base Supabase en lecture/backup durant la période de vérification.

**Important** : le projet Supabase actuel contient aussi des tables de Célébrations. **Ne jamais supprimer, désactiver ou vider ce projet** dans le cadre de Ludodio.

## Coût / quotas

La migration supprime la dépendance de Ludodio aux quotas **Supabase**, pas les limites de tous les fournisseurs. Cloudflare Workers/D1/R2 ont eux aussi des limites sur leur offre gratuite. L'architecture vise à rester dans la tranche gratuite pour ce petit site, sans promettre une gratuité illimitée. Au-delà des limites gratuites, les services peuvent également se bloquer jusqu'au renouvellement.

## Sécurité minimale

Un code écrit en clair dans JavaScript **ne protège pas** une administration publique : les internautes peuvent afficher ce fichier. Le Worker conserve donc le code côté serveur, sans e-mail ni second formulaire, avec une durée de session et une limite de tentatives. Ce n'est pas un abonnement d'authentification.


## État réel au 14 novembre 2026 — migration partielle validée

- Ressources **créées** sur le même compte Cloudflare : D1 `ludodio`, R2 `ludodio-media` et Worker `ludodio-api`. Elles ne touchent pas Célébrations et sont distinctes d'Espace Jeunesse.
- **10 enregistrements déjà publiés** transférés dans D1 : 2 contes, 2 articles, 2 catégories de contes, 2 sous-catégories, 2 catégories de journal. Contrôle D1 OK.
- **252 images WebP** provenant du dossier GitHub `assets/illustrations/admin-library` recopiées dans R2 sous `images/admin-library`. Les 252 fichiers ont été relus par le Worker et comparés par SHA-256 : contrôle OK. Taille totale 2 212 832 octets. Ces 252 fichiers ont des tailles exactement identiques à celles relevées dans la source Supabase.
- **6 fichiers originaux restent à récupérer** : les 2 fichiers audio (1 M4A, 1 WAV), les 3 images du journal (2 JPG, 1 PNG), la couverture WebP des Musiciens de Brême. Ne jamais remplacer par des fichiers factices.
- Blocage source confirmé par un test depuis GitHub Actions : Supabase renvoie HTTP 402 `exceed_cached_egress_quota` sur les appels REST **et** sur les téléchargements de fichiers. Le plan est plafonné et ne laisse pas récupérer ces 6 fichiers tant que Supabase n'a pas débloqué son egress, ou tant qu'une copie locale n'a pas été fournie.
- Un secret de session cryptographiquement aléatoire a été installé sur le Worker. **ADMIN_PIN n'est volontairement pas défini** : il faut que le propriétaire choisisse un code fort dans les paramètres Cloudflare du Worker (ou via un secret CI privé). Ne pas copier le mot de passe Espace Jeunesse ni inventer un code court connu publiquement.
- **AUCUNE BASCULE DU SITE OFFICIEL** : `main` et GitHub Pages de Ludodio continuent d'utiliser leur fonctionnement actuel. La PR #62 reste non fusionnée jusqu'à récupération des 6 fichiers, configuration de l'ADMIN_PIN et tests finaux (écoute, import, édition, Studio, journal).
- Les tables et fichiers Supabase, notamment les données de Célébrations, n'ont pas été modifiés ni supprimés. Le nouveau Cloudflare ne doit pas être considéré comme une copie exhaustive tant que les six objets n'y sont pas.
- Migration reproductible depuis les workflows GitHub Actions du dépôt `ludodulac/espace-jeunesse` : `ludodio-bootstrap.yml`, `ludodio-restore-github.yml`, `ludodio-api-activate.yml`. Ne relancer l'import complet depuis Supabase que lorsque l'accès source sera rétabli et les inventaires actualisés.

## État des PR

- PR #61 : **fusionnée**, suppression du bouton redondant du Journal, lien Ludodio Studio explicite.
- Cette migration : **scripts d'export et de copie préparés, mais pas exécutés**, données non transférées, Worker non déployé, site officiel non basculé. L'environnement Cloudflare et les secrets ne sont pas connectés à cette conversation.
