// ================================================
// 07_payments.js - Payments
// Auto-split from legacy app.js for maintainability.
// DO NOT edit the legacy file directly; edit split modules.
// ================================================

  // ================= PAYMENTS =================
  // When completing a scheduled payment, we reuse the Payment modal.
  // The scheduled record will be UPDATED (not duplicated).
  window.__completeScheduledPaymentId = '';
  window.__completeScheduledPaymentDue = 0;

  function openPaymentModal(prefill){
    const m = document.getElementById('payment-modal');
    m.classList.remove('hidden');
    m.style.display = '';
    const sel = document.getElementById('pay-contract');
    sel.innerHTML='';
    properties.forEach(p=>p.units.forEach(u=>{
      if(u.status==='مؤجرة'){
        const opt = document.createElement('option');
        opt.value = JSON.stringify({t:u.tenant, u:u.name, c:u.contractNo, rent:u.rent});
        opt.textContent = `${escHtml(u.tenant)} - (${escHtml(u.name)})`;
        sel.appendChild(opt);
      }
    }));

    // Prefill (used for scheduled payments)
    try{
      if(prefill && prefill.scheduledId){
        window.__completeScheduledPaymentId = String(prefill.scheduledId);
        window.__completeScheduledPaymentDue = Number(prefill.due||0);
      } else {
        window.__completeScheduledPaymentId = '';
        window.__completeScheduledPaymentDue = 0;
      }

      // Try to select matching contract/unit/tenant
      if(prefill && (prefill.contract || prefill.unit || prefill.tenant)){
        const targetC = String(prefill.contract||'');
        const targetU = String(prefill.unit||'');
        const targetT = String(prefill.tenant||'');
        const options = Array.from(sel.options||[]);
        const match = options.find(op=>{
          try{
            const d = JSON.parse(op.value);
            return (String(d.c||'')===targetC) && (String(d.u||'')===targetU) && (String(d.t||'')===targetT);
          }catch(e){ return false; }
        }) || options.find(op=>{
          try{
            const d = JSON.parse(op.value);
            return (String(d.c||'')===targetC) && (String(d.u||'')===targetU);
          }catch(e){ return false; }
        }) || null;
        if(match) sel.value = match.value;
      }

      if(document.getElementById('pay-date')) document.getElementById('pay-date').value = (prefill?.date || '');
      if(document.getElementById('pay-amount')) document.getElementById('pay-amount').value = (prefill?.amount ?? '');
      if(document.getElementById('pay-type') && prefill?.type) document.getElementById('pay-type').value = prefill.type;
      if(document.getElementById('pay-desc') && prefill?.desc) document.getElementById('pay-desc').value = prefill.desc;
    }catch(e){}
  }

  function closePaymentModal(){
    document.getElementById('payment-modal').classList.add('hidden');
  }

  document.getElementById('payment-form').addEventListener('submit', e=>{
    e.preventDefault();
    const data = JSON.parse(document.getElementById('pay-contract').value);
    const amt = parseMoney(document.getElementById('pay-amount').value);

      const _payDate = (document.getElementById('pay-date').value || '').trim();
      if(!_payDate){ uiToast('error','الرجاء اختيار تاريخ الدفعة.'); return; }
      if(amt <= 0){ uiToast('error','الرجاء إدخال مبلغ صحيح.'); return; }

    const typeVal = document.getElementById('pay-type').value;
    const descVal = normalizeText(document.getElementById('pay-desc').value);

    // Completing scheduled payment? Update the existing record instead of creating a duplicate.
    const scheduledId = (window.__completeScheduledPaymentId || '').trim();
    if(scheduledId){
      const idx = (payments||[]).findIndex(p=>String(p.id)===String(scheduledId));
      const voucherNo = nextVoucherNumber('receipt');
      const payload = {
        date: _payDate,
        tenant: data.t,
        unit: data.u,
        contract: data.c,
        due: (window.__completeScheduledPaymentDue > 0 ? window.__completeScheduledPaymentDue : data.rent),
        type: typeVal,
        amount: amt,
        desc: descVal,
        voucherNo,
        isPlanned: false,
        status: ''
      };
      if(idx >= 0){
        payments[idx] = Object.assign({}, payments[idx], payload);
      } else {
        payments.push(Object.assign({ id: 'PAY-'+Date.now() }, payload));
      }
      window.__completeScheduledPaymentId = '';
      window.__completeScheduledPaymentDue = 0;
    } else {
      const payObj = {
        id: 'PAY-'+Date.now(),
        date: _payDate,
        tenant: data.t,
        unit: data.u,
        contract: data.c,
        due: data.rent,
        type: typeVal,
        amount: amt,
        desc: descVal,
        voucherNo: nextVoucherNumber('receipt')
      };
      payments.push(payObj);
    }
    saveToLocal();
    closePaymentModal();
    renderPayments();
    updateDashboard();
    renderReceiptsHistory();
    logAction(`دفعة ${amt} من ${data.t}`);
  });

  function completeScheduledPayment(paymentId){
    const p = (payments||[]).find(x=>x.id===paymentId);
    if(!p){ uiToast('error','لا يمكن العثور على الدفعة'); return; }

    // If this is a multi-unit group, use the Lease payment modal (distribution)
    try{
      const g = p.groupKey ? getLeaseGroupByKey(p.groupKey) : null;
      if(g && (g.units||[]).length > 1){
        completeScheduledLeasePayment(paymentId);
        return;
      }
    }catch(e){}

    openPaymentModal({
      scheduledId: paymentId,
      tenant: p.tenant,
      unit: p.unit,
      contract: p.contract,
      amount: (p.due || 0),
      due: (p.due || 0),
      date: (p.dueDate || p.date || new Date().toISOString().slice(0,10)),
      type: (p.type || 'تحويل'),
      desc: (p.desc || '')
    });
  }

  function renderPayments(){
    const tbody = document.getElementById('payments-table-body');
    tbody.innerHTML='';
    const frag = document.createDocumentFragment();
const list = (payments||[]).slice().sort((a,b)=> new Date(b.date)-new Date(a.date));

const pg = paginateList(list, 'payments', 25);


pg.items.forEach(p=>{
      const isPending = !!(p && (p.isPlanned || (String(p.status||'').includes('بانتظار')) || (p.amount===0 && p.voucherNo==='' && p.source==='schedule')));
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-sm">
          <div>${escHtml(isPending ? (p.dueDate || p.date || '') : (p.date || ''))}</div>
          ${isPending ? '<div class="text-xs text-gray-500 dark:text-gray-400">استحقاق</div>' : ''}
        </td>
        <td>
          <div class="font-bold text-sm">${escHtml(p.tenant)}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">${escHtml(p.unit)}</div>
        </td>
        <td><span class="badge ${isPending ? 'badge-amber' : 'badge-blue'}">${escHtml(isPending ? 'مجدولة' : (p.type||''))}</span></td>
        <td class="font-bold text-emerald-700 dark:text-emerald-400 font-mono">
          ${formatAED(p.amount||0)}
          ${isPending ? `<div class="text-xs text-gray-500 dark:text-gray-400">مستحق: <span class="font-mono">${formatAED(p.due||0)}</span></div>` : ''}
        </td>
        <td class="text-xs text-gray-500 dark:text-gray-400 font-mono">${formatAED(p.due)} / <span class="text-rose-500 dark:text-rose-400">${formatAED(p.due-p.amount)}</span></td>
        <td>${isPending ? '<span class="badge badge-amber">بانتظار الدفع</span>' : (p.amount>=p.due ? '<span class="badge badge-green">مكتمل</span>' : '<span class="badge badge-amber">جزئي</span>')}</td>
        <td>${isPending ? `<button onclick="completeScheduledPayment('${escJsStr(p.id)}')" class="btn-ui btn-ui-sm btn-primary">تسجيل</button>` : `<button onclick="previewReceipt('${escJsStr(p.id)}', 'payment')" class="btn-ui btn-ui-sm btn-secondary">عرض السند</button>`}</td>
      `;
      frag.appendChild(tr);
    });
    const total = payments.reduce((s,p)=>s+p.amount,0);
    document.getElementById('payments-total').textContent = formatAED(total);
  
  tbody.appendChild(frag);
  renderPagerUI('payments', document.getElementById('payments-pager'), pg);
}

