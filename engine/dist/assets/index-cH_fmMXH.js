(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=(e,t,n)=>Object.defineProperty(e,t,{value:n,enumerable:!1,writable:!0,configurable:!0}),t=(e,t)=>t&e.entityMask,n=(e,t)=>t>>>e.versionShift&(1<<e.versionBits)-1,r=(e,t)=>{let r=n(e,t)+1&(1<<e.versionBits)-1;return t&e.entityMask|r<<e.versionShift},i=e=>{let t=e?typeof e==`function`?e():e:{versioning:!1,versionBits:8},n=t.versionBits??8,r=t.versioning??!1,i=32-n,a=(1<<i)-1,o=i;return{aliveCount:0,dense:[],sparse:[],maxId:0,versioning:r,versionBits:n,entityMask:a,versionShift:o,versionMask:(1<<n)-1<<o}},a=e=>{if(e.aliveCount<e.dense.length){let t=e.dense[e.aliveCount],n=t;return e.sparse[n]=e.aliveCount,e.aliveCount++,t}let t=++e.maxId;return e.dense.push(t),e.sparse[t]=e.aliveCount,e.aliveCount++,t},o=(e,t)=>{let n=e.sparse[t];if(n===void 0||n>=e.aliveCount)return;let i=e.aliveCount-1,a=e.dense[i];if(e.sparse[a]=n,e.dense[n]=a,e.sparse[t]=i,e.dense[i]=t,e.versioning){let n=r(e,t);e.dense[i]=n}e.aliveCount--},s=(e,n)=>{let r=t(e,n),i=e.sparse[r];return i!==void 0&&i<e.aliveCount&&e.dense[i]===n},c=Symbol.for(`bitecs_internal`),l=(t,n)=>e(t||{},c,{entityIndex:n||i(),entityMasks:[[]],entityComponents:new Map,bitflag:1,componentMap:new Map,componentCount:0,queries:new Set,queriesHashMap:new Map,notQueries:new Set,dirtyQueries:new Set,entitiesWithRelations:new Set,hierarchyData:new Map,hierarchyActiveRelations:new Set,hierarchyQueryCache:new Map});function u(...e){let t,n;return e.forEach(e=>{typeof e==`object`&&`dense`in e&&`sparse`in e&&`aliveCount`in e?t=e:typeof e==`object`&&(n=e)}),l(n,t)}var d=()=>{let e=[],t=[],n=n=>e[t[n]]===n;return{add:r=>{n(r)||(t[r]=e.push(r)-1)},remove:r=>{if(!n(r))return;let i=t[r],a=e.pop();a!==r&&(e[i]=a,t[a]=i)},has:n,sparse:t,dense:e,reset:()=>{e.length=0,t.length=0},sort:n=>{e.sort(n);for(let n=0;n<e.length;n++)t[e[n]]=n}}},f=typeof SharedArrayBuffer<`u`?SharedArrayBuffer:ArrayBuffer,p=(e=1e3)=>{let t=[],n=0,r=new Uint32Array(new f(e*4)),i=e=>e<t.length&&t[e]<n&&r[t[e]]===e;return{add:e=>{if(!i(e)){if(n>=r.length){let e=new Uint32Array(new f(r.length*2*4));e.set(r),r=e}r[n]=e,t[e]=n,n++}},remove:e=>{if(!i(e))return;n--;let a=t[e],o=r[n];r[a]=o,t[o]=a},has:i,sparse:t,get dense(){return new Uint32Array(r.buffer,0,n)},reset:()=>{n=0,t.length=0},sort:e=>{let i=Array.from(r.subarray(0,n));i.sort(e);for(let e=0;e<i.length;e++)r[e]=i[e];for(let e=0;e<n;e++)t[r[e]]=e}}},m=()=>{let e=new Set;return{subscribe:t=>(e.add(t),()=>{e.delete(t)}),notify:(t,...n)=>Array.from(e).reduce((e,r)=>{let i=r(t,...n);return i&&typeof i==`object`?{...e,...i}:e},{})}},h=Symbol.for(`bitecs-relation`),g=Symbol.for(`bitecs-pairTarget`),_=Symbol.for(`bitecs-isPairComponent`),v=Symbol.for(`bitecs-relationData`),y=()=>{let t={pairsMap:new Map,initStore:void 0,exclusiveRelation:!1,autoRemoveSubject:!1,onTargetRemoved:void 0},n=r=>{if(r===void 0)throw Error(`Relation target is undefined`);let i=r===`*`?C:r;if(!t.pairsMap.has(i)){let a=t.initStore?t.initStore(r):{};e(a,h,n),e(a,g,i),e(a,_,!0),t.pairsMap.set(i,a)}return t.pairsMap.get(i)};return e(n,v,t),n},b=(e,t)=>{if(e===void 0)throw Error(`Relation is undefined`);return e(t)},x=(e,t,n)=>{let r=Ne(e,t),i=[];for(let e of r)e[h]===n&&e[g]!==C&&!w(e[g])&&i.push(e[g]);return i},S=Symbol.for(`bitecs-wildcard`);function ee(){let e=y();return Object.defineProperty(e,S,{value:!0,enumerable:!1,writable:!1,configurable:!1}),e}function te(){let e=Symbol.for(`bitecs-global-wildcard`);return globalThis[e]||(globalThis[e]=ee()),globalThis[e]}var C=te();function ne(){return y()}function re(){let e=Symbol.for(`bitecs-global-isa`);return globalThis[e]||(globalThis[e]=ne()),globalThis[e]}var ie=re();function w(e){return e?Object.getOwnPropertySymbols(e).includes(v):!1}var ae=64,T=4294967295,oe=1024;function se(e,t){let{depths:n}=e;if(t<n.length)return n;let r=Math.max(t+1,n.length*2,n.length+oe),i=new Uint32Array(r);return i.fill(T),i.set(n),e.depths=i,i}function E(e,t,n,r){let{depthToEntities:i}=e;if(r!==void 0&&r!==T){let e=i.get(r);e&&(e.remove(t),e.dense.length===0&&i.delete(r))}n!==T&&(i.has(n)||i.set(n,p()),i.get(n).add(t))}function ce(e,t){t>e.maxDepth&&(e.maxDepth=t)}function le(e,t,n,r){e.depths[t]=n,E(e,t,n,r),ce(e,n)}function ue(e,t){e[c].hierarchyQueryCache.delete(t)}function D(e,t){let n=e[c];return n.hierarchyActiveRelations.has(t)||(n.hierarchyActiveRelations.add(t),fe(e,t),de(e,t)),n.hierarchyData.get(t)}function de(e,t){let n=Ce(e,[b(t,C)]);for(let r of n)O(e,t,r);let r=new Set;for(let i of n)for(let n of x(e,i,t))r.has(n)||(r.add(n),O(e,t,n))}function fe(e,t){let n=e[c];if(!n.hierarchyData.has(t)){let e=Math.max(oe,n.entityIndex.dense.length*2),r=new Uint32Array(e);r.fill(T),n.hierarchyData.set(t,{depths:r,dirty:d(),depthToEntities:new Map,maxDepth:0})}}function pe(e,t,n,r=new Set){if(r.has(n))return 0;r.add(n);let i=x(e,n,t);if(i.length===0)return 0;if(i.length===1)return me(e,t,i[0],r)+1;let a=1/0;for(let n of i){let i=me(e,t,n,r);if(i<a&&(a=i,a===0))break}return a===1/0?0:a+1}function me(e,t,n,r){let i=e[c];fe(e,t);let a=i.hierarchyData.get(t),{depths:o}=a;if(o=se(a,n),o[n]===T){let i=pe(e,t,n,r);return le(a,n,i),i}return o[n]}function O(e,t,n){return me(e,t,n,new Set)}function k(e,t,n,r,i=d()){if(i.has(n))return;i.add(n);let a=Ce(e,[t(n)]);for(let n of a)r.add(n),k(e,t,n,r,i)}function A(e,t,n,r,i=new Set){let a=e[c];if(!a.hierarchyActiveRelations.has(t))return;fe(e,t);let o=a.hierarchyData.get(t);if(i.has(n)){o.dirty.add(n);return}i.add(n);let{depths:s,dirty:l}=o,u=r===void 0?0:O(e,t,r)+1;if(u>ae)return;let f=s[n];le(o,n,u,f===T?void 0:f),f!==u&&(k(e,t,n,l,d()),ue(e,t))}function j(e,t,n){let r=e[c];if(!r.hierarchyActiveRelations.has(t))return;let i=r.hierarchyData.get(t),{depths:a}=i;a=se(i,n),he(e,t,n,a,d()),ue(e,t)}function he(e,t,n,r,i){if(i.has(n))return;i.add(n);let a=e[c].hierarchyData.get(t);if(n<r.length){let e=r[n];e!==T&&(a.depths[n]=T,E(a,n,T,e))}let o=Ce(e,[t(n)]);for(let n of o)he(e,t,n,r,i)}function ge(e,t){let n=e[c].hierarchyData.get(t);if(!n)return;let{dirty:r,depths:i}=n;if(r.dense.length!==0){for(let a of r.dense)i[a]===T&&le(n,a,pe(e,t,a));r.reset()}}function _e(e,t,n,r={}){let i=e[c];D(e,t);let a=L(e,[t,...n]),o=i.hierarchyQueryCache.get(t);if(o&&o.hash===a)return o.result;ge(e,t),Se(e,n,r);let s=i.queriesHashMap.get(L(e,n)),{depths:l}=i.hierarchyData.get(t);s.sort((e,t)=>{let n=l[e],r=l[t];return n===r?e-t:n-r});let u=(r.buffered,s.dense);return i.hierarchyQueryCache.set(t,{hash:a,result:u}),u}function ve(e,t,n,r={}){let i=D(e,t);ge(e,t);let a=i.depthToEntities.get(n);return a?(r.buffered,a.dense):r.buffered?new Uint32Array:[]}var ye=Symbol.for(`bitecs-opType`),be=Symbol.for(`bitecs-opTerms`),M=Symbol.for(`bitecs-hierarchyType`),N=Symbol.for(`bitecs-hierarchyRel`),P=Symbol.for(`bitecs-hierarchyDepth`),F=Symbol.for(`bitecs-modifierType`),I={[F]:`nested`},L=(e,t)=>{let n=e[c],r=t=>(n.componentMap.has(t)||z(e,t),n.componentMap.get(t).id),i=e=>ye in e?`${e[ye].toLowerCase()}(${e[be].map(i).sort().join(`,`)})`:r(e).toString();return t.map(i).sort().join(`-`)},xe=(e,t,n={})=>{let r=e[c],i=L(e,t),a=[],o=t=>{ye in t?t[be].forEach(o):(r.componentMap.has(t)||z(e,t),a.push(t))};t.forEach(o);let s=[],l=[],u=[],f=(t,n)=>{n.forEach(n=>{r.componentMap.has(n)||z(e,n),t.push(n)})};t.forEach(t=>{if(ye in t){let{[ye]:e,[be]:n}=t;if(e===`Not`)f(l,n);else if(e===`Or`)f(u,n);else if(e===`And`)f(s,n);else throw Error(`Nested combinator ${e} not supported yet - use simple queries for best performance`)}else r.componentMap.has(t)||z(e,t),s.push(t)});let h=a.map(e=>r.componentMap.get(e)),g=[...new Set(h.map(e=>e.generationId))],_=(e,t)=>(e[t.generationId]=(e[t.generationId]||0)|t.bitflag,e),v=s.map(e=>r.componentMap.get(e)).reduce(_,{}),y=l.map(e=>r.componentMap.get(e)).reduce(_,{}),b=u.map(e=>r.componentMap.get(e)).reduce(_,{}),x=h.reduce(_,{}),S=Object.assign(n.buffered?p():d(),{allComponents:a,orComponents:u,notComponents:l,masks:v,notMasks:y,orMasks:b,hasMasks:x,generations:g,toRemove:d(),addObservable:m(),removeObservable:m(),queues:{}});r.queries.add(S),r.queriesHashMap.set(i,S),h.forEach(e=>{e.queries.add(S)}),l.length&&r.notQueries.add(S);let ee=r.entityIndex;for(let t=0;t<ee.aliveCount;t++){let n=ee.dense[t];B(e,n,Ae)||we(e,S,n)&&R(S,n)}return S};function Se(e,t,n={}){let r=e[c],i=L(e,t),a=r.queriesHashMap.get(i);return a?n.buffered&&!(`buffer`in a.dense)&&(a=xe(e,t,{buffered:!0})):a=xe(e,t,n),n.buffered,a.dense}function Ce(e,t,...n){let r=t.find(e=>e&&typeof e==`object`&&M in e),i=t.filter(e=>!(e&&typeof e==`object`&&M in e)),a=!1,o=!0,s=n.some(e=>e&&typeof e==`object`&&F in e);for(let e of n)if(s&&e&&typeof e==`object`&&F in e){let t=e;t[F]===`buffer`&&(a=!0),t[F]===`nested`&&(o=!1)}else if(!s){let t=e;t.buffered!==void 0&&(a=t.buffered),t.commit!==void 0&&(o=t.commit)}if(r){let{[N]:t,[P]:n}=r;return n===void 0?_e(e,t,i,{buffered:a}):ve(e,t,n,{buffered:a})}return o&&Ee(e),Se(e,i,{buffered:a})}function we(e,t,n){let r=e[c],{masks:i,notMasks:a,orMasks:o,generations:s}=t,l=Object.keys(o).length===0;for(let e=0;e<s.length;e++){let t=s[e],c=i[t],u=a[t],d=o[t],f=r.entityMasks[t][n];if(u&&f&u||c&&(f&c)!==c)return!1;d&&f&d&&(l=!0)}return l}var R=(e,t)=>{if(e.toRemove.has(t)){e.toRemove.remove(t),e.addObservable.notify(t);return}e.has(t)||(e.add(t),e.addObservable.notify(t))},Te=e=>{for(let t=0;t<e.toRemove.dense.length;t++){let n=e.toRemove.dense[t];e.remove(n)}e.toRemove.reset()},Ee=e=>{let t=e[c];t.dirtyQueries.size&&(t.dirtyQueries.forEach(Te),t.dirtyQueries.clear())},De=(e,t,n)=>{let r=e[c];!t.has(n)||t.toRemove.has(n)||(t.toRemove.add(n),r.dirtyQueries.add(t),t.removeObservable.notify(n))},z=(e,t)=>{if(!t)throw Error(`bitECS - Cannot register null or undefined component`);let n=e[c],r=new Set,i={id:n.componentCount++,generationId:n.entityMasks.length-1,bitflag:n.bitflag,ref:t,queries:r,setObservable:m(),getObservable:m()};return n.componentMap.set(t,i),n.bitflag*=2,n.bitflag>=2**31&&(n.bitflag=1,n.entityMasks.push([])),i},B=(e,t,n)=>{let r=e[c],i=r.componentMap.get(n);if(!i)return!1;let{generationId:a,bitflag:o}=i;return(r.entityMasks[a][t]&o)===o},Oe=(e,t,n)=>{let r=e[c].componentMap.get(n);if(r&&B(e,t,n))return r.getObservable.notify(t)},V=(e,t,n,r,i=new Set)=>{if(!i.has(r)){i.add(r),ke(t,n,ie(r));for(let i of Ne(t,r))if(i!==Ae&&!B(t,n,i)){ke(t,n,i);let a=e.componentMap.get(i);if(a?.setObservable){let e=Oe(t,r,i);a.setObservable.notify(n,e)}}for(let a of x(t,r,ie))V(e,t,n,a,i)}},ke=(e,t,n)=>{if(!Pe(e,t))throw Error(`Cannot add component - entity ${t} does not exist in the world.`);let r=e[c],i=`component`in n?n.component:n,a=`data`in n?n.data:void 0;r.componentMap.has(i)||z(e,i);let o=r.componentMap.get(i);if(B(e,t,i))return a!==void 0&&o.setObservable.notify(t,a),!1;let{generationId:s,bitflag:l,queries:u}=o;if(r.entityMasks[s][t]|=l,B(e,t,Ae)||u.forEach(n=>{we(e,n,t)?R(n,t):De(e,n,t)}),r.entityComponents.get(t).add(i),a!==void 0&&o.setObservable.notify(t,a),i[_]){let n=i[h],a=i[g];if(H(e,t,b(n,C),b(C,a)),typeof a==`number`&&(H(e,a,b(C,t),b(C,n)),r.entitiesWithRelations.add(a),r.entitiesWithRelations.add(t)),r.entitiesWithRelations.add(a),n[v].exclusiveRelation===!0&&a!==C){let r=x(e,t,n)[0];r!=null&&r!==a&&U(e,t,n(r))}if(n===ie){let n=x(e,t,ie);for(let i of n)V(r,e,t,i)}A(e,n,t,typeof a==`number`?a:void 0)}return!0};function H(e,t,...n){(Array.isArray(n[0])?n[0]:n).forEach(n=>{ke(e,t,n)})}var U=(e,t,...n)=>{let r=e[c];if(!Pe(e,t))throw Error(`Cannot remove component - entity ${t} does not exist in the world.`);n.forEach(n=>{if(!B(e,t,n))return;let{generationId:i,bitflag:a,queries:o}=r.componentMap.get(n);if(r.entityMasks[i][t]&=~a,o.forEach(n=>{n.toRemove.remove(t),we(e,n,t)?R(n,t):De(e,n,t)}),r.entityComponents.get(t).delete(n),n[_]){let r=n[g],i=n[h];j(e,i,t),U(e,t,b(C,r)),typeof r==`number`&&Pe(e,r)&&(U(e,r,b(C,t)),U(e,r,b(C,i))),x(e,t,i).length===0&&U(e,t,b(i,C))}})},Ae={};function je(e,...t){let n=e[c],r=a(n.entityIndex);return n.notQueries.forEach(t=>{we(e,t,r)&&R(t,r)}),n.entityComponents.set(r,new Set),t.length>0&&H(e,r,t),r}var Me=(e,t)=>{let n=e[c];if(!s(n.entityIndex,t))return;let r=[t],i=new Set;for(;r.length>0;){let t=r.shift();if(i.has(t))continue;i.add(t);let a=[];if(n.entitiesWithRelations.has(t)){for(let i of Ce(e,[C(t)],I))if(Pe(e,i))for(let o of n.entityComponents.get(i)){if(!o[_])continue;let n=o[h][v];a.push(()=>U(e,i,b(C,t))),o[g]===t&&(a.push(()=>U(e,i,o)),n.autoRemoveSubject&&r.push(i),n.onTargetRemoved&&a.push(()=>n.onTargetRemoved(e,i,t)))}n.entitiesWithRelations.delete(t)}for(let e of a)e();for(let t of r)Me(e,t);for(let r of n.queries)De(e,r,t);o(n.entityIndex,t),n.entityComponents.delete(t);for(let e=0;e<n.entityMasks.length;e++)n.entityMasks[e][t]=0}},Ne=(e,t)=>{let n=e[c];if(t===void 0)throw Error(`getEntityComponents: entity id is undefined.`);if(!s(n.entityIndex,t))throw Error(`getEntityComponents: entity ${t} does not exist in the world.`);return Array.from(n.entityComponents.get(t))},Pe=(e,t)=>s(e[c].entityIndex,t),Fe=(e,t)=>[e[0]-t[0],e[1]-t[1],e[2]-t[2]],Ie=(e,t)=>e[0]*t[0]+e[1]*t[1]+e[2]*t[2],Le=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],W=e=>{let t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]};function Re(e,t){let n=new Float32Array(16);for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=0;for(let n=0;n<4;n++)a+=e[n*4+i]*t[r*4+n];n[r*4+i]=a}return n}function ze(e,t,n,r){let i=1/Math.tan(e/2);return new Float32Array([i/t,0,0,0,0,i,0,0,0,0,(r+n)/(n-r),-1,0,0,2*r*n/(n-r),0])}function Be(e,t,n,r,i,a){return new Float32Array([2/(t-e),0,0,0,0,2/(r-n),0,0,0,0,1/(i-a),0,-(t+e)/(t-e),-(r+n)/(r-n),i/(i-a),1])}function Ve(e,t,n,r,i){let a=Math.cos(r),o=Math.sin(r);return new Float32Array([a*i,0,-o*i,0,0,i,0,0,o*i,0,a*i,0,e,t,n,1])}function He(e,t){let[n,r,i]=t;return{x:e[0]*n+e[4]*r+e[8]*i+e[12],y:e[1]*n+e[5]*r+e[9]*i+e[13],z:e[2]*n+e[6]*r+e[10]*i+e[14],w:e[3]*n+e[7]*r+e[11]*i+e[15]}}function Ue(e,t,n){let r=W(Fe(e,t)),i=W(Le(n,r)),a=Le(r,i);return new Float32Array([i[0],a[0],r[0],0,i[1],a[1],r[1],0,i[2],a[2],r[2],0,-Ie(i,e),-Ie(a,e),-Ie(r,e),1])}var We=[[.78,.9,.8],[.85,1,.88],[.72,.84,.76],[.9,1,.92],[.8,.94,.9],[.88,.98,.8]],Ge=[[.85,.95,.78],[.92,1,.85],[.8,.9,.76],[1,.94,.78],[.88,.82,.7],[.86,1,.9],[1,.92,.8]],Ke=[[1,1.15,.95],[1.05,1.15,1],[.92,1.05,.9],[1.15,1.15,1]],qe=[[.78,.9,.76],[.85,.98,.82],[.72,.86,.74],[.9,1,.88],[.8,.94,.86]],Je=[[.92,.9,.86],[1,.98,.92],[.84,.84,.82],[.96,.9,.82]];function G(e,t,n,r,i,a,o,s,c,l,u=[.5,.5],d=[.5,.5],f=[.5,.5]){let p=W(Le(Fe(o,a),Fe(s,a))),m=[[a,u],[o,d],[s,f]];for(let[a,o]of m)e.push(a[0],a[1],a[2]),t.push(p[0],p[1],p[2]),n.push(c),r.push(l),i.push(o[0],o[1])}function Ye(e,t,n,r,i,a,o,s,c,l,u,d){let f=l,p=l+c,m=[],h=[];for(let e=0;e<=a;e++){let t=e/a*Math.PI*2;m.push([Math.cos(t)*o,f,Math.sin(t)*o]),h.push([Math.cos(t)*s,p,Math.sin(t)*s])}for(let o=0;o<a;o++){let s=o/a,c=(o+1)/a;G(e,t,n,r,i,m[o],m[o+1],h[o+1],u,d,[s,0],[c,0],[c,1]),G(e,t,n,r,i,m[o],h[o+1],h[o],u,d,[s,0],[c,1],[s,1])}}function K(e,t,n,r,i,a,o,s,c,l,u,d=0){for(let f=0;f<a;f++){let p=f/a*Math.PI,m=Math.cos(p),h=Math.sin(p),g=[d-m*o,s,-h*o],_=[d+m*o,s,h*o],v=[d-m*o,c,-h*o],y=[d+m*o,c,h*o];G(e,t,n,r,i,g,_,y,l,u,[0,1],[1,1],[1,0]),G(e,t,n,r,i,g,y,v,l,u,[0,1],[1,0],[0,0])}}var q=()=>({positions:[],normals:[],materialIds:[],shades:[],uvs:[]}),J=e=>({positions:new Float32Array(e.positions),normals:new Float32Array(e.normals),materialIds:new Float32Array(e.materialIds),shades:new Float32Array(e.shades),uvs:new Float32Array(e.uvs),vertexCount:e.positions.length/3});function Xe(){let e=q();return Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.1,.06,.45,0,0,1),K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.85,.3,2.7,1,1),J(e)}function Ze(){let e=q();return Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.11,.07,.7,0,0,1),K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,1.15,.25,2.15,1,1),J(e)}function Qe(){let e=q();return Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.14,.09,.8,0,0,1),K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,1.3,.65,2.55,1,1),J(e)}function $e(){let e=q();return Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,6,.075,.045,.95,0,0,1),K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.95,.7,2.35,1,1),J(e)}function et(){let e=q();Ye(e.positions,e.normals,e.materialIds,e.shades,e.uvs,6,.09,.035,1.4,0,0,.62);let t=(t,n,r,i)=>{let a=Math.cos(t)*Math.cos(n),o=Math.sin(t)*Math.cos(n),s=Math.sin(n),c=[0,r,0],l=[a*i,r+s*i,o*i],u=[-o,0,a],d=.03;G(e.positions,e.normals,e.materialIds,e.shades,e.uvs,[c[0]+u[0]*d,c[1],c[2]+u[2]*d],[c[0]-u[0]*d,c[1],c[2]-u[2]*d],l,0,.62);let f=[l[0]*.55,l[1]*.55+r*.45,l[2]*.55],p=[l[0]+a*i*.4-o*.15,l[1]+s*i*.4+.1,l[2]+o*i*.4+a*.15];G(e.positions,e.normals,e.materialIds,e.shades,e.uvs,[f[0]+u[0]*d*.6,f[1],f[2]+u[2]*d*.6],[f[0]-u[0]*d*.6,f[1],f[2]-u[2]*d*.6],p,0,.62)};return t(.4,.5,1.5,.6),t(2.2,.32,1.75,.5),t(3.8,.55,1.95,.46),t(5.1,.4,2.1,.4),t(1.6,.65,2.25,.34),J(e)}function tt(){let e=q();return K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.55,.02,.72,1,1),J(e)}function nt(){let e=q();return K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,2,.4,0,.62,1,1,-.14),K(e.positions,e.normals,e.materialIds,e.shades,e.uvs,2,.32,0,.5,1,.92,.16),J(e)}function rt(e,t){return W([e[0]+t[0],e[1]+t[1],e[2]+t[2]])}function it(e,t){let n=Math.sin(e[0]*12.9898+e[1]*78.233+e[2]*37.719+t*91.7)*43758.5453;return n-Math.floor(n)}function at(e){return[.5+Math.atan2(e[2],e[0])/(2*Math.PI),.5-Math.asin(Math.max(-1,Math.min(1,e[1])))/Math.PI]}function ot(){let e=[1,0,0],t=[-1,0,0],n=[0,1,0],r=[0,-1,0],i=[0,0,1],a=[0,0,-1];return[[e,n,i],[i,n,t],[t,n,a],[a,n,e],[e,i,r],[i,t,r],[t,a,r],[a,e,r]]}function st(e){let t=[];for(let[n,r,i]of e){let e=rt(n,r),a=rt(r,i),o=rt(i,n);t.push([n,e,o],[e,r,a],[o,a,i],[e,a,o])}return t}function ct(e,t,n,r,i,a,o,s){let c=ot();for(let e=0;e<t;e++)c=st(c);let l=e=>{let t=a*(.8+it(e,s)*.45);return[n+e[0]*t,r+e[1]*t*o,i+e[2]*t]};for(let[t,n,r]of c){let i=.82+it(t,s+3)*.36;G(e.positions,e.normals,e.materialIds,e.shades,e.uvs,l(t),l(n),l(r),1,i,at(t),at(n),at(r))}}function lt(){let e=q(),t=.68,n=.5;ct(e,2,0,n*t,0,n,t,1);let r=.24;return ct(e,1,.48,r*t*.9,.1,r,t,2),ct(e,1,-.4,r*t*.8,-.34,r*.85,t,3),J(e)}async function Y(e,t,n=1024){let r=await(await fetch(t)).blob(),i=await createImageBitmap(r),a=Math.min(1,n/Math.max(i.width,i.height)),o=a<1?await createImageBitmap(i,{resizeWidth:Math.round(i.width*a),resizeHeight:Math.round(i.height*a),resizeQuality:`medium`}):i;a<1&&i.close();let s=e.createTexture({size:[o.width,o.height],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return e.queue.copyExternalImageToTexture({source:o},{texture:s},[o.width,o.height]),o.close(),s}var ut=(()=>{let[e,t,n]=[.62,.38,.3],r=Math.hypot(e,t,n);return[e/r,t/r,n/r]})(),dt=2048,X=60,ft=100,pt=1,mt=220,ht=`
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
`,xt=.5,St=1.4,Ct=new Float32Array([0,St,0,xt,0,0,0,0,xt,0,St,0,0,0,xt,-.5,0,0,0,St,0,-.5,0,0,0,0,-.5,0,St,0,0,0,-.5,xt,0,0]),wt=Ct.length/3,Tt=7;async function Et(e,t,n){let r=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),i=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),a=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),o=e.createTexture({size:[dt,dt],format:`depth32float`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}).createView(),s=e.createSampler({compare:`less`,magFilter:`linear`,minFilter:`linear`}),c=Be(-1,1,-1,1,.1,1),l=0,u=0;function d(t,n){l=t,u=n;let r=Ue([t+ut[0]*ft,ut[1]*ft,n+ut[2]*ft],[t,0,n],[0,1,0]);c=Re(Be(-60,X,-60,X,pt,mt),r),e.queue.writeBuffer(a,0,c)}let[f,p,m,h,g,_,v,y,b,x,S]=await Promise.all([Y(e,`/textures/ground/sand.png`),Y(e,`/textures/ground/grass.png`),Y(e,`/textures/ground/dry_meadow.png`),Y(e,`/textures/ground/scree.png`),Y(e,`/textures/ground/rock.png`),Y(e,`/textures/ground/snow.png`),Y(e,`/textures/ground/forest_floor.png`),Y(e,`/textures/ground/desert.png`),Y(e,`/textures/ground/marsh.png`),Y(e,`/textures/ground/tundra_moss.png`),Y(e,`/textures/water/detail.png`)]),ee=e.createSampler({addressModeU:`repeat`,addressModeV:`repeat`,magFilter:`linear`,minFilter:`linear`}),te=e.createShaderModule({code:ht}),C=e.createRenderPipeline({layout:`auto`,vertex:{module:te,entryPoint:`vs`,buffers:[{arrayStride:60,attributes:[{shaderLocation:0,offset:0,format:`float32x3`},{shaderLocation:1,offset:12,format:`float32x3`},{shaderLocation:2,offset:24,format:`float32x3`},{shaderLocation:3,offset:36,format:`float32x2`},{shaderLocation:4,offset:44,format:`float32`},{shaderLocation:5,offset:48,format:`float32`},{shaderLocation:6,offset:52,format:`float32`},{shaderLocation:7,offset:56,format:`float32`}]}]},fragment:{module:te,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),ne=e.createBindGroup({layout:C.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}},{binding:2,resource:ee},{binding:3,resource:f.createView()},{binding:4,resource:p.createView()},{binding:5,resource:m.createView()},{binding:6,resource:h.createView()},{binding:7,resource:g.createView()},{binding:8,resource:{buffer:a}},{binding:9,resource:s},{binding:10,resource:o},{binding:11,resource:_.createView()},{binding:12,resource:v.createView()},{binding:13,resource:y.createView()},{binding:14,resource:b.createView()},{binding:15,resource:x.createView()},{binding:16,resource:S.createView()}]}),[re,ie]=await Promise.all([Y(e,`/textures/sky/sky.png`),Y(e,`/textures/sky/clouds.png`)]),w=e.createSampler({addressModeU:`repeat`,addressModeV:`clamp-to-edge`,magFilter:`linear`,minFilter:`linear`}),ae=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),T=e.createShaderModule({code:bt}),oe=e.createRenderPipeline({layout:`auto`,vertex:{module:T,entryPoint:`vs`},fragment:{module:T,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`,cullMode:`none`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!1,depthCompare:`always`}}),se=e.createBindGroup({layout:oe.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:ae}},{binding:1,resource:w},{binding:2,resource:re.createView()},{binding:3,resource:ie.createView()}]});function E(t,n,r,i,a,o){let s=new Float32Array([t[0],t[1],t[2],0,n[0],n[1],n[2],0,r[0],r[1],r[2],0,i,a,o,0]);e.queue.writeBuffer(ae,0,s)}let ce=e.createShaderModule({code:vt}),le=e.createRenderPipeline({layout:`auto`,vertex:{module:ce,entryPoint:`vs`,buffers:[{arrayStride:60,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth32float`,depthWriteEnabled:!0,depthCompare:`less`}}),ue=e.createBindGroup({layout:le.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}}]}),D=new Map,de=e.createShaderModule({code:gt}),fe=e.createBuffer({size:Ct.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(fe,0,Ct);let pe=e.createRenderPipeline({layout:`auto`,vertex:{module:de,entryPoint:`vs`,buffers:[{arrayStride:12,stepMode:`vertex`,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]},{arrayStride:28,stepMode:`instance`,attributes:[{shaderLocation:1,offset:0,format:`float32x3`},{shaderLocation:2,offset:12,format:`float32`},{shaderLocation:3,offset:16,format:`float32x3`}]}]},fragment:{module:de,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),me=e.createBindGroup({layout:pe.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}}]}),O=null,k=0,A=0,j=e.createShaderModule({code:_t});function he(t){let n=e.createBuffer({size:Math.max(t.vertexCount*10*4,4),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),r=new Float32Array(t.vertexCount*10);for(let e=0;e<t.vertexCount;e++)r.set(t.positions.subarray(e*3,e*3+3),e*10),r.set(t.normals.subarray(e*3,e*3+3),e*10+3),r[e*10+6]=t.materialIds[e],r[e*10+7]=t.shades[e],r.set(t.uvs.subarray(e*2,e*2+2),e*10+8);return e.queue.writeBuffer(n,0,r),n}let ge=await Promise.all(Object.entries({bark:`/textures/decor/bark.png`,birchBark:`/textures/decor/birch_bark.png`,conifer:`/textures/decor/conifer_a.png`,conifer2:`/textures/decor/conifer_b.png`,broadleaf:`/textures/decor/broadleaf.png`,autumn:`/textures/decor/autumn.png`,birchLeaf:`/textures/decor/birch_leaf.png`,bush:`/textures/decor/bush.png`,grassTuft:`/textures/decor/grass_tuft.png`}).map(async([t,n])=>[t,await Y(e,n)])),_e={...Object.fromEntries(ge),rock:g},ve=e.createSampler({magFilter:`linear`,minFilter:`linear`}),ye={spruce:{trunk:`bark`,canopy:`conifer`},pine:{trunk:`bark`,canopy:`conifer2`},broadleaf:{trunk:`bark`,canopy:`broadleaf`},autumn:{trunk:`bark`,canopy:`autumn`},birch:{trunk:`birchBark`,canopy:`birchLeaf`},dead:{trunk:`bark`,canopy:`bark`},bush:{trunk:`bark`,canopy:`bush`},grass:{trunk:`bark`,canopy:`grassTuft`},rock:{trunk:`bark`,canopy:`rock`}},be={spruce:Xe,pine:Ze,broadleaf:Qe,autumn:Qe,birch:$e,dead:et,bush:tt,grass:nt,rock:lt},M=[{arrayStride:40,stepMode:`vertex`,attributes:[{shaderLocation:0,offset:0,format:`float32x3`},{shaderLocation:1,offset:12,format:`float32x3`},{shaderLocation:2,offset:24,format:`float32`},{shaderLocation:3,offset:28,format:`float32`},{shaderLocation:4,offset:32,format:`float32x2`}]},{arrayStride:40,stepMode:`instance`,attributes:[{shaderLocation:5,offset:0,format:`float32x3`},{shaderLocation:6,offset:12,format:`float32x3`},{shaderLocation:7,offset:24,format:`float32`},{shaderLocation:8,offset:28,format:`float32x3`}]}],N=e.createRenderPipeline({layout:`auto`,vertex:{module:j,entryPoint:`vs`,buffers:M},fragment:{module:j,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),P=e.createShaderModule({code:yt}),F=e.createRenderPipeline({layout:`auto`,vertex:{module:P,entryPoint:`vs`,buffers:M},fragment:{module:P,entryPoint:`fs`,targets:[]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth32float`,depthWriteEnabled:!0,depthCompare:`less`}}),I=new Map;for(let t of Object.keys(ye)){let n=be[t](),c=ye[t],l=e.createBindGroup({layout:N.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}},{binding:2,resource:ve},{binding:3,resource:_e[c.trunk].createView()},{binding:4,resource:_e[c.canopy].createView()},{binding:5,resource:{buffer:a}},{binding:6,resource:s},{binding:7,resource:o}]}),u=e.createBindGroup({layout:F.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}},{binding:1,resource:ve},{binding:2,resource:_e[c.canopy].createView()}]});I.set(t,{mesh:n,localBuf:he(n),instBuf:null,instCapacity:0,instanceCount:0,bindGroup:l,shadowBindGroup:u})}let L=null,xe=null;function Se(){let n=t.canvas.width,r=t.canvas.height;L&&L.width===n&&L.height===r||(L?.destroy(),L=e.createTexture({size:[n,r],format:`depth24plus`,usage:GPUTextureUsage.RENDER_ATTACHMENT}),xe=L.createView())}function Ce(t,n){D.get(t)?.buf.destroy();let r=e.createBuffer({size:Math.max(n.vertexCount*15*4,4),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),i=new Float32Array(n.vertexCount*15),a=1/0,o=-1/0,s=1/0,c=-1/0;for(let e=0;e<n.vertexCount;e++){let t=n.positions[e*3],r=n.positions[e*3+2];t<a&&(a=t),t>o&&(o=t),r<s&&(s=r),r>c&&(c=r),i.set(n.positions.subarray(e*3,e*3+3),e*15),i.set(n.colors.subarray(e*3,e*3+3),e*15+3),i.set(n.normals.subarray(e*3,e*3+3),e*15+6),i.set(n.uvs.subarray(e*2,e*2+2),e*15+9),i[e*15+11]=n.elevations[e],i[e*15+12]=n.waterFlags[e],i[e*15+13]=n.forestFracs[e],i[e*15+14]=n.moistureFracs[e]}e.queue.writeBuffer(r,0,i),D.set(t,{buf:r,vertexCount:n.vertexCount,minX:a,maxX:o,minZ:s,maxZ:c})}function we(e){let t=D.get(e);t&&(t.buf.destroy(),D.delete(e))}function R(t){A=t.length;let n=new Float32Array(A*Tt);t.forEach((e,t)=>{let r=t*Tt;n[r]=e.x,n[r+1]=e.y,n[r+2]=e.z,n[r+3]=1,n[r+4]=e.color[0],n[r+5]=e.color[1],n[r+6]=e.color[2]}),A>k&&(O?.destroy(),k=Math.max(A,8),O=e.createBuffer({size:k*Tt*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST})),O&&n.byteLength>0&&e.queue.writeBuffer(O,0,n)}function Te(t,n){let r=t.length,i=new Float32Array(r*10);t.forEach((e,t)=>{let n=t*10;i[n]=e.x,i[n+1]=e.y,i[n+2]=e.z,i[n+3]=e.scale[0],i[n+4]=e.scale[1],i[n+5]=e.scale[2],i[n+6]=e.yaw,i[n+7]=e.color[0],i[n+8]=e.color[1],i[n+9]=e.color[2]}),n.instanceCount=r,r>n.instCapacity&&(n.instBuf?.destroy(),n.instCapacity=Math.max(r,8),n.instBuf=e.createBuffer({size:n.instCapacity*10*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST})),n.instBuf&&i.byteLength>0&&e.queue.writeBuffer(n.instBuf,0,i)}function Ee(e){for(let[t,n]of I)Te(e.filter(e=>e.kind===t),n)}function De(t){e.queue.writeBuffer(r,0,t)}function z(t,n,r,a){let o=new Float32Array([t[0],t[1],t[2],a,n[0],n[1],n[2],r]);e.queue.writeBuffer(i,0,o)}function B(n,r){Se();let i=e.createCommandEncoder();{let e=i.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:o,depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}}),t=l-X,n=l+X,r=u-X,a=u+X;if(D.size>0){e.setPipeline(le),e.setBindGroup(0,ue);for(let i of D.values())i.vertexCount!==0&&(i.maxX<t||i.minX>n||i.maxZ<r||i.minZ>a||(e.setVertexBuffer(0,i.buf),e.draw(i.vertexCount)))}let s=!1;for(let e of I.values())if(e.instanceCount>0){s=!0;break}if(s){e.setPipeline(F);for(let t of I.values())t.instanceCount===0||!t.instBuf||(e.setBindGroup(0,t.shadowBindGroup),e.setVertexBuffer(0,t.localBuf),e.setVertexBuffer(1,t.instBuf),e.draw(t.mesh.vertexCount,t.instanceCount))}e.end()}let a=t.getCurrentTexture().createView(),s=i.beginRenderPass({colorAttachments:[{view:a,clearValue:n,loadOp:`clear`,storeOp:`store`}],depthStencilAttachment:{view:xe,depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}});if(s.setPipeline(oe),s.setBindGroup(0,se),s.draw(3),D.size>0){s.setPipeline(C),s.setBindGroup(0,ne);for(let e of D.values())e.vertexCount!==0&&(s.setVertexBuffer(0,e.buf),s.draw(e.vertexCount))}A>0&&O&&(s.setPipeline(pe),s.setBindGroup(0,me),s.setVertexBuffer(0,fe),s.setVertexBuffer(1,O),s.draw(wt,A));let c=!1;for(let e of I.values())if(e.instanceCount>0){c=!0;break}if(c){s.setPipeline(N);for(let e of I.values())e.instanceCount===0||!e.instBuf||(s.setBindGroup(0,e.bindGroup),s.setVertexBuffer(0,e.localBuf),s.setVertexBuffer(1,e.instBuf),s.draw(e.mesh.vertexCount,e.instanceCount))}r?.(s),s.end(),e.queue.submit([i.finish()])}function Oe(){return{lightBuf:a,shadowView:o,shadowSampler:s}}return{setTerrainChunk:Ce,removeTerrainChunk:we,setMarkers:R,setDecor:Ee,setVP:De,setFog:z,setSunTarget:d,setSkyCamera:E,getShadowResources:Oe,frame:B}}var Z=12345,Dt=.235,Ot=2400,kt=1200,At=Ot/2;kt/2;var jt=2.5;function Q(e,t,n){let r=e*374761393+t*668265263+n*1274126177;return r=Math.imul(r^r>>>13,1274126177),((r^r>>>16)>>>0)/4294967296}function Mt(e,t,n){let r=Math.floor(e),i=Math.floor(t),a=e-r,o=t-i,s=a*a*(3-2*a),c=o*o*(3-2*o),l=Q(r,i,n),u=Q(r+1,i,n),d=Q(r,i+1,n),f=Q(r+1,i+1,n);return(l*(1-s)+u*s)*(1-c)+(d*(1-s)+f*s)*c}var Nt=null,Pt=null,Ft=null;async function It(e,t){let n=await fetch(e);if(!n.ok)throw Error(`${e}: HTTP ${n.status}`);let r=await n.arrayBuffer();if(r.byteLength!==t)throw Error(`${e}: неверный размер (${r.byteLength} байт, ожидалось ${t})`);return r}var Lt=2;async function Rt(){let e=Ot*kt,t=`?v=${Lt}`,[n,r,i]=await Promise.all([It(`/heightmap/elevation.bin`+t,e*2),It(`/heightmap/forest.bin`+t,e),It(`/heightmap/moisture.bin`+t,e)]);Nt=new Uint16Array(n),Pt=new Uint8Array(r),Ft=new Uint8Array(i)}function zt(e,t,n,r){let i=Math.floor(t),a=Math.floor(n),o=Math.min(i+1,2399),s=Math.min(a+1,1199),c=t-i,l=n-a,u=a*Ot+i,d=a*Ot+o,f=s*Ot+i,p=s*Ot+o,m=e[u]+(e[d]-e[u])*c;return(m+(e[f]+(e[p]-e[f])*c-m)*l)*r}function Bt(e,t){return[Math.max(0,Math.min(2399,e+At)),Math.max(0,Math.min(1199,t+600))]}function Vt(e,t){if(!Nt)return .285;let[n,r]=Bt(e,t);return zt(Nt,n,r,jt/65535)}function Ht(e,t){let n=Vt(e,t),r=(Vt(e+.7,t)+Vt(e-.7,t)+Vt(e,t+.7)+Vt(e,t-.7))*.25;return n*.55+r*.45}var Ut=32,Wt=new Map;function Gt(e,t){return Math.floor(e/Ut)+`,`+Math.floor(t/Ut)}function Kt(e,t,n){let r={x:e,z:t,targetH:Ht(e,t),radius:n},i=Gt(e,t),a=Wt.get(i);a?a.push(r):Wt.set(i,[r])}function $(e,t){let n=Vt(e,t);if(Wt.size===0)return n;let r=Math.floor(e/Ut),i=Math.floor(t/Ut),a=null,o=0;for(let n=-1;n<=1;n++)for(let s=-1;s<=1;s++){let c=Wt.get(r+s+`,`+(i+n));if(c)for(let n of c){let r=Math.hypot(e-n.x,t-n.z);if(r>=n.radius)continue;let i=n.radius*.55,s=r<=i?1:1-((r-i)/(n.radius-i))**2*(3-2*((r-i)/(n.radius-i)));s>o&&(o=s,a=n)}}return a?n*(1-o)+a.targetH*o:n}function qt(e,t){return $(e,t)<Dt}function Jt(e,t){if(!Ft)return .5;let[n,r]=Bt(e,t);return zt(Ft,n,r,1/255)}function Yt(e,t){if(!Pt)return 0;let[n,r]=Bt(e,t);return zt(Pt,n,r,1/255)}var Xt=(e,t,n)=>[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n],Zt=[.14,.24,.28],Qt=[.05,.11,.19];function $t(e){return Xt(Zt,Qt,Math.min(1,e))}var en=[0,1,0],tn=6;function nn(e,t){let n=.5,r=$(e-n,t)*13,i=$(e+n,t)*13,a=$(e,t-n)*13,o=$(e,t+n)*13;return W([-(i-r)/(2*n),1,-(o-a)/(2*n)])}function rn(e,t,n,r,i=1,a=0){let o=Math.round((n-e)/i),s=Math.round((r-t)/i),c=i===1,l=[],u=[],d=[],f=[],p=[],m=[],h=[],g=[];function _(e,t){let n=$(e,t),r=n<Dt,i=r?[e,Dt*13-a,t]:[e,n*13-a,t],o=r?$t((Dt-n)*3):[0,0,0],s=r?en:c?nn(e,t):en,l=r?0:Yt(e,t),u=r?0:Jt(e,t);return{p:i,c:o,n:s,uv:[e/tn,t/tn],e:n,water:+!!r,forest:l,moisture:u}}let v=[];for(let n=0;n<=s;n++){let r=[];for(let a=0;a<=o;a++)r.push(_(e+a*i,t+n*i));v.push(r)}function y(e,t,n){let r=c?null:W(Le(Fe(t.p,e.p),Fe(n.p,e.p)));for(let i of[e,t,n]){l.push(i.p[0],i.p[1],i.p[2]),u.push(i.c[0],i.c[1],i.c[2]);let e=r??i.n;d.push(e[0],e[1],e[2]),f.push(i.uv[0],i.uv[1]),p.push(i.e),m.push(i.water),h.push(i.forest),g.push(i.moisture)}}for(let e=0;e<s;e++)for(let t=0;t<o;t++){let n=v[e][t],r=v[e][t+1],i=v[e+1][t],a=v[e+1][t+1];y(n,a,r),y(n,i,a)}return{positions:new Float32Array(l),colors:new Float32Array(u),normals:new Float32Array(d),uvs:new Float32Array(f),elevations:new Float32Array(p),waterFlags:new Float32Array(m),forestFracs:new Float32Array(h),moistureFracs:new Float32Array(g),vertexCount:l.length/3}}var an=9,on=140,sn=10,cn=380,ln={d:[1,0],arrowright:[1,0],a:[-1,0],arrowleft:[-1,0],w:[0,1],arrowup:[0,1],s:[0,-1],arrowdown:[0,-1]},un=700;function dn(e,t){let n=!0,r=new Map,i=null,a=null,o=null,s=null,c=null;function l(){n=!1,c?.()}function u(){let e=[...r.values()];return{x:(e[0].x+e[1].x)/2,y:(e[0].y+e[1].y)/2,d:Math.hypot(e[0].x-e[1].x,e[0].y-e[1].y)}}function d(){let e=[...r.values()];return Math.atan2(e[1].y-e[0].y,e[1].x-e[0].x)}function f(e,n){let r=t.dist*.0022,i=e*r,a=n*r,o=Math.cos(t.yaw),s=Math.sin(t.yaw);t.target[0]=Math.max(-At,Math.min(At,t.target[0]-(i*o-a*s))),t.target[2]=Math.max(-600,Math.min(600,t.target[2]+(i*s+a*o))),t.target[1]=$(t.target[0],t.target[2])*13+1}e.addEventListener(`pointerdown`,n=>{n.preventDefault(),l(),r.set(n.pointerId,{x:n.clientX,y:n.clientY});try{e.setPointerCapture(n.pointerId)}catch{}if(r.size===1)i={x:n.clientX,y:n.clientY,tx:t.target[0],tz:t.target[2]},o={x:n.clientX,y:n.clientY,t:performance.now()};else if(r.size===2){i=null,o=null;let e=u();a={d:e.d,y:e.y,dist:t.dist,yaw:t.yaw,pitch:t.pitch,angle:d()}}}),e.addEventListener(`pointermove`,e=>{if(r.has(e.pointerId)){if(e.preventDefault(),r.set(e.pointerId,{x:e.clientX,y:e.clientY}),o&&Math.hypot(e.clientX-o.x,e.clientY-o.y)>sn&&(o=null),r.size>=2&&a){let e=u();t.dist=Math.max(an,Math.min(on,a.dist*(a.d/Math.max(12,e.d)))),t.yaw=a.yaw+(d()-a.angle),t.pitch=Math.max(.08,Math.min(1.42,a.pitch+(e.y-a.y)*.005));return}i&&(t.target[0]=i.tx,t.target[2]=i.tz,f(e.clientX-i.x,i.y-e.clientY))}});function p(e){if(o&&r.size===1&&performance.now()-o.t<cn&&s?.(o.x,o.y),o=null,r.delete(e.pointerId),r.size<2&&(a=null),r.size===0)i=null;else if(r.size===1){let e=[...r.values()][0];i={x:e.x,y:e.y,tx:t.target[0],tz:t.target[2]}}}e.addEventListener(`pointerup`,p),e.addEventListener(`pointercancel`,p),e.addEventListener(`wheel`,e=>{e.preventDefault(),l(),t.dist=Math.max(an,Math.min(on,t.dist*(e.deltaY<0?.9:1.11)))},{passive:!1});let m=new Set;window.addEventListener(`keydown`,e=>{let t=e.key.toLowerCase();t in ln&&(m.add(t),l())}),window.addEventListener(`keyup`,e=>{m.delete(e.key.toLowerCase())});let h=null;function g(e){if(h===null){h=e;return}let t=Math.min(.1,(e-h)/1e3);if(h=e,m.size===0||i)return;let n=0,r=0;for(let e of m){let[t,i]=ln[e];n+=t,r+=i}(n!==0||r!==0)&&f(n*un*t,r*un*t)}return{isAutoOrbiting:()=>n,stopAuto:l,update:g,onTap(e){s=e},onInteract(e){c=e}}}var fn={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},pn={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};async function mn(e){let t=await(await fetch(e)).arrayBuffer(),n=new DataView(t);if(n.getUint32(0,!0)!==1179937895)throw Error(`не glTF-контейнер: `+e);let r=n.getUint32(8,!0),i=12,a=null,o=null;for(;i<r;){let e=n.getUint32(i,!0),r=n.getUint32(i+4,!0),s=t.slice(i+8,i+8+e);r===1313821514?a=JSON.parse(new TextDecoder().decode(s)):r===5130562&&(o=s),i+=8+e}if(!a||!o)throw Error(`GLB без JSON/BIN чанка: `+e);let s=e=>a.accessors[e],c=e=>a.bufferViews[e];function l(e){let t=s(e),n=c(t.bufferView),r=fn[t.componentType],i=(n.byteOffset||0)+(t.byteOffset||0);return new r(o,i,t.count*pn[t.type])}let u=a.meshes[0].primitives[0],d=l(u.attributes.POSITION),f=l(u.attributes.NORMAL),p=l(u.attributes.TEXCOORD_0),m=l(u.indices),h=a.materials[u.material].pbrMetallicRoughness.baseColorTexture.index,g=a.images[a.textures[h].source],_=c(g.bufferView);return{positions:d,normals:f,uvs:p,indices:m,imageBytes:o.slice(_.byteOffset||0,(_.byteOffset||0)+_.byteLength),imageMimeType:g.mimeType}}var hn=`
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
`;async function gn(e,t){let n=e.createBuffer({size:t.positions.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(n,0,t.positions);let r=e.createBuffer({size:t.normals.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(r,0,t.normals);let i=e.createBuffer({size:t.uvs.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(i,0,t.uvs);let a=t.indices.byteLength,o=Math.ceil(a/4)*4,s=e.createBuffer({size:o,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});if(o===a)e.queue.writeBuffer(s,0,t.indices);else{let n=new Uint8Array(o);n.set(new Uint8Array(t.indices.buffer,t.indices.byteOffset,a)),e.queue.writeBuffer(s,0,n)}let c=await createImageBitmap(new Blob([t.imageBytes],{type:t.imageMimeType})),l=Math.min(1,1024/Math.max(c.width,c.height)),u=l<1?await createImageBitmap(c,{resizeWidth:Math.round(c.width*l),resizeHeight:Math.round(c.height*l),resizeQuality:`medium`}):c;l<1&&c.close();let d=e.createTexture({size:[u.width,u.height],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return e.queue.copyExternalImageToTexture({source:u},{texture:d},[u.width,u.height]),u.close(),{vao:{posBuf:n,nrmBuf:r,uvBuf:i,idxBuf:s,indexFormat:t.indices instanceof Uint16Array?`uint16`:`uint32`,indexCount:t.indices.length},texture:d}}function _n(e,t,n){let r=e.createShaderModule({code:hn}),i=e.createRenderPipeline({layout:`auto`,vertex:{module:r,entryPoint:`vs`,buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]},{arrayStride:12,attributes:[{shaderLocation:1,offset:0,format:`float32x3`}]},{arrayStride:8,attributes:[{shaderLocation:2,offset:0,format:`float32x2`}]}]},fragment:{module:r,entryPoint:`fs`,targets:[{format:t}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),a=e.createSampler({magFilter:`linear`,minFilter:`linear`,mipmapFilter:`linear`}),o=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});function s(t,n,r){let i=new Float32Array([t[0],t[1],t[2],0,n[0],n[1],n[2],r]);e.queue.writeBuffer(o,0,i)}function c(t,r){let s=e.createBuffer({size:128,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});return e.queue.writeBuffer(s,64,r),{model:t,uniformBuf:s,bindGroup:e.createBindGroup({layout:i.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:s}},{binding:1,resource:a},{binding:2,resource:t.texture.createView()},{binding:3,resource:{buffer:o}},{binding:4,resource:{buffer:n.lightBuf}},{binding:5,resource:n.shadowSampler},{binding:6,resource:n.shadowView}]})}}function l(t,n,r){e.queue.writeBuffer(n.uniformBuf,0,r),t.setPipeline(i),t.setBindGroup(0,n.bindGroup),t.setVertexBuffer(0,n.model.vao.posBuf),t.setVertexBuffer(1,n.model.vao.nrmBuf),t.setVertexBuffer(2,n.model.vao.uvBuf),t.setIndexBuffer(n.model.vao.idxBuf,n.model.vao.indexFormat),t.drawIndexed(n.model.vao.indexCount)}return{createInstance:c,draw:l,setFog:s}}var vn={food:`farm`,wood:`sawmill`,stone:`quarry`,gold:`gold-mine`,amber:`amber-vein`},yn={food:`Пашня`,wood:`Лесопилка`,stone:`Каменоломня`,gold:`Рудник`,amber:`Янтарная жила`};function bn(e){return e>=25?5:e>=19?4:e>=13?3:e>=7?2:1}function xn(){try{let e=window.parent;if(e&&e!==window){let t=e.mpWorldSnapshot;if(typeof t==`function`){let e=t();if(e)return e}if(e.W)return e.W}}catch{}return null}function Sn(){let e=xn();return!e||!e.players[0]?null:{x:e.players[0].x,y:e.players[0].y}}var Cn=16;function wn(e,t,n){let r=xn();if(!r)return null;let i=[],a=e!==void 0&&t!==void 0&&n!==void 0&&!!r.mapChunks,o=[];if(a){let i=Math.floor((e-n)/Cn),a=Math.floor((e+n)/Cn),s=Math.floor((t-n)/Cn),c=Math.floor((t+n)/Cn);for(let e=s;e<=c;e++)for(let t=i;t<=a;t++){let n=r.mapChunks[t+`,`+e];if(n)for(let e of n)o.push(e)}}else for(let e in r.map)o.push(e);let s=n===void 0?1/0:n*n;for(let n of o){let o=r.map[n];if(o){if(a){let n=o.x-e,r=o.y-t;if(n*n+r*r>s)continue}if(o.t===`city`){let e=r.players.find(e=>e.id===o.pid),t=e?e.race:`human`,a=e?Math.max(1,Math.min(5,bn(e.b.hall))):1,s=r.players[0]&&e&&e.id===r.players[0].id,c=e?e.nick??`?`:`?`,l=e?`Ратуша `+e.b.hall:``;i.push({key:n,x:o.x+.5,y:o.y+.5,gx:o.x,gy:o.y,kind:0,model:`/models/castles/${t}-${a}.glb`,scale:10,own:s,nm:c,lv:l})}else if(o.t===`camp`||o.t===`fort`){let e=(o.t===`fort`?`Форт`:`Лагерь`)+` варваров`,t=`ур. `+(o.lv??`?`);i.push({key:n,x:o.x+.5,y:o.y+.5,gx:o.x,gy:o.y,kind:1,model:`/models/camps/barbarians.glb`,scale:o.t===`fort`?6.5:5,nm:e,lv:t})}else if(o.t===`node`){let e=vn[o.res]||`farm`,t=yn[o.res]||`Точка`,r=`ур. `+(o.lv??`?`);i.push({key:n,x:o.x+.5,y:o.y+.5,gx:o.x,gy:o.y,kind:2,model:`/models/resources/${e}.glb`,scale:5,nm:t,lv:r})}}}return i}function Tn(e){let t=0;for(let n in e)for(let r in e[n])t+=e[n][+r]||0;return t}function En(){try{let e=window.parent;if(e&&e!==window){let t=e.mpWorldSnapshot;if(typeof t==`function`){let e=t();if(e)return e}if(e.W)return e.W}}catch{}return null}function Dn(e,t){let n=e.path,r=e.pathCum;if(!n||n.length<2)return n&&n[0]||{x:e.tx,y:e.ty};let i=t*(e.pathLen??0);for(let e=1;e<r.length;e++)if(r[e]>=i){let t=r[e]-r[e-1],a=t>0?(i-r[e-1])/t:0,o=n[e-1],s=n[e];return{x:o.x+(s.x-o.x)*a,y:o.y+(s.y-o.y)*a}}return n[n.length-1]}function On(){let e=En();if(!e||!e.marches)return null;let t=e.players[0]?e.players[0].id:-1,n=[];for(let r of e.marches){let i=r.state===`gather`||r.state===`siege`?{x:r.tx,y:r.ty}:Dn(r,Math.max(0,Math.min(1,(e.t-r.t0)/Math.max(1,r.t1-r.t0)))),a=e.players.find(e=>e.id===r.pid),o=r.state===`siege`&&r.data&&r.data.battle?r.data.battle:null,s=o?{round:o.round??0,revealFromRound:o.revealFromRound??0,retreating:!!(o.retreatRequested||o.retreated),attHpLeft:o.attHpLeft??0,attStartHp:o.attStartHp??1,revealFromAttHp:o.revealFromAttHp??o.attHpLeft??0,defHpLeft:o.defHpLeft??0,defStartHp:o.defStartHp??1,revealFromDefHp:o.revealFromDefHp??o.defHpLeft??0,revealStart:o.revealStart??0,revealAt:o.revealAt??0}:null;n.push({x:i.x,y:i.y,own:r.pid===t,id:r.id,nick:a?.nick??a?.name??`?`,unitsTotal:Tn(r.units),state:r.state,tx:r.tx,ty:r.ty,t1:r.t1,battle:s})}return n}var kn=document.getElementById(`status`),An=(()=>{try{if(/[?&]debug=1\b/.test(location.search))return!0;if(window.parent&&window.parent!==window)return/[?&]debug=1\b/.test(window.parent.location.search)}catch{}return!1})();An&&(kn.style.display=`block`);function jn(e){An&&(kn.textContent=e.join(`
`))}function Mn(e){kn.style.display=`block`,kn.textContent=e.join(`
`)}async function Nn(){let e=[];function t(t){Mn([...e,t]);try{window.parent&&window.parent!==window&&typeof window.parent.forceCityView==`function`&&window.parent.forceCityView()}catch{}}if(!(`gpu`in navigator)){t(`WebGPU: navigator.gpu отсутствует.`);return}await Rt(),e.push(`рельеф: настоящие данные высот загружены`);let n={x:42,y:22},r=[.6,.52,.4],i=35e-5,a=Sn(),o=a??n,s=wn(o.x,o.y,448),c=s!==null;window.parent!==window&&(kn.style.display=`none`);let l=s??[{key:`demo-0`,x:43,y:14,gx:43,gy:14,kind:0,model:`/models/castles/human-1.glb`,scale:10,nm:`Замок`,lv:`демо`},{key:`demo-1`,x:50,y:20,gx:50,gy:20,kind:1,model:`/models/camps/barbarians.glb`,scale:5,nm:`Лагерь`,lv:`демо`},{key:`demo-2`,x:55,y:12,gx:55,gy:12,kind:2,model:`/models/resources/farm.glb`,scale:5,nm:`Пашня`,lv:`демо`},{key:`demo-3`,x:30,y:30,gx:30,gy:30,kind:2,model:`/models/resources/quarry.glb`,scale:5,nm:`Каменоломня`,lv:`демо`}];e.push(c?`данные: настоящая партия, сущностей — ${l.length}`:`данные: демо (window.parent.W недоступен)`);let d=u(),f={x:[],y:[]},p={value:[]},m=new Map,h=new Map,g=new Map,_=new Map,v=new Map,y=new Map,b=new Map;function x(e){let t=je(d);return ke(d,t,f),ke(d,t,p),f.x[t]=e.x,f.y[t]=e.y,p.value[t]=e.kind,m.set(t,e.model),h.set(t,e.scale),g.set(t,e.nm),_.set(t,e.lv),v.set(t,!!e.own),y.set(t,{x:e.gx,y:e.gy}),b.set(e.key,t),Kt(e.x,e.y,e.scale*1.4),t}for(let e of l)x(e);let S=Array.from(Ce(d,[f,p]));e.push(`bitECS: сущностей — ${S.length}`);let ee=await navigator.gpu.requestAdapter();if(!ee){t(`WebGPU: адаптер не найден.`);return}let te=await ee.requestDevice();function C(e){let t=document.getElementById(`gpu-error-banner`);t||(t=document.createElement(`div`),t.id=`gpu-error-banner`,t.style.cssText=`position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#4a0f0f;color:#fff;font:11px/1.4 monospace;padding:6px 8px;max-height:40vh;overflow:auto;white-space:pre-wrap;`,document.body.appendChild(t)),t.textContent+=(t.textContent?`
---
`:``)+e}te.addEventListener(`uncapturederror`,e=>{let t=e.error.message;console.error(`WebGPU error:`,t),C(t)});let ne=`fb-gpu-reload-at`,re=Number(sessionStorage.getItem(ne)||0),ie=re&&Date.now()-re<6e4;te.lost.then(e=>{if(console.error(`WebGPU device lost:`,e.reason,e.message),e.reason!==`destroyed`){if(ie){C(`WebGPU-устройство теряется повторно (${e.reason}) — похоже, объёмная карта нестабильна на этом устройстве/браузере. Карта города ниже работает независимо от WebGPU.`);try{window.parent&&window.parent!==window&&typeof window.parent.forceCityView==`function`&&window.parent.forceCityView()}catch{}return}C(`WebGPU-устройство потеряно (${e.reason}): ${e.message}\nПерезагрузка через 2с...`),sessionStorage.setItem(ne,String(Date.now())),setTimeout(()=>location.reload(),2e3)}});let w=document.getElementById(`gpu`),ae=w.getContext(`webgpu`);if(!ae){t(`WebGPU: getContext('webgpu') вернул null.`);return}let T=navigator.gpu.getPreferredCanvasFormat();function oe(){let e=w.clientWidth,t=w.clientHeight;if(e<=0||t<=0)return;let n=Math.min(2,window.devicePixelRatio||1),r=Math.max(1,Math.floor(e*n)),i=Math.max(1,Math.floor(t*n));w.width!==r&&(w.width=r),w.height!==i&&(w.height=i)}let se=()=>w.offsetParent===null&&w.clientWidth===0;oe(),new ResizeObserver(oe).observe(w),ae.configure({device:te,format:T,alphaMode:`opaque`}),e.push(`WebGPU: устройство получено, формат — ${T}`);let E=await Et(te,ae,T);function ce(e,t){return e+`,`+t}function le(e,t){try{let n=window.parent;n&&n!==window&&typeof n.ensureWorldChunk==`function`&&n.ensureWorldChunk(e,t)}catch{}}let ue=new Map;function D(e,t){return[e[0]*t,e[1]*t,e[2]*t]}function de(e,t,n){if(qt(e,t))return!0;for(let r=0;r<8;r++){let i=r/8*Math.PI*2;if(qt(e+Math.cos(i)*n,t+Math.sin(i)*n))return!0}return!1}function fe(e,t,n,r){for(let i of S){let a=f.x[i]-e,o=f.y[i]-t,s=(h.get(i)??5)*n+r;if(a*a+o*o<s*s)return!0}return!1}function pe(e,t){return e>1.36?t<.62?`spruce`:t<.94?`pine`:`dead`:t<.58?`broadleaf`:t<.8?`birch`:t<.94?`spruce`:`dead`}function me(e,t){let n=[];for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=e*4+i,o=t*4+r;if(Q(a,o,13122)>=.65)continue;let s=.175+Q(a,o,Z+778)*.65,c=.175+Q(a,o,Z+779)*.65,l=e*16+i*4+s*4,u=t*16+r*4+c*4,d=l+(Mt(l/8.5,u/8.5,Z+790)*2-1)*2,f=u+(Mt(l/8.5,u/8.5,Z+791)*2-1)*2;if(de(d,f,1.5)||fe(d,f,.54,.68))continue;let p=Q(a,o,Z+781)*Math.PI*2,m=.85+Q(a,o,Z+782)*.3,h=$(d,f),g=h*13,_=.05+.85*Yt(d,f),v=Q(a,o,Z+780)<_,y=1+Q(a,o,Z+785)*1.3,b=.8+Q(a,o,Z+786)*.5;if(v){let e=pe(h,Q(a,o,Z+780));e===`broadleaf`&&Q(a,o,13132)<.35&&(e=`autumn`);let t=e===`spruce`||e===`pine`?We:Ge,r=t[Math.floor(Q(a,o,Z+784)*t.length)];n.push({x:d,y:g,z:f,scale:[b,y,b],yaw:p,color:D(r,m),kind:e})}else{let e=.1+.30000000000000004*Math.min(1,h/1.6);if(Q(a,o,13140)>=e)continue;let t=Je[Math.floor(Q(a,o,Z+784)*Je.length)],r=.6+Q(a,o,Z+785)*.9,i=.6+Q(a,o,Z+786)*.9;n.push({x:d,y:g,z:f,scale:[i,r,i],yaw:p,color:D(t,m),kind:`rock`})}}for(let r=0;r<8;r++)for(let i=0;i<8;i++){let a=e*8+i,o=t*8+r;if(Q(a,o,13232)>=.7)continue;let s=Q(a,o,Z+888),c=Q(a,o,Z+889),l=e*16+i*2+s*2,u=t*16+r*2+c*2;if(de(l,u,.4)||fe(l,u,.36,.17))continue;let d=$(l,u);if(d>2)continue;let f=d*13,p=Q(a,o,Z+890)*Math.PI*2,m=.8+Q(a,o,Z+891)*.4,h=Ke[Math.floor(Q(a,o,Z+892)*Ke.length)],g=.8+Q(a,o,Z+893)*.6;n.push({x:l,y:f,z:u,scale:[g,g,g],yaw:p,color:D(h,m),kind:`grass`})}let r=16/3;for(let i=0;i<r;i++)for(let a=0;a<r;a++){let o=e*r+a,s=t*r+i;if(Q(o,s,13342)>=.35)continue;let c=Q(o,s,Z+998),l=Q(o,s,Z+999),u=e*16+a*3+c*3,d=t*16+i*3+l*3;if(de(u,d,.9)||fe(u,d,.44,.34))continue;let f=$(u,d);if(f>2)continue;let p=f*13,m=Q(o,s,Z+1e3)*Math.PI*2,h=.85+Q(o,s,Z+1001)*.3,g=qe[Math.floor(Q(o,s,Z+1002)*qe.length)],_=.9+Q(o,s,Z+1003)*.7;n.push({x:u,y:p,z:d,scale:[_,_,_],yaw:m,color:D(g,h),kind:`bush`})}return n}function O(){let e=[];for(let t of ue.values())e.push(...t);E.setDecor(e),window.__decorCount=e.length,window.__decorList=e}let k=new Set,A=new Set,j=[],he=null,ge=null;function _e(e,t,n=!1){let r=Math.floor(e/16),i=Math.floor(t/16);if(!n&&r===he&&i===ge)return;he=r,ge=i;let a=!1;for(let e=-3;e<=3;e++)for(let t=-3;t<=3;t++){let n=r+t,o=i+e,s=ce(n,o);k.has(s)||A.has(s)||(A.add(s),j.push({cx:n,cz:o,key:s}),a=!0)}let o=!1;for(let e of Array.from(k)){let[t,n]=e.split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>5&&(E.removeTerrainChunk(e),k.delete(e),ue.delete(e),o=!0)}for(let e of Array.from(A)){let[t,n]=e.split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>5&&(A.delete(e),a=!0)}a&&(j=j.filter(e=>A.has(e.key)),j.sort((e,t)=>(e.cx-r)**2+(e.cz-i)**2-((t.cx-r)**2+(t.cz-i)**2))),window.__terrainChunkCount=k.size,o&&O()}function ve(e){let t=!1;for(;j.length&&performance.now()<e;){let{cx:e,cz:n,key:r}=j.shift();if(!A.has(r))continue;A.delete(r);let i=e*16,a=n*16,o=rn(i,a,i+16,a+16,1);E.setTerrainChunk(r,o),k.add(r),le(e,n),ue.set(r,me(e,n)),t=!0}t&&(window.__terrainChunkCount=k.size,O())}function ye(e,t){let n=ce(e,t);if(!k.has(n))return;let r=e*16,i=t*16;E.setTerrainChunk(n,rn(r,i,r+16,i+16,1))}function be(e,t,n,r){let i=Math.floor(n/16),a=Math.floor(r/16),o=(i-3)*16,s=(i+3+1)*16,c=(a-3)*16,l=(a+3+1)*16,u=e*64,d=t*64;return u>=o&&u+64<=s&&d>=c&&d+64<=l}let M=new Set,N=new Set,P=[],F=null,I=null;function L(e,t,n=!1){let r=Math.floor(e/64),i=Math.floor(t/64);if(!n&&r===F&&i===I)return;F=r,I=i;let a=!1;for(let n=-5;n<=5;n++)for(let o=-5;o<=5;o++){let s=r+o,c=i+n,l=`far:`+s+`,`+c;M.has(l)||N.has(l)||be(s,c,e,t)||(N.add(l),P.push({cx:s,cz:c,rkey:l}),a=!0)}for(let n of Array.from(M)){let[a,o]=n.slice(4).split(`,`).map(Number),s=Math.max(Math.abs(a-r),Math.abs(o-i))>7,c=be(a,o,e,t);(s||c)&&(E.removeTerrainChunk(n),M.delete(n))}for(let e of Array.from(N)){let[t,n]=e.slice(4).split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>7&&(N.delete(e),a=!0)}a&&(P=P.filter(e=>N.has(e.rkey)),P.sort((e,t)=>(e.cx-r)**2+(e.cz-i)**2-((t.cx-r)**2+(t.cz-i)**2))),window.__farChunkCount=M.size}function xe(e){for(;P.length&&performance.now()<e;){let{cx:e,cz:t,rkey:n}=P.shift();if(!N.has(n))continue;N.delete(n);let r=e*64,i=t*64,a=rn(r,i,r+64,i+64,4,.35);E.setTerrainChunk(n,a),M.add(n)}window.__farChunkCount=M.size}let Se=_n(te,T,E.getShadowResources()),we=new Map;function R(e){let t=we.get(e);return t||(t=mn(e).then(e=>gn(te,e)),we.set(e,t)),t}let Te=new Set(Array.from(S,e=>m.get(e)));await Promise.allSettled(Array.from(Te,e=>R(e)));let Ee=new Map,De=0,z=0;for(let t of S){let n=f.x[t],r=f.y[t],i=Ve(n,$(n,r)*13,r,0,h.get(t)??5),a=m.get(t);try{let e=await R(a);Ee.set(t,Se.createInstance(e,i)),De++}catch(t){z++,e.push(`модель: ошибка на ${a} — ${t instanceof Error?t.message:String(t)}`)}}e.push(`модели: загружено ${De}/${S.length}${z?`, ошибок: `+z:``}`),jn(e),window.__ecsFound=S.length,window.__foundPositions=()=>S.map(e=>({x:f.x[e],z:f.y[e],scale:h.get(e)??5}));let B=a?a.x:n.x,Oe=a?a.y:n.y,V={yaw:0,pitch:.55,dist:42,target:[B,$(B,Oe)*13+2,Oe]},H=dn(w,V);_e(V.target[0],V.target[2],!0),L(V.target[0],V.target[2],!0);let U=performance.now()+40;ve(U),xe(U);let Ae=rn(-At,-600,At,600,12,1.2);E.setTerrainChunk(`world-backdrop`,Ae),e.push(`рельеф: чанков ${k.size} (16×16) + дальних ${M.size} (64×64, шаг 4) + задник (шаг 12, весь мир), в очереди ещё ${j.length+P.length}`),jn(e),window.__coverageCheck=(e,t)=>{for(let n of k){let[r,i]=n.split(`,`).map(Number),a=r*16,o=i*16;if(e>=a&&e<a+16&&t>=o&&t<o+16)return`near`}for(let n of M){let[r,i]=n.slice(4).split(`,`).map(Number),a=r*64,o=i*64;if(e>=a&&e<a+64&&t>=o&&t<o+64)return`far`}return null},Object.defineProperty(window,"cam",{value:{get tx(){return V.target[0]},set tx(e){V.target[0]=e,H.stopAuto()},get ty(){return V.target[1]},set ty(e){V.target[1]=e,H.stopAuto()},get tz(){return V.target[2]},set tz(e){V.target[2]=e,H.stopAuto()},get dist(){return V.dist},set dist(e){V.dist=e,H.stopAuto()},get pitch(){return V.pitch},set pitch(e){V.pitch=e,H.stopAuto()}}}),window.H=(e,t)=>$(e,t)*13,window.__camState=()=>({yaw:V.yaw,pitch:V.pitch,dist:V.dist,target:[...V.target]}),window.__isAutoOrbiting=()=>H.isAutoOrbiting();let Ne=document.getElementById(`coordX`),Pe=document.getElementById(`coordY`),Ie=document.getElementById(`coordGo`),Be=!1;for(let e of[Ne,Pe])e.addEventListener(`input`,()=>{Be=!0});function G(){let e=parseFloat(Ne.value),t=parseFloat(Pe.value);!isFinite(e)||!isFinite(t)||(V.target[0]=Math.max(-At,Math.min(At,e)),V.target[2]=Math.max(-600,Math.min(600,t)),V.target[1]=$(V.target[0],V.target[2])*13+2,H.stopAuto(),Be=!1)}Ie.addEventListener(`click`,G);for(let e of[Ne,Pe])e.addEventListener(`keydown`,t=>{t.key===`Enter`&&(t.preventDefault(),G(),e.blur())});let Ye=new Float32Array(16),K=[0,0,0],q=document.getElementById(`selected`),J=[.95,.78,.35],Xe=[.42,.78,.46],Ze=[.82,.24,.26],Qe=null,$e=null,et=null,tt=null;window.startFollowMarch=e=>{H.stopAuto(),tt=e},H.onInteract(()=>{tt=null});function nt(e){et=null,$e=e;let t=(g.get(e)??`?`)+` · `+(_.get(e)??`?`),n=f.x[e],r=f.y[e];Qe={x:n,y:$(n,r)*13+(h.get(e)??5)*.9+2,z:r,color:J},window.__markerActive=!0,window.__selectedLabel=t,q.textContent=t,q.style.display=`block`}function rt(){$e=null,Qe=null,window.__markerActive=!1,window.__selectedLabel=null,q.style.display=`none`}function it(e,t){let n=w.width/Math.max(1,w.height),r=Math.tan(ot/2),i=e/w.width*2-1,a=1-t/w.height*2,o=W(Fe(K,V.target)),s=W(Le([0,1,0],o)),c=Le(o,s),l=W([i*n*r*s[0]+a*r*c[0]-o[0],i*n*r*s[1]+a*r*c[1]-o[1],i*n*r*s[2]+a*r*c[2]-o[2]]);return{origin:K,dir:l}}function at(e,t,n,r){let i=e[0]-n[0],a=e[1]-n[1],o=e[2]-n[2],s=i*t[0]+a*t[1]+o*t[2],c=i*i+a*a+o*o-r*r,l=s*s-c;if(l<0)return null;let u=Math.sqrt(l),d=-s-u;return d<0&&(d=-s+u),d<0?null:d}let ot=.72;function st(e,t){let n=0;for(let r=2;r<=400;r+=2){let i=e[0]+t[0]*r;if(e[1]+t[1]*r-$(i,e[2]+t[2]*r)*13<=0){let i=n,a=r;for(let n=0;n<12;n++){let n=(i+a)/2,r=e[0]+t[0]*n,o=e[2]+t[2]*n;e[1]+t[1]*n-$(r,o)*13>0?i=n:a=n}return{t:a,x:e[0]+t[0]*a,z:e[2]+t[2]*a}}n=r}return null}function ct(e,t){try{let n=window.parent;n&&n!==window&&typeof n.renderCartoucheFor==`function`&&n.renderCartoucheFor(e,t)}catch{}}function lt(e){try{let t=window.parent;t&&t!==window&&typeof t.renderMarchCartoucheFor==`function`&&t.renderMarchCartoucheFor(e)}catch{}}function Y(e,t){let{origin:n,dir:r}=it(e,t),i=null,a=1/0;for(let e of S){let t=f.x[e],o=f.y[e],s=h.get(e)??5,c=at(n,r,[t,$(t,o)*13+s*.5,o],s);c!==null&&c<a&&(a=c,i={kind:`entity`,eid:e,t:c})}for(let e of X){let t=at(n,r,[e.x,$(e.x,e.y)*13+2.2,e.y],3);t!==null&&t<a&&(a=t,i={kind:`march`,march:e,t})}let o=st(n,r);return o!==null&&o.t<a&&(i={kind:`ground`,x:o.x,z:o.z,t:o.t},a=o.t),i}H.onTap((e,t)=>{let n=w.getBoundingClientRect(),r=Y((e-n.left)*(w.width/n.width),(t-n.top)*(w.height/n.height));if(r?.kind===`entity`){nt(r.eid);let e=y.get(r.eid);e&&ct(e.x,e.y);return}if(r?.kind===`march`){rt(),et=r.march.id,window.__selectedMarchId=r.march.id,lt(r.march.id);return}rt(),et=null,r?.kind===`ground`&&ct(Math.floor(r.x),Math.floor(r.z))});let ut=0;async function dt(){let e=wn(V.target[0],V.target[2],448);if(!e)return;let t=new Set,n=[],r=new Set;for(let i of e){t.add(i.key);let e=b.get(i.key);if(e!==void 0){if(g.set(e,i.nm),_.set(e,i.lv),v.set(e,!!i.own),$e===e&&nt(e),m.get(e)!==i.model){m.set(e,i.model),h.set(e,i.scale);let t=f.x[e],r=f.y[e],a=Ve(t,$(t,r)*13,r,0,i.scale);n.push(R(i.model).then(t=>void Ee.set(e,Se.createInstance(t,a))).catch(()=>{}))}continue}let a=x(i),o=$(i.x,i.y)*13,s=Ve(i.x,o,i.y,0,i.scale);n.push(R(i.model).then(e=>void Ee.set(a,Se.createInstance(e,s))).catch(()=>{})),r.add(ce(Math.floor(i.x/16),Math.floor(i.y/16))),ye(Math.floor(i.x/16),Math.floor(i.y/16))}for(let[e,n]of Array.from(b))t.has(e)||(r.add(ce(Math.floor(f.x[n]/16),Math.floor(f.y[n]/16))),Me(d,n),Ee.delete(n),m.delete(n),h.delete(n),g.delete(n),_.delete(n),v.delete(n),y.delete(n),b.delete(e),$e===n&&rt());await Promise.allSettled(n),S=Array.from(Ce(d,[f,p]));let i=!1;for(let e of r){if(!k.has(e))continue;let[t,n]=e.split(`,`).map(Number);ue.set(e,me(t,n)),i=!0}i&&O(),ut++,window.__ecsFound=S.length,window.__syncCount=ut}c&&setInterval(()=>{se()||dt().catch(e=>console.error(`live sync:`,e))},3e3);let X=[];function ft(){if(!c)return X=[],[];let e=On();return e?(X=e,window.__marchPositions=e,e.map(e=>({x:e.x,y:$(e.x,e.y)*13+2.2,z:e.y,color:e.own?Xe:Ze}))):(X=[],[])}let pt=document.getElementById(`labels`),mt=new Map,ht=1024;function gt(){let e=new Set,t=w.clientWidth,n=w.clientHeight;for(let r of S){let i=f.x[r],a=f.y[r],o=i-V.target[0],s=a-V.target[2];if(o*o+s*s>ht)continue;let c=$(i,a)*13+(h.get(r)??5)*.6+1.1,l=He(Ye,[i,c,a]);if(l.w<=.001)continue;let u=(l.x/l.w*.5+.5)*t,d=(1-(l.y/l.w*.5+.5))*n;if(u<-40||u>t+40||d<-40||d>n+40)continue;e.add(r);let p=mt.get(r);if(!p){let e=document.createElement(`div`);e.className=`wlabel`;let t=document.createElement(`div`);t.className=`nm`;let n=document.createElement(`div`);n.className=`lv`,e.appendChild(t),e.appendChild(n),pt.appendChild(e),p={root:e,nm:t,lv:n},mt.set(r,p)}p.nm.textContent=g.get(r)??`?`,p.nm.classList.toggle(`mine`,!!v.get(r)),p.lv.textContent=_.get(r)??``,p.root.style.transform=`translate(${u.toFixed(1)}px,${d.toFixed(1)}px) translate(-50%,-100%)`}for(let[t,n]of mt)e.has(t)||(n.root.remove(),mt.delete(t))}let _t=new Map;function vt(e,t,n,r){if(!r||!n||r<=n)return t;let i=Math.max(0,Math.min(1,(Date.now()-n)/(r-n)));return e+(t-e)*i}function yt(){let e=new Set,t=w.clientWidth,n=w.clientHeight;for(let r of X){let i=r.battle;if(!i)continue;let a=r.x-V.target[0],o=r.y-V.target[2];if(a*a+o*o>ht)continue;let s=$(r.x,r.y)*13+2.2+1.6,c=He(Ye,[r.x,s,r.y]);if(c.w<=.001)continue;let l=(c.x/c.w*.5+.5)*t,u=(1-(c.y/c.w*.5+.5))*n;if(l<-60||l>t+60||u<-60||u>n+60)continue;e.add(r.id);let d=_t.get(r.id);if(!d){let e=document.createElement(`div`);e.className=`blabel`;let t=document.createElement(`div`);t.className=`btitle`;let n=document.createElement(`div`);n.className=`bbar atk`;let i=document.createElement(`i`);n.appendChild(i);let a=document.createElement(`div`);a.className=`bbar def`;let o=document.createElement(`i`);a.appendChild(o),e.appendChild(t),e.appendChild(n),e.appendChild(a),pt.appendChild(e),d={root:e,title:t,atkFill:i,defFill:o},_t.set(r.id,d)}let f=i.retreating,p=!f&&i.revealFromRound===0;d.root.className=`blabel`+(f?` retreat`:p?` deploy`:``),d.title.textContent=f?`Отступление`:p?`Развёртывание`:`Бой — раунд `+i.round;let m=Math.max(0,Math.min(100,vt(i.revealFromAttHp,i.attHpLeft,i.revealStart,i.revealAt)/Math.max(1,i.attStartHp)*100)),h=Math.max(0,Math.min(100,vt(i.revealFromDefHp,i.defHpLeft,i.revealStart,i.revealAt)/Math.max(1,i.defStartHp)*100));d.atkFill.style.width=m.toFixed(1)+`%`,d.defFill.style.width=h.toFixed(1)+`%`,d.root.style.transform=`translate(${l.toFixed(1)}px,${u.toFixed(1)}px) translate(-50%,-100%)`}for(let[t,n]of _t)e.has(t)||(n.root.remove(),_t.delete(t))}function bt(e){if(se()){requestAnimationFrame(bt);return}H.isAutoOrbiting()&&(V.yaw=e*15e-5),H.update(e);let t=ft();if(tt!==null){let e=X.find(e=>e.id===tt);e?(V.target[0]=e.x,V.target[2]=e.y,V.target[1]=$(e.x,e.y)*13+1):tt=null}Be||(Ne.value=V.target[0].toFixed(1),Pe.value=V.target[2].toFixed(1)),_e(V.target[0],V.target[2]),L(V.target[0],V.target[2]);let n=performance.now()+6;ve(n),xe(n);let a=[V.target[0]+Math.sin(V.yaw)*Math.cos(V.pitch)*V.dist,V.target[1]+Math.sin(V.pitch)*V.dist,V.target[2]+Math.cos(V.yaw)*Math.cos(V.pitch)*V.dist],o=$(a[0],a[2])*13+2;a[1]<o&&(a[1]=o);let s=w.width/Math.max(1,w.height),c=Re(ze(ot,s,.5,300),Ue(a,V.target,[0,1,0]));Ye=c,K=a,E.setVP(c),E.setFog(a,r,i,e/1e3),E.setSunTarget(V.target[0],V.target[2]);{let t=W(Fe(a,V.target)),n=W(Le([0,1,0],t)),r=Le(t,n);E.setSkyCamera(n,r,t,Math.tan(ot/2),s,e/1e3)}if(Se.setFog(a,r,i),et!==null){let e=X.find(e=>e.id===et);e?Qe={x:e.x,y:$(e.x,e.y)*13+3.2,z:e.y,color:J}:(et=null,Qe=null)}Qe&&t.push(Qe),E.setMarkers(t),window.__marchCount=t.length-+!!Qe,E.frame({r:r[0],g:r[1],b:r[2],a:1},e=>{for(let t of S){let n=Ee.get(t);n&&Se.draw(e,n,c)}}),gt(),yt(),requestAnimationFrame(bt)}requestAnimationFrame(bt),window.__engineReady=!0}Nn().catch(e=>{Mn([`Ошибка: ${e instanceof Error?e.message:String(e)}`]),console.error(e)});