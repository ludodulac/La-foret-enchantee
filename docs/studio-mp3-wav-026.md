# Ludodio — Studio MP3 / WAV et brouillons de publication (027)

## Parcours Studio
1. Dans le Studio 4 pistes, importer ou enregistrer, puis mélanger les sons.
2. Cliquer sur **EXPORT**.
3. Saisir librement le titre.
4. **ENREGISTRER DANS LUDODIO** : convertir le mix en **MP3 192 kb/s**, envoyer directement sur Cloudflare R2, vérifier le fichier, créer une histoire Supabase **is_published=false** sans catégorie. Aucune copie locale obligatoire.
5. **TÉLÉCHARGER** : conserver au choix le MP3 192 kb/s ou le WAV, sans aucune publication.

Pendant la conversion et le transfert, rester sur la page : Android peut suspendre le JavaScript d'un onglet quitté. Un avertissement de navigation est affiché quand le navigateur le prend en charge.

## Parcours Administration
1. Ouvrir `admin.html` avec son compte administrateur.
2. Dans **Histoires**, la rubrique **À classer** regroupe les brouillons reçus du Studio.
3. Cliquer sur **Classer** pour choisir ou créer une catégorie et éventuellement ajouter une couverture et une description, puis **Enregistrer**.
4. Cliquer sur **Publier** dans **À classer** : la catégorie est obligatoire, la publication est confirmée, le conte devient visible.

La colonne `is_published` est ajoutée avec `DEFAULT true`, conservant les histoires existantes publiées. Les politiques RLS limitent les lectures anonymes aux seuls audios publiés ; les administrateurs peuvent lire les brouillons. Cela protège la liste publique, mais le bucket R2 conserve des URL de lecture techniques accessibles si leur chemin précis est connu.

## Gestion des échecs
L'envoi MP3 utilise le contrôleur d'accès R2 existant (JWT Supabase + contrôle administrateur serveur). En cas d'échec de validation ou d'insertion en base, un nettoyage du nouveau fichier R2 est tenté. En cas d'échec de nettoyage, un message permet de rechercher un fichier orphelin. Aucun brouillon fictif n'est créé pour les tests.

Les MP3 sont limités à 60 Mo par le service R2 ; le Studio affiche la raison d'un échec. La lecture et l'édition WAV existantes restent inchangées. Le fichier MP3 est créé avec l'encodeur séparé `@breezystack/lamejs@1.2.7` LGPL-3.0 via jsDelivr, utilisé également pour le téléchargement. Respecter les conditions de la licence de la bibliothèque.

## Validation
- `tests/studio-mp3-export-026.test.cjs` : encodage PCM16 44,1 kHz en MP3 stéréo 192 kb/s (incluant véritable encodeur).
- `tests/ludodio-audio-drafts-027.test.cjs` : contrôle administrateur, envoi R2, vérification, insertion en brouillon, classification différée, restauration après échec.
- `tests/studio-forest-export-011e.test.cjs` : conservation du cœur d'export WAV existant et de la navigation.
- Validation humaine Android recommandée après le déploiement avec un conte court, puis un conte long, avant de considérer le transfert comme garanti sur mobile.
