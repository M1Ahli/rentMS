// Dev Tools (safe, optional) - diagnostics for storage and init
// This file is safe to ship; it does NOT change data, it only displays info.
(function(){
  'use strict';

  const DATA_KEY = 're_data_v2';

  function bytesToHuman(n){
    if(!Number.isFinite(n)) return '-';
    if(n < 1024) return n + ' B';
    if(n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
    return (n/(1024*1024)).toFixed(2) + ' MB';
  }

  function safeJsonParse(str){
    try{ return JSON.parse(str); }catch(_){ return null; }
  }

  function computeDiagnostics(){
    const payloadStr = localStorage.getItem(DATA_KEY) || '';
    const payloadSize = payloadStr.length;
    const parsed = payloadStr ? safeJsonParse(payloadStr) : null;
    const meta = parsed?.meta || {};

    return {
      origin: location.origin,
      protocol: location.protocol,
      dataKey: DATA_KEY,
      hasData: !!payloadStr,
      payloadSizeBytes: payloadSize,
      payloadSizeHuman: bytesToHuman(payloadSize),
      schemaVersion: meta.schemaVersion ?? '-',
      savedAt: meta.savedAt ?? '-',
      lastOpenedAt: meta.lastOpenedAt ?? '-',
      keys: Object.keys(localStorage || {}).slice(0, 50)
    };
  }

  function getContainer(){
    return document.getElementById('storage-diag-box');
  }

  function render(){
    const box = getContainer();
    if(!box) return;

    const d = computeDiagnostics();
    const line = (label, value) => (
      `<div class="flex items-center justify-between gap-3 py-1">
        <div class="text-xs text-gray-500 dark:text-gray-400">${label}</div>
        <div class="text-xs font-semibold text-gray-800 dark:text-gray-100 break-all">${value}</div>
      </div>`
    );

    box.innerHTML = `
      <div class="space-y-1">
        ${line('Origin', d.origin)}
        ${line('Protocol', d.protocol)}
        ${line('Storage Key', d.dataKey)}
        ${line('Has Data', d.hasData ? 'Yes' : 'No')}
        ${line('Payload Size', d.payloadSizeHuman)}
        ${line('Schema Version', String(d.schemaVersion))}
        ${line('Saved At', String(d.savedAt))}
      </div>
      <div class="mt-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800">
        <div class="text-[11px] text-gray-500 dark:text-gray-400">localStorage keys (first 50)</div>
        <div class="mt-2 text-[11px] text-gray-700 dark:text-gray-200 break-all">${(d.keys||[]).join(' , ') || '-'}</div>
      </div>
    `;

    // Also show quick warning when running on file://
    const warn = document.getElementById('storage-diag-warn');
    if(warn){
      warn.textContent = (location.protocol === 'file:')
        ? 'تنبيه: تشغيل file:// قد يمنع تحميل المكونات (fetch). استخدم سيرفر محلي.'
        : '';
    }
  }

  async function copyToClipboard(text){
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(text);
        return true;
      }
    }catch(_){ }
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }catch(_){ }
    return false;
  }

  async function copyDiag(){
    const d = computeDiagnostics();
    const txt = JSON.stringify(d, null, 2);
    const ok = await copyToClipboard(txt);
    try{ window.uiToast?.(ok ? 'success' : 'info', ok ? 'تم نسخ التشخيص.' : 'لم يتم النسخ (متصفحك يمنع).'); }catch(_){ }
  }

  function bindButtonsOnce(){
    const btnRefresh = document.getElementById('storage-diag-refresh');
    if(btnRefresh && btnRefresh.dataset.bound !== '1'){
      btnRefresh.dataset.bound = '1';
      btnRefresh.addEventListener('click', ()=> render());
    }
    const btnCopy = document.getElementById('storage-diag-copy');
    if(btnCopy && btnCopy.dataset.bound !== '1'){
      btnCopy.dataset.bound = '1';
      btnCopy.addEventListener('click', ()=> copyDiag());
    }
  }

  // Update diagnostics when opening Settings view
  (function wrapShowView(){
    const orig = window.showView;
    if(typeof orig !== 'function' || window.__devToolsShowViewWrapped) return;
    window.showView = function(view){
      orig(view);
      if(view === 'settings'){
        bindButtonsOnce();
        render();
      }
    };
    window.__devToolsShowViewWrapped = true;
  })();

  // Also render if settings is already active on load
  if(document.readyState === 'complete'){
    setTimeout(()=>{
      const active = document.querySelector('.nav-btn.active')?.id?.replace('nav-','');
      if(active === 'settings'){
        bindButtonsOnce();
        render();
      }
    }, 50);
  }

})();
