(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=(e,t,n)=>Object.defineProperty(e,t,{value:n,enumerable:!1,writable:!0,configurable:!0}),t=(e,t)=>t&e.entityMask,n=(e,t)=>t>>>e.versionShift&(1<<e.versionBits)-1,r=(e,t)=>{let r=n(e,t)+1&(1<<e.versionBits)-1;return t&e.entityMask|r<<e.versionShift},i=e=>{let t=e?typeof e==`function`?e():e:{versioning:!1,versionBits:8},n=t.versionBits??8,r=t.versioning??!1,i=32-n,a=(1<<i)-1,o=i;return{aliveCount:0,dense:[],sparse:[],maxId:0,versioning:r,versionBits:n,entityMask:a,versionShift:o,versionMask:(1<<n)-1<<o}},a=e=>{if(e.aliveCount<e.dense.length){let t=e.dense[e.aliveCount],n=t;return e.sparse[n]=e.aliveCount,e.aliveCount++,t}let t=++e.maxId;return e.dense.push(t),e.sparse[t]=e.aliveCount,e.aliveCount++,t},o=(e,t)=>{let n=e.sparse[t];if(n===void 0||n>=e.aliveCount)return;let i=e.aliveCount-1,a=e.dense[i];if(e.sparse[a]=n,e.dense[n]=a,e.sparse[t]=i,e.dense[i]=t,e.versioning){let n=r(e,t);e.dense[i]=n}e.aliveCount--},s=(e,n)=>{let r=t(e,n),i=e.sparse[r];return i!==void 0&&i<e.aliveCount&&e.dense[i]===n},c=Symbol.for(`bitecs_internal`),l=(t,n)=>e(t||{},c,{entityIndex:n||i(),entityMasks:[[]],entityComponents:new Map,bitflag:1,componentMap:new Map,componentCount:0,queries:new Set,queriesHashMap:new Map,notQueries:new Set,dirtyQueries:new Set,entitiesWithRelations:new Set,hierarchyData:new Map,hierarchyActiveRelations:new Set,hierarchyQueryCache:new Map});function u(...e){let t,n;return e.forEach(e=>{typeof e==`object`&&`dense`in e&&`sparse`in e&&`aliveCount`in e?t=e:typeof e==`object`&&(n=e)}),l(n,t)}var d=()=>{let e=[],t=[],n=n=>e[t[n]]===n;return{add:r=>{n(r)||(t[r]=e.push(r)-1)},remove:r=>{if(!n(r))return;let i=t[r],a=e.pop();a!==r&&(e[i]=a,t[a]=i)},has:n,sparse:t,dense:e,reset:()=>{e.length=0,t.length=0},sort:n=>{e.sort(n);for(let n=0;n<e.length;n++)t[e[n]]=n}}},f=typeof SharedArrayBuffer<`u`?SharedArrayBuffer:ArrayBuffer,p=(e=1e3)=>{let t=[],n=0,r=new Uint32Array(new f(e*4)),i=e=>e<t.length&&t[e]<n&&r[t[e]]===e;return{add:e=>{if(!i(e)){if(n>=r.length){let e=new Uint32Array(new f(r.length*2*4));e.set(r),r=e}r[n]=e,t[e]=n,n++}},remove:e=>{if(!i(e))return;n--;let a=t[e],o=r[n];r[a]=o,t[o]=a},has:i,sparse:t,get dense(){return new Uint32Array(r.buffer,0,n)},reset:()=>{n=0,t.length=0},sort:e=>{let i=Array.from(r.subarray(0,n));i.sort(e);for(let e=0;e<i.length;e++)r[e]=i[e];for(let e=0;e<n;e++)t[r[e]]=e}}},m=()=>{let e=new Set;return{subscribe:t=>(e.add(t),()=>{e.delete(t)}),notify:(t,...n)=>Array.from(e).reduce((e,r)=>{let i=r(t,...n);return i&&typeof i==`object`?{...e,...i}:e},{})}},h=Symbol.for(`bitecs-relation`),g=Symbol.for(`bitecs-pairTarget`),_=Symbol.for(`bitecs-isPairComponent`),v=Symbol.for(`bitecs-relationData`),y=()=>{let t={pairsMap:new Map,initStore:void 0,exclusiveRelation:!1,autoRemoveSubject:!1,onTargetRemoved:void 0},n=r=>{if(r===void 0)throw Error(`Relation target is undefined`);let i=r===`*`?w:r;if(!t.pairsMap.has(i)){let a=t.initStore?t.initStore(r):{};e(a,h,n),e(a,g,i),e(a,_,!0),t.pairsMap.set(i,a)}return t.pairsMap.get(i)};return e(n,v,t),n},b=(e,t)=>{if(e===void 0)throw Error(`Relation is undefined`);return e(t)},x=(e,t,n)=>{let r=Me(e,t),i=[];for(let e of r)e[h]===n&&e[g]!==w&&!ie(e[g])&&i.push(e[g]);return i},S=Symbol.for(`bitecs-wildcard`);function ee(){let e=y();return Object.defineProperty(e,S,{value:!0,enumerable:!1,writable:!1,configurable:!1}),e}function C(){let e=Symbol.for(`bitecs-global-wildcard`);return globalThis[e]||(globalThis[e]=ee()),globalThis[e]}var w=C();function te(){return y()}function ne(){let e=Symbol.for(`bitecs-global-isa`);return globalThis[e]||(globalThis[e]=te()),globalThis[e]}var re=ne();function ie(e){return e?Object.getOwnPropertySymbols(e).includes(v):!1}var ae=64,T=4294967295,oe=1024;function se(e,t){let{depths:n}=e;if(t<n.length)return n;let r=Math.max(t+1,n.length*2,n.length+oe),i=new Uint32Array(r);return i.fill(T),i.set(n),e.depths=i,i}function ce(e,t,n,r){let{depthToEntities:i}=e;if(r!==void 0&&r!==T){let e=i.get(r);e&&(e.remove(t),e.dense.length===0&&i.delete(r))}n!==T&&(i.has(n)||i.set(n,p()),i.get(n).add(t))}function le(e,t){t>e.maxDepth&&(e.maxDepth=t)}function E(e,t,n,r){e.depths[t]=n,ce(e,t,n,r),le(e,n)}function ue(e,t){e[c].hierarchyQueryCache.delete(t)}function de(e,t){let n=e[c];return n.hierarchyActiveRelations.has(t)||(n.hierarchyActiveRelations.add(t),D(e,t),fe(e,t)),n.hierarchyData.get(t)}function fe(e,t){let n=Se(e,[b(t,w)]);for(let r of n)me(e,t,r);let r=new Set;for(let i of n)for(let n of x(e,i,t))r.has(n)||(r.add(n),me(e,t,n))}function D(e,t){let n=e[c];if(!n.hierarchyData.has(t)){let e=Math.max(oe,n.entityIndex.dense.length*2),r=new Uint32Array(e);r.fill(T),n.hierarchyData.set(t,{depths:r,dirty:d(),depthToEntities:new Map,maxDepth:0})}}function pe(e,t,n,r=new Set){if(r.has(n))return 0;r.add(n);let i=x(e,n,t);if(i.length===0)return 0;if(i.length===1)return O(e,t,i[0],r)+1;let a=1/0;for(let n of i){let i=O(e,t,n,r);if(i<a&&(a=i,a===0))break}return a===1/0?0:a+1}function O(e,t,n,r){let i=e[c];D(e,t);let a=i.hierarchyData.get(t),{depths:o}=a;if(o=se(a,n),o[n]===T){let i=pe(e,t,n,r);return E(a,n,i),i}return o[n]}function me(e,t,n){return O(e,t,n,new Set)}function k(e,t,n,r,i=d()){if(i.has(n))return;i.add(n);let a=Se(e,[t(n)]);for(let n of a)r.add(n),k(e,t,n,r,i)}function he(e,t,n,r,i=new Set){let a=e[c];if(!a.hierarchyActiveRelations.has(t))return;D(e,t);let o=a.hierarchyData.get(t);if(i.has(n)){o.dirty.add(n);return}i.add(n);let{depths:s,dirty:l}=o,u=r===void 0?0:me(e,t,r)+1;if(u>ae)return;let f=s[n];E(o,n,u,f===T?void 0:f),f!==u&&(k(e,t,n,l,d()),ue(e,t))}function A(e,t,n){let r=e[c];if(!r.hierarchyActiveRelations.has(t))return;let i=r.hierarchyData.get(t),{depths:a}=i;a=se(i,n),j(e,t,n,a,d()),ue(e,t)}function j(e,t,n,r,i){if(i.has(n))return;i.add(n);let a=e[c].hierarchyData.get(t);if(n<r.length){let e=r[n];e!==T&&(a.depths[n]=T,ce(a,n,T,e))}let o=Se(e,[t(n)]);for(let n of o)j(e,t,n,r,i)}function M(e,t){let n=e[c].hierarchyData.get(t);if(!n)return;let{dirty:r,depths:i}=n;if(r.dense.length!==0){for(let a of r.dense)i[a]===T&&E(n,a,pe(e,t,a));r.reset()}}function N(e,t,n,r={}){let i=e[c];de(e,t);let a=ye(e,[t,...n]),o=i.hierarchyQueryCache.get(t);if(o&&o.hash===a)return o.result;M(e,t),xe(e,n,r);let s=i.queriesHashMap.get(ye(e,n)),{depths:l}=i.hierarchyData.get(t);s.sort((e,t)=>{let n=l[e],r=l[t];return n===r?e-t:n-r});let u=(r.buffered,s.dense);return i.hierarchyQueryCache.set(t,{hash:a,result:u}),u}function ge(e,t,n,r={}){let i=de(e,t);M(e,t);let a=i.depthToEntities.get(n);return a?(r.buffered,a.dense):r.buffered?new Uint32Array:[]}var P=Symbol.for(`bitecs-opType`),F=Symbol.for(`bitecs-opTerms`),_e=Symbol.for(`bitecs-hierarchyType`),ve=Symbol.for(`bitecs-hierarchyRel`),I=Symbol.for(`bitecs-hierarchyDepth`),L=Symbol.for(`bitecs-modifierType`),R={[L]:`nested`},ye=(e,t)=>{let n=e[c],r=t=>(n.componentMap.has(t)||H(e,t),n.componentMap.get(t).id),i=e=>P in e?`${e[P].toLowerCase()}(${e[F].map(i).sort().join(`,`)})`:r(e).toString();return t.map(i).sort().join(`-`)},be=(e,t,n={})=>{let r=e[c],i=ye(e,t),a=[],o=t=>{P in t?t[F].forEach(o):(r.componentMap.has(t)||H(e,t),a.push(t))};t.forEach(o);let s=[],l=[],u=[],f=(t,n)=>{n.forEach(n=>{r.componentMap.has(n)||H(e,n),t.push(n)})};t.forEach(t=>{if(P in t){let{[P]:e,[F]:n}=t;if(e===`Not`)f(l,n);else if(e===`Or`)f(u,n);else if(e===`And`)f(s,n);else throw Error(`Nested combinator ${e} not supported yet - use simple queries for best performance`)}else r.componentMap.has(t)||H(e,t),s.push(t)});let h=a.map(e=>r.componentMap.get(e)),g=[...new Set(h.map(e=>e.generationId))],_=(e,t)=>(e[t.generationId]=(e[t.generationId]||0)|t.bitflag,e),v=s.map(e=>r.componentMap.get(e)).reduce(_,{}),y=l.map(e=>r.componentMap.get(e)).reduce(_,{}),b=u.map(e=>r.componentMap.get(e)).reduce(_,{}),x=h.reduce(_,{}),S=Object.assign(n.buffered?p():d(),{allComponents:a,orComponents:u,notComponents:l,masks:v,notMasks:y,orMasks:b,hasMasks:x,generations:g,toRemove:d(),addObservable:m(),removeObservable:m(),queues:{}});r.queries.add(S),r.queriesHashMap.set(i,S),h.forEach(e=>{e.queries.add(S)}),l.length&&r.notQueries.add(S);let ee=r.entityIndex;for(let t=0;t<ee.aliveCount;t++){let n=ee.dense[t];Te(e,n,W)||Ce(e,S,n)&&z(S,n)}return S};function xe(e,t,n={}){let r=e[c],i=ye(e,t),a=r.queriesHashMap.get(i);return a?n.buffered&&!(`buffer`in a.dense)&&(a=be(e,t,{buffered:!0})):a=be(e,t,n),n.buffered,a.dense}function Se(e,t,...n){let r=t.find(e=>e&&typeof e==`object`&&_e in e),i=t.filter(e=>!(e&&typeof e==`object`&&_e in e)),a=!1,o=!0,s=n.some(e=>e&&typeof e==`object`&&L in e);for(let e of n)if(s&&e&&typeof e==`object`&&L in e){let t=e;t[L]===`buffer`&&(a=!0),t[L]===`nested`&&(o=!1)}else if(!s){let t=e;t.buffered!==void 0&&(a=t.buffered),t.commit!==void 0&&(o=t.commit)}if(r){let{[ve]:t,[I]:n}=r;return n===void 0?N(e,t,i,{buffered:a}):ge(e,t,n,{buffered:a})}return o&&V(e),xe(e,i,{buffered:a})}function Ce(e,t,n){let r=e[c],{masks:i,notMasks:a,orMasks:o,generations:s}=t,l=Object.keys(o).length===0;for(let e=0;e<s.length;e++){let t=s[e],c=i[t],u=a[t],d=o[t],f=r.entityMasks[t][n];if(u&&f&u||c&&(f&c)!==c)return!1;d&&f&d&&(l=!0)}return l}var z=(e,t)=>{if(e.toRemove.has(t)){e.toRemove.remove(t),e.addObservable.notify(t);return}e.has(t)||(e.add(t),e.addObservable.notify(t))},B=e=>{for(let t=0;t<e.toRemove.dense.length;t++){let n=e.toRemove.dense[t];e.remove(n)}e.toRemove.reset()},V=e=>{let t=e[c];t.dirtyQueries.size&&(t.dirtyQueries.forEach(B),t.dirtyQueries.clear())},we=(e,t,n)=>{let r=e[c];!t.has(n)||t.toRemove.has(n)||(t.toRemove.add(n),r.dirtyQueries.add(t),t.removeObservable.notify(n))},H=(e,t)=>{if(!t)throw Error(`bitECS - Cannot register null or undefined component`);let n=e[c],r=new Set,i={id:n.componentCount++,generationId:n.entityMasks.length-1,bitflag:n.bitflag,ref:t,queries:r,setObservable:m(),getObservable:m()};return n.componentMap.set(t,i),n.bitflag*=2,n.bitflag>=2**31&&(n.bitflag=1,n.entityMasks.push([])),i},Te=(e,t,n)=>{let r=e[c],i=r.componentMap.get(n);if(!i)return!1;let{generationId:a,bitflag:o}=i;return(r.entityMasks[a][t]&o)===o},Ee=(e,t,n)=>{let r=e[c].componentMap.get(n);if(r&&Te(e,t,n))return r.getObservable.notify(t)},De=(e,t,n,r,i=new Set)=>{if(!i.has(r)){i.add(r),Oe(t,n,re(r));for(let i of Me(t,r))if(i!==W&&!Te(t,n,i)){Oe(t,n,i);let a=e.componentMap.get(i);if(a?.setObservable){let e=Ee(t,r,i);a.setObservable.notify(n,e)}}for(let a of x(t,r,re))De(e,t,n,a,i)}},Oe=(e,t,n)=>{if(!Ne(e,t))throw Error(`Cannot add component - entity ${t} does not exist in the world.`);let r=e[c],i=`component`in n?n.component:n,a=`data`in n?n.data:void 0;r.componentMap.has(i)||H(e,i);let o=r.componentMap.get(i);if(Te(e,t,i))return a!==void 0&&o.setObservable.notify(t,a),!1;let{generationId:s,bitflag:l,queries:u}=o;if(r.entityMasks[s][t]|=l,Te(e,t,W)||u.forEach(n=>{Ce(e,n,t)?z(n,t):we(e,n,t)}),r.entityComponents.get(t).add(i),a!==void 0&&o.setObservable.notify(t,a),i[_]){let n=i[h],a=i[g];if(ke(e,t,b(n,w),b(w,a)),typeof a==`number`&&(ke(e,a,b(w,t),b(w,n)),r.entitiesWithRelations.add(a),r.entitiesWithRelations.add(t)),r.entitiesWithRelations.add(a),n[v].exclusiveRelation===!0&&a!==w){let r=x(e,t,n)[0];r!=null&&r!==a&&U(e,t,n(r))}if(n===re){let n=x(e,t,re);for(let i of n)De(r,e,t,i)}he(e,n,t,typeof a==`number`?a:void 0)}return!0};function ke(e,t,...n){(Array.isArray(n[0])?n[0]:n).forEach(n=>{Oe(e,t,n)})}var U=(e,t,...n)=>{let r=e[c];if(!Ne(e,t))throw Error(`Cannot remove component - entity ${t} does not exist in the world.`);n.forEach(n=>{if(!Te(e,t,n))return;let{generationId:i,bitflag:a,queries:o}=r.componentMap.get(n);if(r.entityMasks[i][t]&=~a,o.forEach(n=>{n.toRemove.remove(t),Ce(e,n,t)?z(n,t):we(e,n,t)}),r.entityComponents.get(t).delete(n),n[_]){let r=n[g],i=n[h];A(e,i,t),U(e,t,b(w,r)),typeof r==`number`&&Ne(e,r)&&(U(e,r,b(w,t)),U(e,r,b(w,i))),x(e,t,i).length===0&&U(e,t,b(i,w))}})},W={};function Ae(e,...t){let n=e[c],r=a(n.entityIndex);return n.notQueries.forEach(t=>{Ce(e,t,r)&&z(t,r)}),n.entityComponents.set(r,new Set),t.length>0&&ke(e,r,t),r}var je=(e,t)=>{let n=e[c];if(!s(n.entityIndex,t))return;let r=[t],i=new Set;for(;r.length>0;){let t=r.shift();if(i.has(t))continue;i.add(t);let a=[];if(n.entitiesWithRelations.has(t)){for(let i of Se(e,[w(t)],R))if(Ne(e,i))for(let o of n.entityComponents.get(i)){if(!o[_])continue;let n=o[h][v];a.push(()=>U(e,i,b(w,t))),o[g]===t&&(a.push(()=>U(e,i,o)),n.autoRemoveSubject&&r.push(i),n.onTargetRemoved&&a.push(()=>n.onTargetRemoved(e,i,t)))}n.entitiesWithRelations.delete(t)}for(let e of a)e();for(let t of r)je(e,t);for(let r of n.queries)we(e,r,t);o(n.entityIndex,t),n.entityComponents.delete(t);for(let e=0;e<n.entityMasks.length;e++)n.entityMasks[e][t]=0}},Me=(e,t)=>{let n=e[c];if(t===void 0)throw Error(`getEntityComponents: entity id is undefined.`);if(!s(n.entityIndex,t))throw Error(`getEntityComponents: entity ${t} does not exist in the world.`);return Array.from(n.entityComponents.get(t))},Ne=(e,t)=>s(e[c].entityIndex,t),Pe=(e,t)=>[e[0]-t[0],e[1]-t[1],e[2]-t[2]],Fe=(e,t)=>e[0]*t[0]+e[1]*t[1]+e[2]*t[2],Ie=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],G=e=>{let t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]};function Le(e,t){let n=new Float32Array(16);for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=0;for(let n=0;n<4;n++)a+=e[n*4+i]*t[r*4+n];n[r*4+i]=a}return n}function Re(e,t,n,r){let i=1/Math.tan(e/2);return new Float32Array([i/t,0,0,0,0,i,0,0,0,0,(r+n)/(n-r),-1,0,0,2*r*n/(n-r),0])}function ze(e,t,n,r,i,a){return new Float32Array([2/(t-e),0,0,0,0,2/(r-n),0,0,0,0,1/(i-a),0,-(t+e)/(t-e),-(r+n)/(r-n),i/(i-a),1])}function Be(e,t,n,r,i){let a=Math.cos(r),o=Math.sin(r);return new Float32Array([a*i,0,-o*i,0,0,i,0,0,o*i,0,a*i,0,e,t,n,1])}function Ve(e,t){let[n,r,i]=t;return{x:e[0]*n+e[4]*r+e[8]*i+e[12],y:e[1]*n+e[5]*r+e[9]*i+e[13],z:e[2]*n+e[6]*r+e[10]*i+e[14],w:e[3]*n+e[7]*r+e[11]*i+e[15]}}function He(e,t,n){let r=G(Pe(e,t)),i=G(Ie(n,r)),a=Ie(r,i);return new Float32Array([i[0],a[0],r[0],0,i[1],a[1],r[1],0,i[2],a[2],r[2],0,-Fe(i,e),-Fe(a,e),-Fe(r,e),1])}var Ue=[[.78,.9,.8],[.85,1,.88],[.72,.84,.76],[.9,1,.92],[.8,.94,.9],[.88,.98,.8]],We=[[.85,.95,.78],[.92,1,.85],[.8,.9,.76],[1,.94,.78],[.88,.82,.7],[.86,1,.9],[1,.92,.8]],Ge=[[1,1.15,.95],[1.05,1.15,1],[.92,1.05,.9],[1.15,1.15,1]],Ke=[[.78,.9,.76],[.85,.98,.82],[.72,.86,.74],[.9,1,.88],[.8,.94,.86]],qe=[[.92,.9,.86],[1,.98,.92],[.84,.84,.82],[.96,.9,.82]];function Je(e,t,n,r,i,a,o,s,c,l,u=[.5,.5],d=[.5,.5],f=[.5,.5]){let p=G(Ie(Pe(o,a),Pe(s,a))),m=[[a,u],[o,d],[s,f]];for(let[a,o]of m)e.push(a[0],a[1],a[2]),t.push(p[0],p[1],p[2]),n.push(c),r.push(l),i.push(o[0],o[1])}function Ye(e,t,n,r,i,a,o,s,c,l,u,d){let f=l,p=l+c,m=[],h=[];for(let e=0;e<=a;e++){let t=e/a*Math.PI*2;m.push([Math.cos(t)*o,f,Math.sin(t)*o]),h.push([Math.cos(t)*s,p,Math.sin(t)*s])}for(let o=0;o<a;o++){let s=o/a,c=(o+1)/a;Je(e,t,n,r,i,m[o],m[o+1],h[o+1],u,d,[s,0],[c,0],[c,1]),Je(e,t,n,r,i,m[o],h[o+1],h[o],u,d,[s,0],[c,1],[s,1])}}function Xe(e,t,n,r,i,a,o,s,c,l,u,d=0){for(let f=0;f<a;f++){let p=f/a*Math.PI,m=Math.cos(p),h=Math.sin(p),g=[d-m*o,s,-h*o],_=[d+m*o,s,h*o],v=[d-m*o,c,-h*o],y=[d+m*o,c,h*o];Je(e,t,n,r,i,g,_,y,l,u,[0,1],[1,1],[1,0]),Je(e,t,n,r,i,g,y,v,l,u,[0,1],[1,0],[0,0])}}var K=()=>({positions:[],normals:[],materialIds:[],shades:[],uvs:[]}),q=e=>({positions:new Float32Array(e.positions),normals:new Float32Array(e.normals),materialIds:new Float32Array(e.materialIds),shades:new Float32Array(e.shades),uvs:new Float32Array(e.uvs),vertexCount:e.positions.length/3});function Ze(){let e=K();return Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.1,.06,.45,0,0,1),Xe(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.85,.3,2.7,1,1),q(e)}function Qe(){let e=K();return Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.11,.07,.7,0,0,1),Xe(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,1.15,.25,2.15,1,1),q(e)}function $e(){let e=K();return Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.14,.09,.8,0,0,1),Xe(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,1.3,.65,2.55,1,1),q(e)}function et(){let e=K();return Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,6,.075,.045,.95,0,0,1),Xe(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.95,.7,2.35,1,1),q(e)}function tt(){let e=K();Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,6,.09,.035,1.4,0,0,.62);let t=(t,n,r,i)=>{let a=Math.cos(t)*Math.cos(n),o=Math.sin(t)*Math.cos(n),s=Math.sin(n),c=[0,r,0],l=[a*i,r+s*i,o*i],u=[-o,0,a],d=.03;Je(e.positions,e.normals,e.materialIds,e.shades,e.uvs,[c[0]+u[0]*d,c[1],c[2]+u[2]*d],[c[0]-u[0]*d,c[1],c[2]-u[2]*d],l,0,.62);let f=[l[0]*.55,l[1]*.55+r*.45,l[2]*.55],p=[l[0]+a*i*.4-o*.15,l[1]+s*i*.4+.1,l[2]+o*i*.4+a*.15];Je(e.positions,e.normals,e.materialIds,e.shades,e.uvs,[f[0]+u[0]*d*.6,f[1],f[2]+u[2]*d*.6],[f[0]-u[0]*d*.6,f[1],f[2]-u[2]*d*.6],p,0,.62)};return t(.4,.5,1.5,.6),t(2.2,.32,1.75,.5),t(3.8,.55,1.95,.46),t(5.1,.4,2.1,.4),t(1.6,.65,2.25,.34),q(e)}function nt(){let e=K();return Xe(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.55,.02,.72,1,1),q(e)}function rt(){let e=K();return Xe(e.positions,e.normals,e.materialIds,e.shades,e.uvs,2,.4,0,.62,1,1,-.14),Xe(e.positions,e.normals,e.materialIds,e.shades,e.uvs,2,.32,0,.5,1,.92,.16),q(e)}function it(e,t){return G([e[0]+t[0],e[1]+t[1],e[2]+t[2]])}function at(e,t){let n=Math.sin(e[0]*12.9898+e[1]*78.233+e[2]*37.719+t*91.7)*43758.5453;return n-Math.floor(n)}function ot(e){return[.5+Math.atan2(e[2],e[0])/(2*Math.PI),.5-Math.asin(Math.max(-1,Math.min(1,e[1])))/Math.PI]}function st(){let e=[1,0,0],t=[-1,0,0],n=[0,1,0],r=[0,-1,0],i=[0,0,1],a=[0,0,-1];return[[e,n,i],[i,n,t],[t,n,a],[a,n,e],[e,i,r],[i,t,r],[t,a,r],[a,e,r]]}function ct(e){let t=[];for(let[n,r,i]of e){let e=it(n,r),a=it(r,i),o=it(i,n);t.push([n,e,o],[e,r,a],[o,a,i],[e,a,o])}return t}function lt(e,t,n,r,i,a,o,s){let c=st();for(let e=0;e<t;e++)c=ct(c);let l=e=>{let t=a*(.8+at(e,s)*.45);return[n+e[0]*t,r+e[1]*t*o,i+e[2]*t]};for(let[t,n,r]of c){let i=.82+at(t,s+3)*.36;Je(e.positions,e.normals,e.materialIds,e.shades,e.uvs,l(t),l(n),l(r),1,i,ot(t),ot(n),ot(r))}}function ut(){let e=K(),t=.68,n=.5;lt(e,2,0,n*t,0,n,t,1);let r=.24;return lt(e,1,.48,r*t*.9,.1,r,t,2),lt(e,1,-.4,r*t*.8,-.34,r*.85,t,3),q(e)}async function J(e,t,n=1024){let r=await(await fetch(t)).blob(),i=await createImageBitmap(r),a=Math.min(1,n/Math.max(i.width,i.height)),o=a<1?await createImageBitmap(i,{resizeWidth:Math.round(i.width*a),resizeHeight:Math.round(i.height*a),resizeQuality:`medium`}):i;a<1&&i.close();let s=e.createTexture({size:[o.width,o.height],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return e.queue.copyExternalImageToTexture({source:o},{texture:s},[o.width,o.height]),o.close(),s}var dt=class{sink;floatsPerChunk=0;vertsPerChunk=0;capacityChunks=0;order=[];slotOf=new Map;dataOf=new Map;vertexCount=0;constructor(e){this.sink=e}has(e){return this.slotOf.has(e)}put(e,t,n){this.floatsPerChunk!==t.length&&this.restride(t.length,n),this.dataOf.set(e,t);let r=this.slotOf.get(e);r===void 0&&(r=this.order.length,r+1>this.capacityChunks&&this.grow(r+1),this.order.push(e),this.slotOf.set(e,r)),this.sink.write(r*this.floatsPerChunk*4,t),this.vertexCount=this.order.length*this.vertsPerChunk}remove(e){let t=this.slotOf.get(e);if(this.dataOf.delete(e),t===void 0)return;let n=this.order.length-1;if(t!==n){let e=this.order[n];this.order[t]=e,this.slotOf.set(e,t);let r=this.dataOf.get(e);r&&this.sink.write(t*this.floatsPerChunk*4,r)}this.order.pop(),this.slotOf.delete(e),this.vertexCount=this.order.length*this.vertsPerChunk}grow(e){let t=Math.max(e,Math.ceil(this.capacityChunks*1.5),8);this.capacityChunks=t,this.sink.createBuffer(t*this.floatsPerChunk*4);for(let e=0;e<this.order.length;e++){let t=this.dataOf.get(this.order[e]);t&&this.sink.write(e*this.floatsPerChunk*4,t)}}restride(e,t){let n=this.order.slice();if(this.floatsPerChunk=e,this.vertsPerChunk=t,this.capacityChunks=0,this.order=[],this.slotOf=new Map,this.vertexCount=0,n.length){this.grow(n.length);for(let t of n){let n=this.dataOf.get(t);if(!n||n.length!==e)continue;let r=this.order.length;this.order.push(t),this.slotOf.set(t,r),this.sink.write(r*e*4,n)}this.vertexCount=this.order.length*this.vertsPerChunk}}},ft=(()=>{let[e,t,n]=[.62,.38,.3],r=Math.hypot(e,t,n);return[e/r,t/r,n/r]})(),pt=2048,mt=60,ht=100,gt=1,_t=220,vt=`
struct Uniforms { vp: mat4x4f };
struct Fog { eye: vec4f, color: vec4f };
struct Light { vp: mat4x4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<uniform> fog: Fog;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var texSand: texture_2d<f32>;
@group(0) @binding(4) var texGrass: texture_2d<f32>;
@group(0) @binding(5) var texDry: texture_2d<f32>;
@group(0) @binding(6) var texScree: texture_2d<f32>;
@group(0) @binding(7) var texRock: texture_2d<f32>;
@group(0) @binding(8) var<uniform> light: Light;
@group(0) @binding(9) var shadowSamp: sampler_comparison;
@group(0) @binding(10) var shadowTex: texture_depth_2d;
@group(0) @binding(11) var texSnow: texture_2d<f32>;
@group(0) @binding(12) var texForestFloor: texture_2d<f32>;
// desert/marsh/tundraMoss — вторая партия текстур по промптам автора этой
// сессии (см. комментарий выше TERRAIN_SHADER, moistureAt/coldnessAt):
// раньше засушливая низина, заболоченный берег и холодный склон ниже
// снеговой линии рисовались той же травой/сушняком/голым камнем, что и
// везде — biome-поля уже были посчитаны, не хватало именно текстур под них.
@group(0) @binding(13) var texDesert: texture_2d<f32>;
@group(0) @binding(14) var texMarsh: texture_2d<f32>;
@group(0) @binding(15) var texTundraMoss: texture_2d<f32>;
// Вода была чисто процедурной (рябь синусоидами + плоский цвет, без единой
// текстуры) — texWaterDetail добавляет настоящую поверхностную деталь
// (см. использование в fs() воды ниже), не заменяя рябь/Френель, а
// домешиваясь поверх них.
@group(0) @binding(16) var texWaterDetail: texture_2d<f32>;

struct VOut {
  @builtin(position) pos: vec4f, @location(0) waterColor: vec3f, @location(1) worldPos: vec3f,
  @location(2) normal: vec3f, @location(3) uv: vec2f, @location(4) elevation: f32, @location(5) waterFlag: f32,
  @location(6) lightClip: vec4f, @location(7) forestFrac: f32, @location(8) moistureFrac: f32,
};

@vertex
fn vs(
  @location(0) pos: vec3f, @location(1) waterColor: vec3f, @location(2) normal: vec3f,
  @location(3) uv: vec2f, @location(4) elevation: f32, @location(5) waterFlag: f32, @location(6) forestFrac: f32,
  @location(7) moistureFrac: f32
) -> VOut {
  var out: VOut;
  out.pos = u.vp * vec4f(pos, 1.0);
  out.waterColor = waterColor;
  out.worldPos = pos;
  out.normal = normal;
  out.uv = uv;
  out.elevation = elevation;
  out.waterFlag = waterFlag;
  out.lightClip = light.vp * vec4f(pos, 1.0);
  out.forestFrac = forestFrac;
  out.moistureFrac = moistureFrac;
  return out;
}
// Доля света, дошедшая до точки: 1.0 — на свету, 0.0 — в тени. clip —
// позиция точки в клип-пространстве СОЛНЦА (ортографическая проекция, см.
// setSunTarget ниже), не основной камеры. За пределами теневой карты
// (ndc вне [-1,1] по XY или [0,1] по Z) точка вне охвата карты — считаем
// освещённой, а не тёмной: обрыв на границе куда заметнее, чем отсутствие
// тени там, где её и не считали. 3×3 PCF (усреднение по соседним текс
// елям) смягчает ступенчатую границу тени — с одной выборкой на пиксель
// карты 2048×2048 на объекте с чётким краем (дерево, скала) была бы
// заметная лесенка.
// ---- Порт terrain.ts:hash2/noise/coldnessAt (см. комментарий выше
// TERRAIN_SHADER — держать в синхроне с исходником при правке). moistureAt
// раньше был тут же — теперь настоящие данные (moisture.bin, см.
// terrain.ts), приходит как атрибут вершины in.moistureFrac, WGSL-версия
// не нужна (тот же приём, что и у forestFrac).
// bitcast<u32> от i32 даёт то же двоичное представление отрицательных
// координат, что и неявный ToInt32/ToUint32 в JS-версии — умножение в u32
// в WGSL переполняется (wrap) по модулю 2^32 так же, как усечение до
// младших 32 бит в JS, поэтому результат совпадает бит-в-бит.
fn hash2(xi: i32, yi: i32, s: i32) -> f32 {
  var h: u32 = bitcast<u32>(xi) * 374761393u + bitcast<u32>(yi) * 668265263u + bitcast<u32>(s) * 1274126177u;
  h = h ^ (h >> 13u);
  h = h * 1274126177u;
  h = h ^ (h >> 16u);
  return f32(h) / 4294967296.0;
}
fn noiseAt(x: f32, y: f32, s: i32) -> f32 {
  let xi = floor(x); let yi = floor(y);
  let xf = x - xi; let yf = y - yi;
  let u = xf * xf * (3.0 - 2.0 * xf);
  let v = yf * yf * (3.0 - 2.0 * yf);
  let xii = i32(xi); let yii = i32(yi);
  let a = hash2(xii, yii, s); let b = hash2(xii + 1, yii, s);
  let c = hash2(xii, yii + 1, s); let d = hash2(xii + 1, yii + 1, s);
  return (a * (1.0 - u) + b * u) * (1.0 - v) + (c * (1.0 - u) + d * u) * v;
}
fn coldnessAt(x: f32, y: f32) -> f32 {
  return noiseAt(x / 260.0, y / 260.0, 13266); // SEED+921
}
fn shadowFactor(clip: vec4f) -> f32 {
  let ndc = clip.xyz / clip.w;
  if (ndc.x < -1.0 || ndc.x > 1.0 || ndc.y < -1.0 || ndc.y > 1.0 || ndc.z < 0.0 || ndc.z > 1.0) {
    return 1.0;
  }
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  let bias = 0.0025;
  let texel = 1.0 / ${pt.toFixed(1)};
  var sum = 0.0;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      sum = sum + textureSampleCompareLevel(shadowTex, shadowSamp, uv + vec2f(f32(dx), f32(dy)) * texel, ndc.z - bias);
    }
  }
  return sum / 9.0;
}
@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  // Затенение — тут, не на CPU (см. terrainMesh.ts): нормаль пришла с CPU
  // ужё сглаженной (аналитический градиент heightAt в точке), а тут ещё и
  // интерполируется между вершинами треугольника — мягкий переход, а не
  // одна плоская яркость на весь треугольник.
  let sun = normalize(vec3f(0.62, 0.38, 0.30));
  let n = normalize(in.normal);
  let ndotl = max(0.0, dot(n, sun));
  let shadow = shadowFactor(in.lightClip);
  // Раньше ambient был плоским скаляром (max(0.35, ...)) — тень читалась
  // просто как более тёмная версия ТОЙ ЖЕ текстуры, без единого намёка на
  // атмосферу. Автор прямым текстом: мир должен выглядеть как у AAA-игр, а
  // не "на отъебись" — здесь та самая разница. Полусферный ambient вместо
  // скаляра: тон зависит от того, куда смотрит нормаль (n.y) — вверх, к
  // "небу" (светлее, ближе к тёплой золотой дымке FOG_COLOR ниже) или вниз,
  // к "земле" (темнее, глубже, тот же золотисто-пергаментный дух, что и
  // тема интерфейса, GILT в index.html, просто в тени). Прямой свет солнца
  // добавляется ПОВЕРХ этого как отдельный тёплый golden-hour тон, а не
  // просто множитель яркости — тень и свет теперь разного ЦВЕТА, не только
  // разной яркости одного и того же цвета. Числа держать в одном
  // семействе тона с FOG_COLOR (main.ts) и SUN_LIGHT ниже — та же палитра,
  // что и у DECOR_SHADER/MODEL_SHADER (modelRenderer.ts), иначе здания и
  // деревья светились бы иначе, чем земля под ними.
  let skyTint = vec3f(0.42, 0.37, 0.28);
  let groundTint = vec3f(0.20, 0.16, 0.13);
  let sunLightColor = vec3f(0.85, 0.70, 0.48);
  let hemi = mix(groundTint, skyTint, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
  // Вода — та же тень, что и у земли (shadowFactor), НО с полом: узкое
  // русло реки régularно лежит в собственной тени (крутые берега по обе
  // стороны перекрывают солнце), а нормаль воды всегда строго "вверх" (см.
  // terrainMesh.ts) — то есть без пола shadow=0 гасит ВЕСЬ прямой свет,
  // остаётся только hemi-тон, и albedo воды (тёмно-синий/зелёный, см.
  // waterColor в terrain.ts) на таком освещении уходит в почти чёрный —
  // с устройства репорт "русла есть, но воды в них нет" (не отличить от
  // тёмного оврага). У настоящей воды так не бывает — она рассеивает
  // небесный свет по поверхности заметно сильнее сухой земли/камня даже
  // в тени скал (специфика Френеля/рассеяния, не считаем честно, просто
  // не даём тени топить её до черноты) — пол 0.55 держит воду узнаваемо
  // синей в любой тени, суше тень остаётся полной (0, как раньше).
  let waterShadowFloor = select(shadow, max(shadow, 0.55), in.waterFlag > 0.5);
  let lighting = hemi + sunLightColor * ndotl * waterShadowFloor;

  var albedo: vec3f;
  if (in.waterFlag > 0.5) {
    // Воде нет смысла давать статичную текстуру-плитку — вода должна
    // двигаться, а не быть узнаваемо повторяющимся узором. Вместо текстуры —
    // процедурная рябь (две пересекающиеся синусоиды, сдвигаются со
    // временем, fog.eye.w — секунды с начала работы страницы, см. main.ts)
    // плюс грубый Френель: чем более "в упор" смотрит камера на воду (луч
    // почти параллелен поверхности), тем ярче блик — то самое "небо
    // отражается в воде под острым углом", без честного отражения.
    let time = fog.eye.w;
    let ripple = sin(in.worldPos.x * 1.6 + time * 1.3) * cos(in.worldPos.z * 1.4 + time * 1.05) * 0.05
               + sin(in.worldPos.x * 0.5 - in.worldPos.z * 0.7 + time * 0.6) * 0.03;
    let viewDir = normalize(fog.eye.xyz - in.worldPos);
    let grazing = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 4.0);
    let base = mix(in.waterColor * (1.0 + ripple), fog.color.rgb * 1.3, grazing * 0.5);
    // Лёгкая настоящая деталь поверх (не взамен) процедурной ряби/Френеля —
    // своя UV-сетка (не in.uv, у неё период GROUND_TILE земли, слишком
    // крупный для воды) с медленным сдвигом по времени, только по X —
    // течение в одну сторону читается честнее, чем дрейф по диагонали без
    // всякого направления. Низкий вес (0.16) — деталь, не замена цвета.
    let waterUV = in.worldPos.xz * 0.12 + vec2f(time * 0.015, 0.0);
    let detailC = textureSampleLevel(texWaterDetail, samp, waterUV, 0.0).rgb;
    albedo = mix(base, base * (0.7 + detailC * 0.6), 0.16);
  } else {
    // Знаменатель был (1.0-0.235) — под старый синтетический потолок высоты
    // ~1.0. Настоящие данные высот (terrain.ts) регулярно доходят до ~2.34
    // — со старым знаменателем весь мир выше ~0.765 щёлкал бы в t=1 (голый
    // камень/снег) независимо от настоящей высоты, единообразно серым.
    let t = clamp((in.elevation - 0.235) / (2.34 - 0.235), 0.0, 1.0);
    // textureSample (неявный LOD через производные) запрещён WGSL внутри
    // неоднородного (per-fragment, зависящего от varying) control flow —
    // это уже раз было настоящей причиной чёрного экрана (см. коммент у
    // DECOR_SHADER — та же проблема была и там). Раньше это обходили веткой
    // if/else if, каждая из которых сэмплила только 2 нужные текстуры —
    // теперь сэмплим все 5 БЕЗУСЛОВНО (textureSampleLevel и так не требует
    // производных, ветвление было не обязательным, только экономило
    // выборки) и смешиваем чистой математикой — заодно снимает сам вопрос
    // о однородности control flow: сэмплы больше не внутри if вообще.
    let sandC = textureSampleLevel(texSand, samp, in.uv, 0.0).rgb;
    let grassC = textureSampleLevel(texGrass, samp, in.uv, 0.0).rgb;
    let dryC = textureSampleLevel(texDry, samp, in.uv, 0.0).rgb;
    let screeC = textureSampleLevel(texScree, samp, in.uv, 0.0).rgb;
    let rockC = textureSampleLevel(texRock, samp, in.uv, 0.0).rgb;
    let snowC = textureSampleLevel(texSnow, samp, in.uv, 0.0).rgb;
    let forestFloorC = textureSampleLevel(texForestFloor, samp, in.uv, 0.0).rgb;
    let desertC = textureSampleLevel(texDesert, samp, in.uv, 0.0).rgb;
    let marshC = textureSampleLevel(texMarsh, samp, in.uv, 0.0).rgb;
    let tundraMossC = textureSampleLevel(texTundraMoss, samp, in.uv, 0.0).rgb;
    // "Цвет равнины" в ЭТОЙ точке — не всегда grass: сухая степь (dryC) и
    // пышный луг (grassC) смешиваются по moistureAt (см. комментарий выше
    // TERRAIN_SHADER) — та самая замена одной ступеньки по высоте на
    // читаемое региональное пятно. desertC — третий, ещё более сухой полюс:
    // dryC ("сухой луг") сам по себе не читается как настоящая пустыня —
    // при moist→0 подмешиваем к нему desertC (трещины/дюны, без травы
    // вообще), к moist=0.3 полностью переходя обратно на dryC/grassC-мешь.
    // Дальше в лесных пятнах это же поле "равнины" темнеет до forestFloorC:
    // земля под пологом леса читается лесной, не той же травой, что и
    // открытый луг рядом. in.forestFrac — НАСТОЯЩАЯ доля древесного покрова
    // (ESA WorldCover, см. terrain.ts:forestMaskAt) — та же величина, что
    // main.ts читает для расстановки самих деревьев, интерполированная с
    // вершин как обычный атрибут (см. terrainMesh.ts), а не пересчитанная
    // тут заново синтетическим шумом, как было раньше (два независимых
    // приближения одного и того же поля неизбежно расходились — деревья
    // стояли не совсем там, где земля уже читалась лесной).
    let moist = in.moistureFrac;
    let dryPole = mix(desertC, dryC, smoothstep(0.0, 0.3, moist));
    let forest = in.forestFrac;
    var lowland = mix(mix(dryPole, grassC, moist), forestFloorC, forest);
    // Топь — узкое кольцо НИЗКОЙ (но не пляжной — не пересекается с
    // sand-переходом ниже) высоты при высокой влажности: не "весь низкий
    // берег топкий", а именно сырые низины у воды в сыром регионе. Бугор
    // (не порог) по t — сначала растёт от 0.02, потом гаснет к 0.24, чтобы
    // не тянуться в предгорья.
    let wetT = smoothstep(0.02, 0.12, t) * (1.0 - smoothstep(0.12, 0.24, t)) * smoothstep(0.55, 0.85, moist);
    lowland = mix(lowland, marshC, wetT);
    var albedoLand: vec3f;
    if (t < 0.06) {
      albedoLand = mix(sandC, lowland, t / 0.06);
    } else if (t < 0.55) {
      albedoLand = lowland;
    } else if (t < 0.74) {
      albedoLand = mix(lowland, screeC, (t - 0.55) / 0.19);
    } else {
      albedoLand = mix(screeC, rockC, min(1.0, (t - 0.74) / 0.26));
    }
    // Мох/лишайник на холодных склонах НИЖЕ снеговой линии — coldnessAt то
    // же поле, что и у снега ниже (не высота горы решает, а региональный
    // "климат": один голый каменистый склон, соседний — мшистый). Кэп 0.7 —
    // не полностью замещает scree/rock текстуру, только тонирует пятнами,
    // сама скальная порода остаётся видна.
    let cold = coldnessAt(in.worldPos.x, in.worldPos.z);
    let mossT = smoothstep(0.55, 0.72, t) * smoothstep(0.3, 0.65, cold) * 0.7;
    let withMoss = mix(albedoLand, tundraMossC, mossT);
    // Иней на самых высоких пиках — но не на каждом одинаково: та же
    // coldnessAt, часть хребтов остаётся голым камнем, другая часть —
    // заснежена, как на настоящей карте кампании, а не "снег строго после
    // такой-то отметки везде". Настоящая текстура (texSnow) вместо прежнего
    // плоского белого тона.
    let snowT = smoothstep(0.9, 1.0, t) * smoothstep(0.35, 0.75, cold);
    albedo = mix(withMoss, snowC, snowT);
  }

  let lit = albedo * lighting;
  let d = distance(in.worldPos, fog.eye.xyz);
  let k = d * fog.color.w; let f = clamp(1.0 - exp(-k * k), 0.0, 1.0);
  return vec4f(mix(lit, fog.color.rgb, f), 1.0);
}
`,yt=`
struct Uniforms { vp: mat4x4f };
struct Fog { eye: vec4f, color: vec4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<uniform> fog: Fog;

struct VOut { @builtin(position) pos: vec4f, @location(0) color: vec3f, @location(1) worldPos: vec3f };

@vertex
fn vs(@location(0) localPos: vec3f, @location(1) worldPos: vec3f, @location(2) scale: f32, @location(3) color: vec3f) -> VOut {
  var out: VOut;
  let wp = worldPos + localPos * scale;
  out.pos = u.vp * vec4f(wp, 1.0);
  out.color = color;
  out.worldPos = wp;
  return out;
}
@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  let d = distance(in.worldPos, fog.eye.xyz);
  let k = d * fog.color.w; let f = clamp(1.0 - exp(-k * k), 0.0, 1.0);
  return vec4f(mix(in.color, fog.color.rgb, f), 1.0);
}
`,bt=`
struct Uniforms { vp: mat4x4f };
struct Fog { eye: vec4f, color: vec4f };
struct Light { vp: mat4x4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<uniform> fog: Fog;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var trunkTex: texture_2d<f32>;
@group(0) @binding(4) var canopyTex: texture_2d<f32>;
@group(0) @binding(5) var<uniform> light: Light;
@group(0) @binding(6) var shadowSamp: sampler_comparison;
@group(0) @binding(7) var shadowTex: texture_depth_2d;

struct VOut {
  @builtin(position) pos: vec4f, @location(0) worldPos: vec3f, @location(1) normal: vec3f,
  @location(2) uv: vec2f, @location(3) materialId: f32, @location(4) shade: f32, @location(5) tintColor: vec3f,
  @location(6) lightClip: vec4f,
};

@vertex
fn vs(
  @location(0) localPos: vec3f, @location(1) localNormal: vec3f, @location(2) materialId: f32, @location(3) shade: f32, @location(4) uv: vec2f,
  @location(5) worldPos: vec3f, @location(6) scale: vec3f, @location(7) yaw: f32, @location(8) tintColor: vec3f
) -> VOut {
  var out: VOut;
  let c = cos(yaw); let s = sin(yaw);
  let rp = vec3f(localPos.x * c - localPos.z * s, localPos.y, localPos.x * s + localPos.z * c) * scale;
  let rn = vec3f(localNormal.x * c - localNormal.z * s, localNormal.y, localNormal.x * s + localNormal.z * c);
  let wp = worldPos + rp;
  out.pos = u.vp * vec4f(wp, 1.0);
  out.worldPos = wp;
  out.normal = rn;
  out.uv = uv;
  out.materialId = materialId;
  out.shade = shade;
  out.tintColor = tintColor;
  out.lightClip = light.vp * vec4f(wp, 1.0);
  return out;
}
// Дословная копия shadowFactor из TERRAIN_SHADER — отдельные строки
// шейдеров (createShaderModule компилирует каждую независимо), общий
// WGSL-модуль на оба пайплайна тут не заводили нигде в файле, дублирование
// тут того же порядка, что и у тумана (см. MARKER_SHADER/TERRAIN_SHADER).
fn shadowFactor(clip: vec4f) -> f32 {
  let ndc = clip.xyz / clip.w;
  if (ndc.x < -1.0 || ndc.x > 1.0 || ndc.y < -1.0 || ndc.y > 1.0 || ndc.z < 0.0 || ndc.z > 1.0) {
    return 1.0;
  }
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  let bias = 0.0025;
  let texel = 1.0 / ${pt.toFixed(1)};
  var sum = 0.0;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      sum = sum + textureSampleCompareLevel(shadowTex, shadowSamp, uv + vec2f(f32(dx), f32(dy)) * texel, ndc.z - bias);
    }
  }
  return sum / 9.0;
}
@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  // textureSampleLevel (не textureSample), см. коммент в TERRAIN_SHADER —
  // тут ветвление по materialId ещё явнее, обычный textureSample тут
  // вообще не компилируется.
  var base: vec4f;
  if (in.materialId > 0.5) {
    base = textureSampleLevel(canopyTex, samp, in.uv, 0.0);
    if (base.a < 0.5) { discard; }
    base = vec4f(base.rgb * in.tintColor, 1.0);
  } else {
    base = textureSampleLevel(trunkTex, samp, in.uv, 0.0);
  }
  let sun = normalize(vec3f(0.62, 0.38, 0.30));
  let n = normalize(in.normal);
  // У карточек кроны/травы/куста (materialId=1) нормаль — это нормаль
  // ПЛОСКОСТИ, а не настоящего объёма листвы: если плоскость развёрнута
  // случайным yaw инстанса боком к солнцу, честный diffuse-пол 0.35 из
  // TERRAIN_SHADER гасил её почти до черноты — в реальности объём листвы
  // всё равно ловил бы рассеянный свет с других сторон — раньше поднимали
  // плоский ambient-пол (0.6 вместо 0.35) для карточек. Теперь ambient не
  // плоский скаляр, а полусферный тон (тот же приём и та же палитра, что
  // и в TERRAIN_SHADER — держать в синхроне при правке, иначе деревья
  // светились бы другим тоном, чем земля под ними): canopyBoost — тот же
  // избыточный "пол" для карточек кроны/травы/куста, просто как добавка к
  // цветному ambient, а не замена скаляра другим скаляром.
  let canopyBoost = select(0.0, 0.22, in.materialId > 0.5);
  let ndotl = max(0.0, dot(n, sun));
  let shadow = shadowFactor(in.lightClip);
  let skyTint = vec3f(0.42, 0.37, 0.28);
  let groundTint = vec3f(0.20, 0.16, 0.13);
  let sunLightColor = vec3f(0.85, 0.70, 0.48);
  let hemi = mix(groundTint, skyTint, clamp(n.y * 0.5 + 0.5, 0.0, 1.0)) + vec3f(canopyBoost);
  let lighting = hemi + sunLightColor * ndotl * shadow;
  let lit = base.rgb * lighting * in.shade;
  let d = distance(in.worldPos, fog.eye.xyz);
  let k = d * fog.color.w; let f = clamp(1.0 - exp(-k * k), 0.0, 1.0);
  return vec4f(mix(lit, fog.color.rgb, f), 1.0);
}
`,xt=`
struct Uniforms { vp: mat4x4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex
fn vs(@location(0) pos: vec3f) -> @builtin(position) vec4f {
  return u.vp * vec4f(pos, 1.0);
}
`,St=`
struct Uniforms { vp: mat4x4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var canopyTex: texture_2d<f32>;

struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) materialId: f32 };

@vertex
fn vs(
  @location(0) localPos: vec3f, @location(2) materialId: f32, @location(4) uv: vec2f,
  @location(5) worldPos: vec3f, @location(6) scale: vec3f, @location(7) yaw: f32
) -> VOut {
  var out: VOut;
  let c = cos(yaw); let s = sin(yaw);
  let rp = vec3f(localPos.x * c - localPos.z * s, localPos.y, localPos.x * s + localPos.z * c) * scale;
  out.pos = u.vp * vec4f(worldPos + rp, 1.0);
  out.uv = uv;
  out.materialId = materialId;
  return out;
}
@fragment
fn fs(in: VOut) {
  if (in.materialId > 0.5) {
    let a = textureSampleLevel(canopyTex, samp, in.uv, 0.0).a;
    if (a < 0.5) { discard; }
  }
}
`,Ct=`
struct SkyCam { xAxis: vec4f, yAxis: vec4f, zAxis: vec4f, params: vec4f };
@group(0) @binding(0) var<uniform> cam: SkyCam;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var texSky: texture_2d<f32>;
@group(0) @binding(3) var texClouds: texture_2d<f32>;

struct VOut { @builtin(position) pos: vec4f, @location(0) ndc: vec2f };

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VOut;
  // z=0.9999 (не ровно 1.0) — небольшой запас от самой границы clip-объёма
  // NDC z∈[0,1] на случай погрешности округления на границе на слабом/
  // софтверном драйвере; depthCompare:"always" всё равно не сравнивает эту
  // глубину ни с чем, запас нужен только чтобы примитив не срезало клиппингом.
  out.pos = vec4f(corners[vi], 0.9999, 1.0);
  out.ndc = corners[vi];
  return out;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  let tanHalf = cam.params.x;
  let aspect = cam.params.y;
  let time = cam.params.z;
  let dir = normalize(in.ndc.x * aspect * tanHalf * cam.xAxis.xyz + in.ndc.y * tanHalf * cam.yAxis.xyz - cam.zAxis.xyz);
  let u = atan2(dir.x, dir.z) / 6.28318531 + 0.5;
  let v = clamp(0.5 - asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265, 0.0, 1.0);
  var color = textureSampleLevel(texSky, samp, vec2f(u, v), 0.0).rgb;

  // Тот же SUN_DIR, что и в TERRAIN_SHADER/DECOR_SHADER/MODEL_SHADER —
  // держать в синхроне при правке общего направления света.
  let sunDir = normalize(vec3f(0.62, 0.38, 0.30));
  let sunDot = dot(dir, sunDir);
  let sunColor = vec3f(1.0, 0.92, 0.75);
  let sunDisc = smoothstep(0.9985, 0.9997, sunDot);
  let sunGlow = pow(max(0.0, sunDot), 220.0) * 0.6;
  color = mix(color, sunColor, sunDisc) + sunColor * sunGlow;

  let cloudUV = vec2f(u * 3.0 + time * 0.006, v * 1.5);
  let cloudTex = textureSampleLevel(texClouds, samp, cloudUV, 0.0);
  let cloudAlpha = cloudTex.a * smoothstep(0.05, 0.35, dir.y);
  color = mix(color, cloudTex.rgb, cloudAlpha);

  return vec4f(color, 1.0);
}
`,wt=.5,Tt=1.4,Y=new Float32Array([0,Tt,0,wt,0,0,0,0,wt,0,Tt,0,0,0,wt,-.5,0,0,0,Tt,0,-.5,0,0,0,0,-.5,0,Tt,0,0,0,-.5,wt,0,0]),Et=Y.length/3,Dt=7;async function Ot(e,t,n){let r=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),i=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),a=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),o=e.createTexture({size:[pt,pt],format:`depth32float`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}).createView(),s=e.createSampler({compare:`less`,magFilter:`linear`,minFilter:`linear`}),c=ze(-1,1,-1,1,.1,1),l=!0,u=1/0,d=1/0,f=1.5;function p(t,n){let r=t-u,i=n-d;if(!l&&r*r+i*i<f*f)return;u=t,d=n;let o=He([t+ft[0]*ht,ft[1]*ht,n+ft[2]*ht],[t,0,n],[0,1,0]);c=Le(ze(-60,mt,-60,mt,gt,_t),o),e.queue.writeBuffer(a,0,c),l=!0}let[m,h,g,_,v,y,b,x,S,ee,C]=await Promise.all([J(e,`/textures/ground/sand.jpg`),J(e,`/textures/ground/grass.jpg`),J(e,`/textures/ground/dry_meadow.jpg`),J(e,`/textures/ground/scree.jpg`),J(e,`/textures/ground/rock.jpg`),J(e,`/textures/ground/snow.jpg`),J(e,`/textures/ground/forest_floor.jpg`),J(e,`/textures/ground/desert.jpg`),J(e,`/textures/ground/marsh.jpg`),J(e,`/textures/ground/tundra_moss.jpg`),J(e,`/textures/water/detail.jpg`)]),w=e.createSampler({addressModeU:`repeat`,addressModeV:`repeat`,magFilter:`linear`,minFilter:`linear`}),te=e.createShaderModule({code:vt}),ne=e.createRenderPipeline({layout:`auto`,vertex:{module:te,entryPoint:`vs`,buffers:[{arrayStride:60,attributes:[{shaderLocation:0,offset:0,format:`float32x3`},{shaderLocation:1,offset:12,format:`float32x3`},{shaderLocation:2,offset:24,format:`float32x3`},{shaderLocation:3,offset:36,format:`float32x2`},{shaderLocation:4,offset:44,format:`float32`},{shaderLocation:5,offset:48,format:`float32`},{shaderLocation:6,offset:52,format:`float32`},{shaderLocation:7,offset:56,format:`float32`}]}]},fragment:{module:te,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),re=e.createBindGroup({layout:ne.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}},{binding:2,resource:w},{binding:3,resource:m.createView()},{binding:4,resource:h.createView()},{binding:5,resource:g.createView()},{binding:6,resource:_.createView()},{binding:7,resource:v.createView()},{binding:8,resource:{buffer:a}},{binding:9,resource:s},{binding:10,resource:o},{binding:11,resource:y.createView()},{binding:12,resource:b.createView()},{binding:13,resource:x.createView()},{binding:14,resource:S.createView()},{binding:15,resource:ee.createView()},{binding:16,resource:C.createView()}]}),[ie,ae]=await Promise.all([J(e,`/textures/sky/sky.jpg`),J(e,`/textures/sky/clouds.png`)]),T=e.createSampler({addressModeU:`repeat`,addressModeV:`clamp-to-edge`,magFilter:`linear`,minFilter:`linear`}),oe=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),se=e.createShaderModule({code:Ct}),ce=e.createRenderPipeline({layout:`auto`,vertex:{module:se,entryPoint:`vs`},fragment:{module:se,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`,cullMode:`none`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!1,depthCompare:`always`}}),le=e.createBindGroup({layout:ce.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:oe}},{binding:1,resource:T},{binding:2,resource:ie.createView()},{binding:3,resource:ae.createView()}]});function E(t,n,r,i,a,o){let s=new Float32Array([t[0],t[1],t[2],0,n[0],n[1],n[2],0,r[0],r[1],r[2],0,i,a,o,0]);e.queue.writeBuffer(oe,0,s)}let ue=e.createShaderModule({code:xt}),de=e.createRenderPipeline({layout:`auto`,vertex:{module:ue,entryPoint:`vs`,buffers:[{arrayStride:60,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth32float`,depthWriteEnabled:!0,depthCompare:`less`}}),fe=e.createBindGroup({layout:de.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}}]}),D=new Set;function pe(e){return e===`world-backdrop`?`backdrop`:e.startsWith(`far:`)?`far`:`near`}let O={near:null,far:null,backdrop:null},me=t=>new dt({createBuffer(n){O[t]?.destroy(),O[t]=e.createBuffer({size:n,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST})},write(n,r){let i=O[t];i&&e.queue.writeBuffer(i,n,r,0,r.length)}}),k={near:me(`near`),far:me(`far`),backdrop:me(`backdrop`)},he=e.createShaderModule({code:yt}),A=e.createBuffer({size:Y.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(A,0,Y);let j=e.createRenderPipeline({layout:`auto`,vertex:{module:he,entryPoint:`vs`,buffers:[{arrayStride:12,stepMode:`vertex`,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]},{arrayStride:28,stepMode:`instance`,attributes:[{shaderLocation:1,offset:0,format:`float32x3`},{shaderLocation:2,offset:12,format:`float32`},{shaderLocation:3,offset:16,format:`float32x3`}]}]},fragment:{module:he,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),M=e.createBindGroup({layout:j.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}}]}),N=null,ge=null,P=0,F=0,_e=e.createShaderModule({code:bt});function ve(t){let n=e.createBuffer({size:Math.max(t.vertexCount*10*4,4),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),r=new Float32Array(t.vertexCount*10);for(let e=0;e<t.vertexCount;e++)r.set(t.positions.subarray(e*3,e*3+3),e*10),r.set(t.normals.subarray(e*3,e*3+3),e*10+3),r[e*10+6]=t.materialIds[e],r[e*10+7]=t.shades[e],r.set(t.uvs.subarray(e*2,e*2+2),e*10+8);return e.queue.writeBuffer(n,0,r),n}let I=await Promise.all(Object.entries({bark:`/textures/decor/bark.jpg`,birchBark:`/textures/decor/birch_bark.jpg`,conifer:`/textures/decor/conifer_a.png`,conifer2:`/textures/decor/conifer_b.png`,broadleaf:`/textures/decor/broadleaf.png`,autumn:`/textures/decor/autumn.png`,birchLeaf:`/textures/decor/birch_leaf.png`,bush:`/textures/decor/bush.png`,grassTuft:`/textures/decor/grass_tuft.png`}).map(async([t,n])=>[t,await J(e,n)])),L={...Object.fromEntries(I),rock:v},R=e.createSampler({magFilter:`linear`,minFilter:`linear`}),ye={spruce:{trunk:`bark`,canopy:`conifer`},pine:{trunk:`bark`,canopy:`conifer2`},broadleaf:{trunk:`bark`,canopy:`broadleaf`},autumn:{trunk:`bark`,canopy:`autumn`},birch:{trunk:`birchBark`,canopy:`birchLeaf`},dead:{trunk:`bark`,canopy:`bark`},bush:{trunk:`bark`,canopy:`bush`},grass:{trunk:`bark`,canopy:`grassTuft`},rock:{trunk:`bark`,canopy:`rock`}},be={spruce:Ze,pine:Qe,broadleaf:$e,autumn:$e,birch:et,dead:tt,bush:nt,grass:rt,rock:ut},xe=[{arrayStride:40,stepMode:`vertex`,attributes:[{shaderLocation:0,offset:0,format:`float32x3`},{shaderLocation:1,offset:12,format:`float32x3`},{shaderLocation:2,offset:24,format:`float32`},{shaderLocation:3,offset:28,format:`float32`},{shaderLocation:4,offset:32,format:`float32x2`}]},{arrayStride:40,stepMode:`instance`,attributes:[{shaderLocation:5,offset:0,format:`float32x3`},{shaderLocation:6,offset:12,format:`float32x3`},{shaderLocation:7,offset:24,format:`float32`},{shaderLocation:8,offset:28,format:`float32x3`}]}],Se=e.createRenderPipeline({layout:`auto`,vertex:{module:_e,entryPoint:`vs`,buffers:xe},fragment:{module:_e,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),Ce=e.createShaderModule({code:St}),z=e.createRenderPipeline({layout:`auto`,vertex:{module:Ce,entryPoint:`vs`,buffers:xe},fragment:{module:Ce,entryPoint:`fs`,targets:[]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth32float`,depthWriteEnabled:!0,depthCompare:`less`}}),B=new Map;for(let t of Object.keys(ye)){let n=be[t](),c=ye[t],l=e.createBindGroup({layout:Se.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}},{binding:2,resource:R},{binding:3,resource:L[c.trunk].createView()},{binding:4,resource:L[c.canopy].createView()},{binding:5,resource:{buffer:a}},{binding:6,resource:s},{binding:7,resource:o}]}),u=e.createBindGroup({layout:z.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}},{binding:1,resource:R},{binding:2,resource:L[c.canopy].createView()}]});B.set(t,{mesh:n,localBuf:ve(n),instBuf:null,instCapacity:0,instanceCount:0,bindGroup:l,shadowBindGroup:u,scratch:null,shadowInstBuf:null,shadowInstCapacity:0,shadowInstanceCount:0,shadowScratch:null})}let V=null,we=null;function H(){let n=t.canvas.width,r=t.canvas.height;V&&V.width===n&&V.height===r||(V?.destroy(),V=e.createTexture({size:[n,r],format:`depth24plus`,usage:GPUTextureUsage.RENDER_ATTACHMENT}),we=V.createView())}function Te(e,t){let n=new Float32Array(t.vertexCount*15);for(let e=0;e<t.vertexCount;e++)n.set(t.positions.subarray(e*3,e*3+3),e*15),n.set(t.colors.subarray(e*3,e*3+3),e*15+3),n.set(t.normals.subarray(e*3,e*3+3),e*15+6),n.set(t.uvs.subarray(e*2,e*2+2),e*15+9),n[e*15+11]=t.elevations[e],n[e*15+12]=t.waterFlags[e],n[e*15+13]=t.forestFracs[e],n[e*15+14]=t.moistureFracs[e];D.add(e);let r=pe(e);k[r].put(e,n,t.vertexCount),r===`near`&&(l=!0)}function Ee(e){if(!D.has(e))return;D.delete(e);let t=pe(e);k[t].remove(e),t===`near`&&(l=!0)}function De(t){if(F=t.length,F>P&&(N?.destroy(),P=Math.max(F,8),N=e.createBuffer({size:P*Dt*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),ge=new Float32Array(P*Dt)),F===0||!N)return;let n=ge;t.forEach((e,t)=>{let r=t*Dt;n[r]=e.x,n[r+1]=e.y,n[r+2]=e.z,n[r+3]=1,n[r+4]=e.color[0],n[r+5]=e.color[1],n[r+6]=e.color[2]}),e.queue.writeBuffer(N,0,n,0,F*Dt)}function Oe(t,n,r){let i=t.scratch;if(!i||t.instanceCount===0){t.shadowInstanceCount=0;return}let a=n-mt,o=n+mt,s=r-mt,c=r+mt;t.instanceCount>t.shadowInstCapacity&&(t.shadowInstBuf?.destroy(),t.shadowInstCapacity=Math.max(t.instanceCount,8),t.shadowInstBuf=e.createBuffer({size:t.shadowInstCapacity*10*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),t.shadowScratch=new Float32Array(t.shadowInstCapacity*10));let l=t.shadowScratch,u=0;for(let e=0;e<t.instanceCount;e++){let t=e*10,n=i[t],r=i[t+2];n<a||n>o||r<s||r>c||(l.set(i.subarray(t,t+10),u*10),u++)}t.shadowInstanceCount=u,u>0&&t.shadowInstBuf&&e.queue.writeBuffer(t.shadowInstBuf,0,l,0,u*10)}function ke(t,n){let r=t.length;if(r>n.instCapacity&&(n.instBuf?.destroy(),n.instCapacity=Math.max(r,8),n.instBuf=e.createBuffer({size:n.instCapacity*10*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),n.scratch=new Float32Array(n.instCapacity*10)),n.instanceCount=r,r===0||!n.instBuf)return;let i=n.scratch;t.forEach((e,t)=>{let n=t*10;i[n]=e.x,i[n+1]=e.y,i[n+2]=e.z,i[n+3]=e.scale[0],i[n+4]=e.scale[1],i[n+5]=e.scale[2],i[n+6]=e.yaw,i[n+7]=e.color[0],i[n+8]=e.color[1],i[n+9]=e.color[2]}),e.queue.writeBuffer(n.instBuf,0,i,0,r*10)}function U(e){let t=new Map;for(let n of e){let e=t.get(n.kind);e||(e=[],t.set(n.kind,e)),e.push(n)}for(let[e,n]of B)ke(t.get(e)??[],n);l=!0}function W(t){e.queue.writeBuffer(r,0,t)}function Ae(t,n,r,a){let o=new Float32Array([t[0],t[1],t[2],a,n[0],n[1],n[2],r]);e.queue.writeBuffer(i,0,o)}function je(n,r){H();let i=e.createCommandEncoder();if(l){let e=i.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:o,depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}});k.near.vertexCount>0&&O.near&&(e.setPipeline(de),e.setBindGroup(0,fe),e.setVertexBuffer(0,O.near),e.draw(k.near.vertexCount));let t=!1;for(let e of B.values()){if(e.instanceCount===0){e.shadowInstanceCount=0;continue}Oe(e,u,d),e.shadowInstanceCount>0&&(t=!0)}if(t){e.setPipeline(z);for(let t of B.values())t.shadowInstanceCount===0||!t.shadowInstBuf||(e.setBindGroup(0,t.shadowBindGroup),e.setVertexBuffer(0,t.localBuf),e.setVertexBuffer(1,t.shadowInstBuf),e.draw(t.mesh.vertexCount,t.shadowInstanceCount))}e.end(),l=!1}let a=t.getCurrentTexture().createView(),s=i.beginRenderPass({colorAttachments:[{view:a,clearValue:n,loadOp:`clear`,storeOp:`store`}],depthStencilAttachment:{view:we,depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}});if(s.setPipeline(ce),s.setBindGroup(0,le),s.draw(3),D.size>0){s.setPipeline(ne),s.setBindGroup(0,re);for(let e of[`near`,`far`,`backdrop`]){let t=k[e],n=O[e];t.vertexCount===0||!n||(s.setVertexBuffer(0,n),s.draw(t.vertexCount))}}F>0&&N&&(s.setPipeline(j),s.setBindGroup(0,M),s.setVertexBuffer(0,A),s.setVertexBuffer(1,N),s.draw(Et,F));let c=!1;for(let e of B.values())if(e.instanceCount>0){c=!0;break}if(c){s.setPipeline(Se);for(let e of B.values())e.instanceCount===0||!e.instBuf||(s.setBindGroup(0,e.bindGroup),s.setVertexBuffer(0,e.localBuf),s.setVertexBuffer(1,e.instBuf),s.draw(e.mesh.vertexCount,e.instanceCount))}r?.(s),s.end(),e.queue.submit([i.finish()])}function Me(){return{lightBuf:a,shadowView:o,shadowSampler:s}}return{setTerrainChunk:Te,removeTerrainChunk:Ee,setMarkers:De,setDecor:U,setVP:W,setFog:Ae,setSunTarget:p,setSkyCamera:E,getShadowResources:Me,frame:je}}var X=12345,kt=.235,At=2400,jt=1200,Mt=At/2;jt/2;var Nt=2.5;function Z(e,t,n){let r=e*374761393+t*668265263+n*1274126177;return r=Math.imul(r^r>>>13,1274126177),((r^r>>>16)>>>0)/4294967296}function Pt(e,t,n){let r=Math.floor(e),i=Math.floor(t),a=e-r,o=t-i,s=a*a*(3-2*a),c=o*o*(3-2*o),l=Z(r,i,n),u=Z(r+1,i,n),d=Z(r,i+1,n),f=Z(r+1,i+1,n);return(l*(1-s)+u*s)*(1-c)+(d*(1-s)+f*s)*c}var Ft=null,It=null,Lt=null;async function Rt(e,t){let n=await fetch(e);if(!n.ok)throw Error(`${e}: HTTP ${n.status}`);let r=await n.arrayBuffer();if(r.byteLength!==t)throw Error(`${e}: неверный размер (${r.byteLength} байт, ожидалось ${t})`);return r}async function zt(){let e=At*jt,[t,n,r]=await Promise.all([Rt(`/heightmap/elevation-v6.bin`,e*2),Rt(`/heightmap/forest.bin`,e),Rt(`/heightmap/moisture.bin`,e)]);Ft=new Uint16Array(t),It=new Uint8Array(n),Lt=new Uint8Array(r)}function Bt(e,t,n,r){let i=Math.floor(t),a=Math.floor(n),o=Math.min(i+1,2399),s=Math.min(a+1,1199),c=t-i,l=n-a,u=a*At+i,d=a*At+o,f=s*At+i,p=s*At+o,m=e[u]+(e[d]-e[u])*c;return(m+(e[f]+(e[p]-e[f])*c-m)*l)*r}function Vt(e,t){return[Math.max(0,Math.min(2399,e+Mt)),Math.max(0,Math.min(1199,t+600))]}function Ht(e,t){if(!Ft)return .285;let[n,r]=Vt(e,t);return Bt(Ft,n,r,Nt/65535)}function Ut(e,t){let n=Ht(e,t),r=(Ht(e+.7,t)+Ht(e-.7,t)+Ht(e,t+.7)+Ht(e,t-.7))*.25;return n*.55+r*.45}var Wt=32,Gt=new Map;function Kt(e,t){return Math.floor(e/Wt)+`,`+Math.floor(t/Wt)}function qt(e,t,n){let r={x:e,z:t,targetH:Math.max(Ut(e,t),.245),radius:n},i=Kt(e,t),a=Gt.get(i);a?a.push(r):Gt.set(i,[r])}function Q(e,t){let n=Ht(e,t);if(n<.235||Gt.size===0)return n;let r=Math.floor(e/Wt),i=Math.floor(t/Wt),a=0,o=0;for(let n=-1;n<=1;n++)for(let s=-1;s<=1;s++){let c=Gt.get(r+s+`,`+(i+n));if(c)for(let n of c){let r=Math.hypot(e-n.x,t-n.z);if(r>=n.radius)continue;let i=n.radius*.55,s=r<=i?1:1-((r-i)/(n.radius-i))**2*(3-2*((r-i)/(n.radius-i)));a+=s,o+=s*n.targetH}}return a<=0?n:a>=1?o/a:n*(1-a)+o}function Jt(e,t){return Q(e,t)<kt}function Yt(e,t){if(!Lt)return .5;let[n,r]=Vt(e,t);return Bt(Lt,n,r,1/255)}function Xt(e,t){if(!It)return 0;let[n,r]=Vt(e,t);return Bt(It,n,r,1/255)}var Zt=(e,t,n)=>[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n],Qt=[.14,.24,.28],$t=[.05,.11,.19];function en(e){return Zt(Qt,$t,Math.min(1,e))}var tn=[0,1,0],nn=6;function rn(e,t){let n=.5,r=Q(e-n,t)*13,i=Q(e+n,t)*13,a=Q(e,t-n)*13,o=Q(e,t+n)*13;return G([-(i-r)/(2*n),1,-(o-a)/(2*n)])}var an=6;function on(e,t,n){let r=n/2,i=1/0;for(let a=0;a<=an;a++){let o=-r+a/an*n;for(let a=0;a<=an;a++){let s=Q(e+(-r+a/an*n),t+o);s<i&&(i=s)}}return i}function sn(e,t,n,r,i=1,a=0){let o=Math.round((n-e)/i),s=Math.round((r-t)/i),c=i===1,l=[],u=[],d=[],f=[],p=[],m=[],h=[],g=[];function _(e,t){let n=c?Q(e,t):on(e,t,i),r=n<kt,o=r?[e,kt*13-a,t]:[e,n*13-a,t],s=r?en((kt-n)*3):[0,0,0],l=r?tn:c?rn(e,t):tn,u=r?0:Xt(e,t),d=r?0:Yt(e,t);return{p:o,c:s,n:l,uv:[e/nn,t/nn],e:n,water:+!!r,forest:u,moisture:d}}let v=[];for(let n=0;n<=s;n++){let r=[];for(let a=0;a<=o;a++)r.push(_(e+a*i,t+n*i));v.push(r)}function y(e,t,n){let r=c?null:G(Ie(Pe(t.p,e.p),Pe(n.p,e.p)));for(let i of[e,t,n]){l.push(i.p[0],i.p[1],i.p[2]),u.push(i.c[0],i.c[1],i.c[2]);let e=r??i.n;d.push(e[0],e[1],e[2]),f.push(i.uv[0],i.uv[1]),p.push(i.e),m.push(i.water),h.push(i.forest),g.push(i.moisture)}}for(let e=0;e<s;e++)for(let t=0;t<o;t++){let n=v[e][t],r=v[e][t+1],i=v[e+1][t],a=v[e+1][t+1];y(n,a,r),y(n,i,a)}return{positions:new Float32Array(l),colors:new Float32Array(u),normals:new Float32Array(d),uvs:new Float32Array(f),elevations:new Float32Array(p),waterFlags:new Float32Array(m),forestFracs:new Float32Array(h),moistureFracs:new Float32Array(g),vertexCount:l.length/3}}var cn=9,ln=10,un=380,dn={d:[1,0],arrowright:[1,0],a:[-1,0],arrowleft:[-1,0],w:[0,1],arrowup:[0,1],s:[0,-1],arrowdown:[0,-1]},fn=700;function pn(e,t){let n=!0,r=new Map,i=null,a=null,o=null,s=null,c=null;function l(){n=!1,c?.()}function u(){let e=[...r.values()];return{x:(e[0].x+e[1].x)/2,y:(e[0].y+e[1].y)/2,d:Math.hypot(e[0].x-e[1].x,e[0].y-e[1].y)}}function d(){let e=[...r.values()];return Math.atan2(e[1].y-e[0].y,e[1].x-e[0].x)}function f(e,n){let r=t.dist*.0022,i=e*r,a=n*r,o=Math.cos(t.yaw),s=Math.sin(t.yaw);t.target[0]=Math.max(-Mt,Math.min(Mt,t.target[0]-(i*o-a*s))),t.target[2]=Math.max(-600,Math.min(600,t.target[2]+(i*s+a*o))),t.target[1]=Q(t.target[0],t.target[2])*13+1}e.addEventListener(`pointerdown`,n=>{n.preventDefault(),l(),r.set(n.pointerId,{x:n.clientX,y:n.clientY});try{e.setPointerCapture(n.pointerId)}catch{}if(r.size===1)i={x:n.clientX,y:n.clientY,tx:t.target[0],tz:t.target[2]},o={x:n.clientX,y:n.clientY,t:performance.now()};else if(r.size===2){i=null,o=null;let e=u();a={d:e.d,y:e.y,dist:t.dist,yaw:t.yaw,pitch:t.pitch,angle:d()}}}),e.addEventListener(`pointermove`,e=>{if(r.has(e.pointerId)){if(e.preventDefault(),r.set(e.pointerId,{x:e.clientX,y:e.clientY}),o&&Math.hypot(e.clientX-o.x,e.clientY-o.y)>ln&&(o=null),r.size>=2&&a){let e=u();t.dist=Math.max(cn,Math.min(140,a.dist*(a.d/Math.max(12,e.d)))),t.yaw=a.yaw+(d()-a.angle),t.pitch=Math.max(.08,Math.min(1.42,a.pitch+(e.y-a.y)*.005));return}i&&(t.target[0]=i.tx,t.target[2]=i.tz,f(e.clientX-i.x,i.y-e.clientY))}});function p(e){if(o&&r.size===1&&performance.now()-o.t<un&&s?.(o.x,o.y),o=null,r.delete(e.pointerId),r.size<2&&(a=null),r.size===0)i=null;else if(r.size===1){let e=[...r.values()][0];i={x:e.x,y:e.y,tx:t.target[0],tz:t.target[2]}}}e.addEventListener(`pointerup`,p),e.addEventListener(`pointercancel`,p),e.addEventListener(`wheel`,e=>{e.preventDefault(),l(),t.dist=Math.max(cn,Math.min(140,t.dist*(e.deltaY<0?.9:1.11)))},{passive:!1});let m=new Set;window.addEventListener(`keydown`,e=>{let t=e.key.toLowerCase();t in dn&&(m.add(t),l())}),window.addEventListener(`keyup`,e=>{m.delete(e.key.toLowerCase())});let h=null;function g(e){if(h===null){h=e;return}let t=Math.min(.1,(e-h)/1e3);if(h=e,m.size===0||i)return;let n=0,r=0;for(let e of m){let[t,i]=dn[e];n+=t,r+=i}(n!==0||r!==0)&&f(n*fn*t,r*fn*t)}return{isAutoOrbiting:()=>n,stopAuto:l,update:g,onTap(e){s=e},onInteract(e){c=e}}}var mn={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},hn={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};async function gn(e){let t=await(await fetch(e)).arrayBuffer(),n=new DataView(t);if(n.getUint32(0,!0)!==1179937895)throw Error(`не glTF-контейнер: `+e);let r=n.getUint32(8,!0),i=12,a=null,o=null;for(;i<r;){let e=n.getUint32(i,!0),r=n.getUint32(i+4,!0),s=t.slice(i+8,i+8+e);r===1313821514?a=JSON.parse(new TextDecoder().decode(s)):r===5130562&&(o=s),i+=8+e}if(!a||!o)throw Error(`GLB без JSON/BIN чанка: `+e);let s=e=>a.accessors[e],c=e=>a.bufferViews[e];function l(e){let t=s(e),n=c(t.bufferView),r=mn[t.componentType],i=(n.byteOffset||0)+(t.byteOffset||0);return new r(o,i,t.count*hn[t.type])}let u=a.meshes[0].primitives[0],d=l(u.attributes.POSITION),f=l(u.attributes.NORMAL),p=l(u.attributes.TEXCOORD_0),m=l(u.indices),h=a.materials[u.material].pbrMetallicRoughness.baseColorTexture.index,g=a.images[a.textures[h].source],_=c(g.bufferView);return{positions:d,normals:f,uvs:p,indices:m,imageBytes:o.slice(_.byteOffset||0,(_.byteOffset||0)+_.byteLength),imageMimeType:g.mimeType}}var _n=`
// vp раньше жил в том же per-instance Uniforms, что и model — draw() ниже
// переписывал ЭТИ ЖЕ 64 байта в буфер КАЖДОГО инстанса КАЖДЫЙ кадр, хотя
// VP один и тот же для всей сцены за кадр (та же матрица, что и у
// terrain/marker в renderer.ts, там она давно в общем uniformBuf, не по
// одному на объект). С отсечением по экрану/дальности (main.ts,
// isModelOnScreen) одновременно видимых зданий может быть несколько
// десятков — столько же лишних writeBuffer на один и тот же VP, каждый
// кадр. Вынесен в отдельный общий буфер (см. vpBuf/setVP ниже, тот же
// приём, что уже применялся к fogBuf) — модельная матрица остаётся
// per-instance (она и правда своя у каждого здания), но пишется ОДИН раз
// при создании инстанса и больше никогда не трогается (здания не двигаются
// сами по себе) — draw() теперь не пишет в GPU-буфер вообще, только меняет
// bind group/vertex buffers и рисует.
@group(0) @binding(0) var<uniform> vp: mat4x4f;
struct Fog { eye: vec4f, color: vec4f };
struct Light { vp: mat4x4f };
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> fog: Fog;
@group(0) @binding(4) var<uniform> light: Light;
@group(0) @binding(5) var shadowSamp: sampler_comparison;
@group(0) @binding(6) var shadowTex: texture_depth_2d;
@group(0) @binding(7) var<uniform> model: mat4x4f;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) worldNormal: vec3f,
  @location(2) worldPos: vec3f,
  @location(3) lightClip: vec4f,
};

@vertex
fn vs(@location(0) pos: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f) -> VOut {
  var out: VOut;
  let world = model * vec4f(pos, 1.0);
  out.pos = vp * world;
  out.uv = uv;
  // модельная матрица тут без неравномерного масштаба — обычной 3x3 части достаточно для нормали
  out.worldNormal = normalize((model * vec4f(normal, 0.0)).xyz);
  out.worldPos = world.xyz;
  out.lightClip = light.vp * world;
  return out;
}

fn shadowFactor(clip: vec4f) -> f32 {
  let ndc = clip.xyz / clip.w;
  if (ndc.x < -1.0 || ndc.x > 1.0 || ndc.y < -1.0 || ndc.y > 1.0 || ndc.z < 0.0 || ndc.z > 1.0) {
    return 1.0;
  }
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  let bias = 0.0025;
  let texel = 1.0 / ${pt.toFixed(1)};
  var sum = 0.0;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      sum = sum + textureSampleCompareLevel(shadowTex, shadowSamp, uv + vec2f(f32(dx), f32(dy)) * texel, ndc.z - bias);
    }
  }
  return sum / 9.0;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  let sun = normalize(vec3f(0.62, 0.38, 0.30));
  let ndotl = max(0.0, dot(in.worldNormal, sun));
  let shadow = shadowFactor(in.lightClip);
  // Тот же полусферный ambient, что и в TERRAIN_SHADER/DECOR_SHADER
  // (renderer.ts) — та же палитра там же держится в синхроне при правке.
  // Без этого здания/лагеря светились бы плоским скаляром 0.35, как земля
  // раньше — заметный разнобой, если земля вокруг уже цветная в тени, а
  // постройка на ней — просто темнее сама себя.
  let skyTint = vec3f(0.42, 0.37, 0.28);
  let groundTint = vec3f(0.20, 0.16, 0.13);
  let sunLightColor = vec3f(0.85, 0.70, 0.48);
  let hemi = mix(groundTint, skyTint, clamp(in.worldNormal.y * 0.5 + 0.5, 0.0, 1.0));
  let lighting = hemi + sunLightColor * ndotl * shadow;
  let base = textureSample(tex, samp, in.uv);
  let lit = base.rgb * lighting;
  // Туман — тот же расчёт, что и у рельефа/маркеров (см. renderer.ts):
  // здания/лагеря вдали тоже должны таять в дымке, а не обрываться резким
  // контуром на фоне уже затуманенной земли под ними.
  let d = distance(in.worldPos, fog.eye.xyz);
  let k = d * fog.color.w; let f = clamp(1.0 - exp(-k * k), 0.0, 1.0);
  return vec4f(mix(lit, fog.color.rgb, f), base.a);
}
`;async function vn(e,t){let n=e.createBuffer({size:t.positions.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(n,0,t.positions);let r=e.createBuffer({size:t.normals.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(r,0,t.normals);let i=e.createBuffer({size:t.uvs.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(i,0,t.uvs);let a=t.indices.byteLength,o=Math.ceil(a/4)*4,s=e.createBuffer({size:o,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});if(o===a)e.queue.writeBuffer(s,0,t.indices);else{let n=new Uint8Array(o);n.set(new Uint8Array(t.indices.buffer,t.indices.byteOffset,a)),e.queue.writeBuffer(s,0,n)}let c=await createImageBitmap(new Blob([t.imageBytes],{type:t.imageMimeType})),l=Math.min(1,1024/Math.max(c.width,c.height)),u=l<1?await createImageBitmap(c,{resizeWidth:Math.round(c.width*l),resizeHeight:Math.round(c.height*l),resizeQuality:`medium`}):c;l<1&&c.close();let d=e.createTexture({size:[u.width,u.height],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return e.queue.copyExternalImageToTexture({source:u},{texture:d},[u.width,u.height]),u.close(),{vao:{posBuf:n,nrmBuf:r,uvBuf:i,idxBuf:s,indexFormat:t.indices instanceof Uint16Array?`uint16`:`uint32`,indexCount:t.indices.length},texture:d}}function yn(e,t,n){let r=e.createShaderModule({code:_n}),i=e.createRenderPipeline({layout:`auto`,vertex:{module:r,entryPoint:`vs`,buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]},{arrayStride:12,attributes:[{shaderLocation:1,offset:0,format:`float32x3`}]},{arrayStride:8,attributes:[{shaderLocation:2,offset:0,format:`float32x2`}]}]},fragment:{module:r,entryPoint:`fs`,targets:[{format:t}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),a=e.createSampler({magFilter:`linear`,minFilter:`linear`,mipmapFilter:`linear`}),o=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});function s(t,n,r){let i=new Float32Array([t[0],t[1],t[2],0,n[0],n[1],n[2],r]);e.queue.writeBuffer(o,0,i)}let c=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});function l(t){e.queue.writeBuffer(c,0,t)}function u(t,r){let s=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});return e.queue.writeBuffer(s,0,r),{model:t,modelBuf:s,bindGroup:e.createBindGroup({layout:i.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:c}},{binding:1,resource:a},{binding:2,resource:t.texture.createView()},{binding:3,resource:{buffer:o}},{binding:4,resource:{buffer:n.lightBuf}},{binding:5,resource:n.shadowSampler},{binding:6,resource:n.shadowView},{binding:7,resource:{buffer:s}}]})}}function d(e){if(e)try{e.modelBuf.destroy()}catch{}}function f(e){e.setPipeline(i)}function p(e,t){e.setBindGroup(0,t.bindGroup),e.setVertexBuffer(0,t.model.vao.posBuf),e.setVertexBuffer(1,t.model.vao.nrmBuf),e.setVertexBuffer(2,t.model.vao.uvBuf),e.setIndexBuffer(t.model.vao.idxBuf,t.model.vao.indexFormat),e.drawIndexed(t.model.vao.indexCount)}return{createInstance:u,destroyInstance:d,beginModels:f,draw:p,setFog:s,setVP:l}}var bn={food:`farm`,wood:`sawmill`,stone:`quarry`,gold:`gold-mine`,amber:`amber-vein`},xn={food:`Пашня`,wood:`Лесопилка`,stone:`Каменоломня`,gold:`Рудник`,amber:`Янтарная жила`};function Sn(e){return e>=25?5:e>=19?4:e>=13?3:e>=7?2:1}function Cn(){try{let e=window.parent;if(e&&e!==window){let t=e.mpWorldSnapshot;if(typeof t==`function`){let e=t();if(e)return e}if(e.W)return e.W}}catch{}return null}function wn(){let e=Cn();return!e||!e.players[0]?null:{x:e.players[0].x,y:e.players[0].y}}var Tn=16;function En(e,t,n){let r=Cn();if(!r)return null;let i=[],a=e!==void 0&&t!==void 0&&n!==void 0&&!!r.mapChunks,o=[];if(a){let i=Math.floor((e-n)/Tn),a=Math.floor((e+n)/Tn),s=Math.floor((t-n)/Tn),c=Math.floor((t+n)/Tn);for(let e=s;e<=c;e++)for(let t=i;t<=a;t++){let n=r.mapChunks[t+`,`+e];if(n)for(let e of n)o.push(e)}}else for(let e in r.map)o.push(e);let s=n===void 0?1/0:n*n,c=n!==void 0&&e!==void 0&&t!==void 0,l=new Map;for(let e of r.players)l.set(e.id,e);let u=r.players[0]?r.players[0].id:-1;for(let n of o){let a=r.map[n];if(a){if(c){let n=a.x-e,r=a.y-t;if(n*n+r*r>s)continue}if(a.t===`city`){let e=l.get(a.pid),t=e?e.race:`human`,r=e?Math.max(1,Math.min(5,Sn(e.b.hall))):1,o=!!e&&e.id===u,s=e?e.nick??`?`:`?`,c=e?`Ратуша `+e.b.hall:``;i.push({key:n,x:a.x+.5,y:a.y+.5,gx:a.x,gy:a.y,kind:0,model:`/models/castles/${t}-${r}.glb`,scale:10,own:o,nm:s,lv:c})}else if(a.t===`camp`||a.t===`fort`){let e=(a.t===`fort`?`Форт`:`Лагерь`)+` варваров`,t=`ур. `+(a.lv??`?`);i.push({key:n,x:a.x+.5,y:a.y+.5,gx:a.x,gy:a.y,kind:1,model:`/models/camps/barbarians.glb`,scale:a.t===`fort`?6.5:5,nm:e,lv:t})}else if(a.t===`node`){let e=bn[a.res]||`farm`,t=xn[a.res]||`Точка`,r=`ур. `+(a.lv??`?`);i.push({key:n,x:a.x+.5,y:a.y+.5,gx:a.x,gy:a.y,kind:2,model:`/models/resources/${e}.glb`,scale:5,nm:t,lv:r})}}}return i}function Dn(e){let t=0;for(let n in e)for(let r in e[n])t+=e[n][+r]||0;return t}function On(){try{let e=window.parent;if(e&&e!==window){let t=e.mpWorldSnapshot;if(typeof t==`function`){let e=t();if(e)return e}if(e.W)return e.W}}catch{}return null}function kn(e,t){let n=e.path,r=e.pathCum;if(!n||n.length<2)return n&&n[0]||{x:e.tx,y:e.ty};let i=t*(e.pathLen??0);for(let e=1;e<r.length;e++)if(r[e]>=i){let t=r[e]-r[e-1],a=t>0?(i-r[e-1])/t:0,o=n[e-1],s=n[e];return{x:o.x+(s.x-o.x)*a,y:o.y+(s.y-o.y)*a}}return n[n.length-1]}function An(){let e=On();if(!e||!e.marches)return null;let t=e.players[0]?e.players[0].id:-1,n=new Map;for(let t of e.players)n.set(t.id,t);let r=[];for(let i of e.marches){let a=i.state===`gather`||i.state===`siege`?{x:i.tx,y:i.ty}:kn(i,Math.max(0,Math.min(1,(e.t-i.t0)/Math.max(1,i.t1-i.t0)))),o=n.get(i.pid),s=i.state===`siege`&&i.data&&i.data.battle?i.data.battle:null,c=s?{round:s.round??0,revealFromRound:s.revealFromRound??0,retreating:!!(s.retreatRequested||s.retreated),attHpLeft:s.attHpLeft??0,attStartHp:s.attStartHp??1,revealFromAttHp:s.revealFromAttHp??s.attHpLeft??0,defHpLeft:s.defHpLeft??0,defStartHp:s.defStartHp??1,revealFromDefHp:s.revealFromDefHp??s.defHpLeft??0,revealStart:s.revealStart??0,revealAt:s.revealAt??0}:null;r.push({x:a.x,y:a.y,own:i.pid===t,id:i.id,nick:o?.nick??o?.name??`?`,unitsTotal:Dn(i.units),state:i.state,tx:i.tx,ty:i.ty,t1:i.t1,battle:c})}return r}var jn=document.getElementById(`status`),$=(()=>{try{if(/[?&]debug=1\b/.test(location.search))return!0;if(window.parent&&window.parent!==window)return/[?&]debug=1\b/.test(window.parent.location.search)}catch{}return!1})();$&&(jn.style.display=`block`);function Mn(e){$&&(jn.textContent=e.join(`
`))}function Nn(e){jn.style.display=`block`,jn.textContent=e.join(`
`)}async function Pn(){let e=[];function t(t){Nn([...e,t]);try{window.parent&&window.parent!==window&&typeof window.parent.forceCityView==`function`&&window.parent.forceCityView()}catch{}}if(!(`gpu`in navigator)){t(`WebGPU: navigator.gpu отсутствует.`);return}await zt(),e.push(`рельеф: настоящие данные высот загружены`);let n=document.getElementById(`hmVersion`);n&&(n.textContent=`h6`);let r={x:42,y:22},i=[.6,.52,.4],a=35e-5,o=wn(),s=o??r,c=En(s.x,s.y,192),l=c!==null;window.parent!==window&&!$&&(jn.style.display=`none`);let d=c??[{key:`demo-0`,x:43,y:14,gx:43,gy:14,kind:0,model:`/models/castles/human-1.glb`,scale:10,nm:`Замок`,lv:`демо`},{key:`demo-1`,x:50,y:20,gx:50,gy:20,kind:1,model:`/models/camps/barbarians.glb`,scale:5,nm:`Лагерь`,lv:`демо`},{key:`demo-2`,x:55,y:12,gx:55,gy:12,kind:2,model:`/models/resources/farm.glb`,scale:5,nm:`Пашня`,lv:`демо`},{key:`demo-3`,x:30,y:30,gx:30,gy:30,kind:2,model:`/models/resources/quarry.glb`,scale:5,nm:`Каменоломня`,lv:`демо`}];e.push(l?`данные: настоящая партия, сущностей — ${d.length}`:`данные: демо (window.parent.W недоступен)`);let f=u(),p={x:[],y:[]},m={value:[]},h=new Map,g=new Map,_=new Map,v=new Map,y=new Map,b=new Map,x=new Map,S=new Map;function ee(e){let t=Ae(f);return Oe(f,t,p),Oe(f,t,m),p.x[t]=e.x,p.y[t]=e.y,m.value[t]=e.kind,h.set(t,e.model),g.set(t,e.scale),v.set(t,e.nm),y.set(t,e.lv),b.set(t,!!e.own),x.set(t,{x:e.gx,y:e.gy}),S.set(e.key,t),qt(e.x,e.y,e.scale*1.4),t}for(let e of d)ee(e);let C=Array.from(Se(f,[p,m]));e.push(`bitECS: сущностей — ${C.length}`);let w=await navigator.gpu.requestAdapter();if(!w){t(`WebGPU: адаптер не найден.`);return}let te=await w.requestDevice();function ne(e){let t=document.getElementById(`gpu-error-banner`);t||(t=document.createElement(`div`),t.id=`gpu-error-banner`,t.style.cssText=`position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#4a0f0f;color:#fff;font:11px/1.4 monospace;padding:6px 8px;max-height:40vh;overflow:auto;white-space:pre-wrap;`,document.body.appendChild(t)),t.textContent+=(t.textContent?`
---
`:``)+e}te.addEventListener(`uncapturederror`,e=>{let t=e.error.message;console.error(`WebGPU error:`,t),ne(t)});let re=`fb-gpu-reload-at`,ie=Number(sessionStorage.getItem(re)||0),ae=ie&&Date.now()-ie<6e4;te.lost.then(e=>{if(console.error(`WebGPU device lost:`,e.reason,e.message),e.reason!==`destroyed`){if(ae){ne(`WebGPU-устройство теряется повторно (${e.reason}) — похоже, объёмная карта нестабильна на этом устройстве/браузере. Карта города ниже работает независимо от WebGPU.`);try{window.parent&&window.parent!==window&&typeof window.parent.forceCityView==`function`&&window.parent.forceCityView()}catch{}return}ne(`WebGPU-устройство потеряно (${e.reason}): ${e.message}\nПерезагрузка через 2с...`),sessionStorage.setItem(re,String(Date.now())),setTimeout(()=>location.reload(),2e3)}});let T=document.getElementById(`gpu`),oe=T.getContext(`webgpu`);if(!oe){t(`WebGPU: getContext('webgpu') вернул null.`);return}let se=navigator.gpu.getPreferredCanvasFormat();function ce(){let e=T.clientWidth,t=T.clientHeight;if(e<=0||t<=0)return;let n=Math.min(2,window.devicePixelRatio||1),r=Math.max(1,Math.floor(e*n)),i=Math.max(1,Math.floor(t*n));T.width!==r&&(T.width=r),T.height!==i&&(T.height=i)}let le=()=>T.offsetParent===null&&T.clientWidth===0;ce(),new ResizeObserver(ce).observe(T),oe.configure({device:te,format:se,alphaMode:`opaque`}),e.push(`WebGPU: устройство получено, формат — ${se}`);let E=await Ot(te,oe,se);function ue(e,t){return e+`,`+t}function de(e,t){try{let n=window.parent;n&&n!==window&&typeof n.ensureWorldChunk==`function`&&n.ensureWorldChunk(e,t)}catch{}}let fe=new Map;function D(e,t){return[e[0]*t,e[1]*t,e[2]*t]}function pe(e,t,n){if(Jt(e,t))return!0;for(let r=0;r<8;r++){let i=r/8*Math.PI*2;if(Jt(e+Math.cos(i)*n,t+Math.sin(i)*n))return!0}return!1}function O(e,t,n,r){for(let i of C){let a=p.x[i]-e,o=p.y[i]-t,s=(g.get(i)??5)*n+r;if(a*a+o*o<s*s)return!0}return!1}function me(e,t){return e>1.36?t<.62?`spruce`:t<.94?`pine`:`dead`:t<.58?`broadleaf`:t<.8?`birch`:t<.94?`spruce`:`dead`}function k(e,t){let n=[];for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=e*4+i,o=t*4+r;if(Z(a,o,13122)>=.65)continue;let s=.175+Z(a,o,X+778)*.65,c=.175+Z(a,o,X+779)*.65,l=e*16+i*4+s*4,u=t*16+r*4+c*4,d=l+(Pt(l/8.5,u/8.5,X+790)*2-1)*2,f=u+(Pt(l/8.5,u/8.5,X+791)*2-1)*2;if(pe(d,f,1.5)||O(d,f,.54,.68))continue;let p=Z(a,o,X+781)*Math.PI*2,m=.85+Z(a,o,X+782)*.3,h=Q(d,f),g=h*13,_=.0315+.5355*Xt(d,f),v=Z(a,o,X+780)<_,y=1+Z(a,o,X+785)*1.3,b=.8+Z(a,o,X+786)*.5;if(v){let e=me(h,Z(a,o,X+780));e===`broadleaf`&&Z(a,o,13132)<.35&&(e=`autumn`);let t=e===`spruce`||e===`pine`?Ue:We,r=t[Math.floor(Z(a,o,X+784)*t.length)];n.push({x:d,y:g,z:f,scale:[b,y,b],yaw:p,color:D(r,m),kind:e})}else{let e=.019+.056999999999999995*Math.min(1,h/1.6);if(Z(a,o,13140)>=e)continue;let t=qe[Math.floor(Z(a,o,X+784)*qe.length)],r=.6+Z(a,o,X+785)*.9,i=.6+Z(a,o,X+786)*.9;n.push({x:d,y:g,z:f,scale:[i,r,i],yaw:p,color:D(t,m),kind:`rock`})}}for(let r=0;r<8;r++)for(let i=0;i<8;i++){let a=e*8+i,o=t*8+r;if(Z(a,o,13232)>=.14875)continue;let s=Z(a,o,X+888),c=Z(a,o,X+889),l=e*16+i*2+s*2,u=t*16+r*2+c*2;if(pe(l,u,.4)||O(l,u,.36,.17))continue;let d=Q(l,u);if(d>2)continue;let f=d*13,p=Z(a,o,X+890)*Math.PI*2,m=.8+Z(a,o,X+891)*.4,h=Ge[Math.floor(Z(a,o,X+892)*Ge.length)],g=.8+Z(a,o,X+893)*.6;n.push({x:l,y:f,z:u,scale:[g,g,g],yaw:p,color:D(h,m),kind:`grass`})}let r=16/3;for(let i=0;i<r;i++)for(let a=0;a<r;a++){let o=e*r+a,s=t*r+i;if(Z(o,s,13342)>=.07875)continue;let c=Z(o,s,X+998),l=Z(o,s,X+999),u=e*16+a*3+c*3,d=t*16+i*3+l*3;if(pe(u,d,.9)||O(u,d,.44,.34))continue;let f=Q(u,d);if(f>2)continue;let p=f*13,m=Z(o,s,X+1e3)*Math.PI*2,h=.85+Z(o,s,X+1001)*.3,g=Ke[Math.floor(Z(o,s,X+1002)*Ke.length)],_=.9+Z(o,s,X+1003)*.7;n.push({x:u,y:p,z:d,scale:[_,_,_],yaw:m,color:D(g,h),kind:`bush`})}return n}function he(){let e=[];for(let t of fe.values())e.push(...t);E.setDecor(e),window.__decorCount=e.length,window.__decorList=e}let A=new Set,j=new Set,M=[],N=null,ge=null;function P(e,t,n=!1){let r=Math.floor(e/16),i=Math.floor(t/16);if(!n&&r===N&&i===ge)return;N=r,ge=i;let a=!1;for(let e=-3;e<=3;e++)for(let t=-3;t<=3;t++){let n=r+t,o=i+e,s=ue(n,o);A.has(s)||j.has(s)||(j.add(s),M.push({cx:n,cz:o,key:s}),a=!0)}let o=!1;for(let e of Array.from(A)){let[t,n]=e.split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>5&&(E.removeTerrainChunk(e),A.delete(e),fe.delete(e),o=!0)}for(let e of Array.from(j)){let[t,n]=e.split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>5&&(j.delete(e),a=!0)}a&&(M=M.filter(e=>j.has(e.key)),M.sort((e,t)=>(e.cx-r)**2+(e.cz-i)**2-((t.cx-r)**2+(t.cz-i)**2))),window.__terrainChunkCount=A.size,o&&he()}function F(e){let t=!1;for(;M.length&&performance.now()<e;){let{cx:e,cz:n,key:r}=M.shift();if(!j.has(r))continue;j.delete(r);let i=e*16,a=n*16,o=sn(i,a,i+16,a+16,1);E.setTerrainChunk(r,o),A.add(r),de(e,n),fe.set(r,k(e,n)),t=!0}t&&(window.__terrainChunkCount=A.size,he())}function _e(e,t){let n=ue(e,t);if(!A.has(n))return;let r=e*16,i=t*16;E.setTerrainChunk(n,sn(r,i,r+16,i+16,1))}function ve(e,t,n,r){let i=Math.floor(n/16),a=Math.floor(r/16),o=(i-3)*16,s=(i+3+1)*16,c=(a-3)*16,l=(a+3+1)*16,u=e*64,d=t*64;return u>=o&&u+64<=s&&d>=c&&d+64<=l}let I=new Set,L=new Set,R=[],ye=null,be=null;function xe(e,t,n=!1){let r=Math.floor(e/64),i=Math.floor(t/64);if(!n&&r===ye&&i===be)return;ye=r,be=i;let a=!1;for(let n=-2;n<=2;n++)for(let o=-2;o<=2;o++){let s=r+o,c=i+n,l=`far:`+s+`,`+c;I.has(l)||L.has(l)||ve(s,c,e,t)||(L.add(l),R.push({cx:s,cz:c,rkey:l}),a=!0)}for(let n of Array.from(I)){let[a,o]=n.slice(4).split(`,`).map(Number),s=Math.max(Math.abs(a-r),Math.abs(o-i))>3,c=ve(a,o,e,t);(s||c)&&(E.removeTerrainChunk(n),I.delete(n))}for(let e of Array.from(L)){let[t,n]=e.slice(4).split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>3&&(L.delete(e),a=!0)}a&&(R=R.filter(e=>L.has(e.rkey)),R.sort((e,t)=>(e.cx-r)**2+(e.cz-i)**2-((t.cx-r)**2+(t.cz-i)**2))),window.__farChunkCount=I.size}function Ce(e){for(;R.length&&performance.now()<e;){let{cx:e,cz:t,rkey:n}=R.shift();if(!L.has(n))continue;L.delete(n);let r=e*64,i=t*64,a=sn(r,i,r+64,i+64,4,.35);E.setTerrainChunk(n,a),I.add(n)}window.__farChunkCount=I.size}let z=yn(te,se,E.getShadowResources()),B=new Map;function V(e){let t=B.get(e);return t||(t=gn(e).then(e=>vn(te,e)),B.set(e,t)),t}let we=new Set(Array.from(C,e=>h.get(e)));await Promise.allSettled(Array.from(we,e=>V(e)));let H=new Map,Te=0,Ee=0;for(let t of C){let n=p.x[t],r=p.y[t],i=Q(n,r)*13;_.set(t,i);let a=Be(n,i,r,0,g.get(t)??5),o=h.get(t);try{let e=await V(o);H.set(t,z.createInstance(e,a)),Te++}catch(t){Ee++,e.push(`модель: ошибка на ${o} — ${t instanceof Error?t.message:String(t)}`)}}e.push(`модели: загружено ${Te}/${C.length}${Ee?`, ошибок: `+Ee:``}`),Mn(e),window.__ecsFound=C.length,window.__foundPositions=()=>C.map(e=>({x:p.x[e],z:p.y[e],scale:g.get(e)??5}));let De=o?o.x:r.x,ke=o?o.y:r.y,U={yaw:0,pitch:.55,dist:42,target:[De,Q(De,ke)*13+2,ke]},W=pn(T,U);P(U.target[0],U.target[2],!0),xe(U.target[0],U.target[2],!0);let Me=performance.now()+40;F(Me),Ce(Me);let Ne=sn(-Mt,-600,Mt,600,12,1.2);E.setTerrainChunk(`world-backdrop`,Ne),e.push(`рельеф: чанков ${A.size} (16×16) + дальних ${I.size} (64×64, шаг 4) + задник (шаг 12, весь мир), в очереди ещё ${M.length+R.length}`),Mn(e),window.__coverageCheck=(e,t)=>{for(let n of A){let[r,i]=n.split(`,`).map(Number),a=r*16,o=i*16;if(e>=a&&e<a+16&&t>=o&&t<o+16)return`near`}for(let n of I){let[r,i]=n.slice(4).split(`,`).map(Number),a=r*64,o=i*64;if(e>=a&&e<a+64&&t>=o&&t<o+64)return`far`}return null},Object.defineProperty(window,"cam",{value:{get tx(){return U.target[0]},set tx(e){U.target[0]=e,W.stopAuto()},get ty(){return U.target[1]},set ty(e){U.target[1]=e,W.stopAuto()},get tz(){return U.target[2]},set tz(e){U.target[2]=e,W.stopAuto()},get dist(){return U.dist},set dist(e){U.dist=e,W.stopAuto()},get pitch(){return U.pitch},set pitch(e){U.pitch=e,W.stopAuto()}}}),window.H=(e,t)=>Q(e,t)*13,window.__camState=()=>({yaw:U.yaw,pitch:U.pitch,dist:U.dist,target:[...U.target]}),window.__isAutoOrbiting=()=>W.isAutoOrbiting();let Fe=document.getElementById(`coordX`),ze=document.getElementById(`coordY`),Je=document.getElementById(`coordGo`),Ye=!1;for(let e of[Fe,ze])e.addEventListener(`input`,()=>{Ye=!0});function Xe(){let e=parseFloat(Fe.value),t=parseFloat(ze.value);!isFinite(e)||!isFinite(t)||(U.target[0]=Math.max(-Mt,Math.min(Mt,e)),U.target[2]=Math.max(-600,Math.min(600,t)),U.target[1]=Q(U.target[0],U.target[2])*13+2,W.stopAuto(),Ye=!1)}Je.addEventListener(`click`,Xe);for(let e of[Fe,ze])e.addEventListener(`keydown`,t=>{t.key===`Enter`&&(t.preventDefault(),Xe(),e.blur())});let K=new Float32Array(16),q=[0,0,0],Ze=document.getElementById(`selected`),Qe=[.95,.78,.35],$e=[.42,.78,.46],et=[.82,.24,.26],tt=null,nt=null,rt=null,it=null;window.startFollowMarch=e=>{W.stopAuto(),it=e},W.onInteract(()=>{it=null});function at(e){rt=null,nt=e;let t=(v.get(e)??`?`)+` · `+(y.get(e)??`?`),n=p.x[e],r=p.y[e];tt={x:n,y:Q(n,r)*13+(g.get(e)??5)*.9+2,z:r,color:Qe},window.__markerActive=!0,window.__selectedLabel=t,Ze.textContent=t,Ze.style.display=`block`}function ot(){nt=null,tt=null,window.__markerActive=!1,window.__selectedLabel=null,Ze.style.display=`none`}function st(e,t){let n=T.width/Math.max(1,T.height),r=Math.tan(ct/2),i=e/T.width*2-1,a=1-t/T.height*2,o=G(Pe(q,U.target)),s=G(Ie([0,1,0],o)),c=Ie(o,s),l=G([i*n*r*s[0]+a*r*c[0]-o[0],i*n*r*s[1]+a*r*c[1]-o[1],i*n*r*s[2]+a*r*c[2]-o[2]]);return{origin:q,dir:l}}let ct=.72;function lt(e,t){let n=0;for(let r=2;r<=400;r+=2){let i=e[0]+t[0]*r;if(e[1]+t[1]*r-Q(i,e[2]+t[2]*r)*13<=0){let i=n,a=r;for(let n=0;n<12;n++){let n=(i+a)/2,r=e[0]+t[0]*n,o=e[2]+t[2]*n;e[1]+t[1]*n-Q(r,o)*13>0?i=n:a=n}return{t:a,x:e[0]+t[0]*a,z:e[2]+t[2]*a}}n=r}return null}function ut(e,t){try{let n=window.parent;n&&n!==window&&typeof n.renderCartoucheFor==`function`&&n.renderCartoucheFor(e,t)}catch{}}function J(e){try{let t=window.parent;t&&t!==window&&typeof t.renderMarchCartoucheFor==`function`&&t.renderMarchCartoucheFor(e)}catch{}}function dt(e){let t=Ve(K,e);return t.w<=.001?null:{sx:(t.x/t.w*.5+.5)*T.width,sy:(1-(t.y/t.w*.5+.5))*T.height,w:t.w}}function ft(e,t){let n=.5*T.height/Math.tan(ct/2),r=null,i=1/0;for(let a of C){let o=p.x[a],s=p.y[a],c=g.get(a)??5,l=[o,(_.get(a)??Q(o,s)*13)+c*.5,s],u=dt(l);if(!u)continue;let d=Math.max(26,n*c/u.w),f=e-u.sx,m=t-u.sy,h=f*f+m*m;h>d*d||h>=i||(i=h,r={kind:`entity`,eid:a,distToCam:Math.hypot(o-q[0],l[1]-q[1],s-q[2])})}for(let a of gt){let o=[a.x,Q(a.x,a.y)*13+2.2,a.y],s=dt(o);if(!s)continue;let c=Math.max(26,n*3/s.w),l=e-s.sx,u=t-s.sy,d=l*l+u*u;d>c*c||d>=i||(i=d,r={kind:`march`,march:a,distToCam:Math.hypot(a.x-q[0],o[1]-q[1],a.y-q[2])})}let{origin:a,dir:o}=st(e,t),s=lt(a,o);return r&&!(s!==null&&s.t+5<r.distToCam)?r.kind===`entity`?{kind:`entity`,eid:r.eid,t:r.distToCam}:{kind:`march`,march:r.march,t:r.distToCam}:s===null?null:{kind:`ground`,x:s.x,z:s.z,t:s.t}}W.onTap((e,t)=>{let n=T.getBoundingClientRect(),r=ft((e-n.left)*(T.width/n.width),(t-n.top)*(T.height/n.height));if(r?.kind===`entity`){at(r.eid);let e=x.get(r.eid);e&&ut(e.x,e.y);return}if(r?.kind===`march`){ot(),rt=r.march.id,window.__selectedMarchId=r.march.id,J(r.march.id);return}ot(),rt=null,r?.kind===`ground`&&ut(Math.floor(r.x),Math.floor(r.z))});let pt=!1,mt=0;async function ht(){let e=En(U.target[0],U.target[2],192);if(!e)return;let t=new Set,n=[],r=new Set;for(let i of e){t.add(i.key);let e=S.get(i.key);if(e!==void 0){if(v.set(e,i.nm),y.set(e,i.lv),b.set(e,!!i.own),nt===e&&at(e),h.get(e)!==i.model){h.set(e,i.model),g.set(e,i.scale);let t=p.x[e],r=p.y[e],a=Q(t,r)*13;_.set(e,a);let o=Be(t,a,r,0,i.scale);n.push(V(i.model).then(t=>{z.destroyInstance(H.get(e)),H.set(e,z.createInstance(t,o))}).catch(()=>{}))}continue}let a=ee(i),o=Q(i.x,i.y)*13;_.set(a,o);let s=Be(i.x,o,i.y,0,i.scale);n.push(V(i.model).then(e=>{z.destroyInstance(H.get(a)),H.set(a,z.createInstance(e,s))}).catch(()=>{})),r.add(ue(Math.floor(i.x/16),Math.floor(i.y/16))),_e(Math.floor(i.x/16),Math.floor(i.y/16))}for(let[e,n]of Array.from(S))t.has(e)||(r.add(ue(Math.floor(p.x[n]/16),Math.floor(p.y[n]/16))),je(f,n),z.destroyInstance(H.get(n)),H.delete(n),h.delete(n),g.delete(n),_.delete(n),v.delete(n),y.delete(n),b.delete(n),x.delete(n),S.delete(e),nt===n&&ot());await Promise.allSettled(n),C=Array.from(Se(f,[p,m]));let i=!1;for(let e of r){if(!A.has(e))continue;let[t,n]=e.split(`,`).map(Number);fe.set(e,k(t,n)),i=!0}i&&he(),mt++,window.__ecsFound=C.length,window.__syncCount=mt}l&&setInterval(()=>{le()||pt||(pt=!0,ht().catch(e=>console.error(`live sync:`,e)).finally(()=>{pt=!1}))},3e3);let gt=[];function _t(){if(!l)return gt=[],[];let e=An();return e?(gt=e,window.__marchPositions=e,e.map(e=>({x:e.x,y:Q(e.x,e.y)*13+2.2,z:e.y,color:e.own?$e:et}))):(gt=[],[])}let vt=document.getElementById(`labels`),yt=new Map,bt=1024;function xt(){let e=new Set,t=T.clientWidth,n=T.clientHeight;for(let r of C){let i=p.x[r],a=p.y[r],o=i-U.target[0],s=a-U.target[2];if(o*o+s*s>bt)continue;let c=(_.get(r)??Q(i,a)*13)+(g.get(r)??5)*.6+1.1,l=Ve(K,[i,c,a]);if(l.w<=.001)continue;let u=(l.x/l.w*.5+.5)*t,d=(1-(l.y/l.w*.5+.5))*n;if(u<-40||u>t+40||d<-40||d>n+40)continue;e.add(r);let f=yt.get(r);if(!f){let e=document.createElement(`div`);e.className=`wlabel`;let t=document.createElement(`div`);t.className=`nm`;let n=document.createElement(`div`);n.className=`lv`,e.appendChild(t),e.appendChild(n),vt.appendChild(e),f={root:e,nm:t,lv:n,lastNm:``,lastLv:``,lastMine:!1},yt.set(r,f)}let m=v.get(r)??`?`;f.lastNm!==m&&(f.nm.textContent=m,f.lastNm=m);let h=!!b.get(r);f.lastMine!==h&&(f.nm.classList.toggle(`mine`,h),f.lastMine=h);let x=y.get(r)??``;f.lastLv!==x&&(f.lv.textContent=x,f.lastLv=x),f.root.style.transform=`translate(${u.toFixed(1)}px,${d.toFixed(1)}px) translate(-50%,-100%)`}for(let[t,n]of yt)e.has(t)||(n.root.remove(),yt.delete(t))}let St=new Map;function Ct(e,t,n,r){if(!r||!n||r<=n)return t;let i=Math.max(0,Math.min(1,(Date.now()-n)/(r-n)));return e+(t-e)*i}function wt(){let e=new Set,t=T.clientWidth,n=T.clientHeight;for(let r of gt){let i=r.battle;if(!i)continue;let a=r.x-U.target[0],o=r.y-U.target[2];if(a*a+o*o>bt)continue;let s=Q(r.x,r.y)*13+2.2+1.6,c=Ve(K,[r.x,s,r.y]);if(c.w<=.001)continue;let l=(c.x/c.w*.5+.5)*t,u=(1-(c.y/c.w*.5+.5))*n;if(l<-60||l>t+60||u<-60||u>n+60)continue;e.add(r.id);let d=St.get(r.id);if(!d){let e=document.createElement(`div`);e.className=`blabel`;let t=document.createElement(`div`);t.className=`btitle`;let n=document.createElement(`div`);n.className=`bbar atk`;let i=document.createElement(`i`);n.appendChild(i);let a=document.createElement(`div`);a.className=`bbar def`;let o=document.createElement(`i`);a.appendChild(o),e.appendChild(t),e.appendChild(n),e.appendChild(a),vt.appendChild(e),d={root:e,title:t,atkFill:i,defFill:o},St.set(r.id,d)}let f=i.retreating,p=!f&&i.revealFromRound===0;d.root.className=`blabel`+(f?` retreat`:p?` deploy`:``),d.title.textContent=f?`Отступление`:p?`Развёртывание`:`Бой — раунд `+i.round;let m=Math.max(0,Math.min(100,Ct(i.revealFromAttHp,i.attHpLeft,i.revealStart,i.revealAt)/Math.max(1,i.attStartHp)*100)),h=Math.max(0,Math.min(100,Ct(i.revealFromDefHp,i.defHpLeft,i.revealStart,i.revealAt)/Math.max(1,i.defStartHp)*100));d.atkFill.style.width=m.toFixed(1)+`%`,d.defFill.style.width=h.toFixed(1)+`%`,d.root.style.transform=`translate(${l.toFixed(1)}px,${u.toFixed(1)}px) translate(-50%,-100%)`}for(let[t,n]of St)e.has(t)||(n.root.remove(),St.delete(t))}function Tt(e,t,n,r,i){let a=p.x[e],o=p.y[e],s=g.get(e)??5,c=(_.get(e)??0)+s*.6,l=a-q[0],u=c-q[1],d=o-q[2],f=l*l+u*u+d*d;if(f<3600)return!0;if(f>16900)return!1;let m=Ve(t,[a,c,o]);if(m.w<=.001)return!1;let h=(m.x/m.w*.5+.5)*n,v=(1-(m.y/m.w*.5+.5))*r,y=i*s/m.w+24;return h>-y&&h<n+y&&v>-y&&v<r+y}let Y={frame:0,chunks:0,render:0,labels:0,maxFrame:0,maxChunks:0,maxRender:0,maxLabels:0,n:0,worstFrame:0,worstChunks:0,worstRender:0,worstLabels:0};function Et(){Y.maxFrame=Math.max(Y.maxFrame,Y.frame),Y.maxChunks=Math.max(Y.maxChunks,Y.chunks),Y.maxRender=Math.max(Y.maxRender,Y.render),Y.maxLabels=Math.max(Y.maxLabels,Y.labels),++Y.n>=60&&(Y.worstFrame=Y.maxFrame,Y.worstChunks=Y.maxChunks,Y.worstRender=Y.maxRender,Y.worstLabels=Y.maxLabels,Y.maxFrame=Y.maxChunks=Y.maxRender=Y.maxLabels=0,Y.n=0,Mn([`кадр (худший из 60): ${Y.worstFrame.toFixed(1)} мс`,`  стройка чанков: ${Y.worstChunks.toFixed(1)} мс`,`  отрисовка:      ${Y.worstRender.toFixed(1)} мс`,`  подписи:        ${Y.worstLabels.toFixed(1)} мс`,`чанков ${window.__terrainChunkCount??0} · моделей в кадре ${window.__modelDrawCount??0} · сущностей ${window.__ecsFound??C.length} · декора ${window.__decorCount??0}`,`в очереди на стройку: ${M.length} ближних`])),window.__perf=Y}let Dt=!1;function kt(e){let t=$?performance.now():0;try{At(e)}catch(e){console.error(`draw:`,e),Dt||(Dt=!0,ne(`Сбой в кадре: ${e instanceof Error?e.message:String(e)}`))}$&&(Y.frame=performance.now()-t,Et()),requestAnimationFrame(kt)}function At(e){if(le())return;W.isAutoOrbiting()&&(U.yaw=e*15e-5),W.update(e);let t=_t();if(it!==null){let e=gt.find(e=>e.id===it);e?(U.target[0]=e.x,U.target[2]=e.y,U.target[1]=Q(e.x,e.y)*13+1):it=null}Ye||(Fe.value=U.target[0].toFixed(1),ze.value=U.target[2].toFixed(1)),P(U.target[0],U.target[2]),xe(U.target[0],U.target[2]);let n=performance.now(),r=n+6;F(r),Ce(r),$&&(Y.chunks=performance.now()-n);let o=[U.target[0]+Math.sin(U.yaw)*Math.cos(U.pitch)*U.dist,U.target[1]+Math.sin(U.pitch)*U.dist,U.target[2]+Math.cos(U.yaw)*Math.cos(U.pitch)*U.dist],s=Q(o[0],o[2])*13+2;o[1]<s&&(o[1]=s);let c=T.width/Math.max(1,T.height),l=Le(Re(ct,c,.5,392),He(o,U.target,[0,1,0]));K=l,q=o,E.setVP(l),E.setFog(o,i,a,e/1e3),E.setSunTarget(U.target[0],U.target[2]);{let t=G(Pe(o,U.target)),n=G(Ie([0,1,0],t)),r=Ie(t,n);E.setSkyCamera(n,r,t,Math.tan(ct/2),c,e/1e3)}if(z.setFog(o,i,a),z.setVP(l),rt!==null){let e=gt.find(e=>e.id===rt);e?tt={x:e.x,y:Q(e.x,e.y)*13+3.2,z:e.y,color:Qe}:(rt=null,tt=null)}tt&&t.push(tt),E.setMarkers(t),window.__marchCount=t.length-+!!tt;let u=T.clientWidth,d=T.clientHeight,f=.5*d/Math.tan(ct/2),p=0,m=$?performance.now():0;E.frame({r:i[0],g:i[1],b:i[2],a:1},e=>{z.beginModels(e);for(let t of C){if(!Tt(t,l,u,d,f))continue;let n=H.get(t);n&&(z.draw(e,n),p++)}}),window.__modelDrawCount=p,$&&(Y.render=performance.now()-m);let h=$?performance.now():0;xt(),wt(),$&&(Y.labels=performance.now()-h)}requestAnimationFrame(kt),window.__engineReady=!0}Pn().catch(e=>{Nn([`Ошибка: ${e instanceof Error?e.message:String(e)}`]),console.error(e)});