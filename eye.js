// A realistic eye, drawn live by the GPU (no image files): iris fibres, veins,
// wet reflections. It follows the visitor, blinks, its pupil breathes, and
// now and then the picture corrupts.
(() => {
  const wrap = document.querySelector('.eye-wrap');
  const canvas = document.getElementById('eye');
  const gl = canvas && canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) { wrap && wrap.classList.add('flat'); return; }

  const VERT = `
    attribute vec2 a;
    void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

  const FRAG = `
    precision highp float;
    uniform vec2 u_res;
    uniform float u_time;
    uniform vec2 u_gaze;     // centre of the iris, in eye units
    uniform float u_pupil;   // pupil radius / iris radius
    uniform float u_lid;     // 1 open .. 0 shut
    uniform float u_glitch;  // 0 .. 1
    uniform float u_px;      // one CSS pixel in device pixels

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float s = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
      return s;
    }
    float ridge(vec2 p, float sharp) { return pow(1.0 - abs(fbm(p) * 2.0 - 1.0), sharp); }

    vec3 shade(vec2 p, out float alpha) {
      // the opening between the lids; the outer corner sits a little higher
      float x = p.x / 0.98;
      float w = clamp(1.0 - x * x, 0.0, 1.0);
      float topOpen = 0.29 * pow(w, 0.62) + 0.03 * p.x;
      float bot = -0.21 * pow(w, 0.8) + 0.02 * p.x;
      float top = mix(bot, topOpen, u_lid);
      float inside = smoothstep(-0.004, 0.004, top - p.y) * smoothstep(-0.004, 0.004, p.y - bot) * step(abs(x), 1.0);
      float above = p.y - top, below = bot - p.y;

      vec2 c = u_gaze;
      float R = 0.2;
      vec2 q = p - c;
      float r = length(q) / R;

      // sclera: a wet ball, dimmer where it curves away, yellowed and bloodshot toward the corners
      vec2 bq = (p - c * 0.35) * vec2(1.05, 2.5);
      float ball = sqrt(max(0.0, 1.0 - dot(bq, bq)));
      vec3 scl = vec3(0.80, 0.73, 0.68) * (0.12 + 0.88 * pow(ball, 1.3));
      scl = mix(scl, vec3(0.62, 0.52, 0.42) * (0.3 + 0.7 * ball), smoothstep(0.4, 0.95, abs(x)) * 0.35);
      vec2 wp = p + 0.12 * vec2(fbm(p * 3.0), fbm(p * 3.0 + 7.7));
      float veins = ridge(wp * 5.0 + 3.1, 60.0) + ridge(wp * 9.0 + 11.7, 90.0) * 0.6;
      veins *= smoothstep(1.2, 3.2, r) * smoothstep(0.3, 0.9, abs(x) + 0.2 * fbm(p * 2.0));
      scl = mix(scl, vec3(0.62, 0.07, 0.08) * (0.4 + 0.6 * ball), clamp(veins, 0.0, 1.0) * 0.85);
      scl *= mix(vec3(1.0), vec3(1.0, 0.78, 0.76), smoothstep(0.45, 1.0, abs(x)));
      scl = mix(scl, vec3(0.50, 0.16, 0.16), smoothstep(0.12, 0.02, length((p - vec2(-0.93, -0.01)) * vec2(1.0, 1.5))));

      // iris: fine radial fibres, crypts, a hot ring around the pupil, a dark limbus
      vec2 d = q / max(length(q), 1e-4);
      float fib = fbm(d * 12.0 + vec2(r * 0.6)) * 0.55 + fbm(d * 34.0 + 5.0) * 0.3 + noise(d * 90.0) * 0.15;
      float var = fbm(d * 5.0 + vec2(r * 2.5));
      float edge = u_pupil + (noise(d * 14.0) - 0.5) * 0.02;
      float t = smoothstep(1.0, edge, r);
      vec3 iris = mix(vec3(0.22, 0.01, 0.02), vec3(0.78, 0.05, 0.04), smoothstep(0.0, 0.75, t) * (0.5 + 0.6 * fib));
      iris = mix(iris, vec3(1.0, 0.42, 0.14), pow(t, 3.5) * 0.8 * fib);
      iris += vec3(0.28, 0.05, 0.02) * smoothstep(0.06, 0.0, abs(r - (edge + 0.18))) * fib;
      iris *= 0.55 + 0.65 * fib * (0.7 + 0.3 * var);
      float crypt = smoothstep(0.6, 0.7, fbm(d * 8.0 + vec2(r * 4.0, 0.0)));
      iris *= 1.0 - crypt * 0.5 * smoothstep(1.0, 0.55, r);
      iris *= 1.0 - smoothstep(0.72, 1.0, r) * 0.9;
      iris *= 0.85 + 0.3 * smoothstep(0.7, -0.7, q.y / R);
      iris = mix(iris, vec3(0.005), smoothstep(edge + 0.012, edge - 0.012, r));
      vec3 col = mix(scl, iris, smoothstep(1.015, 0.985, r));

      // the lids cast their shadow on the eye; a film of tears along the lower one
      col *= 0.2 + 0.8 * smoothstep(0.0, 0.16, top - p.y);
      col *= 0.55 + 0.45 * smoothstep(0.0, 0.06, p.y - bot);
      col += vec3(0.16, 0.10, 0.09) * smoothstep(0.004, 0.0, abs(p.y - bot - 0.006)) * w * ball;

      // reflections on the cornea, following the gaze halfway
      vec2 h = p - (c * 0.55 + vec2(0.055, 0.07));
      h.y -= h.x * h.x * 1.5;
      float win = smoothstep(0.028, 0.006, length(h * vec2(1.0, 1.35)));
      win += smoothstep(0.008, 0.0, length(h - vec2(-0.012, 0.004))) * 0.6;
      float dot2 = smoothstep(0.012, 0.0, length(p - (c * 0.55 + vec2(-0.07, -0.06))));
      float cornea = smoothstep(1.2, 0.85, r);
      col = mix(col, vec3(1.0, 0.98, 0.97), clamp(win * 0.85 + dot2 * 0.35, 0.0, 1.0) * cornea);
      col += vec3(0.5, 0.45, 0.45) * 0.05 * cornea * smoothstep(-0.2, 0.9, q.y / R);

      // skin: the lids are round and catch a little light, their rims are wet
      vec3 skin = vec3(0.075, 0.028, 0.026) * (0.6 + 0.6 * fbm(p * 13.0));
      skin += vec3(0.11, 0.05, 0.045) * smoothstep(0.16, 0.02, above) * smoothstep(0.0, 0.02, above) * w;
      skin += vec3(0.08, 0.035, 0.03) * smoothstep(0.1, 0.015, below) * smoothstep(0.0, 0.015, below) * w;
      skin = mix(skin, vec3(0.30, 0.11, 0.10), smoothstep(0.01, 0.0, abs(above - 0.006)) * w);
      skin = mix(skin, vec3(0.22, 0.08, 0.07), smoothstep(0.008, 0.0, abs(below - 0.005)) * w);
      // lash line and lashes, curving outward
      skin *= 1.0 - 0.8 * smoothstep(0.035, 0.014, above) * step(0.012, above);
      float lx = p.x * 110.0 + above * 40.0 * x;
      float lash = smoothstep(0.5, 0.85, noise(vec2(lx, 3.0))) * smoothstep(0.08, 0.015, above) * step(0.012, above) * w;
      skin *= 1.0 - lash * 0.9;
      // the crease of the upper lid, the hollow under the eye
      skin *= 0.55 + 0.45 * smoothstep(0.0, 0.045, abs(above - 0.14 * w - 0.03));
      skin *= 0.7 + 0.3 * smoothstep(0.02, 0.1, below);
      // cracks of red light
      float crack = ridge(p * 3.2 + vec2(7.3, 1.9), 55.0) * (0.5 + 0.5 * sin(u_time * 1.3 + p.x * 3.0));
      skin += vec3(0.95, 0.07, 0.08) * crack * 0.8 * smoothstep(0.03, 0.12, max(above, below));

      col = mix(skin, col, inside);
      alpha = max(inside, smoothstep(1.08, 0.5, length(p * vec2(0.98, 1.95))));
      return col;
    }

    void main() {
      vec2 frag = gl_FragCoord.xy;
      vec2 p = (frag - 0.5 * u_res) / u_res.y * 1.1;
      vec3 col;
      float a;
      if (u_glitch > 0.0) {
        float step8 = floor(u_time * 14.0);
        float band = floor(frag.y / u_res.y * 18.0);
        if (hash(vec2(band, step8)) > 0.62) p.x += (hash(vec2(band, step8 + 7.0)) - 0.5) * 0.3 * u_glitch;
        float off = 0.014 * u_glitch;
        float a1, a2, a3;
        vec3 cr = shade(p + vec2(off, 0.0), a1);
        vec3 cg = shade(p, a2);
        vec3 cb = shade(p - vec2(off, 0.0), a3);
        col = vec3(cr.r, cg.g, cb.b);
        a = max(a1, max(a2, a3));
      } else {
        col = shade(p, a);
      }
      col *= 0.9 + 0.1 * sin(frag.y / u_px * 1.6);                // scanlines
      col += (hash(frag + fract(u_time) * 91.0) - 0.5) * 0.05;    // grain
      col = max(col, 0.0);
      gl_FragColor = vec4(col * a, a);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) {
    console.warn('eye:', e);
    wrap.classList.add('flat');
    return;
  }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  ['u_res', 'u_time', 'u_gaze', 'u_pupil', 'u_lid', 'u_glitch', 'u_px'].forEach(n => U[n] = gl.getUniformLocation(prog, n));

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  addEventListener('resize', resize);

  // where it looks: the visitor's pointer, or wandering glances when there is none
  const target = { x: 0, y: 0 }, gaze = { x: 0, y: 0 };
  let lastPointer = -1e9, near = 0;
  addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    target.x = Math.max(-0.27, Math.min(0.27, dx * 0.22));
    target.y = Math.max(-0.07, Math.min(0.06, -dy * 0.05));
    near = Math.max(0, 1 - Math.hypot(dx * 0.6, dy * 0.4));
    lastPointer = performance.now();
  }, { passive: true });

  const rand = (a, b) => a + Math.random() * (b - a);
  let nextGlance = 0, nextBlink = performance.now() + rand(1500, 4000), blinkStart = -1, blinks = 0;
  let nextGlitch = performance.now() + rand(4000, 9000), glitchEnd = 0;
  let visible = true, prev = performance.now();
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;

    if (now - lastPointer > 2500 && now > nextGlance && !still) {
      target.x = rand(-0.2, 0.2);
      target.y = rand(-0.05, 0.04);
      near = 0;
      nextGlance = now + rand(900, 3200);
    }
    // saccades: quick jumps, then a faint tremor
    const k = Math.min(1, dt * 16);
    gaze.x += (target.x - gaze.x) * k;
    gaze.y += (target.y - gaze.y) * k;
    const gx = gaze.x + (still ? 0 : Math.sin(now * 0.013) * 0.0018);
    const gy = gaze.y + (still ? 0 : Math.cos(now * 0.017) * 0.0012);

    // blinks, sometimes twice
    let lid = 1;
    if (!still && now > nextBlink && blinkStart < 0) { blinkStart = now; blinks = Math.random() < 0.2 ? 2 : 1; }
    if (blinkStart >= 0) {
      const b = (now - blinkStart) / 170;
      if (b >= 1) {
        blinkStart = --blinks > 0 ? now + 90 : -1;
        if (blinkStart < 0) nextBlink = now + rand(2500, 6500);
      } else if (b > 0) lid = 1 - Math.sin(Math.PI * b);
    }

    // the pupil breathes, tightens when you come close, flickers when corrupted
    let pupil = 0.37 - near * 0.1 + Math.sin(now * 0.0017) * 0.015;
    let glitch = 0;
    if (!still && now > nextGlitch) { glitchEnd = now + rand(120, 380); nextGlitch = now + rand(5000, 12000); }
    if (now < glitchEnd) {
      glitch = Math.random() < 0.8 ? rand(0.4, 1) : 0;
      if (Math.random() < 0.3) pupil = rand(0.2, 0.55);
    }

    gl.uniform2f(U.u_res, canvas.width, canvas.height);
    gl.uniform1f(U.u_time, now / 1000);
    gl.uniform2f(U.u_gaze, gx, gy);
    gl.uniform1f(U.u_pupil, pupil);
    gl.uniform1f(U.u_lid, lid);
    gl.uniform1f(U.u_glitch, glitch);
    gl.uniform1f(U.u_px, dpr);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(frame);
})();
