// Rates Dashboard Logical Engine
document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    rawHistory: [],
    dailyData: {
      binance: [], // Array of { x: Date, y: [O, H, L, C] }
      bcv: [],     // Array of { x: Date, y: [O, H, L, C] }
      spread: []   // Array of { x: Date, y: CloseSpreadPct }
    },
    currentAsset: 'binance', // 'binance', 'bcv', 'spread'
    currentTimeframe: '1d',  // '1h', '4h', '1d'
    currentRange: '30',      // '7', '15', '30', 'all'
    showMA: false,
    periodMA: 7,
    showEMA: false,
    periodEMA: 9,
    chart: null
  };

  // DOM Elements
  const elLastUpdate = document.getElementById('last-update-time');
  const elBinanceCurrent = document.getElementById('binance-current');
  const elBcvCurrent = document.getElementById('bcv-current');
  const elPctDiff = document.getElementById('pct-diff');
  const elAbsDiff = document.getElementById('abs-diff');
  
  const elAssetSelector = document.getElementById('asset-selector');
  const elRangeSelector = document.getElementById('range-selector');
  
  const elToggleMA = document.getElementById('toggle-ma');
  const elPeriodMA = document.getElementById('period-ma');
  const elToggleEMA = document.getElementById('toggle-ema');
  const elPeriodEMA = document.getElementById('period-ema');

  const elStatMaxBinance = document.getElementById('stat-max-binance');
  const elStatMinBinance = document.getElementById('stat-min-binance');
  const elStatMaxBcv = document.getElementById('stat-max-bcv');
  const elStatAvgSpread = document.getElementById('stat-avg-spread');

  // Initialization
  init();

  async function init() {
    setupEventListeners();
    await loadData();
  }

  // Setup UI Listeners
  function setupEventListeners() {
    // Asset Selectors
    elAssetSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      Array.from(elAssetSelector.children).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentAsset = btn.dataset.value;
      updateChart();
    });

    // Range Selectors
    elRangeSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      Array.from(elRangeSelector.children).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentRange = btn.dataset.value;
      updateChart();
      updateStatistics();
    });

    // Timeframe Selectors
    const elTimeframeSelector = document.getElementById('timeframe-selector');
    elTimeframeSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      Array.from(elTimeframeSelector.children).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentTimeframe = btn.dataset.value;
      processDailyData();
      updateChart();
      updateStatistics();
    });

    // Indicators toggles & parameters
    elToggleMA.addEventListener('change', (e) => {
      state.showMA = e.target.checked;
      updateChart();
    });
    elPeriodMA.addEventListener('change', (e) => {
      const val = parseInt(e.target.value);
      if (val >= 2 && val <= 50) {
        state.periodMA = val;
        if (state.showMA) updateChart();
      }
    });

    elToggleEMA.addEventListener('change', (e) => {
      state.showEMA = e.target.checked;
      updateChart();
    });
    elPeriodEMA.addEventListener('change', (e) => {
      const val = parseInt(e.target.value);
      if (val >= 2 && val <= 50) {
        state.periodEMA = val;
        if (state.showEMA) updateChart();
      }
    });
  }

  // Fetch JSON and process
  async function loadData() {
    try {
      const response = await fetch('data/rates-history.json');
      if (!response.ok) throw new Error('No se pudo cargar el archivo de datos.');
      const data = await response.json();
      
      state.rawHistory = data.history || [];
      const lastUpdated = new Date(data.lastUpdated);
      elLastUpdate.textContent = `Actualizado: ${lastUpdated.toLocaleDateString()} ${lastUpdated.toLocaleTimeString()}`;
      
      if (state.rawHistory.length > 0) {
        // Set Overview Cards
        const current = state.rawHistory[state.rawHistory.length - 1];
        elBinanceCurrent.textContent = `${current.binance.toFixed(2)} VES`;
        elBcvCurrent.textContent = `${current.bcv.toFixed(2)} VES`;
        
        const diff = current.binance - current.bcv;
        const pct = (diff / current.bcv) * 100;
        
        elPctDiff.textContent = `${pct.toFixed(2)}%`;
        elAbsDiff.textContent = `Diferencia: ${diff.toFixed(2)} VES`;
        
        // Process raw data into daily OHLC
        processDailyData();
        
        // Initial Draw
        updateChart();
        updateStatistics();
      }
    } catch (error) {
      console.error(error);
      elLastUpdate.textContent = 'Error cargando datos';
    }
  }

  // Convert Hourly Records into Daily/4H/1H OHLC
  function processDailyData() {
    const groups = {};

    state.rawHistory.forEach(item => {
      const date = new Date(item.timestamp);
      if (isNaN(date.getTime())) return;

      let groupKey = '';
      if (state.currentTimeframe === '1d') {
        groupKey = item.timestamp.split('T')[0];
      } else if (state.currentTimeframe === '4h') {
        const dateStr = item.timestamp.split('T')[0];
        const hour = date.getHours();
        const block = Math.floor(hour / 4) * 4;
        groupKey = `${dateStr}_${String(block).padStart(2, '0')}h`;
      } else {
        // '1h'
        const dateStr = item.timestamp.split('T')[0];
        const hour = date.getHours();
        groupKey = `${dateStr}_${String(hour).padStart(2, '0')}h`;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
    });

    const sortedGroupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    
    state.dailyData.binance = [];
    state.dailyData.bcv = [];
    state.dailyData.spread = [];

    sortedGroupKeys.forEach(key => {
      const groupItems = groups[key].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      let dateObj;
      if (state.currentTimeframe === '1d') {
        dateObj = new Date(key + 'T00:00:00');
      } else if (state.currentTimeframe === '4h') {
        const parts = key.split('_');
        const dateStr = parts[0];
        const block = parseInt(parts[1]);
        dateObj = new Date(dateStr + `T${String(block).padStart(2, '0')}:00:00`);
      } else {
        const parts = key.split('_');
        const dateStr = parts[0];
        const hour = parseInt(parts[1]);
        dateObj = new Date(dateStr + `T${String(hour).padStart(2, '0')}:00:00`);
      }

      // Binance OHLC
      const binancePrices = groupItems.map(d => d.binance);
      const bBinance = {
        x: dateObj,
        y: [
          binancePrices[0], // Open
          Math.max(...binancePrices), // High
          Math.min(...binancePrices), // Low
          binancePrices[binancePrices.length - 1] // Close
        ]
      };

      // BCV OHLC
      const bcvPrices = groupItems.map(d => d.bcv);
      const bBCV = {
        x: dateObj,
        y: [
          bcvPrices[0],
          Math.max(...bcvPrices),
          Math.min(...bcvPrices),
          bcvPrices[bcvPrices.length - 1]
        ]
      };

      // Spread % (Close Spread)
      const closeBinance = bBinance.y[3];
      const closeBcv = bBCV.y[3];
      const closeSpreadPct = ((closeBinance - closeBcv) / closeBcv) * 100;

      state.dailyData.binance.push(bBinance);
      state.dailyData.bcv.push(bBCV);
      state.dailyData.spread.push({
        x: dateObj,
        y: parseFloat(closeSpreadPct.toFixed(2))
      });
    });
  }

  // Calculate Simple Moving Average (MA)
  function calculateMA(data, period) {
    const ma = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        ma.push({ x: data[i].x, y: null });
        continue;
      }
      let sum = 0;
      for (let j = 0; j < period; j++) {
        const val = Array.isArray(data[i - j].y) ? data[i - j].y[3] : data[i - j].y; // Use Close price if OHLC
        sum += val;
      }
      ma.push({ x: data[i].x, y: parseFloat((sum / period).toFixed(4)) });
    }
    return ma;
  }

  // Calculate Exponential Moving Average (EMA)
  function calculateEMA(data, period) {
    const ema = [];
    const k = 2 / (period + 1);
    let prevEma = null;

    for (let i = 0; i < data.length; i++) {
      const currentVal = Array.isArray(data[i].y) ? data[i].y[3] : data[i].y;

      if (i < period - 1) {
        ema.push({ x: data[i].x, y: null });
        continue;
      }

      if (prevEma === null) {
        // Initialize with SMA
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += Array.isArray(data[i - j].y) ? data[i - j].y[3] : data[i - j].y;
        }
        prevEma = sum / period;
        ema.push({ x: data[i].x, y: parseFloat(prevEma.toFixed(4)) });
      } else {
        const currentEma = (currentVal * k) + (prevEma * (1 - k));
        prevEma = currentEma;
        ema.push({ x: data[i].x, y: parseFloat(currentEma.toFixed(4)) });
      }
    }
    return ema;
  }

  // Filter dataset by range (Days)
  function filterDataByRange(dataset, range) {
    if (range === 'all') return dataset;
    const limitDays = parseInt(range);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - limitDays);
    return dataset.filter(item => item.x >= cutoffDate);
  }

  // Update Stats Section
  function updateStatistics() {
    const binanceData = filterDataByRange(state.dailyData.binance, state.currentRange);
    const bcvData = filterDataByRange(state.dailyData.bcv, state.currentRange);
    const spreadData = filterDataByRange(state.dailyData.spread, state.currentRange);

    // Calculate Period Stats
    if (binanceData.length > 0) {
      const maxBinance = Math.max(...binanceData.map(d => d.y[1]));
      const minBinance = Math.min(...binanceData.map(d => d.y[2]));
      const maxBcv = Math.max(...bcvData.map(d => d.y[1]));
      const avgSpread = spreadData.reduce((sum, d) => sum + d.y, 0) / spreadData.length;

      elStatMaxBinance.textContent = `${maxBinance.toFixed(2)} VES`;
      elStatMinBinance.textContent = `${minBinance.toFixed(2)} VES`;
      elStatMaxBcv.textContent = `${maxBcv.toFixed(2)} VES`;
      elStatAvgSpread.textContent = `${avgSpread.toFixed(2)}%`;
    }

    // Calculate Today's Stats (Latest Day in raw history)
    if (state.rawHistory.length > 0) {
      const groups = {};
      state.rawHistory.forEach(item => {
        const dateStr = item.timestamp.split('T')[0];
        if (!groups[dateStr]) groups[dateStr] = [];
        groups[dateStr].push(item);
      });
      
      const dates = Object.keys(groups).sort();
      if (dates.length > 0) {
        const latestDate = dates[dates.length - 1];
        const todayItems = groups[latestDate].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const todayBinance = todayItems.map(d => d.binance);
        
        const open = todayBinance[0];
        const high = Math.max(...todayBinance);
        const low = Math.min(...todayBinance);
        const last = todayBinance[todayBinance.length - 1];
        
        document.getElementById('stat-today-open').textContent = `${open.toFixed(2)} VES`;
        document.getElementById('stat-today-high').textContent = `${high.toFixed(2)} VES`;
        document.getElementById('stat-today-low').textContent = `${low.toFixed(2)} VES`;
        document.getElementById('stat-today-last').textContent = `${last.toFixed(2)} VES`;
      }
    }
  }

  // Create or Update ApexChart
  function updateChart() {
    let baseData = [];
    let title = '';
    let isCandle = true;
    let colors = [];
    
    const isCandleTimeframe = state.currentTimeframe !== '1h';

    if (state.currentAsset === 'binance') {
      baseData = state.dailyData.binance;
      title = 'Tasas USDT Binance P2P';
      isCandle = isCandleTimeframe;
      colors = ['#F3BA2F'];
    } else if (state.currentAsset === 'bcv') {
      baseData = state.dailyData.bcv;
      title = 'Tasas Dólar BCV Oficial';
      isCandle = isCandleTimeframe;
      colors = ['#10B981'];
    } else {
      baseData = state.dailyData.spread;
      title = 'Diferencial Porcentual (Binance P2P / BCV - 1)';
      isCandle = false;
      colors = ['#3B82F6'];
    }

    let filteredBase = filterDataByRange(baseData, state.currentRange);
    
    // If it's a line chart but the data has OHLC arrays, map them to Close values
    if (!isCandle && filteredBase.length > 0 && Array.isArray(filteredBase[0].y)) {
      filteredBase = filteredBase.map(item => ({
        x: item.x,
        y: item.y[3] // Close value
      }));
    }

    const series = [];

    const tfUpper = state.currentTimeframe.toUpperCase();
    if (isCandle) {
      series.push({
        name: `Velas ${tfUpper}`,
        type: 'candlestick',
        data: filteredBase
      });
    } else {
      series.push({
        name: state.currentAsset === 'spread' ? `Brecha % (${tfUpper})` : `Tasa (${tfUpper})`,
        type: 'line',
        data: filteredBase
      });
    }

    // Add Indicators
    if (state.showMA) {
      const maData = calculateMA(baseData, state.periodMA);
      series.push({
        name: `MA (${state.periodMA})`,
        type: 'line',
        data: filterDataByRange(maData, state.currentRange)
      });
    }

    if (state.showEMA) {
      const emaData = calculateEMA(baseData, state.periodEMA);
      series.push({
        name: `EMA (${state.periodEMA})`,
        type: 'line',
        data: filterDataByRange(emaData, state.currentRange)
      });
    }

    // Chart Configuration
    const options = {
      series: series,
      chart: {
        type: isCandle ? 'candlestick' : 'line',
        height: 480,
        background: 'transparent',
        toolbar: { show: true },
        fontFamily: 'Outfit, sans-serif',
        foreColor: '#9ca3af'
      },
      title: {
        text: title,
        align: 'left',
        style: { fontSize: '16px', color: '#f3f4f6', fontWeight: 600 }
      },
      stroke: {
        width: isCandle ? [1, 2, 2] : [2, 2, 2],
        curve: 'smooth'
      },
      xaxis: {
        type: 'datetime',
        labels: {
          style: { colors: '#9ca3af' }
        }
      },
      yaxis: {
        tooltip: { enabled: true },
        labels: {
          formatter: (value) => state.currentAsset === 'spread' ? `${value.toFixed(2)}%` : `${value.toFixed(2)} VES`,
          style: { colors: '#9ca3af' }
        }
      },
      grid: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        padding: { left: 10, right: 10 }
      },
      theme: {
        mode: 'dark'
      },
      tooltip: {
        shared: true,
        custom: function({ series, seriesIndex, dataPointIndex, w }) {
          const o = w.globals.seriesCandleO[seriesIndex][dataPointIndex];
          const h = w.globals.seriesCandleH[seriesIndex][dataPointIndex];
          const l = w.globals.seriesCandleL[seriesIndex][dataPointIndex];
          const c = w.globals.seriesCandleC[seriesIndex][dataPointIndex];
          
          const dt = new Date(w.globals.seriesX[seriesIndex][dataPointIndex]);
          const date = state.currentTimeframe === '1d'
            ? dt.toLocaleDateString()
            : `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          
          if (o !== undefined) {
            return `
              <div class="chart-tooltip">
                <div class="tooltip-date">${date}</div>
                <div class="tooltip-row"><span class="lbl">Apertura (O):</span> <span>${o.toFixed(2)}</span></div>
                <div class="tooltip-row"><span class="lbl text-high">Máximo (H):</span> <span class="text-high">${h.toFixed(2)}</span></div>
                <div class="tooltip-row"><span class="lbl text-low">Mínimo (L):</span> <span class="text-low">${l.toFixed(2)}</span></div>
                <div class="tooltip-row"><span class="lbl">Cierre (C):</span> <span>${c.toFixed(2)}</span></div>
              </div>
            `;
          } else {
            const val = series[seriesIndex][dataPointIndex];
            return `
              <div class="chart-tooltip">
                <div class="tooltip-date">${date}</div>
                <div class="tooltip-row"><span>Valor:</span> <span>${val.toFixed(2)}${isCandle ? ' VES' : '%'}</span></div>
              </div>
            `;
          }
        }
      },
      plotOptions: {
        candlestick: {
          colors: {
            upward: '#10B981',
            downward: '#EF4444'
          },
          wick: {
            useFillColor: true
          }
        }
      },
      colors: isCandle ? ['#fff', '#3B82F6', '#EC4899'] : ['#3B82F6', '#F59E0B', '#EF4444']
    };

    if (state.chart) {
      state.chart.destroy();
    }
    
    state.chart = new ApexCharts(document.querySelector("#main-chart"), options);
    state.chart.render();
  }
});
