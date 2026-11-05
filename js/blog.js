// ============================================================
// blog.js — Blog public (liste + article)
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if (path.includes('article.html')) loadArticle();
  else loadBlog();
});

let allArticles = [];
let activeFilter = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeUrl(value, kind = 'link') {
  try {
    const url = new URL(value, window.location.origin);
    if (kind === 'iframe') {
      const host = url.hostname.replace(/^www\./, '');
      return ['youtube.com', 'youtube-nocookie.com'].includes(host) && url.pathname.startsWith('/embed/') ? url.href : null;
    }
    if (kind === 'image') return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function sanitizeArticleHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');

  template.content.querySelectorAll('script,object,embed,form,input,button,textarea,select,link,meta,style').forEach((el) => el.remove());
  template.content.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc') el.removeAttribute(attr.name);
    });

    if (el.hasAttribute('href')) {
      const url = safeUrl(el.getAttribute('href'), 'link');
      if (url) {
        el.setAttribute('href', url);
        if (url.startsWith('http')) el.setAttribute('rel', 'noopener noreferrer');
      } else el.removeAttribute('href');
    }

    if (el.tagName === 'IMG') {
      const url = safeUrl(el.getAttribute('src'), 'image');
      if (url) {
        el.setAttribute('src', url);
        el.setAttribute('loading', 'lazy');
      } else el.remove();
    }

    if (el.tagName === 'IFRAME') {
      const url = safeUrl(el.getAttribute('src'), 'iframe');
      if (url) {
        el.setAttribute('src', url);
        el.setAttribute('loading', 'lazy');
        el.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        el.removeAttribute('allowfullscreen');
      } else el.remove();
    }
  });

  return template.innerHTML;
}

async function loadBlog() {
  const { data, error } = await dbClient
    .from('articles')
    .select('*')
    .eq('published', true)
    .order('published_at', { ascending: false });

  if (error || !data) {
    document.getElementById('blog-grid').innerHTML = '<p class="empty-msg">Impossible de charger le journal.</p>';
    return;
  }

  allArticles = data;
  renderFilters();
  renderGrid(allArticles);
}

function renderFilters() {
  const wrap = document.getElementById('blog-filters');
  if (!wrap) return;
  const cats = [...new Set(allArticles.map((a) => a.category).filter(Boolean))];
  wrap.innerHTML = '';
  if (cats.length === 0) return;

  const all = document.createElement('button');
  all.className = 'filter-btn active';
  all.textContent = 'Tous';
  all.addEventListener('click', () => setFilter(null, all));
  wrap.appendChild(all);

  cats.forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.textContent = cat;
    btn.addEventListener('click', () => setFilter(cat, btn));
    wrap.appendChild(btn);
  });
}

function setFilter(cat, btn) {
  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = cat;
  renderGrid(cat ? allArticles.filter((a) => a.category === cat) : allArticles);
}

function renderGrid(articles) {
  const grid = document.getElementById('blog-grid');
  grid.innerHTML = '';
  if (articles.length === 0) {
    grid.innerHTML = '<p class="empty-msg">Aucun article pour le moment.</p>';
    return;
  }

  articles.forEach((article, i) => {
    const card = document.createElement('article');
    card.className = 'blog-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    card.style.animationDelay = `${i * 0.05}s`;

    const coverUrl = article.cover_path ? getPublicUrl('blog-images', article.cover_path) : null;
    const imgHtml = coverUrl
      ? '<div class="blog-card-cover"></div>'
      : '<div class="blog-card-cover blog-card-cover--empty" aria-hidden="true">✦</div>';
    const date = article.published_at
      ? new Date(article.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';

    card.innerHTML = `
      ${imgHtml}
      <div class="blog-card-body">
        ${article.category ? `<span class="blog-tag">${escapeHtml(article.category)}</span>` : ''}
        <h2 class="blog-card-title">${escapeHtml(article.title)}</h2>
        ${article.excerpt ? `<p class="blog-card-excerpt">${escapeHtml(article.excerpt)}</p>` : ''}
        <div class="blog-card-meta">
          ${date ? `<span>${escapeHtml(date)}</span>` : ''}
          <span class="blog-read-more">Lire →</span>
        </div>
      </div>`;

    if (coverUrl) card.querySelector('.blog-card-cover').style.backgroundImage = `url(${JSON.stringify(coverUrl)})`;
    const open = () => { window.location.href = `article.html?id=${encodeURIComponent(article.id)}`; };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
    grid.appendChild(card);
  });
}

async function loadArticle() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) { window.location.href = 'blog.html'; return; }

  const { data: article, error } = await dbClient
    .from('articles')
    .select('*')
    .eq('id', id)
    .eq('published', true)
    .single();

  if (error || !article) {
    document.getElementById('article-content').innerHTML = '<p class="empty-msg">Article introuvable.</p>';
    return;
  }

  const bcTitle = document.getElementById('article-bc-title');
  if (bcTitle) bcTitle.textContent = article.title;
  document.title = article.title + ' — Katpist Audio';

  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const coverUrl = article.cover_path ? getPublicUrl('blog-images', article.cover_path) : null;
  const coverHtml = coverUrl ? '<div class="article-cover"></div>' : '';

  const container = document.getElementById('article-content');
  container.innerHTML = `
    ${coverHtml}
    <div class="article-header">
      ${article.category ? `<span class="blog-tag">${escapeHtml(article.category)}</span>` : ''}
      <h1 class="article-title">${escapeHtml(article.title)}</h1>
      ${date ? `<p class="article-date">${escapeHtml(date)}</p>` : ''}
    </div>
    <div class="article-body">${sanitizeArticleHtml(article.content)}</div>`;
  if (coverUrl) container.querySelector('.article-cover').style.backgroundImage = `url(${JSON.stringify(coverUrl)})`;
}
