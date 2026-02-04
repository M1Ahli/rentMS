// ================================================
// 02_notices_health.js - Notices + Toasts + Errors + Health/Perf helpers
// Auto-split from legacy app.js for maintainability.
// DO NOT edit the legacy file directly; edit split modules.
// ================================================

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
      else if(key==='police_cases') renderPoliceCases();
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


