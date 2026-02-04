/* UI+ Enhancements (UIV32)
   1) Advanced filters panels: hidden by default (show on click)
   2) Persist toolbar/search/sort/filter values per page
   3) Overdue row highlighting (payments + cheques)
   4) Smart search suggestions (datalist) per page
   5) Add-lease modal tabs + sticky footer + invalid-field auto-tab
*/
(function(){
  const LS_PREFIX = 'uiv32:uiState:';

  function safeJsonParse(s, fallback){
    try{ return JSON.parse(s); }catch(e){ return fallback; }
  }
  function getState(viewId){
    return safeJsonParse(localStorage.getItem(LS_PREFIX + viewId) || '{}', {}) || {};
  }
  function setState(viewId, state){
    try{ localStorage.setItem(LS_PREFIX + viewId, JSON.stringify(state || {})); }catch(e){}
  }

  function viewEl(viewId){ return document.getElementById(viewId + '-view'); }

  function controlKey(el){
    return el.id || el.name || el.getAttribute('data-key') || null;
  }

  function collectControls(v){
    if(!v) return [];
    return Array.from(v.querySelectorAll(
      '.ui-toolbar input, .ui-toolbar select, .ui-toolbar textarea,' +
      '.ui-toolbar-panel input, .ui-toolbar-panel select, .ui-toolbar-panel textarea,' +
      '.ui-advbar input, .ui-advbar select, .ui-advbar textarea'
    ));
  }

  function collectPanels(v){
    if(!v) return [];
    return Array.from(v.querySelectorAll('.ui-toolbar-panel, .ui-advbar'));
  }

  function isHidden(el){ return el.classList.contains('hidden') || getComputedStyle(el).display === 'none'; }

  function setPanelOpen(panel, open){
    if(!panel) return;
    if(open) panel.classList.remove('hidden');
    else panel.classList.add('hidden');

    // Optional: update toggle buttons
    const pid = panel.id;
    if(pid){
      const btn = panel.closest('.view')?.querySelector(`[aria-controls="${pid}"]`) ||
                  panel.closest('.view')?.querySelector(`[data-panel-target="${pid}"]`) ||
                  panel.closest('.view')?.querySelector(`#${pid}-toggle`) ||
                  panel.closest('.view')?.querySelector(`#${pid.replace(/-panel$/,'')}-toggle`) ||
                  panel.closest('.view')?.querySelector(`button.btn-filter[id*="toggle"]`);
      if(btn){
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.classList.toggle('is-open', open);
      }
    }
  }

  function saveViewState(viewId){
    const v = viewEl(viewId);
    if(!v) return;
    const st = getState(viewId);
    st.controls = st.controls || {};
    collectControls(v).forEach(el=>{
      const k = controlKey(el);
      if(!k) return;
      if(el.type === 'checkbox') st.controls[k] = {t:'c', v: !!el.checked};
      else st.controls[k] = {t:'v', v: el.value};
    });
    setState(viewId, st);
  }

  function restoreViewState(viewId, {openByDefault=false} = {}){
    const v = viewEl(viewId);
    if(!v) return;
    const st = getState(viewId);

    // Panels: always hidden by default; user opens via toggle button
    const panels = collectPanels(v);
    panels.forEach((p)=> setPanelOpen(p, false));


    // Controls: restore values
    if(st.controls){
      collectControls(v).forEach(el=>{
        const k = controlKey(el);
        if(!k || !(k in st.controls)) return;
        const item = st.controls[k];
        if(item && item.t === 'c'){
          el.checked = !!item.v;
        }else if(item && item.t === 'v'){
          el.value = (item.v ?? '');
        }
      });
    }
  }

  function triggerControls(viewId){
    const v = viewEl(viewId);
    if(!v) return;
    collectControls(v).forEach(el=>{
      // Trigger change & input to let existing page logic re-render
      try{ el.dispatchEvent(new Event('input', {bubbles:true})); }catch(e){}
      try{ el.dispatchEvent(new Event('change', {bubbles:true})); }catch(e){}
    });
  }

  // Identify the *actual* advanced-filters toggle button(s) in a view.
// Important: Some pages use .btn-filter for other actions (refresh/submit/etc).
function getAdvFiltersToggleButtons(v){
  if(!v) return [];
  const panel = v.querySelector('.ui-toolbar-panel, .ui-advbar');
  if(!panel) return [];
  const panelId = panel.id || '';
  const candidates = Array.from(v.querySelectorAll('button.btn-filter, button[data-ui="filters-toggle"], button.ui-filters-toggle'));
  return candidates.filter(btn=>{
    const id = (btn.id || '').toLowerCase();
    const txt = (btn.textContent || '').trim();
    const onclick = (btn.getAttribute('onclick') || '').toLowerCase();
    const ac = (btn.getAttribute('aria-controls') || '').trim();
    const target = (btn.getAttribute('data-panel-target') || '').trim();

    const explicitRef =
      (ac && panelId && ac === panelId) ||
      (target && panelId && target === panelId);

    const looksLikeToggle =
      /toggle|filters|filter/.test(id) ||
      (/فلاتر|فلتر/.test(txt) && txt.length <= 30) ||
      onclick.includes('toggle');

    const type = (btn.getAttribute('type') || '').toLowerCase();
    const isSubmit = type === 'submit' || !!btn.closest('form');

    if(isSubmit && !explicitRef && !looksLikeToggle) return false;
    return explicitRef || looksLikeToggle;
  });
}

// ---------- Persist bindings ----------
  let saveTimer = null;
  function bindPersistence(viewId){
    const v = viewEl(viewId);
    if(!v) return;
    const onAnyChange = ()=>{
      clearTimeout(saveTimer);
      saveTimer = setTimeout(()=> saveViewState(viewId), 150);
    };
    collectControls(v).forEach(el=>{
      el.addEventListener('input', onAnyChange);
      el.addEventListener('change', onAnyChange);
    });
    // Persist panel toggles (advanced-filters button only)
    const toggles = getAdvFiltersToggleButtons(v);
    toggles.forEach(btn=>{
      btn.dataset.ui = 'filters-toggle';
      const panel = v.querySelector('.ui-toolbar-panel, .ui-advbar');
      if(panel?.id) btn.setAttribute('aria-controls', panel.id);
    });
  }

  
// ---------- Normalize advanced-filters toggle button (ONLY) ----------
function normalizeFilterButtons(viewId){
  const v = viewEl(viewId);
  if(!v) return;
  const toggles = getAdvFiltersToggleButtons(v);
  toggles.forEach(btn=>{
    btn.classList.add('btn-ui','btn-filter');
    btn.setAttribute('type','button');
    btn.setAttribute('title','الفلاتر المتقدمة');
    btn.dataset.ui = 'filters-toggle';
    btn.innerHTML = '<span aria-hidden="true">🧰</span><span class="filter-label">الفلاتر المتقدمة</span>';
  });
}

// ---------- Smart search suggestions ----------
  function addSuggestion(set, val){
    if(!val) return;
    const s = String(val).trim();
    if(!s) return;
    if(s.length < 2) return;
    set.add(s);
  }

  function buildGlobalSuggestions(limit=240){
    const s = new Set();
    try{
      (window.properties || []).forEach(p=>{
        addSuggestion(s, p.id);
        addSuggestion(s, p.name);
        addSuggestion(s, p.location);
        addSuggestion(s, p.owner);
        (p.units || []).forEach(u=>{
          addSuggestion(s, u.id);
          addSuggestion(s, u.unitId);
          addSuggestion(s, u.unitName);
          addSuggestion(s, u.name);
          addSuggestion(s, u.tenant);
          addSuggestion(s, u.contractNo);
          addSuggestion(s, u.phone);
          addSuggestion(s, u.email);
        });
      });
      (window.payments || []).forEach(x=>{
        addSuggestion(s, x.tenant);
        addSuggestion(s, x.unit);
        addSuggestion(s, x.contract);
        addSuggestion(s, x.contractNo);
        addSuggestion(s, x.type);
        addSuggestion(s, x.desc);
      });
      (window.cheques || []).forEach(c=>{
        addSuggestion(s, c.tenant);
        addSuggestion(s, c.chequeNo);
        addSuggestion(s, c.bank);
        addSuggestion(s, c.purpose);
        addSuggestion(s, c.unit);
        addSuggestion(s, c.contract);
      });
      (window.expenses || []).forEach(e=>{
        addSuggestion(s, e.category);
        addSuggestion(s, e.desc);
        addSuggestion(s, e.vendor);
      });
    }catch(e){}
    return Array.from(s).slice(0, limit);
  }

  function setupSearchDatalistForView(viewId){
    const v = viewEl(viewId);
    if(!v) return;
    const searchInputs = Array.from(v.querySelectorAll('.ui-search-wrap input, input[type="search"], input[id*="search"], input[placeholder*="بحث"]'))
      .filter(el => el.type !== 'hidden');
    if(!searchInputs.length) return;

    const listId = `dl-${viewId}-search`;
    let dl = document.getElementById(listId);
    if(!dl){
      dl = document.createElement('datalist');
      dl.id = listId;
      document.body.appendChild(dl);
    }

    const refresh = ()=>{
      const opts = buildGlobalSuggestions();
      dl.innerHTML = opts.map(v=> `<option value="${String(v).replace(/"/g,'&quot;')}"></option>`).join('');
    };

    searchInputs.forEach(inp=>{
      inp.setAttribute('list', listId);
      inp.addEventListener('focus', refresh);
    });
  }

  // ---------- Overdue highlighting ----------
  function parseDateAny(s){
    if(!s) return null;
    const t = String(s).trim();
    if(!t) return null;

    // yyyy-mm-dd
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m){
      const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
      return isNaN(d) ? null : d;
    }
    // dd/mm/yyyy
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(m){
      const d = new Date(Number(m[3]), Number(m[2])-1, Number(m[1]));
      return isNaN(d) ? null : d;
    }
    return null;
  }

  function isPast(dateObj){
    if(!dateObj) return false;
    const now = new Date();
    const a = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()).getTime();
    const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return a < b;
  }

  function markOverdueRows(){
    try{
      // Payments table
      const payBody = document.getElementById('payments-table-body');
      if(payBody){
        Array.from(payBody.querySelectorAll('tr')).forEach(tr=>{
          tr.classList.remove('row-overdue');
          const txt = tr.textContent || '';
          if(!/بانتظار\s*الدفع/.test(txt)) return;
          // Try to find due date in row
          const dateCell = Array.from(tr.querySelectorAll('td')).map(td=>td.textContent.trim()).find(v=>/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/.test(v));
          const d = parseDateAny(dateCell);
          if(d && isPast(d)) tr.classList.add('row-overdue');
        });
      }

      // Cheques table
      const chqBody = document.getElementById('cheques-table-body');
      if(chqBody){
        Array.from(chqBody.querySelectorAll('tr')).forEach(tr=>{
          tr.classList.remove('row-overdue');
          const txt = tr.textContent || '';
          if(!/بانتظار\s*الصرف/.test(txt)) return;
          const cells = Array.from(tr.querySelectorAll('td')).map(td=>td.textContent.trim());
          // cheque view has "الاستحقاق" column, often a date
          const dateCell = cells.find(v=>/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/.test(v));
          const d = parseDateAny(dateCell);
          if(d && isPast(d)) tr.classList.add('row-overdue');
        });
      }
    }catch(e){}
  }

  
  function setupAddLeaseTenantType(){
    const sel = document.getElementById('add-lease-tenantType');
    if(!sel || sel.__uiv32_bound) return;
    sel.__uiv32_bound = true;
    const companyWrap = document.getElementById('add-lease-companyFields');
    const personWrap = document.getElementById('add-lease-personFields');
    const trade = document.getElementById('add-lease-tradeLicense');
    const idn = document.getElementById('add-lease-idNumber');

    const apply = ()=>{
      const v = (sel.value || '').toLowerCase();
      if(v === 'company'){
        companyWrap?.classList.remove('hidden');
        personWrap?.classList.add('hidden');
        if(trade) trade.required = false; // optional by default
        if(idn) idn.required = false;
      }else if(v === 'individual'){
        personWrap?.classList.remove('hidden');
        companyWrap?.classList.add('hidden');
        if(trade) trade.required = false;
        if(idn) idn.required = false;
      }else{
        companyWrap?.classList.add('hidden');
        personWrap?.classList.add('hidden');
        if(trade) trade.required = false;
        if(idn) idn.required = false;
      }
    };
    sel.addEventListener('change', apply);
    apply();
  }

// ---------- Add-lease tabs ----------
  
  function setActiveTab(container, tab){
    if(!container) return;
    const root = container.closest('form') || container.closest('.modal-content') || document;
    container.querySelectorAll('[data-tab-btn]').forEach(btn=>{
      btn.classList.toggle('active', btn.getAttribute('data-tab-btn') === tab);
    });
    root.querySelectorAll('[data-tab-panel]').forEach(p=>{
      p.classList.toggle('hidden', p.getAttribute('data-tab-panel') !== tab);
    });
    container.setAttribute('data-active-tab', tab);
  }

  function setupAddLeaseTabs(){
    const modal = document.getElementById('add-lease-modal');
    const form = document.getElementById('add-lease-form');
    const tabs = document.getElementById('add-lease-tabs');
    if(!modal || !form || !tabs) return;

    tabs.querySelectorAll('[data-tab-btn]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const t = btn.getAttribute('data-tab-btn');
        setActiveTab(tabs, t);
      });
    });

    // Auto switch to first invalid field's tab on submit
    form.addEventListener('submit', (e)=>{
      const inv = form.querySelector(':invalid');
      if(inv){
        // prevent default browser tooltip so we can switch tab
        try{ inv.reportValidity(); }catch(_){} // keep native message
        const panel = inv.closest('[data-tab-panel]');
        if(panel){
          const tab = panel.getAttribute('data-tab-panel');
          setActiveTab(tabs, tab);
        }
      }
    }, true);

    // Default tab
    const def = tabs.getAttribute('data-default-tab') || 'units';
    setActiveTab(tabs, def);

    // Ensure on open, always reset to default (wrap openAddLeaseModal)
    if(typeof window.openAddLeaseModal === 'function' && !window.openAddLeaseModal.__uiv32_wrapped){
      const orig = window.openAddLeaseModal;
      const wrapped = function(){
        const r = orig.apply(this, arguments);
        try{
          const def2 = tabs.getAttribute('data-default-tab') || 'units';
          setActiveTab(tabs, def2);
        }catch(e){}
        return r;
      };
      wrapped.__uiv32_wrapped = true;
      window.openAddLeaseModal = wrapped;
    }
  }

  // ---------- Master init ----------
  function initForView(viewId){
    // open panels by default (first time) + restore saved values
    restoreViewState(viewId, {openByDefault:false});
    normalizeFilterButtons(viewId);
    // then trigger to let existing logic render
    triggerControls(viewId);
    // bind persistence
    bindPersistence(viewId);
    // autocomplete
    setupSearchDatalistForView(viewId);
  }

  function initAll(){
    // Tabs for add lease
    setupAddLeaseTabs();
    setupAddLeaseTenantType();

    // Patch showView so state restores whenever user navigates
    if(typeof window.showView === 'function' && !window.showView.__uiv32_wrapped){
      const orig = window.showView;
      const wrapped = function(id){
        // restore state BEFORE render where possible
        try{ restoreViewState(id, {openByDefault:false}); }catch(e){}
        try{ normalizeFilterButtons(id); }catch(e){}
        const r = orig.apply(this, arguments);
        try{
          // apply saved control values to trigger filtering
          triggerControls(id);
          bindPersistence(id);
          setupSearchDatalistForView(id);
          setTimeout(markOverdueRows, 50);
        }catch(e){}
        return r;
      };
      wrapped.__uiv32_wrapped = true;
      window.showView = wrapped;
    }

    // Patch renderPayments/renderCheques to re-apply overdue mark
    ['renderPayments','renderCheques'].forEach(fn=>{
      if(typeof window[fn] === 'function' && !window[fn].__uiv32_wrapped){
        const orig = window[fn];
        const wrapped = function(){
          const r = orig.apply(this, arguments);
          setTimeout(markOverdueRows, 40);
          return r;
        };
        wrapped.__uiv32_wrapped = true;
        window[fn] = wrapped;
      }
    });

    // init current visible view (if any)
    try{
      const cur = Array.from(document.querySelectorAll('.view')).find(v=>!v.classList.contains('hidden'));
      if(cur && cur.id && cur.id.endsWith('-view')){
        const vid = cur.id.replace(/-view$/,'');
        initForView(vid);
      }
    }catch(e){}

    // refresh overdue periodically (optional, light)
    setInterval(markOverdueRows, 6000);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initAll);
  }else{
    initAll();
  }
  document.addEventListener('ui:components-loaded', initAll);
})();
