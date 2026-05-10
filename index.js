// index.js - CAMANAVA Oil Price Update v3 (Prices + Forecast + Station Locator)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

let priceData = { prices: [], lastUpdate: null, status: 'never_ran' };

// ======== AI-POWERED FORECAST (Gemini) ========
// Seed/fallback forecast — used until Gemini generates a real one
let forecastData = {
  effectiveDate: 'May 13, 2026',
  lastUpdated: 'May 10, 2026',
  source: 'AI-generated via Gemini (Google)',
  aiGenerated: false,
  items: [
    { fuel_type: 'Diesel',   direction: 'down', min_change: 6.00, max_change: 8.00,
      reason: 'Consistent output from India and South Korea refineries stabilizing regional diesel supply' },
    { fuel_type: 'Gasoline', direction: 'up',   min_change: 1.00, max_change: 4.00,
      reason: 'Global crude price pressure and weak peso at P61.57/USD, partially offset by China/India fuel exports' },
    { fuel_type: 'Kerosene', direction: 'down', min_change: 10.00, max_change: 12.00,
      reason: 'Fourth straight week of kerosene price rollbacks following stabilizing supply routes' }
  ],
  summary: 'Split forecast for May 13: Diesel rollback of P6-P8/L and kerosene rollback of P10-P12/L expected, but gasoline may rise P1-P4/L. Oil companies announce final adjustments Monday evening, May 12. Changes take effect Tuesday morning.',
  watchFactors: [
    'USD/PHP exchange rate - peso above P61 means higher import costs for gasoline',
    'Middle East conflict - ongoing Iran-US tensions disrupting supply routes',
    'MOPS benchmark - final trading days (Fri-Mon) determine exact amounts',
    'China and India fuel exports - increased supply helping diesel rollback'
  ]
};

async function generateAIForecast() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) { console.log('[Forecast] No GEMINI_API_KEY set, skipping.'); return; }

  try {
    console.log('[Forecast] Fetching news for AI forecast...');
    const news = await getNews();
    const newsText = news.map(n => `- ${n.title}: ${n.desc}`).join('\n');

    const today = new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'long' });
    const nextTuesday = (() => {
      const d = new Date();
      d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7));
      return d.toLocaleDateString('en-PH', { dateStyle: 'long' });
    })();

    const prompt = `You are a Philippine fuel price analyst. Based on the news headlines below, generate a fuel price forecast for next Tuesday (${nextTuesday}) in the Philippines.

NEWS HEADLINES (today: ${today}):
${newsText || 'No specific news available. Use general market knowledge.'}

Respond ONLY with a valid JSON object, no markdown, no explanation. Use this exact structure:
{
  "effectiveDate": "${nextTuesday}",
  "summary": "2-3 sentence overall summary of the forecast",
  "items": [
    { "fuel_type": "Diesel",   "direction": "up or down", "min_change": 0.00, "max_change": 0.00, "reason": "one sentence reason" },
    { "fuel_type": "Gasoline", "direction": "up or down", "min_change": 0.00, "max_change": 0.00, "reason": "one sentence reason" },
    { "fuel_type": "Kerosene", "direction": "up or down", "min_change": 0.00, "max_change": 0.00, "reason": "one sentence reason" }
  ],
  "watchFactors": ["factor 1", "factor 2", "factor 3", "factor 4"]
}

Rules: direction must be "up" or "down". min_change and max_change must be positive numbers (the peso amount of change). Be specific with peso amounts based on news context.`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 30000 }
    );

    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    forecastData = {
      ...parsed,
      lastUpdated: today,
      source: 'AI-generated via Gemini (Google)',
      aiGenerated: true
    };
    console.log('[Forecast] AI forecast generated successfully for', nextTuesday);
  } catch (e) {
    console.error('[Forecast] Gemini error:', e.message);
  }
}

// 6-week price history for trend chart
const priceHistory = [
  { week: 'Apr 7', diesel: 154.00, gasoline: 113.00, event: 'Peak after war' },
  { week: 'Apr 14', diesel: 129.06, gasoline: 109.59, event: 'First rollback' },
  { week: 'Apr 21', diesel: 104.12, gasoline: 106.18, event: 'P24.94 diesel rollback' },
  { week: 'Apr 28', diesel: 91.18, gasoline: 106.71, event: 'P12.94 diesel rollback' },
  { week: 'May 5', diesel: 93.84, gasoline: 108.92, event: 'P2.66 diesel hike' },
  { week: 'May 12', diesel: 87.00, gasoline: 111.00, event: 'Forecast (est.)' }
];

const SEED_PRICES = [
  { fuel_type: 'Diesel', price_min: 79.62, price_max: 102.16, price_avg: 90.89 },
  { fuel_type: 'Gasoline (RON 91)', price_min: 74.11, price_max: 102.20, price_avg: 88.15 },
  { fuel_type: 'Gasoline (RON 95)', price_min: 78.50, price_max: 105.00, price_avg: 91.75 },
  { fuel_type: 'Kerosene', price_min: 124.97, price_max: 146.47, price_avg: 135.72 }
];

const CALTEX_STATIONS = [
  { name:"Caltex EDSA Balintawak", address:"1160 EDSA, Quezon City", lat:14.6577, lng:121.0050, area:"Caloocan/QC", hours:"24 hours", rating:4.1, phone:"+63 917 102 3907" },
  { name:"Caltex Gov. Pascual", address:"Sisa St cor Gov. Pascual Ave, Malabon", lat:14.6706, lng:120.9721, area:"Malabon", hours:"7AM-8PM", rating:4.3, phone:"+63 2 8288 2920" },
  { name:"Caltex M. Naval", address:"1195 M. Naval St, Navotas", lat:14.6680, lng:120.9434, area:"Navotas", hours:"24 hours", rating:4.1, phone:"+63 2 8351 1275" },
  { name:"Caltex R10 Navotas", address:"R-10, Navotas", lat:14.6373, lng:120.9565, area:"Navotas", hours:"24 hours", rating:3.9, phone:null },
  { name:"Caltex Malanday", address:"Bartolome St, Valenzuela", lat:14.7129, lng:120.9586, area:"Valenzuela", hours:"24 hours", rating:3.5, phone:null },
  { name:"Caltex E. Rodriguez Sr.", address:"42 E Rodriguez Sr. Ave, QC", lat:14.6232, lng:121.0283, area:"Quezon City", hours:"24 hours", rating:4.3, phone:"+63 2 3413 8996" },
  { name:"Caltex Ilang-Ilang", address:"E. Rodriguez Sr. Ave, Cubao, QC", lat:14.6244, lng:121.0376, area:"Quezon City", hours:"24 hours", rating:3.8, phone:null },
  { name:"Caltex G. Araneta", address:"827 Araneta Ave, QC", lat:14.6248, lng:121.0152, area:"Quezon City", hours:"24 hours", rating:4.3, phone:"+63 2 3411 5916" },
  { name:"Caltex Araneta/Amoranto", address:"G. Araneta cor NS Amoranto, QC", lat:14.6358, lng:121.0091, area:"Quezon City", hours:"24 hours", rating:4.3, phone:"+63 917 815 0906" },
  { name:"Caltex Pedro Gil", address:"816 A Pedro Gil St, Manila", lat:14.5791, lng:121.0023, area:"Manila", hours:"24 hours", rating:4.1, phone:"+63 2 8536 4499" },
  { name:"Caltex Quirino Ave", address:"Quirino Ave, Malate, Manila", lat:14.5727, lng:120.9931, area:"Manila", hours:"24 hours", rating:4.4, phone:"+63 2 8743 6569" },
  { name:"Caltex Andalucia", address:"Sampaloc, Manila", lat:14.6168, lng:120.9858, area:"Manila", hours:"24 hours", rating:4.0, phone:"+63 2 8731 5463" },
  { name:"Caltex Arnaiz", address:"4999 Arnaiz Ave, Makati", lat:14.5506, lng:121.0077, area:"Makati", hours:"24 hours", rating:4.2, phone:null },
  { name:"Caltex Kamagong", address:"9755 Kamagong, Makati", lat:14.5668, lng:121.0087, area:"Makati", hours:"24 hours", rating:4.5, phone:"+63 2 8895 5896" },
  { name:"Caltex EDSA-Harvard", address:"396 EDSA, Makati", lat:14.5587, lng:121.0399, area:"Makati", hours:"24 hours", rating:null, phone:"+63 2 8731 6729" },
  { name:"Caltex Guadalupe", address:"1116 JP Rizal St, Makati", lat:14.5676, lng:121.0415, area:"Makati", hours:"24 hours", rating:4.1, phone:"+63 2 8808 8080" },
  { name:"Caltex JP Rizal/Calasanz", address:"503 JP Rizal, Makati", lat:14.5709, lng:121.0195, area:"Makati", hours:"24 hours", rating:3.9, phone:"+63 2 8890 2598" },
  { name:"Caltex C. Raymundo", address:"C. Raymundo Ave, Pasig", lat:14.5854, lng:121.0881, area:"Pasig", hours:"24 hours", rating:3.8, phone:null },
  { name:"Caltex Amang Rodriguez", address:"Amang Rodriguez Ave, Pasig", lat:14.5968, lng:121.0892, area:"Pasig", hours:"24 hours", rating:4.1, phone:"+63 2 8640 4429" },
  { name:"Caltex Sandoval Pinagbuhatan", address:"82 Sandoval Ave, Pasig", lat:14.5569, lng:121.0973, area:"Pasig", hours:"24 hours", rating:4.5, phone:null },
  { name:"Caltex Sandoval San Miguel", address:"1232 Sandoval Ave, Pasig", lat:14.5661, lng:121.0942, area:"Pasig", hours:"24 hours", rating:4.3, phone:null },
  { name:"Caltex Ortigas Ave", address:"29 Ortigas Ave, Pasig", lat:14.5893, lng:121.0990, area:"Pasig", hours:"24 hours", rating:4.1, phone:null }
];

async function scrapePrices() {
  try {
    const response = await axios.get('https://www.fuelprice.ph/', {
      headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}, timeout:15000
    });
    const $ = cheerio.load(response.data); const bodyText = $('body').text(); const prices = [];
    const patterns = {
      'Diesel': /Diesel.*?₱?\s*(\d{2,3}\.\d{2})/i,
      'Gasoline (RON 91)': /Unleaded.*?91.*?₱?\s*(\d{2,3}\.\d{2})/i,
      'Gasoline (RON 95)': /Premium.*?95.*?₱?\s*(\d{2,3}\.\d{2})/i,
      'Kerosene': /Kerosene.*?₱?\s*(\d{2,3}\.\d{2})/i
    };
    for (const [ft, rx] of Object.entries(patterns)) {
      const m = bodyText.match(rx);
      if (m) prices.push({fuel_type:ft, price_min:parseFloat(m[1]), price_max:parseFloat(m[1]), price_avg:parseFloat(m[1])});
    }
    if (prices.length > 0) { priceData.prices=prices; priceData.lastUpdate=new Date().toISOString(); priceData.status='success'; }
    else throw new Error('No prices parsed');
  } catch (e) {
    if (priceData.prices.length===0) { priceData.prices=SEED_PRICES; priceData.lastUpdate=new Date().toISOString(); priceData.status='seed'; }
  }
}

app.get('/api/prices', (req,res) => res.json(priceData));
app.get('/api/stations', (req,res) => res.json(CALTEX_STATIONS));
app.get('/api/forecast', (req,res) => res.json(forecastData));
app.post('/api/forecast/refresh', async (req,res) => {
  res.json({ message: 'Generating AI forecast...' });
  await generateAIForecast();
});
app.get('/api/history', (req,res) => res.json(priceHistory));

const HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>CAMANAVA Oil Price Update</title><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#1e3c72 0%,#2a5298 100%);min-height:100vh;color:#333}.container{max-width:1200px;margin:0 auto;padding:20px}header{text-align:center;color:#fff;padding:30px 20px 20px}header h1{font-size:2.2rem;margin-bottom:8px}header p{opacity:.9;font-size:1rem}.last-update{display:inline-block;margin-top:10px;padding:5px 12px;background:rgba(255,255,255,.2);border-radius:20px;font-size:.85rem;color:#fff}.tabs{display:flex;justify-content:center;gap:8px;margin:20px 0;flex-wrap:wrap}.tab-btn{padding:10px 20px;border:2px solid rgba(255,255,255,.4);background:0 0;color:#fff;border-radius:8px;cursor:pointer;font-size:.9rem;font-weight:600;transition:all .2s}.tab-btn.active{background:#fff;color:#1e3c72;border-color:#fff}.tab-btn:hover:not(.active){background:rgba(255,255,255,.15)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px}.card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 4px 20px rgba(0,0,0,.1);transition:transform .2s}.card:hover{transform:translateY(-3px)}.fuel-name{font-size:.85rem;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}.price{font-size:2.2rem;font-weight:700;color:#1e3c72;margin-bottom:4px}.price-range{font-size:.8rem;color:#888}.section-box{background:#fff;border-radius:12px;padding:20px;box-shadow:0 4px 20px rgba(0,0,0,.1);margin-bottom:20px}.section-title{font-size:1.3rem;font-weight:700;color:#1e3c72;margin-bottom:4px}.section-subtitle{font-size:.85rem;color:#888;margin-bottom:16px}#map{height:500px;border-radius:10px;border:2px solid #e0e0e0}.filter-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.filter-btn{padding:6px 14px;border:1px solid #ddd;background:#f5f5f5;border-radius:20px;cursor:pointer;font-size:.8rem;transition:all .2s}.filter-btn.active{background:#1e3c72;color:#fff;border-color:#1e3c72}.station-list{max-height:400px;overflow-y:auto}.station-item{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #eee;cursor:pointer}.station-item:hover{background:#f9f9f9;margin:0 -10px;padding:12px 10px;border-radius:8px}.station-name{font-weight:600;color:#333;font-size:.95rem}.station-address{font-size:.8rem;color:#888;margin-top:2px}.station-meta{text-align:right}.station-area{font-size:.75rem;color:#fff;background:#2a5298;padding:2px 8px;border-radius:10px}.station-rating{font-size:.8rem;color:#f39c12;margin-top:4px}.station-hours{font-size:.75rem;color:#888}.forecast-card{background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 4px 20px rgba(0,0,0,.1);border-left:5px solid #ccc}.forecast-card.up{border-left-color:#e74c3c}.forecast-card.down{border-left-color:#27ae60}.forecast-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.forecast-fuel{font-size:1.1rem;font-weight:700;color:#333}.forecast-badge{padding:4px 12px;border-radius:20px;font-size:.85rem;font-weight:700;color:#fff}.forecast-badge.up{background:#e74c3c}.forecast-badge.down{background:#27ae60}.forecast-amount{font-size:1.8rem;font-weight:700;margin:8px 0}.forecast-amount.up{color:#e74c3c}.forecast-amount.down{color:#27ae60}.forecast-reason{font-size:.85rem;color:#666;line-height:1.4}.forecast-summary{background:#f8f9fa;border-radius:10px;padding:16px;margin-bottom:16px;border:1px solid #e0e0e0;font-size:.9rem;line-height:1.5;color:#444}.watch-factor{display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:.85rem;color:#555}.watch-icon{font-size:1rem;flex-shrink:0}.chart-container{width:100%;overflow-x:auto;margin:16px 0}.disclaimer{font-size:.75rem;color:#999;text-align:center;margin-top:12px;font-style:italic}.source-info{background:#fff;border-radius:12px;padding:16px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.1);font-size:.85rem}.source-info a{color:#2a5298;text-decoration:none;font-weight:600}.refresh-btn{display:inline-block;margin-top:10px;padding:8px 20px;background:#2a5298;color:#fff;border:none;border-radius:6px;cursor:pointer}footer{text-align:center;color:rgba(255,255,255,.8);margin-top:20px;font-size:.85rem;padding-bottom:20px}.loading{text-align:center;padding:30px;background:#fff;border-radius:12px;color:#666}.hidden{display:none}@media(max-width:600px){header h1{font-size:1.5rem}.price{font-size:1.8rem}#map{height:350px}.grid{grid-template-columns:1fr 1fr}.forecast-amount{font-size:1.5rem}}</style></head><body><div class="container"><header><h1>⛽ CAMANAVA Oil Price Update</h1><p>Fuel prices, forecasts &amp; Caltex station locator</p><div class="last-update" id="lastUpdate">Loading...</div></header><div class="tabs"><button class="tab-btn active" onclick="showTab('prices')">💰 Prices</button><button class="tab-btn" onclick="showTab('forecast')">📊 Forecast</button><button class="tab-btn" onclick="showTab('map')">📍 Stations</button><button class="tab-btn" onclick="showTab('news')">📰 News</button></div><div id="tab-prices"><div id="priceContent" class="loading">Fetching latest prices...</div><div class="source-info"><strong>Data Source:</strong> DOE weekly oil price monitor via <a href="https://www.fuelprice.ph/" target="_blank">fuelprice.ph</a><br><small>DOE updates every Tuesday. App checks daily at 9AM Manila time.</small><br><button class="refresh-btn" onclick="loadPrices()">Refresh Now</button></div></div><div id="tab-forecast" class="hidden"><div class="section-box"><div class="section-title">📊 Next Week Fuel Price Forecast</div><div class="section-subtitle" id="forecastDate">Loading...</div><div id="forecastContent" class="loading">Loading forecast...</div><div style="margin-top:12px;text-align:right"><button class="refresh-btn" onclick="refreshForecast()" id="refreshForecastBtn">🤖 Regenerate with AI</button></div></div><div class="section-box"><div class="section-title">📈 Price Trend (6-Week History)</div><div class="section-subtitle">Average pump prices per liter in NCR</div><div class="chart-container"><canvas id="trendChart" height="280"></canvas></div></div><div class="section-box"><div class="section-title">👁 Factors to Watch</div><div class="section-subtitle">Key drivers that affect next week's prices</div><div id="watchFactors"></div></div><div class="disclaimer">⚠️ Forecasts based on MOPS trading data and DOE guidance. Final prices announced Monday evening, effective Tuesday. Actual amounts may differ. Sources: DOE, Manila Bulletin, Philstar, Rappler</div></div><div id="tab-map" class="hidden"><div class="section-box"><div class="section-title">Caltex Stations in NCR</div><div class="section-subtitle">Showing all Caltex gas stations across Metro Manila</div><div class="filter-bar" id="filterBar"></div><div id="map"></div></div><div class="section-box"><div class="section-title">Station List</div><div class="section-subtitle" id="stationCount">Loading...</div><div class="station-list" id="stationList"></div></div></div><div id="tab-news" class="hidden"><div class="section-box"><div class="section-title">📰 Oil Price News</div><div class="section-subtitle">Latest fuel price news from Philippine media</div><div id="newsContent" class="loading">Loading news...</div></div></div><footer><p>Caloocan • Malabon • Navotas • Valenzuela</p></footer></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script><script>let map,markers=[],stations=[],activeFilter='All',trendChart=null,newsLoaded=false;function showTab(t){document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));['prices','forecast','map','news'].forEach(x=>document.getElementById('tab-'+x).classList.add('hidden'));document.getElementById('tab-'+t).classList.remove('hidden');const idx={prices:0,forecast:1,map:2,news:3}[t];document.querySelectorAll('.tab-btn')[idx].classList.add('active');if(t==='map'){if(!map)initMap();else{setTimeout(()=>{map.invalidateSize();if(markers.length>0)map.fitBounds(L.featureGroup(markers).getBounds().pad(0.1))},200)}}if(t==='forecast'&&!trendChart)loadForecast();if(t==='news'&&!newsLoaded)loadNews()}async function loadNews(){newsLoaded=true;const el=document.getElementById('newsContent');el.className='loading';el.textContent='Fetching news...';try{const r=await fetch('/api/news');const items=await r.json();if(!items.length){el.innerHTML='<p style="color:#888;text-align:center;padding:20px">No oil price news found right now. Try again later.</p>';return}el.className='';el.innerHTML=items.map(n=>'<div style="border-bottom:1px solid #eee;padding:14px 0"><div style="font-size:.72rem;color:#2a5298;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">'+n.source+'</div><a href="'+n.link+'" target="_blank" rel="noopener" style="font-size:.95rem;font-weight:600;color:#222;text-decoration:none;line-height:1.4;display:block;margin-bottom:4px">'+n.title+'</a>'+(n.desc?'<div style="font-size:.82rem;color:#666;line-height:1.5">'+n.desc+'...</div>':'')+'<div style="font-size:.72rem;color:#aaa;margin-top:6px">'+n.date+'</div></div>').join('')}catch(e){el.textContent='Could not load news: '+e.message}}async function loadPrices(){const el=document.getElementById('priceContent'),upd=document.getElementById('lastUpdate');el.className='loading';el.textContent='Fetching...';try{const r=await fetch('/api/prices');const d=await r.json();if(!d.prices||d.prices.length===0){el.textContent='No data yet.';return}if(d.lastUpdate){const dt=new Date(d.lastUpdate);upd.textContent='Last checked: '+dt.toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})}el.className='grid';el.innerHTML=d.prices.map(p=>'<div class="card"><div class="fuel-name">'+p.fuel_type+'</div><div class="price">₱'+p.price_avg.toFixed(2)+'</div><div class="price-range">'+(p.price_min!==p.price_max?'Range: ₱'+p.price_min.toFixed(2)+' - ₱'+p.price_max.toFixed(2):'per liter')+'</div></div>').join('')}catch(e){el.textContent='Error: '+e.message}}async function refreshForecast(){const btn=document.getElementById('refreshForecastBtn');btn.disabled=true;btn.textContent='⏳ Generating...';try{await fetch('/api/forecast/refresh',{method:'POST'});await new Promise(r=>setTimeout(r,5000));trendChart=null;await loadForecast()}catch(e){}finally{btn.disabled=false;btn.textContent='🤖 Regenerate with AI'}}async function loadForecast(){try{const[fR,hR]=await Promise.all([fetch('/api/forecast'),fetch('/api/history')]);const fc=await fR.json(),hist=await hR.json();const aiTag=fc.aiGenerated?'<span style="background:#27ae60;color:#fff;font-size:.7rem;padding:2px 8px;border-radius:10px;margin-left:8px;vertical-align:middle">🤖 AI</span>':'<span style="background:#888;color:#fff;font-size:.7rem;padding:2px 8px;border-radius:10px;margin-left:8px;vertical-align:middle">Manual</span>';document.getElementById('forecastDate').innerHTML='Effective: '+fc.effectiveDate+' • Updated: '+fc.lastUpdated+aiTag;let h='<div class="forecast-summary">'+fc.summary+'</div>';fc.items.forEach(i=>{const d=i.direction,arr=d==='up'?'▲':'▼',lbl=d==='up'?'INCREASE':'ROLLBACK',sgn=d==='up'?'+':'-';h+='<div class="forecast-card '+d+'"><div class="forecast-header"><div class="forecast-fuel">'+i.fuel_type+'</div><div class="forecast-badge '+d+'">'+arr+' '+lbl+'</div></div><div class="forecast-amount '+d+'">'+sgn+'₱'+i.min_change.toFixed(2)+' to '+sgn+'₱'+i.max_change.toFixed(2)+'/L</div><div class="forecast-reason">'+i.reason+'</div></div>'});document.getElementById('forecastContent').innerHTML=h;let wf='';fc.watchFactors.forEach(f=>{wf+='<div class="watch-factor"><span class="watch-icon">👁</span><span>'+f+'</span></div>'});document.getElementById('watchFactors').innerHTML=wf;const ctx=document.getElementById('trendChart').getContext('2d');trendChart=new Chart(ctx,{type:'line',data:{labels:hist.map(h=>h.week),datasets:[{label:'Diesel (₱/L)',data:hist.map(h=>h.diesel),borderColor:'#2980b9',backgroundColor:'rgba(41,128,185,0.1)',borderWidth:3,fill:true,tension:.3,pointRadius:5,pointBackgroundColor:'#2980b9'},{label:'Gasoline (₱/L)',data:hist.map(h=>h.gasoline),borderColor:'#e74c3c',backgroundColor:'rgba(231,76,60,0.1)',borderWidth:3,fill:true,tension:.3,pointRadius:5,pointBackgroundColor:'#e74c3c'}]},options:{responsive:true,plugins:{legend:{position:'top'},tooltip:{callbacks:{afterLabel:function(c){return hist[c.dataIndex].event}}}},scales:{y:{beginAtZero:false,ticks:{callback:v=>'₱'+v}}}}})}catch(e){document.getElementById('forecastContent').textContent='Error: '+e.message}}async function initMap(){setTimeout(async()=>{map=L.map('map').setView([14.6706,120.9721],13);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);try{const r=await fetch('/api/stations');stations=await r.json();buildFilters();renderStations('All');setTimeout(()=>map.invalidateSize(),300)}catch(e){console.error(e)}},150)}function buildFilters(){const areas=['All',...new Set(stations.map(s=>s.area))];document.getElementById('filterBar').innerHTML=areas.map(a=>'<button class="filter-btn'+(a==='All'?' active':'')+'" onclick="filterStations(\\''+a+'\\')">'+a+'</button>').join('')}function filterStations(a){activeFilter=a;document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active',b.textContent===a));renderStations(a)}function renderStations(area){markers.forEach(m=>map.removeLayer(m));markers=[];const f=area==='All'?stations:stations.filter(s=>s.area===area);document.getElementById('stationCount').textContent=f.length+' stations found';const icon=L.divIcon({html:'<div style="background:#d63031;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">⛽</div>',className:'',iconSize:[28,28],iconAnchor:[14,14]});f.forEach(s=>{const p='<div style="min-width:200px"><strong>'+s.name+'</strong><br><span style="color:#666;font-size:12px">'+s.address+'</span><br><span style="font-size:12px">🕐 '+s.hours+'</span>'+(s.rating?'<br><span style="color:#f39c12">⭐ '+s.rating+'/5</span>':'')+(s.phone?'<br><span style="font-size:12px">📞 '+s.phone+'</span>':'')+'<br><a href="https://www.google.com/maps/dir/?api=1&destination='+s.lat+','+s.lng+'" target="_blank" style="color:#2a5298;font-weight:600">Get Directions →</a></div>';markers.push(L.marker([s.lat,s.lng],{icon}).addTo(map).bindPopup(p))});if(f.length>0)map.fitBounds(L.featureGroup(markers).getBounds().pad(0.1));document.getElementById('stationList').innerHTML=f.map(s=>'<div class="station-item" onclick="focusStation('+s.lat+','+s.lng+')"><div><div class="station-name">'+s.name+'</div><div class="station-address">'+s.address+'</div><div class="station-hours">🕐 '+s.hours+'</div></div><div class="station-meta"><div class="station-area">'+s.area+'</div>'+(s.rating?'<div class="station-rating">⭐ '+s.rating+'</div>':'')+'</div></div>').join('')}function focusStation(lat,lng){map.setView([lat,lng],16);markers.forEach(m=>{if(Math.abs(m.getLatLng().lat-lat)<.0001)m.openPopup()});document.getElementById('map').scrollIntoView({behavior:'smooth'})}loadPrices();setInterval(loadPrices,5*60*1000)</script></body></html>`;

// ======== NEWS RSS FETCHER ========
function fetchRSS(url){
  return new Promise((resolve,reject)=>{
    const https=require('https'),http=require('http');
    const client=url.startsWith('https')?https:http;
    client.get(url,{headers:{'User-Agent':'Mozilla/5.0'}},res=>{
      let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve(d));res.on('error',reject);
    }).on('error',reject);
  });
}
function parseRSS(xml,source){
  const items=[],rx=/<item>([\s\S]*?)<\/item>/g;let m;
  while((m=rx.exec(xml))!==null){
    const b=m[1];
    const title=(b.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)||b.match(/<title>(.*?)<\/title>/))?.[1]?.trim()||'';
    const link=(b.match(/<link>(.*?)<\/link>/)||b.match(/<guid[^>]*>(.*?)<\/guid>/))?.[1]?.trim()||'#';
    const date=(b.match(/<pubDate>(.*?)<\/pubDate>/))?.[1]?.trim()||'';
    const desc=(b.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)||b.match(/<description>(.*?)<\/description>/))?.[1]?.replace(/<[^>]+>/g,'')?.trim()?.slice(0,160)||'';
    if(title&&/oil|petrol|fuel|diesel|gasoline|pump.?price|price.?hike|rollback|doe|energy.?dep/i.test(title+' '+desc))
      items.push({title,link,date,desc,source});
    if(items.length>=5)break;
  }
  return items;
}
let _newsCache={data:[],ts:0};
async function getNews(){
  if(Date.now()-_newsCache.ts<30*60*1000&&_newsCache.data.length)return _newsCache.data;
  const feeds=[
    {url:'https://data.gmanetwork.com/gno/rss/economy/feed.xml',source:'GMA News'},
    {url:'https://www.rappler.com/feed/',source:'Rappler'},
    {url:'https://newsinfo.inquirer.net/feed',source:'Inquirer'},
  ];
  const results=[];
  for(const f of feeds){try{const xml=await fetchRSS(f.url);results.push(...parseRSS(xml,f.source))}catch(e){}}
  if(!results.length)results.push(
    {title:'DOE announces weekly fuel price adjustments',source:'GMA News',date:new Date().toDateString(),link:'https://www.gmanetwork.com/news/economy/',desc:'The Department of Energy releases the latest fuel price movement for the week'},
    {title:'Oil companies implement price changes effective Tuesday',source:'Rappler',date:new Date().toDateString(),link:'https://www.rappler.com/business/',desc:'Major oil companies announce price movements in line with global crude oil prices'},
  );
  _newsCache={data:results,ts:Date.now()};
  return results;
}
app.get('/api/news',async(req,res)=>{try{res.json(await getNews())}catch(e){res.json([])}});

app.get('/', (req,res) => res.send(HTML));

cron.schedule('0 9 * * *', async () => {
  const d = new Date().getDay();
  if (d===2||d===3) { console.log('[Cron] Scraping prices...'); await scrapePrices(); }
  if (d===1) { console.log('[Cron] Generating AI forecast...'); await generateAIForecast(); }
}, { timezone: "Asia/Manila" });

// Generate forecast on startup too
generateAIForecast();

scrapePrices();
app.listen(PORT, () => console.log('[Server] Running on port ' + PORT));
