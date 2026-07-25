// js/budget.js

window.switchBudgetPeriod = function(id) {
    currentBudgetViewId = id;
    processBudgetEngine();
};

window.openArchiveModal = function() {
    if (!systemState.budgets || systemState.budgets.length === 0) {
        window.showToast("No active budget categories to archive.", "error");
        return;
    }
    
    const now = new Date();
    archiveSelectedYear = now.getFullYear();
    archiveSelectedMonth = now.getMonth();
    window.renderArchiveCalendar();
    
    openModal('archive-budget-modal');
};

window.renderArchiveCalendar = function() {
    document.getElementById('archive-year-display').innerText = archiveSelectedYear;
    const grid = document.getElementById('archive-month-grid');
    grid.innerHTML = monthsNames.map((m, i) => {
        const isSelected = i === archiveSelectedMonth;
        const classes = isSelected 
            ? "bg-emerald-600 text-white font-bold border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
            : "bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-white border-transparent";
        return `<button onclick="window.selectArchiveMonth(${i})" class="py-2.5 text-xs rounded-lg border transition-all ${classes}">${m}</button>`;
    }).join('');
};

window.changeArchiveYear = function(delta) {
    archiveSelectedYear += delta;
    window.renderArchiveCalendar();
};

window.selectArchiveMonth = function(idx) {
    archiveSelectedMonth = idx;
    window.renderArchiveCalendar();
};

window.confirmArchiveMonth = function() {
    const monthName = `${monthsNames[archiveSelectedMonth]} ${archiveSelectedYear}`;

    if(systemState.budgetHistory.find(a => a.label === monthName)) {
        if(!confirm(`An archive for ${monthName} already exists. Overwrite?`)) return;
        systemState.budgetHistory = systemState.budgetHistory.filter(a => a.label !== monthName);
    }

    const snapshot = {
        id: 'ARCHIVE-' + Date.now(),
        label: monthName,
        dateSaved: new Date().toISOString(),
        budgets: JSON.parse(JSON.stringify(systemState.budgets)),
        incomes: JSON.parse(JSON.stringify(systemState.incomes))
    };

    if(!systemState.budgetHistory) systemState.budgetHistory = [];
    systemState.budgetHistory.push(snapshot);
    systemState.budgets.forEach(b => b.actual = 0);

    closeModal('archive-budget-modal');
    recomputeAllLedgers();
    window.showToast(`Archived as "${monthName}". Spending reset to ₦0.`);
};

window.deleteCurrentArchive = function() {
    if(currentBudgetViewId === 'live') return;
    if(confirm("Permanently delete this archived snapshot?")) {
        systemState.budgetHistory = systemState.budgetHistory.filter(a => a.id !== currentBudgetViewId);
        currentBudgetViewId = 'live'; 
        recomputeAllLedgers(); 
        window.showToast("Snapshot deleted.", "error");
    }
};

function processBudgetEngine() {
    const isLive = currentBudgetViewId === 'live';
    let viewBudgets = systemState.budgets;
    let viewIncomes = systemState.incomes;

    if (!isLive) {
        const archive = systemState.budgetHistory.find(a => a.id === currentBudgetViewId);
        if (archive) {
            viewBudgets = archive.budgets;
            viewIncomes = archive.incomes;
        } else {
            currentBudgetViewId = 'live'; 
        }
    }

    const selector = document.getElementById('budget-period-selector');
    const historyOptions = (systemState.budgetHistory || [])
        .sort((a,b) => new Date(b.dateSaved) - new Date(a.dateSaved))
        .map(a => `<option value="${a.id}">${a.label}</option>`).join('');
    selector.innerHTML = `<option value="live">Current Period (Live)</option>` + historyOptions;
    selector.value = currentBudgetViewId;

    document.getElementById('btn-archive-budget').classList.toggle('hidden', !isLive);
    document.getElementById('btn-delete-archive').classList.toggle('hidden', isLive);
    
    document.getElementById('income-form-wrapper').classList.toggle('hidden', !isLive);
    document.getElementById('envelope-form-wrapper').classList.toggle('hidden', !isLive);
    document.getElementById('readonly-budget-notice').classList.toggle('hidden', isLive);

    renderIncomeList(viewIncomes, isLive);
    
    const totalIncome = (viewIncomes || []).reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

    const tbody = document.getElementById('budget-table-body'); 
    tbody.innerHTML = '';
    
    if(!viewBudgets || viewBudgets.length === 0) {
        tbody.innerHTML = getEmptyRowHtml(6, isLive ? "budget envelopes" : "archived envelopes");
        document.getElementById('kpi-budget-income').innerText = `₦${totalIncome.toLocaleString()}`;
        document.getElementById('kpi-budget-allocated').innerText = `₦0.00`;
        document.getElementById('kpi-budget-actual').innerText = `₦0.00`;
        document.getElementById('kpi-budget-variance').innerText = `₦${totalIncome.toLocaleString()}`;
        return;
    }

    let capAgg = 0, actAgg = 0;
    viewBudgets.forEach((b, idx) => {
        let v = b.cap - b.actual; capAgg += b.cap; actAgg += b.actual;
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-900/40 border-b border-slate-800/40 text-slate-300";
        
        const actionsHtml = isLive 
            ? `<button onclick="launchExpenseModal(${idx})" class="bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 px-3 py-1.5 rounded transition text-[11px] font-semibold shadow-sm border border-blue-500/20">Log Spend</button>
               <button onclick="openBudgetModal(${idx})" class="text-blue-400 hover:text-blue-300 text-xs font-medium transition ml-1 mr-1">Edit</button>
               <button onclick="deleteBudgetCategory(${idx})" class="text-rose-500/80 hover:text-rose-400 text-xs font-medium transition">Delete</button>`
            : `<span class="text-slate-500 text-[10px] uppercase tracking-wider font-semibold bg-slate-800/50 px-2.5 py-1.5 rounded shadow-inner">Archived</span>`;

        tr.innerHTML = `
            <td class="px-6 py-4"><span class="font-bold text-white bg-slate-800/50 px-2 py-1 rounded shadow-inner">${b.name}</span></td>
            <td class="px-6 py-4 text-right font-medium text-slate-400">₦${b.cap.toLocaleString()}</td>
            <td class="px-6 py-4 text-right font-bold text-blue-400">₦${b.actual.toLocaleString()}</td>
            <td class="px-6 py-4 text-right font-bold ${v>=0?'text-emerald-400':'text-rose-400'}">₦${v.toLocaleString()}</td>
            <td class="px-6 py-4 text-center">${v>=0?'<span class="px-2.5 py-1 bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 rounded-full text-[10px] font-bold tracking-wider">SAFE</span>':'<span class="px-2.5 py-1 bg-rose-950/60 border border-rose-800/60 text-rose-400 rounded-full text-[10px] font-bold tracking-wider animate-pulse">ALERT</span>'}</td>
            <td class="px-6 py-4 text-center whitespace-nowrap">${actionsHtml}</td>
        `;
        tbody.appendChild(tr);
    });
    
    document.getElementById('kpi-budget-income').innerText = `₦${totalIncome.toLocaleString()}`;
    document.getElementById('kpi-budget-allocated').innerText = `₦${capAgg.toLocaleString()}`;
    document.getElementById('kpi-budget-actual').innerText = `₦${actAgg.toLocaleString()}`;
    document.getElementById('kpi-budget-variance').innerText = `₦${(totalIncome - actAgg).toLocaleString()}`;
}

function openBudgetHistory() {
    const container = document.getElementById('budget-history-container');
    if (!systemState.budgetHistory || systemState.budgetHistory.length === 0) {
        container.innerHTML = '<p class="text-sm text-slate-500 text-center py-10 italic">No historical budget snapshots saved.</p>';
    } else {
        const sortedHistory = [...systemState.budgetHistory].sort((a, b) => new Date(b.dateSaved) - new Date(a.dateSaved));
        container.innerHTML = sortedHistory.map(archive => {
            const totalIncome = archive.incomes.reduce((sum, inc) => sum + (parseFloat(inc.amount) || 0), 0);
            const totalAllocated = archive.budgets.reduce((sum, b) => sum + b.cap, 0);
            const totalSpent = archive.budgets.reduce((sum, b) => sum + b.actual, 0);
            
            const incomeHtml = archive.incomes && archive.incomes.length > 0
                ? archive.incomes.map(inc => `
                    <div class="flex justify-between items-center text-xs py-1.5 border-b border-slate-800/50 last:border-0 hover:bg-slate-900/30 px-2 rounded">
                        <span class="text-slate-300 font-medium">${inc.name}</span>
                        <span class="text-emerald-400 font-bold">₦${parseFloat(inc.amount).toLocaleString()}</span>
                    </div>
                `).join('')
                : '<p class="text-xs text-slate-500 italic px-2">No income sources recorded.</p>';

            const envelopeHtml = archive.budgets && archive.budgets.length > 0
                ? archive.budgets.map(b => `
                    <div class="flex justify-between items-center text-xs py-1.5 border-b border-slate-800/50 last:border-0 hover:bg-slate-900/30 px-2 rounded">
                        <span class="text-slate-300 font-medium">${b.name}</span>
                        <div class="flex gap-4 text-right">
                            <span class="w-24 text-slate-500">Cap: ₦${b.cap.toLocaleString()}</span>
                            <span class="w-24 font-bold ${b.actual > b.cap ? 'text-rose-400' : 'text-blue-400'}">Spent: ₦${b.actual.toLocaleString()}</span>
                        </div>
                    </div>
                `).join('')
                : '<p class="text-xs text-slate-500 italic px-2">No budget envelopes recorded.</p>';

            return `
                <div class="bg-gradient-to-b from-[#131A22] to-slate-900/50 border border-slate-800 rounded-xl p-5 mb-5 shadow-lg">
                    <div class="flex justify-between items-center mb-4 pb-3 border-b border-slate-700">
                        <h4 class="font-bold text-emerald-400 text-base flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> ${archive.label}</h4>
                        <span class="text-[10px] text-slate-500 uppercase tracking-wider font-medium">${new Date(archive.dateSaved).toLocaleDateString()}</span>
                    </div>
                    <div class="grid grid-cols-3 gap-3 text-xs mb-5 p-3 bg-[#0B0F13] rounded-lg border border-slate-800/80 shadow-inner">
                        <div><span class="block text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Income</span><span class="text-white font-bold text-sm">₦${totalIncome.toLocaleString()}</span></div>
                        <div><span class="block text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Allocated</span><span class="text-white font-bold text-sm">₦${totalAllocated.toLocaleString()}</span></div>
                        <div><span class="block text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Spent</span><span class="font-bold text-sm ${totalSpent > totalIncome ? 'text-rose-400' : 'text-blue-400'}">₦${totalSpent.toLocaleString()}</span></div>
                    </div>
                    <div class="space-y-4">
                        <div>
                            <h5 class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800 pb-1 mb-2">Income Sources</h5>
                            ${incomeHtml}
                        </div>
                        <div>
                            <h5 class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800 pb-1 mb-2">Expenses / Envelopes</h5>
                            ${envelopeHtml}
                        </div>
                    </div>
                    <div class="mt-5 pt-3 text-right border-t border-slate-800/50">
                        <button onclick="window.deleteBudgetArchive('${archive.id}')" class="text-rose-500 hover:text-white bg-rose-500/10 hover:bg-rose-500 transition px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider">Delete Archive</button>
                    </div>
                </div>
            `;
        }).join('');
    }
    openModal('budget-history-modal');
}

window.deleteBudgetArchive = function(archiveId) {
    if(confirm("Are you sure you want to permanently delete this snapshot?")) {
        systemState.budgetHistory = systemState.budgetHistory.filter(a => a.id !== archiveId);
        persistState(); 
        
        if (currentBudgetViewId === archiveId) {
            currentBudgetViewId = 'live';
            recomputeAllLedgers();
        }
        
        openBudgetHistory(); 
        window.showToast("Snapshot deleted.", "error");
    }
};

function renderIncomeList(incomesList, isLive) {
    const container = document.getElementById('income-list');
    if(!container) return;
    if(!incomesList || incomesList.length === 0) {
        container.innerHTML = `<div class="bg-slate-900/20 border border-slate-800/50 rounded-lg py-6 flex flex-col items-center justify-center"><svg class="w-6 h-6 text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg><p class="text-xs text-slate-500 italic text-center">No income sources set.<br>Add your primary cash flow below.</p></div>`;
        return;
    }
    container.innerHTML = incomesList.map(inc => `
        <div class="flex items-center justify-between bg-[#0B0F13] border border-slate-800 rounded-lg px-3 py-2.5 text-xs shadow-sm group hover:border-slate-700 transition">
            <span class="text-slate-200 font-medium">${inc.name}</span>
            <span class="flex items-center gap-3">
                <span class="text-emerald-400 font-bold">₦${(parseFloat(inc.amount)||0).toLocaleString()}</span>
                ${isLive ? `<button onclick="removeIncomeSource('${inc.id}')" class="text-slate-600 group-hover:text-rose-400 font-bold transition w-5 h-5 flex items-center justify-center rounded hover:bg-rose-500/10">&times;</button>` : ''}
            </span>
        </div>
    `).join('');
}

function addIncomeSource() {
    const nameField = document.getElementById('new-income-name');
    const amountField = document.getElementById('new-income-amount');
    const name = nameField.value.trim();
    const amount = parseFloat(amountField.value);
    if(name && !isNaN(amount) && amount >= 0) {
        systemState.incomes.push({ id: 'INC-' + Math.floor(Math.random()*90000), name, amount });
        nameField.value = ''; amountField.value = '';
        recomputeAllLedgers();
        window.showToast("Income source added.");
    }
}

function removeIncomeSource(id) {
    systemState.incomes = systemState.incomes.filter(i => i.id !== id);
    recomputeAllLedgers();
    window.showToast("Income removed.", "error");
}

function launchExpenseModal(idx) {
    document.getElementById('expense-category-index').value = idx;
    document.getElementById('expense-amount').value = '';
    openModal('expense-modal');
}

function openBudgetModal(idx = -1) {
    document.getElementById('budget-edit-index').value = idx;
    if(idx >= 0 && systemState.budgets[idx]) {
        const b = systemState.budgets[idx];
        document.getElementById('edit-budget-name').value = b.name || '';
        document.getElementById('edit-budget-cap').value = b.cap || 0;
        document.getElementById('edit-budget-actual').value = b.actual || 0;
    }
    openModal('budget-category-modal');
}

function saveBudgetCategoryModal() {
    const idx = parseInt(document.getElementById('budget-edit-index').value);
    const name = document.getElementById('edit-budget-name').value.trim();
    const cap = parseFloat(document.getElementById('edit-budget-cap').value) || 0;
    const actual = parseFloat(document.getElementById('edit-budget-actual').value) || 0;
    if(name && idx >= 0 && idx < systemState.budgets.length) {
        systemState.budgets[idx] = { name, cap, actual };
        closeModal('budget-category-modal');
        recomputeAllLedgers();
        window.showToast("Envelope updated.");
    }
}

function deleteBudgetCategory(idx) {
    if(confirm("Delete this budget category envelope?")) {
        systemState.budgets.splice(idx, 1);
        recomputeAllLedgers();
        window.showToast("Envelope removed.", "error");
    }
}

function addBudgetCategory() {
    const name = document.getElementById('new-budget-name').value.trim();
    const cap = parseFloat(document.getElementById('new-budget-cap').value);
    if(name && !isNaN(cap)) { 
        systemState.budgets.push({ name, cap, actual: 0 }); 
        document.getElementById('new-budget-name').value = '';
        document.getElementById('new-budget-cap').value = '';
        recomputeAllLedgers(); 
        window.showToast("Envelope provisioned.");
    }
}

function saveBudgetExpense() {
    const idx = document.getElementById('expense-category-index').value;
    const amt = parseFloat(document.getElementById('expense-amount').value);
    if(!isNaN(amt) && systemState.budgets[idx]) { 
        systemState.budgets[idx].actual += amt; 
        closeModal('expense-modal'); 
        recomputeAllLedgers(); 
        window.showToast("Expenditure logged.");
    }
}
