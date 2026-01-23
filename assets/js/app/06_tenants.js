// ================================================
// 06_tenants.js - Tenants + Contacts + Sorting helpers
// Auto-split from legacy app.js for maintainability.
// DO NOT edit the legacy file directly; edit split modules.
// ================================================

  // ================= TENANTS =================
  function getTenantsData(){
    const map = {};
    properties.forEach(p=>p.units.forEach(u=>{
      if(u.status==='مؤجرة' && u.tenant){
        const key = tenantKey(u.tenant);
        if(!key) return;
        if(!map[key]) map[key] = { key, name:String(u.tenant).trim(), phone:'', email:'', tenantType:'', tradeLicenseNo:'', idNumber:'', idLabel:'', units:[], rent:0, paid:0 };
        map[key].units.push(u.name);
        map[key].rent += (u.rent||0);
      }
    }));
    Object.keys(map).forEach(key=>{
      const c = tenantsContacts[key];
      if(c){
        map[key].phone = c.phone || '';
        map[key].email = c.email || '';
        map[key].tenantType = c.tenantType || map[key].tenantType || '';
        map[key].tradeLicenseNo = c.tradeLicenseNo || map[key].tradeLicenseNo || '';
        map[key].idNumber = c.idNumber || map[key].idNumber || '';
        // Display label in tenants table
        if(map[key].tenantType === 'شركة' && map[key].tradeLicenseNo){
          map[key].idLabel = `🏢 رخصة: ${map[key].tradeLicenseNo}`;
        } else if(map[key].tenantType === 'فرد' && map[key].idNumber){
          map[key].idLabel = `🪪 هوية: ${map[key].idNumber}`;
        } else if(map[key].tradeLicenseNo){
          map[key].idLabel = `🏢 رخصة: ${map[key].tradeLicenseNo}`;
        } else if(map[key].idNumber){
          map[key].idLabel = `🪪 هوية: ${map[key].idNumber}`;
        } else {
          map[key].idLabel = '';
        }
        // keep a preferred display name if available
        if(c.name) map[key].name = c.name;
      }
    });
    payments.forEach(pay=>{
      const key = tenantKey(pay.tenant);
      if(map[key]) map[key].paid += pay.amount;
    });
    return Object.values(map).map(t=>({...t, balance: t.rent - t.paid}));
  }

  function getTenantNames(){
    return Object.keys(
      getTenantsData().reduce((acc, t)=>{
        if(t.units && t.units.length>0) acc[t.name]=true;
        return acc;
      }, {})
    );
  }

  // ======= Units lookup helpers (for linking cheques to units) =======
  function findUnitById(unitId){
    if(!unitId) return null;
    for(const p of (properties||[])){
      for(const u of (p.units||[])){
        if(u.id === unitId){
          return { property: p, unit: u };
        }
      }
    }
    return null;
  }

  function getTenantLeasedUnitsDetailed(tenantName){
    const tkey = tenantKey(tenantName);
    const out = [];
    if(!tkey) return out;
    (properties||[]).forEach(p=>{
      (p.units||[]).forEach(u=>{
        if(u.status === 'مؤجرة' && tenantKey(u.tenant) === tkey){
          out.push({
            unitId: u.id,
            unitName: u.name,
            propertyId: p.id,
            propertyName: p.name,
            contractNo: u.contractNo || '',
            start: u.start || '',
            end: u.end || '',
            label: `${escHtml(u.name)} - ${escHtml(p.name)}`
          });
        }
      });
    });
    return out;
  }

  function inferSingleLeasedUnitIdForTenant(tenantName){
    const list = getTenantLeasedUnitsDetailed(tenantName);
    return list.length === 1 ? list[0].unitId : '';
  }

  function getUnitDisplayById(unitId){
    const hit = findUnitById(unitId);
    if(!hit) return '';
    return `${hit.unit.name} - ${hit.property.name}`;
  }

  function resolveChequeUnitInfo(cheque){
    const c = normalizeChequeRecord(cheque||{});
    let unitId = c.unitId || '';
    if(!unitId){
      unitId = inferSingleLeasedUnitIdForTenant(c.tenant);
    }
    const hit = findUnitById(unitId);
    const unitLabel = hit ? `${hit.unit.name} - ${hit.property.name}` : (c.unitLabel || '');
    const contractNo = hit ? (hit.unit.contractNo || '') : '';
    return { unitId, unitLabel, contractNo };
  }

  function migrateChequePaymentsToUnit(chequeId){
    const chRaw = (cheques||[]).find(x=>x.id===chequeId);
    if(!chRaw) return;
    const info = resolveChequeUnitInfo(chRaw);
    if(!info.unitId) return;

    // Update cheque record
    const idx = cheques.findIndex(x=>x.id===chequeId);
    if(idx>=0){
      cheques[idx] = { ...cheques[idx], unitId: info.unitId, unitLabel: info.unitLabel };
    }

    // Update linked payment record (if created earlier with generic unit)
    const pIdx = (payments||[]).findIndex(p=>p.chequeId===chequeId);
    if(pIdx>=0){
      const p = payments[pIdx];
      const needs = (!p.unit || p.unit === 'شيك مصرف' || p.unit === 'شيك مصرف' || p.unit === 'شيك مصرف');
      if(needs){
        payments[pIdx] = { ...p, unit: info.unitLabel || p.unit, unitId: info.unitId, contract: info.contractNo || p.contract };
      } else {
        // still store unitId for future matching
        payments[pIdx] = { ...p, unitId: info.unitId };
      }
    }
  }


  function renderTenants(){
    const tbody = document.getElementById('tenants-table-body');
    tbody.innerHTML = '';
    const frag = document.createDocumentFragment();
const search = (document.getElementById('tenants-search').value||'').toLowerCase().trim();

    let data = getTenantsData().filter(t=>{
      if(!search) return true;
      const hay = [
        t.name, t.phone, t.email, t.idLabel,
        (t.units||[]).join(' '),
      ].join(' ').toLowerCase();
      return hay.includes(search);
    });

    const sortBy = (document.getElementById('tenants-sort-by')?.value) || _lsGet('re_tenants_sort_by','name');
    const sortDir = (document.getElementById('tenants-sort-dir')?.dataset?.dir) || _lsGet('re_tenants_sort_dir','asc');
    data = _sortTenants(data, sortBy, sortDir);

    const pg = paginateList(data, 'tenants', 25);



    pg.items.forEach(t=>{
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td class="font-bold">${escHtml(t.name)}</td>
        <td class="text-sm">
          📞 ${escHtml(t.phone||'--')}<br>
          📧 ${escHtml(t.email||'--')}
        </td>
        <td class="text-xs text-gray-600 dark:text-gray-300">
          ${escHtml(t.idLabel||'--')}
        </td>
        <td class="text-xs text-gray-500 dark:text-gray-400">${escHtml(t.units.join(', '))}</td>
        <td class="font-mono">${formatAED(t.rent)}</td>
        <td class="font-mono text-green-600">${formatAED(t.paid)}</td>
        <td class="font-mono font-bold ${t.balance>0?'text-rose-600 dark:text-rose-400':'text-gray-400'}">${formatAED(t.balance)}</td>
        <td class="tenant-actions"></td>
      `;

      const td = tr.querySelector('.tenant-actions');
      const btn = document.createElement('button');
      btn.textContent = 'تحديث';
      btn.className = 'btn-ui btn-ui-sm btn-secondary';
      btn.addEventListener('click', ()=> openTenantModal(t.key, t.name));
      td.appendChild(btn);

      frag.appendChild(tr);
    });
  
  tbody.appendChild(frag);
    renderPagerUI('tenants', document.getElementById('tenants-pager'), pg);
}

  
    // ================= SORTING (Properties / Tenants) =================
  function _lsGet(key, fallback){
    try{
      const v = localStorage.getItem(key);
      return (v===null || v===undefined || v==='') ? fallback : v;
    }catch(e){ return fallback; }
  }
  function _lsSet(key, value){
    try{ localStorage.setItem(key, String(value)); }catch(e){}
  }

  function initSortingPrefs(){
    // Properties
    const psb = document.getElementById('prop-sort-by');
    const psd = document.getElementById('prop-sort-dir');
    const usb = document.getElementById('unit-sort-by');
    const usd = document.getElementById('unit-sort-dir');

    if(psb) psb.value = _lsGet('re_prop_sort_by','name');
    if(psd){
      const d = _lsGet('re_prop_sort_dir','asc');
      psd.dataset.dir = d;
      psd.textContent = (d==='asc') ? '⬆️' : '⬇️';
    }
    if(usb) usb.value = _lsGet('re_unit_sort_by','unitName');
    if(usd){
      const d = _lsGet('re_unit_sort_dir','asc');
      usd.dataset.dir = d;
      usd.textContent = (d==='asc') ? '⬆️' : '⬇️';
    }

    // Tenants
    const tsb = document.getElementById('tenants-sort-by');
    const tsd = document.getElementById('tenants-sort-dir');
    if(tsb) tsb.value = _lsGet('re_tenants_sort_by','name');
    if(tsd){
      const d = _lsGet('re_tenants_sort_dir','asc');
      tsd.dataset.dir = d;
      tsd.textContent = (d==='asc') ? '⬆️' : '⬇️';
    }
  }
  // ===== Properties - Unit Filters (Vacant/Rented + End Date) =====
  function initPropertiesUnitFilters(){
    const statusEl = document.getElementById('unit-status-filter');
    const endFromEl = document.getElementById('unit-end-from');
    const endToEl = document.getElementById('unit-end-to');
    const panel = document.getElementById('prop-filters-panel');

    if(statusEl) statusEl.value = _lsGet('re_unit_status_filter','');
    if(endFromEl) endFromEl.value = _lsGet('re_unit_end_from','');
    if(endToEl) endToEl.value = _lsGet('re_unit_end_to','');

    const open = _lsGet('re_prop_filters_open','0') === '1';
    if(panel){
      panel.classList.toggle('hidden', !open);
      const btn = document.getElementById('prop-filters-toggle');
      if(btn) btn.textContent = open ? '🧰 إخفاء الفلاتر' : '🧰 فلاتر الوحدات';
    }

    const onChange = ()=>{ onPropertiesUnitFiltersChanged(); };
    statusEl && statusEl.addEventListener('change', onChange);
    endFromEl && endFromEl.addEventListener('change', onChange);
    endToEl && endToEl.addEventListener('change', onChange);
  }

  function togglePropertiesUnitFilters(){
    const panel = document.getElementById('prop-filters-panel');
    if(!panel) return;
    const willOpen = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !willOpen);
    _lsSet('re_prop_filters_open', willOpen ? '1' : '0');
    const btn = document.getElementById('prop-filters-toggle');
    if(btn) btn.textContent = willOpen ? '🧰 إخفاء الفلاتر' : '🧰 فلاتر الوحدات';
  }

  function onPropertiesUnitFiltersChanged(){
    const statusEl = document.getElementById('unit-status-filter');
    const endFromEl = document.getElementById('unit-end-from');
    const endToEl = document.getElementById('unit-end-to');

    _lsSet('re_unit_status_filter', statusEl?.value || '');
    _lsSet('re_unit_end_from', endFromEl?.value || '');
    _lsSet('re_unit_end_to', endToEl?.value || '');

    renderProperties();
  }

  function resetPropertiesUnitFilters(){
    _lsSet('re_unit_status_filter','');
    _lsSet('re_unit_end_from','');
    _lsSet('re_unit_end_to','');

    const statusEl = document.getElementById('unit-status-filter');
    const endFromEl = document.getElementById('unit-end-from');
    const endToEl = document.getElementById('unit-end-to');
    if(statusEl) statusEl.value = '';
    if(endFromEl) endFromEl.value = '';
    if(endToEl) endToEl.value = '';
    renderProperties();
  }
  // ===== /Properties - Unit Filters =====


  function onPropSortChanged(){
    const el = document.getElementById('prop-sort-by');
    if(el) _lsSet('re_prop_sort_by', el.value);
    renderProperties();
  }
  function togglePropSortDir(){
    const btn = document.getElementById('prop-sort-dir');
    if(!btn) return;
    const next = (btn.dataset.dir==='asc') ? 'desc' : 'asc';
    btn.dataset.dir = next;
    btn.textContent = (next==='asc') ? '⬆️' : '⬇️';
    _lsSet('re_prop_sort_dir', next);
    renderProperties();
  }
  function onUnitSortChanged(){
    const el = document.getElementById('unit-sort-by');
    if(el) _lsSet('re_unit_sort_by', el.value);
    renderProperties();
  }
  function toggleUnitSortDir(){
    const btn = document.getElementById('unit-sort-dir');
    if(!btn) return;
    const next = (btn.dataset.dir==='asc') ? 'desc' : 'asc';
    btn.dataset.dir = next;
    btn.textContent = (next==='asc') ? '⬆️' : '⬇️';
    _lsSet('re_unit_sort_dir', next);
    renderProperties();
  }

  function onTenantSortChanged(){
    const el = document.getElementById('tenants-sort-by');
    if(el) _lsSet('re_tenants_sort_by', el.value);
    renderTenants();
  }
  function toggleTenantSortDir(){
    const btn = document.getElementById('tenants-sort-dir');
    if(!btn) return;
    const next = (btn.dataset.dir==='asc') ? 'desc' : 'asc';
    btn.dataset.dir = next;
    btn.textContent = (next==='asc') ? '⬆️' : '⬇️';
    _lsSet('re_tenants_sort_dir', next);
    renderTenants();
  }

  function _cmpText(a,b){
    const A = (a||'').toString().trim();
    const B = (b||'').toString().trim();
    return A.localeCompare(B, 'ar', {numeric:true, sensitivity:'base'});
  }
  function _cmpNum(a,b){
    const A = Number(a||0);
    const B = Number(b||0);
    return A - B;
  }
  function _dirMult(dir){ return (dir==='desc') ? -1 : 1; }

  function _sortProperties(list, by, dir){
    const m = _dirMult(dir);
    const arr = [...(list||[])];
    arr.sort((p1,p2)=>{
      switch(by){
        case 'units': return m * _cmpNum((p1.units||[]).length, (p2.units||[]).length);
        case 'location': return m * _cmpText(p1.location, p2.location);
        case 'id': return m * _cmpText(p1.id, p2.id);
        case 'name':
        default: return m * _cmpText(p1.name, p2.name);
      }
    });
    return arr;
  }

  function _statusRank(s){
    // lower = earlier in sort
    if(s==='مؤجرة') return 1;
    if(s==='شاغرة') return 2;
    if(s==='منتهية') return 3;
    return 99;
  }

  function _sortUnits(list, by, dir){
    const m = _dirMult(dir);
    const arr = [...(list||[])];
    arr.sort((u1,u2)=>{
      switch(by){
        case 'unitId': return m * _cmpText(u1.id, u2.id);
        case 'status': return m * (_statusRank(u1.status) - _statusRank(u2.status));
        case 'tenant': return m * _cmpText(u1.tenant, u2.tenant);
        case 'rent': return m * _cmpNum(u1.rent, u2.rent);
        case 'unitName':
        default: return m * _cmpText(u1.unitName || u1.name, u2.unitName || u2.name);
      }
    });
    return arr;
  }

  function _sortTenants(list, by, dir){
    const m = _dirMult(dir);
    const arr = [...(list||[])];
    arr.sort((t1,t2)=>{
      switch(by){
        case 'balance': return m * _cmpNum(t1.balance, t2.balance);
        case 'rent': return m * _cmpNum(t1.rent, t2.rent);
        case 'unitsCount': return m * _cmpNum((t1.units||[]).length, (t2.units||[]).length);
        case 'idLabel': return m * _cmpText(t1.idLabel, t2.idLabel);
        case 'name':
        default: return m * _cmpText(t1.name, t2.name);
      }
    });
    return arr;
  }

  // ================= TENANT CONTACTS (reliable save) =================
  let tenantAutosaveTimer = null;

  function setTenantSaveStatus(msg=''){
    const el = document.getElementById('tenant-save-status');
    if(!el) return;
    el.textContent = msg;
  }

  function persistTenantContact({silent=false} = {}){
    const nameEl  = document.getElementById('tenant-name');
    const phoneEl = document.getElementById('tenant-phone');
    const emailEl = document.getElementById('tenant-email');

    const displayName = (nameEl?.value || '').trim();
    const key = currentTenantKey || tenantKey(displayName);
    if(!key) return null;

    tenantsContacts[key] = {
      name: displayName || (tenantsContacts[key]?.name || ''),
      phone: normalizePhone(phoneEl?.value || ''),
      email: normalizeEmail(emailEl?.value || ''),
      tenantType: document.getElementById('tenant-type')?.value || (tenantsContacts[key]?.tenantType || ''),
      tradeLicenseNo: normalizeText(normalizeDigits(document.getElementById('tenant-tradeLicense')?.value || (tenantsContacts[key]?.tradeLicenseNo || '')), {collapseSpaces:false}),
      idNumber: normalizeText(normalizeDigits(document.getElementById('tenant-idNumber')?.value || (tenantsContacts[key]?.idNumber || '')), {collapseSpaces:false})
    };

    
      if(!silent){
        try{
          const em = tenantsContacts[key]?.email || '';
          if(em && !isValidEmail(em)){
            uiToast('warn','صيغة البريد الإلكتروني غير صحيحة.');
          }
        }catch(e){}
      }

saveToLocal();
    if(!silent) setTenantSaveStatus('✅ تم الحفظ');
    return key;
  }

  function scheduleTenantAutosave(){
    clearTimeout(tenantAutosaveTimer);
    setTenantSaveStatus('… جارٍ الحفظ');
    tenantAutosaveTimer = setTimeout(()=>{
      persistTenantContact({silent:true});
      setTenantSaveStatus('✅ تم الحفظ');
    }, 500);
  }

  function setupTenantModalUX(){
    const modal = document.getElementById('tenant-modal');
    if(!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';

    // autosave on input (phone/email)
    ['tenant-phone','tenant-email','tenant-type','tenant-tradeLicense','tenant-idNumber'].forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.addEventListener('input', scheduleTenantAutosave);
      }
    });


    // ensure select (tenant-type) also saves on change
    const _tenantTypeSel = document.getElementById('tenant-type');
    if(_tenantTypeSel){
      _tenantTypeSel.addEventListener('change', ()=>{ applyTenantTypeUI('tenant'); scheduleTenantAutosave(); });
    }
    const typeEl = document.getElementById('tenant-type');
    if(typeEl){
      typeEl.addEventListener('change', ()=>applyTenantTypeUI('tenant'));
    }

    // ESC closes (and saves)
    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape' && !document.getElementById('tenant-modal').classList.contains('hidden')){
        closeTenantModal();
      }
    });

    // click backdrop closes (and saves)
    modal.addEventListener('click', (e)=>{
      if(e.target === modal){
        closeTenantModal();
      }
    });
  }

function openTenantModal(key='', displayName=''){
    const modal = document.getElementById('tenant-modal');
    modal.classList.remove('hidden');

    setupTenantModalUX();
    setTenantSaveStatus('');

    currentTenantKey = key || tenantKey(displayName);

    const nameInput  = document.getElementById('tenant-name');
    const phoneInput = document.getElementById('tenant-phone');
    const emailInput = document.getElementById('tenant-email');

    nameInput.value = displayName || '';
    phoneInput.value = '';
    emailInput.value = '';
    const typeSel = document.getElementById('tenant-type');
    const tradeInput = document.getElementById('tenant-tradeLicense');
    const idInput = document.getElementById('tenant-idNumber');
    if(typeSel) typeSel.value = '';
    if(tradeInput) tradeInput.value = '';
    if(idInput) idInput.value = '';


    const c = tenantsContacts[currentTenantKey];
    if(c){
      phoneInput.value = c.phone || '';
      emailInput.value = c.email || '';
      if(typeSel) typeSel.value = c.tenantType || '';
      if(tradeInput) tradeInput.value = c.tradeLicenseNo || '';
      if(idInput) idInput.value = c.idNumber || '';
      // keep stored preferred name if present
      if(c.name && !displayName) nameInput.value = c.name;
    }
    applyTenantTypeUI('tenant');
  }

  function closeTenantModal(){
    // finalize any pending autosave
    clearTimeout(tenantAutosaveTimer);
    persistTenantContact({silent:true});
    renderTenants();

    currentTenantKey = null;
    document.getElementById('tenant-modal').classList.add('hidden');
    setTenantSaveStatus('');
  }

  document.getElementById('tenant-form').addEventListener('submit', function(e){
    e.preventDefault();
    // حفظ فوري
    persistTenantContact({silent:true});
    closeTenantModal();
  });

