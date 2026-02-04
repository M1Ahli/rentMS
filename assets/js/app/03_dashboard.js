// ================================================
// 03_dashboard.js - Dashboard
// Auto-split from legacy app.js for maintainability.
// DO NOT edit the legacy file directly; edit split modules.
// ================================================

// ================= DASHBOARD =================
  let leasesChart, financeChart;

  async function updateDashboard(){
    document.getElementById('current-date-display').textContent =
      new Date().toLocaleDateString('ar-AE', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    renderLogs();

    const stats = { active:0, empty:0, expired:0, totalRent:0, expiring:0, endedByDate:0, totalUnits:0 };
    properties.forEach(p=>p.units.forEach(u=>{
      stats.totalUnits++;

      if(u.status==='مؤجرة'){ stats.active++; stats.totalRent += calcUnitContractValue(u); }
      else if(u.status==='منتهية') stats.expired++;
      else stats.empty++;

      // احتساب حالة العقد من التواريخ (لا تعتمد على status المخزن)
      if(u.contractNo || u.end){
        const cs = leaseContractStatusFromDates(u.start, u.end);
        if(cs === 'شارف على الانتهاء') stats.expiring++;
        else if(cs === 'منتهي') stats.endedByDate++;
      }
    }));

    const tenants = getTenantsData();
    const lateCount = tenants.filter(t => t.balance > 0).length;

    const lateTenants = tenants.filter(t => (Number(t.balance)||0) > 0);
    const overduePaymentsTotal = lateTenants.reduce((sum,t)=> sum + (Number(t.balance)||0), 0);
    const overduePaymentsCount = lateTenants.length;



    // ===== Dashboard: Monthly Expenses + Upcoming Cheques (30 days) =====
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1); monthStart.setHours(0,0,0,0);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth()+1, 1); nextMonthStart.setHours(0,0,0,0);

    
    let monthRevenueTotal = 0;
    let monthRevenueCount = 0;
    (payments||[]).forEach(pm=>{
      const d = _leaseDateLocalNum(pm?.date);
      if(Number.isFinite(d) && d >= monthStart.getTime() && d < nextMonthStart.getTime()){
        monthRevenueTotal += Number(pm?.amount||0) || 0;
        monthRevenueCount++;
      }
    });

let monthExpensesTotal = 0;
    let monthExpensesCount = 0;
    (expenses||[]).forEach(ex=>{
      const d = _leaseDateLocalNum(ex?.date);
      if(Number.isFinite(d) && d >= monthStart.getTime() && d < nextMonthStart.getTime()){
        monthExpensesTotal += Number(ex?.amount||0) || 0;
        monthExpensesCount++;
      }
    });

    const today = new Date(); today.setHours(0,0,0,0);
    const next30 = new Date(today); next30.setDate(next30.getDate()+30);

    let upcomingChequesTotal = 0;
    let upcomingChequesCount = 0;
    (cheques||[]).forEach(c0=>{
      const c = normalizeChequeRecord(c0);
      const d = _leaseDateLocalNum(c?.dueDate);
      if(Number.isFinite(d) && d >= today.getTime() && d <= next30.getTime()){
        const st = normalizeChequeStatus(c?.status);
        if(st !== 'مصروف'){ // القادم = غير مصروف
          upcomingChequesTotal += Number(c?.value||0) || 0;
          upcomingChequesCount++;
        }
      }
    });


    document.getElementById('total-annual-rent').textContent = formatAED(stats.totalRent);

const monthRevenueTotalEl = document.getElementById('month-revenue-total');
    if(monthRevenueTotalEl) monthRevenueTotalEl.textContent = formatAED(monthRevenueTotal);
    const monthRevenueCountEl = document.getElementById('month-revenue-count');
    if(monthRevenueCountEl) monthRevenueCountEl.textContent = String(monthRevenueCount);

const monthExpTotalEl = document.getElementById('month-expenses-total');
    if(monthExpTotalEl) monthExpTotalEl.textContent = formatAED(monthExpensesTotal);
    const monthExpCountEl = document.getElementById('month-expenses-count');
    if(monthExpCountEl) monthExpCountEl.textContent = String(monthExpensesCount);
    const upcomingChequesTotalEl = document.getElementById('upcoming-cheques-total');
    if(upcomingChequesTotalEl) upcomingChequesTotalEl.textContent = formatAED(upcomingChequesTotal);
    const upcomingChequesCountEl = document.getElementById('upcoming-cheques-count');
    if(upcomingChequesCountEl) upcomingChequesCountEl.textContent = String(upcomingChequesCount);

    const overduePaymentsTotalEl = document.getElementById('overdue-payments-total');
    if(overduePaymentsTotalEl) overduePaymentsTotalEl.textContent = formatAED(overduePaymentsTotal);
    const overduePaymentsCountEl = document.getElementById('overdue-payments-count');
    if(overduePaymentsCountEl) overduePaymentsCountEl.textContent = String(overduePaymentsCount);

document.getElementById('active-leases-count').textContent = stats.active;
const expEl = document.getElementById('expiring-leases-count');
    if(expEl) expEl.textContent = String(stats.expiring);
    const endEl = document.getElementById('ended-leases-count');
    if(endEl) endEl.textContent = String(stats.endedByDate);
    const totalUnitsEl = document.getElementById('total-units-count');
    if(totalUnitsEl) totalUnitsEl.textContent = String(stats.totalUnits);
    const occEl = document.getElementById('occupancy-rate');
    const occBar = document.getElementById('occupancy-bar');
    const occ = stats.totalUnits ? (stats.active / stats.totalUnits) * 100 : 0;
    if(occEl) occEl.textContent = `${occ.toFixed(1)}%`;
    if(occBar) occBar.style.width = `${Math.max(0, Math.min(100, occ)).toFixed(1)}%`;
    document.getElementById('empty-units-count').textContent = stats.empty;
    document.getElementById('late-tenants-count').textContent = lateCount;

    // Charts are loaded lazily for faster initial load
    try{
      await ensureChartJs();
    }catch(err){
      console.error(err);
    }
    if(!window.Chart){
      // Skip charts if library not available (stats still update)
      return;
    }

    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#d1d5db' : '#666';
    const gridColor = isDark ? '#374151' : '#e5e5e5';

    if(leasesChart) leasesChart.destroy();
    leasesChart = new Chart(document.getElementById('leasesChart'), {
      type:'doughnut',
      data:{
        labels:['مؤجرة','شاغرة','منتهية'],
        datasets:[{
          data:[stats.active, stats.empty, stats.expired],
          backgroundColor:['#10b981','#e5e7eb','#f43f5e'],
          borderColor: isDark ? '#1f2937' : '#fff'
        }]
      },
      options:{
        plugins:{ legend:{ position:'left', labels:{ color:textColor } } }
      }
    });

    const collected = payments.reduce((s,p)=>s+p.amount,0);
    if(financeChart) financeChart.destroy();
    financeChart = new Chart(document.getElementById('financeChart'), {
      type:'bar',
      data:{
        labels:['المتوقع سنوياً', 'المقبوض فعلياً'],
        datasets:[{
          label:'AED',
          data:[stats.totalRent, collected],
          backgroundColor:['#3b82f6', '#10b981'],
          borderRadius: 6
        }]
      },
      options:{
        scales:{
          y:{ beginAtZero:true, grid:{ color:gridColor }, ticks:{ color:textColor } },
          x:{ ticks:{ color:textColor }, grid:{ display:false } }
        },
        plugins:{ legend:{ labels:{ color:textColor } } }
      }
    });
  }

  // Dashboard -> Leases quick navigation (with computed status filter)
  function openLeasesFromDashboard(statusLabel){
    try{
      // Reset existing advanced filters first (avoids mixing states)
      resetLeaseAdvanced();
    }catch(e){}

    // Navigate
    showView('leases');

    // Apply filter
    const statusEl = document.getElementById('leases-filter-status');
    if(statusEl){
      statusEl.value = statusLabel || '';
    }
    try{ _lsSet('re_leases_f_status', statusLabel || ''); }catch(e){}

    // Open filters panel for clarity
    const panel = document.getElementById('leases-filters-panel');
    const btn = document.getElementById('leases-toggle-filters');
    if(panel){
      panel.classList.remove('hidden');
      if(btn) btn.textContent = 'إخفاء الفلاتر المتقدمة';
      try{ _lsSet('re_leases_filters_open', '1'); }catch(e){}
    }

    renderLeases();
  }


  function renderLogs(){
    const el=document.getElementById('contractLogs');
    el.innerHTML='';
    contractLogs.forEach(l=>{
      const li=document.createElement('li');
      li.innerHTML = `<span class="text-xs text-gray-400 font-mono">[${new Date(l.t).toLocaleTimeString('ar-AE')}]</span> ${escHtml(l.m)}`;
      el.appendChild(li);
    });
  }


// Expose for other modules / inline handlers
try{ window.updateDashboard = updateDashboard; }catch(e){}