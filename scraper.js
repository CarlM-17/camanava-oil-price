// scraper.js - Pulls oil prices from DOE-based sources
const axios = require('axios');
const cheerio = require('cheerio');
const db = require('./database');

const FUELPRICE_URL = 'https://www.fuelprice.ph/';

// Fallback seed data so app works immediately even if scraper fails
// Update these manually if scraper breaks (from DOE Tuesday advisory)
const SEED_PRICES = [
  { fuelType: 'Diesel', min: 79.62, max: 102.16, avg: 90.89 },
  { fuelType: 'Gasoline (RON 91)', min: 74.11, max: 102.20, avg: 88.15 },
  { fuelType: 'Gasoline (RON 95)', min: 78.50, max: 105.00, avg: 91.75 },
  { fuelType: 'Kerosene', min: 124.97, max: 146.47, avg: 135.72 },
];

async function scrapeFuelPricePH() {
  try {
    console.log('[Scraper] Fetching from fuelprice.ph...');
    
    const response = await axios.get(FUELPRICE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const prices = [];
    const weekOf = new Date().toISOString().split('T')[0];

    // Try to find prices in body text using regex patterns
    const bodyText = $('body').text();
    
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
        prices.push({ fuelType, min: price, max: price, avg: price });
      }
    }

    // If scraping failed, use seed data so app still works
    if (prices.length === 0) {
      console.log('[Scraper] Could not parse prices - using seed data');
      SEED_PRICES.forEach(p => {
        db.savePrice(p.fuelType, p.min, p.max, p.avg, weekOf, 'Seed data (DOE May 2026 reference)');
      });
      db.logScrape('seed', 'Used seed data - update scraper selectors');
      return { success: true, count: SEED_PRICES.length, source: 'seed' };
    }

    // Save scraped prices
    prices.forEach(p => {
      db.savePrice(p.fuelType, p.min, p.max, p.avg, weekOf, 'fuelprice.ph (DOE-sourced)');
    });

    db.logScrape('success', `Scraped ${prices.length} fuel prices`);
    console.log(`[Scraper] Success: ${prices.length} prices saved`);
    return { success: true, count: prices.length, source: 'live' };

  } catch (error) {
    console.error('[Scraper] Error:', error.message);
    
    // On any error, use seed data so app still shows something
    const weekOf = new Date().toISOString().split('T')[0];
    const existing = db.getLatestPrices();
    
    if (existing.length === 0) {
      console.log('[Scraper] Loading seed data so app works...');
      SEED_PRICES.forEach(p => {
        db.savePrice(p.fuelType, p.min, p.max, p.avg, weekOf, 'Seed data (network error)');
      });
    }
    
    db.logScrape('error', error.message);
    return { success: false, error: error.message };
  }
}

// Manual run: node scraper.js
if (require.main === module) {
  scrapeFuelPricePH().then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  });
}

module.exports = { scrapeFuelPricePH };
