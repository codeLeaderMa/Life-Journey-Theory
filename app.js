/* CLASS × LIFECOURSE — view layer v2. Data: nodes_*.js + data.js (DB). */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const CITES = window.DB_CITES || {};

  const DISC = DB.meta.disciplines, DCOL = DB.meta.discColors;
  const ET = DB.meta.edgeTypes, ECOL = DB.meta.edgeColors, EV = DB.meta.evLevels;

  /* ============ nav ============ */
  const goView = (v) => {
    $$("nav button").forEach((x) => x.classList.toggle("active", x.dataset.view === v));
    $$(".view").forEach((x) => x.classList.toggle("active", x.id === "view-" + v));
    if (v === "graph") ensureGraph();
  };
  $$("nav button").forEach((b) => b.addEventListener("click", () => {
    if (location.hash.slice(1) === b.dataset.view) goView(b.dataset.view); else location.hash = b.dataset.view;
  }));

  /* ============ helpers ============ */
  const theory = (id) => DB.theories.find((t) => t.id === id);
  const theorySafe = (id) => theory(id) || { id, cn: id, en: "", scholar: "", disc: "misc", school: "", work: "", year: "", core: "" };
  const dcol = (t) => DCOL[t.disc] || "#8b949e";
  const sname = (id) => { const s = DB.stages.find((s) => s.id === id) || {}; return (isEN() ? s.en || s.cn : s.cn) || id; };
  const cname = (id) => { const c = DB.classes.find((c) => c.id === id) || {}; return (isEN() ? c.en || c.cn : c.cn) || id; };
  const dname = (k) => (isEN() && window.DISC_EN ? DISC_EN[k] || DISC[k] : DISC[k]);
  const ename = (k) => (isEN() && window.ET_EN ? ET_EN[k] || ET[k] : ET[k]);
  const evname = (k) => (isEN() && window.EV_EN ? EV_EN[k] || EV[k] : EV[k]);

  /* ============ matrix ============ */
  let curStage = "all";
  const tabs = $("#stage-tabs");
  function renderTabs() {
    tabs.innerHTML = "";
    const mkTab = (id, html) => {
      const b = document.createElement("button");
      b.className = "stage-tab" + (id === curStage ? " active" : "");
      b.dataset.stage = id; b.innerHTML = html; tabs.appendChild(b);
    };
    mkTab("all", t("tab.all"));
    DB.stages.forEach((s) => mkTab(s.id, `${sname(s.id)}<span class="age">${s.range}</span>`));
    $$(".stage-tab", tabs).forEach((b) =>
      b.addEventListener("click", () => {
        $$(".stage-tab", tabs).forEach((x) => x.classList.toggle("active", x === b));
        curStage = b.dataset.stage; renderMatrix();
      })
    );
  }
  renderTabs();

  const chip = (t) =>
    `<span class="chip" data-theory="${t.id}" style="color:${dcol(t)};background:${dcol(t)}24" title="${esc(t.en)} · ${esc(t.scholar)}">${esc(t.cn)}</span>`;

  function cellHTML(c, s, cl) {
    const chips = (c.theories || []).map((tid) => chip(theorySafe(tid))).join("");
    const brief = c.mech.slice(0, 52) + "…";
    return `
      <div class="cid">${s.id}×${cl.id}</div>
      <h3>${esc(sname(s.id))} × ${esc(cname(cl.id))}</h3>
      <div class="chips">${chips}</div>
      <div class="brief">${esc(brief)}</div>
      <div class="detail">
        <div class="sec mech"><span class="lbl">${t("mx.mech")}</span>${esc(c.mech)}</div>
        <div class="sec out"><span class="lbl">${t("mx.out")}</span>${esc(c.out)}</div>
      </div>`;
  }

  function renderMatrix() {
    const grid = $("#matrix-grid");
    grid.innerHTML = `<div class="corner">STAGE \\ CLASS</div>` +
      DB.classes.map((cl) => `<div class="col-head">${cname(cl.id)}<span class="en">${esc(cl.en)}</span></div>`).join("");
    DB.stages.forEach((s) => {
      if (curStage !== "all" && curStage !== s.id) return;
      grid.insertAdjacentHTML("beforeend", `<div class="row-head">${sname(s.id)} ${s.range}</div>`);
      DB.classes.forEach((cl) => {
        const c = DB.cells.find((x) => x.stage === s.id && x.cls === cl.id);
        const div = document.createElement("div");
        div.className = "cell";
        if (c) div.innerHTML = cellHTML(c, s, cl); else div.innerHTML = `<div class="cid">${s.id}×${cl.id}</div><h3>—</h3>`;
        div.addEventListener("click", (e) => { if (!e.target.closest(".chip")) div.classList.toggle("expanded"); });
        grid.appendChild(div);
      });
    });
    $$(".chip", grid).forEach((ch) =>
      ch.addEventListener("click", (e) => { e.stopPropagation(); openGraphAt(ch.dataset.theory); })
    );
  }
  renderMatrix();
  const renderMxLegend = () => { $("#matrix-legend").innerHTML = discLegend() + `<div class="legend-row" style="margin-top:-2px"><span class="legend-lbl">${t("mx.legend2")}</span></div>`; };
  renderMxLegend();

  /* ============ graph (3D, three.js + 3d-force-graph) ============ */
  let fg = null, labelOn = DB.theories.length <= 250;
  const activeDisc = new Set(Object.keys(DISC));
  const activeEdge = new Set(Object.keys(ET));
  const activeEv = new Set(Object.keys(EV));
  let colorMode = "disc";                       // disc | school | cell
  let cellStage = "all", cellCls = "all";
  let lit = null, litLinks = null;              // 高亮集合；null = 全亮
  let litMode = "dim";                          // dim=淡化 hide=隱藏 off=正常
  let autoFitted = false;                       // 只在首次引擎停轉時 fit，之後尊重用戶視角
  let nearZoom = true;                          // 相机距离标志：主线模式下的标签 LOD
  const SIDE_DEF = () => `<div class="gt-lbl" style="color:var(--txt-dim)">${t("side.title")}</div><p style="margin-top:14px;color:var(--txt-dim);font-size:12.5px;line-height:1.9">${t("side.hint")}</p>`;

  const cellCount = (tid) => DB.cells.filter((c) => (c.theories || []).includes(tid)).length;
  const edgeCount = (tid) => DB.edges.filter((e) => e.f === tid || e.t === tid).length;
  const nodeR = (t) => 2.2 + Math.min(4.4,
    (CITES[t.id] ? Math.log10(Math.max(1, CITES[t.id])) / 5 : 0) * 4 + cellCount(t.id) * 1.2 + edgeCount(t.id) * 0.35);

  /* 谱系色：school 字串 → 稳定 hsl */
  const SCOL = {};
  function scol(s) {
    if (!s) return "#8b949e";
    if (!SCOL[s]) {
      let h = 0; for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) >>> 0;
      SCOL[s] = `hsl(${h % 360}, ${52 + ((h >> 7) % 26)}%, ${52 + ((h >> 13) % 16)}%)`;
    }
    return SCOL[s];
  }

  /* 节点/边物件只建一次——同一物件引用可让力导向位置在过滤后保留 */
  const gNodes = DB.theories.map((t) => ({ id: t.id, t }));
  const gLinks = DB.edges.map((e, i) => ({ source: e.f, target: e.t, e, __i: i }));
  const byId = Object.fromEntries(gNodes.map((n) => [n.id, n]));
  const sid = (x) => (typeof x === "object" ? x.id : x);
  const adj = {};
  DB.edges.forEach((e, i) => {
    for (const k of [e.f, e.t]) adj[k] = adj[k] || { n: new Set(), l: new Set() };
    adj[e.f].n.add(e.t); adj[e.t].n.add(e.f); adj[e.f].l.add(i); adj[e.t].l.add(i);
  });

  /* 谱系边类型：传承(genealogy)+衍生(produces)+落地为方法(operationalizes) 都算知识血脉 */
  const LIN_TYPES = new Set(["genealogy", "produces", "operationalizes"]);
  /* 主线骨干：位于 ≥3 节点谱系长链上、或为 ≥3 度谱系枢纽的节点 */
  const BACKBONE = (() => {
    const ch = DB.edges.filter((e) => LIN_TYPES.has(e.type));
    const out = {}, inn = {}, deg = {};
    ch.forEach((e) => {
      (out[e.f] = out[e.f] || []).push(e.t); (inn[e.t] = inn[e.t] || []).push(e.f);
      deg[e.f] = (deg[e.f] || 0) + 1; deg[e.t] = (deg[e.t] || 0) + 1;
    });
    const memoF = {}, memoB = {}, vf = new Set(), vb = new Set();
    const fwd = (id) => { if (memoF[id] != null) return memoF[id]; if (vf.has(id)) return 0; vf.add(id);
      let b = 0; for (const t of out[id] || []) b = Math.max(b, 1 + fwd(t)); vf.delete(id); return memoF[id] = b; };
    const bwd = (id) => { if (memoB[id] != null) return memoB[id]; if (vb.has(id)) return 0; vb.add(id);
      let b = 0; for (const f of inn[id] || []) b = Math.max(b, 1 + bwd(f)); vb.delete(id); return memoB[id] = b; };
    const set = new Set();
    new Set(ch.flatMap((e) => [e.f, e.t])).forEach((id) => {
      if (fwd(id) + bwd(id) >= 2 || (deg[id] || 0) >= 3) set.add(id);
    });
    return set;
  })();
  /* 极简核心：按「使用度」综合分（被引+格位+连接）取 60 个地标理论——先看懂地标再逛街 */
  const CORE = new Set([...DB.theories].sort((a, b) => nodeR(b) - nodeR(a)).slice(0, 60).map((t) => t.id));
  /* 三档视图：core 核心枢纽 | main 谱系主线 | all 全部点云 */
  let viewMode = "core";
  const viewSet = () => (viewMode === "main" ? BACKBONE : viewMode === "core" ? CORE : null);
  function setView(m) {
    viewMode = m;
    $$("#graph-toolbar [data-view2]").forEach((x) => x.classList.toggle("on", x.dataset.view2 === m));
    refreshData(); applyColors();
    if (fg) { fg.cooldownTicks(160); if (fg.d3ReheatSimulation) fg.d3ReheatSimulation(); }
  }
  function ensureInView(id) { const s = viewSet(); if (s && id && !s.has(id)) setView("all"); }

  function baseColor(n) {
    if (colorMode === "school" || (colorMode === "cell" && lit && lit.has(n.id))) return scol(n.t.school);
    return DCOL[n.t.disc] || "#8b949e";
  }
  const nodeColorFn = (n) => (lit && !lit.has(n.id) ? "rgba(58,68,82,0.30)" : baseColor(n));
  const linkVisFn = (l) => {
    if (!activeEdge.has(l.e.type) || !activeEv.has(l.e.ev || "fw")) return false;
    return litLinks ? litLinks.has(l.__i) : true;
  };

  /* 格位模式的高亮集合 */
  function computeCellLit() {
    const set = new Set(), lset = new Set();
    DB.cells.forEach((c) => {
      if ((cellStage === "all" || c.stage === cellStage) && (cellCls === "all" || c.cls === cellCls))
        (c.theories || []).forEach((id) => set.add(id));
    });
    DB.edges.forEach((e, i) => { if (set.has(e.f) && set.has(e.t)) lset.add(i); });
    return [set, lset];
  }
  /* 搜寻：多栏位匹配（含 aka 中文译名） */
  const matchT = (t, q) =>
    (t.cn + " " + t.en + " " + t.scholar + " " + (t.school || "") + " " + (t.work || "") + " " + (t.aka || "")).toLowerCase().includes(q);

  /* 点亮：同 school 全体 + 该节点 + 直接邻居，边只留集合内部 */
  function lineageOf(t) {
    const set = new Set(DB.theories.filter((x) => x.school && x.school === t.school).map((x) => x.id));
    set.add(t.id);
    (adj[t.id] ? adj[t.id].n : []).forEach((x) => set.add(x));
    const lset = new Set();
    DB.edges.forEach((e, i) => { if (set.has(e.f) && set.has(e.t)) lset.add(i); });
    return [set, lset];
  }
  function lineageHit(q) {
    const hit = DB.theories.find((t) => matchT(t, q));
    if (!hit) return null;
    const [set, lset] = lineageOf(hit);
    return { set, lset, hit };
  }
  /* 选中节点：详情 + 邻居高亮 + 镜头居中 */
  function selectTheory(id) {
    ensureInView(id);
    showNode(id);
    lit = new Set([id, ...(adj[id] ? adj[id].n : [])]);
    litLinks = adj[id] ? adj[id].l : new Set();
    refreshData(); applyColors(); focusNode(id);
  }
  function syncLitFromMode() {
    if (colorMode === "cell") [lit, litLinks] = computeCellLit();
  }

  /* 颜色/透明度套用 —— 直接改 three 材质 */
  function applyColors() {
    gNodes.forEach((n) => {
      const m = n.__m; let s = n.__s;
      if (!m) return;
      const dim = litMode === "dim" && lit && !lit.has(n.id);
      m.material.color.set(dim ? "#232a35" : baseColor(n));
      m.material.opacity = dim ? 0.22 : 1;
      const want = (labelOn || viewMode !== "all") ? !dim : !!(lit && lit.has(n.id));
      if (want && !s) { s = makeSprite(n); n.__s = s; n.__g.add(s); }
      if (s) {
        const lod = viewMode === "all" || nearZoom || (lit && lit.has(n.id)) || nodeR(n.t) >= 4.2;
        s.visible = want && lod;
        s.textHeight = s.__h * (viewMode !== "all" ? 2.4 : 1);
        s.color = colorMode === "disc" ? "#c9d1d9" : baseColor(n);
      }
    });
  }
  function refreshData() {
    if (!fg) return;
    const vs = viewSet();
    const nodes = gNodes.filter((n) => activeDisc.has(n.t.disc) &&
      (!vs || vs.has(n.id)) &&
      (litMode !== "hide" || !lit || lit.has(n.id)));
    const ok = new Set(nodes.map((n) => n.id));
    fg.graphData({ nodes, links: gLinks.filter((l) => ok.has(sid(l.source)) && ok.has(sid(l.target)) &&
      activeEdge.has(l.e.type) && (!l.e.ev || activeEv.has(l.e.ev)) &&
      (viewMode === "all" || LIN_TYPES.has(l.e.type) || (viewMode === "core" && l.e.type === "tension"))) });
  }
  function clearLit() {
    lit = null; litLinks = null; syncLitFromMode(); refreshData(); applyColors();
  }
  function flyTo(target, d) {
    // 沿「當前相機→目標」方向逼近，不再沿原點射線橫掃全圖
    const cam = fg.cameraPosition();
    let vx = cam.x - target.x, vy = cam.y - target.y, vz = cam.z - target.z;
    let len = Math.hypot(vx, vy, vz);
    if (len < d * 0.6 || !len) { vx = target.x; vy = target.y; vz = target.z + 1; len = Math.hypot(vx, vy, vz) || 1; }
    fg.cameraPosition(
      { x: target.x + vx / len * d, y: target.y + vy / len * d, z: target.z + vz / len * d },
      target, 900);
  }
  function focusNode(id) {
    const n = byId[id];
    if (!n) return;
    if (n.x == null) { setTimeout(() => focusNode(id), 500); return; }
    flyTo(n, 110);
  }

  /* ---------- toolbar ---------- */
  function buildToolbar() {
    const tb = $("#graph-toolbar");
    const inSt = "width:100%;background:rgba(0,0,0,.3);border:1px solid rgba(255,240,220,.15);color:#f3ebdc;font-size:12px;padding:6px 12px;border-radius:999px;margin-bottom:0";
    tb.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center"><div class="gt-lbl" style="margin:0">${t("tb.panel")}</div><button class="fbtn" id="tb-hide">${t("tb.hide")}</button></div>` +
      `<div><input id="g-search" placeholder="${t("tb.search")}" style="${inSt}"><div id="g-results"></div></div>` +
      `<div><div class="gt-lbl">${t("tb.view")}</div><div class="gt-row">` +
        `<button class="fbtn${viewMode === "core" ? " on" : ""}" data-view2="core" title="${t("tb.core.title")}">${t("tb.core")} ${CORE.size}</button>` +
        `<button class="fbtn${viewMode === "main" ? " on" : ""}" data-view2="main" title="${t("tb.main.title")}">${t("tb.main")} ${BACKBONE.size}</button>` +
        `<button class="fbtn${viewMode === "all" ? " on" : ""}" data-view2="all" title="${t("tb.all.title")}">${t("tb.all")} ${DB.theories.length}</button>` +
      `</div></div>` +
      `<div><div class="gt-lbl">${t("tb.color")}</div><div class="gt-row">` +
        `<button class="fbtn on" data-mode="disc">${t("tb.by.disc")}</button>` +
        `<button class="fbtn" data-mode="school">${t("tb.by.school")}</button>` +
        `<button class="fbtn" data-mode="cell">${t("tb.by.cell")}</button>` +
      `</div></div>` +
      `<div id="cell-sel" style="display:none"><div class="gt-lbl">${t("tb.cellpick")}</div><div class="gt-row">` +
        `<select id="cell-stage"><option value="all">${t("tb.allstage")}</option>${DB.stages.map((s) => `<option value="${s.id}">${sname(s.id)}</option>`).join("")}</select>` +
        `<select id="cell-cls"><option value="all">${t("tb.allcls")}</option>${DB.classes.map((c) => `<option value="${c.id}">${cname(c.id)}</option>`).join("")}</select>` +
      `</div></div>` +
      `<div><div class="gt-lbl">${t("tb.disc")}</div><div class="gt-row">` +
        Object.keys(DISC).map((k) => `<button class="fbtn on" data-disc="${k}" style="color:${DCOL[k]}">${dname(k)}</button>`).join("") +
      `</div></div><div><div class="gt-lbl">${t("tb.edge")}</div><div class="gt-row">` +
        Object.keys(ET).map((k) => `<button class="fbtn on" data-edge="${k}" style="color:${ECOL[k]}">${ename(k)}</button>`).join("") +
      `</div></div><div><div class="gt-lbl">${t("tb.ev")}</div><div class="gt-row">` +
        Object.keys(EV).map((k) => `<button class="fbtn on" data-ev="${k}">${evname(k)}</button>`).join("") +
      `</div></div><div><div class="gt-lbl">${t("tb.ops")}</div><div class="gt-row">` +
        `<button class="fbtn" id="g-center">${t("tb.center")}</button>` +
        `<button class="fbtn${labelOn ? " on" : ""}" id="g-labels">${t("tb.labels")}</button>` +
        `<button class="fbtn" id="g-reset">${t("tb.reset")}</button>` +
      `</div></div><div><div class="gt-lbl">${t("tb.rest")}</div><div class="gt-row">` +
        `<select id="lit-mode"><option value="dim">${t("tb.dim")}</option><option value="hide">${t("tb.hidem")}</option><option value="off">${t("tb.off")}</option></select>` +
      `</div></div>`;

    $$("[data-view2]", tb).forEach((b) => b.addEventListener("click", () => setView(b.dataset.view2)));
    $$("[data-mode]", tb).forEach((b) => b.addEventListener("click", () => {
      $$("[data-mode]", tb).forEach((x) => x.classList.toggle("on", x === b));
      colorMode = b.dataset.mode;
      if (colorMode === "cell") setView("all");
      $("#cell-sel").style.display = colorMode === "cell" ? "" : "none";
      lit = null; litLinks = null; syncLitFromMode(); refreshData(); applyColors();
    }));
    const cellChange = () => {
      cellStage = $("#cell-stage").value; cellCls = $("#cell-cls").value;
      syncLitFromMode(); refreshData(); applyColors();
    };
    $("#cell-stage").addEventListener("change", cellChange);
    $("#cell-cls").addEventListener("change", cellChange);

    $$(".fbtn[data-disc], .fbtn[data-edge], .fbtn[data-ev]", tb).forEach((b) =>
      b.addEventListener("click", () => {
        b.classList.toggle("on");
        const on = b.classList.contains("on");
        if (b.dataset.disc) on ? activeDisc.add(b.dataset.disc) : activeDisc.delete(b.dataset.disc);
        else if (b.dataset.edge) on ? activeEdge.add(b.dataset.edge) : activeEdge.delete(b.dataset.edge);
        else on ? activeEv.add(b.dataset.ev) : activeEv.delete(b.dataset.ev);
        refreshData(); applyColors();
      })
    );
    const pick = (t) => {
      if (colorMode === "cell") { colorMode = "disc"; $$("[data-mode]", tb).forEach((x) => x.classList.toggle("on", x.dataset.mode === "disc")); $("#cell-sel").style.display = "none"; }
      const [set, lset] = lineageOf(t);
      lit = set; litLinks = lset; refreshData(); applyColors();
      showNode(t.id); focusNode(t.id);
      $("#g-results").innerHTML = "";
    };
    $("#g-search").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      const box = $("#g-results");
      box.innerHTML = "";
      if (!q) { clearLit(); return; }
      const hits = DB.theories.filter((t) => matchT(t, q)).slice(0, 12);
      if (!hits.length) { box.innerHTML = `<div class="sres" style="color:var(--txt-dim)">${t("tb.search.none")}</div>`; return; }
      hits.forEach((t) => {
        const d = document.createElement("div");
        d.className = "sres";
        d.innerHTML = `<span style="color:${dcol(t)}">●</span> ${esc(t.cn)} <span style="color:var(--txt-dim)">${esc(t.scholar)}${t.school ? " · " + esc(t.school) : ""}</span>`;
        d.addEventListener("click", () => pick(t));
        box.appendChild(d);
      });
    });
    $("#g-search").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const f = $("#g-results .sres"); if (f && f.dataset !== undefined) f.click(); }
      if (e.key === "Escape") { e.target.value = ""; $("#g-results").innerHTML = ""; clearLit(); }
    });
    $("#tb-hide").addEventListener("click", () => { tb.style.display = "none"; $("#tb-toggle").style.display = "block"; });
    $("#tb-toggle").addEventListener("click", () => { tb.style.display = ""; $("#tb-toggle").style.display = "none"; });
    $("#g-center").addEventListener("click", () => fg.zoomToFit(900, 70));
    $("#g-labels").addEventListener("click", () => { labelOn = !labelOn; $("#g-labels").classList.toggle("on", labelOn); applyColors(); });
    $("#g-reset").addEventListener("click", () => { clearLit(); $("#g-search").value = ""; $("#g-results").innerHTML = ""; $("#graph-side").innerHTML = SIDE_DEF(); });
    $("#lit-mode").addEventListener("change", (e) => { litMode = e.target.value; refreshData(); applyColors(); });
  }

  /* ---------- node objects: sphere + text sprite ---------- */
  let sphereGeo = null;
  function makeNodeObj(n) {
    if (!sphereGeo) sphereGeo = new THREE.SphereGeometry(1, 14, 10);
    const g = new THREE.Group();
    const r = nodeR(n.t);
    const mesh = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: baseColor(n), transparent: true }));
    mesh.scale.setScalar(r);
    g.add(mesh);
    n.__m = mesh; n.__g = g;
    if (n.__s) g.add(n.__s); else n.__s = null;   // 對象重建時保留已建的標籤 sprite
    return g;
  }
  function makeSprite(n) {
    const r = nodeR(n.t);
    const s = new SpriteText(n.t.cn);
    s.textHeight = Math.max(3.4, r * 1.15);
    s.__h = s.textHeight;
    s.color = colorMode === "disc" ? "#c9d1d9" : baseColor(n);
    s.center.set(0.5, 1.5);
    s.material.depthWrite = false;
    return s;
  }

  function ensureGraph() {
    if (fg) { fg.refresh(); return; }
    buildToolbar();
    const gel = $("#graph");
    fg = ForceGraph3D({ rendererConfig: { antialias: true, alpha: true }, controlType: "orbit" })(gel)
      .width(Math.max(300, gel.clientWidth))
      .height(Math.max(300, gel.clientHeight))
      .backgroundColor("#0a0e14")
      .showNavInfo(false)
      .nodeThreeObject(makeNodeObj)
      .nodeLabel((n) => `${esc(n.t.cn)} · ${esc(n.t.scholar)}${CITES[n.id] ? " · 被引 " + CITES[n.id].toLocaleString() : ""}`)
      .linkColor((l) => ECOL[l.e.type] || "#8b949e")
      .linkOpacity(0.35)
      .linkWidth((l) => 0.4 + (l.e.s || 3) * 0.3)
      .linkDirectionalParticles((l) => (l.e.type === "tension" ? 2 : 0))
      .linkDirectionalParticleWidth(1.5)
      .linkDirectionalParticleColor((l) => ECOL.tension)
      .linkDirectionalArrowLength(3.4)
      .linkDirectionalArrowRelPos(0.8)
      .linkLabel((l) => `[${ET[l.e.type]}] ${esc(l.e.label)}`)
      .linkVisibility(linkVisFn)
      .onNodeClick((n) => selectTheory(n.id))
      .onLinkClick((l) => {
        showEdge(l.__i);
        const aid = sid(l.source), bid = sid(l.target);
        lit = new Set([aid, bid]); litLinks = new Set([l.__i]);
        refreshData(); applyColors();
        const a = byId[aid], b = byId[bid];
        if (a && b && a.x != null && b.x != null) {
          flyTo({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }, 150);
        }
      })
      .onBackgroundClick(() => { clearLit(); $("#graph-side").innerHTML = SIDE_DEF(); })
      .warmupTicks(140)
      .cooldownTicks(320)
      .onEngineStop(() => {
        if (!autoFitted) { autoFitted = true; fg.zoomToFit(900, 80); }
        fg.cooldownTicks(0); // 之後的篩選/點選不再重新加熱佈局，節點不漂移
      });
    setInterval(() => {
      if (!fg || (viewMode === "all" && nearZoom)) return;
      const cp = fg.cameraPosition(), tg = fg.controls ? fg.controls().target : null;
      const d = tg ? Math.hypot(cp.x - tg.x, cp.y - tg.y, cp.z - tg.z) : Math.hypot(cp.x, cp.y, cp.z);
      const nz = d < 520;
      if (nz !== nearZoom) { nearZoom = nz; applyColors(); }
    }, 300);
    new ResizeObserver(() => {
      const w = gel.clientWidth, h = gel.clientHeight;
      if (fg && w > 0 && h > 0) fg.width(w).height(h);
    }).observe(gel);
    refreshData(); applyColors();
  }

  function openGraphAt(tid) {
    goView("graph");
    selectTheory(tid);
  }

  /* ---------- link modal ---------- */
  let pendingUrl = null;
  $("#link-cancel").addEventListener("click", () => $("#link-modal").classList.remove("open"));
  $("#link-go").addEventListener("click", () => {
    if (pendingUrl) window.open(pendingUrl, "_blank", "noopener,noreferrer");
    $("#link-modal").classList.remove("open");
  });
  $("#link-modal").addEventListener("click", (e) => { if (e.target.id === "link-modal") e.target.classList.remove("open"); });
  function bindLinks(root) {
    $$(".link-item", root).forEach((a) => a.addEventListener("click", () => {
      pendingUrl = a.dataset.url;
      $("#link-modal-url").textContent = pendingUrl;
      $("#link-modal").classList.add("open");
    }));
  }

  /* ---------- inspector ---------- */
  const yrOf = (t) => parseInt(t.year, 10) || 9999;
  function lineageChain(tid) {
    const ids = new Set([tid]); const rel = [];
    const frontier = [tid];
    while (frontier.length) {
      const cur = frontier.pop();
      DB.edges.forEach((e) => {
        if (e.type !== "genealogy") return;
        if (e.f === cur && !ids.has(e.t)) { ids.add(e.t); frontier.push(e.t); rel.push({ e, dir: "desc" }); }
        if (e.t === cur && !ids.has(e.f)) { ids.add(e.f); frontier.push(e.f); rel.push({ e, dir: "asc" }); }
      });
    }
    return [...ids].map((id) => theorySafe(id)).sort((a, b) => yrOf(a) - yrOf(b));
  }

  function showNode(tid) {
    const t = theorySafe(tid);
    const d = dname(t.disc) || "—";
    const cells = DB.cells.filter((c) => (c.theories || []).includes(tid));
    const rels = DB.edges.filter((e) => e.f === tid || e.t === tid);
    const mates = t.school ? DB.theories.filter((x) => x.school === t.school) : [];
    const founder = t.school && yrOf(t) <= Math.min(...mates.map(yrOf)) + 2;
    const chain = lineageChain(tid);
    const linNodes = chain.length > 1 ? chain : [...mates].sort((a, b) => yrOf(a) - yrOf(b));
    const linLabel = chain.length > 1 ? t("nd.lineage") : t("nd.school");
    const TYPE_ORDER = ["genealogy", "tension", "coupling", "produces", "operationalizes"];
    const TYPE_HINT = { tension: t("rel.tension"), coupling: t("rel.coupling"), genealogy: t("rel.genealogy"), produces: t("rel.produces"), operationalizes: t("rel.operationalizes") };
    const relsByType = {};
    rels.forEach((e) => (relsByType[e.type] = relsByType[e.type] || []).push(e));
    const side = $("#graph-side");
    side.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="gt-lbl">${t("side.node")}</div><button class="wiki-btn" id="nd-wiki" title="${t("nd.wiki.title")}">Wiki ⇗</button>
      </div>
      <h3 class="theory-title" data-theory="${t.id}" title="${t("nd.center")}" style="color:${dcol(t)}">${esc(t.cn)}</h3>
      <div class="en">${esc(t.en)}</div>
      <div class="badges">
        <span class="badge" style="color:${dcol(t)};background:${dcol(t)}20">${t("nd.disc")} · ${d}</span>
        ${t.school ? `<span class="badge" style="color:${scol(t.school)};background:${scol(t.school)}1f">${t("nd.schooltag")} · ${esc(t.school)}${mates.length ? " · " + mates.length + t("nd.school.nodes") : ""}</span>` : `<span class="badge dim">${t("nd.school.solo")}</span>`}
        ${founder ? `<span class="badge gold">${t("nd.founder")}</span>` : ""}
        <span class="badge dim">${rels.length} ${t("nd.edgeN")}</span>
      </div>
      <div class="meta">${t("nd.by")}${esc(t.scholar)} <button class="wiki-btn mini" id="nd-wiki-s" title="${t("nd.wiki.scholar")}">↗</button> · ${esc(t.work)}${t.year ? " (" + esc(t.year) + ")" : ""}${CITES[t.id] ? " · " + t("nd.cited") + " " + CITES[t.id].toLocaleString() : ""}</div>
      <div class="body core-line">${esc(t.core)}</div>
      ${t.ref ? `<div class="refs">⌁ ${esc(t.ref)}</div>` : ""}
      ${linNodes.length > 1 ? `<div class="rel"><div class="expand-toggle" id="lin-t"><span>${linLabel} (${linNodes.length})</span><span class="arrow">▸</span></div>
        <div class="expand-body lin-box" id="lin-b">${linNodes.map((n) =>
          `<div class="lin-item${n.id === t.id ? " cur" : ""}" data-theory="${n.id}"><span class="yr">${esc(n.year || "—")}</span><span><span class="nm">${esc(n.cn)}</span> <span class="sc">${esc(n.school || DISC[n.disc])} · ${esc(n.scholar)}</span></span></div>`).join("")}
        </div></div>` : ""}
      ${t.detail ? `<div class="rel"><div class="gt-lbl">${t("nd.detail")}</div><div class="detail-txt">${esc(t.detail)}</div></div>` : ""}
      ${(t.links && t.links.length) ? `<div class="rel"><div class="gt-lbl">${t("nd.src")}</div><div class="links">${t.links.map((l) => `<a class="link-item" data-url="${esc(l.u)}">${esc(l.t)} ↗</a>`).join("")}</div></div>` : ""}
      <div class="rel"><div class="gt-lbl">${t("nd.cellsN")} (${cells.length})</div>
        ${cells.map((c) => `<div class="rel-item">▸ ${sname(c.stage)} × ${cname(c.cls)}</div>`).join("") || "<div class='rel-item'>—</div>"}
      </div>
      <div class="rel"><div class="gt-lbl">${t("nd.relsN")} (${rels.length})</div>
        ${TYPE_ORDER.filter((k) => relsByType[k]).map((k) => `
          <div class="rg-head" style="color:${ECOL[k]}">■ ${ename(k)}${TYPE_HINT[k] || ""} (${relsByType[k].length})</div>
          ${relsByType[k].map((e) => {
            const other = theorySafe(e.f === tid ? e.t : e.f);
            const dir = e.f === tid ? "→" : "←";
            return `<div class="rel-item">${dir} <a class="rel-link" data-theory="${other.id}">${esc(other.cn)}</a>
              <span class="rg-meta">${esc(other.school || DISC[other.disc])} · ${esc(other.scholar)}</span><br>
              <span style="color:var(--txt-dim)">${esc(e.label)}${e.ev ? ` · ${evname(e.ev)}` : ""}</span></div>`;
          }).join("")}`).join("") || "<div class='rel-item'>—</div>"}
      </div>`;
    side.querySelectorAll("[data-theory]").forEach((a) =>
      a.addEventListener("click", () => selectTheory(a.dataset.theory)));
    $("#lin-t")?.addEventListener("click", () => {
      $("#lin-t").classList.toggle("open"); $("#lin-b").classList.toggle("open");
    });
    $("#nd-wiki")?.addEventListener("click", () => openWiki(t, "theory"));
    $("#nd-wiki-s")?.addEventListener("click", () => openWiki(t, "scholar"));
    bindLinks(side);
  }

  /* ---------- wiki card ---------- */
  const wcEl = $("#wiki-card");
  $("#wc-close").addEventListener("click", () => wcEl.classList.remove("open"));
  $("#wc-max").addEventListener("click", () => wcEl.classList.toggle("max"));
  async function openWiki(t, kind) {
    wcEl.classList.remove("max"); wcEl.classList.add("open");
    const body = $(".wc-body", wcEl);
    body.innerHTML = `<span style="color:var(--txt-dim)">${t("wc.searching")}</span>`;
    const akas = (t.aka || "").split(" ").filter((x) => x.length > 1);
    const qs = kind === "scholar"
      ? [...new Set([t.scholar, ...akas, t.en].filter((x) => x && x.length > 1))]
      : [...new Set([t.cn, ...akas, t.en, t.work].filter((x) => x && x.length > 1))];
    const ask = (u) => { pendingUrl = u; $("#link-modal-url").textContent = u; $("#link-modal").classList.add("open"); };
    // 精確路徑：en wiki 摘要 → wikidata → zh sitelink（人名/概念跨語種對齊）
    async function enHit(term) {
      try {
        const r = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(term));
        if (r.ok) { const j = await r.json(); if (j.extract) return j; }
      } catch (e) {}
      return null;
    }
    async function zhSitelink(item) {
      try {
        const r = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${item}&props=sitelinks&sitefilter=zhwiki&format=json&origin=*`);
        return (await r.json()).entities?.[item]?.sitelinks?.zhwiki?.title || null;
      } catch (e) { return null; }
    }
    async function zhSearch(q) {
      try {
        const r = await fetch(`https://zh.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=3&namespace=0&format=json&origin=*`);
        if (r.ok) return (await r.json())[1] || [];
      } catch (e) {}
      return [];
    }
    const titles = [];
    const push = (x) => { if (x && !titles.includes(x)) titles.push(x); };
    const enCands = (kind === "scholar" ? [t.scholar] : [t.en, t.work]).filter(Boolean);
    const zhQs = qs.filter((x) => /[一-鿿]/.test(x));
    const zhP = Promise.all(zhQs.slice(0, 4).map(zhSearch));
    let enSummary = null;
    for (const c of enCands) { enSummary = await enHit(c); if (enSummary) break; }
    const zhExact = enSummary?.wikibase_item ? await zhSitelink(enSummary.wikibase_item) : null;
    push(zhExact);
    (await zhP).flat().forEach(push);
    if (!titles.length && !enSummary) {
      body.innerHTML = `<span style="color:var(--txt-dim)">${t("wc.none")}</span>
        <div class="wc-src"><a class="rel-link" id="wc-fb">${t("nd.wiki")}「${esc(qs[0] || t.cn)}」 ↗</a></div>`;
      $("#wc-fb").addEventListener("click", () =>
        ask("https://zh.wikipedia.org/wiki/Special:Search?search=" + encodeURIComponent(qs[0] || t.cn)));
      return;
    }
    function renderHit(j, curTitle, tag) {
      body.innerHTML = `${j.thumbnail ? `<img src="${esc(j.thumbnail.source)}" alt="">` : ""}
        <b style="color:var(--txt-hi)">${tag ? `<span class="wc-tag">${tag}</span>` : ""}${esc(j.title)}</b><p style="margin-top:6px">${esc(j.extract)}</p>
        <div class="wc-chips">${titles.filter((x) => x !== curTitle).slice(0, 4).map((x) => `<button class="wc-chip" data-t="${esc(x)}">${esc(x)}</button>`).join("")}</div>
        <div class="wc-src"><a class="rel-link" id="wc-more">${t("wc.full")} ↗</a></div>`;
      $("#wc-more").addEventListener("click", () => ask(j.content_urls.desktop.page));
      $$(".wc-chip", body).forEach((b) => b.addEventListener("click", () => loadZhTitle(b.dataset.t)));
    }
    async function loadZhTitle(title) {
      body.innerHTML = `<span style="color:var(--txt-dim)">${t("wc.loading")}「${esc(title)}」…</span>`;
      let j = null;
      try {
        const r = await fetch("https://zh.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title));
        if (r.ok) j = await r.json();
      } catch (e) {}
      if (!j || !j.extract) { body.innerHTML = `<span style="color:var(--txt-dim)">「${esc(title)}」${t("wc.noextract")}</span>`; return; }
      renderHit(j, j.title);
    }
    if (zhExact) loadZhTitle(zhExact);
    else if (enSummary) renderHit(enSummary, enSummary.title, "EN");
    else loadZhTitle(titles[0]);
  }

  /* ---------- share preview modal ---------- */
  const smEl = $("#share-modal");
  let smCtx = null;
  const isTouch = navigator.maxTouchPoints > 0 || /Android|iPhone|Mobile/i.test(navigator.userAgent);
  function openShareModal(cv, p, ty) {
    smCtx = { cv, p, ty };
    $("#sm-img").src = cv.toDataURL("image/png");
    $("#sm-tip").innerHTML = isTouch ? t("sm.tip.touch") : t("sm.tip.desktop");
    $("#sm-share").style.display = (isTouch || navigator.share) ? "" : "none";
    smEl.classList.add("open");
  }
  const closeShareModal = () => smEl.classList.remove("open");
  $("#sm-close").addEventListener("click", closeShareModal);
  $(".sm-back", smEl).addEventListener("click", closeShareModal);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeShareModal(); });
  $("#sm-save").addEventListener("click", () => {
    if (!smCtx) return;
    const a = document.createElement("a");
    a.download = `人生型格-${smCtx.ty.key}.png`;
    a.href = smCtx.cv.toDataURL("image/png");
    a.click();
  });
  $("#sm-copy").addEventListener("click", async (e) => {
    if (!smCtx) return;
    try {
      await navigator.clipboard.writeText(shareText(smCtx.p, smCtx.ty));
      e.target.textContent = t("rep.copied");
      setTimeout(() => { e.target.textContent = t("sm.copy"); }, 1500);
    } catch (err) { prompt(t("alert.copy"), shareText(smCtx.p, smCtx.ty)); }
  });
  $("#sm-share").addEventListener("click", () => {
    if (!smCtx) return;
    const { cv, p, ty } = smCtx, tip = $("#sm-tip");
    cv.toBlob(async (blob) => {
      const file = new File([blob], `人生型格-${ty.key}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: t("sm.sharetitle"), text: shareText(p, ty) }); } catch (e) {}
      } else if (navigator.share) {
        try { await navigator.share({ title: t("sm.sharetitle"), text: shareText(p, ty) }); }
        catch (e) { tip.innerHTML = t("sm.tip.cancel"); }
      } else {
        tip.innerHTML = t("sm.tip.unsupported");
      }
    }, "image/png");
  });

  function showEdge(i) {
    const e = DB.edges[i];
    const a = theorySafe(e.f), b = theorySafe(e.t);
    $("#graph-side").innerHTML = `
      <div class="gt-lbl">EDGE · RELATION</div>
      <h3><span style="color:${ECOL[e.type]}">[${ename(e.type)} ${e.type.toUpperCase()}]</span></h3>
      <div class="meta"><a class="rel-link" data-theory="${e.f}">${esc(a.cn)}</a> ${e.type === "tension" ? "⇄" : "→"} <a class="rel-link" data-theory="${e.t}">${esc(b.cn)}</a> · ${t("edge.s")} ${e.s || "—"}/5${e.ev ? " · " + evname(e.ev) : ""}</div>
      <div class="body"><b style="color:var(--txt-hi)">${esc(e.label)}</b></div>
      <div class="detail-txt">${esc(e.m || "")}</div>`;
    $("#graph-side").querySelectorAll("[data-theory]").forEach((a) =>
      a.addEventListener("click", () => selectTheory(a.dataset.theory)));
  }

  /* ============ docs ============ */
  function renderDeep() {
    const el = $("#view-deep");
    if (!el || !DB.deepdives) return;
    el.innerHTML = `<h2><span class="idx">§</span>${t("deep.h")}</h2>` +
      DB.deepdives.map((d, i) => `
      <h2><span class="idx">Q${i + 1}</span>${esc(d.title)}</h2>
      <div class="body">${d.body}</div>`).join("");
  }
  renderDeep();

  function renderBounds() {
    const el = $("#view-bounds");
    if (!el || !DB.boundaries) return;
    el.innerHTML = `<h2><span class="idx">§</span>${t("bounds.h")}</h2>
      <p class="lede">${t("bounds.lede")}</p>` +
      DB.boundaries.map((b, i) => `<h4>${i + 1}. ${esc(b.t)}</h4><div class="body">${b.body}</div>`).join("");
  }
  renderBounds();

  /* ============ data view ============ */
  const jv = $("#json-view");
  if (jv) jv.textContent = JSON.stringify({ meta: DB.meta, stages: DB.stages, classes: DB.classes, counts: { nodes: DB.theories.length, edges: DB.edges.length, cells: DB.cells.length } }, null, 2);

  /* ============ hash routing ============ */
  const route = () => {
    const [hv, hn] = location.hash.slice(1).split(":");
    if (hv && $("#view-" + hv)) {
      if (hn && hv === "graph" && byId[hn]) openGraphAt(hn); else goView(hv);
    }
  };
  window.addEventListener("hashchange", route);
  route();

  /* ============ 定位問卷 QUIZ（随年龄段自适应） ============ */
  const QUIZ_CORE = [
    { id: "age", q: "你的年龄段", type: "single", opts: [["s1", "0–12 岁"], ["s2", "13–22 岁"], ["s3", "23–35 岁"], ["s4", "36 岁以上"]] },
    { id: "edu", q: "你的最高学历（含在读）", type: "single", hide: ["s1"], opts: [[0.15, "高中及以下"], [0.35, "大专/高职"], [0.55, "本科"], [0.75, "硕士"], [0.9, "博士"]] },
    { id: "pedu", q: "父母最高学历", type: "single", opts: [[0.15, "高中及以下"], [0.35, "大专/高职"], [0.55, "本科"], [0.75, "硕士"], [0.9, "博士"]] },
    { id: "occ", q: "你目前的状态", type: "single", hide: ["s1"], optsByStage: {
        s2: [["student", "在读学生"], [0.2, "兼职/实习/打工"], [0.3, "已工作·体力/服务"], [0.5, "已工作·文职"], [0.7, "已工作·专业岗"]],
        dft: [[0.2, "体力/蓝领/零工"], [0.45, "服务业/文员"], [0.65, "专业技术/教师/医护"], [0.8, "管理/高级专业"], [0.92, "资本/自雇/资产"], ["student", "在校学生"]] } },
    { id: "ladder", q: "主观阶层：把自己放在 1–10 阶梯的哪一级", qByStage: { s1: "如果给家里的条件在 1–10 阶梯上排位，大概在哪一级" }, type: "range", min: 1, max: 10, def: 5 },
    { id: "gender", q: "性别", type: "single", opts: [["f", "女"], ["m", "男"], ["x", "不便透露"]] },
    { id: "domains", q: "当前最重的压力来源（可多选）", type: "multi", optsByStage: {
        s1: [["work", "学业/考试"], ["money", "家里经济/零花"], ["family", "父母/家庭"], ["health", "身体/情绪"], ["meaning", "没意思/没劲"], ["relation", "朋友/被孤立"], ["mobility", "升学焦虑"]],
        s2: [["work", "学业/前途"], ["money", "钱/生计"], ["family", "家庭/关系"], ["health", "身体/心理"], ["meaning", "迷茫/没意义"], ["relation", "同伴/孤独"], ["mobility", "出路焦虑"]],
        dft: [["money", "钱/生计"], ["work", "工作/职业"], ["family", "家庭/育儿/婚姻"], ["health", "身体/心理健康"], ["meaning", "没劲/没意义"], ["relation", "人际/孤独"], ["mobility", "上升/流动焦虑"]] } },
    { id: "want", q: "你现在最想要什么", type: "single", optsByStage: {
        s1: [["why", "想弄清发生了什么"], ["up", "想变得更好"], ["stable", "想先别那么难受"], ["meaning", "想找点意思"]],
        dft: [["why", "想看清是什么在困住我"], ["up", "想找到往上走的路"], ["stable", "想先稳住别垮掉"], ["meaning", "想找回意义感"]] } },
  ];
  const QUIZ_DEEP = [
    { id: "childhood", q: "小时候家里经济状况", type: "single", opts: [[0.25, "紧张/负债"], [0.5, "一般/温饱"], [0.8, "宽裕"]] },
    { id: "events", q: "近一年发生的大事（可多选）", type: "multi", optsByStage: {
        s1: [["exam", "升学/大考"], ["transfer", "转学/换环境"], ["famch", "家里出事/搬家"], ["sick", "生病/受伤"], ["none", "没什么大事"]],
        s2: [["exam", "高考/考研/出国"], ["jobless", "找不到工作/实习"], ["love", "恋爱/分手"], ["moved", "离开家/换城市"], ["illness", "自己或亲人生病"], ["none", "无大事"]],
        s4: [["retire", "退休/临近退休"], ["empty", "孩子离家"], ["parent", "父母重病/离世"], ["health2", "自己身体下滑"], ["divorce", "离婚/分居"], ["none", "无大事"]],
        dft: [["jobless", "失业/找工作"], ["married", "结婚/生子"], ["divorce", "离婚/分手"], ["illness", "亲人重病"], ["moved", "搬家/换城市"], ["none", "无大事"]] } },
    { id: "workstate", q: "当前工作状态", type: "single", hide: ["s1"], opts: [["jobless", "失业中"], ["stable", "受雇稳定"], ["overwork", "受雇但过劳"], ["self", "自雇/自由职业"], ["student", "求学中"]] },
    { id: "kids", q: "育儿状态", type: "single", hide: ["s1", "s2"], opts: [["none", "无孩"], ["pre", "学龄前"], ["school", "学龄期"], ["adult", "孩子已成年"], ["no", "不打算要"]] },
  ];
  const EV2DOM = {
    jobless: ["work", "money"], married: ["family"], divorce: ["family", "relation"], illness: ["health", "family"], moved: ["relation", "mobility"],
    exam: ["work", "mobility"], transfer: ["relation", "mobility"], famch: ["family", "mobility"], sick: ["health"], love: ["relation", "family"],
    retire: ["meaning", "health"], empty: ["family", "meaning"], parent: ["family", "health"], health2: ["health"], none: [],
  };

  function qOptsOf(q, st) {
    const raw = (q.optsByStage && (q.optsByStage[st] || q.optsByStage.dft)) || q.opts || [];
    if (!isEN() || !window.Q_EN || !Q_EN[q.id]) return raw;
    const en = Q_EN[q.id].optsByStage && (Q_EN[q.id].optsByStage[st] || Q_EN[q.id].optsByStage.dft) || Q_EN[q.id].opts;
    if (!en) return raw;
    return raw.map(([v, l]) => [v, en[String(v)] || l]);
  }
  function qTitleOf(q, st) {
    if (isEN() && window.Q_EN && Q_EN[q.id]) {
      return (Q_EN[q.id].qByStage && Q_EN[q.id].qByStage[st]) || Q_EN[q.id].q || ((q.qByStage && q.qByStage[st]) || q.q);
    }
    return (q.qByStage && q.qByStage[st]) || q.q;
  }
  function qBlock(q, st) {
    const hidden = q.hide && st && q.hide.includes(st) ? ' style="display:none"' : "";
    if (q.type === "range")
      return `<div class="q-block" data-qid="${q.id}"${hidden}><div class="q-title">${esc(qTitleOf(q, st))}</div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="gt-lbl">1</span><input type="range" name="${q.id}" min="${q.min}" max="${q.max}" value="${q.def}" style="flex:1" oninput="this.nextElementSibling.textContent=this.value"><span class="q-range-val">${q.def}</span><span class="gt-lbl">10</span>
        </div></div>`;
    const it = q.type === "multi" ? "checkbox" : "radio";
    return `<div class="q-block" data-qid="${q.id}"${hidden}><div class="q-title">${esc(qTitleOf(q, st))}</div><div class="q-opts">` +
      qOptsOf(q, st).map(([v, l]) => `<label><input type="${it}" name="${q.id}" value="${v}">${esc(l)}</label>`).join("") +
      `</div></div>`;
  }

  /* 年龄段变化 → 重新适配题目显隐与选项（保留已选值） */
  function applyStage(st) {
    QUIZ_CORE.concat(QUIZ_DEEP).forEach((q) => {
      const blk = $(`.q-block[data-qid="${q.id}"]`);
      if (!blk) return;
      blk.style.display = q.hide && st && q.hide.includes(st) ? "none" : "";
      const title = blk.querySelector(".q-title"); if (title) title.textContent = qTitleOf(q, st);
      if (!q.optsByStage) return;
      const box = blk.querySelector(".q-opts");
      const it = q.type === "multi" ? "checkbox" : "radio";
      const checked = new Set($$(`input[name="${q.id}"]:checked`, blk).map((x) => x.value));
      box.innerHTML = qOptsOf(q, st).map(([v, l]) =>
        `<label><input type="${it}" name="${q.id}" value="${v}"${checked.has(String(v)) ? " checked" : ""}>${esc(l)}</label>`).join("");
    });
  }

  function renderQuiz() {
    $("#quiz-form").innerHTML = `
      <h3 style="margin-bottom:4px">${t("quiz.h")}</h3>
      <p style="color:var(--txt-dim);font-size:12.5px;margin-bottom:8px">${t("quiz.intro")}</p>
      ${QUIZ_CORE.map((q) => qBlock(q, null)).join("")}
      <div id="quiz-deep">${QUIZ_DEEP.map((q) => qBlock(q, null)).join("")}</div>
      <div class="quiz-actions">
        <button id="quiz-go" class="primary">${t("quiz.go")}</button>
        <button id="quiz-more" class="ghost secondary outline">${t("quiz.more")}</button>
      </div>`;
    $("#quiz-more").addEventListener("click", (e) => {
      $("#quiz-deep").classList.add("open"); e.target.style.display = "none";
    });
    $$('input[name="age"]').forEach((r) => r.addEventListener("change", () => applyStage(r.value)));
    $("#quiz-go").addEventListener("click", submitQuiz);
  }

  function collectAnswers() {
    const a = {};
    QUIZ_CORE.concat(QUIZ_DEEP).forEach((q) => {
      if (q.type === "range") { a[q.id] = +$(`input[name="${q.id}"]`).value; return; }
      if (q.type === "multi") { a[q.id] = $$(`input[name="${q.id}"]:checked`).map((x) => x.value); return; }
      const r = $(`input[name="${q.id}"]:checked`); a[q.id] = r ? r.value : null;
    });
    return a;
  }

  function computeProfile(a) {
    const num = (v) => (v === "student" || v == null ? null : +v);
    let edu = num(a.edu), pedu = num(a.pedu) ?? 0.5;
    const lad = (a.ladder - 1) / 9;
    const occ = a.occ === "student" ? null : num(a.occ);
    const ses = occ == null
      ? (edu == null ? 0.55 * pedu + 0.45 * lad : 0.3 * edu + 0.35 * pedu + 0.35 * lad)
      : 0.22 * (edu ?? 0.5) + 0.28 * pedu + 0.28 * occ + 0.22 * lad;
    const g = (x, c, v) => Math.exp(-((x - c) ** 2) / v);
    const cw = { c1: g(ses, 0.22, 0.05), c2: g(ses, 0.55, 0.06), c3: g(ses, 0.88, 0.04) };
    const cs = cw.c1 + cw.c2 + cw.c3;
    cw.c1 /= cs; cw.c2 /= cs; cw.c3 /= cs;
    const doms = new Set(a.domains || []);
    if (a.childhood != null && +a.childhood < 0.4) { doms.add("money"); doms.add("family"); }
    (a.events || []).forEach((e) => (EV2DOM[e] || []).forEach((d) => doms.add(d)));
    if (a.workstate === "jobless") { doms.add("work"); doms.add("money"); }
    if (a.workstate === "overwork") doms.add("work");
    if (a.kids && a.kids !== "none" && a.kids !== "no") doms.add("family");
    const wantDom = { why: null, up: "mobility", stable: "health", meaning: "meaning" }[a.want];
    if (wantDom) doms.add(wantDom);
    const cls = Object.entries(cw).sort((x, y) => y[1] - x[1])[0][0];
    return { stage: a.age || "s3", ses, cw, cls, doms, gender: a.gender || "x", want: a.want || "why" };
  }

  function scoreTheories(p) {
    return DB.theories.map((t) => {
      let s = 0;
      s += t.stages ? (t.stages.includes(p.stage) ? 3 : 0) : 1.5;
      s += t.classes ? (p.cw.c1 * (t.classes.includes("c1") ? 3 : 0) + p.cw.c2 * (t.classes.includes("c2") ? 3 : 0) + p.cw.c3 * (t.classes.includes("c3") ? 3 : 0)) : 1.2;
      s += Math.min(2, (t.domains || []).filter((d) => p.doms.has(d)).length) * 2;
      if (t.gender) s += t.gender === p.gender ? 1.5 : (p.gender === "x" ? 0 : -3);
      return { t, s };
    }).sort((x, y) => y.s - x.s);
  }

  /* ---------- 人生型格 ARCHETYPE ---------- */
  const TYPES = {
    EAW: { name: "拓疆者", motto: "站在甲板上的人 —— 资源在手，向外扩张，盯住现实阶梯", trait: ["资源蓄能", "向外驱动", "现实域"] },
    EAI: { name: "点灯人", motto: "柴火够烧的人开始问光 —— 资源在手，向外探索意义", trait: ["资源蓄能", "向外驱动", "内在域"] },
    ERW: { name: "筑塔者", motto: "不声不响地砌 —— 资源在手，向内收拢，积累确定性", trait: ["资源蓄能", "向内收拢", "现实域"] },
    ERI: { name: "观潮者", motto: "看清浪的形状再下水 —— 资源在手，向内审视自我与世界", trait: ["资源蓄能", "向内收拢", "内在域"] },
    PAW: { name: "破局者", motto: "牌不好也要打出去 —— 负重前行，向外突破现实约束", trait: ["负重前行", "向外驱动", "现实域"] },
    PAI: { name: "燃灯者", motto: "自己当火柴 —— 负重前行，向外点出意义与连接", trait: ["负重前行", "向外驱动", "内在域"] },
    PRW: { name: "潜流者", motto: "水面下先攒力气 —— 负重前行，向内稳住现实基本盘", trait: ["负重前行", "向内收拢", "现实域"] },
    PRI: { name: "织网者", motto: "慢慢补好每一块 —— 负重前行，向内织补内在与关系", trait: ["负重前行", "向内收拢", "内在域"] },
  };
  const STAGE_ERA = { s1: "萌芽期", s2: "拔节期", s3: "破浪期", s4: "归航期" };
  const ERA_LINE = {
    s1: "认知预载期 —— 世界正在替你写默认参数",
    s2: "同一性成形期 —— 自我在试探自己的边界",
    s3: "相变窗口期 —— 惯习与场域开始错配",
    s4: "整合审计期 —— 意义系统进入重估",
  };
  function typeOf(p) {
    const ax1 = (p.cw.c2 + p.cw.c3) >= p.cw.c1 ? "E" : "P";
    const ax2 = (p.want === "up" || p.want === "meaning") ? "A" : "R";
    const w = [...p.doms].filter((d) => ["money", "work", "mobility"].includes(d)).length;
    const i = [...p.doms].filter((d) => ["family", "relation", "health", "meaning"].includes(d)).length;
    const ax3 = w >= i ? "W" : "I";
    const code = ax1 + ax2 + ax3;
    if (isEN() && window.TYPE_EN)
      return { code, key: `${code}-${p.stage}`, era: TYPE_EN.STAGE_ERA[p.stage], eraLine: TYPE_EN.ERA_LINE[p.stage], ...TYPE_EN.TYPES[code] };
    return { code, key: `${code}-${p.stage}`, era: STAGE_ERA[p.stage], eraLine: ERA_LINE[p.stage], ...TYPES[code] };
  }

  function mascotUrl(key, gender) {
    const [code, stage] = key.split("-");
    const svg = window.MASCOT_OF ? window.MASCOT_OF(code, stage, gender) : "";
    if (!svg) return "";
    return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  }

  /* ---------- 分享卡 ---------- */
  function shareText(p, ty) {
    if (isEN())
      return `My life type: ${ty.era}·${ty.name} (${ty.key.toUpperCase()} / 32 types)\n` +
        `Position: ${sname(p.stage)} × ${cname(p.cls)}\nMotto: ${ty.motto}\n` +
        `— Class × Life Course theory map (413 theories · 782 relations)`;
    return `我的人生型格：${ty.era}·${ty.name}（${ty.key.toUpperCase()} / 32型）\n` +
      `定位：${sname(p.stage)} × ${cname(p.cls)}\n箴言：${ty.motto}\n` +
      `—— 阶层×生命历程理论图谱 (413理论·782关系)`;
  }
  const SITE_URL = "https://lifejourneywiththeory.netlify.app";
  function drawQR(x, url, cx, top, box, fg) {
    try {
      const qr = qrcode(0, "M"); qr.addData(url); qr.make();
      const n = qr.getModuleCount(), cell = box / n, pad = 14;
      x.fillStyle = "#fffdf7";
      x.beginPath(); x.roundRect(cx - box / 2 - pad, top - pad, box + pad * 2, box + pad * 2, 18); x.fill();
      x.fillStyle = fg;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
        if (qr.isDark(r, c)) x.fillRect(cx - box / 2 + c * cell, top + r * cell, cell + 0.4, cell + 0.4);
      return top + box + pad;
    } catch (e) { return top; }
  }
  async function makeShareCard(p, ty, ranked) {
    const W = 900, H = 1300, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const x = cv.getContext("2d");
    const dark = document.documentElement.dataset.theme === "dark";
    const g = x.createLinearGradient(0, 0, 0, H);
    if (dark) { g.addColorStop(0, "#3a3026"); g.addColorStop(1, "#2b241d"); } else { g.addColorStop(0, "#f7ecd9"); g.addColorStop(1, "#efe0c6"); }
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) { x.fillStyle = `rgba(224,149,108,${0.05 + i * 0.02})`; x.beginPath(); x.arc(720 - i * 90, 140 + i * 60, 200, 0, 7); x.fill(); }
    const fg = dark ? "#f3ebdc" : "#3a2c1e", dim = dark ? "#a89880" : "#8a7a64", acc = "#c96f4a";
    x.textAlign = "center";
    x.fillStyle = dim; x.font = "26px 'SF Mono',Menlo,monospace";
    x.fillText("C L A S S  ×  L I F E C O U R S E", W / 2, 90);
    x.fillStyle = dim; x.font = "22px sans-serif";
    x.fillText(t("card.title"), W / 2, 150);
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.onerror = res; img.src = mascotUrl(ty.key, p.gender); });
    if (img.width) x.drawImage(img, W / 2 - 110, 200, 220, 220);
    x.fillStyle = fg; x.font = "700 64px 'Songti SC','Noto Serif CJK SC',serif";
    x.fillText(`${ty.era} · ${ty.name}`, W / 2, 500);
    x.fillStyle = acc; x.font = "700 34px sans-serif";
    x.fillText(ty.key.toUpperCase(), W / 2, 555);
    x.fillStyle = dim; x.font = "24px sans-serif";
    x.fillText(ty.motto.length > 34 ? ty.motto.slice(0, 34) : ty.motto, W / 2, 615);
    x.fillStyle = fg; x.font = "600 30px sans-serif";
    x.fillText(`${t("card.loc")}${isEN() ? ": " : "："}${sname(p.stage)} × ${cname(p.cls)}`, W / 2, 700);
    x.fillStyle = dim; x.font = "22px sans-serif";
    ty.trait.forEach((t, i) => { const tw = 190; x.strokeStyle = acc; x.lineWidth = 2;
      const rx = W / 2 - (ty.trait.length * (tw + 16) - 16) / 2 + i * (tw + 16);
      x.beginPath(); x.roundRect(rx, 740, tw, 52, 26); x.stroke();
      x.fillText(t, rx + tw / 2, 776); });
    x.fillStyle = fg; x.font = "600 26px 'Songti SC',serif";
    x.fillText(t("card.mains"), W / 2, 850);
    x.fillStyle = dim; x.font = "23px sans-serif";
    ranked.slice(0, 3).forEach((r, i) => x.fillText(`· ${r.t.cn} —— ${r.t.scholar}`, W / 2, 905 + i * 52));
    const qrBot = drawQR(x, SITE_URL, W / 2, 1040, 132, fg);
    x.fillStyle = fg; x.font = "600 24px sans-serif";
    x.fillText(t("card.qr"), W / 2, qrBot + 42);
    x.fillStyle = dim; x.font = "20px 'SF Mono',Menlo,monospace";
    x.fillText(t("card.foot"), W / 2, qrBot + 82);
    return cv;
  }

  const DOM_CN = { money: "钱/生计", work: "工作/学业", family: "家庭关系", health: "身心健康", meaning: "意义感", relation: "人际", mobility: "上升通道" };
  const domname = (d) => (isEN() && window.DOM_EN ? DOM_EN[d] || DOM_CN[d] : DOM_CN[d]);
  function discLegend() {
    return `<div class="legend-row"><span class="legend-lbl">${t("mx.legend")}</span>` +
      Object.keys(DISC).map((k) => `<span class="legend-chip" style="color:${DCOL[k]}">● ${dname(k)}</span>`).join("") + `</div>`;
  }
  /* 人話解讀：把 profile + ranked 譯成三段叙述 */
  function verdictText(p, ty, ranked, levers) {
    const stageLine = (isEN() && window.REP_EN ? REP_EN.stageLine : {
      s1: "你还在认知预载期——家庭和学校正在替你写世界的默认参数，很多事不是你选的，但它们已经在起作用",
      s2: "你正在同一性成形期——「我是谁、能到哪去」是这一阶段的核心工程，路径还没锁死，试错成本相对低",
      s3: "你正在相变窗口期——旧轨道和新可能开始错配，这是结构最容易松动、变动成本也最低的一段",
      s4: "你正在整合审计期——开始清点这一程：什么值得留下、什么该放下，重心从扩张转向意义重组",
    })[p.stage];
    const clsLine = (isEN() && window.REP_EN ? REP_EN.clsLine : {
      c1: "资源受限的一侧——结构的压力对你更直接、缓冲更薄，所以先看清哪些墙是结构砌的、不是你自己的错",
      c2: "中间位置——有缓冲但不厚，向上够得着、向下也掉得起，最大的风险是「看似稳定」带来的错觉",
      c3: "资源较厚的一侧——你的主要议题不是生存而是配置：时间、注意力和意义花在哪儿",
    })[p.cls];
    const doms = [...p.doms].map((d) => domname(d)).filter(Boolean);
    const top = levers[0];
    const ACT = {
      money: { s1: "家里的钱紧不是你的作业——先把你这份账看明白，别让大人的焦虑长成你的负罪",
        s2: "把「穷」拆成两笔账：进账通道（现在能打的工/能换的技能）与固定流出（哪些支出在替你决定未来）——先动最容易的那笔",
        s3: "画一张你的现金流地图：哪部分是生存、哪部分是身份表演——砍掉后者的 10% 常比多赚 10% 更改变结构位置",
        s4: "这个阶段的钱的问题常是「旧承诺」：房贷、子女、父母。先给承诺分级——哪些可重谈、哪些是必须扛的" },
      work: { s1: "学业是这阶段的「工作」：成绩差多半不是智力，是环境给的练习条件——先找到你卡的具体环节（听不懂/不敢问/没人盯）",
        s2: "区分你缺的是「技能筹码」（可带走的能力）还是「场域资格」（学历、证书、人脉入口）——两者的获取路径完全不同",
        s3: "盘点工作给了什么：工资之外有没有可迁移资产（技能、口碑、作品、客户）——没有积累性的忙是结构性空转",
        s4: "职业后期最怕「只剩岗位没有人」：提前把经验产品化（带徒弟/写作/顾问）——让能力先于职位退休" },
      family: { s1: "家里的冲突多半不是谁的错——经济压力、情绪劳动、代际观念都掺在里面。你能做的是认出「这不该由我背」的部分",
        s2: "离家过渡期是重新谈判关系的窗口：哪些义务是真心、哪些是惯性——从一次边界清楚的小拒绝开始练",
        s3: "照护分工是家庭里最隐蔽的不平等：先记账——谁做情绪劳动、谁随叫随到——看见了才有得谈",
        s4: "空巢或照护反转期，先分清角色退出（不再天天被需要）与关系终止（不再被爱）——前者正常后者可修" },
      health: { s1: "身体的信号先说给值得信任的大人听——吃不下/睡不着/莫名疼，常常是环境在借身体报警",
        s2: "别把身体当无限带宽：这个阶段熬夜的账三十年后才到——先保住睡眠这一个变量",
        s3: "高压期的身体折旧是复利：先止损（睡眠/就医/减压源）再谈逆袭，带病奔跑的人跑不远",
        s4: "把健康当资产管理：每年体检、运动排进日程而非等有空——这阶段拼的是折旧速度" },
      meaning: { s1: "「活着有什么意思」在这个年纪通常翻译为「没人看见我」——先找一个能被你影响的小世界（宠物、作品、一个朋友）",
        s2: "意义危机在这个年龄是发展任务不是病：先试后想——去不同的地方做不同的事，答案长在经验里不长在思考里",
        s3: "别问「人生的意义是什么」改问「哪件事的反馈让我忘了时间」——意义是动词不是名词，从一个小闭环开始",
        s4: "这个阶段的意义问题常是角色退出后的真空：提前培养「不为了谁也在做的事」——它是第三龄的地基" },
      relation: { s1: "被孤立不等于你有问题——群体位置是会变的。先找到一个安全连接（一个大人、一个朋友），再谈别的",
        s2: "这个阶段的关系密度决定眼界：刻意的弱连接（社团、实习、线上社区）比同学圈更能把你带到新地图",
        s3: "社交圈分层看：给机会的通常是弱连接（点头之交），托底的才是强连接——多数人缺前者不缺后者",
        s4: "晚年关系要经营「被需要感」：固定节律的互助型关系（志愿、搭子、邻里）比泛泛社交更能对抗孤独税" },
      mobility: { s1: "你现在的流动主要是家庭轨迹的附属——把书读好不是唯一的梯子，但它是最便宜的那把",
        s2: "向上流动不是直线爬梯是换轨：列出你的「可迁移资产」（成绩、证书、作品、迁移能力）——先评估筹码再选赛道",
        s3: "赛道比努力值钱：同一能力在不同场域溢价差数倍——先确认天花板是能力问题还是场域问题",
        s4: "中年以后的流动更多是「换层」而非「升级」：从执行到传承（带人/顾问/资产化经验），台阶换材质了" },
    };
    if (isEN() && window.REP_EN) Object.assign(ACT, REP_EN.ACT);
    const firstDom = [...p.doms][0];
    return `<div class="verdict-block">
      <div class="gt-lbl" style="margin-bottom:10px">${t("rep.interp")}</div>
      <p><b style="color:var(--accent)">${t("rep.where")}${isEN() ? ": " : "："}</b>${stageLine}。${isEN() ? "Based on your answers, your class position reads as" : "按你的作答，阶层位置判定为"} <b>${cname(p.cls)}</b>——${clsLine}${isEN() ? "." : "。"}</p>
      <p><b style="color:var(--accent)">${t("rep.press")}${isEN() ? ": " : "："}</b>${t("rep.press.body")} <b>${doms.join(isEN() ? ", " : "、") || t("rep.press.none")}</b>${isEN() ? ". " : "。"}${t("rep.press.tail")}</p>
      <p><b style="color:var(--accent)">${t("rep.move")}${isEN() ? ": " : "："}</b>${top ? `${t("rep.move.lever")} ${isEN() ? `\u201c<b>${esc(top.t.en || top.t.cn)}</b>\u201d (${esc(top.t.scholar)}): ` : `\u300c<b>${esc(top.t.cn)}</b>\u300d\uff08${esc(top.t.scholar)}\uff09\uff1a`}${esc(top.t.core)} ` : ""}${(ACT[firstDom] && (ACT[firstDom][p.stage] || Object.values(ACT[firstDom])[0])) || t("rep.move.dft")}</p>
    </div>`;
  }

  function renderReport(p, ranked) {
    const cell = DB.cells.find((c) => c.stage === p.stage && c.cls === p.cls);
    const wantLbl = (isEN() && window.REP_EN ? REP_EN.wantLbl : { why: "看清困住你的结构", up: "找上行路径", stable: "先稳住不崩", meaning: "找回意义感" })[p.want];
    const conf = Math.round(Math.max(p.cw.c1, p.cw.c2, p.cw.c3) * 100);
    const structural = ranked.filter((r) => !r.t.lever).slice(0, 6);
    const cellIds = cell ? cell.theories : [];
    let trans = ranked.filter((r) => cellIds.includes(r.t.id)).slice(0, 5);
    if (!trans.length) trans = ranked.filter((r) => r.t.stages && r.t.stages.includes(p.stage)).slice(0, 5);
    const levers = ranked.filter((r) => r.t.lever === 1).slice(0, 6);
    const item = (r) => {
      const why = [];
      if (r.t.stages && r.t.stages.includes(p.stage)) why.push(t("rep.hit.stage"));
      const dm = (r.t.domains || []).filter((d) => p.doms.has(d));
      if (dm.length) why.push(t("rep.hit.dom") + dm.map((d) => domname(d)).join("/"));
      if (r.t.lever) why.push(t("rep.hit.lever"));
      return `<div class="rep-item" data-theory="${r.t.id}">
        <div class="r-cn" style="color:${DCOL[r.t.disc] || "var(--accent)"}">${esc(isEN() ? (r.t.en || r.t.cn) : r.t.cn)}</div>
        <div class="r-why">${why.map((w) => `<span>${w}</span>`).join("")}</div>
        <div class="r-core">${esc(r.t.core)}</div>
        <div class="r-meta">${esc(r.t.scholar)} · ${esc(r.t.school || DISC[r.t.disc])}</div></div>`;
    };
    const ty = typeOf(p);
    $("#quiz-report").innerHTML = `
      <article>
        <div class="type-card">
          <img class="type-mascot" src="${mascotUrl(ty.key, p.gender)}" alt="${ty.name}">
          <div class="type-info">
            <div class="type-eyebrow">${t("rep.type.eyebrow")}</div>
            <div class="type-name">${ty.era} · ${ty.name}<span class="type-code">${ty.key.toUpperCase()}</span></div>
            <div class="type-motto">${ty.eraLine}｜${ty.motto}</div>
            <div class="type-traits">${ty.trait.map((t) => `<span class="type-trait">${t}</span>`).join("")}</div>
          </div>
        </div>
        <h3>${t("rep.loc")}${isEN() ? ": " : "："}${sname(p.stage)} × ${cname(p.cls)}</h3>
        <div class="r-meta" style="font-size:11px;color:var(--txt-dim)">${t("rep.conf")} ${conf}% · ${t("rep.want")}${isEN() ? ": " : "："}${wantLbl}</div>
        ${verdictText(p, ty, ranked, levers)}
        ${cell ? `<details class="cell-raw"><summary>${t("rep.raw")}${isEN() ? "(" : "（"}${sname(cell.stage)}×${cname(cell.cls)} ${t("rep.raw.hint")}${isEN() ? ")" : "）"}</summary><div class="cell-raw-body">${esc(cell.mech)}<br><br>${esc(cell.out)}</div></details>` : ""}
        ${discLegend()}
        <div class="report-grid">
          <div class="rep-col"><h4 style="color:var(--c-tension)">${t("rep.col1")}</h4><p class="rep-sub">${t("rep.col1sub")}</p>${structural.map(item).join("")}</div>
          <div class="rep-col"><h4 style="color:var(--c-produces)">${t("rep.col2")}</h4><p class="rep-sub">${t("rep.col2sub")}</p>${trans.map(item).join("") || "<div class='rep-item'>—</div>"}</div>
          <div class="rep-col"><h4 style="color:var(--c-coupling)">${t("rep.col3")}</h4><p class="rep-sub">${t("rep.col3sub")}</p>${levers.map(item).join("")}</div>
        </div>
        <div class="quiz-actions">
          <button id="rep-graph" class="primary">${t("rep.graph")}</button>
          <button id="rep-share" class="secondary outline">${t("rep.share")}</button>
          <button id="rep-copy" class="secondary outline">${t("rep.copy")}</button>
          <button id="rep-redo" class="ghost secondary outline">${t("rep.redo")}</button>
        </div>
      </article>`;
    $("#quiz-form").style.display = "none";
    $("#quiz-report").style.display = "";
    $$("#quiz-report .rep-item").forEach((el) => el.addEventListener("click", () => openGraphAt(el.dataset.theory)));
    $("#rep-redo").addEventListener("click", () => { $("#quiz-form").style.display = ""; $("#quiz-report").style.display = "none"; });
    $("#rep-copy").addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(shareText(p, ty)); e.target.textContent = t("rep.copied"); }
      catch (err) { prompt(t("alert.copy"), shareText(p, ty)); }
    });
    $("#rep-share").addEventListener("click", async (e) => {
      e.target.textContent = t("rep.share.wait");
      const cv = await makeShareCard(p, ty, ranked);
      openShareModal(cv, p, ty);
      e.target.textContent = t("rep.share");
    });
    $("#rep-graph").addEventListener("click", () => {
      const top = new Set(ranked.slice(0, 30).map((r) => r.t.id));
      setView("all");
      goView("graph");
      lit = top;
      litLinks = new Set(); DB.edges.forEach((e, i) => { if (top.has(e.f) && top.has(e.t)) litLinks.add(i); });
      refreshData(); applyColors();
      $("#graph-side").innerHTML = `<div class="gt-lbl">${t("rep.mylines")}</div>
        <p style="margin-top:12px;font-size:12.5px">${t("rep.lit")} ${top.size} ${t("rep.lit.nodes")}（${t("rep.lit.others")}${litMode === "dim" ? t("rep.lit.dim") : litMode === "hide" ? t("rep.lit.hide") : t("rep.lit.off")}）。<br>
        <a class="rel-link" id="back-rep">${t("rep.back")}</a></p>`;
      const top1 = ranked[0]; if (top1) focusNode(top1.t.id);
      $("#back-rep").addEventListener("click", () => goView("quiz"));
    });
  }

  let lastP = null, lastRanked = null;
  function submitQuiz() {
    const a = collectAnswers();
    if (!a.age) { alert(t("quiz.need.age")); return; }
    const p = computeProfile(a);
    lastP = p; lastRanked = scoreTheories(p);
    renderReport(p, lastRanked);
  }
  renderQuiz();

  /* ---------- 语言切换：重建动态视图并保留问卷答案 ---------- */
  const langBtn = $("#lang-toggle");
  if (langBtn) langBtn.addEventListener("click", () => setLang(isEN() ? "zh" : "en"));
  window.addEventListener("clm:lang", () => {
    const saved = collectAnswers();
    const reportOpen = $("#quiz-report").style.display !== "none";
    renderTabs(); renderMatrix(); renderMxLegend(); renderQuiz();
    // restore answers
    Object.entries(saved).forEach(([k, v]) => {
      if (Array.isArray(v)) v.forEach((x) => { const i = document.querySelector(`input[name="${k}"][value="${x}"]`); if (i) i.checked = true; });
      else { const i = document.querySelector(`input[name="${k}"][value="${v}"]`) || document.querySelector(`input[name="${k}"][type="range"]`); if (i) { if (i.type === "range") { i.value = v; i.nextElementSibling.textContent = v; } else i.checked = true; } }
    });
    if (saved.age) applyStage(saved.age);
    if (reportOpen && lastP) renderReport(lastP, lastRanked);
    buildToolbar();
    renderDeep(); renderBounds();
  });

  /* ---------- 明暗主題 + cover ---------- */
  function drawTri(cv, seed) {
    if (!cv || !window.trianglify) return;
    const dark = document.documentElement.dataset.theme === "dark";
    const pal = dark
      ? ["#2c241d", "#3a2d21", "#4a3826", "#5d4530", "#71543a"]
      : ["#fdf3de", "#f9e2c0", "#f1cb9b", "#e5ae72", "#d08a54"];
    const w = cv.parentElement.clientWidth || innerWidth, h = cv.parentElement.clientHeight || innerHeight;
    cv.width = w; cv.height = h;
    window.trianglify({ width: w, height: h, cellSize: 64, variance: 0.85, xColors: pal, seed: seed || "clm" }).toCanvas(cv);
  }
  const cover = $("#cover");
  const hasHash = !!location.hash.slice(1);
  if (cover && !hasHash) {
    cover.classList.add("show", "ready");
    drawTri($("#cover-tri"), "door");
    const enter = (goto) => {
      cover.classList.add("entering");
      setTimeout(() => { cover.classList.add("gone"); }, 880);
      if (goto) setTimeout(() => goView(goto), 250); else goView("quiz");
    };
    $("#cover-enter").addEventListener("click", () => enter());
    $$(".cover-link").forEach((b) => b.addEventListener("click", () => enter(b.dataset.goto)));
  } else if (cover) cover.classList.add("gone");
  $("#theme-toggle").addEventListener("click", () => {
    const h = document.documentElement;
    const t = h.dataset.theme === "dark" ? "light" : "dark";
    h.dataset.theme = t; try { localStorage.setItem("clm-theme", t); } catch (e) {}
    drawTri($("#cover-tri"), "door");
  });
  try { const t = localStorage.getItem("clm-theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}

  /* debug/testing hooks */
  window.__CLM = {
    DB, node: showNode, edge: showEdge, lineage: lineageHit, select: selectTheory,
    lit: () => [lit && lit.size, litLinks && litLinks.size],
    fit: () => fg && fg.zoomToFit(900, 70),
    mode: (m) => { const b = document.querySelector(`[data-mode="${m}"]`); if (b) b.click(); },
    cell: (s, c) => { const st = $("#cell-stage"), cl = $("#cell-cls"); if (st) { st.value = s; cl.value = c; st.dispatchEvent(new Event("change")); } },
    scene: () => fg && fg.scene(), fg: () => fg,
  };
})();
