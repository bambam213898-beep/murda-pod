/* Leonida pause-menu map: pre-rendered satellite-style terrain + live overlay (pan, zoom, blips, GPS route). */
(function () {
  const cv = document.getElementById('mapCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const stage = document.getElementById('mapStage');
  const tip = document.getElementById('mapTip');
  const info = document.getElementById('mapInfo');
  const legend = document.getElementById('legend');
  const WW = 2000, WH = 1400, PS = 1.6; // world size, terrain pre-render scale

  /* ---------- deterministic randomness ---------- */
  let seed = 1337;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rr = (a, b) => a + rnd() * (b - a);
  const pick = (a) => a[(rnd() * a.length) | 0];
  // subdivide a polygon and wobble the edges so coastlines look natural
  function jag(pts, step, amp) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = Math.max(1, Math.round(L / step));
      const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      for (let k = 0; k < n; k++) {
        const t = k / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
        const j = (Math.sin(x * 0.05 + y * 0.03) + Math.sin(x * 0.013 - y * 0.021) * 1.6 + (rnd() - 0.5) * 0.9) * amp;
        out.push([x + nx * j, y + ny * j]);
      }
    }
    return out;
  }
  const circlePoly = (cx, cy, r, n = 28) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * 6.283) * r * rr(0.85, 1.1), cy + Math.sin((i / n) * 6.283) * r * rr(0.8, 1.05)]);
  const poly = (c, pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };

  /* ---------- geography ---------- */
  const LAND = jag([[300, 0], [2000, 0], [2000, 400], [1890, 520], [1820, 640], [1755, 760], [1712, 880], [1690, 1000], [1640, 1120], [1560, 1230], [1470, 1310], [1380, 1330], [1290, 1290], [1210, 1190], [1150, 1070], [1050, 970], [930, 890], [790, 850], [650, 800], [530, 710], [430, 560], [350, 400], [300, 240], [270, 100]], 12, 5);
  const STRIP = jag([[1808, 715], [1828, 735], [1796, 880], [1766, 1010], [1716, 1150], [1696, 1158], [1742, 1010], [1772, 880]], 8, 1.5);
  const KEYS = Array.from({ length: 10 }, (_, i) => circlePoly(1300 - i * 92, 1352 + Math.sin(i * 0.8) * 12, rr(26, 40), 18).map(([x, y]) => [x, 1352 + Math.sin(i * 0.8) * 12 + (y - 1352 - Math.sin(i * 0.8) * 12) * 0.32]));
  const LAKE = jag(circlePoly(880, 330, 105), 10, 3);
  const SWAMP = jag([[640, 640], [900, 600], [1180, 640], [1300, 760], [1290, 900], [1180, 1000], [1020, 960], [880, 880], [700, 800], [600, 720]], 14, 9);
  const CITIES = [
    { pts: [[1520, 790], [1700, 775], [1700, 1000], [1655, 1120], [1540, 1140], [1495, 1000]], grid: 20 },
    { pts: [[1430, 120], [1760, 120], [1790, 380], [1450, 400]], grid: 22 },
    { pts: [[440, 280], [560, 270], [570, 360], [450, 370]], grid: 18 },
    { pts: [[1735, 780], [1800, 760], [1770, 900], [1725, 900]], grid: 12 },
  ];
  const FIELDS = Array.from({ length: 34 }, () => ({ x: rr(380, 1250), y: rr(60, 560), w: rr(40, 110), h: rr(30, 80), r: rr(-0.25, 0.25), c: pick(['#a7a36a', '#8fa05c', '#b8ad78', '#7f9752', '#9c9a5f']) }));

  /* ---------- road network (also the GPS graph) ---------- */
  const NODES = {
    A: [1752, 955], Q: [1790, 805], R: [1708, 1128], B: [1688, 952], C: [1628, 965], T: [1578, 1040], D: [1600, 1108],
    E: [1586, 860], S: [1532, 820], I: [1600, 650], F: [1625, 480], G: [1610, 300], H: [1585, 205], J: [1150, 615],
    K: [1000, 760], L: [600, 588], W: [500, 330], M: [1440, 1288], N1: [1300, 1350], N2: [1100, 1354], N3: [880, 1362], AP: [1470, 705],
  };
  const ROADS = [
    ['Q', 'A', 'main', 'Ocean Dr'], ['A', 'R', 'main', 'Ocean Dr'], ['A', 'B', 'bridge', 'Murda Cswy'], ['B', 'C', 'main', '105th St'], ['C', 'T', 'main', 'Rap Up Blvd'],
    ['T', 'D', 'main', 'Rap Up Blvd'], ['C', 'E', 'main', 'Flatbush Ave'], ['E', 'S', 'main', 'Port Blvd'], ['E', 'I', 'hwy', 'I-95'], ['I', 'F', 'hwy', 'I-95'],
    ['F', 'G', 'hwy', 'I-95'], ['G', 'H', 'hwy', 'I-95'], ['D', 'M', 'hwy', 'US-1'], ['M', 'N1', 'bridge', 'Overseas Hwy'], ['N1', 'N2', 'bridge', 'Overseas Hwy'],
    ['N2', 'N3', 'bridge', 'Overseas Hwy'], ['I', 'J', 'hwy', 'Gator Alley'], ['J', 'L', 'hwy', 'Gator Alley'], ['L', 'W', 'main', 'Palmetto Rd'],
    ['J', 'K', 'main', 'Glades Rd'], ['S', 'AP', 'main', 'Airport Rd'], ['AP', 'I', 'main', 'Airport Rd'], ['Q', 'E', 'bridge', 'Venetian Cswy'], ['R', 'D', 'bridge', 'Rickenbacker Cswy'],
  ];
  const adj = {};
  for (const [a, b] of ROADS) { const d = Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]); (adj[a] ||= []).push([b, d]); (adj[b] ||= []).push([a, d]); }
  function route(from, to) {
    const dist = { [from]: 0 }, prev = {}, todo = new Set(Object.keys(NODES));
    while (todo.size) {
      let u = null; for (const n of todo) if (dist[n] !== undefined && (u === null || dist[n] < dist[u])) u = n;
      if (u === null || u === to) break; todo.delete(u);
      for (const [v, d] of adj[u] || []) if (dist[u] + d < (dist[v] ?? Infinity)) { dist[v] = dist[u] + d; prev[v] = u; }
    }
    const p = []; for (let n = to; n; n = prev[n]) p.unshift(n);
    return p[0] === from ? { nodes: p, len: dist[to] } : null;
  }

  const PLAYER = 'A';
  const BLIPS = [
    { id: 'studio', node: 'C', c: '#ff2e88', g: 'M', t: "Murda's Spot", z: 'LITTLE BROOKLYN', d: "Murda's safehouse. The coupe sleeps here, the notebook doesn't." },
    { id: 'strip', node: 'R', c: '#12e0c4', g: '☀', t: 'Ocean Strip', z: 'OCEAN STRIP', d: 'Neon hotels, beach traffic and the boardwalk. This is where you spawn in Free Roam.' },
    { id: 'glades', node: 'K', c: '#7ce38b', g: '🐊', t: 'Gator Glades', z: 'GATOR GLADES', d: 'Swamp country. The call-in line gets its strangest calls from out here.' },
    { id: 'brooklyn', node: 'H', c: '#ffd23f', g: '★', t: 'Little Brooklyn', z: 'LITTLE BROOKLYN', d: 'A piece of home down south. The Rap Up notebook is rumored to be stashed here.' },
    { id: 'club', node: 'T', c: '#b57bff', g: '♪', t: 'Club 105', z: 'VICE CITY', d: 'After-hours spot. Night Drive radio broadcasts live from the rooftop.' },
    { id: 'keys', node: 'N2', c: '#ff8a1f', g: '☎', t: 'The Keys Payphone', z: 'THE KEYS', d: 'Last known location of Caller #7. Police are still looking.' },
    { id: 'air', node: 'AP', c: '#9fd6ff', g: '✈', t: 'Leonida International', z: 'AIRPORT', d: 'Where Murda landed with a mic, a chain and a grudge.' },
    { id: 'port', node: 'S', c: '#ff5a5a', g: '⚓', t: 'Port of Vice', z: 'PORT', d: 'Shipping containers, cranes, and nobody asking questions.' },
  ];
  const LABELS = [
    { t: 'LITTLE BROOKLYN', x: 1605, y: 255, s: 26, min: 0 }, { t: 'VICE CITY', x: 1600, y: 950, s: 34, min: 0 },
    { t: 'OCEAN STRIP', x: 1790, y: 960, s: 18, min: 0.55, rot: -1.37 }, { t: 'GATOR GLADES', x: 960, y: 800, s: 30, min: 0 },
    { t: 'LAKE LEONIDA', x: 880, y: 335, s: 18, min: 0.4, col: '#bfe6ff' }, { t: 'PALMETTO FLATS', x: 700, y: 470, s: 22, min: 0.35 },
    { t: 'THE KEYS', x: 1080, y: 1392, s: 20, min: 0.35 }, { t: 'PORT GATOR', x: 505, y: 255, s: 16, min: 0.6 },
    { t: 'ATLANTIC OCEAN', x: 1900, y: 1150, s: 22, min: 0, col: '#8fc6e6', it: true }, { t: 'GULF OF LEONIDA', x: 520, y: 1100, s: 26, min: 0, col: '#8fc6e6', it: true },
  ];

  /* ---------- pre-render terrain ---------- */
  const T = document.createElement('canvas'); T.width = WW * PS; T.height = WH * PS;
  const t = T.getContext('2d'); t.scale(PS, PS);
  // ocean
  let g = t.createLinearGradient(0, 0, WW, WH); g.addColorStop(0, '#174f72'); g.addColorStop(0.55, '#0f3a5c'); g.addColorStop(1, '#082a46');
  t.fillStyle = g; t.fillRect(0, 0, WW, WH);
  for (let i = 0; i < 2600; i++) { t.strokeStyle = `rgba(160,210,240,${rr(0.02, 0.07)})`; t.lineWidth = rr(0.6, 1.6); const x = rr(0, WW), y = rr(0, WH), l = rr(6, 22); t.beginPath(); t.moveTo(x, y); t.quadraticCurveTo(x + l / 2, y - 2, x + l, y); t.stroke(); }
  // shallows glow
  const shallow = (pts, blur) => { t.save(); t.shadowColor = '#4fb4cc'; t.shadowBlur = blur * PS; t.fillStyle = '#3d93ad'; for (let k = 0; k < 3; k++) { poly(t, pts); t.fill(); } t.restore(); };
  shallow(LAND, 50); shallow(STRIP, 26); KEYS.forEach((k) => shallow(k, 18));
  // land base + texture
  const landFill = (pts) => {
    t.save(); poly(t, pts); t.clip();
    t.fillStyle = '#7b8d57'; t.fillRect(0, 0, WW, WH);
    for (let i = 0; i < 2600; i++) { t.fillStyle = pick(['#6d8250', '#8a9a62', '#5d7243', '#98a36c', '#a29b6f', '#728a4e']); t.globalAlpha = rr(0.18, 0.4); t.beginPath(); t.arc(rr(0, WW), rr(0, WH), rr(5, 36), 0, 6.3); t.fill(); }
    t.globalAlpha = 1; t.restore();
  };
  landFill(LAND); landFill(STRIP); KEYS.forEach(landFill);
  // farmland
  t.save(); poly(t, LAND); t.clip();
  for (const f of FIELDS) {
    t.save(); t.translate(f.x, f.y); t.rotate(f.r); t.fillStyle = f.c; t.globalAlpha = 0.75; t.fillRect(0, 0, f.w, f.h);
    t.strokeStyle = 'rgba(60,60,30,.25)'; t.lineWidth = 0.8; for (let s = 4; s < f.w; s += 5) { t.beginPath(); t.moveTo(s, 0); t.lineTo(s, f.h); t.stroke(); }
    t.restore();
  }
  t.globalAlpha = 1;
  // swamp
  poly(t, SWAMP); t.fillStyle = 'rgba(64,96,56,.92)'; t.fill();
  t.save(); poly(t, SWAMP); t.clip();
  for (let i = 0; i < 900; i++) { t.fillStyle = pick(['#3b5a33', '#4f7444', '#36522f']); t.globalAlpha = 0.5; t.beginPath(); t.arc(rr(560, 1320), rr(580, 1020), rr(3, 16), 0, 6.3); t.fill(); }
  t.globalAlpha = 1;
  for (let i = 0; i < 260; i++) { t.fillStyle = 'rgba(52,118,120,.85)'; t.beginPath(); t.ellipse(rr(600, 1300), rr(600, 1000), rr(2, 9), rr(1.5, 5), rr(0, 3), 0, 6.3); t.fill(); }
  for (let i = 0; i < 26; i++) {
    t.strokeStyle = 'rgba(46,112,118,.9)'; t.lineWidth = rr(1.2, 3.2); let x = rr(640, 1260), y = rr(620, 680);
    t.beginPath(); t.moveTo(x, y); for (let s = 0; s < 8; s++) { const nx = x + rr(-30, 30), ny = y + rr(25, 50); t.quadraticCurveTo(x + rr(-25, 25), (y + ny) / 2, nx, ny); x = nx; y = ny; } t.stroke();
  }
  t.restore();
  // lake
  t.save(); t.shadowColor = '#5cb6cf'; t.shadowBlur = 14 * PS; poly(t, LAKE); t.fillStyle = '#2b6d8c'; t.fill(); t.restore();
  // beaches
  const beach = (pts, w) => { t.save(); t.lineJoin = 'round'; t.strokeStyle = '#e8d4a0'; t.lineWidth = w; poly(t, pts); t.stroke(); t.restore(); };
  beach(LAND, 5); beach(STRIP, 4); KEYS.forEach((k) => beach(k, 3));
  // cities: blocks + streets
  for (const c of CITIES) {
    const P = jag(c.pts, 20, 2);
    t.save(); poly(t, P); t.clip();
    t.fillStyle = '#6f7178'; t.fillRect(0, 0, WW, WH);
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    for (let x = Math.min(...xs); x < Math.max(...xs); x += c.grid) for (let y = Math.min(...ys); y < Math.max(...ys); y += c.grid) {
      const park = rnd() < 0.07;
      t.fillStyle = park ? '#5f8c4c' : pick(['#8c8e95', '#999ba2', '#7e8088', '#a3a39c', '#8a8379']);
      t.fillRect(x + 2.2, y + 2.2, c.grid - 4.4, c.grid - 4.4);
      if (!park && rnd() < 0.5) { t.fillStyle = 'rgba(0,0,0,.18)'; t.fillRect(x + 2.2 + rr(1, 6), y + 2.2 + rr(1, 6), rr(3, 8), rr(3, 8)); }
      if (park) for (let k = 0; k < 4; k++) { t.fillStyle = '#4b7a3c'; t.beginPath(); t.arc(x + rr(4, c.grid - 4), y + rr(4, c.grid - 4), 1.8, 0, 6.3); t.fill(); }
    }
    t.restore();
    t.strokeStyle = 'rgba(30,30,34,.5)'; t.lineWidth = 1.2; poly(t, P); t.stroke();
  }
  // airport runways
  t.save(); t.translate(1470, 720); t.rotate(-0.35);
  t.fillStyle = '#9aa08a'; t.fillRect(-70, -40, 140, 80);
  t.fillStyle = '#3a3b40'; t.fillRect(-64, -24, 128, 9); t.fillRect(-64, 14, 128, 9);
  t.strokeStyle = '#fff'; t.setLineDash([4, 4]); t.lineWidth = 0.8; t.beginPath(); t.moveTo(-60, -19.5); t.lineTo(60, -19.5); t.moveTo(-60, 18.5); t.lineTo(60, 18.5); t.stroke(); t.setLineDash([]);
  t.restore();
  // port containers
  for (let i = 0; i < 70; i++) { t.fillStyle = pick(['#c0392b', '#2e86c1', '#f39c12', '#16a085', '#8e44ad']); t.fillRect(1505 + (i % 10) * 5, 800 + ((i / 10) | 0) * 3.4, 4, 2.4); }
  // roads (dark casing, then fill)
  const STYLE = { hwy: [9, '#151515', 5.2, '#f2c230'], main: [6, '#262626', 3.4, '#ece8dc'], bridge: [6.5, '#2b2b2b', 3.2, '#d9d6cc'] };
  for (const pass of [0, 1]) for (const [a, b, type] of ROADS) {
    const s = STYLE[type]; t.lineCap = 'round'; t.strokeStyle = pass ? s[3] : s[1]; t.lineWidth = pass ? s[2] : s[0];
    t.beginPath(); t.moveTo(...NODES[a]); t.lineTo(...NODES[b]); t.stroke();
  }
  // subtle relief shading + vignette baked in
  g = t.createRadialGradient(WW * 0.6, WH * 0.45, 200, WW * 0.6, WH * 0.45, 1500); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
  t.fillStyle = g; t.fillRect(0, 0, WW, WH);

  /* ---------- clouds (drift over the map) ---------- */
  const CLOUDS = Array.from({ length: 9 }, () => ({ x: rr(0, WW), y: rr(0, WH), r: rr(70, 170), s: rr(4, 9) }));

  /* ---------- view + interaction ---------- */
  const view = { x: 1500, y: 900, z: 1, tz: 1, tx: 1500, ty: 900 };
  let W = 0, H = 0, dpr = 1, fit = 1;
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = stage.clientWidth; H = stage.clientHeight;
    if (!W || !H) return;
    cv.width = W * dpr; cv.height = H * dpr;
    fit = Math.min(W / WW, H / WH) * 1.02;
    if (!view.init) { view.z = view.tz = fit * 2.2; view.init = true; }
    clampView();
  }
  const minZ = () => fit, maxZ = () => fit * 7;
  function clampView() {
    view.tz = Math.min(maxZ(), Math.max(minZ(), view.tz));
    const hw = W / 2 / view.tz, hh = H / 2 / view.tz;
    view.tx = hw * 2 >= WW ? WW / 2 : Math.min(WW - hw, Math.max(hw, view.tx));
    view.ty = hh * 2 >= WH ? WH / 2 : Math.min(WH - hh, Math.max(hh, view.ty));
  }
  const toScreen = (x, y) => [(x - view.x) * view.z + W / 2, (y - view.y) * view.z + H / 2];
  const toWorld = (sx, sy) => [(sx - W / 2) / view.z + view.x, (sy - H / 2) / view.z + view.y];
  function zoomAt(f, sx = W / 2, sy = H / 2) {
    const [wx, wy] = toWorld(sx, sy);
    view.tz *= f; clampView();
    view.tx = wx - (sx - W / 2) / view.tz; view.ty = wy - (sy - H / 2) / view.tz; clampView();
  }
  const pointers = new Map(); let dragged = false, pinch = 0;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.offsetX, e.offsetY]); dragged = false; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  cv.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (prev) {
      const dx = e.offsetX - prev[0], dy = e.offsetY - prev[1];
      pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (pointers.size === 1) { if (Math.abs(dx) + Math.abs(dy) > 1) dragged = true; view.tx -= dx / view.z; view.ty -= dy / view.z; view.x = view.tx; view.y = view.ty; clampView(); }
      else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoomAt(d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch = d; dragged = true; }
    }
    hover = hitBlip(e.offsetX, e.offsetY);
    cv.style.cursor = hover ? 'pointer' : prev ? 'grabbing' : 'grab';
    if (hover) { tip.hidden = false; tip.textContent = hover.t; tip.style.left = e.offsetX + 14 + 'px'; tip.style.top = e.offsetY - 10 + 'px'; } else tip.hidden = true;
  });
  const up = (e) => {
    const wasDrag = dragged; pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0;
    if (!wasDrag && e.type === 'pointerup') { const b = hitBlip(e.offsetX, e.offsetY); if (b) select(b, true); }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { tip.hidden = true; hover = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });
  cv.addEventListener('dblclick', (e) => zoomAt(1.8, e.offsetX, e.offsetY));
  stage.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => zoomAt(b.dataset.z > 0 ? 1.5 : 1 / 1.5)));
  stage.querySelector('[data-home]').onclick = () => { const p = NODES[PLAYER]; view.tz = fit * 2.6; view.tx = p[0]; view.ty = p[1]; clampView(); };
  stage.querySelector('[data-fs]').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else stage.requestFullscreen?.(); };
  document.addEventListener('fullscreenchange', () => setTimeout(resize, 50));
  addEventListener('resize', resize);
  new ResizeObserver(resize).observe(stage);

  /* ---------- selection / waypoint ---------- */
  let hover = null, selected = null, path = null, routeT = 0;
  function hitBlip(sx, sy) {
    for (const b of BLIPS) { const [x, y] = toScreen(...NODES[b.node]); if (Math.hypot(sx - x, sy - y) < 18) return b; }
    return null;
  }
  function select(b, focus) {
    selected = b; routeT = 0;
    path = route(PLAYER, b.node);
    const miles = path ? (path.len * 0.04).toFixed(1) : '—';
    info.innerHTML = `<small>WAYPOINT SET</small><h3>${b.t}</h3><div class="mi-meta"><span>${b.z}</span><span>${miles} MI</span></div><p>${b.d}</p>`;
    info.style.borderLeftColor = b.c;
    document.getElementById('mapZone').textContent = b.z;
    legend.querySelectorAll('span').forEach((s) => s.classList.toggle('on', s.dataset.id === b.id));
    if (focus && path) {
      const pts = path.nodes.map((n) => NODES[n]), xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const bw = Math.max(...xs) - Math.min(...xs) + 220, bh = Math.max(...ys) - Math.min(...ys) + 220;
      view.tz = Math.min(maxZ(), Math.max(minZ(), Math.min(W / bw, H / bh)));
      view.tx = (Math.max(...xs) + Math.min(...xs)) / 2; view.ty = (Math.max(...ys) + Math.min(...ys)) / 2; clampView();
    }
  }
  legend.innerHTML = '';
  BLIPS.forEach((b) => {
    const s = document.createElement('span'); s.dataset.id = b.id;
    s.innerHTML = `<i style="background:${b.c}">${b.g}</i>${b.t}`;
    s.onclick = () => select(b, true);
    legend.appendChild(s);
  });

  /* ---------- draw loop ---------- */
  let visible = false, last = performance.now(), time = 0;
  new IntersectionObserver((e) => (visible = e[0].isIntersecting)).observe(stage);
  function label(txt, x, y, size, col = '#fff', rot = 0, italic = false) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.font = `${italic ? 'italic ' : ''}${size}px "Bebas Neue", Impact, sans-serif`;
    ctx.letterSpacing = size * 0.12 + 'px';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, size * 0.16); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(txt, 0, 0);
    ctx.fillStyle = col; ctx.fillText(txt, 0, 0); ctx.restore();
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    if (!visible || !W) return;
    const k = 1 - Math.exp(-dt * 10);
    view.x += (view.tx - view.x) * k; view.y += (view.ty - view.y) * k; view.z += (view.tz - view.z) * k;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#082a46'; ctx.fillRect(0, 0, W, H);
    // terrain
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(view.z, view.z); ctx.translate(-view.x, -view.y);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(T, 0, 0, WW, WH);
    // drifting cloud shadows + clouds
    for (const c of CLOUDS) {
      const x = ((c.x + time * c.s) % (WW + 400)) - 200;
      let gr = ctx.createRadialGradient(x + 40, c.y + 50, 0, x + 40, c.y + 50, c.r); gr.addColorStop(0, 'rgba(0,0,0,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x + 40, c.y + 50, c.r, 0, 6.3); ctx.fill();
      gr = ctx.createRadialGradient(x, c.y, 0, x, c.y, c.r); gr.addColorStop(0, 'rgba(255,255,255,.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, c.y, c.r, 0, 6.3); ctx.fill();
    }
    ctx.restore();
    // street names when zoomed in
    if (view.z > fit * 3.2) {
      const seen = new Set();
      for (const [a, b, , name] of ROADS) {
        if (seen.has(name)) continue; seen.add(name);
        const [x1, y1] = toScreen(...NODES[a]), [x2, y2] = toScreen(...NODES[b]);
        let ang = Math.atan2(y2 - y1, x2 - x1); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        ctx.save(); ctx.translate((x1 + x2) / 2, (y1 + y2) / 2); ctx.rotate(ang);
        ctx.font = '600 11px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(name.toUpperCase(), 0, -9); ctx.fillStyle = '#fff'; ctx.fillText(name.toUpperCase(), 0, -9);
        ctx.restore();
      }
    }
    // GPS route
    if (path) {
      routeT = Math.min(1, routeT + dt * 1.6);
      const pts = path.nodes.map((n) => toScreen(...NODES[n]));
      ctx.save(); ctx.lineCap = ctx.lineJoin = 'round';
      const total = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
      ctx.setLineDash([total * routeT, total]);
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 10; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.stroke();
      ctx.strokeStyle = '#c13cff'; ctx.lineWidth = 6; ctx.stroke();
      if (routeT >= 1) { ctx.setLineDash([2, 16]); ctx.lineDashOffset = -time * 40; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.5; ctx.stroke(); }
      ctx.restore();
    }
    // region labels
    for (const l of LABELS) {
      if (view.z < fit * (1 + l.min * 2)) continue;
      const [x, y] = toScreen(l.x, l.y);
      label(l.t, x, y, Math.min(l.s * 1.5, l.s * (0.7 + view.z / fit * 0.12)), l.col, l.rot || 0, l.it);
    }
    // blips
    for (const b of BLIPS) {
      const [x, y] = toScreen(...NODES[b.node]);
      if (b === selected) {
        const p = (time * 1.2) % 1;
        ctx.strokeStyle = b.c; ctx.globalAlpha = 1 - p; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 14 + p * 22, 0, 6.3); ctx.stroke(); ctx.globalAlpha = 1;
      }
      const r = b === hover || b === selected ? 15 : 12;
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(x + 2, y + 3, r, 0, 6.3); ctx.fill();
      ctx.fillStyle = b.c; ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#000'; ctx.font = `${r}px Anton, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.g, x, y + 1);
    }
    // player arrow
    {
      const [x, y] = toScreen(...NODES[PLAYER]);
      const p = (time * 0.8) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - p)})`; ctx.beginPath(); ctx.arc(x, y, 8 + p * 26, 0, 6.3); ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.25);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(10, 11); ctx.lineTo(0, 5); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    // scale readout
    document.getElementById('mapScale').textContent = `${Math.max(0.5, Math.round((100 / view.z) * 0.04 * 2) / 2)} MI`;
  }
  resize();
  select(BLIPS[0], false);
  requestAnimationFrame(frame);
})();
