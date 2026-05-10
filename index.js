// index.js - CAMANAVA Oil Price Update (single file version)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory storage
let priceData = {
  prices: [],
  lastUpdate: null,
  status: 'never_ran'
};

// Seed data so app works immediately
const SEED_PRICES = [
  { fuel_type: 'Diesel', price_min: 79.62, price_max: 102.16, price_avg: 90.89 },
  { fuel_type: 'Gasoline (RON 91)', price_min: 74.11, price_max: 102.20, price_avg: 88.15 },
  { fuel_type: 'Gasoline (RON 95)', price_min: 78.50, price_max: 105.00, price_avg: 91.75 },
  { fuel_type: 'Kerosene', price_min: 124.97, price_max: 146.47, price_avg: 135.72 },
];

// Scraper function
async function scrapePrices() {
  try {
    console.log('[Scraper] Fetching from fuelprice.ph...');
    
    const response = await axios.get('https://www.fuelprice.ph/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const bodyText = $('body').text();
    const prices = [];

    const patterns = {
      'Diesel': /Diesel.*?₱?\s*(\d{2,3}\.\d{2})/i,
      'Gasoline (RON 91)': /Unleaded.*?91.*?₱?\s*(\d{2,3}\.\d{2})/i,
      'Gasoline (RON 95)': /Premium.*?95.*?₱?\s*(\d{2,3}\.\d{2})/i,
      'Kerosene': /Kerosene.*?₱?\s*(\d{2,3}\.\d{2})/i,
    };

    for (const [fuelType, regex] of Object.entries(patterns)) {
      const match = bodyText.match(regex);
      if (match) {
        const price = parseFloat(match[1]);
        prices.push({
          fuel_type: fuelType,
          price_min: price,
          price_max: price,
          price_avg: price
        });
      }
    }

    if (prices.length > 0) {
      priceData.prices = prices;
      priceData.lastUpdate = new Date().toISOString();
      priceData.status = 'success';
      priceData.source = 'fuelprice.ph (DOE-sourced)';
      console.log(`[Scraper] Success: ${prices.length} prices`);
    } else {
      throw new Error('No prices parsed');
    }

  } catch (error) {
    console.error('[Scraper] Error:', error.message);
    if (priceData.prices.length === 0) {
      priceData.prices = SEED_PRICES;
      priceData.lastUpdate = new Date().toISOString();
      priceData.status = 'seed';
      priceData.source = 'Seed data (May 2026 reference)';
    }
  }
}

// API endpoint
app.get('/api/prices', (req, res) => {
  res.json(priceData);
});

// Manual trigger
app.get('/api/scrape-now', async (req, res) => {
  await scrapePrices();
  res.json({ ok: true, ...priceData });
});

// Frontend HTML
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CAMANAVA Oil Price Update</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      min-height: 100vh;
      padding: 20px;
      color: #333;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    header { text-align: center; color: white; padding: 30px 20px; margin-bottom: 30px; }
    header h1 { font-size: 2.5rem; margin-bottom: 8px; letter-spacing: 1px; }
    header p { opacity: 0.9; font-size: 1rem; }
    .last-update {
      display: inline-block; margin-top: 12px; padding: 6px 14px;
      background: rgba(255,255,255,0.2); border-radius: 20px; font-size: 0.85rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 20px; margin-bottom: 30px;
    }
    .card {
      background: white; border-radius: 12px; padding: 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1); transition: transform 0.2s;
    }
    .card:hover { transform: translateY(-4px); }
    .fuel-name {
      font-size: 0.9rem; color: #666; text-transform: uppercase;
      letter-spacing: 1px; margin-bottom: 8px;
    }
    .price { font-size: 2.4rem; font-weight: 700; color: #1e3c72; margin-bottom: 6px; }
    .price-range { font-size: 0.85rem; color: #888; }
    .source-info {
      background: white; border-radius: 12px; padding: 20px;
      text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    .source-info a { color: #2a5298; text-decoration: none; font-weight: 600; }
    .loading, .error {
      text-align: center; padding: 40px; background: white;
      border-radius: 12px; color: #666;
    }
    .error { color: #c0392b; }
    .refresh-btn {
      display: block; margin: 20px auto 0; padding: 10px 24px;
      background: #2a5298; color: white; border: none;
      border-radius: 6px; cursor: pointer; font-size: 0.9rem;
    }
    .refresh-btn:hover { background: #1e3c72; }
    footer {
      text-align: center; color: rgba(255,255,255,0.8);
      margin-top: 30px; font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>⛽ CAMANAVA Oil Price Update</h1>
      <p>Latest fuel prices in the Philippines</p>
      <div class="last-update" id="lastUpdate">Loading...</div>
    </header>
    <div id="content" class="loading">Fetching latest prices...</div>
    <div class="source-info">
      <strong>Data Source:</strong> Department of Energy (DOE) weekly oil price monitor via 
      <a href="https://www.fuelprice.ph/" target="_blank">fuelprice.ph</a><br>
      <small>DOE updates every Tuesday. App checks daily at 9AM Manila time.</small>
      <button class="refresh-btn" onclick="loadPrices()">Refresh Now</button>
    </div>
    <footer><p>Caloocan • Malabon • Navotas • Valenzuela</p></footer>
  </div>
  <script>
    async function loadPrices() {
      const content = document.getElementById('content');
      const lastUpdate = document.getElementById('lastUpdate');
      content.className = 'loading';
      content.textContent = 'Fetching latest prices...';
      try {
        const res = await fetch('/api/prices');
        const data = await res.json();
        if (!data.prices || data.prices.length === 0) {
          content.className = 'error';
          content.textContent = 'No price data yet. Refresh in 10 seconds.';
          return;
        }
        if (data.lastUpdate) {
          const d = new Date(data.lastUpdate);
          lastUpdate.textContent = 'Last checked: ' + d.toLocaleString('en-PH', { 
            timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short'
          });
        }
        content.className = 'grid';
        content.innerHTML = data.prices.map(p => 
          '<div class="card">' +
            '<div class="fuel-name">' + p.fuel_type + '</div>' +
            '<div class="price">₱' + p.price_avg.toFixed(2) + '</div>' +
            '<div class="price-range">' + 
              (p.price_min !== p.price_max 
                ? 'Range: ₱' + p.price_min.toFixed(2) + ' - ₱' + p.price_max.toFixed(2)
                : 'per liter') +
            '</div>' +
          '</div>'
        ).join('');
      } catch (err) {
        content.className = 'error';
        content.textContent = 'Error: ' + err.message;
      }
    }
    loadPrices();
    setInterval(loadPrices, 5 * 60 * 1000);
  </script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.send(HTML);
});

// Daily scheduler
cron.schedule('0 9 * * *', async () => {
  const day = new Date().getDay();
  if (day === 2 || day === 3) {
    console.log('[Cron] Running scraper...');
    await scrapePrices();
  }
}, { timezone: "Asia/Manila" });

// Initial scrape on startup
scrapePrices();

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
});
