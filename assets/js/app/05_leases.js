// ================================================
// 05_leases.js - Leases + Multi-unit builder + Lease payments
// Auto-split from legacy app.js for maintainability.
// DO NOT edit the legacy file directly; edit split modules.
// ================================================

  // ================= LEASES =================
  let _leasesAdvInited = false;

  function _leaseNorm(v){
    return (v===null || v===undefined) ? '' : String(v).trim().toLowerCase();
  }
  function _leaseDateNum(s){
    const v = (s||'').toString().slice(0,10);
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : NaN;
  }
  function _unitDateNum(s){
    const v = (s||'').toString().slice(0,10);
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : NaN;
  }
  
  function leaseSafeKey(k){
    return String(k||'').replace(/[^a-zA-Z0-9_-]/g,'_');
  }
  function toggleLeaseGroupRow(groupKey){
    const safe = leaseSafeKey(groupKey);
    const row = document.getElementById(`lease-group-${safe}`);
    if(!row) return;
    row.classList.toggle('hidden');
  }

function _leaseHay(l){
    return [
      l.contractNo, l.tenant, l.name, l.id, l.propName, l.propId,
      leaseContractStatusFromDates(l.start, l.end),
      l.start, l.end
    ].filter(Boolean).join(' | ').toLowerCase();
  }

  function _leasesUi(){
    return {
      q: document.getElementById('lease-search-input')?.value || '',
      sortBy: document.getElementById('leases-sort-by')?.value || '',
      sortDir: document.getElementById('leases-sort-dir')?.dataset?.dir || '',
      status: document.getElementById('leases-filter-status')?.value || '',
      prop: document.getElementById('leases-filter-prop')?.value || '',
      unit: document.getElementById('leases-filter-unit')?.value || '',
      tenant: document.getElementById('leases-filter-tenant')?.value || '',
      contractNo: document.getElementById('leases-filter-contract')?.value || '',
      rentMin: document.getElementById('leases-filter-rent-min')?.value || '',
      rentMax: document.getElementById('leases-filter-rent-max')?.value || '',
      startFrom: document.getElementById('leases-filter-start-from')?.value || '',
      startTo: document.getElementById('leases-filter-start-to')?.value || '',
      endFrom: document.getElementById('leases-filter-end-from')?.value || '',
      endTo: document.getElementById('leases-filter-end-to')?.value || '',
    };
  }

  function _leasesPersistFromUI(){
    const ui = _leasesUi();
    _lsSet('re_leases_q', ui.q);
    _lsSet('re_leases_sort_by', ui.sortBy || _lsGet('re_leases_sort_by','end'));
    _lsSet('re_leases_sort_dir', ui.sortDir || _lsGet('re_leases_sort_dir','asc'));

    _lsSet('re_leases_f_status', ui.status);
    _lsSet('re_leases_f_prop', ui.prop);
    _lsSet('re_leases_f_unit', ui.unit);
    _lsSet('re_leases_f_tenant', ui.tenant);
    _lsSet('re_leases_f_contract', ui.contractNo);
    _lsSet('re_leases_f_rmin', ui.rentMin);
    _lsSet('re_leases_f_rmax', ui.rentMax);
    _lsSet('re_leases_f_sfrom', ui.startFrom);
    _lsSet('re_leases_f_sto', ui.startTo);
    _lsSet('re_leases_f_efrom', ui.endFrom);
    _lsSet('re_leases_f_eto', ui.endTo);
  }

  function _leasesRestoreUIOnce(){
    if(_leasesAdvInited) return;
    _leasesAdvInited = true;

    const qEl = document.getElementById('lease-search-input');
    if(qEl) qEl.value = _lsGet('re_leases_q','');

    const sortByEl = document.getElementById('leases-sort-by');
    if(sortByEl) sortByEl.value = _lsGet('re_leases_sort_by','end');

    const dir = _lsGet('re_leases_sort_dir','asc');
    const dirBtn = document.getElementById('leases-sort-dir');
    if(dirBtn){
      dirBtn.dataset.dir = dir;
      dirBtn.textContent = (dir==='asc') ? '⬆️' : '⬇️';
    }

    const statusEl = document.getElementById('leases-filter-status');
    if(statusEl) statusEl.value = _lsGet('re_leases_f_status','');

    const propEl = document.getElementById('leases-filter-prop');
    if(propEl) propEl.value = _lsGet('re_leases_f_prop','');

    const unitEl = document.getElementById('leases-filter-unit');
    if(unitEl) unitEl.value = _lsGet('re_leases_f_unit','');

    const tenantEl = document.getElementById('leases-filter-tenant');
    if(tenantEl) tenantEl.value = _lsGet('re_leases_f_tenant','');

    const cEl = document.getElementById('leases-filter-contract');
    if(cEl) cEl.value = _lsGet('re_leases_f_contract','');

    const rminEl = document.getElementById('leases-filter-rent-min');
    if(rminEl) rminEl.value = _lsGet('re_leases_f_rmin','');

    const rmaxEl = document.getElementById('leases-filter-rent-max');
    if(rmaxEl) rmaxEl.value = _lsGet('re_leases_f_rmax','');

    const sFromEl = document.getElementById('leases-filter-start-from');
    if(sFromEl) sFromEl.value = _lsGet('re_leases_f_sfrom','');

    const sToEl = document.getElementById('leases-filter-start-to');
    if(sToEl) sToEl.value = _lsGet('re_leases_f_sto','');

    const eFromEl = document.getElementById('leases-filter-end-from');
    if(eFromEl) eFromEl.value = _lsGet('re_leases_f_efrom','');

    const eToEl = document.getElementById('leases-filter-end-to');
    if(eToEl) eToEl.value = _lsGet('re_leases_f_eto','');

    const open = _lsGet('re_leases_filters_open','0') === '1';
    const panel = document.getElementById('leases-filters-panel');
    const tBtn = document.getElementById('leases-toggle-filters');
    if(panel && tBtn){
      panel.classList.toggle('hidden', !open);
      _setLeaseFiltersBtnLabel(open);
      }
  }

  function onLeaseAdvancedChanged(){
    _leasesPersistFromUI();
    renderLeases();
  }

  function toggleLeaseSortDir(){
    const btn = document.getElementById('leases-sort-dir');
    if(!btn) return;
      try{ e.preventDefault(); }catch(_e){}
      try{ e.stopPropagation(); }catch(_e){}
    const next = (btn.dataset.dir==='asc') ? 'desc' : 'asc';
    btn.dataset.dir = next;
    btn.textContent = (next==='asc') ? '⬆️' : '⬇️';
    _lsSet('re_leases_sort_dir', next);
    renderLeases();
  }

  function _setLeaseFiltersBtnLabel(open){
    const btn = document.getElementById('leases-toggle-filters');
    if(!btn) return;
    const label = btn.querySelector('.lease-filter-label');
    const text = open ? 'إخفاء الفلاتر المتقدمة' : 'فلتر متقدمة';
    if(label) label.textContent = text;
  }

  function toggleLeaseFilters(){
    const panel = document.getElementById('leases-filters-panel');
    const btn = document.getElementById('leases-toggle-filters');
    if(!panel || !btn) return;
    const willShow = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
      _setLeaseFiltersBtnLabel(willShow);
    _lsSet('re_leases_filters_open', willShow ? '1' : '0');
  }

  function resetLeaseAdvanced(){
    const keys = [
      're_leases_q','re_leases_sort_by','re_leases_sort_dir','re_leases_filters_open',
      're_leases_f_status','re_leases_f_prop','re_leases_f_unit','re_leases_f_tenant','re_leases_f_contract',
      're_leases_f_rmin','re_leases_f_rmax','re_leases_f_sfrom','re_leases_f_sto','re_leases_f_efrom','re_leases_f_eto'
    ];
    keys.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });

    // Reset UI
    const qEl = document.getElementById('lease-search-input'); if(qEl) qEl.value='';
    const sortByEl = document.getElementById('leases-sort-by'); if(sortByEl) sortByEl.value='end';
    const dirBtn = document.getElementById('leases-sort-dir'); if(dirBtn){ dirBtn.dataset.dir='asc'; dirBtn.textContent='⬆️'; }
    const statusEl = document.getElementById('leases-filter-status'); if(statusEl) statusEl.value='';
    const propEl = document.getElementById('leases-filter-prop'); if(propEl) propEl.value='';
    const unitEl = document.getElementById('leases-filter-unit'); if(unitEl) unitEl.value='';
    const tenantEl = document.getElementById('leases-filter-tenant'); if(tenantEl) tenantEl.value='';
    const cEl = document.getElementById('leases-filter-contract'); if(cEl) cEl.value='';
    const rminEl = document.getElementById('leases-filter-rent-min'); if(rminEl) rminEl.value='';
    const rmaxEl = document.getElementById('leases-filter-rent-max'); if(rmaxEl) rmaxEl.value='';
    const sFromEl = document.getElementById('leases-filter-start-from'); if(sFromEl) sFromEl.value='';
    const sToEl = document.getElementById('leases-filter-start-to'); if(sToEl) sToEl.value='';
    const eFromEl = document.getElementById('leases-filter-end-from'); if(eFromEl) eFromEl.value='';
    const eToEl = document.getElementById('leases-filter-end-to'); if(eToEl) eToEl.value='';

    const panel = document.getElementById('leases-filters-panel');
    const tBtn = document.getElementById('leases-toggle-filters');
    if(panel && tBtn){
      panel.classList.add('hidden');
      _setLeaseFiltersBtnLabel(false);
    }

    renderLeases();
  }

  // ================= Advanced Search & Sort (Cheques) =================
  let _chequesUIRestored = false;

  function _chequesRestoreUIOnce(){
    if(_chequesUIRestored) return;
    _chequesUIRestored = true;

    const qEl = document.getElementById('cheques-search-input');
    const sortByEl = document.getElementById('cheques-sort-by');
    const sortDirBtn = document.getElementById('cheques-sort-dir');

    const fStatus = document.getElementById('cheques-filter-status');
    const fTenant = document.getElementById('cheques-filter-tenant');
    const fUnit = document.getElementById('cheques-filter-unit');
    const fChequeNo = document.getElementById('cheques-filter-chequeno');
    const fBank = document.getElementById('cheques-filter-bank');
    const fAMin = document.getElementById('cheques-filter-amin');
    const fAMax = document.getElementById('cheques-filter-amax');
    const fDFrom = document.getElementById('cheques-filter-dfrom');
    const fDTo = document.getElementById('cheques-filter-dto');

    if(qEl) qEl.value = _lsGet('re_cheques_q','');
    if(sortByEl) sortByEl.value = _lsGet('re_cheques_sort_by','due');

    const dir = _lsGet('re_cheques_sort_dir','desc');
    if(sortDirBtn){
      sortDirBtn.dataset.dir = (dir==='asc') ? 'asc' : 'desc';
      sortDirBtn.textContent = (sortDirBtn.dataset.dir==='asc') ? '⬆️' : '⬇️';
    }

    if(fStatus) fStatus.value = _lsGet('re_cheques_f_status','');
    if(fTenant) fTenant.value = _lsGet('re_cheques_f_tenant','');
    if(fUnit) fUnit.value = _lsGet('re_cheques_f_unit','');
    if(fChequeNo) fChequeNo.value = _lsGet('re_cheques_f_chequeno','');
    if(fBank) fBank.value = _lsGet('re_cheques_f_bank','');
    if(fAMin) fAMin.value = _lsGet('re_cheques_f_amin','');
    if(fAMax) fAMax.value = _lsGet('re_cheques_f_amax','');
    if(fDFrom) fDFrom.value = _lsGet('re_cheques_f_dfrom','');
    if(fDTo) fDTo.value = _lsGet('re_cheques_f_dto','');

    // restore filters panel open/closed
    const open = _lsGet('re_cheques_filters_open','0')==='1';
    const panel = document.getElementById('cheques-filters-panel');
    const tBtn = document.getElementById('cheques-toggle-filters');
    if(panel && tBtn){
      panel.classList.toggle('hidden', !open);
      _setLeaseFiltersBtnLabel(open);
      }
  }

  function _chequesPersistFromUI(){
    const qEl = document.getElementById('cheques-search-input');
    const sortByEl = document.getElementById('cheques-sort-by');
    const sortDirBtn = document.getElementById('cheques-sort-dir');

    _lsSet('re_cheques_q', (qEl?.value||'').trim());
    _lsSet('re_cheques_sort_by', (sortByEl?.value||'due'));
    _lsSet('re_cheques_sort_dir', (sortDirBtn?.dataset?.dir||'desc'));

    _lsSet('re_cheques_f_status', (document.getElementById('cheques-filter-status')?.value||'').trim());
    _lsSet('re_cheques_f_tenant', (document.getElementById('cheques-filter-tenant')?.value||'').trim());
    _lsSet('re_cheques_f_unit', (document.getElementById('cheques-filter-unit')?.value||'').trim());
    _lsSet('re_cheques_f_chequeno', (document.getElementById('cheques-filter-chequeno')?.value||'').trim());
    _lsSet('re_cheques_f_bank', (document.getElementById('cheques-filter-bank')?.value||'').trim());
    _lsSet('re_cheques_f_amin', (document.getElementById('cheques-filter-amin')?.value||'').trim());
    _lsSet('re_cheques_f_amax', (document.getElementById('cheques-filter-amax')?.value||'').trim());
    _lsSet('re_cheques_f_dfrom', (document.getElementById('cheques-filter-dfrom')?.value||'').trim());
    _lsSet('re_cheques_f_dto', (document.getElementById('cheques-filter-dto')?.value||'').trim());
  }

  function onChequesAdvancedChanged(){
    _chequesPersistFromUI();
    renderCheques();
  }

  function toggleChequesSortDir(){
    const btn = document.getElementById('cheques-sort-dir');
    if(!btn) return;
    const cur = (btn.dataset.dir==='asc') ? 'asc' : 'desc';
    const next = (cur==='asc') ? 'desc' : 'asc';
    btn.dataset.dir = next;
    btn.textContent = (next==='asc') ? '⬆️' : '⬇️';
    onChequesAdvancedChanged();
  }

  function toggleChequesFiltersPanel(){
    const panel = document.getElementById('cheques-filters-panel');
    const btn = document.getElementById('cheques-toggle-filters');
    if(!panel || !btn) return;
    const willShow = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !willShow);
    btn.textContent = willShow ? 'إخفاء الفلاتر المتقدمة' : 'عرض الفلاتر المتقدمة';
    _lsSet('re_cheques_filters_open', willShow ? '1' : '0');
  }

  function resetChequesAdvanced(){
    const keys = [
      're_cheques_q','re_cheques_sort_by','re_cheques_sort_dir','re_cheques_filters_open',
      're_cheques_f_status','re_cheques_f_tenant','re_cheques_f_unit','re_cheques_f_chequeno','re_cheques_f_bank',
      're_cheques_f_amin','re_cheques_f_amax','re_cheques_f_dfrom','re_cheques_f_dto'
    ];
    keys.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });

    // Reset UI
    const qEl = document.getElementById('cheques-search-input'); if(qEl) qEl.value='';
    const sortByEl = document.getElementById('cheques-sort-by'); if(sortByEl) sortByEl.value='due';
    const dirBtn = document.getElementById('cheques-sort-dir'); if(dirBtn){ dirBtn.dataset.dir='desc'; dirBtn.textContent='⬇️'; }

    const setVal = (id,v)=>{ const el=document.getElementById(id); if(el) el.value=v; };
    setVal('cheques-filter-status','');
    setVal('cheques-filter-tenant','');
    setVal('cheques-filter-unit','');
    setVal('cheques-filter-chequeno','');
    setVal('cheques-filter-bank','');
    setVal('cheques-filter-amin','');
    setVal('cheques-filter-amax','');
    setVal('cheques-filter-dfrom','');
    setVal('cheques-filter-dto','');

    // Hide panel (default)
    const panel = document.getElementById('cheques-filters-panel');
    const tBtn = document.getElementById('cheques-toggle-filters');
    if(panel) panel.classList.add('hidden');
    if(tBtn) tBtn.textContent = 'عرض الفلاتر المتقدمة';

    onChequesAdvancedChanged();
  }

  function _chequesState(){
    return {
      q: _lsGet('re_cheques_q',''),
      sortBy: _lsGet('re_cheques_sort_by','due'),
      sortDir: _lsGet('re_cheques_sort_dir','desc'),
      f: {
        status: _lsGet('re_cheques_f_status',''),
        tenant: _lsGet('re_cheques_f_tenant',''),
        unit: _lsGet('re_cheques_f_unit',''),
        chequeNo: _lsGet('re_cheques_f_chequeno',''),
        bank: _lsGet('re_cheques_f_bank',''),
        aMin: _lsGet('re_cheques_f_amin',''),
        aMax: _lsGet('re_cheques_f_amax',''),
        dFrom: _lsGet('re_cheques_f_dfrom',''),
        dTo: _lsGet('re_cheques_f_dto','')
      }
    };
  }

  function _chequesApply(list, st){
    const q = (st.q||'').trim().toLowerCase();
    const f = st.f || {};

    const status = (f.status||'').trim();
    const tenant = (f.tenant||'').trim().toLowerCase();
    const unit = (f.unit||'').trim().toLowerCase();
    const chequeNo = (f.chequeNo||'').trim().toLowerCase();
    const bank = (f.bank||'').trim().toLowerCase();

    const aMin = parseFloat(f.aMin); const hasMin = Number.isFinite(aMin);
    const aMax = parseFloat(f.aMax); const hasMax = Number.isFinite(aMax);

    const dFrom = f.dFrom ? Date.parse(String(f.dFrom).slice(0,10)) : NaN;
    const dTo = f.dTo ? Date.parse(String(f.dTo).slice(0,10)) : NaN;
    const hasDFrom = Number.isFinite(dFrom);
    const hasDTo = Number.isFinite(dTo);

    return (list||[]).filter(c=>{
      const blob = [
        c.status, c.dueDate, c.tenant, c.unit, c.amount, c.bank, c.chequeNo
      ].filter(Boolean).join(' | ').toLowerCase();

      if(q && !blob.includes(q)) return false;

      if(status && String(c.status||'')!==status) return false;

      if(tenant && !String(c.tenant||'').toLowerCase().includes(tenant)) return false;

      if(unit && !String(c.unit||'').toLowerCase().includes(unit)) return false;

      if(chequeNo && !String(c.chequeNo||'').toLowerCase().includes(chequeNo)) return false;

      if(bank && !String(c.bank||'').toLowerCase().includes(bank)) return false;

      const amt = parseFloat(c.amount);
      if(hasMin && (!Number.isFinite(amt) || amt < aMin)) return false;
      if(hasMax && (!Number.isFinite(amt) || amt > aMax)) return false;

      const due = c.dueDate ? Date.parse(String(c.dueDate).slice(0,10)) : NaN;
      if(hasDFrom && (!Number.isFinite(due) || due < dFrom)) return false;
      if(hasDTo && (!Number.isFinite(due) || due > dTo)) return false;

      return true;
    });
  }

  function _sortCheques(list, sortBy, sortDir){
    const dir = (sortDir==='asc') ? 1 : -1;
    const k = sortBy || 'due';

    const get = (c)=>{
      if(k==='amount') return Number(c.amount)||0;
      if(k==='tenant') return String(c.tenant||'').toLowerCase();
      if(k==='unit') return String(c.unit||'').toLowerCase();
      if(k==='bank') return String(c.bank||'').toLowerCase();
      if(k==='chequeNo') return String(c.chequeNo||'').toLowerCase();
      if(k==='status') return String(c.status||'').toLowerCase();
      // due default
      const t = c.dueDate ? Date.parse(String(c.dueDate).slice(0,10)) : 0;
      return Number.isFinite(t) ? t : 0;
    };

    return [...(list||[])].sort((a,b)=>{
      const va = get(a);
      const vb = get(b);
      if(va < vb) return -1*dir;
      if(va > vb) return 1*dir;
      // tiebreaker by dueDate desc
      const ta = a.dueDate ? Date.parse(String(a.dueDate).slice(0,10)) : 0;
      const tb = b.dueDate ? Date.parse(String(b.dueDate).slice(0,10)) : 0;
      if(ta < tb) return -1;
      if(ta > tb) return 1;
      return 0;
    });
  }
  // ================= /Advanced Search & Sort (Cheques) =================



  // Backward compatibility (if used somewhere else)
  function setLeaseSort(k){
    const map = { end:'end', rent:'rent', tenant:'tenant' };
    const by = map[k] || 'end';
    const sel = document.getElementById('leases-sort-by');
    if(sel) sel.value = by;
    _lsSet('re_leases_sort_by', by);
    renderLeases();
  }

  function _leasesState(){
    const ui = _leasesUi();
    return {
      q: _leaseNorm(ui.q || _lsGet('re_leases_q','')),
      sortBy: ui.sortBy || _lsGet('re_leases_sort_by','end'),
      sortDir: ui.sortDir || _lsGet('re_leases_sort_dir','asc'),
      f: {
        status: ui.status || _lsGet('re_leases_f_status',''),
        prop: ui.prop || _lsGet('re_leases_f_prop',''),
        unit: ui.unit || _lsGet('re_leases_f_unit',''),
        tenant: ui.tenant || _lsGet('re_leases_f_tenant',''),
        contractNo: ui.contractNo || _lsGet('re_leases_f_contract',''),
        rentMin: ui.rentMin || _lsGet('re_leases_f_rmin',''),
        rentMax: ui.rentMax || _lsGet('re_leases_f_rmax',''),
        startFrom: ui.startFrom || _lsGet('re_leases_f_sfrom',''),
        startTo: ui.startTo || _lsGet('re_leases_f_sto',''),
        endFrom: ui.endFrom || _lsGet('re_leases_f_efrom',''),
        endTo: ui.endTo || _lsGet('re_leases_f_eto',''),
      }
    };
  }

  function _leasesApply(list, st){
    const q = st.q;
    const f = st.f;

    const status = (f.status||'').trim();
    const prop = _leaseNorm(f.prop);
    const unit = _leaseNorm(f.unit);
    const tenant = _leaseNorm(f.tenant);
    const cno = _leaseNorm(f.contractNo);

    const rmin = (f.rentMin!=='' && f.rentMin!==null && f.rentMin!==undefined) ? Number(f.rentMin) : NaN;
    const rmax = (f.rentMax!=='' && f.rentMax!==null && f.rentMax!==undefined) ? Number(f.rentMax) : NaN;

    const sFrom = f.startFrom ? _leaseDateNum(f.startFrom) : NaN;
    const sTo = f.startTo ? _leaseDateNum(f.startTo) : NaN;
    const eFrom = f.endFrom ? _leaseDateNum(f.endFrom) : NaN;
    const eTo = f.endTo ? _leaseDateNum(f.endTo) : NaN;

    return (list||[]).filter(l=>{
      if(q && !_leaseHay(l).includes(q)) return false;

      if(status && leaseContractStatusFromDates(l.start, l.end) !== status) return false;
      if(prop && !_leaseNorm(l.propName).includes(prop)) return false;

      if(unit){
        const uName = _leaseNorm(l.name);
        const uId = _leaseNorm(l.id);
        if(!uName.includes(unit) && !uId.includes(unit)) return false;
      }

      if(tenant && !_leaseNorm(l.tenant).includes(tenant)) return false;
      if(cno && !_leaseNorm(l.contractNo).includes(cno)) return false;

      const rent = Number(l.rent||0);
      if(Number.isFinite(rmin) && rent < rmin) return false;
      if(Number.isFinite(rmax) && rent > rmax) return false;

      const s = _leaseDateNum(l.start);
      const e = _leaseDateNum(l.end);

      if(Number.isFinite(sFrom) && (!Number.isFinite(s) || s < sFrom)) return false;
      if(Number.isFinite(sTo) && (!Number.isFinite(s) || s > sTo)) return false;
      if(Number.isFinite(eFrom) && (!Number.isFinite(e) || e < eFrom)) return false;
      if(Number.isFinite(eTo) && (!Number.isFinite(e) || e > eTo)) return false;

      return true;
    });
  }

  function _sortLeases(list, by, dir){
    const m = _dirMult(dir);
    const arr = [...(list||[])];
    arr.sort((a,b)=>{
      switch(by){
        case 'rent': return m * _cmpNum(a.rent, b.rent);
        case 'end': return m * _cmpNum(_leaseDateNum(a.end), _leaseDateNum(b.end));
        case 'start': return m * _cmpNum(_leaseDateNum(a.start), _leaseDateNum(b.start));
        case 'tenant': return m * _cmpText(a.tenant, b.tenant);
        case 'unit': return m * _cmpText(a.name, b.name);
        case 'property': return m * _cmpText(a.propName, b.propName);
        case 'contractNo': return m * _cmpText(a.contractNo, b.contractNo);
        case 'status': {
          const sa = leaseContractStatusOrder(leaseContractStatusFromDates(a.start, a.end));
          const sb = leaseContractStatusOrder(leaseContractStatusFromDates(b.start, b.end));
          const primary = m * _cmpNum(sa, sb);
          if(primary !== 0) return primary;
          return m * _cmpNum(_leaseDateNum(a.end), _leaseDateNum(b.end));
        }
        default: return m * _cmpText(a.end, b.end);
      }
    });
    return arr;
  }

  function renderLeases(){
    _leasesRestoreUIOnce();

    const tbody = document.getElementById('leases-table-body');
    if(!tbody) return;
    tbody.innerHTML='';

    
    const frag = document.createDocumentFragment();
let allLeases = [];
    properties.forEach(p=>p.units.forEach(u=>{
      if(u.status!=='شاغرة') allLeases.push({...u, propName:p.name, propId:p.id});
    }));

    // Group leases by contractGroupId (multi-unit) — otherwise each unit is its own group
    const groupsMap = new Map();
    allLeases.forEach(u=>{
      const cg = u.contractGroupId || (u.leaseExtra && u.leaseExtra.contractGroupId) || '';
      const key = cg || (u.contractNo ? `CN-${u.contractNo}` : `U-${u.propId}-${u.id}`);
      if(!groupsMap.has(key)){
        groupsMap.set(key, {
          groupKey: key,
          contractGroupId: cg || '',
          contractNo: u.contractNo || '',
          tenant: u.tenant || '',
          start: u.start || '',
          end: u.end || '',
          rent: 0,
          units: [],
          _propNames: new Set(),
          _propIds: new Set(),
        });
      }
      const g = groupsMap.get(key);
      g.units.push(u);
      g.rent += (Number(u.rent)||0);
      if(u.propName) g._propNames.add(u.propName);
      if(u.propId) g._propIds.add(u.propId);

      // unify start/end for group (earliest start, latest end)
      if(u.start){
        if(!g.start) g.start = u.start;
        else if(_leaseDateNum(u.start) < _leaseDateNum(g.start)) g.start = u.start;
      }
      if(u.end){
        if(!g.end) g.end = u.end;
        else if(_leaseDateNum(u.end) > _leaseDateNum(g.end)) g.end = u.end;
      }
      // keep tenant/contractNo if missing
      if(!g.tenant && u.tenant) g.tenant = u.tenant;
      if(!g.contractNo && u.contractNo) g.contractNo = u.contractNo;
    });

    const groupedLeases = Array.from(groupsMap.values()).map(g=>{
      const props = Array.from(g._propNames);
      const propIds = Array.from(g._propIds);
      const unitsNames = g.units.map(x=>x.name).filter(Boolean).join(', ');
      const unitsIds = g.units.map(x=>x.id).filter(Boolean).join(', ');
      return {
        groupKey: g.groupKey,
        contractGroupId: g.contractGroupId || (g.contractNo ? `CN-${g.contractNo}` : ''),
        contractNo: g.contractNo,
        tenant: g.tenant,
        start: g.start,
        end: g.end,
        rent: g.rent,
        units: g.units,
        unitsCount: g.units.length,
        unitsNames,
        // Fields used by existing filters/sorts
        name: unitsNames || (g.units[0]?.name || ''),
        id: unitsIds || (g.units[0]?.id || ''),
        propName: props.join('، ') || (g.units[0]?.propName || ''),
        propId: propIds.join(',') || (g.units[0]?.propId || ''),
      };
    });

    const st = _leasesState();
    const filtered = _leasesApply(groupedLeases, st);
    const finalList = _sortLeases(filtered, st.sortBy, st.sortDir);

    const hint = document.getElementById('leases-filter-hint');
    if(hint){
      const total = groupedLeases.length;
      const shown = finalList.length;
      hint.textContent = (shown===total) ? `النتائج: ${shown}` : `النتائج: ${shown} من ${total}`;
    }

    const pg = paginateList(finalList, 'leases', 25);



    pg.items.forEach(g=>{
      window.__leaseGroupsCache = window.__leaseGroupsCache || {};
      window.__leaseGroupsCache[g.groupKey] = g;
      const safe = leaseSafeKey(g.groupKey);
      const isMulti = (g.unitsCount||0) > 1;
      const statusText = leaseContractStatusFromDates(g.start, g.end);
      const rowBg = (statusText==='منتهي') ? 'bg-red-50 dark:bg-red-900/20' : '';

      const tr = document.createElement('tr');
      tr.className = rowBg;
      tr.innerHTML = `
        <td>
          <div class="flex items-start gap-2">
            ${isMulti ? `<button class="mt-0.5 text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white" title="عرض الوحدات" onclick="toggleLeaseGroupRow('${escJsStr(g.groupKey)}')">▾</button>` : `<span class="mt-0.5 text-gray-300">•</span>`}
            <div class="min-w-0">
              <div class="font-bold text-gray-800 dark:text-white">
                ${isMulti ? `عقد متعدد الوحدات (${g.unitsCount})` : escHtml((g.units?.[0]?.name || g.name || '—'))}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                ${escHtml(g.propName || '—')}${isMulti ? ` — <span class="font-mono">${escHtml(g.unitsNames || '')}</span>` : ''}
              </div>
            </div>
          </div>
        </td>
        <td class="text-sm font-semibold text-gray-700 dark:text-gray-300">${escHtml(g.tenant||'')}</td>
        <td class="font-mono text-emerald-600 dark:text-emerald-400">${formatAED(g.rent)}</td>
        <td class="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded truncate max-w-[160px]" title="${escHtml(g.contractNo||'')}">${escHtml(g.contractNo||'')}</td>
        <td class="text-xs">${escHtml(g.start||'-')}</td>
        <td class="text-xs ${(() => { const cs = leaseContractStatusFromDates(g.start, g.end); return (cs==='منتهي' ? 'text-red-600 dark:text-red-300 font-extrabold' : cs==='شارف على الانتهاء' ? 'text-orange-600 dark:text-orange-300 font-extrabold' : ''); })()}">${escHtml(g.end||'-')}</td>
        <td><span class="${leaseContractBadgeClass(statusText)}">${statusText}</span></td>
        
<td>
          ${isMulti
            ? `<div class="flex items-center gap-2">
                <button type="button"
                        data-lease-action="toggle"
                        data-groupkey="${g.groupKey}"
                        onclick="toggleLeaseGroupRow('${escJsStr(g.groupKey)}')"
                        class="btn-ui btn-ui-sm btn-secondary">تفاصيل</button>
                ${statusText==='منتهي' ? `<button type="button"
                        data-lease-action="archive"
                        data-groupkey="${g.groupKey}"
                        onclick="openLeaseArchiveModal('${escJsStr(g.groupKey)}')"
                        class="btn-ui btn-ui-sm btn-danger">أرشفة</button>` : ''}
                <button type="button"
                        data-lease-action="pay"
                        data-groupkey="${g.groupKey}"
                        onclick="openLeasePaymentModal('${escJsStr(g.groupKey)}')"
                        class="text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 text-sm font-bold">دفعة</button>
              </div>`
            : `<div class="flex items-center gap-2">
                <button type="button"
                       onclick="openLeaseModal('${escJsStr(g.units?.[0]?.propId || g.propId)}','${escJsStr(g.units?.[0]?.id || g.id)}')"
                       class="btn-ui btn-ui-sm btn-secondary">إدارة</button>
                ${statusText==='منتهي' ? `<button type="button"
                       onclick="openLeaseArchiveModal('${escJsStr(g.groupKey)}')"
                       class="btn-ui btn-ui-sm btn-danger">أرشفة</button>` : ''}
              </div>`
          }
        </td>

      `;
      frag.appendChild(tr);

      
      // Robust bindings (avoid relying only on inline onclick)
      try{
        const tBtn = tr.querySelector('[data-lease-action="toggle"]');
        if(tBtn) tBtn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); toggleLeaseGroupRow(g.groupKey); });
        const pBtn = tr.querySelector('[data-lease-action="pay"]');
        if(pBtn) pBtn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); openLeasePaymentModal(g.groupKey); });
        const aBtn = tr.querySelector('[data-lease-action="archive"]');
        if(aBtn) aBtn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); openLeaseArchiveModal(g.groupKey); });
      }catch(e){}
if(isMulti){
        const detail = document.createElement('tr');
        detail.id = `lease-group-${safe}`;
        detail.className = 'hidden bg-gray-50 dark:bg-gray-900/30';
        detail.innerHTML = `
          <td colspan="8" class="p-3">
            <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-dark-surface/60 backdrop-blur-md p-3">
              <div class="flex items-center justify-between gap-3 mb-3">
                <div class="flex items-center gap-2">
                <div class="text-sm font-extrabold text-gray-800 dark:text-white">تفاصيل الوحدات ضمن العقد</div>
                  <button onclick="openLeasePaymentModal('${escJsStr(g.groupKey)}')" class="btn-ui btn-ui-sm btn-success">تسجيل دفعة</button>
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-3">
                  <span>الإجمالي: <span class="font-mono text-emerald-600 dark:text-emerald-400">${formatAED(g.rent)}</span></span>
                  <span>المدفوع: <span class="font-mono text-emerald-700 dark:text-emerald-400">${formatAED(sumLeasePaidForContract(g.contractNo, g.groupKey))}</span></span>
                  <span>المتبقي: <span class="font-mono text-red-600 dark:text-red-300">${formatAED(Math.max(0, (Number(g.rent)||0) - sumLeasePaidForContract(g.contractNo, g.groupKey)))}</span></span>
                </div>
              </div>

              <div class="overflow-x-auto">
                <table class="ui-table min-w-full text-right text-sm">
                  <thead>
                    <tr class="text-xs text-gray-500 dark:text-gray-400">
                      <th class="py-2 px-2">الوحدة</th>
                      <th class="py-2 px-2">العقار</th>
                      <th class="py-2 px-2">القيمة</th>
                      <th class="py-2 px-2">المستلم</th>
                      <th class="py-2 px-2">المتبقي</th>
                      <th class="py-2 px-2">البداية</th>
                      <th class="py-2 px-2">النهاية</th>
                      <th class="py-2 px-2">الحالة</th>
                      <th class="py-2 px-2">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${g.units.map(u=>{
                      const stt = leaseContractStatusFromDates(u.start, u.end);
                      return `
                        <tr class="border-t border-gray-100 dark:border-gray-800">
                          <td class="py-2 px-2">
                            <div class="font-bold text-gray-800 dark:text-white">${escHtml(u.name||'—')}</div>
                            <div class="text-xs font-mono text-gray-500 dark:text-gray-400">${u.id||''}</div>
                          </td>
                          <td class="py-2 px-2 text-xs text-gray-600 dark:text-gray-300">${u.propName||''}</td>
                          <td class="py-2 px-2 font-mono text-emerald-600 dark:text-emerald-400">${formatAED(u.rent)}</td>
                          <td class="py-2 px-2 font-mono text-gray-700 dark:text-gray-200">${formatAED(sumLeasePaidForUnit(g.contractNo, u.propId, u.id, g.groupKey))}</td>
                          <td class="py-2 px-2 font-mono text-red-600 dark:text-red-300">${formatAED(Math.max(0, (Number(u.rent)||0) - sumLeasePaidForUnit(g.contractNo, u.propId, u.id, g.groupKey)))}</td>
                          <td class="py-2 px-2 text-xs">${u.start||'-'}</td>
                          <td class="py-2 px-2 text-xs">${u.end||'-'}</td>
                          <td class="py-2 px-2"><span class="${leaseContractBadgeClass(stt)}">${stt}</span></td>
                          <td class="py-2 px-2">
                            <button onclick="openLeaseModal('${escJsStr(u.propId)}','${escJsStr(u.id)}')" class="btn-ui btn-ui-sm btn-secondary">إدارة</button>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        `;
        frag.appendChild(detail);
      }
    });

  tbody.appendChild(frag);
    renderPagerUI('leases', document.getElementById('leases-pager'), pg);
}

  function openPropertyModal(pid){
    const modal = document.getElementById('property-modal');
    const form = document.getElementById('property-form');
    const titleEl = document.getElementById('property-modal-title');
    const idInput = document.getElementById('prop-id');

    // reset defaults
    if(form) form.reset();
    if(form) delete form.dataset.editPid;
    if(idInput){
      idInput.readOnly = false;
      idInput.classList.remove('opacity-70');
    }
    if(titleEl) titleEl.textContent = 'إضافة عقار جديد';

    // edit mode
    if(pid){
      const p = properties.find(x => x.id === pid);
      if(p){
        if(titleEl) titleEl.textContent = 'تعديل بيانات العقار';
        if(form) form.dataset.editPid = pid;

        document.getElementById('prop-id').value = p.id || '';
        document.getElementById('prop-name').value = p.name || '';
        document.getElementById('prop-type').value = p.type || '';
        document.getElementById('prop-usage').value = p.usage || '';
        document.getElementById('prop-location').value = p.location || '';

        // prevent accidental id changes (id is key)
        if(idInput){
          idInput.readOnly = true;
          idInput.classList.add('opacity-70');
        }
      }
    }

    modal.classList.remove('hidden');
  }
  function closePropertyModal(){
    const modal = document.getElementById('property-modal');
    const form = document.getElementById('property-form');
    const titleEl = document.getElementById('property-modal-title');
    const idInput = document.getElementById('prop-id');

    modal.classList.add('hidden');

    // reset edit mode
    if(form){
      delete form.dataset.editPid;
      form.reset();
    }
    if(idInput){
      idInput.readOnly = false;
      idInput.classList.remove('opacity-70');
    }
    if(titleEl) titleEl.textContent = 'إضافة عقار جديد';
  }

  document.getElementById('property-form').addEventListener('submit', e=>{
    e.preventDefault();

    const form = document.getElementById('property-form');
    const editPid = (form && form.dataset && form.dataset.editPid) ? form.dataset.editPid : '';

    const pid = normalizeText(document.getElementById('prop-id').value, {collapseSpaces:false});
    const pname = normalizeText(document.getElementById('prop-name').value);

    if(!pid){
      uiToast('error','الرجاء إدخال رمز العقار.');
      return;
    }
    if(!pname){
      uiToast('error','الرجاء إدخال اسم العقار.');
      return;
    }

    const payload = {
      id: pid,
      name: pname,
      type: normalizeText(document.getElementById('prop-type').value, {collapseSpaces:false}),
      usage: normalizeText(document.getElementById('prop-usage').value, {collapseSpaces:false}),
      location: normalizeText(document.getElementById('prop-location').value)
    };

    if(editPid){
      const p = properties.find(x=>x.id===editPid);
      if(!p){
        uiToast('error','تعذر العثور على العقار المطلوب للتعديل.');
        return;
      }
      // id لا يتغير في وضع التعديل
      p.name = payload.name;
      p.type = payload.type;
      p.usage = payload.usage;
      p.location = payload.location;

      saveToLocal();
      closePropertyModal();
      renderProperties();
      updateDashboard();
      logAction('تم تحديث بيانات العقار');
      uiToast('success','تم تحديث بيانات العقار بنجاح');
      return;
    }

    // add mode
    if(properties.some(x=>x.id===payload.id)){
      uiToast('error','رمز العقار موجود مسبقاً. اختر رمزًا مختلفًا.');
      return;
    }

    properties.push({
      ...payload,
      units: []
    });

    saveToLocal();
    closePropertyModal();
    renderProperties();
    updateDashboard();
    logAction('تمت إضافة عقار جديد');
    uiToast('success','تمت إضافة العقار بنجاح');
  });

  function openUnitModal(propId, unitId){
    const m = document.getElementById('unit-modal');
    m.classList.remove('hidden');
    // Ensure no inline display overrides (Tailwind .hidden relies on display:none)
    m.style.display = '';
    document.getElementById('unit-prop-id').value = propId;
    // معرف العقار (طاقة) يتم إدخاله يدوياً لاحقاً — لا يتم تعبئته تلقائياً
    if(document.getElementById('unit-property-id')) document.getElementById('unit-property-id').value = '';
    document.getElementById('unit-id').value = unitId || '';

    const p = properties.find(x=>x.id===propId);
    const u = unitId ? p.units.find(x=>x.id===unitId) : null;

    if(u){
      ensureUnitFields(u);
      document.getElementById('unit-name').value = (u.unitName||u.name||unitLabel(u))||'';
      document.getElementById('unit-code').value = u.id||'';
      // عدادات الخدمات
      document.getElementById('unit-elec-meter-no').value = u.elecMeterNo || '';
            document.getElementById('unit-water-meter-no').value = u.waterMeterNo || '';
            // رقم الوحدة (UNT) لا يتم توليده تلقائياً — يعبأ يدوياً
      // معرف العقار (طاقة) للوحدة
      if(document.getElementById('unit-property-id')) document.getElementById('unit-property-id').value = (u.taqaPropertyId || u.propertyId || '') || '';
      document.getElementById('unit-code').disabled = false;
      
      document.getElementById('unit-type').value = u.type||'';
      document.getElementById('unit-usage').value = u.usage||'';
      document.getElementById('unit-status').value = u.status;
      document.getElementById('unit-tenant').value = u.tenant||'';
      document.getElementById('unit-rent').value = u.rent||'';
      document.getElementById('unit-contractNo').value = u.contractNo||'';
      document.getElementById('unit-start').value = u.start||'';
      document.getElementById('unit-end').value = u.end||'';
      updateUnitPreview();
    } else {
      document.getElementById('unit-form').reset();
      document.getElementById('unit-prop-id').value = propId;
    // معرف العقار (طاقة) يتم إدخاله يدوياً لاحقاً — لا يتم تعبئته تلقائياً
    if(document.getElementById('unit-property-id')) document.getElementById('unit-property-id').value = '';
      document.getElementById('unit-id').value = '';
      document.getElementById('unit-name').value = '';
      document.getElementById('unit-code').value = '';
      // عدادات الخدمات (فارغة عند الإضافة)
      document.getElementById('unit-elec-meter-no').value = '';
            document.getElementById('unit-water-meter-no').value = '';
            document.getElementById('unit-code').disabled = false;
      if(document.getElementById('unit-property-id')) document.getElementById('unit-property-id').value = '';
      updateUnitPreview();
    }
  }

  function updateUnitPreview(){
    const nameEl = document.getElementById('unit-name');
    const el = document.getElementById('unit-display-preview');
    if(!el || !nameEl) return;
    const label = String(nameEl.value||'').trim() || '—';
    el.textContent = label;
  }

  // live preview
  document.getElementById('unit-name')?.addEventListener('input', updateUnitPreview);
  

  function closeUnitModal(){
    const m = document.getElementById('unit-modal');
    if(!m) return;
    m.classList.add('hidden');
    // Clear/override any inline display that could keep the modal visible
    m.style.display = 'none';
  }

  document.getElementById('unit-form').addEventListener('submit', e=>{
    e.preventDefault();
    const pid = document.getElementById('unit-prop-id').value;
    const uid = document.getElementById('unit-id').value; // رقم الوحدة (UNT) الحالي عند التعديل
    const p = properties.find(x=>x.id===pid);
    // معرف العقار (طاقة) يُحفظ على مستوى الوحدة (اختياري)

    const unitName = normalizeText(normalizeDigits(String(document.getElementById('unit-name').value||''))).replace(/\s*-\s*/g,'-');
    const unitCode = normalizeDigits(String(document.getElementById('unit-code').value||'')).trim().toUpperCase();

    if(!unitName){
      uiToast('info', 'يرجى إدخال اسم الوحدة.');
      return;
    }
    if(!unitCode){
      uiToast('info', 'يرجى إدخال رقم الوحدة (UNT).');
      return;
    }

    const existingUnit = uid ? p.units.find(x=>x.id===uid) : null;

    // منع تكرار رقم الوحدة داخل نفس العقار عند الإضافة
    if(!existingUnit){
      const dup = p.units.some(x=> String(x.id||'').trim().toUpperCase() === unitCode);
      if(dup){
        uiToast('info', 'رقم الوحدة (UNT) مستخدم مسبقًا لهذا العقار.');
        return;
      }
    }

    
    const oldUnitCode = existingUnit ? String(existingUnit.id||'').trim().toUpperCase() : '';

    // عند تعديل رقم الوحدة، نقوم بتحديث أي روابط (شيكات/دفعات/سجل الإنذارات)
    if(existingUnit && oldUnitCode && oldUnitCode !== unitCode){
      // منع تكرار الرقم الجديد
      const dup2 = p.units.some(x=> String(x.id||'').trim().toUpperCase() === unitCode);
      if(dup2){
        uiToast('info', 'رقم الوحدة (UNT) مستخدم مسبقًا لهذا العقار.');
        return;
      }

      try{
        // تحديث الشيكات
        (cheques||[]).forEach(c=>{ if(String(c.unitId||'').trim().toUpperCase()===oldUnitCode) c.unitId = unitCode; });
        // تحديث الدفعات
        (payments||[]).forEach(pay=>{
          const k = String(pay.unitId||'').trim().toUpperCase();
          if(k===oldUnitCode) pay.unitId = unitCode;
        });

        // تحديث سجل الإنذارات (إن وجد)
        try{
          const nl = JSON.parse(localStorage.getItem('re_notice_log')||'[]');
          nl.forEach(r=>{
            if(String(r.unitId||'').trim().toUpperCase()===oldUnitCode) r.unitId = unitCode;
          });
          localStorage.setItem('re_notice_log', JSON.stringify(nl));
        }catch(e){}

      }catch(e){}
    }

const newUnit = {
      ...(existingUnit || {}),
      id: unitCode,
      unitName: unitName,
      name: unitName,
      // عدادات الخدمات
      elecMeterNo: String(document.getElementById('unit-elec-meter-no').value||'').trim(),
      waterMeterNo: String(document.getElementById('unit-water-meter-no').value||'').trim(),
      // معرف العقار (طاقة) للوحدة — اختياري
      taqaPropertyId: String(document.getElementById('unit-property-id')?.value || '').trim(),
      type: document.getElementById('unit-type').value,
      usage: document.getElementById('unit-usage').value,
      status: document.getElementById('unit-status').value,
      tenant: document.getElementById('unit-tenant').value,
      rent: parseInt(document.getElementById('unit-rent').value||0),
      contractNo: document.getElementById('unit-contractNo').value,
      start: document.getElementById('unit-start').value,
      end: document.getElementById('unit-end').value
    };

    // keep legacy display label synced
    ensureUnitFields(newUnit);

// إذا تم تحويل الوحدة إلى شاغرة من صفحة الوحدات، نحفظ العقد السابق في سجل العقود ثم ننظّف بيانات العقد
    if(newUnit.status === 'شاغرة'){
      if(existingUnit && unitHasLeaseData(existingUnit) && (existingUnit.status !== 'شاغرة')){
        archiveUnitLease(existingUnit, 'إخلاء', 'مخلى', 'إخلاء/تعديل من صفحة الوحدات', 'vacate');
        // نقل السجل إلى الوحدة الجديدة حتى لا نفقد التاريخ
        ensureLeaseHistory(newUnit);
        newUnit.leaseHistory = (existingUnit.leaseHistory || []).slice();
      } else if(existingUnit && Array.isArray(existingUnit.leaseHistory)){
        newUnit.leaseHistory = existingUnit.leaseHistory;
      }
      newUnit.tenant = '';
      newUnit.rent = 0;
      newUnit.contractNo = '';
      newUnit.start = '';
      newUnit.end = '';
      newUnit.contractGroupId = '';
      if(newUnit.leaseExtra) delete newUnit.leaseExtra.contractGroupId;
    } else if(existingUnit && Array.isArray(existingUnit.leaseHistory)){
      // حافظ على السجل عند التعديل
      newUnit.leaseHistory = existingUnit.leaseHistory;
    } else {
      ensureLeaseHistory(newUnit);
    }
if(uid){
      const idx = p.units.findIndex(x=>x.id===uid);
      p.units[idx] = newUnit;
    } else {
      p.units.push(newUnit);
    }
    saveToLocal();
    closeUnitModal();
    showView('properties');
    updateDashboard();
  });

  function openAddLeaseModal(){
    const m = document.getElementById('add-lease-modal');
    m.classList.remove('hidden');
    // Ensure no inline display overrides (Tailwind .hidden relies on display:none)
    m.style.display = '';
    const propSelect = document.getElementById('add-lease-prop');
    propSelect.innerHTML = '<option value="">اختر العقار...</option>';
    properties.forEach(p => {
      propSelect.innerHTML += `<option value="${escHtml(p.id)}">${escHtml(p.name)}</option>`;
    });
    document.getElementById('add-lease-form').reset();
    applyTenantTypeUI('add-lease');
    _resetAddLeaseUnits();

    // Reset schedule UI
    try{
      const payChk = document.getElementById('add-lease-schedule-payments');
      const chqChk = document.getElementById('add-lease-schedule-cheques');
      if(payChk) payChk.checked = false;
      if(chqChk) chqChk.checked = false;
      const pe = document.getElementById('add-lease-payplan-error'); if(pe) pe.textContent='';
      const ce = document.getElementById('add-lease-chqplan-error'); if(ce) ce.textContent='';
      onAddLeaseScheduleChanged();
    }catch(e){}
  }

  function closeAddLeaseModal(){
    const m = document.getElementById('add-lease-modal');
    if(!m) return;
    m.classList.add('hidden');
    m.style.display = 'none';
  }

  // ===== Multi-unit contract builder (Add Lease) =====
  let _addLeaseUnits = [{ unitId:'', rent:'' }];

  function _resetAddLeaseUnits(){
    _addLeaseUnits = [{ unitId:'', rent:'' }];
    renderAddLeaseUnitsRows();
    const err = document.getElementById('add-lease-units-error');
    if(err) err.textContent = '';
  }

  function addLeaseUnitRow(){
    const propId = document.getElementById('add-lease-prop')?.value || '';
    const err = document.getElementById('add-lease-units-error');
    if(!propId){
      if(err) err.textContent = 'اختر العقار أولاً ثم أضف الوحدات.';
      return;
    }
    if(err) err.textContent = '';
    _addLeaseUnits.push({ unitId:'', rent:'' });
    renderAddLeaseUnitsRows();
  }

  function removeLeaseUnitRow(i){
    _addLeaseUnits.splice(i, 1);
    if(_addLeaseUnits.length === 0) _addLeaseUnits = [{ unitId:'', rent:'' }];
    renderAddLeaseUnitsRows();
  }

  function onAddLeaseUnitChanged(i, val){
    _addLeaseUnits[i].unitId = val;
    renderAddLeaseUnitsRows(); // refresh options to prevent duplicates
  }

  function onAddLeaseUnitRent(i, val){
    _addLeaseUnits[i].rent = val;
    _updateAddLeaseTotalRent();
  }

  function _updateAddLeaseTotalRent(){
    const total = _addLeaseUnits.reduce((s,r)=> s + (parseFloat(r.rent)||0), 0);
    window.__addLeaseTotalRentNum = total;
    const el = document.getElementById('add-lease-total-rent');
    if(el) el.textContent = formatAED(total);

    // Update schedule defaults (preserve user edits)
    try{ onAddLeaseScheduleChanged(); }catch(e){}
  }

  function renderAddLeaseUnitsRows(){
    const tbody = document.getElementById('add-lease-units-body');
    if(!tbody) return;

    tbody.innerHTML = '';
    const propId = document.getElementById('add-lease-prop')?.value || '';
    if(!propId){
      tbody.innerHTML = `<tr><td colspan="3" class="py-3 text-center text-gray-500">اختر العقار أولاً لإظهار الوحدات الشاغرة.</td></tr>`;
      _updateAddLeaseTotalRent();
      return;
    }

    const prop = properties.find(p => p.id === propId);
    const vacantUnits = (prop?.units || []).filter(u => u.status !== 'مؤجرة');
    if(vacantUnits.length === 0){
      tbody.innerHTML = `<tr><td colspan="3" class="py-3 text-center text-gray-500">لا توجد وحدات شاغرة في هذا العقار.</td></tr>`;
      _updateAddLeaseTotalRent();
      return;
    }

    const selected = new Set(_addLeaseUnits.map(r=>r.unitId).filter(Boolean));

    _addLeaseUnits.forEach((row, idx) => {
      const usedElsewhere = new Set([...selected]);
      if(row.unitId) usedElsewhere.delete(row.unitId);

      let options = `<option value="">اختر الوحدة...</option>`;
      vacantUnits.forEach(u => {
        const disabled = usedElsewhere.has(u.id) ? 'disabled' : '';
        const sel = row.unitId === u.id ? 'selected' : '';
        options += `<option value="${escHtml(u.id)}" ${disabled} ${sel}>${escHtml(u.name)}</option>`;
      });

      const rentVal = (row.rent ?? '');
      tbody.innerHTML += `
        <tr class="border-b border-gray-100 dark:border-gray-800">
          <td class="py-2 px-2">
            <select class="ui-field ui-select w-full" onchange="onAddLeaseUnitChanged(${idx}, this.value)">${options}</select>
          </td>
          <td class="py-2 px-2">
            <input type="number" min="0" class="ui-field w-full" value="${rentVal}" oninput="onAddLeaseUnitRent(${idx}, this.value)" placeholder="0">
          </td>
          <td class="py-2 px-2 text-center">
            <button type="button" class="btn-ui btn-icon btn-reset btn-ui-sm" onclick="removeLeaseUnitRow(${idx})" aria-label="حذف">✕</button>
          </td>
        </tr>
      `;
    });

    _updateAddLeaseTotalRent();

    // Refresh schedule unit dropdowns when units list changes
    try{ onAddLeaseScheduleChanged(); }catch(e){}
  }


  // ===== Add Lease: Optional schedule for payments/cheques =====
  function _addMonthsISO(dateStr, months){
    if(!dateStr) return '';
    const d = new Date(dateStr);
    if(!Number.isFinite(d.getTime())) return '';
    const out = new Date(d.getTime());
    // Use local month arithmetic (ISO date input is local)
    out.setMonth(out.getMonth() + Math.round(months));
    return out.toISOString().slice(0,10);
  }

  
  // --- Helpers for integer AED splits (no decimals) ---
  function _toIntAED(n){
    const v = Math.round(Number(n)||0);
    return (v < 0 || !Number.isFinite(v)) ? 0 : v;
  }

  function _splitIntValues(total, count){
    const t = _toIntAED(total);
    const c = Math.max(0, parseInt(count,10) || 0);
    if(!c) return [];
    const base = Math.floor(t / c);
    let rem = t - base * c;
    const out = Array(c).fill(base);
    // distribute remainder (+1) from first items to keep sum exact
    for(let i=0; i<out.length && rem>0; i++, rem--){
      out[i] += 1;
    }
    return out;
  }
function _readExistingPayPlan(){
    const rows = [];
    const body = document.getElementById('add-lease-payplan-body');
    if(!body) return rows;
    body.querySelectorAll('tr[data-payplan-row]').forEach(tr=>{
      const i = Number(tr.getAttribute('data-payplan-row'));
      const amount = tr.querySelector('[data-payplan-amount]')?.value || '';
      const dueDate = tr.querySelector('[data-payplan-date]')?.value || '';
      const method = tr.querySelector('[data-payplan-method]')?.value || '';
      rows[i-1] = { amount, dueDate, method };
    });
    return rows;
  }

  function _readExistingChqPlan(){
    const rows = [];
    const body = document.getElementById('add-lease-chqplan-body');
    if(!body) return rows;
    body.querySelectorAll('tr[data-chqplan-row]').forEach(tr=>{
      const i = Number(tr.getAttribute('data-chqplan-row'));
      rows[i-1] = {
        chequeNo: tr.querySelector('[data-chqplan-no]')?.value || '',
        value: tr.querySelector('[data-chqplan-value]')?.value || '',
        dueDate: tr.querySelector('[data-chqplan-date]')?.value || '',
        bank: tr.querySelector('[data-chqplan-bank]')?.value || '',
        purpose: tr.querySelector('[data-chqplan-purpose]')?.value || '',
        unitId: tr.querySelector('[data-chqplan-unit]')?.value || ''
      };
    });
    return rows;
  }

  function _buildAddLeaseUnitOptions(selectedUnitIds){
    const propId = document.getElementById('add-lease-prop')?.value || '';
    const prop = properties.find(p => p.id === propId);
    const opts = [];
    (selectedUnitIds||[]).forEach(uid=>{
      const u = prop?.units?.find(x=>x.id===uid);
      if(u) opts.push({ id: u.id, name: u.name });
    });
    return opts;
  }

  function buildAddLeasePayPlanRows(count){
    const wrap = document.getElementById('add-lease-payplan-wrap');
    const body = document.getElementById('add-lease-payplan-body');
    if(!wrap || !body) return;

    const existing = _readExistingPayPlan();
    const totalRent = Number(window.__addLeaseTotalRentNum||0);
    const split = (count>0 && totalRent>0) ? _splitIntValues(totalRent, count) : [];
    const start = (document.getElementById('add-lease-start')?.value || '').trim();
    const stepMonths = (count>0) ? (12 / count) : 0;

    let html = '';
    for(let i=1;i<=count;i++){
      const prev = existing[i-1] || {};
      const dueDefault = start ? _addMonthsISO(start, (i-1)*stepMonths) : '';
      const amountVal = (prev.amount !== undefined && prev.amount !== '') ? prev.amount : (split[i-1] !== undefined ? String(split[i-1]) : '');
      const dateVal = (prev.dueDate !== undefined && prev.dueDate !== '') ? prev.dueDate : dueDefault;
      const methodVal = (prev.method || '').trim();

      html += `
        <tr class="border-b border-gray-100 dark:border-gray-800" data-payplan-row="${i}">
          <td class="py-2 px-2 text-right font-mono">${i}</td>
          <td class="py-2 px-2">
            <input type="number" min="0" step="1" class="ui-field w-40" value="${escHtml(amountVal)}" data-payplan-amount="${i}" placeholder="0">
          </td>
          <td class="py-2 px-2">
            <input type="date" class="ui-field" value="${escHtml(dateVal)}" data-payplan-date="${i}">
          </td>
          <td class="py-2 px-2">
            <select class="ui-field ui-select" data-payplan-method="${i}">
              <option ${methodVal==='تحويل'?'selected':''}>تحويل</option>
              <option ${methodVal==='نقد'?'selected':''}>نقد</option>
              <option ${methodVal==='شيك'?'selected':''}>شيك</option>
              <option ${methodVal==='أخرى'?'selected':''}>أخرى</option>
            </select>
          </td>
        </tr>
      `;
    }
    body.innerHTML = html;
  }

  function buildAddLeaseChequePlanRows(count){
    const wrap = document.getElementById('add-lease-chqplan-wrap');
    const body = document.getElementById('add-lease-chqplan-body');
    if(!wrap || !body) return;

    const existing = _readExistingChqPlan();
    const totalRent = Number(window.__addLeaseTotalRentNum||0);
    const split = (count>0 && totalRent>0) ? _splitIntValues(totalRent, count) : [];
    const start = (document.getElementById('add-lease-start')?.value || '').trim();
    const stepMonths = (count>0) ? (12 / count) : 0;

    const unitIds = (_addLeaseUnits||[]).map(x=>x.unitId).filter(Boolean);
    const unitOpts = _buildAddLeaseUnitOptions(unitIds);
    const isSingleUnit = unitOpts.length === 1;

    const unitSelectHTML = (selectedId='') => {
      if(!unitOpts.length) return `<option value="">—</option>`;
      return unitOpts.map(u=>`<option value="${escHtml(u.id)}" ${(selectedId===u.id)?'selected':''}>${escHtml(u.name)}</option>`).join('');
    };

    let html = '';
    for(let i=1;i<=count;i++){
      const prev = existing[i-1] || {};
      const dueDefault = start ? _addMonthsISO(start, (i-1)*stepMonths) : '';
      const val = (prev.value !== undefined && prev.value !== '') ? prev.value : (split[i-1] !== undefined ? String(split[i-1]) : '');
      const dateVal = (prev.dueDate !== undefined && prev.dueDate !== '') ? prev.dueDate : dueDefault;
      const unitVal = prev.unitId || (isSingleUnit ? unitOpts[0].id : '');

      html += `
        <tr class="border-b border-gray-100 dark:border-gray-800" data-chqplan-row="${i}">
          <td class="py-2 px-2 text-right font-mono">${i}</td>
          <td class="py-2 px-2"><input type="text" class="ui-field" value="${escHtml(prev.chequeNo||'')}" data-chqplan-no="${i}" placeholder="اختياري"></td>
          <td class="py-2 px-2"><input type="number" min="0" step="1" class="ui-field w-40" value="${escHtml(val)}" data-chqplan-value="${i}" placeholder="0"></td>
          <td class="py-2 px-2"><input type="date" class="ui-field" value="${escHtml(dateVal)}" data-chqplan-date="${i}"></td>
          <td class="py-2 px-2"><input type="text" class="ui-field" value="${escHtml(prev.bank||'')}" data-chqplan-bank="${i}" placeholder=""></td>
          <td class="py-2 px-2"><input type="text" class="ui-field" value="${escHtml(prev.purpose||'إيجار')}" data-chqplan-purpose="${i}" placeholder=""></td>
          <td class="py-2 px-2">
            <select class="ui-field ui-select" data-chqplan-unit="${i}" ${isSingleUnit?'disabled':''}>
              ${unitSelectHTML(unitVal)}
            </select>
          </td>
        </tr>
      `;
    }
    body.innerHTML = html;
  }

  function onAddLeaseScheduleChanged(){
    const pc = parseIntSafe(document.getElementById('add-lease-paymentsCount')?.value || '0');
    const cc = parseIntSafe(document.getElementById('add-lease-chequesCount')?.value || '0');

    const payChk = document.getElementById('add-lease-schedule-payments');
    const chqChk = document.getElementById('add-lease-schedule-cheques');

    const payWrap = document.getElementById('add-lease-payplan-wrap');
    const chqWrap = document.getElementById('add-lease-chqplan-wrap');

    const payErr = document.getElementById('add-lease-payplan-error'); if(payErr) payErr.textContent='';
    const chqErr = document.getElementById('add-lease-chqplan-error'); if(chqErr) chqErr.textContent='';

    const showPay = !!(payChk && payChk.checked && pc > 0);
    const showChq = !!(chqChk && chqChk.checked && cc > 0);

    if(payWrap) payWrap.classList.toggle('hidden', !showPay);
    if(chqWrap) chqWrap.classList.toggle('hidden', !showChq);

    if(showPay) buildAddLeasePayPlanRows(pc);
    if(showChq) buildAddLeaseChequePlanRows(cc);
  }

  // Listen for changes that affect schedule defaults
  try{
    document.getElementById('add-lease-paymentsCount')?.addEventListener('input', onAddLeaseScheduleChanged);
    document.getElementById('add-lease-chequesCount')?.addEventListener('input', onAddLeaseScheduleChanged);
    document.getElementById('add-lease-start')?.addEventListener('change', onAddLeaseScheduleChanged);
  }catch(e){}


  document.getElementById('add-lease-prop').addEventListener('change', function(){
    _resetAddLeaseUnits();
  });

  document.getElementById('add-lease-form').addEventListener('submit', e => {
    e.preventDefault();

    const propId = (document.getElementById('add-lease-prop')?.value || '').trim();
    const unitsErrEl = document.getElementById('add-lease-units-error');
    if(unitsErrEl) unitsErrEl.textContent = '';

    if(!propId){
      uiToast('info', "الرجاء اختيار العقار");
      return;
    }

    const rows = (_addLeaseUnits || []).filter(r => r && r.unitId);
    if(rows.length === 0){
      if(unitsErrEl) unitsErrEl.textContent = 'الرجاء إضافة وحدة واحدة على الأقل ضمن العقد.';
      return;
    }

    // Validate duplicates
    const seen = new Set();
    for(const r of rows){
      if(seen.has(r.unitId)){
        if(unitsErrEl) unitsErrEl.textContent = 'تم اختيار نفس الوحدة أكثر من مرة.';
        return;
      }
      seen.add(r.unitId);
    }

    // Validate rent per unit
    for(const r of rows){
      const rent = parseMoney(r.rent || 0);
      if(!rent || rent <= 0){
        if(unitsErrEl) unitsErrEl.textContent = 'الرجاء إدخال الإيجار السنوي لكل وحدة.';
        return;
      }
    }

    const prop = properties.find(p => p.id === propId);
    if(!prop){
      uiToast('error', "العقار غير موجود");
      return;
    }

    const tenantName = normalizeText(normalizeDigits(document.getElementById('add-lease-tenant')?.value || ''));
    if(!tenantName){
      uiToast('info', "الرجاء إدخال اسم المستأجر");
      return;
    }

    const contractNo = normalizeText(normalizeDigits(document.getElementById('add-lease-contractNo')?.value || ''), {collapseSpaces:false});
    const start = (document.getElementById('add-lease-start')?.value || '').trim();
    const end = (document.getElementById('add-lease-end')?.value || '').trim();

    
      if(!isDateOrderOk(start, end)){
        uiToast('error','تاريخ بداية العقد يجب أن يكون قبل/يساوي تاريخ النهاية.');
        return;
      }

      if(contractNo){
        const hits = findUnitsByContractNo(contractNo);
        if(hits.length){
          const msg = 'رقم العقد مستخدم بالفعل في وحدات أخرى. هل تريد المتابعة (قد يكون تجديد/تعديل)؟';
          if(!confirm(msg)) return;
        }
      }

// Extra contract/tenant fields (shared across units)
    const extra = {
      phone: normalizePhone(document.getElementById('add-lease-phone')?.value || ''),
      email: normalizeEmail(document.getElementById('add-lease-email')?.value || ''),
      paymentsCount: parseIntSafe(document.getElementById('add-lease-paymentsCount')?.value || '0'),
      chequesCount: parseIntSafe(document.getElementById('add-lease-chequesCount')?.value || '0'),
      bankGuarantee: parseMoney(document.getElementById('add-lease-bankGuarantee')?.value || '0'),
      tenantType: normalizeText(document.getElementById('add-lease-tenantType')?.value || '', {collapseSpaces:false}),
      tradeLicenseNo: normalizeText(normalizeDigits(document.getElementById('add-lease-tradeLicense')?.value || ''), {collapseSpaces:false}),
      idNumber: normalizeText(normalizeDigits(document.getElementById('add-lease-idNumber')?.value || ''), {collapseSpaces:false}),
    };
      if(extra.email && !isValidEmail(extra.email)){
        uiToast('warn','صيغة البريد الإلكتروني غير صحيحة. سيتم الحفظ كما هو، لكن يُفضّل تصحيحها.');
      }



    const totalRent = rows.reduce((s,r)=> s + (parseMoney(r.rent)||0), 0);
    const contractGroupId = `CG-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;

    // --- Optional: create scheduled payments/cheques (Pending) ---
    const schedulePaymentsEnabled = !!(document.getElementById('add-lease-schedule-payments')?.checked && extra.paymentsCount > 0);
    const scheduleChequesEnabled  = !!(document.getElementById('add-lease-schedule-cheques')?.checked && extra.chequesCount > 0);

    const scheduledPaymentsPlan = [];
    const scheduledChequesPlan  = [];

    if(schedulePaymentsEnabled){
      const errEl = document.getElementById('add-lease-payplan-error');
      if(errEl) errEl.textContent = '';

      const plan = (_readExistingPayPlan() || []).slice(0, extra.paymentsCount);
      for(let i=0;i<extra.paymentsCount;i++){
        const r = plan[i] || {};
        const amt = _toIntAED(parseMoney(r.amount || 0));
        const dueDate = (r.dueDate || '').trim();
        const method = (r.method || 'تحويل').trim() || 'تحويل';
        if(!dueDate || !(amt > 0)){
          if(errEl) errEl.textContent = 'الرجاء إدخال مبلغ وتاريخ استحقاق لكل دفعة.';
          uiToast('info','أكمل بيانات الدفعات المجدولة أو ألغِ خيار الجدولة.');
          return;
        }
        scheduledPaymentsPlan.push({ amount: amt, dueDate, method });
      }
    }

    if(scheduleChequesEnabled){
      const errEl = document.getElementById('add-lease-chqplan-error');
      if(errEl) errEl.textContent = '';

      const plan = (_readExistingChqPlan() || []).slice(0, extra.chequesCount);
      const selectedUnitIds = rows.map(x=>x.unitId).filter(Boolean);
      const isSingleUnit = selectedUnitIds.length === 1;
      for(let i=0;i<extra.chequesCount;i++){
        const r = plan[i] || {};
        const value = _toIntAED(parseMoney(r.value || 0));
        const dueDate = (r.dueDate || '').trim();
        const unitId = (r.unitId || '').trim() || (isSingleUnit ? selectedUnitIds[0] : '');
        if(!dueDate || !(value > 0) || (!unitId && !isSingleUnit)){
          if(errEl) errEl.textContent = 'الرجاء إدخال قيمة وتاريخ استحقاق واختيار الوحدة لكل شيك.';
          uiToast('info','أكمل بيانات الشيكات المجدولة أو ألغِ خيار الجدولة.');
          return;
        }
        scheduledChequesPlan.push({
          chequeNo: (r.chequeNo || '').trim(),
          value,
          dueDate,
          bank: (r.bank || '').trim(),
          purpose: (r.purpose || 'إيجار').trim() || 'إيجار',
          unitId
        });
      }
    }

    // Link/update tenant contact record once
    const tk = tenantKey(tenantName);
    const prev = tenantsContacts[tk] || { name: tenantName, phone:'', email:'' };
    tenantsContacts[tk] = {
      name: tenantName,
      phone: extra.phone || prev.phone || '',
      email: extra.email || prev.email || '',
      tenantType: extra.tenantType || prev.tenantType || '',
      tradeLicenseNo: extra.tradeLicenseNo || prev.tradeLicenseNo || '',
      idNumber: extra.idNumber || prev.idNumber || ''
    };

    // Apply the lease to each selected unit
    rows.forEach(r => {
      const unit = prop.units.find(u => u.id === r.unitId);
      if(!unit) return;

      // If the unit contains previous lease data (e.g. ended/old) save it in history before replacing
      if(unitHasLeaseData(unit) && unit.status !== 'شاغرة'){
        archiveUnitLease(unit, 'تجديد', 'تجديد عقد', `تم تجديد العقد بعقد جديد (${contractNo || 'بدون رقم'})`, 'renew');
      }

      unit.status = 'مؤجرة';
      unit.tenant = tenantName;
      unit.rent = parseMoney(r.rent || 0);
      unit.contractNo = contractNo;
      unit.start = start;
      unit.end = end;

      // Shared metadata to help grouping later
      unit.contractGroupId = contractGroupId;
      unit.leaseExtra = Object.assign({}, unit.leaseExtra || {}, extra, {
        contractGroupId,
        contractUnitsCount: rows.length,
        contractTotalRent: totalRent
      });
    });

    // Create scheduled records (Pending) in payments/cheques registers
    try{
      const unitNames = rows.map(x=>{
        const u = prop.units.find(uu=>uu.id===x.unitId);
        return u ? u.name : '';
      }).filter(Boolean);
      const unitLabel = (unitNames.length > 1) ? (`متعدد (${unitNames.length})`) : (unitNames[0] || '');
      const unitLabelFull = (unitNames.length > 1) ? (`${unitLabel}: ${unitNames.join('، ')}`) : unitLabel;

      if(Array.isArray(scheduledPaymentsPlan) && scheduledPaymentsPlan.length){
        scheduledPaymentsPlan.forEach((sp, idx)=>{
          payments.push({
            id: `PPLAN-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2,6)}`,
            date: sp.dueDate, // use due date for sorting until paid
            dueDate: sp.dueDate,
            tenant: tenantName,
            unit: unitLabelFull,
            contract: contractNo,
            due: Number(sp.amount)||0,
            type: sp.method || 'تحويل',
            amount: 0,
            desc: `دفعة مجدولة #${idx+1}`,
            voucherNo: '',
            status: 'بانتظار الدفع',
            isPlanned: true,
            groupKey: contractGroupId,
            source: 'schedule'
          });
        });
      }

      if(Array.isArray(scheduledChequesPlan) && scheduledChequesPlan.length){
        scheduledChequesPlan.forEach((ch, idx)=>{
          cheques.push(normalizeChequeRecord({
            id: `CHQP-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2,6)}`,
            tenant: tenantName,
            chequeNo: ch.chequeNo || '',
            value: Number(ch.value)||0,
            dueDate: ch.dueDate,
            bank: ch.bank || '',
            purpose: ch.purpose || 'إيجار',
            unitId: ch.unitId || '',
            status: 'بانتظار الصرف',
            contract: contractNo,
            groupKey: contractGroupId,
            source: 'schedule'
          }));
        });
      }
    }catch(e){}

    saveToLocal();
    closeAddLeaseModal();
    showView('leases');
    logAction(`تم إنشاء عقد جديد (${contractNo || 'بدون رقم'}) يضم ${rows.length} وحدة للمستأجر ${tenantName}`);
    updateDashboard();

    // Refresh registers if user is on these views
    try{ renderPayments(); }catch(e){}
    try{ renderCheques(); }catch(e){}
  });

  
  
  function ensureLeasePaymentModal(){
    let m = document.getElementById('lease-payment-modal');
    if(m){
      try{ if(m.parentElement && m.parentElement !== document.body) document.body.appendChild(m); }catch(e){}
      return m;
    }
const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div id="lease-payment-modal" class="fixed inset-0 z-50 hidden">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="modal-content relative max-w-4xl mx-auto mt-10 bg-white dark:bg-dark-surface rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
            <div class="font-extrabold text-gray-800 dark:text-white" id="lease-pay-title">تسجيل دفعة</div>
            <button type="button" class="px-3 py-1.5 rounded-lg text-sm font-bold bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600" data-leasepay-close>إغلاق</button>
          </div>

          <div class="p-4 max-h-[70vh] overflow-auto">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">تاريخ الدفعة</label>
                <input id="lease-pay-date" type="date" class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">المبلغ الإجمالي</label>
                <input id="lease-pay-total" type="text" placeholder="مثال: 190000" class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface" />
              </div>
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">طريقة الدفع</label>
                <select id="lease-pay-method" class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface">
                  <option>تحويل</option><option>نقد</option><option>شيك</option><option>أخرى</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">مرجع</label>
                <input id="lease-pay-ref" type="text" placeholder="رقم حوالة / شيك" class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-surface" />
              </div>
            </div>

            <div class="mt-4 flex items-center justify-between gap-3">
              <div class="text-sm font-bold text-gray-700 dark:text-gray-200">
                مجموع التوزيع: <span id="lease-pay-sum" class="font-mono">0 AED</span>
                <span class="mx-2">|</span>
                الفرق: <span id="lease-pay-diff" class="font-mono text-red-600 dark:text-red-300">0 AED</span>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" class="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-bold" data-leasepay-auto>توزيع تلقائي</button>
              </div>
            </div>

            <div class="mt-3 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div class="bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-extrabold text-gray-700 dark:text-gray-200">توزيع الدفعة على الوحدات</div>
              <div class="overflow-x-auto">
                <table class="ui-table min-w-full text-right text-sm">
                  <thead class="bg-white dark:bg-dark-surface">
                    <tr class="text-xs text-gray-500 dark:text-gray-400">
                      <th class="py-2 px-2">الوحدة</th>
                      <th class="py-2 px-2">إيجار الوحدة</th>
                      <th class="py-2 px-2">المستلم سابقاً</th>
                      <th class="py-2 px-2">المتبقي</th>
                      <th class="py-2 px-2">مبلغ مخصص</th>
                    </tr>
                  </thead>
                  <tbody id="lease-pay-units-body"></tbody>
                </table>
              </div>
            </div>

            <div class="mt-4 flex items-center justify-end gap-2">
              <button type="button" class="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 font-bold" data-leasepay-cancel>إلغاء</button>
              <button type="button" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold" data-leasepay-save>حفظ الدفعة</button>
            </div>
          </div>
        </div>
      </div>
    `.trim();
    document.body.appendChild(wrap.firstElementChild);

    m = document.getElementById('lease-payment-modal');
    m.addEventListener('click', (e)=>{
      const t = e.target;
      if(t && t.matches('[data-leasepay-close],[data-leasepay-cancel]')){
        e.preventDefault(); e.stopPropagation();
        m.classList.add('hidden');
      } else if(t && t.matches('[data-leasepay-auto]')){
        e.preventDefault(); e.stopPropagation();
        autoDistributeLeasePayment();
      } else if(t && t.matches('[data-leasepay-save]')){
        e.preventDefault(); e.stopPropagation();
        saveLeasePayment();
      }
    });
    const total = document.getElementById('lease-pay-total');
    if(total) total.addEventListener('input', ()=> onLeasePayTotalChange());

    return m;
  }

  function getAllActiveLeasesUnits(){
    const list = [];
    (properties||[]).forEach(p=>{
      (p.units||[]).forEach(u=>{
        if(u && u.status !== 'شاغرة') list.push({...u, propName:p.name, propId:p.id});
      });
    });
    return list;
  }

  function buildLeaseGroupsForLookup(){
    const allUnits = getAllActiveLeasesUnits();
    const map = new Map();
    allUnits.forEach(u=>{
      const cg = u.contractGroupId || (u.leaseExtra && u.leaseExtra.contractGroupId) || '';
      const key = cg || (u.contractNo ? `CN-${u.contractNo}` : `U-${u.propId}-${u.id}`);
      if(!map.has(key)){
        map.set(key, { groupKey:key, contractNo:u.contractNo||'', tenant:u.tenant||'', units:[], rent:0 });
      }
      const g = map.get(key);
      g.units.push(u);
      g.rent += (Number(u.rent)||0);
      if(!g.tenant && u.tenant) g.tenant = u.tenant;
      if(!g.contractNo && u.contractNo) g.contractNo = u.contractNo;
    });
    return map;
  }

  function getLeaseGroupByKey(groupKey){
    const cache = window.__leaseGroupsCache || {};
    if(cache[groupKey]) return cache[groupKey];

    const map = buildLeaseGroupsForLookup();
    const g = map.get(groupKey);
    if(g){
      g.unitsCount = g.units.length;
      g.unitsNames = g.units.map(x=>x.name).filter(Boolean).join(', ');
      g.propName = Array.from(new Set(g.units.map(x=>x.propName).filter(Boolean))).join('، ');
      g.start = g.units.map(x=>x.start).filter(Boolean).sort()[0] || '';
      g.end = g.units.map(x=>x.end).filter(Boolean).sort().slice(-1)[0] || '';
      window.__leaseGroupsCache = window.__leaseGroupsCache || {};
      window.__leaseGroupsCache[groupKey] = g;
      return g;
    }

    if(String(groupKey||'').startsWith('CN-')){
      const cn = String(groupKey).slice(3);
      for(const [k,val] of map.entries()){
        if(val && String(val.contractNo||'') === cn){
          window.__leaseGroupsCache = window.__leaseGroupsCache || {};
          window.__leaseGroupsCache[groupKey] = val;
          return val;
        }
      }
    }
    return null;
  }


// ===== Lease Payments (Multi-unit contract payments) =====
  function openLeasePaymentModal(groupKey){
    const m = ensureLeasePaymentModal();
    m.classList.remove('hidden');
    m.style.display = '';

    // Clear any scheduled-completion context by default
    try{ delete m.dataset.scheduledPayId; }catch(e){}

    const g = getLeaseGroupByKey(groupKey);
    m.dataset.groupKey = String(groupKey||'');

    const tb = document.getElementById('lease-pay-units-body');
    if(!tb) return;

    // Reset form fields
    const today = new Date();
    const dt = document.getElementById('lease-pay-date');
    if(dt) dt.value = today.toISOString().slice(0,10);
    const totalEl = document.getElementById('lease-pay-total');
    if(totalEl) totalEl.value = '';
    try{ m.dataset.distTouched = '0'; }catch(e){}
    const methodEl = document.getElementById('lease-pay-method');
    if(methodEl) methodEl.value = 'تحويل';
    const refEl = document.getElementById('lease-pay-ref');
    if(refEl) refEl.value = '';

    tb.innerHTML = '';

    if(!g){
      const title = document.getElementById('lease-pay-title');
      if(title) title.textContent = 'تسجيل دفعة — (تعذر تحديد العقد)';
      tb.innerHTML = `<tr><td colspan="4" class="py-3 text-center text-gray-500">لا يمكن تحديد العقد/الوحدات لهذا السجل.</td></tr>`;
      updateLeasePaySum();
      return;
    }

    // Store contractNo for legacy filtering, but always rely on groupKey for multi-unit distribution
    m.dataset.contractNo = String(g.contractNo || '');

    const title = document.getElementById('lease-pay-title');
    if(title) title.textContent = `تسجيل دفعة للعقد: ${g.contractNo || ''} — ${escHtml(g.tenant || '')}`;

    if(!g.units || !g.units.length){
      tb.innerHTML = `<tr><td colspan="4" class="py-3 text-center text-gray-500">لا توجد وحدات ضمن هذا العقد.</td></tr>`;
      updateLeasePaySum();
      return;
    }

    const frag = document.createDocumentFragment();
    (g.units||[]).forEach(u=>{
      const paid = sumLeasePaidForUnit(g.contractNo, u.propId, u.id, g.groupKey);
      const remain = Math.max(0, (Number(u.rent)||0) - paid);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="py-2 px-2 text-right">${escHtml(u.propName||'')}</td>
        <td class="py-2 px-2 text-right">${escHtml(u.name||'')}</td>
        <td class="py-2 px-2 text-center"><span class="font-mono">${formatAED(remain)}</span></td>
        <td class="py-2 px-2 text-center">
          <input class="lease-alloc-input ui-field" type="number" min="0" step="1" data-unit="${escHtml(u.id)}" data-prop="${escHtml(u.propId)}" data-unitname="${escHtml(u.name||'')}" value="0" oninput="onLeaseAllocChanged()">
        </td>
      `;
      frag.appendChild(tr);
    });

    tb.appendChild(frag);
    updateLeasePaySum();
  }

function updateLeasePaySum(){
    const total = _toIntAED(parseAED(document.getElementById('lease-pay-total')?.value));
    let sum = 0;
    document.querySelectorAll('.lease-alloc-input').forEach(inp=>{
      sum += _toIntAED(parseAED(inp.value));
    });
    const diff = (total - sum);
    const sumEl = document.getElementById('lease-pay-sum');
    const diffEl = document.getElementById('lease-pay-diff');
    if(sumEl) sumEl.textContent = formatAED(sum);
    if(diffEl){
      diffEl.textContent = formatAED(diff);
      diffEl.className = 'font-mono ' + (diff === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-300');
    }

  function onLeaseAllocChanged(){
    const m = document.getElementById('lease-payment-modal');
    try{ if(m) m.dataset.distTouched = '1'; }catch(e){}
    updateLeasePaySum();
  }

  function onLeasePayTotalChange(){
    const m = document.getElementById('lease-payment-modal');
    // if user did not manually tweak allocations, keep auto-distribution in sync with the total
    const touched = (m && m.dataset && m.dataset.distTouched === '1');
    if(!touched){
      try{ autoDistributeLeasePayment(); }catch(e){}
    } else {
      updateLeasePaySum();
    }
  }
  }

  // Called from Payments page for scheduled (pending) payments belonging to multi-unit leases
  function completeScheduledLeasePayment(scheduledPaymentId){
    const p = (payments||[]).find(x=>x.id===scheduledPaymentId);
    if(!p){ uiToast('error','لا يمكن العثور على الدفعة المجدولة'); return; }
    const groupKey = p.groupKey || '';
    if(!groupKey){ uiToast('error','تعذر تحديد العقد لهذه الدفعة'); return; }

    openLeasePaymentModal(groupKey);
    const m = document.getElementById('lease-payment-modal');
    if(m) m.dataset.scheduledPayId = String(scheduledPaymentId);
    // Prefill
    try{
      const dt = document.getElementById('lease-pay-date');
      if(dt) dt.value = (p.dueDate || p.date || new Date().toISOString().slice(0,10));
      const tot = document.getElementById('lease-pay-total');
      if(tot) tot.value = String(p.due || 0);
      const method = document.getElementById('lease-pay-method');
      if(method && p.type) method.value = p.type;
    }catch(e){}
    // Auto-distribute as a starting point
    try{ autoDistributeLeasePayment(); }catch(e){}
    try{ updateLeasePaySum(); }catch(e){}
  }

  function autoDistributeLeasePayment(){
    const m = document.getElementById('lease-payment-modal');
    const groupKey = m?.dataset?.groupKey || '';
    const contractNo = m?.dataset?.contractNo || '';
    const cache = window.__leaseGroupsCache || {};
    const g = cache[groupKey];
    if(!g){ uiToast('error', 'تعذر العثور على بيانات العقد.'); return; }

    const totEl = document.getElementById('lease-pay-total');
    const total = _toIntAED(parseAED(totEl?.value));
    if(total <= 0){ uiToast('info', 'أدخل مبلغ الدفعة أولاً.'); return; }

    const units = (g.units || []);
    if(!units.length){ uiToast('info','لا توجد وحدات للتوزيع.'); return; }

    // Build remaining weights
    const rows = units.map(u=>{
      const paid = sumLeasePaidForUnit(contractNo, u.propId, u.id, groupKey);
      const rent = Number(u.rent)||0;
      return { u, remain: Math.max(0, rent - paid) };
    });

    let sumRemain = rows.reduce((s,r)=> s + (Number(r.remain)||0), 0);
    if(!(sumRemain > 0)){
      // fallback to rent weights if everything is fully paid
      rows.forEach(r=> r.remain = Number(r.u.rent)||0);
      sumRemain = rows.reduce((s,r)=> s + (Number(r.remain)||0), 0) || 1;
    }

    const inputs = Array.from(document.querySelectorAll('.lease-alloc-input'));
    if(!inputs.length) return;

    // Proportional distribution with integer AED (no decimals)
    const raw = rows.map(r=> total * (r.remain / sumRemain));
    const ints = raw.map(x=> Math.floor(x));
    let rem = total - ints.reduce((a,b)=>a+b,0);

    const order = raw.map((x,i)=>({ i, frac: x - Math.floor(x) }))
                     .sort((a,b)=> b.frac - a.frac);

    for(let k=0; k<rem; k++){
      const ii = (order[k % order.length]?.i ?? (k % ints.length));
      ints[ii] += 1;
    }

    inputs.forEach((inp, i)=>{
      const v = ints[i] ?? 0;
      inp.value = v ? String(v) : '';
    });

    if(m) m.dataset.distTouched = '0';
    updateLeasePaySum();
  }

  
  function syncLeasePaymentsIntoPayments(){
    try{
      const existing = new Set((payments||[]).filter(p=>p && p.source==='lease' && p.leasePayId).map(p=>String(p.leasePayId)));
      (leasePayments||[]).forEach(lp=>{
        if(!lp || !lp.id) return;
        const lpId = String(lp.id);
        if(existing.has(lpId)) return;

        const contractNo = lp.contractNo || '';
        // Derive unit names from allocations (preferred)
        const allocUnits = (leaseAllocations||[]).filter(a=>String(a.paymentId||'')===lpId).map(a=>a.unitName||'').filter(Boolean);
        const unitNames = allocUnits.length ? Array.from(new Set(allocUnits)).join(', ') : '';

        // Derive total rent from current contract units (fallback)
        let totalRent = 0;
        try{
          properties.forEach(p=>p.units.forEach(u=>{
            if(String(u.contractNo||'')===String(contractNo) && u.status!=='شاغرة'){
              totalRent += (Number(u.rent)||0);
            }
          }));
        }catch(e){}

        const vno = lp.voucherNo || ''; // don't auto-consume numbers for old data unless already present
        payments.push({
          id: 'PAYL-'+lpId,
          date: lp.date || '',
          tenant: lp.tenant || '',
          unit: unitNames ? `متعدد: ${unitNames}` : 'متعدد الوحدات',
          contract: contractNo,
          due: totalRent || Number(lp.total||0) || 0,
          type: lp.method || 'تحويل',
          amount: Number(lp.total||0) || 0,
          desc: `دفعة عقد متعدد الوحدات (${contractNo})` + (unitNames ? ` — ${unitNames}` : '') + (lp.ref ? ` — ${lp.ref}` : ''),
          voucherNo: vno,
          source: 'lease',
          leasePayId: lpId,
          groupKey: lp.groupKey || ''
        });
      });
    }catch(e){}
  }

function saveLeasePayment(){
    const m = document.getElementById('lease-payment-modal');
    const groupKey = m?.dataset?.groupKey || '';
    const contractNo = m?.dataset?.contractNo || '';
    const cache = window.__leaseGroupsCache || {};
    const g = cache[groupKey];
    if(!g){ uiToast('error', 'تعذر العثور على بيانات العقد.'); return; }

    const date = document.getElementById('lease-pay-date')?.value || '';
    const total = _toIntAED(parseAED(document.getElementById('lease-pay-total')?.value));
    const method = document.getElementById('lease-pay-method')?.value || '';
    const ref = document.getElementById('lease-pay-ref')?.value || '';

    if(!date){ uiToast('info', 'حدد تاريخ الدفعة.'); return; }
    if(total <= 0){ uiToast('info', 'أدخل مبلغ الدفعة.'); return; }

    const allocInputs = Array.from(document.querySelectorAll('.lease-alloc-input'));
    const allocs = [];
    let sum = 0;
    allocInputs.forEach(inp=>{
      const amt = _toIntAED(parseAED(inp.value));
      if(amt > 0){
        allocs.push({
          propId: inp.dataset.prop,
          unitId: inp.dataset.unit,
          unitName: inp.dataset.unitname || '',
          amount: amt
        });
        sum += amt;
      }
    });

    if(allocs.length === 0){
      uiToast('info', 'أدخل مبلغًا مخصصًا لوحدة واحدة على الأقل.');
      return;
    }

    const diff = total - sum;
    if(Math.abs(diff) > 0.001){
      uiToast('error', 'مجموع التوزيع يجب أن يساوي مبلغ الدفعة. استخدم "توزيع تلقائي" أو عدّل المبالغ.');
      return;
    }

    const payId = 'LPAY-' + Date.now();
    leasePayments.push({
      id: payId,
      groupKey,
      contractNo,
      tenant: g.tenant || '',
      date,
      total,
      method,
      ref
    });

    allocs.forEach(a=>{
      leaseAllocations.push({
        id: 'LPA-' + Date.now() + '-' + Math.floor(Math.random()*1000),
        paymentId: payId,
        contractNo,
        groupKey,
        tenant: g.tenant || '',
        date,
        propId: a.propId,
        unitId: a.unitId,
        unitName: a.unitName,
        amount: a.amount
      });
    });

    
    // Mirror this lease payment into the main Payments log (for Payments/Reports/Tenants)
    try{
      const unitNames = (g.units||[]).map(x=>x.name).filter(Boolean).join(', ');
      const totalRent = (g.units||[]).reduce((s,x)=>s + (Number(x.rent)||0), 0);
      const vno = nextVoucherNumber('receipt');
      const scheduledId = (m?.dataset?.scheduledPayId || '').trim();

      // attach voucherNo to leasePayments record for future reference
      try{
        const last = leasePayments[leasePayments.length-1];
        if(last && last.id===payId) last.voucherNo = vno;
      }catch(e){}

      const payPayload = {
        date,
        tenant: g.tenant || '',
        unit: unitNames ? `متعدد: ${unitNames}` : 'متعدد الوحدات',
        contract: contractNo,
        due: totalRent || total,
        type: method || 'تحويل',
        amount: total,
        desc: `دفعة عقد متعدد الوحدات (${contractNo})` + (unitNames ? ` — ${unitNames}` : '') + (ref ? ` — ${ref}` : ''),
        voucherNo: vno,
        source: 'lease',
        leasePayId: payId,
        groupKey,
        isPlanned: false,
        status: ''
      };

      if(scheduledId){
        const idx = (payments||[]).findIndex(p=>String(p.id)===(String(scheduledId)));
        if(idx >= 0){
          payments[idx] = Object.assign({}, payments[idx], payPayload);
        } else {
          payments.push(Object.assign({ id: 'PAYL-'+payId }, payPayload));
        }
        try{ delete m.dataset.scheduledPayId; }catch(e){}
      } else {
        payments.push(Object.assign({ id: 'PAYL-'+payId }, payPayload));
      }
    }catch(e){}

    saveToLocal();
    renderLeases();
    // Open details row for this group after saving
    try {
      const safe = leaseSafeKey(groupKey);
      const row = document.getElementById(`lease-group-${safe}`);
      if(row) row.classList.remove('hidden');
    } catch(e){}

    m.classList.add('hidden');
    uiToast('success', 'تم حفظ الدفعة وتوزيعها على وحدات العقد.');
  }

function openLeaseModal(pid, uid){
    const m = document.getElementById('lease-modal');
    m.classList.remove('hidden');
    const u = properties.find(x=>x.id===pid).units.find(x=>x.id===uid);
    document.getElementById('lease-prop-id').value=pid;
    document.getElementById('lease-unit-id').value=uid;
    document.getElementById('lease-tenant').value=u.tenant||'';
    document.getElementById('lease-rent').value=u.rent||'';
    document.getElementById('lease-contractNo').value=u.contractNo||'';
    document.getElementById('lease-start').value=u.start||'';
    document.getElementById('lease-end').value=u.end||'';
    const tk = tenantKey(u.tenant||'');
    const c = tenantsContacts[tk] || {};
    const ex = u.leaseExtra || {};
    if(document.getElementById('lease-phone')) document.getElementById('lease-phone').value = ex.phone || c.phone || '';
    if(document.getElementById('lease-email')) document.getElementById('lease-email').value = ex.email || c.email || '';
    if(document.getElementById('lease-paymentsCount')) document.getElementById('lease-paymentsCount').value = (ex.paymentsCount ?? '');
    if(document.getElementById('lease-chequesCount')) document.getElementById('lease-chequesCount').value = (ex.chequesCount ?? '');
    if(document.getElementById('lease-bankGuarantee')) document.getElementById('lease-bankGuarantee').value = (ex.bankGuarantee ?? '');
    if(document.getElementById('lease-tenantType')) document.getElementById('lease-tenantType').value = ex.tenantType || c.tenantType || '';
    if(document.getElementById('lease-tradeLicense')) document.getElementById('lease-tradeLicense').value = ex.tradeLicenseNo || c.tradeLicenseNo || '';
    if(document.getElementById('lease-idNumber')) document.getElementById('lease-idNumber').value = ex.idNumber || c.idNumber || '';
    applyTenantTypeUI('lease');
    if(document.getElementById('lease-tenantType')) document.getElementById('lease-tenantType').addEventListener('change', ()=>applyTenantTypeUI('lease'));

    document.getElementById('lease-status').value=u.status;
  }

  function closeLeaseModal(){
    document.getElementById('lease-modal').classList.add('hidden');
  }

  document.getElementById('lease-form').addEventListener('submit', e=>{
    e.preventDefault();
    const pid = document.getElementById('lease-prop-id').value;
    const uid = document.getElementById('lease-unit-id').value;
    const p = properties.find(x=>x.id===pid);
    const u = p.units.find(x=>x.id===uid);

    // Collect + validate (was causing ReferenceError when values were out of scope)
    const _leaseTenant = normalizeText(normalizeDigits(document.getElementById('lease-tenant')?.value || ''));
    const _leaseContractNo = normalizeText(normalizeDigits(document.getElementById('lease-contractNo')?.value || ''), {collapseSpaces:false});
    const _leaseStart = (document.getElementById('lease-start')?.value || '').trim();
    const _leaseEnd = (document.getElementById('lease-end')?.value || '').trim();
    const _leaseStatus = (document.getElementById('lease-status')?.value || '').trim();
    const _leaseRent = parseMoney(document.getElementById('lease-rent')?.value || 0);

    if(_leaseStatus === 'مؤجرة'){
      if(!_leaseTenant){ uiToast('error','الرجاء إدخال اسم المستأجر.'); return; }
      if(_leaseRent <= 0){ uiToast('error','الرجاء إدخال قيمة إيجار صحيحة.'); return; }
    }
    if(!isDateOrderOk(_leaseStart, _leaseEnd)){
      uiToast('error','تاريخ بداية العقد يجب أن يكون قبل/يساوي تاريخ النهاية.');
      return;
    }
    if(_leaseContractNo){
      const hits = findUnitsByContractNo(_leaseContractNo)
        .filter(h => !(String(h.propId)===String(pid) && String(h.unitId)===String(uid)));
      if(hits.length){
        const sameTenant = hits.every(h => normalizeText(h.tenant||'') === _leaseTenant);
        const msg = sameTenant
          ? 'رقم العقد مستخدم في وحدات أخرى لنفس المستأجر. إذا كان عقدًا متعدد الوحدات يفضل إنشاؤه من (إضافة عقد). هل تريد المتابعة؟'
          : 'رقم العقد مستخدم في وحدات أخرى. هل تريد المتابعة رغم ذلك؟';
        if(!confirm(msg)) return;
      }
    }

    ensureLeaseHistory(u);
    u.tenant = _leaseTenant;
    u.rent = _leaseRent;
    u.contractNo = _leaseContractNo;
    u.start = _leaseStart;
    u.end = _leaseEnd;
    u.status = _leaseStatus;
    const extra = {
      phone: (document.getElementById('lease-phone')?.value || '').trim(),
      email: (document.getElementById('lease-email')?.value || '').trim(),
      paymentsCount: parseInt(document.getElementById('lease-paymentsCount')?.value || '0', 10) || 0,
      chequesCount: parseInt(document.getElementById('lease-chequesCount')?.value || '0', 10) || 0,
      bankGuarantee: parseFloat(document.getElementById('lease-bankGuarantee')?.value || '0') || 0,
      tenantType: (document.getElementById('lease-tenantType')?.value || '').trim(),
      tradeLicenseNo: (document.getElementById('lease-tradeLicense')?.value || '').trim(),
      idNumber: (document.getElementById('lease-idNumber')?.value || '').trim(),
    };
    u.leaseExtra = Object.assign({}, u.leaseExtra || {}, extra);

    const tk = tenantKey(u.tenant);
    const prev = tenantsContacts[tk] || { name: u.tenant, phone:'', email:'' };
    tenantsContacts[tk] = {
      name: u.tenant,
      phone: extra.phone || prev.phone || '',
      email: extra.email || prev.email || '',
      tenantType: extra.tenantType || prev.tenantType || '',
      tradeLicenseNo: extra.tradeLicenseNo || prev.tradeLicenseNo || '',
      idNumber: extra.idNumber || prev.idNumber || ''
    };


    saveToLocal();
    closeLeaseModal();
    renderLeases();
    renderProperties();
    updateDashboard();
    logAction(`تم تعديل بيانات عقد الوحدة ${escHtml(u.name)}`);
  });

  function cancelLease(){
    if(!confirm('هل أنت متأكد من إلغاء العقد؟ سيتم تحويل الوحدة لشاغرة.')) return;
    const pid = document.getElementById('lease-prop-id').value;
    const uid = document.getElementById('lease-unit-id').value;
    const u = properties.find(x=>x.id===pid).units.find(x=>x.id===uid);
    // حفظ العقد الحالي ضمن سجل العقود قبل الإخلاء/الإلغاء (لظهوره في التقارير)
    const cs = leaseContractStatusFromDates(u.start, u.end);
    const isEnded = (cs === 'منتهي');
    const overrideStatus = isEnded ? 'مخلى' : 'ملغاة';
    const actionKey = isEnded ? 'vacate' : 'cancel';
    const actionLabel = isEnded ? 'إخلاء' : 'إلغاء';
    const reason = isEnded ? 'إخلاء الوحدة بعد انتهاء العقد' : 'إلغاء العقد وإخلاء الوحدة';
    archiveUnitLease(u, actionLabel, overrideStatus, reason, actionKey);
    u.status='شاغرة';
    u.tenant='';
    u.rent=0;
    u.contractNo='';
    u.start='';
    u.end='';
    u.contractGroupId='';
    if(u.leaseExtra) delete u.leaseExtra.contractGroupId;
    saveToLocal();
    closeLeaseModal();
    showView('leases');
    updateDashboard();
    logAction(`تم إلغاء عقد ${escHtml(u.name)}`);
  }



  // ===== Manual Lease Archiving (from Leases page) =====
  function openLeaseArchiveModal(groupKey){
    const modal = document.getElementById('lease-archive-modal');
    const keyInput = document.getElementById('lease-archive-groupkey');
    const actionSel = document.getElementById('lease-archive-action');
    const note = document.getElementById('lease-archive-note');
    if(keyInput) keyInput.value = groupKey || '';
    if(actionSel) actionSel.value = '';
    if(note) note.value = '';
    if(modal) modal.classList.remove('hidden');
  }

  function closeLeaseArchiveModal(){
    const modal = document.getElementById('lease-archive-modal');
    if(modal) modal.classList.add('hidden');
  }

  function _archiveGroupByKey(groupKey, {actionKey, noteText} = {}){
    const g = getLeaseGroupByKey(groupKey);
    if(!g) return { ok:false, msg:'تعذر العثور على العقد.' };

    const statusOverride = (actionKey === 'vacate') ? 'مخلى' : 'ملغاة';
    const actionLabel = (actionKey === 'vacate') ? 'إخلاء' : 'إلغاء';

    const units = Array.isArray(g.units) && g.units.length ? g.units : [{propId: g.propId, id: g.id, name: g.name}];
    let changed = 0;

    for(const ref of units){
      const prop = (properties || []).find(p => String(p.id) === String(ref.propId));
      if(!prop) continue;
      const u = (prop.units || []).find(x => String(x.id) === String(ref.id));
      if(!u) continue;

      if(unitHasLeaseData(u)){
        const noteFull = (noteText || '').trim();
        archiveUnitLease(u, actionLabel, statusOverride, noteFull, actionKey);
      }

      // Clear lease fields => unit becomes vacant
      u.tenant = '';
      u.rent = 0;
      u.contractNo = '';
      u.start = '';
      u.end = '';
      u.status = 'شاغرة';
      u.contractGroupId = '';
      if(u.leaseExtra && typeof u.leaseExtra === 'object'){
        delete u.leaseExtra.contractGroupId;
      }
      changed++;
    }

    return { ok:true, changed };
  }

  // Bind form once
  document.addEventListener('ui:components-loaded', () => {
    const form = document.getElementById('lease-archive-form');
    if(!form || form.dataset.bound) return;
    form.dataset.bound = '1';

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const groupKey = document.getElementById('lease-archive-groupkey')?.value || '';
      const actionKey = document.getElementById('lease-archive-action')?.value || '';
      const noteText = document.getElementById('lease-archive-note')?.value || '';
      if(!actionKey){
        if(uiToast) uiToast('warn','اختر سبب الأرشفة أولاً.');
        return;
      }
      const ok = confirm('تأكيد: سيتم أرشفة العقد وتحويل الوحدة/الوحدات إلى شاغرة. هل تريد المتابعة؟');
      if(!ok) return;

      const res = _archiveGroupByKey(groupKey, { actionKey, noteText });
      if(!res.ok){
        if(uiToast) uiToast('danger', res.msg || 'فشل الأرشفة.');
        else alert(res.msg || 'فشل الأرشفة.');
        return;
      }

      saveToLocal();
      renderLeases();
      try{ updateDashboard(); }catch(e){}
      try{ renderReports(); }catch(e){}
      closeLeaseArchiveModal();
      if(uiToast) uiToast('success', `تمت أرشفة العقد (${res.changed} وحدة).`);
    });
  });
