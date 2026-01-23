// ================================================
// 10_salaries.js - Salaries
// Auto-split from legacy app.js for maintainability.
// DO NOT edit the legacy file directly; edit split modules.
// ================================================

  // ================= SALARIES =================
  function initSalaryYears(){
    const yearSel = document.getElementById('sal-year');
    if(!yearSel) return;
    const currentYear = new Date().getFullYear();
    yearSel.innerHTML = `
      <option value="${currentYear-1}">${currentYear-1}</option>
      <option value="${currentYear}" selected>${currentYear}</option>
      <option value="${currentYear+1}">${currentYear+1}</option>
    `;
  }

  function renderSalaries(){
    initSalaryYears();
    const tbody = document.getElementById('salaries-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';

    const frag = document.createDocumentFragment();
let total = 0;

const list = (salaries||[]).slice().sort((a,b)=> new Date(b.date) - new Date(a.date));

total = list.reduce((sum,x)=> sum + (Number(x.amount)||0), 0);

const pg = paginateList(list, 'salaries', 25);


pg.items.forEach((s,index)=>{
const tr = document.createElement('tr');
      tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors";
      tr.innerHTML = `
        <td class="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-300">${escHtml(s.date)}</td>
        <td class="px-4 py-3 font-bold text-gray-800 dark:text-white">${escHtml(s.name)}</td>
        <td class="px-4 py-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">${formatAED(s.amount)}</td>
        <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">${escHtml(s.notes || '-')}</td>
        <td class="px-4 py-3 text-center">
          <button onclick="previewReceipt('${escJsStr(s.id)}', 'salary')" class="btn-ui btn-ui-sm btn-secondary">🖨️ سند صرف راتب</button>
        </td>
        <td class="px-4 py-3 text-center">
          <button onclick="deleteSalary(${index})" class="btn-ui btn-ui-sm btn-icon btn-danger">🗑️</button>
        </td>
      `;
      frag.appendChild(tr);
    });
    document.getElementById('total-salaries').textContent = formatAED(total);
    document.getElementById('count-salaries').textContent = (list||[]).length;
  
  tbody.appendChild(frag);
      renderPagerUI('salaries', document.getElementById('salaries-pager'), pg);
}

  document.getElementById('salary-form')?.addEventListener('submit', function(e){
    e.preventDefault();

    const month = document.getElementById('sal-month').value;
    const year = document.getElementById('sal-year').value;
    const notes = `راتب شهر ${month} لسنة ${year}`;

    const newSalary = {
      id: 'SAL-'+Date.now(),
      name: document.getElementById('sal-name').value,
      role: document.getElementById('sal-role').value,
      amount: amount,
      date: document.getElementById('sal-date').value,
      notes: notes,
      voucherNo: nextVoucherNumber('salary')
    };
    salaries.push(newSalary);
    saveToLocal();
    renderSalaries();
    renderReceiptsHistory();
    this.reset();
    logAction(`تم صرف راتب للموظف: ${escHtml(newSalary.name)}`);

    initSalaryYears();
    document.getElementById('sal-month').selectedIndex = 0;
  });

  function deleteSalary(index){
    if(!confirm('هل أنت متأكد من حذف قيد الراتب هذا؟')) return;
    salaries.splice(index, 1);
    saveToLocal();
    renderSalaries();
    renderReceiptsHistory();
  }

