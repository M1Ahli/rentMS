// ================================================
// 12_reports.js - Reports
// Auto-split from legacy app.js for maintainability.
// DO NOT edit the legacy file directly; edit split modules.
// ================================================

  // ================= REPORTS =================
  
function ensureReportPeriodControls(){
  const monthSel = document.getElementById('report-month');
  const yearSel  = document.getElementById('report-year');

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear  = now.getFullYear();

  // Months (Arabic labels)
  if(monthSel && monthSel.options.length === 0){
    const months = [
      'يناير','فبراير','مارس','أبريل','مايو','يونيو',
      'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
    ];
    months.forEach((name, idx)=>{
      const opt = document.createElement('option');
      opt.value = String(idx+1);
      opt.textContent = name;
      monthSel.appendChild(opt);
    });
    monthSel.value = String(currentMonth);
  }

  // Years (current-5 .. current+1)
  if(yearSel && yearSel.options.length === 0){
    for(let y = currentYear-5; y <= currentYear+1; y++){
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      yearSel.appendChild(opt);
    }
    yearSel.value = String(currentYear);
  }
}

function getReportPeriod(){
  ensureReportPeriodControls();
  const monthSel = document.getElementById('report-month');
  const yearSel  = document.getElementById('report-year');
  const now = new Date();
  const m = monthSel ? parseInt(monthSel.value||String(now.getMonth()+1),10) : (now.getMonth()+1);
  const y = yearSel  ? parseInt(yearSel.value||String(now.getFullYear()),10) : now.getFullYear();

  const start = new Date(y, m-1, 1);
  const end   = new Date(y, m, 1);

  const months = [
    'يناير','فبراير','مارس','أبريل','مايو','يونيو',
    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
  ];
  const label = `${months[m-1]} ${y}`;
  return { start, end, label };
}


// ===== Half-Year Owners Distribution Report (Mar/Sep) =====
function ensureHalfYearControls(){
  const yearSel = document.getElementById('hy-year');
  const cycleSel = document.getElementById('hy-cycle');
  if(!yearSel || !cycleSel) return;

  const now = new Date();
  const currentYear = now.getFullYear();

  if(yearSel.options.length === 0){
    for(let y=currentYear-5; y<=currentYear+1; y++){
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      yearSel.appendChild(opt);
    }
    yearSel.value = String(currentYear);
  }
  if(!cycleSel.value) cycleSel.value = 'mar';
}


function getHalfYearPeriod(){
  ensureHalfYearControls();
  const cycle = (document.getElementById('hy-cycle')?.value) || 'mar';
  const y = parseInt((document.getElementById('hy-year')?.value) || String(new Date().getFullYear()), 10);

  // الدورة الأولى: 1 مارس -> 31 أغسطس (نهاية = 1 سبتمبر)
  // الدورة الثانية: 1 سبتمبر -> 28/29 فبراير (نهاية = 1 مارس من السنة التالية)
  let start, end, label;
  if(cycle === 'mar'){
    start = new Date(y, 2, 1);   // Mar 1 (month=2)
    end   = new Date(y, 8, 1);   // Sep 1 (month=8)
    label = `من 01/03/${y} حتى 31/08/${y}`;
  }else{
    start = new Date(y, 8, 1);   // Sep 1 (month=8)
    end   = new Date(y+1, 2, 1); // Mar 1 next year (month=2)
    label = `من 01/09/${y} حتى 28/02/${y+1}`; // 28/29 handled by end boundary
  }
  return { start, end, label, cycle, year: y };
}


function overlapDays(aStartMs, aEndMs, bStartMs, bEndMs){
  const s = Math.max(aStartMs, bStartMs);
  const e = Math.min(aEndMs, bEndMs);
  if(!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.ceil((e - s) / (24*60*60*1000));
}

function renderHalfYearOwnersReport(){
  // Ensure data loaded
  ensureHalfYearControls();
  const period = getHalfYearPeriod();
  const startMs = period.start.getTime();
  const endMs   = period.end.getTime();

  // ضبط عرض نهاية فبراير (28/29) وفق السنة
  if(period.cycle === 'sep'){
    const lastFeb = new Date(period.year+1, 2, 0); // آخر يوم في فبراير
    period.label = `من 01/09/${period.year} حتى ${String(lastFeb.getDate()).padStart(2,'0')}/02/${period.year+1}`;
  }

  const labelEl = document.getElementById('hy-period-label');
  if(labelEl) labelEl.textContent = period.label;

  // Payments collected during period
  let collected = 0, collectedCount = 0;
  
  // Payments collected in the selected half-year period
  // Note: For multi-unit leases, we also track per-unit allocations to avoid counting the full payment on each unit.
  const payByContract = {};
  const payByContractUnit = {};
  const contractUnitCount = {};
  try{
    properties.forEach(p=>p.units.forEach(u=>{
      const c = (u?.contractNo || '').trim();
      if(c) contractUnitCount[c] = (contractUnitCount[c]||0) + 1;
    }));
  }catch(e){}

  (payments||[]).forEach(p=>{
    const d = _leaseDateLocalNum(p?.date);
    if(Number.isFinite(d) && d >= startMs && d < endMs){
      const amt = Number(p?.amount||0) || 0;
      collected += amt;
      collectedCount++;

      const c = (p?.contract || '').trim();
      if(c){
        payByContract[c] = (payByContract[c]||0) + amt;

        // Per-unit tracking:
        // 1) If this is a multi-unit lease payment mirrored into payments, use leaseAllocations.
        if(p?.source === 'lease' && p?.leasePayId){
          const pid = String(p.leasePayId);
          (leaseAllocations||[]).filter(a=>String(a?.paymentId||'')===pid).forEach(a=>{
            const un = (a?.unitName || '').trim();
            const aamt = Number(a?.amount||0) || 0;
            if(!un || !aamt) return;
            if(!payByContractUnit[c]) payByContractUnit[c] = {};
            payByContractUnit[c][un] = (payByContractUnit[c][un]||0) + aamt;
          });
        } else {
          // 2) Regular payments that already specify a single unit
          const un = (p?.unit || '').toString().trim();
          if(un && !un.startsWith('متعدد')){
            if(!payByContractUnit[c]) payByContractUnit[c] = {};
            payByContractUnit[c][un] = (payByContractUnit[c][un]||0) + amt;
          }
        }
      }
    }
  });

const contractRows = [];
  let contractsDueTotal = 0;
  let contractsRecTotal = 0;
  let contractsArrTotal = 0;

// Due rent (pro-rata by overlap days using annual rent)
  let dueTotal = 0;
  let rentedInPeriod = 0, vacantInPeriod = 0;

  const unitsRows = [];
  properties.forEach(pr=>pr.units.forEach(u=>{
    const hasContractDates = u?.start && u?.end;
    const cStart = _leaseDateLocalNum(u?.start);
    const cEnd   = _leaseDateLocalNum(u?.end);
    const overlaps = hasContractDates && Number.isFinite(cStart) && Number.isFinite(cEnd) && (cEnd >= startMs) && (cStart < endMs);
    const statusInPeriod = overlaps ? 'مؤجرة خلال الفترة' : 'شاغرة خلال الفترة';

    if(overlaps) rentedInPeriod++;
    else vacantInPeriod++;

    let due = 0;
    if(overlaps){
      const days = overlapDays(cStart, cEnd + (24*60*60*1000), startMs, endMs); // include end day
      const annual = Number(u?.rent||0) || 0;
      // إذا rent سنوي: pro-rata أيام/365
      due = (annual/365) * days;
      dueTotal += due;
    }

    const contractNo = (u?.contractNo || '').trim();
    let received = 0;
    if(contractNo){
      const uname = (u?.name || '').trim();
      const pu = payByContractUnit?.[contractNo]?.[uname];
      if(typeof pu === 'number') received = pu;
      else {
        const totalC = (payByContract[contractNo]||0);
        const cnt = (contractUnitCount[contractNo]||1);
        received = cnt>1 ? (totalC/cnt) : totalC;
      }
    }
    const diff = due - received;

    // سطر تفصيل العقد ضمن الفترة (إذا يوجد تداخل)
    if(overlaps && contractNo){
      // (تمت إزالة آخر دفعة من الجدول)
      let lastPay = '';
const arr = Math.max(0, diff);
      contractsDueTotal += due;
      contractsRecTotal += received;
      contractsArrTotal += arr;

      contractRows.push({
        contractNo,
        unitName: u?.name || '-',
        tenantName: u?.tenantName || (u?.tenant || '-') || '-',
        start: u?.start || '',
        end: u?.end || '',
        due, received, arrears: arr,
        lastPay
      });
    }

    unitsRows.push({
      name: u?.name || '-',
      status: statusInPeriod,
      due, received, diff
    });
  }));

  // Expenses by type within period
  const expAgg = {};
  let expTotal = 0;
  (expenses||[]).forEach(ex=>{
    const d = _leaseDateLocalNum(ex?.date);
    if(Number.isFinite(d) && d >= startMs && d < endMs){
      const t = (ex?.type || 'أخرى').trim() || 'أخرى';
      const amt = Number(ex?.amount||0) || 0;
      expTotal += amt;
      if(!expAgg[t]) expAgg[t] = { total:0, count:0 };
      expAgg[t].total += amt;
      expAgg[t].count++;
    }
  });

  const arrears = Math.max(0, dueTotal - collected);
  const net = collected - expTotal;

  // Fill KPI fields
  const elCollected = document.getElementById('hy-collected');
  if(elCollected) elCollected.textContent = formatAED(collected);
  const elCollectedCount = document.getElementById('hy-collected-count');
  if(elCollectedCount) elCollectedCount.textContent = String(collectedCount);

  const elDue = document.getElementById('hy-due');
  if(elDue) elDue.textContent = formatAED(dueTotal);

  const elArrears = document.getElementById('hy-arrears');
  if(elArrears) elArrears.textContent = formatAED(arrears);

  const elNet = document.getElementById('hy-net');
  if(elNet) elNet.textContent = formatAED(net);

  // A4 summary header values
  const a4Period = document.getElementById('hy-a4-period');
  if(a4Period) a4Period.textContent = period.label;
  const a4Issued = document.getElementById('hy-a4-issued');
  if(a4Issued) a4Issued.textContent = new Date().toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' });

  const a4Collected = document.getElementById('hy-a4-collected');
  if(a4Collected) a4Collected.textContent = formatAED(collected);
  const a4Expenses = document.getElementById('hy-a4-expenses');
  if(a4Expenses) a4Expenses.textContent = formatAED(expTotal);
  const a4Arrears = document.getElementById('hy-a4-arrears');
  if(a4Arrears) a4Arrears.textContent = formatAED(arrears);
  const a4Net = document.getElementById('hy-a4-net');
  if(a4Net) a4Net.textContent = formatAED(net);


  const elExpTotal = document.getElementById('hy-expenses-total');
  if(elExpTotal) elExpTotal.textContent = formatAED(expTotal);

  // Expenses table
  const expBody = document.getElementById('hy-expenses-by-type-body');
  if(expBody){
    expBody.innerHTML = '';
    const expFrag = document.createDocumentFragment();
const entries = Object.entries(expAgg).sort((a,b)=> (b[1].total||0)-(a[1].total||0));
    if(entries.length === 0){
      expBody.innerHTML = '<tr><td colspan="3" class="text-sm text-gray-500">لا توجد مصاريف ضمن الفترة</td></tr>';
    }else{
      entries.forEach(([t,v])=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${escHtml(t)}</td><td class="ui-td-ltr">${formatAED(v.total)}</td><td class="ui-td-ltr">${v.count}</td>`;
        expFrag.appendChild(tr);
      });
      expBody.appendChild(expFrag);

    }
  }

  // Units table (sorted by diff desc)
  const unitsBody = document.getElementById('hy-units-summary-body');
  if(unitsBody){
    unitsBody.innerHTML = '';
    const unitsFrag = document.createDocumentFragment();
unitsRows.sort((a,b)=> (b.diff||0)-(a.diff||0)).forEach(r=>{
      const tr = document.createElement('tr');
      const diffBadge = (r.diff>0.01) ? 'text-rose-700 font-extrabold' : 'text-emerald-700 font-extrabold';
      tr.innerHTML = `
        <td class="font-bold">${escHtml(r.name)}</td>
        <td class="text-sm">${escHtml(r.status)}</td>
        <td class="ui-td-ltr">${formatAED(r.due)}</td>
        <td class="ui-td-ltr">${formatAED(r.received)}</td>
        <td class="ui-td-ltr ${diffBadge}">${formatAED(r.diff)}</td>
      `;
      unitsFrag.appendChild(tr);
    });
      unitsBody.appendChild(unitsFrag);

    if(unitsRows.length === 0){
      unitsBody.innerHTML = '<tr><td colspan="5" class="text-sm text-gray-500">لا توجد وحدات</td></tr>';
    }
  }
  const elR = document.getElementById('hy-units-rented'); if(elR) elR.textContent = String(rentedInPeriod);
  const elV = document.getElementById('hy-units-vacant'); if(elV) elV.textContent = String(vacantInPeriod);


  // Contracts table (details: due vs received per contract)
  const contractsBody = document.getElementById('hy-contracts-body');
  if(contractsBody){
    contractsBody.innerHTML = '';

    const contractsFrag = document.createDocumentFragment();
// ترتيب: الأعلى متأخرات أولاً
    contractRows.sort((a,b)=> (b.arrears||0)-(a.arrears||0)).forEach(r=>{
      const badge = (r.arrears > 0.01)
        ? '<span class="inline-flex items-center px-3 py-1 rounded-full bg-rose-100 text-rose-800 font-extrabold text-xs">متأخر</span>'
        : '<span class="inline-flex items-center px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs">منتظم</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="ui-td-ltr font-bold cell-nowrap">${escHtml(r.contractNo)}</td>
        <td class="font-bold cell-nowrap">${escHtml(r.unitName)}</td>
        <td class="cell-tenant"><div class="ui-td-2lines tenant-name">${escHtml(r.tenantName)}</div></td>
        <td class="ui-td-ltr cell-nowrap">${r.start ? formatDMY(r.start) : '—'}</td>
        <td class="ui-td-ltr cell-nowrap">${r.end ? formatDMY(r.end) : '—'}</td>
        <td class="ui-td-ltr cell-amount">${formatAED(r.due)}</td>
        <td class="ui-td-ltr cell-amount">${formatAED(r.received)}</td>
        <td>
          <div class="cell-arrears">
            ${badge}
            <span class="ui-td-ltr ${r.arrears>0.01 ? 'text-rose-700 font-extrabold' : 'text-emerald-700 font-extrabold'}">${formatAED(r.arrears)}</span>
          </div>
        </td>
`;
      contractsFrag.appendChild(tr);
    });
      contractsBody.appendChild(contractsFrag);


    if(contractRows.length === 0){
      contractsBody.innerHTML = '<tr><td colspan="9" class="text-sm text-gray-500">لا توجد عقود تتداخل مع هذه الفترة</td></tr>';
    }
  }

  const cd = document.getElementById('hy-contracts-due-total');
  if(cd) cd.textContent = formatAED(contractsDueTotal);
  const cr = document.getElementById('hy-contracts-rec-total');
  if(cr) cr.textContent = formatAED(contractsRecTotal);
  const ca = document.getElementById('hy-contracts-arr-total');
  if(ca) ca.textContent = formatAED(contractsArrTotal);


  // Owners distribution (placeholder until owners shares exist)
  const ownersBody = document.getElementById('hy-owners-body');
  if(ownersBody){
    ownersBody.innerHTML = '';
    const ownersFrag = document.createDocumentFragment();
const owners = JSON.parse(localStorage.getItem('owners') || '[]'); // [{name:'...', share:50}]
    if(!Array.isArray(owners) || owners.length === 0){
      ownersBody.innerHTML = `<tr><td colspan="3" class="text-sm text-rose-700 font-bold">لا توجد بيانات الملاك ونسب الملكية. (سيتم إضافتها في الإعدادات لاحقاً) — صافي الفترة: ${formatAED(net)}</td></tr>`;
    }else{
      const totalShare = owners.reduce((s,o)=> s + (Number(o.share)||0), 0);
      owners.forEach(o=>{
        const share = Number(o.share||0) || 0;
        const amount = totalShare ? (net * (share/totalShare)) : 0;

      if(!name){ uiToast('error','الرجاء إدخال اسم الموظف.'); return; }
      if(!date){ uiToast('error','الرجاء اختيار تاريخ الصرف.'); return; }
      if(!amount || amount <= 0){ uiToast('error','الرجاء إدخال مبلغ صحيح.'); return; }

        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="font-bold">${escHtml(o.name||'-')}</td><td class="ui-td-ltr">${share}%</td><td class="ui-td-ltr">${formatAED(amount)}</td>`;
        ownersFrag.appendChild(tr);
      });
      ownersBody.appendChild(ownersFrag);

    }
  }

  // Notes
  const noteEl = document.getElementById('hy-note-arrears');
  if(noteEl){
    if(arrears > 0.01){
      noteEl.textContent = `ملاحظة: توجد متأخرات تقديرية ضمن الفترة بقيمة ${formatAED(arrears)} — يوصى بمتابعة التحصيل قبل الصرف.`;
    }else{
      noteEl.textContent = 'ملاحظة: لا توجد متأخرات تقديرية ضمن الفترة بحسب البيانات المسجلة.';
    }
  }
}
// ===== /Half-Year Owners Distribution Report =====

function renderReports(){
    const date = new Date().toLocaleDateString('ar-AE');
    document.getElementById('report-date').textContent = date;

    ensureReportPeriodControls();
    const period = getReportPeriod();
    const periodEl = document.getElementById('report-period');
    if(periodEl) periodEl.textContent = period.label;

    // KPIs for the selected period
    const startMs = period.start.getTime();
    const endMs   = period.end.getTime();

    let revTotal = 0, revCount = 0;
    (payments||[]).forEach(pm=>{
      const d = _leaseDateLocalNum(pm?.date);
      if(Number.isFinite(d) && d >= startMs && d < endMs){
        revTotal += Number(pm?.amount||0) || 0;
        revCount++;
      }
    });

    let expTotal = 0, expCount = 0;
    (expenses||[]).forEach(ex=>{
      const d = _leaseDateLocalNum(ex?.date);
      if(Number.isFinite(d) && d >= startMs && d < endMs){
        expTotal += Number(ex?.amount||0) || 0;
        expCount++;
      }
    });

    const netTotal = revTotal - expTotal;

    let totalUnits = 0, vacantUnits = 0, rentedUnits = 0;
    properties.forEach(p=>p.units.forEach(u=>{
      totalUnits++;
      if((u.status||'شاغرة') === 'مؤجرة') rentedUnits++;
      else if((u.status||'شاغرة') === 'شاغرة') vacantUnits++;
    }));
    const occ = totalUnits ? (rentedUnits / totalUnits) * 100 : 0;

    const kRev = document.getElementById('report-kpi-revenue');
    if(kRev) kRev.textContent = formatAED(revTotal);
    const kRevC = document.getElementById('report-kpi-revenue-count');
    if(kRevC) kRevC.textContent = String(revCount);

    const kExp = document.getElementById('report-kpi-expenses');
    if(kExp) kExp.textContent = formatAED(expTotal);
    const kExpC = document.getElementById('report-kpi-expenses-count');
    if(kExpC) kExpC.textContent = String(expCount);

    const kNet = document.getElementById('report-kpi-net');
    if(kNet) kNet.textContent = formatAED(netTotal);

    const kOcc = document.getElementById('report-kpi-occupancy');
    if(kOcc) kOcc.textContent = `${occ.toFixed(1)}%`;
    const kVac = document.getElementById('report-kpi-vacant');
    if(kVac) kVac.textContent = String(vacantUnits);
    const kTot = document.getElementById('report-kpi-totalunits');
    if(kTot) kTot.textContent = String(totalUnits);



    const tenants = getTenantsData();

    // Full contract value — rent amount is treated as the full contract amount (not annual) inside reports
    const contractTotals = {};
    properties.forEach(p=>p.units.forEach(u=>{
      if(u.status==='مؤجرة' && u.tenant){
        if(!contractTotals[u.tenant]) contractTotals[u.tenant] = 0;
        contractTotals[u.tenant] += calcUnitContractValue(u);
      }
    }));
    const tenantsR = tenants.map(t=>{
      const contractValue = Number(contractTotals[t.name] ?? t.rent) || 0;
      const paid = Number(t.paid) || 0;
      return {...t, contractValue, contractBalance: contractValue - paid};
    });

    const list = document.getElementById('tenants-summary-list');
    list.innerHTML='';
    tenantsR.forEach(t=>{
      const div = document.createElement('div');
      div.className = "border p-3 rounded bg-gray-50 flex justify-between";
      div.innerHTML = `<span><strong>${escHtml(t.name)}</strong> (${escHtml(t.units.join(', '))})</span>
        <span class="font-bold text-emerald-700">${formatAED(t.contractValue)}</span>`;
      list.appendChild(div);
    });

    const lateList = document.getElementById('late-tenants-list');
    lateList.innerHTML='';
    const late = tenantsR.filter(t=>t.contractBalance>0);
    if(late.length===0) lateList.innerHTML = '<li class="text-green-700">لا يوجد متأخرات ولله الحمد</li>';
    else late.forEach(t=>{
      const li = document.createElement('li');
      li.innerHTML = `⚠️ <strong>${escHtml(t.name)}</strong> - متبقي عليه: <span class="font-bold text-red-700">${formatAED(t.contractBalance)}</span>`;
      lateList.appendChild(li);
    });
  
  // "سجل العقود" تم نقله إلى صفحة "أرشيف العقود".
  renderHalfYearOwnersReport();
}


