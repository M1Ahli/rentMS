// ================================================
// 14_police_cases.js - Police Reports & Court Cases
// (Offline / localStorage via re_data_v2)
// Auto-updated for UIV32.15 (attachments: path-based)
// ================================================

  // Key for pager state
  const CASES_PAGER_KEY = 'police_cases';

  // Internal UI state
  window.__currentCaseId = window.__currentCaseId || '';

  function _nowISO(){ return new Date().toISOString(); }
  function _todayYMD(){
    const d = new Date();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  // ---------------- Attachment file name helpers ----------------
  function _sanitizeFileName(name){
    let n = String(name || 'file').trim();
    n = n.replace(/[\\/]+/g,'_');
    n = n.replace(/[^\w\.\-]+/g,'_');
    n = n.replace(/_+/g,'_');
    if(n.length > 160) n = n.slice(-160);
    if(!n) n = 'file';
    return n;
  }

  function _uniqueFileName(base, used){
    if(!used || !used.has(base)) return base;
    const dot = base.lastIndexOf('.');
    const stem = dot>-1 ? base.slice(0,dot) : base;
    const ext  = dot>-1 ? base.slice(dot) : '';
    let i = 2;
    let cand = `${stem}_${i}${ext}`;
    while(used.has(cand)){ i++; cand = `${stem}_${i}${ext}`; }
    return cand;
  }

  // ---------------- Attachments (Option 2: path-based) ----------------
  // We store attachments as an array of {name, path} inside each case / update.
  // Backward-compat: if old field (doc) exists, it's treated as a single attachment path.
  function _normAttachments(arr){
    if(!Array.isArray(arr)) return [];
    return arr.map(a=>({
      name: String(a?.name || '').trim(),
      path: String(a?.path || '').trim(),
    })).filter(a => a.name || a.path);
  }

  function _safeHref(url){
    const s = String(url || '').trim();
    if(!s) return '';
    // block dangerous schemes
    if(/^(javascript:|data:)/i.test(s)) return '';
    return s;
  }

  function _attLink(label, path){
    const lbl = (label || path || 'مرفق');
    const p = String(path || '').trim();
    const href = _safeHref(p);
    if(p && /^Attachments\//i.test(p) && typeof openAttachmentByPath === 'function'){
      return `<a class="underline text-blue-600 dark:text-blue-400 break-all" href="#" onclick="openAttachmentByPath('${escJs(p)}'); return false;">${escHtml(lbl)}</a>`;
    }
    return href
      ? `<a class="underline text-blue-600 dark:text-blue-400 break-all" href="${escHtml(href)}" target="_blank" rel="noopener noreferrer">${escHtml(lbl)}</a>`
      : `<span class="font-semibold break-all">${escHtml(lbl)}</span>`;
  }


  function _caseAttsFromRecord(c){
    const a = _normAttachments(c?.attachments);
    if(a.length) return a;
    if(c?.doc) return _normAttachments([{ name:'', path: String(c.doc) }]);
    return [];
  }

  function _updAttsFromRecord(u){
    const a = _normAttachments(u?.attachments);
    if(a.length) return a;
    if(u?.doc) return _normAttachments([{ name:'', path: String(u.doc) }]);
    return [];
  }

  function _renderAttachmentsForModal(list, removeFnName){
    const atts = _normAttachments(list);
    if(!atts.length) return `<div class="text-xs text-gray-500 dark:text-gray-400">لا توجد مرفقات.</div>`;
    return atts.map((a, idx) => {
      const name = a.name || a.path || `مرفق ${idx+1}`;
      const href = _safeHref(a.path);
      const link = _attLink(name, a.path);
      const pathLine = a.path ? `<div class="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400 break-all">${escHtml(a.path)}</div>` : '';
      return `
        <div class="flex items-start justify-between gap-3 p-2 rounded-xl bg-white/60 dark:bg-gray-900/30 border border-white/40 dark:border-gray-700">
          <div class="min-w-0 flex-1">
            <div class="text-sm">${link}</div>
            ${pathLine}
          </div>
          <button type="button" class="btn-ui btn-ui-sm btn-icon btn-danger" title="حذف" onclick="${removeFnName}(${idx})">🗑️</button>
        </div>
      `;
    }).join('');
  }

  // Case modal attachments
  function getCaseModalAttachments(){
    try{ return JSON.parse(document.getElementById('case-attachments-json')?.value || '[]'); }catch(e){ return []; }
  }
  function setCaseModalAttachments(list){
    const clean = _normAttachments(list);
    const input = document.getElementById('case-attachments-json');
    if(input) input.value = JSON.stringify(clean);
    renderCaseModalAttachments();
  }
  function renderCaseModalAttachments(){
    const box = document.getElementById('case-attachments-list');
    if(!box) return;
    box.innerHTML = _renderAttachmentsForModal(getCaseModalAttachments(), 'removeCaseModalAttachment');
  }
  
  // Upload one or more files for the Case modal and add them as attachments
  async function uploadCaseModalFiles(){
    try{
      const input = document.getElementById('case-attach-files');
      let files = Array.from(input?.files || []);
      if(!files.length){
        files = (typeof pickFilesForUpload==='function') ? await pickFilesForUpload({ multiple:true, accept:'application/pdf,image/*' }) : [];
      }
      if(!files.length){
        uiToast('info','اختر ملفات أولاً.');
        return;
      }

      // Ensure case id exists (so folder is stable)
      const idEl = document.getElementById('case-id');
      let caseId = (idEl?.value || '').trim();
      if(!caseId){
        caseId = _caseId();
        if(idEl) idEl.value = caseId;
      }

      const list = getCaseModalAttachments();
      for(const f of files){
        const used = new Set(_normAttachments(list).map(a=>String(a?.path||'').split('/').pop()||'').filter(Boolean));
        let safeName = _sanitizeFileName(f?.name || 'file');
        safeName = _uniqueFileName(safeName, used);
        const path = buildCaseDocPath(caseId, safeName);
        await writeAttachmentFile(path, f);
        list.push({ name: f.name || safeName, path });
      }
      setCaseModalAttachments(list);
      uiToast('success', 'تم رفع وحفظ المرفقات ✅');
      try{ if(input) input.value=''; }catch(e){}
    }catch(e){
      console.error(e);
      uiToast('warn','تعذر رفع الملفات. تأكد من تحديد مجلد المرفقات ومنح الصلاحية.');
    }
  }

function addCaseModalAttachment(){
    const name = (document.getElementById('case-attach-name')?.value || '').trim();
    const path = (document.getElementById('case-attach-path')?.value || '').trim();
    if(!name && !path){
      uiToast('warn','أدخل اسم الملف أو المسار أولاً.');
      return;
    }
    const list = getCaseModalAttachments();
    list.push({ name, path });
    setCaseModalAttachments(list);
    if(document.getElementById('case-attach-name')) document.getElementById('case-attach-name').value = '';
    if(document.getElementById('case-attach-path')) document.getElementById('case-attach-path').value = '';
  }
  function removeCaseModalAttachment(idx){
    const list = getCaseModalAttachments();
    list.splice(idx, 1);
    setCaseModalAttachments(list);
  }

  // Update modal attachments
  function getCaseUpdateModalAttachments(){
    try{ return JSON.parse(document.getElementById('case-update-attachments-json')?.value || '[]'); }catch(e){ return []; }
  }
  function setCaseUpdateModalAttachments(list){
    const clean = _normAttachments(list);
    const input = document.getElementById('case-update-attachments-json');
    if(input) input.value = JSON.stringify(clean);
    renderCaseUpdateModalAttachments();
  }
  function renderCaseUpdateModalAttachments(){
    const box = document.getElementById('case-update-attachments-list');
    if(!box) return;
    box.innerHTML = _renderAttachmentsForModal(getCaseUpdateModalAttachments(), 'removeCaseUpdateModalAttachment');
  }
  
  // Upload one or more files for the Case Update modal and add them as attachments
  async function uploadCaseUpdateModalFiles(){
    try{
      const input = document.getElementById('case-update-attach-files');
      let files = Array.from(input?.files || []);
      if(!files.length){
        files = (typeof pickFilesForUpload==='function') ? await pickFilesForUpload({ multiple:true, accept:'application/pdf,image/*' }) : [];
      }
      if(!files.length){
        uiToast('info','اختر ملفات أولاً.');
        return;
      }

      const caseId = (document.getElementById('case-update-caseId')?.value || window.__currentCaseId || '').trim();
      if(!caseId){
        uiToast('warn','لا يمكن رفع مرفقات: لم يتم تحديد قضية.');
        return;
      }

      const list = getCaseUpdateModalAttachments();
      for(const f of files){
        const used = new Set(_normAttachments(list).map(a=>String(a?.path||'').split('/').pop()||'').filter(Boolean));
        let safeName = _sanitizeFileName(f?.name || 'file');
        safeName = _uniqueFileName(safeName, used);
        const path = buildCaseDocPath(caseId, safeName);
        await writeAttachmentFile(path, f);
        list.push({ name: f.name || safeName, path });
      }
      setCaseUpdateModalAttachments(list);
      uiToast('success', 'تم رفع وحفظ المرفقات ✅');
      try{ if(input) input.value=''; }catch(e){}
    }catch(e){
      console.error(e);
      uiToast('warn','تعذر رفع الملفات. تأكد من تحديد مجلد المرفقات ومنح الصلاحية.');
    }
  }

function addCaseUpdateModalAttachment(){
    const name = (document.getElementById('case-update-attach-name')?.value || '').trim();
    const path = (document.getElementById('case-update-attach-path')?.value || '').trim();
    if(!name && !path){
      uiToast('warn','أدخل اسم الملف أو المسار أولاً.');
      return;
    }
    const list = getCaseUpdateModalAttachments();
    list.push({ name, path });
    setCaseUpdateModalAttachments(list);
    if(document.getElementById('case-update-attach-name')) document.getElementById('case-update-attach-name').value = '';
    if(document.getElementById('case-update-attach-path')) document.getElementById('case-update-attach-path').value = '';
  }
  function removeCaseUpdateModalAttachment(idx){
    const list = getCaseUpdateModalAttachments();
    list.splice(idx, 1);
    setCaseUpdateModalAttachments(list);
  }


  function _dateNum(ymd){
    if(!ymd) return NaN;
    const d = new Date(ymd);
    if(isNaN(d)) return NaN;
    return d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();
  }
  function _diffDays(fromYmd, toYmd){
    const a = new Date(fromYmd);
    const b = new Date(toYmd);
    if(isNaN(a)||isNaN(b)) return NaN;
    const ms = b.getTime() - a.getTime();
    return Math.round(ms / (1000*60*60*24));
  }

  function _ensureCasesArrays(){
    try{ if(!Array.isArray(cases)) cases = []; }catch(e){ cases = []; }
    try{ if(!Array.isArray(caseUpdates)) caseUpdates = []; }catch(e){ caseUpdates = []; }
    try{ if(!Array.isArray(caseEvents)) caseEvents = []; }catch(e){ caseEvents = []; }
  }

  function _caseId(){
    return 'CASE-' + Date.now() + '-' + Math.floor(Math.random()*1000);
  }
  function _updId(){
    return 'UPD-' + Date.now() + '-' + Math.floor(Math.random()*1000);
  }
  function _evtId(){
    return 'EVT-' + Date.now() + '-' + Math.floor(Math.random()*1000);
  }

  function toggleCasesSortDir(){
    const btn = document.getElementById('cases-sort-dir');
    if(!btn) return;
    const cur = (btn.dataset.dir || 'asc').toLowerCase();
    const next = (cur === 'asc') ? 'desc' : 'asc';
    btn.dataset.dir = next;
    btn.textContent = (next === 'asc') ? '⬆️' : '⬇️';
    onCasesAdvancedChanged();
  }

  function toggleCasesFiltersPanel(){
    const panel = document.getElementById('cases-filters-panel');
    if(!panel) return;
    panel.classList.toggle('hidden');
  }

  const onCasesAdvancedChangedDebounced = debounce(()=>onCasesAdvancedChanged(), 220);
  window.onCasesAdvancedChangedDebounced = onCasesAdvancedChangedDebounced;


  function resetCasesAdvanced(){
    try{
      const ids = [
        'cases-search-input','cases-sort-by','cases-sort-dir',
        'cases-filter-type','cases-filter-status','cases-filter-authority',
        'cases-filter-tenant','cases-filter-property','cases-filter-unit',
        'cases-filter-dfrom','cases-filter-dto','cases-filter-upcoming'
      ];
      ids.forEach(id=>{
        const el = document.getElementById(id);
        if(!el) return;
        if(el.type === 'checkbox') el.checked = false;
        else if(el.tagName === 'SELECT'){
          el.selectedIndex = 0;
        }else if(el.tagName === 'BUTTON' && id==='cases-sort-dir'){
          el.dataset.dir = 'asc';
          el.textContent = '⬆️';
        }else{
          el.value = '';
        }
      });
    }catch(e){}
    onCasesAdvancedChanged();
  }

  function _propMap(){
    const map = new Map();
    try{ (properties||[]).forEach(p=> map.set(String(p.id), p)); }catch(e){}
    return map;
  }

  function _unitMap(){
    const map = new Map();
    try{
      (properties||[]).forEach(p=>{
        (p.units||[]).forEach(u=>{
          map.set(String(u.id), { unit:u, prop:p });
        });
      });
    }catch(e){}
    return map;
  }

  function _getNextEventForCase(caseId){
    const today = _todayYMD();
    const todayNum = _dateNum(today);
    const list = (caseEvents||[]).filter(e => String(e.caseId)===String(caseId) && !e.done);
    let best = null;
    let bestNum = Infinity;
    list.forEach(e=>{
      const dn = _dateNum(e.eventDate);
      if(!Number.isFinite(dn)) return;
      if(dn < todayNum) return; // past
      if(dn < bestNum){
        bestNum = dn;
        best = e;
      }
    });
    return best;
  }

  function _caseMatchesQuery(c, q, labels){
    if(!q) return true;
    const hay = [
      c.type, c.number, c.date, c.status, c.authority, c.title, c.tenant, c.contractNo,
      labels?.propName, labels?.unitName
    ].filter(Boolean).join(' | ').toLowerCase();
    return hay.includes(q);
  }

  function _caseMatchesFilters(c, labels){
    const type = (document.getElementById('cases-filter-type')?.value || '').trim();
    const status = (document.getElementById('cases-filter-status')?.value || '').trim();
    const auth = (document.getElementById('cases-filter-authority')?.value || '').trim().toLowerCase();
    const tenant = (document.getElementById('cases-filter-tenant')?.value || '').trim().toLowerCase();
    const prop = (document.getElementById('cases-filter-property')?.value || '').trim().toLowerCase();
    const unit = (document.getElementById('cases-filter-unit')?.value || '').trim().toLowerCase();
    const dfrom = (document.getElementById('cases-filter-dfrom')?.value || '').trim();
    const dto   = (document.getElementById('cases-filter-dto')?.value || '').trim();
    const upcoming = !!document.getElementById('cases-filter-upcoming')?.checked;

    if(type && String(c.type||'') !== type) return false;
    if(status && String(c.status||'') !== status) return false;

    const authHay = String(c.authority||'').toLowerCase();
    const courtHay = String(c.court||'').toLowerCase();
    if(auth && !(authHay.includes(auth) || courtHay.includes(auth))) return false;

    if(tenant){
      const th = String(c.tenant||'').toLowerCase();
      if(!th.includes(tenant)) return false;
    }
    if(prop){
      const ph = String(labels?.propName||c.propertyId||'').toLowerCase();
      if(!ph.includes(prop)) return false;
    }
    if(unit){
      const uh = String(labels?.unitName||c.unitId||'').toLowerCase();
      if(!uh.includes(unit)) return false;
    }

    if(dfrom){
      const a = _dateNum(c.date);
      const b = _dateNum(dfrom);
      if(Number.isFinite(a) && Number.isFinite(b) && a < b) return false;
    }
    if(dto){
      const a = _dateNum(c.date);
      const b = _dateNum(dto);
      if(Number.isFinite(a) && Number.isFinite(b) && a > b) return false;
    }

    if(upcoming){
      const ne = _getNextEventForCase(c.id);
      if(!ne) return false;
    }

    return true;
  }

  function _sortCases(list){
    const sortBy = document.getElementById('cases-sort-by')?.value || 'date';
    const dir = (document.getElementById('cases-sort-dir')?.dataset?.dir || 'asc').toLowerCase();
    const mul = (dir === 'desc') ? -1 : 1;

    const statusRank = (s)=>{
      const v = String(s||'');
      if(v==='مفتوحة') return 1;
      if(v==='قيد المتابعة') return 2;
      if(v==='مغلقة') return 3;
      return 9;
    };
    const typeRank = (t)=>{
      const v = String(t||'');
      if(v==='بلاغ') return 1;
      if(v==='دعوى') return 2;
      return 9;
    };

    return (list||[]).slice().sort((a,b)=>{
      if(sortBy==='date'){
        const da = _dateNum(a.date), db = _dateNum(b.date);
        return (da-db) * mul;
      }
      if(sortBy==='nextEvent'){
        const ea = _getNextEventForCase(a.id);
        const eb = _getNextEventForCase(b.id);
        const da = _dateNum(ea?.eventDate), db = _dateNum(eb?.eventDate);
        const na = Number.isFinite(da) ? da : (mul>0? 99999999 : 0);
        const nb = Number.isFinite(db) ? db : (mul>0? 99999999 : 0);
        return (na-nb) * mul;
      }
      if(sortBy==='status'){
        return (statusRank(a.status)-statusRank(b.status)) * mul;
      }
      if(sortBy==='type'){
        return (typeRank(a.type)-typeRank(b.type)) * mul;
      }
      if(sortBy==='number'){
        return String(a.number||'').localeCompare(String(b.number||'')) * mul;
      }
      if(sortBy==='tenant'){
        return String(a.tenant||'').localeCompare(String(b.tenant||'')) * mul;
      }
      if(sortBy==='unit'){
        return String(a.unitId||'').localeCompare(String(b.unitId||'')) * mul;
      }
      if(sortBy==='property'){
        return String(a.propertyId||'').localeCompare(String(b.propertyId||'')) * mul;
      }
      return 0;
    });
  }

  function onCasesAdvancedChanged(){
    renderPoliceCases();
  }

  function renderPoliceCases(){
    _ensureCasesArrays();

    const tbody = document.getElementById('cases-table-body');
    if(!tbody) return;

    const q = (document.getElementById('cases-search-input')?.value || '').trim().toLowerCase();

    const pmap = _propMap();
    const umap = _unitMap();

    let list = (cases||[]).map(c=>{
      const pid = String(c.propertyId||'');
      const uid = String(c.unitId||'');
      const prop = pid ? pmap.get(pid) : null;
      const uctx = uid ? umap.get(uid) : null;
      const labels = {
        propName: prop?.name || uctx?.prop?.name || '',
        unitName: unitLabel(uctx?.unit || {}) || (uctx?.unit?.name||'') || ''
      };
      return { c, labels };
    }).filter(x=>{
      return _caseMatchesQuery(x.c, q, x.labels) && _caseMatchesFilters(x.c, x.labels);
    }).map(x=>{
      const ne = _getNextEventForCase(x.c.id);
      return { ...x.c, __labels:x.labels, __nextEvent:ne };
    });

    list = _sortCases(list);

    const pg = paginateList(list, CASES_PAGER_KEY, 25);
    const items = pg.items || [];

    tbody.innerHTML = '';
    const frag = document.createDocumentFragment();

    items.forEach(c=>{
      const propName = c.__labels?.propName || '';
      const unitName = c.__labels?.unitName || '';
      const next = c.__nextEvent ? `${formatDMY(c.__nextEvent.eventDate)}${c.__nextEvent.eventTime ? (' - ' + c.__nextEvent.eventTime) : ''}` : '—';

      const st = String(c.status||'');
      const statusPill =
        st==='مفتوحة' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200' :
        st==='قيد المتابعة' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' :
        st==='مغلقة' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' :
        'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors';
      tr.innerHTML = `
        <td class="px-4 py-3 text-gray-700 dark:text-gray-200">${escHtml(c.type||'')}</td>
        <td class="px-4 py-3 font-mono text-gray-700 dark:text-gray-200">${escHtml(c.number||'')}</td>
        <td class="px-4 py-3 text-gray-700 dark:text-gray-200">${escHtml(formatDMY(c.date||''))}</td>
        <td class="px-4 py-3 text-gray-700 dark:text-gray-200">${escHtml(c.authority||c.court||'')}</td>
        <td class="px-4 py-3 text-gray-700 dark:text-gray-200">${escHtml(c.tenant||'')}</td>
        <td class="px-4 py-3 text-gray-700 dark:text-gray-200">${escHtml(propName)}</td>
        <td class="px-4 py-3 text-gray-700 dark:text-gray-200">${escHtml(unitName)}</td>
        <td class="px-4 py-3">
          <span class="px-2 py-1 rounded-full text-xs ${statusPill}">${escHtml(st)}</span>
        </td>
        <td class="px-4 py-3 text-gray-700 dark:text-gray-200">${escHtml(next)}</td>
        <td class="px-4 py-3">
          <div class="flex gap-2 justify-end">
            <button type="button" onclick="openCaseAttachmentsViewer(\'${escJsStr(c.id)}\')" class="btn-ui btn-ui-sm btn-icon btn-secondary" title="الملفات">📁</button>
            <button type="button" onclick="openCaseDetails('${escJsStr(c.id)}')" class="btn-ui btn-ui-sm btn-icon btn-secondary" title="عرض التفاصيل">👁️</button>
            <button type="button" onclick="openCaseModal('${escJsStr(c.id)}')" class="btn-ui btn-ui-sm btn-icon btn-secondary" title="تعديل">✏️</button>
            <button type="button" onclick="closeCaseQuick('${escJsStr(c.id)}')" class="btn-ui btn-ui-sm btn-icon btn-success" title="إغلاق">✅</button>
          </div>
        </td>
      `;
      frag.appendChild(tr);
    });

    tbody.appendChild(frag);

    // Hint
    const hint = document.getElementById('cases-filter-hint');
    if(hint){
      hint.textContent = (pg.total ? `عدد النتائج: ${pg.total}` : 'لا توجد نتائج');
    }

    // Pager
    renderPagerUI(CASES_PAGER_KEY, document.getElementById('cases-pager'), pg);

    // Normalize buttons (visual consistency)
    try{ scheduleNormalizeButtons(); }catch(e){}

    // Reminders (lightweight)
    try{ checkPoliceCaseReminders(); }catch(e){}
  }

  // ================= Details Panel =================

  function openCaseDetails(caseId){
    _ensureCasesArrays();
    const c = (cases||[]).find(x => String(x.id)===String(caseId));
    if(!c){
      uiToast('error','القضية غير موجودة.');
      return;
    }
    window.__currentCaseId = c.id;

    const panel = document.getElementById('cases-details-panel');
    if(panel) panel.classList.remove('hidden');

    // default tab
    switchCaseTab('updates');
    renderCaseDetails();
  }

  function closeCaseDetails(){
    window.__currentCaseId = '';
    const panel = document.getElementById('cases-details-panel');
    if(panel) panel.classList.add('hidden');
  }

  
  // ================= Attachments Viewer (Case Folder) =================
  function openCaseAttachmentsViewer(caseId){
    try{
      _ensureCasesArrays();
      const id = String(caseId || '').trim();
      if(!id){
        uiToast?.('info','اختر قضية أولاً.');
        return;
      }
      const c = (cases||[]).find(x => String(x.id)===String(id));
      const title = c ? ('مرفقات القضية: ' + (c.number || c.id)) : ('مرفقات القضية: ' + id);
      const folder = (typeof buildCaseFolder==='function') ? buildCaseFolder(id) : ('Attachments/cases/' + id + '/');
      if(typeof openAttachmentsViewer==='function') openAttachmentsViewer({ title, folderPath: folder });
      else uiToast?.('warn','ميزة عرض المرفقات غير متاحة.');
    }catch(e){
      console.error(e);
      uiToast?.('warn','تعذر فتح مرفقات القضية.');
    }
  }
  window.openCaseAttachmentsViewer = openCaseAttachmentsViewer;

function switchCaseTab(tab){
    const up = document.getElementById('case-tab-updates-panel');
    const ev = document.getElementById('case-tab-events-panel');
    const btnU = document.getElementById('case-tab-updates');
    const btnE = document.getElementById('case-tab-events');
    if(!up||!ev||!btnU||!btnE) return;
    const isUpdates = (tab === 'updates');
    up.classList.toggle('hidden', !isUpdates);
    ev.classList.toggle('hidden', isUpdates);
    // visual cue
    btnU.classList.toggle('btn-success', isUpdates);
    btnE.classList.toggle('btn-success', !isUpdates);
  }

  function renderCaseDetails(){
    const id = window.__currentCaseId;
    if(!id) return;

    const c = (cases||[]).find(x => String(x.id)===String(id));
    if(!c) return;

    const pmap = _propMap();
    const umap = _unitMap();
    const prop = c.propertyId ? pmap.get(String(c.propertyId)) : null;
    const uctx = c.unitId ? umap.get(String(c.unitId)) : null;
    const propName = prop?.name || uctx?.prop?.name || '';
    const unitName = unitLabel(uctx?.unit || {}) || (uctx?.unit?.name||'') || '';

    const title = document.getElementById('case-details-title');
    const sub = document.getElementById('case-details-sub');
    if(title) title.textContent = `${c.type || 'قضية'}: ${c.number || ''}`;
    if(sub) sub.textContent = `${formatDMY(c.date||'')} • ${c.status||''}`;

    const basic = document.getElementById('case-details-basic');
    if(basic){
      const rows = [
        ['الجهة/المحكمة', c.authority || c.court || '—'],
        ['المستأجر', c.tenant || '—'],
        ['العقار', propName || '—'],
        ['الوحدة', unitName || '—'],
        ['رقم العقد', c.contractNo || '—'],
        ['عنوان', c.title || '—'],
      ];
      const atts = _caseAttsFromRecord(c);
      const attsHtml = atts.length
        ? `<div class="mt-3"><div class="text-xs text-gray-500 dark:text-gray-400 mb-1">المرفقات</div>`
           + atts.map(a=>{
               const label = (a.name || a.path || 'مرفق');
               const href = _safeHref(a.path);
               const link = _attLink(label, a.path);
               const p = a.path ? `<div class="font-mono text-xs text-gray-500 dark:text-gray-400 break-all mt-1">${escHtml(a.path)}</div>` : '';
               return `<div class="p-2 rounded-xl bg-white/60 dark:bg-gray-900/30 border border-white/40 dark:border-gray-700">${link}${p}</div>`;
             }).join('')
           + `</div>`
        : `<div class="mt-3 text-xs text-gray-500 dark:text-gray-400">المرفقات: —</div>`;

      basic.innerHTML = rows.map(([k,v])=>`<div class="flex justify-between gap-3"><span class="text-gray-500 dark:text-gray-400">${escHtml(k)}</span><span class="font-semibold">${escHtml(v)}</span></div>`).join('')
        + attsHtml
        + (c.notes ? `<div class="mt-2 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line">${escHtml(c.notes)}</div>` : '');
    }

    renderCaseUpdates();
    renderCaseEvents();
  }

  function renderCaseUpdates(){
    const id = window.__currentCaseId;
    const box = document.getElementById('case-updates-list');
    if(!box) return;
    const list = (caseUpdates||[]).filter(u=> String(u.caseId)===String(id))
      .slice().sort((a,b)=> (_dateNum(b.date)-_dateNum(a.date)));

    if(!list.length){
      box.innerHTML = `<div class="text-sm text-gray-500 dark:text-gray-400">لا توجد تطورات حتى الآن.</div>`;
      return;
    }

    box.innerHTML = list.map(u=>{
      const typeLabel =
        u.type==='fee' ? 'رسوم/غرامة' :
        u.type==='judgement' ? 'حكم/قرار' :
        u.type==='document' ? 'مستند' : 'مذكرة/محضر';

      const amount = (u.amount && Number(u.amount) > 0) ? ` • ${formatAED(u.amount)}` : '';
      const atts = _updAttsFromRecord(u);
      const attsHtml = atts.length ? `<div class="mt-2 space-y-2">` + atts.map(a=>{
        const label = (a.name || a.path || 'مرفق');
        const href = _safeHref(a.path);
        const link = _attLink(label, a.path);
        const p = a.path ? `<div class="font-mono text-xs text-gray-500 dark:text-gray-400 break-all mt-1">${escHtml(a.path)}</div>` : '';
        return `<div class="p-2 rounded-xl bg-white/60 dark:bg-gray-900/30 border border-white/40 dark:border-gray-700">${link}${p}</div>`;
      }).join('') + `</div>` : '';
      return `
        <div class="p-3 rounded-xl bg-white/60 dark:bg-gray-900/30 border border-white/40 dark:border-gray-700">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-sm font-bold text-gray-800 dark:text-white">${escHtml(typeLabel)}${amount}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">${escHtml(formatDMY(u.date||''))}</div>
          </div>
          ${u.title ? `<div class="text-sm text-gray-700 dark:text-gray-200 mt-1">${escHtml(u.title)}</div>` : ''}
          ${u.note ? `<div class="text-xs text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-line">${escHtml(u.note)}</div>` : ''}
          ${attsHtml}
          <div class="mt-2 flex justify-end gap-2">
            <button type="button" onclick="openCaseUpdateModal('${escJsStr(u.id)}')" class="btn-ui btn-ui-sm btn-icon btn-secondary" title="تعديل">✏️</button>
            <button type="button" onclick="deleteCaseUpdate('${escJsStr(u.id)}')" class="btn-ui btn-ui-sm btn-icon btn-danger" title="حذف">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    try{ scheduleNormalizeButtons(); }catch(e){}
  }

  function renderCaseEvents(){
    const id = window.__currentCaseId;
    const box = document.getElementById('case-events-list');
    if(!box) return;
    const list = (caseEvents||[]).filter(e=> String(e.caseId)===String(id))
      .slice().sort((a,b)=> (_dateNum(a.eventDate)-_dateNum(b.eventDate)));

    if(!list.length){
      box.innerHTML = `<div class="text-sm text-gray-500 dark:text-gray-400">لا توجد مواعيد حتى الآن.</div>`;
      return;
    }

    box.innerHTML = list.map(e=>{
      const kind = e.eventType==='court_session' ? 'جلسة محكمة' : 'مراجعة شرطة';
      const when = `${formatDMY(e.eventDate||'')}${e.eventTime ? (' - ' + escHtml(e.eventTime)) : ''}`;
      const rem = Array.isArray(e.remindDays) ? e.remindDays.slice().sort((a,b)=>a-b).join(', ') : '';
      const done = !!e.done;

      return `
        <div class="p-3 rounded-xl bg-white/60 dark:bg-gray-900/30 border border-white/40 dark:border-gray-700">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-sm font-bold text-gray-800 dark:text-white">${escHtml(kind)}: ${escHtml(e.title||'')}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">${escHtml(when)}</div>
          </div>
          <div class="mt-1 text-xs text-gray-600 dark:text-gray-300">تنبيه قبل: ${escHtml(rem || '—')} يوم</div>
          ${e.notes ? `<div class="mt-2 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line">${escHtml(e.notes)}</div>` : ''}
          <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" ${done?'checked':''} onchange="toggleCaseEventDone('${escJsStr(e.id)}', this.checked)"/>
              <span>تم</span>
            </label>
            <div class="flex gap-2">
              <button type="button" onclick="openCaseEventModal('${escJsStr(e.id)}')" class="btn-ui btn-ui-sm btn-icon btn-secondary" title="تعديل">✏️</button>
              <button type="button" onclick="deleteCaseEvent('${escJsStr(e.id)}')" class="btn-ui btn-ui-sm btn-icon btn-danger" title="حذف">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    try{ scheduleNormalizeButtons(); }catch(e){}
  }

  // ================= CRUD: Case =================

  function openCaseModal(caseId=''){
    _ensureCasesArrays();
    const modal = document.getElementById('case-modal');
    if(!modal) return;

    // Fill dropdowns
    fillCasePropertyOptions();
    fillTenantsDatalist();

    const isEdit = !!caseId;
    const c = isEdit ? (cases||[]).find(x=> String(x.id)===String(caseId)) : null;

    document.getElementById('case-modal-title').textContent = isEdit ? 'تعديل بلاغ/دعوى' : 'إضافة بلاغ/دعوى';
    document.getElementById('case-id').value = c?.id || '';
    document.getElementById('case-type').value = c?.type || 'بلاغ';
    document.getElementById('case-status').value = c?.status || 'مفتوحة';
    document.getElementById('case-number').value = c?.number || '';
    document.getElementById('case-date').value = c?.date || _todayYMD();
    document.getElementById('case-authority').value = c?.authority || c?.court || '';
    document.getElementById('case-property').value = c?.propertyId || '';
    // populate unit options based on property
    fillCaseUnitOptions(c?.propertyId || '');
    document.getElementById('case-unit').value = c?.unitId || '';
    document.getElementById('case-tenant').value = c?.tenant || '';
    document.getElementById('case-contractNo').value = c?.contractNo || '';
    document.getElementById('case-title').value = c?.title || '';
    document.getElementById('case-notes').value = c?.notes || '';

    // Attachments (paths)
    try{ setCaseModalAttachments(_caseAttsFromRecord(c)); }catch(e){ setCaseModalAttachments([]); }
    if(document.getElementById('case-attach-name')) document.getElementById('case-attach-name').value = '';
    if(document.getElementById('case-attach-path')) document.getElementById('case-attach-path').value = '';

    modal.classList.remove('hidden');

    // Auto-fill based on selected unit if editing
    try{ if(c?.unitId) onCaseUnitChanged(); }catch(e){}
  }

  function closeCaseModal(){
    document.getElementById('case-modal')?.classList.add('hidden');
  }

  function saveCaseFromModal(e){
    e.preventDefault();
    _ensureCasesArrays();

    const id = (document.getElementById('case-id')?.value || '').trim();
    const type = (document.getElementById('case-type')?.value || 'بلاغ').trim();
    const status = (document.getElementById('case-status')?.value || 'مفتوحة').trim();
    const number = (document.getElementById('case-number')?.value || '').trim();
    const date = (document.getElementById('case-date')?.value || _todayYMD()).trim();
    const authority = (document.getElementById('case-authority')?.value || '').trim();

    const propertyId = (document.getElementById('case-property')?.value || '').trim();
    const unitId = (document.getElementById('case-unit')?.value || '').trim();

    const tenant = (document.getElementById('case-tenant')?.value || '').trim();
    const contractNo = (document.getElementById('case-contractNo')?.value || '').trim();
    const title = (document.getElementById('case-title')?.value || '').trim();
    const notes = (document.getElementById('case-notes')?.value || '').trim();
    let attachments = getCaseModalAttachments();
    const quickName = (document.getElementById('case-attach-name')?.value || '').trim();
    const quickPath = (document.getElementById('case-attach-path')?.value || '').trim();
    if(quickName || quickPath){ attachments = (attachments||[]).concat([{ name: quickName, path: quickPath }]); }
    attachments = _normAttachments(attachments);
    const doc = attachments[0] ? (attachments[0].path || attachments[0].name || '') : '';

    if(!number){
      uiToast('error','الرجاء إدخال رقم البلاغ/القضية.');
      return;
    }

    const now = _nowISO();

    if(id){
      const idx = (cases||[]).findIndex(x=> String(x.id)===String(id));
      if(idx === -1){
        uiToast('error','تعذر العثور على السجل للتعديل.');
        return;
      }
      cases[idx] = {
        ...cases[idx],
        type, status, number, date,
        authority, court: authority,
        propertyId: propertyId || null,
        unitId: unitId || null,
        tenant, contractNo, title, notes, attachments, doc,
        updatedAt: now
      };
      uiToast('success','تم تحديث السجل ✅');
    }else{
      const newId = _caseId();
      cases.unshift({
        id: newId,
        type, status, number, date,
        authority, court: authority,
        propertyId: propertyId || null,
        unitId: unitId || null,
        tenant, contractNo, title, notes, attachments, doc,
        createdAt: now,
        updatedAt: now
      });
      uiToast('success','تمت الإضافة ✅');
    }

    try{ saveToLocal(); }catch(e){}
    closeCaseModal();
    renderPoliceCases();
    // if details open, refresh
    if(window.__currentCaseId) renderCaseDetails();
  }

  function closeCaseQuick(caseId){
    const c = (cases||[]).find(x=> String(x.id)===String(caseId));
    if(!c) return;
    if(String(c.status||'') === 'مغلقة'){
      uiToast('info','الحالة بالفعل مغلقة.');
      return;
    }
    if(!confirm('تأكيد إغلاق القضية/البلاغ؟')) return;
    c.status = 'مغلقة';
    c.updatedAt = _nowISO();
    try{ saveToLocal(); }catch(e){}
    uiToast('success','تم إغلاق القضية ✅');
    renderPoliceCases();
    if(window.__currentCaseId === caseId) renderCaseDetails();
  }

  // ================= CRUD: Updates =================

  function openCaseUpdateModal(updateId=''){
    const caseId = window.__currentCaseId || '';
    if(!caseId){
      uiToast('warn','اختر قضية أولاً.');
      return;
    }
    _ensureCasesArrays();
    const modal = document.getElementById('case-update-modal');
    if(!modal) return;

    const isEdit = !!updateId;
    const u = isEdit ? (caseUpdates||[]).find(x=> String(x.id)===String(updateId)) : null;

    document.getElementById('case-update-modal-title').textContent = isEdit ? 'تعديل تطور' : 'إضافة تطور';
    document.getElementById('case-update-id').value = u?.id || '';
    document.getElementById('case-update-caseId').value = caseId;
    document.getElementById('case-update-type').value = u?.type || 'note';
    document.getElementById('case-update-date').value = u?.date || _todayYMD();
    document.getElementById('case-update-title').value = u?.title || '';
    document.getElementById('case-update-amount').value = (u?.amount || '') !== 0 ? (u?.amount || '') : '';

    // Attachments (paths)
    try{ setCaseUpdateModalAttachments(_updAttsFromRecord(u)); }catch(e){ setCaseUpdateModalAttachments([]); }
    if(document.getElementById('case-update-attach-name')) document.getElementById('case-update-attach-name').value = '';
    if(document.getElementById('case-update-attach-path')) document.getElementById('case-update-attach-path').value = '';

    document.getElementById('case-update-note').value = u?.note || '';

    modal.classList.remove('hidden');
  }

  function closeCaseUpdateModal(){
    document.getElementById('case-update-modal')?.classList.add('hidden');
  }

  function saveCaseUpdateFromModal(e){
    e.preventDefault();
    _ensureCasesArrays();

    const id = (document.getElementById('case-update-id')?.value || '').trim();
    const caseId = (document.getElementById('case-update-caseId')?.value || '').trim();
    const type = (document.getElementById('case-update-type')?.value || 'note').trim();
    const date = (document.getElementById('case-update-date')?.value || _todayYMD()).trim();
    const title = (document.getElementById('case-update-title')?.value || '').trim();
    const note = (document.getElementById('case-update-note')?.value || '').trim();
    const amount = parseAED(document.getElementById('case-update-amount')?.value || '');
    let attachments = getCaseUpdateModalAttachments();
    const quickName = (document.getElementById('case-update-attach-name')?.value || '').trim();
    const quickPath = (document.getElementById('case-update-attach-path')?.value || '').trim();
    if(quickName || quickPath){ attachments = (attachments||[]).concat([{ name: quickName, path: quickPath }]); }
    attachments = _normAttachments(attachments);
    const doc = attachments[0] ? (attachments[0].path || attachments[0].name || '') : '';

    if(!caseId){
      uiToast('error','تعذر تحديد القضية.');
      return;
    }
    if(!date){
      uiToast('error','الرجاء تحديد تاريخ.');
      return;
    }

    const now = _nowISO();
    if(id){
      const idx = (caseUpdates||[]).findIndex(x=> String(x.id)===String(id));
      if(idx===-1){ uiToast('error','تعذر العثور على التطور.'); return; }
      caseUpdates[idx] = { ...caseUpdates[idx], caseId, type, date, title, note, amount, attachments, doc, updatedAt: now };
      uiToast('success','تم تحديث التطور ✅');
    }else{
      caseUpdates.unshift({ id:_updId(), caseId, type, date, title, note, amount, attachments, doc, createdAt: now, updatedAt: now });
      uiToast('success','تمت إضافة التطور ✅');
    }

    try{ saveToLocal(); }catch(e){}
    closeCaseUpdateModal();
    renderCaseUpdates();
    // keep details consistent
    renderPoliceCases();
  }

  function deleteCaseUpdate(updateId){
    if(!confirm('حذف هذا التطور؟')) return;
    const before = (caseUpdates||[]).length;
    caseUpdates = (caseUpdates||[]).filter(u=> String(u.id)!==String(updateId));
    if((caseUpdates||[]).length === before) return;
    try{ saveToLocal(); }catch(e){}
    uiToast('success','تم الحذف ✅');
    renderCaseUpdates();
    renderPoliceCases();
  }

  // ================= CRUD: Events =================

  function openCaseEventModal(eventId=''){
    const caseId = window.__currentCaseId || '';
    if(!caseId){
      uiToast('warn','اختر قضية أولاً.');
      return;
    }
    _ensureCasesArrays();
    const modal = document.getElementById('case-event-modal');
    if(!modal) return;

    const isEdit = !!eventId;
    const ev = isEdit ? (caseEvents||[]).find(x=> String(x.id)===String(eventId)) : null;

    document.getElementById('case-event-modal-title').textContent = isEdit ? 'تعديل موعد/جلسة' : 'إضافة موعد/جلسة';
    document.getElementById('case-event-id').value = ev?.id || '';
    document.getElementById('case-event-caseId').value = caseId;
    document.getElementById('case-event-type').value = ev?.eventType || 'police_review';
    document.getElementById('case-event-date').value = ev?.eventDate || _todayYMD();
    document.getElementById('case-event-time').value = ev?.eventTime || '';
    document.getElementById('case-event-title').value = ev?.title || '';
    document.getElementById('case-event-notes').value = ev?.notes || '';

    const days = Array.isArray(ev?.remindDays) ? ev.remindDays : [7,3,1];
    document.getElementById('case-rem-7').checked = days.includes(7);
    document.getElementById('case-rem-3').checked = days.includes(3);
    document.getElementById('case-rem-1').checked = days.includes(1);

    modal.classList.remove('hidden');
  }

  function closeCaseEventModal(){
    document.getElementById('case-event-modal')?.classList.add('hidden');
  }

  function saveCaseEventFromModal(e){
    e.preventDefault();
    _ensureCasesArrays();

    const id = (document.getElementById('case-event-id')?.value || '').trim();
    const caseId = (document.getElementById('case-event-caseId')?.value || '').trim();

    const eventType = (document.getElementById('case-event-type')?.value || 'police_review').trim();
    const eventDate = (document.getElementById('case-event-date')?.value || _todayYMD()).trim();
    const eventTime = (document.getElementById('case-event-time')?.value || '').trim();
    const title = (document.getElementById('case-event-title')?.value || '').trim();
    const notes = (document.getElementById('case-event-notes')?.value || '').trim();

    const remindDays = [];
    if(document.getElementById('case-rem-7')?.checked) remindDays.push(7);
    if(document.getElementById('case-rem-3')?.checked) remindDays.push(3);
    if(document.getElementById('case-rem-1')?.checked) remindDays.push(1);

    if(!caseId){ uiToast('error','تعذر تحديد القضية.'); return; }
    if(!eventDate){ uiToast('error','الرجاء تحديد تاريخ الموعد.'); return; }
    if(!title){ uiToast('error','الرجاء إدخال عنوان الموعد.'); return; }

    const now = _nowISO();
    if(id){
      const idx = (caseEvents||[]).findIndex(x=> String(x.id)===String(id));
      if(idx===-1){ uiToast('error','تعذر العثور على الموعد.'); return; }
      caseEvents[idx] = { ...caseEvents[idx], caseId, eventType, eventDate, eventTime, title, notes, remindDays, updatedAt: now };
      uiToast('success','تم تحديث الموعد ✅');
    }else{
      caseEvents.push({ id:_evtId(), caseId, eventType, eventDate, eventTime, title, notes, remindDays, done:false, createdAt: now, updatedAt: now });
      uiToast('success','تمت إضافة الموعد ✅');
    }

    try{ saveToLocal(); }catch(e){}
    closeCaseEventModal();
    renderCaseEvents();
    renderPoliceCases();
  }

  function deleteCaseEvent(eventId){
    if(!confirm('حذف هذا الموعد؟')) return;
    const before = (caseEvents||[]).length;
    caseEvents = (caseEvents||[]).filter(e=> String(e.id)!==String(eventId));
    if((caseEvents||[]).length === before) return;
    try{ saveToLocal(); }catch(e){}
    uiToast('success','تم الحذف ✅');
    renderCaseEvents();
    renderPoliceCases();
  }

  function toggleCaseEventDone(eventId, done){
    const ev = (caseEvents||[]).find(e=> String(e.id)===String(eventId));
    if(!ev) return;
    ev.done = !!done;
    ev.updatedAt = _nowISO();
    try{ saveToLocal(); }catch(e){}
    renderPoliceCases();
  }

  // ================= Linking (Property -> Unit -> Tenant/Contract auto-fill) =================

  function fillCasePropertyOptions(){
    const sel = document.getElementById('case-property');
    if(!sel) return;
    const cur = sel.value;
    const options = ['<option value="">— اختياري —</option>'];
    (properties||[]).forEach(p=>{
      options.push(`<option value="${escHtml(p.id)}">${escHtml(p.name||p.id)}</option>`);
    });
    sel.innerHTML = options.join('');
    sel.value = cur || '';
    fillCaseUnitOptions(sel.value || '');
  }

  function fillCaseUnitOptions(propertyId){
    const sel = document.getElementById('case-unit');
    if(!sel) return;
    const cur = sel.value;
    const pid = String(propertyId||'');
    const p = (properties||[]).find(x=> String(x.id)===pid);
    const options = ['<option value="">— اختياري —</option>'];
    (p?.units||[]).forEach(u=>{
      const label = unitLabel(u) || u.name || u.id;
      options.push(`<option value="${escHtml(u.id)}">${escHtml(label)}</option>`);
    });
    sel.innerHTML = options.join('');
    sel.value = cur || '';
  }

  function onCasePropertyChanged(){
    const pid = document.getElementById('case-property')?.value || '';
    fillCaseUnitOptions(pid);
    // reset derived fields
    try{
      document.getElementById('case-unit').value = '';
      document.getElementById('case-tenant').value = '';
      document.getElementById('case-contractNo').value = '';
    }catch(e){}
  }

  function onCaseUnitChanged(){
    const uid = document.getElementById('case-unit')?.value || '';
    if(!uid) return;

    // find unit details
    let found = null;
    try{
      (properties||[]).some(p=>{
        const u = (p.units||[]).find(x=> String(x.id)===String(uid));
        if(u){ found = {u, p}; return true; }
        return false;
      });
    }catch(e){}

    if(!found) return;

    // Auto-fill tenant/contract if present
    try{
      const tenantEl = document.getElementById('case-tenant');
      const cnEl = document.getElementById('case-contractNo');
      if(tenantEl && !tenantEl.value) tenantEl.value = found.u.tenant || '';
      if(cnEl && !cnEl.value) cnEl.value = found.u.contractNo || '';
      const propEl = document.getElementById('case-property');
      if(propEl && !propEl.value) propEl.value = found.p.id || '';
    }catch(e){}
  }

  
  function fillTenantsDatalist(){
    const dl = document.getElementById('tenants-datalist');
    if(!dl) return;
    const set = new Set();
    try{
      (properties||[]).forEach(p=>(p.units||[]).forEach(u=>{
        if(u.tenant) set.add(String(u.tenant).trim());
      }));
    }catch(e){}
    try{
      Object.values(tenantsContacts||{}).forEach(v=>{
        const nm = (v.name || v.fullName || '').trim();
        if(nm) set.add(nm);
      });
    }catch(e){}
    dl.innerHTML = Array.from(set).slice(0,400).map(n=>`<option value="${escHtml(n)}"></option>`).join('');
  }

// ================= Reminders =================

  function checkPoliceCaseReminders(){
    _ensureCasesArrays();
    const today = _todayYMD();

    // avoid spamming: we store markers per event/dayBefore per day
    const todayNum = _dateNum(today);

    const pending = (caseEvents||[]).filter(e=> e && !e.done && e.eventDate);
    pending.forEach(e=>{
      const dn = _dateNum(e.eventDate);
      if(!Number.isFinite(dn)) return;
      if(dn < todayNum) return;

      const diff = _diffDays(today, e.eventDate);
      const days = Array.isArray(e.remindDays) ? e.remindDays : [];
      days.forEach(d=>{
        if(Number(diff) !== Number(d)) return;

        const key = `re_case_notify_${e.id}_${d}`;
        const last = localStorage.getItem(key) || '';
        if(last === today) return;

        localStorage.setItem(key, today);

        // find case number for message
        const c = (cases||[]).find(x=> String(x.id)===String(e.caseId));
        const cn = c?.number ? ` (${c.number})` : '';
        uiToast('warn', `تنبيه: "${e.title}" بعد ${d} يوم${cn} — ${formatDMY(e.eventDate)}${e.eventTime?(' '+e.eventTime):''}`);
      });
    });
  }

  // ================= Safe wiring on first load =================
  (function(){
    try{
      // ensure search/sort defaults exist
      const sortDir = document.getElementById('cases-sort-dir');
      if(sortDir && !sortDir.dataset.dir){
        sortDir.dataset.dir = 'asc';
        sortDir.textContent = '⬆️';
      }
    }catch(e){}
  })();
