(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=(e,t,n)=>Object.defineProperty(e,t,{value:n,enumerable:!1,writable:!0,configurable:!0}),t=(e,t)=>t&e.entityMask,n=(e,t)=>t>>>e.versionShift&(1<<e.versionBits)-1,r=(e,t)=>{let r=n(e,t)+1&(1<<e.versionBits)-1;return t&e.entityMask|r<<e.versionShift},i=e=>{let t=e?typeof e==`function`?e():e:{versioning:!1,versionBits:8},n=t.versionBits??8,r=t.versioning??!1,i=32-n,a=(1<<i)-1,o=i;return{aliveCount:0,dense:[],sparse:[],maxId:0,versioning:r,versionBits:n,entityMask:a,versionShift:o,versionMask:(1<<n)-1<<o}},a=e=>{if(e.aliveCount<e.dense.length){let t=e.dense[e.aliveCount],n=t;return e.sparse[n]=e.aliveCount,e.aliveCount++,t}let t=++e.maxId;return e.dense.push(t),e.sparse[t]=e.aliveCount,e.aliveCount++,t},o=(e,t)=>{let n=e.sparse[t];if(n===void 0||n>=e.aliveCount)return;let i=e.aliveCount-1,a=e.dense[i];if(e.sparse[a]=n,e.dense[n]=a,e.sparse[t]=i,e.dense[i]=t,e.versioning){let n=r(e,t);e.dense[i]=n}e.aliveCount--},s=(e,n)=>{let r=t(e,n),i=e.sparse[r];return i!==void 0&&i<e.aliveCount&&e.dense[i]===n},c=Symbol.for(`bitecs_internal`),l=(t,n)=>e(t||{},c,{entityIndex:n||i(),entityMasks:[[]],entityComponents:new Map,bitflag:1,componentMap:new Map,componentCount:0,queries:new Set,queriesHashMap:new Map,notQueries:new Set,dirtyQueries:new Set,entitiesWithRelations:new Set,hierarchyData:new Map,hierarchyActiveRelations:new Set,hierarchyQueryCache:new Map});function u(...e){let t,n;return e.forEach(e=>{typeof e==`object`&&`dense`in e&&`sparse`in e&&`aliveCount`in e?t=e:typeof e==`object`&&(n=e)}),l(n,t)}var d=()=>{let e=[],t=[],n=n=>e[t[n]]===n;return{add:r=>{n(r)||(t[r]=e.push(r)-1)},remove:r=>{if(!n(r))return;let i=t[r],a=e.pop();a!==r&&(e[i]=a,t[a]=i)},has:n,sparse:t,dense:e,reset:()=>{e.length=0,t.length=0},sort:n=>{e.sort(n);for(let n=0;n<e.length;n++)t[e[n]]=n}}},f=typeof SharedArrayBuffer<`u`?SharedArrayBuffer:ArrayBuffer,p=(e=1e3)=>{let t=[],n=0,r=new Uint32Array(new f(e*4)),i=e=>e<t.length&&t[e]<n&&r[t[e]]===e;return{add:e=>{if(!i(e)){if(n>=r.length){let e=new Uint32Array(new f(r.length*2*4));e.set(r),r=e}r[n]=e,t[e]=n,n++}},remove:e=>{if(!i(e))return;n--;let a=t[e],o=r[n];r[a]=o,t[o]=a},has:i,sparse:t,get dense(){return new Uint32Array(r.buffer,0,n)},reset:()=>{n=0,t.length=0},sort:e=>{let i=Array.from(r.subarray(0,n));i.sort(e);for(let e=0;e<i.length;e++)r[e]=i[e];for(let e=0;e<n;e++)t[r[e]]=e}}},m=()=>{let e=new Set;return{subscribe:t=>(e.add(t),()=>{e.delete(t)}),notify:(t,...n)=>Array.from(e).reduce((e,r)=>{let i=r(t,...n);return i&&typeof i==`object`?{...e,...i}:e},{})}},h=Symbol.for(`bitecs-relation`),g=Symbol.for(`bitecs-pairTarget`),_=Symbol.for(`bitecs-isPairComponent`),v=Symbol.for(`bitecs-relationData`),y=()=>{let t={pairsMap:new Map,initStore:void 0,exclusiveRelation:!1,autoRemoveSubject:!1,onTargetRemoved:void 0},n=r=>{if(r===void 0)throw Error(`Relation target is undefined`);let i=r===`*`?w:r;if(!t.pairsMap.has(i)){let a=t.initStore?t.initStore(r):{};e(a,h,n),e(a,g,i),e(a,_,!0),t.pairsMap.set(i,a)}return t.pairsMap.get(i)};return e(n,v,t),n},b=(e,t)=>{if(e===void 0)throw Error(`Relation is undefined`);return e(t)},x=(e,t,n)=>{let r=Me(e,t),i=[];for(let e of r)e[h]===n&&e[g]!==w&&!T(e[g])&&i.push(e[g]);return i},S=Symbol.for(`bitecs-wildcard`);function ee(){let e=y();return Object.defineProperty(e,S,{value:!0,enumerable:!1,writable:!1,configurable:!1}),e}function C(){let e=Symbol.for(`bitecs-global-wildcard`);return globalThis[e]||(globalThis[e]=ee()),globalThis[e]}var w=C();function te(){return y()}function ne(){let e=Symbol.for(`bitecs-global-isa`);return globalThis[e]||(globalThis[e]=te()),globalThis[e]}var re=ne();function T(e){return e?Object.getOwnPropertySymbols(e).includes(v):!1}var ie=64,E=4294967295,ae=1024;function oe(e,t){let{depths:n}=e;if(t<n.length)return n;let r=Math.max(t+1,n.length*2,n.length+ae),i=new Uint32Array(r);return i.fill(E),i.set(n),e.depths=i,i}function D(e,t,n,r){let{depthToEntities:i}=e;if(r!==void 0&&r!==E){let e=i.get(r);e&&(e.remove(t),e.dense.length===0&&i.delete(r))}n!==E&&(i.has(n)||i.set(n,p()),i.get(n).add(t))}function se(e,t){t>e.maxDepth&&(e.maxDepth=t)}function ce(e,t,n,r){e.depths[t]=n,D(e,t,n,r),se(e,n)}function le(e,t){e[c].hierarchyQueryCache.delete(t)}function O(e,t){let n=e[c];return n.hierarchyActiveRelations.has(t)||(n.hierarchyActiveRelations.add(t),de(e,t),ue(e,t)),n.hierarchyData.get(t)}function ue(e,t){let n=Se(e,[b(t,w)]);for(let r of n)k(e,t,r);let r=new Set;for(let i of n)for(let n of x(e,i,t))r.has(n)||(r.add(n),k(e,t,n))}function de(e,t){let n=e[c];if(!n.hierarchyData.has(t)){let e=Math.max(ae,n.entityIndex.dense.length*2),r=new Uint32Array(e);r.fill(E),n.hierarchyData.set(t,{depths:r,dirty:d(),depthToEntities:new Map,maxDepth:0})}}function fe(e,t,n,r=new Set){if(r.has(n))return 0;r.add(n);let i=x(e,n,t);if(i.length===0)return 0;if(i.length===1)return pe(e,t,i[0],r)+1;let a=1/0;for(let n of i){let i=pe(e,t,n,r);if(i<a&&(a=i,a===0))break}return a===1/0?0:a+1}function pe(e,t,n,r){let i=e[c];de(e,t);let a=i.hierarchyData.get(t),{depths:o}=a;if(o=oe(a,n),o[n]===E){let i=fe(e,t,n,r);return ce(a,n,i),i}return o[n]}function k(e,t,n){return pe(e,t,n,new Set)}function A(e,t,n,r,i=d()){if(i.has(n))return;i.add(n);let a=Se(e,[t(n)]);for(let n of a)r.add(n),A(e,t,n,r,i)}function j(e,t,n,r,i=new Set){let a=e[c];if(!a.hierarchyActiveRelations.has(t))return;de(e,t);let o=a.hierarchyData.get(t);if(i.has(n)){o.dirty.add(n);return}i.add(n);let{depths:s,dirty:l}=o,u=r===void 0?0:k(e,t,r)+1;if(u>ie)return;let f=s[n];ce(o,n,u,f===E?void 0:f),f!==u&&(A(e,t,n,l,d()),le(e,t))}function M(e,t,n){let r=e[c];if(!r.hierarchyActiveRelations.has(t))return;let i=r.hierarchyData.get(t),{depths:a}=i;a=oe(i,n),me(e,t,n,a,d()),le(e,t)}function me(e,t,n,r,i){if(i.has(n))return;i.add(n);let a=e[c].hierarchyData.get(t);if(n<r.length){let e=r[n];e!==E&&(a.depths[n]=E,D(a,n,E,e))}let o=Se(e,[t(n)]);for(let n of o)me(e,t,n,r,i)}function he(e,t){let n=e[c].hierarchyData.get(t);if(!n)return;let{dirty:r,depths:i}=n;if(r.dense.length!==0){for(let a of r.dense)i[a]===E&&ce(n,a,fe(e,t,a));r.reset()}}function ge(e,t,n,r={}){let i=e[c];O(e,t);let a=R(e,[t,...n]),o=i.hierarchyQueryCache.get(t);if(o&&o.hash===a)return o.result;he(e,t),xe(e,n,r);let s=i.queriesHashMap.get(R(e,n)),{depths:l}=i.hierarchyData.get(t);s.sort((e,t)=>{let n=l[e],r=l[t];return n===r?e-t:n-r});let u=(r.buffered,s.dense);return i.hierarchyQueryCache.set(t,{hash:a,result:u}),u}function _e(e,t,n,r={}){let i=O(e,t);he(e,t);let a=i.depthToEntities.get(n);return a?(r.buffered,a.dense):r.buffered?new Uint32Array:[]}var ve=Symbol.for(`bitecs-opType`),ye=Symbol.for(`bitecs-opTerms`),N=Symbol.for(`bitecs-hierarchyType`),P=Symbol.for(`bitecs-hierarchyRel`),F=Symbol.for(`bitecs-hierarchyDepth`),I=Symbol.for(`bitecs-modifierType`),L={[I]:`nested`},R=(e,t)=>{let n=e[c],r=t=>(n.componentMap.has(t)||B(e,t),n.componentMap.get(t).id),i=e=>ve in e?`${e[ve].toLowerCase()}(${e[ye].map(i).sort().join(`,`)})`:r(e).toString();return t.map(i).sort().join(`-`)},be=(e,t,n={})=>{let r=e[c],i=R(e,t),a=[],o=t=>{ve in t?t[ye].forEach(o):(r.componentMap.has(t)||B(e,t),a.push(t))};t.forEach(o);let s=[],l=[],u=[],f=(t,n)=>{n.forEach(n=>{r.componentMap.has(n)||B(e,n),t.push(n)})};t.forEach(t=>{if(ve in t){let{[ve]:e,[ye]:n}=t;if(e===`Not`)f(l,n);else if(e===`Or`)f(u,n);else if(e===`And`)f(s,n);else throw Error(`Nested combinator ${e} not supported yet - use simple queries for best performance`)}else r.componentMap.has(t)||B(e,t),s.push(t)});let h=a.map(e=>r.componentMap.get(e)),g=[...new Set(h.map(e=>e.generationId))],_=(e,t)=>(e[t.generationId]=(e[t.generationId]||0)|t.bitflag,e),v=s.map(e=>r.componentMap.get(e)).reduce(_,{}),y=l.map(e=>r.componentMap.get(e)).reduce(_,{}),b=u.map(e=>r.componentMap.get(e)).reduce(_,{}),x=h.reduce(_,{}),S=Object.assign(n.buffered?p():d(),{allComponents:a,orComponents:u,notComponents:l,masks:v,notMasks:y,orMasks:b,hasMasks:x,generations:g,toRemove:d(),addObservable:m(),removeObservable:m(),queues:{}});r.queries.add(S),r.queriesHashMap.set(i,S),h.forEach(e=>{e.queries.add(S)}),l.length&&r.notQueries.add(S);let ee=r.entityIndex;for(let t=0;t<ee.aliveCount;t++){let n=ee.dense[t];V(e,n,ke)||Ce(e,S,n)&&z(S,n)}return S};function xe(e,t,n={}){let r=e[c],i=R(e,t),a=r.queriesHashMap.get(i);return a?n.buffered&&!(`buffer`in a.dense)&&(a=be(e,t,{buffered:!0})):a=be(e,t,n),n.buffered,a.dense}function Se(e,t,...n){let r=t.find(e=>e&&typeof e==`object`&&N in e),i=t.filter(e=>!(e&&typeof e==`object`&&N in e)),a=!1,o=!0,s=n.some(e=>e&&typeof e==`object`&&I in e);for(let e of n)if(s&&e&&typeof e==`object`&&I in e){let t=e;t[I]===`buffer`&&(a=!0),t[I]===`nested`&&(o=!1)}else if(!s){let t=e;t.buffered!==void 0&&(a=t.buffered),t.commit!==void 0&&(o=t.commit)}if(r){let{[P]:t,[F]:n}=r;return n===void 0?ge(e,t,i,{buffered:a}):_e(e,t,n,{buffered:a})}return o&&Te(e),xe(e,i,{buffered:a})}function Ce(e,t,n){let r=e[c],{masks:i,notMasks:a,orMasks:o,generations:s}=t,l=Object.keys(o).length===0;for(let e=0;e<s.length;e++){let t=s[e],c=i[t],u=a[t],d=o[t],f=r.entityMasks[t][n];if(u&&f&u||c&&(f&c)!==c)return!1;d&&f&d&&(l=!0)}return l}var z=(e,t)=>{if(e.toRemove.has(t)){e.toRemove.remove(t),e.addObservable.notify(t);return}e.has(t)||(e.add(t),e.addObservable.notify(t))},we=e=>{for(let t=0;t<e.toRemove.dense.length;t++){let n=e.toRemove.dense[t];e.remove(n)}e.toRemove.reset()},Te=e=>{let t=e[c];t.dirtyQueries.size&&(t.dirtyQueries.forEach(we),t.dirtyQueries.clear())},Ee=(e,t,n)=>{let r=e[c];!t.has(n)||t.toRemove.has(n)||(t.toRemove.add(n),r.dirtyQueries.add(t),t.removeObservable.notify(n))},B=(e,t)=>{if(!t)throw Error(`bitECS - Cannot register null or undefined component`);let n=e[c],r=new Set,i={id:n.componentCount++,generationId:n.entityMasks.length-1,bitflag:n.bitflag,ref:t,queries:r,setObservable:m(),getObservable:m()};return n.componentMap.set(t,i),n.bitflag*=2,n.bitflag>=2**31&&(n.bitflag=1,n.entityMasks.push([])),i},V=(e,t,n)=>{let r=e[c],i=r.componentMap.get(n);if(!i)return!1;let{generationId:a,bitflag:o}=i;return(r.entityMasks[a][t]&o)===o},De=(e,t,n)=>{let r=e[c].componentMap.get(n);if(r&&V(e,t,n))return r.getObservable.notify(t)},H=(e,t,n,r,i=new Set)=>{if(!i.has(r)){i.add(r),Oe(t,n,re(r));for(let i of Me(t,r))if(i!==ke&&!V(t,n,i)){Oe(t,n,i);let a=e.componentMap.get(i);if(a?.setObservable){let e=De(t,r,i);a.setObservable.notify(n,e)}}for(let a of x(t,r,re))H(e,t,n,a,i)}},Oe=(e,t,n)=>{if(!Ne(e,t))throw Error(`Cannot add component - entity ${t} does not exist in the world.`);let r=e[c],i=`component`in n?n.component:n,a=`data`in n?n.data:void 0;r.componentMap.has(i)||B(e,i);let o=r.componentMap.get(i);if(V(e,t,i))return a!==void 0&&o.setObservable.notify(t,a),!1;let{generationId:s,bitflag:l,queries:u}=o;if(r.entityMasks[s][t]|=l,V(e,t,ke)||u.forEach(n=>{Ce(e,n,t)?z(n,t):Ee(e,n,t)}),r.entityComponents.get(t).add(i),a!==void 0&&o.setObservable.notify(t,a),i[_]){let n=i[h],a=i[g];if(U(e,t,b(n,w),b(w,a)),typeof a==`number`&&(U(e,a,b(w,t),b(w,n)),r.entitiesWithRelations.add(a),r.entitiesWithRelations.add(t)),r.entitiesWithRelations.add(a),n[v].exclusiveRelation===!0&&a!==w){let r=x(e,t,n)[0];r!=null&&r!==a&&W(e,t,n(r))}if(n===re){let n=x(e,t,re);for(let i of n)H(r,e,t,i)}j(e,n,t,typeof a==`number`?a:void 0)}return!0};function U(e,t,...n){(Array.isArray(n[0])?n[0]:n).forEach(n=>{Oe(e,t,n)})}var W=(e,t,...n)=>{let r=e[c];if(!Ne(e,t))throw Error(`Cannot remove component - entity ${t} does not exist in the world.`);n.forEach(n=>{if(!V(e,t,n))return;let{generationId:i,bitflag:a,queries:o}=r.componentMap.get(n);if(r.entityMasks[i][t]&=~a,o.forEach(n=>{n.toRemove.remove(t),Ce(e,n,t)?z(n,t):Ee(e,n,t)}),r.entityComponents.get(t).delete(n),n[_]){let r=n[g],i=n[h];M(e,i,t),W(e,t,b(w,r)),typeof r==`number`&&Ne(e,r)&&(W(e,r,b(w,t)),W(e,r,b(w,i))),x(e,t,i).length===0&&W(e,t,b(i,w))}})},ke={};function Ae(e,...t){let n=e[c],r=a(n.entityIndex);return n.notQueries.forEach(t=>{Ce(e,t,r)&&z(t,r)}),n.entityComponents.set(r,new Set),t.length>0&&U(e,r,t),r}var je=(e,t)=>{let n=e[c];if(!s(n.entityIndex,t))return;let r=[t],i=new Set;for(;r.length>0;){let t=r.shift();if(i.has(t))continue;i.add(t);let a=[];if(n.entitiesWithRelations.has(t)){for(let i of Se(e,[w(t)],L))if(Ne(e,i))for(let o of n.entityComponents.get(i)){if(!o[_])continue;let n=o[h][v];a.push(()=>W(e,i,b(w,t))),o[g]===t&&(a.push(()=>W(e,i,o)),n.autoRemoveSubject&&r.push(i),n.onTargetRemoved&&a.push(()=>n.onTargetRemoved(e,i,t)))}n.entitiesWithRelations.delete(t)}for(let e of a)e();for(let t of r)je(e,t);for(let r of n.queries)Ee(e,r,t);o(n.entityIndex,t),n.entityComponents.delete(t);for(let e=0;e<n.entityMasks.length;e++)n.entityMasks[e][t]=0}},Me=(e,t)=>{let n=e[c];if(t===void 0)throw Error(`getEntityComponents: entity id is undefined.`);if(!s(n.entityIndex,t))throw Error(`getEntityComponents: entity ${t} does not exist in the world.`);return Array.from(n.entityComponents.get(t))},Ne=(e,t)=>s(e[c].entityIndex,t),Pe=(e,t)=>[e[0]-t[0],e[1]-t[1],e[2]-t[2]],Fe=(e,t)=>e[0]*t[0]+e[1]*t[1]+e[2]*t[2],Ie=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],G=e=>{let t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]};function Le(e,t){let n=new Float32Array(16);for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=0;for(let n=0;n<4;n++)a+=e[n*4+i]*t[r*4+n];n[r*4+i]=a}return n}function Re(e,t,n,r){let i=1/Math.tan(e/2);return new Float32Array([i/t,0,0,0,0,i,0,0,0,0,(r+n)/(n-r),-1,0,0,2*r*n/(n-r),0])}function ze(e,t,n,r,i,a){return new Float32Array([2/(t-e),0,0,0,0,2/(r-n),0,0,0,0,1/(i-a),0,-(t+e)/(t-e),-(r+n)/(r-n),i/(i-a),1])}function Be(e,t,n,r,i){let a=Math.cos(r),o=Math.sin(r);return new Float32Array([a*i,0,-o*i,0,0,i,0,0,o*i,0,a*i,0,e,t,n,1])}function Ve(e,t){let[n,r,i]=t;return{x:e[0]*n+e[4]*r+e[8]*i+e[12],y:e[1]*n+e[5]*r+e[9]*i+e[13],z:e[2]*n+e[6]*r+e[10]*i+e[14],w:e[3]*n+e[7]*r+e[11]*i+e[15]}}function He(e,t,n){let r=G(Pe(e,t)),i=G(Ie(n,r)),a=Ie(r,i);return new Float32Array([i[0],a[0],r[0],0,i[1],a[1],r[1],0,i[2],a[2],r[2],0,-Fe(i,e),-Fe(a,e),-Fe(r,e),1])}var Ue=[[.78,.9,.8],[.85,1,.88],[.72,.84,.76],[.9,1,.92],[.8,.94,.9],[.88,.98,.8]],We=[[.85,.95,.78],[.92,1,.85],[.8,.9,.76],[1,.94,.78],[.88,.82,.7],[.86,1,.9],[1,.92,.8]],Ge=[[1,1.15,.95],[1.05,1.15,1],[.92,1.05,.9],[1.15,1.15,1]],Ke=[[.78,.9,.76],[.85,.98,.82],[.72,.86,.74],[.9,1,.88],[.8,.94,.86]],qe=[[.92,.9,.86],[1,.98,.92],[.84,.84,.82],[.96,.9,.82]];function K(e,t,n,r,i,a,o,s,c,l,u=[.5,.5],d=[.5,.5],f=[.5,.5]){let p=G(Ie(Pe(o,a),Pe(s,a))),m=[[a,u],[o,d],[s,f]];for(let[a,o]of m)e.push(a[0],a[1],a[2]),t.push(p[0],p[1],p[2]),n.push(c),r.push(l),i.push(o[0],o[1])}function Je(e,t,n,r,i,a,o,s,c,l,u,d){let f=l,p=l+c,m=[],h=[];for(let e=0;e<=a;e++){let t=e/a*Math.PI*2;m.push([Math.cos(t)*o,f,Math.sin(t)*o]),h.push([Math.cos(t)*s,p,Math.sin(t)*s])}for(let o=0;o<a;o++){let s=o/a,c=(o+1)/a;K(e,t,n,r,i,m[o],m[o+1],h[o+1],u,d,[s,0],[c,0],[c,1]),K(e,t,n,r,i,m[o],h[o+1],h[o],u,d,[s,0],[c,1],[s,1])}}function q(e,t,n,r,i,a,o,s,c,l,u,d=0){for(let f=0;f<a;f++){let p=f/a*Math.PI,m=Math.cos(p),h=Math.sin(p),g=[d-m*o,s,-h*o],_=[d+m*o,s,h*o],v=[d-m*o,c,-h*o],y=[d+m*o,c,h*o];K(e,t,n,r,i,g,_,y,l,u,[0,1],[1,1],[1,0]),K(e,t,n,r,i,g,y,v,l,u,[0,1],[1,0],[0,0])}}var J=()=>({positions:[],normals:[],materialIds:[],shades:[],uvs:[]}),Ye=e=>({positions:new Float32Array(e.positions),normals:new Float32Array(e.normals),materialIds:new Float32Array(e.materialIds),shades:new Float32Array(e.shades),uvs:new Float32Array(e.uvs),vertexCount:e.positions.length/3});function Xe(){let e=J();return Je(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.1,.06,.45,0,0,1),q(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.85,.3,2.7,1,1),Ye(e)}function Ze(){let e=J();return Je(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.11,.07,.7,0,0,1),q(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,1.15,.25,2.15,1,1),Ye(e)}function Qe(){let e=J();return Je(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.14,.09,.8,0,0,1),q(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,1.3,.65,2.55,1,1),Ye(e)}function $e(){let e=J();return Je(e.positions,e.normals,e.materialIds,e.shades,e.uvs,6,.075,.045,.95,0,0,1),q(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.95,.7,2.35,1,1),Ye(e)}function et(){let e=J();Je(e.positions,e.normals,e.materialIds,e.shades,e.uvs,6,.09,.035,1.4,0,0,.62);let t=(t,n,r,i)=>{let a=Math.cos(t)*Math.cos(n),o=Math.sin(t)*Math.cos(n),s=Math.sin(n),c=[0,r,0],l=[a*i,r+s*i,o*i],u=[-o,0,a],d=.03;K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,[c[0]+u[0]*d,c[1],c[2]+u[2]*d],[c[0]-u[0]*d,c[1],c[2]-u[2]*d],l,0,.62);let f=[l[0]*.55,l[1]*.55+r*.45,l[2]*.55],p=[l[0]+a*i*.4-o*.15,l[1]+s*i*.4+.1,l[2]+o*i*.4+a*.15];K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,[f[0]+u[0]*d*.6,f[1],f[2]+u[2]*d*.6],[f[0]-u[0]*d*.6,f[1],f[2]-u[2]*d*.6],p,0,.62)};return t(.4,.5,1.5,.6),t(2.2,.32,1.75,.5),t(3.8,.55,1.95,.46),t(5.1,.4,2.1,.4),t(1.6,.65,2.25,.34),Ye(e)}function tt(){let e=J();return q(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.55,.02,.72,1,1),Ye(e)}function nt(){let e=J();return q(e.positions,e.normals,e.materialIds,e.shades,e.uvs,2,.4,0,.62,1,1,-.14),q(e.positions,e.normals,e.materialIds,e.shades,e.uvs,2,.32,0,.5,1,.92,.16),Ye(e)}function rt(e,t){return G([e[0]+t[0],e[1]+t[1],e[2]+t[2]])}function it(e,t){let n=Math.sin(e[0]*12.9898+e[1]*78.233+e[2]*37.719+t*91.7)*43758.5453;return n-Math.floor(n)}function at(e){return[.5+Math.atan2(e[2],e[0])/(2*Math.PI),.5-Math.asin(Math.max(-1,Math.min(1,e[1])))/Math.PI]}function ot(){let e=[1,0,0],t=[-1,0,0],n=[0,1,0],r=[0,-1,0],i=[0,0,1],a=[0,0,-1];return[[e,n,i],[i,n,t],[t,n,a],[a,n,e],[e,i,r],[i,t,r],[t,a,r],[a,e,r]]}function st(e){let t=[];for(let[n,r,i]of e){let e=rt(n,r),a=rt(r,i),o=rt(i,n);t.push([n,e,o],[e,r,a],[o,a,i],[e,a,o])}return t}function ct(e,t,n,r,i,a,o,s){let c=ot();for(let e=0;e<t;e++)c=st(c);let l=e=>{let t=a*(.8+it(e,s)*.45);return[n+e[0]*t,r+e[1]*t*o,i+e[2]*t]};for(let[t,n,r]of c){let i=.82+it(t,s+3)*.36;K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,l(t),l(n),l(r),1,i,at(t),at(n),at(r))}}function lt(){let e=J(),t=.68,n=.5;ct(e,2,0,n*t,0,n,t,1);let r=.24;return ct(e,1,.48,r*t*.9,.1,r,t,2),ct(e,1,-.4,r*t*.8,-.34,r*.85,t,3),Ye(e)}async function Y(e,t,n=1024){let r=await(await fetch(t)).blob(),i=await createImageBitmap(r),a=Math.min(1,n/Math.max(i.width,i.height)),o=a<1?await createImageBitmap(i,{resizeWidth:Math.round(i.width*a),resizeHeight:Math.round(i.height*a),resizeQuality:`medium`}):i;a<1&&i.close();let s=e.createTexture({size:[o.width,o.height],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return e.queue.copyExternalImageToTexture({source:o},{texture:s},[o.width,o.height]),o.close(),s}var ut=(()=>{let[e,t,n]=[.62,.38,.3],r=Math.hypot(e,t,n);return[e/r,t/r,n/r]})(),X=2048,dt=60,ft=100,pt=1,mt=220,ht=`
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
  @location(6) lightClip: vec4f, @location(7) forestFrac: f32,
};

@vertex
fn vs(
  @location(0) pos: vec3f, @location(1) waterColor: vec3f, @location(2) normal: vec3f,
  @location(3) uv: vec2f, @location(4) elevation: f32, @location(5) waterFlag: f32, @location(6) forestFrac: f32
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
// ---- Порт terrain.ts:hash2/noise/moistureAt/coldnessAt (см. комментарий
// выше TERRAIN_SHADER — держать в синхроне с исходником при правке).
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
fn moistureAt(x: f32, y: f32) -> f32 {
  let a = noiseAt(x / 210.0, y / 210.0, 13246); // SEED+901
  let b = noiseAt(x / 90.0, y / 90.0, 13247);   // SEED+902
  return clamp(a * 0.7 + b * 0.3, 0.0, 1.0);
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
  let texel = 1.0 / ${X.toFixed(1)};
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
  let lighting = hemi + sunLightColor * ndotl * shadow;

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
    let moist = moistureAt(in.worldPos.x, in.worldPos.z);
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
`,gt=`
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
`,_t=`
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
  let texel = 1.0 / ${X.toFixed(1)};
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
`,vt=`
struct Uniforms { vp: mat4x4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex
fn vs(@location(0) pos: vec3f) -> @builtin(position) vec4f {
  return u.vp * vec4f(pos, 1.0);
}
`,yt=`
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
`,bt=`
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
`,xt=.5,St=1.4,Ct=new Float32Array([0,St,0,xt,0,0,0,0,xt,0,St,0,0,0,xt,-.5,0,0,0,St,0,-.5,0,0,0,0,-.5,0,St,0,0,0,-.5,xt,0,0]),wt=Ct.length/3,Tt=7;async function Et(e,t,n){let r=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),i=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),a=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),o=e.createTexture({size:[X,X],format:`depth32float`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}).createView(),s=e.createSampler({compare:`less`,magFilter:`linear`,minFilter:`linear`}),c=ze(-1,1,-1,1,.1,1),l=0,u=0;function d(t,n){l=t,u=n;let r=He([t+ut[0]*ft,ut[1]*ft,n+ut[2]*ft],[t,0,n],[0,1,0]);c=Le(ze(-60,dt,-60,dt,pt,mt),r),e.queue.writeBuffer(a,0,c)}let[f,p,m,h,g,_,v,y,b,x,S]=await Promise.all([Y(e,`/textures/ground/sand.png`),Y(e,`/textures/ground/grass.png`),Y(e,`/textures/ground/dry_meadow.png`),Y(e,`/textures/ground/scree.png`),Y(e,`/textures/ground/rock.png`),Y(e,`/textures/ground/snow.png`),Y(e,`/textures/ground/forest_floor.png`),Y(e,`/textures/ground/desert.png`),Y(e,`/textures/ground/marsh.png`),Y(e,`/textures/ground/tundra_moss.png`),Y(e,`/textures/water/detail.png`)]),ee=e.createSampler({addressModeU:`repeat`,addressModeV:`repeat`,magFilter:`linear`,minFilter:`linear`}),C=e.createShaderModule({code:ht}),w=e.createRenderPipeline({layout:`auto`,vertex:{module:C,entryPoint:`vs`,buffers:[{arrayStride:56,attributes:[{shaderLocation:0,offset:0,format:`float32x3`},{shaderLocation:1,offset:12,format:`float32x3`},{shaderLocation:2,offset:24,format:`float32x3`},{shaderLocation:3,offset:36,format:`float32x2`},{shaderLocation:4,offset:44,format:`float32`},{shaderLocation:5,offset:48,format:`float32`},{shaderLocation:6,offset:52,format:`float32`}]}]},fragment:{module:C,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),te=e.createBindGroup({layout:w.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}},{binding:2,resource:ee},{binding:3,resource:f.createView()},{binding:4,resource:p.createView()},{binding:5,resource:m.createView()},{binding:6,resource:h.createView()},{binding:7,resource:g.createView()},{binding:8,resource:{buffer:a}},{binding:9,resource:s},{binding:10,resource:o},{binding:11,resource:_.createView()},{binding:12,resource:v.createView()},{binding:13,resource:y.createView()},{binding:14,resource:b.createView()},{binding:15,resource:x.createView()},{binding:16,resource:S.createView()}]}),[ne,re]=await Promise.all([Y(e,`/textures/sky/sky.png`),Y(e,`/textures/sky/clouds.png`)]),T=e.createSampler({addressModeU:`repeat`,addressModeV:`clamp-to-edge`,magFilter:`linear`,minFilter:`linear`}),ie=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),E=e.createShaderModule({code:bt}),ae=e.createRenderPipeline({layout:`auto`,vertex:{module:E,entryPoint:`vs`},fragment:{module:E,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`,cullMode:`none`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!1,depthCompare:`always`}}),oe=e.createBindGroup({layout:ae.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:ie}},{binding:1,resource:T},{binding:2,resource:ne.createView()},{binding:3,resource:re.createView()}]});function D(t,n,r,i,a,o){let s=new Float32Array([t[0],t[1],t[2],0,n[0],n[1],n[2],0,r[0],r[1],r[2],0,i,a,o,0]);e.queue.writeBuffer(ie,0,s)}let se=e.createShaderModule({code:vt}),ce=e.createRenderPipeline({layout:`auto`,vertex:{module:se,entryPoint:`vs`,buffers:[{arrayStride:56,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth32float`,depthWriteEnabled:!0,depthCompare:`less`}}),le=e.createBindGroup({layout:ce.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}}]}),O=new Map,ue=e.createShaderModule({code:gt}),de=e.createBuffer({size:Ct.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(de,0,Ct);let fe=e.createRenderPipeline({layout:`auto`,vertex:{module:ue,entryPoint:`vs`,buffers:[{arrayStride:12,stepMode:`vertex`,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]},{arrayStride:28,stepMode:`instance`,attributes:[{shaderLocation:1,offset:0,format:`float32x3`},{shaderLocation:2,offset:12,format:`float32`},{shaderLocation:3,offset:16,format:`float32x3`}]}]},fragment:{module:ue,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),pe=e.createBindGroup({layout:fe.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}}]}),k=null,A=0,j=0,M=e.createShaderModule({code:_t});function me(t){let n=e.createBuffer({size:Math.max(t.vertexCount*10*4,4),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),r=new Float32Array(t.vertexCount*10);for(let e=0;e<t.vertexCount;e++)r.set(t.positions.subarray(e*3,e*3+3),e*10),r.set(t.normals.subarray(e*3,e*3+3),e*10+3),r[e*10+6]=t.materialIds[e],r[e*10+7]=t.shades[e],r.set(t.uvs.subarray(e*2,e*2+2),e*10+8);return e.queue.writeBuffer(n,0,r),n}let he=await Promise.all(Object.entries({bark:`/textures/decor/bark.png`,birchBark:`/textures/decor/birch_bark.png`,conifer:`/textures/decor/conifer_a.png`,conifer2:`/textures/decor/conifer_b.png`,broadleaf:`/textures/decor/broadleaf.png`,autumn:`/textures/decor/autumn.png`,birchLeaf:`/textures/decor/birch_leaf.png`,bush:`/textures/decor/bush.png`,grassTuft:`/textures/decor/grass_tuft.png`}).map(async([t,n])=>[t,await Y(e,n)])),ge={...Object.fromEntries(he),rock:g},_e=e.createSampler({magFilter:`linear`,minFilter:`linear`}),ve={spruce:{trunk:`bark`,canopy:`conifer`},pine:{trunk:`bark`,canopy:`conifer2`},broadleaf:{trunk:`bark`,canopy:`broadleaf`},autumn:{trunk:`bark`,canopy:`autumn`},birch:{trunk:`birchBark`,canopy:`birchLeaf`},dead:{trunk:`bark`,canopy:`bark`},bush:{trunk:`bark`,canopy:`bush`},grass:{trunk:`bark`,canopy:`grassTuft`},rock:{trunk:`bark`,canopy:`rock`}},ye={spruce:Xe,pine:Ze,broadleaf:Qe,autumn:Qe,birch:$e,dead:et,bush:tt,grass:nt,rock:lt},N=[{arrayStride:40,stepMode:`vertex`,attributes:[{shaderLocation:0,offset:0,format:`float32x3`},{shaderLocation:1,offset:12,format:`float32x3`},{shaderLocation:2,offset:24,format:`float32`},{shaderLocation:3,offset:28,format:`float32`},{shaderLocation:4,offset:32,format:`float32x2`}]},{arrayStride:40,stepMode:`instance`,attributes:[{shaderLocation:5,offset:0,format:`float32x3`},{shaderLocation:6,offset:12,format:`float32x3`},{shaderLocation:7,offset:24,format:`float32`},{shaderLocation:8,offset:28,format:`float32x3`}]}],P=e.createRenderPipeline({layout:`auto`,vertex:{module:M,entryPoint:`vs`,buffers:N},fragment:{module:M,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),F=e.createShaderModule({code:yt}),I=e.createRenderPipeline({layout:`auto`,vertex:{module:F,entryPoint:`vs`,buffers:N},fragment:{module:F,entryPoint:`fs`,targets:[]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth32float`,depthWriteEnabled:!0,depthCompare:`less`}}),L=new Map;for(let t of Object.keys(ve)){let n=ye[t](),c=ve[t],l=e.createBindGroup({layout:P.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}},{binding:2,resource:_e},{binding:3,resource:ge[c.trunk].createView()},{binding:4,resource:ge[c.canopy].createView()},{binding:5,resource:{buffer:a}},{binding:6,resource:s},{binding:7,resource:o}]}),u=e.createBindGroup({layout:I.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}},{binding:1,resource:_e},{binding:2,resource:ge[c.canopy].createView()}]});L.set(t,{mesh:n,localBuf:me(n),instBuf:null,instCapacity:0,instanceCount:0,bindGroup:l,shadowBindGroup:u})}let R=null,be=null;function xe(){let n=t.canvas.width,r=t.canvas.height;R&&R.width===n&&R.height===r||(R?.destroy(),R=e.createTexture({size:[n,r],format:`depth24plus`,usage:GPUTextureUsage.RENDER_ATTACHMENT}),be=R.createView())}function Se(t,n){O.get(t)?.buf.destroy();let r=e.createBuffer({size:Math.max(n.vertexCount*14*4,4),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),i=new Float32Array(n.vertexCount*14),a=1/0,o=-1/0,s=1/0,c=-1/0;for(let e=0;e<n.vertexCount;e++){let t=n.positions[e*3],r=n.positions[e*3+2];t<a&&(a=t),t>o&&(o=t),r<s&&(s=r),r>c&&(c=r),i.set(n.positions.subarray(e*3,e*3+3),e*14),i.set(n.colors.subarray(e*3,e*3+3),e*14+3),i.set(n.normals.subarray(e*3,e*3+3),e*14+6),i.set(n.uvs.subarray(e*2,e*2+2),e*14+9),i[e*14+11]=n.elevations[e],i[e*14+12]=n.waterFlags[e],i[e*14+13]=n.forestFracs[e]}e.queue.writeBuffer(r,0,i),O.set(t,{buf:r,vertexCount:n.vertexCount,minX:a,maxX:o,minZ:s,maxZ:c})}function Ce(e){let t=O.get(e);t&&(t.buf.destroy(),O.delete(e))}function z(t){j=t.length;let n=new Float32Array(j*Tt);t.forEach((e,t)=>{let r=t*Tt;n[r]=e.x,n[r+1]=e.y,n[r+2]=e.z,n[r+3]=1,n[r+4]=e.color[0],n[r+5]=e.color[1],n[r+6]=e.color[2]}),j>A&&(k?.destroy(),A=Math.max(j,8),k=e.createBuffer({size:A*Tt*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST})),k&&n.byteLength>0&&e.queue.writeBuffer(k,0,n)}function we(t,n){let r=t.length,i=new Float32Array(r*10);t.forEach((e,t)=>{let n=t*10;i[n]=e.x,i[n+1]=e.y,i[n+2]=e.z,i[n+3]=e.scale[0],i[n+4]=e.scale[1],i[n+5]=e.scale[2],i[n+6]=e.yaw,i[n+7]=e.color[0],i[n+8]=e.color[1],i[n+9]=e.color[2]}),n.instanceCount=r,r>n.instCapacity&&(n.instBuf?.destroy(),n.instCapacity=Math.max(r,8),n.instBuf=e.createBuffer({size:n.instCapacity*10*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST})),n.instBuf&&i.byteLength>0&&e.queue.writeBuffer(n.instBuf,0,i)}function Te(e){for(let[t,n]of L)we(e.filter(e=>e.kind===t),n)}function Ee(t){e.queue.writeBuffer(r,0,t)}function B(t,n,r,a){let o=new Float32Array([t[0],t[1],t[2],a,n[0],n[1],n[2],r]);e.queue.writeBuffer(i,0,o)}function V(n,r){xe();let i=e.createCommandEncoder();{let e=i.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:o,depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}}),t=l-dt,n=l+dt,r=u-dt,a=u+dt;if(O.size>0){e.setPipeline(ce),e.setBindGroup(0,le);for(let i of O.values())i.vertexCount!==0&&(i.maxX<t||i.minX>n||i.maxZ<r||i.minZ>a||(e.setVertexBuffer(0,i.buf),e.draw(i.vertexCount)))}let s=!1;for(let e of L.values())if(e.instanceCount>0){s=!0;break}if(s){e.setPipeline(I);for(let t of L.values())t.instanceCount===0||!t.instBuf||(e.setBindGroup(0,t.shadowBindGroup),e.setVertexBuffer(0,t.localBuf),e.setVertexBuffer(1,t.instBuf),e.draw(t.mesh.vertexCount,t.instanceCount))}e.end()}let a=t.getCurrentTexture().createView(),s=i.beginRenderPass({colorAttachments:[{view:a,clearValue:n,loadOp:`clear`,storeOp:`store`}],depthStencilAttachment:{view:be,depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}});if(s.setPipeline(ae),s.setBindGroup(0,oe),s.draw(3),O.size>0){s.setPipeline(w),s.setBindGroup(0,te);for(let e of O.values())e.vertexCount!==0&&(s.setVertexBuffer(0,e.buf),s.draw(e.vertexCount))}j>0&&k&&(s.setPipeline(fe),s.setBindGroup(0,pe),s.setVertexBuffer(0,de),s.setVertexBuffer(1,k),s.draw(wt,j));let c=!1;for(let e of L.values())if(e.instanceCount>0){c=!0;break}if(c){s.setPipeline(P);for(let e of L.values())e.instanceCount===0||!e.instBuf||(s.setBindGroup(0,e.bindGroup),s.setVertexBuffer(0,e.localBuf),s.setVertexBuffer(1,e.instBuf),s.draw(e.mesh.vertexCount,e.instanceCount))}r?.(s),s.end(),e.queue.submit([i.finish()])}function De(){return{lightBuf:a,shadowView:o,shadowSampler:s}}return{setTerrainChunk:Se,removeTerrainChunk:Ce,setMarkers:z,setDecor:Te,setVP:Ee,setFog:B,setSunTarget:d,setSkyCamera:D,getShadowResources:De,frame:V}}var Z=12345,Dt=.235,Ot=2400,kt=1200,At=Ot/2;kt/2;var jt=2.5;function Q(e,t,n){let r=e*374761393+t*668265263+n*1274126177;return r=Math.imul(r^r>>>13,1274126177),((r^r>>>16)>>>0)/4294967296}function Mt(e,t,n){let r=Math.floor(e),i=Math.floor(t),a=e-r,o=t-i,s=a*a*(3-2*a),c=o*o*(3-2*o),l=Q(r,i,n),u=Q(r+1,i,n),d=Q(r,i+1,n),f=Q(r+1,i+1,n);return(l*(1-s)+u*s)*(1-c)+(d*(1-s)+f*s)*c}var Nt=null,Pt=null;async function Ft(){let[e,t]=await Promise.all([fetch(`/heightmap/elevation.bin`).then(e=>e.arrayBuffer()),fetch(`/heightmap/forest.bin`).then(e=>e.arrayBuffer())]);Nt=new Uint16Array(e),Pt=new Uint8Array(t)}function It(e,t,n,r){let i=Math.floor(t),a=Math.floor(n),o=Math.min(i+1,2399),s=Math.min(a+1,1199),c=t-i,l=n-a,u=a*Ot+i,d=a*Ot+o,f=s*Ot+i,p=s*Ot+o,m=e[u]+(e[d]-e[u])*c;return(m+(e[f]+(e[p]-e[f])*c-m)*l)*r}function Lt(e,t){return[Math.max(0,Math.min(2399,e+At)),Math.max(0,Math.min(1199,t+600))]}function Rt(e,t){if(!Nt)return .285;let[n,r]=Lt(e,t);return It(Nt,n,r,jt/65535)}function zt(e,t){let n=Rt(e,t),r=(Rt(e+.7,t)+Rt(e-.7,t)+Rt(e,t+.7)+Rt(e,t-.7))*.25;return n*.55+r*.45}var Bt=32,Vt=new Map;function Ht(e,t){return Math.floor(e/Bt)+`,`+Math.floor(t/Bt)}function Ut(e,t,n){let r={x:e,z:t,targetH:zt(e,t),radius:n},i=Ht(e,t),a=Vt.get(i);a?a.push(r):Vt.set(i,[r])}function $(e,t){let n=zt(e,t);if(Vt.size===0)return n;let r=Math.floor(e/Bt),i=Math.floor(t/Bt),a=null,o=0;for(let n=-1;n<=1;n++)for(let s=-1;s<=1;s++){let c=Vt.get(r+s+`,`+(i+n));if(c)for(let n of c){let r=Math.hypot(e-n.x,t-n.z);if(r>=n.radius)continue;let i=n.radius*.55,s=r<=i?1:1-((r-i)/(n.radius-i))**2*(3-2*((r-i)/(n.radius-i)));s>o&&(o=s,a=n)}}return a?n*(1-o)+a.targetH*o:n}function Wt(e,t){return $(e,t)<Dt}function Gt(e,t){if(!Pt)return 0;let[n,r]=Lt(e,t);return It(Pt,n,r,1/255)}var Kt=(e,t,n)=>[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n],qt=[.14,.24,.28],Jt=[.05,.11,.19];function Yt(e){return Kt(qt,Jt,Math.min(1,e))}var Xt=[0,1,0],Zt=6;function Qt(e,t){let n=.5,r=$(e-n,t)*13,i=$(e+n,t)*13,a=$(e,t-n)*13,o=$(e,t+n)*13;return G([-(i-r)/(2*n),1,-(o-a)/(2*n)])}function $t(e,t,n,r,i=1,a=0){let o=Math.round((n-e)/i),s=Math.round((r-t)/i),c=i===1,l=[],u=[],d=[],f=[],p=[],m=[],h=[];function g(e,t){let n=$(e,t),r=n<Dt;return{p:r?[e,Dt*13-a,t]:[e,n*13-a,t],c:r?Yt((Dt-n)*3):[0,0,0],n:r?Xt:c?Qt(e,t):Xt,uv:[e/Zt,t/Zt],e:n,water:+!!r,forest:Gt(e,t)}}let _=[];for(let n=0;n<=s;n++){let r=[];for(let a=0;a<=o;a++)r.push(g(e+a*i,t+n*i));_.push(r)}function v(e,t,n){let r=c?null:G(Ie(Pe(t.p,e.p),Pe(n.p,e.p)));for(let i of[e,t,n]){l.push(i.p[0],i.p[1],i.p[2]),u.push(i.c[0],i.c[1],i.c[2]);let e=r??i.n;d.push(e[0],e[1],e[2]),f.push(i.uv[0],i.uv[1]),p.push(i.e),m.push(i.water),h.push(i.forest)}}for(let e=0;e<s;e++)for(let t=0;t<o;t++){let n=_[e][t],r=_[e][t+1],i=_[e+1][t],a=_[e+1][t+1];v(n,a,r),v(n,i,a)}return{positions:new Float32Array(l),colors:new Float32Array(u),normals:new Float32Array(d),uvs:new Float32Array(f),elevations:new Float32Array(p),waterFlags:new Float32Array(m),forestFracs:new Float32Array(h),vertexCount:l.length/3}}var en=9,tn=100,nn=10,rn=380,an={d:[1,0],arrowright:[1,0],a:[-1,0],arrowleft:[-1,0],w:[0,1],arrowup:[0,1],s:[0,-1],arrowdown:[0,-1]},on=700;function sn(e,t){let n=!0,r=new Map,i=null,a=null,o=null,s=null,c=null;function l(){n=!1,c?.()}function u(){let e=[...r.values()];return{x:(e[0].x+e[1].x)/2,y:(e[0].y+e[1].y)/2,d:Math.hypot(e[0].x-e[1].x,e[0].y-e[1].y)}}function d(){let e=[...r.values()];return Math.atan2(e[1].y-e[0].y,e[1].x-e[0].x)}function f(e,n){let r=t.dist*.0022,i=e*r,a=n*r,o=Math.cos(t.yaw),s=Math.sin(t.yaw);t.target[0]=Math.max(-At,Math.min(At,t.target[0]-(i*o-a*s))),t.target[2]=Math.max(-600,Math.min(600,t.target[2]+(i*s+a*o))),t.target[1]=$(t.target[0],t.target[2])*13+1}e.addEventListener(`pointerdown`,n=>{n.preventDefault(),l(),r.set(n.pointerId,{x:n.clientX,y:n.clientY});try{e.setPointerCapture(n.pointerId)}catch{}if(r.size===1)i={x:n.clientX,y:n.clientY,tx:t.target[0],tz:t.target[2]},o={x:n.clientX,y:n.clientY,t:performance.now()};else if(r.size===2){i=null,o=null;let e=u();a={d:e.d,y:e.y,dist:t.dist,yaw:t.yaw,pitch:t.pitch,angle:d()}}}),e.addEventListener(`pointermove`,e=>{if(r.has(e.pointerId)){if(e.preventDefault(),r.set(e.pointerId,{x:e.clientX,y:e.clientY}),o&&Math.hypot(e.clientX-o.x,e.clientY-o.y)>nn&&(o=null),r.size>=2&&a){let e=u();t.dist=Math.max(en,Math.min(tn,a.dist*(a.d/Math.max(12,e.d)))),t.yaw=a.yaw+(d()-a.angle),t.pitch=Math.max(.08,Math.min(1.42,a.pitch+(e.y-a.y)*.005));return}i&&(t.target[0]=i.tx,t.target[2]=i.tz,f(e.clientX-i.x,i.y-e.clientY))}});function p(e){if(o&&r.size===1&&performance.now()-o.t<rn&&s?.(o.x,o.y),o=null,r.delete(e.pointerId),r.size<2&&(a=null),r.size===0)i=null;else if(r.size===1){let e=[...r.values()][0];i={x:e.x,y:e.y,tx:t.target[0],tz:t.target[2]}}}e.addEventListener(`pointerup`,p),e.addEventListener(`pointercancel`,p),e.addEventListener(`wheel`,e=>{e.preventDefault(),l(),t.dist=Math.max(en,Math.min(tn,t.dist*(e.deltaY<0?.9:1.11)))},{passive:!1});let m=new Set;window.addEventListener(`keydown`,e=>{let t=e.key.toLowerCase();t in an&&(m.add(t),l())}),window.addEventListener(`keyup`,e=>{m.delete(e.key.toLowerCase())});let h=null;function g(e){if(h===null){h=e;return}let t=Math.min(.1,(e-h)/1e3);if(h=e,m.size===0||i)return;let n=0,r=0;for(let e of m){let[t,i]=an[e];n+=t,r+=i}(n!==0||r!==0)&&f(n*on*t,r*on*t)}return{isAutoOrbiting:()=>n,stopAuto:l,update:g,onTap(e){s=e},onInteract(e){c=e}}}var cn={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},ln={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};async function un(e){let t=await(await fetch(e)).arrayBuffer(),n=new DataView(t);if(n.getUint32(0,!0)!==1179937895)throw Error(`не glTF-контейнер: `+e);let r=n.getUint32(8,!0),i=12,a=null,o=null;for(;i<r;){let e=n.getUint32(i,!0),r=n.getUint32(i+4,!0),s=t.slice(i+8,i+8+e);r===1313821514?a=JSON.parse(new TextDecoder().decode(s)):r===5130562&&(o=s),i+=8+e}if(!a||!o)throw Error(`GLB без JSON/BIN чанка: `+e);let s=e=>a.accessors[e],c=e=>a.bufferViews[e];function l(e){let t=s(e),n=c(t.bufferView),r=cn[t.componentType],i=(n.byteOffset||0)+(t.byteOffset||0);return new r(o,i,t.count*ln[t.type])}let u=a.meshes[0].primitives[0],d=l(u.attributes.POSITION),f=l(u.attributes.NORMAL),p=l(u.attributes.TEXCOORD_0),m=l(u.indices),h=a.materials[u.material].pbrMetallicRoughness.baseColorTexture.index,g=a.images[a.textures[h].source],_=c(g.bufferView);return{positions:d,normals:f,uvs:p,indices:m,imageBytes:o.slice(_.byteOffset||0,(_.byteOffset||0)+_.byteLength),imageMimeType:g.mimeType}}var dn=`
struct Uniforms { vp: mat4x4f, model: mat4x4f };
struct Fog { eye: vec4f, color: vec4f };
struct Light { vp: mat4x4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> fog: Fog;
@group(0) @binding(4) var<uniform> light: Light;
@group(0) @binding(5) var shadowSamp: sampler_comparison;
@group(0) @binding(6) var shadowTex: texture_depth_2d;

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
  let world = u.model * vec4f(pos, 1.0);
  out.pos = u.vp * world;
  out.uv = uv;
  // модельная матрица тут без неравномерного масштаба — обычной 3x3 части достаточно для нормали
  out.worldNormal = normalize((u.model * vec4f(normal, 0.0)).xyz);
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
  let texel = 1.0 / ${X.toFixed(1)};
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
`;async function fn(e,t){let n=e.createBuffer({size:t.positions.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(n,0,t.positions);let r=e.createBuffer({size:t.normals.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(r,0,t.normals);let i=e.createBuffer({size:t.uvs.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(i,0,t.uvs);let a=t.indices.byteLength,o=Math.ceil(a/4)*4,s=e.createBuffer({size:o,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});if(o===a)e.queue.writeBuffer(s,0,t.indices);else{let n=new Uint8Array(o);n.set(new Uint8Array(t.indices.buffer,t.indices.byteOffset,a)),e.queue.writeBuffer(s,0,n)}let c=await createImageBitmap(new Blob([t.imageBytes],{type:t.imageMimeType})),l=Math.min(1,1024/Math.max(c.width,c.height)),u=l<1?await createImageBitmap(c,{resizeWidth:Math.round(c.width*l),resizeHeight:Math.round(c.height*l),resizeQuality:`medium`}):c;l<1&&c.close();let d=e.createTexture({size:[u.width,u.height],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return e.queue.copyExternalImageToTexture({source:u},{texture:d},[u.width,u.height]),u.close(),{vao:{posBuf:n,nrmBuf:r,uvBuf:i,idxBuf:s,indexFormat:t.indices instanceof Uint16Array?`uint16`:`uint32`,indexCount:t.indices.length},texture:d}}function pn(e,t,n){let r=e.createShaderModule({code:dn}),i=e.createRenderPipeline({layout:`auto`,vertex:{module:r,entryPoint:`vs`,buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]},{arrayStride:12,attributes:[{shaderLocation:1,offset:0,format:`float32x3`}]},{arrayStride:8,attributes:[{shaderLocation:2,offset:0,format:`float32x2`}]}]},fragment:{module:r,entryPoint:`fs`,targets:[{format:t}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),a=e.createSampler({magFilter:`linear`,minFilter:`linear`,mipmapFilter:`linear`}),o=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});function s(t,n,r){let i=new Float32Array([t[0],t[1],t[2],0,n[0],n[1],n[2],r]);e.queue.writeBuffer(o,0,i)}function c(t,r){let s=e.createBuffer({size:128,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});return e.queue.writeBuffer(s,64,r),{model:t,uniformBuf:s,bindGroup:e.createBindGroup({layout:i.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:s}},{binding:1,resource:a},{binding:2,resource:t.texture.createView()},{binding:3,resource:{buffer:o}},{binding:4,resource:{buffer:n.lightBuf}},{binding:5,resource:n.shadowSampler},{binding:6,resource:n.shadowView}]})}}function l(t,n,r){e.queue.writeBuffer(n.uniformBuf,0,r),t.setPipeline(i),t.setBindGroup(0,n.bindGroup),t.setVertexBuffer(0,n.model.vao.posBuf),t.setVertexBuffer(1,n.model.vao.nrmBuf),t.setVertexBuffer(2,n.model.vao.uvBuf),t.setIndexBuffer(n.model.vao.idxBuf,n.model.vao.indexFormat),t.drawIndexed(n.model.vao.indexCount)}return{createInstance:c,draw:l,setFog:s}}var mn={food:`farm`,wood:`sawmill`,stone:`quarry`,gold:`gold-mine`,amber:`amber-vein`},hn={food:`Пашня`,wood:`Лесопилка`,stone:`Каменоломня`,gold:`Рудник`,amber:`Янтарная жила`};function gn(e){return e>=25?5:e>=19?4:e>=13?3:e>=7?2:1}function _n(){try{let e=window.parent;if(e&&e!==window){let t=e.mpWorldSnapshot;if(typeof t==`function`){let e=t();if(e)return e}if(e.W)return e.W}}catch{}return null}function vn(){let e=_n();return!e||!e.players[0]?null:{x:e.players[0].x,y:e.players[0].y}}var yn=16;function bn(e,t,n){let r=_n();if(!r)return null;let i=[],a=e!==void 0&&t!==void 0&&n!==void 0&&!!r.mapChunks,o=[];if(a){let i=Math.floor((e-n)/yn),a=Math.floor((e+n)/yn),s=Math.floor((t-n)/yn),c=Math.floor((t+n)/yn);for(let e=s;e<=c;e++)for(let t=i;t<=a;t++){let n=r.mapChunks[t+`,`+e];if(n)for(let e of n)o.push(e)}}else for(let e in r.map)o.push(e);let s=n===void 0?1/0:n*n;for(let n of o){let o=r.map[n];if(o){if(a){let n=o.x-e,r=o.y-t;if(n*n+r*r>s)continue}if(o.t===`city`){let e=r.players.find(e=>e.id===o.pid),t=e?e.race:`human`,a=e?Math.max(1,Math.min(5,gn(e.b.hall))):1,s=r.players[0]&&e&&e.id===r.players[0].id,c=e?e.nick??`?`:`?`,l=e?`Ратуша `+e.b.hall:``;i.push({key:n,x:o.x+.5,y:o.y+.5,gx:o.x,gy:o.y,kind:0,model:`/models/castles/${t}-${a}.glb`,scale:10,own:s,nm:c,lv:l})}else if(o.t===`camp`||o.t===`fort`){let e=(o.t===`fort`?`Форт`:`Лагерь`)+` варваров`,t=`ур. `+(o.lv??`?`);i.push({key:n,x:o.x+.5,y:o.y+.5,gx:o.x,gy:o.y,kind:1,model:`/models/camps/barbarians.glb`,scale:o.t===`fort`?6.5:5,nm:e,lv:t})}else if(o.t===`node`){let e=mn[o.res]||`farm`,t=hn[o.res]||`Точка`,r=`ур. `+(o.lv??`?`);i.push({key:n,x:o.x+.5,y:o.y+.5,gx:o.x,gy:o.y,kind:2,model:`/models/resources/${e}.glb`,scale:5,nm:t,lv:r})}}}return i}function xn(e){let t=0;for(let n in e)for(let r in e[n])t+=e[n][+r]||0;return t}function Sn(){try{let e=window.parent;if(e&&e!==window){let t=e.mpWorldSnapshot;if(typeof t==`function`){let e=t();if(e)return e}if(e.W)return e.W}}catch{}return null}function Cn(e,t){let n=e.path,r=e.pathCum;if(!n||n.length<2)return n&&n[0]||{x:e.tx,y:e.ty};let i=t*(e.pathLen??0);for(let e=1;e<r.length;e++)if(r[e]>=i){let t=r[e]-r[e-1],a=t>0?(i-r[e-1])/t:0,o=n[e-1],s=n[e];return{x:o.x+(s.x-o.x)*a,y:o.y+(s.y-o.y)*a}}return n[n.length-1]}function wn(){let e=Sn();if(!e||!e.marches)return null;let t=e.players[0]?e.players[0].id:-1,n=[];for(let r of e.marches){let i=r.state===`gather`||r.state===`siege`?{x:r.tx,y:r.ty}:Cn(r,Math.max(0,Math.min(1,(e.t-r.t0)/Math.max(1,r.t1-r.t0)))),a=e.players.find(e=>e.id===r.pid),o=r.state===`siege`&&r.data&&r.data.battle?r.data.battle:null,s=o?{round:o.round??0,revealFromRound:o.revealFromRound??0,retreating:!!(o.retreatRequested||o.retreated),attHpLeft:o.attHpLeft??0,attStartHp:o.attStartHp??1,revealFromAttHp:o.revealFromAttHp??o.attHpLeft??0,defHpLeft:o.defHpLeft??0,defStartHp:o.defStartHp??1,revealFromDefHp:o.revealFromDefHp??o.defHpLeft??0,revealStart:o.revealStart??0,revealAt:o.revealAt??0}:null;n.push({x:i.x,y:i.y,own:r.pid===t,id:r.id,nick:a?.nick??a?.name??`?`,unitsTotal:xn(r.units),state:r.state,tx:r.tx,ty:r.ty,t1:r.t1,battle:s})}return n}var Tn=document.getElementById(`status`),En=(()=>{try{if(/[?&]debug=1\b/.test(location.search))return!0;if(window.parent&&window.parent!==window)return/[?&]debug=1\b/.test(window.parent.location.search)}catch{}return!1})();En&&(Tn.style.display=`block`);function Dn(e){En&&(Tn.textContent=e.join(`
`))}function On(e){Tn.style.display=`block`,Tn.textContent=e.join(`
`)}async function kn(){let e=[];await Ft(),e.push(`рельеф: настоящие данные высот загружены`);let t={x:42,y:22},n=[.6,.52,.4],r=.0042,i=vn(),a=i??t,o=bn(a.x,a.y,384),s=o!==null;window.parent!==window&&(Tn.style.display=`none`);let c=o??[{key:`demo-0`,x:43,y:14,gx:43,gy:14,kind:0,model:`/models/castles/human-1.glb`,scale:10,nm:`Замок`,lv:`демо`},{key:`demo-1`,x:50,y:20,gx:50,gy:20,kind:1,model:`/models/camps/barbarians.glb`,scale:5,nm:`Лагерь`,lv:`демо`},{key:`demo-2`,x:55,y:12,gx:55,gy:12,kind:2,model:`/models/resources/farm.glb`,scale:5,nm:`Пашня`,lv:`демо`},{key:`demo-3`,x:30,y:30,gx:30,gy:30,kind:2,model:`/models/resources/quarry.glb`,scale:5,nm:`Каменоломня`,lv:`демо`}];e.push(s?`данные: настоящая партия, сущностей — ${c.length}`:`данные: демо (window.parent.W недоступен)`);let l=u(),d={x:[],y:[]},f={value:[]},p=new Map,m=new Map,h=new Map,g=new Map,_=new Map,v=new Map,y=new Map;function b(e){let t=Ae(l);return Oe(l,t,d),Oe(l,t,f),d.x[t]=e.x,d.y[t]=e.y,f.value[t]=e.kind,p.set(t,e.model),m.set(t,e.scale),h.set(t,e.nm),g.set(t,e.lv),_.set(t,!!e.own),v.set(t,{x:e.gx,y:e.gy}),y.set(e.key,t),Ut(e.x,e.y,e.scale*1.4),t}for(let e of c)b(e);let x=Array.from(Se(l,[d,f]));e.push(`bitECS: сущностей — ${x.length}`);function S(t){On([...e,t]);try{window.parent&&window.parent!==window&&typeof window.parent.forceCityView==`function`&&window.parent.forceCityView()}catch{}}if(!(`gpu`in navigator)){S(`WebGPU: navigator.gpu отсутствует.`);return}let ee=await navigator.gpu.requestAdapter();if(!ee){S(`WebGPU: адаптер не найден.`);return}let C=await ee.requestDevice();function w(e){let t=document.getElementById(`gpu-error-banner`);t||(t=document.createElement(`div`),t.id=`gpu-error-banner`,t.style.cssText=`position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#4a0f0f;color:#fff;font:11px/1.4 monospace;padding:6px 8px;max-height:40vh;overflow:auto;white-space:pre-wrap;`,document.body.appendChild(t)),t.textContent+=(t.textContent?`
---
`:``)+e}C.addEventListener(`uncapturederror`,e=>{let t=e.error.message;console.error(`WebGPU error:`,t),w(t)});let te=`fb-gpu-reload-at`,ne=Number(sessionStorage.getItem(te)||0),re=ne&&Date.now()-ne<6e4;C.lost.then(e=>{if(console.error(`WebGPU device lost:`,e.reason,e.message),e.reason!==`destroyed`){if(re){w(`WebGPU-устройство теряется повторно (${e.reason}) — похоже, объёмная карта нестабильна на этом устройстве/браузере. Карта города ниже работает независимо от WebGPU.`);try{window.parent&&window.parent!==window&&typeof window.parent.forceCityView==`function`&&window.parent.forceCityView()}catch{}return}w(`WebGPU-устройство потеряно (${e.reason}): ${e.message}\nПерезагрузка через 2с...`),sessionStorage.setItem(te,String(Date.now())),setTimeout(()=>location.reload(),2e3)}});let T=document.getElementById(`gpu`),ie=T.getContext(`webgpu`);if(!ie){S(`WebGPU: getContext('webgpu') вернул null.`);return}let E=navigator.gpu.getPreferredCanvasFormat();function ae(){let e=T.clientWidth,t=T.clientHeight;if(e<=0||t<=0)return;let n=Math.min(2,window.devicePixelRatio||1),r=Math.max(1,Math.floor(e*n)),i=Math.max(1,Math.floor(t*n));T.width!==r&&(T.width=r),T.height!==i&&(T.height=i)}let oe=()=>T.offsetParent===null&&T.clientWidth===0;ae(),new ResizeObserver(ae).observe(T),ie.configure({device:C,format:E,alphaMode:`opaque`}),e.push(`WebGPU: устройство получено, формат — ${E}`);let D=await Et(C,ie,E);function se(e,t){return e+`,`+t}function ce(e,t){try{let n=window.parent;n&&n!==window&&typeof n.ensureWorldChunk==`function`&&n.ensureWorldChunk(e,t)}catch{}}let le=new Map;function O(e,t){return[e[0]*t,e[1]*t,e[2]*t]}function ue(e,t,n){if(Wt(e,t))return!0;for(let r=0;r<8;r++){let i=r/8*Math.PI*2;if(Wt(e+Math.cos(i)*n,t+Math.sin(i)*n))return!0}return!1}function de(e,t,n,r){for(let i of x){let a=d.x[i]-e,o=d.y[i]-t,s=(m.get(i)??5)*n+r;if(a*a+o*o<s*s)return!0}return!1}function fe(e,t){return e>1.36?t<.62?`spruce`:t<.94?`pine`:`dead`:t<.58?`broadleaf`:t<.8?`birch`:t<.94?`spruce`:`dead`}function pe(e,t){let n=[];for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=e*4+i,o=t*4+r;if(Q(a,o,13122)>=.65)continue;let s=.175+Q(a,o,Z+778)*.65,c=.175+Q(a,o,Z+779)*.65,l=e*16+i*4+s*4,u=t*16+r*4+c*4,d=l+(Mt(l/8.5,u/8.5,Z+790)*2-1)*2,f=u+(Mt(l/8.5,u/8.5,Z+791)*2-1)*2;if(ue(d,f,1.5)||de(d,f,.54,.68))continue;let p=Q(a,o,Z+781)*Math.PI*2,m=.85+Q(a,o,Z+782)*.3,h=$(d,f),g=h*13,_=.05+.85*Gt(d,f),v=Q(a,o,Z+780)<_,y=1+Q(a,o,Z+785)*1.3,b=.8+Q(a,o,Z+786)*.5;if(v){let e=fe(h,Q(a,o,Z+780));e===`broadleaf`&&Q(a,o,13132)<.35&&(e=`autumn`);let t=e===`spruce`||e===`pine`?Ue:We,r=t[Math.floor(Q(a,o,Z+784)*t.length)];n.push({x:d,y:g,z:f,scale:[b,y,b],yaw:p,color:O(r,m),kind:e})}else{let e=.1+.30000000000000004*Math.min(1,h/1.6);if(Q(a,o,13140)>=e)continue;let t=qe[Math.floor(Q(a,o,Z+784)*qe.length)],r=.6+Q(a,o,Z+785)*.9,i=.6+Q(a,o,Z+786)*.9;n.push({x:d,y:g,z:f,scale:[i,r,i],yaw:p,color:O(t,m),kind:`rock`})}}for(let r=0;r<8;r++)for(let i=0;i<8;i++){let a=e*8+i,o=t*8+r;if(Q(a,o,13232)>=.7)continue;let s=Q(a,o,Z+888),c=Q(a,o,Z+889),l=e*16+i*2+s*2,u=t*16+r*2+c*2;if(ue(l,u,.4)||de(l,u,.36,.17))continue;let d=$(l,u);if(d>2)continue;let f=d*13,p=Q(a,o,Z+890)*Math.PI*2,m=.8+Q(a,o,Z+891)*.4,h=Ge[Math.floor(Q(a,o,Z+892)*Ge.length)],g=.8+Q(a,o,Z+893)*.6;n.push({x:l,y:f,z:u,scale:[g,g,g],yaw:p,color:O(h,m),kind:`grass`})}let r=16/3;for(let i=0;i<r;i++)for(let a=0;a<r;a++){let o=e*r+a,s=t*r+i;if(Q(o,s,13342)>=.35)continue;let c=Q(o,s,Z+998),l=Q(o,s,Z+999),u=e*16+a*3+c*3,d=t*16+i*3+l*3;if(ue(u,d,.9)||de(u,d,.44,.34))continue;let f=$(u,d);if(f>2)continue;let p=f*13,m=Q(o,s,Z+1e3)*Math.PI*2,h=.85+Q(o,s,Z+1001)*.3,g=Ke[Math.floor(Q(o,s,Z+1002)*Ke.length)],_=.9+Q(o,s,Z+1003)*.7;n.push({x:u,y:p,z:d,scale:[_,_,_],yaw:m,color:O(g,h),kind:`bush`})}return n}function k(){let e=[];for(let t of le.values())e.push(...t);D.setDecor(e),window.__decorCount=e.length,window.__decorList=e}let A=new Set,j=new Set,M=[],me=null,he=null;function ge(e,t,n=!1){let r=Math.floor(e/16),i=Math.floor(t/16);if(!n&&r===me&&i===he)return;me=r,he=i;let a=!1;for(let e=-3;e<=3;e++)for(let t=-3;t<=3;t++){let n=r+t,o=i+e,s=se(n,o);A.has(s)||j.has(s)||(j.add(s),M.push({cx:n,cz:o,key:s}),a=!0)}let o=!1;for(let e of Array.from(A)){let[t,n]=e.split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>5&&(D.removeTerrainChunk(e),A.delete(e),le.delete(e),o=!0)}for(let e of Array.from(j)){let[t,n]=e.split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>5&&(j.delete(e),a=!0)}a&&(M=M.filter(e=>j.has(e.key)),M.sort((e,t)=>(e.cx-r)**2+(e.cz-i)**2-((t.cx-r)**2+(t.cz-i)**2))),window.__terrainChunkCount=A.size,o&&k()}function _e(e){let t=!1;for(;M.length&&performance.now()<e;){let{cx:e,cz:n,key:r}=M.shift();if(!j.has(r))continue;j.delete(r);let i=e*16,a=n*16,o=$t(i,a,i+16,a+16,1);D.setTerrainChunk(r,o),A.add(r),ce(e,n),le.set(r,pe(e,n)),t=!0}t&&(window.__terrainChunkCount=A.size,k())}function ve(e,t){let n=se(e,t);if(!A.has(n))return;let r=e*16,i=t*16;D.setTerrainChunk(n,$t(r,i,r+16,i+16,1))}function ye(e,t,n,r){let i=Math.floor(n/16),a=Math.floor(r/16),o=(i-3)*16,s=(i+3+1)*16,c=(a-3)*16,l=(a+3+1)*16,u=e*64,d=t*64;return u>=o&&u+64<=s&&d>=c&&d+64<=l}let N=new Set,P=new Set,F=[],I=null,L=null;function R(e,t,n=!1){let r=Math.floor(e/64),i=Math.floor(t/64);if(!n&&r===I&&i===L)return;I=r,L=i;let a=!1;for(let n=-4;n<=4;n++)for(let o=-4;o<=4;o++){let s=r+o,c=i+n,l=`far:`+s+`,`+c;N.has(l)||P.has(l)||ye(s,c,e,t)||(P.add(l),F.push({cx:s,cz:c,rkey:l}),a=!0)}for(let n of Array.from(N)){let[a,o]=n.slice(4).split(`,`).map(Number),s=Math.max(Math.abs(a-r),Math.abs(o-i))>6,c=ye(a,o,e,t);(s||c)&&(D.removeTerrainChunk(n),N.delete(n))}for(let e of Array.from(P)){let[t,n]=e.slice(4).split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>6&&(P.delete(e),a=!0)}a&&(F=F.filter(e=>P.has(e.rkey)),F.sort((e,t)=>(e.cx-r)**2+(e.cz-i)**2-((t.cx-r)**2+(t.cz-i)**2))),window.__farChunkCount=N.size}function be(e){for(;F.length&&performance.now()<e;){let{cx:e,cz:t,rkey:n}=F.shift();if(!P.has(n))continue;P.delete(n);let r=e*64,i=t*64,a=$t(r,i,r+64,i+64,4,.35);D.setTerrainChunk(n,a),N.add(n)}window.__farChunkCount=N.size}let xe=pn(C,E,D.getShadowResources()),Ce=new Map;function z(e){let t=Ce.get(e);return t||(t=un(e).then(e=>fn(C,e)),Ce.set(e,t)),t}let we=new Set(Array.from(x,e=>p.get(e)));await Promise.allSettled(Array.from(we,e=>z(e)));let Te=new Map,Ee=0,B=0;for(let t of x){let n=d.x[t],r=d.y[t],i=Be(n,$(n,r)*13,r,0,m.get(t)??5),a=p.get(t);try{let e=await z(a);Te.set(t,xe.createInstance(e,i)),Ee++}catch(t){B++,e.push(`модель: ошибка на ${a} — ${t instanceof Error?t.message:String(t)}`)}}e.push(`модели: загружено ${Ee}/${x.length}${B?`, ошибок: `+B:``}`),Dn(e),window.__ecsFound=x.length,window.__foundPositions=()=>x.map(e=>({x:d.x[e],z:d.y[e],scale:m.get(e)??5}));let V=i?i.x:t.x,De=i?i.y:t.y,H={yaw:0,pitch:.55,dist:42,target:[V,$(V,De)*13+2,De]},U=sn(T,H);ge(H.target[0],H.target[2],!0),R(H.target[0],H.target[2],!0);let W=performance.now()+40;_e(W),be(W),e.push(`рельеф: чанков ${A.size} (16×16) + дальних ${N.size} (64×64, шаг 4), в очереди ещё ${M.length+F.length}`),Dn(e),window.__coverageCheck=(e,t)=>{for(let n of A){let[r,i]=n.split(`,`).map(Number),a=r*16,o=i*16;if(e>=a&&e<a+16&&t>=o&&t<o+16)return`near`}for(let n of N){let[r,i]=n.slice(4).split(`,`).map(Number),a=r*64,o=i*64;if(e>=a&&e<a+64&&t>=o&&t<o+64)return`far`}return null},Object.defineProperty(window,"cam",{value:{get tx(){return H.target[0]},set tx(e){H.target[0]=e,U.stopAuto()},get ty(){return H.target[1]},set ty(e){H.target[1]=e,U.stopAuto()},get tz(){return H.target[2]},set tz(e){H.target[2]=e,U.stopAuto()},get dist(){return H.dist},set dist(e){H.dist=e,U.stopAuto()},get pitch(){return H.pitch},set pitch(e){H.pitch=e,U.stopAuto()}}}),window.H=(e,t)=>$(e,t)*13,window.__camState=()=>({yaw:H.yaw,pitch:H.pitch,dist:H.dist,target:[...H.target]}),window.__isAutoOrbiting=()=>U.isAutoOrbiting();let ke=document.getElementById(`coordX`),Me=document.getElementById(`coordY`),Ne=document.getElementById(`coordGo`),Fe=!1;for(let e of[ke,Me])e.addEventListener(`input`,()=>{Fe=!0});function ze(){let e=parseFloat(ke.value),t=parseFloat(Me.value);!isFinite(e)||!isFinite(t)||(H.target[0]=Math.max(-At,Math.min(At,e)),H.target[2]=Math.max(-600,Math.min(600,t)),H.target[1]=$(H.target[0],H.target[2])*13+2,U.stopAuto(),Fe=!1)}Ne.addEventListener(`click`,ze);for(let e of[ke,Me])e.addEventListener(`keydown`,t=>{t.key===`Enter`&&(t.preventDefault(),ze(),e.blur())});let K=new Float32Array(16),Je=[0,0,0],q=document.getElementById(`selected`),J=[.95,.78,.35],Ye=[.42,.78,.46],Xe=[.82,.24,.26],Ze=null,Qe=null,$e=null,et=null;window.startFollowMarch=e=>{U.stopAuto(),et=e},U.onInteract(()=>{et=null});function tt(e){$e=null,Qe=e;let t=(h.get(e)??`?`)+` · `+(g.get(e)??`?`),n=d.x[e],r=d.y[e];Ze={x:n,y:$(n,r)*13+(m.get(e)??5)*.9+2,z:r,color:J},window.__markerActive=!0,window.__selectedLabel=t,q.textContent=t,q.style.display=`block`}function nt(){Qe=null,Ze=null,window.__markerActive=!1,window.__selectedLabel=null,q.style.display=`none`}function rt(e,t){let n=T.width/Math.max(1,T.height),r=Math.tan(at/2),i=e/T.width*2-1,a=1-t/T.height*2,o=G(Pe(Je,H.target)),s=G(Ie([0,1,0],o)),c=Ie(o,s),l=G([i*n*r*s[0]+a*r*c[0]-o[0],i*n*r*s[1]+a*r*c[1]-o[1],i*n*r*s[2]+a*r*c[2]-o[2]]);return{origin:Je,dir:l}}function it(e,t,n,r){let i=e[0]-n[0],a=e[1]-n[1],o=e[2]-n[2],s=i*t[0]+a*t[1]+o*t[2],c=i*i+a*a+o*o-r*r,l=s*s-c;if(l<0)return null;let u=Math.sqrt(l),d=-s-u;return d<0&&(d=-s+u),d<0?null:d}let at=.72;function ot(e,t){let n=0;for(let r=2;r<=400;r+=2){let i=e[0]+t[0]*r;if(e[1]+t[1]*r-$(i,e[2]+t[2]*r)*13<=0){let i=n,a=r;for(let n=0;n<12;n++){let n=(i+a)/2,r=e[0]+t[0]*n,o=e[2]+t[2]*n;e[1]+t[1]*n-$(r,o)*13>0?i=n:a=n}return{t:a,x:e[0]+t[0]*a,z:e[2]+t[2]*a}}n=r}return null}function st(e,t){try{let n=window.parent;n&&n!==window&&typeof n.renderCartoucheFor==`function`&&n.renderCartoucheFor(e,t)}catch{}}function ct(e){try{let t=window.parent;t&&t!==window&&typeof t.renderMarchCartoucheFor==`function`&&t.renderMarchCartoucheFor(e)}catch{}}function lt(e,t){let{origin:n,dir:r}=rt(e,t),i=T.height/(2*Math.tan(at/2)),a=null,o=1/0;for(let e of x){let t=d.x[e],s=d.y[e],c=m.get(e)??5,l=[t,$(t,s)*13+c*.5,s],u=Math.hypot(l[0]-n[0],l[1]-n[1],l[2]-n[2]),f=it(n,r,l,Math.max(c*1.15,46*u/i));f!==null&&f<o&&(o=f,a={kind:`entity`,eid:e,t:f})}for(let e of X){let t=[e.x,$(e.x,e.y)*13+2.2,e.y],s=Math.hypot(t[0]-n[0],t[1]-n[1],t[2]-n[2]),c=it(n,r,t,Math.max(3,40*s/i));c!==null&&c<o&&(o=c,a={kind:`march`,march:e,t:c})}let s=ot(n,r);return s!==null&&s.t<o&&(a={kind:`ground`,x:s.x,z:s.z,t:s.t},o=s.t),a}U.onTap((e,t)=>{let n=T.getBoundingClientRect(),r=lt((e-n.left)*(T.width/n.width),(t-n.top)*(T.height/n.height));if(r?.kind===`entity`){tt(r.eid);let e=v.get(r.eid);e&&st(e.x,e.y);return}if(r?.kind===`march`){nt(),$e=r.march.id,window.__selectedMarchId=r.march.id,ct(r.march.id);return}nt(),$e=null,r?.kind===`ground`&&st(Math.floor(r.x),Math.floor(r.z))});let Y=0;async function ut(){let e=bn(H.target[0],H.target[2],384);if(!e)return;let t=new Set,n=[],r=new Set;for(let i of e){t.add(i.key);let e=y.get(i.key);if(e!==void 0){if(h.set(e,i.nm),g.set(e,i.lv),_.set(e,!!i.own),Qe===e&&tt(e),p.get(e)!==i.model){p.set(e,i.model),m.set(e,i.scale);let t=d.x[e],r=d.y[e],a=Be(t,$(t,r)*13,r,0,i.scale);n.push(z(i.model).then(t=>void Te.set(e,xe.createInstance(t,a))).catch(()=>{}))}continue}let a=b(i),o=$(i.x,i.y)*13,s=Be(i.x,o,i.y,0,i.scale);n.push(z(i.model).then(e=>void Te.set(a,xe.createInstance(e,s))).catch(()=>{})),r.add(se(Math.floor(i.x/16),Math.floor(i.y/16))),ve(Math.floor(i.x/16),Math.floor(i.y/16))}for(let[e,n]of Array.from(y))t.has(e)||(r.add(se(Math.floor(d.x[n]/16),Math.floor(d.y[n]/16))),je(l,n),Te.delete(n),p.delete(n),m.delete(n),h.delete(n),g.delete(n),_.delete(n),v.delete(n),y.delete(e),Qe===n&&nt());await Promise.allSettled(n),x=Array.from(Se(l,[d,f]));let i=!1;for(let e of r){if(!A.has(e))continue;let[t,n]=e.split(`,`).map(Number);le.set(e,pe(t,n)),i=!0}i&&k(),Y++,window.__ecsFound=x.length,window.__syncCount=Y}s&&setInterval(()=>{oe()||ut().catch(e=>console.error(`live sync:`,e))},3e3);let X=[];function dt(){if(!s)return X=[],[];let e=wn();return e?(X=e,window.__marchPositions=e,e.map(e=>({x:e.x,y:$(e.x,e.y)*13+2.2,z:e.y,color:e.own?Ye:Xe}))):(X=[],[])}let ft=document.getElementById(`labels`),pt=new Map,mt=1024;function ht(){let e=new Set,t=T.clientWidth,n=T.clientHeight;for(let r of x){let i=d.x[r],a=d.y[r],o=i-H.target[0],s=a-H.target[2];if(o*o+s*s>mt)continue;let c=$(i,a)*13+(m.get(r)??5)*.6+1.1,l=Ve(K,[i,c,a]);if(l.w<=.001)continue;let u=(l.x/l.w*.5+.5)*t,f=(1-(l.y/l.w*.5+.5))*n;if(u<-40||u>t+40||f<-40||f>n+40)continue;e.add(r);let p=pt.get(r);if(!p){let e=document.createElement(`div`);e.className=`wlabel`;let t=document.createElement(`div`);t.className=`nm`;let n=document.createElement(`div`);n.className=`lv`,e.appendChild(t),e.appendChild(n),ft.appendChild(e),p={root:e,nm:t,lv:n},pt.set(r,p)}p.nm.textContent=h.get(r)??`?`,p.nm.classList.toggle(`mine`,!!_.get(r)),p.lv.textContent=g.get(r)??``,p.root.style.transform=`translate(${u.toFixed(1)}px,${f.toFixed(1)}px) translate(-50%,-100%)`}for(let[t,n]of pt)e.has(t)||(n.root.remove(),pt.delete(t))}let gt=new Map;function _t(e,t,n,r){if(!r||!n||r<=n)return t;let i=Math.max(0,Math.min(1,(Date.now()-n)/(r-n)));return e+(t-e)*i}function vt(){let e=new Set,t=T.clientWidth,n=T.clientHeight;for(let r of X){let i=r.battle;if(!i)continue;let a=r.x-H.target[0],o=r.y-H.target[2];if(a*a+o*o>mt)continue;let s=$(r.x,r.y)*13+2.2+1.6,c=Ve(K,[r.x,s,r.y]);if(c.w<=.001)continue;let l=(c.x/c.w*.5+.5)*t,u=(1-(c.y/c.w*.5+.5))*n;if(l<-60||l>t+60||u<-60||u>n+60)continue;e.add(r.id);let d=gt.get(r.id);if(!d){let e=document.createElement(`div`);e.className=`blabel`;let t=document.createElement(`div`);t.className=`btitle`;let n=document.createElement(`div`);n.className=`bbar atk`;let i=document.createElement(`i`);n.appendChild(i);let a=document.createElement(`div`);a.className=`bbar def`;let o=document.createElement(`i`);a.appendChild(o),e.appendChild(t),e.appendChild(n),e.appendChild(a),ft.appendChild(e),d={root:e,title:t,atkFill:i,defFill:o},gt.set(r.id,d)}let f=i.retreating,p=!f&&i.revealFromRound===0;d.root.className=`blabel`+(f?` retreat`:p?` deploy`:``),d.title.textContent=f?`Отступление`:p?`Развёртывание`:`Бой — раунд `+i.round;let m=Math.max(0,Math.min(100,_t(i.revealFromAttHp,i.attHpLeft,i.revealStart,i.revealAt)/Math.max(1,i.attStartHp)*100)),h=Math.max(0,Math.min(100,_t(i.revealFromDefHp,i.defHpLeft,i.revealStart,i.revealAt)/Math.max(1,i.defStartHp)*100));d.atkFill.style.width=m.toFixed(1)+`%`,d.defFill.style.width=h.toFixed(1)+`%`,d.root.style.transform=`translate(${l.toFixed(1)}px,${u.toFixed(1)}px) translate(-50%,-100%)`}for(let[t,n]of gt)e.has(t)||(n.root.remove(),gt.delete(t))}function yt(e){if(oe()){requestAnimationFrame(yt);return}U.isAutoOrbiting()&&(H.yaw=e*15e-5),U.update(e);let t=dt();if(et!==null){let e=X.find(e=>e.id===et);e?(H.target[0]=e.x,H.target[2]=e.y,H.target[1]=$(e.x,e.y)*13+1):et=null}Fe||(ke.value=H.target[0].toFixed(1),Me.value=H.target[2].toFixed(1)),ge(H.target[0],H.target[2]),R(H.target[0],H.target[2]);let i=performance.now()+6;_e(i),be(i);let a=[H.target[0]+Math.sin(H.yaw)*Math.cos(H.pitch)*H.dist,H.target[1]+Math.sin(H.pitch)*H.dist,H.target[2]+Math.cos(H.yaw)*Math.cos(H.pitch)*H.dist],o=$(a[0],a[2])*13+2;a[1]<o&&(a[1]=o);let s=T.width/Math.max(1,T.height),c=Le(Re(at,s,.5,300),He(a,H.target,[0,1,0]));K=c,Je=a,D.setVP(c),D.setFog(a,n,r,e/1e3),D.setSunTarget(H.target[0],H.target[2]);{let t=G(Pe(a,H.target)),n=G(Ie([0,1,0],t)),r=Ie(t,n);D.setSkyCamera(n,r,t,Math.tan(at/2),s,e/1e3)}if(xe.setFog(a,n,r),$e!==null){let e=X.find(e=>e.id===$e);e?Ze={x:e.x,y:$(e.x,e.y)*13+3.2,z:e.y,color:J}:($e=null,Ze=null)}Ze&&t.push(Ze),D.setMarkers(t),window.__marchCount=t.length-+!!Ze,D.frame({r:n[0],g:n[1],b:n[2],a:1},e=>{for(let t of x){let n=Te.get(t);n&&xe.draw(e,n,c)}}),ht(),vt(),requestAnimationFrame(yt)}requestAnimationFrame(yt),window.__engineReady=!0}kn().catch(e=>{On([`Ошибка: ${e instanceof Error?e.message:String(e)}`]),console.error(e)});