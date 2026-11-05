# Studio 026 — Télécharger en MP3 ou WAV

**Statut : PR #48 en brouillon, pas fusionnée à la production.**

## Parcours demandé

1. Ouvrir le Studio; importer ou enregistrer l'audio et le mixer.
2. Cliquer sur **EXPORT** (ou **EXPORT SÉLECTION**).
3. Dans **EXPORT AUDIO**, sélectionner **MP3 192 kb/s** ou **WAV 16 bits stéréo**.
4. Cliquer sur **TÉLÉCHARGER** : le fichier est enregistré sur le téléphone.
5. Si publication souhaitée, ouvrir l'administration La Forêt Enchantée et importer **le MP3** avec une couverture; Cloudflare R2 conserve le MP3 et la couverture. Aucune liaison directe Studio → Cloudflare n'est nécessaire.

L'option MP3 est recommandée pour la diffusion, car beaucoup moins volumineuse que le WAV. Le WAV original conserve l'export existant.

## Détails techniques

- Les clips et le mixage utilisent exactement l'ancien moteur StudioExportCore et rendent le WAV sans modification. Pour l'option MP3, le WAV est lu progressivement par tranches de 288 KiB et encodé en 192 kb/s stéréo avec un encodeur MP3 chargé uniquement au moment du téléchargement.
- Les longs WAV utilisent toujours le mécanisme OPFS existant pour éviter les gros tampons de mixage, si disponible sur le navigateur.
- Affichage de la progression et bouton WAV de secours si l'encodeur MP3 ne peut pas être chargé.
- La publication directe historique du Studio a été masquée dans cette branche pour privilégier le transfert manuel demandé. L'administration R2 déjà mise en ligne n'est pas changée.
- Aucune modification de Supabase, de Célébrations ou du stockage Cloudflare.

## Licence de l'encodeur

L'option MP3 télécharge `@breezystack/lamejs@1.2.7` sous LGPL-3.0 comme bibliothèque JavaScript distincte depuis : 
`https://cdn.jsdelivr.net/npm/@breezystack/lamejs@1.2.7/dist/lamejs.iife.js`.

Crédits : [@breezystack/lamejs](https://www.npmjs.com/package/@breezystack/lamejs) et [LAME](https://lame.sourceforge.io/).
La bibliothèque peut être remplacée indépendamment du code du Studio. Respecter les obligations LGPL-3.0 applicables à sa redistribution et aux mises à disposition.

## Vérification

- Test automatisé de l'encodage réel MP3 (en-tête MPEG-1 couche III 192 kb/s), tronçons, annulation, WAV inchangé.
- Test isolé sur Android/Redmi via : 
`https://ludodulac.github.io/La-foret-enchantee-preview/studio-mp3-026.html`
- Le test utilise une base IndexedDB distincte : `foret-studio-autosave-mp3-026-preview` pour ne pas toucher aux projets Studio enregistrés dans `foret-studio-autosave`.
- Essayer un MP3 court, puis un conte plus long (15–30 min) et vérifier le fichier réellement téléchargé, sa lecture, la taille et son import dans le formulaire de l'administration.
- Ne pas fusionner en production avant validation sur téléphone.
