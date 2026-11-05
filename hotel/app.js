/* 夕照 · 独栋别墅 —— 纯 Three.js 程序化建模（离线可用） */
(function () {
  'use strict';
  var T = window.THREE;
  var errBox = document.getElementById('err');
  function fail(msg) {
    errBox.style.display = 'flex';
    errBox.textContent = msg;
    document.getElementById('loading').classList.add('gone');
  }
  if (!T) { fail('3D 引擎未能加载，请确认 vendor/three.global.js 存在。'); return; }

  /* ---------- 设备能力分级 ---------- */
  var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  var LOW = coarse || /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent)
    || Math.min(window.innerWidth, window.innerHeight) < 480;
  var dynamicDPR = Math.min(window.devicePixelRatio || 1, LOW ? 1.5 : 1.8);

  /* ---------- 渲染器 ---------- */
  var canvas = document.getElementById('scene');
  var renderer;
  try {
    renderer = new T.WebGLRenderer({
      canvas: canvas,
      antialias: !LOW,                                   /* 移动端省下 MSAA 开销 */
      powerPreference: LOW ? 'default' : 'high-performance'
    });
  } catch (e) {
    fail('当前浏览器无法创建 WebGL 上下文，请改用 Chrome / Edge 并开启硬件加速。'); return;
  }
  renderer.setPixelRatio(dynamicDPR);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = LOW ? T.PCFShadowMap : T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = T.SRGBColorSpace;

  var scene = new T.Scene();
  scene.fog = new T.FogExp2(0xdca57a, 0.0026);
  /* near/far 收紧以提升深度精度，避免大面积地面 z-fighting */
  var camera = new T.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.5, 900);

  /* ---------- 通用工具 ---------- */
  var seed = 20261105;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function rr(a, b) { return a + (b - a) * rnd(); }

  var UNIT = {
    box: new T.BoxGeometry(1, 1, 1),
    cyl: new T.CylinderGeometry(1, 1, 1, 20),
    cone: new T.CylinderGeometry(0, 1, 1, 20),
    sph: new T.SphereGeometry(1, 16, 12),
    ico: new T.IcosahedronGeometry(1, 1),
    pln: new T.PlaneGeometry(1, 1),
    cir: new T.CircleGeometry(1, 32)
  };
  function put(g, geo, m, x, y, z, sx, sy, sz, o) {
    o = o || {};
    var q = new T.Mesh(geo, m);
    q.position.set(x, y, z); q.scale.set(sx, sy, sz);
    if (o.rx) q.rotation.x = o.rx;
    if (o.ry) q.rotation.y = o.ry;
    if (o.rz) q.rotation.z = o.rz;
    q.castShadow = o.cast !== false;
    q.receiveShadow = o.recv !== false;
    g.add(q); return q;
  }
  function box(g, w, h, d, m, x, y, z, o) { return put(g, UNIT.box, m, x, y, z, w, h, d, o); }
  function cyl(g, r, h, m, x, y, z, o) { return put(g, UNIT.cyl, m, x, y, z, r, h, r, o); }
  function cone(g, r, h, m, x, y, z, o) { return put(g, UNIT.cone, m, x, y, z, r, h, r, o); }
  function ball(g, r, m, x, y, z, o) { return put(g, UNIT.sph, m, x, y, z, r, r, r, o); }
  function taper(g, rt, rb, h, m, x, y, z, o) {
    return put(g, new T.CylinderGeometry(rt, rb, 1, 24), m, x, y, z, 1, h, 1, o);
  }
  function flat(g, w, d, m, x, y, z, o) {
    o = o || {}; o.rx = -Math.PI / 2; o.cast = false;
    return put(g, UNIT.pln, m, x, y, z, w, d, 1, o);
  }
  function M(c, r, me, o) {
    return new T.MeshStandardMaterial(Object.assign({ color: c, roughness: r === undefined ? .85 : r, metalness: me || 0 }, o || {}));
  }
  function tex(size, draw, rx, ry) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    var t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rx || 1, ry || 1);
    t.anisotropy = 8;
    return t;
  }

  /* ---------- 程序化纹理 ---------- */
  var grassTex = tex(256, function (c, s) {
    c.fillStyle = '#6e8750'; c.fillRect(0, 0, s, s);
    for (var i = 0; i < 5200; i++) {
      var v = Math.floor(rr(60, 150));
      c.fillStyle = 'rgba(' + v + ',' + (v + 24) + ',' + Math.floor(v * .62) + ',' + rr(.15, .55) + ')';
      c.fillRect(rnd() * s, rnd() * s, rr(1, 3), rr(1, 5));
    }
  }, 16, 16);

  var woodTex = tex(512, function (c, s) {
    c.fillStyle = '#b98c5c'; c.fillRect(0, 0, s, s);
    for (var i = 0; i < 8; i++) {
      var y = i * 64;
      c.fillStyle = ['#c49a69', '#b1855a', '#c9a172', '#ab7f53'][i % 4];
      c.fillRect(0, y + 1, s, 62);
      c.fillStyle = 'rgba(70,42,20,.28)'; c.fillRect(0, y, s, 2);
      for (var k = 0; k < 22; k++) {
        c.strokeStyle = 'rgba(90,58,30,' + rr(.03, .12).toFixed(2) + ')';
        c.lineWidth = rr(.5, 1.6); c.beginPath();
        var yy = y + rr(4, 60); c.moveTo(0, yy);
        c.bezierCurveTo(s * .3, yy + rr(-3, 3), s * .6, yy + rr(-3, 3), s, yy + rr(-2, 2));
        c.stroke();
      }
    }
  }, 2, 2);

  var stoneTex = tex(256, function (c, s) {
    c.fillStyle = '#cfc5b4'; c.fillRect(0, 0, s, s);
    for (var i = 0; i < 2600; i++) {
      var g = Math.floor(rr(150, 225));
      c.fillStyle = 'rgba(' + g + ',' + (g - 6) + ',' + (g - 16) + ',' + rr(.1, .4) + ')';
      c.fillRect(rnd() * s, rnd() * s, rr(1, 4), rr(1, 4));
    }
    c.strokeStyle = 'rgba(110,100,88,.22)'; c.lineWidth = 1;
    for (var j = 0; j <= 4; j++) { c.beginPath(); c.moveTo(j * 64, 0); c.lineTo(j * 64, s); c.stroke(); c.beginPath(); c.moveTo(0, j * 64); c.lineTo(s, j * 64); c.stroke(); }
  }, 5, 4);

  var waterTex = tex(256, function (c, s) {
    c.fillStyle = '#2b7890'; c.fillRect(0, 0, s, s);
    for (var i = 0; i < 90; i++) {
      c.strokeStyle = 'rgba(190,235,240,' + rr(.04, .2).toFixed(2) + ')';
      c.lineWidth = rr(1, 3.5); c.beginPath();
      var x = rnd() * s, y = rnd() * s, w = rr(14, 55);
      c.moveTo(x, y);
      c.bezierCurveTo(x + w * .3, y - rr(2, 8), x + w * .7, y + rr(2, 8), x + w, y);
      c.stroke();
    }
  }, 3, 2);

  var screenTex = tex(256, function (c, s) {
    var g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#2a3560'); g.addColorStop(.42, '#9a5a72'); g.addColorStop(.72, '#e79763'); g.addColorStop(1, '#f6c683');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    c.fillStyle = 'rgba(255,222,160,.95)'; c.beginPath(); c.arc(160, 140, 24, 0, 7); c.fill();
    c.fillStyle = '#4b3c58'; c.beginPath(); c.moveTo(0, s); c.lineTo(0, 185); c.lineTo(70, 150); c.lineTo(125, 190); c.lineTo(190, 140); c.lineTo(s, 200); c.lineTo(s, s); c.fill();
  });

  var cloudTex = (function () {
    var c = document.createElement('canvas'); c.width = 512; c.height = 128;
    var x = c.getContext('2d');
    for (var i = 0; i < 11; i++) {
      var cx = rr(60, 450), cy = rr(44, 84), r = rr(38, 95);
      var g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,.62)'); g.addColorStop(.5, 'rgba(255,255,255,.26)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, r, r * .33, 0, 0, 7); x.fill();
    }
    var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  })();

  /* ---------- 材质库 ---------- */
  var MAT = {
    grass: M(0xffeed4, 1, 0, { map: grassTex }),
    soil: M(0x6b6449, 1),
    stone: M(0xffffff, .92, 0, { map: stoneTex }),
    terrace: M(0xd8cebc, .9),
    wall: M(0xeae3d6, .92),
    wallIn: M(0xf1ece1, .96),
    warmWall: M(0xd8c5ab, .95),
    wood: M(0x8a5e3c, .72, 0, { map: woodTex }),
    woodDark: M(0x4b3424, .72),
    oak: M(0xc19a6b, .68, 0, { map: woodTex }),
    floor: M(0xffffff, .7, 0, { map: woodTex }),
    marble: M(0xe9e6df, .32, .04),
    metal: M(0x2d3033, .38, .82),
    gold: M(0xc6a268, .3, .85),
    black: M(0x191c20, .5, .3),
    fabric: M(0xd9cfbb, 1),
    fabric2: M(0xc6b8a2, 1),
    fabricBlue: M(0x6c8190, 1),
    fabricRust: M(0xb5714e, 1),
    fabricGreen: M(0x6f8267, 1),
    linen: M(0xf2ede3, 1),
    rug: M(0xb9a68c, 1, 0, { map: stoneTex }),
    rugBlue: M(0x7b8b94, 1),
    white: M(0xf7f5f0, .6),
    porcelain: M(0xf4f2ed, .22, .02),
    leaf: M(0x4f6d42, .95),
    leaf2: M(0x62804a, .95),
    trunk: M(0x57402e, 1),
    pool: M(0xd6e5e4, .4),
    water: new T.MeshStandardMaterial({ color: 0xffffff, map: waterTex, roughness: .12, metalness: .35, transparent: true, opacity: .9, side: T.DoubleSide }),
    glass: new T.MeshStandardMaterial({ color: 0xcfe7ee, roughness: .06, metalness: .12, transparent: true, opacity: .13, side: T.DoubleSide, depthWrite: false }),
    glassDark: new T.MeshStandardMaterial({ color: 0x93b7c4, roughness: .08, metalness: .2, transparent: true, opacity: .3, side: T.DoubleSide, depthWrite: false }),
    roof: M(0x3b3c3e, .88),
    roofEdge: M(0x26282a, .7),
    lamp: M(0xffe7bd, .45, 0, { emissive: 0xffb45e, emissiveIntensity: 1.4 }),
    flame: M(0xffb04a, .5, 0, { emissive: 0xff7a22, emissiveIntensity: 2.4 }),
    screen: new T.MeshBasicMaterial({ map: screenTex, toneMapped: false })
  };
  var BOOK = [0xb56a4a, 0x4d6a86, 0xd3ad68, 0x778a66, 0xa25c63, 0xe0d6c1, 0x5b5a70, 0x8a6c55, 0x3f6570]
    .map(function (c) { return M(c, .9); });

  /* ---------- 分组 ---------- */
  var env = new T.Group(), base = new T.Group(), f1 = new T.Group(),
      slab = new T.Group(), f2 = new T.Group(), roof = new T.Group();
  [env, base, f1, slab, f2, roof].forEach(function (g) { scene.add(g); });

  /* ---------- 天空 / 夕阳 ---------- */
  var sunDir = new T.Vector3(-0.72, 0.22, -0.66).normalize();
  var skyU = {
    uSunDir: { value: sunDir.clone() },
    uZenith: { value: new T.Color(0x2b4d80) },
    uHorizon: { value: new T.Color(0xf2b374) },
    uHaze: { value: new T.Color(0xb99078) },
    uSun: { value: new T.Color(0xffca80) },
    uExposure: { value: 1.12 }
  };
  var skyMat = new T.ShaderMaterial({
    side: T.BackSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
    uniforms: skyU,
    vertexShader: [
      'varying vec3 vDir;',
      'void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vDir;',
      'uniform vec3 uSunDir, uZenith, uHorizon, uHaze, uSun;',
      'uniform float uExposure;',
      'vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }',
      'vec3 srgb(vec3 c){ return mix(12.92*c, 1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055, step(0.0031308,c)); }',
      'void main(){',
      '  vec3 d = normalize(vDir); float h = d.y;',
      '  float t = clamp(h*1.75+0.10,0.0,1.0);',
      '  vec3 col = mix(uHorizon, uZenith, pow(t,0.72));',
      '  vec3 sd = normalize(uSunDir);',
      '  float az = pow(max(dot(normalize(vec3(d.x,0.0,d.z)+vec3(0.0001)), normalize(vec3(sd.x,0.0,sd.z))),0.0),3.0);',
      '  col += uSun * exp(-abs(h-0.02)*8.0) * az * 0.40;',
      '  float sdv = max(dot(d,sd),0.0);',
      '  float above = smoothstep(-0.10,0.02,sd.y);',
      '  col += uSun * (pow(sdv,9.0)*0.22 + pow(sdv,80.0)*0.85 + pow(sdv,220.0)*1.30) * above;',
      '  float disc = smoothstep(0.9978,0.9991,sdv) * above;',
      '  col = mix(col, vec3(1.0,0.94,0.79)*3.2, disc);',
      '  float below = 1.0 - smoothstep(-0.30, 0.012, h);',
      '  float bands = 0.5 + 0.5*sin(d.x*46.0 + d.z*33.0 + sin(d.z*57.0)*1.6);',
      '  vec3 sea = mix(uHorizon, uHaze, 0.40) * (0.64 + bands*0.42);',
      '  sea += uSun * az * 0.62 * exp(h*3.0);',
      '  sea += uSun * pow(az,6.0) * 0.34 * exp(h*2.0);',
      '  col = mix(col, sea, below*0.97);',
      '  gl_FragColor = vec4(srgb(aces(col*uExposure)),1.0);',
      '}'
    ].join('\n')
  });
  var skyDome = new T.Mesh(new T.SphereGeometry(600, 48, 28), skyMat);
  skyDome.frustumCulled = false; skyDome.renderOrder = -1000; scene.add(skyDome);

  /* 云带 */
  var clouds = [];
  var cloudCount = LOW ? 10 : 19; /* 移动端减少透明混合层 */
  for (var ci = 0; ci < cloudCount; ci++) {
    var low = ci >= (LOW ? 4 : 8);
    var cm = new T.SpriteMaterial({
      map: cloudTex, transparent: true,
      opacity: low ? rr(.24, .46) : rr(.16, .34),
      depthWrite: false, fog: false,
      color: ci % 3 === 0 ? 0xffd6ad : 0xf6bc9f
    });
    var sp = new T.Sprite(cm);
    sp.position.set(
      low ? rr(-135, 135) : rr(-230, 230),
      low ? rr(-1, 7) : rr(26, 86),
      low ? rr(-165, -58) : rr(-260, -150)
    );
    sp.scale.set(rr(65, 155), rr(8, 19), 1);
    scene.add(sp); clouds.push(sp);
  }

  /* 远山剪影 */
  function ridge(pts, color, z, scaleX, hScale) {
    var s = new T.Shape();
    s.moveTo(-420 * scaleX, -6);
    pts.forEach(function (p) { s.lineTo(p[0] * scaleX, p[1] * hScale); });
    s.lineTo(420 * scaleX, -6); s.closePath();
    var mesh = new T.Mesh(new T.ShapeGeometry(s), new T.MeshBasicMaterial({ color: color, side: T.DoubleSide, fog: false, toneMapped: false }));
    mesh.position.z = z; mesh.castShadow = false; mesh.receiveShadow = false;
    scene.add(mesh);
  }
  ridge([[-420, 0], [-330, 22], [-270, 12], [-190, 38], [-120, 16], [-40, 44], [30, 20], [110, 34], [190, 14], [270, 30], [350, 12], [420, 0]], 0x9a7c92, -300, 1, .22);
  ridge([[-420, 0], [-350, 12], [-280, 26], [-210, 10], [-140, 24], [-60, 8], [20, 20], [100, 9], [170, 26], [250, 11], [330, 20], [420, 0]], 0x6b5a76, -210, 1, .26);

  /* ---------- 光照 ---------- */
  var hemi = new T.HemisphereLight(0xffdcb4, 0x655b45, 1.0);
  scene.add(hemi);
  var ambient = new T.AmbientLight(0xb9c5d8, 0.32); scene.add(ambient);
  var sunLight = new T.DirectionalLight(0xffb877, 2.6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
  var sc = sunLight.shadow.camera;
  sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 240;
  sunLight.shadow.bias = -0.00025; sunLight.shadow.normalBias = 0.035;
  scene.add(sunLight); scene.add(sunLight.target);
  var fill = new T.DirectionalLight(0xa9c0dd, 0.68); fill.position.set(34, 26, 38); scene.add(fill);

  var indoorLights = [];
  function pointLight(x, y, z, power, dist) {
    var l = new T.PointLight(0xffb25e, 0, dist || 13, 2);
    l.position.set(x, y, z); l.userData.power = power; scene.add(l); indoorLights.push(l); return l;
  }
  pointLight(-3.5, 2.7, 3.0, 1.5, 13);
  pointLight(3.6, 4.3, 3.7, 1.6, 13);
  pointLight(0.0, 2.5, -2.6, 1.0, 12);
  pointLight(-3.5, 5.4, -2.9, 1.3, 11);
  pointLight(3.5, 5.4, -2.9, 1.3, 11);
  pointLight(3.5, 2.8, 6.2, 0.9, 9);

  /* ---------- 场地 ---------- */
  /* 圆形基地，边界之外是霞光云海 */
  put(env, UNIT.cir, MAT.soil, 0, -0.34, 0, 53.4, 53.4, 1, { rx: -Math.PI / 2, cast: false });
  put(env, UNIT.cir, MAT.grass, 0, -0.22, 0, 52, 52, 1, { rx: -Math.PI / 2, cast: false });
  /* 台基顶面压到 -0.03，与一层地板顶面 y=0 明确分离；
     原先两者完全共面，是地板闪烁的主因。冗余的台基草地平面已移除。 */
  box(env, 24, 0.22, 19, MAT.stone, 0, -0.14, 0.5, { cast: false });
  box(env, 24.4, 0.08, 19.4, MAT.roofEdge, 0, -0.22, 0.5, { cast: false });

  /* 石板步道 */
  for (var pi = 0; pi < 8; pi++) {
    box(env, 1.9, 0.06, 1.15, MAT.terrace, 3.4 + Math.sin(pi * .8) * .12, 0.015, 7.4 + pi * 1.45, { cast: false });
  }
  /* 前院木平台与门廊 */
  box(env, 6.4, 0.14, 2.6, MAT.oak, 3.4, 0.07, 6.2, { cast: false });
  box(env, 6.6, 0.1, 0.5, MAT.stone, 3.4, 0.03, 7.65, { cast: false });
  box(env, 5.6, 0.07, 0.3, MAT.stone, 3.4, 0.12, 7.3, { cast: false });

  /* 泳池 */
  (function () {
    var px = 13.8, pz = 10.2, w = 9.2, d = 6.4;
    box(env, w + .7, 0.12, d + .7, MAT.terrace, px, -0.12, pz, { cast: false });
    box(env, w, 0.5, d, MAT.pool, px, 0.02, pz, { cast: false });
    var edge = M(0xe4dfd2, .8);
    box(env, w + .5, 0.16, .3, edge, px, 0.29, pz - d / 2 - .15, { cast: false });
    box(env, w + .5, 0.16, .3, edge, px, 0.29, pz + d / 2 + .15, { cast: false });
    box(env, .3, 0.16, d + .5, edge, px - w / 2 - .15, 0.29, pz, { cast: false });
    box(env, .3, 0.16, d + .5, edge, px + w / 2 + .15, 0.29, pz, { cast: false });
    /* 水面抬到池体顶面(0.27)之上，原先埋在池体内部导致遮挡/闪烁 */
    flat(env, w - .15, d - .15, MAT.water, px, 0.29, pz, { recv: false });
    /* 木甲板 */
    box(env, 10.6, 0.12, 2.7, MAT.oak, px, 0.02, pz - d / 2 - 1.6, { cast: false });
    for (var i = 0; i < 12; i++) box(env, 10.4, 0.015, 0.03, MAT.woodDark, px, 0.10, pz - d / 2 - 2.85 + i * .22, { cast: false });
    /* 躺椅 x2 */
    function lounger(x, z) {
      var g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = -0.22; env.add(g);
      box(g, .75, 0.1, 1.9, MAT.fabric, 0, .36, 0);
      box(g, .75, 0.1, .78, MAT.fabric, 0, .68, -.6, { rx: -0.55 });
      box(g, .8, 0.06, .3, MAT.linen, 0, .44, .5);
      [[-.3, -.75], [.3, -.75], [-.3, .75], [.3, .75]].forEach(function (p) { box(g, .06, .3, .06, MAT.woodDark, p[0], .18, p[1]); });
    }
    lounger(px - 2.1, pz - d / 2 - 1.6); lounger(px + 1.3, pz - d / 2 - 1.6);
    /* 遮阳伞 */
    var ux = px + 3.4, uz = pz - d / 2 - 1.6;
    cyl(env, .045, 2.5, MAT.metal, ux, 1.3, uz);
    cone(env, 1.85, .62, MAT.fabricRust, ux, 2.62, uz);
    for (var k = 0; k < 8; k++) {
      var a = k * Math.PI / 4;
      box(env, .028, .035, 1.8, MAT.woodDark, ux + Math.cos(a) * .9, 2.34, uz + Math.sin(a) * .9, { ry: Math.PI / 2 - a, cast: false });
    }
    cyl(env, .13, .1, MAT.metal, ux, 2.97, uz);
    cyl(env, .42, .07, MAT.stone, ux, .1, uz);
    /* 泳池边小桌 */
    cyl(env, .34, .05, MAT.marble, px - .4, .48, pz - d / 2 - 1.6);
    cyl(env, .06, .45, MAT.metal, px - .4, .24, pz - d / 2 - 1.6);
  })();

  /* 草坪灯 */
  function gardenLight(x, z) {
    cyl(env, .055, .48, MAT.metal, x, .24, z);
    var b = ball(env, .11, MAT.lamp, x, .55, z, { cast: false });
    box(env, .18, .05, .18, MAT.metal, x, .45, z);
    return b;
  }
  [[-9.5, 7.4], [-9.5, -6], [8.2, 7.4], [9.6, 1.6], [-2.5, 8.2], [1.2, 8.2]].forEach(function (p) { gardenLight(p[0], p[1]); });

  /* 树 / 灌木 */
  function tree(x, z, s) {
    var g = new T.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); env.add(g);
    cyl(g, .23, 2.5, MAT.trunk, 0, 1.25, 0);
    var cols = [MAT.leaf, MAT.leaf2, M(0x6d8748, .95)];
    [[0, 3.0, 0, 1.45], [-.85, 2.65, .35, 1.05], [.9, 2.8, -.3, 1.1], [.15, 3.85, .1, 1.15], [-.45, 3.5, -.7, .85]]
      .forEach(function (p, i) {
        put(g, UNIT.ico, cols[i % 3], p[0], p[1], p[2], p[3], p[3] * .8, p[3], { ry: i });
      });
  }
  [[-14.5, -7, 1.15], [-16, 4, .95], [-12.5, 13, 1.05], [-4, -12, 1.1], [5, -12.5, .95],
   [13, -9, 1.1], [22, -2, 1], [27, 9, .9], [-21, 12, 1.25], [-20, -3, 1], [26, 21, .95]]
    .forEach(function (p) { tree(p[0], p[1], p[2]); });
  function bush(x, z, s) {
    for (var i = 0; i < 4; i++) {
      put(env, UNIT.ico, i % 2 ? MAT.leaf : MAT.leaf2, x + rr(-.45, .45), .32 * s, z + rr(-.4, .4), .55 * s, .45 * s, .55 * s);
    }
  }
  [[-9, -4], [-9, 0], [-9, 4], [8.8, -4.5], [-7.5, -8], [0, -8], [7.5, -8], [-11, -8.5], [11, -8.5]]
    .forEach(function (p) { bush(p[0], p[1], rr(.8, 1.3)); });
  /* 后院木栅栏 */
  for (var fi = -11; fi <= 11; fi += 1.1) box(env, .09, .95, .12, MAT.wood, fi, .47, -9.6);
  box(env, 22.4, .07, .1, MAT.woodDark, 0, .82, -9.6);
  box(env, 22.4, .07, .1, MAT.woodDark, 0, .28, -9.6);

  /* ---------- 建筑外壳 ---------- */
  var W = 14, D = 10, H1 = 3.2, SY = 3.32, B = 3.47, H2 = 3.15, RY = 6.72;
  /* 一层地板 */
  box(base, W, 0.12, D, MAT.floor, 0, -0.06, 0, { cast: false });
  box(base, W + .5, 0.16, D + .5, MAT.stone, 0, -0.16, 0, { cast: false });
  /* 后墙（分段留窗） */
  box(base, 5.2, H1, .2, MAT.wall, -4.4, H1 / 2, -5);
  box(base, 5.2, H1, .2, MAT.wall, 4.4, H1 / 2, -5);
  box(base, 3.7, H1, .2, MAT.wall, 0, H1 / 2, -5);
  box(base, 3.6, 1.9, .04, MAT.glass, 0, 1.75, -4.88, { cast: false });
  box(base, 3.8, .07, .12, MAT.metal, 0, 2.72, -4.86);
  box(base, 3.8, .07, .12, MAT.metal, 0, .8, -4.86);
  /* 左墙 */
  box(base, .2, H1, D, MAT.wall, -7, H1 / 2, 0);
  box(base, .04, 2.0, 3.2, MAT.glass, -6.88, 1.7, -2.6, { cast: false });
  box(base, .1, 2.15, 3.35, MAT.metal, -6.86, 1.7, -2.6, { cast: false });
  /* 右墙：实墙 + 竖窗 + 木饰条 */
  box(base, .2, H1, 4.2, MAT.wall, 7, H1 / 2, -2.9);
  box(base, .2, H1, 1.0, MAT.wall, 7, H1 / 2, 4.5);
  box(base, .2, H1, 3.8, MAT.wall, 7, H1 / 2, 1.9);
  box(base, .04, 2.55, 1.5, MAT.glass, 6.88, 1.65, 2.6, { cast: false });
  for (var wi = 0; wi < 5; wi++) box(base, .06, 2.9, .12, MAT.wood, 6.86, 1.5, -4.6 + wi * .32);
  /* 正面全高玻璃幕墙 */
  box(base, W, .16, .18, MAT.metal, 0, .08, 5);
  for (var gi = 0; gi < 6; gi++) {
    var gx = -7 + (gi + .5) * (W / 6);
    if (gi === 4) continue;
    box(base, 2.2, 6.18, .045, MAT.glass, gx, 3.15, 5, { cast: false, recv: false });
  }
  for (var fi2 = 0; fi2 <= 6; fi2++) box(base, .085, 6.45, .13, MAT.metal, -7 + fi2 * (W / 6), 3.22, 5);
  [0.08, 3.32, 6.45].forEach(function (yy) { box(base, W, .09, .13, MAT.metal, 0, yy, 5); });
  /* 入口木门 */
  box(base, 2.15, 2.65, .1, MAT.woodDark, 3.5, 1.4, 5.02);
  box(base, .06, .45, .06, MAT.gold, 4.28, 1.45, 5.1, { cast: false });
  box(base, .9, 1.9, .03, MAT.glassDark, 3.5, 1.7, 5.08, { cast: false });
  /* 门廊顶与柱 */
  box(base, 6.2, .18, 2.7, MAT.warmWall, 3.4, 3.05, 6.25);
  [0.7, 6.1].forEach(function (x) { box(base, .18, 3.0, .18, MAT.metal, x, 1.5, 7.45); });
  box(base, 6.2, .09, .09, MAT.metal, 3.4, 3.18, 7.5);
  /* 正面角柱 */
  [-7.05, 7.05].forEach(function (x) { box(base, .3, 6.5, .3, MAT.metal, x, 3.25, 5.05); });

  /* 电视/空间隔断（一层 z=1） */
  box(base, 6.6, 2.85, .18, MAT.warmWall, -3.6, 1.425, 1.0);
  box(base, 6.6, .12, .28, MAT.woodDark, -3.6, 2.9, 1.0);
  box(base, 5.6, .9, .62, MAT.woodDark, 3.7, .45, 1.0);
  box(base, 5.8, .08, .72, MAT.marble, 3.7, .94, 1.0);
  box(base, 5.6, .72, .45, MAT.oak, 3.7, 2.25, .88);
  for (var hi = 0; hi < 4; hi++) cyl(base, .13, .02, MAT.black, 2.6 + hi * .55, 1.0, .85);
  taper(base, .5, .3, .5, MAT.metal, 3.7, 2.95, .88);

  /* 二层楼板 + 墙体 */
  box(slab, W, .26, 6.05, MAT.wall, 0, SY, -2.0);
  box(slab, W, .06, 6.05, MAT.floor, 0, B - .02, -2.0, { cast: false });
  box(slab, W, .1, .16, MAT.metal, 0, SY - .18, 1.0);
  box(slab, .2, H2, 6.05, MAT.wall, -7, B + H2 / 2, -2.0);
  box(slab, .2, H2, 6.05, MAT.wall, 7, B + H2 / 2, -2.0);
  box(slab, W, H2, .2, MAT.wall, 0, B + H2 / 2, -5.0);
  box(slab, .16, H2, 2.0, MAT.wallIn, 0, B + H2 / 2, -4.0);
  box(slab, .16, H2, 2.0, MAT.wallIn, 0, B + H2 / 2, .0);
  /* 二层窗 */
  box(slab, .04, 1.7, 2.4, MAT.glass, -6.88, B + 1.7, -2.8, { cast: false });
  box(slab, .04, 1.7, 2.4, MAT.glass, 6.88, B + 1.7, -2.8, { cast: false });
  box(slab, .1, 1.85, 2.55, MAT.metal, 6.84, B + 1.7, -2.8, { cast: false });
  /* 二层临挑空玻璃栏板 */
  box(slab, W, 1.05, .05, MAT.glass, 0, B + .55, 1.0, { cast: false, recv: false });
  box(slab, W, .07, .1, MAT.woodDark, 0, B + 1.1, 1.0);
  box(slab, W, .06, .1, MAT.metal, 0, B + .04, 1.0);
  for (var bi = 0; bi <= 7; bi++) box(slab, .06, 1.1, .08, MAT.metal, -7 + bi * 2, B + .55, 1.0);

  /* 屋顶（默认隐藏） */
  box(roof, 15.6, .3, 11.6, MAT.roof, 0, RY, 0);
  box(roof, 16.0, .09, 12.0, MAT.roofEdge, 0, RY - .2, 0);
  box(roof, 15.8, .12, .18, MAT.metal, 0, RY + .2, 5.8);
  box(roof, 4.2, .05, 2.6, MAT.glassDark, -3.4, RY + .18, -2.2, { cast: false });
  box(roof, 4.35, .04, .09, MAT.metal, -3.4, RY + .2, -3.5);
  box(roof, 4.35, .04, .09, MAT.metal, -3.4, RY + .2, -.9);
  [0, 1].forEach(function (i) { box(roof, 2.2, .05, 1.3, MAT.glassDark, 2.4 + i * 2.5, RY + .19, -2.4, { cast: false }); });

  /* ---------- 家具构件 ---------- */
  function chair(g, x, z, ry, mat, sc) {
    var c = new T.Group(); c.position.set(x, 0, z); c.rotation.y = ry || 0;
    c.scale.setScalar(sc || 1); g.add(c);
    box(c, .48, .07, .48, mat, 0, .45, 0);
    box(c, .48, .55, .07, mat, 0, .73, -.21);
    [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]].forEach(function (p) { box(c, .05, .44, .05, MAT.woodDark, p[0], .22, p[1]); });
  }
  function plant(g, x, z, s) {
    var p = new T.Group(); p.position.set(x, 0, z); p.scale.setScalar(s || 1); g.add(p);
    taper(p, .27, .19, .42, MAT.fabricRust, 0, .21, 0);
    cyl(p, .045, 1.0, MAT.trunk, 0, .85, 0);
    for (var i = 0; i < 7; i++) {
      var a = i * 2.4, h = .75 + i * .1;
      var leaf = put(p, UNIT.sph, i % 2 ? MAT.leaf : MAT.leaf2, Math.cos(a) * .3, h + .55, Math.sin(a) * .3, .3, .1, .16, { ry: a, rz: .35 });
      leaf.castShadow = true;
    }
  }
  function floorLamp(g, x, z, s) {
    var p = new T.Group(); p.position.set(x, 0, z); p.scale.setScalar(s || 1); g.add(p);
    cyl(p, .18, .04, MAT.metal, 0, .02, 0);
    cyl(p, .028, 1.55, MAT.metal, 0, .8, 0);
    taper(p, .12, .28, .38, MAT.lamp, 0, 1.72, 0, { cast: false });
  }
  function tableLamp(g, x, y, z) {
    cyl(g, .11, .03, MAT.metal, x, y + .015, z);
    cyl(g, .025, .24, MAT.gold, x, y + .14, z);
    taper(g, .1, .19, .23, MAT.lamp, x, y + .36, z, { cast: false });
  }
  function picture(g, w, h, x, y, z, col, ry) {
    box(g, w + .08, h + .08, .05, MAT.woodDark, x, y, z, { ry: ry || 0 });
    box(g, w, h, .01, M(col, .8), x, y, z + .035, { cast: false, ry: ry || 0 });
  }
  function books(g, x, y, z, n, ry, axis) {
    for (var i = 0; i < n; i++) {
      var alongZ = axis === 'z';
      box(g, alongZ ? .16 : rr(.055, .1), rr(.22, .34), alongZ ? .075 : .16,
        BOOK[i % BOOK.length], alongZ ? x : x + i * .093, y + .16,
        alongZ ? z + i * .093 : z + rr(-.012, .012),
        { ry: alongZ ? Math.PI / 2 : (ry || 0), rz: rr(-.09, .09) });
    }
  }
  var F2FLOOR = B + .01; /* 二层木地板顶面标高 */
  function rug(g, w, d, m, x, z, level) {
    /* level = 所在楼面标高；地毯底面离地 10mm，避免与地板共面闪烁 */
    box(g, w, .03, d, m, x, (level || 0) + .025, z, { cast: false });
  }

  /* ===== 一层 · 挑空客厅 ===== */
  rug(f1, 5.2, 3.5, MAT.rug, -3.5, 3.0, 0);
  rug(f1, 4.7, 3.0, MAT.fabric2, -3.5, 3.0, .045); /* 叠毯抬高，避免两毯共面 */
  /* 电视 + 电视柜 */
  box(f1, 2.45, 1.42, .08, MAT.black, -3.6, 2.0, 1.13);
  put(f1, UNIT.pln, MAT.screen, -3.6, 2.0, 1.18, 2.3, 1.28, 1, { cast: false, recv: false });
  box(f1, 3.0, .4, .48, MAT.woodDark, -3.6, .27, 1.34);
  box(f1, 3.1, .05, .55, MAT.oak, -3.6, .5, 1.34);
  /* 壁炉 */
  box(f1, 1.55, 1.35, .32, MAT.stone, -6.15, .68, 1.2);
  box(f1, 1.05, .72, .06, MAT.black, -6.15, .6, 1.38, { cast: false });
  cone(f1, .22, .55, MAT.flame, -6.32, .5, 1.42, { cast: false });
  cone(f1, .16, .42, MAT.flame, -6.0, .45, 1.43, { cast: false });
  box(f1, 1.75, .1, .5, MAT.marble, -6.15, 1.4, 1.2);
  /* L 形沙发 */
  (function () {
    var s = new T.Group(); f1.add(s);
    box(s, 3.25, .18, 1.12, MAT.woodDark, -3.45, .16, 3.9);
    box(s, 3.2, .38, 1.05, MAT.fabric, -3.45, .42, 3.9);
    box(s, 3.2, .68, .24, MAT.fabric, -3.45, .9, 4.36);
    box(s, .24, .58, 1.12, MAT.fabric, -5.02, .58, 3.9);
    box(s, .24, .58, 1.12, MAT.fabric, -1.88, .58, 3.9);
    for (var i = 0; i < 3; i++) box(s, .98, .14, .86, MAT.fabric2, -4.47 + i * 1.02, .68, 3.87);
    [[-4.6, 4.12, MAT.fabricBlue], [-3.4, 4.12, MAT.fabricRust], [-2.35, 4.12, MAT.fabricGreen], [-4.1, 4.14, MAT.linen]]
      .forEach(function (p, i) { box(s, .4, .4, .15, p[2], p[0], .93, p[1], { rz: (i % 2 ? .16 : -.16) }); });
    /* 贵妃位 */
    box(s, 1.05, .36, 1.55, MAT.fabric, -5.6, .4, 2.55);
    box(s, .22, .62, 1.6, MAT.fabric, -6.08, .72, 2.55);
    box(s, 1.0, .14, 1.4, MAT.fabric2, -5.6, .64, 2.55);
    /* 沙发腿 */
    [[-4.9, 3.45], [-2, 3.45], [-4.9, 4.35], [-2, 4.35]].forEach(function (p) { cyl(s, .035, .16, MAT.woodDark, p[0], .08, p[1]); });
  })();
  /* 茶几 */
  box(f1, 1.55, .09, .82, MAT.oak, -3.45, .45, 2.35);
  box(f1, 1.6, .05, .86, MAT.woodDark, -3.45, .5, 2.35);
  [[-4.1, 2.05], [-2.8, 2.05], [-4.1, 2.65], [-2.8, 2.65]].forEach(function (p) { box(f1, .06, .42, .06, MAT.metal, p[0], .22, p[1]); });
  box(f1, .38, .045, .27, M(0x8a5f52, .9), -3.75, .55, 2.3, { ry: .2 });
  box(f1, .34, .04, .24, M(0x5c6f7a, .9), -3.7, .6, 2.33, { ry: .08 });
  taper(f1, .07, .1, .26, MAT.porcelain, -3.1, .65, 2.3);
  for (var fli = 0; fli < 3; fli++) ball(f1, .055, MAT.fabricRust, -3.1 + (fli - 1) * .09, .88 + fli * .05, 2.3 + (fli % 2) * .06, { cast: false });
  /* 单人扶手椅 + 边几 */
  (function () {
    var a = new T.Group(); a.position.set(-6.1, 0, 3.0); a.rotation.y = .7; f1.add(a);
    box(a, .85, .18, .85, MAT.fabricBlue, 0, .35, 0);
    box(a, .85, .72, .18, MAT.fabricBlue, 0, .78, -.34);
    box(a, .16, .42, .85, MAT.fabricBlue, -.35, .6, 0);
    box(a, .16, .42, .85, MAT.fabricBlue, .35, .6, 0);
    [[-.32, -.32], [.32, -.32], [-.32, .32], [.32, .32]].forEach(function (p) { cyl(a, .035, .3, MAT.woodDark, p[0], .15, p[1]); });
  })();
  cyl(f1, .28, .05, MAT.marble, -5.05, .52, 3.1);
  cyl(f1, .05, .5, MAT.gold, -5.05, .26, 3.1);
  floorLamp(f1, -1.35, 4.3, 1);
  plant(f1, -.85, 1.7, 1.1);
  plant(f1, -6.6, 4.55, .85);
  picture(f1, .8, 1.05, -5.3, 2.05, 1.12, 0x9b7f68);
  picture(f1, .8, 1.05, -4.35, 2.05, 1.12, 0x7d8b84);

  /* ===== 一层 · 餐厅与厨房 ===== */
  rug(f1, 4.2, 3.2, MAT.rugBlue, 3.6, 3.6, 0);
  /* 餐桌 */
  box(f1, 2.5, .1, 1.15, MAT.oak, 3.6, .76, 3.75);
  box(f1, 2.55, .045, 1.2, MAT.woodDark, 3.6, .82, 3.75);
  [[2.85, 3.75], [4.35, 3.75]].forEach(function (p) { box(f1, .16, .72, .75, MAT.woodDark, p[0], .38, p[1]); });
  chair(f1, 2.45, 3.15, 0, MAT.fabric, 1); chair(f1, 3.6, 3.05, 0, MAT.fabric, 1);
  chair(f1, 4.75, 3.15, 0, MAT.fabric, 1);
  chair(f1, 2.45, 4.35, Math.PI, MAT.fabric, 1); chair(f1, 3.6, 4.45, Math.PI, MAT.fabric, 1);
  chair(f1, 4.75, 4.35, Math.PI, MAT.fabric, 1);
  /* 餐具 */
  [[2.85, 3.45], [3.6, 3.45], [4.35, 3.45], [2.85, 4.05], [3.6, 4.05], [4.35, 4.05]].forEach(function (p) {
    cyl(f1, .17, .02, MAT.porcelain, p[0], .85, p[1], { cast: false });
  });
  taper(f1, .06, .1, .32, MAT.glassDark, 3.6, 1.0, 3.75, { cast: false });
  for (var fwi = 0; fwi < 4; fwi++) ball(f1, .06, MAT.fabricRust, 3.6 + Math.cos(fwi * 1.6) * .1, 1.2 + fwi * .05, 3.75 + Math.sin(fwi * 1.6) * .1, { cast: false });
  [[3.0, 3.75], [4.2, 3.75]].forEach(function (p) { cyl(f1, .028, .22, MAT.linen, p[0], .95, p[1]); cone(f1, .035, .1, MAT.flame, p[0], 1.11, p[1], { cast: false }); });
  /* 吊灯 */
  for (var li2 = 0; li2 < 3; li2++) {
    var lx = 2.75 + li2 * .85;
    cyl(f1, .012, 1.7, MAT.metal, lx, 5.45, 3.75, { cast: false });
    taper(f1, .08, .24, .3, MAT.lamp, lx, 4.45, 3.75, { cast: false });
    ball(f1, .075, MAT.lamp, lx, 4.32, 3.75, { cast: false });
  }
  /* 中岛吧椅 */
  for (var sti = 0; sti < 3; sti++) {
    var sx = 2.55 + sti * 1.15;
    cyl(f1, .22, .07, MAT.fabricGreen, sx, .68, 1.72);
    cyl(f1, .045, .65, MAT.metal, sx, .34, 1.72);
    cyl(f1, .2, .03, MAT.metal, sx, .04, 1.72);
    box(f1, .44, .4, .06, MAT.fabricGreen, sx, .92, 1.98);
  }
  /* 台面小物 */
  cyl(f1, .13, .03, MAT.porcelain, 5.4, .99, 1.0);
  taper(f1, .08, .11, .22, MAT.porcelain, 5.0, 1.09, 1.0);

  /* ===== 一层后部（剖切时可见） ===== */
  for (var st = 0; st < 15; st++) {
    box(f1, 2.1, .2, .36, MAT.oak, .4, .1 + st * .215, .55 - st * .36);
    box(f1, 2.1, .03, .38, MAT.woodDark, .4, .215 + st * .215, .55 - st * .36, { cast: false });
  }
  box(f1, .06, 1.0, 5.4, MAT.glass, 1.5, 2.05, -2.0, { cast: false, recv: false });
  box(f1, .07, .06, 5.4, MAT.woodDark, 1.5, 2.57, -2.0);
  /* 影音角 */
  rug(f1, 3.4, 2.6, MAT.fabric2, -4.0, -2.8, 0);
  box(f1, 2.4, .38, 1.0, MAT.fabricBlue, -4.0, .4, -4.0);
  box(f1, 2.4, .65, .22, MAT.fabricBlue, -4.0, .85, -4.45);
  box(f1, 1.0, .06, .6, MAT.oak, -4.0, .4, -2.7);
  box(f1, 2.8, 1.6, .04, MAT.linen, -4.0, 1.9, -4.86, { cast: false });
  picture(f1, 1.0, .7, -4.0, 2.9, -4.86, 0x6d7c83);
  plant(f1, -6.3, -2.0, .95);
  /* 卫浴角 */
  box(f1, 1.5, .12, .62, MAT.marble, 4.4, .9, -4.65);
  box(f1, 1.4, .75, .55, MAT.woodDark, 4.4, .45, -4.65);
  cyl(f1, .24, .14, MAT.porcelain, 4.4, 1.03, -4.6);
  box(f1, .9, 1.1, .03, MAT.glassDark, 4.4, 2.0, -4.88, { cast: false });
  box(f1, 2.2, .55, 1.1, MAT.porcelain, 4.7, .28, -2.2);
  box(f1, 1.9, .06, .85, MAT.water, 4.7, .57, -2.2, { cast: false });

  /* ===== 二层 · 主卧 ===== */
  rug(f2, 3.9, 2.8, MAT.rug, -3.5, -2.1, F2FLOOR);
  (function () {
    var y = B;
    box(f2, 2.35, .32, 2.35, MAT.woodDark, -3.5, y + .18, -3.1);
    box(f2, 2.25, .26, 2.25, MAT.linen, -3.5, y + .47, -3.1);
    box(f2, 2.3, .1, 1.35, MAT.fabricBlue, -3.5, y + .64, -2.62);
    box(f2, 2.3, .07, .35, MAT.fabric2, -3.5, y + .68, -1.94);
    box(f2, 2.55, 1.15, .2, MAT.fabric, -3.5, y + .78, -4.28);
    box(f2, 2.6, .08, .28, MAT.oak, -3.5, y + 1.38, -4.28);
    [[-4.05, -3.95], [-2.95, -3.95]].forEach(function (p) { box(f2, .85, .16, .45, MAT.linen, p[0], y + .68, p[1]); });
    box(f2, 1.7, .06, .45, MAT.oak, -3.5, y + .45, -1.72);
    [[-4.2, -1.72], [-2.8, -1.72]].forEach(function (p) { box(f2, .07, .42, .07, MAT.woodDark, p[0], y + .22, p[1]); });
  })();
  /* 床头柜 + 台灯 */
  [[-5.15, -4.05], [-1.85, -4.05]].forEach(function (p) {
    box(f2, .62, .52, .55, MAT.oak, p[0], B + .26, p[1]);
    box(f2, .66, .04, .58, MAT.woodDark, p[0], B + .54, p[1]);
    tableLamp(f2, p[0], B + .56, p[1]);
  });
  /* 衣柜 */
  box(f2, .62, 2.45, 3.1, MAT.woodDark, -6.55, B + 1.22, -2.5);
  for (var dr = 0; dr < 4; dr++) {
    box(f2, .03, 2.25, .04, MAT.gold, -6.22, B + 1.22, -3.95 + dr * .78, { cast: false });
    cyl(f2, .02, .22, MAT.gold, -6.2, B + 1.35, -3.6 + dr * .78, { rz: Math.PI / 2, cast: false });
  }
  /* 休闲椅 / 边几 / 落地灯 */
  (function () {
    var a = new T.Group(); a.position.set(-6.0, B, -.2); a.rotation.y = .5; f2.add(a);
    box(a, .8, .18, .78, MAT.fabricRust, 0, .35, 0);
    box(a, .8, .68, .17, MAT.fabricRust, 0, .78, -.32);
    box(a, .15, .4, .78, MAT.fabricRust, -.32, .58, 0);
    box(a, .15, .4, .78, MAT.fabricRust, .32, .58, 0);
    [[-.3, -.3], [.3, -.3], [-.3, .3], [.3, .3]].forEach(function (p) { cyl(a, .035, .3, MAT.woodDark, p[0], .15, p[1]); });
  })();
  cyl(f2, .3, .05, MAT.marble, -5.0, B + .5, -.1);
  cyl(f2, .045, .48, MAT.gold, -5.0, B + .25, -.1);
  floorLamp(f2, -1.35, -.3, .9);
  plant(f2, -1.4, -4.5, .85);
  picture(f2, 1.3, .85, -3.5, B + 2.15, -4.86, 0xb08a6c);
  /* 窗帘 */
  box(f2, .55, 2.2, .06, MAT.linen, -5.6, B + 1.85, -4.82, { cast: false });
  box(f2, .55, 2.2, .06, MAT.linen, -1.4, B + 1.85, -4.82, { cast: false });

  /* ===== 二层 · 书房 ===== */
  rug(f2, 3.6, 2.8, MAT.rugBlue, 3.5, -2.5, F2FLOOR);
  /* 书桌 */
  box(f2, 2.3, .09, 1.0, MAT.oak, 3.5, B + .76, -3.7);
  box(f2, 2.35, .05, 1.05, MAT.woodDark, 3.5, B + .82, -3.7);
  [[2.45, -4.1], [4.55, -4.1], [2.45, -3.3], [4.55, -3.3]].forEach(function (p) { box(f2, .07, .72, .07, MAT.metal, p[0], B + .37, p[1]); });
  box(f2, 1.9, .5, .06, MAT.woodDark, 3.5, B + .35, -4.1);
  /* 笔记本电脑 */
  box(f2, .62, .025, .42, MAT.metal, 3.2, B + .87, -3.7, { ry: .12 });
  box(f2, .62, .4, .02, MAT.metal, 3.2, B + 1.08, -3.93, { rx: -.18, ry: .12 });
  box(f2, .57, .35, .01, MAT.screen, 3.2, B + 1.08, -3.91, { rx: -.18, ry: .12, cast: false });
  tableLamp(f2, 4.5, B + .84, -3.9);
  books(f2, 2.65, B + .86, -3.45, 4, .1);
  /* 办公椅 */
  (function () {
    var c = new T.Group(); c.position.set(3.5, B, -2.65); f2.add(c);
    box(c, .62, .12, .58, MAT.fabricBlue, 0, .48, 0);
    box(c, .6, .7, .1, MAT.fabricBlue, 0, .86, -.25);
    cyl(c, .05, .4, MAT.metal, 0, .25, 0);
    for (var i = 0; i < 5; i++) { var a = i * 1.256; box(c, .38, .05, .06, MAT.metal, Math.cos(a) * .18, .07, Math.sin(a) * .18, { ry: -a }); }
  })();
  /* 书架 */
  box(f2, .45, 2.55, 3.2, MAT.woodDark, 6.62, B + 1.28, -2.7);
  for (var sh = 0; sh < 4; sh++) {
    var sy = B + .2 + sh * .68;
    box(f2, .5, .05, 3.15, MAT.oak, 6.55, sy, -2.7);
    if (sh < 3) books(f2, 6.32, sy + .04, -4.15, 27, 0, 'z');
  }
  /* 单人沙发 + 边几 */
  (function () {
    var a = new T.Group(); a.position.set(1.5, B, -.35); a.rotation.y = -.6; f2.add(a);
    box(a, .95, .2, .9, MAT.fabricGreen, 0, .35, 0);
    box(a, .95, .68, .18, MAT.fabricGreen, 0, .78, -.38);
    box(a, .17, .42, .9, MAT.fabricGreen, -.4, .6, 0);
    box(a, .17, .42, .9, MAT.fabricGreen, .4, .6, 0);
  })();
  cyl(f2, .32, .05, MAT.oak, 2.5, B + .48, -.1);
  cyl(f2, .05, .46, MAT.metal, 2.5, B + .24, -.1);
  cyl(f2, .07, .03, MAT.porcelain, 2.5, B + .53, -.1);
  floorLamp(f2, 5.6, -.4, .9);
  plant(f2, 1.2, -4.5, .9);
  picture(f2, 1.1, .8, 3.5, B + 2.2, -4.86, 0x7f8c76);

  /* ---------- 状态 / 可见性 ---------- */
  var state = { floor: 'all', roof: false, furniture: true, lights: true, rotate: false, t: .62 };
  function applyVisibility() {
    var fl = state.floor;
    f1.visible = state.furniture && (fl === 'all' || fl === '1');
    slab.visible = (fl === 'all' || fl === '2' || fl === 'shell');
    f2.visible = state.furniture && (fl === 'all' || fl === '2');
    roof.visible = state.roof && fl === 'all';
    document.getElementById('swRoof').classList.toggle('on', state.roof);
    document.getElementById('swFurniture').classList.toggle('on', state.furniture);
    document.getElementById('swLights').classList.toggle('on', state.lights);
    document.getElementById('swRotate').classList.toggle('on', state.rotate);
  }

  /* ---------- 时间 / 光照 ---------- */
  var skyZenithA = new T.Color(0x2f5891), skyZenithB = new T.Color(0x131634);
  var skyHorA = new T.Color(0xf5bc80), skyHorB = new T.Color(0x8b4352);
  var skyHazeA = new T.Color(0xcaa17e), skyHazeB = new T.Color(0x3a3348);
  var sunA = new T.Color(0xffd39a), sunB = new T.Color(0xff7048);
  var lightA = new T.Color(0xffd9ab), lightB = new T.Color(0xff7845);
  var fogA = new T.Color(0xe0b48c), fogB = new T.Color(0x4a4058);
  var tmpC = new T.Color();
  function setTime(t) {
    state.t = t;
    var sy = 0.42 - t * 0.61;
    sunDir.set(-0.70, sy, -0.66).normalize();
    /* 太阳圆盘贴近地平线，主光略抬高以获得好看的长影 */
    var lightDir = new T.Vector3(-0.70, 0.30 + sy * 0.16, -0.66).normalize();
    sunLight.position.copy(lightDir).multiplyScalar(85);
    sunLight.target.position.set(0, 0, 0);
    skyU.uSunDir.value.copy(sunDir);
    skyU.uZenith.value.copy(skyZenithA).lerp(skyZenithB, Math.pow(t, 1.4));
    skyU.uHorizon.value.copy(skyHorA).lerp(skyHorB, Math.pow(t, 1.5));
    skyU.uHaze.value.copy(skyHazeA).lerp(skyHazeB, t);
    skyU.uSun.value.copy(sunA).lerp(sunB, t);
    sunLight.color.copy(lightA).lerp(lightB, t);
    sunLight.intensity = 3.05 - t * 2.25;
    hemi.intensity = 1.06 - t * 0.48;
    hemi.color.copy(tmpC.set(0xffdfba)).lerp(new T.Color(0x8891bd), t);
    fill.intensity = 0.62 + t * 0.30;
    ambient.intensity = 0.34 - t * 0.10;
    scene.fog.color.copy(fogA).lerp(fogB, t);
    scene.fog.density = 0.0024 + t * 0.0006;
    var expo = 1.28 - t * 0.20;
    renderer.toneMappingExposure = expo;
    skyU.uExposure.value = expo;
    var lit = state.lights ? (0.25 + Math.pow(t, 1.5) * 1.75) : 0;
    indoorLights.forEach(function (l) { l.intensity = l.userData.power * lit; });
    MAT.lamp.emissiveIntensity = state.lights ? (0.45 + t * 2.0) : 0.02;
    MAT.flame.emissiveIntensity = 2.2;
    /* 时刻文字 */
    var mins = 16 * 60 + Math.round(t * 240);
    var hh = Math.floor(mins / 60), mm = mins % 60;
    var label = t < .30 ? '午后斜阳' : (t < .72 ? '黄金时刻' : (t < .90 ? '日落时分' : '暮色四合'));
    document.getElementById('timeLabel').textContent =
      (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + ' · ' + label;
  }

  /* ---------- 相机控制 ---------- */
  var fitR = 1; /* 竖屏时按宽度拉远相机，避免窄视口把别墅裁掉 */
  var cam = {
    theta: .70, phi: 1.24, radius: 43, target: new T.Vector3(0, 2.0, 0),
    tTheta: .70, tPhi: 1.24, tRadius: 43, tTarget: new T.Vector3(0, 2.0, 0)
  };
  var VIEWS = {
    overview: { th: .70, ph: 1.24, r: 43, tg: [0, 2.0, 0], roof: false, floor: 'all' },
    exterior: { th: .80, ph: 1.36, r: 37, tg: [0, 2.9, 0], roof: true, floor: 'all' },
    living:   { th: .42, ph: 1.12, r: 16, tg: [-3.4, 1.7, 2.9], roof: false, floor: 'all' },
    dining:   { th: -.28, ph: 1.08, r: 15, tg: [3.5, 1.7, 3.2], roof: false, floor: 'all' },
    bedroom:  { th: .52, ph: .82, r: 14, tg: [-3.5, 4.3, -2.6], roof: false, floor: 'all' },
    study:    { th: -.18, ph: .80, r: 14, tg: [3.5, 4.4, -2.6], roof: false, floor: 'all' },
    pool:     { th: 1.10, ph: 1.40, r: 36, tg: [7.0, 1.4, 6.0], roof: true, floor: 'all' }
  };
  function gotoView(name) {
    var v = VIEWS[name]; if (!v) return;
    cam.tTheta = v.th; cam.tPhi = v.ph; cam.tRadius = v.r * fitR; cam.tTarget.set(v.tg[0], v.tg[1], v.tg[2]);
    state.roof = v.roof; state.floor = v.floor; applyVisibility();
    document.querySelectorAll('#views .vbtn').forEach(function (b) { b.classList.toggle('on', b.dataset.view === name); });
    document.querySelectorAll('#floors .fbtn').forEach(function (b) { b.classList.toggle('on', b.dataset.floor === v.floor); });
  }
  function updateCam(dt) {
    if (state.rotate) cam.tTheta += dt * 0.10;
    var k = 1 - Math.pow(0.001, dt);
    cam.theta += (cam.tTheta - cam.theta) * k;
    cam.phi += (cam.tPhi - cam.phi) * k;
    cam.radius += (cam.tRadius - cam.radius) * k;
    cam.target.lerp(cam.tTarget, k);
    var sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
    camera.position.set(
      cam.target.x + cam.radius * sp * Math.sin(cam.theta),
      cam.target.y + cam.radius * cp,
      cam.target.z + cam.radius * sp * Math.cos(cam.theta)
    );
    camera.lookAt(cam.target);
  }
  /* 鼠标 / 触摸统一走 Pointer Events；移动端双指 = 缩放 + 平移 */
  var pointers = new Map(), lastX = 0, lastY = 0, panMode = false;
  var pinch = 0, midX = null, midY = null;
  var ROT_K = LOW ? .0042 : .005;
  function clampR(v) { return Math.max(7, Math.min(130, v)); }
  function panBy(dx, dy) {
    var right = new T.Vector3(Math.cos(cam.theta), 0, -Math.sin(cam.theta));
    var fwd = new T.Vector3(Math.sin(cam.theta), 0, Math.cos(cam.theta));
    var k = cam.radius * .0012;
    cam.tTarget.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
  }
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('pointerdown', function (e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 某些移动浏览器多指会抛错 */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastX = e.clientX; lastY = e.clientY;
    panMode = (e.button === 2 || e.shiftKey);
    closePanel(); hideHint();
    if (pointers.size === 2) {
      var p = Array.from(pointers.values());
      pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      midX = (p[0].x + p[1].x) / 2; midY = (p[0].y + p[1].y) / 2;
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      var p = Array.from(pointers.values());
      var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      var cx = (p[0].x + p[1].x) / 2, cy = (p[0].y + p[1].y) / 2;
      if (pinch > 0 && d > 0) {
        cam.tRadius = clampR(cam.tRadius * (pinch / d));
        if (midX !== null) panBy(cx - midX, cy - midY);
      }
      pinch = d; midX = cx; midY = cy;
      return;
    }
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (panMode) panBy(dx, dy);
    else {
      cam.tTheta -= dx * ROT_K;
      cam.tPhi = Math.max(.12, Math.min(1.50, cam.tPhi - dy * (LOW ? .0036 : .004)));
    }
  });
  function endPtr(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) { pinch = 0; midX = midY = null; }
    if (pointers.size === 1) {
      var p = Array.from(pointers.values())[0];
      lastX = p.x; lastY = p.y; panMode = false;
    }
  }
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    cam.tRadius = clampR(cam.tRadius * (1 + e.deltaY * .0009));
  }, { passive: false });
  canvas.addEventListener('dblclick', function () { gotoView('overview'); });

  /* ---------- UI 绑定 ---------- */
  var mToggle = document.getElementById('mobileToggle');
  function closePanel() {
    document.body.classList.remove('panel-open');
    mToggle.setAttribute('aria-expanded', 'false');
  }
  function hideHint() { document.getElementById('mobileHint').classList.add('gone'); }
  mToggle.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = !document.body.classList.contains('panel-open');
    document.body.classList.toggle('panel-open', open);
    mToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    hideHint();
  });

  document.querySelectorAll('#views .vbtn').forEach(function (b) {
    /* 选完视角自动收起抽屉，立即看到画面 */
    b.addEventListener('click', function () { gotoView(b.dataset.view); closePanel(); });
  });
  document.querySelectorAll('#floors .fbtn').forEach(function (b) {
    b.addEventListener('click', function () {
      state.floor = b.dataset.floor;
      if (state.floor !== 'all') state.roof = false;
      applyVisibility();
      document.querySelectorAll('#floors .fbtn').forEach(function (x) { x.classList.toggle('on', x === b); });
    });
  });
  function bindSwitch(id, key) {
    document.getElementById(id).addEventListener('click', function () {
      state[key] = !state[key];
      if (key === 'roof' && state.roof && state.floor !== 'all') {
        state.floor = 'all';
        document.querySelectorAll('#floors .fbtn').forEach(function (x) {
          x.classList.toggle('on', x.dataset.floor === 'all');
        });
      }
      if (key === 'lights') setTime(state.t); else applyVisibility();
    });
  }
  bindSwitch('swRoof', 'roof'); bindSwitch('swFurniture', 'furniture');
  bindSwitch('swLights', 'lights'); bindSwitch('swRotate', 'rotate');
  document.getElementById('time').addEventListener('input', function (e) { setTime(+e.target.value / 100); });
  /* 竖屏适配：窄视口加大 fov 并按比例拉远相机，横竖屏切换时自动跟随 */
  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    var aspect = w / h;
    camera.aspect = aspect;
    camera.fov = aspect < .85 ? 64 : 52;
    camera.updateProjectionMatrix();
    fitR = aspect < .85 ? Math.min(1.62, 1.15 + (.85 - aspect) * 1.1) : 1;
    renderer.setPixelRatio(dynamicDPR);
    renderer.setSize(w, h);
  }
  function refit() {
    var oldFit = fitR;
    layout();
    if (fitR !== oldFit) {
      var ratio = fitR / oldFit;
      cam.tRadius = clampR(cam.tRadius * ratio);
      cam.radius *= ratio;
    }
  }
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', function () { setTimeout(refit, 160); });
  /* iOS Safari 会劫持双指手势，显式拦下 */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false });
  });
  window.addEventListener('error', function (e) { console.error(e.message); });

  /* ---------- 启动（支持 #视角 / ?t=时刻 的深链） ---------- */
  layout();
  cam.radius = cam.tRadius = VIEWS.overview.r * fitR;
  var qTime = parseFloat(new URLSearchParams(location.search).get('t'));
  var t0 = isFinite(qTime) ? Math.max(0, Math.min(1, qTime)) : .62;
  document.getElementById('time').value = Math.round(t0 * 100);
  setTime(t0);
  applyVisibility();
  var hv = (location.hash || '').replace('#', '');
  if (VIEWS[hv]) gotoView(hv);
  if (LOW) setTimeout(hideHint, 4500);
  updateCam(1);
  var last = performance.now();
  var perfFrames = 0, perfTime = 0, perfChecked = false;
  function tick(now) {
    var dt = Math.min((now - last) / 1000, .05); last = now;
    updateCam(dt);
    waterTex.offset.x += dt * .012;
    waterTex.offset.y += dt * .007;
    for (var i = 0; i < clouds.length; i++) {
      clouds[i].position.x += dt * (.5 + i * .06);
      if (clouds[i].position.x > 265) clouds[i].position.x = -265;
    }
    renderer.render(scene, camera);
    /* 前 3 秒采样帧率，低端机自动把像素比降到 1 保流畅 */
    if (!perfChecked) {
      perfFrames++; perfTime += dt;
      if (perfTime >= 3) {
        perfChecked = true;
        if (perfFrames / perfTime < 28 && dynamicDPR > 1) {
          dynamicDPR = 1;
          renderer.setPixelRatio(1);
          renderer.setSize(window.innerWidth, window.innerHeight);
        }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  setTimeout(function () {
    var el = document.getElementById('loading');
    el.classList.add('gone');
    setTimeout(function () { el.style.display = 'none'; }, 800);
  }, 350);
})();
