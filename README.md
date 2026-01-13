# Property Management System (Restructured)

تم استخراج المشروع من الملف:
- step184_bars_no_overlap_all_pages_v2.html

## الهيكل الجديد

- `index.html` : ملف تشغيل المشروع (Shell) يقوم بتحميل المكونات والصفحات.
- `components/`
  - `nav.html` : شريط التنقل العلوي (Tabs) — نفس الـ markup الأصلي.
  - `modals.html` : جميع النوافذ المنبثقة (Modals) كما هي.
- `pages/` : كل View/Section في ملف مستقل (Fragments):
  - dashboard, properties, leases, tenants, cheques, payments, expenses, salaries, receipts-history, receipt, reports, notices, settings
- `assets/`
  - `css/app.css` : جميع الـ CSS الذي كان داخل `<style>` (بدون تغيير).
  - `js/app.js` : جميع سكربتات المشروع التي كانت داخل `<script>` (بدون تغيير) وبنفس الترتيب.
  - `js/bootstrap.js` : محمل المكونات/الصفحات باستخدام `fetch()` ثم تحميل `app.js`.
  - `js/router.js` : دعم بسيط لـ hash routing (اختياري) مثل `#/leases`.

## التشغيل الصحيح

> لأن `bootstrap.js` يستخدم `fetch()` لتحميل ملفات HTML، يجب تشغيل المشروع عبر سيرفر (http/https)، وليس عبر فتح `index.html` مباشرة بمتصفح (file://).

- على NAS: ارفعه داخل مجلد ويب وشغله عبر رابط http.
- محلياً: استخدم أي سيرفر بسيط مثل:
  - `python -m http.server 8080`

ثم افتح:
- `http://localhost:8080/index.html`

> تم إضافة أدوات مساعدة في مجلد `tools/`:
> - Windows: شغّل `tools\\serve.bat`
> - Mac/Linux: شغّل `tools/serve.sh 8080`

## أدوات التطوير (Diagnostics)

- تم إضافة `assets/js/dev-tools.js` (اختياري وآمن) ليعرض بطاقة "تشخيص التخزين" داخل صفحة الإعدادات.
  - يظهر الـ Origin / حجم البيانات / وقت آخر حفظ.
  - زر "نسخ التشخيص" يساعدك ترسل لي التقرير عند وجود أي مشكلة.

## بناء نسخة ملف واحد (Single HTML)

لتطوير مريح متعدد الملفات ثم إخراج نسخة واحدة سهلة النشر:

- شغّل:
  - `python tools/build_single.py`
- سيُنشئ:
  - `dist/index_single.html`

هذه النسخة لا تحتاج `bootstrap.js` لأنها تحتوي كل الصفحات والمكونات والـ CSS/JS داخل ملف واحد.

## ملاحظات

- تم الحفاظ على نفس الـ IDs والـ classes الخاصة بالـ Views و Nav Buttons.
- `showView(id)` ما زالت هي نقطة التنقل الرئيسية.
- يمكن الآن تنظيف الـ CSS/JS تدريجياً وتقسيمهما إلى ملفات أصغر بأمان بعد التأكد من الاستقرار.
