// ================================================
// 04_properties.js - Properties + Units
// Auto-split from legacy app.js for maintainability.
// DO NOT edit the legacy file directly; edit split modules.
// ================================================

  // ================= PROPERTIES =================
  function renderProperties(){
    const container = document.getElementById('properties-container');
    container.innerHTML = '';
    const search = (document.getElementById('prop-search').value||'').toLowerCase().trim();

    const propSortBy = (document.getElementById('prop-sort-by')?.value) || _lsGet('re_prop_sort_by','name');
    const propSortDir = (document.getElementById('prop-sort-dir')?.dataset?.dir) || _lsGet('re_prop_sort_dir','asc');
    const unitSortBy = (document.getElementById('unit-sort-by')?.value) || _lsGet('re_unit_sort_by','unitName');
    const unitSortDir = (document.getElementById('unit-sort-dir')?.dataset?.dir) || _lsGet('re_unit_sort_dir','asc');

    const unitStatusFilter = (document.getElementById('unit-status-filter')?.value) || _lsGet('re_unit_status_filter','');
    const unitEndFrom = (document.getElementById('unit-end-from')?.value) || _lsGet('re_unit_end_from','');
    const unitEndTo   = (document.getElementById('unit-end-to')?.value)   || _lsGet('re_unit_end_to','');

    const hasStatusFilter = !!unitStatusFilter;
    const hasEndFrom = !!unitEndFrom;
    const hasEndTo = !!unitEndTo;
    const hasQuery = (!!search) || hasStatusFilter || hasEndFrom || hasEndTo;
    const endFromNum = hasEndFrom ? _unitDateNum(unitEndFrom) : NaN;
    const endToNum   = hasEndTo   ? _unitDateNum(unitEndTo)   : NaN;

    let __totalUnits = 0;
    let __shownUnits = 0;
    let __countVacant = 0;
    let __countRented = 0;

    const props = _sortProperties(properties, propSortBy, propSortDir);

    props.forEach(p=>{
      __totalUnits += (p.units||[]).length;
      const filteredUnits = (p.units||[]).filter(u=>{
        const matchesSearch = (!search) ||
          (u.unitName||u.name||'').toLowerCase().includes(search) ||
          (u.id||'').toLowerCase().includes(search) ||
          (u.tenant||'').toLowerCase().includes(search) ||
          (u.contractNo||'').toLowerCase().includes(search);
        if(!matchesSearch) return false;

        if(hasStatusFilter){
          if((u.status||'') !== unitStatusFilter) return false;
        }
        if(hasEndFrom || hasEndTo){
          const eNum = _unitDateNum(u.end);
          if(!Number.isFinite(eNum)) return false;
          if(hasEndFrom && Number.isFinite(endFromNum) && eNum < endFromNum) return false;
          if(hasEndTo && Number.isFinite(endToNum) && eNum > endToNum) return false;
        }
        return true;
      });
      if(hasQuery && filteredUnits.length === 0) return;

      const unitsToRender = hasQuery ? filteredUnits : (p.units||[]);
      const unitsSorted = _sortUnits(unitsToRender, unitSortBy, unitSortDir);
      __shownUnits += unitsSorted.length;
      unitsSorted.forEach(__u=>{
        const __st = (__u.status || 'شاغرة');
        if(__st === 'مؤجرة') __countRented++;
        else __countVacant++;
      });
const contentId = `units-content-${p.id}`;
      const iconId = `icon-${p.id}`;

      const rowsHTML = unitsSorted.map(u=>{
                const st = (u.status === 'مؤجرة') ? 'مؤجرة' : 'شاغرة';
        const statusMeta =
          st==='مؤجرة'
            ? { pill:'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200', dot:'bg-emerald-600 dark:bg-emerald-300' }
            : { pill:'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200', dot:'bg-amber-600 dark:bg-amber-300' };

return `
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <td class="px-4 py-3 font-bold text-gray-700 dark:text-gray-200">${u.id || ""}</td>
            <td class="px-4 py-3 text-gray-700 dark:text-gray-200">${escHtml(u.unitName || u.name || "")}</td>
            <td class="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
              <div class="flex flex-col leading-tight">
                <span class="font-mono">${u.elecMeterNo || '-'}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
              <div class="flex flex-col leading-tight">
                <span class="font-mono">${u.waterMeterNo || '-'}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 font-mono">${(u.taqaPropertyId||'')}</td>
            <td class="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">${escHtml(u.type||'-')}</td>
            <td class="px-4 py-3">
              <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold ${statusMeta.pill}"><span class="h-1.5 w-1.5 rounded-full ${statusMeta.dot}"></span>${st}</span>
            </td>
            <td class="px-4 py-3 text-sm max-w-[150px] truncate" title="${escHtml(u.tenant||'')}">${escHtml(u.tenant||'-')}</td>
            <td class="px-4 py-3 font-mono text-emerald-700 dark:text-emerald-400 font-bold text-sm">${u.rent ? u.rent.toLocaleString() : '-'}</td>
            <td class="px-4 py-3 text-xs font-mono truncate max-w-[90px] text-gray-500 dark:text-gray-400" title="${u.contractNo||''}">${u.contractNo||'-'}</td>
            <td class="px-4 py-3 text-[10px] text-gray-400">
              <div class="flex flex-col">
                <span>${u.start||'--'}</span>
                <span>${u.end||'--'}</span>
              </div>
            </td>
            <td class="px-4 py-3">
              <div class="flex gap-1">
                <button onclick="openUnitAttachmentsViewer(\'${p.id}\',\'${u.id}\')" class="btn-ui btn-ui-sm btn-icon btn-secondary" title="الملفات">📁</button>
                <button onclick="openUnitModal('${p.id}','${u.id}')" class="btn-ui btn-ui-sm btn-icon btn-secondary" title="تعديل">✏️</button>
                <button onclick="openLeaseModal('${p.id}','${u.id}')" class="btn-ui btn-ui-sm btn-icon btn-filter" title="إدارة العقد">📄</button>
                <button onclick="deleteUnit('${p.id}','${u.id}')" class="btn-ui btn-ui-sm btn-icon btn-danger" title="حذف">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      const card = document.createElement('div');
      card.className = "bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden transition-all duration-200 hover:shadow-md";

      card.innerHTML = `
        <div class="p-4 bg-gray-50 dark:bg-dark-surface border-b border-gray-100 dark:border-gray-700 flex items-center justify-between select-none" onclick="toggleUnitVisibility('${escJsStr(p.id)}')">
          <div class="flex items-center gap-3">
            <div id="${iconId}" class="transition-transform duration-300 transform rotate-0 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-lg font-bold text-gray-800 dark:text-white">${escHtml(p.name)}</h3>
                <span class="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] px-2 py-0.5 rounded-full font-mono">${p.id}</span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">📍 ${escHtml(p.location||'غير محدد')} | 🏢 ${(p.units||[]).length} وحدات</p>
            </div>
          </div>
          <div class="flex gap-2" onclick="event.stopPropagation()">
            <button onclick="openUnitModal('${escJsStr(p.id)}')" class="btn-ui btn-success">+ وحدة</button>
            <button onclick="openPropertyModal('${escJsStr(p.id)}')" class="btn-ui btn-secondary">تعديل</button>
            <button onclick="deleteProperty('${escJsStr(p.id)}')" class="btn-ui btn-danger">حذف</button>
          </div>
        </div>

        <div id="${contentId}" class="p-4 hidden">
          <div class="table-wrap">
            <table class="ui-table w-full text-right">
              <thead>
                <tr>
                  <th>رقم الوحدة</th><th>اسم الوحدة</th>
                  <th>عداد الكهرباء</th>
                  <th>عداد المياه</th>
                  <th>معرف العقار (طاقة)</th>
                  <th>النوع</th>
                  <th>الحالة</th>
                  <th>المستأجر</th>
                  <th>القيمة</th>
                  <th>العقد</th>
                  <th>التواريخ</th>
                  <th>تحكم</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHTML}
              </tbody>
            </table>
          </div>
        </div>
      `;

      container.appendChild(card);
    });

    
    const hintEl = document.getElementById('prop-filters-hint');
    if(hintEl){
      hintEl.textContent = hasQuery ? `النتائج: ${__shownUnits} من ${__totalUnits}` : `الوحدات: ${__totalUnits}`;
    }

    // Quick Stats update
    const statVacEl = document.getElementById('stat-vacant');
    const statRentEl = document.getElementById('stat-rented');
    const statShownEl = document.getElementById('stat-shown');
    const statTotalEl = document.getElementById('stat-total');
    const statShownBigEl = document.getElementById('stat-shown-big');

    if(statVacEl) statVacEl.textContent = String(__countVacant);
    if(statRentEl) statRentEl.textContent = String(__countRented);
if(statShownEl) statShownEl.textContent = String(__shownUnits);
    if(statTotalEl) statTotalEl.textContent = String(__totalUnits);
    if(statShownBigEl) statShownBigEl.textContent = String(__shownUnits);

  }

  function toggleUnitVisibility(propId) {
    const content = document.getElementById(`units-content-${propId}`);
    const icon = document.getElementById(`icon-${propId}`);
    if(!content || !icon) return;
    if (content.classList.contains('hidden')) {
      content.classList.remove('hidden');
      icon.classList.remove('-rotate-90');
      icon.classList.add('rotate-0');
    } else {
      content.classList.add('hidden');
      icon.classList.remove('rotate-0');
      icon.classList.add('-rotate-90');
    }
  }

  function expandAllProperties() {
    properties.forEach(p => {
      const content = document.getElementById(`units-content-${p.id}`);
      const icon = document.getElementById(`icon-${p.id}`);
      if(content && icon) {
        content.classList.remove('hidden');
        icon.classList.remove('-rotate-90');
        icon.classList.add('rotate-0');
      }
    });
  }

  function collapseAllProperties() {
    properties.forEach(p => {
      const content = document.getElementById(`units-content-${p.id}`);
      const icon = document.getElementById(`icon-${p.id}`);
      if(content && icon) {
        content.classList.add('hidden');
        icon.classList.remove('rotate-0');
        icon.classList.add('-rotate-90');
      }
    });
  }

  function deleteProperty(id){
    if(!confirm('هل أنت متأكد من حذف هذا العقار وجميع وحداته؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    const prop = properties.find(p=>p.id===id);
    properties = properties.filter(p => p.id !== id);
    saveToLocal();
    renderProperties();
    renderLeases();
    renderPayments();
    updateDashboard();
    logAction(`تم حذف العقار ${prop ? prop.name : id}`);
  }

  function deleteUnit(propId, unitId){
    if(!confirm('هل أنت متأكد من حذف هذه الوحدة؟ سيتم حذف عقدها ودفعاتها المرتبطة بها إن وُجدت.')) return;
    const prop = properties.find(p=>p.id===propId);
    if(!prop) return;
    const unit = prop.units.find(u=>u.id===unitId);
    if(!unit) return;

    // حذف الدفعات المرتبطة بالعقد/الوحدة
    payments = payments.filter(p => !(p.unit === unit.name && p.contract === unit.contractNo));
    prop.units = prop.units.filter(u=>u.id!==unitId);

    saveToLocal();
    renderProperties();
    renderLeases();
    renderPayments();
    updateDashboard();
    logAction(`تم حذف الوحدة ${escHtml(unit.name)} من العقار ${escHtml(prop.name)}`);
  }

