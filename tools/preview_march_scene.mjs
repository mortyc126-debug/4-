/* =========================================================================
   Предпросмотр сцены без WebGPU.

   Нужен там, где живой движок не поднять (в этой песочнице у Chromium нет
   navigator.gpu вовсе), а посмотреть на результат надо: правильный ли
   масштаб у моделей походов рядом с замком, в ту ли сторону они
   разворачиваются, не слишком ли крепко бьёт оттенок владельца.

   Кадр собирается ТЕМИ ЖЕ формулами, что и в движке — modelMatrix/persp/
   look/mul дословно из engine/src/mat4.ts, CAM_FOVY=0.72 и орбитальная
   камера как в main.ts, — только растеризация своя, софтверная (z-буфер +
   плоское затенение по нормали треугольника). Текстур нет: альбедо ровное,
   поэтому оттенок владельца тут выглядит ЗАМЕТНЕЕ, чем будет в игре — на
   подбор его силы это надо делать поправку.

     npm i sharp
     node tools/preview_march_scene.mjs /куда/положить.png
   ========================================================================= */
// Предпросмотр сцены ТЕМИ ЖЕ формулами, что и движок: modelMatrix из
// mat4.ts, перспектива с CAM_FOVY=0.72, орбитальная камера (yaw/pitch/dist).
// WebGPU в этой песочнице нет, поэтому кадр собирается софтверно — нужен он
// ровно для одного: увидеть масштаб и разворот моделей похода рядом с замком.
import fs from "fs"; import sharp from "sharp";
const NC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}, CT={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
function load(f){
  const b=fs.readFileSync(f), jl=b.readUInt32LE(12);
  const g=JSON.parse(b.subarray(20,20+jl).toString("utf8"));
  const base=b.byteOffset+20+jl+8, ab=b.buffer;
  const acc=(i)=>{const a=g.accessors[i],bv=g.bufferViews[a.bufferView],C=CT[a.componentType];
    const off=base+(bv.byteOffset||0)+(a.byteOffset||0), n=NC[a.type], st=bv.byteStride||0, tight=n*C.BYTES_PER_ELEMENT;
    if(!st||st===tight) return new C(ab.slice(off, off+a.count*tight));
    const out=new C(a.count*n); for(let k=0;k<a.count;k++) out.set(new C(ab, off+k*st, n), k*n); return out;};
  const p=g.meshes[0].primitives[0];
  return {pos:acc(p.attributes.POSITION), nrm:acc(p.attributes.NORMAL), idx:acc(p.indices)};
}
// mat4.ts: modelMatrix / persp / look / mul (column-major)
const mul=(a,b)=>{const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;};
const modelMatrix=(tx,ty,tz,yaw,s)=>{const cy=Math.cos(yaw),sy=Math.sin(yaw);
  return new Float32Array([cy*s,0,-sy*s,0, 0,s,0,0, sy*s,0,cy*s,0, tx,ty,tz,1]);};
const persp=(f,a,n,fa)=>{const t=1/Math.tan(f/2);return new Float32Array([t/a,0,0,0, 0,t,0,0, 0,0,fa/(n-fa),-1, 0,0,fa*n/(n-fa),0]);};
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(v)=>{const l=Math.hypot(...v)||1;return [v[0]/l,v[1]/l,v[2]/l];};
const look=(e,c,u)=>{const z=norm(sub(e,c)),x=norm(cross(u,z)),y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
    -(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]), -(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]), -(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]), 1]);};

const W=1100,H=620;
const img=new Uint8Array(W*H*3), zb=new Float32Array(W*H).fill(1e9);
for(let i=0;i<W*H;i++){const t=i/(W*H); img[i*3]=28+40*t; img[i*3+1]=32+44*t; img[i*3+2]=38+40*t;}
const CAM_FOVY=0.72, HMAX=13.0;
const target=[0,0.6,0], yaw=0.55, pitch=0.5, dist=26;
const eye=[target[0]+Math.sin(yaw)*Math.cos(pitch)*dist, target[1]+Math.sin(pitch)*dist, target[2]+Math.cos(yaw)*Math.cos(pitch)*dist];
const VP=mul(persp(CAM_FOVY,W/H,0.5,900), look(eye,target,[0,1,0]));
function drawModel(m, M, tint){
  const {pos,nrm,idx}=m;
  const sun=norm([0.62,0.38,0.30]);
  const px=(x,y,z)=>{const wx=M[0]*x+M[4]*y+M[8]*z+M[12], wy=M[1]*x+M[5]*y+M[9]*z+M[13], wz=M[2]*x+M[6]*y+M[10]*z+M[14];
    const cx=VP[0]*wx+VP[4]*wy+VP[8]*wz+VP[12], cy=VP[1]*wx+VP[5]*wy+VP[9]*wz+VP[13],
          cz=VP[2]*wx+VP[6]*wy+VP[10]*wz+VP[14], cw=VP[3]*wx+VP[7]*wy+VP[11]*wz+VP[15];
    return [(cx/cw*0.5+0.5)*W, (1-(cy/cw*0.5+0.5))*H, cz/cw, cw];};
  for(let t=0;t<idx.length;t+=3){
    const A=[]; let ok=true, nx=0,ny=0,nz=0;
    for(let k=0;k<3;k++){const j=idx[t+k]*3; const q=px(pos[j],pos[j+1],pos[j+2]); if(q[3]<=0.01){ok=false;break;} A.push(q);
      nx+=nrm[j]; ny+=nrm[j+1]; nz+=nrm[j+2];}
    if(!ok) continue;
    const nl=Math.hypot(nx,ny,nz)||1; nx/=nl; ny/=nl; nz/=nl;
    const ndotl=Math.max(0,nx*sun[0]+ny*sun[1]+nz*sun[2]);
    const hemi=[0.20+0.22*(ny*0.5+0.5), 0.16+0.21*(ny*0.5+0.5), 0.13+0.15*(ny*0.5+0.5)];
    const base=0.82; // текстуры тут нет — ровный светлый альбедо
    const rgb=[0,1,2].map(i=>{
      const lit=base*(hemi[i]+[0.85,0.70,0.48][i]*ndotl);
      return Math.min(255, Math.round(255*lit*(1+(tint[i]-1)*tint[3])));});
    const x0=Math.max(0,Math.floor(Math.min(A[0][0],A[1][0],A[2][0]))), x1=Math.min(W-1,Math.ceil(Math.max(A[0][0],A[1][0],A[2][0])));
    const y0=Math.max(0,Math.floor(Math.min(A[0][1],A[1][1],A[2][1]))), y1=Math.min(H-1,Math.ceil(Math.max(A[0][1],A[1][1],A[2][1])));
    const d=(A[1][0]-A[0][0])*(A[2][1]-A[0][1])-(A[2][0]-A[0][0])*(A[1][1]-A[0][1]); if(!d) continue;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const qx=x+0.5,qy=y+0.5;
      const w0=((A[1][0]-qx)*(A[2][1]-qy)-(A[2][0]-qx)*(A[1][1]-qy))/d;
      const w1=((A[2][0]-qx)*(A[0][1]-qy)-(A[0][0]-qx)*(A[2][1]-qy))/d;
      const w2=1-w0-w1; if(w0<0||w1<0||w2<0) continue;
      const z=w0*A[0][2]+w1*A[1][2]+w2*A[2][2]; const o=y*W+x;
      if(z<zb[o]){zb[o]=z; img[o*3]=rgb[0]; img[o*3+1]=rgb[1]; img[o*3+2]=rgb[2];}
    }
  }
}
// ---- сцена: замок (scale 10, как в realData.ts) и рядом четыре похода
const D="/home/user/4-/models/";
const NONE=[1,1,1,0], OWN=[0.62,1.14,0.72,0.32], FOE=[1.22,0.55,0.50,0.32];
const S_M=3.2, S_S=2.6;
const items=[
  [D+"castles/human-1.glb",   -9.5, 0,  0, 0,          10,  NONE],
  [D+"marches/gen-human-0.glb", 0.5, 0, -3.0, Math.PI*0.15, S_M, OWN],
  [D+"marches/army-human.glb",  4.5, 0, -1.0, Math.PI*0.15, S_M, OWN],
  [D+"marches/scout-human.glb", 8.0, 0,  1.0, Math.PI*0.15, S_S, OWN],
  [D+"marches/gen-undead-1.glb",11.5,0,  3.0, Math.PI*1.10, S_M, FOE],
];
// земля — большой тонкий диск из двух треугольников
{
  const g={pos:new Float32Array([-1,0,-1, 1,0,-1, 1,0,1, -1,0,1]), nrm:new Float32Array([0,1,0, 0,1,0, 0,1,0, 0,1,0]), idx:new Uint16Array([0,1,2, 0,2,3])};
  drawModel(g, modelMatrix(0,-0.01,0,0,60), [0.75,0.80,0.62,0.9]);
}
for(const [f,x,y,z,yw,s,t] of items) drawModel(load(f), modelMatrix(x,y,z,yw,s), t);
await sharp(Buffer.from(img),{raw:{width:W,height:H,channels:3}}).png().toFile(process.argv[2]);
console.log("сцена собрана:", process.argv[2]);
