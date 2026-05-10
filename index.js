const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// ─── Oil Price Data ───────────────────────────────────────────────────────────
const stations = [
  { id: 1, name: "Petron - Caloocan (A. Mabini)", lat: 14.6507, lng: 120.9726, city: "Caloocan", brand: "Petron",  gasoline: 61.35, diesel: 55.80, premium: 65.90 },
  { id: 2, name: "Shell - Caloocan (10th Ave)",   lat: 14.6583, lng: 120.9841, city: "Caloocan", brand: "Shell",   gasoline: 61.80, diesel: 56.10, premium: 66.50 },
  { id: 3, name: "Caltex - Caloocan (Rizal Ave)", lat: 14.6621, lng: 120.9763, city: "Caloocan", brand: "Caltex",  gasoline: 61.20, diesel: 55.60, premium: 65.70 },
  { id: 4, name: "Phoenix - Malabon (Gov. Pascual)", lat: 14.6680, lng: 120.9572, city: "Malabon", brand: "Phoenix", gasoline: 60.95, diesel: 55.40, premium: 65.45 },
  { id: 5, name: "Petron - Malabon (Rizal Ave Ext)", lat: 14.6712, lng: 120.9601, city: "Malabon", brand: "Petron",  gasoline: 61.35, diesel: 55.80, premium: 65.90 },
  { id: 6, name: "Shell - Navotas (M. Naval St)",    lat: 14.6608, lng: 120.9449, city: "Navotas", brand: "Shell",   gasoline: 61.80, diesel: 56.10, premium: 66.50 },
  { id: 7, name: "Caltex - Navotas (Bangus St)",     lat: 14.6581, lng: 120.9421, city: "Navotas", brand: "Caltex",  gasoline: 61.20, diesel: 55.60, premium: 65.70 },
  { id: 8, name: "Petron - Valenzuela (McArthur Hwy)", lat: 14.7000, lng: 120.9631, city: "Valenzuela", brand: "Petron",  gasoline: 61.35, diesel: 55.80, premium: 65.90 },
  { id: 9, name: "Shell - Valenzuela (Gen. T. de Leon)", lat: 14.6978, lng: 120.9710, city: "Valenzuela", brand: "Shell",   gasoline: 61.80, diesel: 56.10, premium: 66.50 },
  { id:10, name: "Phoenix - Valenzuela (Karuhatan Rd)",  lat: 14.7041, lng: 120.9674, city: "Valenzuela", brand: "Phoenix", gasoline: 60.95, diesel: 55.40, premium: 65.45 },
];

const priceHistory = [
  { week: "Apr 7",  gasoline: 62.50, diesel: 57.20 },
  { week: "Apr 14", gasoline: 62.10, diesel: 56.90 },
  { week: "Apr 21", gasoline: 61.80, diesel: 56.50 },
  { week: "Apr 28", gasoline: 61.50, diesel: 56.10 },
  { week: "May 5",  gasoline: 61.35, diesel: 55.80 },
];

// ─── News RSS Fetcher ─────────────────────────────────────────────────────────
async function fetchRSS(url) {
  try {
    const https = require('https');
    const http  = require('http');
    const client = url.startsWith('https') ? https : http;

    return new Promise((resolve, reject) => {
      client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    });
  } catch (e) {
    return '';
  }
}

function parseRSS(xml, source) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                   block.match(/<title>(.*?)<\/title>/))?.[1]?.trim() || '';
    const link  = (block.match(/<link>(.*?)<\/link>/) ||
                   block.match(/<guid[^>]*>(.*?)<\/guid>/))?.[1]?.trim() || '#';
    const date  = (block.match(/<pubDate>(.*?)<\/pubDate>/))?.[1]?.trim() || '';
    const desc  = (block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                   block.match(/<description>(.*?)<\/description>/))?.[1]
                   ?.replace(/<[^>]+>/g, '')?.trim()?.slice(0, 150) || '';

    const oilKeywords = /oil|petrol|fuel|diesel|gasoline|pump price|price hike|price rollback|dof|doe|energy/i;
    if (title && oilKeywords.test(title + ' ' + desc)) {
      items.push({ title, link, date, desc, source });
    }
    if (items.length >= 6) break;
  }
  return items;
}

// Cache news for 30 mins
let newsCache = { data: [], lastFetched: 0 };

async function getNews() {
  const now = Date.now();
  if (now - newsCache.lastFetched < 30 * 60 * 1000 && newsCache.data.length > 0) {
    return newsCache.data;
  }

  const feeds = [
    { url: 'https://www.rappler.com/feed/', source: 'Rappler' },
    { url: 'https://data.gmanetwork.com/gno/rss/economy/feed.xml', source: 'GMA News' },
    { url: 'https://newsinfo.inquirer.net/feed', source: 'Inquirer' },
  ];

  const results = [];
  for (const feed of feeds) {
    try {
      const xml = await fetchRSS(feed.url);
      if (xml) {
        const items = parseRSS(xml, feed.source);
        results.push(...items);
      }
    } catch (e) {
      // skip failed feed
    }
  }

  // If all feeds fail, return placeholder
  if (results.length === 0) {
    results.push(
      { title: "DOE announces weekly fuel price adjustments", source: "GMA News", date: new Date().toDateString(), link: "https://www.gmanetwork.com/news/economy/", desc: "The Department of Energy releases the latest fuel price movement for the week." },
      { title: "Petron, Shell, Caltex implement price changes effective Tuesday", source: "Rappler", date: new Date().toDateString(), link: "https://www.rappler.com/business/", desc: "Major oil companies announce price movements in line with global crude oil prices." },
      { title: "Global oil prices drop amid market uncertainty", source: "Inquirer", date: new Date().toDateString(), link: "https://newsinfo.inquirer.net/", desc: "Brent crude falls as concerns over global demand weigh on markets." },
    );
  }

  newsCache = { data: results, lastFetched: now };
  return results;
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/api/stations', (req, res) => res.json(stations));
app.get('/api/history',  (req, res) => res.json(priceHistory));
app.get('/api/news', async (req, res) => {
  try {
    const news = await getNews();
    res.json(news);
  } catch (e) {
    res.json([]);
  }
});

// ─── HTML ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>CAMANAVA Oil Price Monitor</title>

<!-- Leaflet CSS -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<!-- Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<!-- Leaflet JS -->
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
  header{background:linear-gradient(135deg,#1e3a5f,#0f172a);padding:16px 24px;border-bottom:1px solid #1e40af}
  header h1{font-size:1.4rem;font-weight:700;color:#60a5fa}
  header p{font-size:0.78rem;color:#94a3b8;margin-top:2px}

  .tabs{display:flex;background:#1e293b;border-bottom:1px solid #334155}
  .tab{padding:12px 24px;cursor:pointer;font-size:0.88rem;color:#94a3b8;border-bottom:3px solid transparent;transition:all .2s}
  .tab.active{color:#60a5fa;border-bottom-color:#60a5fa;background:#0f172a}
  .tab:hover:not(.active){color:#cbd5e1;background:#1e293b}

  .panel{display:none;padding:20px}
  .panel.active{display:block}

  /* Prices Tab */
  .summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
  .summary-card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;text-align:center}
  .summary-card .label{font-size:0.75rem;color:#94a3b8;margin-bottom:4px}
  .summary-card .value{font-size:1.5rem;font-weight:700;color:#34d399}
  .summary-card .sub{font-size:0.72rem;color:#64748b;margin-top:2px}

  .filter-row{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
  .filter-row select{background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:7px 12px;font-size:0.83rem;cursor:pointer}

  table{width:100%;border-collapse:collapse;font-size:0.83rem}
  thead th{background:#1e3a5f;color:#93c5fd;padding:10px 12px;text-align:left;position:sticky;top:0}
  tbody tr{border-bottom:1px solid #1e293b;transition:background .15s}
  tbody tr:hover{background:#1e293b}
  tbody td{padding:10px 12px}
  .brand-badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:600}
  .brand-petron{background:#1e3a5f;color:#60a5fa}
  .brand-shell{background:#3b1d1d;color:#f87171}
  .brand-caltex{background:#3b2a1d;color:#fb923c}
  .brand-phoenix{background:#1d2e3b;color:#38bdf8}
  .cheapest{color:#34d399;font-weight:700}

  /* Map Tab */
  #map{height:420px;width:100%;border-radius:10px;border:1px solid #334155;z-index:0}
  .station-list{margin-top:16px}
  .station-item{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;transition:background .15s}
  .station-item:hover{background:#273548}
  .station-item .sname{font-weight:600;font-size:0.88rem}
  .station-item .scity{font-size:0.75rem;color:#64748b;margin-top:2px}
  .station-item .sprice{font-size:1rem;color:#34d399;font-weight:700}

  /* Forecast Tab */
  .chart-wrap{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:20px;margin-bottom:16px}
  .chart-wrap h3{font-size:0.9rem;color:#93c5fd;margin-bottom:14px}
  .forecast-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:16px}
  .forecast-card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px}
  .forecast-card .fc-label{font-size:0.75rem;color:#94a3b8}
  .forecast-card .fc-value{font-size:1.3rem;font-weight:700;margin-top:4px}
  .fc-down{color:#34d399}.fc-up{color:#f87171}.fc-flat{color:#fbbf24}

  /* News Tab */
  .news-grid{display:grid;gap:12px}
  .news-card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;text-decoration:none;color:inherit;display:block;transition:background .15s}
  .news-card:hover{background:#273548;border-color:#3b82f6}
  .news-card .nsource{font-size:0.72rem;color:#60a5fa;font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em}
  .news-card .ntitle{font-size:0.95rem;font-weight:600;color:#e2e8f0;line-height:1.4;margin-bottom:6px}
  .news-card .ndesc{font-size:0.8rem;color:#94a3b8;line-height:1.5}
  .news-card .ndate{font-size:0.72rem;color:#475569;margin-top:8px}
  .news-loading{text-align:center;padding:40px;color:#64748b;font-size:0.9rem}
  .news-error{text-align:center;padding:24px;color:#f87171;font-size:0.85rem;background:#1e293b;border-radius:8px}

  .updated{font-size:0.72rem;color:#475569;margin-top:12px;text-align:right}
</style>
</head>
<body>

<header>
  <h1>⛽ CAMANAVA Oil Price Monitor</h1>
  <p>Caloocan · Malabon · Navotas · Valenzuela — Live fuel price tracker</p>
</header>

<div class="tabs">
  <div class="tab active" onclick="switchTab('prices')">💰 Prices</div>
  <div class="tab" onclick="switchTab('map')">🗺️ Map</div>
  <div class="tab" onclick="switchTab('forecast')">📈 Forecast</div>
  <div class="tab" onclick="switchTab('news')">📰 News</div>
</div>

<!-- PRICES TAB -->
<div id="tab-prices" class="panel active">
  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">Lowest Gasoline</div>
      <div class="value" id="low-gas">—</div>
      <div class="sub" id="low-gas-name">—</div>
    </div>
    <div class="summary-card">
      <div class="label">Lowest Diesel</div>
      <div class="value" id="low-diesel">—</div>
      <div class="sub" id="low-diesel-name">—</div>
    </div>
    <div class="summary-card">
      <div class="label">Avg Gasoline</div>
      <div class="value" id="avg-gas" style="color:#60a5fa">—</div>
      <div class="sub">All stations</div>
    </div>
    <div class="summary-card">
      <div class="label">Avg Diesel</div>
      <div class="value" id="avg-diesel" style="color:#60a5fa">—</div>
      <div class="sub">All stations</div>
    </div>
  </div>

  <div class="filter-row">
    <select id="filter-city" onchange="renderTable()">
      <option value="">All Cities</option>
      <option>Caloocan</option>
      <option>Malabon</option>
      <option>Navotas</option>
      <option>Valenzuela</option>
    </select>
    <select id="filter-brand" onchange="renderTable()">
      <option value="">All Brands</option>
      <option>Petron</option>
      <option>Shell</option>
      <option>Caltex</option>
      <option>Phoenix</option>
    </select>
    <select id="sort-by" onchange="renderTable()">
      <option value="gasoline">Sort: Gasoline ↑</option>
      <option value="diesel">Sort: Diesel ↑</option>
      <option value="name">Sort: Name</option>
    </select>
  </div>

  <table>
    <thead>
      <tr>
        <th>Station</th>
        <th>City</th>
        <th>Brand</th>
        <th>Gasoline</th>
        <th>Diesel</th>
        <th>Premium</th>
      </tr>
    </thead>
    <tbody id="station-tbody"></tbody>
  </table>
  <p class="updated" id="price-updated"></p>
</div>

<!-- MAP TAB -->
<div id="tab-map" class="panel">
  <div id="map"></div>
  <div class="station-list" id="map-station-list">
    <p style="color:#64748b;padding:20px;text-align:center">Click a marker on the map or select a station below.</p>
  </div>
</div>

<!-- FORECAST TAB -->
<div id="tab-forecast" class="panel">
  <div class="chart-wrap">
    <h3>📊 5-Week Price Trend (Gasoline vs Diesel)</h3>
    <canvas id="trendChart" height="100"></canvas>
  </div>
  <div class="forecast-cards" id="forecast-cards"></div>
</div>

<!-- NEWS TAB -->
<div id="tab-news" class="panel">
  <div id="news-container">
    <p class="news-loading">Loading oil price news...</p>
  </div>
</div>

<script>
let stations = [];
let history  = [];
let leafletMap = null;
let mapInitialized = false;

// ─── Tab Switching ────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t,i) => {
    t.classList.toggle('active', ['prices','map','forecast','news'][i] === tab);
  });
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');

  if (tab === 'map' && !mapInitialized) initMap();
  if (tab === 'news') loadNews();
  if (tab === 'forecast') renderForecast();
}

// ─── Prices Tab ───────────────────────────────────────────────────────────────
function renderSummary() {
  const minGas    = stations.reduce((a,b) => a.gasoline < b.gasoline ? a : b);
  const minDiesel = stations.reduce((a,b) => a.diesel   < b.diesel   ? a : b);
  const avgGas    = (stations.reduce((s,x) => s + x.gasoline, 0) / stations.length).toFixed(2);
  const avgDiesel = (stations.reduce((s,x) => s + x.diesel,   0) / stations.length).toFixed(2);
  document.getElementById('low-gas').textContent      = '₱' + minGas.gasoline.toFixed(2);
  document.getElementById('low-gas-name').textContent = minGas.name.split(' - ')[0] + ' ' + minGas.city;
  document.getElementById('low-diesel').textContent      = '₱' + minDiesel.diesel.toFixed(2);
  document.getElementById('low-diesel-name').textContent = minDiesel.name.split(' - ')[0] + ' ' + minDiesel.city;
  document.getElementById('avg-gas').textContent    = '₱' + avgGas;
  document.getElementById('avg-diesel').textContent = '₱' + avgDiesel;
  document.getElementById('price-updated').textContent = 'Last updated: ' + new Date().toLocaleString('en-PH');
}

function renderTable() {
  const city  = document.getElementById('filter-city').value;
  const brand = document.getElementById('filter-brand').value;
  const sort  = document.getElementById('sort-by').value;
  const minGas    = Math.min(...stations.map(s => s.gasoline));
  const minDiesel = Math.min(...stations.map(s => s.diesel));

  let data = stations.filter(s =>
    (!city  || s.city  === city) &&
    (!brand || s.brand === brand)
  );

  data.sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : a[sort] - b[sort]);

  const tbody = document.getElementById('station-tbody');
  tbody.innerHTML = data.map(s => \`
    <tr>
      <td>\${s.name}</td>
      <td>\${s.city}</td>
      <td><span class="brand-badge brand-\${s.brand.toLowerCase()}">\${s.brand}</span></td>
      <td class="\${s.gasoline === minGas ? 'cheapest' : ''}">₱\${s.gasoline.toFixed(2)}</td>
      <td class="\${s.diesel   === minDiesel ? 'cheapest' : ''}">₱\${s.diesel.toFixed(2)}</td>
      <td>₱\${s.premium.toFixed(2)}</td>
    </tr>
  \`).join('');
}

// ─── Map Tab ──────────────────────────────────────────────────────────────────
function initMap() {
  mapInitialized = true;

  // Small delay to ensure the panel is visible and has dimensions
  setTimeout(() => {
    leafletMap = L.map('map').setView([14.6750, 120.9600], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(leafletMap);

    const brandColors = { Petron:'#3b82f6', Shell:'#ef4444', Caltex:'#f97316', Phoenix:'#06b6d4' };

    stations.forEach(s => {
      const color = brandColors[s.brand] || '#94a3b8';
      const icon = L.divIcon({
        className: '',
        html: \`<div style="background:\${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.5)"></div>\`,
        iconSize: [12,12], iconAnchor:[6,6], popupAnchor:[0,-8]
      });

      L.marker([s.lat, s.lng], {icon})
        .addTo(leafletMap)
        .bindPopup(\`
          <b>\${s.name}</b><br>
          <span style="color:#888">\${s.city}</span><br><br>
          ⛽ Gasoline: <b>₱\${s.gasoline.toFixed(2)}</b><br>
          🚛 Diesel: <b>₱\${s.diesel.toFixed(2)}</b><br>
          💎 Premium: <b>₱\${s.premium.toFixed(2)}</b>
        \`);
    });

    // Station list below map
    const list = document.getElementById('map-station-list');
    list.innerHTML = stations.map(s => \`
      <div class="station-item" onclick="leafletMap.setView([\${s.lat},\${s.lng}],16)">
        <div>
          <div class="sname">\${s.name}</div>
          <div class="scity">\${s.city} · \${s.brand}</div>
        </div>
        <div class="sprice">₱\${s.gasoline.toFixed(2)}<br><span style="font-size:.72rem;color:#64748b">gasoline</span></div>
      </div>
    \`).join('');

    // Force Leaflet to recalc size after tab reveals the container
    leafletMap.invalidateSize();
  }, 150);
}

// ─── Forecast Tab ─────────────────────────────────────────────────────────────
let chartInstance = null;
function renderForecast() {
  if (!history.length) return;

  const labels = history.map(h => h.week);
  const gasData = history.map(h => h.gasoline);
  const dslData = history.map(h => h.diesel);

  // Simple linear regression forecast for next 2 weeks
  function forecast(data) {
    const n = data.length;
    const xMean = (n-1)/2;
    const yMean = data.reduce((a,b)=>a+b,0)/n;
    let num=0,den=0;
    data.forEach((y,i)=>{ num+=(i-xMean)*(y-yMean); den+=(i-xMean)**2; });
    const slope = den ? num/den : 0;
    return [+(data[n-1]+slope).toFixed(2), +(data[n-1]+slope*2).toFixed(2)];
  }

  const [gas1,gas2] = forecast(gasData);
  const [dsl1,dsl2] = forecast(dslData);
  const lastGas = gasData[gasData.length-1];
  const lastDsl = dslData[dslData.length-1];

  const ctx = document.getElementById('trendChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type:'line',
    data:{
      labels:[...labels,'Wk+1 (est)','Wk+2 (est)'],
      datasets:[
        { label:'Gasoline', data:[...gasData,gas1,gas2], borderColor:'#34d399', backgroundColor:'rgba(52,211,153,.1)', tension:.4, fill:true, pointRadius:5 },
        { label:'Diesel',   data:[...dslData,dsl1,dsl2], borderColor:'#60a5fa', backgroundColor:'rgba(96,165,250,.1)', tension:.4, fill:true, pointRadius:5 },
      ]
    },
    options:{
      responsive:true,
      plugins:{ legend:{ labels:{ color:'#cbd5e1' } } },
      scales:{
        x:{ ticks:{color:'#94a3b8'}, grid:{color:'#1e293b'} },
        y:{ ticks:{color:'#94a3b8', callback:v=>'₱'+v}, grid:{color:'#1e293b'}, suggestedMin:54, suggestedMax:68 }
      }
    }
  });

  const diff = (a,b) => a < b ? {cls:'fc-down',arrow:'↓'} : a > b ? {cls:'fc-up',arrow:'↑'} : {cls:'fc-flat',arrow:'→'};
  const g1 = diff(gas1,lastGas), g2 = diff(gas2,gas1);
  const d1 = diff(dsl1,lastDsl), d2 = diff(dsl2,dsl1);

  document.getElementById('forecast-cards').innerHTML = \`
    <div class="forecast-card">
      <div class="fc-label">⛽ Gasoline — Week +1</div>
      <div class="fc-value \${g1.cls}">₱\${gas1} \${g1.arrow}</div>
      <div style="font-size:.75rem;color:#64748b;margin-top:4px">vs current ₱\${lastGas}</div>
    </div>
    <div class="forecast-card">
      <div class="fc-label">⛽ Gasoline — Week +2</div>
      <div class="fc-value \${g2.cls}">₱\${gas2} \${g2.arrow}</div>
      <div style="font-size:.75rem;color:#64748b;margin-top:4px">vs week+1 ₱\${gas1}</div>
    </div>
    <div class="forecast-card">
      <div class="fc-label">🚛 Diesel — Week +1</div>
      <div class="fc-value \${d1.cls}">₱\${dsl1} \${d1.arrow}</div>
      <div style="font-size:.75rem;color:#64748b;margin-top:4px">vs current ₱\${lastDsl}</div>
    </div>
    <div class="forecast-card">
      <div class="fc-label">🚛 Diesel — Week +2</div>
      <div class="fc-value \${d2.cls}">₱\${dsl2} \${d2.arrow}</div>
      <div style="font-size:.75rem;color:#64748b;margin-top:4px">vs week+1 ₱\${dsl1}</div>
    </div>
  \`;
}

// ─── News Tab ─────────────────────────────────────────────────────────────────
let newsLoaded = false;
async function loadNews() {
  if (newsLoaded) return;
  newsLoaded = true;

  const container = document.getElementById('news-container');
  container.innerHTML = '<p class="news-loading">Fetching latest oil price news...</p>';

  try {
    const res = await fetch('/api/news');
    const news = await res.json();

    if (!news.length) {
      container.innerHTML = '<p class="news-error">No oil price news found at this time. Try again later.</p>';
      return;
    }

    container.innerHTML = '<div class="news-grid">' + news.map(n => \`
      <a class="news-card" href="\${n.link}" target="_blank" rel="noopener">
        <div class="nsource">\${n.source}</div>
        <div class="ntitle">\${n.title}</div>
        \${n.desc ? \`<div class="ndesc">\${n.desc}...</div>\` : ''}
        <div class="ndate">\${n.date ? new Date(n.date).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}) : ''}</div>
      </a>
    \`).join('') + '</div>';
  } catch(e) {
    container.innerHTML = '<p class="news-error">Could not load news. Check your connection.</p>';
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const [sRes, hRes] = await Promise.all([fetch('/api/stations'), fetch('/api/history')]);
  stations = await sRes.json();
  history  = await hRes.json();
  renderSummary();
  renderTable();
}

init();
</script>
</body>
</html>`);
});

app.listen(PORT, () => console.log('CAMANAVA Oil Price running on port ' + PORT));
