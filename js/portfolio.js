// js/portfolio.js
const BROKER_COLOR_PALETTE = [
    { bg: 'bg-blue-950/20',   head: 'bg-blue-950/30',   text: 'text-blue-300',   value: 'text-blue-400' },
    { bg: 'bg-purple-950/20', head: 'bg-purple-950/30', text: 'text-purple-300', value: 'text-purple-400' },
    { bg: 'bg-amber-950/20',  head: 'bg-amber-950/30',  text: 'text-amber-300',  value: 'text-amber-400' }
];

const NGX_PULSE_STOCKS_ENDPOINT = '/.netlify/functions/prices';

async function fetchNgxPulseStocks() {
    const res = await fetch(NGX_PULSE_STOCKS_ENDPOINT);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    return Array.isArray(payload) ? payload : (payload.data || payload.stocks || []);
}

async function syncStockPrice(ticker) {
    const stock = systemState.stocks.find(s => s.ticker === ticker);
    if(!stock) return false;
    try {
        const records = await fetchNgxPulseStocks();
        const record = records.find(r => String(r.symbol || r.ticker || '').toUpperCase() === ticker.toUpperCase());
        const price = parseFloat(record?.current_price ?? record?.price ?? record?.close ?? record?.livePrice);
        if(isNaN(price) || price <= 0) throw new Error();
        stock.livePrice = price;
        stock.priceSource = 'live';
        stock.lastSynced = new Date().toISOString();
        return true;
    } catch(err) {
        stock.priceSource = stock.priceSource === 'live' ? 'stale' : 'manual';
        return false;
    }
}

async function syncAllStockPrices() {
    const badge = document.getElementById('stock-sync-badge');
    if(badge) badge.innerText = 'Syncing…';
    try {
        const records = await fetchNgxPulseStocks();
        systemState.stocks.forEach(s => {
            const record = records.find(r => String(r.symbol || r.ticker || '').toUpperCase() === s.ticker.toUpperCase());
            const price = parseFloat(record?.current_price ?? record?.price ?? record?.close ?? record?.livePrice);
            if(record && !isNaN(price) && price > 0) {
                s.livePrice = price;
                s.priceSource = 'live';
                s.lastSynced = new Date().toISOString();
            } else {
                s.priceSource = s.priceSource === 'live' ? 'stale' : 'manual';
            }
        });
        if(badge) badge.innerText = `Live`;
    } catch(err) {
        systemState.stocks.forEach(s => { s.priceSource = s.priceSource === 'live' ? 'stale' : 'manual'; });
        if(badge) badge.innerText = 'Cached';
    }
    recomputeAllLedgers();
}

function renderTickerTape() {
    const container = document.getElementById('ticker-tape-container');
    if(!container) return;

    const currentTickersStr = systemState.stocks.map(s => s.ticker).sort().join(',');
    if (currentTickersStr === lastRenderedTickersStr) return; 
    lastRenderedTickersStr = currentTickersStr;

    container.innerHTML = '';

    const symbolsMatrix = [ { "proName": "FX_IDC:USDNGN", "title": "USD/NGN Spot" } ];
    systemState.stocks.forEach(s => { symbolsMatrix.push({ "proName": `NSENG:${s.ticker}`, "title": s.ticker }); });
    symbolsMatrix.push( { "proName": "FOREXCOM:SPX500", "title": "S&P 500 Index" }, { "proName": "BINANCE:BTCUSDT", "title": "Bitcoin" } );

    const widgetWrapper = document.createElement('div');
    widgetWrapper.className = 'tradingview-widget-container';
    const widgetSub = document.createElement('div');
    widgetSub.className = 'tradingview-widget-container__widget';
    widgetWrapper.appendChild(widgetSub);

    const scriptEl = document.createElement('script');
    scriptEl.type = 'text/javascript';
    scriptEl.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
    scriptEl.async = true;
    scriptEl.text = JSON.stringify({
        "symbols": symbolsMatrix, "showSymbolLogo": true, "colorTheme": "dark", "isTransparent": true, "displayMode": "adaptive", "locale": "en"
    });

    widgetWrapper.appendChild(scriptEl);
    container.appendChild(widgetWrapper);
}

function renderStocksTableHead() {
    const thead = document.getElementById('stocks-table-head');
    if(!thead) return;
    const brokerHeaderCells = systemState.brokers.map((b, i) => {
        const palette = BROKER_COLOR_PALETTE[i % BROKER_COLOR_PALETTE.length];
        return `<th class="px-4 py-3.5 text-right ${palette.head} ${palette.text}">${b} Cost</th><th class="px-4 py-3.5 text-right ${palette.head} ${palette.text}">${b} Units</th>`;
    }).join('');
    thead.innerHTML = `<tr><th class="px-4 py-3.5 rounded-tl-lg">Ticker</th><th class="px-4 py-3.5 text-right">Live Price</th>${brokerHeaderCells}<th class="px-4 py-3.5 text-right">Total Units</th><th class="px-4 py-3.5 text-right">Cost Basis</th><th class="px-4 py-3.5 text-right">Value</th><th class="px-4 py-3.5 text-right">Net Return</th><th class="px-4 py-3.5 text-right">% Shares</th><th class="px-4 py-3.5 text-right">% Port</th><th class="px-4 py-3.5 text-center rounded-tr-lg">Actions</th></tr>`;
}

function renderStocksTable(valSub, grandTotal) {
    renderStocksTableHead();
    const tbody = document.getElementById('stocks-table-body');
    tbody.innerHTML = '';
    
    if (systemState.stocks.length === 0) {
        tbody.innerHTML = getEmptyRowHtml(9 + (systemState.brokers.length*2), "equities positions");
        return;
    }

    systemState.stocks.forEach((s, idx) => {
        const portfolioWeight = grandTotal > 0 ? (s.currentValue / grandTotal) * 100 : 0;
        const sharesWeight = valSub > 0 ? (s.currentValue / valSub) * 100 : 0;
        const roiPercent = s.totalCost > 0 ? (s.netReturn / s.totalCost) * 100 : 0;
        const brokerCells = systemState.brokers.map((b, i) => {
            const palette = BROKER_COLOR_PALETTE[i % BROKER_COLOR_PALETTE.length];
            const h = s.holdings[b] || { cost: 0, units: 0 };
            return `<td class="px-4 py-4 text-right ${palette.bg} ${palette.text} font-medium">₦${(h.cost||0).toLocaleString()}</td><td class="px-4 py-4 text-right ${palette.bg} ${palette.value} font-medium">${h.units || 0}</td>`;
        }).join('');

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-900/40 border-b border-slate-800/40 text-slate-300";
        tr.innerHTML = `<td class="px-4 py-4"><span class="font-bold text-white bg-slate-800/50 px-2 py-1 rounded">${s.ticker}</span></td><td class="px-4 py-4 text-right">₦${(s.livePrice||0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>${brokerCells}<td class="px-4 py-4 text-right font-bold">${s.totalUnits}</td><td class="px-4 py-4 text-right text-slate-400">₦${s.totalCost.toLocaleString()}</td><td class="px-4 py-4 text-right font-bold text-white">₦${s.currentValue.toLocaleString()}</td><td class="px-4 py-4 text-right"><span class="${s.netReturn>=0?'text-emerald-400':'text-rose-400'} font-bold">₦${s.netReturn.toLocaleString()}</span><br><span class="text-[10px] text-slate-500">${roiPercent.toFixed(1)}%</span></td><td class="px-4 py-4 text-right text-emerald-500/70">${sharesWeight.toFixed(2)}%</td><td class="px-4 py-4 text-right text-emerald-400 font-medium">${portfolioWeight.toFixed(2)}%</td><td class="px-4 py-4 text-center space-y-1.5"><button onclick="syncStockPrice('${s.ticker}').then(()=>window.showToast('Synced ${s.ticker}')).then(recomputeAllLedgers)" class="block w-full bg-slate-800 hover:bg-slate-700 text-white text-[10px] px-2 py-1.5 rounded transition shadow-sm">Sync</button><button onclick="openStockModal('${s.ticker}')" class="block w-full bg-blue-900/30 text-blue-400 hover:bg-blue-900/50 text-[10px] px-2 py-1.5 rounded transition shadow-sm">Edit</button><button onclick="deleteAsset('stocks', ${idx})" class="block w-full text-rose-500/80 hover:text-rose-400 text-[10px] py-1 transition">Delete</button></td>`;
        tbody.appendChild(tr);
    });
}

function renderFundsTable(valSub, grandTotal) {
    const tbody = document.getElementById('funds-table-body'); tbody.innerHTML = '';
    if(systemState.funds.length === 0) {
        tbody.innerHTML = getEmptyRowHtml(7, "mutual funds"); return;
    }
    systemState.funds.forEach((f, idx) => {
        const w = grandTotal > 0 ? (f.currentValue / grandTotal) * 100 : 0;
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-900/40 border-b border-slate-800/40 text-slate-300";
        tr.innerHTML = `<td class="px-6 py-4 font-medium text-slate-200">${f.name}</td><td class="px-6 py-4 text-right text-slate-400">₦${f.cost.toLocaleString()}</td><td class="px-6 py-4 text-right text-emerald-400 font-medium">+₦${f.interest.toLocaleString()}</td><td class="px-6 py-4 text-right font-bold text-white">₦${f.currentValue.toLocaleString()}</td><td class="px-6 py-4 text-right text-slate-400">${(f.cost>0?(f.interest/f.cost*100):0).toFixed(2)}%</td><td class="px-6 py-4 text-right text-emerald-400 font-medium">${w.toFixed(2)}%</td><td class="px-6 py-4 text-center space-x-3"><button onclick="openFundModal(${idx})" class="text-blue-400 hover:text-blue-300 text-[11px] font-semibold transition">Edit</button><button onclick="deleteAsset('funds', ${idx})" class="text-rose-500/80 hover:text-rose-400 text-[11px] font-semibold transition">Delete</button></td>`;
        tbody.appendChild(tr);
    });
}

function openFundModal(idx = -1) {
    document.getElementById('fund-edit-index').value = idx;
    if(idx >= 0 && systemState.funds[idx]) {
        const f = systemState.funds[idx];
        document.getElementById('fund-name').value = f.name || '';
        document.getElementById('fund-cost').value = f.cost || 0;
        document.getElementById('fund-interest').value = f.interest || 0;
        document.getElementById('fund-modal-title').innerText = 'Edit Mutual Fund Account';
    } else {
        document.getElementById('fund-name').value = '';
        document.getElementById('fund-cost').value = '';
        document.getElementById('fund-interest').value = '';
        document.getElementById('fund-modal-title').innerText = 'Add Mutual Fund Account';
    }
    openModal('fund-modal');
}

function saveFundAsset() {
    const idx = parseInt(document.getElementById('fund-edit-index').value);
    const name = document.getElementById('fund-name').value.trim();
    const cost = parseFloat(document.getElementById('fund-cost').value) || 0;
    const interest = parseFloat(document.getElementById('fund-interest').value) || 0;
    if(name) {
        if(idx >= 0 && idx < systemState.funds.length) {
            systemState.funds[idx] = { name, cost, interest };
            window.showToast("Fund updated successfully.");
        } else {
            systemState.funds.push({ name, cost, interest });
            window.showToast("Fund added successfully.");
        }
        closeModal('fund-modal');
        recomputeAllLedgers();
    }
}

function renderPensionTable(valSub, grandTotal) {
    const tbody = document.getElementById('pension-table-body'); tbody.innerHTML = '';
    if(systemState.pensions.length === 0) {
        tbody.innerHTML = getEmptyRowHtml(7, "pension accounts"); return;
    }
    systemState.pensions.forEach((p, idx) => {
        const w = grandTotal > 0 ? (p.currentValue / grandTotal) * 100 : 0;
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-900/40 border-b border-slate-800/40 text-slate-300";
        tr.innerHTML = `<td class="px-6 py-4 font-medium text-slate-200">${p.name}</td><td class="px-6 py-4 text-right text-slate-400">₦${p.cost.toLocaleString()}</td><td class="px-6 py-4 text-right text-emerald-400 font-medium">+₦${p.interest.toLocaleString()}</td><td class="px-6 py-4 text-right font-bold text-white">₦${p.currentValue.toLocaleString()}</td><td class="px-6 py-4 text-right text-slate-400">${(p.cost>0?(p.interest/p.cost*100):0).toFixed(2)}%</td><td class="px-6 py-4 text-right text-emerald-400 font-medium">${w.toFixed(2)}%</td><td class="px-6 py-4 text-center space-x-3"><button onclick="openPensionModal(${idx})" class="text-blue-400 hover:text-blue-300 text-[11px] font-semibold transition">Edit</button><button onclick="deleteAsset('pensions', ${idx})" class="text-rose-500/80 hover:text-rose-400 text-[11px] font-semibold transition">Delete</button></td>`;
        tbody.appendChild(tr);
    });
}

function openPensionModal(idx = -1) {
    document.getElementById('pension-edit-index').value = idx;
    if(idx >= 0 && systemState.pensions[idx]) {
        const p = systemState.pensions[idx];
        document.getElementById('pension-name').value = p.name || '';
        document.getElementById('pension-cost').value = p.cost || 0;
        document.getElementById('pension-interest').value = p.interest || 0;
        document.getElementById('pension-modal-title').innerText = 'Edit Pension Allocation';
    } else {
        document.getElementById('pension-name').value = '';
        document.getElementById('pension-cost').value = '';
        document.getElementById('pension-interest').value = '';
        document.getElementById('pension-modal-title').innerText = 'Link Pension Allocation';
    }
    openModal('pension-modal');
}

function savePensionAsset() {
    const idx = parseInt(document.getElementById('pension-edit-index').value);
    const name = document.getElementById('pension-name').value.trim();
    const cost = parseFloat(document.getElementById('pension-cost').value) || 0;
    const interest = parseFloat(document.getElementById('pension-interest').value) || 0;
    if(name) {
        if(idx >= 0 && idx < systemState.pensions.length) {
            systemState.pensions[idx] = { name, cost, interest };
            window.showToast("Pension updated.");
        } else {
            systemState.pensions.push({ name, cost, interest });
            window.showToast("Pension linked.");
        }
        closeModal('pension-modal');
        recomputeAllLedgers();
    }
}

function renderUsdTable(valSub, grandTotal) {
    const tbody = document.getElementById('usd-table-body'); tbody.innerHTML = '';
    if(systemState.usdAssets.length === 0) {
        tbody.innerHTML = getEmptyRowHtml(7, "USD assets"); return;
    }
    systemState.usdAssets.forEach((u, idx) => {
        const w = grandTotal > 0 ? (u.currentValueNGN / grandTotal) * 100 : 0;
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-900/40 border-b border-slate-800/40 text-slate-300";
        tr.innerHTML = `<td class="px-6 py-4 font-medium text-slate-200">${u.name}</td><td class="px-6 py-4 text-right text-slate-400">$${u.cost.toLocaleString()}</td><td class="px-6 py-4 text-right text-emerald-400 font-medium">+$${u.interest.toLocaleString()}</td><td class="px-6 py-4 text-right text-slate-200 font-medium">$${u.valUSD.toLocaleString()}</td><td class="px-6 py-4 text-right font-bold text-emerald-400">₦${u.currentValueNGN.toLocaleString()}</td><td class="px-6 py-4 text-right text-emerald-400 font-medium">${w.toFixed(2)}%</td><td class="px-6 py-4 text-center space-x-3"><button onclick="openUsdModal(${idx})" class="text-blue-400 hover:text-blue-300 text-[11px] font-semibold transition">Edit</button><button onclick="deleteAsset('usdAssets', ${idx})" class="text-rose-500/80 hover:text-rose-400 text-[11px] font-semibold transition">Delete</button></td>`;
        tbody.appendChild(tr);
    });
}

function openUsdModal(idx = -1) {
    document.getElementById('usd-edit-index').value = idx;
    if(idx >= 0 && systemState.usdAssets[idx]) {
        const u = systemState.usdAssets[idx];
        document.getElementById('usd-name').value = u.name || '';
        document.getElementById('usd-cost').value = u.cost || 0;
        document.getElementById('usd-interest').value = u.interest || 0;
        document.getElementById('usd-modal-title').innerText = 'Edit Foreign USD Position';
    } else {
        document.getElementById('usd-name').value = '';
        document.getElementById('usd-cost').value = '';
        document.getElementById('usd-interest').value = '';
        document.getElementById('usd-modal-title').innerText = 'Add Foreign USD Position';
    }
    openModal('usd-modal');
}

function saveUsdAsset() {
    const idx = parseInt(document.getElementById('usd-edit-index').value);
    const name = document.getElementById('usd-name').value.trim();
    const cost = parseFloat(document.getElementById('usd-cost').value) || 0;
    const interest = parseFloat(document.getElementById('usd-interest').value) || 0;
    if(name) {
        if(idx >= 0 && idx < systemState.usdAssets.length) {
            systemState.usdAssets[idx] = { name, cost, interest };
            window.showToast("USD position updated.");
        } else {
            systemState.usdAssets.push({ name, cost, interest });
            window.showToast("USD position added.");
        }
        closeModal('usd-modal');
        recomputeAllLedgers();
    }
}

function openStockModal(ticker = null) {
    const existing = ticker ? systemState.stocks.find(s => s.ticker === ticker) : null;
    document.getElementById('stock-ticker').value = existing ? existing.ticker : '';
    document.getElementById('stock-ticker').disabled = !!existing;
    document.getElementById('stock-manual-price').value = (existing && existing.priceSource === 'manual') ? existing.livePrice : '';
    buildStockBrokerFields(existing);
    openModal('stock-modal');
}

function buildStockBrokerFields(existing) {
    const container = document.getElementById('stock-broker-fields');
    container.innerHTML = systemState.brokers.map((b, i) => {
        const palette = BROKER_COLOR_PALETTE[i % BROKER_COLOR_PALETTE.length];
        const h = existing?.holdings?.[b] || { cost: 0, units: 0 };
        return `<div class="grid grid-cols-2 gap-4"><div><label class="block text-[11px] uppercase tracking-wider ${palette.text} mb-1">${b} Cost (₦)</label><input type="number" data-broker="${b}" data-field="cost" class="stock-broker-input w-full bg-[#0B0F13] border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-emerald-500 transition" value="${h.cost || ''}"></div><div><label class="block text-[11px] uppercase tracking-wider ${palette.text} mb-1">${b} Units</label><input type="number" data-broker="${b}" data-field="units" class="stock-broker-input w-full bg-[#0B0F13] border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-emerald-500 transition" value="${h.units || ''}"></div></div>`;
    }).join('');
}

function saveStockAsset() {
    const ticker = document.getElementById('stock-ticker').value.toUpperCase().trim();
    if(!ticker) return;
    const holdings = {};
    systemState.brokers.forEach(b => holdings[b] = { cost: 0, units: 0 });
    document.querySelectorAll('.stock-broker-input').forEach(input => {
        holdings[input.dataset.broker][input.dataset.field] = parseFloat(input.value) || 0;
    });
    const manualPriceRaw = document.getElementById('stock-manual-price').value;
    const hasManualPrice = manualPriceRaw !== '' && !isNaN(parseFloat(manualPriceRaw));

    let existing = systemState.stocks.find(s => s.ticker === ticker);
    if(existing) {
        existing.holdings = holdings;
        if(hasManualPrice) { existing.livePrice = parseFloat(manualPriceRaw); existing.priceSource = 'manual'; }
        window.showToast("Stock position updated.");
    } else {
        systemState.stocks.push({
            ticker, holdings,
            livePrice: hasManualPrice ? parseFloat(manualPriceRaw) : 0,
            priceSource: hasManualPrice ? 'manual' : 'pending',
            lastSynced: null
        });
        window.showToast("Stock position added.");
    }
    closeModal('stock-modal');
    recomputeAllLedgers();

    if(!hasManualPrice) {
        syncStockPrice(ticker).then(() => recomputeAllLedgers());
    }
}

function openBrokerModal() { renderBrokerList(); openModal('broker-modal'); }

function renderBrokerList() {
    document.getElementById('broker-list').innerHTML = systemState.brokers.map(b => `
        <span class="bg-[#0B0F13] border border-slate-700 rounded-lg pl-3 pr-2 py-1.5 text-xs font-medium flex items-center gap-2 text-slate-200 shadow-sm">${b}<button onclick="removeBroker('${b}')" class="text-slate-500 hover:text-rose-400 font-bold transition text-sm">&times;</button></span>
    `).join('');
}

function addBroker() {
    const name = document.getElementById('new-broker-name').value.trim();
    if(name && !systemState.brokers.includes(name)) {
        systemState.brokers.push(name);
        systemState.stocks.forEach(s => s.holdings[name] = { cost: 0, units: 0 });
        document.getElementById('new-broker-name').value = '';
        renderBrokerList(); recomputeAllLedgers();
        window.showToast(`Broker '${name}' linked.`);
    }
}

function removeBroker(name) {
    if(systemState.brokers.length > 1 && confirm(`Remove ${name} from all stock sheets?`)) {
        systemState.brokers = systemState.brokers.filter(b => b !== name);
        systemState.stocks.forEach(s => delete s.holdings[name]);
        renderBrokerList(); recomputeAllLedgers();
        window.showToast("Broker removed.", "error");
    } else if (systemState.brokers.length <= 1) {
        window.showToast("You must maintain at least one broker.", "error");
    }
}

function triggerChartRebuilds(stocksVal=0, fundsVal=0, pensionVal=0, usdVal=0) {
    const allocCtx = document.getElementById('assetAllocationChart');
    if (allocCtx) {
        if(allocationChartInstance) allocationChartInstance.destroy();
        allocationChartInstance = new Chart(allocCtx, {
            type: 'doughnut', data: {
                labels: ['Stocks', 'Mutual Funds', 'Pension', 'USD Foreign Assets'],
                datasets: [{ data: [stocksVal, fundsVal, pensionVal, usdVal], backgroundColor: ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B'], borderWidth: 0, hoverOffset: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', font: { size: 10, family: "'Plus Jakarta Sans', sans-serif" }, padding: 15 } } }, cutout: '70%' }
        });
    }

    const perfCtx = document.getElementById('assetPerformanceChart');
    if (perfCtx) {
        if(performanceChartInstance) performanceChartInstance.destroy();
        let labels = systemState.stocks.map(s => s.ticker);
        let dataValues = systemState.stocks.map(s => s.netReturn);
        performanceChartInstance = new Chart(perfCtx, {
            type: 'bar', data: {
                labels: labels, datasets: [{ label: 'Yield (₦)', data: dataValues, backgroundColor: dataValues.map(v => v >= 0 ? '#10B981' : '#F43F5E'), borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { border: { display: false }, grid: { color: '#1E293B' }, ticks: { color: '#64748B', font: { size: 10 } } }, x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10 } } } } }
        });
    }
}
