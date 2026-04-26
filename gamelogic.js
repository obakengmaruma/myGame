const canvas = document.getElementById("gameCanvas");
const webgl = canvas.getContext("webgl");

if (!webgl) {
    console.error("WebGL not supported");
}

const gl = webgl;

function resize() { canvas.width = innerWidth; canvas.height = innerHeight; gl.viewport(0, 0, canvas.width, canvas.height); }
window.addEventListener('resize', resize); resize();

// ─────────────────────────────────────────────────────
//  SHADERS
// ─────────────────────────────────────────────────────
const VS = `
  attribute vec3 aPos;
  attribute float aA;
  uniform mat4 uMVP;
  varying float vA;
  
  
  void main(){ 
  vA=aA;
   gl_Position=uMVP*vec4(aPos,1.0);
    }`;
const FS = `
  precision mediump float;
  uniform vec4 uCol;
  varying float vA;
  void main(){ 
  gl_FragColor=vec4(uCol.rgb,uCol.a*vA);
   }`;
const BGV = `
  attribute vec2 aPos; 
  varying vec2 vU;
  void main(){ 
            vU=aPos*.5+.5;
            gl_Position=vec4(aPos,.999,1.); 
   }`;
const BGF = `
  precision mediump float;
  varying vec2 vU;
   uniform vec2 uR;
    uniform vec3 uT;
  void main(){
    vec2 c=(vU-.5)*vec2(uR.x/uR.y,1.);
     float g=exp(-dot(c,c)*2.8)*.22;
    gl_FragColor=vec4(uT*g,1.); 
    }`;

// texture shaders
const TVS = `
  attribute vec3 aPos;
  attribute vec2 aUV;
  uniform mat4 uMVP;
  varying vec2 vUV;
  void main(){  
   vUV=aUV; 
    gl_Position=uMVP*vec4(aPos,1.0);
     }`;
const TFS = `
  precision mediump float;
  uniform sampler2D uTex;
  uniform float uAlpha;
  varying vec2 vUV;
  void main(){
    vec4 t=texture2D(uTex,vUV);
    gl_FragColor=vec4(t.rgb,t.a*uAlpha); }`;

function mkS(src, type) {
     const s = gl.createShader(type);
      gl.shaderSource(s, src);
       gl.compileShader(s);
        return s;
     }
function mkP(vs, fs) { 
    const p = gl.createProgram();
     gl.attachShader(p, mkS(vs, gl.VERTEX_SHADER)); 
     gl.attachShader(p, mkS(fs, gl.FRAGMENT_SHADER)); 
     gl.linkProgram(p); 
     return p;
     }
const P = mkP(VS, FS), PB = mkP(BGV, BGF), PT = mkP(TVS, TFS);

// ─────────────────────────────────────────────────────
//  MATRIX MATH (column-major)
// ─────────────────────────────────────────────────────
const M = {
    id: () => new Float32Array([1, 0, 0, 0,
                                0, 1, 0, 0,
                                0, 0, 1, 0,
                                0, 0, 0, 1]),
    mul(a, b) { 
        const o = new Float32Array(16); 
        for (let i = 0; i < 4; i++) 
            for (let j = 0; j < 4; j++) {
         let s = 0; for (let k = 0; k < 4; k++) 
            s += a[j + k * 4] * b[k + i * 4]; 
         o[j + i * 4] = s; 
        }
         return o;
         },
    rx(a) {
         const c = Math.cos(a), s = Math.sin(a);
          return new Float32Array([1, 0, 0, 0,
                                   0, c, s, 0,
                                   0, -s, c, 0,
                                   0, 0, 0, 1]); 
        },
    ry(a) {
         const c = Math.cos(a), s = Math.sin(a); 
         return new Float32Array([c, 0, -s, 0,
                                  0, 1, 0, 0, 
                                  s, 0, c, 0,
                                   0, 0, 0, 1]);
         },
    tr(x, y, z) { return new Float32Array([1, 0, 0, 0,
                                           0, 1, 0, 0,
                                           0, 0, 1, 0,
                                           x, y, z, 1]); },
    sc(s) { return new Float32Array([s, 0, 0, 0,
                                      0, s, 0, 0,
                                      0, 0, s, 0,
                                      0, 0, 0, 1]); },
    persp(fov, asp, n, f) { 
        const t = 1 / Math.tan(fov / 2), nf = 1 / (n - f); 
        return new Float32Array([t / asp, 0, 0, 0,
                                  0, t, 0, 0,
                                0, 0, (f + n) * nf, -1,                                                     
                                0, 0, 2 * f * n * nf, 0]); }
};

// ─────────────────────────────────────────────────────
//  BUFFERS
// ─────────────────────────────────────────────────────
function vb(d) {
     const b = gl.createBuffer(); 
     gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW); 
      return b; }
function ib(d) {
     const b = gl.createBuffer(); 
     gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b); 
     gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, 
        new Uint16Array(d), gl.STATIC_DRAW); 
        return b; 
    }

const bgVB = vb([-1, -1, 1, -1,
                 1, 1, -1, 1]), 
                 bgIB = ib([0, 1, 2, 0, 2, 3]);

// ─────────────────────────────────────────────────────
//  CUBE GEOMETRY
// ─────────────────────────────────────────────────────
const S = 1.5;

const ED = [
    -S,-S,-S, S,-S,-S,   S,-S,-S, S,-S, S,   S,-S, S,-S,-S, S,   -S,-S, S,-S,-S,-S,
    -S, S,-S, S, S,-S,   S, S,-S, S, S, S,   S, S, S,-S, S, S,   -S, S, S,-S, S,-S,
    -S,-S,-S,-S, S,-S,   S,-S,-S, S, S,-S,   S,-S, S, S, S, S,   -S,-S, S,-S, S, S,
];
const eV = [], eA = [];
for (let i = 0; i < ED.length; i += 3) { eV.push(ED[i], ED[i+1], ED[i+2]); eA.push(1); }
const eVB = vb(eV), eAB = vb(eA), EC = eV.length / 3;

// ─────────────────────────────────────────────────────
//  6-FACE GRID LINES
//  0=left(x=-S)  1=right(x=+S)  2=top(y=+S)
//  3=bottom(y=-S) 4=front(z=+S) 5=back(z=-S)
// ─────────────────────────────────────────────────────
function mkGrid(f) {
    const v = [];
    for (let i = 1; i <= 2; i++) {
        const t = -S + (i / 3) * 2 * S;
        if      (f === 0) { v.push(-S,t,-S, -S,t,S,  -S,-S,t, -S,S,t); }  // left   x=-S
        else if (f === 1) { v.push( S,t,-S,  S,t,S,   S,-S,t,  S,S,t); }  // right  x=+S
        else if (f === 2) { v.push(-S,S,t,   S,S,t,   t,S,-S,  t,S,S); }  // top    y=+S
        else if (f === 3) { v.push(-S,-S,t,  S,-S,t,  t,-S,-S, t,-S,S); } // bottom y=-S
        else if (f === 4) { v.push(t,-S,S,   t,S,S,   -S,t,S,  S,t,S); }  // front  z=+S
        else              { v.push(t,-S,-S,  t,S,-S,  -S,t,-S, S,t,-S); } // back   z=-S
    }
    const a = []; for (let i = 0; i < v.length / 3; i++) a.push(1);
    return { vb: vb(v), ab: vb(a), n: v.length / 3 };
}
const GR = [0,1,2,3,4,5].map(mkGrid);

// ─────────────────────────────────────────────────────
//  6-FACE QUADS (with UVs)
// ─────────────────────────────────────────────────────
function mkFaceQ(f) {
    let v;
    if      (f === 0) v = [-S,-S,-S, -S,S,-S, -S,S,S, -S,-S,S];   // left   x=-S
    else if (f === 1) v = [ S,-S,-S,  S,S,-S,  S,S,S,  S,-S,S];   // right  x=+S
    else if (f === 2) v = [-S,S,-S,   S,S,-S,  S,S,S, -S,S,S];    // top    y=+S
    else if (f === 3) v = [-S,-S,-S,  S,-S,-S, S,-S,S, -S,-S,S];  // bottom y=-S
    else if (f === 4) v = [-S,-S,S,   S,-S,S,  S,S,S,  -S,S,S];   // front  z=+S
    else              v = [-S,-S,-S,  S,-S,-S, S,S,-S, -S,S,-S];  // back   z=-S
    const uv = [0,0, 1,0, 1,1, 0,1];
    return { vb: vb(v), ab: vb([1,1,1,1]), uvb: vb(uv), ib: ib([0,1,2,0,2,3]) };
}
const FQ = [0,1,2,3,4,5].map(mkFaceQ);

// face depth centers for painter's sort
const FC = [[-S,0,0],[S,0,0],[0,S,0],[0,-S,0],[0,0,S],[0,0,-S]];

// ─────────────────────────────────────────────────────
//  TEXTURES — 6 unique colours
// ─────────────────────────────────────────────────────
function makeFaceTex(r, g, b) {
    const sz = 256;
    const c = document.createElement('canvas');
    c.width = sz; c.height = sz;
    const ctx = c.getContext('2d');

    ctx.fillStyle = `rgb(${Math.floor(r*60)},${Math.floor(g*60)},${Math.floor(b*60)})`;
    ctx.fillRect(0, 0, sz, sz);

    const grd = ctx.createRadialGradient(sz/2,sz/2,0, sz/2,sz/2,sz*0.72);
    grd.addColorStop(0, `rgba(${Math.floor(r*255)},${Math.floor(g*255)},${Math.floor(b*255)},0.35)`);
    grd.addColorStop(1, `rgba(${Math.floor(r*255)},${Math.floor(g*255)},${Math.floor(b*255)},0.0)`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, sz, sz);

    ctx.strokeStyle = `rgba(${Math.floor(r*255)},${Math.floor(g*255)},${Math.floor(b*255)},0.25)`;
    ctx.lineWidth = 1.5;
    for (let i = 1; i <= 2; i++) {
        const t = (i / 3) * sz;
        ctx.beginPath(); 
        ctx.moveTo(t, 0); 
        ctx.lineTo(t, sz); 
        ctx.stroke();
        ctx.beginPath(); 
        ctx.moveTo(0, t); 
        ctx.lineTo(sz, t); 
        ctx.stroke();
    }

    ctx.strokeStyle = `rgba(${Math.floor(r*255)},${Math.floor(g*255)},${Math.floor(b*255)},0.5)`;
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, sz-4, sz-4);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
}

const FTEX = [
    makeFaceTex(0.42, 0.62, 1.0),   // 0 left   — blue
    makeFaceTex(1.0,  0.48, 0.48),  // 1 right  — red
    makeFaceTex(0.28, 1.0,  0.52),  // 2 top    — green
    makeFaceTex(1.0,  0.85, 0.10),  // 3 bottom — yellow
    makeFaceTex(0.72, 0.28, 1.0),   // 4 front  — purple
    makeFaceTex(1.0,  0.55, 0.10),  // 5 back   — orange
];

// ─────────────────────────────────────────────────────
//  CELL CENTRES & MARK ORIENTATION — 6 faces
// ─────────────────────────────────────────────────────
function cc3(f, r, c) {
    const step = (2*S)/3, o = (i) => -S + step*0.5 + i*step;
    if (f === 0) return [-S,    o(r), o(c)];  // left
    if (f === 1) return [ S,    o(r), o(c)];  // right
    if (f === 2) return [o(c),  S,    o(r)];  // top
    if (f === 3) return [o(c), -S,    o(r)];  // bottom
    if (f === 4) return [o(c), o(r),   S  ];  // front
                 return [o(c), o(r),  -S  ];  // back
}

function fOri(f) {
    if (f === 0) return M.ry( Math.PI/2);   // left   — face +X
    if (f === 1) return M.ry(-Math.PI/2);   // right  — face -X
    if (f === 2) return M.rx( Math.PI/2);   // top    — face -Y
    if (f === 3) return M.rx(-Math.PI/2);   // bottom — face +Y
    if (f === 4) return M.id();             // front  — face +Z
                 return M.ry( Math.PI);     // back   — face -Z
}

// ─────────────────────────────────────────────────────
//  CAMERA TARGETS — one per face
// ─────────────────────────────────────────────────────
const CAM = [
    { rx:  0,            ry:  Math.PI/2  },  // 0 left
    { rx:  0,            ry: -Math.PI/2  },  // 1 right
    { rx:  Math.PI/2,    ry:  0          },  // 2 top
    { rx: -Math.PI/2,    ry:  0          },  // 3 bottom
    { rx:  0,            ry:  0          },  // 4 front
    { rx:  0,            ry:  Math.PI    },  // 5 back
];

let cRX = 0, cRY = 0, tRX = 0, tRY = 0;

// ─────────────────────────────────────────────────────
//  FACE CONFIG — 6 faces
// ─────────────────────────────────────────────────────
const FCFG = [
    { name:'FACE 1 — LEFT',   tint:[0.10,0.28,1.0], lc:[0.42,0.62,1.0], lbl:'#5599ff', brd:'rgba(80,140,255,.65)'  },
    { name:'FACE 2 — RIGHT',  tint:[1.0,0.16,0.16], lc:[1.0,0.48,0.48], lbl:'#ff6655', brd:'rgba(255,80,70,.65)'   },
    { name:'FACE 3 — TOP',    tint:[0.06,0.8,0.36],  lc:[0.28,1.0,0.52], lbl:'#44ffaa', brd:'rgba(50,220,120,.65)' },
    { name:'FACE 4 — BOTTOM', tint:[0.8,0.7,0.05],  lc:[1.0,0.85,0.10], lbl:'#ffdd22', brd:'rgba(220,200,20,.65)'  },
    { name:'FACE 5 — FRONT',  tint:[0.5,0.1,0.9],   lc:[0.72,0.28,1.0], lbl:'#aa55ff', brd:'rgba(160,60,255,.65)'  },
    { name:'FACE 6 — BACK',   tint:[0.9,0.45,0.05], lc:[1.0,0.55,0.10], lbl:'#ff9933', brd:'rgba(255,140,30,.65)'  },
];

// ─────────────────────────────────────────────────────
//  MARK GEOMETRY
// ─────────────────────────────────────────────────────
const MS = (2*S/3)*0.36;

function mkX(s) {
    const hw=s*.12, gh=hw*3.2, V=[], A=[], I=[]; let vi=0;
    for (const [dx,dy] of [[1,1],[-1,1]]) {
        const ax=-s*dx, ay=-s*dy, bx=s*dx, by=s*dy;
        const [px,py]=[-dy*hw,dx*hw], [gx,gy]=[-dy*gh,dx*gh];
        V.push(ax+px,ay+py,0, ax-px,ay-py,0, bx-px,by-py,0, bx+px,by+py,0); 
        A.push(1,1,1,1); 
        I.push(vi,vi+1,vi+2,vi,vi+2,vi+3); 
        vi+=4;
        V.push(ax+gx,ay+gy,0, ax-gx,ay-gy,0, bx-gx,by-gy,0, bx+gx,by+gy,0); 
        A.push(0,.4,.4,0); 
        I.push(vi,vi+1,vi+2,vi,vi+2,vi+3); 
        vi+=4;
    }
    return { vb:vb(V), ab:vb(A), ib:ib(I), n:I.length };
}

function mkO(r) {
    const hw=r*.19, gh=hw*2.8, sg=52, V=[], A=[], I=[]; let vi=0;
    for (let i=0; i<sg; i++) {
        const a0=(i/sg)*Math.PI*2, a1=((i+1)/sg)*Math.PI*2;
        const c0=Math.cos(a0), s0=Math.sin(a0), c1=Math.cos(a1), s1=Math.sin(a1);
        V.push(c0*(r+hw),s0*(r+hw),0, c0*(r-hw),s0*(r-hw),0, c1*(r-hw),s1*(r-hw),0, c1*(r+hw),s1*(r+hw),0);
         A.push(1,1,1,1);
          I.push(vi,vi+1,vi+2,vi,vi+2,vi+3); 
          vi+=4;
        V.push(c0*(r+gh),s0*(r+gh),0, c0*(r-gh),s0*(r-gh),0, c1*(r-gh),s1*(r-gh),0, c1*(r+gh),s1*(r+gh),0); 
        A.push(0,.35,.35,0); 
        I.push(vi,vi+1,vi+2,vi,vi+2,vi+3); 
        vi+=4;
    }
    return { vb:vb(V), ab:vb(A), ib:ib(I), n:I.length };
}

const XG = mkX(MS), OG = mkO(MS*.82);

// ─────────────────────────────────────────────────────
//  GAME STATE — 6 boards
// ─────────────────────────────────────────────────────
let board = [0,1,2,3,4,5].map(()=>Array(9).fill(0));
let face=0, player=1, scores={p1:0,p2:0}, wins=[], over=false, gover=false;

// ─────────────────────────────────────────────────────
//  AUDIO
// ─────────────────────────────────────────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playX() {
    const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type='square';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime+0.12);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+0.18);
    osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime+0.18);
}

function playO() {
    const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type='sine';
    osc.frequency.setValueAtTime(330, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime+0.22);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+0.28);
    osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime+0.28);
}

function playWin() {
    const notes=[523,659,784,1047];
    notes.forEach((freq,i)=>{
        const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
        osc.connect(gain); 
        gain.connect(audioCtx.destination);
        osc.type='sine';
        const start=audioCtx.currentTime+i*0.12;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.28, start+0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start+0.5);
        osc.start(start); osc.stop(start+0.5);
    });
}

// ─────────────────────────────────────────────────────
//  DRAW HELPERS
// ─────────────────────────────────────────────────────
function bindV(g) {
    const aP=gl.getAttribLocation(P,'aPos');
     gl.bindBuffer(gl.ARRAY_BUFFER,g.vb); 
     gl.enableVertexAttribArray(aP);
     gl.vertexAttribPointer(aP,3,gl.FLOAT,false,0,0);
    const aA=gl.getAttribLocation(P,'aA');  
    gl.bindBuffer(gl.ARRAY_BUFFER,g.ab); 
    gl.enableVertexAttribArray(aA);  
    gl.vertexAttribPointer(aA,1,gl.FLOAT,false,0,0);
}
function setMVP(m) {
     gl.uniformMatrix4fv(gl.getUniformLocation(P,'uMVP'),false,m);
     }
function setCol(r,g,b,a) { 
    gl.uniform4fv(gl.getUniformLocation(P,'uCol'),[r,g,b,a]); 
}

function buildVP() {
    const asp=canvas.width/canvas.height;
    return M.mul(M.persp(1.65,asp,0.1,100), M.mul(M.tr(0,0,-4.0), M.mul(M.rx(cRX),M.ry(cRY))));
}
function vz(VP,x,y,z) { return VP[3]*x+VP[7]*y+VP[11]*z+VP[15]; }

function drawLines(g,MVP,r,gg,b,a) {
    gl.useProgram(P); bindV(g); setMVP(MVP); setCol(r,gg,b,a);
    gl.drawArrays(gl.LINES,0,g.n);
}
function drawTris(g,MVP,r,gg,b,a) {
    gl.useProgram(P); bindV(g); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,g.ib); setMVP(MVP); setCol(r,gg,b,a);
    gl.drawElements(gl.TRIANGLES,g.n,gl.UNSIGNED_SHORT,0);
}

function drawTexFace(q,tex,MVP,alpha) {
    gl.useProgram(PT);
    const aP=gl.getAttribLocation(PT,'aPos');
    gl.bindBuffer(gl.ARRAY_BUFFER,q.vb); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP,3,gl.FLOAT,false,0,0);
    const aUV=gl.getAttribLocation(PT,'aUV');
    gl.bindBuffer(gl.ARRAY_BUFFER,q.uvb); gl.enableVertexAttribArray(aUV); gl.vertexAttribPointer(aUV,2,gl.FLOAT,false,0,0);
    gl.uniformMatrix4fv(gl.getUniformLocation(PT,'uMVP'),false,MVP);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.uniform1i(gl.getUniformLocation(PT,'uTex'),0);
    gl.uniform1f(gl.getUniformLocation(PT,'uAlpha'),alpha);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,q.ib);
    gl.drawElements(gl.TRIANGLES,6,gl.UNSIGNED_SHORT,0);
}

// ─────────────────────────────────────────────────────
//  RENDER LOOP
// ─────────────────────────────────────────────────────
let gt=0;
function render(ts) {
    gt=ts*.003;
    cRX+=(tRX-cRX)*.05;
    cRY+=(tRY-cRY)*.05;

    const W=canvas.width, H=canvas.height, cfg=FCFG[face];

    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.useProgram(PB);
    const bp=gl.getAttribLocation(PB,'aPos'); 
    gl.bindBuffer(gl.ARRAY_BUFFER,bgVB); 
    gl.enableVertexAttribArray(bp); 
    gl.vertexAttribPointer(bp,2,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,bgIB);
    gl.uniform2fv(gl.getUniformLocation(PB,'uR'),[W,H]);
    gl.uniform3fv(gl.getUniformLocation(PB,'uT'),cfg.tint);
    gl.drawElements(gl.TRIANGLES,6,gl.UNSIGNED_SHORT,0);

    gl.enable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthMask(false);

    const VP=buildVP();
    const ord=[0,1,2,3,4,5].sort((a,b)=>vz(VP,...FC[b])-vz(VP,...FC[a]));

    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    for (const f of ord) {
        const alpha=f===face?0.92:0.55;
        drawTexFace(FQ[f],FTEX[f],VP,alpha);
    }

    for (const f of ord) {
        const [r,g,b]=FCFG[f].lc, isA=f===face;
        gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
        drawLines(GR[f],VP,r,g,b,isA?.22:.06);
        gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
        drawLines(GR[f],VP,r*.6+.4,g*.6+.4,b*.6+.4,isA?.88:.22);
    }

    gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
    drawLines({vb:eVB,ab:eAB,n:EC},VP,.6,.78,1,.18);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    drawLines({vb:eVB,ab:eAB,n:EC},VP,.92,.96,1,.88);

    const ml=[];
    for (let f=0;f<6;f++) for (let r=0;r<3;r++) for (let c=0;c<3;c++) {
        if (!board[f][r*3+c]) continue;
        const [wx,wy,wz]=cc3(f,r,c);
        ml.push({f,r,c,p:board[f][r*3+c],vz:vz(VP,wx,wy,wz),wx,wy,wz});
    }
    ml.sort((a,b)=>b.vz-a.vz);

    for (const m of ml) {
        const iw=wins.some(w=>w.f===m.f&&w.r===m.r&&w.c===m.c);
        const pulse=iw?(.72+.28*Math.sin(gt*4)):1;
        const T=M.mul(M.tr(m.wx,m.wy,m.wz),fOri(m.f));
        const MVP=M.mul(VP,T);
        const GMVP=M.mul(VP,M.mul(M.tr(m.wx,m.wy,m.wz),M.mul(fOri(m.f),M.sc(1.35*pulse))));

        if (m.p===1) {
            const [r,g,b]=iw?[0,.92*pulse,1*pulse]:[.28,.54,1];
            gl.blendFunc(gl.SRC_ALPHA,gl.ONE); drawTris(XG,GMVP,r,g,b,.22);
            gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); drawTris(XG,MVP,r,g,b,1);
        } else {
            const [r,g,b]=iw?[1*pulse,.9*pulse,0]:[1,.58,.05];
            gl.blendFunc(gl.SRC_ALPHA,gl.ONE); drawTris(OG,GMVP,r,g,b,.22);
            gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); drawTris(OG,MVP,r,g,b,1);
        }
    }

    gl.depthMask(true);
    requestAnimationFrame(render);
}

// ─────────────────────────────────────────────────────
//  CLICK PICKING
// ─────────────────────────────────────────────────────
function proj4(VP,x,y,z) {
    const c=[VP[0]*x+VP[4]*y+VP[8]*z+VP[12], VP[1]*x+VP[5]*y+VP[9]*z+VP[13], VP[2]*x+VP[6]*y+VP[10]*z+VP[14], VP[3]*x+VP[7]*y+VP[11]*z+VP[15]];
    return [c[0]/c[3],c[1]/c[3]];
}

canvas.addEventListener('click',e=>{
    
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    if (over||gover) return;
    const rect=canvas.getBoundingClientRect();
    const nx=((e.clientX-rect.left)/rect.width)*2-1;
    const ny=(1-(e.clientY-rect.top)/rect.height)*2-1;
    const VP=buildVP();
    let best=null, bd=Infinity;
    for (let r=0;r<3;r++) for (let c=0;c<3;c++) {
        const [wx,wy,wz]=cc3(face,r,c);
        const [sx,sy]=proj4(VP,wx,wy,wz);
        const d=Math.hypot(sx-nx,sy-ny);
        if (d<bd){bd=d;best={r,c};}
    }
    if (best&&bd<.35) place(best.r,best.c);
});

document.addEventListener('keydown',e=>{ 
    if(e.key===' '){
        e.preventDefault();
        resetGame();
    } 
});

// ─────────────────────────────────────────────────────
//  GAME LOGIC
// ─────────────────────────────────────────────────────
function chkWin() {
    const b=board[face], L=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const l of L) if (b[l[0]]&&b[l[0]]===b[l[1]]&&b[l[0]]===b[l[2]]) return {w:b[l[0]],l};
    return null;
}

function place(r,c) {
    if (over||gover||board[face][r*3+c]) return;
    board[face][r*3+c]=player;

    if (player===1) playX(); else playO();

    const res=chkWin();
    if (res) {
        if (res.w===1) scores.p1++; else scores.p2++;
        wins=res.l.map(i=>({f:face,r:Math.floor(i/3),c:i%3}));
        over=true;
        playWin();
        document.getElementById('wm').textContent=`✦ Player ${res.w} (${res.w===1?'X':'O'}) wins this round! ✦`;
        updSc(); setTimeout(nextRound,2400);
    } else if (board[face].every(cell=>cell!==0)) {
        scores.p1++; scores.p2++;
        over=true;
        document.getElementById('wm').textContent=`✦ It's a Draw! Both players get a point ✦`;
        updSc(); setTimeout(nextRound,2400);
    } else {
        player=player===1?2:1; updSt();
    }
}

function nextRound() {
    wins=[]; over=false;
    document.getElementById('wm').textContent='';
    if (face<5) {
        face++; player=1;
        tRX=CAM[face].rx; tRY=CAM[face].ry;
        updSt(); updFL();
    } else {
        gover=true;
        showGameOver(scores.p1,scores.p2);
    }
}


function showGameOver(p1Score, p2Score) {
    const wm = document.getElementById('wm');
    if (p1Score > p2Score) {
        wm.textContent = "✦ GAME OVER ✦ Player 1 Wins the Game!";
    } else if (p2Score > p1Score) {
        wm.textContent = "✦ GAME OVER ✦ Player 2 Wins the Game!";
    } else {
        wm.textContent = "✦ GAME OVER ✦ It's a Global Tie!";
    }
}

function updSt() { 
    document.getElementById('st').textContent=`Player ${player} (${player===1?'X':'O'})`; 
}
function updSc() { 
    document.getElementById('sc').textContent=`P1: ${scores.p1}\u00a0\u00a0|\u00a0\u00a0P2: ${scores.p2}`;
 }
function updFL() {
    const cfg=FCFG[face], el=document.getElementById('fl');
    el.textContent=cfg.name;
     el.style.color=cfg.lbl;
    el.style.borderColor=cfg.brd;
     el.style.boxShadow=`0 0 18px ${cfg.brd}`;
    el.style.background='rgba(0,0,0,.6)';
}

function resetGame() {
    board=[0,1,2,3,4,5].map(()=>Array(9).fill(0));
    face=0;
    player=1;
    scores={p1:0,p2:0};
    wins=[];
    over=false;
    gover=false;
    tRX=CAM[0].rx;
    tRY=CAM[0].ry;
    document.getElementById('wm').textContent='';
    updSt(); updSc(); updFL();
}

// ─────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────
gl.clearColor(0,0,0,1);
tRX=CAM[0].rx;
tRY=CAM[0].ry;
cRX=CAM[0].rx;
cRY=CAM[0].ry;
updSt();
updSc();
updFL();
requestAnimationFrame(render);