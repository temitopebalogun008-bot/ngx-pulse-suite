// js/loans.js

function processLoansEngine() {
    const tbody = document.getElementById('loans-table-body'); tbody.innerHTML = '';
    if(systemState.loans.length === 0) {
        tbody.innerHTML = getEmptyRowHtml(9, "debt facilities"); 
        document.getElementById('kpi-loan-principal').innerText = `₦0.00`;
        document.getElementById('kpi-loan-interest').innerText = `₦0.00`;
        document.getElementById('kpi-loan-outstanding').innerText = `₦0.00`;
        return;
    }

    let pAgg = 0, iAgg = 0, oAgg = 0;
    systemState.loans.forEach((loan, idx) => {
        let rPrincipal = parseFloat(loan.amount) || 0, accInt = 0, totalRepaid = 0;
        
        const parts = loan.date.split('-');
        let scanDate = new Date(parts[0], parts[1] - 1, parts[2]);
        let curDate = new Date();
        curDate.setHours(0,0,0,0);

        while (scanDate <= curDate) {
            accInt += rPrincipal * ((parseFloat(loan.rate) / 100) / 365);
            const dateStr = formatDateLocal(scanDate);
            (loan.repayments || []).filter(r => r.date === dateStr).forEach(p => {
                rPrincipal -= parseFloat(p.amount); 
                totalRepaid += parseFloat(p.amount);
            });
            scanDate.setDate(scanDate.getDate() + 1);
        }
        if(rPrincipal < 0) rPrincipal = 0;

        let currentBalance = rPrincipal + accInt;
        pAgg += loan.amount; iAgg += accInt; oAgg += currentBalance;

        const historyHtml = (loan.repayments && loan.repayments.length > 0)
            ? loan.repayments.map((r, rIdx) => `
                <span class="inline-flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-[10px] px-2 py-1 rounded-md my-0.5 font-mono shadow-sm">
                    <span>Batch #${rIdx+1}: ₦${parseFloat(r.amount).toLocaleString()} (${r.date})</span>
                    <button onclick="deleteLoanRepayment(${idx}, ${rIdx})" class="text-rose-400 hover:text-rose-300 font-bold ml-1 text-xs" title="Remove Batch">&times;</button>
                </span>
            `).join(' ')
            : '<span class="text-slate-500 italic text-[10px]">No batch payments logged</span>';

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-900/40 border-b border-slate-800/40 text-slate-300";
        tr.innerHTML = `
            <td class="px-4 py-4 font-bold text-white"><span class="bg-slate-800/50 px-2 py-1 rounded">${loan.provider}</span></td>
            <td class="px-4 py-4 text-right text-slate-400 font-medium">₦${loan.amount.toLocaleString()}</td>
            <td class="px-4 py-4 text-center text-slate-400">${loan.date}</td>
            <td class="px-4 py-4 text-right font-medium">${loan.rate}%</td>
            <td class="px-4 py-4 text-right text-rose-400 font-medium">₦${accInt.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
            <td class="px-4 py-4 text-right text-emerald-400 font-medium">₦${totalRepaid.toLocaleString()}</td>
            <td class="px-4 py-4 text-right font-bold text-rose-500">₦${currentBalance.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
            <td class="px-4 py-4"><div class="flex flex-wrap gap-1 max-w-xs">${historyHtml}</div></td>
            <td class="px-4 py-4 text-center space-y-1.5">
                <button onclick="launchRepaymentModal('${loan.id}')" class="block w-full bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 px-2 py-1.5 rounded transition text-[10px] font-semibold border border-emerald-500/20 shadow-sm">+ Pay Tranche</button>
                <button onclick="deleteAsset('loans', ${idx})" class="block w-full text-rose-500/80 hover:text-rose-400 text-[10px] py-1 transition">Delete Loan</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    document.getElementById('kpi-loan-principal').innerText = `₦${pAgg.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    document.getElementById('kpi-loan-interest').innerText = `₦${iAgg.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    document.getElementById('kpi-loan-outstanding').innerText = `₦${oAgg.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
}

function launchRepaymentModal(loanId) {
    document.getElementById('repayment-loan-id').value = loanId;
    document.getElementById('repayment-date').value = new Date().toISOString().split('T')[0];
    openModal('repayment-modal');
}

function saveLoanRepayment() {
    const id = document.getElementById('repayment-loan-id').value;
    const amount = parseFloat(document.getElementById('repayment-amount').value);
    const date = document.getElementById('repayment-date').value;
    if(id && !isNaN(amount) && amount > 0 && date) { 
        const targetLoan = systemState.loans.find(l => l.id === id);
        if(targetLoan) {
            if(!targetLoan.repayments) targetLoan.repayments = [];
            targetLoan.repayments.push({ amount, date }); 
        }
        closeModal('repayment-modal'); 
        window.showToast("Repayment tranche logged.");
        recomputeAllLedgers(); 
    }
}

function deleteLoanRepayment(loanIndex, repaymentIndex) {
    if(confirm("Delete this batch repayment tranche record?")) {
        systemState.loans[loanIndex].repayments.splice(repaymentIndex, 1);
        window.showToast("Repayment removed.", "error");
        recomputeAllLedgers();
    }
}

function saveNewLoan() {
    const provider = document.getElementById('loan-provider').value;
    const amount = parseFloat(document.getElementById('loan-amount').value) || 0;
    const date = document.getElementById('loan-date').value;
    const rate = parseFloat(document.getElementById('loan-rate').value) || 0;
    if(provider && amount && date) { 
        systemState.loans.push({ id: 'L-'+Math.floor(Math.random()*9000), provider, amount, date, rate, repayments: [] }); 
        closeModal('loan-modal'); 
        window.showToast("Liability facility provisioned.");
        recomputeAllLedgers(); 
    }
}
