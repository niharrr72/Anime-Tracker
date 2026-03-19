(function () {
  const feedSection = document.getElementById('feed-section');
  const todayGrid = document.getElementById('today-grid');
  const todayEmpty = document.getElementById('today-empty');
  const todayDateLabel = document.getElementById('today-date-label');
  const noResults = document.getElementById('no-results');
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('clear-search');
  const searchStatus = document.getElementById('search-status');
  const lastUpdated = document.getElementById('last-updated');
  const loadingOverlay = document.getElementById('loading-overlay');

  let globalUpcoming = {}; // Holds next episode data

  // Next Episode Banner
  const upcomingBanner = document.createElement('div');
  upcomingBanner.className = 'upcoming-banner-container';
  upcomingBanner.style.display = 'none';
  // Insert before todayGrid's parent container (the section)
  todayGrid.parentElement.insertBefore(upcomingBanner, todayGrid.parentElement.firstElementChild);

  // ── Utils ─────────────────────────────────────────────────────────
  function pad(n) { return n.toString().padStart(2, '0'); }

  // Get YYYY-MM-DD for comparing groups
  function dateStr(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Get today's local date string
  function todayStr() { return dateStr(new Date()); }

  // Format YYYY-MM-DD -> "Wed, 17 Mar, 2026"
  function formatDateDisplay(ymd) {
    const d = new Date(ymd); // Local time
    const today = new Date(todayStr());
    
    // Check if it's "Yesterday"
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    if (ymd === todayStr()) return "TODAY";
    if (ymd === dateStr(yesterday)) return "YESTERDAY";

    return d.toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  function escHtml(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
  }

  function badgeClass(s) {
    const l = (s ?? '').toLowerCase();
    if (l.includes('crunchyroll'))  return 'badge-crunchyroll';
    if (l.includes('netflix'))      return 'badge-netflix';
    if (l.includes('disney'))       return 'badge-disney';
    if (l.includes('amazon') || l.includes('prime')) return 'badge-amazon';
    if (l.includes('hidive'))       return 'badge-hidive';
    if (l.includes('funimation'))   return 'badge-funimation';
    if (l.includes('hulu'))         return 'badge-hulu';
    if (l.includes('youtube'))      return 'badge-youtube';
    if (l.includes('bilibili'))     return 'badge-bilibili';
    return 'badge-other';
  }

  // glowColor uses the primary (first) platform
  function glowColor(platforms) {
    const s = ((Array.isArray(platforms) ? platforms[0] : platforms) ?? '').toLowerCase();
    if (s.includes('crunchyroll')) return '#f47521';
    if (s.includes('netflix'))     return '#e50914';
    if (s.includes('disney'))      return '#006e99';
    if (s.includes('amazon') || s.includes('prime')) return '#00a8e0';
    return '#9b5de5';
  }

  // ── Card builder ──────────────────────────────────────────────────
  function buildCard(ep, delay = 0) {
    const card = document.createElement('article');
    card.className = 'episode-card';
    card.style.animationDelay = `${delay}ms`;
    card.dataset.anime = ep.anime.toLowerCase();
    card.dataset.malid = ep.malId;

    const platforms = Array.isArray(ep.streaming) ? ep.streaming : [ep.streaming ?? 'Crunchyroll'];

    // All badges go in a row below the title — no badge on the poster
    const streamingRowHtml = `<div class="streaming-row">${
      platforms.map(p => `<span class="streaming-badge ${badgeClass(p)}">${escHtml(p)}</span>`).join('')
    }</div>`;

    // Poster — clean, no badge overlay
    const posterHtml = ep.image
      ? `<div class="card-poster">
           <img src="${escHtml(ep.image)}" alt="${escHtml(ep.anime)} poster"
                class="card-poster-img" loading="lazy"
                onerror="this.parentElement.classList.add('poster-fallback');this.remove();"/>
           <div class="poster-overlay"></div>
         </div>`
      : `<div class="card-poster poster-fallback"></div>`;

    card.innerHTML = `
      <div class="card-glow" style="background:${glowColor(platforms)};"></div>
      ${posterHtml}
      <div class="card-body">
        <div class="card-top">
          <h3 class="anime-name">${escHtml(ep.anime)}</h3>
        </div>
        <div class="card-meta">
          <span class="meta-pill">Season ${ep.season}</span>
          <span class="meta-pill highlight">Ep ${ep.episode}</span>
        </div>
        <p class="episode-title">"${escHtml(ep.title)}"</p>
        ${streamingRowHtml}
        <div class="card-bottom">
          <span class="time-icon">🕐</span>
          <span class="release-time">${escHtml(ep.releaseTime)} IST</span>
        </div>
      </div>
    `;
    return card;
  }

  // ── Render helpers ─────────────────────────────────────────────────
  function renderToday(episodes) {
    const today = todayStr();
    todayDateLabel.textContent = formatDateDisplay(today);

    const todays = episodes
      .filter(ep => ep.date === today)
      .sort((a, b) => a.releaseTime.localeCompare(b.releaseTime));

    if (todays.length === 0) {
      todayEmpty.hidden = false;
      return;
    }
    todays.forEach((ep, i) => todayGrid.appendChild(buildCard(ep, i * 55)));
  }

  function renderFeed(episodes) {
    const today = todayStr();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - 29);
    const cutoffStr = dateStr(cutoff);

    const past = episodes.filter(ep => ep.date < today && ep.date >= cutoffStr);

    const grouped = {};
    past.forEach(ep => {
      if (!grouped[ep.date]) grouped[ep.date] = [];
      grouped[ep.date].push(ep);
    });

    Object.keys(grouped)
      .sort((a, b) => b.localeCompare(a))
      .forEach((date, di) => {
        const eps = grouped[date].sort((a, b) => a.releaseTime.localeCompare(b.releaseTime));

        const group = document.createElement('div');
        group.className = 'feed-day-group';
        group.dataset.date = date;
        group.style.animationDelay = `${di * 35}ms`;

        group.innerHTML = `
          <div class="feed-date-header">
            <span class="feed-date-text">${formatDateDisplay(date)}</span>
            <div class="feed-date-line"></div>
            <span class="feed-date-count">${eps.length} ep${eps.length !== 1 ? 's' : ''}</span>
          </div>
        `;

        const grid = document.createElement('div');
        grid.className = 'card-grid';
        eps.forEach((ep, i) => grid.appendChild(buildCard(ep, i * 35)));
        group.appendChild(grid);
        feedSection.appendChild(group);
      });
  }

  // ── Search ─────────────────────────────────────────────────────────
  function applySearch(query) {
    const q = query.trim().toLowerCase();
    clearBtn.hidden = q.length === 0;

    const todayCards = todayGrid.querySelectorAll('.episode-card');
    let todayVisible = 0;
    todayCards.forEach(card => {
      const match = !q || card.dataset.anime.includes(q);
      card.style.display = match ? '' : 'none';
      if (match) todayVisible++;
    });
    todayEmpty.hidden = todayVisible > 0 || !q;

    let feedVisible = 0;
    feedSection.querySelectorAll('.feed-day-group').forEach(group => {
      const cards = group.querySelectorAll('.episode-card');
      let gv = 0;
      cards.forEach(card => {
        const match = !q || card.dataset.anime.includes(q);
        card.style.display = match ? '' : 'none';
        if (match) gv++;
      });
      group.style.display = gv > 0 ? '' : 'none';
      feedVisible += gv;
    });

    noResults.hidden = (todayVisible + feedVisible) > 0 || !q;

    // ── Next Episode Banner Logic ──
    if (q) {
      const total = todayVisible + feedVisible;
      searchStatus.textContent = `Showing ${total} result${total !== 1 ? 's' : ''} for "${query.trim()}"`;
      searchStatus.hidden = false;

      // Extract unique anime from search results
      const visibleAnimes = new Set();
      todayGrid.querySelectorAll('.episode-card').forEach(c => {
        if (c.style.display !== 'none') visibleAnimes.add(c.dataset.anime);
      });
      feedSection.querySelectorAll('.episode-card').forEach(c => {
        if (c.style.display !== 'none') visibleAnimes.add(c.dataset.anime);
      });

      if (visibleAnimes.size === 1) {
        const animeName = [...visibleAnimes][0];
        const nextInfo = globalUpcoming[animeName];
        if (nextInfo) {
          upcomingBanner.innerHTML = `
            <div class="upcoming-alert">
              <span class="upcoming-icon">✨</span>
              <div class="upcoming-text">
                <span class="upcoming-title">${escHtml(nextInfo.anime)}</span><br/>
                Next episode <span class="upcoming-ep">(${nextInfo.episode})</span> on <span class="upcoming-date">${formatDateDisplay(nextInfo.date)}</span> at ${escHtml(nextInfo.releaseTime)}
              </div>
            </div>
          `;
          upcomingBanner.style.display = 'block';
        } else {
          upcomingBanner.style.display = 'none';
        }
      } else {
        upcomingBanner.style.display = 'none'; // Not uniquely identified or no future episodes
      }

    } else {
      searchStatus.hidden = true;
      upcomingBanner.style.display = 'none';
    }
  }

  // ── Update progress text in spinner ───────────────────────────────
  function setLoadingText(msg) {
    const el = document.querySelector('.loading-text');
    if (el) el.textContent = msg;
  }

  // ── Main Data Load & Render ────────────────────────────────────────
  async function loadDataAndRender() {
    // Clear existing data so we can safely re-render on auto-refresh
    todayGrid.innerHTML = '';
    feedSection.innerHTML = '';
    loadingOverlay.classList.remove('hidden');

    let episodes = [];
    try {
      setLoadingText('Loading episodes database...');
      const cacheBuster = `?t=${Date.now()}`;
      
      const [epResp, upResp] = await Promise.all([
        fetch(`data/episodes.json${cacheBuster}`, { cache: 'no-store' }),
        fetch(`data/upcoming.json${cacheBuster}`, { cache: 'no-store' }).catch(() => null)
      ]);
      
      if (!epResp.ok) throw new Error('Could not load episodes.json');
      episodes = await epResp.json();
      
      if (upResp && upResp.ok) {
        globalUpcoming = await upResp.json();
      }
    } catch (err) {
      console.error('Failed to load local data:', err.message);
      todayGrid.innerHTML = `<p style="color:var(--orange);padding:16px;">
        ⚠️ Could not load data. Ensure you are running a local dev server (<code>npx serve .</code>).
      </p>`;
    }

    // Render
    if (episodes.length > 0) {
      renderToday(episodes);
      renderFeed(episodes);
    }

    // Update timestamp
    lastUpdated.textContent = new Date().toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    // Hide spinner rapidly
    setTimeout(() => loadingOverlay.classList.add('hidden'), 300);
  }

  // ── One-time Setup ──────────────────────────────────────────────────
  function setupOnce() {
    // Wire up search
    searchInput.addEventListener('input', () => applySearch(searchInput.value));
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      applySearch('');
      searchInput.focus();
    });

    // Initial load
    loadDataAndRender();

    // Silently check for new daily episodes in the background every hour (avoids complex math)
    setInterval(() => {
        loadDataAndRender();
    }, 60 * 60 * 1000);
  }

  document.addEventListener('DOMContentLoaded', setupOnce);
})();
