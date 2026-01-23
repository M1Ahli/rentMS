// ================================================
// 09_expenses.js - Expenses
// Auto-split from legacy app.js for maintainability.
// DO NOT edit the legacy file directly; edit split modules.
// ================================================

  // ================= EXPENSES =================
  let _expensesAdvInited = false;

  function _expenseNorm(v){
    return (v===null || v===undefined) ? '' : String(v).trim().toLowerCase();
  }
  function _expenseDateNum(s){
    const v = (s||'').toString().slice(0,10);
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : NaN;
  }
  function _expenseHay(e){
    return [
      e.id, e.date, e.type, e.amount, e.details
    ].filter(Boolean).join(' | ');
  }

  function _expensesUi(){
    const dirBtn = document.getElementById('expenses-sort-dir');
    return {
      q: document.getElementById('expenses-search-input')?.value || '',
      sortBy: document.getElementById('expenses-sort-by')?.value || '',
      sortDir: dirBtn?.dataset?.dir || '',
      type: document.getElementById('expenses-filter-type')?.value || '',
      amountMin: document.getElementById('expenses-filter-amount-min')?.value || '',
      amountMax: document.getElementById('expenses-filter-amount-max')?.value || '',
      dateFrom: document.getElementById('expenses-filter-date-from')?.value || '',
      dateTo: document.getElementById('expenses-filter-date-to')?.value || '',
    };
  }

  function _expensesPersistFromUI(){
    const ui = _expensesUi();
    _lsSet('re_expenses_q', ui.q);
    _lsSet('re_expenses_sort_by', ui.sortBy || _lsGet('re_expenses_sort_by','date'));
    _lsSet('re_expenses_sort_dir', ui.sortDir || _lsGet('re_expenses_sort_dir','desc'));

    _lsSet('re_expenses_f_type', ui.type);
    _lsSet('re_expenses_f_amin', ui.amountMin);
    _lsSet('re_expenses_f_amax', ui.amountMax);
    _lsSet('re_expenses_f_dfrom', ui.dateFrom);
    _lsSet('re_expenses_f_dto', ui.dateTo);
  }

  function _expensesRestoreUIOnce(){
    if(_expensesAdvInited) return;
    _expensesAdvInited = true;

    const qEl = document.getElementById('expenses-search-input');
    if(qEl) qEl.value = _lsGet('re_expenses_q','');

    const sortByEl = document.getElementById('expenses-sort-by');
    if(sortByEl) sortByEl.value = _lsGet('re_expenses_sort_by','date');

    const dirBtn = document.getElementById('expenses-sort-dir');
    if(dirBtn){
      const d = _lsGet('re_expenses_sort_dir','desc');
      dirBtn.dataset.dir = (d==='asc') ? 'asc' : 'desc';
      dirBtn.textContent = (dirBtn.dataset.dir==='asc') ? '⬆️' : '⬇️';
    }

    const typeEl = document.getElementById('expenses-filter-type');
    if(typeEl) typeEl.value = _lsGet('re_expenses_f_type','');

    const aminEl = document.getElementById('expenses-filter-amount-min');
    if(aminEl) aminEl.value = _lsGet('re_expenses_f_amin','');

    const amaxEl = document.getElementById('expenses-filter-amount-max');
    if(amaxEl) amaxEl.value = _lsGet('re_expenses_f_amax','');

    const dfEl = document.getElementById('expenses-filter-date-from');
    if(dfEl) dfEl.value = _lsGet('re_expenses_f_dfrom','');

    const dtEl = document.getElementById('expenses-filter-date-to');
    if(dtEl) dtEl.value = _lsGet('re_expenses_f_dto','');

    const open = _lsGet('re_expenses_filters_open','0') === '1';
    const panel = document.getElementById('expenses-filters-panel');
    const tBtn = document.getElementById('expenses-toggle-filters');
    if(panel && tBtn){
      panel.classList.toggle('hidden', !open);
      _setLeaseFiltersBtnLabel(open);
      }
  }

  function _expensesState(){
    const ui = _expensesUi();
    return {
      q: _expenseNorm(ui.q || _lsGet('re_expenses_q','')),
      sortBy: ui.sortBy || _lsGet('re_expenses_sort_by','date'),
      sortDir: ui.sortDir || _lsGet('re_expenses_sort_dir','desc'),
      f: {
        type: ui.type || _lsGet('re_expenses_f_type',''),
        amountMin: ui.amountMin || _lsGet('re_expenses_f_amin',''),
        amountMax: ui.amountMax || _lsGet('re_expenses_f_amax',''),
        dateFrom: ui.dateFrom || _lsGet('re_expenses_f_dfrom',''),
        dateTo: ui.dateTo || _lsGet('re_expenses_f_dto',''),
      }
    };
  }

  function _expensesApply(list, st){
    const q = st.q;
    const f = st.f || {};
    const type = (f.type||'').trim();

    const amin = (f.amountMin!=='' && f.amountMin!==null && f.amountMin!==undefined) ? Number(f.amountMin) : NaN;
    const amax = (f.amountMax!=='' && f.amountMax!==null && f.amountMax!==undefined) ? Number(f.amountMax) : NaN;

    const dfrom = f.dateFrom ? _expenseDateNum(f.dateFrom) : NaN;
    const dto   = f.dateTo ? _expenseDateNum(f.dateTo) : NaN;

    return (list||[]).filter(e=>{
      if(q){
        const hay = _expenseNorm(_expenseHay(e));
        if(!hay.includes(q)) return false;
      }
      if(type && (e.type||'') !== type) return false;

      const amt = Number(e.amount);
      if(!Number.isNaN(amin) && (!Number.isFinite(amt) || amt < amin)) return false;
      if(!Number.isNaN(amax) && (!Number.isFinite(amt) || amt > amax)) return false;

      const d = _expenseDateNum(e.date);
      if(!Number.isNaN(dfrom) && (Number.isNaN(d) || d < dfrom)) return false;
      if(!Number.isNaN(dto) && (Number.isNaN(d) || d > dto)) return false;

      return true;
    });
  }

  function _sortExpenses(list, sortBy, sortDir){
    const dir = (sortDir==='asc') ? 1 : -1;
    const by = sortBy || 'date';
    return [...(list||[])].sort((a,b)=>{
      let va, vb;
      if(by==='amount'){
        va = Number(a.amount); vb = Number(b.amount);
        if(!Number.isFinite(va)) va = -Infinity;
        if(!Number.isFinite(vb)) vb = -Infinity;
      }else if(by==='type'){
        va = _expenseNorm(a.type); vb = _expenseNorm(b.type);
      }else{
        // date
        va = _expenseDateNum(a.date); vb = _expenseDateNum(b.date);
        if(!Number.isFinite(va)) va = -Infinity;
        if(!Number.isFinite(vb)) vb = -Infinity;
      }
      if(va < vb) return -1*dir;
      if(va > vb) return  1*dir;
      return 0;
    });
  }

  function onExpensesAdvancedChanged(){
    _expensesPersistFromUI();
    renderExpenses();
  }

  function toggleExpensesSortDir(){
    const btn = document.getElementById('expenses-sort-dir');
    if(!btn) return;
    const cur = (btn.dataset.dir==='asc') ? 'asc' : 'desc';
    const next = (cur==='asc') ? 'desc' : 'asc';
    btn.dataset.dir = next;
    btn.textContent = (next==='asc') ? '⬆️' : '⬇️';
    _lsSet('re_expenses_sort_dir', next);
    renderExpenses();
  }

  function toggleExpensesFilters(){
    const panel = document.getElementById('expenses-filters-panel');
    const btn = document.getElementById('expenses-toggle-filters');
    if(!panel || !btn) return;
    const willShow = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    btn.textContent = willShow ? 'إخفاء الفلاتر المتقدمة' : 'عرض الفلاتر المتقدمة';
    _lsSet('re_expenses_filters_open', willShow ? '1' : '0');
  }

  function resetExpensesAdvanced(){
    const keys = [
      're_expenses_q','re_expenses_sort_by','re_expenses_sort_dir','re_expenses_filters_open',
      're_expenses_f_type','re_expenses_f_amin','re_expenses_f_amax','re_expenses_f_dfrom','re_expenses_f_dto'
    ];
    keys.forEach(k=>{ try{ localStorage.removeItem(k);}catch(e){} });

    const qEl = document.getElementById('expenses-search-input'); if(qEl) qEl.value='';
    const sbEl = document.getElementById('expenses-sort-by'); if(sbEl) sbEl.value='date';
    const dirBtn = document.getElementById('expenses-sort-dir'); if(dirBtn){ dirBtn.dataset.dir='desc'; dirBtn.textContent='⬇️'; }
    const tEl = document.getElementById('expenses-filter-type'); if(tEl) tEl.value='';
    const aminEl = document.getElementById('expenses-filter-amount-min'); if(aminEl) aminEl.value='';
    const amaxEl = document.getElementById('expenses-filter-amount-max'); if(amaxEl) amaxEl.value='';
    const dfEl = document.getElementById('expenses-filter-date-from'); if(dfEl) dfEl.value='';
    const dtEl = document.getElementById('expenses-filter-date-to'); if(dtEl) dtEl.value='';

    const panel = document.getElementById('expenses-filters-panel'); 
    const btn = document.getElementById('expenses-toggle-filters');
    if(panel && btn){
      panel.classList.add('hidden');
      btn.textContent = 'عرض الفلاتر المتقدمة';
    }
    renderExpenses();
  }

  function renderExpenses(){
    _expensesRestoreUIOnce();

    const tbody = document.getElementById('expenses-table-body');
    if(!tbody) return;
    tbody.innerHTML='';

    const frag = document.createDocumentFragment();
const st = _expensesState();
    const filtered = _expensesApply(expenses, st);
    const finalList = _sortExpenses(filtered, st.sortBy, st.sortDir);

    const hint = document.getElementById('expenses-filter-hint');
    if(hint){
      const total = (expenses||[]).length;
      const shown = finalList.length;
      hint.textContent = (shown===total) ? `النتائج: ${shown}` : `النتائج: ${shown} من ${total}`;
    }

    const pg = paginateList(finalList, 'expenses', 25);



    pg.items.forEach((e)=>{
      const tr = document.createElement('tr');
      tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors";
      tr.innerHTML=`
        <td class="text-sm font-mono" dir="ltr">${escHtml(e.date)}</td>
        <td class="text-sm font-bold text-indigo-700 dark:text-indigo-400">${escHtml(e.type)}</td>
        <td class="font-bold text-rose-600 dark:text-rose-400" dir="ltr">${formatAED(e.amount)}</td>
        <td class="text-sm text-gray-600 dark:text-gray-300">${escHtml(e.details)}</td>
        <td class="text-center">
          <div class="flex items-center justify-center gap-2">
            <button onclick="previewReceipt('${escHtml(e.id)}', 'expense')" class="btn-ui btn-ui-sm btn-secondary">🖨️ سند صرف</button>
            <button onclick="deleteExpenseById('${escHtml(e.id)}')" class="btn-ui btn-ui-sm btn-icon btn-danger" title="حذف">🗑️</button>
          </div>
        </td>
      `;
      frag.appendChild(tr);
    });
  
  tbody.appendChild(frag);
      renderPagerUI('expenses', document.getElementById('expenses-pager'), pg);
}

  function deleteExpenseById(id){
    if(!confirm('حذف هذا المصروف؟')) return;
    expenses = (expenses||[]).filter(e => e.id !== id);
    saveToLocal();
    renderExpenses();
    renderReceiptsHistory();
  }

  function deleteExpense(index){
    // توافق مع النسخ القديمة: إذا تم تمرير index
    const item = (expenses||[])[index];
    if(!item || !item.id){
      if(!confirm('حذف هذا المصروف؟')) return;
      expenses.splice(index, 1);
      saveToLocal();
      renderExpenses();
      renderReceiptsHistory();
      return;
    }
    deleteExpenseById(item.id);
  }

  document.getElementById('new-expense-form').addEventListener('submit', e=>{
    e.preventDefault();

      const _expDate = (document.getElementById('expense-date').value||'').trim();
      const _expType = normalizeText(document.getElementById('expense-type').value, {collapseSpaces:false});
      const _expAmt  = parseMoney(document.getElementById('expense-amount').value);
      const _expDetails = normalizeText(document.getElementById('expense-details').value);
      if(!_expDate){ uiToast('error','الرجاء اختيار تاريخ المصروف.'); return; }
      if(!_expType){ uiToast('error','الرجاء اختيار نوع المصروف.'); return; }
      if(!_expAmt || _expAmt <= 0){ uiToast('error','الرجاء إدخال مبلغ مصروف صحيح.'); return; }

    expenses.push({
      id: 'EXP-'+Date.now(),
      date: _expDate,
      type: _expType,
      amount: _expAmt,
      details: _expDetails,
      voucherNo: nextVoucherNumber('expense')
    });
    saveToLocal();
    renderExpenses();
    renderReceiptsHistory();
    e.target.reset();
    logAction(`تم تسجيل مصروف جديد من نوع: ${document.getElementById('expense-type').value}`);
  });

