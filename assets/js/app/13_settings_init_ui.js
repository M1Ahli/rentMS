// ================================================
// 13_settings_init_ui.js - Settings + Theme + Init + UI enhancers + Modal UX
// Auto-split from legacy app.js for maintainability.
// DO NOT edit the legacy file directly; edit split modules.
// ================================================

  // ================= SETTINGS & BACKUP =================
  function exportBackupJSON(){
    try{
      const data = buildStoragePayload ? buildStoragePayload() : { properties, cheques, expenses, payments, tenantsContacts, salaries };
      const blob = new Blob([JSON.stringify(data)], {type:'application/json;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0,10);
      a.download = safeFilename(`realestate_backup_${stamp}.json`);
      a.click();
      setTimeout(()=>{ try{ URL.revokeObjectURL(url); }catch(_){ } }, 500);
      uiToast('success', 'تم تصدير نسخة JSON ✅');
    }catch(e){
      console.error(e);
      uiToast('error', 'تعذر تصدير نسخة JSON.');
    }
  }

  async function exportBackupExcel(){
      return withBusy('جارٍ تجهيز ملف Excel...', async ()=>{
        const wasLoaded = !!window.XLSX;
        if(!wasLoaded){
          uiToast('info', 'جارٍ تحميل مكتبة Excel...', {title:'⏳ تحميل', duration: 2200});
        }
        await ensureXLSX();
        if(!window.XLSX) throw new Error('XLSX not available');

        const wb = XLSX.utils.book_new();

        const unitsData = [];
        (properties||[]).forEach(p=>{
          (p.units||[]).forEach(u=> unitsData.push({ ...u, Property: p.name }));
        });

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unitsData), 'Units');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payments||[]), 'Payments');
        if((salaries||[]).length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salaries), 'Salaries');
        if((expenses||[]).length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenses), 'Expenses');
        if((cheques||[]).length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cheques), 'Cheques');

        const stamp = new Date().toISOString().slice(0,10);
        XLSX.writeFile(wb, safeFilename(`RealEstate_Data_${stamp}.xlsx`));
      }, { success: 'تم تصدير Excel ✅', error: 'تعذر تصدير Excel. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.' });
    }

  function importBackup(e){
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(evt){
      try{
        const data = JSON.parse(evt.target.result);
        if(data.properties) properties = data.properties;
        if(data.payments) payments = data.payments;
        if(data.cheques) cheques = data.cheques;
        if(data.salaries) salaries = data.salaries;
        if(data.expenses) expenses = data.expenses;
        if(data.tenantsContacts) tenantsContacts = data.tenantsContacts;
        if(data.cases) cases = Array.isArray(data.cases) ? data.cases : [];
        if(data.caseUpdates) caseUpdates = Array.isArray(data.caseUpdates) ? data.caseUpdates : [];
        if(data.caseEvents) caseEvents = Array.isArray(data.caseEvents) ? data.caseEvents : [];

        expenses = expenses.map(e => ({
          id: e.id || 'EXP-' + Date.now() + Math.floor(Math.random()*1000),
          date: e.date,
          type: e.type || 'أخرى',
          amount: e.amount,
          details: e.details,
          voucherNo: e.voucherNo || null
        }));
        cheques = (cheques||[]).map(normalizeChequeRecord);
        cheques = cheques.map(c=>{
          const nc = normalizeChequeRecord(c);
          if(!nc.unitId){
            const inferred = inferSingleLeasedUnitIdForTenant(nc.tenant);
            if(inferred) nc.unitId = inferred;
          }
          if(nc.unitId && !nc.unitLabel){
            nc.unitLabel = getUnitDisplayById(nc.unitId);
          }
          return nc;
        });
        (payments||[]).forEach(p=>{ if(p && p.chequeId){ migrateChequePaymentsToUnit(p.chequeId); } });
        saveToLocal();
        ensureVoucherNumbers();
        document.getElementById('backup-msg').textContent = "✅ تم استعادة البيانات بنجاح!";
        setTimeout(()=>location.reload(), 1500);
      } catch(err){
        console.error(err);
        document.getElementById('backup-msg').textContent = "❌ ملف غير صالح";
      }
    };
    reader.readAsText(file);
  }

  function clearAllData(){
    properties = [];
    cheques = [];
    expenses = [];
    payments = [];
    tenantsContacts = {};
    salaries = [];
    saveToLocal();
    location.reload();
  }

  // ================= THEME =================
  function toggleDarkMode(){
    const willBeDark = !document.body.classList.contains('dark-mode');

    if (willBeDark) {
      document.body.classList.add('dark-mode');
      document.documentElement.classList.add('dark');
      localStorage.setItem('re_dark_mode', '1');
    } else {
      document.body.classList.remove('dark-mode');
      document.documentElement.classList.remove('dark');
      localStorage.setItem('re_dark_mode', '0');
    }
    updateDashboard();
  }

  function initTheme(){
    const saved = localStorage.getItem('re_dark_mode');
    if (saved === '1') {
      document.body.classList.add('dark-mode');
      document.documentElement.classList.add('dark');
    } else {
      document.body.classList.remove('dark-mode');
      document.documentElement.classList.remove('dark');
    }
  }

  
  // Bind once: mark arrears details as "user edited" so auto-fill won't overwrite unless forced
  function initNoticeArrearsAutogenTracking(){
    const details = document.getElementById('notice-arrears-details');
    if(details && details.dataset.bound !== '1'){
      details.dataset.bound = '1';
      details.addEventListener('input', ()=>{ details.dataset.autogen = '0'; });
    }
  }

// ================= INIT =================
  // NOTE: In the restructured build, app.js is injected dynamically from bootstrap.js.
  // That means window.onload may have ALREADY fired before this script is evaluated.
  // So we must init safely in both cases.
  function bootApp(){
    try{
      initTheme();
      loadRentBasisSetting();
      loadFromLocal();
      initSortingPrefs();
      initPropertiesUnitFilters();
      initNoticeArrearsAutogenTracking();
      showView('dashboard');
    }catch(e){
      console.error('bootApp failed:', e);
    }
  }

  if(document.readyState === 'complete'){
    // load event already fired
    bootApp();
  }else{
    window.addEventListener('load', bootApp, { once:true });
  }

  // Expose key actions for inline onclick/onchange handlers (safety for future refactors)
  try{
    window.exportBackupJSON = exportBackupJSON;
    window.exportBackupExcel = exportBackupExcel;
    window.importBackup = importBackup;
    window.clearAllData = clearAllData;
    window.toggleDarkMode = toggleDarkMode;
  }catch(_){ }

  // =========================================================
  // Modal drag support (drag by header) + safe reset on open
  // =========================================================
  (function(){
    const state = { active:false, el:null, startX:0, startY:0, baseX:0, baseY:0 };

    function getXY(el){
      const x = parseFloat(el.dataset.dx || '0') || 0;
      const y = parseFloat(el.dataset.dy || '0') || 0;
      return {x,y};
    }
    function setXY(el, x, y){
      el.dataset.dx = String(x);
      el.dataset.dy = String(y);
      el.style.transform = `translate(${x}px, ${y}px)`;
    }
    function clamp(el, x, y){
      // Clamp within viewport with a small margin
      const margin = 8;
      // Temporarily apply to measure
      const prev = el.style.transform;
      el.style.transform = `translate(${x}px, ${y}px)`;
      const r = el.getBoundingClientRect();
      el.style.transform = prev;

      let nx = x, ny = y;
      if(r.left < margin) nx += (margin - r.left);
      if(r.right > window.innerWidth - margin) nx -= (r.right - (window.innerWidth - margin));
      if(r.top < margin) ny += (margin - r.top);
      if(r.bottom > window.innerHeight - margin) ny -= (r.bottom - (window.innerHeight - margin));
      return {x:nx,y:ny};
    }

    function onDown(e, content){
      if(e.button !== undefined && e.button !== 0) return;
      state.active = true;
      state.el = content;
      state.startX = (e.touches ? e.touches[0].clientX : e.clientX);
      state.startY = (e.touches ? e.touches[0].clientY : e.clientY);
      const {x,y} = getXY(content);
      state.baseX = x; state.baseY = y;
      document.body.classList.add('select-none');
      e.preventDefault();
    }
    function onMove(e){
      if(!state.active || !state.el) return;
      const cx = (e.touches ? e.touches[0].clientX : e.clientX);
      const cy = (e.touches ? e.touches[0].clientY : e.clientY);
      let x = state.baseX + (cx - state.startX);
      let y = state.baseY + (cy - state.startY);
      const c = clamp(state.el, x, y);
      setXY(state.el, c.x, c.y);
      e.preventDefault();
    }
    function onUp(){
      state.active = false;
      state.el = null;
      document.body.classList.remove('select-none');
    }

    function resetModalPosition(modal){
      const content = modal?.querySelector('.modal-content');
      if(!content) return;
      content.dataset.dx = '0';
      content.dataset.dy = '0';
      content.style.transform = '';
    }

    function wire(modal){
      const content = modal.querySelector('.modal-content');
      if(!content) return;
      const header = content.querySelector(':scope > div:first-child');
      if(!header) return;

      header.style.cursor = 'move';
      header.addEventListener('mousedown', (e)=>onDown(e, content));
      header.addEventListener('touchstart', (e)=>onDown(e, content), {passive:false});

      // Reset position whenever modal opens
      const obs = new MutationObserver(()=>{
        if(!modal.classList.contains('hidden')){
          resetModalPosition(modal);
        }
      });
      obs.observe(modal, { attributes:true, attributeFilter:['class'] });
    }

    window.addEventListener('mousemove', onMove, {passive:false});
    window.addEventListener('touchmove', onMove, {passive:false});
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);

    function initModalDragWiring(){
      try{ document.querySelectorAll('div[id$="-modal"]').forEach(wire); }catch(e){}
    }
    if(document.readyState === 'loading'){
      window.addEventListener('DOMContentLoaded', initModalDragWiring, { once:true });
    }else{
      initModalDragWiring();
    }
  })();


// ===== Print Helpers (Reports) =====


function printCurrentReport(){
  const rv = document.getElementById('reports-view');
  const wasHidden = rv ? rv.classList.contains('hidden') : false;

  if(rv) rv.classList.remove('hidden');

  // Always print only the half-year owners payout report
  try{ renderReports(); }catch(e){}
  try{ renderHalfYearOwnersReport(); }catch(e){}

  const monthly = document.getElementById('monthly-report-section');
  const hy = document.getElementById('hy-report-section');

  // Temporarily hide monthly report content for print consistency
  const monthlyWasHidden = monthly ? monthly.classList.contains('hidden') : false;
  if(monthly) monthly.classList.add('hidden');

  // Ensure half-year section is visible
  const hyWasHidden = hy ? hy.classList.contains('hidden') : false;
  if(hy) hy.classList.remove('hidden');

  // Print header meta
  const dEl = document.getElementById('print-header-date');
  if(dEl) dEl.textContent = new Date().toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' });

  const hyLbl = document.getElementById('hy-period-label')?.textContent?.trim();
  const pEl = document.getElementById('print-header-period');
  if(pEl) pEl.textContent = `تقرير نصف سنوي لصرف الملاك (${hyLbl || '—'})`;

  setPrintContext('report');
  setTimeout(()=>{
    window.print();
    setTimeout(()=>{
      // restore views
      if(monthly && !monthlyWasHidden) monthly.classList.remove('hidden');
      if(hy && hyWasHidden) hy.classList.add('hidden');
      if(rv && wasHidden) rv.classList.add('hidden');
      clearPrintContext();
    }, 400);
  }, 80);
}


// ===== /Print Helpers =====




  
  // ===== Export lease payment functions to window (for inline handlers) =====
  try{ window.openLeasePaymentModal = openLeasePaymentModal; }catch(e){}
  try{ window.updateLeasePaySum = updateLeasePaySum; }catch(e){}
  try{ window.autoDistributeLeasePayment = autoDistributeLeasePayment; }catch(e){}
  try{ window.saveLeasePayment = saveLeasePayment; }catch(e){}
  try{ window.toggleLeaseGroupRow = toggleLeaseGroupRow; }catch(e){}

// ===== Lease Table Action Delegation (robust even if inline onclick fails) =====
  function _wireLeaseRowActions(){
    if(window.__leaseRowActionsWired) return;
    window.__leaseRowActionsWired = true;
    document.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-lease-action]');
      if(!btn) return;
      const action = btn.dataset.leaseAction;
      const key = btn.dataset.groupkey || btn.getAttribute('data-groupkey') || '';
      if(action === 'toggle'){
        if(typeof toggleLeaseGroupRow === 'function') toggleLeaseGroupRow(key);
      } else if(action === 'pay'){
        if(typeof window.openLeasePaymentModal === 'function') window.openLeasePaymentModal(key);
        else if(typeof openLeasePaymentModal === 'function') openLeasePaymentModal(key);
      }
    }, true);
  }
  // Ensure wired after initial render
  try { _wireLeaseRowActions(); } catch(e){}



  // ===== Unified Inputs Auto-Apply =====
  function applyUnifiedInputs(root=document){
    const els = root.querySelectorAll('input, select, textarea');
    els.forEach(el=>{
      if(!el || el.dataset.uiUnified === '1') return;

      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();

      // Skip checkboxes/radios/files/range/color/hidden/button/submit
      const skipTypes = ['checkbox','radio','file','range','color','hidden','button','submit','reset','image'];
      if(tag === 'input' && skipTypes.includes(type)) return;

      // Explicit opt-out
      if(el.classList.contains('no-ui-input')) return;

      if(tag === 'textarea') el.classList.add('ui-textarea');
      else if(tag === 'select') el.classList.add('ui-select');
      else el.classList.add('ui-input');

      el.dataset.uiUnified = '1';
    });
  }

  // Initial apply
  try{ applyUnifiedInputs(document); }catch(e){}

  // Observe dynamic renders (tables/modals)
  try{
    const uiInputsObserver = new MutationObserver((muts)=>{
      for(const m of muts){
        if(m.addedNodes && m.addedNodes.length){
          m.addedNodes.forEach(node=>{
            if(node && node.querySelectorAll){
              applyUnifiedInputs(node);
            }
          });
        }
      }
    });
    uiInputsObserver.observe(document.body, { childList:true, subtree:true });
  }catch(e){}



  // ===== Unified Tables Auto-Apply =====
  function applyUnifiedTables(root=document){
    const tables = root.querySelectorAll('table');
    tables.forEach(tbl=>{
      if(!tbl || tbl.dataset.uiTableUnified === '1') return;
      if(tbl.classList.contains('no-ui-table')) return;

      // Skip print areas
      if(tbl.closest('#printable-area') || tbl.closest('#printable-receipt')) return;

      tbl.classList.add('ui-table');
      tbl.dataset.uiTableUnified = '1';

      // Ensure a clipped wrapper exists for rounded corners (if not already)
      const parent = tbl.parentElement;
      if(parent && !parent.classList.contains('ui-table-wrap')){
        // If already in an overflow container, reuse it; otherwise wrap.
        const canReuse = parent.classList.contains('overflow-x-auto') || parent.classList.contains('overflow-auto');
        if(canReuse){
          parent.classList.add('ui-table-wrap');
        }else{
          const wrap = document.createElement('div');
          wrap.className = 'ui-table-wrap overflow-x-auto';
          parent.insertBefore(wrap, tbl);
          wrap.appendChild(tbl);
        }
      }
    });
  }

  try{ applyUnifiedTables(document); }catch(e){}

  try{
    const uiTablesObserver = new MutationObserver((muts)=>{
      for(const m of muts){
        if(m.addedNodes && m.addedNodes.length){
          m.addedNodes.forEach(node=>{
            if(node && node.querySelectorAll){
              applyUnifiedTables(node);
            }
          });
        }
      }
    });
    uiTablesObserver.observe(document.body, { childList:true, subtree:true });
  }catch(e){}



  // Ensure any glass-card that contains a table does NOT use hover-lift
  function markTableCardsNoHover(root=document){
    try{
      root.querySelectorAll('.glass-card').forEach(card=>{
        if(card.querySelector('table')) card.classList.add('no-card-hover');
      });
    }catch(e){}
  }
  try{ markTableCardsNoHover(document); }catch(e){}



  // ===== Unified Section / Page Headers Auto-Apply =====
  function applyUnifiedViewHeaders(root=document){
    const views = root.querySelectorAll('.view[id$="-view"]');
    views.forEach(view=>{
      if(!view || view.dataset.uiHeaderUnified === '1') return;

      // Find the top header block (usually first direct child div)
      const first = view.querySelector(':scope > div');
      if(!first) { view.dataset.uiHeaderUnified='1'; return; }

      // Must contain a heading near the top
      const heading = first.querySelector('h1, h2, h3');
      if(!heading) { view.dataset.uiHeaderUnified='1'; return; }

      // Heuristic: header blocks are flex/justify-between OR contain action buttons/links
      const cls = (first.className || '');
      const hasActions = !!first.querySelector('button, a');
      if(!(cls.includes('justify-between') || cls.includes('items-center') || hasActions)) {
        view.dataset.uiHeaderUnified='1';
        return;
      }

      first.classList.add('ui-view-header');

      // Identify left/right containers if exist
      const children = Array.from(first.children || []);
      let left = null;
      let right = null;

      // left: child that contains heading (prefer)
      for(const ch of children){
        try{
          if(ch.querySelector && ch.querySelector('h1, h2, h3')) { left = ch; break; }
        }catch(e){}
      }
      // right: child that contains buttons/links and is not left
      for(const ch of children){
        if(ch === left) continue;
        try{
          if(ch.querySelector && ch.querySelector('button, a')) { right = ch; break; }
        }catch(e){}
      }

      // If heading is direct child and no left container, use heading parent within first
      if(!left) left = heading.parentElement === first ? first : heading.parentElement;

      // Apply classes
      try{ heading.classList.add('ui-view-title'); }catch(e){}
      try{ if(left && left !== first) left.classList.add('ui-view-left'); }catch(e){}

      // If there's an existing description element, mark it
      try{
        const desc = (left && left !== first) ? left.querySelector('p, .text-sm, .text-xs') : first.querySelector(':scope > p, :scope > .text-sm, :scope > .text-xs');
        if(desc && desc !== heading) desc.classList.add('ui-view-desc');
      }catch(e){}

      // If action container exists, class it; otherwise, if buttons are direct children, wrap virtually by adding class on first
      try{
        if(right) right.classList.add('ui-view-actions');
        else{
          // If there are direct buttons/links, add actions class to header and rely on CSS for direct children
          const directActs = Array.from(first.children).filter(el=>el && (el.tagName==='BUTTON' || el.tagName==='A'));
          if(directActs.length){
            // create a wrapper to keep layout consistent without altering semantics too much
            const wrap = document.createElement('div');
            wrap.className = 'ui-view-actions';
            directActs.forEach(el=>wrap.appendChild(el));
            first.appendChild(wrap);
          }
        }
      }catch(e){}

      view.dataset.uiHeaderUnified = '1';
    });
  }

  try{ applyUnifiedViewHeaders(document); }catch(e){}

  try{
    const uiHeaderObserver = new MutationObserver((muts)=>{
      for(const m of muts){
        if(m.addedNodes && m.addedNodes.length){
          m.addedNodes.forEach(node=>{
            if(node && node.querySelectorAll){
              applyUnifiedViewHeaders(node);
            }
          });
        }
      }
    });
    uiHeaderObserver.observe(document.body, { childList:true, subtree:true });
  }catch(e){}



  // ===== Nav/Tabs Enhancement (consistency & safety) =====
  (function(){
    try{
      const nav = document.querySelector('body > nav');
      if(!nav) return;
      nav.setAttribute('role','tablist');
      nav.querySelectorAll('button.nav-btn').forEach(b=>{
        if(!b.getAttribute('type')) b.setAttribute('type','button');
        b.setAttribute('role','tab');
        b.setAttribute('aria-selected', b.classList.contains('active') ? 'true' : 'false');
      });

      // Keep aria-selected updated when switching views
      const origShowView = window.showView;
      if(typeof origShowView === 'function' && !window.__showViewAriaWrapped){
        window.showView = function(view){
          origShowView(view);
          try{
            nav.querySelectorAll('button.nav-btn').forEach(btn=>{
              btn.setAttribute('aria-selected', btn.classList.contains('active') ? 'true' : 'false');
            });
          }catch(e){}
        }
        window.__showViewAriaWrapped = true;
      }
    }catch(e){}
  })();



  // ===== Unified Search / Sort / Filters Auto-Apply (All Pages) =====
  const __UI_CONTROL_PREFIXES = ['prop','unit','leases','tenants','cheques','expenses','receipts'];

  function __uiInModalOrTable(el){
    if(!el) return true;
    if(el.closest('.modal-content') || el.closest('.modal-glass') || el.closest('[role="dialog"]')) return true;
    if(el.closest('table')) return true;
    if(el.closest('#printable-area') || el.closest('#printable-receipt')) return true;
    return false;
  }

  function __uiFindControlsBarContainer(searchEl, sortByEl, sortDirEl){
    const els = [searchEl, sortByEl, sortDirEl].filter(Boolean);
    if(!els.length) return null;
    // Start from the nearest common ancestor
    let a = els[0].closest('div');
    while(a){
      if(els.every(x => a.contains(x))){
        // avoid wrapping the whole view
        if(a.classList.contains('view') || a.id?.endsWith('-view')) break;
        // avoid containers that contain large blocks like tables
        if(a.querySelector('table')) { a = a.parentElement; continue; }
        return a;
      }
      a = a.parentElement;
    }
    // fallback: closest flex container around sortBy
    return (sortByEl && sortByEl.closest('div')) || (searchEl && searchEl.closest('div')) || null;
  }

  function applyUnifiedSearchSort(){
    try{
      __UI_CONTROL_PREFIXES.forEach(prefix=>{
        const searchEl = document.getElementById(prefix+'-search-input') || (prefix==='prop' ? document.getElementById('prop-search') : null) || (prefix==='tenants' ? document.getElementById('tenants-search') : null) || (prefix==='leases' ? document.getElementById('lease-search-input') : null) || null;
        const sortByEl = document.getElementById(prefix+'-sort-by');
        const sortDirEl = document.getElementById(prefix+'-sort-dir');

        // Apply on elements
        [searchEl, sortByEl, sortDirEl].filter(Boolean).forEach(el=>{
          if(__uiInModalOrTable(el)) return;
          if(el.tagName === 'INPUT') el.classList.add('ui-control','ui-search');
          if(el.tagName === 'SELECT') el.classList.add('ui-control','ui-sort');
          if(el.tagName === 'BUTTON') el.classList.add('ui-control-btn');
        });

        // Search wrapper
        if(searchEl && !__uiInModalOrTable(searchEl)){
          const wrap = searchEl.closest('.relative') || searchEl.parentElement;
          if(wrap && wrap.querySelector){
            wrap.classList.add('ui-control','ui-search-wrap');
            const icon = wrap.querySelector('span');
            if(icon && icon.textContent && icon.textContent.includes('🔍')){
              icon.classList.add('ui-search-icon');
            }
          }
        }

        // Controls bar container
        const bar = __uiFindControlsBarContainer(searchEl, sortByEl, sortDirEl);
        if(bar && !bar.classList.contains('ui-controls-bar')){
          // Only if this bar seems like a controls bar (contains at least 2 controls)
          const count = bar.querySelectorAll('input, select, button').length;
          if(count >= 2 && !bar.closest('.modal-content') && !bar.closest('table')){
            bar.classList.add('ui-controls-bar');
            // Ensure any buttons in bar are unified
            bar.querySelectorAll('button').forEach(b=>{
              if(b.classList.contains('nav-btn')) return;
              if(b.closest('table')) return;
              if(!b.classList.contains('ui-btn')) b.classList.add('ui-btn');
            });
          }
        }

        // Toggle filters row + hint
        const toggle = document.getElementById(prefix+'-toggle-filters') || (prefix==='prop' ? document.getElementById('prop-filters-toggle') : null);
        const hint = document.getElementById(prefix+'-filter-hint') || document.getElementById('leases-filter-hint') || document.getElementById('prop-filters-hint');
        if(toggle && !__uiInModalOrTable(toggle)){
          const row = toggle.closest('div');
          if(row && row.contains(toggle) && row.querySelectorAll('button, a').length>=1){
            row.classList.add('ui-filters-toggle-row');
          }
          toggle.classList.add('ui-btn');
        }
        if(hint && !__uiInModalOrTable(hint)){
          hint.classList.add('ui-filter-hint');
        }

        // Filters panels
        const panel = document.getElementById(prefix+'-filters-panel') || (prefix==='prop' ? document.getElementById('prop-filters-panel') : null);
        if(panel && !panel.classList.contains('ui-filters-panel')){
          panel.classList.add('ui-filters-panel');
        }
      });

      // Reports search/status controls (special ids)
      const repSearch = document.getElementById('report-lease-search');
      const repStatus = document.getElementById('report-lease-status-filter');
      if(repSearch && !__uiInModalOrTable(repSearch)){
        const wrap = repSearch.closest('.relative') || repSearch.parentElement;
        if(wrap) wrap.classList.add('ui-control','ui-search-wrap');
        repSearch.classList.add('ui-control','ui-search');
      }
      if(repStatus && !__uiInModalOrTable(repStatus)){
        repStatus.classList.add('ui-control','ui-small');
      }
      // Try to find a bar container for reports controls
      if(repSearch || repStatus){
        const bar = __uiFindControlsBarContainer(repSearch, repStatus, null);
        if(bar && !bar.classList.contains('ui-controls-bar') && !bar.querySelector('table')){
          bar.classList.add('ui-controls-bar');
        }
      }
    }catch(e){}
  }

  try{ applyUnifiedSearchSort(); }catch(e){}

  // Observe dynamic rendering updates
  try{
    const uiControlsObserver = new MutationObserver((muts)=>{
      for(const m of muts){
        if(m.addedNodes && m.addedNodes.length){
          m.addedNodes.forEach(node=>{
            if(node && node.querySelectorAll){
              applyUnifiedSearchSort();
            }
          });
        }
      }
    });
    uiControlsObserver.observe(document.body, { childList:true, subtree:true });
  }catch(e){}



  // ===== Force consistent layout widths for Search/Sort/Filters in all views =====
  function applyUnifiedControlBars(root=document){
    const views = root.querySelectorAll('.view[id$="-view"]');
    views.forEach(view=>{
      const searches = view.querySelectorAll('input[type="text"], input:not([type])');
      searches.forEach(inp=>{
        if(!inp) return;
        const ph = (inp.getAttribute('placeholder')||'').trim();
        const id = (inp.id||'').toLowerCase();
        const looksSearch = ph.includes('بحث') || ph.toLowerCase().includes('search') || id.includes('search');
        if(!looksSearch) return;

        // Skip modals/tables/print
        if(inp.closest('.modal-content') || inp.closest('table') || inp.closest('#printable-area') || inp.closest('#printable-receipt')) return;

        // Find container bar
        let bar = inp.closest('div');
        const limit = view;
        while(bar && bar !== limit){
          const ctrlCount = bar.querySelectorAll('input, select, button, a').length;
          const hasSelect = !!bar.querySelector('select');
          const hasButtons = !!bar.querySelector('button, a');
          if(ctrlCount >= 2 && (hasSelect || hasButtons)) break;
          bar = bar.parentElement;
        }
        if(!bar || bar === view) return;

        // Do not re-wrap or re-layout our unified toolbars/panels.
        try{
          if(bar.closest && (bar.closest('.ui-toolbar') || bar.closest('.ui-toolbar-panel'))) return;
        }catch(e){}

        if(bar.dataset.uiControlsUnified === '1') return;

        // Visual container (glass + spacing)
        bar.classList.add('ui-controls-bar','glass-card','p-3');

        // Layout wrapper
        let grid = bar.querySelector(':scope > .ui-controls-grid');
        if(!grid){
          const directChildren = Array.from(bar.children||[]);
          const first = directChildren[0];
          const canReuse = first && first.tagName === 'DIV' && (first.className||'').includes('flex');
          if(canReuse){
            grid = first;
            grid.classList.add('ui-controls-grid');
          }else{
            grid = document.createElement('div');
            grid.className = 'ui-controls-grid';
            while(bar.firstChild){
              grid.appendChild(bar.firstChild);
            }
            bar.appendChild(grid);
          }
        }else{
          grid.classList.add('ui-controls-grid');
        }

        // Tag controls for consistent widths
        const ctrls = grid.querySelectorAll('input, select, button, a');
        ctrls.forEach(el=>{
          if(!el || el.dataset.uiCtlTagged === '1') return;

          const tag = el.tagName.toUpperCase();

          if(tag === 'INPUT'){
            const eph = (el.getAttribute('placeholder')||'').trim();
            const eid = (el.id||'').toLowerCase();
            const isSearch = eph.includes('بحث') || eph.toLowerCase().includes('search') || eid.includes('search');
            if(isSearch) el.classList.add('ui-control-search');
            else el.classList.add('ui-control-extra');
          }

          if(tag === 'SELECT'){
            const sid = (el.id||'').toLowerCase();
            const name = (el.getAttribute('name')||'').toLowerCase();
            const txt = (el.textContent||'').toLowerCase();
            const isDir = sid.includes('dir') || name.includes('dir') || txt.includes('asc') || txt.includes('desc') || txt.includes('تصاعد') || txt.includes('تنازل');
            const isSort = sid.includes('sort') || name.includes('sort') || txt.includes('فرز') || txt.includes('sort');

            if(isDir) el.classList.add('ui-control-dir');
            else if(isSort) el.classList.add('ui-control-sort');
            else el.classList.add('ui-control-extra');
          }

          if(tag === 'BUTTON' || tag === 'A'){
            el.classList.add('ui-control-btn');
          }

          el.dataset.uiCtlTagged = '1';
        });

        // Force search to fill its allocated width
        try{
          grid.querySelectorAll('.ui-control-search').forEach(s=>{ s.style.width = '100%'; });
        }catch(e){}

        bar.dataset.uiControlsUnified = '1';
      });
    });
  }

  try{ applyUnifiedControlBars(document); }catch(e){}

  try{
    const uiControlsObserver = new MutationObserver((muts)=>{
      for(const m of muts){
        if(m.addedNodes && m.addedNodes.length){
          m.addedNodes.forEach(node=>{
            if(node && node.querySelectorAll){
              applyUnifiedControlBars(node);
            }
          });
        }
      }
    });
    uiControlsObserver.observe(document.body, { childList:true, subtree:true });
  }catch(e){}



/* ====== NEXT SCRIPT BLOCK ====== */



// ===== Unified Controls Bar Enhancer (Deterministic, Safe) =====
(function(){
  function cleanSearchPlaceholder(input){
    try{
      const ph = (input.getAttribute('placeholder') || '').trim();
      const cleaned = ph.replace(/^[\s🔍🔎]+/g,'').replace(/\s+/g,' ').trim();
      if(cleaned && cleaned !== ph) input.setAttribute('placeholder', cleaned);
    }catch(e){}
  }

  function ensureSearchWrap(inputId, placeholder){
    const input = document.getElementById(inputId);
    if(!input) return;

    // Keep handlers/ID intact
    try{ input.setAttribute('type','text'); }catch(e){}
    if(placeholder){ try{ input.setAttribute('placeholder', placeholder); }catch(e){} }
    cleanSearchPlaceholder(input);

    // Normalize classes (do not wipe existing ui-field if present)
    input.classList.add('ui-field','ui-input','ui-ctl-input');

    // Remove any inline absolute icon used previously
    try{
      const parent = input.parentElement;
      if(parent){
        parent.querySelectorAll('span').forEach(sp=>{
          try{
            if(sp.classList && (sp.classList.contains('ui-search-icon') || sp.classList.contains('prop-search-ic') || sp.classList.contains('keep-icon'))) return;
          }catch(e){}
          const t = (sp.textContent||'').trim();
          if(t === '🔍' || t === '🔎') sp.remove();
        });
      }
    }catch(e){}

    // Wrap with icon outside input if not already
    let wrap = input.closest('.ui-search-wrap');
    if(wrap) return;

    const container = input.parentElement;
    if(!container) return;

    // Convert container into wrap safely (common case: .relative)
    container.classList.remove('relative');
    container.classList.add('ui-search-wrap');

    // Ensure icon exists
    let icon = container.querySelector('.ui-search-icon');
    if(!icon){
      icon = document.createElement('span');
      icon.className = 'ui-search-icon';
      icon.textContent = '🔍';
      container.insertBefore(icon, input);
    }
  }

  function styleSort(sortId){
    const sel = document.getElementById(sortId);
    if(!sel) return;
    sel.classList.add('ui-field','ui-select','ui-ctl-select');
  }

  function styleDir(dirId){
    const el = document.getElementById(dirId);
    if(!el) return;
    el.classList.add('ui-ctl-dir');
  }

  function tagToolbar(barId, map){
    const bar = document.getElementById(barId);
    if(!bar) return;

    // Make bar look consistent without overriding page theme too much
    const isUiToolbar = !!(bar.classList && bar.classList.contains('ui-toolbar'));
    if(!isUiToolbar){
      bar.classList.add('glass-card','ui-controls-bar');
    }

    // Find row container inside bar (first flex wrapper)
    let row = bar.querySelector(':scope > .flex, :scope > div > .flex');
    if(!row) row = bar.querySelector('.flex');
    if(!row && isUiToolbar){
      row = bar.querySelector('.ui-toolbar-row');
    }
    if(row) row.classList.add('ui-controls-row');

    // Apply search wrap
    if(map.searchId){
      ensureSearchWrap(map.searchId, map.searchPlaceholder || '');
      const input = document.getElementById(map.searchId);
      if(input){
        // search block: nearest container that has a label (usually the block)
        let blk = input.closest('div');
        while(blk && blk !== bar){
          if(blk.querySelector('label')) break;
          blk = blk.parentElement;
        }
        if(blk) blk.classList.add('ui-search-block');
      }
    }

    // Apply sort block
    if(map.sortById){
      styleSort(map.sortById);
      const sel = document.getElementById(map.sortById);
      if(sel){
        let blk = sel.closest('div');
        while(blk && blk !== bar){
          if(blk.querySelector('label')) break;
          blk = blk.parentElement;
        }
        if(blk) blk.classList.add('ui-sort-block');
      }
    }

    // Direction control
    if(map.sortDirId){
      styleDir(map.sortDirId);
      const dir = document.getElementById(map.sortDirId);
      if(dir){
        // try to keep sort wrap aligned
        const wrap = dir.closest('.flex') || dir.parentElement;
        if(wrap) wrap.classList.add('ui-sort-wrap');
      }
    }

    // Style action buttons inside same bar (filters/reset)
    try{
      const btns = bar.querySelectorAll('button.btn-ui, button.btn-filter, button.btn-primary, button.btn-secondary');
      btns.forEach(b=> b.classList.add('ui-ctl-select'));
      // Group actions: buttons that are not inside search/sort blocks
      const actions = Array.from(btns).filter(b=>{
        return !(b.closest('.ui-search-block') || b.closest('.ui-sort-block'));
      });
      if(actions.length && row){
        let actionsWrap = row.querySelector('.ui-actions-block');
        if(!actionsWrap){
          actionsWrap = document.createElement('div');
          actionsWrap.className = 'ui-actions-block';
          row.appendChild(actionsWrap);
        }
        actions.forEach(b=> actionsWrap.appendChild(b));
      }
    }catch(e){}
  }

  function applyAll(){
    tagToolbar('leases-advanced-bar', {
      searchId: 'lease-search-input',
      searchPlaceholder: 'بحث: رقم العقد، المستأجر، الوحدة...',
      sortById: 'leases-sort-by',
      sortDirId: 'leases-sort-dir'
    });
    tagToolbar('cheques-advanced-bar', {
      searchId: 'cheques-search-input',
      searchPlaceholder: 'بحث: مستأجر، وحدة، شيك، بنك...',
      sortById: 'cheques-sort-by',
      sortDirId: 'cheques-sort-dir'
    });
    tagToolbar('receipts-advanced-bar', {
      searchId: 'receipts-search-input',
      searchPlaceholder: 'بحث: رقم، نوع، مبلغ، طرف، بيان...',
      sortById: 'receipts-sort-by',
      sortDirId: 'receipts-sort-dir'
    });
    tagToolbar('expenses-advanced-bar', {
      searchId: 'expenses-search-input',
      searchPlaceholder: 'بحث: بند، نوع، مبلغ، تاريخ...',
      sortById: 'expenses-sort-by',
      sortDirId: 'expenses-sort-dir'
    });

    // Tenants toolbar (no dedicated bar id in some layouts)
    try{
      const tSearch = document.getElementById('tenants-search');
      if(tSearch){
        ensureSearchWrap('tenants-search','بحث: اسم/هاتف/هوية/رخصة...');
        tSearch.classList.add('ui-ctl-input');
      }
      styleSort('tenants-sort-by');
      styleDir('tenants-sort-dir');
    }catch(e){}

    // Properties quick search + sort
    try{
      const ps = document.getElementById('prop-search');
      if(ps){
        ensureSearchWrap('prop-search','بحث سريع...');
        ps.classList.add('ui-ctl-input');
      }
      styleSort('prop-sort-by');
      styleDir('prop-sort-dir');

      // Ensure the container that holds prop-search & sort aligns
      const sort = document.getElementById('prop-sort-by');
      if(ps && sort){
        // find a flex row that contains both
        let row = ps.closest('.flex');
        while(row && !(row.contains(sort))) row = row.parentElement;
        if(row) row.classList.add('ui-controls-row');
      }
    }catch(e){}

    // Units sort (if exists)
    try{
      styleSort('unit-sort-by');
      styleDir('unit-sort-dir');
      const us = document.getElementById('unit-search');
      if(us){ ensureSearchWrap('unit-search','بحث في الوحدات...'); }
    }catch(e){}
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', applyAll);
  }else{
    applyAll();
  }
})();



/* ====== NEXT SCRIPT BLOCK ====== */



// ===== Apply unified action buttons to "إجراءات/Actions" column only =====
(function(){
  const ACTION_HEADERS = ['إجراءات','اجراءات','Actions','Action'];
  function norm(s){ return (s||'').replace(/\s+/g,' ').trim().toLowerCase(); }
  function detectActionCol(table){
    const ths = Array.from(table.querySelectorAll('thead th'));
    for(let i=0;i<ths.length;i++){
      const t = norm(ths[i].textContent);
      if(!t) continue;
      for(const h of ACTION_HEADERS){
        const nh = norm(h);
        if(t === nh || t.includes(nh)) return i;
      }
    }
    return -1;
  }
  function variantFromText(txt){
    const t = norm(txt);
    if(!t) return 'primary';
    if(t.includes('حذف') || t.includes('delete')) return 'danger';
    if(t.includes('طباعة') || t.includes('print')) return 'neutral';
    if(t.includes('قبض') || t.includes('صرف') || t.includes('دفعة') || t.includes('pay') || t.includes('receipt') || t.includes('voucher')) return 'success';
    if(t.includes('تعديل') || t.includes('edit') || t.includes('عرض') || t.includes('view') || t.includes('تفاصيل') || t.includes('manage')) return 'primary';
    return 'primary';
  }
  function applyToTable(table){
    if(!table || table.dataset.uiActionsUnified === '1') return;
    const col = detectActionCol(table);
    if(col === -1) { table.dataset.uiActionsUnified = '1'; return; }

    const ths = table.querySelectorAll('thead th');
    if(ths[col]) ths[col].classList.add('ui-action-cell');

    table.querySelectorAll('tbody tr').forEach(tr=>{
      const tds = tr.querySelectorAll('td');
      const td = tds[col];
      if(!td) return;
      td.classList.add('ui-action-cell');

      let wrap = td.querySelector(':scope > .ui-action-wrap');
      if(!wrap){
        wrap = document.createElement('div');
        wrap.className = 'ui-action-wrap';
        Array.from(td.childNodes).forEach(n=>wrap.appendChild(n));
        td.appendChild(wrap);
      }

      wrap.querySelectorAll('button, a').forEach(btn=>{
        if(btn.classList.contains('ui-action-btn')) return;
        const txt = btn.textContent || btn.getAttribute('title') || btn.getAttribute('aria-label') || '';
        btn.classList.add('ui-action-btn', variantFromText(txt));
        if(btn.tagName === 'BUTTON' && !btn.getAttribute('type')) btn.setAttribute('type','button');
      });
    });

    table.dataset.uiActionsUnified = '1';
  }
  function applyAll(root=document){
    root.querySelectorAll('table').forEach(applyToTable);
  }
  if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', ()=>applyAll(document)); }
  else{ applyAll(document); }

  try{
    const obs = new MutationObserver((muts)=>{
      for(const m of muts){
        if(m.addedNodes && m.addedNodes.length){
          m.addedNodes.forEach(node=>{
            if(node && node.querySelectorAll) applyAll(node);
          });
        }
      }
    });
    obs.observe(document.body,{childList:true,subtree:true});
  }catch(e){}
})();



// ===== Modal UX (ESC / Click Outside / Focus Trap / Restore Focus) =====
(function(){
  const openStack = [];
  const lastFocus = new WeakMap();

  const CLOSE_MAP = {
    'property-modal': ()=>{ try{ closePropertyModal(); }catch(e){ document.getElementById('property-modal')?.classList.add('hidden'); } },
    'unit-modal':     ()=>{ try{ closeUnitModal(); }catch(e){ document.getElementById('unit-modal')?.classList.add('hidden'); } },
    'lease-modal':    ()=>{ try{ closeLeaseModal(); }catch(e){ document.getElementById('lease-modal')?.classList.add('hidden'); } },
    'add-lease-modal':()=>{ try{ closeAddLeaseModal(); }catch(e){ document.getElementById('add-lease-modal')?.classList.add('hidden'); } },
    'payment-modal':  ()=>{ try{ closePaymentModal(); }catch(e){ document.getElementById('payment-modal')?.classList.add('hidden'); } },
    'tenant-modal':   ()=>{ try{ closeTenantModal(); }catch(e){ document.getElementById('tenant-modal')?.classList.add('hidden'); } },
    'cheque-modal':   ()=>{ try{ closeChequeModal(); }catch(e){ document.getElementById('cheque-modal')?.classList.add('hidden'); } },
    'cheque-link-modal':()=>{ try{ closeChequeLinkModal(); }catch(e){ document.getElementById('cheque-link-modal')?.classList.add('hidden'); } },
    'lease-payment-modal':()=>{ document.getElementById('lease-payment-modal')?.classList.add('hidden'); }
  };

  function isOpen(m){ return m && !m.classList.contains('hidden'); }

  function topModal(){
    for(let i=openStack.length-1;i>=0;i--){
      const m = openStack[i];
      if(isOpen(m)) return m;
    }
    return null;
  }

  function closeModal(m){
    if(!m) return;
    const fn = CLOSE_MAP[m.id];
    if(typeof fn === 'function') fn();
    else m.classList.add('hidden');
  }

  function setBodyScrollLock(){
    const anyOpen = !!topModal();
    document.body.style.overflow = anyOpen ? 'hidden' : '';
  }

  function getFocusable(m){
    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    const nodes = Array.from(m.querySelectorAll(selectors));
    return nodes.filter(el=>{
      // must be visible-ish
      if(!el) return false;
      if(el.closest('.hidden')) return false;
      const style = window.getComputedStyle(el);
      if(style.display === 'none' || style.visibility === 'hidden') return false;
      return true;
    });
  }

  function focusFirst(m){
    const focusables = getFocusable(m);
    const target = focusables[0] || m.querySelector('.modal-content') || m;
    try{
      target.setAttribute('tabindex', target.getAttribute('tabindex') || '-1');
      target.focus({preventScroll:true});
    }catch(e){}
  }

  function onOpen(m){
    if(!m) return;
    // Stack
    if(!openStack.includes(m)) openStack.push(m);
    lastFocus.set(m, document.activeElement);

    // Accessibility hints (no visual changes)
    if(!m.getAttribute('role')) m.setAttribute('role','dialog');
    m.setAttribute('aria-modal','true');

    // Focus
    setTimeout(()=>focusFirst(m), 0);
    setBodyScrollLock();
  }

  function onClose(m){
    if(!m) return;
    // remove from stack
    const idx = openStack.indexOf(m);
    if(idx!==-1) openStack.splice(idx,1);

    setBodyScrollLock();

    const prev = lastFocus.get(m);
    if(prev && prev.focus){
      setTimeout(()=>{ try{ prev.focus({preventScroll:true}); }catch(e){} }, 0);
    }
  }

  function wireModal(m){
    if(!m || m.__uxWired) return;
    m.__uxWired = true;

    // click outside to close
    m.addEventListener('mousedown', (e)=>{
      if(e.target === m){
        // click on overlay
        closeModal(m);
      }
    });

    // observe open/close by class changes
    let wasOpen = isOpen(m);
    if(wasOpen) onOpen(m);

    try{
      const obs = new MutationObserver((muts)=>{
        for(const mu of muts){
          if(mu.type === 'attributes' && mu.attributeName === 'class'){
            const nowOpen = isOpen(m);
            if(nowOpen && !wasOpen){ wasOpen = true; onOpen(m); }
            if(!nowOpen && wasOpen){ wasOpen = false; onClose(m); }
          }
        }
      });
      obs.observe(m, {attributes:true, attributeFilter:['class']});
    }catch(e){}
  }

  // Global key handling: ESC close + focus trap
  document.addEventListener('keydown', (e)=>{
    const m = topModal();
    if(!m) return;

    if(e.key === 'Escape'){
      e.preventDefault();
      closeModal(m);
      return;
    }

    if(e.key === 'Tab'){
      const focusables = getFocusable(m);
      if(!focusables.length){
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length-1];
      const active = document.activeElement;

      if(e.shiftKey){
        if(active === first || active === m){
          e.preventDefault();
          last.focus();
        }
      }else{
        if(active === last){
          e.preventDefault();
          first.focus();
        }
      }
    }
  }, true);

  function init(){
    document.querySelectorAll('div[id$="-modal"]').forEach(wireModal);
    // For modals created later (rare), wire them too.
    try{
      const obs = new MutationObserver((muts)=>{
        for(const mu of muts){
          mu.addedNodes && mu.addedNodes.forEach(n=>{
            if(!n || !n.querySelectorAll) return;
            if(n.matches && n.matches('div[id$="-modal"]')) wireModal(n);
            n.querySelectorAll('div[id$="-modal"]').forEach(wireModal);
          });
        }
      });
      obs.observe(document.body, {childList:true, subtree:true});
    }catch(e){}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
