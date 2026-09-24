// El cerebro del logo de JotaPuntoCe (Logos/JotaPuntoCe.png) hecho de miles de tetraedros de alambre,
// al estilo Dala: de perfil, manchas de color por región, contorno blanco, voltea hacia el cursor.
// Se dibuja con WebGL (gl.LINES): en canvas 2D la CPU tardaba ~180 ms por cuadro a 1920×1080.
//
// Composición fija de 710×686 (la aprobada) escalada con un solo factor S a cualquier pantalla;
// S se publica como --s en `root` para que la tarjeta escale igual. Los colores salen de los tokens
// --brain-* de packages/ui/src/tokens.css.

const TET = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((v) => v.map((c) => c / Math.sqrt(3)));
const EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
const COLOR_TOKENS = ["red", "blue", "violet", "pink", "amber", "green", "white"];
const [RED, BLUE, VIOLET, PINK, AMBER, GREEN, WHITE] = COLOR_TOKENS.map((_, i) => i);

// ---- anatomía: +x = frente, +y = arriba, z = lado (hemisferios) ----
const E = (cx, cy, cz, rx, ry, rz) => ({ c: [cx, cy, cz], r: [rx, ry, rz] });
const HEMI = [E(0, 0.12, 0.44, 1.28, 0.86, 0.56), E(0, 0.12, -0.44, 1.28, 0.86, 0.56)];
const TEMP = [E(0.18, -0.42, 0.5, 0.72, 0.36, 0.36), E(0.18, -0.42, -0.5, 0.72, 0.36, 0.36)];
const CBL = [E(-0.78, -0.62, 0.3, 0.42, 0.28, 0.36), E(-0.78, -0.62, -0.3, 0.42, 0.28, 0.36)];
const SOLIDS = [...HEMI, ...TEMP, ...CBL];

const inside = (p, e) => {
  let s = 0;
  for (let i = 0; i < 3; i++) { const d = (p[i] - e.c[i]) / e.r[i]; s += d * d; }
  return s < 0.97;
};
// muestreo proporcional al área (parejo por ángulo dejaba huecas las caras anchas)
const onSurface = (e) => {
  const [rx, ry, rz] = e.r, max = Math.max(rx * ry, rx * rz, ry * rz);
  for (;;) {
    let u = [0, 0, 0].map(() => { let a = 0; for (let i = 0; i < 6; i++) a += Math.random(); return a - 3; });
    const l = Math.hypot(...u) || 1;
    u = u.map((v) => v / l);
    if (Math.random() * max < Math.hypot(ry * rz * u[0], rx * rz * u[1], rx * ry * u[2])) {
      return u.map((v, i) => e.c[i] + v * e.r[i]);
    }
  }
};
const exposed = (p, self) => !SOLIDS.some((e) => e !== self && inside(p, e));

function regionColor([x, y, z], part) {
  if (part === "stem") return WHITE;
  if (part === "cbl") return Math.sin(y * 42) > 0.25 ? WHITE : Math.random() < 0.55 ? GREEN : WHITE;
  // circunvoluciones: líneas blancas serpenteantes, como el dibujo del logo
  const g = Math.sin(7.5 * x + 2.2 * Math.sin(5 * y + z)) * Math.sin(6.5 * y + 2 * Math.sin(4.5 * x - z));
  if (Math.abs(g) < 0.07) return WHITE;
  const n = (Math.sin(3 * x + 5 * z) + Math.cos(4 * y - 2 * x)) * 0.12;
  let c = WHITE;
  if (x < -0.62 + n) c = RED;
  else if (x > 0.62 + n) c = AMBER;
  else if (y > 0.48 + n && x < 0.3) c = BLUE;
  else if (y > 0.22 + n && x >= 0.18) c = PINK;
  else if (y > -0.2 + n && x > -0.5 && x < 0.45) c = VIOLET;
  else if (part === "temp" && x < -0.1) c = GREEN;
  return Math.random() < 0.92 ? c : WHITE;
}

function sample(n) {
  const pts = [];
  for (const [list, share, part] of [[HEMI, 0.7, "hemi"], [TEMP, 0.12, "temp"], [CBL, 0.11, "cbl"]]) {
    let k = Math.round(n * share);
    while (k > 0) {
      const e = list[(Math.random() * list.length) | 0], p = onSurface(e);
      if (!exposed(p, e)) continue;
      const nv = p.map((v, i) => (v - e.c[i]) / (e.r[i] * e.r[i])), l = Math.hypot(...nv);
      pts.push([p, part, nv.map((v) => v / l)]);
      k--;
    }
  }
  // tallo cerebral: cilindro inclinado bajo el cerebelo
  for (let i = 0, k = Math.round(n * 0.07); i < k; i++) {
    const t = Math.random(), th = Math.random() * 6.283, r = 0.15 - t * 0.03;
    pts.push([[-0.28 - t * 0.2 + Math.cos(th) * r * 0.8, -0.5 - t * 0.72, Math.sin(th) * r], "stem", [Math.cos(th), 0, Math.sin(th)]]);
  }
  return pts;
}

// Escala única de la composición: cabe completa; en teléfono vertical la tarjeta usa el ancho útil.
// ponytail: en teléfono vertical el cerebro se recorta por los lados para que la tarjeta sea legible
export function stageScale(vw, vh) {
  if (vw < 500) return Math.min((vw - 32) / 440, vh / 686);
  return Math.min(vw / 710, vh / 686);
}

// el pipeline de CSS acorta los tokens (#ffffff → #fff): se aceptan las dos formas
export function hexToRgb(hex) {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

export function startBrainScene(canvas, root) {
  const gl = canvas.getContext("webgl", { antialias: true, premultipliedAlpha: true });
  const css = getComputedStyle(document.documentElement);
  const RGB = COLOR_TOKENS.map((name) => hexToRgb(css.getPropertyValue(`--brain-${name}`) || "#ffffff"));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const VX = new Float32Array(4), VY = new Float32Array(4);
  let W, H, dpr, S = 1, P = [], buf, uRes, raf = 0;
  let mx = 0, my = 0, yaw = 0.15, pitch = 0.1, offX = 0, offY = 0;
  const t0 = performance.now();

  if (gl) {
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p;attribute vec4 c;uniform vec2 r;varying vec4 v;void main(){gl_Position=vec4(p/r*2.-1.,0.,1.);gl_Position.y=-gl_Position.y;v=c;}"));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, "precision mediump float;varying vec4 v;void main(){gl_FragColor=vec4(v.rgb*v.a,v.a);}"));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const aP = gl.getAttribLocation(prog, "p"), aC = gl.getAttribLocation(prog, "c");
    uRes = gl.getUniformLocation(prog, "r");
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 4, gl.FLOAT, false, 24, 8);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0);
  }

  function build() {
    S = stageScale(innerWidth, innerHeight);
    root.style.setProperty("--s", S);
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.width = innerWidth * dpr;
    H = canvas.height = innerHeight * dpr;
    if (!gl) return;
    gl.viewport(0, 0, W, H);
    gl.uniform2f(uRes, W, H);
    const mob = innerWidth < 760;
    P = [];
    for (const [[x, y, z], part, [nx, ny, nz]] of sample(mob ? 11000 : 22000)) {
      P.push({ x, y, z, nx, ny, nz, sx: (Math.random() - 0.5) * 9, sy: (Math.random() - 0.5) * 6, sz: (Math.random() - 0.5) * 9,
        s: 0.005 + Math.random() * 0.007, a: Math.random() * 6.28, b: Math.random() * 6.28, va: (Math.random() - 0.5) * 0.02,
        c: regionColor([x, y, z], part), back: Math.random() < 0.3, d: Math.random() * 0.6 });
    }
    // partículas ambientales lejos del cerebro
    for (let i = 0; i < (mob ? 50 : 110); i++) {
      const x = (Math.random() - 0.5) * 8, y = (Math.random() - 0.5) * 5, z = (Math.random() - 0.5) * 6;
      if (Math.abs(x) < 1.6 && Math.abs(y) < 1.3 && Math.abs(z) < 1.2) { i--; continue; }
      P.push({ x, y, z, sx: x, sy: y, sz: z, s: 0.02 + Math.random() * 0.035, a: Math.random() * 6.28, b: Math.random() * 6.28,
        va: (Math.random() - 0.5) * 0.01, c: (Math.random() * 7) | 0, d: 0, amb: true });
    }
    buf = new Float32Array(P.length * 12 * 6); // hasta 6 aristas × 2 vértices × (x,y,r,g,b,a)
  }

  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

  function frame(now) {
    const t = (now - t0) / 1000;
    gl.clear(gl.COLOR_BUFFER_BIT);
    let n = 0;
    const seg = (i, j, c, a) => {
      buf[n++] = VX[i]; buf[n++] = VY[i]; buf[n++] = c[0]; buf[n++] = c[1]; buf[n++] = c[2]; buf[n++] = a;
      buf[n++] = VX[j]; buf[n++] = VY[j]; buf[n++] = c[0]; buf[n++] = c[1]; buf[n++] = c[2]; buf[n++] = a;
    };
    // voltea hacia el cursor y se desplaza un poco hacia él
    const idle = reduce ? 0 : Math.sin(t * 0.35) * 0.12;
    yaw += (0.15 - mx * 1.1 + idle - yaw) * 0.05;
    pitch += (0.1 - my * 0.7 - pitch) * 0.05;
    offX += (mx * 0.12 - offX) * 0.05;
    offY += (my * 0.08 - offY) * 0.05;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const f = 219.5 * S * dpr * 2.7; // radio medido en la composición aprobada (710×686)
    const ox = W * (0.5 + offX), oy = H * (0.5 + offY), camZ = 3.2;

    for (const p of P) {
      const k = reduce ? 1 : ease((t - p.d) / 1.8);
      let x = p.sx + (p.x - p.sx) * k, y = p.sy + (p.y - p.sy) * k, z = p.sz + (p.z - p.sz) * k;
      if (!p.amb && !reduce) { const br = 1 + 0.01 * Math.sin(t * 0.9 + p.a); x *= br; y *= br; z *= br; }
      const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
      const y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      const zc = camZ - z2;
      if (zc < 0.08) continue;
      let alpha = 0.4, col = p.c;
      if (!p.amb) {
        // normal rotada igual que el punto: de perfil (nz≈0) es contorno → blanco y sólido
        const nz = p.ny * sp + (-p.nx * syw + p.nz * cyw) * cp;
        if (k > 0.95 && Math.abs(nz) < 0.2) { col = WHITE; alpha = 1; }
        else if (nz > 0) alpha = 0.55 + 0.45 * nz;
        else if (p.back || k < 0.95) alpha = 0.12;
        else continue;
      }
      const pr = f / zc, px = ox + x1 * pr, py = oy - y1 * pr;
      if (px < -60 || px > W + 60 || py < -60 || py > H + 60) continue;
      if (!reduce) { p.a += p.va; p.b += p.va * 0.7; }
      const ca = Math.cos(p.a), sa = Math.sin(p.a), cb = Math.cos(p.b), sb = Math.sin(p.b), sz = p.s * pr;
      // a menos de ~3px las 6 aristas no se distinguen: basta el contorno de 3
      const tri = sz < 3 * dpr;
      for (let i = 0; i < (tri ? 3 : 4); i++) {
        const [a, b, c] = TET[i], a1 = a * ca - b * sa, b2 = (a * sa + b * ca) * cb - c * sb;
        VX[i] = px + a1 * sz;
        VY[i] = py + b2 * sz;
      }
      const rgb = RGB[col];
      if (tri) { seg(0, 1, rgb, alpha); seg(1, 2, rgb, alpha); seg(2, 0, rgb, alpha); }
      else for (const [i, j] of EDGES) seg(i, j, rgb, alpha);
    }
    gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, n), gl.STREAM_DRAW);
    gl.drawArrays(gl.LINES, 0, n / 6);
    raf = requestAnimationFrame(frame);
  }

  const onMove = (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; };
  addEventListener("resize", build);
  addEventListener("pointermove", onMove);
  build();
  if (gl) raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("resize", build);
    removeEventListener("pointermove", onMove);
  };
}
