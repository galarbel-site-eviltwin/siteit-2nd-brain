// SiteIt 2nd Brain - the animated brain.
// Ported from the Claude Design export "AI Brain Animation v4" (brain-scene-v4.jsx) to plain JS:
// same scene, same 16s seamless loop, but glows are drawn on one canvas with pre-rendered sprites
// instead of ~150 blurred SVG nodes, and it pauses when off screen, when the tab is hidden,
// and stays still under prefers-reduced-motion.
// The same file is copied to docs/mockup/assets/brain-engine.js. Edit here, then copy.

const W = 1920, H = 1080, S = 1920 / 1672, P = 16, TAU = Math.PI * 2;
// Logo colors, lifted a little so they read as light on a dark stage.
const C = { green: "#2be89a", pink: "#ff2e8b", cyan: "#19c2ff", yellow: "#ffd92e", white: "#fbf8ff" };

const STREAMS = [
  { pts: [[20, 130], [130, 158], [330, 225], [480, 275], [560, 300]], c: C.green },
  { pts: [[20, 250], [180, 265], [380, 300], [540, 330]], c: C.green },
  { pts: [[20, 425], [150, 425], [330, 440], [520, 400]], c: C.pink },
  { pts: [[20, 480], [200, 470], [380, 450], [500, 430]], c: C.pink },
  { pts: [[20, 640], [220, 630], [400, 560], [540, 480]], c: C.cyan },
  { pts: [[20, 690], [180, 680], [350, 615], [520, 520]], c: C.cyan },
  { pts: [[1190, 420], [1350, 450], [1500, 470], [1650, 480]], c: C.yellow },
  { pts: [[1190, 460], [1360, 500], [1520, 510], [1650, 500]], c: C.yellow },
  { pts: [[1170, 350], [1330, 330], [1480, 290], [1650, 230]], c: C.yellow },
  { pts: [[1180, 390], [1350, 380], [1520, 360], [1650, 330]], c: C.pink },
];
const BUBBLES = [[125, 155, 62, C.green], [62, 425, 58, C.pink], [220, 635, 58, C.cyan], [1435, 305, 45, C.yellow], [1620, 485, 60, C.yellow]];
const THOUGHT = [[640, 300], [760, 230], [950, 260], [1080, 380], [1020, 520], [820, 560], [640, 450]];
// Neural points traced on the artwork, in source-image pixels.
const POINTS = [[1119,585,"#ffd433"],[855,429,"#97e5ff"],[1158,351,"#ff6eb8"],[1185,429,"#ffc764"],[1125,300,"#e6a4ff"],[540,294,"#3effd4"],[1044,564,"#ffcd1a"],[1158,495,"#ffc53a"],[1113,417,"#ffc917"],[1023,471,"#ffd20c"],[516,498,"#3fdbff"],[498,387,"#dd49ff"],[702,531,"#9c61ff"],[747,348,"#15ffbe"],[747,477,"#22cdff"],[927,621,"#43bfff"],[600,306,"#13ffb6"],[1083,258,"#ff56f9"],[744,588,"#d561ff"],[942,186,"#ff3ffe"],[966,564,"#ff8c7d"],[1092,534,"#ffc413"],[858,567,"#11ddff"],[858,171,"#6e4fff"],[579,489,"#18aaff"],[948,675,"#8b56ff"],[627,549,"#4e82ff"],[795,438,"#3abaff"],[660,240,"#0affad"],[822,525,"#0bd9ff"],[723,183,"#5eabff"],[960,390,"#ff8037"],[819,630,"#9246ff"],[912,420,"#ff8558"],[834,318,"#5fddff"],[993,237,"#c93fff"],[495,447,"#733bff"],[795,195,"#5499ff"],[597,393,"#ff12fc"],[546,351,"#4f7dff"]];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => x * x * (3 - 2 * x);
const bell = (p) => Math.sin(Math.PI * clamp(p, 0, 1));
const mod = (v) => ((v % P) + P) % P;

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function catmull(pts, n = 16, closed = false) {
  const N = pts.length, out = [];
  const g = (i) => (closed ? pts[(i + N) % N] : pts[clamp(i, 0, N - 1)]);
  const segs = closed ? N : N - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) * S));
    }
  }
  out.push((closed ? pts[0] : pts[N - 1]).map((v) => v * S));
  const cum = [0];
  for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  return { pts: out, cum, len: cum[cum.length - 1] };
}

function at(p, s) {
  s = clamp(s, 0, p.len);
  let lo = 1;
  while (lo < p.cum.length - 1 && p.cum[lo] < s) lo++;
  const f = (s - p.cum[lo - 1]) / (p.cum[lo] - p.cum[lo - 1] || 1), a = p.pts[lo - 1], b = p.pts[lo];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

function build() {
  const r = rng(5);
  const nodes = POINTS.map(([x, y, c]) => ({ x: x * S, y: y * S, c, ph: r(), rate: 1 + Math.floor(r() * 2) }));
  const links = [], seen = new Set();
  nodes.forEach((n, i) =>
    nodes.map((m, j) => [j, Math.hypot(m.x - n.x, m.y - n.y)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 2)
      .forEach(([j]) => { const k = Math.min(i, j) + "-" + Math.max(i, j); if (!seen.has(k)) { seen.add(k); links.push([i, j]); } }),
  );
  const signals = [];
  for (let i = 0; i < 26; i++) {
    const l = links[Math.floor(r() * links.length)], f = r() > 0.5;
    signals.push({ a: f ? l[0] : l[1], b: f ? l[1] : l[0], at: r(), dur: 1.6 + r() * 1.2 });
  }
  const streams = STREAMS.map((s) => {
    const path = catmull(s.pts), packets = [];
    let t0 = r() * 2;
    while (t0 < P) { packets.push({ t0, keep: r(), sz: 3.5 + r() * 3 }); t0 += 1.0 + r() * 1.8; }
    return { ...s, path, packets };
  });
  return { nodes, signals, streams, thought: catmull(THOUGHT, 24, true) };
}

// A soft round sprite per color: drawing it scaled stands in for a gaussian-blurred circle.
const spriteCache = new Map();
function sprite(color) {
  if (spriteCache.has(color)) return spriteCache.get(color);
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d"), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  [[0, 1], [0.22, 0.8], [0.45, 0.42], [0.7, 0.13], [1, 0]].forEach(([o, a]) => grd.addColorStop(o, hexA(color, a)));
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  spriteCache.set(color, c);
  return c;
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Mounts the animated brain into `root` (which should have a size, and a dark background behind it).
 * @param {HTMLElement} root
 * @param {{ src: string, brightSrc: string, fit?: "contain" | "cover", glow?: number, speed?: number, density?: number }} opts
 * @returns {() => void} unmount
 */
export function mountBrain(root, opts) {
  const fit = opts.fit ?? "contain", glow = opts.glow ?? 1, speed = 120 * (opts.speed ?? 1), density = opts.density ?? 0.8;
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const net = build();

  if (getComputedStyle(root).position === "static") root.style.position = "relative";
  root.style.overflow = "hidden";
  const stage = document.createElement("div");
  // Feathered edges, so the artwork never shows a hard rectangle against the stage.
  const feather = "linear-gradient(to right,transparent 0,#000 8%,#000 92%,transparent 100%),linear-gradient(to bottom,transparent 0,#000 10%,#000 88%,transparent 100%)";
  stage.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;pointer-events:none;-webkit-mask-image:${feather};mask-image:${feather};-webkit-mask-composite:source-in;mask-composite:intersect`;
  const img = (src, extra = "") => {
    const i = document.createElement("img");
    i.src = src; i.alt = ""; i.decoding = "async"; i.draggable = false;
    i.style.cssText = `position:absolute;inset:0;width:${W}px;height:${H}px;object-fit:cover;${extra}`;
    stage.appendChild(i);
    return i;
  };
  img(opts.src);
  const breathMask = "radial-gradient(ellipse 470px 360px at 960px 470px, #000 0%, rgba(0,0,0,.35) 55%, transparent 100%)";
  const breath = img(opts.brightSrc, `mix-blend-mode:screen;opacity:0;-webkit-mask-image:${breathMask};mask-image:${breathMask}`);
  const thought = img(opts.brightSrc, `mix-blend-mode:screen;opacity:${0.8 * glow}`);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen";
  root.append(stage, canvas);
  const ctx = canvas.getContext("2d");

  let k = 1, ox = 0, oy = 0, dpr = 1, cw = 0, ch = 0;
  function layout() {
    const r = root.getBoundingClientRect();
    cw = Math.max(1, r.width); ch = Math.max(1, r.height);
    k = fit === "cover" ? Math.max(cw / W, ch / H) : Math.min(cw / W, ch / H);
    ox = (cw - W * k) / 2; oy = (ch - H * k) / 2;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    stage.style.transform = `translate(${ox}px,${oy}px) scale(${k})`;
    if (!running) frame(lastT);
  }

  const wave = (T, kk, ph = 0) => 0.5 - 0.5 * Math.cos(TAU * ((kk * T) / P + ph));
  const blob = (x, y, r, blur, color, alpha) => {
    if (alpha <= 0.01) return;
    const R = r + 2 * blur;
    ctx.globalAlpha = Math.min(1, alpha * Math.min(1, (r + blur * 0.6) / (blur * 1.4 + 0.01)));
    ctx.drawImage(sprite(color), x - R, y - R, R * 2, R * 2);
  };
  const core = (x, y, r, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = C.white;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  };

  let lastT = 4;
  function frame(T) {
    lastT = T;
    const [tx, ty] = at(net.thought, (net.thought.len * mod(T)) / P);
    const m = `radial-gradient(ellipse 300px 240px at ${tx.toFixed(1)}px ${ty.toFixed(1)}px, #000 0%, rgba(0,0,0,.35) 55%, transparent 100%)`;
    thought.style.webkitMaskImage = m; thought.style.maskImage = m;
    breath.style.opacity = String(0.3 * wave(T, 2) * glow);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    ctx.globalCompositeOperation = "lighter";

    BUBBLES.forEach(([x, y, rr, c], i) => blob(x * S, y * S, rr * S, 30, c, 0.22 * wave(T, 2, i * 0.21) * glow));

    net.streams.forEach((s) => s.packets.forEach((p) => {
      if (p.keep > density) return;
      const life = s.path.len / speed, age = mod(T - p.t0);
      if (age > life) return;
      const [x, y] = at(s.path, smooth(age / life) * s.path.len * 0.15 + age * speed * 0.85);
      const o = Math.min(1, age / 0.8, (life - age) / 0.8);
      blob(x, y, p.sz * 4.5, 8, s.c, 0.75 * glow * o);
      core(x, y, p.sz, o);
    }));

    const hit = new Array(net.nodes.length).fill(0);
    net.signals.forEach((s) => {
      const age = mod(T - s.at * P), pr = age / s.dur;
      if (pr <= 1) {
        const a = net.nodes[s.a], b = net.nodes[s.b], e = smooth(pr), o = bell(pr);
        const x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e;
        blob(x, y, 14, 8, a.c, 0.8 * glow * o);
        core(x, y, 4, o);
      }
      const since = age - s.dur;
      if (since > -0.4 && since < 1.4) hit[s.b] = Math.max(hit[s.b], bell((since + 0.4) / 1.8));
    });

    net.nodes.forEach((n, i) => {
      const f = Math.max(Math.pow(wave(T, n.rate, n.ph), 3) * 0.7, hit[i]);
      if (f < 0.02) return;
      blob(n.x, n.y, 48, 30, n.c, 0.45 * glow * f);
      blob(n.x, n.y, 16, 8, n.c, 0.85 * glow * f);
      core(n.x, n.y, 4.5, f);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  let raf = 0, running = false, visible = true, start = performance.now() - lastT * 1000;
  const loop = (now) => {
    frame((now - start) / 1000);
    raf = requestAnimationFrame(loop);
  };
  const play = () => {
    if (running || reduce || !visible || document.hidden) return;
    running = true;
    start = performance.now() - lastT * 1000;
    raf = requestAnimationFrame(loop);
  };
  const pause = () => { running = false; cancelAnimationFrame(raf); };

  const ro = new ResizeObserver(layout);
  ro.observe(root);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? play() : pause(); });
  io.observe(root);
  const onVis = () => (document.hidden ? pause() : play());
  document.addEventListener("visibilitychange", onVis);
  layout();
  play();

  return () => {
    pause(); ro.disconnect(); io.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    stage.remove(); canvas.remove();
  };
}
