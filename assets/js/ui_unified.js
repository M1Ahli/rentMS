
/* Unified UI Enhancer v1
   - يضيف .ui-field بشكل آمن لعناصر الإدخال/الاختيار داخل أشرطة التحكم
   - الهدف: توحيد الشكل بدون تغيير IDs أو تغيير منطق JS
*/
(function(){
  function add(cls, el){ if(el && !el.classList.contains(cls)) el.classList.add(cls); }

  function enhanceModal(modal){
    if(!modal) return;
    // Enhance only overlay-style modals (full-screen fixed). Keep custom ones as-is.
    if(modal.id === 'lease-payment-modal') return;

    if(modal.classList.contains('fixed') && modal.classList.contains('inset-0')){
      add('app-modal', modal);
    }

    // Unify fields inside modals (without touching IDs / logic)
    modal.querySelectorAll('input, select, textarea').forEach(el=>{
      const tag = el.tagName;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if(type === 'hidden' || type === 'file') return;
      add('ui-field', el);
      if(tag === 'SELECT') add('ui-select', el);
    });
  }

  function enhanceBar(bar){
    if(!bar) return;
    bar.querySelectorAll('input, select').forEach(el=>{
      add('ui-field', el);
      if(el.tagName === 'SELECT') add('ui-select', el);
    });
    // زرّ/Buttons: لا نضيف btn-ui بشكل عام حتى لا نكسر اختلافات الألوان،
    // لكن نضمن وجود btn-icon للأزرار القصيرة إن كانت تحمل إيموجي فقط.
    bar.querySelectorAll('button').forEach(btn=>{
      const txt = (btn.textContent || '').trim();
      // إذا كان الزر تقريباً رمز واحد (⬆️/⬇️/🔍) نعتبره icon
      if(txt.length <= 3) btn.classList.add('btn-icon');
    });
  }

  function run(){
    document.querySelectorAll('.ui-controls-bar, .ui-toolbar, .ui-toolbar-panel, .prop-top-controls, .lease-unified-row').forEach(enhanceBar);

    // Modals
    document.querySelectorAll('div[id$="-modal"]').forEach(enhanceModal);
  }

  // Run now + after bootstrap finishes inserting HTML
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', run);
  }else{
    run();
  }
  document.addEventListener('ui:components-loaded', run);
})();
