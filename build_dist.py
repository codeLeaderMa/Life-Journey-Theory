#!/usr/bin/env python3
"""Build a single-file static HTML: inline all JS/CSS, de-module THREE into window.THREE.
Output: dist/class-lifecourse-matrix.html (double-clickable, works from file://) + dist/index.html.
Also emits site/ — a multi-file version for CDN hosting (parallel load + per-file cache)."""
import re, pathlib, shutil

ROOT = pathlib.Path(__file__).parent


def read(p):
    return (ROOT / p).read_text(encoding="utf8")


def clean_js(code):
    # protect against breaking out of <script> in inline HTML
    return code.replace("</script", "<\\/script")


def deexport(code, ns, core_ns="_C"):
    """Remove export{...}[;|from"...";], return (code, assign_stmts).
    ns = target object for exports; items with 'from' resolve against core_ns."""
    assigns = []
    def repl(m):
        spec, fromm = m.group(1), bool(m.group(2))
        for item in spec.split(","):
            item = item.strip()
            if not item:
                continue
            if " as " in item:
                loc, name = [x.strip() for x in item.split(" as ")]
            else:
                loc = name = item
            if fromm:
                assigns.append(f"{ns}.{name}={core_ns}.{name};")
            else:
                assigns.append(f"{ns}.{name}={loc};")
        return ""
    code = re.sub(r'export\s*\{([^}]*)\}\s*(from\s*"[^"]*")?\s*;', repl, code)
    # any leftover export keywords (export default / export const) would break UMD -> flag
    leftovers = re.findall(r'export\s+\w+', code)
    if leftovers:
        raise SystemExit(f"unhandled export forms: {leftovers[:5]}")
    return code, assigns


def demodule_three():
    core = read("lib/three.core.min.js")
    core, core_asg = deexport(core, "_C")
    mod = read("lib/three.module.min.js")
    # convert the single big import {A as e,...} from "./three.core.min.js" -> var e=_C.A;
    m = re.search(r'import\s*\{([^}]*)\}\s*from\s*"[^"]*"\s*;', mod)
    if not m:
        raise SystemExit("module import not found")
    decls = []
    for item in m.group(1).split(","):
        item = item.strip()
        if not item:
            continue
        if " as " in item:
            name, loc = [x.strip() for x in item.split(" as ")]
        else:
            name = loc = item
        decls.append(f"var {loc}=_C.{name};")
    mod = mod.replace(m.group(0), "\n".join(decls), 1)
    if re.search(r'\bimport\s*\{', mod):
        raise SystemExit("unhandled import remains in module")
    mod, mod_asg = deexport(mod, "THREE")
    return (
        "window.THREE=(function(){"
        "var _C={};(function(){"
        + clean_js(core)
        + "\n" + "\n".join(core_asg)
        + "})();var THREE={};(function(){"
        + clean_js(mod)
        + "\n" + "\n".join(mod_asg)
        + "})();return THREE;})();"
    )


def build():
    html = read("index.html")
    three = demodule_three()
    parts = [three, clean_js(read("lib/three-spritetext.min.js")), clean_js(read("lib/3d-force-graph.min.js")),
             clean_js(read("lib/trianglify.min.js")), clean_js(read("lib/qrcode.min.js"))]
    for f in ["mascots.js", "nodes_soc.js", "nodes_dev.js", "nodes_econ.js", "nodes_psy.js", "nodes_pol.js",
              "nodes_exi.js", "nodes_anth.js", "nodes_bio.js", "nodes_fam.js", "nodes_new_c.js", "nodes_new_d.js",
              "citations.js", "data.js", "app.js"]:
        parts.append(clean_js(read(f)))
    bundle = "\n".join(f"<script>\n{p}\n</script>" for p in parts)
    # strip the module loader block and every <script src=...> tag; inline pico css
    html = re.sub(r'<script type="module">.*?</script>', "", html, flags=re.S)
    html = re.sub(r'<script src="[^"]*"></script>', "", html)
    html = re.sub(
        r'<link rel="stylesheet" href="lib/pico\.min\.css">',
        lambda m: "<style>\n" + read("lib/pico.min.css") + "\n</style>",
        html)
    html = html.replace("</body>", bundle + "\n</body>")
    out = ROOT / "dist" / "class-lifecourse-matrix.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding="utf8")
    # Netlify/静态托管根路径需要 index.html —— 同内容再产出一份
    idx = out.parent / "index.html"
    idx.write_text(html, encoding="utf8")
    print(f"built {out} + {idx.name}  {out.stat().st_size/1024:.0f} KB")


SITE_FILES = [
    "index.html", "app.js", "data.js", "citations.js", "mascots.js",
    "nodes_soc.js", "nodes_dev.js", "nodes_econ.js", "nodes_psy.js", "nodes_pol.js",
    "nodes_exi.js", "nodes_anth.js", "nodes_bio.js", "nodes_fam.js", "nodes_new_c.js", "nodes_new_d.js",
    "lib/pico.min.css", "lib/trianglify.min.js", "lib/qrcode.min.js",
    "lib/three.module.min.js", "lib/three.core.min.js",
    "lib/three-spritetext.min.js", "lib/3d-force-graph.min.js",
]


def build_site():
    site = ROOT / "site"
    if site.exists():
        shutil.rmtree(site)
    for rel in SITE_FILES:
        src = ROOT / rel
        dst = site / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    print(f"site/ ready  {sum(f.stat().st_size for f in site.rglob('*') if f.is_file())/1024:.0f} KB in {len(SITE_FILES)} files")


if __name__ == "__main__":
    build()
    build_site()
