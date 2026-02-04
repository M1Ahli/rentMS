// ================================================
// 00_attachments_fs.js - Attachments Storage (Files)
// Uses File System Access API (Chrome/Edge) to write
// files into a user-chosen Attachments folder.
// Falls back to OPFS (origin-private filesystem) if
// FS Access isn't available.
// ================================================

(function(){
  'use strict';

  const FS_DB_NAME = 'rentms_fs';
  const FS_DB_STORE = 'kv';
  const FS_ROOT_KEY = 'attachments_root_handle';

  function _supportsFSAccess(){
    return !!(window.showDirectoryPicker && window.FileSystemFileHandle && window.FileSystemDirectoryHandle);
  }
  function _supportsOPFS(){
    return !!(navigator.storage && navigator.storage.getDirectory);
  }

  // Insecure HTTP (e.g., NAS http://ip) blocks FS Access + OPFS in Chrome.
  // In that case, we must NOT attempt directory/file handles to avoid freezes.
  function _isInsecureHttp(){
    try{
      // IMPORTANT:
      // Some users may enable Chrome flags ("treat insecure origin as secure") which can make
      // window.isSecureContext=true even on http://NAS_IP. That leads to filesystem/OPFS code paths
      // that are unreliable on NAS/HTTP and can freeze the UI.
      // We therefore force "NAS HTTP" detection purely by URL (http + not localhost).
      const host = String(location.hostname || '').toLowerCase();
      const isLocal = (host === 'localhost' || host === '127.0.0.1' || host === '[::1]');
      return (location.protocol === 'http:') && !isLocal;
    }catch(e){
      return true;
    }
  }


  function _sanitizeRelPath(p){
    let s = String(p||'').replace(/\\/g,'/').trim();
    // Remove leading "./"
    s = s.replace(/^\.\//,'');
    // Disallow path traversal
    if(s.includes('..')) throw new Error('Invalid path');
    // Collapse duplicate slashes
    s = s.replace(/\/{2,}/g,'/');
    // Remove leading slash
    s = s.replace(/^\/+/,'');
    return s;
  }

  function _safeKey(s){
    return String(s||'').trim()
      .replace(/[^\w\-]+/g,'_')
      .replace(/_+/g,'_')
      .replace(/^_+|_+$/g,'') || 'item';
  }

  // ------------------------------
  // IndexedDB KV
  // ------------------------------
  function _openDB(){
    return new Promise((resolve, reject)=>{
      const req = indexedDB.open(FS_DB_NAME, 1);
      req.onupgradeneeded = ()=>{
        const db = req.result;
        if(!db.objectStoreNames.contains(FS_DB_STORE)){
          db.createObjectStore(FS_DB_STORE);
        }
      };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }

  async function _idbGet(key){
    const db = await _openDB();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction(FS_DB_STORE,'readonly');
      const st = tx.objectStore(FS_DB_STORE);
      const req = st.get(key);
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }

  async function _idbSet(key, val){
    const db = await _openDB();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction(FS_DB_STORE,'readwrite');
      const st = tx.objectStore(FS_DB_STORE);
      const req = st.put(val, key);
      req.onsuccess = ()=> resolve(true);
      req.onerror = ()=> reject(req.error);
    });
  }

  // ------------------------------
  // FS Root selection
  // ------------------------------
  async function chooseAttachmentsRoot(){
    try{
      if(_isInsecureHttp()){
        uiToast?.('info','على HTTP (NAS) لا يمكن اختيار مجلد أو حفظ ملفات من المتصفح. سيتم استخدام مسارات المرفقات فقط (Recorded Mode).');
        try{ await _idbSet(FS_ROOT_KEY, { mode:'served' }); }catch(e){}
        return { mode:'served', handle: null };
      }
      if(!_supportsFSAccess()){
        if(_supportsOPFS()){
          uiToast?.('info','متصفحك لا يدعم الوصول لمجلدات الجهاز. سيتم استخدام التخزين الداخلي (OPFS).');
          const root = await navigator.storage.getDirectory();
          await _idbSet(FS_ROOT_KEY, { mode:'opfs' });
          return { mode:'opfs', handle: root };
        }
        uiToast?.('warn','متصفحك لا يدعم رفع وتخزين الملفات على مجلدات الجهاز. يفضل Chrome/Edge.');
        return null;
      }
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await _idbSet(FS_ROOT_KEY, { mode:'fsaccess', handle: dirHandle });
      uiToast?.('success','تم تحديد مجلد المرفقات بنجاح ✅');
      return { mode:'fsaccess', handle: dirHandle };
    }catch(e){
      if(String(e?.name||'')==='AbortError') return null;
      console.error(e);
      uiToast?.('warn','تعذر تحديد مجلد المرفقات.');
      return null;
    }
  }

  async function _getRootRecord({promptIfMissing=true}={}){
    if(_isInsecureHttp()){
      return { mode:'served', handle:null };
    }
    let rec = await _idbGet(FS_ROOT_KEY);
    if(!rec && promptIfMissing){
      const chosen = await chooseAttachmentsRoot();
      if(!chosen) return null;
      // normalize stored record
      rec = await _idbGet(FS_ROOT_KEY);
    }
    if(!rec) return null;

    // OPFS mode
    if(rec.mode==='opfs'){
      const handle = await navigator.storage.getDirectory();
      return { mode:'opfs', handle };
    }

    // FS Access mode
    const handle = rec.handle;
    if(!handle) return null;

    // Ensure permission
    try{
      const q = await handle.queryPermission?.({ mode:'readwrite' });
      if(q !== 'granted'){
        const r = await handle.requestPermission?.({ mode:'readwrite' });
        if(r !== 'granted'){
          uiToast?.('warn','يلزم منح صلاحية الكتابة لمجلد المرفقات.');
          return null;
        }
      }
    }catch(e){
      // ignore
    }
    return { mode:'fsaccess', handle };
  }

  async function ensureAttachmentsRoot(){
    const rec = await _getRootRecord({promptIfMissing:true});
    return !!rec;
  }

  // ------------------------------
  // Write / Read helpers
  // We keep "path" values starting with "Attachments/"
  // but write relative under the selected root folder.
  // ------------------------------
  function _toFSRelPath(displayPath){
    const p = _sanitizeRelPath(displayPath);
    return p.replace(/^Attachments\//i,''); // under root
  }

  async function _ensureDirFS(dirHandle, segments){
    let cur = dirHandle;
    for(const seg of segments){
      if(!seg) continue;
      cur = await cur.getDirectoryHandle(seg, { create:true });
    }
    return cur;
  }

  async function writeAttachmentFile(displayPath, file){
    if(!file) throw new Error('No file');
    const rec = await _getRootRecord({promptIfMissing:true});
    if(!rec) throw new Error('No attachments root');
    if(rec.mode==='served'){
      uiToast?.('warn','رفع/حفظ الملفات غير متاح على HTTP (NAS). شغّل النظام عبر HTTPS على الـ NAS أو عبر Live Server (localhost).');
      throw new Error('HTTP_INSECURE_NO_WRITE');
    }

    const fsRel = _toFSRelPath(displayPath);
    const parts = fsRel.split('/').filter(Boolean);
    const fileName = parts.pop();
    if(!fileName) throw new Error('Invalid file name');

    if(rec.mode==='opfs'){
      // OPFS: create dirs and write
      let dir = rec.handle;
      for(const seg of parts){
        dir = await dir.getDirectoryHandle(seg, { create:true });
      }
      const fh = await dir.getFileHandle(fileName, { create:true });
      const w = await fh.createWritable();
      await w.write(file);
      await w.close();
      return { path: displayPath, size: file.size||0, mime: file.type||'', name: file.name||fileName, stored:'opfs', storedAt: Date.now() };
    }

    // FS Access mode
    const root = rec.handle;
    const dir = await _ensureDirFS(root, parts);
    const fh = await dir.getFileHandle(fileName, { create:true });
    const w = await fh.createWritable();
    await w.write(file);
    await w.close();

    return { path: displayPath, size: file.size||0, mime: file.type||'', name: file.name||fileName, stored:'fs', storedAt: Date.now() };
  }

  async function readAttachmentFile(displayPath, { promptIfMissing=false } = {}){
    const rec = await _getRootRecord({promptIfMissing: !!promptIfMissing});
    if(!rec) return null;
    if(rec.mode==='served') return null;

    const fsRel = _toFSRelPath(displayPath);
    const parts = fsRel.split('/').filter(Boolean);
    const fileName = parts.pop();
    if(!fileName) return null;

    let dir = rec.handle;
    for(const seg of parts){
      dir = await dir.getDirectoryHandle(seg, { create:false });
    }
    const fh = await dir.getFileHandle(fileName, { create:false });
    const f = await fh.getFile();
    return f;
  }

  async function openAttachmentByPath(displayPath){
    try{
      // NAS HTTP mode: open directly via URL (no filesystem reads)
      if(_isInsecureHttp()){
        const w0 = window.open(displayPath, '_blank', 'noopener');
        if(!w0){
          uiToast?.('warn','المتصفح منع فتح نافذة جديدة.');
        }
        return true;
      }
      // Prompt for root if missing (better UX)
      const file = await readAttachmentFile(displayPath, { promptIfMissing:true });
      if(file){
        const url = URL.createObjectURL(file);
        const w = window.open(url, '_blank', 'noopener');
        if(!w){
          // Popup blocked - show preview inside viewer if available
          try{ window.previewAttachmentInViewer?.(displayPath); }catch(e){}
          uiToast?.('info','المتصفح منع فتح نافذة جديدة. تم عرض الملف داخل المعاينة.');
        }
        // Revoke later
        setTimeout(()=>{ try{ URL.revokeObjectURL(url); }catch(e){} }, 60_000);
        return true;
      }
      // fallback: try open via relative link (only works if attachments are inside served folder)
      const w2 = window.open(displayPath, '_blank', 'noopener');
      if(!w2){
        uiToast?.('warn','تعذر فتح الملف في نافذة جديدة.');
      }
      return true;
    }catch(e){
      console.error(e);
      uiToast?.('warn','تعذر فتح المرفق. تأكد من تحديد مجلد المرفقات وأن المسار صحيح.');
      return false;
    }
  }



  // ------------------------------
  // File picker helper
  // Opens a picker from a button click and returns File objects.
  // Uses showOpenFilePicker when available; falls back to a temp <input type=file>.
  // ------------------------------
  async function pickFilesForUpload({ multiple=false, accept='' } = {}){
    const acc = Array.isArray(accept) ? accept.join(',') : String(accept || '');

    if(typeof window.showOpenFilePicker === 'function'){
      try{
        const opts = { multiple: !!multiple };
        if(acc){
          const wantPdf = /application\/pdf|\.pdf/i.test(acc);
          const wantImg = /image\//i.test(acc) || /\.(png|jpg|jpeg|webp)/i.test(acc);
          const acceptObj = {};
          if(wantPdf) acceptObj['application/pdf'] = ['.pdf'];
          if(wantImg) acceptObj['image/*'] = ['.png','.jpg','.jpeg','.webp'];
          if(Object.keys(acceptObj).length){
            opts.types = [{ description: 'Attachments', accept: acceptObj }];
          }
        }
        const handles = await window.showOpenFilePicker(opts);
        const out = [];
        for(const h of handles){
          try{ out.push(await h.getFile()); }catch(e){}
        }
        return out;
      }catch(e){
        if(String(e?.name||'') === 'AbortError') return [];
        // fallback below
      }
    }

    return await new Promise((resolve)=>{
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.multiple = !!multiple;
      if(acc) inp.accept = acc;
      inp.style.position = 'fixed';
      inp.style.left = '-9999px';
      inp.style.top = '0';
      inp.onchange = ()=>{
        resolve(Array.from(inp.files || []));
        try{ inp.remove(); }catch(e){}
      };
      document.body.appendChild(inp);
      inp.click();
    });
  }
  // ------------------------------
  // Path builders
  // ------------------------------
  function buildTenantDocPath(tenantKey, docType, fileName){
    const key = _safeKey(tenantKey);
    const fn = _safeKey(fileName).replace(/_+/g,'_');
    const folder = (docType==='id') ? 'id_card' : 'trade_license';
    // Keep original extension if possible
    const ext = String(fileName||'').includes('.') ? String(fileName).split('.').pop() : '';
    const finalName = ext ? `${folder}.${ext}` : `${folder}`;
    // Use original name if user wants
    const outName = (fileName && fileName.length<80) ? fileName : finalName;
    return `Attachments/tenants/${key}/${folder}/${outName}`;
  }

  function buildLeaseDocPath(contractNo, fileName){
    const key = _safeKey(contractNo);
    const folder = 'municipality';
    return `Attachments/leases/${key}/${folder}/${(fileName||'municipality_contract.pdf')}`;
  }

  function buildCaseDocPath(caseId, fileName){
    const key = _safeKey(caseId);
    return `Attachments/cases/${key}/${(fileName||'file.pdf')}`;
  }

  function buildUnitDocPath(unitId, fileName){
    const key = _safeKey(unitId);
    return `Attachments/units/${key}/${(fileName||'file.pdf')}`;
  }


  function buildChequeDocPath(chequeId, fileName){
    const key = _safeKey(chequeId);
    return `Attachments/cheques/${key}/${(fileName||'file.pdf')}`;
  }

  function buildExpenseDocPath(expenseId, fileName){
    const key = _safeKey(expenseId);
    return `Attachments/expenses/${key}/${(fileName||'file.pdf')}`;
  }

  function buildVoucherDocPath(sourceType, voucherId, fileName){
    const t = _safeKey(sourceType || 'voucher');
    const key = _safeKey(voucherId);
    return `Attachments/vouchers/${t}/${key}/${(fileName||'file.pdf')}`;
  }



  // ------------------------------
  // Folder builders + listing (View all uploaded files)
  // ------------------------------
  function attachmentSafeKey(val){
    return _safeKey(val);
  }

  function buildTenantFolder(tenantKey){
    const key = _safeKey(tenantKey);
    return `Attachments/tenants/${key}/`;
  }

  function buildLeaseFolder(contractNo){
    const key = _safeKey(contractNo);
    return `Attachments/leases/${key}/`;
  }

  function buildCaseFolder(caseId){
    const key = _safeKey(caseId);
    return `Attachments/cases/${key}/`;
  }

  function buildUnitFolder(unitId){
    const key = _safeKey(unitId);
    return `Attachments/units/${key}/`;
  }


  function buildChequeFolder(chequeId){
    const key = _safeKey(chequeId);
    return `Attachments/cheques/${key}/`;
  }

  function buildExpenseFolder(expenseId){
    const key = _safeKey(expenseId);
    return `Attachments/expenses/${key}/`;
  }

  function buildVoucherFolder(sourceType, voucherId){
    const t = _safeKey(sourceType || 'voucher');
    const key = _safeKey(voucherId);
    return `Attachments/vouchers/${t}/${key}/`;
  }

  async function listAttachmentFilesInFolder(displayFolder, opts){
    const o = opts || {};
    const recursive = (o.recursive !== false);
    const maxDepth = Math.max(1, Number(o.maxDepth || 6));
    const maxFiles = Math.max(50, Number(o.maxFiles || 600));
    const yieldEvery = Math.max(10, Number(o.yieldEvery || 50));

    const rec = await _getRootRecord({promptIfMissing:false});
    if(!rec) throw new Error('No attachments root');
    if(rec.mode==='served') throw new Error('HTTP_MODE_NO_LIST');

    let folder = String(displayFolder||'').trim();
    if(!folder) folder = 'Attachments/';
    if(!folder.endsWith('/')) folder += '/';

    const fsRel = _toFSRelPath(folder);
    const baseParts = fsRel.split('/').filter(Boolean);

    let dir = rec.handle;
    for(const seg of baseParts){
      dir = await dir.getDirectoryHandle(seg, { create:false });
    }

    const out = [];
    async function walk(dh, relParts, depth){
      for await (const [name, h] of dh.entries()){
        if(out.length >= maxFiles) return;
        if(h.kind === 'file'){
          let f = null;
          try{ f = await h.getFile(); }catch(e){}
          const disp = 'Attachments/' + [...baseParts, ...relParts, name].join('/');
          out.push({
            name,
            path: disp,
            size: f?.size || 0,
            mime: f?.type || '',
            modified: f?.lastModified || 0,
          });
          if(out.length % yieldEvery === 0){
            await new Promise(r=>setTimeout(r,0));
          }
          if(out.length >= maxFiles) return;
        } else if(h.kind === 'directory' && recursive && depth < maxDepth){
          await walk(h, [...relParts, name], depth + 1);
        }
      }
    }

    await walk(dir, [], 0);
    out.sort((a,b)=> (Number(b.modified||0)-Number(a.modified||0)) || String(a.name||'').localeCompare(String(b.name||'')) );
    return out;
  }

  // Non-recursive listing for fast UI (folders + files)
  async function listAttachmentEntriesInFolder(displayFolder, opts){
    const o = opts || {};
    const maxEntries = Math.max(50, Number(o.maxEntries || 250));
    const yieldEvery = Math.max(5, Number(o.yieldEvery || 20));
    const promptIfMissing = !!o.promptIfMissing;

    const rec = await _getRootRecord({promptIfMissing});
    if(!rec) throw new Error('No attachments root');
    if(rec.mode==='served') throw new Error('HTTP_MODE_NO_LIST');

    let folder = String(displayFolder||'').trim();
    if(!folder) folder = 'Attachments/';
    if(!folder.endsWith('/')) folder += '/';

    const fsRel = _toFSRelPath(folder);
    const baseParts = fsRel.split('/').filter(Boolean);

    let dir = rec.handle;
    for(const seg of baseParts){
      dir = await dir.getDirectoryHandle(seg, { create:false });
    }

    const folders = [];
    const files = [];
    let seen = 0;
    for await (const [name, h] of dir.entries()){
      if(seen >= maxEntries) break;
      if(h.kind === 'directory'){
        const p = 'Attachments/' + [...baseParts, name].join('/') + '/';
        folders.push({ name, path: p });
      }else if(h.kind === 'file'){
        // IMPORTANT: do not call getFile() here (can freeze on slow/large network folders).
        // Metadata will be fetched lazily only when the user previews/opens a file.
        const p = 'Attachments/' + [...baseParts, name].join('/');
        files.push({ name, path: p });
      }
      seen++;
      if(seen % yieldEvery === 0){
        await new Promise(r=>setTimeout(r,0));
      }
    }
    folders.sort((a,b)=> String(a.name||'').localeCompare(String(b.name||'')));
    // Sort by name (fast). We avoid sorting by modified date because we don't fetch metadata here.
    files.sort((a,b)=> String(a.name||'').localeCompare(String(b.name||'')));
    return { folders, files, truncated: (seen >= maxEntries) };
  }

  // ------------------------------
  // Attachments viewer modal (generic)
  // Requires #attachments-viewer-modal in modals.html
  // ------------------------------
  function _escHtml(s){
    return String(s ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function _escJsStr(s){
    return String(s ?? '')
      .replace(/\\/g,'\\\\')
      .replace(/\n/g,'\\n')
      .replace(/\r/g,'')
      .replace(/'/g,"\\'");
  }

  function _formatBytes(n){
    const v = Number(n||0);
    if(!v) return '';
    const units = ['B','KB','MB','GB'];
    let i = 0; let x = v;
    while(x >= 1024 && i < units.length-1){ x /= 1024; i++; }
    return (x < 10 && i>0 ? x.toFixed(1) : Math.round(x)) + ' ' + units[i];
  }


  // ------------------------------
  // Recorded-only listing (HTTP mode)
  // Scans in-memory data (and localStorage backup) for paths under a folder.
  // This avoids filesystem handles entirely (works on NAS http://ip).
  // ------------------------------
  function _collectPathsFromAny(val, prefix, out){
    if(val == null) return;
    const t = typeof val;
    if(t === 'string'){
      const s = String(val).trim();
      if(s && s.startsWith(prefix)) out.add(s);
      return;
    }
    if(t !== 'object') return;
    if(Array.isArray(val)){
      for(const x of val) _collectPathsFromAny(x, prefix, out);
      return;
    }
    for(const k in val){
      if(!Object.prototype.hasOwnProperty.call(val, k)) continue;
      _collectPathsFromAny(val[k], prefix, out);
    }
  }

  function collectRecordedAttachmentsByFolder(displayFolder){
    let folder = String(displayFolder || 'Attachments/').trim();
    if(!folder) folder = 'Attachments/';
    if(!folder.endsWith('/')) folder += '/';

    const out = new Set();
    const roots = [];
    try{ roots.push(properties); }catch(e){}
    try{ roots.push(tenantsContacts); }catch(e){}
    try{ roots.push(cheques); }catch(e){}
    try{ roots.push(expenses); }catch(e){}
    try{ roots.push(payments); }catch(e){}
    try{ roots.push(leasePayments); }catch(e){}
    try{ roots.push(leaseAllocations); }catch(e){}
    try{ roots.push(salaries); }catch(e){}
    try{ roots.push(cases); }catch(e){}
    try{ roots.push(caseUpdates); }catch(e){}
    try{ roots.push(caseEvents); }catch(e){}

    // Also scan stored snapshot to catch cases where variables are not accessible yet.
    try{
      const raw = localStorage.getItem('re_data_v2');
      if(raw){
        const parsed = JSON.parse(raw);
        roots.push(parsed);
      }
    }catch(e){}

    for(const r of roots){
      _collectPathsFromAny(r, folder, out);
    }

    const arr = Array.from(out);
    arr.sort((a,b)=> String(a).localeCompare(String(b)));
    return arr.map((path)=>({ name: (String(path).split('/').pop() || path), path }));
  }

    async function openAttachmentsViewer(params){
    const p = params || {};
    const title = String(p.title || 'المرفقات');
    let folderPath = String(p.folderPath || 'Attachments/');
    if(!folderPath.endsWith('/')) folderPath += '/';

    const modal = document.getElementById('attachments-viewer-modal');
    if(!modal){
      uiToast?.('warn','لا يوجد مودال عرض المرفقات (attachments-viewer-modal).');
      return;
    }

    window.__attachmentsViewerState = window.__attachmentsViewerState || {};
    const st = window.__attachmentsViewerState;

    st.title = title;
    st.folderPath = folderPath;
    st.selectedPath = '';
    st.recordedPaths = Array.isArray(p.recordedPaths) ? p.recordedPaths : null;

    // Capability / mode
    st.httpMode = _isInsecureHttp();
    st.mode = st.httpMode ? 'recorded' : 'folder';
    st._token = (st._token||0) + 1;

    const ttl = document.getElementById('attachments-viewer-title');
    const pth = document.getElementById('attachments-viewer-path');
    if(ttl) ttl.textContent = title + (st.httpMode ? ' (HTTP)' : '');
    if(pth) pth.textContent = folderPath;

    modal.classList.remove('hidden');

    if(st.mode === 'folder'){
      const ok = await ensureAttachmentsRoot();
      if(!ok){
        uiToast?.('warn','يلزم تحديد مجلد المرفقات أولاً.');
        closeAttachmentsViewer();
        return;
      }
    }else{
      // On NAS HTTP: no FS handles. Show recorded paths only.
      uiToast?.('info','وضع HTTP: سيتم عرض المسارات المسجلة فقط. لرفع/استعراض مجلد فعلي استخدم HTTPS أو localhost.');
    }

    await refreshAttachmentsViewer();
  }


  function _parentFolderPath(folder){
    let f = String(folder||'Attachments/').trim();
    if(!f) f = 'Attachments/';
    if(!f.endsWith('/')) f += '/';
    if(f.toLowerCase() === 'attachments/') return 'Attachments/';
    // remove trailing slash
    let x = f.slice(0, -1);
    const idx = x.lastIndexOf('/');
    if(idx <= 0) return 'Attachments/';
    const parent = x.slice(0, idx + 1);
    return parent.startsWith('Attachments/') ? parent : 'Attachments/';
  }

  function setAttachmentsViewerFolder(folderPath){
    const st = window.__attachmentsViewerState || {};
    st.folderPath = String(folderPath||'Attachments/');
    if(!st.folderPath.endsWith('/')) st.folderPath += '/';
    const pth = document.getElementById('attachments-viewer-path');
    if(pth) pth.textContent = st.folderPath;
    st._token = (st._token||0) + 1;
    refreshAttachmentsViewer();
  }

  function closeAttachmentsViewer(){
    const modal = document.getElementById('attachments-viewer-modal');
    if(modal) modal.classList.add('hidden');
    try{
      const st = window.__attachmentsViewerState || {};
      if(st.previewUrl){ URL.revokeObjectURL(st.previewUrl); }
    }catch(e){}
  }

  async function refreshAttachmentsViewer(){
    const st = window.__attachmentsViewerState || {};
    st._token = (st._token||0) + 1;
    const myToken = st._token;
    const listBox = document.getElementById('attachments-viewer-list');
    const preview = document.getElementById('attachments-viewer-preview');
    if(listBox) listBox.innerHTML = '<div class="text-sm text-gray-500 dark:text-gray-400">جارٍ تحميل المرفقات…</div>';
    if(preview) preview.innerHTML = '<div class="text-sm text-gray-500 dark:text-gray-400">اختر ملفاً للمعاينة.</div>';

    // Recorded mode (HTTP/NAS): do NOT access filesystem handles. Render recorded paths only.
    if((st.mode||'') === 'recorded'){
      let items = [];
      if(Array.isArray(st.recordedPaths)){
        items = st.recordedPaths.map((x)=>{
          if(typeof x === 'string'){
            return { name: (x.split('/').pop()||x), path: x };
          }
          return x || null;
        }).filter(Boolean);
      }else{
        items = collectRecordedAttachmentsByFolder(st.folderPath);
      }

      if(!items.length){
        if(listBox){
          listBox.innerHTML = '<div class="text-sm text-gray-500 dark:text-gray-400">لا توجد مرفقات مسجلة لهذا المسار.</div>'
            + '<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">على HTTP لا يمكن استعراض المجلد تلقائياً. ضع الملفات داخل مجلد <span class="font-mono">Attachments</span> على الـ NAS واحفظ المسار داخل النظام.</div>';
        }
        return;
      }

      // Render list
      if(listBox){
        listBox.innerHTML = items.map((it)=>{
          const p = _escJsStr(it.path||'');
          const label = it.name || (String(it.path||'').split('/').pop()||'ملف');
          const pathLine = it.path ? `<div class="font-mono text-[11px] text-gray-500 dark:text-gray-400 break-all mt-0.5">${_escHtml(it.path)}</div>` : '';
          return `
            <div class="p-2 rounded-xl bg-white/60 dark:bg-gray-900/30 border border-white/40 dark:border-gray-700">
              <div class="flex items-start justify-between gap-2">
                <button type="button" class="text-right min-w-0 flex-1" onclick="previewAttachmentInViewer('${p}')">
                  <div class="text-sm font-semibold text-gray-800 dark:text-white break-all">📄 ${_escHtml(label)}</div>
                  ${pathLine}
                </button>
                <div class="flex items-center gap-1 shrink-0">
                  <button type="button" class="btn-ui btn-ui-sm btn-secondary" title="فتح" onclick="openAttachmentByPath('${p}')">فتح</button>
                  <button type="button" class="btn-ui btn-ui-sm btn-secondary" title="نسخ المسار" onclick="copyAttachmentPath('${p}')">نسخ</button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

      return;
    }


    try{
      // Fast listing: show folders and files at current level (avoids freezing on huge trees)
      const res = await listAttachmentEntriesInFolder(st.folderPath, { maxEntries: 250, yieldEvery: 20, promptIfMissing: true });
      // If a newer refresh started, stop here
      if((st._token||0) !== myToken) return;

      const folders = res.folders || [];
      const files = res.files || [];
      st.files = files;

      if(!folders.length && !files.length){
        if(listBox) listBox.innerHTML = '<div class="text-sm text-gray-500 dark:text-gray-400">لا توجد ملفات داخل هذا المسار.</div>';
        return;
      }

      const items = [];
      // Parent nav
      if(String(st.folderPath||'').toLowerCase() !== 'attachments/'){
        const parent = _parentFolderPath(st.folderPath);
        items.push({ kind:'up', name:'⬅️ رجوع', path: parent });
      }
      for(const d of folders){ items.push({ kind:'dir', ...d }); }
      for(const f of files){ items.push({ kind:'file', ...f }); }

      if(listBox){
        listBox.innerHTML = items.map((it)=>{
          const p = _escJsStr(it.path||'');
          if(it.kind==='up'){
            return `
              <div class="p-2 rounded-xl bg-white/60 dark:bg-gray-900/30 border border-white/40 dark:border-gray-700">
                <button type="button" class="w-full text-right text-sm font-semibold text-gray-800 dark:text-white" onclick="setAttachmentsViewerFolder('${p}')">${_escHtml(it.name||'رجوع')}</button>
              </div>
            `;
          }
          if(it.kind==='dir'){
            return `
              <div class="p-2 rounded-xl bg-white/60 dark:bg-gray-900/30 border border-white/40 dark:border-gray-700">
                <div class="flex items-center justify-between gap-2">
                  <button type="button" class="text-right min-w-0 flex-1" onclick="setAttachmentsViewerFolder('${p}')">
                    <div class="text-sm font-semibold text-gray-800 dark:text-white break-all">📁 ${_escHtml(it.name||'مجلد')}</div>
                    <div class="font-mono text-[11px] text-gray-500 dark:text-gray-400 break-all mt-0.5">${_escHtml(it.path||'')}</div>
                  </button>
                  <button type="button" class="btn-ui btn-ui-sm btn-secondary" onclick="setAttachmentsViewerFolder('${p}')">فتح</button>
                </div>
              </div>
            `;
          }

          const label = it.name || (String(it.path||'').split('/').pop()||'ملف');
          const meta = [];
          if(it.mime) meta.push(it.mime);
          if(it.size) meta.push(_formatBytes(it.size));
          if(it.modified) meta.push(new Date(it.modified).toLocaleString('ar-EG'));
          const metaLine = meta.length ? `<div class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">${_escHtml(meta.join(' • '))}</div>` : '';
          const pathLine = it.path ? `<div class="font-mono text-[11px] text-gray-500 dark:text-gray-400 break-all mt-0.5">${_escHtml(it.path)}</div>` : '';
          return `
            <div class="p-2 rounded-xl bg-white/60 dark:bg-gray-900/30 border border-white/40 dark:border-gray-700">
              <div class="flex items-start justify-between gap-2">
                <button type="button" class="text-right min-w-0 flex-1" onclick="previewAttachmentInViewer('${p}')">
                  <div class="text-sm font-semibold text-gray-800 dark:text-white break-all">📄 ${_escHtml(label)}</div>
                  ${metaLine}
                  ${pathLine}
                </button>
                <div class="flex items-center gap-1 shrink-0">
                  <button type="button" class="btn-ui btn-ui-sm btn-secondary" title="فتح" onclick="openAttachmentByPath('${p}')">فتح</button>
                  <button type="button" class="btn-ui btn-ui-sm btn-secondary" title="نسخ المسار" onclick="copyAttachmentPath('${p}')">نسخ</button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

      if(res.truncated){
        try{ uiToast?.('info','تم عرض أول 250 عنصر فقط لتفادي التجميد. افتح المجلدات الفرعية لعرض المزيد.'); }catch(e){}
      }

    }catch(e){
      console.error(e);
      if(listBox){
        listBox.innerHTML = '<div class="text-sm text-rose-600 dark:text-rose-400">تعذر قراءة المجلد. تأكد من تحديد مجلد المرفقات ومنح الصلاحية.</div>'
          + '<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">يمكن الضغط على “تحديد مجلد المرفقات” ثم “تحديث”.</div>';
      }
    }
  }

  async function previewAttachmentInViewer(displayPath){
    const st = window.__attachmentsViewerState || {};
    const preview = document.getElementById('attachments-viewer-preview');
    if(!preview) return;
    preview.innerHTML = '<div class="text-sm text-gray-500 dark:text-gray-400">جارٍ المعاينة…</div>';

    // HTTP Recorded mode: preview directly via URL (no filesystem reads)
    if((st.mode||'') === 'recorded' || _isInsecureHttp()){
      const p = String(displayPath||'').trim();
      const low = p.toLowerCase();
      const isImg = /\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i.test(low);
      const isPdf = /\.pdf$/i.test(low);
      const safe = _escJsStr(p);

      st.selectedPath = p;

      if(isImg){
        preview.innerHTML = `
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="text-sm font-semibold break-all">${_escHtml(p.split('/').pop()||'')}</div>
            <button class="btn-ui btn-ui-sm btn-secondary" onclick="openAttachmentByPath('${safe}')">فتح</button>
          </div>
          <img src="${_escHtml(p)}" class="max-h-[65vh] w-full object-contain rounded-xl border border-gray-200 dark:border-gray-700"/>
        `;
        return;
      }

      if(isPdf){
        preview.innerHTML = `
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="text-sm font-semibold break-all">${_escHtml(p.split('/').pop()||'')}</div>
            <button class="btn-ui btn-ui-sm btn-secondary" onclick="openAttachmentByPath('${safe}')">فتح</button>
          </div>
          <iframe src="${_escHtml(p)}" class="w-full h-[65vh] rounded-xl border border-gray-200 dark:border-gray-700 bg-white"></iframe>
        `;
        return;
      }

      preview.innerHTML = `
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="text-sm font-semibold break-all">${_escHtml(p.split('/').pop()||'')}</div>
          <button class="btn-ui btn-ui-sm btn-secondary" onclick="openAttachmentByPath('${safe}')">فتح</button>
        </div>
        <div class="mt-3 text-sm text-gray-700 dark:text-gray-200">لا توجد معاينة لهذا النوع من الملفات على HTTP. استخدم زر “فتح”.</div>
        <div class="font-mono text-[11px] text-gray-500 dark:text-gray-400 break-all mt-2">${_escHtml(p)}</div>
      `;
      return;
    }

    try{
      // revoke old
      if(st.previewUrl){ try{ URL.revokeObjectURL(st.previewUrl); }catch(e){} }
      const file = await readAttachmentFile(displayPath, { promptIfMissing:true });
      if(!file){
        preview.innerHTML = '<div class="text-sm text-rose-600 dark:text-rose-400">لا يمكن قراءة الملف. ربما لم يتم تحديد مجلد المرفقات أو الملف غير موجود.</div>';
        return;
      }
      const url = URL.createObjectURL(file);
      st.previewUrl = url;
      st.selectedPath = displayPath;

      const isImg = (file.type||'').startsWith('image/');
      const isPdf = (file.type==='application/pdf') || String(displayPath||'').toLowerCase().endsWith('.pdf');

      if(isImg){
        preview.innerHTML = `
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="text-sm font-semibold break-all">${_escHtml(file.name||'')}</div>
            <button class="btn-ui btn-ui-sm btn-secondary" onclick="openAttachmentByPath('${_escJsStr(displayPath)}')">فتح</button>
          </div>
          <img src="${url}" class="max-h-[65vh] w-full object-contain rounded-xl border border-gray-200 dark:border-gray-700"/>
        `;
        return;
      }

      if(isPdf){
        preview.innerHTML = `
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="text-sm font-semibold break-all">${_escHtml(file.name||'')}</div>
            <button class="btn-ui btn-ui-sm btn-secondary" onclick="openAttachmentByPath('${_escJsStr(displayPath)}')">فتح</button>
          </div>
          <iframe src="${url}" class="w-full h-[65vh] rounded-xl border border-gray-200 dark:border-gray-700 bg-white"></iframe>
        `;
        return;
      }

      preview.innerHTML = `
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="text-sm font-semibold break-all">${_escHtml(file.name||'')}</div>
          <button class="btn-ui btn-ui-sm btn-secondary" onclick="openAttachmentByPath('${_escJsStr(displayPath)}')">فتح</button>
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400">النوع: ${_escHtml(file.type||'—')} • الحجم: ${_escHtml(_formatBytes(file.size)||'—')}</div>
        <div class="mt-3 text-sm text-gray-700 dark:text-gray-200">لا توجد معاينة لهذا النوع من الملفات.</div>
      `;
    }catch(e){
      console.error(e);
      preview.innerHTML = '<div class="text-sm text-rose-600 dark:text-rose-400">تعذر معاينة الملف.</div>';
    }
  }

  async function copyAttachmentPath(path){
    const p = String(path||'');
    try{
      if(navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(p);
        uiToast?.('success','تم نسخ المسار ✅');
        return;
      }
    }catch(e){}
    try{
      window.prompt('انسخ المسار:', p);
    }catch(e){}
  }
  // ------------------------------
  // Expose globals
  // ------------------------------
  window.chooseAttachmentsRoot = chooseAttachmentsRoot;
  window.ensureAttachmentsRoot = ensureAttachmentsRoot;
  window.writeAttachmentFile = writeAttachmentFile;
  window.openAttachmentByPath = openAttachmentByPath;
  window.pickFilesForUpload = pickFilesForUpload;

  window.buildTenantDocPath = buildTenantDocPath;
  window.buildLeaseDocPath = buildLeaseDocPath;
  window.buildCaseDocPath = buildCaseDocPath;
  window.buildUnitDocPath = buildUnitDocPath;

  window.buildChequeDocPath = buildChequeDocPath;
  window.buildExpenseDocPath = buildExpenseDocPath;
  window.buildVoucherDocPath = buildVoucherDocPath;


  // attachments viewer + listing
  window.readAttachmentFile = readAttachmentFile;
  window.listAttachmentFilesInFolder = listAttachmentFilesInFolder;
  window.attachmentSafeKey = attachmentSafeKey;
  window.buildTenantFolder = buildTenantFolder;
  window.buildLeaseFolder = buildLeaseFolder;
  window.buildCaseFolder = buildCaseFolder;
  window.buildUnitFolder = buildUnitFolder;

  window.buildChequeFolder = buildChequeFolder;
  window.buildExpenseFolder = buildExpenseFolder;
  window.buildVoucherFolder = buildVoucherFolder;

  window.openAttachmentsViewer = openAttachmentsViewer;
  window.setAttachmentsViewerFolder = setAttachmentsViewerFolder;
  window.closeAttachmentsViewer = closeAttachmentsViewer;
  window.refreshAttachmentsViewer = refreshAttachmentsViewer;
  window.previewAttachmentInViewer = previewAttachmentInViewer;
  window.copyAttachmentPath = copyAttachmentPath;

})();
