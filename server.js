// server.js - Main backend
const express = require('express');
const cron = require('node-cron');
const path = require('path');
const db = require('./database');
const { scrapeFuelPricePH } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve frontend from public folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API: Get latest prices
app.get('/api/prices', (req, res) => {
  try {
    const prices = db.getLatestPrices();
    const lastLog = db.getLastLog();
    res.json({
      prices,
      lastUpdate: lastLog?.ran_at || null,
      status: lastLog?.status || 'never_ran'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Price history
app.get('/api/history/:fuelType', (req, res) => {
  try {
    const history = db.getPriceHistory(req.params.fuelType);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Manual trigger (for testing)
app.post('/api/scrape-now', async (req, res) => {
  const result = await scrapeFuelPricePH();
  res.json(result);
});

// SCHEDULER: Daily at 9:00 AM Manila time
cron.schedule('0 9 * * *', async () => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 2=Tue
  
  console.log(`[Cron] Daily check at ${today.toISOString()}`);
  
  // DOE updates Tuesdays - scrape Tue/Wed
  if (dayOfWeek === 2 || dayOfWeek === 3) {
    console.log('[Cron] Running scraper...');
    await scrapeFuelPricePH();
  } else {
    console.log('[Cron] Skipping - not DOE update day');
  }
}, {
  timezone: "Asia/Manila"
});

// Initial scrape if database is empty
const existing = db.getLatestPrices();
if (existing.length === 0) {
  console.log('[Init] Database empty, running initial scrape...');
  scrapeFuelPricePH();
}

app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Cron] Scheduled daily at 9AM Manila time`);
});
