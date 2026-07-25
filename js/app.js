// js/app.js
try {
    const SUPABASE_URL = 'https://smcnvmylvgwuiohqaiaw.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtY252bXlsdmd3dWlvaHFhaWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MDg2NDIsImV4cCI6MjEwMDI4NDY0Mn0.hBTOo1d86EMf7PUysqpdEBAYIMz2VoQCN0WQb7Yw1CI';
    window.supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
} catch (error) {
    console.error("Supabase failed to initialize:", error);
}

let currentUser = null;
let isSignUpMode = false;

let systemState = {
    usdToNgnRate: 1510.50,
    usdRateManualOverride: false,
    brokers: ['Trove', 'Wealth'],
    stocks: [],
    funds: [],
    pensions: [],
    usdAssets: [],
    loans: [],
    incomes: [],
    budgets: [],
    budgetHistory: []
};

window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    let colorClass = type === 'success' ? 'border-emerald-500 bg-emerald-950/90 text-emerald-100' : 'border-rose-500 bg-rose-950/90 text-rose-100';
    let icon = type === 'success' 
        ? `<svg class="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
        : `<svg class="w-5 h-5 text-rose-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;

    toast.className = `flex items-center gap-3 border-l-4 px-4 py-3 rounded-lg shadow-xl backdrop-blur-md animate-toast ${colorClass}`;
    toast.innerHTML = `${icon} <span class="text-sm font-medium tracking-wide">${message}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

window.addEventListener('DOMContentLoaded', async () => {
    if (!window.supabaseClient) {
        window.showToast("Cloud DB disconnected. Check adblockers.", "error");
        return;
    }

    window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
        const authScreen = document.getElementById('auth-screen');
        const appDashboard = document.getElementById('app-dashboard');
        
        if (event === 'SIGNED_OUT') {
            document.getElementById('auth-error').classList.add('hidden'); 
        }

        if (session?.user) {
            currentUser = session.user;
            authScreen.classList.add('hidden');
            authScreen.classList.remove('flex');
            appDashboard.classList.remove('hidden');
            appDashboard.classList.add('flex'); 
            
            document.getElementById('user-email-display').innerText = currentUser.email;
            await loadPortfolioFromCloud();
        } else {
            currentUser = null;
            authScreen.classList.remove('hidden');
            authScreen.classList.add('flex');
            appDashboard.classList.add('hidden');
            appDashboard.classList.remove('flex');
            
            document.getElementById('auth-email').value = '';
            document.getElementById('auth-password').value = '';
        }
    });
});

async function loadPortfolioFromCloud() {
    if (!currentUser || !window.supabaseClient) return;
    const { data, error } = await window.supabaseClient
        .from('portfolios')
        .select('state')
        .eq('user_id', currentUser.id)
        .single();

    if (data && data.state) {
        systemState = data.state;
        migrateLegacyState();
        refreshAllData();
        window.showToast("Cloud ledger synced securely.");
    } else if (error && error.code === 'PGRST116') {
        systemState = { usdToNgnRate: 1510.50, usdRateManualOverride: false, brokers: ['Trove', 'Wealth'], stocks: [], funds: [], pensions: [], usdAssets: [], loans: [], incomes: [], budgets: [], budgetHistory: [] };
        migrateLegacyState();
        await persistState();
        refreshAllData();
    }
}

async function persistState() {
    if (currentUser && window.supabaseClient) {
        await window.supabaseClient.from('portfolios').upsert({
            user_id: currentUser.id,
            state: systemState,
            updated_at: new Date().toISOString()
        });
    }
}

window.togglePasswordVisibility = function() {
    const pwdInput = document.getElementById('auth-password');
    const eyeClosed = document.getElementById('eye-icon-closed');
    const eyeOpen = document.getElementById('eye-icon-open');
    
    if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        eyeClosed.classList.add('hidden');
        eyeOpen.classList.remove('hidden');
    } else {
        pwdInput.type = 'password';
        eyeClosed.classList.remove('hidden');
        eyeOpen.classList.add('hidden');
    }
};

window.toggleAuthMode = function() {
    isSignUpMode = !isSignUpMode;
    document.getElementById('auth-title').innerText = isSignUpMode ? 'Create a new account' : 'Sign in to access your ledger';
    document.getElementById('auth-submit-btn').innerText = isSignUpMode ? 'Create Account' : 'Sign In';
    document.getElementById('auth-toggle-btn').innerText = isSignUpMode ? 'Already have an account? Sign In' : "Don't have an account? Sign Up";
    document.getElementById('auth-error').classList.add('hidden');
};

window.showAuthMessage = function(msg, isSuccess = false) {
    const errorEl = document.getElementById('auth-error');
    errorEl.innerText = msg;
    errorEl.classList.remove('hidden');
    
    if (isSuccess) {
        errorEl.className = "text-xs p-3 rounded-lg text-center text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
    } else {
        errorEl.className = "text-xs p-3 rounded-lg text-center text-rose-400 bg-rose-500/10 border border-rose-500/20";
    }
};

window.handleAuthSubmit = async function() {
    if (!window.supabaseClient) {
        window.showAuthMessage("Supabase client not loaded. Check network.", false);
        return;
    }

    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const submitBtn = document.getElementById('auth-submit-btn');
    
    document.getElementById('auth-error').classList.add('hidden');

    if(!email || !password) {
        window.showAuthMessage("Please enter both email and password.", false);
        return;
    }

    const originalBtnText = submitBtn.innerText;
    submitBtn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Processing...`;
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-80', 'cursor-not-allowed');

    try {
        let result;
        if (isSignUpMode) {
            result = await window.supabaseClient.auth.signUp({ email, password });
        } else {
            result = await window.supabaseClient.auth.signInWithPassword({ email, password });
        }

        submitBtn.innerText = originalBtnText;
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-80', 'cursor-not-allowed');

        if (result.error) {
            window.showAuthMessage(result.error.message, false);
        } else if (isSignUpMode && result.data && !result.data.session) {
            window.showAuthMessage("Success! Please check your email inbox to verify your account.", true);
            
            setTimeout(() => {
                if(isSignUpMode) window.toggleAuthMode();
                document.getElementById('auth-email').value = email;
                document.getElementById('auth-password').value = '';
            }, 2000);
        }
    } catch (err) {
        submitBtn.innerText = originalBtnText;
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-80', 'cursor-not-allowed');
        window.showAuthMessage("An unexpected system error occurred.", false);
    }
};

function handleSignOut() {
    if (window.supabaseClient) window.supabaseClient.auth.signOut();
}

function migrateLegacyState() {
    if(!systemState.budgetHistory) systemState.budgetHistory = [];
    if(!systemState.incomes) systemState.incomes = [];
    if(!systemState.brokers) systemState.brokers = ['Trove', 'Wealth'];
    if(!systemState.stocks) systemState.stocks = [];
    systemState.stocks.forEach(s => {
        if(!s.holdings) {
            s.holdings = {
                Trove: { cost: s.troveCost || 0, units: s.troveUnits || 0 },
                Wealth: { cost: s.wealthCost || 0, units: s.wealthUnits || 0 }
            };
        }
        systemState.brokers.forEach(b => {
            if(!s.holdings[b]) s.holdings[b] = { cost: 0, units: 0 };
        });
    });
}

function switchTab(targetTab) {
    ['portfolio', 'loans', 'budgeting'].forEach(tab => {
        document.getElementById(`view-${tab}`).classList.add('hidden');
        document.getElementById(`tab-${tab}`).className = "px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-slate-400 hover:text-white flex items-center gap-2 hover:bg-slate-800/50";
    });
    document.getElementById(`view-${targetTab}`).classList.remove('hidden');
    document.getElementById(`tab-${targetTab}`).className = "px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-2";
    if(targetTab === 'portfolio') recomputeAllLedgers();
}

function openModal(id) { 
    const m = document.getElementById(id);
    m.classList.remove('hidden'); m.classList.add('flex'); 
}
function closeModal(id) { 
    const m = document.getElementById(id);
    m.classList.add('hidden'); m.classList.remove('flex'); 
}

async function refreshAllData() {
    const syncIcon = document.getElementById('sync-icon');
    if(syncIcon) syncIcon.classList.add('animate-spin');
    
    await fetchOfficialUsdRate();
    await syncAllStockPrices();
    
    if(syncIcon) syncIcon.classList.remove('animate-spin');
    window.showToast('Market data & rates synchronized.');
}

async function fetchOfficialUsdRate() {
    if(systemState.usdRateManualOverride) return;
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        if(data?.rates?.NGN) systemState.usdToNgnRate = parseFloat(data.rates.NGN);
    } catch(err) { console.warn("Rate fetch failed", err); }
    document.getElementById('usd-rate-input').value = systemState.usdToNgnRate.toFixed(2);
}

function updateUsdRateManually(value) {
    const parsed = parseFloat(value);
    if(!isNaN(parsed) && parsed > 0) {
        systemState.usdToNgnRate = parsed;
        systemState.usdRateManualOverride = true;
        document.getElementById('usd-rate-dot').className = "w-2 h-2 rounded-full bg-amber-500";
        recomputeAllLedgers();
        window.showToast("Manual USD rate applied.");
    }
}

async function resetUsdRateToLive() {
    systemState.usdRateManualOverride = false;
    document.getElementById('usd-rate-dot').className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
    await fetchOfficialUsdRate();
    recomputeAllLedgers();
    window.showToast("Reverted to live USD rate.");
}

function getEmptyRowHtml(colSpan, typeName) {
    return `<tr><td colspan="${colSpan}" class="px-4 py-10 text-center bg-slate-900/20"><p class="text-slate-500 text-xs italic">No ${typeName} logged yet. Add your first entry above.</p></td></tr>`;
}

function formatDateLocal(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function deleteAsset(type, idx) {
    if(confirm("Are you sure you want to permanently delete this entry?")) { 
        systemState[type].splice(idx, 1); 
        window.showToast("Entry permanently deleted.", "error");
        recomputeAllLedgers(); 
    }
}

function recomputeAllLedgers() {
    let stocksCostSubtotal = 0, stocksValueSubtotal = 0;
    systemState.stocks.forEach(s => {
        const holdingValues = Object.values(s.holdings || {});
        s.totalUnits = holdingValues.reduce((sum, h) => sum + (parseFloat(h.units) || 0), 0);
        s.totalCost = holdingValues.reduce((sum, h) => sum + ((parseFloat(h.cost) || 0) * (parseFloat(h.units) || 0)), 0);
        s.currentValue = s.totalUnits * (parseFloat(s.livePrice) || 0);
        s.netReturn = s.currentValue - s.totalCost;
        stocksCostSubtotal += s.totalCost;
        stocksValueSubtotal += s.currentValue;
    });

    let fundsCostSubtotal = 0, fundsValueSubtotal = 0;
    systemState.funds.forEach(f => {
        f.currentValue = (parseFloat(f.cost) || 0) + (parseFloat(f.interest) || 0);
        fundsCostSubtotal += (parseFloat(f.cost) || 0);
        fundsValueSubtotal += f.currentValue;
    });

    let pensionCostSubtotal = 0, pensionValueSubtotal = 0;
    systemState.pensions.forEach(p => {
        p.currentValue = (parseFloat(p.cost) || 0) + (parseFloat(p.interest) || 0);
        pensionCostSubtotal += (parseFloat(p.cost) || 0);
        pensionValueSubtotal += p.currentValue;
    });

    let usdCostSubtotalNGN = 0, usdValueSubtotalNGN = 0;
    systemState.usdAssets.forEach(u => {
        u.valUSD = (parseFloat(u.cost) || 0) + (parseFloat(u.interest) || 0);
        u.currentValueNGN = u.valUSD * systemState.usdToNgnRate;
        u.costNGN = (parseFloat(u.cost) || 0) * systemState.usdToNgnRate;
        usdCostSubtotalNGN += u.costNGN;
        usdValueSubtotalNGN += u.currentValueNGN;
    });

    const grandTotalValue = stocksValueSubtotal + fundsValueSubtotal + pensionValueSubtotal + usdValueSubtotalNGN;
    const grandTotalCost = stocksCostSubtotal + fundsCostSubtotal + pensionCostSubtotal + usdCostSubtotalNGN;
    const absoluteGainLoss = grandTotalValue - grandTotalCost;
    const combinedRoi = grandTotalCost > 0 ? (absoluteGainLoss / grandTotalCost) * 100 : 0;

    document.getElementById('kpi-total-value').innerText = `₦${grandTotalValue.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    document.getElementById('kpi-total-cost').innerText = `₦${grandTotalCost.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    document.getElementById('kpi-total-gain').innerText = `₦${absoluteGainLoss.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    document.getElementById('kpi-total-roi').innerText = `${combinedRoi.toFixed(2)}%`;

    renderStocksTable(stocksValueSubtotal, grandTotalValue);
    renderFundsTable(fundsValueSubtotal, grandTotalValue);
    renderPensionTable(pensionValueSubtotal, grandTotalValue);
    renderUsdTable(usdValueSubtotalNGN, grandTotalValue);
    
    // Call external domain logic
    processLoansEngine();
    processBudgetEngine();
    renderTickerTape();
    triggerChartRebuilds(stocksValueSubtotal, fundsValueSubtotal, pensionValueSubtotal, usdValueSubtotalNGN);
    
    persistState();
}
