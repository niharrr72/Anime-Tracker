# Anime Daily Tracker ⚡️

A lightning-fast, highly automated, serverless web application that tracks your favorite currently airing anime, pinpointing exactly when new episodes are dropping locally.

![Anime Tracker Preview](https://github.com/user-attachments/assets/anime-tracker-preview.png)

## ✨ Core Features
- **Serverless Automation Engine:** Leveraging GitHub Actions, an autonomous NodeJS script (`scripts/update-episodes.js`) wakes up twice a day (6 AM and 6 PM IST) to query the Jikan API. It actively calculates precise Indian Standard Time (IST) drops for all currently airing television shows.
- **Glassmorphism UI:** Built completely from scratch without heavy UI frameworks. The frontend leverages modern Vanilla CSS properties (`backdrop-filter`, `linear-gradient`) to create a stunning, immersive glassy frosted-window aesthetic.
- **Precision "Next Episode" Banners:** Searching for your favorite ongoing hits instantly calculates and reveals the exact release date and time of the upcoming episode—enforcing explicit +1 hour subtitle syndication offsets and hardcoded release overrides for massive anime like *Jujutsu Kaisen* and *Solo Leveling*.
- **O(1) Frontend Load Times:** Over 450 lines of complex client-side REST API logic was gutted. The `index.html` simply downloads the pre-computed `data/episodes.json` built by the backend scripts to instantly render your feed without a single API request from the browser. 

## 🚀 How It Works
Rather than hitting a rate-limited REST API every time a user visits the webpage, the architecture performs all of the heavy lifting entirely in the background:

1.  **Scheduled Data Scraper:** `.github/workflows/update-episodes.yml` fires off every 12 hours globally.
2.  **Streaming Resolution:** The script intelligently detects if the scraped anime stream on major OTT platforms in India (e.g., automatically flagging *The Darwin Incident* with the Amazon Prime badge). 
3.  **Local Data Commits:** The resulting JSON dictionaries are heavily optimized and committed straight over the old data living natively on the `main` branch.
4.  **Static Serving:** When a user arrives, standard browser fetching hits the CDN cache, delivering the data in milliseconds.

## 🛠 Tech Stack
- **HTML5:** Semantic architecture.
- **Vanilla CSS:** Custom design tokens, transitions, variable-based theming.
- **Vanilla JavaScript:** Fast client-side rendering engine, search masking, and DOM injection natively interacting with fetched JSON.
- **NodeJS (Backend Automation):** `fetch` polyfills to query REST APIs, calculate streaming times, build search indexes, and manage file streams `fs` directly on the server host.
- **GitHub Actions:** CI/CD runners functioning as the autonomous computing hub.

## 💡 Running Locally
To test the environment locally:
```bash
# Clone the repository
git clone https://github.com/your-username/anime-daily-tracker.git
cd anime-daily-tracker

# Optional: Manually execute the scraper to pull fresh info into `/data/`
node scripts/update-episodes.js

# Boot up standard server testing tool on Port 3456
npx serve . --listen 3456
```
Open `http://localhost:3456` in your browser.

## 🤝 Contribution
Contributions, bug reports, and pull requests are always welcome! Always ensure `data/episodes.json` and `data/upcoming.json` are generating valid JSON when testing `scripts/update-episodes.js` modifications.
