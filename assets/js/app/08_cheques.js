// ================================================
// 08_cheques.js - Cheques
// Auto-split from legacy app.js for maintainability.
// DO NOT edit the legacy file directly; edit split modules.
// ================================================

  // ================= CHEQUES =================
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  function toggleTenantInput() {
    const selectEl = document.getElementById('cheque-tenant-select');
    const manualEl = document.getElementById('cheque-tenant-manual');
    const unitSel  = document.getElementById('cheque-unit-select');

    const selected = selectEl ? selectEl.value : '';
    if (selected === 'other') {
      manualEl.classList.remove('hidden');
      manualEl.setAttribute('required', 'required');
      if(unitSel){
        unitSel.innerHTML = '<option value="">— بدون ربط وحدة —</option>';
        unitSel.disabled = true;
      }
    } else {
      manualEl.classList.add('hidden');
      manualEl.removeAttribute('required');
      const tenantName = selected;
      if(unitSel){
        unitSel.innerHTML = '<option value="">— بدون ربط وحدة —</option>';
        const units = getTenantLeasedUnitsDetailed(tenantName);
        units.forEach(x=>{
          const opt = document.createElement('option');
          opt.value = x.unitId;
          opt.textContent = x.label;
          unitSel.appendChild(opt);
        });
        unitSel.disabled = units.length === 0;
      }
    }
  }

  
  function openChequeModal(chequeId=''){
    const modal = document.getElementById('cheque-modal');
    const form  = document.getElementById('new-cheque-form');
    const title = document.getElementById('cheque-modal-title');
    const saveBtn = document.getElementById('cheque-modal-save-btn');
    if(!modal || !form) return;

    modal.classList.remove('hidden');
    form.reset();

    // Populate tenant select
    const selectEl = document.getElementById('cheque-tenant-select');
    selectEl.innerHTML = '<option value="">اختر مستأجر حالي...</option>';
    getTenantNames().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      selectEl.appendChild(opt);
    });
    selectEl.innerHTML += '<option value="other">-- مستأجر جديد / آخر --</option>';

    // Default (Add)
    editingChequeId = null;
    if(title) title.textContent = 'تسجيل شيك جديد';
    if(saveBtn) saveBtn.textContent = 'حفظ الشيك';

    // If edit
    if(chequeId){
      const raw = (cheques||[]).find(c=>c.id===chequeId);
      const ch = raw ? normalizeChequeRecord(raw) : null;
      if(ch){
        editingChequeId = chequeId;
        if(title) title.textContent = 'تعديل شيك';
        if(saveBtn) saveBtn.textContent = 'حفظ التعديل';

        // Tenant selection
        const inList = getTenantNames().some(n => tenantKey(n) === tenantKey(ch.tenant));
        if(inList){
          selectEl.value = getTenantNames().find(n => tenantKey(n) === tenantKey(ch.tenant)) || '';
        } else {
          selectEl.value = 'other';
          document.getElementById('cheque-tenant-manual').value = ch.tenant || '';
        }

        // Populate unit list for selected tenant
        toggleTenantInput();

        // Set unit if available
        const unitSel = document.getElementById('cheque-unit-select');
        if(unitSel){
          unitSel.value = ch.unitId || '';
        }

        // Fill fields
        document.getElementById('cheque-number').value = ch.chequeNo || '';
        document.getElementById('cheque-value').value = (ch.value ?? '') === null ? '' : (ch.value ?? '');
        document.getElementById('cheque-due-date').value = ch.dueDate || '';
        document.getElementById('cheque-bank').value = ch.bank || '';
        document.getElementById('cheque-purpose').value = ch.purpose || '';
      } else {
        toggleTenantInput();
      }
    } else {
      toggleTenantInput();
    }
  }
function closeChequeModal(){
    const modal = document.getElementById('cheque-modal');
    if(modal) modal.classList.add('hidden');
    editingChequeId = null;
    pendingChequeAfterEditId = null;
    pendingChequeAfterEditStatus = '';
    const title = document.getElementById('cheque-modal-title');
    const saveBtn = document.getElementById('cheque-modal-save-btn');
    if(title) title.textContent = 'تسجيل شيك جديد';
    if(saveBtn) saveBtn.textContent = 'حفظ الشيك';
  }

  document.getElementById('new-cheque-form').addEventListener('submit', async e=>{
    e.preventDefault();

    const tenantSelect = document.getElementById('cheque-tenant-select').value;
    const tenantManual = document.getElementById('cheque-tenant-manual').value;
    const tenantName = normalizeText(normalizeDigits(tenantSelect === 'other' ? tenantManual : tenantSelect));

    const unitId = (document.getElementById('cheque-unit-select') ? document.getElementById('cheque-unit-select').value : '') || '';

    if (!tenantName) {
      uiToast('info', "الرجاء تحديد أو إدخال اسم المستأجر.");
      return;
    }
const newImageFile = document.getElementById('cheque-image').files[0];
    const newImageUrl = await fileToBase64(newImageFile);

    const payload = {
      tenant: tenantName,
      unitId: unitId,
      chequeNo: normalizeText(normalizeDigits(document.getElementById('cheque-number').value), {collapseSpaces:false}),
      value: parseMoney(document.getElementById('cheque-value').value),
      dueDate: (document.getElementById('cheque-due-date').value||'').trim(),
      bank: normalizeText(document.getElementById('cheque-bank').value),
      purpose: normalizeText(document.getElementById('cheque-purpose').value),
    };
      if(!payload.tenant){
        uiToast('error','الرجاء إدخال اسم المستأجر.');
        return;
      }
      if(!payload.dueDate){
        uiToast('error','الرجاء اختيار تاريخ استحقاق الشيك.');
        return;
      }
      if(!payload.value || payload.value <= 0){
        uiToast('error','الرجاء إدخال قيمة شيك صحيحة.');
        return;
      }



    if(editingChequeId){
      const i = cheques.findIndex(c=>c.id===editingChequeId);
      if(i !== -1){
        const old = normalizeChequeRecord(cheques[i]);
        cheques[i] = {
          ...cheques[i],
          ...payload,
          status: old.status || cheques[i].status || 'بانتظار الصرف',
          imageUrl: newImageUrl || old.imageUrl || cheques[i].imageUrl || ''
        };
      }
    } else {
      cheques.push({
        id: 'CHQ-'+Date.now(),
        ...payload,
        status: 'بانتظار الصرف',
        imageUrl: newImageUrl
      });
    }

    saveToLocal();
    
    // If this edit was triggered to complete a status change (مثل: صرف الشيك)، نفّذها الآن بعد حفظ ربط الوحدة
    if(editingChequeId && pendingChequeAfterEditId === editingChequeId && pendingChequeAfterEditStatus){
      const updated = (cheques||[]).find(c=>c.id===editingChequeId);
      const info = updated ? resolveChequeUnitInfo(updated) : null;
      if(info && info.unitId){
        const st = pendingChequeAfterEditStatus;
        pendingChequeAfterEditId = null;
        pendingChequeAfterEditStatus = '';
        // Apply status change with the now-known unit
        setTimeout(()=>changeChequeStatus(editingChequeId, st, info.unitId), 0);
      }
    }
closeChequeModal();
    renderCheques();
    logAction(`تم تسجيل شيك جديد للمستأجر: ${tenantName}`);
  });

  
  // ======= Cheque ↔ Unit linking (for accurate notices/reports) =======
  let pendingChequeLinkId = null;
  let pendingChequeLinkNextStatus = '';

  function openChequeLinkModal(chequeId, nextStatus=''){
    pendingChequeLinkId = chequeId;
    pendingChequeLinkNextStatus = nextStatus || '';
    const modal = document.getElementById('cheque-link-modal');
    const infoEl = document.getElementById('cheque-link-info');
    const sel = document.getElementById('cheque-link-unit-select');

    const raw = (cheques||[]).find(c=>c.id===chequeId);
    const ch = raw ? normalizeChequeRecord(raw) : null;
    if(!modal || !infoEl || !sel || !ch) return;

    const units = getTenantLeasedUnitsDetailed(ch.tenant);
    sel.innerHTML = '';
    if(units.length === 0){
      sel.innerHTML = '<option value="">— لا توجد وحدات مؤجرة لهذا المستأجر —</option>';
      sel.disabled = true;
    } else {
      sel.disabled = false;
      const opts = ['<option value="">— اختر الوحدة —</option>']
        .concat(units.map(u=>`<option value="${u.unitId}">${u.label}</option>`));
      sel.innerHTML = opts.join('');
      // preselect
      if(ch.unitId){
        sel.value = ch.unitId;
      } else if(units.length === 1){
        sel.value = units[0].unitId;
      }
    }

    infoEl.textContent = `المستأجر: ${escHtml(ch.tenant)} — الشيك: #${ch.chequeNo||'—'} — القيمة: ${formatAED(ch.value||0)}`;
    modal.classList.remove('hidden');
  }

  function closeChequeLinkModal(){
    const modal = document.getElementById('cheque-link-modal');
    if(modal) modal.classList.add('hidden');
    pendingChequeLinkId = null;
    pendingChequeLinkNextStatus = '';
  }

  function confirmChequeLink(){
    const chequeId = pendingChequeLinkId;
    const nextStatus = pendingChequeLinkNextStatus;
    const sel = document.getElementById('cheque-link-unit-select');
    const unitId = sel ? (sel.value || '') : '';
    if(!chequeId) { closeChequeLinkModal(); return; }

    if(nextStatus === 'مصروف' && !unitId){
      uiToast('success', 'الرجاء اختيار الوحدة قبل صرف الشيك حتى يتم تسجيله ضمن الدفعات الخاصة بالوحدة.');
      return;
    }

    const idx = cheques.findIndex(c=>c.id===chequeId);
    if(idx >= 0){
      const hit = findUnitById(unitId);
      const label = hit ? `${hit.unit.name} - ${hit.property.name}` : '';
      cheques[idx] = { ...cheques[idx], unitId: unitId, unitLabel: label };
      migrateChequePaymentsToUnit(chequeId);
      saveToLocal();
      renderCheques();
      renderPayments();
      updateDashboard();
      renderReceiptsHistory();
    }

    closeChequeLinkModal();

    if(nextStatus){
      changeChequeStatus(chequeId, nextStatus, unitId);
    }
  }


function changeChequeStatus(id, newStatus, unitIdOverride='') {
    const chequeIndex = cheques.findIndex(c => c.id === id);
    if (chequeIndex === -1) return;

    const cheque = cheques[chequeIndex];

    if(unitIdOverride){
      cheque.unitId = unitIdOverride;
    }

    // If cashing the cheque, we must know which unit it belongs to (to record payment correctly)
    if (newStatus === 'مصروف') {
      const info = resolveChequeUnitInfo(cheque);
      if(!info.unitId){
        // Ask user to link the cheque first
        pendingChequeAfterEditId = id; pendingChequeAfterEditStatus = 'مصروف'; uiToast('success', 'يرجى تحديد الوحدة للشيك ثم حفظ التعديل ليتم صرفه وتسجيله كدفعة تلقائياً.'); openChequeModal(id);
        return;
      }

      cheque.unitId = info.unitId;
      cheque.unitLabel = info.unitLabel || cheque.unitLabel || '';

      const paymentExists = payments.some(p => p.chequeId === id);

      if (!paymentExists) {
        payments.push({
          id: 'PAY-CHQ-'+Date.now(),
          chequeId: id,
          date: new Date().toISOString().substring(0, 10),
          tenant: cheque.tenant,
          unit: info.unitLabel || 'شيك مصرف',
          unitId: info.unitId,
          contract: info.contractNo || cheque.chequeNo,
          due: cheque.value,
          type: 'شيك مصرف',
          amount: cheque.value,
          desc: cheque.purpose || `تحصيل الشيك رقم ${cheque.chequeNo} (${info.unitLabel||''}) من ${escHtml(cheque.tenant)}`,
          voucherNo: nextVoucherNumber('receipt')
        });
        logAction(`تم صرف الشيك رقم ${cheque.chequeNo} وتم تسجيله كدفعة مقبوضة للوحدة: ${info.unitLabel||info.unitId}.`);
      } else {
        // Ensure existing payment record is linked to the unit (older versions)
        migrateChequePaymentsToUnit(id);
      }

      cheque.status = newStatus;
    } else {
      // If status was changed away from "مصروف", remove the linked payment (to avoid double counting)
      cheque.status = newStatus;
      payments = payments.filter(p => p.chequeId !== id);
    }

    saveToLocal();
    renderCheques();
    updateDashboard();
    renderPayments();
    renderReceiptsHistory();
  }


  function viewChequeImage(imageUrl) {
    if (!imageUrl) return;
    const w = window.open('', '_blank');
    w.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head><title>صورة الشيك</title>
      <style>
        body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#111;}
        img{max-width:90vw;max-height:90vh;border:10px solid white;box-shadow:0 0 20px rgba(0,0,0,0.5);}
      </style>
      </head>
      <body><img src="${imageUrl}" alt="صورة الشيك">
  <!-- Toasts -->
  <div id="toast-stack" dir="rtl"
       class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-[min(420px,calc(100vw-2rem))] pointer-events-none">
  </div>

</body>
      </html>
    `);
    w.document.close();
  }

  function renderCheques(){
    _chequesRestoreUIOnce();
    const tbody = document.getElementById('cheques-table-body');
    if(!tbody) return;
    tbody.innerHTML='';
    const frag = document.createDocumentFragment();
const st = _chequesState();
    const filtered = _chequesApply(cheques.slice(), st);
    const finalList = _sortCheques(filtered, st.sortBy, st.sortDir);

    const hint = document.getElementById('cheques-filter-hint');
    if(hint){
      const total = cheques.length;
      const shown = finalList.length;
      hint.textContent = (shown===total) ? `النتائج: ${shown}` : `النتائج: ${shown} من ${total}`;
    }

    const pg = paginateList(finalList, 'cheques', 25);



    pg.items.forEach(c=>{
      let statusClass = 'badge-amber';
      if (c.status === 'مصروف') statusClass = 'badge-green';
      else if (c.status === 'راجع') statusClass = 'badge-red';

      const statusOptions = ['بانتظار الصرف', 'مصروف', 'راجع'];
      const selectOptions = statusOptions.map(s =>
        `<option value="${s}" ${c.status === s ? 'selected' : ''}>${s}</option>`
      ).join('');

      const tr = document.createElement('tr');
      tr.innerHTML=`
        <td><span class="badge ${statusClass}">${escHtml(c.status)}</span></td>
        <td class="font-mono">${escHtml(c.dueDate)}</td>
        <td>${escHtml(c.tenant)}</td>
        <td class="text-xs text-gray-600 dark:text-gray-300">${escHtml(getUnitDisplayById(c.unitId) || '-') }</td>
        <td class="font-bold">${formatAED(c.value)}</td>
        <td class="text-xs text-gray-500 dark:text-gray-400">${escHtml(c.bank)} - #${escHtml(c.chequeNo)}</td>
        <td>
          ${c.imageUrl ? `<button onclick="viewChequeImage('${escJsStr(c.imageUrl)}')" class="btn-ui btn-ui-sm btn-secondary">عرض الصورة</button>` : '-'}
        </td>
        <td>
          <select onchange="changeChequeStatus('${escHtml(c.id)}', this.value)" class="text-sm border p-1 rounded bg-white dark:bg-gray-800 dark:text-white">
            ${selectOptions}
          </select>
          <button type="button" onclick="openChequeModal('${escJsStr(c.id)}')" class="btn-ui btn-ui-sm btn-secondary" title="تعديل الشيك">✏️ تعديل</button>
          <button onclick="deleteCheque('${escJsStr(c.id)}')" class="btn-ui btn-ui-sm btn-icon btn-danger" title="حذف">🗑️</button>
        </td>
      `;
      frag.appendChild(tr);
    });
  
  tbody.appendChild(frag);
      renderPagerUI('cheques', document.getElementById('cheques-pager'), pg);
}

  function deleteCheque(id){
    if(!confirm('هل أنت متأكد من حذف هذا الشيك؟ سيتم حذفه من سجل الدفعات إذا كان مصروفاً.')) return;
    cheques = cheques.filter(c => c.id !== id);
    payments = payments.filter(p => p.chequeId !== id);
    saveToLocal();
    renderCheques();
    renderPayments();
    updateDashboard();
    renderReceiptsHistory();
    logAction(`تم حذف الشيك ${id}`);
  }

