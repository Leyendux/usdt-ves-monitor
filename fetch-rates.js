const fs = require('fs');
const path = require('path');

const HISTORY_FILE_PATH = path.join(__dirname, 'data', 'rates-history.json');

// Ensure data directory exists
const dataDir = path.dirname(HISTORY_FILE_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Fetch Binance P2P rate for USDT/VES
async function fetchBinanceP2P() {
  const url = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
  const payload = {
    asset: 'USDT',
    fiat: 'VES',
    tradeType: 'BUY', // Merchants buying USDT (User selling USDT)
    merchantCheck: false,
    page: 1,
    rows: 20,
    payTypes: []
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Binance HTTP error! Status: ${response.status}`);
    }

    const json = await response.json();
    if (!json.success || !json.data || json.data.length === 0) {
      throw new Error('Binance P2P returned empty or unsuccessful response.');
    }

    // Extract prices and sort them descending (highest price first, representing the best rate for the seller)
    const prices = json.data.map(ad => parseFloat(ad.adv.price)).filter(p => !isNaN(p));
    prices.sort((a, b) => b - a);

    if (prices.length === 0) {
      throw new Error('No valid prices found in advertisements.');
    }

    const bestPrice = prices[0];
    
    // Average top 3 highest prices to avoid anomalies/scams
    let sum = 0;
    const count = Math.min(prices.length, 3);
    for (let i = 0; i < count; i++) {
      sum += prices[i];
    }
    const avgPrice = sum / count;

    console.log(`[Binance P2P] Best Price: ${bestPrice} VES, Avg Top 3 Highest: ${avgPrice.toFixed(4)} VES`);
    return avgPrice; // Return the average of the top 3 highest prices as the standard rate
  } catch (error) {
    console.error('Error fetching Binance P2P:', error.message);
    return null;
  }
}

// Fetch BCV Rate via DolarApi (Venezuela)
async function fetchBCV() {
  const url = 'https://ve.dolarapi.com/v1/dolares/oficial';
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`BCV API HTTP error! Status: ${response.status}`);
    }

    const json = await response.json();
    const rate = parseFloat(json.promedio || json.venta || json.compra);
    
    if (isNaN(rate)) {
      throw new Error('BCV rate is not a number.');
    }

    console.log(`[BCV Oficial] Rate: ${rate} VES`);
    return rate;
  } catch (error) {
    console.error('Error fetching BCV rate:', error.message);
    return null;
  }
}

async function main() {
  console.log('--- starting rate fetch ---');
  const now = new Date();
  
  const binancePrice = await fetchBinanceP2P();
  const bcvPrice = await fetchBCV();

  if (!binancePrice && !bcvPrice) {
    console.error('Both fetches failed. History not updated.');
    process.exit(1);
  }

  // Load existing history
  let historyData = { lastUpdated: '', history: [] };
  if (fs.existsSync(HISTORY_FILE_PATH)) {
    try {
      const content = fs.readFileSync(HISTORY_FILE_PATH, 'utf8');
      historyData = JSON.parse(content);
    } catch (e) {
      console.warn('Could not parse history file, starting fresh.');
    }
  }

  // Fallback to last known price if one of them fails in this run
  let finalBinance = binancePrice;
  let finalBCV = bcvPrice;

  if (historyData.history.length > 0) {
    const lastEntry = historyData.history[historyData.history.length - 1];
    if (!finalBinance) finalBinance = lastEntry.binance;
    if (!finalBCV) finalBCV = lastEntry.bcv;
  }

  if (finalBinance && finalBCV) {
    historyData.lastUpdated = now.toISOString();
    historyData.history.push({
      timestamp: now.toISOString(),
      binance: parseFloat(finalBinance.toFixed(4)),
      bcv: parseFloat(finalBCV.toFixed(4))
    });

    // Limit history length if it gets too large (e.g. keep last 2 years / 17520 hours)
    if (historyData.history.length > 20000) {
      historyData.history.shift();
    }

    fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(historyData, null, 2), 'utf8');
    console.log(`Successfully updated rates-history.json at ${now.toISOString()}`);
  } else {
    console.error('Incomplete data. History not updated.');
    process.exit(1);
  }
}

main();
