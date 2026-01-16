// ================= DATA =================
  const initialProperties = [
    {
      "id": "PRP65351",
      "name": "فيلا",
      "type": "فيلا",
      "usage": "سكن خاص",
      "location": "مدينة العين - فلج هزاع",
      "units": [
        {
          "id": "PRP65351_U1",
          "name": "فيلا",
          "type": "فيلا",
          "usage": "سكني",
          "status": "مؤجرة",
          "tenant": "HAMDAN ABDULLA ANAYAT GHULAM MOHAMMED",
          "rent": 100000,
          "contractNo": "202402876023",
          "start": "2024-10-15",
          "end": "2025-10-14"
        }
      ]
    },
    {
      "id": "PRP11751",
      "name": "بناء زهراء ولطيفة وعايشة عبيد بالشوارب",
      "type": "بناية",
      "usage": "تجاري - صناعي",
      "location": "مدينة العين - بطحاء الحائر",
      "units": [
        { "id":"UNT83591","name":"10-A","type":"مكتب","usage":"تجاري","status":"شاغرة" },
        { "id":"UNT83609","name":"10-B","type":"مكتب","usage":"تجاري","status":"مؤجرة","tenant":"KASHMIR AL KHDHRA TILES & PLASTER WORKS EST","rent":9000,"contractNo":"202501709877","start":"2025-03-01","end":"2026-02-28" }
      ]
    }
  ];

  let properties = [], cheques = [], expenses = [], payments = [], leasePayments = [], leaseAllocations = [], tenantsContacts = {}, salaries = [];
  let editingChequeId = null;
  let pendingChequeAfterEditId = null;
  let pendingChequeAfterEditStatus = '';

  let currentTenantKey = null; // internal: active tenant key for modal

  let contractLogs = JSON.parse(localStorage.getItem('logs') || "[]");

  // Default header info
  const defaultHeader = {
    name: 'بناية ورثة جمعة عبيد أبوالشوارب',
    location: 'العين، بطحاء الحائر',
    phone: '00971503343600'
  };

  // Voucher counters (sequential numbers)
  let voucherCounters = { receipt: 1, expense: 1, salary: 1 };

  // ================= UTILS & LOCAL STORAGE =================
  function formatAED(n){ return (n||0).toLocaleString('en-US') + ' AED'; }
  function tenantKey(name){ return String(name||'').trim().replace(/\s+/g,' ').toLowerCase(); }

  function parseAED(v){
    if(v===null||v===undefined) return 0;
    const s = String(v).replace(/,/g,'').replace(/[^\d.\-]/g,'').trim();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function sumLeasePaidForUnit(contractNo, propId, unitId, groupKey){
    const cn = String(contractNo||'');
    const gk = String(groupKey||'');
    return (leaseAllocations||[]).filter(a=>{
      const ap = String(a.propId||'');
      const au = String(a.unitId||'');
      if(String(propId||'')!==ap || String(unitId||'')!==au) return false;
      if(cn) return String(a.contractNo||'')===cn;
      if(gk) return String(a.groupKey||'')===gk;
      return true;
    }).reduce((s,a)=>s + (Number(a.amount)||0), 0);
  }

  function sumLeasePaidForContract(contractNo, groupKey){
    const cn = String(contractNo||'');
    const gk = String(groupKey||'');
    return (leaseAllocations||[]).filter(a=>{
      if(cn) return String(a.contractNo||'')===cn;
      if(gk) return String(a.groupKey||'')===gk;
      return false;
    }).reduce((s,a)=>s + (Number(a.amount)||0), 0);
  }


  // ===== Tenant type UI (company / individual) =====
  function applyTenantTypeUI(prefix){
    // prefix could be: 'add-lease', 'lease', 'tenant'
    const typeEl = document.getElementById(prefix + (prefix==='tenant' ? '-type' : '-tenantType'));
    const type = (typeEl?.value || '').trim();
    const companyBox = document.getElementById(prefix + (prefix==='tenant' ? '-companyFields' : '-companyFields'));
    const personBox  = document.getElementById(prefix + (prefix==='tenant' ? '-personFields' : '-personFields'));
    if(companyBox) companyBox.classList.toggle('hidden', type !== 'company');
    if(personBox)  personBox.classList.toggle('hidden', type !== 'individual');
  }

  // ===== Units schema (Unit No / Unit Name / Unique UID) =====
  function genUnitId(){
    // Generate municipality-style unit id: UNT + 5 digits (unique in current data)
    const used = new Set();
    try{
      (properties||[]).forEach(p=> (p.units||[]).forEach(u=>{
        const id = String(u.id||'').trim();
        if(id) used.add(id);
      }));
    }catch(e){}
    let tries = 0;
    while(tries < 5000){
      const num = Math.floor(10000 + Math.random()*90000); // 5 digits
      const id = 'UNT' + num;
      if(!used.has(id)) return id;
      tries++;
    }
    // fallback
    return 'UNT' + String(Date.now()).slice(-5);
  }

  function unitLabel(u){
    if(!u) return '';
    const nm = String(u.unitName || u.name || '').trim();
    if(nm) return nm;
    const no = String(u.unitNo || '').trim();
    const title = String(u.unitTitle || '').trim();
    if(no && title) return `${no}-${title}`;
    if(no) return no;
    if(title) return title;
    return '';
  }

  function ensureUnitFields(u){
    if(!u) return;
    if(u.id == null) u.id = '';

// If new fields missing, infer from legacy "name"
    const hasNew = (u.unitNo != null) || (u.unitTitle != null) || (u.unitName != null);
    if(!hasNew){
      const raw = String(u.name || '').trim();
      if(raw.includes('-')){
        const parts = raw.split('-').map(s=>s.trim()).filter(Boolean);
        u.unitNo = parts[0] || '';
        u.unitTitle = parts.slice(1).join(' - ');
      } else {
        // If looks like a code (contains digits) treat as Unit No; otherwise treat as Unit Name
        if(/[0-9]/.test(raw) || /^[A-Za-z]{1,3}\s*\d+/.test(raw)){
          u.unitNo = raw;
          u.unitTitle = '';
        } else {
          u.unitNo = '';
          u.unitTitle = raw;
        }
      }
    }

    // ✅ Normalize combined unit name (مثل البلدية: 10-A)
    if(u.unitName == null || String(u.unitName).trim()===''){
      const no = String(u.unitNo||'').trim();
      const title = String(u.unitTitle||'').trim();
      if(no && title) u.unitName = `${no}-${title}`.replace(/\s*-\s*/g,'-');
      else u.unitName = (no || title || String(u.name||'').trim());
    } else {
      u.unitName = String(u.unitName).trim().replace(/\s*-\s*/g,'-');
    }

    // اشتقاق الأجزاء القديمة (اختياري) للتوافق
    if((u.unitNo == null || String(u.unitNo).trim()==='') && u.unitName.includes('-')){
      const parts = u.unitName.split('-').map(s=>s.trim()).filter(Boolean);
      if(parts.length>=2){
        u.unitNo = parts[0];
        u.unitTitle = parts.slice(1).join('-');
      }
    }

    if(u.unitNo == null) u.unitNo = '';
    if(u.unitTitle == null) u.unitTitle = '';

    // ✅ عدادات الخدمات (افتراضي)
    if(u.elecMeterNo == null) u.elecMeterNo = '';
    if(u.waterMeterNo == null) u.waterMeterNo = '';
    if(u.taqaPropertyId == null) u.taqaPropertyId = '';
    // Keep legacy display name in sync for existing UI parts
    u.name = unitLabel(u);
  }

  function ensureUnitsSchema(){
    if(!Array.isArray(properties)) return;
    properties.forEach(p=>{
      if(!p.units) p.units = [];
      p.units.forEach(u=>{
        ensureUnitFields(u);
        if(!Array.isArray(u.leaseHistory)) u.leaseHistory = [];
      });
    });
  }


  function normalizeChequeStatus(status){
    const s = String(status ?? '').trim();
    if(!s) return '';
    const ns = s.toLowerCase();

    // Arabic / English mappings
    if(ns.includes('مصروف') || ns.includes('تم الصرف') || ns.includes('صرف') || ns.includes('cashed') || ns.includes('cleared') || ns.includes('paid')) return 'مصروف';
    if(ns.includes('راجع') || ns.includes('مرتجع') || ns.includes('مرفوض') || ns.includes('returned') || ns.includes('bounce') || ns.includes('bounced')) return 'راجع';
    if(ns.includes('بانتظار') || ns.includes('قيد') || ns.includes('pending') || ns.includes('await') || ns.includes('waiting') || ns.includes('not cashed')) return 'بانتظار الصرف';

    // Already canonical?
    if(s === 'بانتظار الصرف' || s === 'مصروف' || s === 'راجع') return s;

    return s; // keep as-is (won't match buckets unless mapped above)
  }

  function normalizeChequeRecord(c){
    const out = { ...(c||{}) };

    // Normalize common field names from older versions
    out.id = out.id || out.chequeId || out.checkId || ('CHQ-' + Date.now() + Math.floor(Math.random()*1000));
    out.tenant = out.tenant || out.tenantName || out.tenant_name || out.name || out.client || '';
    out.chequeNo = out.chequeNo || out.number || out.chequeNumber || out.cheque_number || out.no || '';
    out.value = Number(out.value ?? out.amount ?? out.due ?? out.total ?? 0) || 0;
    out.dueDate = out.dueDate || out.date || out.due_date || out.due_at || '';
    out.bank = out.bank || out.bankName || out.bank_name || '';
    out.purpose = out.purpose || out.desc || out.description || '';
    out.unitId = out.unitId || out.unit || out.unit_id || out.unitID || '';
    out.unitLabel = out.unitLabel || out.unitName || out.unit_name || '';
    out.imageUrl = out.imageUrl || out.image || out.imgUrl || null;

    out.status = normalizeChequeStatus(out.status);
    if(!out.status){
      // Default based on due date (if any)
      try{
        out.status = (out.dueDate && new Date(out.dueDate) < new Date()) ? 'راجع' : 'بانتظار الصرف';
      }catch(e){
        out.status = 'بانتظار الصرف';
      }
    }
    return out;
  }

  function chequeStatusBucket(status){
    const s = normalizeChequeStatus(status);
    if(s === 'راجع') return 'returned';
    if(s === 'بانتظار الصرف') return 'pending';
    if(s === 'مصروف') return 'cashed';
    return 'other';
  }



  function chequeStatusLabelEn(status){
    const s = normalizeChequeStatus(status);
    if(s === 'راجع') return 'Returned';
    if(s === 'بانتظار الصرف') return 'Pending';
    if(s === 'مصروف') return 'Cashed';
    return 'Other';
  }

  




  

  // ======= Lease duration helpers (for reports: contract full value) =======
  function toUTCDate(dateStr){
    if(!dateStr) return null;
    const parts = String(dateStr).split('-').map(Number);
    if(parts.length !== 3) return null;
    const [y,m,d] = parts;
    if(!y || !m || !d) return null;
    // noon UTC to avoid timezone edge cases
    return new Date(Date.UTC(y, m-1, d, 12, 0, 0));
  }

  // Returns contract duration in years (can be fractional). End date is treated as inclusive.
  function contractYears(startStr, endStr){
    const start = toUTCDate(startStr);
    const end = toUTCDate(endStr);
    if(!start || !end) return 1;

    const endPlus1 = new Date(end.getTime());
    endPlus1.setUTCDate(endPlus1.getUTCDate() + 1);

    // If aligned on same day-of-month => exact month count (handles leap years cleanly)
    if(endPlus1.getUTCDate() === start.getUTCDate()){
      const months = (endPlus1.getUTCFullYear() - start.getUTCFullYear()) * 12
                   + (endPlus1.getUTCMonth() - start.getUTCMonth());
      const years = months / 12;
      return years > 0 ? years : 1;
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    const days = Math.round((endPlus1 - start) / msPerDay);
    const years = days / 365.25;
    return years > 0 ? years : 1;
  }

  function calcContractValueFromAnnual(annualRent, startStr, endStr){
    const annual = Number(annualRent) || 0;
    return annual * contractYears(startStr, endStr);
  }


  // ================= RENT BASIS (annual vs total) =================
  function getRentBasis(){
    return localStorage.getItem('re_rent_basis') || 'total'; // 'total' | 'annual'
  }

  function calcUnitContractValue(u){
    const rent = (u && u.rent) ? Number(u.rent) : 0;
    if(!rent) return 0;
    const basis = getRentBasis();
    if(basis === 'annual'){
      return calcContractValueFromAnnual(rent, u.start, u.end);
    }
    return rent; // total contract value
  }

  function updateRentLabels(){
    const basis = getRentBasis();
    const lbl = document.getElementById('total-rent-label');
    if(lbl){
      lbl.textContent = (basis === 'annual')
        ? 'إجمالي قيمة العقود (الإيجار السنوي × مدة العقد)'
        : 'إجمالي قيمة العقود';
    }
  }

  function loadRentBasisSetting(){
    const sel = document.getElementById('rent-basis-select');
    if(sel) sel.value = getRentBasis();
    updateRentLabels();
  }

  function saveRentBasisSetting(){
    const sel = document.getElementById('rent-basis-select');
    if(!sel) return;
    localStorage.setItem('re_rent_basis', sel.value);
    updateRentLabels();
    updateDashboard();
    // تحديث التقارير لو كانت مفتوحة أو حتى لو كانت مخفية
    try{ renderReports(); } catch(e){}
  }


  // ===== Lease History (Keep old contracts in reports) =====
  function ensureLeaseHistory(u){
    if(!u) return;
    if(!Array.isArray(u.leaseHistory)) u.leaseHistory = [];
  }

  function unitHasLeaseData(u){
    if(!u) return false;
    const hasMoney = Number(u.rent || 0) > 0;
    const hasText = !!(u.tenant || u.contractNo || u.start || u.end);
    return hasMoney || hasText;
  }

  function archiveUnitLease(u, reason, statusOverride){
    if(!u) return false;
    if(!unitHasLeaseData(u)) return false;

    // Archive current unit lease as-is (must NOT depend on modal DOM inputs)
    ensureLeaseHistory(u);

    const entry = {
      tenant: u.tenant || '',
      rent: Number(u.rent || 0),
      contractNo: u.contractNo || '',
      start: u.start || '',
      end: u.end || '',
      status: normalizeLeaseStatus(statusOverride || (u.status || '')),
      prevStatus: u.status || '',
      reason: reason || '',
      archivedAt: new Date().toISOString()
    };
    u.leaseHistory.push(entry);
    return true;
  }

  function getAllLeaseRecords(){
    const records = [];
    (properties || []).forEach(p=>{
      (p.units || []).forEach(u=>{
        // current
        if(u.status !== 'شاغرة' && unitHasLeaseData(u)){
          records.push({
            propId: p.id,
            propName: p.name,
            unitId: u.id,
            unitName: u.name,
            tenant: u.tenant || '',
            rent: Number(u.rent || 0),
            contractNo: u.contractNo || '',
            start: u.start || '',
            end: u.end || '',
            status: normalizeLeaseStatus(u.status || ''),
            reason: 'حالي',
            archivedAt: ''
          });
        }
        // history
        ensureLeaseHistory(u);
        u.leaseHistory.forEach(h=>{
          records.push({
            propId: p.id,
            propName: p.name,
            unitId: u.id,
            unitName: u.name,
            tenant: h.tenant || '',
            rent: Number(h.rent || 0),
            contractNo: h.contractNo || '',
            start: h.start || '',
            end: h.end || '',
            status: normalizeLeaseStatus(h.status || ''),
            reason: h.reason || '',
            archivedAt: h.archivedAt || ''
          });
        });
      });
    });
    // sort: newest first (by archivedAt, else end, else start)
    records.sort((a,b)=>{
      const da = a.archivedAt ? new Date(a.archivedAt) : (a.end ? new Date(a.end) : (a.start ? new Date(a.start) : new Date(0)));
      const db = b.archivedAt ? new Date(b.archivedAt) : (b.end ? new Date(b.end) : (b.start ? new Date(b.start) : new Date(0)));
      return db - da;
    });
    return records;
  }

  function normalizeLeaseStatus(status){
    const s = (status || '').trim();
    if(s === 'مستبدلة' || s === 'استبدال') return 'تجديد عقد';
    return s;
  }

  // ===== Lease computed status (based on dates) =====
  function _leaseDateLocalNum(s){
    const v = (s||'').toString().slice(0,10);
    if(!v) return NaN;
    const d = new Date(v + 'T00:00:00');
    const t = d.getTime();
    return Number.isFinite(t) ? t : NaN;
  }

  function leaseContractStatusFromDates(start, end){
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const e = _leaseDateLocalNum(end);
    if(!Number.isFinite(e)) return 'ساري';
    if(e < today) return 'منتهي';
    const daysLeft = Math.floor((e - today) / 86400000);
    if(daysLeft <= 30) return 'شارف على الانتهاء';
    return 'ساري';
  }

  function leaseContractStatusOrder(label){
    if(label === 'منتهي') return 0;
    if(label === 'شارف على الانتهاء') return 1;
    return 2; // ساري
  }

  function leaseContractBadgeClass(label){
    if(label === 'منتهي') return 'badge badge-crimson';
    if(label === 'شارف على الانتهاء') return 'badge badge-orange';
    return 'badge badge-emerald';
  }
  // ===== /Lease computed status =====



  function leaseStatusLabel(status){
    return normalizeLeaseStatus(status);
  }

  function leaseStatusBadge(status){
    status = normalizeLeaseStatus(status);
    if(status === 'مؤجرة') return 'badge badge-green';
    if(status === 'منتهية') return 'badge badge-red';
    if(status === 'ملغاة') return 'badge badge-red';
    if(status === 'تجديد عقد') return 'badge badge-amber';
    if(status === 'مستبدلة') return 'badge badge-amber';
    if(status === 'مخلى') return 'badge badge-red';
    return 'badge';
  }

  function renderLeaseArchiveReport(){
    const tbody = document.getElementById('report-leases-body');
    if(!tbody) return;

    const statusSel = document.getElementById('report-lease-status-filter');
    const qInput = document.getElementById('report-lease-search');
    const empty = document.getElementById('report-leases-empty');
    const counts = document.getElementById('report-leases-counts');

    // bind once
    if(statusSel && !statusSel.dataset.bound){
      statusSel.dataset.bound = '1';
      statusSel.addEventListener('change', renderLeaseArchiveReport);
    }
    if(qInput && !qInput.dataset.bound){
      qInput.dataset.bound = '1';
      qInput.addEventListener('input', renderLeaseArchiveReport);
    }

    const statusFilter = statusSel ? statusSel.value : 'all';
    const q = (qInput ? qInput.value : '').trim().toLowerCase();

    let recs = getAllLeaseRecords();

    // counts
    const c = { all: recs.length, active:0, ended:0, cancelled:0, renewed:0, vacated:0 };
    recs.forEach(r=>{
      if(normalizeLeaseStatus(r.status)==='مؤجرة') c.active++;
      else if(normalizeLeaseStatus(r.status)==='منتهية') c.ended++;
      else if(normalizeLeaseStatus(r.status)==='ملغاة') c.cancelled++;
      else if(normalizeLeaseStatus(r.status)==='تجديد عقد') c.renewed++;
      else if(normalizeLeaseStatus(r.status)==='مخلى') c.vacated++;
    });
    if(counts){
      counts.textContent = `الإجمالي: ${c.all} • مؤجرة: ${c.active} • منتهية: ${c.ended} • ملغاة: ${c.cancelled} • تجديد عقد: ${c.renewed} • مخلى: ${c.vacated}`;
    }

    if(statusFilter !== 'all'){
      recs = recs.filter(r => normalizeLeaseStatus(r.status) === statusFilter);
    }

    if(q){
      recs = recs.filter(r=>{
        const hay = `${r.propName} ${escHtml(r.unitName)} ${escHtml(r.tenant)} ${escHtml(r.contractNo)}`.toLowerCase();
        return hay.includes(q);
      });
    }

    tbody.innerHTML = '';
    const frag = document.createDocumentFragment();
if(empty) empty.classList.add('hidden');

    if(recs.length === 0){
      if(empty){
        empty.textContent = 'لا توجد عقود مطابقة للبحث/الفلتر.';
        empty.classList.remove('hidden');
      }
      return;
    }

    recs.forEach(r=>{
      const tr = document.createElement('tr');
      const archivedDate = r.archivedAt ? (new Date(r.archivedAt).toLocaleDateString('ar-AE')) : '-';
      tr.innerHTML = `
        <td class="px-3 py-3">
          <div class="font-bold text-gray-800 dark:text-white">${escHtml(r.unitName || '-')}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">${escHtml(r.propName || '-')}</div>
        </td>
        <td class="px-3 py-3 text-sm">${escHtml(r.tenant || '-')}</td>
        <td class="px-3 py-3 font-mono text-emerald-700 dark:text-emerald-400">${formatAED(r.rent || 0)}</td>
        <td class="px-3 py-3 text-xs font-mono bg-gray-100 dark:bg-gray-800 rounded truncate-text" title="${escHtml(r.contractNo || '')}">${escHtml(r.contractNo || '-')}</td>
        <td class="px-3 py-3 text-xs">${escHtml(r.start || '-')}</td>
        <td class="px-3 py-3 text-xs">${escHtml(r.end || '-')}</td>
        <td class="px-3 py-3"><span class="${leaseStatusBadge(r.status)}">${leaseStatusLabel(r.status) || '-'}</span></td>
        <td class="px-3 py-3 text-xs text-gray-700 dark:text-gray-300">${escHtml(r.reason || '-')}</td>
        <td class="px-3 py-3 text-xs">${archivedDate}</td>
      `;
      frag.appendChild(tr);
    });
  
  tbody.appendChild(frag);
}


function logAction(msg){
    contractLogs.unshift({m:msg, t:new Date().toISOString()});
    if(contractLogs.length>50) contractLogs.pop();
    localStorage.setItem('logs', JSON.stringify(contractLogs));
    renderLogs();
  }

  function clearLogs(){
    contractLogs=[];
    localStorage.setItem('logs','[]');
    renderLogs();
  }

  
    // ===== Storage schema/versioning =====
    const APP_SCHEMA_VERSION = 2;

    function buildStoragePayload(){
      return {
        meta: {
          schemaVersion: APP_SCHEMA_VERSION,
          savedAt: new Date().toISOString()
        },
        properties,
        cheques,
        expenses,
        payments,
        leasePayments,
        leaseAllocations,
        tenantsContacts,
        salaries
      };
    }


      // ===== Auto Backups (Last 3) =====
      const AUTO_BACKUP_META_KEY = 're_data_v2_ab_meta';
      const AUTO_BACKUP_IDX_KEY  = 're_data_v2_ab_idx';
      const AUTO_BACKUP_LAST_KEY = 're_data_v2_ab_last';
      const AUTO_BACKUP_SLOTS    = 3;

      let _autoBackupTimer = null;

      function getAutoBackupMeta(){
        try{
          const m = JSON.parse(localStorage.getItem(AUTO_BACKUP_META_KEY) || '[]');
          return Array.isArray(m) ? m : [];
        }catch(e){
          return [];
        }
      }

      function setAutoBackupMeta(list){
        try{
          localStorage.setItem(AUTO_BACKUP_META_KEY, JSON.stringify(list.slice(0, AUTO_BACKUP_SLOTS)));
        }catch(e){
          console.warn('setAutoBackupMeta failed:', e);
        }
      }

      function pushAutoBackup(payloadStr){
        const nowIso = new Date().toISOString();
        let savedAt = nowIso;
        let schemaVersion = APP_SCHEMA_VERSION;
        try{
          const parsed = JSON.parse(payloadStr);
          savedAt = parsed?.meta?.savedAt || nowIso;
          schemaVersion = Number(parsed?.meta?.schemaVersion || APP_SCHEMA_VERSION);
        }catch(e){}

        const idx = (Number(localStorage.getItem(AUTO_BACKUP_IDX_KEY) || '0') % AUTO_BACKUP_SLOTS);
        const slotKey = `re_data_v2_ab_${idx}`;

        try{
          localStorage.setItem(slotKey, payloadStr);
        }catch(e){
          console.warn('pushAutoBackup failed (storage):', e);
          throw e;
        }

        const meta = getAutoBackupMeta().filter(x => x && x.key !== slotKey);
        meta.unshift({
          key: slotKey,
          savedAt,
          schemaVersion,
          size: payloadStr.length
        });
        setAutoBackupMeta(meta);

        localStorage.setItem(AUTO_BACKUP_IDX_KEY, String((idx + 1) % AUTO_BACKUP_SLOTS));
      }

      function maybeAutoBackup(payloadStr, opts={}) {
          try{
            if(!isAutoBackupEnabled()) return;
            const now = Date.now();
            const last = Number(localStorage.getItem(AUTO_BACKUP_LAST_KEY) || '0');
            const force = !!opts.force;

            // limit auto backup by configured interval (unless forced)
            const minInterval = getAutoBackupMinIntervalMs();
            if(!force && (now - last) < minInterval) return;

          clearTimeout(_autoBackupTimer);
          _autoBackupTimer = setTimeout(()=>{
            try{
              pushAutoBackup(payloadStr);
              localStorage.setItem(AUTO_BACKUP_LAST_KEY, String(Date.now()));
              renderAutoBackups();
            }catch(e){
              console.warn('Auto backup failed (non-fatal):', e);
            }
          }, 180);
        }catch(e){}
      }

      function renderAutoBackups(){
        const box = document.getElementById('auto-backup-list');
        if(!box) return;

        const meta = getAutoBackupMeta();
        if(!meta.length){
          box.innerHTML = '<div class="text-sm text-gray-500 dark:text-gray-400">لا توجد نسخ تلقائية بعد.</div>';
          return;
        }

        const rows = meta.map((b, i) => {
          const dt = (()=>{ try{ return new Date(b.savedAt).toLocaleString('ar-AE'); }catch(e){ return b.savedAt || ''; } })();
          const sizeKb = Math.max(1, Math.round((Number(b.size||0))/1024));
          const keySafe = escHtml(b.key);
          return `
            <tr class="border-b border-gray-100 dark:border-gray-700">
              <td class="py-2 px-3 text-sm">${i+1}</td>
              <td class="py-2 px-3 text-sm">${escHtml(dt)}</td>
              <td class="py-2 px-3 text-sm ui-td-ltr">${escHtml(String(b.schemaVersion||''))}</td>
              <td class="py-2 px-3 text-sm ui-td-ltr">${escHtml(sizeKb)} KB</td>
              <td class="py-2 px-3 text-sm">
                <div class="flex gap-2 flex-wrap">
                  <button class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs shadow"
                          onclick="restoreAutoBackup('${keySafe}')">استعادة</button>
                  <button class="bg-gray-700 hover:bg-gray-800 text-white px-3 py-1.5 rounded text-xs shadow"
                          onclick="downloadAutoBackup('${keySafe}')">تحميل</button>
                </div>
              </td>
            </tr>
          `;
        }).join('');

        box.innerHTML = `
          <div class="overflow-auto">
            <table class="min-w-full text-right">
              <thead class="sticky top-0 bg-white dark:bg-gray-800">
                <tr class="border-b border-gray-200 dark:border-gray-700">
                  <th class="py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-200">#</th>
                  <th class="py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-200">وقت الحفظ</th>
                  <th class="py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-200">Schema</th>
                  <th class="py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-200">الحجم</th>
                  <th class="py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-200">إجراءات</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
      }

      function restoreAutoBackup(slotKey){
        try{
          const payloadStr = localStorage.getItem(String(slotKey||''));
          if(!payloadStr){
            uiToast('error', 'النسخة المطلوبة غير موجودة.');
            return;
          }
          if(!confirm('سيتم استبدال البيانات الحالية بالنسخة التلقائية المحددة. هل تريد المتابعة؟')) return;

          localStorage.setItem('re_data_v2', payloadStr);
          loadFromLocal();
          // إعادة رسم الصفحة الحالية
          try{
            const activeBtn = document.querySelector('.nav-btn.active')?.id || '';
            const id = activeBtn.replace('nav-','') || 'dashboard';
            showView(id);
          }catch(e){
            try{ updateDashboard(); }catch(_){}
          }
          uiToast('success', 'تمت الاستعادة بنجاح ✅');
        }catch(e){
          console.error('restoreAutoBackup failed:', e);
          uiToast('error', 'تعذر استعادة النسخة.');
        }
      }

      function downloadAutoBackup(slotKey){
        try{
          const payloadStr = localStorage.getItem(String(slotKey||''));
          if(!payloadStr){
            uiToast('error', 'النسخة المطلوبة غير موجودة.');
            return;
          }
          const ts = new Date().toISOString().replace(/[:.]/g,'-');
          const blob = new Blob([payloadStr], {type:'application/json;charset=utf-8'});
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `auto-backup-${ts}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(()=>URL.revokeObjectURL(a.href), 500);
        }catch(e){
          console.error('downloadAutoBackup failed:', e);
          uiToast('error', 'تعذر تحميل النسخة.');
        }
      }

      function clearAutoBackups(){
        if(!confirm('سيتم حذف جميع النسخ التلقائية (آخر 3 نسخ). هل أنت متأكد؟')) return;
        try{
          for(let i=0;i<AUTO_BACKUP_SLOTS;i++){
            localStorage.removeItem(`re_data_v2_ab_${i}`);
          }
          localStorage.removeItem(AUTO_BACKUP_META_KEY);
          localStorage.removeItem(AUTO_BACKUP_IDX_KEY);
          localStorage.removeItem(AUTO_BACKUP_LAST_KEY);
          renderAutoBackups();
        }catch(e){
          console.error('clearAutoBackups failed:', e);
        }
      }

      function createAutoBackupNow(){
        try{
          const payloadStr = JSON.stringify(buildStoragePayload());
          pushAutoBackup(payloadStr);
          localStorage.setItem(AUTO_BACKUP_LAST_KEY, String(Date.now()));
          renderAutoBackups();
          uiToast('success', 'تم إنشاء نسخة تلقائية الآن ✅');
        }catch(e){
          console.error('createAutoBackupNow failed:', e);
          uiToast('error', 'تعذر إنشاء النسخة (قد تكون مساحة التخزين ممتلئة).');
        }
      }

function saveToLocal(){
        try{
          const payloadStr = JSON.stringify(buildStoragePayload());
          localStorage.setItem('re_data_v2', payloadStr);
          try{ maybeAutoBackup(payloadStr); }catch(_){}
        }catch(e){
          console.error('saveToLocal failed:', e);
          uiToast('error', 'تعذر حفظ البيانات في المتصفح. قد تكون مساحة التخزين ممتلئة.\n\nالرجاء: قم بأخذ نسخة احتياطية (JSON) من الإعدادات ثم جرّب إغلاق/فتح الصفحة أو مسح بعض بيانات المتصفح.');
        }
      }

// ================== Performance Helpers (Debounce) ==================
  // Debounce expensive re-renders during typing (keeps features intact).
  
    
    function debounce(fn, wait=220){
      let t;
      return function(...args){
        clearTimeout(t);
        if(wait <= 0){
          return fn.apply(this, args);
        }
        t = setTimeout(()=> fn.apply(this, args), wait);
      };
    }
    // A small registry so we can debounce multiple actions independently.
    function _debouncedCall(key, fn){
      const wait = getDebounceMs();
      window.__reDebouncers = window.__reDebouncers || {};
      const cur = window.__reDebouncers[key];
      if(!cur || cur.wait !== wait || cur.fn !== fn){
        window.__reDebouncers[key] = { wait, fn, run: debounce(fn, wait) };
      }
      window.__reDebouncers[key].run();
    }

// Debounced wrappers (used only by oninput fields; buttons/selects remain instant).
  function renderPropertiesDebounced(){ _debouncedCall('renderProperties', renderProperties); }
  function renderTenantsDebounced(){ _debouncedCall('renderTenants', renderTenants); }
  function onLeaseAdvancedChangedDebounced(){ _debouncedCall('onLeaseAdvancedChanged', onLeaseAdvancedChanged); }
  function onChequesAdvancedChangedDebounced(){ _debouncedCall('onChequesAdvancedChanged', onChequesAdvancedChanged); }
  function onExpensesAdvancedChangedDebounced(){ _debouncedCall('onExpensesAdvancedChanged', onExpensesAdvancedChanged); }
  function onReceiptsAdvancedChangedDebounced(){ _debouncedCall('onReceiptsAdvancedChanged', onReceiptsAdvancedChanged); }

function loadFromLocal(){
    const d = localStorage.getItem('re_data_v2');
    if(d){
      try {
        const o = JSON.parse(d);

          // ---- Schema/meta normalization ----
          o.meta = o.meta || {};
          const loadedSchema = Number(o.meta.schemaVersion || 0);
          // Preserve last saved time if present, otherwise set it.
          o.meta.savedAt = o.meta.savedAt || new Date().toISOString();
          // If we add future migrations, we can branch based on loadedSchema here.
          // For now, existing migrations below handle backward compatibility.
          if(loadedSchema && loadedSchema > APP_SCHEMA_VERSION){
            // Data from a newer version: continue, but avoid destructive changes.
            console.warn('Loaded data schema is newer than app schema:', loadedSchema, APP_SCHEMA_VERSION);
          }

        if(o.properties) properties = o.properties;
        
        // Migration: ensure unit schema (unitNo/unitTitle/uid) + leaseHistory array
        ensureUnitsSchema();
cheques = o.cheques || [];
        expenses = o.expenses || [];
        payments = o.payments || [];
        leasePayments = Array.isArray(o.leasePayments) ? o.leasePayments : [];
        leaseAllocations = Array.isArray(o.leaseAllocations) ? o.leaseAllocations : [];
        // Mirror multi-unit lease payments into Payments/Reports/Tenants
        syncLeasePaymentsIntoPayments();
// migrate tenantsContacts to normalized keys for reliable saving/loading
        const rawContacts = o.tenantsContacts || {};
        tenantsContacts = {};
        Object.keys(rawContacts).forEach(k=>{
          const v = rawContacts[k] || {};
          const nk = tenantKey(v.name || k);
          if(!nk) return;
          if(!tenantsContacts[nk]){
            tenantsContacts[nk] = {
              name: v.name || k,
              phone: v.phone || '',
              email: v.email || '',
              tenantType: v.tenantType || v.type || '',
              tradeLicenseNo: v.tradeLicenseNo || v.tradeLicense || '',
              idNumber: v.idNumber || v.idNo || ''
            };
          } else {
            // merge (keep existing if already set)
            tenantsContacts[nk].phone = tenantsContacts[nk].phone || (v.phone||'');
            tenantsContacts[nk].email = tenantsContacts[nk].email || (v.email||'');
            tenantsContacts[nk].tenantType = tenantsContacts[nk].tenantType || (v.tenantType || v.type || '');
            tenantsContacts[nk].tradeLicenseNo = tenantsContacts[nk].tradeLicenseNo || (v.tradeLicenseNo || v.tradeLicense || '');
            tenantsContacts[nk].idNumber = tenantsContacts[nk].idNumber || (v.idNumber || v.idNo || '');
          }
        });
        salaries = o.salaries || [];

        // Migration: ensure expenses have ID & type
        expenses = expenses.map(e => ({
          id: e.id || 'EXP-' + Date.now() + Math.floor(Math.random()*1000),
          date: e.date,
          type: e.type || 'أخرى',
          amount: e.amount,
          details: e.details,
          voucherNo: e.voucherNo || null
        }));

        // Migration: normalize cheques (compatibility across versions)
        cheques = (o.cheques || []).map(normalizeChequeRecord);
        // Auto-infer unit link for cheques when the tenant has exactly one leased unit
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

        // Migrate old cheque-linked payments to the proper unit label/unitId (if possible)
        (payments||[]).forEach(p=>{
          if(p && p.chequeId){
            migrateChequePaymentsToUnit(p.chequeId);
          }
        });


          // Persist schema/meta after migration to keep storage consistent
          try{
            const payloadStr = JSON.stringify(buildStoragePayload());
            localStorage.setItem('re_data_v2', payloadStr);
            try{ maybeAutoBackup(payloadStr, {force:true}); }catch(_){ }
          }catch(e){
            console.warn('Post-migration save failed (non-fatal):', e);
          }

} catch(e){
        console.error("Error loading data", e);
      }
    } else {
      properties = JSON.parse(JSON.stringify(initialProperties));
      ensureUnitsSchema();
      saveToLocal();
    }
    ensureVoucherNumbers();
  }

  function extractVoucherNumber(code){
    if(!code) return null;
    const parts = String(code).split('-');
    const numPart = parts[parts.length - 1];
    const n = parseInt(numPart, 10);
    return isNaN(n) ? null : n;
  }

  function recomputeVoucherCounters(){
    voucherCounters = { receipt:1, expense:1, salary:1 };
    payments.forEach(p => {
      const n = extractVoucherNumber(p.voucherNo);
      if(n && n >= voucherCounters.receipt) voucherCounters.receipt = n + 1;
    });
    expenses.forEach(e => {
      const n = extractVoucherNumber(e.voucherNo);
      if(n && n >= voucherCounters.expense) voucherCounters.expense = n + 1;
    });
    salaries.forEach(s => {
      const n = extractVoucherNumber(s.voucherNo);
      if(n && n >= voucherCounters.salary) voucherCounters.salary = n + 1;
    });
  }

  function nextVoucherNumber(type){
    if(!voucherCounters[type]) voucherCounters[type] = 1;
    const prefixMap = { receipt:'R', expense:'P', salary:'S' };
    const prefix = prefixMap[type] || 'V';
    const n = voucherCounters[type]++;
    return `${prefix}-${String(n).padStart(4,'0')}`;
  }

  function ensureVoucherNumbers(){
    recomputeVoucherCounters();
    let updated = false;

    payments.forEach(p => {
      if(!p.voucherNo){
        p.voucherNo = nextVoucherNumber('receipt');
        updated = true;
      }
    });
    expenses.forEach(e => {
      if(!e.voucherNo){
        e.voucherNo = nextVoucherNumber('expense');
        updated = true;
      }
    });
    salaries.forEach(s => {
      if(!s.voucherNo){
        s.voucherNo = nextVoucherNumber('salary');
        updated = true;
      }
    });

    if(updated) saveToLocal();
  }

  // ================= VIEW LOGIC =================
  function showView(id){
    // حفظ بيانات الهوية/الرخصة للمستأجر إذا كانت نافذة المستأجر مفتوحة
    try{
      const tm = document.getElementById('tenant-modal');
      if(tm && !tm.classList.contains('hidden')){
        persistTenantContact({silent:true});
      }
    }catch(e){}
    document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
    document.getElementById(id+'-view')?.classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById('nav-'+id)?.classList.add('active');

    if(id==='dashboard') updateDashboard();
    else if(id==='properties') renderProperties();
    else if(id==='leases') renderLeases();
    else if(id==='tenants') renderTenants();
    else if(id==='cheques') renderCheques();
    else if(id==='payments') renderPayments();
    else if(id==='expenses') renderExpenses();
    else if(id==='salaries') renderSalaries();
    else if(id==='receipts-history') renderReceiptsHistory();
    else if(id==='reports') renderReports();
      else if(id==='settings'){ renderAutoBackups(); renderPerfSettings(); if(typeof renderHealthReportFromCache==='function') renderHealthReportFromCache(); }
      else if(id==='notices') renderNotices();
  
    try{ scheduleNormalizeButtons(); }catch(e){}
}

  // ================== UI Consistency: Normalize Button Heights ==================
  // Adds `.ui-btn` / `.ui-btn-icon` to interactive buttons to unify height (42px)
  // while preserving link-like text actions inside tables.
  function normalizeButtons(root=document){
    try{
      const scope = root && root.querySelectorAll ? root : document;
      scope.querySelectorAll('button').forEach(btn=>{
        if(!btn || btn.dataset?.noBtnUnify === '1') return;

        const cls = (btn.getAttribute('class') || '').toString();

        // Skip link-like actions (e.g., "إدارة/تفاصيل/عرض") that are styled as plain text
        const hasBg = /\bbg-/.test(cls);
        const hasBorder = /\bborder\b|\bborder-/.test(cls);
        const hasShadow = /\bshadow\b/.test(cls);
        const hasRing = /\bring\b|\bring-/.test(cls);
        const hasPadding = /\bpx-\d|\bpy-\d|\bp-\d/.test(cls);
        const hasTextColor = /\btext-/.test(cls);

        const isLinkLike = !hasBg && !hasBorder && !hasShadow && !hasRing && hasTextColor && !hasPadding;
        if(isLinkLike) return;

        // Icon-only button
        const txt = (btn.textContent || '').replace(/\s+/g,'').trim();
        const hasIcon = !!btn.querySelector('svg, img');
        const iconOnly = (txt === '') && hasIcon;

        if(iconOnly){
          btn.classList.add('ui-btn-icon');
          btn.classList.remove('ui-btn');
        }else{
          btn.classList.add('ui-btn');
          btn.classList.remove('ui-btn-icon');
        }
      });
    }catch(e){}
  }

  // Debounced auto-normalization for any dynamically rendered buttons
  let __btnNormTimer = null;
  function scheduleNormalizeButtons(){
    try{
      clearTimeout(__btnNormTimer);
      __btnNormTimer = setTimeout(()=>normalizeButtons(document), 0);
    }catch(e){}
  }
  function initNormalizeButtons(){
    scheduleNormalizeButtons();
    try{
      const obs = new MutationObserver(()=>scheduleNormalizeButtons());
      obs.observe(document.body, {childList:true, subtree:true});
    }catch(e){}
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNormalizeButtons);
  else initNormalizeButtons();




  // ================= NOTICES / LETTERS =================

  const NOTICE_LETTERHEAD = {
    topLines: [
      'بناية ورثة جمعة عبيد أبو الشوارب',
      'العين، الصناعية، بطحاء الحائر',
      '24-04-014-18'
    ],
    footerLines: [
      'Mohammed Abdulrahim Ahli',
      'UAE, Al Ain',
      'Po Box: 1148',
      '+971503343600',
      'Mohd_Ahli@live.com'
    ]
  };

  // Notices UI preferences (signature/attachments)
  function persistNoticeUiPrefs(){
    try{
      const prefs = {
        showSig: document.getElementById('notice-show-signature')?.checked ?? true,
        showSeal: document.getElementById('notice-show-seal')?.checked ?? true,
        showAtt: document.getElementById('notice-show-attachments')?.checked ?? true,
        attCustom: document.getElementById('notice-attachments-custom')?.value || ''
      };
      localStorage.setItem('re_notice_prefs', JSON.stringify(prefs));
    }catch(e){}
  }
  function loadNoticeUiPrefs(){
    let prefs = {};
    try{ prefs = JSON.parse(localStorage.getItem('re_notice_prefs') || '{}') || {}; }catch(e){ prefs = {}; }

    const sig = document.getElementById('notice-show-signature');
    const seal = document.getElementById('notice-show-seal');
    const att = document.getElementById('notice-show-attachments');
    const custom = document.getElementById('notice-attachments-custom');

    if(sig) sig.checked = (prefs.showSig !== false);
    if(seal) seal.checked = (prefs.showSeal !== false);
    if(att) att.checked = (prefs.showAtt !== false);
    if(custom) custom.value = (prefs.attCustom || '');
  }

  function getDefaultNoticeAttachments(tpl){
    if(tpl === 'eviction'){
      return {
        ar: ['براءة ذمة كهرباء/مياه من طاقة للتوزيع (TAQA Distribution).'],
        en: ['TAQA Distribution clearance certificate (Electricity/Water).']
      };
    }
    if(tpl === 'increase5'){
      return {
        ar: ['ملحق/إشعار زيادة الإيجار بنسبة 5% (حسب الإجراءات المعتمدة).'],
        en: ['5% rent increase addendum/notice (as per applicable procedures).']
      };
    }
    if(tpl === 'arrearsRenew'){
      return {
        ar: ['كشف حساب/بيان بالمتأخرات والمبالغ المتبقية.'],
        en: ['Statement of arrears / remaining balance.']
      };
    }
    if(tpl === 'arrearsCheque'){
      return {
        ar: ['صورة الشيك الراجع (إن وجد).','كشف حساب/بيان بالمتأخرات.'],
        en: ['Copy of returned cheque (if any).','Statement of arrears.']
      };
    }
    return { ar: [], en: [] };
  }

  function parseCustomAttachments(){
    const t = document.getElementById('notice-attachments-custom')?.value || '';
    return t.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }



  function getRentBasisSetting(){ return localStorage.getItem('re_rent_basis') || 'total'; }

  
  function getUsedNoticeRefs(){
    try { return JSON.parse(localStorage.getItem('re_notice_used_refs') || '[]') || []; }
    catch(e){ return []; }
  }
  function setUsedNoticeRefs(arr){
    try { localStorage.setItem('re_notice_used_refs', JSON.stringify((arr||[]).slice(-2000))); }
    catch(e){}
  }
  function formatNoticeCode(n){
    return 'NT-' + String(n).padStart(5,'0');
  }
  function getNoticeCounter(){
    let n = parseInt(localStorage.getItem('re_notice_counter') || '1', 10);
    if(!n || n < 1) n = 1;
    return n;
  }
  function setNoticeCounter(n){
    localStorage.setItem('re_notice_counter', String(n));
  }
  // Returns the next available notice number WITHOUT consuming it (no increment).
  function getNextAvailableNoticeNo(){
    let n = getNoticeCounter();
    const used = getUsedNoticeRefs();
    let code = formatNoticeCode(n);
    while(used.includes(code)){
      n += 1;
      code = formatNoticeCode(n);
    }
    // Keep counter aligned to the first available value (not yet committed)
    setNoticeCounter(n);
    return code;
  }
  // Backward compatible alias
  function getNextNoticeNo(){
    return getNextAvailableNoticeNo();
  }
  // Commit the current reference so it won't be reused, and advance counter.
  function commitNoticeNo(ref){
    const code = String(ref || '').trim();
    if(!code) return;

    const used = getUsedNoticeRefs();
    if(!used.includes(code)){
      used.push(code);
      setUsedNoticeRefs(used);
    }

    const m = /^NT-(\d{5})$/.exec(code);
    if(m){
      const num = parseInt(m[1], 10);
      let counter = getNoticeCounter();
      if(num >= counter) counter = num + 1;
      setNoticeCounter(counter);
    }
  }


  function formatEnglishDate(dateStr){
    const d = dateStr ? new Date(dateStr) : new Date();
    if(isNaN(d)) return '';
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
  }

  function formatArabicDate(dateStr){
    const d = dateStr ? new Date(dateStr) : new Date();
    if(isNaN(d)) return '';
    return d.toLocaleDateString('ar-AE', { year:'numeric', month:'long', day:'numeric' });
  }

  function formatDMY(dateStr){
    const d = dateStr ? new Date(dateStr) : new Date();
    if(isNaN(d)) return '';
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }


  function findUnitByComposite(composite){
    if(!composite) return { prop:null, unit:null };
    const [pid, uid] = String(composite).split('::');
    const prop = properties.find(p => String(p.id) === String(pid)) || null;
    const unit = prop?.units?.find(u => String(u.id) === String(uid)) || null;
    return { prop, unit };
  }

  function textToHtml(s){
    const raw = String(s||'').replace(/\r\n/g,'\n').trim();
    if(!raw) return '';
    const blocks = raw.split(/\n\s*\n+/g);
    const out = [];
    for(const b of blocks){
      const lines = b.split('\n').map(x=>x.trim()).filter(Boolean);
      if(!lines.length) continue;
      const isList = lines.every(l => /^[-•*]\s+/.test(l));
      if(isList){
        const items = lines.map(l => escHtml(l.replace(/^[-•*]\s+/, '').trim()));
        out.push('<ul class="letter-list">' + items.map(i=>`<li>${i}</li>`).join('') + '</ul>');
      }else{
        const txt = escHtml(lines.join(' '));
        out.push(`<p class="letter-p">${txt}</p>`);
      }
    }
    return out.join('');
  }

  function updateNoticeExtraOptions(){
    const tpl = document.getElementById('notice-template-select')?.value || 'blank';
    const box = document.getElementById('notice-extra-options');
    if(!box) return;

    const isIncrease = tpl === 'increase5';
    const isArrears = (tpl === 'arrearsRenew' || tpl === 'arrearsCheque');

    box.classList.toggle('hidden', !(isIncrease || isArrears));

    const incBox = document.getElementById('notice-extra-increase5');
    if(incBox) incBox.classList.toggle('hidden', !isIncrease);

    const arrBox = document.getElementById('notice-extra-arrears');
    if(arrBox) arrBox.classList.toggle('hidden', !isArrears);
  }


  // ===== Notices: Auto arrears calculation =====
  function normalizeMatchStr(v){
    return String(v||'')
      .toLowerCase()
      .replace(/\s+/g,'')
      .replace(/[–—\-_/\\]+/g,'');
  }

  function noticeUnitMatchTokens(ctx, unit, prop){
    const strict = [];
    const loose = [];
    const add = (arr, x)=>{ if(x!==undefined && x!==null && String(x).trim()) arr.push(String(x).trim()); };

    // Strict identifiers (reduce false matches)
    add(strict, unit?.id);
    add(strict, unit?.code);
    add(strict, unit?.unitCode);
    add(strict, unit?.name);
    add(strict, ctx?.contractNo);

    // Loose identifiers (fallback if no matches found)
    strict.forEach(x=> add(loose, x));
    add(loose, prop?.id);
    add(loose, prop?.name);

    const uniq = (arr)=> Array.from(new Set(arr));
    return { strict: uniq(strict), loose: uniq(loose) };
  }

  function paymentMatchesNoticeUnit(p, tokens){
    const hay = normalizeMatchStr([p.unit, p.contract, p.desc, p.type, p.voucherNo].filter(Boolean).join(' | '));
    if(!hay) return false;
    return tokens.some(t=>{
      const nt = normalizeMatchStr(t);
      return nt && hay.includes(nt);
    });
  }

  function chequeMatchesUnitTokens(c, tokens){
    const hay = normalizeMatchStr([c.tenant, c.purpose, c.chequeNo, c.bank].filter(Boolean).join(' | '));
    if(!hay) return false;
    return tokens.some(t=>{
      const nt = normalizeMatchStr(t);
      return nt && hay.includes(nt);
    });
  }

  function computeNoticeUnitPaid(ctx, unit, prop){
    const tokenSets = noticeUnitMatchTokens(ctx, unit, prop);
    const tkey = tenantKey(ctx?.tenantName);

    const matchTokens = (tokens)=> payments.filter(p=>{
      if(tenantKey(p.tenant) !== tkey) return false;

      // Direct unitId match (best signal when available)
      if(p.unitId && unit && unit.id && p.unitId === unit.id) return true;

      // Direct match (unit/contract/description)
      if(paymentMatchesNoticeUnit(p, tokens)) return true;

      // If this payment came from a cashed cheque, try to match on cheque purpose too
      if(p.chequeId){
        const chRaw = cheques.find(c=>c.id === p.chequeId);
        const ch = chRaw ? normalizeChequeRecord(chRaw) : null;
        if(ch){
          const hay2 = normalizeMatchStr([ch.purpose, ch.chequeNo, ch.bank].filter(Boolean).join(' | '));
          return tokens.some(t=>{
            const nt = normalizeMatchStr(t);
            return nt && hay2.includes(nt);
          });
        }
      }
      return false;
    });

    // Prefer strict matching; if nothing found, fallback to loose matching
    let matchedPayments = matchTokens(tokenSets.strict);
    if(matchedPayments.length === 0){
      matchedPayments = matchTokens(tokenSets.loose);
    }

    let paid = matchedPayments.reduce((s,p)=> s + Number(p.amount||0), 0);

    // ---- Cheques suggestions (returned / pending) ----
    // We primarily filter by the same tenant; if we can match by unit tokens (purpose/cheque text), we prefer that.
    const tenantChequesAll = cheques
      .map(normalizeChequeRecord)
      .filter(c => tenantKey(c.tenant) === tkey);

    const unitId = unit && unit.id ? unit.id : '';
    const linked = unitId ? tenantChequesAll.filter(c=> (c.unitId||'') === unitId) : [];
    const tenantCheques = linked.length ? linked : tenantChequesAll;

    // ---- Include cashed cheques as paid when no payment record exists (legacy/imported data) ----
    // Some older data may have cheques marked as "مصروف" without a corresponding payment entry.
    // To keep notices accurate, we add those cheque values to paid (while avoiding double counting).
    const pickCashed = (tokens)=>{
      const list = tenantCheques.filter(c => chequeStatusBucket(c.status) === 'cashed');
      if(list.length === 0) return [];
      const matched = list.filter(c => {
        // Direct unitId match is best when available
        if(unitId && (c.unitId||'') && (c.unitId||'') === unitId) return true;
        return chequeMatchesUnitTokens(c, tokens);
      });
      return matched;
    };

    let cashedCheques = pickCashed(tokenSets.strict);
    if(cashedCheques.length === 0) cashedCheques = pickCashed(tokenSets.loose);

    const cashedMissingPayment = cashedCheques.filter(c => !(payments||[]).some(p => p.chequeId === c.id));
    const cashedExtraPaid = cashedMissingPayment.reduce((s,c)=> s + Number(c.value||0), 0);
    if(cashedExtraPaid) paid += cashedExtraPaid;


    const pickCheques = (bucket, tokens)=>{
      const list = tenantCheques.filter(c => chequeStatusBucket(c.status) === bucket);
      if(list.length === 0) return [];

      const matched = list.filter(c => {
        // ✅ إذا كان الشيك مربوطًا بنفس الوحدة المختارة، اعتبره مطابق مباشرة
        if(unitId && String(c.unitId || '') === String(unitId)) return true;
        // ✅ احتياطياً: مطابقة بالنص إذا لم يكن هناك ربط للوحدة
        return chequeMatchesUnitTokens(c, tokens);
      });

      return matched;
    };

    // Prefer strict tokens; fallback to loose
    let returnedCheques = pickCheques('returned', tokenSets.strict);
    let pendingCheques  = pickCheques('pending',  tokenSets.strict);
    if(returnedCheques.length === 0 && pendingCheques.length === 0){
      returnedCheques = pickCheques('returned', tokenSets.loose);
      pendingCheques  = pickCheques('pending',  tokenSets.loose);
    }

    returnedCheques = returnedCheques.slice().sort((a,b)=> new Date(b.dueDate||'1970-01-01') - new Date(a.dueDate||'1970-01-01'));
    pendingCheques  = pendingCheques.slice().sort((a,b)=> new Date(b.dueDate||'1970-01-01') - new Date(a.dueDate||'1970-01-01'));

    const suggestedDetailsAr = [];
    const suggestedDetailsEn = [];

    returnedCheques.slice(0,5).forEach(c=>{
      const extra = c.purpose ? ` — ${escHtml(c.purpose)}` : '';
      const dueAr = c.dueDate ? formatArabicDate(c.dueDate) : '';
      suggestedDetailsAr.push(`شيك راجع رقم ${c.chequeNo||'—'} بقيمة ${formatAED(c.value||0)} مستحق ${dueAr}${extra}`.trim());
      const dueEn = c.dueDate ? formatEnglishDate(c.dueDate) : '—';
      let reasonEn = '';
      const p = String(c.purpose||'').trim();
      if(p){
        const hasAr = /[\u0600-\u06FF]/.test(p);
        if(hasAr){
          if(p.includes('عدم كفاية الرصيد')) reasonEn = ' — Reason: Insufficient Funds';
        }else{
          reasonEn = ` — Reason: ${p}`;
        }
      }
      suggestedDetailsEn.push(`Returned Cheque No. ${c.chequeNo||'—'} — ${formatAED(c.value||0)} — Due: ${dueEn}${reasonEn}`.trim());
    });

    pendingCheques.slice(0,5).forEach(c=>{
      const extra = c.purpose ? ` — ${escHtml(c.purpose)}` : '';
      const dueAr = c.dueDate ? formatArabicDate(c.dueDate) : '';
      suggestedDetailsAr.push(`شيك بانتظار الصرف رقم ${c.chequeNo||'—'} بقيمة ${formatAED(c.value||0)} مستحق ${dueAr}${extra}`.trim());
      const dueEn = c.dueDate ? formatEnglishDate(c.dueDate) : '—';
      suggestedDetailsEn.push(`Cheque Pending Clearance No. ${c.chequeNo||'—'} — ${formatAED(c.value||0)} — Due: ${dueEn}`.trim());
    });

    const suggestedAr = suggestedDetailsAr.join('؛ ');
    const suggestedEn = suggestedDetailsEn.join('; ');

    return {
      paid, matchedPayments, returnedCheques, pendingCheques, cashedCheques, cashedMissingPayment, cashedExtraPaid,
      suggestedDetailsText: suggestedAr,
      suggestedDetailsTextAr: suggestedAr,
      suggestedDetailsTextEn: suggestedEn
    };
  }

  function autofillNoticeArrears(force=false){
    const tplSel = document.getElementById('notice-template-select');
    const tenantSel = document.getElementById('notice-tenant-select');
    const unitSel = document.getElementById('notice-unit-select');
    if(!tplSel || !tenantSel || !unitSel) return;

    const template = tplSel.value;
    if(!(template === 'arrearsRenew' || template === 'arrearsCheque')) return;

    const autoEl = document.getElementById('notice-arrears-autofill');
    const autoOn = autoEl ? autoEl.checked : true;
    if(!autoOn && !force) return;

    const tenantKeyVal = tenantSel.value || '';
    const unitVal = unitSel.value || '';
    if(!tenantKeyVal || !unitVal) return;

    const [propId, unitId] = unitVal.split('::');
    const prop = properties.find(p=> String(p.id)===String(propId));
    const unit = prop?.units?.find(u=> String(u.id)===String(unitId));
    if(!prop || !unit) return;

    const ctx = {
      tenantName: unit?.tenant || '',
      propName: prop?.name || '',
      unitName: unit?.name || '',
      contractNo: unit?.contractNo || '',
      start: unit?.start || '',
      end: unit?.end || '',
      rent: unit?.rent || 0
    };

    const basis = getRentBasisSetting(); // 'total' | 'annual'
    const oldVal = Number(ctx.rent || 0);
    const contractTotal = (basis === 'annual') ? calcContractValueFromAnnual(oldVal, ctx.start, ctx.end) : oldVal;

    const info = computeNoticeUnitPaid(ctx, unit, prop);
    const balance = Math.max(0, Number(contractTotal||0) - Number(info.paid||0));

    const contractValueInput = document.getElementById('notice-contract-value');
    const arrearsAmountInput = document.getElementById('notice-arrears-amount');
    const arrearsDetailsInput = document.getElementById('notice-arrears-details');

    if(contractValueInput && (force || !contractValueInput.value || Number(contractValueInput.value)===0)){
      if(contractTotal) contractValueInput.value = Math.round(Number(contractTotal));
    }
    if(arrearsAmountInput && (force || !arrearsAmountInput.value || Number(arrearsAmountInput.value)===0)){
      arrearsAmountInput.value = Math.round(Number(balance));
    }

    // For arrears templates, propose details automatically (returned/pending cheques)
// Note: we keep user edits. If the field was auto-generated before, we keep updating it automatically.
// If user types manually, it stops auto-updating until they click "تحديث تلقائي".
    if(arrearsDetailsInput){
      const wasAuto = arrearsDetailsInput.dataset.autogen === '1';
      const shouldUpdateDetails = force || !arrearsDetailsInput.value.trim() || wasAuto;
      if(shouldUpdateDetails){
        arrearsDetailsInput.value = info.suggestedDetailsTextAr || info.suggestedDetailsText || '';
        arrearsDetailsInput.dataset.autogen = '1';
      }
    }

    const status = document.getElementById('notice-preview-status');
    if(status){
      status.textContent = `تم تحديث المتأخرات تلقائياً — المدفوعات: ${formatAED(info.paid)} ، المتبقي: ${formatAED(balance)} ، شيكات راجعة: ${info.returnedCheques.length} ، بانتظار الصرف: ${info.pendingCheques.length}`;
    }
  }



  let noticePreviewReady = false;
let noticeLoadedFromLog = false;

  function escHtml(v){
    return String(v ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }


    function escJsStr(v){
      return String(v ?? '')
        .replace(/\\/g,'\\\\')
        .replace(/'/g,"\\'")
        .replace(/\r/g,'\\r')
        .replace(/\n/g,'\\n')
        .replace(/\u2028/g,'\\u2028')
        .replace(/\u2029/g,'\\u2029');
    }

    

    

    // ===== Input normalization & validation helpers =====
    const AR_DIGITS_MAP = {
      '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
      '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'
    };

    function normalizeDigits(v){
      const s = String(v ?? '');
      // Arabic thousand/decimal separators: ٬ (U+066C), ٫ (U+066B)
      return s
        .replace(/[٠-٩۰-۹]/g, ch => AR_DIGITS_MAP[ch] ?? ch)
        .replace(/[٬,]/g, ',')
        .replace(/٫/g, '.');
    }

    function normalizeText(v, {collapseSpaces=true} = {}){
      let s = String(v ?? '').replace(/\u200f/g,'').replace(/\u200e/g,'');
      s = s.trim();
      if(collapseSpaces) s = s.replace(/\s+/g,' ');
      return s;
    }

    function normalizeEmail(v){
      const s = normalizeText(v, {collapseSpaces:false}).toLowerCase();
      return s;
    }

    function normalizePhone(v){
      // Keep + and digits only
      const s = normalizeDigits(v).replace(/[^\d+]/g,'').replace(/^\+{2,}/,'+');
      return s;
    }

    function parseMoney(v){
      const s = normalizeDigits(v)
        .replace(/\s/g,'')
        .replace(/,/g,'');
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : 0;
    }

    function parseIntSafe(v){
      const s = normalizeDigits(v).replace(/\s/g,'').replace(/,/g,'');
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : 0;
    }

    function isValidEmail(v){
      const s = normalizeEmail(v);
      if(!s) return true;
      // Simple practical validation (not RFC strict)
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
    }

    function isDateOrderOk(start, end){
      if(!start || !end) return true;
      try{
        const a = new Date(start);
        const b = new Date(end);
        if(Number.isNaN(+a) || Number.isNaN(+b)) return true;
        return a.getTime() <= b.getTime();
      }catch(e){
        return true;
      }
    }

    function findUnitsByContractNo(contractNo){
      const cn = normalizeText(contractNo, {collapseSpaces:false});
      if(!cn) return [];
      const hits = [];
      try{
        (properties||[]).forEach(p=>{
          (p.units||[]).forEach(u=>{
            if(normalizeText(u.contractNo||'', {collapseSpaces:false}) === cn && (u.status||'') !== 'شاغرة'){
              hits.push({ propId: p.id, propName: p.name, unitId: u.id, unitName: u.name, tenant: u.tenant, start: u.start, end: u.end });
            }
          });
        });
      }catch(e){}
      return hits;
    }

// ===== Toast API (replaces alert) =====
    function uiToast(type, message, opts={}){
      const stack = document.getElementById('toast-stack');
      // Fallback if stack missing
      if(!stack){
        try{ console[type==='error'?'error':'log'](message); }catch(_){}
        try{ alert(String(message||'')); }catch(_){}
        return;
      }

      const t = (type || 'info').toLowerCase();
      const icons = {
        success: '✅',
        error: '⛔',
        warn: '⚠️',
        info: 'ℹ️'
      };
      const titles = {
        success: 'تم',
        error: 'خطأ',
        warn: 'تنبيه',
        info: 'معلومة'
      };

      const el = document.createElement('div');
      el.className = 'toast-item';
      el.dataset.type = ['success','error','warn','info'].includes(t) ? t : 'info';

      const ttl = opts.title || titles[el.dataset.type] || 'معلومة';
      const msg = String(message ?? '');

      const icon = opts.icon || icons[el.dataset.type] || icons.info;

      el.innerHTML = `
        <div class="toast-ic" aria-hidden="true">${icon}</div>
        <div class="toast-body">
          <div class="toast-title">${escHtml(ttl)}</div>
          <div class="toast-msg">${escHtml(msg)}</div>
        </div>
        <div class="toast-actions">
          <button class="toast-x" type="button" aria-label="إغلاق">✕</button>
        </div>
      `;

      const close = ()=>{
        el.classList.add('toast-hide');
        setTimeout(()=>{ try{ el.remove(); }catch(_){} }, 220);
      };

      el.querySelector('.toast-x')?.addEventListener('click', close);

      // Newest on top
      stack.prepend(el);

      const duration = Math.max(1500, Number(opts.duration || 3400));
      const handle = { close };
      if(opts.sticky) return handle;

      setTimeout(close, duration);
      return handle;
}

    // Backward-friendly helpers
    function uiAlert(msg){ uiToast('info', msg); }
    function uiError(msg){ uiToast('error', msg); }
    function uiSuccess(msg){ uiToast('success', msg); }
    function uiWarn(msg){ uiToast('warn', msg); }


      

    
    // ===== Global Error Catcher (shows toast + logs) =====
    (function(){
      try{
        window.__reErrorLog = window.__reErrorLog || [];
        function _pushErr(kind, msg, src, line, col){
          try{
            const item = { t: Date.now(), kind, msg: String(msg||''), src: String(src||''), line: line||0, col: col||0 };
            window.__reErrorLog.unshift(item);
            window.__reErrorLog = window.__reErrorLog.slice(0, 50);
            try{ localStorage.setItem('re_error_log_last', JSON.stringify(window.__reErrorLog)); }catch(e){}
          }catch(e){}
        }
        window.addEventListener('error', function(e){
          const msg = (e && e.message) ? e.message : 'حدث خطأ غير متوقع';
          _pushErr('error', msg, e && e.filename, e && e.lineno, e && e.colno);
          try{ uiToast('error', msg, {title:'خطأ'}); }catch(_){}
        });
        window.addEventListener('unhandledrejection', function(e){
          const msg = (e && e.reason) ? (e.reason.message || String(e.reason)) : 'خطأ غير معالج';
          _pushErr('rejection', msg, '', 0, 0);
          try{ uiToast('error', msg, {title:'خطأ'}); }catch(_){}
        });
      }catch(e){}
    })();

// ===== Performance Settings (stored in LocalStorage) =====
    const PERF_KEYS = {
      debounceMs: 're_perf_debounce_ms',
      autoBackupEnabled: 're_perf_auto_backup_enabled',
      autoBackupIntervalS: 're_perf_auto_backup_interval_s'
    };

    function _perfInitDefaults(){
      try{
        if(localStorage.getItem(PERF_KEYS.debounceMs) === null) localStorage.setItem(PERF_KEYS.debounceMs, '220');
        if(localStorage.getItem(PERF_KEYS.autoBackupEnabled) === null) localStorage.setItem(PERF_KEYS.autoBackupEnabled, '1');
        if(localStorage.getItem(PERF_KEYS.autoBackupIntervalS) === null) localStorage.setItem(PERF_KEYS.autoBackupIntervalS, '60');
      }catch(e){}
    }

    function getDebounceMs(){
      _perfInitDefaults();
      const v = Number(localStorage.getItem(PERF_KEYS.debounceMs) || '220');
      return Number.isFinite(v) ? Math.max(0, v) : 220;
    }

    function isAutoBackupEnabled(){
      _perfInitDefaults();
      const v = String(localStorage.getItem(PERF_KEYS.autoBackupEnabled) || '1');
      return !(v === '0' || v.toLowerCase() === 'false');
    }

    function getAutoBackupMinIntervalMs(){
      _perfInitDefaults();
      const s = Number(localStorage.getItem(PERF_KEYS.autoBackupIntervalS) || '60');
      const sec = Number.isFinite(s) ? Math.max(10, s) : 60;
      return sec * 1000;
    }

    function renderPerfSettings(){
      _perfInitDefaults();
      const selDeb = document.getElementById('perf-debounce');
      const selInt = document.getElementById('perf-autobackup-interval');
      const chk = document.getElementById('perf-autobackup-enabled');
      const knob = document.getElementById('perf-autobackup-knob');

      if(selDeb) selDeb.value = String(getDebounceMs());
      if(selInt) selInt.value = String(Math.round(getAutoBackupMinIntervalMs()/1000));
      if(chk) chk.checked = isAutoBackupEnabled();

      // Update switch visuals
      try{
        if(chk && knob){
          const track = knob.parentElement;
          if(chk.checked){
            track.classList.remove('bg-gray-300','dark:bg-gray-700');
            track.classList.add('bg-emerald-500');
            knob.classList.remove('right-0.5');
            knob.classList.add('left-0.5');
          }else{
            track.classList.remove('bg-emerald-500');
            track.classList.add('bg-gray-300','dark:bg-gray-700');
            knob.classList.remove('left-0.5');
            knob.classList.add('right-0.5');
          }
        }
      }catch(e){}
    }

    function applyPerfSettingsFromUI(){
      try{
        const selDeb = document.getElementById('perf-debounce');
        const selInt = document.getElementById('perf-autobackup-interval');
        const chk = document.getElementById('perf-autobackup-enabled');

        if(selDeb) localStorage.setItem(PERF_KEYS.debounceMs, String(selDeb.value || '220'));
        if(selInt) localStorage.setItem(PERF_KEYS.autoBackupIntervalS, String(selInt.value || '60'));
        if(chk) localStorage.setItem(PERF_KEYS.autoBackupEnabled, chk.checked ? '1' : '0');

        // Reset debouncer cache so new debounce value takes effect immediately
        try{ window.__reDebouncers = {}; }catch(e){}
renderPerfSettings();
        uiToast('success', 'تم حفظ إعدادات الأداء ✅');
      }catch(e){
        console.error('applyPerfSettingsFromUI failed:', e);
        uiToast('error', 'تعذر حفظ إعدادات الأداء');
      }
    }

    

    // ===== Data Health Check =====
    const HEALTH_REPORT_KEY = 're_health_report_last';

    function _isValidISODate(d){
      if(!d) return true;
      const s = String(d).trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
      const dt = new Date(s + 'T12:00:00Z');
      return !isNaN(dt.getTime());
    }

    function _cmpISO(a,b){
      try{
        if(!a || !b) return 0;
        return (new Date(a+'T12:00:00Z')).getTime() - (new Date(b+'T12:00:00Z')).getTime();
      }catch(e){ return 0; }
    }

    function _toNumSafe(v){
      const s = normalizeDigits(v);
      const n = Number(String(s).replace(/,/g,'').trim());
      return Number.isFinite(n) ? n : 0;
    }

    function renderHealthReportFromCache(){
      try{
        const raw = localStorage.getItem(HEALTH_REPORT_KEY);
        if(!raw) return;
        const r = JSON.parse(raw);
        renderHealthReport(r);
      }catch(e){}
    }

    function renderHealthReport(report){
      const box = document.getElementById('health-report-box');
      if(!box) return;

      if(!report || !report.generatedAt){
        box.innerHTML = '<div class="text-sm text-gray-500 dark:text-gray-400">لم يتم تشغيل الفحص بعد.</div>';
        return;
      }

      const issues = Array.isArray(report.issues) ? report.issues : [];
      const counts = report.counts || { error:0, warn:0, info:0 };

      // keep last report for actions
      try{ window.__lastHealthReport = report; }catch(e){}
      const gen = (()=>{ try{ return new Date(report.generatedAt).toLocaleString('ar-AE'); }catch(e){ return report.generatedAt; } })();

      const kpis = `
        <div class="health-kpi mb-3">
          <div class="k">آخر فحص: ${escHtml(gen)}</div>
          <div class="k">أخطاء: <span class="badge-red">${escHtml(String(counts.error||0))}</span></div>
          <div class="k">تحذيرات: <span class="badge-amber">${escHtml(String(counts.warn||0))}</span></div>
          <div class="k">معلومات: <span class="badge-blue">${escHtml(String(counts.info||0))}</span></div>
          <div class="k">الإجمالي: ${escHtml(String(issues.length))}</div>
        </div>
      `;

      if(!issues.length){
        box.innerHTML = kpis + '<div class="text-sm text-gray-600 dark:text-gray-300">لا توجد ملاحظات ✅</div>';
        return;
      }

      const rows = issues.slice(0, 80).map((it, i)=>{
        const lvl = String(it.level||'info');
        let badge = 'badge-blue';
        if(lvl==='error') badge = 'badge-red';
        else if(lvl==='warn') badge = 'badge-amber';
        const t = escHtml(String(it.type||''));
        const msg = escHtml(String(it.message||''));
        const ref = escHtml(String(it.ref||''));
        return `
          <tr class="border-b border-gray-100 dark:border-gray-700">
            <td class="py-2 px-3 text-sm ui-td-ltr">${i+1}</td>
            <td class="py-2 px-3 text-sm"><span class="${badge}">${escHtml(lvl)}</span></td>
            <td class="py-2 px-3 text-sm">${t}</td>
            <td class="py-2 px-3 text-sm">${msg}</td>
            <td class="py-2 px-3 text-sm ui-td-ltr">${ref}</td>
              <td class="py-2 px-3 text-sm">
                <div class="flex items-center justify-end gap-2 flex-wrap">
                  <button type="button" onclick="openHealthIssue(${i})"
                          class="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-gray-700 bg-white/65 dark:bg-gray-900/35 hover:bg-white/85 dark:hover:bg-gray-900/55">
                    فتح
                  </button>
                  <button type="button" onclick="copyHealthIssue(${i})"
                          class="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-gray-700 bg-white/65 dark:bg-gray-900/35 hover:bg-white/85 dark:hover:bg-gray-900/55">
                    نسخ
                  </button>
                </div>
              </td>
            </tr>
        `;
      }).join('');

      box.innerHTML = kpis + `
        <div class="overflow-auto">
          <table class="min-w-full text-right">
            <thead class="sticky top-0 bg-white dark:bg-gray-800">
              <tr class="border-b border-gray-200 dark:border-gray-700">
                <th class="py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-200">#</th>
                <th class="py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-200">المستوى</th>
                <th class="py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-200">النوع</th>
                <th class="py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-200">الوصف</th>
                <th class="py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-200">Ref</th>
              
                <th class=\"py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-200\">إجراء</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="mt-2 text-[11px] text-gray-500 dark:text-gray-400">يتم عرض أول 80 بند فقط في الشاشة.</div>
      `;
    }

    function runHealthCheck(){
      const busy = uiToast('info', '⏳ جاري فحص سلامة البيانات...', {sticky:true, duration: 60000, title:'فحص'});
      try{
        const issues = [];
        const add = (level, type, message, ref='') => issues.push({ level, type, message, ref });

        // ---- Properties / Units ----
        if(!Array.isArray(properties)){
          add('error','data','properties ليست مصفوفة','properties');
        } else {
          const propIds = new Set();
          const unitIds = new Set();

          properties.forEach((p, pi)=>{
            const pid = normalizeText(p?.id ?? '');
            const pname = normalizeText(p?.name ?? '');
            if(!pid) add('warn','property','معرف العقار فارغ', `properties[${pi}]`);
            if(pid){
              if(propIds.has(pid)) add('error','property','تكرار معرف عقار', pid);
              propIds.add(pid);
            }
            if(!pname) add('warn','property','اسم العقار فارغ', pid || `properties[${pi}]`);
            if(p?.units && !Array.isArray(p.units)){
              add('error','unit','قائمة الوحدات ليست مصفوفة', pid || `properties[${pi}]`);
            }
            (Array.isArray(p?.units)?p.units:[]).forEach((u, ui)=>{
              const uid = normalizeText(u?.id ?? '');
              if(!uid) add('warn','unit','معرف الوحدة فارغ', `${pid}/units[${ui}]`);
              if(uid){
                if(unitIds.has(uid)) add('error','unit','تكرار معرف وحدة عبر العقارات', uid);
                unitIds.add(uid);
              }

              // dates
              const st = normalizeText(u?.start ?? '');
              const en = normalizeText(u?.end ?? '');
              if(st && !_isValidISODate(st)) add('warn','lease','تاريخ بداية غير صحيح', `${pid}/${uid}`);
              if(en && !_isValidISODate(en)) add('warn','lease','تاريخ نهاية غير صحيح', `${pid}/${uid}`);
              if(st && en && _cmpISO(st,en) > 0) add('error','lease','تاريخ البداية أكبر من النهاية', `${pid}/${uid}`);

              const status = normalizeText(u?.status ?? '');
              const tenant = normalizeText(u?.tenant ?? '');
              const cn = normalizeText(u?.contractNo ?? '');
              const rent = _toNumSafe(u?.rent ?? 0);

              if(status === 'مؤجرة' && !tenant) add('warn','lease','الوحدة مؤجرة بدون اسم مستأجر', `${pid}/${uid}`);
              if(tenant && !cn) add('warn','lease','يوجد مستأجر بدون رقم عقد', `${pid}/${uid}`);
              if((cn || tenant) && rent <= 0) add('warn','lease','الإيجار غير صحيح أو صفر', `${pid}/${uid}`);
            });
          });
        }

        // ---- Cheques ----
        if(!Array.isArray(cheques)){
          add('error','data','cheques ليست مصفوفة','cheques');
        } else {
          const ids = new Set();
          cheques.forEach((c, i)=>{
            const id = normalizeText(c?.id ?? '');
            if(!id) add('warn','cheque','معرف الشيك فارغ', `cheques[${i}]`);
            if(id){
              if(ids.has(id)) add('error','cheque','تكرار معرف شيك', id);
              ids.add(id);
            }
            const tenant = normalizeText(c?.tenant ?? '');
            if(!tenant) add('warn','cheque','اسم المستأجر فارغ', id || `cheques[${i}]`);

            const due = normalizeText(c?.dueDate ?? '');
            if(due && !_isValidISODate(due)) add('warn','cheque','تاريخ استحقاق غير صحيح', id || `cheques[${i}]`);

            const val = _toNumSafe(c?.value ?? c?.amount ?? 0);
            if(val <= 0) add('warn','cheque','قيمة الشيك غير صحيحة أو صفر', id || `cheques[${i}]`);

            const unitId = normalizeText(c?.unitId ?? '');
            if(unitId){
              try{
                const ok = !!getUnitById(unitId);
                if(!ok) add('warn','cheque','الشيك مرتبط بوحدة غير موجودة', `${id||'cheque'} -> ${unitId}`);
              }catch(e){}
            }
          });
        }

        // ---- Expenses ----
        if(!Array.isArray(expenses)){
          add('error','data','expenses ليست مصفوفة','expenses');
        } else {
          expenses.forEach((x, i)=>{
            const amt = _toNumSafe(x?.amount ?? 0);
            if(amt <= 0) add('warn','expense','مبلغ مصروف غير صحيح أو صفر', x?.id || `expenses[${i}]`);
            const d = normalizeText(x?.date ?? '');
            if(d && !_isValidISODate(d)) add('warn','expense','تاريخ المصروف غير صحيح', x?.id || `expenses[${i}]`);
          });
        }

        // ---- Payments ----
        if(!Array.isArray(payments)){
          add('error','data','payments ليست مصفوفة','payments');
        } else {
          payments.forEach((p, i)=>{
            const amt = _toNumSafe(p?.amount ?? 0);
            if(amt <= 0) add('warn','payment','مبلغ الدفعة غير صحيح أو صفر', p?.id || `payments[${i}]`);
            const d = normalizeText(p?.date ?? '');
            if(d && !_isValidISODate(d)) add('warn','payment','تاريخ الدفعة غير صحيح', p?.id || `payments[${i}]`);
            const tenant = normalizeText(p?.tenant ?? '');
            if(!tenant) add('warn','payment','اسم المستأجر فارغ', p?.id || `payments[${i}]`);
          });
        }

        // ---- Lease Payments ----
        if(!Array.isArray(leasePayments)){
          add('error','data','leasePayments ليست مصفوفة','leasePayments');
        } else {
          leasePayments.forEach((lp, i)=>{
            const d = normalizeText(lp?.date ?? '');
            if(d && !_isValidISODate(d)) add('warn','leasePayment','تاريخ دفعة عقد غير صحيح', lp?.id || `leasePayments[${i}]`);
            const total = _toNumSafe(lp?.total ?? 0);
            if(total <= 0) add('warn','leasePayment','إجمالي دفعة عقد غير صحيح أو صفر', lp?.id || `leasePayments[${i}]`);
          });
        }

        // ---- Salaries ----
        if(!Array.isArray(salaries)){
          add('error','data','salaries ليست مصفوفة','salaries');
        } else {
          salaries.forEach((s, i)=>{
            const amt = _toNumSafe(s?.amount ?? 0);
            if(amt <= 0) add('warn','salary','مبلغ راتب غير صحيح أو صفر', s?.voucherNo || `salaries[${i}]`);
            const d = normalizeText(s?.date ?? '');
            if(d && !_isValidISODate(d)) add('warn','salary','تاريخ راتب غير صحيح', s?.voucherNo || `salaries[${i}]`);
            const nm = normalizeText(s?.name ?? '');
            if(!nm) add('warn','salary','اسم الموظف فارغ', s?.voucherNo || `salaries[${i}]`);
          });
        }

        const counts = {
          error: issues.filter(x=>x.level==='error').length,
          warn: issues.filter(x=>x.level==='warn').length,
          info: issues.filter(x=>x.level==='info').length
        };

        const report = {
          generatedAt: new Date().toISOString(),
          counts,
          issues
        };

        try{ localStorage.setItem(HEALTH_REPORT_KEY, JSON.stringify(report)); }catch(e){}
        renderHealthReport(report);

        if(counts.error>0) uiToast('error', `تم الفحص: ${counts.error} أخطاء، ${counts.warn} تحذيرات.` , {title:'نتيجة الفحص'});
        else if(counts.warn>0) uiToast('warn', `تم الفحص: لا توجد أخطاء، لكن يوجد ${counts.warn} تحذيرات.` , {title:'نتيجة الفحص'});
        else uiToast('success', 'تم الفحص: لا توجد ملاحظات ✅', {title:'نتيجة الفحص'});

      }catch(e){
        console.error('runHealthCheck failed:', e);
        uiToast('error', 'تعذر تشغيل الفحص.');
      }finally{
        try{ busy && busy.close && busy.close(); }catch(_){}
      }
    }

    function downloadHealthReport(){
      try{
        const raw = localStorage.getItem(HEALTH_REPORT_KEY);
        if(!raw){
          uiToast('warn','لا يوجد تقرير محفوظ بعد. قم بتشغيل الفحص أولاً.');
          return;
        }
        const ts = new Date().toISOString().replace(/[:.]/g,'-');
        const blob = new Blob([raw], {type:'application/json;charset=utf-8'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `health-report-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(()=>URL.revokeObjectURL(a.href), 500);
        uiToast('success','تم تحميل التقرير ✅');
      }catch(e){
        console.error('downloadHealthReport failed:', e);
        uiToast('error','تعذر تحميل التقرير');
      }
    }

    function applySafeDataFixes(){
      if(!confirm('سيتم تطبيق “إصلاح آمن” (تطبيع/تحويل أرقام/تثبيت الحقول) على البيانات الحالية ثم حفظها. هل تريد المتابعة؟')) return;
      const busy = uiToast('info','⏳ جاري تطبيق الإصلاح الآمن...', {sticky:true, duration: 60000, title:'إصلاح'});
      try{
        // Properties/Units normalization
        if(Array.isArray(properties)){
          properties.forEach(p=>{
            p.id = normalizeText(p.id);
            p.name = normalizeText(p.name);
            if(p.location != null) p.location = normalizeText(p.location);
            if(p.type != null) p.type = normalizeText(p.type);
            if(p.usage != null) p.usage = normalizeText(p.usage);
            if(!Array.isArray(p.units)) p.units = [];
            p.units.forEach(u=>{
              ensureUnitFields(u);
              u.id = normalizeText(u.id);
              u.unitNo = normalizeText(u.unitNo, {collapseSpaces:false});
              u.unitTitle = normalizeText(u.unitTitle);
              u.unitName = normalizeText(u.unitName, {collapseSpaces:false});
              u.status = normalizeText(u.status);
              u.tenant = normalizeText(u.tenant);
              u.contractNo = normalizeText(u.contractNo, {collapseSpaces:false});
              if(u.start) u.start = normalizeText(u.start, {collapseSpaces:false});
              if(u.end) u.end = normalizeText(u.end, {collapseSpaces:false});
              u.rent = _toNumSafe(u.rent);
              // meters
              if(u.elecMeterNo != null) u.elecMeterNo = normalizeText(u.elecMeterNo, {collapseSpaces:false});
              if(u.waterMeterNo != null) u.waterMeterNo = normalizeText(u.waterMeterNo, {collapseSpaces:false});
              if(u.taqaPropertyId != null) u.taqaPropertyId = normalizeText(u.taqaPropertyId, {collapseSpaces:false});
              if(!Array.isArray(u.leaseHistory)) u.leaseHistory = [];
            });
          });
        }
        ensureUnitsSchema();

        // Cheques normalization (and make value robust)
        if(Array.isArray(cheques)){
          cheques = cheques.map(c=>{
            const nc = normalizeChequeRecord(c);
            nc.tenant = normalizeText(nc.tenant);
            nc.chequeNo = normalizeText(nc.chequeNo, {collapseSpaces:false});
            nc.bank = normalizeText(nc.bank);
            nc.purpose = normalizeText(nc.purpose);
            nc.dueDate = normalizeText(nc.dueDate, {collapseSpaces:false});
            nc.unitId = normalizeText(nc.unitId, {collapseSpaces:false});
            nc.value = _toNumSafe(nc.value);
            if(nc.unitId && !nc.unitLabel) nc.unitLabel = getUnitDisplayById(nc.unitId);
            return nc;
          });
        }

        // Expenses
        if(Array.isArray(expenses)){
          expenses.forEach(x=>{
            if(x.id != null) x.id = normalizeText(x.id, {collapseSpaces:false});
            if(x.date != null) x.date = normalizeText(x.date, {collapseSpaces:false});
            if(x.type != null) x.type = normalizeText(x.type);
            if(x.details != null) x.details = normalizeText(x.details);
            x.amount = _toNumSafe(x.amount);
          });
        }

        // Payments
        if(Array.isArray(payments)){
          payments.forEach(p=>{
            if(p.id != null) p.id = normalizeText(p.id, {collapseSpaces:false});
            if(p.date != null) p.date = normalizeText(p.date, {collapseSpaces:false});
            if(p.tenant != null) p.tenant = normalizeText(p.tenant);
            if(p.unit != null) p.unit = normalizeText(p.unit);
            if(p.contract != null) p.contract = normalizeText(p.contract, {collapseSpaces:false});
            if(p.type != null) p.type = normalizeText(p.type);
            if(p.desc != null) p.desc = normalizeText(p.desc);
            p.amount = _toNumSafe(p.amount);
            if(p.due != null) p.due = _toNumSafe(p.due);
          });
        }

        // Lease Payments / Allocations
        if(Array.isArray(leasePayments)){
          leasePayments.forEach(lp=>{
            if(lp.id != null) lp.id = normalizeText(lp.id, {collapseSpaces:false});
            if(lp.date != null) lp.date = normalizeText(lp.date, {collapseSpaces:false});
            if(lp.tenant != null) lp.tenant = normalizeText(lp.tenant);
            if(lp.contractNo != null) lp.contractNo = normalizeText(lp.contractNo, {collapseSpaces:false});
            if(lp.contractGroupId != null) lp.contractGroupId = normalizeText(lp.contractGroupId, {collapseSpaces:false});
            if(lp.method != null) lp.method = normalizeText(lp.method);
            if(lp.notes != null) lp.notes = normalizeText(lp.notes);
            if(lp.total != null) lp.total = _toNumSafe(lp.total);
          });
        }
        if(Array.isArray(leaseAllocations)){
          leaseAllocations.forEach(a=>{
            if(a.id != null) a.id = normalizeText(a.id, {collapseSpaces:false});
            if(a.groupKey != null) a.groupKey = normalizeText(a.groupKey, {collapseSpaces:false});
            if(a.unitId != null) a.unitId = normalizeText(a.unitId, {collapseSpaces:false});
            if(a.amount != null) a.amount = _toNumSafe(a.amount);
          });
        }

        // Tenants contacts
        if(tenantsContacts && typeof tenantsContacts === 'object'){
          Object.keys(tenantsContacts).forEach(k=>{
            const t = tenantsContacts[k] || {};
            if(t.phone != null) t.phone = normalizePhone(t.phone);
            if(t.email != null) t.email = normalizeEmail(t.email);
            if(t.identity != null) t.identity = normalizeText(t.identity, {collapseSpaces:false});
            if(t.license != null) t.license = normalizeText(t.license, {collapseSpaces:false});
          });
        }

        // Salaries
        if(Array.isArray(salaries)){
          salaries.forEach(s=>{
            if(s.name != null) s.name = normalizeText(s.name);
            if(s.role != null) s.role = normalizeText(s.role);
            if(s.date != null) s.date = normalizeText(s.date, {collapseSpaces:false});
            if(s.notes != null) s.notes = normalizeText(s.notes);
            s.amount = _toNumSafe(s.amount);
          });
        }

        saveToLocal();

        // Refresh current view safely
        try{
          const activeBtn = document.querySelector('.nav-btn.active')?.id || '';
          const id = activeBtn.replace('nav-','') || 'dashboard';
          showView(id);
        }catch(e){}

        uiToast('success','تم تطبيق الإصلاح الآمن ✅');
        // Update report cache view
        renderHealthReportFromCache();
      }catch(e){
        console.error('applySafeDataFixes failed:', e);
        uiToast('error','تعذر تطبيق الإصلاح الآمن');
      }finally{
        try{ busy && busy.close && busy.close(); }catch(_){}
      }
    }

    // Export Health Check actions for inline onclick handlers
    try{
      

      // ===== Health Report Actions =====
      function _healthViewForType(type){
        const t = String(type||'').toLowerCase();
        if(t.includes('cheque')) return 'cheques';
        if(t.includes('expense')) return 'expenses';
        if(t.includes('payment')) return 'payments';
        if(t.includes('salary')) return 'salaries';
        if(t.includes('tenant')) return 'tenants';
        if(t.includes('unit') || t.includes('property') || t.includes('lease')) return 'properties';
        return 'settings';
      }

      function _healthPickQueryFromRef(ref){
        let q = String(ref||'').trim();
        if(!q) return '';
        if(q.includes('->')) q = q.split('->').pop().trim();
        if(q.includes('/')) q = q.split('/').pop().trim();
        if(q.includes('[')) q = q.replace(/\[.*?\]/g,'').trim();
        return q;
      }

      function _healthFindSearchInput(viewId){
        const root = document.getElementById('view-' + viewId) || document;
        // Prefer unified controls bar search
        let el = root.querySelector('.ui-controls-bar input[type="search"]')
              || root.querySelector('.ui-controls-bar input[placeholder*="بحث"]')
              || root.querySelector('.ui-controls-bar input[id*="search"]')
              || root.querySelector('.ui-controls-bar input[class*="search"]');
        // fallback
        if(!el){
          el = root.querySelector('input[type="search"], input[placeholder*="بحث"], input[id*="search"], input[class*="search"]');
        }
        return el;
      }

      function openHealthIssue(idx){
        try{
          const r = window.__lastHealthReport;
          const issues = r && Array.isArray(r.issues) ? r.issues : [];
          const it = issues[idx];
          if(!it){ uiToast('warn','لا يوجد بند مطابق في التقرير.'); return; }

          const view = _healthViewForType(it.type);
          const ref = String(it.ref||'').trim();
          const q = _healthPickQueryFromRef(ref);

          try{ showView(view); }catch(e){}

          setTimeout(()=>{
            try{
              const input = _healthFindSearchInput(view);
              if(input && q){
                input.value = q;
                input.dispatchEvent(new Event('input', {bubbles:true}));
                input.dispatchEvent(new Event('change', {bubbles:true}));
                uiToast('info', 'تم فتح الصفحة ومحاولة البحث عن المرجع.', {title:'توجيه'});
              }else{
                uiToast('info', 'تم فتح الصفحة. (لم يتم العثور على حقل بحث تلقائيًا)', {title:'توجيه'});
              }
            }catch(e){}
          }, 80);
        }catch(e){
          console.error('openHealthIssue failed:', e);
          uiToast('error','تعذر فتح البند.');
        }
      }

      async function _copyTextSafe(text){
        const s = String(text||'');
        if(!s) return false;
        try{
          if(navigator.clipboard && navigator.clipboard.writeText){
            await navigator.clipboard.writeText(s);
            return true;
          }
        }catch(e){}
        try{
          const ta = document.createElement('textarea');
          ta.value = s;
          ta.style.position = 'fixed';
          ta.style.top = '-9999px';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          return true;
        }catch(e){
          return false;
        }
      }

      async function copyHealthIssue(idx){
        try{
          const r = window.__lastHealthReport;
          const issues = r && Array.isArray(r.issues) ? r.issues : [];
          const it = issues[idx];
          if(!it){ uiToast('warn','لا يوجد بند مطابق في التقرير.'); return; }

          const line = `LEVEL=${it.level||''} | TYPE=${escHtml(it.type||'')} | MSG=${it.message||''} | REF=${it.ref||''}`;
          const ok = await _copyTextSafe(line);
          if(ok) uiToast('success','تم نسخ تفاصيل البند ✅', {title:'نسخ'});
          else uiToast('error','تعذر النسخ. (المتصفح قد يمنع الوصول للحافظة)');
        }catch(e){
          console.error('copyHealthIssue failed:', e);
          uiToast('error','تعذر نسخ البند.');
        }
      }


window.runHealthCheck = runHealthCheck;
      window.downloadHealthReport = downloadHealthReport;
      window.applySafeDataFixes = applySafeDataFixes;
      window.openHealthIssue = openHealthIssue;
      window.copyHealthIssue = copyHealthIssue;
      window.renderHealthReportFromCache = renderHealthReportFromCache;
    }catch(e){}


    // ===== Pagination Helpers (Optional) =====
    function _pagerState(key, defaultSize=25){
      window.__rePagerState = window.__rePagerState || {};
      if(!window.__rePagerState[key]){
        let page = 1;
        let size = defaultSize;
        try{
          const ps = Number(localStorage.getItem(`re_pager_${key}_size`) || defaultSize);
          const pp = Number(localStorage.getItem(`re_pager_${key}_page`) || 1);
          if(Number.isFinite(ps)) size = ps;
          if(Number.isFinite(pp)) page = pp;
        }catch(e){}
        window.__rePagerState[key] = { page: Math.max(1, page || 1), size: Math.max(5, size || defaultSize) };
      }
      const s = window.__rePagerState[key] || { page: 1, size: defaultSize };
      if(!s.size) s.size = defaultSize;
      window.__rePagerState[key] = s;
      return s;
    }

    function _savePagerState(key, st){
      try{
        localStorage.setItem(`re_pager_${key}_size`, String(st.size));
        localStorage.setItem(`re_pager_${key}_page`, String(st.page));
      }catch(e){}
    }

    function pagerSetSize(key, size){
      const st = _pagerState(key);
      st.size = Math.max(5, Number(size || 25));
      st.page = 1;
      window.__rePagerState[key] = st;
      _savePagerState(key, st);
      pagerGo(key, 1);
    }


    function paginateList(list, key, defaultSize=25){
      const arr = Array.isArray(list) ? list : [];
      const st = _pagerState(key, defaultSize);
      const size = Math.max(5, Number(st.size || defaultSize || 25));
      const total = arr.length;
      const pages = Math.max(1, Math.ceil(total / size));
      let page = Math.max(1, Math.min(pages, Number(st.page || 1)));
      st.page = page; st.size = size;
      _savePagerState(key, st);
      const start = (page - 1) * size;
      const end = Math.min(total, start + size);
      return {
        items: arr.slice(start, end),
        total, page, pages, size,
        startIndex: total ? (start + 1) : 0,
        endIndex: total ? end : 0
      };
    }

    function pagerGo(key, page){
      const st = _pagerState(key);
      st.page = Number(page || 1);
      window.__rePagerState[key] = st;
      _savePagerState(key, st);
      // Re-render by key
      if(key==='leases') renderLeases();
      else if(key==='tenants') renderTenants();
      else if(key==='cheques') renderCheques();
      else if(key==='payments') renderPayments();
      else if(key==='expenses') renderExpenses();
      else if(key==='salaries') renderSalaries();
      else if(key==='receipts-history') renderReceiptsHistory();
    }

    function _pagerButtonsHtml(key, page, pages){
      // Show up to 7 buttons: 1 ... (p-1) p (p+1) ... last
      const btn = (p, label, disabled=false, active=false)=> {
        const dis = disabled ? 'opacity-50 pointer-events-none' : '';
        const act = active ? 'btn-page-active' : '';
        return `<button class="btn-ui btn-ui-sm ${act} ${dis}" onclick="pagerGo('${key}', ${p})">${label}</button>`;
      };

      const parts = [];
      // Prev
      parts.push(btn(Math.max(1, page-1), 'السابق', page<=1));
      // Pages
      const addEll = ()=> parts.push(`<span class="pager-ellipsis">…</span>`);
      if(pages <= 7){
        for(let p=1;p<=pages;p++){
          parts.push(btn(p, String(p), false, p===page));
        }
      }else{
        parts.push(btn(1, '1', false, page===1));
        const left = Math.max(2, page-1);
        const right = Math.min(pages-1, page+1);

        if(left > 2) addEll();
        for(let p=left;p<=right;p++){
          parts.push(btn(p, String(p), false, p===page));
        }
        if(right < pages-1) addEll();

        parts.push(btn(pages, String(pages), false, page===pages));
      }
      // Next
      parts.push(btn(Math.min(pages, page+1), 'التالي', page>=pages));
      return parts.join('');
    }

    function renderPagerUI(key, el, pg){
      if(!el) return;
      const pages = Number(pg?.pages || 1);
      const page = Number(pg?.page || 1);
      const total = Number(pg?.total || 0);
      if(!total || pages <= 1){
        el.innerHTML = '';
        return;
      }
      const size = Number(pg?.size || 25);
      const info = `عرض ${pg.startIndex} - ${pg.endIndex} من ${total}`;

      const sizes = [10,25,50,100,200].filter(n=> n>0);
      const sizeOptions = sizes.map(n=> `<option value="${n}" ${n===size?'selected':''}>${n}</option>`).join('');
      const sizeSel = `
        <label class="pager-size">
          <span class="pager-size-label">الصفوف</span>
          <select class="pager-size-select" onchange="pagerSetSize('${key}', this.value)">
            ${sizeOptions}
          </select>
        </label>
      `;

      el.innerHTML = `
        <div class="pager-top">
          <div class="pager-info">${escHtml(info)}</div>
          ${sizeSel}
        </div>
        <div class="pager-pages">${_pagerButtonsHtml(key, page, pages)}</div>
      `;
    }
// ===== Busy helper for long tasks (export / print / libraries) =====
      async function withBusy(label, task, opts={}){
        const h = uiToast('info', label || 'جارٍ التنفيذ...', {
          title: opts.title || '⏳ جاري المعالجة',
          icon: opts.icon || '⏳',
          sticky: true,
          duration: 600000
        });
        try{
          const res = await task();
          if(opts.success) uiToast('success', opts.success);
          return res;
        }catch(err){
          console.error(err);
          uiToast('error', opts.error || 'حدث خطأ أثناء العملية.');
          throw err;
        }finally{
          try{ h && h.close && h.close(); }catch(_){}
        }
      }

      function safeFilename(name){
        return String(name || 'file')
          .replace(/[\\/:*?"<>|]+/g, '-')
          .replace(/\s+/g, ' ')
          .trim();
      }


// Lazy-load heavy libraries only when needed (keeps initial load fast)
    const __libLoads = Object.create(null);
    function loadScriptOnce(src, globalCheck){
      if(globalCheck && globalCheck()) return Promise.resolve(true);
      if(__libLoads[src]) return __libLoads[src];

      __libLoads[src] = new Promise((resolve, reject)=>{
        try{
          // If already in DOM
          const existing = [...document.scripts].find(s => s.src === src);
          if(existing){
            // Wait a tick and re-check
            setTimeout(()=> globalCheck && globalCheck() ? resolve(true) : resolve(true), 0);
            return;
          }

          const s = document.createElement('script');
          s.src = src;
          s.async = true;
          s.onload = ()=> resolve(true);
          s.onerror = ()=> reject(new Error('Failed to load: ' + src));
          document.head.appendChild(s);
        }catch(err){
          reject(err);
        }
      });

      return __libLoads[src];
    }

    async function ensureChartJs(){
      if(window.Chart) return true;
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/chart.js', ()=> !!window.Chart);
      return !!window.Chart;
    }

    async function ensureXLSX(){
      if(window.XLSX) return true;
      await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', ()=> !!window.XLSX);
      return !!window.XLSX;
    }

    async function ensureHtml2Pdf(){
      if(window.html2pdf) return true;
      await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js', ()=> !!window.html2pdf);
      return !!window.html2pdf;
    }



  function renderNotices(){
    const tenantSel = document.getElementById('notice-tenant-select');
    if(!tenantSel) return;


    // Bind buttons (safe to call multiple times)
    const prevBtn = document.getElementById('notice-preview-btn');
    if(prevBtn) prevBtn.onclick = buildNoticePreview;

    const draftBtn = document.getElementById('notice-print-draft-btn');
    if(draftBtn) draftBtn.onclick = printNoticeDraft;

    const finalBtn = document.getElementById('notice-print-final-btn');
    if(finalBtn) finalBtn.onclick = printNoticeFinal;

    const undoBtn = document.getElementById('notice-undo-last-btn');
    if(undoBtn) undoBtn.onclick = undoLastFinalNotice;

    renderNoticeLog();


    // defaults
    const dateEl = document.getElementById('notice-date');
    if(dateEl && !dateEl.value){
      const d = new Date();
      dateEl.value = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
    }


    // ✅ رقم خطاب افتراضي (بدون استهلاك) لتفادي التكرار
    const refEl = document.getElementById('notice-ref');
    if(refEl && !(refEl.value||'').trim()){
      refEl.value = getNextAvailableNoticeNo();
    }

    updateNoticeExtraOptions();

    const current = tenantSel.value || '';
    const tenants = getTenantsData()
      .slice()
      .sort((a,b)=> String(a.name||'').localeCompare(String(b.name||'')));

    tenantSel.innerHTML = '<option value="">اختر مستأجر...</option>'
      + tenants.map(t => `<option value="${escHtml(t.key)}">${escHtml(t.name)}</option>`).join('');

    if(current && tenants.some(t => t.key === current)) tenantSel.value = current;

    // Units depend on tenant
    onNoticeTenantChange(false);
    loadNoticeUiPrefs();
    resetNoticePreview();
  }

function onNoticeTenantChange(resetPreview=true){
    const tenantSel = document.getElementById('notice-tenant-select');
    const unitSel = document.getElementById('notice-unit-select');
    if(!tenantSel || !unitSel) return;

    const selectedKey = tenantSel.value || '';
    if(!selectedKey){
      unitSel.innerHTML = '<option value="">اختر وحدة...</option>';
      unitSel.disabled = true;
      if(resetPreview) resetNoticePreview();
      return;
    }

    const units = [];
    properties.forEach(p => (p.units||[]).forEach(u => {
      if(u.status === 'مؤجرة' && u.tenant && tenantKey(u.tenant) === selectedKey){
        units.push({
          value: `${p.id}::${u.id}`,
          label: `${escHtml(p.name)} - ${escHtml(u.name)}`
        });
      }
    }));

    unitSel.disabled = false;
    unitSel.innerHTML = '<option value="">اختر وحدة...</option>'
      + units.map(x => `<option value="${escHtml(x.value)}">${escHtml(x.label)}</option>`).join('');

    if(resetPreview) resetNoticePreview();
  }

  function resetNoticePreview(){
    noticePreviewReady = false;
    updateNoticeExtraOptions();
    autofillNoticeArrears(false);
    const preview = document.getElementById('notice-preview');
    const status = document.getElementById('notice-preview-status');
    const draftBtn = document.getElementById('notice-print-draft-btn');
    const finalBtn = document.getElementById('notice-print-final-btn');
    if(draftBtn) draftBtn.disabled = true;
    if(finalBtn) finalBtn.disabled = true;

    if(status) status.textContent = '';
    if(preview){
      preview.innerHTML = `
        <div class="text-center text-gray-500 dark:text-gray-400">
          اختر المستأجر ونوع الخطاب ثم اضغط <b>إنشاء معاينة</b>.
        </div>
      `;
    }
  }

  
  function buildNoticePreview(){
    updateNoticeExtraOptions();
    autofillNoticeArrears(false);

    const tenantSel = document.getElementById('notice-tenant-select');
    const unitSel = document.getElementById('notice-unit-select');
    const tplSel = document.getElementById('notice-template-select');
    const subjectInput = document.getElementById('notice-subject');
    const dateEl = document.getElementById('notice-date');
    const refEl = document.getElementById('notice-ref');
    const bilingualEl = document.getElementById('notice-bilingual');
    const noReplyEl = document.getElementById('notice-no-reply-accept');

    const preview = document.getElementById('notice-preview');
    const status = document.getElementById('notice-preview-status');
    const draftBtn = document.getElementById('notice-print-draft-btn');
    const finalBtn = document.getElementById('notice-print-final-btn');

    const tenantKeyVal = tenantSel?.value || '';
    if(!tenantKeyVal){
      uiToast('info', 'الرجاء اختيار المستأجر أولاً.');
      return;
    }

    const template = tplSel?.value || 'blank';
    const bilingual = !!(bilingualEl && bilingualEl.checked);

    // Require unit for eviction / increase
    const unitVal = unitSel?.value || '';
    if((template === 'eviction' || template === 'increase5') && !unitVal){
      uiToast('info', 'الرجاء اختيار الوحدة لهذا الخطاب.');
      return;
    }

    const tenant = getTenantsData().find(t => t.key === tenantKeyVal);
    const { prop, unit } = findUnitByComposite(unitVal);

    // default subject
    if(subjectInput && !(subjectInput.value||'').trim()){
      if(template === 'eviction') subjectInput.value = 'إخطار بعدم تجديد عقد الإيجار وإخلاء العين المؤجرة';
      else if(template === 'increase5') subjectInput.value = 'إشعار بزيادة القيمة الإيجارية بنسبة 5%';
      else subjectInput.value = '';
    }

    const subject = (subjectInput?.value || '').trim();
    const dateStr = (dateEl?.value || '');
    const dateDMY = formatDMY(dateStr);

    if(refEl && !(refEl.value||'').trim()){
      refEl.value = getNextAvailableNoticeNo();
    }
    const refNo = (refEl?.value || '').trim();

    // Keep edited text if user re-builds
    const prevAr = document.getElementById('notice-body-ar')?.innerText || '';
    const prevEn = document.getElementById('notice-body-en')?.innerText || '';

    const ctx = {
      tenantName: tenant?.name || '',
      propName: prop?.name || '',
      unitName: unit?.name || '',
      contractNo: unit?.contractNo || '',
      start: unit?.start || '',
      end: unit?.end || '',
      rent: unit?.rent || 0
    };

    // Compute 5% increase numbers
    const basis = getRentBasisSetting(); // 'total' | 'annual'
    const years = (ctx.start && ctx.end) ? contractYears(ctx.start, ctx.end) : 1;
    const oldVal = Number(ctx.rent || 0);
    const newVal = Math.round(oldVal * 1.05);

    const oldAnnual = basis === 'annual' ? oldVal : (years ? (oldVal / years) : oldVal);
    const newAnnual = Math.round(oldAnnual * 1.05);

    // ---- Arrears defaults (auto-fill inputs) ----
    const unitCode = (unit && (unit.id || unit.code || unit.unitCode)) ? (unit.id || unit.code || unit.unitCode) : (unit?.name || '');
    const contractTotal = (basis === 'annual') ? calcContractValueFromAnnual(oldVal, ctx.start, ctx.end) : oldVal;

    const contractValueInput = document.getElementById('notice-contract-value');
    const arrearsAmountInput = document.getElementById('notice-arrears-amount');
    const arrearsDetailsInput = document.getElementById('notice-arrears-details');

    // compute paid/balance for this unit (from recorded payments/cheques)
    const paidInfo = computeNoticeUnitPaid(ctx, unit, prop);
    const unitPaid = Number(paidInfo.paid||0);
    const unitBalance = Math.max(0, (Number(contractTotal||0) - Number(unitPaid||0)));

    if(contractValueInput && (!contractValueInput.value || Number(contractValueInput.value)===0)){
      if(contractTotal) contractValueInput.value = Math.round(Number(contractTotal));
    }
    if(arrearsAmountInput && (!arrearsAmountInput.value || Number(arrearsAmountInput.value)===0)){
      if(unitBalance) arrearsAmountInput.value = Math.round(Number(unitBalance));
    }

    // Templates
    let titleAr = 'خطاب رسمي';
    let titleEn = 'Official Letter';
    let bodyAr = '';
    let bodyEn = '';

    if(template === 'blank'){
      titleAr = 'خطاب رسمي';
      titleEn = 'Official Letter';
      bodyAr = prevAr.trim() || (
`عزيزي المستأجر/السادة: ${escHtml(ctx.tenantName || '______________')}\n\n` +
`بالإشارة إلى عقد الإيجار رقم ${ctx.contractNo || '—'} الخاص بالعين المؤجرة (${ctx.propName} - ${escHtml(ctx.unitName)})، نود إشعاركم بأنه تقرر تعديل القيمة الإيجارية بنسبة 5% وفقًا لبنود عقد الإيجار.\n\n` +
`القيمة الحالية: ${formatAED(oldAnnual)}\n` +
`القيمة بعد الزيادة (5%): ${formatAED(newAnnual)}\n\n` +
`تاريخ سريان الزيادة: عند التجديد / للفترة القادمة حسب الإجراءات المتبعة.\n\n` +
`يرجى تزويدنا بموافقتكم أو ملاحظاتكم خلال 7 أيام من تاريخ هذا الإشعار، وفي حال عدم الرد خلال المدة المذكورة سيُعتبر ذلك قبولاً ضمنيًا بالزيادة.\n\n` +
`وتفضلوا بقبول فائق الاحترام والتقدير،،`
      );
      bodyEn = prevEn.trim() || (
`Dear Tenant,\n\n${escHtml(ctx.tenantName || '______________')}\n\n` +
`With reference to Lease Agreement No. ${ctx.contractNo || '—'} for the leased premises (${ctx.propName} - ${escHtml(ctx.unitName)}), please be informed that the rental value will be increased by 5% in accordance with the lease terms.\n\n` +
`Current rental value: ${formatAED(oldAnnual)}\n` +
`New rental value (5% increase): ${formatAED(newAnnual)}\n\n` +
`Effective date: upon renewal / next rental period as per the applicable procedures.\n\n` +
`Kindly provide your confirmation or remarks within 7 days from the date of this notice. Failure to respond within the said period shall be deemed as acceptance of the increase.\n\n` +
`Regards ,,`
      );
} 
else if(template === 'eviction'){
      titleAr = 'إخطار رسمي بعدم تجديد عقد الإيجار وإخلاء العين المؤجرة';
      titleEn = 'Eviction Notice and Non-Renewal of Lease Agreement';
      bodyAr = prevAr.trim() || (
`عزيزي المستأجر،\n\n${escHtml(ctx.tenantName || '______________')}\n\n` +
`بالإشارة إلى عقد الإيجار رقم ${ctx.contractNo || '—'} المبرم بينكم وبين الملاك بخصوص العين المؤجرة (${ctx.propName} - ${escHtml(ctx.unitName)})، والتي سينتهي عقدها بتاريخ ${ctx.end || '—'}، نود إنذاركم بما يلي:\n\n` +
`قرر الملاك عدم تجديد عقد الإيجار بعد تاريخ انتهائه، ويُعد هذا الإخطار إنذارًا رسميًا ونهائيًا بوجوب الإخلاء.\n\n` +
`وعليه، يُطلب منكم:\n\n` +
`- إخلاء العين المؤجرة وتسليمها خالية من أي إشغال في موعد أقصاه تاريخ انتهاء العقد.\n` +
`- تقديم براءة ذمة من طاقة للتوزيع (كهرباء/مياه) تفيد بعدم وجود أي التزامات مالية قبل التسليم.\n` +
`- تسوية أي مستحقات متأخرة، وتسليم المفاتيح وكافة الملحقات عند التسليم.\n\n` +
`ونؤكد أن هذا الإنذار يُعتبر ملزمًا، وفي حال عدم الالتزام بما ورد أعلاه، سيضطر الملاك إلى اتخاذ الإجراءات القانونية اللازمة وفقًا للقوانين والأنظمة المعمول بها في دولة الإمارات العربية المتحدة.\n\n` +
`وتفضلوا بقبول فائق الاحترام والتقدير،،`
      );
      bodyEn = prevEn.trim() || (
`Dear Tenant,\n\n${escHtml(ctx.tenantName || '______________')}\n\n` +
`Referring to Lease Agreement No. ${ctx.contractNo || '—'}, concluded between you and the landlords regarding the leased premises (${ctx.propName} - ${escHtml(ctx.unitName)}), which will expire on ${ctx.end || '—'}, we hereby notify you of the following:\n\n` +
`The landlords have decided not to renew the lease agreement after its expiry date, and this notice shall be considered an official and final warning requiring eviction.\n\n` +
`Therefore, you are required to:\n\n` +
`- Vacate the leased premises and hand them over free of any occupation no later than the expiry date.\n` +
`- Provide a clearance certificate from TAQA Distribution confirming that no financial obligations remain outstanding prior to handover.\n` +
`- Settle any outstanding dues and hand over keys and all related attachments upon handover.\n\n` +
`We emphasize that this notice is binding, and in the event of non-compliance, the landlords will be compelled to take legal action in accordance with the applicable laws and regulations of the United Arab Emirates.\n\n` +
`Regards ,,`
      );
} else if(template === 'increase5'){
      titleAr = 'إشعار رسمي بزيادة القيمة الإيجارية بنسبة 5%';
      titleEn = 'Notice of 5% Rent Increase';

      const noReplyClause = !!(noReplyEl && noReplyEl.checked);

      const oldStr = basis === 'annual'
        ? `القيمة الإيجارية السنوية الحالية: ${formatAED(oldVal)}`
        : `قيمة العقد الحالية: ${formatAED(oldVal)}`;

      const newStr = basis === 'annual'
        ? `القيمة الإيجارية السنوية بعد الزيادة (5%): ${formatAED(newAnnual)}`
        : `قيمة العقد بعد الزيادة (5%): ${formatAED(newVal)}`;

      bodyAr = prevAr.trim() || (
`عزيزي المستأجر/السادة: ${escHtml(ctx.tenantName)}\n\n` +
`بالإشارة إلى عقد الإيجار رقم ${ctx.contractNo || '—'} الخاص بالعين المؤجرة (${ctx.propName} - ${escHtml(ctx.unitName)})، نود إشعاركم بما يلي:\n\n` +
`${oldStr}\n${newStr}\n\n` +
`وسيتم تطبيق الزيادة عند التجديد / الفترة القادمة حسب الإجراءات المتبعة.\n` +
(noReplyClause ? `\nعدم الرد خلال (7) أيام من تاريخ هذا الإشعار سيُعتبر موافقة على الشروط الجديدة.\n` : ``) +
`\nوتفضلوا بقبول فائق الاحترام والتقدير ،،`
      );

      bodyEn = prevEn.trim() || (
`Dear Tenant,\n\n` +
`Referring to Lease Agreement No. ${ctx.contractNo || '—'} for the leased premises (${ctx.propName} - ${escHtml(ctx.unitName)}), please be advised:\n\n` +
(basis === 'annual'
  ? `Current annual rent: ${formatAED(oldVal)}\nNew annual rent (+5%): ${formatAED(newAnnual)}\n\n`
  : `Current contract value: ${formatAED(oldVal)}\nNew contract value (+5%): ${formatAED(newVal)}\n\n`
) +
`The increase will be applied upon renewal / the upcoming period as per applicable procedures.\n` +
(noReplyClause ? `\nNo response within 7 days from this notice date shall be considered acceptance.\n` : ``) +
`\nRegards ,,`
      );
    }
else if(template === 'arrearsRenew'){
      titleAr = 'إنذار دفع متأخرات إيجارية';
      titleEn = 'Rental Arrears Notice';

      const cv = Number(contractValueInput?.value || contractTotal || 0);
      const arAmt = Number(arrearsAmountInput?.value || unitBalance || 0);
      const details = String(arrearsDetailsInput?.value || '').trim();
      const detailsEn = String(paidInfo?.suggestedDetailsTextEn || '').trim();
      const unitLabel = unitCode || ctx.unitName || '—';

      bodyAr = prevAr.trim() || (
`عزيزي المستأجر،\n\n${escHtml(ctx.tenantName || '______________')}\n\n` +
`بالإشارة إلى الموضوع المشار إليه أعلاه، يرجى التكرم بدفع المتأخرات الإيجارية على عقد الإيجار للوحدة ${unitLabel} والمؤجرة لكم، وتجديد العقد المنتهي بتاريخ ${ctx.end || '—'} خلال مدة أقصاها أسبوعين من تاريخه.\n\n` +
`وعليه، يجب سداد الإيجارات المتأخرة على العقد الموثق في بلدية مدينة العين ورقمه (${ctx.contractNo || '—'}) وتجديد العقد بأسرع وقت ممكن حتى لا نضطر آسفين لاتخاذ الإجراءات القانونية ضدكم.\n\n` +
`قيمة العقد: ${cv ? cv.toLocaleString('en-US') : '—'} درهم\n` +
`المتبقي: ${arAmt ? arAmt.toLocaleString('en-US') : '—'} درهم\n` +
(details ? `\nتفاصيل المتأخرات: ${details}\n` : ``) +
`\nفي حال تعذركم عن السداد خلال المهلة الممنوحة لكم سيتم اتخاذ الإجراءات القانونية ضدكم مما يترتب عليكم سداد الإيجارات المتأخرة من تاريخ نهاية العقد المذكور أعلاه وحتى الإخلاء الفعلي، وتسليم براءة ذمة الماء والكهرباء وصيانة العين المؤجرة.\n\n` +
`شاكرين لكم حسن تعاونكم معنا،،\nوتفضلوا بقبول فائق الاحترام والتقدير ،،`
      );

      bodyEn = prevEn.trim() || (
`Dear Tenant,\n\n${escHtml(ctx.tenantName || '______________')}\n\n` +
`With reference to the above subject, kindly pay the rental arrears for the lease contract of Unit ${unitLabel} leased to you, and renew the lease contract expired on ${ctx.end || '—'} within a maximum period of two weeks.\n\n` +
`Accordingly, you must pay the late rents on the contract documented in Al Ain Municipality No. (${ctx.contractNo || '—'}) and renew the contract as soon as possible so that we do not have to take legal action against you.\n\n` +
`Rental Value: ${cv ? cv.toLocaleString('en-US') : '—'} AED\n` +
`Remaining: ${arAmt ? arAmt.toLocaleString('en-US') : '—'} AED\n` +
(detailsEn ? `\nArrears details: ${detailsEn}\n` : ``) +
`\nIf you fail to pay within the period given to you, legal action will be taken against you. You will have to pay the late rents from the contract expiry date mentioned above until the actual eviction, provide the water and electricity clearance, and maintain the leased property.\n\n` +
`Thank you for your cooperation with us,,\nRegards ,,`
      );

    } else if(template === 'arrearsCheque'){
      titleAr = 'إنذار دفع متأخرات إيجارية';
      titleEn = 'Legal Notice - Rental Arrears';

      const cv = Number(contractValueInput?.value || contractTotal || 0);
      const arAmt = Number(arrearsAmountInput?.value || unitBalance || 0);
      const details = String(arrearsDetailsInput?.value || '').trim();
      const detailsEn = String(paidInfo?.suggestedDetailsTextEn || '').trim();
      const unitLabel = unitCode || ctx.unitName || '—';

      bodyAr = prevAr.trim() || (
`عزيزي المستأجر،\n\n${escHtml(ctx.tenantName || '______________')}\n\n` +
`بالإشارة إلى الموضوع المشار إليه أعلاه، يعد هذا الإنذار لكم لدفع الإيجارات المتأخرة على عقد الإيجار الموثق الخاص بكم ورقمه: ${ctx.contractNo || '—'} للوحدة رقم: ${unitLabel} خلال مدة أقصاها أسبوعين من تاريخه.\n\n` +
`وعليه، يجب المبادرة وسداد الإيجارات المتأخرة على العقد الموثق في بلدية مدينة العين بأسرع وقت ممكن حتى لا نضطر آسفين لاتخاذ الإجراءات القانونية ضدكم.\n\n` +
`قيمة العقد: ${cv ? cv.toLocaleString('en-US') : '—'} درهم\n` +
`المتأخرات: ${details ? details : (arAmt ? arAmt.toLocaleString('en-US') + ' درهم' : '—')}\n\n` +
`في حال تعذركم عن السداد خلال المهلة الممنوحة لكم سيتم اتخاذ الإجراءات القانونية ضدكم مما يترتب عليكم سداد الإيجارات المتأخرة المذكورة أعلاه وحتى الإخلاء الفعلي، وتسليم براءة ذمة الماء والكهرباء وصيانة العين المؤجرة.\n\n` +
`شاكرين لكم حسن تعاونكم معنا،،\nوتفضلوا بقبول فائق الاحترام والتقدير ،،`
      );

      bodyEn = prevEn.trim() || (
`Dear Tenant,\n\n${escHtml(ctx.tenantName || '______________')}\n\n` +
`With reference to the above subject matter, this is the notice to pay overdue rents on your tenancy lease: ${ctx.contractNo || '—'}\n` +
`Unit No.: ${unitLabel}\nwithin a maximum period of two weeks.\n\n` +
`Accordingly, you must pay the arrears on the contract documented in Al Ain Municipality as soon as possible so that we do not have to take legal action against you.\n\n` +
`Contract Value: ${cv ? cv.toLocaleString('en-US') : '—'} AED\n` +
`Arrears: ${detailsEn ? detailsEn : (arAmt ? arAmt.toLocaleString('en-US') + ' AED' : '—')}\n\n` +
`If you fail to pay within the period given to you, legal action will be taken against you. You will have to pay the late rents mentioned above until the actual eviction, provide the water and electricity clearance, and maintain the leased property.\n\n` +
`Thank you for your cooperation with us,,\nRegards ,,`
      );
    }


    const headerLinesHtml = NOTICE_LETTERHEAD.topLines.map(l => `<div>${escHtml(l)}</div>`).join('');
    const footerLinesHtml = NOTICE_LETTERHEAD.footerLines.map((l,i) => (i===0 ? `<div class="sig">${escHtml(l)}</div>` : `<div>${escHtml(l)}</div>`)).join('');

    // UI toggles
    const uiShowSig = document.getElementById('notice-show-signature')?.checked ?? true;
    const uiShowSeal = document.getElementById('notice-show-seal')?.checked ?? true;
    const uiShowAtt = document.getElementById('notice-show-attachments')?.checked ?? true;

    const attDefault = getDefaultNoticeAttachments(template);
    const attCustom = parseCustomAttachments();
    const attAr = [...(attDefault.ar||[]), ...attCustom];
    const attEn = [...(attDefault.en||[]), ...attCustom];

    const attachmentsHtml = (!uiShowAtt || (attAr.length===0 && attEn.length===0)) ? '' : (bilingual
      ? `
        <div class="letter-attachments">
          <div class="letter-attachments-grid">
            <div class="letter-attachments-col" dir="rtl">
              <div class="att-title">المرفقات المطلوبة</div>
              <ul class="letter-list">${attAr.map(a => `<li>${escHtml(a)}</li>`).join('')}</ul>
            </div>
            <div class="letter-attachments-col" dir="ltr">
              <div class="att-title">Required Attachments</div>
              <ul class="letter-list">${attEn.map(a => `<li>${escHtml(a)}</li>`).join('')}</ul>
            </div>
          </div>
        </div>
      `
      : `
        <div class="letter-attachments">
          <div class="letter-attachments-col" dir="rtl">
            <div class="att-title">المرفقات المطلوبة</div>
            <ul class="letter-list">${attAr.map(a => `<li>${escHtml(a)}</li>`).join('')}</ul>
          </div>
        </div>
      `);

    const signatureHtml = !uiShowSig ? '' : `
      <div class="letter-signature">
        ${uiShowSeal ? `<div class="seal-box">الختم / Seal</div>` : `<div></div>`}
        <div class="sig-lines">${footerLinesHtml}</div>
      </div>
    `;



    const titleHtml = `
      <div class="letter-title-ar">${escHtml(titleAr || '')}</div>
      ${bilingual ? `<div class="letter-title-en" dir="ltr">${escHtml(titleEn || '')}</div>` : ''}
    `;

    const metaHtml = bilingual ? `
      <div class="letter-meta-col" dir="rtl">
        <div><b>رقم الخطاب:</b> ${escHtml(refNo || '—')}</div>
        <div><b>التاريخ:</b> ${escHtml(dateDMY || '')}</div>
        ${subject ? `<div><b>الموضوع:</b> ${escHtml(subject)}</div>` : ''}
      </div>
      <div class="letter-meta-col" dir="ltr">
        <div><b>Letter No.:</b> ${escHtml(refNo || '—')}</div>
        <div><b>Date:</b> ${escHtml(dateDMY || '')}</div>
        ${subject ? `<div><b>Subject:</b> ${escHtml(subject)}</div>` : ''}
      </div>
    ` : `
      <div><b>رقم الخطاب:</b> ${escHtml(refNo || '—')}</div>
      <div><b>التاريخ:</b> ${escHtml(dateDMY || '')}</div>
      ${subject ? `<div style="flex-basis:100%"><b>الموضوع:</b> ${escHtml(subject)}</div>` : ''}
    `;
    const bodyHtml = bilingual ? `
      <div class="letter-columns">
        <div class="letter-col" dir="rtl">
          <div id="notice-body-ar" class="letter-body letter-edit" contenteditable="true">${textToHtml(bodyAr)}</div>
        </div>
        <div class="letter-col" dir="ltr">
          <div id="notice-body-en" class="letter-body letter-edit" contenteditable="true">${textToHtml(bodyEn)}</div>
        </div>
      </div>
    ` : `
      <div id="notice-body-ar" class="letter-body letter-edit" dir="rtl" contenteditable="true">${textToHtml(bodyAr)}</div>
    `;
preview.innerHTML = `
      <div class="letter-paper ${bilingual?'letter-bilingual':''}" id="notice-letter">
        <div class="letter-head">
          <div class="letter-head-lines">${headerLinesHtml}</div>
        </div>

        <div class="letter-title">${titleHtml}</div>

        <div class="letter-meta">${metaHtml}</div>

        ${bodyHtml}
        ${attachmentsHtml}
        ${signatureHtml}
      </div>
    `;

    noticeLoadedFromLog = false;
    noticePreviewReady = true;
    if(draftBtn) draftBtn.disabled = false;
    if(finalBtn) finalBtn.disabled = false;
    if(status) status.textContent = 'جاهز للطباعة — يمكنك تعديل نص الخطاب مباشرة داخل المعاينة قبل الطباعة.';
  }

  
function getNoticeLog(){
  try { return JSON.parse(localStorage.getItem('re_notice_log') || '[]') || []; }
  catch(e){ return []; }
}
function setNoticeLog(arr){
  try { localStorage.setItem('re_notice_log', JSON.stringify((arr||[]).slice(-2000))); } catch(e){}
}
function addNoticeLogEntry(entry){
  const log = getNoticeLog();
  log.push(entry);
  setNoticeLog(log);
  return log;
}
function templateLabel(tpl){
  if(tpl==='blank') return 'خطاب رسمي (فارغ)';
  if(tpl==='eviction') return 'إخلاء / عدم تجديد';
  if(tpl==='increase5') return 'زيادة 5%';
  if(tpl==='arrearsRenew') return 'إنذار متأخرات + تجديد عقد';
  if(tpl==='arrearsCheque') return 'إنذار متأخرات (شيك راجع/دفعة أولى)';
  return tpl || '';
}
function captureNoticePaperHtml(){
  const preview = document.getElementById('notice-preview');
  if(!preview) return '';
  const paper = preview.querySelector('.letter-paper');
  return paper ? paper.outerHTML : preview.innerHTML;
}
function restoreNoticePaperHtml(html){
  const preview = document.getElementById('notice-preview');
  const status = document.getElementById('notice-preview-status');
  if(!preview) return;
  preview.innerHTML = html || '';
  noticePreviewReady = !!html;
  const draftBtn = document.getElementById('notice-print-draft-btn');
  const finalBtn = document.getElementById('notice-print-final-btn');
  if(draftBtn) draftBtn.disabled = !noticePreviewReady;
  if(finalBtn) finalBtn.disabled = !noticePreviewReady;
  if(status) status.textContent = noticePreviewReady ? 'جاهز للطباعة — يمكنك تعديل النص مباشرة داخل الخطاب قبل الطباعة' : '';
}
function renderNoticeLog(){
  const box = document.getElementById('notice-log');
  const undoBtn = document.getElementById('notice-undo-last-btn');
  const searchEl = document.getElementById('notice-log-search');
  if(!box) return;

  // bind search once
  if(searchEl && !searchEl.dataset.bound){
    searchEl.addEventListener('input', ()=> renderNoticeLog());
    searchEl.dataset.bound = '1';
  }

  const log = getNoticeLog();
  const last = log.length ? log[log.length-1] : null;

  if(undoBtn){
    undoBtn.disabled = !(last && last.status==='FINAL');
    undoBtn.style.opacity = undoBtn.disabled ? '0.5' : '1';
  }

  if(!log.length){
    box.innerHTML = '<div class="text-gray-500 dark:text-gray-400">لا يوجد إنذارات معتمدة بعد.</div>';
    return;
  }

  const q = (searchEl?.value || '').trim().toLowerCase();

  // Keep indices for actions
  let entries = log.map((e,i)=>({e,i}));

  if(q){
    entries = entries.filter(({e})=>{
      const hay = [
        e.ref, e.dateDMY, e.tenantName, e.unitLabel, templateLabel(e.template),
        e.subject, e.template
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  if(!entries.length){
    box.innerHTML = '<div class="text-gray-500 dark:text-gray-400">لا توجد نتائج مطابقة.</div>';
    return;
  }

  const view = entries.slice(-200).reverse();

  const rows = view.map(({e,i}) => {
    const st = e.status==='VOID' ? 'ملغي' : 'معتمد';
    const stClass = e.status==='VOID' ? 'text-red-600' : 'text-emerald-600';
    const safeTenant = escHtml(e.tenantName || '');
    const safeUnit = escHtml(e.unitLabel || '');
    const safeType = escHtml(templateLabel(e.template));
    const safeDate = escHtml(e.dateDMY || '');
    const safeRef = escHtml(e.ref || '');

    const canReprint = (e.status==='FINAL');

    return `
      <tr class="border-b last:border-0 border-gray-200 dark:border-gray-800">
        <td class="py-2 pe-2 font-mono">${safeRef}</td>
        <td class="py-2 pe-2">${safeDate}</td>
        <td class="py-2 pe-2">${safeTenant}</td>
        <td class="py-2 pe-2">${safeUnit}</td>
        <td class="py-2 pe-2">${safeType}</td>
        <td class="py-2 pe-2 ${stClass} font-semibold">${st}</td>
        <td class="py-2 text-end whitespace-nowrap">
          <button data-idx="${i}" class="notice-log-view btn-ui btn-ui-sm btn-secondary">عرض</button>
          <button data-idx="${i}" class="btn-ui btn-filter" ${canReprint?'':'disabled'}>إعادة طباعة</button>
          <button data-idx="${i}" class="btn-ui btn-danger" ${e.status==='VOID'?'disabled':''}>إبطال</button>
        </td>
      </tr>
    `;
  }).join('');

  box.innerHTML = `
    <div class="overflow-auto">
      <table class="w-full text-xs">
        <thead>
          <tr class="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
            <th class="text-start py-2 pe-2">رقم</th>
            <th class="text-start py-2 pe-2">التاريخ</th>
            <th class="text-start py-2 pe-2">المستأجر</th>
            <th class="text-start py-2 pe-2">الوحدة</th>
            <th class="text-start py-2 pe-2">النوع</th>
            <th class="text-start py-2 pe-2">الحالة</th>
            <th class="text-end py-2">إجراء</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  function loadEntry(i){
    const entry = getNoticeLog()[i];
    if(!entry) return null;

    const refEl = document.getElementById('notice-ref');
    const dateEl = document.getElementById('notice-date');
    if(refEl) refEl.value = entry.ref || refEl.value;
    if(dateEl && entry.dateISO) dateEl.value = entry.dateISO;

    restoreNoticePaperHtml(entry.html || '');
    noticeLoadedFromLog = true;

    const status = document.getElementById('notice-preview-status');
    if(status) status.textContent = 'هذه معاينة من السجل. استخدم (إعادة طباعة) للطباعة دون تغيير التسلسل.';
    return entry;
  }

  // attach actions
  box.querySelectorAll('.notice-log-view').forEach(btn=>{
    btn.onclick = ()=>{
      const i = parseInt(btn.getAttribute('data-idx'), 10);
      const entry = loadEntry(i);
      if(!entry) return;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  });

  box.querySelectorAll('.notice-log-reprint').forEach(btn=>{
    btn.onclick = ()=>{
      const i = parseInt(btn.getAttribute('data-idx'), 10);
      const entry = loadEntry(i);
      if(!entry || entry.status!=='FINAL') return;
      markDraftPrint(false);
      window.print();
    };
  });

  box.querySelectorAll('.notice-log-void').forEach(btn=>{
    btn.onclick = ()=>{
      const i = parseInt(btn.getAttribute('data-idx'), 10);
      const log2 = getNoticeLog();
      const entry = log2[i];
      if(!entry || entry.status==='VOID') return;
      if(!confirm('هل تريد إبطال هذا الإنذار؟ سيتم إبقاؤه في السجل كـ (ملغي) ولن يتغير التسلسل.')) return;
      entry.status = 'VOID';
      entry.voidAt = new Date().toISOString();
      setNoticeLog(log2);
      renderNoticeLog();
    };
  });
}



function setPrintContext(mode){
  try{
    document.body.classList.remove('print-notice','print-receipt','print-report');
    if(mode==='notice') document.body.classList.add('print-notice');
    else if(mode==='receipt') document.body.classList.add('print-receipt');
    else if(mode==='report') document.body.classList.add('print-report');
  }catch(e){}
}
function clearPrintContext(){
  try{ document.body.classList.remove('print-notice','print-receipt','print-report'); }catch(e){}
}

function markDraftPrint(isDraft){
  const on = !!isDraft;
  try{
    document.body.classList.toggle('print-draft', on);
    const pv = document.getElementById('notice-preview');
    if(pv) pv.classList.toggle('print-draft', on);
  }catch(e){}
}

function printNoticeDraft(){
  if(!noticePreviewReady){
    uiToast('info', 'الرجاء إنشاء المعاينة أولاً.');
    return;
  }
  const refEl = document.getElementById('notice-ref');
  const originalRef = refEl ? refEl.value : '';
  // لا نستهلك الرقم في التجربة
  if(refEl){
    refEl.value = 'DRAFT';
  }
  setPrintContext('notice');
  markDraftPrint(true);
  window.print();
  setTimeout(()=>{
    markDraftPrint(false);
    clearPrintContext();
    if(refEl) refEl.value = originalRef;
  }, 50);
}

function printNoticeFinal(){
  if(!noticePreviewReady){
    uiToast('info', 'الرجاء إنشاء المعاينة أولاً.');
    return;
  }
    if(noticeLoadedFromLog){
    uiToast('info', 'هذا إنذار محفوظ من السجل. لإعادة طباعته استخدم زر "إعادة طباعة" من السجل، أو أنشئ معاينة جديدة.');
    return;
  }

if(!confirm('هل تريد اعتماد هذا الإنذار رسميًا وحفظه في السجل؟')) return;

  const refEl = document.getElementById('notice-ref');
  const ref = (refEl?.value || '').trim() || getNextAvailableNoticeNo();

  // ✅ احفظ الرقم كـ "مستخدم" قبل الطباعة لتجنب التكرار
  commitNoticeNo(ref);

  // ✅ سجّل الإنذار في السجل
  addNoticeLogEntry(collectNoticeLogEntry(ref));
  renderNoticeLog();

  setPrintContext('notice');
  markDraftPrint(false);
  window.print();

  // بعد إغلاق نافذة الطباعة: جهّز رقم جديد للخطاب القادم
  setTimeout(() => {
    clearPrintContext();
    if(refEl){
      refEl.value = getNextAvailableNoticeNo();
    }
  }, 50);
}

function undoLastFinalNotice(){
  const log = getNoticeLog();
  if(!log.length){
    uiToast('success', 'لا يوجد إنذارات معتمدة للتراجع.');
    return;
  }
  const last = log[log.length-1];
  if(!last || last.status!=='FINAL'){
    uiToast('success', 'آخر سجل ليس (معتمد) أو تم إبطاله بالفعل.');
    return;
  }
  if(!confirm('تأكيد: تراجع عن آخر اعتماد؟ سيتم حذف السجل وإرجاع رقم الخطاب ليُستخدم مرة أخرى.')) return;

  // Remove from used refs only if it's the latest used ref
  const used = getUsedNoticeRefs();
  const lastUsed = used.length ? used[used.length-1] : null;

  if(lastUsed !== last.ref){
    uiToast('success', 'لا يمكن التراجع لأن هناك أرقام لاحقة تم اعتمادها. (لمنع التكرار)');
    return;
  }

  used.pop();
  setUsedNoticeRefs(used);

  // Roll back counter to this number
  const m = /^NT-(\d{5})$/.exec(last.ref || '');
  if(m){
    const num = parseInt(m[1], 10);
    if(num && num > 0) setNoticeCounter(num);
  }

  log.pop();
  setNoticeLog(log);
  renderNoticeLog();

  const refEl = document.getElementById('notice-ref');
  if(refEl){
    refEl.value = getNextAvailableNoticeNo();
  }
}


// Backward compatible alias
function printNotice(){
  return printNoticeFinal();
}


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
                <button type="button"
                        data-lease-action="pay"
                        data-groupkey="${g.groupKey}"
                        onclick="openLeasePaymentModal('${escJsStr(g.groupKey)}')"
                        class="text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 text-sm font-bold">دفعة</button>
              </div>`
            : `<button type="button"
                       onclick="openLeaseModal('${escJsStr(g.units?.[0]?.propId || g.propId)}','${escJsStr(g.units?.[0]?.id || g.id)}')"
                       class="btn-ui btn-ui-sm btn-secondary">إدارة</button>`
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
        archiveUnitLease(existingUnit, 'إخلاء/تعديل من صفحة الوحدات', 'مخلى');
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
    const el = document.getElementById('add-lease-total-rent');
    if(el) el.textContent = formatAED(total);
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
  }


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
        archiveUnitLease(unit, `تم تجديد العقد بعقد جديد (${contractNo || 'بدون رقم'})`, 'تجديد عقد');
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

    saveToLocal();
    closeAddLeaseModal();
    showView('leases');
    logAction(`تم إنشاء عقد جديد (${contractNo || 'بدون رقم'}) يضم ${rows.length} وحدة للمستأجر ${tenantName}`);
    updateDashboard();
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
    if(total) total.addEventListener('input', ()=> updateLeasePaySum());

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
          <input class="lease-alloc-input ui-field" type="number" min="0" step="0.01" data-unit-id="${escHtml(u.id)}" data-prop-id="${escHtml(u.propId)}" value="0" oninput="updateLeasePaySum()">
        </td>
      `;
      frag.appendChild(tr);
    });

    tb.appendChild(frag);
    updateLeasePaySum();
  }

function updateLeasePaySum(){
    const total = parseAED(document.getElementById('lease-pay-total')?.value);
    let sum = 0;
    document.querySelectorAll('.lease-alloc-input').forEach(inp=>{
      sum += parseAED(inp.value);
    });
    const diff = (total - sum);
    const sumEl = document.getElementById('lease-pay-sum');
    const diffEl = document.getElementById('lease-pay-diff');
    if(sumEl) sumEl.textContent = formatAED(sum);
    if(diffEl){
      diffEl.textContent = formatAED(diff);
      diffEl.className = 'font-mono ' + (Math.abs(diff) < 0.001 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-300');
    }
  }

  function autoDistributeLeasePayment(){
    const m = document.getElementById('lease-payment-modal');
    const groupKey = m?.dataset?.groupKey || '';
    const contractNo = m?.dataset?.contractNo || '';
    const cache = window.__leaseGroupsCache || {};
    const g = cache[groupKey];
    if(!g){ uiToast('error', 'تعذر العثور على بيانات العقد.'); return; }

    const total = parseAED(document.getElementById('lease-pay-total')?.value);
    if(total <= 0){ uiToast('info', 'أدخل المبلغ الإجمالي أولاً.'); return; }

    // Distribute by remaining (rent - paid) proportional
    const rows = [];
    let sumRemain = 0;
    (g.units||[]).forEach(u=>{
      const paid = sumLeasePaidForUnit(contractNo, u.propId, u.id, groupKey);
      const rent = Number(u.rent)||0;
      const remain = Math.max(0, rent - paid);
      sumRemain += remain;
      rows.push({u, remain});
    });

    const inputs = Array.from(document.querySelectorAll('.lease-alloc-input'));
    if(!inputs.length) return;

    if(sumRemain <= 0){
      // fallback: proportional by rent
      sumRemain = rows.reduce((s,r)=>s + (Number(r.u.rent)||0), 0) || 1;
      rows.forEach(r=>r.remain = Number(r.u.rent)||0);
    }

    let allocated = 0;
    rows.forEach((r, idx)=>{
      let val = (idx === rows.length-1) ? (total - allocated) : Math.round((total * (r.remain/sumRemain)) * 100)/100;
      if(val < 0) val = 0;
      allocated += val;

      const inp = inputs[idx];
      if(inp) inp.value = (val ? String(val) : '');
    });

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
    const total = parseAED(document.getElementById('lease-pay-total')?.value);
    const method = document.getElementById('lease-pay-method')?.value || '';
    const ref = document.getElementById('lease-pay-ref')?.value || '';

    if(!date){ uiToast('info', 'حدد تاريخ الدفعة.'); return; }
    if(total <= 0){ uiToast('info', 'أدخل مبلغ الدفعة.'); return; }

    const allocInputs = Array.from(document.querySelectorAll('.lease-alloc-input'));
    const allocs = [];
    let sum = 0;
    allocInputs.forEach(inp=>{
      const amt = parseAED(inp.value);
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

      // attach voucherNo to leasePayments record for future reference
      try{
        const last = leasePayments[leasePayments.length-1];
        if(last && last.id===payId) last.voucherNo = vno;
      }catch(e){}

      payments.push({
        id: 'PAYL-'+payId,
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
        groupKey
      });
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
    const overrideStatus = (u.status === 'منتهية') ? 'منتهية' : 'ملغاة';
    const reason = (u.status === 'منتهية') ? 'إخلاء الوحدة بعد انتهاء العقد' : 'إلغاء العقد وإخلاء الوحدة';
    archiveUnitLease(u, reason, overrideStatus);
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

  // ================= PAYMENTS =================
  function openPaymentModal(){
    const m = document.getElementById('payment-modal');
    m.classList.remove('hidden');
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

    const payObj = {
      id: 'PAY-'+Date.now(),
      date: _payDate,
      tenant: data.t,
      unit: data.u,
      contract: data.c,
      due: data.rent,
      type: document.getElementById('pay-type').value,
      amount: amt,
      desc: normalizeText(document.getElementById('pay-desc').value),
      voucherNo: nextVoucherNumber('receipt')
    };
    payments.push(payObj);
    saveToLocal();
    closePaymentModal();
    renderPayments();
    updateDashboard();
    renderReceiptsHistory();
    logAction(`دفعة ${amt} من ${data.t}`);
  });

  function renderPayments(){
    const tbody = document.getElementById('payments-table-body');
    tbody.innerHTML='';
    const frag = document.createDocumentFragment();
const list = (payments||[]).slice().sort((a,b)=> new Date(b.date)-new Date(a.date));

const pg = paginateList(list, 'payments', 25);


pg.items.forEach(p=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-sm">${escHtml(p.date)}</td>
        <td>
          <div class="font-bold text-sm">${escHtml(p.tenant)}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">${escHtml(p.unit)}</div>
        </td>
        <td><span class="badge badge-blue">${escHtml(p.type)}</span></td>
        <td class="font-bold text-emerald-700 dark:text-emerald-400 font-mono">${formatAED(p.amount)}</td>
        <td class="text-xs text-gray-500 dark:text-gray-400 font-mono">${formatAED(p.due)} / <span class="text-rose-500 dark:text-rose-400">${formatAED(p.due-p.amount)}</span></td>
        <td>${p.amount>=p.due ? '<span class="badge badge-green">مكتمل</span>' : '<span class="badge badge-amber">جزئي</span>'}</td>
        <td><button onclick="previewReceipt('${escJsStr(p.id)}', 'payment')" class="btn-ui btn-ui-sm btn-secondary">عرض السند</button></td>
      `;
      frag.appendChild(tr);
    });
    const total = payments.reduce((s,p)=>s+p.amount,0);
    document.getElementById('payments-total').textContent = formatAED(total);
  
  tbody.appendChild(frag);
  renderPagerUI('payments', document.getElementById('payments-pager'), pg);
}

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

  // ================= EXPENSES =================
  let _expensesAdvInited = false;

  function _expenseNorm(v){
    return (v===null || v===undefined) ? '' : String(v).trim().toLowerCase();
  }
  function _expenseDateNum(s){
    const v = (s||'').toString().slice(0,10);
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : NaN;
  }
  function _expenseHay(e){
    return [
      e.id, e.date, e.type, e.amount, e.details
    ].filter(Boolean).join(' | ');
  }

  function _expensesUi(){
    const dirBtn = document.getElementById('expenses-sort-dir');
    return {
      q: document.getElementById('expenses-search-input')?.value || '',
      sortBy: document.getElementById('expenses-sort-by')?.value || '',
      sortDir: dirBtn?.dataset?.dir || '',
      type: document.getElementById('expenses-filter-type')?.value || '',
      amountMin: document.getElementById('expenses-filter-amount-min')?.value || '',
      amountMax: document.getElementById('expenses-filter-amount-max')?.value || '',
      dateFrom: document.getElementById('expenses-filter-date-from')?.value || '',
      dateTo: document.getElementById('expenses-filter-date-to')?.value || '',
    };
  }

  function _expensesPersistFromUI(){
    const ui = _expensesUi();
    _lsSet('re_expenses_q', ui.q);
    _lsSet('re_expenses_sort_by', ui.sortBy || _lsGet('re_expenses_sort_by','date'));
    _lsSet('re_expenses_sort_dir', ui.sortDir || _lsGet('re_expenses_sort_dir','desc'));

    _lsSet('re_expenses_f_type', ui.type);
    _lsSet('re_expenses_f_amin', ui.amountMin);
    _lsSet('re_expenses_f_amax', ui.amountMax);
    _lsSet('re_expenses_f_dfrom', ui.dateFrom);
    _lsSet('re_expenses_f_dto', ui.dateTo);
  }

  function _expensesRestoreUIOnce(){
    if(_expensesAdvInited) return;
    _expensesAdvInited = true;

    const qEl = document.getElementById('expenses-search-input');
    if(qEl) qEl.value = _lsGet('re_expenses_q','');

    const sortByEl = document.getElementById('expenses-sort-by');
    if(sortByEl) sortByEl.value = _lsGet('re_expenses_sort_by','date');

    const dirBtn = document.getElementById('expenses-sort-dir');
    if(dirBtn){
      const d = _lsGet('re_expenses_sort_dir','desc');
      dirBtn.dataset.dir = (d==='asc') ? 'asc' : 'desc';
      dirBtn.textContent = (dirBtn.dataset.dir==='asc') ? '⬆️' : '⬇️';
    }

    const typeEl = document.getElementById('expenses-filter-type');
    if(typeEl) typeEl.value = _lsGet('re_expenses_f_type','');

    const aminEl = document.getElementById('expenses-filter-amount-min');
    if(aminEl) aminEl.value = _lsGet('re_expenses_f_amin','');

    const amaxEl = document.getElementById('expenses-filter-amount-max');
    if(amaxEl) amaxEl.value = _lsGet('re_expenses_f_amax','');

    const dfEl = document.getElementById('expenses-filter-date-from');
    if(dfEl) dfEl.value = _lsGet('re_expenses_f_dfrom','');

    const dtEl = document.getElementById('expenses-filter-date-to');
    if(dtEl) dtEl.value = _lsGet('re_expenses_f_dto','');

    const open = _lsGet('re_expenses_filters_open','0') === '1';
    const panel = document.getElementById('expenses-filters-panel');
    const tBtn = document.getElementById('expenses-toggle-filters');
    if(panel && tBtn){
      panel.classList.toggle('hidden', !open);
      _setLeaseFiltersBtnLabel(open);
      }
  }

  function _expensesState(){
    const ui = _expensesUi();
    return {
      q: _expenseNorm(ui.q || _lsGet('re_expenses_q','')),
      sortBy: ui.sortBy || _lsGet('re_expenses_sort_by','date'),
      sortDir: ui.sortDir || _lsGet('re_expenses_sort_dir','desc'),
      f: {
        type: ui.type || _lsGet('re_expenses_f_type',''),
        amountMin: ui.amountMin || _lsGet('re_expenses_f_amin',''),
        amountMax: ui.amountMax || _lsGet('re_expenses_f_amax',''),
        dateFrom: ui.dateFrom || _lsGet('re_expenses_f_dfrom',''),
        dateTo: ui.dateTo || _lsGet('re_expenses_f_dto',''),
      }
    };
  }

  function _expensesApply(list, st){
    const q = st.q;
    const f = st.f || {};
    const type = (f.type||'').trim();

    const amin = (f.amountMin!=='' && f.amountMin!==null && f.amountMin!==undefined) ? Number(f.amountMin) : NaN;
    const amax = (f.amountMax!=='' && f.amountMax!==null && f.amountMax!==undefined) ? Number(f.amountMax) : NaN;

    const dfrom = f.dateFrom ? _expenseDateNum(f.dateFrom) : NaN;
    const dto   = f.dateTo ? _expenseDateNum(f.dateTo) : NaN;

    return (list||[]).filter(e=>{
      if(q){
        const hay = _expenseNorm(_expenseHay(e));
        if(!hay.includes(q)) return false;
      }
      if(type && (e.type||'') !== type) return false;

      const amt = Number(e.amount);
      if(!Number.isNaN(amin) && (!Number.isFinite(amt) || amt < amin)) return false;
      if(!Number.isNaN(amax) && (!Number.isFinite(amt) || amt > amax)) return false;

      const d = _expenseDateNum(e.date);
      if(!Number.isNaN(dfrom) && (Number.isNaN(d) || d < dfrom)) return false;
      if(!Number.isNaN(dto) && (Number.isNaN(d) || d > dto)) return false;

      return true;
    });
  }

  function _sortExpenses(list, sortBy, sortDir){
    const dir = (sortDir==='asc') ? 1 : -1;
    const by = sortBy || 'date';
    return [...(list||[])].sort((a,b)=>{
      let va, vb;
      if(by==='amount'){
        va = Number(a.amount); vb = Number(b.amount);
        if(!Number.isFinite(va)) va = -Infinity;
        if(!Number.isFinite(vb)) vb = -Infinity;
      }else if(by==='type'){
        va = _expenseNorm(a.type); vb = _expenseNorm(b.type);
      }else{
        // date
        va = _expenseDateNum(a.date); vb = _expenseDateNum(b.date);
        if(!Number.isFinite(va)) va = -Infinity;
        if(!Number.isFinite(vb)) vb = -Infinity;
      }
      if(va < vb) return -1*dir;
      if(va > vb) return  1*dir;
      return 0;
    });
  }

  function onExpensesAdvancedChanged(){
    _expensesPersistFromUI();
    renderExpenses();
  }

  function toggleExpensesSortDir(){
    const btn = document.getElementById('expenses-sort-dir');
    if(!btn) return;
    const cur = (btn.dataset.dir==='asc') ? 'asc' : 'desc';
    const next = (cur==='asc') ? 'desc' : 'asc';
    btn.dataset.dir = next;
    btn.textContent = (next==='asc') ? '⬆️' : '⬇️';
    _lsSet('re_expenses_sort_dir', next);
    renderExpenses();
  }

  function toggleExpensesFilters(){
    const panel = document.getElementById('expenses-filters-panel');
    const btn = document.getElementById('expenses-toggle-filters');
    if(!panel || !btn) return;
    const willShow = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    btn.textContent = willShow ? 'إخفاء الفلاتر المتقدمة' : 'عرض الفلاتر المتقدمة';
    _lsSet('re_expenses_filters_open', willShow ? '1' : '0');
  }

  function resetExpensesAdvanced(){
    const keys = [
      're_expenses_q','re_expenses_sort_by','re_expenses_sort_dir','re_expenses_filters_open',
      're_expenses_f_type','re_expenses_f_amin','re_expenses_f_amax','re_expenses_f_dfrom','re_expenses_f_dto'
    ];
    keys.forEach(k=>{ try{ localStorage.removeItem(k);}catch(e){} });

    const qEl = document.getElementById('expenses-search-input'); if(qEl) qEl.value='';
    const sbEl = document.getElementById('expenses-sort-by'); if(sbEl) sbEl.value='date';
    const dirBtn = document.getElementById('expenses-sort-dir'); if(dirBtn){ dirBtn.dataset.dir='desc'; dirBtn.textContent='⬇️'; }
    const tEl = document.getElementById('expenses-filter-type'); if(tEl) tEl.value='';
    const aminEl = document.getElementById('expenses-filter-amount-min'); if(aminEl) aminEl.value='';
    const amaxEl = document.getElementById('expenses-filter-amount-max'); if(amaxEl) amaxEl.value='';
    const dfEl = document.getElementById('expenses-filter-date-from'); if(dfEl) dfEl.value='';
    const dtEl = document.getElementById('expenses-filter-date-to'); if(dtEl) dtEl.value='';

    const panel = document.getElementById('expenses-filters-panel'); 
    const btn = document.getElementById('expenses-toggle-filters');
    if(panel && btn){
      panel.classList.add('hidden');
      btn.textContent = 'عرض الفلاتر المتقدمة';
    }
    renderExpenses();
  }

  function renderExpenses(){
    _expensesRestoreUIOnce();

    const tbody = document.getElementById('expenses-table-body');
    if(!tbody) return;
    tbody.innerHTML='';

    const frag = document.createDocumentFragment();
const st = _expensesState();
    const filtered = _expensesApply(expenses, st);
    const finalList = _sortExpenses(filtered, st.sortBy, st.sortDir);

    const hint = document.getElementById('expenses-filter-hint');
    if(hint){
      const total = (expenses||[]).length;
      const shown = finalList.length;
      hint.textContent = (shown===total) ? `النتائج: ${shown}` : `النتائج: ${shown} من ${total}`;
    }

    const pg = paginateList(finalList, 'expenses', 25);



    pg.items.forEach((e)=>{
      const tr = document.createElement('tr');
      tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors";
      tr.innerHTML=`
        <td class="text-sm font-mono" dir="ltr">${escHtml(e.date)}</td>
        <td class="text-sm font-bold text-indigo-700 dark:text-indigo-400">${escHtml(e.type)}</td>
        <td class="font-bold text-rose-600 dark:text-rose-400" dir="ltr">${formatAED(e.amount)}</td>
        <td class="text-sm text-gray-600 dark:text-gray-300">${escHtml(e.details)}</td>
        <td class="text-center">
          <div class="flex items-center justify-center gap-2">
            <button onclick="previewReceipt('${escHtml(e.id)}', 'expense')" class="btn-ui btn-ui-sm btn-secondary">🖨️ سند صرف</button>
            <button onclick="deleteExpenseById('${escHtml(e.id)}')" class="btn-ui btn-ui-sm btn-icon btn-danger" title="حذف">🗑️</button>
          </div>
        </td>
      `;
      frag.appendChild(tr);
    });
  
  tbody.appendChild(frag);
      renderPagerUI('expenses', document.getElementById('expenses-pager'), pg);
}

  function deleteExpenseById(id){
    if(!confirm('حذف هذا المصروف؟')) return;
    expenses = (expenses||[]).filter(e => e.id !== id);
    saveToLocal();
    renderExpenses();
    renderReceiptsHistory();
  }

  function deleteExpense(index){
    // توافق مع النسخ القديمة: إذا تم تمرير index
    const item = (expenses||[])[index];
    if(!item || !item.id){
      if(!confirm('حذف هذا المصروف؟')) return;
      expenses.splice(index, 1);
      saveToLocal();
      renderExpenses();
      renderReceiptsHistory();
      return;
    }
    deleteExpenseById(item.id);
  }

  document.getElementById('new-expense-form').addEventListener('submit', e=>{
    e.preventDefault();

      const _expDate = (document.getElementById('expense-date').value||'').trim();
      const _expType = normalizeText(document.getElementById('expense-type').value, {collapseSpaces:false});
      const _expAmt  = parseMoney(document.getElementById('expense-amount').value);
      const _expDetails = normalizeText(document.getElementById('expense-details').value);
      if(!_expDate){ uiToast('error','الرجاء اختيار تاريخ المصروف.'); return; }
      if(!_expType){ uiToast('error','الرجاء اختيار نوع المصروف.'); return; }
      if(!_expAmt || _expAmt <= 0){ uiToast('error','الرجاء إدخال مبلغ مصروف صحيح.'); return; }

    expenses.push({
      id: 'EXP-'+Date.now(),
      date: _expDate,
      type: _expType,
      amount: _expAmt,
      details: _expDetails,
      voucherNo: nextVoucherNumber('expense')
    });
    saveToLocal();
    renderExpenses();
    renderReceiptsHistory();
    e.target.reset();
    logAction(`تم تسجيل مصروف جديد من نوع: ${document.getElementById('expense-type').value}`);
  });

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

  // ================= RECEIPTS HISTORY & PREVIEW =================
  
  // ================= RECEIPTS HISTORY (VOUCHERS) ADVANCED SEARCH =================
  let _receiptsAdvInited = false;

  function _receiptNorm(v){
    return (v===null || v===undefined) ? '' : String(v).trim().toLowerCase();
  }
  function _receiptDateNum(s){
    const v = (s||'').toString().slice(0,10);
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : NaN;
  }
  function _receiptHay(v){
    return [
      v.id, v.type, v.sourceType, v.date, v.amount,
      v.party, v.desc
    ].map(x=> (x===null||x===undefined) ? '' : String(x)).join(' ').trim().toLowerCase();
  }

  function _receiptsUi(){
    return {
      bar: document.getElementById('receipts-advanced-bar'),
      qEl: document.getElementById('receipts-search-input'),
      sortByEl: document.getElementById('receipts-sort-by'),
      sortDirBtn: document.getElementById('receipts-sort-dir'),
      hintEl: document.getElementById('receipts-advanced-hint'),
      toggleBtn: document.getElementById('receipts-toggle-filters'),
      panel: document.getElementById('receipts-filters-panel'),
      fType: document.getElementById('receipts-filter-type'),
      fSource: document.getElementById('receipts-filter-source'),
      fParty: document.getElementById('receipts-filter-party'),
      fDesc: document.getElementById('receipts-filter-desc'),
      fAMin: document.getElementById('receipts-filter-amin'),
      fAMax: document.getElementById('receipts-filter-amax'),
      fDFrom: document.getElementById('receipts-filter-dfrom'),
      fDTo: document.getElementById('receipts-filter-dto'),
    };
  }

  function _receiptsPersistFromUI(){
    const ui = _receiptsUi();
    if(!ui.bar) return;

    _lsSet('re_receipts_q', ui.qEl ? ui.qEl.value : '');
    _lsSet('re_receipts_sort_by', ui.sortByEl ? ui.sortByEl.value : 'date');
    _lsSet('re_receipts_sort_dir', ui.sortDirBtn ? (ui.sortDirBtn.dataset.dir||'desc') : 'desc');
    _lsSet('re_receipts_filters_open', (ui.panel && !ui.panel.classList.contains('hidden')) ? '1' : '0');

    _lsSet('re_receipts_f_type', ui.fType ? ui.fType.value : '');
    _lsSet('re_receipts_f_source', ui.fSource ? ui.fSource.value : '');
    _lsSet('re_receipts_f_party', ui.fParty ? ui.fParty.value : '');
    _lsSet('re_receipts_f_desc', ui.fDesc ? ui.fDesc.value : '');
    _lsSet('re_receipts_f_amin', ui.fAMin ? ui.fAMin.value : '');
    _lsSet('re_receipts_f_amax', ui.fAMax ? ui.fAMax.value : '');
    _lsSet('re_receipts_f_dfrom', ui.fDFrom ? ui.fDFrom.value : '');
    _lsSet('re_receipts_f_dto', ui.fDTo ? ui.fDTo.value : '');
  }

  function _receiptsRestoreUIOnce(){
    if(_receiptsAdvInited) return;
    _receiptsAdvInited = true;

    const ui = _receiptsUi();
    if(!ui.bar) return;

    if(ui.qEl) ui.qEl.value = _lsGet('re_receipts_q','');
    if(ui.sortByEl) ui.sortByEl.value = _lsGet('re_receipts_sort_by','date');

    const dir = _lsGet('re_receipts_sort_dir','desc');
    if(ui.sortDirBtn){
      ui.sortDirBtn.dataset.dir = (dir==='asc') ? 'asc' : 'desc';
      ui.sortDirBtn.textContent = (ui.sortDirBtn.dataset.dir==='asc') ? '⬆️' : '⬇️';
    }

    if(ui.fType) ui.fType.value = _lsGet('re_receipts_f_type','');
    if(ui.fSource) ui.fSource.value = _lsGet('re_receipts_f_source','');
    if(ui.fParty) ui.fParty.value = _lsGet('re_receipts_f_party','');
    if(ui.fDesc) ui.fDesc.value = _lsGet('re_receipts_f_desc','');
    if(ui.fAMin) ui.fAMin.value = _lsGet('re_receipts_f_amin','');
    if(ui.fAMax) ui.fAMax.value = _lsGet('re_receipts_f_amax','');
    if(ui.fDFrom) ui.fDFrom.value = _lsGet('re_receipts_f_dfrom','');
    if(ui.fDTo) ui.fDTo.value = _lsGet('re_receipts_f_dto','');

    const open = _lsGet('re_receipts_filters_open','0') === '1';
    if(ui.panel) ui.panel.classList.toggle('hidden', !open);
    if(ui.toggleBtn) ui.toggleBtn.textContent = open ? 'إخفاء الفلاتر المتقدمة' : 'عرض الفلاتر المتقدمة';
  }

  function _receiptsState(){
    const ui = _receiptsUi();
    return {
      q: _receiptNorm(ui.qEl ? ui.qEl.value : ''),
      sortBy: (ui.sortByEl ? ui.sortByEl.value : 'date') || 'date',
      sortDir: (ui.sortDirBtn ? (ui.sortDirBtn.dataset.dir||'desc') : 'desc') || 'desc',
      filters: {
        type: ui.fType ? ui.fType.value : '',
        source: ui.fSource ? ui.fSource.value : '',
        party: _receiptNorm(ui.fParty ? ui.fParty.value : ''),
        desc: _receiptNorm(ui.fDesc ? ui.fDesc.value : ''),
        amin: ui.fAMin ? ui.fAMin.value : '',
        amax: ui.fAMax ? ui.fAMax.value : '',
        dfrom: ui.fDFrom ? ui.fDFrom.value : '',
        dto: ui.fDTo ? ui.fDTo.value : '',
      }
    };
  }

  function _receiptsApply(list, st){
    const q = st.q;
    const f = st.filters || {};
    const type = f.type || '';
    const source = f.source || '';
    const party = f.party || '';
    const desc = f.desc || '';

    const aminRaw = (f.amin ?? '').toString().trim();
    const amaxRaw = (f.amax ?? '').toString().trim();
    const amin = (aminRaw === '') ? NaN : Number(aminRaw);
    const amax = (amaxRaw === '') ? NaN : Number(amaxRaw);
    const hasAmin = Number.isFinite(amin);
    const hasAmax = Number.isFinite(amax);

    const dfrom = f.dfrom ? _receiptDateNum(f.dfrom) : NaN;
    const dto = f.dto ? _receiptDateNum(f.dto) : NaN;
    const hasDfrom = Number.isFinite(dfrom);
    const hasDto = Number.isFinite(dto);

    let out = (list||[]).filter(v=>{
      if(q && !_receiptHay(v).includes(q)) return false;

      if(type && (v.type||'') !== type) return false;
      if(source && ((v.sourceType||v.source||'') !== source)) return false;

      if(party && !_receiptNorm(v.party).includes(party)) return false;
      if(desc && !_receiptNorm(v.desc).includes(desc)) return false;

      const a = Number(v.amount);
      if(hasAmin && (!Number.isFinite(a) || a < amin)) return false;
      if(hasAmax && (!Number.isFinite(a) || a > amax)) return false;

      const d = _receiptDateNum(v.date);
      if(hasDfrom && (!Number.isFinite(d) || d < dfrom)) return false;
      if(hasDto && (!Number.isFinite(d) || d > dto)) return false;

      return true;
    });

    const dir = (st.sortDir === 'asc') ? 1 : -1;
    out.sort((a,b)=>{
      let va, vb;
      switch(st.sortBy){
        case 'amount':
          va = Number(a.amount); vb = Number(b.amount);
          va = Number.isFinite(va) ? va : -Infinity;
          vb = Number.isFinite(vb) ? vb : -Infinity;
          break;
        case 'type':
          va = _receiptNorm(a.type); vb = _receiptNorm(b.type);
          break;
        case 'party':
          va = _receiptNorm(a.party); vb = _receiptNorm(b.party);
          break;
        case 'source':
          va = _receiptNorm(a.sourceType || a.source); vb = _receiptNorm(b.sourceType || b.source);
          break;
        case 'date':
        default:
          va = _receiptDateNum(a.date); vb = _receiptDateNum(b.date);
          va = Number.isFinite(va) ? va : -Infinity;
          vb = Number.isFinite(vb) ? vb : -Infinity;
          break;
      }
      if(va < vb) return -1 * dir;
      if(va > vb) return  1 * dir;
      return 0;
    });

    return out;
  }

  function onReceiptsAdvancedChanged(){
    _receiptsPersistFromUI();
    renderReceiptsHistory();
  }

  function toggleReceiptsSortDir(){
    const btn = document.getElementById('receipts-sort-dir');
    if(!btn) return;
    const current = (btn.dataset.dir === 'asc') ? 'asc' : 'desc';
    const next = (current === 'asc') ? 'desc' : 'asc';
    btn.dataset.dir = next;
    btn.textContent = (next === 'asc') ? '⬆️' : '⬇️';
    _lsSet('re_receipts_sort_dir', next);
    onReceiptsAdvancedChanged();
  }

  function toggleReceiptsFiltersPanel(){
    const panel = document.getElementById('receipts-filters-panel');
    const btn = document.getElementById('receipts-toggle-filters');
    if(!panel || !btn) return;
    const willShow = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !willShow);
    btn.textContent = willShow ? 'إخفاء الفلاتر المتقدمة' : 'عرض الفلاتر المتقدمة';
    _lsSet('re_receipts_filters_open', willShow ? '1' : '0');
  }

  function resetReceiptsAdvanced(){
    const keys = [
      're_receipts_q','re_receipts_sort_by','re_receipts_sort_dir','re_receipts_filters_open',
      're_receipts_f_type','re_receipts_f_source','re_receipts_f_party','re_receipts_f_desc',
      're_receipts_f_amin','re_receipts_f_amax','re_receipts_f_dfrom','re_receipts_f_dto'
    ];
    keys.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });

    // Reset UI
    const qEl = document.getElementById('receipts-search-input'); if(qEl) qEl.value='';
    const sortByEl = document.getElementById('receipts-sort-by'); if(sortByEl) sortByEl.value='date';
    const dirBtn = document.getElementById('receipts-sort-dir'); if(dirBtn){ dirBtn.dataset.dir='desc'; dirBtn.textContent='⬇️'; }

    const fType = document.getElementById('receipts-filter-type'); if(fType) fType.value='';
    const fSource = document.getElementById('receipts-filter-source'); if(fSource) fSource.value='';
    const fParty = document.getElementById('receipts-filter-party'); if(fParty) fParty.value='';
    const fDesc = document.getElementById('receipts-filter-desc'); if(fDesc) fDesc.value='';
    const fAMin = document.getElementById('receipts-filter-amin'); if(fAMin) fAMin.value='';
    const fAMax = document.getElementById('receipts-filter-amax'); if(fAMax) fAMax.value='';
    const fDFrom = document.getElementById('receipts-filter-dfrom'); if(fDFrom) fDFrom.value='';
    const fDTo = document.getElementById('receipts-filter-dto'); if(fDTo) fDTo.value='';

    const panel = document.getElementById('receipts-filters-panel');
    const btn = document.getElementById('receipts-toggle-filters');
    if(panel) panel.classList.add('hidden');
    if(btn) btn.textContent = 'عرض الفلاتر المتقدمة';

    renderReceiptsHistory();
  }
  // ================= /RECEIPTS HISTORY ADVANCED SEARCH =================


  function renderReceiptsHistory(){
    _receiptsRestoreUIOnce();
    const tbody = document.getElementById('receipts-history-table-body');
    tbody.innerHTML = '';

    const frag = document.createDocumentFragment();
let allVouchers = [];
    let totalReceipts = 0;
    let totalSalariesAmt = 0;
    let totalExpensesAmt = 0;

    payments.forEach(p => {
      totalReceipts += p.amount;
      allVouchers.push({
        id: p.id,
        type: 'قبض',
        date: p.date,
        amount: p.amount,
        party: p.tenant,
        desc: p.desc || `دفعة إيجار وحدة ${p.unit}`,
        sourceType: 'payment'
      });
    });

    salaries.forEach(s => {
      totalSalariesAmt += s.amount;
      allVouchers.push({
        id: s.id,
        type: 'صرف راتب',
        date: s.date,
        amount: s.amount,
        party: s.name,
        desc: s.notes,
        sourceType: 'salary'
      });
    });

    expenses.forEach(e => {
      totalExpensesAmt += e.amount;
      allVouchers.push({
        id: e.id,
        type: 'صرف',
        date: e.date,
        amount: e.amount,
        party: e.type,
        desc: `${escHtml(e.type)}: ${escHtml(e.details)}`,
        sourceType: 'expense'
      });
    });

    const st = _receiptsState();
    const filtered = _receiptsApply(allVouchers.slice(), st);

    const hint = document.getElementById('receipts-advanced-hint');
    if(hint) hint.textContent = `النتائج: ${filtered.length} من ${allVouchers.length}`;


    const pg = paginateList(filtered, 'receipts-history', 25);




    pg.items.forEach(v => {
      const isReceipt = v.sourceType === 'payment';
      const typeClass = isReceipt ? 'badge-green' : 'badge-red';
      const amountClass = isReceipt ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
      const tr = document.createElement('tr');
      tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors";
      tr.innerHTML = `
        <td class="px-4 py-3 text-sm font-mono whitespace-nowrap cell-nowrap cell-ltr text-right align-top" dir="ltr">${escHtml(v.date)}</td>
        <td class="px-4 py-3 whitespace-nowrap text-right align-top"><span class="badge ${typeClass}">${escHtml(v.type)}</span></td>
        <td class="px-4 py-3 font-bold font-mono whitespace-nowrap text-right align-top ${amountClass}" dir="ltr"><span class="inline-block" dir="ltr">${formatAED(v.amount)}</span></td>
        <td class="px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-300 text-right align-top break-words"><div class="cell-2lines font-bold text-gray-700 dark:text-gray-300" dir="auto">${escHtml(v.party)}</div></td>
        <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-right align-top break-words"><div class="cell-2lines" title="${escHtml(v.desc)}">${escHtml(v.desc)}</div></td>
        <td class="px-4 py-3 text-center whitespace-nowrap align-top">
          <button onclick="previewReceipt('${escJsStr(v.id)}', '${escJsStr(v.sourceType)}')" class="btn-ui btn-ui-sm btn-secondary">عرض</button>
        </td>
      `;
      frag.appendChild(tr);
    });

    document.getElementById('total-receipt-vouchers').textContent = formatAED(totalReceipts);
    document.getElementById('total-payment-vouchers').textContent = formatAED(totalSalariesAmt + totalExpensesAmt);
    document.getElementById('total-vouchers-count').textContent = allVouchers.length;
  
  tbody.appendChild(frag);
      renderPagerUI('receipts-history', document.getElementById('receipts-history-pager'), pg);
}

  function findPropertyForPayment(payment){
    if(!payment) return null;
    for(const p of properties){
      for(const u of p.units){
        if(payment.unit && u.name === payment.unit) return p;
        if(payment.contract && u.contractNo === payment.contract) return p;
      }
    }
    return null;
  }

  function setReceiptHeaderByProperty(prop){
    const nameEl = document.getElementById('rv-building-name');
    const locEl  = document.getElementById('rv-building-location');
    const phoneEl= document.getElementById('rv-building-phone');
    if(prop){
      nameEl.textContent = prop.name || defaultHeader.name;
      locEl.textContent  = prop.location || defaultHeader.location;
    } else {
      nameEl.textContent = defaultHeader.name;
      locEl.textContent  = defaultHeader.location;
    }
    phoneEl.textContent = defaultHeader.phone;
  }

  function previewReceipt(id, type='payment'){
    showView('receipt');

    const titleEl    = document.getElementById('rv-title');
    const subTitleEl = document.getElementById('rv-subtitle');
    const partyLabelEl = document.getElementById('rv-party-label');
    const mainTitleEl = document.getElementById('receipt-main-title');

    const btnBack = document.getElementById('back-to-source-btn');
    btnBack.onclick = function(){ showView('receipts-history'); };

    if(type === 'salary'){
      const item = salaries.find(x => x.id === id);
      if(!item) return;

      titleEl.textContent = "سند صرف راتب";
      titleEl.className = "text-3xl font-black text-rose-700 tracking-wider";
      subTitleEl.textContent = "Salary Payment Voucher";
      partyLabelEl.textContent = "اصرفوا للسيد/ة:";
      mainTitleEl.textContent = "سند صرف راتب";

      setReceiptHeaderByProperty(null);

      document.getElementById('rv-no').textContent = item.voucherNo || '';
      document.getElementById('rv-date-out').textContent = item.date;
      document.getElementById('rv-tenant-out').textContent = `${escHtml(item.name)} (${escHtml(item.role)})`;
      document.getElementById('rv-amount-out').textContent = parseFloat(item.amount).toLocaleString();
      document.getElementById('rv-method-out').textContent = "نقدي / تحويل";
      document.getElementById('rv-for-out').textContent = item.notes;

    } else if(type === 'expense'){
      const item = expenses.find(x => x.id === id);
      if(!item) return;

      titleEl.textContent = "سند صرف";
      titleEl.className = "text-3xl font-black text-rose-700 tracking-wider";
      subTitleEl.textContent = "Payment Voucher";
      partyLabelEl.textContent = "اصرفوا للجهة:"; 
      mainTitleEl.textContent = "سند صرف";

      setReceiptHeaderByProperty(null);

      document.getElementById('rv-no').textContent = item.voucherNo || '';
      document.getElementById('rv-date-out').textContent = item.date;
      document.getElementById('rv-tenant-out').textContent = item.type;
      document.getElementById('rv-amount-out').textContent = parseFloat(item.amount).toLocaleString();
      document.getElementById('rv-method-out').textContent = "نقدي";
      document.getElementById('rv-for-out').textContent = `دفع مبلغ ${item.amount.toLocaleString()} عن ${escHtml(item.type)}: ${escHtml(item.details)}`;

    } else {
      const item = payments.find(x => x.id === id || x.chequeId === id);
      if(!item) return;

      titleEl.textContent = "سند قبض";
      titleEl.className = "text-3xl font-black text-emerald-700 tracking-wider";
      subTitleEl.textContent = "Receipt Voucher";
      partyLabelEl.textContent = "استلمنا من:";
      mainTitleEl.textContent = "سند قبض";

      const prop = findPropertyForPayment(item);
      setReceiptHeaderByProperty(prop);

      document.getElementById('rv-no').textContent = item.voucherNo || '';
      document.getElementById('rv-date-out').textContent = item.date;
      document.getElementById('rv-tenant-out').textContent = item.tenant;
      document.getElementById('rv-amount-out').textContent = parseFloat(item.amount).toLocaleString();
      document.getElementById('rv-method-out').textContent = item.type;
      document.getElementById('rv-for-out').textContent = item.desc || `دفعة إيجار وحدة ${item.unit}`;
    }
  }

  async function downloadReceiptPDF(){
      return withBusy('جارٍ إنشاء ملف PDF...', async ()=>{
        const wasLoaded = !!window.html2pdf;
        if(!wasLoaded){
          uiToast('info', 'جارٍ تحميل مكتبة PDF...', {title:'⏳ تحميل', duration: 2200});
        }
        await ensureHtml2Pdf();
        if(!window.html2pdf) throw new Error('html2pdf not available');

        const element = document.getElementById('printable-receipt');
        if(!element) throw new Error('printable-receipt not found');

        // Clone to avoid any hidden/position constraints
        const clone = element.cloneNode(true);
        clone.style.position = 'fixed';
        clone.style.left = '-9999px';
        clone.style.top = '0';
        clone.style.width = element.offsetWidth ? (element.offsetWidth + 'px') : '800px';
        document.body.appendChild(clone);

        // Dynamic filename if possible
        const no = document.getElementById('rv-voucher-no')?.textContent?.trim() || '';
        const dt = document.getElementById('rv-voucher-date')?.textContent?.trim() || '';
        const base = safeFilename(`Voucher-${no || ''}-${dt || ''}`) || 'Voucher';
        const filename = (base.endsWith('.pdf') ? base : (base + '.pdf'));

        const opt = {
          margin: 10,
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        try{
          await html2pdf().set(opt).from(clone).save();
        }finally{
          try{ clone.remove(); }catch(_){}
        }
      }, { success: 'تم تحميل ملف PDF ✅', error: 'تعذر إنشاء/تحميل PDF. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.' });
    }function printReceipt(){
  const el = document.getElementById('printable-receipt');
  if(!el){
    uiToast('error', 'تعذر العثور على نموذج السند للطباعة.');
    return;
  }

  // Ensure we print ONLY the receipt, not notices/reports
  setPrintContext('receipt');

  const cleanup = ()=>{
    try{ clearPrintContext(); }catch(e){}
    window.removeEventListener('afterprint', cleanup);
  };
  try{ window.addEventListener('afterprint', cleanup); }catch(e){}

  // Give the browser a tick to apply print styles
  setTimeout(()=>{
    window.print();
    // Fallback cleanup
    setTimeout(cleanup, 1200);
  }, 60);
}



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
  
    renderLeaseArchiveReport();

  renderHalfYearOwnersReport();
}


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
