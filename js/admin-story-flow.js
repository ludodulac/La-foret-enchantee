// admin-story-flow.js — aide légère au parcours réel de préparation d'une histoire.
(() => {
  const STORY_SUGGESTIONS = [
    'Hansel et Gretel',
    'Blanche-Neige',
    'Le Roi-grenouille',
    'Raiponce',
    'Le Petit Chaperon rouge',
    'Les Musiciens de Brême',
    'Le Vaillant Petit Tailleur',
    'Les Sept Corbeaux',
    'Le Loup et les Sept Chevreaux',
    'Dame Holle',
    'Le Pêcheur et sa femme',
    'Les Douze Frères',
    'Le Conte du genévrier',
    'La Gardeuse d’oies',
    'Le Roi Barbabec',
    'Les Six Cygnes'
  ];

  let illustrationConcepts = {};
  let illustrationBaseUrl = '';
  const nativeFetch = window.fetch.bind(window);

  function normalizeSearch(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('fr')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function conceptFromKey(key) {
    return String(key || '').split('--')[0] || '';
  }

  function remoteAssetUrl(file) {
    return illustrationBaseUrl && file ? illustrationBaseUrl + encodeURIComponent(file) : '';
  }

  function installLibraryFetchRedirect() {
    if (window.fetch.__adminLibraryRedirect) return;
    const redirectedFetch = function(input, init) {
      if (illustrationBaseUrl) {
        const raw = typeof input === 'string' ? input : input?.url;
        const match = String(raw || '').match(/(?:^|\/)assets\/covers\/([^/?#]+\.webp)(?:[?#].*)?$/i);
        if (match) {
          const remote = remoteAssetUrl(decodeURIComponent(match[1]));
          if (typeof input === 'string') return nativeFetch(remote, init);
          return nativeFetch(new Request(remote, input), init);
        }
      }
      return nativeFetch(input, init);
    };
    redirectedFetch.__adminLibraryRedirect = true;
    window.fetch = redirectedFetch;
  }

  async function loadIllustrationKeywords() {
    try {
      const response = await nativeFetch('assets/covers/keywords.json', { cache: 'no-cache' });
      if (!response.ok) return;
      const payload = await response.json();
      illustrationConcepts = payload?.concepts && typeof payload.concepts === 'object'
        ? payload.concepts
        : {};
      illustrationBaseUrl = typeof payload?.baseUrl === 'string' ? payload.baseUrl : '';
      installLibraryFetchRedirect();
      enhanceCoverEditors();
    } catch (error) {
      console.warn('Mots-clés des illustrations indisponibles.', error);
    }
  }

  function enhanceStoryStart() {
    const titleInput = document.getElementById('audio-title-in');
    if (!titleInput || document.querySelector('[data-story-start-helper]')) return;
    const group = titleInput.closest('.form-group');
    if (!group) return;

    const helper = document.createElement('div');
    helper.className = 'story-start-helper';
    helper.dataset.storyStartHelper = 'true';
    helper.innerHTML = `
      <div class="story-start-copy">
        <strong>Commence par l’histoire</strong>
        <span>Choisis une proposition ou écris librement ton propre titre.</span>
      </div>
      <label class="story-suggestion-label">
        <span>Choisir une histoire proposée</span>
        <select id="story-suggestion-select">
          <option value="">— Choisir dans la liste —</option>
          ${STORY_SUGGESTIONS.map(title => `<option value="${title.replace(/"/g, '&quot;')}">${title}</option>`).join('')}
        </select>
      </label>
      <div class="story-free-note">Ou ajoute une autre histoire avec le champ <strong>Titre</strong> ci-dessous.</div>`;

    group.insertBefore(helper, titleInput);
    const select = helper.querySelector('#story-suggestion-select');
    select.addEventListener('change', () => {
      if (!select.value) return;
      titleInput.value = select.value;
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput.focus();
    });

    titleInput.addEventListener('input', () => {
      if (select.value && titleInput.value.trim() !== select.value) select.value = '';
    });

    document.getElementById('form-add-audio')?.addEventListener('reset', () => {
      setTimeout(() => { select.value = ''; }, 0);
    });
  }

  function searchableText(button) {
    const key = button.dataset.illustrationKey || '';
    const concept = conceptFromKey(key);
    const metadata = illustrationConcepts[concept] || {};
    const terms = [
      button.textContent || '',
      concept,
      metadata.label || '',
      ...(Array.isArray(metadata.keywords) ? metadata.keywords : [])
    ];
    return normalizeSearch(terms.join(' '));
  }

  function rewriteIllustrationAssets(editor) {
    if (!illustrationBaseUrl || !editor) return;
    editor.querySelectorAll('.cover-illustration').forEach(button => {
      const image = button.querySelector('img');
      if (!image) return;
      if (!button.dataset.libraryFile) {
        const raw = image.getAttribute('src') || '';
        button.dataset.libraryFile = raw.split('/').pop()?.split(/[?#]/)[0] || '';
      }
      const remote = remoteAssetUrl(button.dataset.libraryFile);
      if (remote && image.src !== remote) image.src = remote;
    });

    const preview = editor.querySelector('.cover-preview-image');
    const selected = editor.querySelector('.cover-illustration.selected');
    const file = selected?.dataset.libraryFile;
    if (preview && file) {
      const remote = remoteAssetUrl(file);
      if (remote && preview.src !== remote) preview.src = remote;
    }
  }

  function enhanceIllustrationSearch(editor) {
    if (!editor) return;
    const gallery = editor.querySelector('.cover-gallery');
    if (!gallery) return;

    gallery.querySelectorAll('.cover-illustration').forEach(button => {
      button.dataset.search = searchableText(button);
    });
    rewriteIllustrationAssets(editor);

    let search = editor.querySelector('[data-illustration-search]');
    if (!search) {
      search = document.createElement('input');
      search.type = 'search';
      search.className = 'cover-gallery-search';
      search.placeholder = 'Rechercher une image…';
      search.setAttribute('aria-label', 'Rechercher une image de couverture');
      search.dataset.illustrationSearch = 'true';
      gallery.before(search);
    }

    let empty = editor.querySelector('[data-illustration-search-empty]');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'cover-gallery-empty';
      empty.dataset.illustrationSearchEmpty = 'true';
      empty.hidden = true;
      empty.textContent = 'Aucune image ne correspond à cette recherche.';
      gallery.after(empty);
    }

    const filter = () => {
      const query = normalizeSearch(search.value);
      let visible = 0;
      gallery.querySelectorAll('.cover-illustration').forEach(button => {
        button.dataset.search = searchableText(button);
        const match = !query || button.dataset.search.includes(query);
        button.hidden = !match;
        if (match) visible += 1;
      });
      empty.hidden = visible !== 0;
    };

    if (!search.dataset.semanticSearchBound) {
      search.dataset.semanticSearchBound = 'true';
      search.addEventListener('input', filter);
      const form = editor.closest('form');
      form?.addEventListener('reset', () => {
        setTimeout(() => {
          search.value = '';
          filter();
          rewriteIllustrationAssets(editor);
        }, 0);
      });
    }

    if (!editor.dataset.libraryAssetRewriteBound) {
      editor.dataset.libraryAssetRewriteBound = 'true';
      editor.addEventListener('click', () => setTimeout(() => rewriteIllustrationAssets(editor), 0), true);
    }
    filter();
  }

  function enhanceCoverEditors() {
    document.querySelectorAll('.cover-editor').forEach(enhanceIllustrationSearch);
  }

  function init() {
    enhanceStoryStart();
    enhanceCoverEditors();
    loadIllustrationKeywords();

    const observer = new MutationObserver(() => {
      enhanceStoryStart();
      enhanceCoverEditors();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
