#!/usr/bin/env python3
"""Build a single-file HTML output from the restructured project.

You develop as multi-files (pages/components/assets), then package as one HTML
for easy sharing/deployment (NAS).

Usage:
  python tools/build_single.py

Output:
  dist/index_single.html
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'

PAGES = [
    'dashboard.html',
    'properties.html',
    'leases.html',
    'tenants.html',
    'cheques.html',
    'payments.html',
    'expenses.html',
    'salaries.html',
    'receipts-history.html',
    'receipt.html',
    'reports.html',
    'notices.html',
    'settings.html',
]


def read_text(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def build() -> Path:
    index = read_text(ROOT / 'index.html')

    # Pull head content as-is, but replace external app.css link with inline style.
    css = read_text(ROOT / 'assets' / 'css' / 'app.css')

    # Inline HTML fragments
    nav = read_text(ROOT / 'components' / 'nav.html')
    modals = read_text(ROOT / 'components' / 'modals.html')
    views = []
    for p in PAGES:
        views.append(read_text(ROOT / 'pages' / p))

    # Inline JS (app + optional router + optional dev tools)
    app_js = read_text(ROOT / 'assets' / 'js' / 'app.js')
    router_js_path = ROOT / 'assets' / 'js' / 'router.js'
    router_js = read_text(router_js_path) if router_js_path.exists() else ''
    dev_js_path = ROOT / 'assets' / 'js' / 'dev-tools.js'
    dev_js = read_text(dev_js_path) if dev_js_path.exists() else ''

    # Build final HTML
    # Replace the <link ...app.css> with an inline <style>.
    # Also drop the bootstrap.js script because we inline fragments & scripts directly.
    out = index

    # Inline CSS
    out = out.replace(
        '<link href="./assets/css/app.css" rel="stylesheet"/>',
        '<style>\n' + css + '\n</style>'
    )

    # Replace body placeholders (nav-slot + modals-slot + bootstrap script) with real content
    marker = '<div id="nav-slot"></div><div id="modals-slot"></div><script src="./assets/js/bootstrap.js"></script>'
    if marker not in out:
        raise RuntimeError('Unexpected index.html structure; marker not found.')

    body_content = (
        nav
        + '\n' + '\n'.join(views)
        + '\n' + modals
        + '\n<script>\n' + app_js + '\n</script>\n'
    )
    if router_js.strip():
        body_content += '\n<script>\n' + router_js + '\n</script>\n'
    if dev_js.strip():
        body_content += '\n<script>\n' + dev_js + '\n</script>\n'

    out = out.replace(marker, body_content)

    DIST.mkdir(parents=True, exist_ok=True)
    out_path = DIST / 'index_single.html'
    out_path.write_text(out, encoding='utf-8')
    return out_path


if __name__ == '__main__':
    p = build()
    print(f'Built: {p}')
