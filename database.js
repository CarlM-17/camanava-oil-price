// database.js - JSON file database (no compiler needed)
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('prices.json');
const db = low(adapter);

// Set defaults
db.defaults({ prices: [], logs: [] }).write();

function savePrice(fuelType, min, max, avg, weekOf, source) {
  db.get('prices').push({
    id: Date.now() + Math.random(),
    fuel_type: fuelType,
    price_min: min,
    price_max: max,
    price_avg: avg,
    week_of: weekOf,
    source: source,
    scraped_at: new Date().toISOString()
  }).write();
}

function getLatestPrices() {
  const all = db.get('prices').value();
  const latest = {};
  all.forEach(p => {
    if (!latest[p.fuel_type] || p.id > latest[p.fuel_type].id) {
      latest[p.fuel_type] = p;
    }
  });
  return Object.values(latest).sort((a, b) => a.fuel_type.localeCompare(b.fuel_type));
}

function getPriceHistory(fuelType, limit = 12) {
  return db.get('prices')
    .filter({ fuel_type: fuelType })
    .orderBy('id', 'desc')
    .take(limit)
    .value();
}

function logScrape(status, message) {
  db.get('logs').push({
    id: Date.now(),
    status,
    message,
    ran_at: new Date().toISOString()
  }).write();
}

function getLastLog() {
  return db.get('logs').orderBy('id', 'desc').take(1).value()[0] || null;
}

module.exports = { savePrice, getLatestPrices, getPriceHistory, logScrape, getLastLog };
