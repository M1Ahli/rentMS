// ================================================
// 11_receipts.js - Receipts history + Receipt preview/print
// Auto-split from legacy app.js for maintainability.
// DO NOT edit the legacy file directly; edit split modules.
// ================================================

  // ================= RECEIPTS HISTORY & PREVIEW =================
  
  // ================= RECEIPTS HISTORY (VOUCHERS) ADVANCED SEARCH =================
  let _receiptsAdvInited = false;

  function _receiptNorm(v){
    return (v===null || v===undefined) ? '' : String(v).trim().toLowerCase();
  }
  function _receiptDateNum(s){
    const v = (s||'').toString().slice(0,10);
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : NaN;
  }
  function _receiptHay(v){
    return [
      v.id, v.type, v.sourceType, v.date, v.amount,
      v.party, v.desc
    ].map(x=> (x===null||x===undefined) ? '' : String(x)).join(' ').trim().toLowerCase();
  }

  function _receiptsUi(){
    return {
      bar: document.getElementById('receipts-advanced-bar'),
      qEl: document.getElementById('receipts-search-input'),
      sortByEl: document.getElementById('receipts-sort-by'),
      sortDirBtn: document.getElementById('receipts-sort-dir'),
      hintEl: document.getElementById('receipts-advanced-hint'),
      toggleBtn: document.getElementById('receipts-toggle-filters'),
      panel: document.getElementById('receipts-filters-panel'),
      fType: document.getElementById('receipts-filter-type'),
      fSource: document.getElementById('receipts-filter-source'),
      fParty: document.getElementById('receipts-filter-party'),
      fDesc: document.getElementById('receipts-filter-desc'),
      fAMin: document.getElementById('receipts-filter-amin'),
      fAMax: document.getElementById('receipts-filter-amax'),
      fDFrom: document.getElementById('receipts-filter-dfrom'),
      fDTo: document.getElementById('receipts-filter-dto'),
    };
  }

  function _receiptsPersistFromUI(){
    const ui = _receiptsUi();
    if(!ui.bar) return;

    _lsSet('re_receipts_q', ui.qEl ? ui.qEl.value : '');
    _lsSet('re_receipts_sort_by', ui.sortByEl ? ui.sortByEl.value : 'date');
    _lsSet('re_receipts_sort_dir', ui.sortDirBtn ? (ui.sortDirBtn.dataset.dir||'desc') : 'desc');
    _lsSet('re_receipts_filters_open', (ui.panel && !ui.panel.classList.contains('hidden')) ? '1' : '0');

    _lsSet('re_receipts_f_type', ui.fType ? ui.fType.value : '');
    _lsSet('re_receipts_f_source', ui.fSource ? ui.fSource.value : '');
    _lsSet('re_receipts_f_party', ui.fParty ? ui.fParty.value : '');
    _lsSet('re_receipts_f_desc', ui.fDesc ? ui.fDesc.value : '');
    _lsSet('re_receipts_f_amin', ui.fAMin ? ui.fAMin.value : '');
    _lsSet('re_receipts_f_amax', ui.fAMax ? ui.fAMax.value : '');
    _lsSet('re_receipts_f_dfrom', ui.fDFrom ? ui.fDFrom.value : '');
    _lsSet('re_receipts_f_dto', ui.fDTo ? ui.fDTo.value : '');
  }

  function _receiptsRestoreUIOnce(){
    if(_receiptsAdvInited) return;
    _receiptsAdvInited = true;

    const ui = _receiptsUi();
    if(!ui.bar) return;

    if(ui.qEl) ui.qEl.value = _lsGet('re_receipts_q','');
    if(ui.sortByEl) ui.sortByEl.value = _lsGet('re_receipts_sort_by','date');

    const dir = _lsGet('re_receipts_sort_dir','desc');
    if(ui.sortDirBtn){
      ui.sortDirBtn.dataset.dir = (dir==='asc') ? 'asc' : 'desc';
      ui.sortDirBtn.textContent = (ui.sortDirBtn.dataset.dir==='asc') ? '⬆️' : '⬇️';
    }

    if(ui.fType) ui.fType.value = _lsGet('re_receipts_f_type','');
    if(ui.fSource) ui.fSource.value = _lsGet('re_receipts_f_source','');
    if(ui.fParty) ui.fParty.value = _lsGet('re_receipts_f_party','');
    if(ui.fDesc) ui.fDesc.value = _lsGet('re_receipts_f_desc','');
    if(ui.fAMin) ui.fAMin.value = _lsGet('re_receipts_f_amin','');
    if(ui.fAMax) ui.fAMax.value = _lsGet('re_receipts_f_amax','');
    if(ui.fDFrom) ui.fDFrom.value = _lsGet('re_receipts_f_dfrom','');
    if(ui.fDTo) ui.fDTo.value = _lsGet('re_receipts_f_dto','');

    const open = _lsGet('re_receipts_filters_open','0') === '1';
    if(ui.panel) ui.panel.classList.toggle('hidden', !open);
    if(ui.toggleBtn) ui.toggleBtn.textContent = open ? 'إخفاء الفلاتر المتقدمة' : 'عرض الفلاتر المتقدمة';
  }

  function _receiptsState(){
    const ui = _receiptsUi();
    return {
      q: _receiptNorm(ui.qEl ? ui.qEl.value : ''),
      sortBy: (ui.sortByEl ? ui.sortByEl.value : 'date') || 'date',
      sortDir: (ui.sortDirBtn ? (ui.sortDirBtn.dataset.dir||'desc') : 'desc') || 'desc',
      filters: {
        type: ui.fType ? ui.fType.value : '',
        source: ui.fSource ? ui.fSource.value : '',
        party: _receiptNorm(ui.fParty ? ui.fParty.value : ''),
        desc: _receiptNorm(ui.fDesc ? ui.fDesc.value : ''),
        amin: ui.fAMin ? ui.fAMin.value : '',
        amax: ui.fAMax ? ui.fAMax.value : '',
        dfrom: ui.fDFrom ? ui.fDFrom.value : '',
        dto: ui.fDTo ? ui.fDTo.value : '',
      }
    };
  }

  function _receiptsApply(list, st){
    const q = st.q;
    const f = st.filters || {};
    const type = f.type || '';
    const source = f.source || '';
    const party = f.party || '';
    const desc = f.desc || '';

    const aminRaw = (f.amin ?? '').toString().trim();
    const amaxRaw = (f.amax ?? '').toString().trim();
    const amin = (aminRaw === '') ? NaN : Number(aminRaw);
    const amax = (amaxRaw === '') ? NaN : Number(amaxRaw);
    const hasAmin = Number.isFinite(amin);
    const hasAmax = Number.isFinite(amax);

    const dfrom = f.dfrom ? _receiptDateNum(f.dfrom) : NaN;
    const dto = f.dto ? _receiptDateNum(f.dto) : NaN;
    const hasDfrom = Number.isFinite(dfrom);
    const hasDto = Number.isFinite(dto);

    let out = (list||[]).filter(v=>{
      if(q && !_receiptHay(v).includes(q)) return false;

      if(type && (v.type||'') !== type) return false;
      if(source && ((v.sourceType||v.source||'') !== source)) return false;

      if(party && !_receiptNorm(v.party).includes(party)) return false;
      if(desc && !_receiptNorm(v.desc).includes(desc)) return false;

      const a = Number(v.amount);
      if(hasAmin && (!Number.isFinite(a) || a < amin)) return false;
      if(hasAmax && (!Number.isFinite(a) || a > amax)) return false;

      const d = _receiptDateNum(v.date);
      if(hasDfrom && (!Number.isFinite(d) || d < dfrom)) return false;
      if(hasDto && (!Number.isFinite(d) || d > dto)) return false;

      return true;
    });

    const dir = (st.sortDir === 'asc') ? 1 : -1;
    out.sort((a,b)=>{
      let va, vb;
      switch(st.sortBy){
        case 'amount':
          va = Number(a.amount); vb = Number(b.amount);
          va = Number.isFinite(va) ? va : -Infinity;
          vb = Number.isFinite(vb) ? vb : -Infinity;
          break;
        case 'type':
          va = _receiptNorm(a.type); vb = _receiptNorm(b.type);
          break;
        case 'party':
          va = _receiptNorm(a.party); vb = _receiptNorm(b.party);
          break;
        case 'source':
          va = _receiptNorm(a.sourceType || a.source); vb = _receiptNorm(b.sourceType || b.source);
          break;
        case 'date':
        default:
          va = _receiptDateNum(a.date); vb = _receiptDateNum(b.date);
          va = Number.isFinite(va) ? va : -Infinity;
          vb = Number.isFinite(vb) ? vb : -Infinity;
          break;
      }
      if(va < vb) return -1 * dir;
      if(va > vb) return  1 * dir;
      return 0;
    });

    return out;
  }

  function onReceiptsAdvancedChanged(){
    _receiptsPersistFromUI();
    renderReceiptsHistory();
  }

  function toggleReceiptsSortDir(){
    const btn = document.getElementById('receipts-sort-dir');
    if(!btn) return;
    const current = (btn.dataset.dir === 'asc') ? 'asc' : 'desc';
    const next = (current === 'asc') ? 'desc' : 'asc';
    btn.dataset.dir = next;
    btn.textContent = (next === 'asc') ? '⬆️' : '⬇️';
    _lsSet('re_receipts_sort_dir', next);
    onReceiptsAdvancedChanged();
  }

  function toggleReceiptsFiltersPanel(){
    const panel = document.getElementById('receipts-filters-panel');
    const btn = document.getElementById('receipts-toggle-filters');
    if(!panel || !btn) return;
    const willShow = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !willShow);
    btn.textContent = willShow ? 'إخفاء الفلاتر المتقدمة' : 'عرض الفلاتر المتقدمة';
    _lsSet('re_receipts_filters_open', willShow ? '1' : '0');
  }

  function resetReceiptsAdvanced(){
    const keys = [
      're_receipts_q','re_receipts_sort_by','re_receipts_sort_dir','re_receipts_filters_open',
      're_receipts_f_type','re_receipts_f_source','re_receipts_f_party','re_receipts_f_desc',
      're_receipts_f_amin','re_receipts_f_amax','re_receipts_f_dfrom','re_receipts_f_dto'
    ];
    keys.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });

    // Reset UI
    const qEl = document.getElementById('receipts-search-input'); if(qEl) qEl.value='';
    const sortByEl = document.getElementById('receipts-sort-by'); if(sortByEl) sortByEl.value='date';
    const dirBtn = document.getElementById('receipts-sort-dir'); if(dirBtn){ dirBtn.dataset.dir='desc'; dirBtn.textContent='⬇️'; }

    const fType = document.getElementById('receipts-filter-type'); if(fType) fType.value='';
    const fSource = document.getElementById('receipts-filter-source'); if(fSource) fSource.value='';
    const fParty = document.getElementById('receipts-filter-party'); if(fParty) fParty.value='';
    const fDesc = document.getElementById('receipts-filter-desc'); if(fDesc) fDesc.value='';
    const fAMin = document.getElementById('receipts-filter-amin'); if(fAMin) fAMin.value='';
    const fAMax = document.getElementById('receipts-filter-amax'); if(fAMax) fAMax.value='';
    const fDFrom = document.getElementById('receipts-filter-dfrom'); if(fDFrom) fDFrom.value='';
    const fDTo = document.getElementById('receipts-filter-dto'); if(fDTo) fDTo.value='';

    const panel = document.getElementById('receipts-filters-panel');
    const btn = document.getElementById('receipts-toggle-filters');
    if(panel) panel.classList.add('hidden');
    if(btn) btn.textContent = 'عرض الفلاتر المتقدمة';

    renderReceiptsHistory();
  }
  // ================= /RECEIPTS HISTORY ADVANCED SEARCH =================


  function renderReceiptsHistory(){
    _receiptsRestoreUIOnce();
    const tbody = document.getElementById('receipts-history-table-body');
    tbody.innerHTML = '';

    const frag = document.createDocumentFragment();
let allVouchers = [];
    let totalReceipts = 0;
    let totalSalariesAmt = 0;
    let totalExpensesAmt = 0;

    payments.forEach(p => {
      if(!p) return;
      // Scheduled/pending payments should not create receipts/vouchers
      if(p.isPlanned || String(p.status||'').includes('بانتظار')) return;
      if((Number(p.amount)||0) <= 0) return;

      totalReceipts += p.amount;
      allVouchers.push({
        id: p.id,
        type: 'قبض',
        date: p.date,
        amount: p.amount,
        party: p.tenant,
        desc: p.desc || `دفعة إيجار وحدة ${p.unit}`,
        sourceType: 'payment'
      });
    });

    salaries.forEach(s => {
      totalSalariesAmt += s.amount;
      allVouchers.push({
        id: s.id,
        type: 'صرف راتب',
        date: s.date,
        amount: s.amount,
        party: s.name,
        desc: s.notes,
        sourceType: 'salary'
      });
    });

    expenses.forEach(e => {
      totalExpensesAmt += e.amount;
      allVouchers.push({
        id: e.id,
        type: 'صرف',
        date: e.date,
        amount: e.amount,
        party: e.type,
        desc: `${escHtml(e.type)}: ${escHtml(e.details)}`,
        sourceType: 'expense'
      });
    });

    const st = _receiptsState();
    const filtered = _receiptsApply(allVouchers.slice(), st);

    const hint = document.getElementById('receipts-advanced-hint');
    if(hint) hint.textContent = `النتائج: ${filtered.length} من ${allVouchers.length}`;


    const pg = paginateList(filtered, 'receipts-history', 25);




    pg.items.forEach(v => {
      const isReceipt = v.sourceType === 'payment';
      const typeClass = isReceipt ? 'badge-green' : 'badge-red';
      const amountClass = isReceipt ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
      const tr = document.createElement('tr');
      tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors";
      tr.innerHTML = `
        <td class="px-4 py-3 text-sm font-mono whitespace-nowrap cell-nowrap cell-ltr text-right align-top" dir="ltr">${escHtml(v.date)}</td>
        <td class="px-4 py-3 whitespace-nowrap text-right align-top"><span class="badge ${typeClass}">${escHtml(v.type)}</span></td>
        <td class="px-4 py-3 font-bold font-mono whitespace-nowrap text-right align-top ${amountClass}" dir="ltr"><span class="inline-block" dir="ltr">${formatAED(v.amount)}</span></td>
        <td class="px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-300 text-right align-top break-words"><div class="cell-2lines font-bold text-gray-700 dark:text-gray-300" dir="auto">${escHtml(v.party)}</div></td>
        <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-right align-top break-words"><div class="cell-2lines" title="${escHtml(v.desc)}">${escHtml(v.desc)}</div></td>
        <td class="px-4 py-3 text-center whitespace-nowrap align-top">
          <button onclick="previewReceipt('${escJsStr(v.id)}', '${escJsStr(v.sourceType)}')" class="btn-ui btn-ui-sm btn-secondary">عرض</button>
        </td>
      `;
      frag.appendChild(tr);
    });

    document.getElementById('total-receipt-vouchers').textContent = formatAED(totalReceipts);
    document.getElementById('total-payment-vouchers').textContent = formatAED(totalSalariesAmt + totalExpensesAmt);
    document.getElementById('total-vouchers-count').textContent = allVouchers.length;
  
  tbody.appendChild(frag);
      renderPagerUI('receipts-history', document.getElementById('receipts-history-pager'), pg);
}

  function findPropertyForPayment(payment){
    if(!payment) return null;
    for(const p of properties){
      for(const u of p.units){
        if(payment.unit && u.name === payment.unit) return p;
        if(payment.contract && u.contractNo === payment.contract) return p;
      }
    }
    return null;
  }

  function setReceiptHeaderByProperty(prop){
    const nameEl = document.getElementById('rv-building-name');
    const locEl  = document.getElementById('rv-building-location');
    const phoneEl= document.getElementById('rv-building-phone');
    if(prop){
      nameEl.textContent = prop.name || defaultHeader.name;
      locEl.textContent  = prop.location || defaultHeader.location;
    } else {
      nameEl.textContent = defaultHeader.name;
      locEl.textContent  = defaultHeader.location;
    }
    phoneEl.textContent = defaultHeader.phone;
  }

  function previewReceipt(id, type='payment'){
    showView('receipt');

    const titleEl    = document.getElementById('rv-title');
    const subTitleEl = document.getElementById('rv-subtitle');
    const partyLabelEl = document.getElementById('rv-party-label');
    const mainTitleEl = document.getElementById('receipt-main-title');

    const btnBack = document.getElementById('back-to-source-btn');
    btnBack.onclick = function(){ showView('receipts-history'); };

    if(type === 'salary'){
      const item = salaries.find(x => x.id === id);
      if(!item) return;

      titleEl.textContent = "سند صرف راتب";
      titleEl.className = "text-3xl font-black text-rose-700 tracking-wider";
      subTitleEl.textContent = "Salary Payment Voucher";
      partyLabelEl.textContent = "اصرفوا للسيد/ة:";
      mainTitleEl.textContent = "سند صرف راتب";

      setReceiptHeaderByProperty(null);

      document.getElementById('rv-no').textContent = item.voucherNo || '';
      document.getElementById('rv-date-out').textContent = item.date;
      document.getElementById('rv-tenant-out').textContent = `${escHtml(item.name)} (${escHtml(item.role)})`;
      document.getElementById('rv-amount-out').textContent = parseFloat(item.amount).toLocaleString();
      document.getElementById('rv-method-out').textContent = "نقدي / تحويل";
      document.getElementById('rv-for-out').textContent = item.notes;

    } else if(type === 'expense'){
      const item = expenses.find(x => x.id === id);
      if(!item) return;

      titleEl.textContent = "سند صرف";
      titleEl.className = "text-3xl font-black text-rose-700 tracking-wider";
      subTitleEl.textContent = "Payment Voucher";
      partyLabelEl.textContent = "اصرفوا للجهة:"; 
      mainTitleEl.textContent = "سند صرف";

      setReceiptHeaderByProperty(null);

      document.getElementById('rv-no').textContent = item.voucherNo || '';
      document.getElementById('rv-date-out').textContent = item.date;
      document.getElementById('rv-tenant-out').textContent = item.type;
      document.getElementById('rv-amount-out').textContent = parseFloat(item.amount).toLocaleString();
      document.getElementById('rv-method-out').textContent = "نقدي";
      document.getElementById('rv-for-out').textContent = `دفع مبلغ ${item.amount.toLocaleString()} عن ${escHtml(item.type)}: ${escHtml(item.details)}`;

    } else {
      const item = payments.find(x => x.id === id || x.chequeId === id);
      if(!item) return;

      titleEl.textContent = "سند قبض";
      titleEl.className = "text-3xl font-black text-emerald-700 tracking-wider";
      subTitleEl.textContent = "Receipt Voucher";
      partyLabelEl.textContent = "استلمنا من:";
      mainTitleEl.textContent = "سند قبض";

      const prop = findPropertyForPayment(item);
      setReceiptHeaderByProperty(prop);

      document.getElementById('rv-no').textContent = item.voucherNo || '';
      document.getElementById('rv-date-out').textContent = item.date;
      document.getElementById('rv-tenant-out').textContent = item.tenant;
      document.getElementById('rv-amount-out').textContent = parseFloat(item.amount).toLocaleString();
      document.getElementById('rv-method-out').textContent = item.type;
      document.getElementById('rv-for-out').textContent = item.desc || `دفعة إيجار وحدة ${item.unit}`;
    }
  }

  async function downloadReceiptPDF(){
      return withBusy('جارٍ إنشاء ملف PDF...', async ()=>{
        const wasLoaded = !!window.html2pdf;
        if(!wasLoaded){
          uiToast('info', 'جارٍ تحميل مكتبة PDF...', {title:'⏳ تحميل', duration: 2200});
        }
        await ensureHtml2Pdf();
        if(!window.html2pdf) throw new Error('html2pdf not available');

        const element = document.getElementById('printable-receipt');
        if(!element) throw new Error('printable-receipt not found');

        // Clone to avoid any hidden/position constraints
        const clone = element.cloneNode(true);
        clone.style.position = 'fixed';
        clone.style.left = '-9999px';
        clone.style.top = '0';
        clone.style.width = element.offsetWidth ? (element.offsetWidth + 'px') : '800px';
        document.body.appendChild(clone);

        // Dynamic filename if possible
        const no = document.getElementById('rv-voucher-no')?.textContent?.trim() || '';
        const dt = document.getElementById('rv-voucher-date')?.textContent?.trim() || '';
        const base = safeFilename(`Voucher-${no || ''}-${dt || ''}`) || 'Voucher';
        const filename = (base.endsWith('.pdf') ? base : (base + '.pdf'));

        const opt = {
          margin: 10,
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        try{
          await html2pdf().set(opt).from(clone).save();
        }finally{
          try{ clone.remove(); }catch(_){}
        }
      }, { success: 'تم تحميل ملف PDF ✅', error: 'تعذر إنشاء/تحميل PDF. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.' });
    }function printReceipt(){
  const el = document.getElementById('printable-receipt');
  if(!el){
    uiToast('error', 'تعذر العثور على نموذج السند للطباعة.');
    return;
  }

  // Ensure we print ONLY the receipt, not notices/reports
  setPrintContext('receipt');

  const cleanup = ()=>{
    try{ clearPrintContext(); }catch(e){}
    window.removeEventListener('afterprint', cleanup);
  };
  try{ window.addEventListener('afterprint', cleanup); }catch(e){}

  // Give the browser a tick to apply print styles
  setTimeout(()=>{
    window.print();
    // Fallback cleanup
    setTimeout(cleanup, 1200);
  }, 60);
}



