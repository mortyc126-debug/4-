(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=(e,t,n)=>Object.defineProperty(e,t,{value:n,enumerable:!1,writable:!0,configurable:!0}),t=(e,t)=>t&e.entityMask,n=(e,t)=>t>>>e.versionShift&(1<<e.versionBits)-1,r=(e,t)=>{let r=n(e,t)+1&(1<<e.versionBits)-1;return t&e.entityMask|r<<e.versionShift},i=e=>{let t=e?typeof e==`function`?e():e:{versioning:!1,versionBits:8},n=t.versionBits??8,r=t.versioning??!1,i=32-n,a=(1<<i)-1,o=i;return{aliveCount:0,dense:[],sparse:[],maxId:0,versioning:r,versionBits:n,entityMask:a,versionShift:o,versionMask:(1<<n)-1<<o}},a=e=>{if(e.aliveCount<e.dense.length){let t=e.dense[e.aliveCount],n=t;return e.sparse[n]=e.aliveCount,e.aliveCount++,t}let t=++e.maxId;return e.dense.push(t),e.sparse[t]=e.aliveCount,e.aliveCount++,t},o=(e,t)=>{let n=e.sparse[t];if(n===void 0||n>=e.aliveCount)return;let i=e.aliveCount-1,a=e.dense[i];if(e.sparse[a]=n,e.dense[n]=a,e.sparse[t]=i,e.dense[i]=t,e.versioning){let n=r(e,t);e.dense[i]=n}e.aliveCount--},s=(e,n)=>{let r=t(e,n),i=e.sparse[r];return i!==void 0&&i<e.aliveCount&&e.dense[i]===n},c=Symbol.for(`bitecs_internal`),l=(t,n)=>e(t||{},c,{entityIndex:n||i(),entityMasks:[[]],entityComponents:new Map,bitflag:1,componentMap:new Map,componentCount:0,queries:new Set,queriesHashMap:new Map,notQueries:new Set,dirtyQueries:new Set,entitiesWithRelations:new Set,hierarchyData:new Map,hierarchyActiveRelations:new Set,hierarchyQueryCache:new Map});function u(...e){let t,n;return e.forEach(e=>{typeof e==`object`&&`dense`in e&&`sparse`in e&&`aliveCount`in e?t=e:typeof e==`object`&&(n=e)}),l(n,t)}var d=()=>{let e=[],t=[],n=n=>e[t[n]]===n;return{add:r=>{n(r)||(t[r]=e.push(r)-1)},remove:r=>{if(!n(r))return;let i=t[r],a=e.pop();a!==r&&(e[i]=a,t[a]=i)},has:n,sparse:t,dense:e,reset:()=>{e.length=0,t.length=0},sort:n=>{e.sort(n);for(let n=0;n<e.length;n++)t[e[n]]=n}}},f=typeof SharedArrayBuffer<`u`?SharedArrayBuffer:ArrayBuffer,p=(e=1e3)=>{let t=[],n=0,r=new Uint32Array(new f(e*4)),i=e=>e<t.length&&t[e]<n&&r[t[e]]===e;return{add:e=>{if(!i(e)){if(n>=r.length){let e=new Uint32Array(new f(r.length*2*4));e.set(r),r=e}r[n]=e,t[e]=n,n++}},remove:e=>{if(!i(e))return;n--;let a=t[e],o=r[n];r[a]=o,t[o]=a},has:i,sparse:t,get dense(){return new Uint32Array(r.buffer,0,n)},reset:()=>{n=0,t.length=0},sort:e=>{let i=Array.from(r.subarray(0,n));i.sort(e);for(let e=0;e<i.length;e++)r[e]=i[e];for(let e=0;e<n;e++)t[r[e]]=e}}},m=()=>{let e=new Set;return{subscribe:t=>(e.add(t),()=>{e.delete(t)}),notify:(t,...n)=>Array.from(e).reduce((e,r)=>{let i=r(t,...n);return i&&typeof i==`object`?{...e,...i}:e},{})}},h=Symbol.for(`bitecs-relation`),g=Symbol.for(`bitecs-pairTarget`),_=Symbol.for(`bitecs-isPairComponent`),v=Symbol.for(`bitecs-relationData`),y=()=>{let t={pairsMap:new Map,initStore:void 0,exclusiveRelation:!1,autoRemoveSubject:!1,onTargetRemoved:void 0},n=r=>{if(r===void 0)throw Error(`Relation target is undefined`);let i=r===`*`?w:r;if(!t.pairsMap.has(i)){let a=t.initStore?t.initStore(r):{};e(a,h,n),e(a,g,i),e(a,_,!0),t.pairsMap.set(i,a)}return t.pairsMap.get(i)};return e(n,v,t),n},b=(e,t)=>{if(e===void 0)throw Error(`Relation is undefined`);return e(t)},x=(e,t,n)=>{let r=Ne(e,t),i=[];for(let e of r)e[h]===n&&e[g]!==w&&!ie(e[g])&&i.push(e[g]);return i},S=Symbol.for(`bitecs-wildcard`);function C(){let e=y();return Object.defineProperty(e,S,{value:!0,enumerable:!1,writable:!1,configurable:!1}),e}function ee(){let e=Symbol.for(`bitecs-global-wildcard`);return globalThis[e]||(globalThis[e]=C()),globalThis[e]}var w=ee();function te(){return y()}function ne(){let e=Symbol.for(`bitecs-global-isa`);return globalThis[e]||(globalThis[e]=te()),globalThis[e]}var re=ne();function ie(e){return e?Object.getOwnPropertySymbols(e).includes(v):!1}var T=64,E=4294967295,ae=1024;function oe(e,t){let{depths:n}=e;if(t<n.length)return n;let r=Math.max(t+1,n.length*2,n.length+ae),i=new Uint32Array(r);return i.fill(E),i.set(n),e.depths=i,i}function se(e,t,n,r){let{depthToEntities:i}=e;if(r!==void 0&&r!==E){let e=i.get(r);e&&(e.remove(t),e.dense.length===0&&i.delete(r))}n!==E&&(i.has(n)||i.set(n,p()),i.get(n).add(t))}function D(e,t){t>e.maxDepth&&(e.maxDepth=t)}function O(e,t,n,r){e.depths[t]=n,se(e,t,n,r),D(e,n)}function ce(e,t){e[c].hierarchyQueryCache.delete(t)}function k(e,t){let n=e[c];return n.hierarchyActiveRelations.has(t)||(n.hierarchyActiveRelations.add(t),ue(e,t),le(e,t)),n.hierarchyData.get(t)}function le(e,t){let n=xe(e,[b(t,w)]);for(let r of n)pe(e,t,r);let r=new Set;for(let i of n)for(let n of x(e,i,t))r.has(n)||(r.add(n),pe(e,t,n))}function ue(e,t){let n=e[c];if(!n.hierarchyData.has(t)){let e=Math.max(ae,n.entityIndex.dense.length*2),r=new Uint32Array(e);r.fill(E),n.hierarchyData.set(t,{depths:r,dirty:d(),depthToEntities:new Map,maxDepth:0})}}function de(e,t,n,r=new Set){if(r.has(n))return 0;r.add(n);let i=x(e,n,t);if(i.length===0)return 0;if(i.length===1)return fe(e,t,i[0],r)+1;let a=1/0;for(let n of i){let i=fe(e,t,n,r);if(i<a&&(a=i,a===0))break}return a===1/0?0:a+1}function fe(e,t,n,r){let i=e[c];ue(e,t);let a=i.hierarchyData.get(t),{depths:o}=a;if(o=oe(a,n),o[n]===E){let i=de(e,t,n,r);return O(a,n,i),i}return o[n]}function pe(e,t,n){return fe(e,t,n,new Set)}function A(e,t,n,r,i=d()){if(i.has(n))return;i.add(n);let a=xe(e,[t(n)]);for(let n of a)r.add(n),A(e,t,n,r,i)}function j(e,t,n,r,i=new Set){let a=e[c];if(!a.hierarchyActiveRelations.has(t))return;ue(e,t);let o=a.hierarchyData.get(t);if(i.has(n)){o.dirty.add(n);return}i.add(n);let{depths:s,dirty:l}=o,u=r===void 0?0:pe(e,t,r)+1;if(u>T)return;let f=s[n];O(o,n,u,f===E?void 0:f),f!==u&&(A(e,t,n,l,d()),ce(e,t))}function M(e,t,n){let r=e[c];if(!r.hierarchyActiveRelations.has(t))return;let i=r.hierarchyData.get(t),{depths:a}=i;a=oe(i,n),N(e,t,n,a,d()),ce(e,t)}function N(e,t,n,r,i){if(i.has(n))return;i.add(n);let a=e[c].hierarchyData.get(t);if(n<r.length){let e=r[n];e!==E&&(a.depths[n]=E,se(a,n,E,e))}let o=xe(e,[t(n)]);for(let n of o)N(e,t,n,r,i)}function me(e,t){let n=e[c].hierarchyData.get(t);if(!n)return;let{dirty:r,depths:i}=n;if(r.dense.length!==0){for(let a of r.dense)i[a]===E&&O(n,a,de(e,t,a));r.reset()}}function he(e,t,n,r={}){let i=e[c];k(e,t);let a=be(e,[t,...n]),o=i.hierarchyQueryCache.get(t);if(o&&o.hash===a)return o.result;me(e,t),z(e,n,r);let s=i.queriesHashMap.get(be(e,n)),{depths:l}=i.hierarchyData.get(t);s.sort((e,t)=>{let n=l[e],r=l[t];return n===r?e-t:n-r});let u=(r.buffered,s.dense);return i.hierarchyQueryCache.set(t,{hash:a,result:u}),u}function ge(e,t,n,r={}){let i=k(e,t);me(e,t);let a=i.depthToEntities.get(n);return a?(r.buffered,a.dense):r.buffered?new Uint32Array:[]}var P=Symbol.for(`bitecs-opType`),_e=Symbol.for(`bitecs-opTerms`),ve=Symbol.for(`bitecs-hierarchyType`),F=Symbol.for(`bitecs-hierarchyRel`),I=Symbol.for(`bitecs-hierarchyDepth`),L=Symbol.for(`bitecs-modifierType`),ye={[L]:`nested`},be=(e,t)=>{let n=e[c],r=t=>(n.componentMap.has(t)||Ee(e,t),n.componentMap.get(t).id),i=e=>P in e?`${e[P].toLowerCase()}(${e[_e].map(i).sort().join(`,`)})`:r(e).toString();return t.map(i).sort().join(`-`)},R=(e,t,n={})=>{let r=e[c],i=be(e,t),a=[],o=t=>{P in t?t[_e].forEach(o):(r.componentMap.has(t)||Ee(e,t),a.push(t))};t.forEach(o);let s=[],l=[],u=[],f=(t,n)=>{n.forEach(n=>{r.componentMap.has(n)||Ee(e,n),t.push(n)})};t.forEach(t=>{if(P in t){let{[P]:e,[_e]:n}=t;if(e===`Not`)f(l,n);else if(e===`Or`)f(u,n);else if(e===`And`)f(s,n);else throw Error(`Nested combinator ${e} not supported yet - use simple queries for best performance`)}else r.componentMap.has(t)||Ee(e,t),s.push(t)});let h=a.map(e=>r.componentMap.get(e)),g=[...new Set(h.map(e=>e.generationId))],_=(e,t)=>(e[t.generationId]=(e[t.generationId]||0)|t.bitflag,e),v=s.map(e=>r.componentMap.get(e)).reduce(_,{}),y=l.map(e=>r.componentMap.get(e)).reduce(_,{}),b=u.map(e=>r.componentMap.get(e)).reduce(_,{}),x=h.reduce(_,{}),S=Object.assign(n.buffered?p():d(),{allComponents:a,orComponents:u,notComponents:l,masks:v,notMasks:y,orMasks:b,hasMasks:x,generations:g,toRemove:d(),addObservable:m(),removeObservable:m(),queues:{}});r.queries.add(S),r.queriesHashMap.set(i,S),h.forEach(e=>{e.queries.add(S)}),l.length&&r.notQueries.add(S);let C=r.entityIndex;for(let t=0;t<C.aliveCount;t++){let n=C.dense[t];V(e,n,Ae)||B(e,S,n)&&Se(S,n)}return S};function z(e,t,n={}){let r=e[c],i=be(e,t),a=r.queriesHashMap.get(i);return a?n.buffered&&!(`buffer`in a.dense)&&(a=R(e,t,{buffered:!0})):a=R(e,t,n),n.buffered,a.dense}function xe(e,t,...n){let r=t.find(e=>e&&typeof e==`object`&&ve in e),i=t.filter(e=>!(e&&typeof e==`object`&&ve in e)),a=!1,o=!0,s=n.some(e=>e&&typeof e==`object`&&L in e);for(let e of n)if(s&&e&&typeof e==`object`&&L in e){let t=e;t[L]===`buffer`&&(a=!0),t[L]===`nested`&&(o=!1)}else if(!s){let t=e;t.buffered!==void 0&&(a=t.buffered),t.commit!==void 0&&(o=t.commit)}if(r){let{[F]:t,[I]:n}=r;return n===void 0?he(e,t,i,{buffered:a}):ge(e,t,n,{buffered:a})}return o&&we(e),z(e,i,{buffered:a})}function B(e,t,n){let r=e[c],{masks:i,notMasks:a,orMasks:o,generations:s}=t,l=Object.keys(o).length===0;for(let e=0;e<s.length;e++){let t=s[e],c=i[t],u=a[t],d=o[t],f=r.entityMasks[t][n];if(u&&f&u||c&&(f&c)!==c)return!1;d&&f&d&&(l=!0)}return l}var Se=(e,t)=>{if(e.toRemove.has(t)){e.toRemove.remove(t),e.addObservable.notify(t);return}e.has(t)||(e.add(t),e.addObservable.notify(t))},Ce=e=>{for(let t=0;t<e.toRemove.dense.length;t++){let n=e.toRemove.dense[t];e.remove(n)}e.toRemove.reset()},we=e=>{let t=e[c];t.dirtyQueries.size&&(t.dirtyQueries.forEach(Ce),t.dirtyQueries.clear())},Te=(e,t,n)=>{let r=e[c];!t.has(n)||t.toRemove.has(n)||(t.toRemove.add(n),r.dirtyQueries.add(t),t.removeObservable.notify(n))},Ee=(e,t)=>{if(!t)throw Error(`bitECS - Cannot register null or undefined component`);let n=e[c],r=new Set,i={id:n.componentCount++,generationId:n.entityMasks.length-1,bitflag:n.bitflag,ref:t,queries:r,setObservable:m(),getObservable:m()};return n.componentMap.set(t,i),n.bitflag*=2,n.bitflag>=2**31&&(n.bitflag=1,n.entityMasks.push([])),i},V=(e,t,n)=>{let r=e[c],i=r.componentMap.get(n);if(!i)return!1;let{generationId:a,bitflag:o}=i;return(r.entityMasks[a][t]&o)===o},De=(e,t,n)=>{let r=e[c].componentMap.get(n);if(r&&V(e,t,n))return r.getObservable.notify(t)},Oe=(e,t,n,r,i=new Set)=>{if(!i.has(r)){i.add(r),ke(t,n,re(r));for(let i of Ne(t,r))if(i!==Ae&&!V(t,n,i)){ke(t,n,i);let a=e.componentMap.get(i);if(a?.setObservable){let e=De(t,r,i);a.setObservable.notify(n,e)}}for(let a of x(t,r,re))Oe(e,t,n,a,i)}},ke=(e,t,n)=>{if(!Pe(e,t))throw Error(`Cannot add component - entity ${t} does not exist in the world.`);let r=e[c],i=`component`in n?n.component:n,a=`data`in n?n.data:void 0;r.componentMap.has(i)||Ee(e,i);let o=r.componentMap.get(i);if(V(e,t,i))return a!==void 0&&o.setObservable.notify(t,a),!1;let{generationId:s,bitflag:l,queries:u}=o;if(r.entityMasks[s][t]|=l,V(e,t,Ae)||u.forEach(n=>{B(e,n,t)?Se(n,t):Te(e,n,t)}),r.entityComponents.get(t).add(i),a!==void 0&&o.setObservable.notify(t,a),i[_]){let n=i[h],a=i[g];if(H(e,t,b(n,w),b(w,a)),typeof a==`number`&&(H(e,a,b(w,t),b(w,n)),r.entitiesWithRelations.add(a),r.entitiesWithRelations.add(t)),r.entitiesWithRelations.add(a),n[v].exclusiveRelation===!0&&a!==w){let r=x(e,t,n)[0];r!=null&&r!==a&&U(e,t,n(r))}if(n===re){let n=x(e,t,re);for(let i of n)Oe(r,e,t,i)}j(e,n,t,typeof a==`number`?a:void 0)}return!0};function H(e,t,...n){(Array.isArray(n[0])?n[0]:n).forEach(n=>{ke(e,t,n)})}var U=(e,t,...n)=>{let r=e[c];if(!Pe(e,t))throw Error(`Cannot remove component - entity ${t} does not exist in the world.`);n.forEach(n=>{if(!V(e,t,n))return;let{generationId:i,bitflag:a,queries:o}=r.componentMap.get(n);if(r.entityMasks[i][t]&=~a,o.forEach(n=>{n.toRemove.remove(t),B(e,n,t)?Se(n,t):Te(e,n,t)}),r.entityComponents.get(t).delete(n),n[_]){let r=n[g],i=n[h];M(e,i,t),U(e,t,b(w,r)),typeof r==`number`&&Pe(e,r)&&(U(e,r,b(w,t)),U(e,r,b(w,i))),x(e,t,i).length===0&&U(e,t,b(i,w))}})},Ae={};function je(e,...t){let n=e[c],r=a(n.entityIndex);return n.notQueries.forEach(t=>{B(e,t,r)&&Se(t,r)}),n.entityComponents.set(r,new Set),t.length>0&&H(e,r,t),r}var Me=(e,t)=>{let n=e[c];if(!s(n.entityIndex,t))return;let r=[t],i=new Set;for(;r.length>0;){let t=r.shift();if(i.has(t))continue;i.add(t);let a=[];if(n.entitiesWithRelations.has(t)){for(let i of xe(e,[w(t)],ye))if(Pe(e,i))for(let o of n.entityComponents.get(i)){if(!o[_])continue;let n=o[h][v];a.push(()=>U(e,i,b(w,t))),o[g]===t&&(a.push(()=>U(e,i,o)),n.autoRemoveSubject&&r.push(i),n.onTargetRemoved&&a.push(()=>n.onTargetRemoved(e,i,t)))}n.entitiesWithRelations.delete(t)}for(let e of a)e();for(let t of r)Me(e,t);for(let r of n.queries)Te(e,r,t);o(n.entityIndex,t),n.entityComponents.delete(t);for(let e=0;e<n.entityMasks.length;e++)n.entityMasks[e][t]=0}},Ne=(e,t)=>{let n=e[c];if(t===void 0)throw Error(`getEntityComponents: entity id is undefined.`);if(!s(n.entityIndex,t))throw Error(`getEntityComponents: entity ${t} does not exist in the world.`);return Array.from(n.entityComponents.get(t))},Pe=(e,t)=>s(e[c].entityIndex,t),Fe=(e,t)=>[e[0]-t[0],e[1]-t[1],e[2]-t[2]],Ie=(e,t)=>e[0]*t[0]+e[1]*t[1]+e[2]*t[2],Le=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],W=e=>{let t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]};function Re(e,t){let n=new Float32Array(16);for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=0;for(let n=0;n<4;n++)a+=e[n*4+i]*t[r*4+n];n[r*4+i]=a}return n}function ze(e,t,n,r){let i=1/Math.tan(e/2);return new Float32Array([i/t,0,0,0,0,i,0,0,0,0,(r+n)/(n-r),-1,0,0,2*r*n/(n-r),0])}function Be(e,t,n,r,i,a){return new Float32Array([2/(t-e),0,0,0,0,2/(r-n),0,0,0,0,1/(i-a),0,-(t+e)/(t-e),-(r+n)/(r-n),i/(i-a),1])}function Ve(e,t,n,r,i){let a=Math.cos(r),o=Math.sin(r);return new Float32Array([a*i,0,-o*i,0,0,i,0,0,o*i,0,a*i,0,e,t,n,1])}function He(e,t){let[n,r,i]=t;return{x:e[0]*n+e[4]*r+e[8]*i+e[12],y:e[1]*n+e[5]*r+e[9]*i+e[13],z:e[2]*n+e[6]*r+e[10]*i+e[14],w:e[3]*n+e[7]*r+e[11]*i+e[15]}}function Ue(e,t,n){let r=W(Fe(e,t)),i=W(Le(n,r)),a=Le(r,i);return new Float32Array([i[0],a[0],r[0],0,i[1],a[1],r[1],0,i[2],a[2],r[2],0,-Ie(i,e),-Ie(a,e),-Ie(r,e),1])}var We=[[.78,.9,.8],[.85,1,.88],[.72,.84,.76],[.9,1,.92],[.8,.94,.9],[.88,.98,.8]],Ge=[[.85,.95,.78],[.92,1,.85],[.8,.9,.76],[1,.94,.78],[.88,.82,.7],[.86,1,.9],[1,.92,.8]],Ke=[[1,1.15,.95],[1.05,1.15,1],[.92,1.05,.9],[1.15,1.15,1]],qe=[[.78,.9,.76],[.85,.98,.82],[.72,.86,.74],[.9,1,.88],[.8,.94,.86]],Je=[[.92,.9,.86],[1,.98,.92],[.84,.84,.82],[.96,.9,.82]];function G(e,t,n,r,i,a,o,s,c,l,u=[.5,.5],d=[.5,.5],f=[.5,.5]){let p=W(Le(Fe(o,a),Fe(s,a))),m=[[a,u],[o,d],[s,f]];for(let[a,o]of m)e.push(a[0],a[1],a[2]),t.push(p[0],p[1],p[2]),n.push(c),r.push(l),i.push(o[0],o[1])}function Ye(e,t,n,r,i,a,o,s,c,l,u,d){let f=l,p=l+c,m=[],h=[];for(let e=0;e<=a;e++){let t=e/a*Math.PI*2;m.push([Math.cos(t)*o,f,Math.sin(t)*o]),h.push([Math.cos(t)*s,p,Math.sin(t)*s])}for(let o=0;o<a;o++){let s=o/a,c=(o+1)/a;G(e,t,n,r,i,m[o],m[o+1],h[o+1],u,d,[s,0],[c,0],[c,1]),G(e,t,n,r,i,m[o],h[o+1],h[o],u,d,[s,0],[c,1],[s,1])}}function K(e,t,n,r,i,a,o,s,c,l,u,d=0){for(let f=0;f<a;f++){let p=f/a*Math.PI,m=Math.cos(p),h=Math.sin(p),g=[d-m*o,s,-h*o],_=[d+m*o,s,h*o],v=[d-m*o,c,-h*o],y=[d+m*o,c,h*o];G(e,t,n,r,i,g,_,y,l,u,[0,1],[1,1],[1,0]),G(e,t,n,r,i,g,y,v,l,u,[0,1],[1,0],[0,0])}}var q=()=>({positions:[],normals:[],materialIds:[],shades:[],uvs:[]}),J=e=>({positions:new Float32Array(e.positions),normals:new Float32Array(e.normals),materialIds:new Float32Array(e.materialIds),shades:new Float32Array(e.shades),uvs:new Float32Array(e.uvs),vertexCount:e.positions.length/3});function Xe(){let e=q();return Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.1,.06,.45,0,0,1),K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.85,.3,2.7,1,1),J(e)}function Ze(){let e=q();return Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.11,.07,.7,0,0,1),K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,1.15,.25,2.15,1,1),J(e)}function Qe(){let e=q();return Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.14,.09,.8,0,0,1),K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,1.3,.65,2.55,1,1),J(e)}function $e(){let e=q();return Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,6,.075,.045,.95,0,0,1),K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.95,.7,2.35,1,1),J(e)}function et(){let e=q();Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,6,.09,.035,1.4,0,0,.62);let t=(t,n,r,i)=>{let a=Math.cos(t)*Math.cos(n),o=Math.sin(t)*Math.cos(n),s=Math.sin(n),c=[0,r,0],l=[a*i,r+s*i,o*i],u=[-o,0,a],d=.03;G(e.positions,e.normals,e.materialIds,e.shades,e.uvs,[c[0]+u[0]*d,c[1],c[2]+u[2]*d],[c[0]-u[0]*d,c[1],c[2]-u[2]*d],l,0,.62);let f=[l[0]*.55,l[1]*.55+r*.45,l[2]*.55],p=[l[0]+a*i*.4-o*.15,l[1]+s*i*.4+.1,l[2]+o*i*.4+a*.15];G(e.positions,e.normals,e.materialIds,e.shades,e.uvs,[f[0]+u[0]*d*.6,f[1],f[2]+u[2]*d*.6],[f[0]-u[0]*d*.6,f[1],f[2]-u[2]*d*.6],p,0,.62)};return t(.4,.5,1.5,.6),t(2.2,.32,1.75,.5),t(3.8,.55,1.95,.46),t(5.1,.4,2.1,.4),t(1.6,.65,2.25,.34),J(e)}function tt(){let e=q();return K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.55,.02,.72,1,1),J(e)}function nt(){let e=q();return K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,2,.4,0,.62,1,1,-.14),K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,2,.32,0,.5,1,.92,.16),J(e)}function rt(e,t){return W([e[0]+t[0],e[1]+t[1],e[2]+t[2]])}function it(e,t){let n=Math.sin(e[0]*12.9898+e[1]*78.233+e[2]*37.719+t*91.7)*43758.5453;return n-Math.floor(n)}function at(e){return[.5+Math.atan2(e[2],e[0])/(2*Math.PI),.5-Math.asin(Math.max(-1,Math.min(1,e[1])))/Math.PI]}function ot(){let e=[1,0,0],t=[-1,0,0],n=[0,1,0],r=[0,-1,0],i=[0,0,1],a=[0,0,-1];return[[e,n,i],[i,n,t],[t,n,a],[a,n,e],[e,i,r],[i,t,r],[t,a,r],[a,e,r]]}function st(e){let t=[];for(let[n,r,i]of e){let e=rt(n,r),a=rt(r,i),o=rt(i,n);t.push([n,e,o],[e,r,a],[o,a,i],[e,a,o])}return t}function ct(e,t,n,r,i,a,o,s){let c=ot();for(let e=0;e<t;e++)c=st(c);let l=e=>{let t=a*(.8+it(e,s)*.45);return[n+e[0]*t,r+e[1]*t*o,i+e[2]*t]};for(let[t,n,r]of c){let i=.82+it(t,s+3)*.36;G(e.positions,e.normals,e.materialIds,e.shades,e.uvs,l(t),l(n),l(r),1,i,at(t),at(n),at(r))}}function lt(){let e=q(),t=.68,n=.5;ct(e,2,0,n*t,0,n,t,1);let r=.24;return ct(e,1,.48,r*t*.9,.1,r,t,2),ct(e,1,-.4,r*t*.8,-.34,r*.85,t,3),J(e)}async function Y(e,t,n=1024){let r=await(await fetch(t)).blob(),i=await createImageBitmap(r),a=Math.min(1,n/Math.max(i.width,i.height)),o=a<1?await createImageBitmap(i,{resizeWidth:Math.round(i.width*a),resizeHeight:Math.round(i.height*a),resizeQuality:`medium`}):i;a<1&&i.close();let s=e.createTexture({size:[o.width,o.height],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return e.queue.copyExternalImageToTexture({source:o},{texture:s},[o.width,o.height]),o.close(),s}var ut=(()=>{let[e,t,n]=[.62,.38,.3],r=Math.hypot(e,t,n);return[e/r,t/r,n/r]})(),dt=2048,ft=60,X=100,pt=1,mt=220,ht=`
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
  let texel = 1.0 / ${dt.toFixed(1)};
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
  let texel = 1.0 / ${dt.toFixed(1)};
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
`,xt=.5,St=1.4,Ct=new Float32Array([0,St,0,xt,0,0,0,0,xt,0,St,0,0,0,xt,-.5,0,0,0,St,0,-.5,0,0,0,0,-.5,0,St,0,0,0,-.5,xt,0,0]),wt=Ct.length/3,Tt=7;async function Et(e,t,n){let r=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),i=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),a=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),o=e.createTexture({size:[dt,dt],format:`depth32float`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}).createView(),s=e.createSampler({compare:`less`,magFilter:`linear`,minFilter:`linear`}),c=Be(-1,1,-1,1,.1,1);function l(t,n){let r=Ue([t+ut[0]*X,ut[1]*X,n+ut[2]*X],[t,0,n],[0,1,0]);c=Re(Be(-60,ft,-60,ft,pt,mt),r),e.queue.writeBuffer(a,0,c)}let[u,d,f,p,m,h,g,_,v,y,b]=await Promise.all([Y(e,`/textures/ground/sand.png`),Y(e,`/textures/ground/grass.png`),Y(e,`/textures/ground/dry_meadow.png`),Y(e,`/textures/ground/scree.png`),Y(e,`/textures/ground/rock.png`),Y(e,`/textures/ground/snow.png`),Y(e,`/textures/ground/forest_floor.png`),Y(e,`/textures/ground/desert.png`),Y(e,`/textures/ground/marsh.png`),Y(e,`/textures/ground/tundra_moss.png`),Y(e,`/textures/water/detail.png`)]),x=e.createSampler({addressModeU:`repeat`,addressModeV:`repeat`,magFilter:`linear`,minFilter:`linear`}),S=e.createShaderModule({code:ht}),C=e.createRenderPipeline({layout:`auto`,vertex:{module:S,entryPoint:`vs`,buffers:[{arrayStride:60,attributes:[{shaderLocation:0,offset:0,format:`float32x3`},{shaderLocation:1,offset:12,format:`float32x3`},{shaderLocation:2,offset:24,format:`float32x3`},{shaderLocation:3,offset:36,format:`float32x2`},{shaderLocation:4,offset:44,format:`float32`},{shaderLocation:5,offset:48,format:`float32`},{shaderLocation:6,offset:52,format:`float32`},{shaderLocation:7,offset:56,format:`float32`}]}]},fragment:{module:S,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),ee=e.createBindGroup({layout:C.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}},{binding:2,resource:x},{binding:3,resource:u.createView()},{binding:4,resource:d.createView()},{binding:5,resource:f.createView()},{binding:6,resource:p.createView()},{binding:7,resource:m.createView()},{binding:8,resource:{buffer:a}},{binding:9,resource:s},{binding:10,resource:o},{binding:11,resource:h.createView()},{binding:12,resource:g.createView()},{binding:13,resource:_.createView()},{binding:14,resource:v.createView()},{binding:15,resource:y.createView()},{binding:16,resource:b.createView()}]}),[w,te]=await Promise.all([Y(e,`/textures/sky/sky.png`),Y(e,`/textures/sky/clouds.png`)]),ne=e.createSampler({addressModeU:`repeat`,addressModeV:`clamp-to-edge`,magFilter:`linear`,minFilter:`linear`}),re=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),ie=e.createShaderModule({code:bt}),T=e.createRenderPipeline({layout:`auto`,vertex:{module:ie,entryPoint:`vs`},fragment:{module:ie,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`,cullMode:`none`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!1,depthCompare:`always`}}),E=e.createBindGroup({layout:T.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:re}},{binding:1,resource:ne},{binding:2,resource:w.createView()},{binding:3,resource:te.createView()}]});function ae(t,n,r,i,a,o){let s=new Float32Array([t[0],t[1],t[2],0,n[0],n[1],n[2],0,r[0],r[1],r[2],0,i,a,o,0]);e.queue.writeBuffer(re,0,s)}let oe=e.createShaderModule({code:vt}),se=e.createRenderPipeline({layout:`auto`,vertex:{module:oe,entryPoint:`vs`,buffers:[{arrayStride:60,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth32float`,depthWriteEnabled:!0,depthCompare:`less`}}),D=e.createBindGroup({layout:se.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}}]}),O=new Map;function ce(e){return e===`world-backdrop`?`backdrop`:e.startsWith(`far:`)?`far`:`near`}let k={near:{buf:null,scratch:null,capacityFloats:0,vertexCount:0,dirty:!1,lastRebuildMs:-1/0},far:{buf:null,scratch:null,capacityFloats:0,vertexCount:0,dirty:!1,lastRebuildMs:-1/0},backdrop:{buf:null,scratch:null,capacityFloats:0,vertexCount:0,dirty:!1,lastRebuildMs:-1/0}};function le(t,n){let r=k[t];if(r.buf&&n-r.lastRebuildMs<120)return;r.lastRebuildMs=n;let i=0;for(let[e,n]of O)ce(e)===t&&(i+=n.vertexCount);let a=i*15;if((!r.buf||r.capacityFloats<a)&&(r.buf?.destroy(),r.capacityFloats=Math.max(a,4),r.buf=e.createBuffer({size:r.capacityFloats*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),r.scratch=new Float32Array(r.capacityFloats)),i>0){let n=r.scratch,i=0;for(let[e,r]of O)ce(e)===t&&(n.set(r.data,i),i+=r.data.length);e.queue.writeBuffer(r.buf,0,n,0,a)}r.vertexCount=i,r.dirty=!1}let ue=e.createShaderModule({code:gt}),de=e.createBuffer({size:Ct.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(de,0,Ct);let fe=e.createRenderPipeline({layout:`auto`,vertex:{module:ue,entryPoint:`vs`,buffers:[{arrayStride:12,stepMode:`vertex`,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]},{arrayStride:28,stepMode:`instance`,attributes:[{shaderLocation:1,offset:0,format:`float32x3`},{shaderLocation:2,offset:12,format:`float32`},{shaderLocation:3,offset:16,format:`float32x3`}]}]},fragment:{module:ue,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),pe=e.createBindGroup({layout:fe.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}}]}),A=null,j=null,M=0,N=0,me=e.createShaderModule({code:_t});function he(t){let n=e.createBuffer({size:Math.max(t.vertexCount*10*4,4),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),r=new Float32Array(t.vertexCount*10);for(let e=0;e<t.vertexCount;e++)r.set(t.positions.subarray(e*3,e*3+3),e*10),r.set(t.normals.subarray(e*3,e*3+3),e*10+3),r[e*10+6]=t.materialIds[e],r[e*10+7]=t.shades[e],r.set(t.uvs.subarray(e*2,e*2+2),e*10+8);return e.queue.writeBuffer(n,0,r),n}let ge=await Promise.all(Object.entries({bark:`/textures/decor/bark.png`,birchBark:`/textures/decor/birch_bark.png`,conifer:`/textures/decor/conifer_a.png`,conifer2:`/textures/decor/conifer_b.png`,broadleaf:`/textures/decor/broadleaf.png`,autumn:`/textures/decor/autumn.png`,birchLeaf:`/textures/decor/birch_leaf.png`,bush:`/textures/decor/bush.png`,grassTuft:`/textures/decor/grass_tuft.png`}).map(async([t,n])=>[t,await Y(e,n)])),P={...Object.fromEntries(ge),rock:m},_e=e.createSampler({magFilter:`linear`,minFilter:`linear`}),ve={spruce:{trunk:`bark`,canopy:`conifer`},pine:{trunk:`bark`,canopy:`conifer2`},broadleaf:{trunk:`bark`,canopy:`broadleaf`},autumn:{trunk:`bark`,canopy:`autumn`},birch:{trunk:`birchBark`,canopy:`birchLeaf`},dead:{trunk:`bark`,canopy:`bark`},bush:{trunk:`bark`,canopy:`bush`},grass:{trunk:`bark`,canopy:`grassTuft`},rock:{trunk:`bark`,canopy:`rock`}},F={spruce:Xe,pine:Ze,broadleaf:Qe,autumn:Qe,birch:$e,dead:et,bush:tt,grass:nt,rock:lt},I=[{arrayStride:40,stepMode:`vertex`,attributes:[{shaderLocation:0,offset:0,format:`float32x3`},{shaderLocation:1,offset:12,format:`float32x3`},{shaderLocation:2,offset:24,format:`float32`},{shaderLocation:3,offset:28,format:`float32`},{shaderLocation:4,offset:32,format:`float32x2`}]},{arrayStride:40,stepMode:`instance`,attributes:[{shaderLocation:5,offset:0,format:`float32x3`},{shaderLocation:6,offset:12,format:`float32x3`},{shaderLocation:7,offset:24,format:`float32`},{shaderLocation:8,offset:28,format:`float32x3`}]}],L=e.createRenderPipeline({layout:`auto`,vertex:{module:me,entryPoint:`vs`,buffers:I},fragment:{module:me,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),ye=e.createShaderModule({code:yt}),be=e.createRenderPipeline({layout:`auto`,vertex:{module:ye,entryPoint:`vs`,buffers:I},fragment:{module:ye,entryPoint:`fs`,targets:[]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth32float`,depthWriteEnabled:!0,depthCompare:`less`}}),R=new Map;for(let t of Object.keys(ve)){let n=F[t](),c=ve[t],l=e.createBindGroup({layout:L.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}},{binding:2,resource:_e},{binding:3,resource:P[c.trunk].createView()},{binding:4,resource:P[c.canopy].createView()},{binding:5,resource:{buffer:a}},{binding:6,resource:s},{binding:7,resource:o}]}),u=e.createBindGroup({layout:be.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}},{binding:1,resource:_e},{binding:2,resource:P[c.canopy].createView()}]});R.set(t,{mesh:n,localBuf:he(n),instBuf:null,instCapacity:0,instanceCount:0,bindGroup:l,shadowBindGroup:u,scratch:null})}let z=null,xe=null;function B(){let n=t.canvas.width,r=t.canvas.height;z&&z.width===n&&z.height===r||(z?.destroy(),z=e.createTexture({size:[n,r],format:`depth24plus`,usage:GPUTextureUsage.RENDER_ATTACHMENT}),xe=z.createView())}function Se(e,t){let n=new Float32Array(t.vertexCount*15),r=1/0,i=-1/0,a=1/0,o=-1/0;for(let e=0;e<t.vertexCount;e++){let s=t.positions[e*3],c=t.positions[e*3+2];s<r&&(r=s),s>i&&(i=s),c<a&&(a=c),c>o&&(o=c),n.set(t.positions.subarray(e*3,e*3+3),e*15),n.set(t.colors.subarray(e*3,e*3+3),e*15+3),n.set(t.normals.subarray(e*3,e*3+3),e*15+6),n.set(t.uvs.subarray(e*2,e*2+2),e*15+9),n[e*15+11]=t.elevations[e],n[e*15+12]=t.waterFlags[e],n[e*15+13]=t.forestFracs[e],n[e*15+14]=t.moistureFracs[e]}O.set(e,{data:n,vertexCount:t.vertexCount,minX:r,maxX:i,minZ:a,maxZ:o}),k[ce(e)].dirty=!0}function Ce(e){O.has(e)&&(O.delete(e),k[ce(e)].dirty=!0)}function we(t){if(N=t.length,N>M&&(A?.destroy(),M=Math.max(N,8),A=e.createBuffer({size:M*Tt*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),j=new Float32Array(M*Tt)),N===0||!A)return;let n=j;t.forEach((e,t)=>{let r=t*Tt;n[r]=e.x,n[r+1]=e.y,n[r+2]=e.z,n[r+3]=1,n[r+4]=e.color[0],n[r+5]=e.color[1],n[r+6]=e.color[2]}),e.queue.writeBuffer(A,0,n,0,N*Tt)}function Te(t,n){let r=t.length;if(r>n.instCapacity&&(n.instBuf?.destroy(),n.instCapacity=Math.max(r,8),n.instBuf=e.createBuffer({size:n.instCapacity*10*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),n.scratch=new Float32Array(n.instCapacity*10)),n.instanceCount=r,r===0||!n.instBuf)return;let i=n.scratch;t.forEach((e,t)=>{let n=t*10;i[n]=e.x,i[n+1]=e.y,i[n+2]=e.z,i[n+3]=e.scale[0],i[n+4]=e.scale[1],i[n+5]=e.scale[2],i[n+6]=e.yaw,i[n+7]=e.color[0],i[n+8]=e.color[1],i[n+9]=e.color[2]}),e.queue.writeBuffer(n.instBuf,0,i,0,r*10)}function Ee(e){let t=new Map;for(let n of e){let e=t.get(n.kind);e||(e=[],t.set(n.kind,e)),e.push(n)}for(let[e,n]of R)Te(t.get(e)??[],n)}function V(t){e.queue.writeBuffer(r,0,t)}function De(t,n,r,a){let o=new Float32Array([t[0],t[1],t[2],a,n[0],n[1],n[2],r]);e.queue.writeBuffer(i,0,o)}function Oe(n,r){B();let i=performance.now();k.near.dirty&&le(`near`,i),k.far.dirty&&le(`far`,i),k.backdrop.dirty&&le(`backdrop`,i);let a=e.createCommandEncoder();{let e=a.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:o,depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}});k.near.vertexCount>0&&k.near.buf&&(e.setPipeline(se),e.setBindGroup(0,D),e.setVertexBuffer(0,k.near.buf),e.draw(k.near.vertexCount));let t=!1;for(let e of R.values())if(e.instanceCount>0){t=!0;break}if(t){e.setPipeline(be);for(let t of R.values())t.instanceCount===0||!t.instBuf||(e.setBindGroup(0,t.shadowBindGroup),e.setVertexBuffer(0,t.localBuf),e.setVertexBuffer(1,t.instBuf),e.draw(t.mesh.vertexCount,t.instanceCount))}e.end()}let s=t.getCurrentTexture().createView(),c=a.beginRenderPass({colorAttachments:[{view:s,clearValue:n,loadOp:`clear`,storeOp:`store`}],depthStencilAttachment:{view:xe,depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}});if(c.setPipeline(T),c.setBindGroup(0,E),c.draw(3),O.size>0){c.setPipeline(C),c.setBindGroup(0,ee);for(let e of[k.near,k.far,k.backdrop])e.vertexCount===0||!e.buf||(c.setVertexBuffer(0,e.buf),c.draw(e.vertexCount))}N>0&&A&&(c.setPipeline(fe),c.setBindGroup(0,pe),c.setVertexBuffer(0,de),c.setVertexBuffer(1,A),c.draw(wt,N));let l=!1;for(let e of R.values())if(e.instanceCount>0){l=!0;break}if(l){c.setPipeline(L);for(let e of R.values())e.instanceCount===0||!e.instBuf||(c.setBindGroup(0,e.bindGroup),c.setVertexBuffer(0,e.localBuf),c.setVertexBuffer(1,e.instBuf),c.draw(e.mesh.vertexCount,e.instanceCount))}r?.(c),c.end(),e.queue.submit([a.finish()])}function ke(){return{lightBuf:a,shadowView:o,shadowSampler:s}}return{setTerrainChunk:Se,removeTerrainChunk:Ce,setMarkers:we,setDecor:Ee,setVP:V,setFog:De,setSunTarget:l,setSkyCamera:ae,getShadowResources:ke,frame:Oe}}var Z=12345,Dt=.235,Ot=2400,kt=1200,At=Ot/2;kt/2;var jt=2.5;function Q(e,t,n){let r=e*374761393+t*668265263+n*1274126177;return r=Math.imul(r^r>>>13,1274126177),((r^r>>>16)>>>0)/4294967296}function Mt(e,t,n){let r=Math.floor(e),i=Math.floor(t),a=e-r,o=t-i,s=a*a*(3-2*a),c=o*o*(3-2*o),l=Q(r,i,n),u=Q(r+1,i,n),d=Q(r,i+1,n),f=Q(r+1,i+1,n);return(l*(1-s)+u*s)*(1-c)+(d*(1-s)+f*s)*c}var Nt=null,Pt=null,Ft=null;async function It(e,t){let n=await fetch(e);if(!n.ok)throw Error(`${e}: HTTP ${n.status}`);let r=await n.arrayBuffer();if(r.byteLength!==t)throw Error(`${e}: неверный размер (${r.byteLength} байт, ожидалось ${t})`);return r}async function Lt(){let e=Ot*kt,[t,n,r]=await Promise.all([It(`/heightmap/elevation-v6.bin`,e*2),It(`/heightmap/forest.bin`,e),It(`/heightmap/moisture.bin`,e)]);Nt=new Uint16Array(t),Pt=new Uint8Array(n),Ft=new Uint8Array(r)}function Rt(e,t,n,r){let i=Math.floor(t),a=Math.floor(n),o=Math.min(i+1,2399),s=Math.min(a+1,1199),c=t-i,l=n-a,u=a*Ot+i,d=a*Ot+o,f=s*Ot+i,p=s*Ot+o,m=e[u]+(e[d]-e[u])*c;return(m+(e[f]+(e[p]-e[f])*c-m)*l)*r}function zt(e,t){return[Math.max(0,Math.min(2399,e+At)),Math.max(0,Math.min(1199,t+600))]}function Bt(e,t){if(!Nt)return .285;let[n,r]=zt(e,t);return Rt(Nt,n,r,jt/65535)}function Vt(e,t){let n=Bt(e,t),r=(Bt(e+.7,t)+Bt(e-.7,t)+Bt(e,t+.7)+Bt(e,t-.7))*.25;return n*.55+r*.45}var Ht=32,Ut=new Map;function Wt(e,t){return Math.floor(e/Ht)+`,`+Math.floor(t/Ht)}function Gt(e,t,n){let r={x:e,z:t,targetH:Vt(e,t),radius:n},i=Wt(e,t),a=Ut.get(i);a?a.push(r):Ut.set(i,[r])}function $(e,t){let n=Bt(e,t);if(n<.235||Ut.size===0)return n;let r=Math.floor(e/Ht),i=Math.floor(t/Ht),a=null,o=0;for(let n=-1;n<=1;n++)for(let s=-1;s<=1;s++){let c=Ut.get(r+s+`,`+(i+n));if(c)for(let n of c){let r=Math.hypot(e-n.x,t-n.z);if(r>=n.radius)continue;let i=n.radius*.55,s=r<=i?1:1-((r-i)/(n.radius-i))**2*(3-2*((r-i)/(n.radius-i)));s>o&&(o=s,a=n)}}return a?n*(1-o)+a.targetH*o:n}function Kt(e,t){return $(e,t)<Dt}function qt(e,t){if(!Ft)return .5;let[n,r]=zt(e,t);return Rt(Ft,n,r,1/255)}function Jt(e,t){if(!Pt)return 0;let[n,r]=zt(e,t);return Rt(Pt,n,r,1/255)}var Yt=(e,t,n)=>[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n],Xt=[.14,.24,.28],Zt=[.05,.11,.19];function Qt(e){return Yt(Xt,Zt,Math.min(1,e))}var $t=[0,1,0],en=6;function tn(e,t){let n=.5,r=$(e-n,t)*13,i=$(e+n,t)*13,a=$(e,t-n)*13,o=$(e,t+n)*13;return W([-(i-r)/(2*n),1,-(o-a)/(2*n)])}var nn=6;function rn(e,t,n){let r=n/2,i=1/0;for(let a=0;a<=nn;a++){let o=-r+a/nn*n;for(let a=0;a<=nn;a++){let s=$(e+(-r+a/nn*n),t+o);s<i&&(i=s)}}return i}function an(e,t,n,r,i=1,a=0){let o=Math.round((n-e)/i),s=Math.round((r-t)/i),c=i===1,l=[],u=[],d=[],f=[],p=[],m=[],h=[],g=[];function _(e,t){let n=c?$(e,t):rn(e,t,i),r=n<Dt,o=r?[e,Dt*13-a,t]:[e,n*13-a,t],s=r?Qt((Dt-n)*3):[0,0,0],l=r?$t:c?tn(e,t):$t,u=r?0:Jt(e,t),d=r?0:qt(e,t);return{p:o,c:s,n:l,uv:[e/en,t/en],e:n,water:+!!r,forest:u,moisture:d}}let v=[];for(let n=0;n<=s;n++){let r=[];for(let a=0;a<=o;a++)r.push(_(e+a*i,t+n*i));v.push(r)}function y(e,t,n){let r=c?null:W(Le(Fe(t.p,e.p),Fe(n.p,e.p)));for(let i of[e,t,n]){l.push(i.p[0],i.p[1],i.p[2]),u.push(i.c[0],i.c[1],i.c[2]);let e=r??i.n;d.push(e[0],e[1],e[2]),f.push(i.uv[0],i.uv[1]),p.push(i.e),m.push(i.water),h.push(i.forest),g.push(i.moisture)}}for(let e=0;e<s;e++)for(let t=0;t<o;t++){let n=v[e][t],r=v[e][t+1],i=v[e+1][t],a=v[e+1][t+1];y(n,a,r),y(n,i,a)}return{positions:new Float32Array(l),colors:new Float32Array(u),normals:new Float32Array(d),uvs:new Float32Array(f),elevations:new Float32Array(p),waterFlags:new Float32Array(m),forestFracs:new Float32Array(h),moistureFracs:new Float32Array(g),vertexCount:l.length/3}}var on=9,sn=140,cn=10,ln=380,un={d:[1,0],arrowright:[1,0],a:[-1,0],arrowleft:[-1,0],w:[0,1],arrowup:[0,1],s:[0,-1],arrowdown:[0,-1]},dn=700;function fn(e,t){let n=!0,r=new Map,i=null,a=null,o=null,s=null,c=null;function l(){n=!1,c?.()}function u(){let e=[...r.values()];return{x:(e[0].x+e[1].x)/2,y:(e[0].y+e[1].y)/2,d:Math.hypot(e[0].x-e[1].x,e[0].y-e[1].y)}}function d(){let e=[...r.values()];return Math.atan2(e[1].y-e[0].y,e[1].x-e[0].x)}function f(e,n){let r=t.dist*.0022,i=e*r,a=n*r,o=Math.cos(t.yaw),s=Math.sin(t.yaw);t.target[0]=Math.max(-At,Math.min(At,t.target[0]-(i*o-a*s))),t.target[2]=Math.max(-600,Math.min(600,t.target[2]+(i*s+a*o))),t.target[1]=$(t.target[0],t.target[2])*13+1}e.addEventListener(`pointerdown`,n=>{n.preventDefault(),l(),r.set(n.pointerId,{x:n.clientX,y:n.clientY});try{e.setPointerCapture(n.pointerId)}catch{}if(r.size===1)i={x:n.clientX,y:n.clientY,tx:t.target[0],tz:t.target[2]},o={x:n.clientX,y:n.clientY,t:performance.now()};else if(r.size===2){i=null,o=null;let e=u();a={d:e.d,y:e.y,dist:t.dist,yaw:t.yaw,pitch:t.pitch,angle:d()}}}),e.addEventListener(`pointermove`,e=>{if(r.has(e.pointerId)){if(e.preventDefault(),r.set(e.pointerId,{x:e.clientX,y:e.clientY}),o&&Math.hypot(e.clientX-o.x,e.clientY-o.y)>cn&&(o=null),r.size>=2&&a){let e=u();t.dist=Math.max(on,Math.min(sn,a.dist*(a.d/Math.max(12,e.d)))),t.yaw=a.yaw+(d()-a.angle),t.pitch=Math.max(.08,Math.min(1.42,a.pitch+(e.y-a.y)*.005));return}i&&(t.target[0]=i.tx,t.target[2]=i.tz,f(e.clientX-i.x,i.y-e.clientY))}});function p(e){if(o&&r.size===1&&performance.now()-o.t<ln&&s?.(o.x,o.y),o=null,r.delete(e.pointerId),r.size<2&&(a=null),r.size===0)i=null;else if(r.size===1){let e=[...r.values()][0];i={x:e.x,y:e.y,tx:t.target[0],tz:t.target[2]}}}e.addEventListener(`pointerup`,p),e.addEventListener(`pointercancel`,p),e.addEventListener(`wheel`,e=>{e.preventDefault(),l(),t.dist=Math.max(on,Math.min(sn,t.dist*(e.deltaY<0?.9:1.11)))},{passive:!1});let m=new Set;window.addEventListener(`keydown`,e=>{let t=e.key.toLowerCase();t in un&&(m.add(t),l())}),window.addEventListener(`keyup`,e=>{m.delete(e.key.toLowerCase())});let h=null;function g(e){if(h===null){h=e;return}let t=Math.min(.1,(e-h)/1e3);if(h=e,m.size===0||i)return;let n=0,r=0;for(let e of m){let[t,i]=un[e];n+=t,r+=i}(n!==0||r!==0)&&f(n*dn*t,r*dn*t)}return{isAutoOrbiting:()=>n,stopAuto:l,update:g,onTap(e){s=e},onInteract(e){c=e}}}var pn={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},mn={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};async function hn(e){let t=await(await fetch(e)).arrayBuffer(),n=new DataView(t);if(n.getUint32(0,!0)!==1179937895)throw Error(`не glTF-контейнер: `+e);let r=n.getUint32(8,!0),i=12,a=null,o=null;for(;i<r;){let e=n.getUint32(i,!0),r=n.getUint32(i+4,!0),s=t.slice(i+8,i+8+e);r===1313821514?a=JSON.parse(new TextDecoder().decode(s)):r===5130562&&(o=s),i+=8+e}if(!a||!o)throw Error(`GLB без JSON/BIN чанка: `+e);let s=e=>a.accessors[e],c=e=>a.bufferViews[e];function l(e){let t=s(e),n=c(t.bufferView),r=pn[t.componentType],i=(n.byteOffset||0)+(t.byteOffset||0);return new r(o,i,t.count*mn[t.type])}let u=a.meshes[0].primitives[0],d=l(u.attributes.POSITION),f=l(u.attributes.NORMAL),p=l(u.attributes.TEXCOORD_0),m=l(u.indices),h=a.materials[u.material].pbrMetallicRoughness.baseColorTexture.index,g=a.images[a.textures[h].source],_=c(g.bufferView);return{positions:d,normals:f,uvs:p,indices:m,imageBytes:o.slice(_.byteOffset||0,(_.byteOffset||0)+_.byteLength),imageMimeType:g.mimeType}}var gn=`
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
  let texel = 1.0 / ${dt.toFixed(1)};
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
`;async function _n(e,t){let n=e.createBuffer({size:t.positions.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(n,0,t.positions);let r=e.createBuffer({size:t.normals.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(r,0,t.normals);let i=e.createBuffer({size:t.uvs.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(i,0,t.uvs);let a=t.indices.byteLength,o=Math.ceil(a/4)*4,s=e.createBuffer({size:o,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});if(o===a)e.queue.writeBuffer(s,0,t.indices);else{let n=new Uint8Array(o);n.set(new Uint8Array(t.indices.buffer,t.indices.byteOffset,a)),e.queue.writeBuffer(s,0,n)}let c=await createImageBitmap(new Blob([t.imageBytes],{type:t.imageMimeType})),l=Math.min(1,1024/Math.max(c.width,c.height)),u=l<1?await createImageBitmap(c,{resizeWidth:Math.round(c.width*l),resizeHeight:Math.round(c.height*l),resizeQuality:`medium`}):c;l<1&&c.close();let d=e.createTexture({size:[u.width,u.height],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return e.queue.copyExternalImageToTexture({source:u},{texture:d},[u.width,u.height]),u.close(),{vao:{posBuf:n,nrmBuf:r,uvBuf:i,idxBuf:s,indexFormat:t.indices instanceof Uint16Array?`uint16`:`uint32`,indexCount:t.indices.length},texture:d}}function vn(e,t,n){let r=e.createShaderModule({code:gn}),i=e.createRenderPipeline({layout:`auto`,vertex:{module:r,entryPoint:`vs`,buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]},{arrayStride:12,attributes:[{shaderLocation:1,offset:0,format:`float32x3`}]},{arrayStride:8,attributes:[{shaderLocation:2,offset:0,format:`float32x2`}]}]},fragment:{module:r,entryPoint:`fs`,targets:[{format:t}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),a=e.createSampler({magFilter:`linear`,minFilter:`linear`,mipmapFilter:`linear`}),o=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});function s(t,n,r){let i=new Float32Array([t[0],t[1],t[2],0,n[0],n[1],n[2],r]);e.queue.writeBuffer(o,0,i)}function c(t,r){let s=e.createBuffer({size:128,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});return e.queue.writeBuffer(s,64,r),{model:t,uniformBuf:s,bindGroup:e.createBindGroup({layout:i.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:s}},{binding:1,resource:a},{binding:2,resource:t.texture.createView()},{binding:3,resource:{buffer:o}},{binding:4,resource:{buffer:n.lightBuf}},{binding:5,resource:n.shadowSampler},{binding:6,resource:n.shadowView}]})}}function l(t,n,r){e.queue.writeBuffer(n.uniformBuf,0,r),t.setPipeline(i),t.setBindGroup(0,n.bindGroup),t.setVertexBuffer(0,n.model.vao.posBuf),t.setVertexBuffer(1,n.model.vao.nrmBuf),t.setVertexBuffer(2,n.model.vao.uvBuf),t.setIndexBuffer(n.model.vao.idxBuf,n.model.vao.indexFormat),t.drawIndexed(n.model.vao.indexCount)}return{createInstance:c,draw:l,setFog:s}}var yn={food:`farm`,wood:`sawmill`,stone:`quarry`,gold:`gold-mine`,amber:`amber-vein`},bn={food:`Пашня`,wood:`Лесопилка`,stone:`Каменоломня`,gold:`Рудник`,amber:`Янтарная жила`};function xn(e){return e>=25?5:e>=19?4:e>=13?3:e>=7?2:1}function Sn(){try{let e=window.parent;if(e&&e!==window){let t=e.mpWorldSnapshot;if(typeof t==`function`){let e=t();if(e)return e}if(e.W)return e.W}}catch{}return null}function Cn(){let e=Sn();return!e||!e.players[0]?null:{x:e.players[0].x,y:e.players[0].y}}var wn=16;function Tn(e,t,n){let r=Sn();if(!r)return null;let i=[],a=e!==void 0&&t!==void 0&&n!==void 0&&!!r.mapChunks,o=[];if(a){let i=Math.floor((e-n)/wn),a=Math.floor((e+n)/wn),s=Math.floor((t-n)/wn),c=Math.floor((t+n)/wn);for(let e=s;e<=c;e++)for(let t=i;t<=a;t++){let n=r.mapChunks[t+`,`+e];if(n)for(let e of n)o.push(e)}}else for(let e in r.map)o.push(e);let s=n===void 0?1/0:n*n;for(let n of o){let o=r.map[n];if(o){if(a){let n=o.x-e,r=o.y-t;if(n*n+r*r>s)continue}if(o.t===`city`){let e=r.players.find(e=>e.id===o.pid),t=e?e.race:`human`,a=e?Math.max(1,Math.min(5,xn(e.b.hall))):1,s=r.players[0]&&e&&e.id===r.players[0].id,c=e?e.nick??`?`:`?`,l=e?`Ратуша `+e.b.hall:``;i.push({key:n,x:o.x+.5,y:o.y+.5,gx:o.x,gy:o.y,kind:0,model:`/models/castles/${t}-${a}.glb`,scale:10,own:s,nm:c,lv:l})}else if(o.t===`camp`||o.t===`fort`){let e=(o.t===`fort`?`Форт`:`Лагерь`)+` варваров`,t=`ур. `+(o.lv??`?`);i.push({key:n,x:o.x+.5,y:o.y+.5,gx:o.x,gy:o.y,kind:1,model:`/models/camps/barbarians.glb`,scale:o.t===`fort`?6.5:5,nm:e,lv:t})}else if(o.t===`node`){let e=yn[o.res]||`farm`,t=bn[o.res]||`Точка`,r=`ур. `+(o.lv??`?`);i.push({key:n,x:o.x+.5,y:o.y+.5,gx:o.x,gy:o.y,kind:2,model:`/models/resources/${e}.glb`,scale:5,nm:t,lv:r})}}}return i}function En(e){let t=0;for(let n in e)for(let r in e[n])t+=e[n][+r]||0;return t}function Dn(){try{let e=window.parent;if(e&&e!==window){let t=e.mpWorldSnapshot;if(typeof t==`function`){let e=t();if(e)return e}if(e.W)return e.W}}catch{}return null}function On(e,t){let n=e.path,r=e.pathCum;if(!n||n.length<2)return n&&n[0]||{x:e.tx,y:e.ty};let i=t*(e.pathLen??0);for(let e=1;e<r.length;e++)if(r[e]>=i){let t=r[e]-r[e-1],a=t>0?(i-r[e-1])/t:0,o=n[e-1],s=n[e];return{x:o.x+(s.x-o.x)*a,y:o.y+(s.y-o.y)*a}}return n[n.length-1]}function kn(){let e=Dn();if(!e||!e.marches)return null;let t=e.players[0]?e.players[0].id:-1,n=[];for(let r of e.marches){let i=r.state===`gather`||r.state===`siege`?{x:r.tx,y:r.ty}:On(r,Math.max(0,Math.min(1,(e.t-r.t0)/Math.max(1,r.t1-r.t0)))),a=e.players.find(e=>e.id===r.pid),o=r.state===`siege`&&r.data&&r.data.battle?r.data.battle:null,s=o?{round:o.round??0,revealFromRound:o.revealFromRound??0,retreating:!!(o.retreatRequested||o.retreated),attHpLeft:o.attHpLeft??0,attStartHp:o.attStartHp??1,revealFromAttHp:o.revealFromAttHp??o.attHpLeft??0,defHpLeft:o.defHpLeft??0,defStartHp:o.defStartHp??1,revealFromDefHp:o.revealFromDefHp??o.defHpLeft??0,revealStart:o.revealStart??0,revealAt:o.revealAt??0}:null;n.push({x:i.x,y:i.y,own:r.pid===t,id:r.id,nick:a?.nick??a?.name??`?`,unitsTotal:En(r.units),state:r.state,tx:r.tx,ty:r.ty,t1:r.t1,battle:s})}return n}var An=document.getElementById(`status`),jn=(()=>{try{if(/[?&]debug=1\b/.test(location.search))return!0;if(window.parent&&window.parent!==window)return/[?&]debug=1\b/.test(window.parent.location.search)}catch{}return!1})();jn&&(An.style.display=`block`);function Mn(e){jn&&(An.textContent=e.join(`
`))}function Nn(e){An.style.display=`block`,An.textContent=e.join(`
`)}async function Pn(){let e=[];function t(t){Nn([...e,t]);try{window.parent&&window.parent!==window&&typeof window.parent.forceCityView==`function`&&window.parent.forceCityView()}catch{}}if(!(`gpu`in navigator)){t(`WebGPU: navigator.gpu отсутствует.`);return}await Lt(),e.push(`рельеф: настоящие данные высот загружены`);let n=document.getElementById(`hmVersion`);n&&(n.textContent=`h6`);let r={x:42,y:22},i=[.6,.52,.4],a=35e-5,o=Cn(),s=o??r,c=Tn(s.x,s.y,320),l=c!==null;window.parent!==window&&(An.style.display=`none`);let d=c??[{key:`demo-0`,x:43,y:14,gx:43,gy:14,kind:0,model:`/models/castles/human-1.glb`,scale:10,nm:`Замок`,lv:`демо`},{key:`demo-1`,x:50,y:20,gx:50,gy:20,kind:1,model:`/models/camps/barbarians.glb`,scale:5,nm:`Лагерь`,lv:`демо`},{key:`demo-2`,x:55,y:12,gx:55,gy:12,kind:2,model:`/models/resources/farm.glb`,scale:5,nm:`Пашня`,lv:`демо`},{key:`demo-3`,x:30,y:30,gx:30,gy:30,kind:2,model:`/models/resources/quarry.glb`,scale:5,nm:`Каменоломня`,lv:`демо`}];e.push(l?`данные: настоящая партия, сущностей — ${d.length}`:`данные: демо (window.parent.W недоступен)`);let f=u(),p={x:[],y:[]},m={value:[]},h=new Map,g=new Map,_=new Map,v=new Map,y=new Map,b=new Map,x=new Map;function S(e){let t=je(f);return ke(f,t,p),ke(f,t,m),p.x[t]=e.x,p.y[t]=e.y,m.value[t]=e.kind,h.set(t,e.model),g.set(t,e.scale),_.set(t,e.nm),v.set(t,e.lv),y.set(t,!!e.own),b.set(t,{x:e.gx,y:e.gy}),x.set(e.key,t),Gt(e.x,e.y,e.scale*1.4),t}for(let e of d)S(e);let C=Array.from(xe(f,[p,m]));e.push(`bitECS: сущностей — ${C.length}`);let ee=await navigator.gpu.requestAdapter();if(!ee){t(`WebGPU: адаптер не найден.`);return}let w=await ee.requestDevice();function te(e){let t=document.getElementById(`gpu-error-banner`);t||(t=document.createElement(`div`),t.id=`gpu-error-banner`,t.style.cssText=`position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#4a0f0f;color:#fff;font:11px/1.4 monospace;padding:6px 8px;max-height:40vh;overflow:auto;white-space:pre-wrap;`,document.body.appendChild(t)),t.textContent+=(t.textContent?`
---
`:``)+e}w.addEventListener(`uncapturederror`,e=>{let t=e.error.message;console.error(`WebGPU error:`,t),te(t)});let ne=`fb-gpu-reload-at`,re=Number(sessionStorage.getItem(ne)||0),ie=re&&Date.now()-re<6e4;w.lost.then(e=>{if(console.error(`WebGPU device lost:`,e.reason,e.message),e.reason!==`destroyed`){if(ie){te(`WebGPU-устройство теряется повторно (${e.reason}) — похоже, объёмная карта нестабильна на этом устройстве/браузере. Карта города ниже работает независимо от WebGPU.`);try{window.parent&&window.parent!==window&&typeof window.parent.forceCityView==`function`&&window.parent.forceCityView()}catch{}return}te(`WebGPU-устройство потеряно (${e.reason}): ${e.message}\nПерезагрузка через 2с...`),sessionStorage.setItem(ne,String(Date.now())),setTimeout(()=>location.reload(),2e3)}});let T=document.getElementById(`gpu`),E=T.getContext(`webgpu`);if(!E){t(`WebGPU: getContext('webgpu') вернул null.`);return}let ae=navigator.gpu.getPreferredCanvasFormat();function oe(){let e=T.clientWidth,t=T.clientHeight;if(e<=0||t<=0)return;let n=Math.min(2,window.devicePixelRatio||1),r=Math.max(1,Math.floor(e*n)),i=Math.max(1,Math.floor(t*n));T.width!==r&&(T.width=r),T.height!==i&&(T.height=i)}let se=()=>T.offsetParent===null&&T.clientWidth===0;oe(),new ResizeObserver(oe).observe(T),E.configure({device:w,format:ae,alphaMode:`opaque`}),e.push(`WebGPU: устройство получено, формат — ${ae}`);let D=await Et(w,E,ae);function O(e,t){return e+`,`+t}function ce(e,t){try{let n=window.parent;n&&n!==window&&typeof n.ensureWorldChunk==`function`&&n.ensureWorldChunk(e,t)}catch{}}let k=new Map;function le(e,t){return[e[0]*t,e[1]*t,e[2]*t]}function ue(e,t,n){if(Kt(e,t))return!0;for(let r=0;r<8;r++){let i=r/8*Math.PI*2;if(Kt(e+Math.cos(i)*n,t+Math.sin(i)*n))return!0}return!1}function de(e,t,n,r){for(let i of C){let a=p.x[i]-e,o=p.y[i]-t,s=(g.get(i)??5)*n+r;if(a*a+o*o<s*s)return!0}return!1}function fe(e,t){return e>1.36?t<.62?`spruce`:t<.94?`pine`:`dead`:t<.58?`broadleaf`:t<.8?`birch`:t<.94?`spruce`:`dead`}function pe(e,t){let n=[];for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=e*4+i,o=t*4+r;if(Q(a,o,13122)>=.65)continue;let s=.175+Q(a,o,Z+778)*.65,c=.175+Q(a,o,Z+779)*.65,l=e*16+i*4+s*4,u=t*16+r*4+c*4,d=l+(Mt(l/8.5,u/8.5,Z+790)*2-1)*2,f=u+(Mt(l/8.5,u/8.5,Z+791)*2-1)*2;if(ue(d,f,1.5)||de(d,f,.54,.68))continue;let p=Q(a,o,Z+781)*Math.PI*2,m=.85+Q(a,o,Z+782)*.3,h=$(d,f),g=h*13,_=.05+.85*Jt(d,f),v=Q(a,o,Z+780)<_,y=1+Q(a,o,Z+785)*1.3,b=.8+Q(a,o,Z+786)*.5;if(v){let e=fe(h,Q(a,o,Z+780));e===`broadleaf`&&Q(a,o,13132)<.35&&(e=`autumn`);let t=e===`spruce`||e===`pine`?We:Ge,r=t[Math.floor(Q(a,o,Z+784)*t.length)];n.push({x:d,y:g,z:f,scale:[b,y,b],yaw:p,color:le(r,m),kind:e})}else{let e=.1+.30000000000000004*Math.min(1,h/1.6);if(Q(a,o,13140)>=e)continue;let t=Je[Math.floor(Q(a,o,Z+784)*Je.length)],r=.6+Q(a,o,Z+785)*.9,i=.6+Q(a,o,Z+786)*.9;n.push({x:d,y:g,z:f,scale:[i,r,i],yaw:p,color:le(t,m),kind:`rock`})}}for(let r=0;r<8;r++)for(let i=0;i<8;i++){let a=e*8+i,o=t*8+r;if(Q(a,o,13232)>=.7)continue;let s=Q(a,o,Z+888),c=Q(a,o,Z+889),l=e*16+i*2+s*2,u=t*16+r*2+c*2;if(ue(l,u,.4)||de(l,u,.36,.17))continue;let d=$(l,u);if(d>2)continue;let f=d*13,p=Q(a,o,Z+890)*Math.PI*2,m=.8+Q(a,o,Z+891)*.4,h=Ke[Math.floor(Q(a,o,Z+892)*Ke.length)],g=.8+Q(a,o,Z+893)*.6;n.push({x:l,y:f,z:u,scale:[g,g,g],yaw:p,color:le(h,m),kind:`grass`})}let r=16/3;for(let i=0;i<r;i++)for(let a=0;a<r;a++){let o=e*r+a,s=t*r+i;if(Q(o,s,13342)>=.35)continue;let c=Q(o,s,Z+998),l=Q(o,s,Z+999),u=e*16+a*3+c*3,d=t*16+i*3+l*3;if(ue(u,d,.9)||de(u,d,.44,.34))continue;let f=$(u,d);if(f>2)continue;let p=f*13,m=Q(o,s,Z+1e3)*Math.PI*2,h=.85+Q(o,s,Z+1001)*.3,g=qe[Math.floor(Q(o,s,Z+1002)*qe.length)],_=.9+Q(o,s,Z+1003)*.7;n.push({x:u,y:p,z:d,scale:[_,_,_],yaw:m,color:le(g,h),kind:`bush`})}return n}function A(){let e=[];for(let t of k.values())e.push(...t);D.setDecor(e),window.__decorCount=e.length,window.__decorList=e}let j=new Set,M=new Set,N=[],me=null,he=null;function ge(e,t,n=!1){let r=Math.floor(e/16),i=Math.floor(t/16);if(!n&&r===me&&i===he)return;me=r,he=i;let a=!1;for(let e=-3;e<=3;e++)for(let t=-3;t<=3;t++){let n=r+t,o=i+e,s=O(n,o);j.has(s)||M.has(s)||(M.add(s),N.push({cx:n,cz:o,key:s}),a=!0)}let o=!1;for(let e of Array.from(j)){let[t,n]=e.split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>5&&(D.removeTerrainChunk(e),j.delete(e),k.delete(e),o=!0)}for(let e of Array.from(M)){let[t,n]=e.split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>5&&(M.delete(e),a=!0)}a&&(N=N.filter(e=>M.has(e.key)),N.sort((e,t)=>(e.cx-r)**2+(e.cz-i)**2-((t.cx-r)**2+(t.cz-i)**2))),window.__terrainChunkCount=j.size,o&&A()}function P(e){let t=!1;for(;N.length&&performance.now()<e;){let{cx:e,cz:n,key:r}=N.shift();if(!M.has(r))continue;M.delete(r);let i=e*16,a=n*16,o=an(i,a,i+16,a+16,1);D.setTerrainChunk(r,o),j.add(r),ce(e,n),k.set(r,pe(e,n)),t=!0}t&&(window.__terrainChunkCount=j.size,A())}function _e(e,t){let n=O(e,t);if(!j.has(n))return;let r=e*16,i=t*16;D.setTerrainChunk(n,an(r,i,r+16,i+16,1))}function ve(e,t,n,r){let i=Math.floor(n/16),a=Math.floor(r/16),o=(i-3)*16,s=(i+3+1)*16,c=(a-3)*16,l=(a+3+1)*16,u=e*64,d=t*64;return u>=o&&u+64<=s&&d>=c&&d+64<=l}let F=new Set,I=new Set,L=[],ye=null,be=null;function R(e,t,n=!1){let r=Math.floor(e/64),i=Math.floor(t/64);if(!n&&r===ye&&i===be)return;ye=r,be=i;let a=!1;for(let n=-3;n<=3;n++)for(let o=-3;o<=3;o++){let s=r+o,c=i+n,l=`far:`+s+`,`+c;F.has(l)||I.has(l)||ve(s,c,e,t)||(I.add(l),L.push({cx:s,cz:c,rkey:l}),a=!0)}for(let n of Array.from(F)){let[a,o]=n.slice(4).split(`,`).map(Number),s=Math.max(Math.abs(a-r),Math.abs(o-i))>5,c=ve(a,o,e,t);(s||c)&&(D.removeTerrainChunk(n),F.delete(n))}for(let e of Array.from(I)){let[t,n]=e.slice(4).split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>5&&(I.delete(e),a=!0)}a&&(L=L.filter(e=>I.has(e.rkey)),L.sort((e,t)=>(e.cx-r)**2+(e.cz-i)**2-((t.cx-r)**2+(t.cz-i)**2))),window.__farChunkCount=F.size}function z(e){for(;L.length&&performance.now()<e;){let{cx:e,cz:t,rkey:n}=L.shift();if(!I.has(n))continue;I.delete(n);let r=e*64,i=t*64,a=an(r,i,r+64,i+64,4,.35);D.setTerrainChunk(n,a),F.add(n)}window.__farChunkCount=F.size}let B=vn(w,ae,D.getShadowResources()),Se=new Map;function Ce(e){let t=Se.get(e);return t||(t=hn(e).then(e=>_n(w,e)),Se.set(e,t)),t}let we=new Set(Array.from(C,e=>h.get(e)));await Promise.allSettled(Array.from(we,e=>Ce(e)));let Te=new Map,Ee=0,V=0;for(let t of C){let n=p.x[t],r=p.y[t],i=Ve(n,$(n,r)*13,r,0,g.get(t)??5),a=h.get(t);try{let e=await Ce(a);Te.set(t,B.createInstance(e,i)),Ee++}catch(t){V++,e.push(`модель: ошибка на ${a} — ${t instanceof Error?t.message:String(t)}`)}}e.push(`модели: загружено ${Ee}/${C.length}${V?`, ошибок: `+V:``}`),Mn(e),window.__ecsFound=C.length,window.__foundPositions=()=>C.map(e=>({x:p.x[e],z:p.y[e],scale:g.get(e)??5}));let De=o?o.x:r.x,Oe=o?o.y:r.y,H={yaw:0,pitch:.55,dist:42,target:[De,$(De,Oe)*13+2,Oe]},U=fn(T,H);ge(H.target[0],H.target[2],!0),R(H.target[0],H.target[2],!0);let Ae=performance.now()+40;P(Ae),z(Ae);let Ne=an(-At,-600,At,600,12,1.2);D.setTerrainChunk(`world-backdrop`,Ne),e.push(`рельеф: чанков ${j.size} (16×16) + дальних ${F.size} (64×64, шаг 4) + задник (шаг 12, весь мир), в очереди ещё ${N.length+L.length}`),Mn(e),window.__coverageCheck=(e,t)=>{for(let n of j){let[r,i]=n.split(`,`).map(Number),a=r*16,o=i*16;if(e>=a&&e<a+16&&t>=o&&t<o+16)return`near`}for(let n of F){let[r,i]=n.slice(4).split(`,`).map(Number),a=r*64,o=i*64;if(e>=a&&e<a+64&&t>=o&&t<o+64)return`far`}return null},Object.defineProperty(window,"cam",{value:{get tx(){return H.target[0]},set tx(e){H.target[0]=e,U.stopAuto()},get ty(){return H.target[1]},set ty(e){H.target[1]=e,U.stopAuto()},get tz(){return H.target[2]},set tz(e){H.target[2]=e,U.stopAuto()},get dist(){return H.dist},set dist(e){H.dist=e,U.stopAuto()},get pitch(){return H.pitch},set pitch(e){H.pitch=e,U.stopAuto()}}}),window.H=(e,t)=>$(e,t)*13,window.__camState=()=>({yaw:H.yaw,pitch:H.pitch,dist:H.dist,target:[...H.target]}),window.__isAutoOrbiting=()=>U.isAutoOrbiting();let Pe=document.getElementById(`coordX`),Ie=document.getElementById(`coordY`),Be=document.getElementById(`coordGo`),G=!1;for(let e of[Pe,Ie])e.addEventListener(`input`,()=>{G=!0});function Ye(){let e=parseFloat(Pe.value),t=parseFloat(Ie.value);!isFinite(e)||!isFinite(t)||(H.target[0]=Math.max(-At,Math.min(At,e)),H.target[2]=Math.max(-600,Math.min(600,t)),H.target[1]=$(H.target[0],H.target[2])*13+2,U.stopAuto(),G=!1)}Be.addEventListener(`click`,Ye);for(let e of[Pe,Ie])e.addEventListener(`keydown`,t=>{t.key===`Enter`&&(t.preventDefault(),Ye(),e.blur())});let K=new Float32Array(16),q=[0,0,0],J=document.getElementById(`selected`),Xe=[.95,.78,.35],Ze=[.42,.78,.46],Qe=[.82,.24,.26],$e=null,et=null,tt=null,nt=null;window.startFollowMarch=e=>{U.stopAuto(),nt=e},U.onInteract(()=>{nt=null});function rt(e){tt=null,et=e;let t=(_.get(e)??`?`)+` · `+(v.get(e)??`?`),n=p.x[e],r=p.y[e];$e={x:n,y:$(n,r)*13+(g.get(e)??5)*.9+2,z:r,color:Xe},window.__markerActive=!0,window.__selectedLabel=t,J.textContent=t,J.style.display=`block`}function it(){et=null,$e=null,window.__markerActive=!1,window.__selectedLabel=null,J.style.display=`none`}function at(e,t){let n=T.width/Math.max(1,T.height),r=Math.tan(st/2),i=e/T.width*2-1,a=1-t/T.height*2,o=W(Fe(q,H.target)),s=W(Le([0,1,0],o)),c=Le(o,s),l=W([i*n*r*s[0]+a*r*c[0]-o[0],i*n*r*s[1]+a*r*c[1]-o[1],i*n*r*s[2]+a*r*c[2]-o[2]]);return{origin:q,dir:l}}function ot(e,t,n,r){let i=e[0]-n[0],a=e[1]-n[1],o=e[2]-n[2],s=i*t[0]+a*t[1]+o*t[2],c=i*i+a*a+o*o-r*r,l=s*s-c;if(l<0)return null;let u=Math.sqrt(l),d=-s-u;return d<0&&(d=-s+u),d<0?null:d}let st=.72;function ct(e,t){let n=0;for(let r=2;r<=400;r+=2){let i=e[0]+t[0]*r;if(e[1]+t[1]*r-$(i,e[2]+t[2]*r)*13<=0){let i=n,a=r;for(let n=0;n<12;n++){let n=(i+a)/2,r=e[0]+t[0]*n,o=e[2]+t[2]*n;e[1]+t[1]*n-$(r,o)*13>0?i=n:a=n}return{t:a,x:e[0]+t[0]*a,z:e[2]+t[2]*a}}n=r}return null}function lt(e,t){try{let n=window.parent;n&&n!==window&&typeof n.renderCartoucheFor==`function`&&n.renderCartoucheFor(e,t)}catch{}}function Y(e){try{let t=window.parent;t&&t!==window&&typeof t.renderMarchCartoucheFor==`function`&&t.renderMarchCartoucheFor(e)}catch{}}function ut(e,t){let{origin:n,dir:r}=at(e,t),i=null,a=1/0;for(let e of C){let t=p.x[e],o=p.y[e],s=g.get(e)??5,c=ot(n,r,[t,$(t,o)*13+s*.5,o],s);c!==null&&c<a&&(a=c,i={kind:`entity`,eid:e,t:c})}for(let e of X){let t=ot(n,r,[e.x,$(e.x,e.y)*13+2.2,e.y],3);t!==null&&t<a&&(a=t,i={kind:`march`,march:e,t})}let o=ct(n,r);return o!==null&&o.t<a&&(i={kind:`ground`,x:o.x,z:o.z,t:o.t},a=o.t),i}U.onTap((e,t)=>{let n=T.getBoundingClientRect(),r=ut((e-n.left)*(T.width/n.width),(t-n.top)*(T.height/n.height));if(r?.kind===`entity`){rt(r.eid);let e=b.get(r.eid);e&&lt(e.x,e.y);return}if(r?.kind===`march`){it(),tt=r.march.id,window.__selectedMarchId=r.march.id,Y(r.march.id);return}it(),tt=null,r?.kind===`ground`&&lt(Math.floor(r.x),Math.floor(r.z))});let dt=0;async function ft(){let e=Tn(H.target[0],H.target[2],320);if(!e)return;let t=new Set,n=[],r=new Set;for(let i of e){t.add(i.key);let e=x.get(i.key);if(e!==void 0){if(_.set(e,i.nm),v.set(e,i.lv),y.set(e,!!i.own),et===e&&rt(e),h.get(e)!==i.model){h.set(e,i.model),g.set(e,i.scale);let t=p.x[e],r=p.y[e],a=Ve(t,$(t,r)*13,r,0,i.scale);n.push(Ce(i.model).then(t=>void Te.set(e,B.createInstance(t,a))).catch(()=>{}))}continue}let a=S(i),o=$(i.x,i.y)*13,s=Ve(i.x,o,i.y,0,i.scale);n.push(Ce(i.model).then(e=>void Te.set(a,B.createInstance(e,s))).catch(()=>{})),r.add(O(Math.floor(i.x/16),Math.floor(i.y/16))),_e(Math.floor(i.x/16),Math.floor(i.y/16))}for(let[e,n]of Array.from(x))t.has(e)||(r.add(O(Math.floor(p.x[n]/16),Math.floor(p.y[n]/16))),Me(f,n),Te.delete(n),h.delete(n),g.delete(n),_.delete(n),v.delete(n),y.delete(n),b.delete(n),x.delete(e),et===n&&it());await Promise.allSettled(n),C=Array.from(xe(f,[p,m]));let i=!1;for(let e of r){if(!j.has(e))continue;let[t,n]=e.split(`,`).map(Number);k.set(e,pe(t,n)),i=!0}i&&A(),dt++,window.__ecsFound=C.length,window.__syncCount=dt}l&&setInterval(()=>{se()||ft().catch(e=>console.error(`live sync:`,e))},3e3);let X=[];function pt(){if(!l)return X=[],[];let e=kn();return e?(X=e,window.__marchPositions=e,e.map(e=>({x:e.x,y:$(e.x,e.y)*13+2.2,z:e.y,color:e.own?Ze:Qe}))):(X=[],[])}let mt=document.getElementById(`labels`),ht=new Map,gt=1024;function _t(){let e=new Set,t=T.clientWidth,n=T.clientHeight;for(let r of C){let i=p.x[r],a=p.y[r],o=i-H.target[0],s=a-H.target[2];if(o*o+s*s>gt)continue;let c=$(i,a)*13+(g.get(r)??5)*.6+1.1,l=He(K,[i,c,a]);if(l.w<=.001)continue;let u=(l.x/l.w*.5+.5)*t,d=(1-(l.y/l.w*.5+.5))*n;if(u<-40||u>t+40||d<-40||d>n+40)continue;e.add(r);let f=ht.get(r);if(!f){let e=document.createElement(`div`);e.className=`wlabel`;let t=document.createElement(`div`);t.className=`nm`;let n=document.createElement(`div`);n.className=`lv`,e.appendChild(t),e.appendChild(n),mt.appendChild(e),f={root:e,nm:t,lv:n},ht.set(r,f)}f.nm.textContent=_.get(r)??`?`,f.nm.classList.toggle(`mine`,!!y.get(r)),f.lv.textContent=v.get(r)??``,f.root.style.transform=`translate(${u.toFixed(1)}px,${d.toFixed(1)}px) translate(-50%,-100%)`}for(let[t,n]of ht)e.has(t)||(n.root.remove(),ht.delete(t))}let vt=new Map;function yt(e,t,n,r){if(!r||!n||r<=n)return t;let i=Math.max(0,Math.min(1,(Date.now()-n)/(r-n)));return e+(t-e)*i}function bt(){let e=new Set,t=T.clientWidth,n=T.clientHeight;for(let r of X){let i=r.battle;if(!i)continue;let a=r.x-H.target[0],o=r.y-H.target[2];if(a*a+o*o>gt)continue;let s=$(r.x,r.y)*13+2.2+1.6,c=He(K,[r.x,s,r.y]);if(c.w<=.001)continue;let l=(c.x/c.w*.5+.5)*t,u=(1-(c.y/c.w*.5+.5))*n;if(l<-60||l>t+60||u<-60||u>n+60)continue;e.add(r.id);let d=vt.get(r.id);if(!d){let e=document.createElement(`div`);e.className=`blabel`;let t=document.createElement(`div`);t.className=`btitle`;let n=document.createElement(`div`);n.className=`bbar atk`;let i=document.createElement(`i`);n.appendChild(i);let a=document.createElement(`div`);a.className=`bbar def`;let o=document.createElement(`i`);a.appendChild(o),e.appendChild(t),e.appendChild(n),e.appendChild(a),mt.appendChild(e),d={root:e,title:t,atkFill:i,defFill:o},vt.set(r.id,d)}let f=i.retreating,p=!f&&i.revealFromRound===0;d.root.className=`blabel`+(f?` retreat`:p?` deploy`:``),d.title.textContent=f?`Отступление`:p?`Развёртывание`:`Бой — раунд `+i.round;let m=Math.max(0,Math.min(100,yt(i.revealFromAttHp,i.attHpLeft,i.revealStart,i.revealAt)/Math.max(1,i.attStartHp)*100)),h=Math.max(0,Math.min(100,yt(i.revealFromDefHp,i.defHpLeft,i.revealStart,i.revealAt)/Math.max(1,i.defStartHp)*100));d.atkFill.style.width=m.toFixed(1)+`%`,d.defFill.style.width=h.toFixed(1)+`%`,d.root.style.transform=`translate(${l.toFixed(1)}px,${u.toFixed(1)}px) translate(-50%,-100%)`}for(let[t,n]of vt)e.has(t)||(n.root.remove(),vt.delete(t))}function xt(e){if(se()){requestAnimationFrame(xt);return}U.isAutoOrbiting()&&(H.yaw=e*15e-5),U.update(e);let t=pt();if(nt!==null){let e=X.find(e=>e.id===nt);e?(H.target[0]=e.x,H.target[2]=e.y,H.target[1]=$(e.x,e.y)*13+1):nt=null}G||(Pe.value=H.target[0].toFixed(1),Ie.value=H.target[2].toFixed(1)),ge(H.target[0],H.target[2]),R(H.target[0],H.target[2]);let n=performance.now()+6;P(n),z(n);let r=[H.target[0]+Math.sin(H.yaw)*Math.cos(H.pitch)*H.dist,H.target[1]+Math.sin(H.pitch)*H.dist,H.target[2]+Math.cos(H.yaw)*Math.cos(H.pitch)*H.dist],o=$(r[0],r[2])*13+2;r[1]<o&&(r[1]=o);let s=T.width/Math.max(1,T.height),c=Re(ze(st,s,.5,300),Ue(r,H.target,[0,1,0]));K=c,q=r,D.setVP(c),D.setFog(r,i,a,e/1e3),D.setSunTarget(H.target[0],H.target[2]);{let t=W(Fe(r,H.target)),n=W(Le([0,1,0],t)),i=Le(t,n);D.setSkyCamera(n,i,t,Math.tan(st/2),s,e/1e3)}if(B.setFog(r,i,a),tt!==null){let e=X.find(e=>e.id===tt);e?$e={x:e.x,y:$(e.x,e.y)*13+3.2,z:e.y,color:Xe}:(tt=null,$e=null)}$e&&t.push($e),D.setMarkers(t),window.__marchCount=t.length-+!!$e,D.frame({r:i[0],g:i[1],b:i[2],a:1},e=>{for(let t of C){let n=Te.get(t);n&&B.draw(e,n,c)}}),_t(),bt(),requestAnimationFrame(xt)}requestAnimationFrame(xt),window.__engineReady=!0}Pn().catch(e=>{Nn([`Ошибка: ${e instanceof Error?e.message:String(e)}`]),console.error(e)});