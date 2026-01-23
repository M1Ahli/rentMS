// ================================================
// 01_core.js - Core + Storage + View Router
// Auto-split from legacy app.js for maintainability.
// DO NOT edit the legacy file directly; edit split modules.
// ================================================

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

    // IMPORTANT: check "pending" before "cashed" because the Arabic word "الصرف"
    // exists in both phrases (e.g., "بانتظار الصرف") and could be misclassified.
    if(ns.includes('بانتظار') || ns.includes('قيد') || ns.includes('pending') || ns.includes('await') || ns.includes('waiting') || ns.includes('not cashed')) return 'بانتظار الصرف';
    if(ns.includes('راجع') || ns.includes('مرتجع') || ns.includes('مرفوض') || ns.includes('returned') || ns.includes('bounce') || ns.includes('bounced')) return 'راجع';

    // "Cashed" mappings (avoid generic "صرف" which breaks pending)
    const isPaidEn = (ns.includes('paid') && !ns.includes('unpaid') && !ns.includes('not paid'));
    if(ns.includes('مصروف') || ns.includes('تم الصرف') || ns.includes('تم صرف') || ns.includes('cashed') || ns.includes('cleared') || isPaidEn) return 'مصروف';

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

  function _inferArchiveActionFromStatus(st, text){
    const s = normalizeLeaseStatus(st || '');
    const t = (text || '').toString();
    if(s === 'تجديد عقد' || /تجديد/.test(t)) return { action: 'renew', label: 'تجديد' };
    if(s === 'مخلى' || /إخلاء|مخلى/.test(t)) return { action: 'vacate', label: 'إخلاء' };
    if(s === 'ملغاة' || /إلغاء/.test(t)) return { action: 'cancel', label: 'إلغاء' };
    return { action: '', label: '' };
  }

  // archiveUnitLease v2 (backward compatible)
  // v1: archiveUnitLease(u, note, statusOverride)
  // v2: archiveUnitLease(u, archiveReasonLabel, statusOverride, note, archiveAction)
  function archiveUnitLease(u, a1, statusOverride, a4, a5){
    if(!u) return false;
    if(!unitHasLeaseData(u)) return false;

    // Archive current unit lease as-is (must NOT depend on modal DOM inputs)
    ensureLeaseHistory(u);

    const st = normalizeLeaseStatus(statusOverride || (u.status || ''));

    let archiveReason = '';
    let note = '';
    let archiveAction = '';

    if(arguments.length >= 4){
      archiveReason = (a1 || '').trim();
      note = (a4 || '').trim();
      archiveAction = (a5 || '').trim();
    } else {
      // v1 style (reason was a free-text note)
      note = (a1 || '').trim();
      const inf = _inferArchiveActionFromStatus(st, note);
      archiveAction = inf.action;
      archiveReason = inf.label;
    }

    if(!archiveAction || !archiveReason){
      const inf = _inferArchiveActionFromStatus(st, note);
      if(!archiveAction) archiveAction = inf.action;
      if(!archiveReason) archiveReason = inf.label;
    }

    const entry = {
      tenant: u.tenant || '',
      rent: Number(u.rent || 0),
      contractNo: u.contractNo || '',
      start: u.start || '',
      end: u.end || '',
      status: st,
      prevStatus: u.status || '',
      // legacy
      reason: note || archiveReason || '',
      // new (for archive page)
      note: note || '',
      archiveReason: archiveReason || '',
      archiveAction: archiveAction || '',
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
            note: '',
            archiveReason: '',
            archiveAction: '',
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
            note: (h.note || h.reason || ''),
            archiveReason: (h.archiveReason || ''),
            archiveAction: (h.archiveAction || ''),
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

  function _getPreviousLeaseRecordsOnly(){
    // NOTE: "أرشيف العقود" يجب أن يعرض العقود المؤرشفة فقط.
    // ✅ لا يتم الأرشفة تلقائياً عند انتهاء التاريخ.
    // ✅ تتم الأرشفة فقط عند قيام المستخدم بتجديد العقد أو إلغائه/إخلاء الوحدة.

    const getMeta = (r) => {
      const st = normalizeLeaseStatus(r.status);
      let action = (r.archiveAction || '').trim();
      let reason = (r.archiveReason || '').trim();
      let note = (r.note || '').trim();
      if(!note) note = (r.reason || '').trim();

      if(!action || !reason){
        // Backward compatibility: infer from status + text
        const inf = _inferArchiveActionFromStatus(st, note);
        if(!action) action = inf.action;
        if(!reason) reason = inf.label;
      }

      // Extra fallback from old reason text
      if(!action){
        const rs = (note || '').toString();
        if(/تجديد/.test(rs)) action = 'renew';
        else if(/إخلاء|مخلى/.test(rs)) action = 'vacate';
        else if(/إلغاء/.test(rs)) action = 'cancel';
      }
      if(!reason){
        if(action==='renew') reason = 'تجديد';
        else if(action==='vacate') reason = 'إخلاء';
        else if(action==='cancel') reason = 'إلغاء';
      }

      return { action, reason, note };
    };

    const isArchivedByAction = (r) => {
      if(!r.archivedAt) return false;
      const st = normalizeLeaseStatus(r.status);
      const meta = getMeta(r);

      // الحالات التي نعتبرها "مؤرشفة" نتيجة فعل المستخدم
      if(meta.action === 'renew' || meta.action === 'cancel' || meta.action === 'vacate') return true;
      if(st === 'تجديد عقد' || st === 'ملغاة' || st === 'مخلى') return true;

      // ❗ لا نعتبر "منتهية" بحد ذاتها سبباً للأرشفة
      return false;
    };

    let recs = getAllLeaseRecords();
    // استبعاد العقد الحالي دائماً
    recs = recs.filter(r => r.reason !== 'حالي');
    // وإظهار المؤرشف فقط حسب قاعدة المستخدم
    recs = recs.filter(isArchivedByAction);

    // Attach normalized meta for downstream rendering/filters
    recs = recs.map(r => Object.assign({}, r, { __archiveMeta: getMeta(r) }));
    return recs;
  }

  function _renderLeaseArchiveTable(ids){
    const tbody = document.getElementById(ids.body);
    if(!tbody) return;

    const statusSel = document.getElementById(ids.status);
    const reasonSel = ids.reason ? document.getElementById(ids.reason) : null;
    const fromInput = ids.from ? document.getElementById(ids.from) : null;
    const toInput = ids.to ? document.getElementById(ids.to) : null;
    const qInput = document.getElementById(ids.search);
    const empty = document.getElementById(ids.empty);
    const counts = document.getElementById(ids.counts);

    // bind once per element
    if(statusSel && !statusSel.dataset.boundLeaseArchive){
      statusSel.dataset.boundLeaseArchive = '1';
      statusSel.addEventListener('change', () => _renderLeaseArchiveTable(ids));
    }
    if(qInput && !qInput.dataset.boundLeaseArchive){
      qInput.dataset.boundLeaseArchive = '1';
      qInput.addEventListener('input', () => _renderLeaseArchiveTable(ids));
    }

    if(reasonSel && !reasonSel.dataset.boundLeaseArchive){
      reasonSel.dataset.boundLeaseArchive = '1';
      reasonSel.addEventListener('change', () => _renderLeaseArchiveTable(ids));
    }
    if(fromInput && !fromInput.dataset.boundLeaseArchive){
      fromInput.dataset.boundLeaseArchive = '1';
      fromInput.addEventListener('change', () => _renderLeaseArchiveTable(ids));
    }
    if(toInput && !toInput.dataset.boundLeaseArchive){
      toInput.dataset.boundLeaseArchive = '1';
      toInput.addEventListener('change', () => _renderLeaseArchiveTable(ids));
    }

    const statusFilter = statusSel ? statusSel.value : 'all';
    const reasonFilter = reasonSel ? reasonSel.value : 'all';
    const fromVal = fromInput ? fromInput.value : '';
    const toVal = toInput ? toInput.value : '';
    const q = (qInput ? qInput.value : '').trim().toLowerCase();

    let recs = _getPreviousLeaseRecordsOnly();

    // counts (previous only)
    const c = { all: recs.length, ended:0, cancelled:0, renewed:0, vacated:0 };
    recs.forEach(r=>{
      const st = normalizeLeaseStatus(r.status);
      if(st === 'منتهية' || st === 'منتهي') c.ended++;
      else if(st === 'ملغاة') c.cancelled++;
      else if(st === 'تجديد عقد') c.renewed++;
      else if(st === 'مخلى') c.vacated++;
    });
    if(counts){
      counts.textContent = `الإجمالي: ${c.all} • منتهية: ${c.ended} • ملغاة: ${c.cancelled} • تجديد عقد: ${c.renewed} • مخلى: ${c.vacated}`;
    }

    if(statusFilter && statusFilter !== 'all'){
      recs = recs.filter(r => {
        const st = normalizeLeaseStatus(r.status);
        if(statusFilter === 'منتهية') return (st === 'منتهية' || st === 'منتهي');
        return st === statusFilter;
      });
    }

    // Filter by archive action/reason
    if(reasonFilter && reasonFilter !== 'all') {
      recs = recs.filter(r => {
        const m = r.__archiveMeta || {};
        const action = (m.action || '').trim();
        return action === reasonFilter;
      });
    }

    // Filter by archived date range (inclusive)
    const dateOnlyMs = (v) => {
      const s = (v || '').toString().slice(0,10);
      if(!s) return NaN;
      const d = new Date(s + 'T00:00:00');
      const t = d.getTime();
      return Number.isFinite(t) ? t : NaN;
    };
    const fromMs = dateOnlyMs(fromVal);
    const toMs = dateOnlyMs(toVal);
    if(Number.isFinite(fromMs)) {
      recs = recs.filter(r => {
        const ms = dateOnlyMs(r.archivedAt);
        return Number.isFinite(ms) && ms >= fromMs;
      });
    }
    if(Number.isFinite(toMs)) {
      recs = recs.filter(r => {
        const ms = dateOnlyMs(r.archivedAt);
        return Number.isFinite(ms) && ms <= toMs;
      });
    }

    if(q){
      recs = recs.filter(r=>{
        const hay = `${r.propName} ${r.unitName} ${r.tenant} ${r.contractNo}`.toLowerCase();
        return hay.includes(q);
      });
    }

    tbody.innerHTML = '';
    const frag = document.createDocumentFragment();
    if(empty) empty.classList.add('hidden');

    if(recs.length === 0){
      if(empty){
        empty.textContent = 'لا توجد عقود سابقة مطابقة للبحث/الفلتر.';
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
        <td class="px-3 py-3"><span class="${leaseStatusBadge(r.status)}">${leaseStatusLabel(r.status) || '-'} </span></td>
        <td class="px-3 py-3 text-xs">${escHtml((r.__archiveMeta?.reason || r.archiveReason || '-') || '-')}</td>
        <td class="px-3 py-3 text-xs text-gray-700 dark:text-gray-300">${escHtml((r.__archiveMeta?.note || r.note || r.reason || '-') || '-')}</td>
        <td class="px-3 py-3 text-xs">${archivedDate}</td>
        <td class="px-3 py-3">
          <button type="button" class="btn-ui btn-ui-sm btn-reset" onclick="removeLeaseArchiveRecord('${r.propId}','${r.unitId}','${r.archivedAt || ''}')">إلغاء الأرشفة</button>
        </td>
      `;
      frag.appendChild(tr);
    });

    tbody.appendChild(frag);
  }

  // New: Dedicated page "أرشيف العقود" (previous contracts only)
  function renderLeasesArchivePage(){
    _renderLeaseArchiveTable({
      body: 'leases-archive-body',
      status: 'leases-archive-status-filter',
      reason: 'leases-archive-reason-filter',
      from: 'leases-archive-date-from',
      to: 'leases-archive-date-to',
      search: 'leases-archive-search',
      empty: 'leases-archive-empty',
      counts: 'leases-archive-counts'
    });
  }

  function resetLeasesArchiveFilters(){
    const st = document.getElementById('leases-archive-status-filter');
    const rs = document.getElementById('leases-archive-reason-filter');
    const df = document.getElementById('leases-archive-date-from');
    const dt = document.getElementById('leases-archive-date-to');
    const q = document.getElementById('leases-archive-search');
    if(st) st.value = 'all';
    if(rs) rs.value = 'all';
    if(df) df.value = '';
    if(dt) dt.value = '';
    if(q) q.value = '';
    renderLeasesArchivePage();
  }

  function removeLeaseArchiveRecord(propId, unitId, archivedAt){
    try{
      const p = (properties || []).find(x => String(x.id) === String(propId));
      if(!p) return uiToast ? uiToast('warn','لم يتم العثور على العقار.') : alert('لم يتم العثور على العقار.');
      const u = (p.units || []).find(x => String(x.id) === String(unitId));
      if(!u) return uiToast ? uiToast('warn','لم يتم العثور على الوحدة.') : alert('لم يتم العثور على الوحدة.');
      ensureLeaseHistory(u);
      const i = u.leaseHistory.findIndex(h => String(h.archivedAt||'') === String(archivedAt||''));
      if(i < 0) return uiToast ? uiToast('warn','لم يتم العثور على سجل الأرشفة.') : alert('لم يتم العثور على سجل الأرشفة.');
      u.leaseHistory.splice(i, 1);
      saveToLocal();
      renderLeasesArchivePage();
      try{ renderReports(); }catch(e){}
      if(uiToast) uiToast('success','تم إلغاء الأرشفة (حذف السجل من الأرشيف).');
    }catch(e){
      console.error(e);
      if(uiToast) uiToast('danger','حدث خطأ أثناء إلغاء الأرشفة.');
      else alert('حدث خطأ أثناء إلغاء الأرشفة.');
    }
  }

  // Legacy: (was used in Reports). Kept safe if old markup exists.
  function renderLeaseArchiveReport(){
    _renderLeaseArchiveTable({
      body: 'report-leases-body',
      status: 'report-lease-status-filter',
      search: 'report-lease-search',
      empty: 'report-leases-empty',
      counts: 'report-leases-counts'
    });
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
    else if(id==='leases-archive') renderLeasesArchivePage();
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




