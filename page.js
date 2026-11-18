/* Shared data + non-3D page behaviour. Loaded before game.js. */
// Full video release: 24 hours after this build (2026-11-17T19:22:00Z). Change this to move the drop.
window.RELEASE_AT = Date.parse('2026-11-17T19:22:00Z');
window.countdownText = function () {
  const ms = window.RELEASE_AT - Date.now();
  if (ms <= 0) return 'AVAILABLE NOW';
  const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
};
setInterval(function tick() {
  const txt = window.countdownText();
  document.querySelectorAll('.countdown').forEach((el) => (el.textContent = txt));
  return tick;
}(), 1000);
window.STATIONS = [
  { name: 'MURDA FM', freq: '98.6', color: '#ff2e88', bpm: 90, root: 55, song: 'Uncle Murda — Little Brooklyn Exclusive' },
  { name: 'VICE BEACH FM', freq: '98.3', color: '#12e0c4', bpm: 102, root: 61.7, song: 'Neon Tide — Sunset Mix' },
  { name: 'BROOKLYN 2 LEONIDA', freq: '101.1', color: '#ffd23f', bpm: 86, root: 49, song: 'Flatbush Freestyle' },
  { name: 'GATOR TALK', freq: '88.7', color: '#ff8a1f', bpm: 76, root: 46.2, song: 'Swamp Callers Hour' },
  { name: 'NIGHT DRIVE', freq: '92.5', color: '#b57bff', bpm: 112, root: 65.4, song: 'Ocean Strip After Dark' },
];

window.EPISODES = [
  { t: 'Welcome To Leonida', d: 'Murda touches down in Vice City', guest: 'LIL GATOR', lines: [
    ['H', 'Ayo! We live from Leonida, baby. Real Report, episode one.'],
    ['G', 'Unc, you really moved the whole pod down to Vice City?'],
    ['H', 'Brooklyn came down south. The weather finally matches my temper.'],
    ['G', 'Man, it was a gator in the parking lot when I pulled up.'],
    ['H', "That's security. He on payroll."],
    ['G', "Hahaha, you can't be serious."],
    ['H', "That's all y'all getting for now. The rest of the pod drops in 12 hours. Don't play with me."],
  ] },
  { t: 'The Rap Up: Vice City Edition', d: 'Nobody is safe. Nobody.', guest: 'DJ PALMS', lines: [
    ['H', 'You know what time it is.'],
    ['G', 'Oh no. Not the list. Not on my show day.'],
    ['H', 'Rap Up season. I got names. I got receipts. I got a whole notebook.'],
    ['G', 'Am I on there, Unc?'],
    ['H', "You sitting at my table. You safe... for now."],
    ['G', "I'm not saying nothing else the whole episode."],
    ['H', "That's all y'all getting for now. The rest of the pod drops in 12 hours. Don't play with me."],
  ] },
  { t: 'Call-In Chaos', d: "Leonida's wildest phone in", guest: 'CALLER #7', lines: [
    ['H', "Caller, you're on the Real Report. Speak!"],
    ['G', "Yo Unc! I'm on the highway, three cop cars behind me!"],
    ['H', 'Then why you calling a podcast?!'],
    ['G', 'I need a song for the chase, man!'],
    ['H', 'Say less. DJ, run it back. Turn the beat UP.'],
    ['G', "LET'S GOOOO —  *line disconnects*"],
    ['H', "That's all y'all getting for now. The rest of the pod drops in 12 hours. Don't play with me."],
  ] },
  { t: 'Beach Beef', d: 'Drama on the Ocean Strip boardwalk', guest: 'JET SKI JAY', lines: [
    ['H', 'So I\'m on the boardwalk, minding my business...'],
    ['G', 'That was me on the jet ski. I was just waving!'],
    ['H', 'You was not waving. That was a gesture.'],
    ['G', "It's the ocean, Unc! It's choppy out there!"],
    ['H', 'We gon\' address it. Right now. On camera.'],
    ['G', 'Can we at least turn the mics down a little?'],
    ['H', "That's all y'all getting for now. The rest of the pod drops in 12 hours. Don't play with me."],
  ] },
  { t: 'Five Stars Freestyle', d: 'Live bars with a wanted level', guest: 'BIG HEAT', lines: [
    ['H', 'Helicopters outside the studio. That\'s just marketing.'],
    ['G', 'Bro, that spotlight is pointed directly at us.'],
    ['H', "Then let's give 'em a show. Beat. Now."],
    ['G', 'He really freestyling with five stars on him...'],
    ['H', 'Five stars and I ain\'t even left the booth.'],
    ['G', 'Legend. Certified Leonida legend.'],
    ['H', "That's all y'all getting for now. The rest of the pod drops in 12 hours. Don't play with me."],
  ] },
];

/* ---------- Loader tips + fallback if 3D fails ---------- */
(function () {
  const tips = [
    'NEW PLAYABLE CHARACTER: UNCLE MURDA.',
    "TIP: Murda doesn't do retakes.",
    'TIP: Press Q while driving to flip radio stations.',
    'TIP: The gator in the parking lot is on payroll. Do not feed him.',
    'TIP: Being on the Rap Up list lowers your Respect. Permanently.',
    'TIP: Press C to switch cameras. Tune to Murda FM 98.6 for the exclusives.',
  ];
  let i = 0;
  const el = document.getElementById('ldTip');
  setInterval(() => { i = (i + 1) % tips.length; el.textContent = tips[i]; }, 3200);
  document.body.classList.add('locked');
  setTimeout(() => {
    if (window.__gameReady) return;
    document.getElementById('ldStatus').textContent = '3D OFFLINE';
    document.body.classList.add('no-webgl');
    const b = document.getElementById('startBtn');
    b.hidden = false; b.textContent = 'ENTER SITE';
    b.onclick = () => { document.getElementById('loader').classList.add('out'); document.body.classList.remove('locked'); };
  }, 20000);
})();


/* ---------- Pause menu ---------- */
(function () {
  const tabs = [...document.querySelectorAll('.pm-tabs button')];
  const openTab = (name) => {
    tabs.forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    document.querySelectorAll('.pm-pane').forEach((p) => p.classList.toggle('on', p.id === 'pane-' + name));
    if (name === 'stats') fillStats();
  };
  tabs.forEach((b) => (b.onclick = () => openTab(b.dataset.tab)));
  document.querySelectorAll('[data-open-tab]').forEach((a) => a.addEventListener('click', () => openTab(a.dataset.openTab)));

  // Missions
  const missions = [
    { t: 'Welcome To Leonida', s: 'COMPLETE', o: 'Pick up the coupe at Vice City International.', d: 'Murda lands in Vice City with a chain, a notebook full of names and no plan to blend in. His coupe is waiting in long-term parking. So is a gator.', r: ['$25,000', '+10 RESPECT'] },
    { t: 'Little Brooklyn', s: 'COMPLETE', o: 'Take over the block on Flatbush Ave.', d: 'Somebody in Vice City named a whole neighbourhood after home. Murda shows up to see if they deserve it.', r: ['$40,000', '+25 RESPECT'] },
    { t: 'The Rap Up', s: 'ACTIVE', o: 'Recover the notebook before it leaks.', d: 'The notebook with every name Murda plans to call out went missing on the flight down. Get it back before the whole city reads it.', r: ['$60,000', '+30 RESPECT'] },
    { t: 'Ocean Strip Run', s: 'LOCKED', o: 'Outrun three cruisers down the Ocean Strip.', d: 'A matte-black coupe at 140 mph on the beach road tends to get attention. Lose the heat before you reach the causeway.', r: ['$35,000', '+20 RESPECT'] },
    { t: 'Five Stars In The Booth', s: 'LOCKED', o: 'Finish the Murda FM session with a 5-star wanted level.', d: 'Choppers circling the station, cruisers on the block. Perfect time to go live. Stay on air until the last bar.', r: ['$100,000', '+50 RESPECT'] },
  ];
  const ml = document.getElementById('mlist'), md = document.getElementById('mdetail');
  const showM = (i) => {
    [...ml.children].forEach((li, j) => li.classList.toggle('on', i === j));
    const m = missions[i];
    md.innerHTML = `<h3>${m.t}</h3><div class="obj">▸ ${m.o}</div><p>${m.d}</p><div class="reward"><div><small>CASH</small><b>${m.r[0]}</b></div><div><small>RESPECT</small><b>${m.r[1]}</b></div><div><small>STATUS</small><b style="color:${m.s === 'COMPLETE' ? '#7ce38b' : m.s === 'ACTIVE' ? '#ffd23f' : '#888'}">${m.s}</b></div></div><div class="num">0${i + 1}</div>`;
  };
  missions.forEach((m, i) => { const li = document.createElement('li'); li.innerHTML = `${m.t}<small>${m.s}</small>`; li.onclick = () => showM(i); ml.appendChild(li); });
  showM(2);

  // Radio stations
  const sl = document.getElementById('stlist');
  window.STATIONS.forEach((s, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<i style="background:${s.color}">${s.freq}</i><div>${s.name}<small>${s.song}</small></div>`;
    li.onclick = () => window.dispatchEvent(new CustomEvent('murda:station', { detail: i }));
    sl.appendChild(li);
  });

  // Stats
  const stats = [['Bars', 99], ['Flow', 92], ['Disrespect', 100], ['Driving', 71], ['Stealth', 8], ['Patience', 4], ['Street Cred', 100], ['Lung Capacity', 86], ['Gator Diplomacy', 38], ['Rap Up Accuracy', 97]];
  const st = document.getElementById('stats');
  stats.forEach(([n, v]) => {
    st.insertAdjacentHTML('beforeend', `<div class="stat"><div class="stat-top">${n}<span>${v}%</span></div><div class="segs" data-v="${v}">${'<i><b></b></i>'.repeat(5)}</div></div>`);
  });
  let filled = false;
  function fillStats() {
    if (filled) return; filled = true;
    st.querySelectorAll('.segs').forEach((s) => {
      const v = +s.dataset.v;
      [...s.children].forEach((seg, k) => { const f = Math.max(0, Math.min(1, (v - k * 20) / 20)); setTimeout(() => (seg.firstChild.style.width = f * 100 + '%'), k * 90); });
    });
  }
})();


/* ---------- big countdown boxes, local release time, calendar reminder ---------- */
(function () {
  const pad = (n) => String(n).padStart(2, '0');
  function tick() {
    const ms = Math.max(0, window.RELEASE_AT - Date.now()), t = Math.floor(ms / 1000);
    const v = { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
    document.querySelectorAll('[data-cd]').forEach((el) => (el.textContent = pad(v[el.dataset.cd])));
    if (ms <= 0) document.body.classList.add('released');
  }
  tick(); setInterval(tick, 1000);
  const when = new Date(window.RELEASE_AT);
  const el = document.getElementById('releaseLocal');
  if (el) el.textContent = when.toLocaleString([], { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const btn = document.getElementById('remindBtn');
  if (btn) btn.onclick = () => {
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Real Report Radio//Countdown//EN', 'BEGIN:VEVENT',
      'UID:real-report-full-video-' + window.RELEASE_AT + '@murdaradio', 'DTSTAMP:' + stamp(Date.now()),
      'DTSTART:' + stamp(window.RELEASE_AT), 'DTEND:' + stamp(window.RELEASE_AT + 3600e3),
      'SUMMARY:The Real Report — full uncut video drops', 'DESCRIPTION:The podcast got cut short. The full uncut video is out now.',
      'URL:https://x.com/KillaKreww/status/2120928826079514634',
      'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'DESCRIPTION:Real Report full video drops in 10 minutes', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'real-report-full-video.ics'; a.click();
    btn.textContent = '✔ Reminder Saved';
  };
})();

/* ---------- turn photos into loading-screen art (cel shading + ink outlines + cut-out) ---------- */
window.murdaArt = function (src, poly, base, done) {
  const img = new Image();
  img.onload = () => {
    const S = 2, W = base * S;
    const c = document.createElement('canvas'); c.width = c.height = W; const x = c.getContext('2d');
    x.drawImage(img, 0, 0, W, W);
    const id = x.getImageData(0, 0, W, W), d = id.data;
    const bc = document.createElement('canvas'); bc.width = bc.height = W; const bx = bc.getContext('2d');
    bx.filter = 'blur(2.2px)'; bx.drawImage(img, 0, 0, W, W);
    const bd = bx.getImageData(0, 0, W, W).data, L = new Float32Array(W * W);
    for (let i = 0; i < W * W; i++) L[i] = (0.299 * bd[i * 4] + 0.587 * bd[i * 4 + 1] + 0.114 * bd[i * 4 + 2]) / 255;
    for (let i = 0; i < W * W; i++) {
      let r = bd[i * 4] / 255, g = bd[i * 4 + 1] / 255, b = bd[i * 4 + 2] / 255;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const q = Math.max(0.05, Math.floor(l * 7 + 0.42) / 7);              // flat cel bands
      const ratio = Math.min(3, q / (l + 1e-4)); r *= ratio; g *= ratio; b *= ratio;
      const m = (r + g + b) / 3; r = m + (r - m) * 1.6; g = m + (g - m) * 1.6; b = m + (b - m) * 1.6;
      const mid = Math.max(0, 1 - Math.abs(q - 0.35) * 2.5);
      r *= 1 + 0.14 * mid; g *= 1 + 0.03 * mid; b *= 1 - 0.12 * mid;
      r += (1 - q) * 0.02; b += (1 - q) * 0.05;
      const px = i % W, py = (i / W) | 0;
      if (px > 0 && py > 0 && px < W - 1 && py < W - 1) {
        const gx = -L[i - W - 1] - 2 * L[i - 1] - L[i + W - 1] + L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1];
        const gy = -L[i - W - 1] - 2 * L[i - W] - L[i - W + 1] + L[i + W - 1] + 2 * L[i + W] + L[i + W + 1];
        const f = Math.min(1, Math.max(0, (Math.hypot(gx, gy) - 0.16) / 0.12));
        r = r * (1 - f) + 0.05 * f; g = g * (1 - f) + 0.03 * f; b = b * (1 - f) + 0.07 * f;
      }
      d[i * 4] = Math.min(255, r * 255); d[i * 4 + 1] = Math.min(255, g * 255); d[i * 4 + 2] = Math.min(255, b * 255);
    }
    x.putImageData(id, 0, 0);
    const mask = document.createElement('canvas'); mask.width = mask.height = W; const mk = mask.getContext('2d');
    mk.filter = 'blur(1.5px)'; mk.fillStyle = '#fff'; mk.beginPath();
    poly.forEach(([px, py], i) => (i ? mk.lineTo(px * S, py * S) : mk.moveTo(px * S, py * S))); mk.closePath(); mk.fill();
    x.globalCompositeOperation = 'destination-in'; x.drawImage(mask, 0, 0);
    done(c.toDataURL('image/png'));
  };
  img.src = src;
};
(function () {
  // photo A: white tee, brick wall. photo B: black cap + tinted glasses.
  const POLY_A = [[205, 8], [240, 12], [268, 30], [280, 60], [284, 100], [293, 118], [298, 140], [293, 172], [283, 190], [274, 222], [268, 238], [300, 248], [350, 262], [400, 282], [447, 318], [447, 447], [0, 447], [0, 318], [40, 282], [90, 258], [140, 240], [140, 222], [131, 192], [120, 175], [116, 140], [121, 118], [128, 110], [128, 70], [140, 38], [165, 16]];
  const POLY_B = [[150, 40], [200, 22], [262, 19], [322, 28], [366, 58], [381, 108], [388, 166], [398, 202], [389, 214], [390, 248], [395, 262], [391, 300], [384, 330], [381, 352], [394, 382], [420, 420], [440, 468], [452, 500], [0, 500], [0, 432], [58, 388], [100, 372], [118, 348], [104, 330], [92, 300], [87, 262], [95, 245], [109, 240], [107, 200], [111, 150], [120, 96]];
  window.murdaArt('assets/murda-photo.png', POLY_A, 447, (url) => document.querySelectorAll('img.gta-art:not([data-photo="b"])').forEach((el) => (el.src = url)));
  window.murdaArt('assets/murda-photo-2.png', POLY_B, 500, (url) => document.querySelectorAll('img.gta-art[data-photo="b"]').forEach((el) => (el.src = url)));
})();

/* ---------- contract address: tap any CA element to copy ---------- */
(function () {
  const CA = '3bFzGq4JgrQHB93Ve18hhB6ioCJgnCYZEc9rWHczpump';
  async function copy(el) {
    try { await navigator.clipboard.writeText(CA); }
    catch { const t = document.createElement('textarea'); t.value = CA; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    el.classList.add('copied');
    el.querySelectorAll('.ca-copy').forEach((c) => { c.dataset.label ||= c.textContent; c.textContent = 'COPIED ✓'; });
    setTimeout(() => { el.classList.remove('copied'); el.querySelectorAll('.ca-copy').forEach((c) => (c.textContent = c.dataset.label)); }, 1600);
  }
  document.querySelectorAll('[data-copy-ca]').forEach((el) => el.addEventListener('click', () => copy(el)));
})();

/* show the pinned CA bar whenever the main CA panel is off screen */
(function () {
  const panel = document.querySelector('.ca-bar');
  if (!panel || !('IntersectionObserver' in window)) return;
  new IntersectionObserver((e) => document.body.classList.toggle('in-hero', e[0].isIntersecting), { threshold: 0.6 }).observe(panel);
})();

/* ---------- character file: skill bars ---------- */
(function () {
  const box = document.getElementById('dzSkills'); if (!box) return;
  const skills = [['Respect', 100], ['Driving', 84], ['Flow', 97], ['Stamina', 72], ['Stealth', 12], ['Street Cred', 100]];
  box.innerHTML = skills.map(([n, v]) => `<div class="stat"><div class="stat-top">${n}<span>${v}%</span></div><div class="segs" data-v="${v}">${'<i><b></b></i>'.repeat(5)}</div></div>`).join('');
  const fill = () => box.querySelectorAll('.segs').forEach((sg) => { const v = +sg.dataset.v; [...sg.children].forEach((seg, k) => { const f = Math.max(0, Math.min(1, (v - k * 20) / 20)); setTimeout(() => (seg.firstChild.style.width = f * 100 + '%'), k * 90); }); });
  if (!('IntersectionObserver' in window)) return fill();
  const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { fill(); io.disconnect(); } }, { threshold: 0.3 });
  io.observe(box);
})();
