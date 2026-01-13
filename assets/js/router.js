/**
 * Hash routing for the existing SPA:
 * - Updates URL to #/viewId when showView(viewId) is called.
 * - On refresh/back/forward, it opens the correct view.
 * This is intentionally small and should not affect existing logic.
 */
(function(){
  function normId(id){
    return String(id||'').trim().replace(/^#\/?/, '').replace(/\/+$/,'');
  }
  function getHashView(){
    const h = String(location.hash||'');
    if(h.startsWith('#/')) return normId(h.slice(2));
    if(h.startsWith('#')) return normId(h.slice(1));
    return '';
  }
  function setHashView(id){
    const v = normId(id);
    if(!v) return;
    const next = '#/' + v;
    if(location.hash !== next){
      // replaceState avoids adding extra history entries when showView is called repeatedly
      try{ history.replaceState(null,'',next); }catch(e){ location.hash = next; }
    }
  }
  function openFromHash(){
    const v = getHashView() || 'dashboard';
    if(typeof window.showView === 'function'){
      try{ window.showView(v); }catch(e){}
    }
  }

  // Wrap showView once (existing code already wraps it for aria; this wraps the final version)
  if(typeof window.showView === 'function' && !window.__showViewHashWrapped){
    const _orig = window.showView;
    window.showView = function(id){
      _orig(id);
      try{ setHashView(id); }catch(e){}
    };
    window.__showViewHashWrapped = true;
  }

  window.addEventListener('hashchange', openFromHash);

  // Initial sync (only if hash exists)
  if(getHashView()){
    // defer to allow initial app init to finish
    setTimeout(openFromHash, 0);
  }else{
    // keep URL consistent (dashboard)
    try{ setHashView('dashboard'); }catch(e){}
  }
})();
