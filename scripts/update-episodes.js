const fs = require('fs');
const path = require('path');

const JIKAN = 'https://api.jikan.moe/v4';
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
// JS Date.getDay(): 0=Sunday, 1=Monday...
const DAY_NUM = { 'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6 };
const EXACT_AIRING_OVERRIDES = {
  // day: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  "jujutsu kaisen": { day: 4, time: "10:30 PM" }, // Thursdays
  "solo leveling": { day: 6, time: "08:30 PM" },  // Saturdays
};

const KNOWN_STREAMING = new Set([
  'Crunchyroll', 'Netflix', 'Amazon Prime', 'Disney+', 'HiDive', 'Funimation', 'Hulu',
]);

function normalizePlatform(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.includes('crunchyroll')) return 'Crunchyroll';
  if (lower.includes('netflix'))     return 'Netflix';
  if (lower.includes('disney'))      return 'Disney+';
  if (lower.includes('amazon') || lower.includes('prime')) return 'Amazon Prime';
  if (lower.includes('hidive'))      return 'HiDive';
  if (lower.includes('funimation'))  return 'Funimation';
  if (lower.includes('hulu'))        return 'Hulu';
  return null;
}

function getStreamingOverrides(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('jujutsu kaisen')) return ['Crunchyroll', 'Netflix'];
  if (t.includes('one piece')) return ['Crunchyroll', 'Netflix'];
  if (t.includes('my hero academia') || t.includes('spy x family') || t.includes('chainsaw man')) return ['Crunchyroll', 'Hulu'];
  if (t.includes('dungeon meshi') || t.includes('delicious in dungeon') || t.includes('sakamoto days')) return ['Netflix'];
  if (t.includes('vinland saga')) return ['Crunchyroll', 'Netflix', 'Amazon Prime'];
  if (t.includes('wind breaker')) return ['Crunchyroll', 'Disney+'];
  if (t.includes('dandadan')) return ['Crunchyroll', 'Netflix', 'Hulu'];
  if (t.includes('dragon ball daima')) return ['Crunchyroll', 'Netflix'];
  if (t.includes('darwin incident')) return ['Amazon Prime'];
  return null;
}

function resolveStreamingInitial(animeObj) {
  const title = animeObj.title_english || animeObj.title || '';
  const overrides = getStreamingOverrides(title);
  if (overrides) return overrides;
  const found = new Set();
  const sources = [
    ...(animeObj.streaming ?? []),
    ...(animeObj.producers  ?? []),
    ...(animeObj.licensors  ?? []),
  ];
  for (const src of sources) {
    const normalized = normalizePlatform(src.name);
    if (normalized) found.add(normalized);
  }
  return found.size > 0 ? [...found] : ['Crunchyroll'];
}

function pad(n) { return n.toString().padStart(2, '0'); }

// Get YYYY-MM-DD
function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}


function detectSeason(title) {
  if (title.toLowerCase().includes('jujutsu kaisen') && title.toLowerCase().includes('culling game')) {
    return 3;
  }
  const patterns = [
    /(\d+)(?:st|nd|rd|th)\s+season/i,
    /season\s*(\d+)/i,
    /\bs(\d+)\b/i,
    /part\s*(\d+)/i
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return parseInt(m[1]);
  }
  return 1;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function jikanGet(endpoint) {
  let retries = 3;
  while (retries > 0) {
    try {
      const resp = await fetch(`${JIKAN}${endpoint}`);
      if (resp.status === 429) {
        console.log(`Rate limited on ${endpoint}. Retrying...`);
        retries--;
        await sleep(3000);
        continue;
      }
      if (!resp.ok) throw new Error(`Jikan error ${resp.status}`);
      return await resp.json();
    } catch (e) {
      if (retries <= 1) throw e;
      retries--;
      await sleep(2000);
    }
  }
  throw new Error(`Failed to fetch ${endpoint} after retries`);
}

async function fetchAllSchedules() {
  const results = [];
  for (const day of DAYS) {
    try {
      console.log(`Fetching schedule for ${day}...`);
      const data = await jikanGet(`/schedules?filter=${day}&limit=25`);
      const anime = data.data ?? [];
      anime.forEach(a => {
        a._broadcastDay = day;
        a._broadcastTime = a.broadcast?.time;
        results.push(a);
      });
      await sleep(1500); // Super safe delay to never hit 429
    } catch (e) {
      console.error(`Error fetching ${day}:`, e.message);
    }
  }
  return results;
}

async function computeEpisodes(animeList) {
  // Use today in IST
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istNow = new Date(utcMs + (5.5 * 60 * 60000));
  
  const today = new Date(istNow);
  today.setHours(0,0,0,0);
  
  const cutoff = new Date(today);
  cutoff.setDate(today.getDate() - 29); // Past 30 days inclusive

  // Look ahead 7 days to conservatively find the single next broadcast
  const futureCutoff = new Date(today);
  futureCutoff.setDate(today.getDate() + 7);

  const episodes = [];
  const upcoming = {}; // mapping: anime title (lowercase) -> { episode, date, releaseTime }
  let idCounter = 1;

  for (const anime of animeList) {
    if (!anime.aired?.from) continue;
    const airStart = new Date(anime.aired.from);
    if (isNaN(airStart.getTime())) continue;

    const title  = anime.title_english || anime.title || 'Unknown';
    const lTitle = title.toLowerCase();
    
    // Check for exact manual drop time override
    let overrideInfo = null;
    for (const key of Object.keys(EXACT_AIRING_OVERRIDES)) {
      if (lTitle.includes(key)) {
        overrideInfo = EXACT_AIRING_OVERRIDES[key];
        break;
      }
    }

    let broadcastDayNum = DAY_NUM[anime._broadcastDay];
    if (broadcastDayNum === undefined && !overrideInfo) continue;

    // Favor exact known streaming drop day over Japanese TV day
    if (overrideInfo && overrideInfo.day !== undefined) {
      broadcastDayNum = overrideInfo.day;
    }

    // Resolve exactly when the episode hits India
    let releaseTime = "";
    if (overrideInfo && overrideInfo.time) {
      releaseTime = overrideInfo.time;
    } else {
      // Global Model: Streaming platforms require subtitle sync.
      // Japanese TV (JST) is UTC+9. India (IST) is UTC+5.5. That is -3.5 hours.
      // Subtitle syndication delays drops by exactly 1 Hour globally.
      // Net logic = -2.5 hours mathematical translation!
      if (!anime._broadcastTime) {
        releaseTime = '12:00 AM';
      } else {
        const [h, m] = anime._broadcastTime.split(':').map(Number);
        let istS = (h || 0) * 60 + (m || 0) - (2.5 * 60); 
        if (istS < 0) istS += 24 * 60;
        if (istS >= 24 * 60) istS -= 24 * 60;
        const outH = Math.floor(istS / 60);
        const outM = Math.floor(istS % 60);
        const ampm = outH >= 12 ? 'PM' : 'AM';
        const displayH = outH % 12 || 12;
        releaseTime = `${displayH.toString().padStart(2, '0')}:${outM.toString().padStart(2, '0')} ${ampm}`;
      }
    }

    const season = detectSeason(title);
    const streaming = resolveStreamingInitial(anime);

    // Compute past 30 days + today
    let cursor = new Date(cutoff);
    while (cursor <= today) {
      if (cursor.getDay() === broadcastDayNum && cursor >= airStart) {
        const msSinceStart = cursor.getTime() - airStart.getTime();
        const weeksSince   = Math.round(msSinceStart / (7 * 24 * 60 * 60 * 1000));
        const epNum        = weeksSince + 1;

        if (anime.episodes && epNum > anime.episodes) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }

        episodes.push({
          id: idCounter++,
          anime: title,
          season,
          episode: epNum,
          title: `Episode ${epNum}`,
          date: dateStr(new Date(cursor)),
          releaseTime,
          streaming,
          malId: anime.mal_id,
          score: anime.score ?? 0,
          members: anime.members ?? 0,
          image: anime.images?.webp?.image_url || anime.images?.jpg?.image_url || null,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Compute exact next upcoming episode (if airing)
    // Only search from tomorrow up to the next 7 days
    let futureCursor = new Date(today);
    futureCursor.setDate(futureCursor.getDate() + 1); // Start tomorrow

    while (futureCursor <= futureCutoff) {
      if (futureCursor.getDay() === broadcastDayNum && futureCursor > airStart) {
        const msSinceStart = futureCursor.getTime() - airStart.getTime();
        const weeksSince   = Math.round(msSinceStart / (7 * 24 * 60 * 60 * 1000));
        const epNum        = weeksSince + 1;

        // CRITICAL check: Do not project an episode if the season ended!
        if (!anime.episodes || epNum <= anime.episodes) {
          upcoming[title.toLowerCase()] = {
            anime: title,
            season,
            episode: epNum,
            date: dateStr(new Date(futureCursor)),
            releaseTime,
            image: anime.images?.webp?.image_url || null
          };
        }
        break; // Found the next episode, stop looking further
      }
      futureCursor.setDate(futureCursor.getDate() + 1);
    }
  }

  // Enrich episodes with actual titles using safe background rate
  console.log(`Enriching titles for ${episodes.length} episodes...`);
  const uniqueSeries = [...new Set(episodes.map(e => e.malId))];
  
  for (const malId of uniqueSeries) {
    try {
      console.log(`Fetching episodes for MAL ID ${malId}...`);
      const data = await jikanGet(`/anime/${malId}/episodes`);
      const list = data.data ?? [];
      
      const titleMap = new Map();
      list.forEach(e => {
        const t = e.title_romanji || e.title || e.title_japanese || null;
        if (t) titleMap.set(e.mal_id, t);
      });
      
      // Update all episodes for this series
      episodes.forEach(ep => {
        if (ep.malId === malId && titleMap.has(ep.episode)) {
          ep.title = titleMap.get(ep.episode);
        }
      });
      
      await sleep(1500); // Stay way under 60req/min
    } catch (e) {
      console.log(`Skipped titles for ${malId}: ${e.message}`);
    }
  }

  return { episodes, upcoming };
}

async function main() {
  console.log('Starting data refresh...');
  const animeList = await fetchAllSchedules();
  console.log(`Fetched ${animeList.length} scheduled anime.`);
  
  const { episodes, upcoming } = await computeEpisodes(animeList);
  
  // Sort primarily by date desc, then by time
  episodes.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.releaseTime.localeCompare(b.releaseTime);
  });
  
  const targetDir = path.join(__dirname, '../data');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  // Save episodes
  const file = path.join(targetDir, 'episodes.json');
  fs.writeFileSync(file, JSON.stringify(episodes, null, 2), 'utf-8');
  console.log(`Successfully wrote ${episodes.length} episodes to data/episodes.json`);

  // Save upcoming
  const upcomingFile = path.join(targetDir, 'upcoming.json');
  fs.writeFileSync(upcomingFile, JSON.stringify(upcoming, null, 2), 'utf-8');
  console.log(`Successfully wrote ${Object.keys(upcoming).length} upcoming records to data/upcoming.json`);
}

main().catch(console.error);
