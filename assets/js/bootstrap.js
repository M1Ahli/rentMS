(async function(){
  async function loadText(url){
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return await res.text();
  }

  function insertBeforeSlot(slot, html){
    slot.insertAdjacentHTML('beforebegin', html);
  }

  async function main(){
    const navSlot = document.getElementById('nav-slot');
    const modalsSlot = document.getElementById('modals-slot');
    if(!navSlot || !modalsSlot){
      console.error('Missing nav-slot/modals-slot');
      return;
    }

    // 1) NAV (must become direct child of body)
    const navHTML = await loadText('./components/nav.html');
    insertBeforeSlot(navSlot, navHTML);
    navSlot.remove();

    // 2) Views (insert before modals slot so sections remain in DOM like before)
    const pages = ["dashboard.html", "properties.html", "leases.html", "leases-archive.html", "tenants.html", "cheques.html", "payments.html", "expenses.html", "salaries.html", "receipts-history.html", "receipt.html", "reports.html", "notices.html", "settings.html", "police_cases.html"];
    for(const p of pages){
      const viewHTML = await loadText('./pages/' + p);
      insertBeforeSlot(modalsSlot, viewHTML);
    }

    // 3) Modals
    const modalsHTML = await loadText('./components/modals.html');
    insertBeforeSlot(modalsSlot, modalsHTML);
    modalsSlot.remove();

    // 4) Load main app JS AFTER markup exists

    // 4a) Unified UI enhancer (search/sort/buttons)
    await new Promise((resolve)=>{
      const s = document.createElement('script');
      s.src = './assets/js/ui_unified.js';
      s.onload = resolve;
      s.onerror = resolve;
      document.body.appendChild(s);
    });


    // TAILWIND_OFFLINE_FALLBACK_CHECK
    // If Tailwind CDN fails, ensure .hidden works (fallback CSS should cover it)
    try{
      const t = document.createElement('div');
      t.className = 'hidden';
      document.body.appendChild(t);
      const ok = (getComputedStyle(t).display === 'none');
      t.remove();
      if(!ok){
        console.warn('Tailwind utilities may not be loaded. Minimal fallback will keep app functional.');
      }
    }catch(e){}
    // 4b) Main app scripts (split into maintainable files)
    const appScripts = [
      
      './assets/js/app/00_attachments_fs.js','./assets/js/app/01_core.js',
      './assets/js/app/02_notices_health.js',
      './assets/js/app/03_dashboard.js',
      './assets/js/app/04_properties.js',
      './assets/js/app/05_leases.js',
      './assets/js/app/06_tenants.js',
      './assets/js/app/07_payments.js',
      './assets/js/app/08_cheques.js',
      './assets/js/app/09_expenses.js',
      './assets/js/app/10_salaries.js',
      './assets/js/app/11_receipts.js',
      './assets/js/app/12_reports.js',
      './assets/js/app/14_police_cases.js',
      './assets/js/app/13_settings_init_ui.js',
    ];


    for(const src of appScripts){
      await new Promise((resolve, reject)=>{
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load ' + src));
        document.body.appendChild(s);
      });
    }

    
    // 4c) UI+ enhancements (stateful filters, autocomplete, overdue highlight, lease tabs)
    await new Promise((resolve)=> {
      const s = document.createElement('script');
      s.src = './assets/js/ui_plus.js';
      s.onload = resolve;
      s.onerror = resolve; // keep app working even if missing
      document.body.appendChild(s);
    });

// Notify enhancers that dynamic HTML is ready
    document.dispatchEvent(new CustomEvent('ui:components-loaded'));


    // 5) Optional router (hash) support
    await new Promise((resolve)=>{
      const s = document.createElement('script');
      s.src = './assets/js/router.js';
      s.onload = resolve;
      s.onerror = resolve; // optional
      document.body.appendChild(s);
    });

    // Notify enhancers that dynamic HTML is ready
    document.dispatchEvent(new CustomEvent('ui:components-loaded'));


    // 6) Optional dev tools (diagnostics). Will be skipped silently if missing.
    await new Promise((resolve)=>{
      const s = document.createElement('script');
      s.src = './assets/js/dev-tools.js';
      s.onload = resolve;
      s.onerror = resolve;
      document.body.appendChild(s);
    });

    // Notify enhancers that dynamic HTML is ready
    document.dispatchEvent(new CustomEvent('ui:components-loaded'));

  }

  // If running from file://, fetch will often be blocked.
  if(location.protocol === 'file:'){
    console.warn('This project uses fetch() to load components. Please run it from a local web server or your NAS web server (http/https).');
  }

  try{ await main(); }catch(err){
    console.error(err);
    alert('تعذر تحميل مكونات المشروع. تأكد من تشغيله عبر سيرفر (http/https) وليس file://');
  }
})();
