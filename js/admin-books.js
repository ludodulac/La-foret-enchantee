// Administration — Livres que l’on aime
let likedBooks = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadLikedBooks();
  document.getElementById('form-add-book')?.addEventListener('submit', addLikedBook);
});

async function loadLikedBooks() {
  const { data, error } = await dbClient.from('livres_aimes').select('*').order('created_at', { ascending: false });
  if (error) return showNotif('Erreur livres : ' + error.message, 'error');
  likedBooks = data || [];
  renderLikedBooks();
}

function renderLikedBooks() {
  const root = document.getElementById('book-list-admin');
  if (!root) return;
  root.innerHTML = likedBooks.length ? likedBooks.map(book => {
    const url = book.image_path ? getPublicUrl('images', book.image_path) : '';
    return '<div class="admin-row"><span class="row-name">' + escapeHtml(book.title) + '</span>' +
      '<span class="row-meta">' + escapeHtml(book.subtitle || '') + '</span>' +
      (url ? '<img src="' + escapeHtml(url) + '" alt="" style="width:54px;height:70px;object-fit:cover;border-radius:7px">' : '') +
      '<div class="row-actions"><button type="button" class="btn-sm btn-del" data-delete-book="' + book.id + '">Supprimer</button></div></div>';
  }).join('') : '<p class="empty-msg">Aucun livre.</p>';
  root.querySelectorAll('[data-delete-book]').forEach(btn => btn.addEventListener('click', () => deleteLikedBook(btn.dataset.deleteBook)));
}

async function addLikedBook(event) {
  event.preventDefault();
  const button = document.getElementById('btn-add-book');
  const title = document.getElementById('book-title').value.trim();
  const subtitle = document.getElementById('book-subtitle').value.trim();
  const description = document.getElementById('book-description').value.trim();
  const file = document.getElementById('book-image').files[0];
  if (!title || !file) return showNotif('Titre et image requis.', 'error');
  button.disabled = true; button.textContent = 'Envoi en cours…';
  let imagePath = '';
  try {
    imagePath = makeStoragePath('livre-' + title, file.name);
    await uploadFile('images', imagePath, file);
    const { error } = await dbClient.from('livres_aimes').insert({ title, subtitle: subtitle || null, description: description || null, image_path: imagePath });
    if (error) throw error;
    event.target.reset();
    showNotif('Livre ajouté ✓');
    await loadLikedBooks();
  } catch (error) {
    if (imagePath) await removeFiles([{ bucket: 'images', path: imagePath }]);
    showNotif('Erreur : ' + (error.message || error), 'error');
  } finally {
    button.disabled = false; button.textContent = 'Ajouter le livre';
  }
}

async function deleteLikedBook(id) {
  if (!confirm('Supprimer ce livre ?')) return;
  const book = likedBooks.find(item => String(item.id) === String(id));
  const { error } = await dbClient.from('livres_aimes').delete().eq('id', id);
  if (error) return showNotif('Erreur : ' + error.message, 'error');
  if (book?.image_path) await removeFiles([{ bucket: 'images', path: book.image_path }]);
  showNotif('Livre supprimé');
  await loadLikedBooks();
}
