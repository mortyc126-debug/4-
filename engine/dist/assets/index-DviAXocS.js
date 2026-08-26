(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=(e,t,n)=>Object.defineProperty(e,t,{value:n,enumerable:!1,writable:!0,configurable:!0}),t=(e,t)=>t&e.entityMask,n=(e,t)=>t>>>e.versionShift&(1<<e.versionBits)-1,r=(e,t)=>{let r=n(e,t)+1&(1<<e.versionBits)-1;return t&e.entityMask|r<<e.versionShift},i=e=>{let t=e?typeof e==`function`?e():e:{versioning:!1,versionBits:8},n=t.versionBits??8,r=t.versioning??!1,i=32-n,a=(1<<i)-1,o=i;return{aliveCount:0,dense:[],sparse:[],maxId:0,versioning:r,versionBits:n,entityMask:a,versionShift:o,versionMask:(1<<n)-1<<o}},a=e=>{if(e.aliveCount<e.dense.length){let t=e.dense[e.aliveCount],n=t;return e.sparse[n]=e.aliveCount,e.aliveCount++,t}let t=++e.maxId;return e.dense.push(t),e.sparse[t]=e.aliveCount,e.aliveCount++,t},o=(e,t)=>{let n=e.sparse[t];if(n===void 0||n>=e.aliveCount)return;let i=e.aliveCount-1,a=e.dense[i];if(e.sparse[a]=n,e.dense[n]=a,e.sparse[t]=i,e.dense[i]=t,e.versioning){let n=r(e,t);e.dense[i]=n}e.aliveCount--},s=(e,n)=>{let r=t(e,n),i=e.sparse[r];return i!==void 0&&i<e.aliveCount&&e.dense[i]===n},c=Symbol.for(`bitecs_internal`),l=(t,n)=>e(t||{},c,{entityIndex:n||i(),entityMasks:[[]],entityComponents:new Map,bitflag:1,componentMap:new Map,componentCount:0,queries:new Set,queriesHashMap:new Map,notQueries:new Set,dirtyQueries:new Set,entitiesWithRelations:new Set,hierarchyData:new Map,hierarchyActiveRelations:new Set,hierarchyQueryCache:new Map});function u(...e){let t,n;return e.forEach(e=>{typeof e==`object`&&`dense`in e&&`sparse`in e&&`aliveCount`in e?t=e:typeof e==`object`&&(n=e)}),l(n,t)}var d=()=>{let e=[],t=[],n=n=>e[t[n]]===n;return{add:r=>{n(r)||(t[r]=e.push(r)-1)},remove:r=>{if(!n(r))return;let i=t[r],a=e.pop();a!==r&&(e[i]=a,t[a]=i)},has:n,sparse:t,dense:e,reset:()=>{e.length=0,t.length=0},sort:n=>{e.sort(n);for(let n=0;n<e.length;n++)t[e[n]]=n}}},f=typeof SharedArrayBuffer<`u`?SharedArrayBuffer:ArrayBuffer,p=(e=1e3)=>{let t=[],n=0,r=new Uint32Array(new f(e*4)),i=e=>e<t.length&&t[e]<n&&r[t[e]]===e;return{add:e=>{if(!i(e)){if(n>=r.length){let e=new Uint32Array(new f(r.length*2*4));e.set(r),r=e}r[n]=e,t[e]=n,n++}},remove:e=>{if(!i(e))return;n--;let a=t[e],o=r[n];r[a]=o,t[o]=a},has:i,sparse:t,get dense(){return new Uint32Array(r.buffer,0,n)},reset:()=>{n=0,t.length=0},sort:e=>{let i=Array.from(r.subarray(0,n));i.sort(e);for(let e=0;e<i.length;e++)r[e]=i[e];for(let e=0;e<n;e++)t[r[e]]=e}}},m=()=>{let e=new Set;return{subscribe:t=>(e.add(t),()=>{e.delete(t)}),notify:(t,...n)=>Array.from(e).reduce((e,r)=>{let i=r(t,...n);return i&&typeof i==`object`?{...e,...i}:e},{})}},h=Symbol.for(`bitecs-relation`),g=Symbol.for(`bitecs-pairTarget`),_=Symbol.for(`bitecs-isPairComponent`),v=Symbol.for(`bitecs-relationData`),y=()=>{let t={pairsMap:new Map,initStore:void 0,exclusiveRelation:!1,autoRemoveSubject:!1,onTargetRemoved:void 0},n=r=>{if(r===void 0)throw Error(`Relation target is undefined`);let i=r===`*`?w:r;if(!t.pairsMap.has(i)){let a=t.initStore?t.initStore(r):{};e(a,h,n),e(a,g,i),e(a,_,!0),t.pairsMap.set(i,a)}return t.pairsMap.get(i)};return e(n,v,t),n},b=(e,t)=>{if(e===void 0)throw Error(`Relation is undefined`);return e(t)},x=(e,t,n)=>{let r=Re(e,t),i=[];for(let e of r)e[h]===n&&e[g]!==w&&!ie(e[g])&&i.push(e[g]);return i},S=Symbol.for(`bitecs-wildcard`);function ee(){let e=y();return Object.defineProperty(e,S,{value:!0,enumerable:!1,writable:!1,configurable:!1}),e}function C(){let e=Symbol.for(`bitecs-global-wildcard`);return globalThis[e]||(globalThis[e]=ee()),globalThis[e]}var w=C();function te(){return y()}function ne(){let e=Symbol.for(`bitecs-global-isa`);return globalThis[e]||(globalThis[e]=te()),globalThis[e]}var re=ne();function ie(e){return e?Object.getOwnPropertySymbols(e).includes(v):!1}var ae=64,T=4294967295,oe=1024;function se(e,t){let{depths:n}=e;if(t<n.length)return n;let r=Math.max(t+1,n.length*2,n.length+oe),i=new Uint32Array(r);return i.fill(T),i.set(n),e.depths=i,i}function ce(e,t,n,r){let{depthToEntities:i}=e;if(r!==void 0&&r!==T){let e=i.get(r);e&&(e.remove(t),e.dense.length===0&&i.delete(r))}n!==T&&(i.has(n)||i.set(n,p()),i.get(n).add(t))}function le(e,t){t>e.maxDepth&&(e.maxDepth=t)}function ue(e,t,n,r){e.depths[t]=n,ce(e,t,n,r),le(e,n)}function E(e,t){e[c].hierarchyQueryCache.delete(t)}function de(e,t){let n=e[c];return n.hierarchyActiveRelations.has(t)||(n.hierarchyActiveRelations.add(t),pe(e,t),fe(e,t)),n.hierarchyData.get(t)}function fe(e,t){let n=Oe(e,[b(t,w)]);for(let r of n)ge(e,t,r);let r=new Set;for(let i of n)for(let n of x(e,i,t))r.has(n)||(r.add(n),ge(e,t,n))}function pe(e,t){let n=e[c];if(!n.hierarchyData.has(t)){let e=Math.max(oe,n.entityIndex.dense.length*2),r=new Uint32Array(e);r.fill(T),n.hierarchyData.set(t,{depths:r,dirty:d(),depthToEntities:new Map,maxDepth:0})}}function me(e,t,n,r=new Set){if(r.has(n))return 0;r.add(n);let i=x(e,n,t);if(i.length===0)return 0;if(i.length===1)return he(e,t,i[0],r)+1;let a=1/0;for(let n of i){let i=he(e,t,n,r);if(i<a&&(a=i,a===0))break}return a===1/0?0:a+1}function he(e,t,n,r){let i=e[c];pe(e,t);let a=i.hierarchyData.get(t),{depths:o}=a;if(o=se(a,n),o[n]===T){let i=me(e,t,n,r);return ue(a,n,i),i}return o[n]}function ge(e,t,n){return he(e,t,n,new Set)}function _e(e,t,n,r,i=d()){if(i.has(n))return;i.add(n);let a=Oe(e,[t(n)]);for(let n of a)r.add(n),_e(e,t,n,r,i)}function ve(e,t,n,r,i=new Set){let a=e[c];if(!a.hierarchyActiveRelations.has(t))return;pe(e,t);let o=a.hierarchyData.get(t);if(i.has(n)){o.dirty.add(n);return}i.add(n);let{depths:s,dirty:l}=o,u=r===void 0?0:ge(e,t,r)+1;if(u>ae)return;let f=s[n];ue(o,n,u,f===T?void 0:f),f!==u&&(_e(e,t,n,l,d()),E(e,t))}function ye(e,t,n){let r=e[c];if(!r.hierarchyActiveRelations.has(t))return;let i=r.hierarchyData.get(t),{depths:a}=i;a=se(i,n),be(e,t,n,a,d()),E(e,t)}function be(e,t,n,r,i){if(i.has(n))return;i.add(n);let a=e[c].hierarchyData.get(t);if(n<r.length){let e=r[n];e!==T&&(a.depths[n]=T,ce(a,n,T,e))}let o=Oe(e,[t(n)]);for(let n of o)be(e,t,n,r,i)}function xe(e,t){let n=e[c].hierarchyData.get(t);if(!n)return;let{dirty:r,depths:i}=n;if(r.dense.length!==0){for(let a of r.dense)i[a]===T&&ue(n,a,me(e,t,a));r.reset()}}function Se(e,t,n,r={}){let i=e[c];de(e,t);let a=De(e,[t,...n]),o=i.hierarchyQueryCache.get(t);if(o&&o.hash===a)return o.result;xe(e,t),M(e,n,r);let s=i.queriesHashMap.get(De(e,n)),{depths:l}=i.hierarchyData.get(t);s.sort((e,t)=>{let n=l[e],r=l[t];return n===r?e-t:n-r});let u=(r.buffered,s.dense);return i.hierarchyQueryCache.set(t,{hash:a,result:u}),u}function D(e,t,n,r={}){let i=de(e,t);xe(e,t);let a=i.depthToEntities.get(n);return a?(r.buffered,a.dense):r.buffered?new Uint32Array:[]}var O=Symbol.for(`bitecs-opType`),k=Symbol.for(`bitecs-opTerms`),Ce=Symbol.for(`bitecs-hierarchyType`),A=Symbol.for(`bitecs-hierarchyRel`),we=Symbol.for(`bitecs-hierarchyDepth`),Te=Symbol.for(`bitecs-modifierType`),Ee={[Te]:`nested`},De=(e,t)=>{let n=e[c],r=t=>(n.componentMap.has(t)||F(e,t),n.componentMap.get(t).id),i=e=>O in e?`${e[O].toLowerCase()}(${e[k].map(i).sort().join(`,`)})`:r(e).toString();return t.map(i).sort().join(`-`)},j=(e,t,n={})=>{let r=e[c],i=De(e,t),a=[],o=t=>{O in t?t[k].forEach(o):(r.componentMap.has(t)||F(e,t),a.push(t))};t.forEach(o);let s=[],l=[],u=[],f=(t,n)=>{n.forEach(n=>{r.componentMap.has(n)||F(e,n),t.push(n)})};t.forEach(t=>{if(O in t){let{[O]:e,[k]:n}=t;if(e===`Not`)f(l,n);else if(e===`Or`)f(u,n);else if(e===`And`)f(s,n);else throw Error(`Nested combinator ${e} not supported yet - use simple queries for best performance`)}else r.componentMap.has(t)||F(e,t),s.push(t)});let h=a.map(e=>r.componentMap.get(e)),g=[...new Set(h.map(e=>e.generationId))],_=(e,t)=>(e[t.generationId]=(e[t.generationId]||0)|t.bitflag,e),v=s.map(e=>r.componentMap.get(e)).reduce(_,{}),y=l.map(e=>r.componentMap.get(e)).reduce(_,{}),b=u.map(e=>r.componentMap.get(e)).reduce(_,{}),x=h.reduce(_,{}),S=Object.assign(n.buffered?p():d(),{allComponents:a,orComponents:u,notComponents:l,masks:v,notMasks:y,orMasks:b,hasMasks:x,generations:g,toRemove:d(),addObservable:m(),removeObservable:m(),queues:{}});r.queries.add(S),r.queriesHashMap.set(i,S),h.forEach(e=>{e.queries.add(S)}),l.length&&r.notQueries.add(S);let ee=r.entityIndex;for(let t=0;t<ee.aliveCount;t++){let n=ee.dense[t];I(e,n,Fe)||N(e,S,n)&&ke(S,n)}return S};function M(e,t,n={}){let r=e[c],i=De(e,t),a=r.queriesHashMap.get(i);return a?n.buffered&&!(`buffer`in a.dense)&&(a=j(e,t,{buffered:!0})):a=j(e,t,n),n.buffered,a.dense}function Oe(e,t,...n){let r=t.find(e=>e&&typeof e==`object`&&Ce in e),i=t.filter(e=>!(e&&typeof e==`object`&&Ce in e)),a=!1,o=!0,s=n.some(e=>e&&typeof e==`object`&&Te in e);for(let e of n)if(s&&e&&typeof e==`object`&&Te in e){let t=e;t[Te]===`buffer`&&(a=!0),t[Te]===`nested`&&(o=!1)}else if(!s){let t=e;t.buffered!==void 0&&(a=t.buffered),t.commit!==void 0&&(o=t.commit)}if(r){let{[A]:t,[we]:n}=r;return n===void 0?Se(e,t,i,{buffered:a}):D(e,t,n,{buffered:a})}return o&&je(e),M(e,i,{buffered:a})}function N(e,t,n){let r=e[c],{masks:i,notMasks:a,orMasks:o,generations:s}=t,l=Object.keys(o).length===0;for(let e=0;e<s.length;e++){let t=s[e],c=i[t],u=a[t],d=o[t],f=r.entityMasks[t][n];if(u&&f&u||c&&(f&c)!==c)return!1;d&&f&d&&(l=!0)}return l}var ke=(e,t)=>{if(e.toRemove.has(t)){e.toRemove.remove(t),e.addObservable.notify(t);return}e.has(t)||(e.add(t),e.addObservable.notify(t))},Ae=e=>{for(let t=0;t<e.toRemove.dense.length;t++){let n=e.toRemove.dense[t];e.remove(n)}e.toRemove.reset()},je=e=>{let t=e[c];t.dirtyQueries.size&&(t.dirtyQueries.forEach(Ae),t.dirtyQueries.clear())},P=(e,t,n)=>{let r=e[c];!t.has(n)||t.toRemove.has(n)||(t.toRemove.add(n),r.dirtyQueries.add(t),t.removeObservable.notify(n))},F=(e,t)=>{if(!t)throw Error(`bitECS - Cannot register null or undefined component`);let n=e[c],r=new Set,i={id:n.componentCount++,generationId:n.entityMasks.length-1,bitflag:n.bitflag,ref:t,queries:r,setObservable:m(),getObservable:m()};return n.componentMap.set(t,i),n.bitflag*=2,n.bitflag>=2**31&&(n.bitflag=1,n.entityMasks.push([])),i},I=(e,t,n)=>{let r=e[c],i=r.componentMap.get(n);if(!i)return!1;let{generationId:a,bitflag:o}=i;return(r.entityMasks[a][t]&o)===o},Me=(e,t,n)=>{let r=e[c].componentMap.get(n);if(r&&I(e,t,n))return r.getObservable.notify(t)},Ne=(e,t,n,r,i=new Set)=>{if(!i.has(r)){i.add(r),Pe(t,n,re(r));for(let i of Re(t,r))if(i!==Fe&&!I(t,n,i)){Pe(t,n,i);let a=e.componentMap.get(i);if(a?.setObservable){let e=Me(t,r,i);a.setObservable.notify(n,e)}}for(let a of x(t,r,re))Ne(e,t,n,a,i)}},Pe=(e,t,n)=>{if(!ze(e,t))throw Error(`Cannot add component - entity ${t} does not exist in the world.`);let r=e[c],i=`component`in n?n.component:n,a=`data`in n?n.data:void 0;r.componentMap.has(i)||F(e,i);let o=r.componentMap.get(i);if(I(e,t,i))return a!==void 0&&o.setObservable.notify(t,a),!1;let{generationId:s,bitflag:l,queries:u}=o;if(r.entityMasks[s][t]|=l,I(e,t,Fe)||u.forEach(n=>{N(e,n,t)?ke(n,t):P(e,n,t)}),r.entityComponents.get(t).add(i),a!==void 0&&o.setObservable.notify(t,a),i[_]){let n=i[h],a=i[g];if(L(e,t,b(n,w),b(w,a)),typeof a==`number`&&(L(e,a,b(w,t),b(w,n)),r.entitiesWithRelations.add(a),r.entitiesWithRelations.add(t)),r.entitiesWithRelations.add(a),n[v].exclusiveRelation===!0&&a!==w){let r=x(e,t,n)[0];r!=null&&r!==a&&R(e,t,n(r))}if(n===re){let n=x(e,t,re);for(let i of n)Ne(r,e,t,i)}ve(e,n,t,typeof a==`number`?a:void 0)}return!0};function L(e,t,...n){(Array.isArray(n[0])?n[0]:n).forEach(n=>{Pe(e,t,n)})}var R=(e,t,...n)=>{let r=e[c];if(!ze(e,t))throw Error(`Cannot remove component - entity ${t} does not exist in the world.`);n.forEach(n=>{if(!I(e,t,n))return;let{generationId:i,bitflag:a,queries:o}=r.componentMap.get(n);if(r.entityMasks[i][t]&=~a,o.forEach(n=>{n.toRemove.remove(t),N(e,n,t)?ke(n,t):P(e,n,t)}),r.entityComponents.get(t).delete(n),n[_]){let r=n[g],i=n[h];ye(e,i,t),R(e,t,b(w,r)),typeof r==`number`&&ze(e,r)&&(R(e,r,b(w,t)),R(e,r,b(w,i))),x(e,t,i).length===0&&R(e,t,b(i,w))}})},Fe={};function Ie(e,...t){let n=e[c],r=a(n.entityIndex);return n.notQueries.forEach(t=>{N(e,t,r)&&ke(t,r)}),n.entityComponents.set(r,new Set),t.length>0&&L(e,r,t),r}var Le=(e,t)=>{let n=e[c];if(!s(n.entityIndex,t))return;let r=[t],i=new Set;for(;r.length>0;){let t=r.shift();if(i.has(t))continue;i.add(t);let a=[];if(n.entitiesWithRelations.has(t)){for(let i of Oe(e,[w(t)],Ee))if(ze(e,i))for(let o of n.entityComponents.get(i)){if(!o[_])continue;let n=o[h][v];a.push(()=>R(e,i,b(w,t))),o[g]===t&&(a.push(()=>R(e,i,o)),n.autoRemoveSubject&&r.push(i),n.onTargetRemoved&&a.push(()=>n.onTargetRemoved(e,i,t)))}n.entitiesWithRelations.delete(t)}for(let e of a)e();for(let t of r)Le(e,t);for(let r of n.queries)P(e,r,t);o(n.entityIndex,t),n.entityComponents.delete(t);for(let e=0;e<n.entityMasks.length;e++)n.entityMasks[e][t]=0}},Re=(e,t)=>{let n=e[c];if(t===void 0)throw Error(`getEntityComponents: entity id is undefined.`);if(!s(n.entityIndex,t))throw Error(`getEntityComponents: entity ${t} does not exist in the world.`);return Array.from(n.entityComponents.get(t))},ze=(e,t)=>s(e[c].entityIndex,t),Be=(e,t)=>[e[0]-t[0],e[1]-t[1],e[2]-t[2]],z=(e,t)=>e[0]*t[0]+e[1]*t[1]+e[2]*t[2],Ve=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],B=e=>{let t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]};function He(e,t){let n=new Float32Array(16);for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=0;for(let n=0;n<4;n++)a+=e[n*4+i]*t[r*4+n];n[r*4+i]=a}return n}function Ue(e,t,n,r){let i=1/Math.tan(e/2);return new Float32Array([i/t,0,0,0,0,i,0,0,0,0,(r+n)/(n-r),-1,0,0,2*r*n/(n-r),0])}function V(e,t,n,r,i,a){return new Float32Array([2/(t-e),0,0,0,0,2/(r-n),0,0,0,0,1/(i-a),0,-(t+e)/(t-e),-(r+n)/(r-n),i/(i-a),1])}function We(e,t,n,r,i){let a=Math.cos(r),o=Math.sin(r);return new Float32Array([a*i,0,-o*i,0,0,i,0,0,o*i,0,a*i,0,e,t,n,1])}function Ge(){return{x:0,y:0,z:0,w:0}}function Ke(e,t,n,r,i){return i.x=e[0]*t+e[4]*n+e[8]*r+e[12],i.y=e[1]*t+e[5]*n+e[9]*r+e[13],i.z=e[2]*t+e[6]*n+e[10]*r+e[14],i.w=e[3]*t+e[7]*n+e[11]*r+e[15],i}function qe(e,t){let[n,r,i]=t;return{x:e[0]*n+e[4]*r+e[8]*i+e[12],y:e[1]*n+e[5]*r+e[9]*i+e[13],z:e[2]*n+e[6]*r+e[10]*i+e[14],w:e[3]*n+e[7]*r+e[11]*i+e[15]}}function Je(e,t,n){let r=B(Be(e,t)),i=B(Ve(n,r)),a=Ve(r,i);return new Float32Array([i[0],a[0],r[0],0,i[1],a[1],r[1],0,i[2],a[2],r[2],0,-z(i,e),-z(a,e),-z(r,e),1])}var Ye=[[.78,.9,.8],[.85,1,.88],[.72,.84,.76],[.9,1,.92],[.8,.94,.9],[.88,.98,.8]],Xe=[[.85,.95,.78],[.92,1,.85],[.8,.9,.76],[1,.94,.78],[.88,.82,.7],[.86,1,.9],[1,.92,.8]],Ze=[[1,1.15,.95],[1.05,1.15,1],[.92,1.05,.9],[1.15,1.15,1]],Qe=[[.78,.9,.76],[.85,.98,.82],[.72,.86,.74],[.9,1,.88],[.8,.94,.86]],$e=[[.92,.9,.86],[1,.98,.92],[.84,.84,.82],[.96,.9,.82]];function et(e,t,n,r,i,a,o,s,c,l,u=[.5,.5],d=[.5,.5],f=[.5,.5]){let p=B(Ve(Be(o,a),Be(s,a))),m=[[a,u],[o,d],[s,f]];for(let[a,o]of m)e.push(a[0],a[1],a[2]),t.push(p[0],p[1],p[2]),n.push(c),r.push(l),i.push(o[0],o[1])}function tt(e,t,n,r,i,a,o,s,c,l,u,d){let f=l,p=l+c,m=[],h=[];for(let e=0;e<=a;e++){let t=e/a*Math.PI*2;m.push([Math.cos(t)*o,f,Math.sin(t)*o]),h.push([Math.cos(t)*s,p,Math.sin(t)*s])}for(let o=0;o<a;o++){let s=o/a,c=(o+1)/a;et(e,t,n,r,i,m[o],m[o+1],h[o+1],u,d,[s,0],[c,0],[c,1]),et(e,t,n,r,i,m[o],h[o+1],h[o],u,d,[s,0],[c,1],[s,1])}}function H(e,t,n,r,i,a,o,s,c,l,u,d=0,f=0){if(f>0){let e=(c-s)*f;s-=e,c-=e}for(let f=0;f<a;f++){let p=f/a*Math.PI,m=Math.cos(p),h=Math.sin(p),g=[d-m*o,s,-h*o],_=[d+m*o,s,h*o],v=[d-m*o,c,-h*o],y=[d+m*o,c,h*o];et(e,t,n,r,i,g,_,y,l,u,[0,1],[1,1],[1,0]),et(e,t,n,r,i,g,y,v,l,u,[0,1],[1,0],[0,0])}}var U=()=>({positions:[],normals:[],materialIds:[],shades:[],uvs:[]}),W=e=>({positions:new Float32Array(e.positions),normals:new Float32Array(e.normals),materialIds:new Float32Array(e.materialIds),shades:new Float32Array(e.shades),uvs:new Float32Array(e.uvs),vertexCount:e.positions.length/3});function nt(){let e=U();return tt(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.1,.06,.45,0,0,1),H(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.85,.3,2.7,1,1),W(e)}function rt(){let e=U();return tt(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.11,.07,.7,0,0,1),H(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,1.15,.25,2.15,1,1),W(e)}function it(){let e=U();return tt(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.14,.09,.8,0,0,1),H(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,1.3,.65,2.55,1,1),W(e)}function at(){let e=U();return tt(e.positions,e.normals,e.materialIds,e.shades,e.uvs,6,.075,.045,.95,0,0,1),H(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.95,.7,2.35,1,1),W(e)}function ot(){let e=U();tt(e.positions,e.normals,e.materialIds,e.shades,e.uvs,6,.09,.035,1.4,0,0,.62);let t=(t,n,r,i)=>{let a=Math.cos(t)*Math.cos(n),o=Math.sin(t)*Math.cos(n),s=Math.sin(n),c=[0,r,0],l=[a*i,r+s*i,o*i],u=[-o,0,a],d=.03;et(e.positions,e.normals,e.materialIds,e.shades,e.uvs,[c[0]+u[0]*d,c[1],c[2]+u[2]*d],[c[0]-u[0]*d,c[1],c[2]-u[2]*d],l,0,.62);let f=[l[0]*.55,l[1]*.55+r*.45,l[2]*.55],p=[l[0]+a*i*.4-o*.15,l[1]+s*i*.4+.1,l[2]+o*i*.4+a*.15];et(e.positions,e.normals,e.materialIds,e.shades,e.uvs,[f[0]+u[0]*d*.6,f[1],f[2]+u[2]*d*.6],[f[0]-u[0]*d*.6,f[1],f[2]-u[2]*d*.6],p,0,.62)};return t(.4,.5,1.5,.6),t(2.2,.32,1.75,.5),t(3.8,.55,1.95,.46),t(5.1,.4,2.1,.4),t(1.6,.65,2.25,.34),W(e)}var st=91/768;function ct(){let e=U();return H(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.55,0,.72,1,1,0,st),W(e)}var lt=32/768;function ut(){let e=U();return H(e.positions,e.normals,e.materialIds,e.shades,e.uvs,2,.4,0,.62,1,1,-.14,lt),H(e.positions,e.normals,e.materialIds,e.shades,e.uvs,2,.32,0,.5,1,.92,.16,lt),W(e)}function dt(e,t){return B([e[0]+t[0],e[1]+t[1],e[2]+t[2]])}function ft(e,t){let n=Math.sin(e[0]*12.9898+e[1]*78.233+e[2]*37.719+t*91.7)*43758.5453;return n-Math.floor(n)}function G(e){return[.5+Math.atan2(e[2],e[0])/(2*Math.PI),.5-Math.asin(Math.max(-1,Math.min(1,e[1])))/Math.PI]}function pt(){let e=[1,0,0],t=[-1,0,0],n=[0,1,0],r=[0,-1,0],i=[0,0,1],a=[0,0,-1];return[[e,n,i],[i,n,t],[t,n,a],[a,n,e],[e,i,r],[i,t,r],[t,a,r],[a,e,r]]}function mt(e){let t=[];for(let[n,r,i]of e){let e=dt(n,r),a=dt(r,i),o=dt(i,n);t.push([n,e,o],[e,r,a],[o,a,i],[e,a,o])}return t}function ht(e,t,n,r,i,a,o,s){let c=pt();for(let e=0;e<t;e++)c=mt(c);let l=e=>{let t=a*(.8+ft(e,s)*.45);return[n+e[0]*t,r+e[1]*t*o,i+e[2]*t]};for(let[t,n,r]of c){let i=.82+ft(t,s+3)*.36;et(e.positions,e.normals,e.materialIds,e.shades,e.uvs,l(t),l(n),l(r),1,i,G(t),G(n),G(r))}}function gt(){let e=U(),t=.68,n=.5;ht(e,2,0,n*t,0,n,t,1);let r=.24;return ht(e,1,.48,r*t*.9,.1,r,t,2),ht(e,1,-.4,r*t*.8,-.34,r*.85,t,3),W(e)}async function K(e,t,n=1024){let r=await(await fetch(t)).blob(),i=await createImageBitmap(r,{premultiplyAlpha:`none`}),a=Math.min(1,n/Math.max(i.width,i.height)),o=a<1?await createImageBitmap(i,{resizeWidth:Math.round(i.width*a),resizeHeight:Math.round(i.height*a),resizeQuality:`medium`,premultiplyAlpha:`none`}):i;a<1&&i.close();let s=e.createTexture({size:[o.width,o.height],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return e.queue.copyExternalImageToTexture({source:o},{texture:s},[o.width,o.height]),o.close(),s}var _t=class{sink;floatsPerChunk=0;vertsPerChunk=0;capacityChunks=0;order=[];slotOf=new Map;dataOf=new Map;vertexCount=0;constructor(e){this.sink=e}has(e){return this.slotOf.has(e)}put(e,t,n){this.floatsPerChunk!==t.length&&this.restride(t.length,n),this.dataOf.set(e,t);let r=this.slotOf.get(e);r===void 0&&(r=this.order.length,r+1>this.capacityChunks&&this.grow(r+1),this.order.push(e),this.slotOf.set(e,r)),this.sink.write(r*this.floatsPerChunk*4,t),this.vertexCount=this.order.length*this.vertsPerChunk}remove(e){let t=this.slotOf.get(e);if(this.dataOf.delete(e),t===void 0)return;let n=this.order.length-1;if(t!==n){let e=this.order[n];this.order[t]=e,this.slotOf.set(e,t);let r=this.dataOf.get(e);r&&this.sink.write(t*this.floatsPerChunk*4,r)}this.order.pop(),this.slotOf.delete(e),this.vertexCount=this.order.length*this.vertsPerChunk}grow(e){let t=Math.max(e,Math.ceil(this.capacityChunks*1.5),8);this.capacityChunks=t,this.sink.createBuffer(t*this.floatsPerChunk*4);for(let e=0;e<this.order.length;e++){let t=this.dataOf.get(this.order[e]);t&&this.sink.write(e*this.floatsPerChunk*4,t)}}restride(e,t){let n=this.order.slice();if(this.floatsPerChunk=e,this.vertsPerChunk=t,this.capacityChunks=0,this.order=[],this.slotOf=new Map,this.vertexCount=0,n.length){this.grow(n.length);for(let t of n){let n=this.dataOf.get(t);if(!n||n.length!==e)continue;let r=this.order.length;this.order.push(t),this.slotOf.set(t,r),this.sink.write(r*e*4,n)}this.vertexCount=this.order.length*this.vertsPerChunk}}},vt=(()=>{let[e,t,n]=[.62,.38,.3],r=Math.hypot(e,t,n);return[e/r,t/r,n/r]})(),yt=2048,bt=60,xt=100,St=1,Ct=220,wt=`
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
// Линии границ регионов (worldgen/regions/PLAN.md — черновая механика
// альянсовых крепостей, самой механики в игре ещё нет вообще, это только
// визуальная примерка "как будут смотреться линии на настоящей карте", по
// прямой просьбе автора). Текстура НЕ процедурная и не по клетке карты —
// запечённый PNG (worldgen/regions/bake_borders_texture.py поверх
// regions-v1.bin), 2400×1200, 1 клетка мира = 1 тексель, та же сетка/те же
// оси, что и у heightmap/*.bin (engine/src/terrain.ts:toPixel) — прозрачно
// всюду, кроме самой линии.
@group(0) @binding(17) var texRegions: texture_2d<f32>;

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
  let texel = 1.0 / ${yt.toFixed(1)};
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

  // Разметка регионов — поверх ГОТОВОГО albedo, но ДО общего освещения и
  // тумана ниже: и заливка территории, и линия границы должны лечь на рельеф
  // как нарисованные на карте, а не светиться поверх него ровным
  // неосвещённым цветом.
  //
  // Разметка — светлая линия по границе региона, как на карте кампании Total
  // War. Заливать территории цветом пробовали (см. историю
  // bake_regions_overlay.py) — автор попросил не трогать текстуру земли.
  //
  // Воду не трогаем: заливка накрывала бы открытое море (regions-v1.bin делит
  // на регионы весь мир, а не только сушу). Маска суши уже вшита в саму
  // текстуру, но здесь есть точный per-fragment признак — waterFlag, тот же,
  // по которому выше выбиралась ветка воды; берём его, чтобы на береговой
  // линии заливка не вылезала в воду из-за расхождения в клетку-другую.
  //
  // 1200.0/2400.0/600.0/1200.0 — WORLD_HALF_X/WORLD_W/WORLD_HALF_Z/WORLD_H из
  // engine/src/terrain.ts, держать в синхроне вручную (тот же приём
  // дублирования констант рельефа, что и во всём остальном этом файле).
  let regionUV = vec2f((in.worldPos.x + 1200.0) / 2400.0, (in.worldPos.z + 600.0) / 1200.0);
  // Проверки по waterFlag здесь БОЛЬШЕ НЕТ, и это осознанно. Она стояла как
  // страховка от того, что ЗАЛИВКА территории вылезет в воду на береговой
  // линии, — но заливка давно выключена (FILL_ALPHA = 0 в
  // worldgen/regions/bake_regions_overlay.py, автор попросил "как в total
  // war: не размывай текстурки, а наложи сверху линии"), а в текстуре
  // остались только сами линии. Для них этот запрет делал ровно обратное
  // пользе: гасил границу везде, где она идёт над рекой, — а именно там она
  // теперь и продолжается (регионы разлиты по воде, см. rm_line в скрипте
  // запекания). Больше 11 тысяч текселей линии проходят над водой; с прежним
  // условием ни один из них не был бы виден, и линия рвалась бы точно так
  // же, как раньше.
  // Если заливку когда-нибудь вернут (FILL_ALPHA > 0) — вернуть и запрет,
  // но уже отдельно от линии: одной альфой их не различить.
  let inRegionBounds = in.worldPos.x > -1200.0 && in.worldPos.x < 1200.0
                    && in.worldPos.z > -600.0 && in.worldPos.z < 600.0;
  let regionC = textureSampleLevel(texRegions, samp, regionUV, 0.0);
  let regionA = select(0.0, regionC.a, inRegionBounds);

  // Линия кладётся ПОВЕРХ уже освещённого цвета обычным альфа-смешением, а
  // не подмешивается в albedo до умножения на свет. Именно это и было
  // причиной «прошёлся камерой по всей карте, границ нигде нет»: albedo
  // умножается на lighting, а на затенённом склоне оно около 0.3 — сдвиг
  // цвета в тридцать единиц превращался на экране в девять. Замерено на
  // офлайн-рендере этого же шейдера (tools/render_terrain.py): при прежней
  // схеме два кадра, с наложением и без, отличались максимум на 16-20 из 255,
  // то есть на 7% — глазом на буром рельефе это не читается вовсе.
  //
  // Сюда же ушла и попытка красить территорию целиком: автор посмотрел и
  // попросил ровно противоположного — «сделай как в total war границы, не
  // размывай текстурки, а наложи сверху полупрозрачные белые, нейтральные».
  // Поэтому текстура теперь прозрачна везде, кроме самой линии (см.
  // bake_regions_overlay.py), а земля под ней остаётся собой: вне линии
  // regionA = 0 и mix ниже не меняет ни единого пикселя.
  let lit = mix(albedo * lighting, regionC.rgb, regionA);
  let d = distance(in.worldPos, fog.eye.xyz);
  let k = d * fog.color.w; let f = clamp(1.0 - exp(-k * k), 0.0, 1.0);
  return vec4f(mix(lit, fog.color.rgb, f), 1.0);
}
`,Tt=`
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
`,Et=`
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
  let texel = 1.0 / ${yt.toFixed(1)};
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
`,Dt=`
struct Uniforms { vp: mat4x4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex
fn vs(@location(0) pos: vec3f) -> @builtin(position) vec4f {
  return u.vp * vec4f(pos, 1.0);
}
`,q=`
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
`,Ot=`
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
`,kt=.5,At=1.4,jt=new Float32Array([0,At,0,kt,0,0,0,0,kt,0,At,0,0,0,kt,-.5,0,0,0,At,0,-.5,0,0,0,0,-.5,0,At,0,0,0,-.5,kt,0,0]),Mt=jt.length/3,J=7;async function Nt(e,t,n){let r=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),i=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),a=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),o=e.createTexture({size:[yt,yt],format:`depth32float`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}).createView(),s=e.createSampler({compare:`less`,magFilter:`linear`,minFilter:`linear`}),c=V(-1,1,-1,1,.1,1),l=!0,u=1/0,d=1/0,f=1.5;function p(t,n){let r=t-u,i=n-d;if(!l&&r*r+i*i<f*f)return;u=t,d=n;let o=Je([t+vt[0]*xt,vt[1]*xt,n+vt[2]*xt],[t,0,n],[0,1,0]);c=He(V(-60,bt,-60,bt,St,Ct),o),e.queue.writeBuffer(a,0,c),l=!0}let[m,h,g,_,v,y,b,x,S,ee,C,w]=await Promise.all([K(e,`/textures/ground/sand.jpg`),K(e,`/textures/ground/grass.jpg`),K(e,`/textures/ground/dry_meadow.jpg`),K(e,`/textures/ground/scree.jpg`),K(e,`/textures/ground/rock.jpg`),K(e,`/textures/ground/snow.jpg`),K(e,`/textures/ground/forest_floor.jpg`),K(e,`/textures/ground/desert.jpg`),K(e,`/textures/ground/marsh.jpg`),K(e,`/textures/ground/tundra_moss.jpg`),K(e,`/textures/water/detail.jpg`),K(e,`/textures/world/regions_overlay.png`,2400)]),te=e.createSampler({addressModeU:`repeat`,addressModeV:`repeat`,magFilter:`linear`,minFilter:`linear`}),ne=e.createShaderModule({code:wt}),re=e.createRenderPipeline({layout:`auto`,vertex:{module:ne,entryPoint:`vs`,buffers:[{arrayStride:60,attributes:[{shaderLocation:0,offset:0,format:`float32x3`},{shaderLocation:1,offset:12,format:`float32x3`},{shaderLocation:2,offset:24,format:`float32x3`},{shaderLocation:3,offset:36,format:`float32x2`},{shaderLocation:4,offset:44,format:`float32`},{shaderLocation:5,offset:48,format:`float32`},{shaderLocation:6,offset:52,format:`float32`},{shaderLocation:7,offset:56,format:`float32`}]}]},fragment:{module:ne,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),ie=e.createBindGroup({layout:re.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}},{binding:2,resource:te},{binding:3,resource:m.createView()},{binding:4,resource:h.createView()},{binding:5,resource:g.createView()},{binding:6,resource:_.createView()},{binding:7,resource:v.createView()},{binding:8,resource:{buffer:a}},{binding:9,resource:s},{binding:10,resource:o},{binding:11,resource:y.createView()},{binding:12,resource:b.createView()},{binding:13,resource:x.createView()},{binding:14,resource:S.createView()},{binding:15,resource:ee.createView()},{binding:16,resource:C.createView()},{binding:17,resource:w.createView()}]}),[ae,T]=await Promise.all([K(e,`/textures/sky/sky.jpg`),K(e,`/textures/sky/clouds.png`)]),oe=e.createSampler({addressModeU:`repeat`,addressModeV:`clamp-to-edge`,magFilter:`linear`,minFilter:`linear`}),se=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),ce=e.createShaderModule({code:Ot}),le=e.createRenderPipeline({layout:`auto`,vertex:{module:ce,entryPoint:`vs`},fragment:{module:ce,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`,cullMode:`none`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!1,depthCompare:`always`}}),ue=e.createBindGroup({layout:le.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:se}},{binding:1,resource:oe},{binding:2,resource:ae.createView()},{binding:3,resource:T.createView()}]}),E=new Float32Array(16);function de(t,n,r,i,a,o){let s=E;s[0]=t[0],s[1]=t[1],s[2]=t[2],s[3]=0,s[4]=n[0],s[5]=n[1],s[6]=n[2],s[7]=0,s[8]=r[0],s[9]=r[1],s[10]=r[2],s[11]=0,s[12]=i,s[13]=a,s[14]=o,s[15]=0,e.queue.writeBuffer(se,0,s)}let fe=e.createShaderModule({code:Dt}),pe=e.createRenderPipeline({layout:`auto`,vertex:{module:fe,entryPoint:`vs`,buffers:[{arrayStride:60,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth32float`,depthWriteEnabled:!0,depthCompare:`less`}}),me=e.createBindGroup({layout:pe.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}}]}),he=new Set;function ge(e){return e===`world-backdrop`?`backdrop`:e.startsWith(`far:`)?`far`:`near`}let _e={near:null,far:null,backdrop:null},ve=t=>new _t({createBuffer(n){_e[t]?.destroy(),_e[t]=e.createBuffer({size:n,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST})},write(n,r){let i=_e[t];i&&e.queue.writeBuffer(i,n,r,0,r.length)}}),ye={near:ve(`near`),far:ve(`far`),backdrop:ve(`backdrop`)},be=e.createShaderModule({code:Tt}),xe=e.createBuffer({size:jt.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(xe,0,jt);let Se=e.createRenderPipeline({layout:`auto`,vertex:{module:be,entryPoint:`vs`,buffers:[{arrayStride:12,stepMode:`vertex`,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]},{arrayStride:28,stepMode:`instance`,attributes:[{shaderLocation:1,offset:0,format:`float32x3`},{shaderLocation:2,offset:12,format:`float32`},{shaderLocation:3,offset:16,format:`float32x3`}]}]},fragment:{module:be,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),D=e.createBindGroup({layout:Se.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}}]}),O=null,k=null,Ce=0,A=0,we=e.createShaderModule({code:Et});function Te(t){let n=e.createBuffer({size:Math.max(t.vertexCount*10*4,4),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),r=new Float32Array(t.vertexCount*10);for(let e=0;e<t.vertexCount;e++)r.set(t.positions.subarray(e*3,e*3+3),e*10),r.set(t.normals.subarray(e*3,e*3+3),e*10+3),r[e*10+6]=t.materialIds[e],r[e*10+7]=t.shades[e],r.set(t.uvs.subarray(e*2,e*2+2),e*10+8);return e.queue.writeBuffer(n,0,r),n}let Ee=await Promise.all(Object.entries({bark:`/textures/decor/bark.jpg`,birchBark:`/textures/decor/birch_bark.jpg`,conifer:`/textures/decor/conifer_a.png`,conifer2:`/textures/decor/conifer_b.png`,broadleaf:`/textures/decor/broadleaf.png`,autumn:`/textures/decor/autumn.png`,birchLeaf:`/textures/decor/birch_leaf.png`,bush:`/textures/decor/bush.png`,grassTuft:`/textures/decor/grass_tuft.png`}).map(async([t,n])=>[t,await K(e,n)])),De={...Object.fromEntries(Ee),rock:v},j=e.createSampler({magFilter:`linear`,minFilter:`linear`}),M={spruce:{trunk:`bark`,canopy:`conifer`},pine:{trunk:`bark`,canopy:`conifer2`},broadleaf:{trunk:`bark`,canopy:`broadleaf`},autumn:{trunk:`bark`,canopy:`autumn`},birch:{trunk:`birchBark`,canopy:`birchLeaf`},dead:{trunk:`bark`,canopy:`bark`},bush:{trunk:`bark`,canopy:`bush`},grass:{trunk:`bark`,canopy:`grassTuft`},rock:{trunk:`bark`,canopy:`rock`}},Oe={spruce:nt,pine:rt,broadleaf:it,autumn:it,birch:at,dead:ot,bush:ct,grass:ut,rock:gt},N=[{arrayStride:40,stepMode:`vertex`,attributes:[{shaderLocation:0,offset:0,format:`float32x3`},{shaderLocation:1,offset:12,format:`float32x3`},{shaderLocation:2,offset:24,format:`float32`},{shaderLocation:3,offset:28,format:`float32`},{shaderLocation:4,offset:32,format:`float32x2`}]},{arrayStride:40,stepMode:`instance`,attributes:[{shaderLocation:5,offset:0,format:`float32x3`},{shaderLocation:6,offset:12,format:`float32x3`},{shaderLocation:7,offset:24,format:`float32`},{shaderLocation:8,offset:28,format:`float32x3`}]}],ke=e.createRenderPipeline({layout:`auto`,vertex:{module:we,entryPoint:`vs`,buffers:N},fragment:{module:we,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),Ae=e.createShaderModule({code:q}),je=e.createRenderPipeline({layout:`auto`,vertex:{module:Ae,entryPoint:`vs`,buffers:N},fragment:{module:Ae,entryPoint:`fs`,targets:[]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth32float`,depthWriteEnabled:!0,depthCompare:`less`}}),P=new Map;for(let t of Object.keys(M)){let n=Oe[t](),c=M[t],l=e.createBindGroup({layout:ke.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}},{binding:2,resource:j},{binding:3,resource:De[c.trunk].createView()},{binding:4,resource:De[c.canopy].createView()},{binding:5,resource:{buffer:a}},{binding:6,resource:s},{binding:7,resource:o}]}),u=e.createBindGroup({layout:je.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}},{binding:1,resource:j},{binding:2,resource:De[c.canopy].createView()}]});P.set(t,{mesh:n,localBuf:Te(n),instBuf:null,instCapacity:0,instanceCount:0,bindGroup:l,shadowBindGroup:u,scratch:null,shadowInstBuf:null,shadowInstCapacity:0,shadowInstanceCount:0,shadowScratch:null})}let F=null,I=null;function Me(){let n=t.canvas.width,r=t.canvas.height;F&&F.width===n&&F.height===r||(F?.destroy(),F=e.createTexture({size:[n,r],format:`depth24plus`,usage:GPUTextureUsage.RENDER_ATTACHMENT}),I=F.createView())}function Ne(e,t){let n=new Float32Array(t.vertexCount*15);for(let e=0;e<t.vertexCount;e++)n.set(t.positions.subarray(e*3,e*3+3),e*15),n.set(t.colors.subarray(e*3,e*3+3),e*15+3),n.set(t.normals.subarray(e*3,e*3+3),e*15+6),n.set(t.uvs.subarray(e*2,e*2+2),e*15+9),n[e*15+11]=t.elevations[e],n[e*15+12]=t.waterFlags[e],n[e*15+13]=t.forestFracs[e],n[e*15+14]=t.moistureFracs[e];he.add(e);let r=ge(e);ye[r].put(e,n,t.vertexCount),r===`near`&&(l=!0)}function Pe(e){if(!he.has(e))return;he.delete(e);let t=ge(e);ye[t].remove(e),t===`near`&&(l=!0)}function L(t){if(A=t.length,A>Ce&&(O?.destroy(),Ce=Math.max(A,8),O=e.createBuffer({size:Ce*J*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),k=new Float32Array(Ce*J)),A===0||!O)return;let n=k;t.forEach((e,t)=>{let r=t*J;n[r]=e.x,n[r+1]=e.y,n[r+2]=e.z,n[r+3]=1,n[r+4]=e.color[0],n[r+5]=e.color[1],n[r+6]=e.color[2]}),e.queue.writeBuffer(O,0,n,0,A*J)}function R(t,n,r){let i=t.scratch;if(!i||t.instanceCount===0){t.shadowInstanceCount=0;return}let a=n-bt,o=n+bt,s=r-bt,c=r+bt;t.instanceCount>t.shadowInstCapacity&&(t.shadowInstBuf?.destroy(),t.shadowInstCapacity=Math.max(t.instanceCount,8),t.shadowInstBuf=e.createBuffer({size:t.shadowInstCapacity*10*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),t.shadowScratch=new Float32Array(t.shadowInstCapacity*10));let l=t.shadowScratch,u=0;for(let e=0;e<t.instanceCount;e++){let t=e*10,n=i[t],r=i[t+2];n<a||n>o||r<s||r>c||(l.set(i.subarray(t,t+10),u*10),u++)}t.shadowInstanceCount=u,u>0&&t.shadowInstBuf&&e.queue.writeBuffer(t.shadowInstBuf,0,l,0,u*10)}function Fe(t,n){let r=t.length;if(r>n.instCapacity&&(n.instBuf?.destroy(),n.instCapacity=Math.max(r,8),n.instBuf=e.createBuffer({size:n.instCapacity*10*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),n.scratch=new Float32Array(n.instCapacity*10)),n.instanceCount=r,r===0||!n.instBuf)return;let i=n.scratch;t.forEach((e,t)=>{let n=t*10;i[n]=e.x,i[n+1]=e.y,i[n+2]=e.z,i[n+3]=e.scale[0],i[n+4]=e.scale[1],i[n+5]=e.scale[2],i[n+6]=e.yaw,i[n+7]=e.color[0],i[n+8]=e.color[1],i[n+9]=e.color[2]}),e.queue.writeBuffer(n.instBuf,0,i,0,r*10)}function Ie(e){let t=new Map;for(let n of e){let e=t.get(n.kind);e||(e=[],t.set(n.kind,e)),e.push(n)}for(let[e,n]of P)Fe(t.get(e)??[],n);l=!0}function Le(t){e.queue.writeBuffer(r,0,t)}let Re=new Float32Array(8);function ze(t,n,r,a){let o=Re;o[0]=t[0],o[1]=t[1],o[2]=t[2],o[3]=a,o[4]=n[0],o[5]=n[1],o[6]=n[2],o[7]=r,e.queue.writeBuffer(i,0,o)}function Be(n,r){Me();let i=e.createCommandEncoder();if(l){let e=i.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:o,depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}});ye.near.vertexCount>0&&_e.near&&(e.setPipeline(pe),e.setBindGroup(0,me),e.setVertexBuffer(0,_e.near),e.draw(ye.near.vertexCount));let t=!1;for(let e of P.values()){if(e.instanceCount===0){e.shadowInstanceCount=0;continue}R(e,u,d),e.shadowInstanceCount>0&&(t=!0)}if(t){e.setPipeline(je);for(let t of P.values())t.shadowInstanceCount===0||!t.shadowInstBuf||(e.setBindGroup(0,t.shadowBindGroup),e.setVertexBuffer(0,t.localBuf),e.setVertexBuffer(1,t.shadowInstBuf),e.draw(t.mesh.vertexCount,t.shadowInstanceCount))}e.end(),l=!1}let a=t.getCurrentTexture().createView(),s=i.beginRenderPass({colorAttachments:[{view:a,clearValue:n,loadOp:`clear`,storeOp:`store`}],depthStencilAttachment:{view:I,depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}});if(s.setPipeline(le),s.setBindGroup(0,ue),s.draw(3),he.size>0){s.setPipeline(re),s.setBindGroup(0,ie);for(let e of[`near`,`far`,`backdrop`]){let t=ye[e],n=_e[e];t.vertexCount===0||!n||(s.setVertexBuffer(0,n),s.draw(t.vertexCount))}}A>0&&O&&(s.setPipeline(Se),s.setBindGroup(0,D),s.setVertexBuffer(0,xe),s.setVertexBuffer(1,O),s.draw(Mt,A));let c=!1;for(let e of P.values())if(e.instanceCount>0){c=!0;break}if(c){s.setPipeline(ke);for(let e of P.values())e.instanceCount===0||!e.instBuf||(s.setBindGroup(0,e.bindGroup),s.setVertexBuffer(0,e.localBuf),s.setVertexBuffer(1,e.instBuf),s.draw(e.mesh.vertexCount,e.instanceCount))}r?.(s),s.end(),e.queue.submit([i.finish()])}function z(){return{lightBuf:a,shadowView:o,shadowSampler:s}}return{setTerrainChunk:Ne,removeTerrainChunk:Pe,setMarkers:L,setDecor:Ie,setVP:Le,setFog:ze,setSunTarget:p,setSkyCamera:de,getShadowResources:z,frame:Be}}var Y=12345,Pt=.235,Ft=2400,It=1200,Lt=Ft/2;It/2;var Rt=2.5;function X(e,t,n){let r=e*374761393+t*668265263+n*1274126177;return r=Math.imul(r^r>>>13,1274126177),((r^r>>>16)>>>0)/4294967296}function zt(e,t,n){let r=Math.floor(e),i=Math.floor(t),a=e-r,o=t-i,s=a*a*(3-2*a),c=o*o*(3-2*o),l=X(r,i,n),u=X(r+1,i,n),d=X(r,i+1,n),f=X(r+1,i+1,n);return(l*(1-s)+u*s)*(1-c)+(d*(1-s)+f*s)*c}var Bt=null,Vt=null,Ht=null;async function Ut(e,t){let n=await fetch(e);if(!n.ok)throw Error(`${e}: HTTP ${n.status}`);let r=await n.arrayBuffer();if(r.byteLength!==t)throw Error(`${e}: неверный размер (${r.byteLength} байт, ожидалось ${t})`);return r}async function Wt(){let e=Ft*It,[t,n,r]=await Promise.all([Ut(`/heightmap/elevation-v6.bin`,e*2),Ut(`/heightmap/forest.bin`,e),Ut(`/heightmap/moisture.bin`,e)]);Bt=new Uint16Array(t),Vt=new Uint8Array(n),Ht=new Uint8Array(r)}function Gt(e,t,n,r){let i=Math.floor(t),a=Math.floor(n),o=Math.min(i+1,2399),s=Math.min(a+1,1199),c=t-i,l=n-a,u=a*Ft+i,d=a*Ft+o,f=s*Ft+i,p=s*Ft+o,m=e[u]+(e[d]-e[u])*c;return(m+(e[f]+(e[p]-e[f])*c-m)*l)*r}function Kt(e,t){return[Math.max(0,Math.min(2399,e+Lt)),Math.max(0,Math.min(1199,t+600))]}function qt(e,t){if(!Bt)return .285;let[n,r]=Kt(e,t);return Gt(Bt,n,r,Rt/65535)}function Z(e,t){let n=qt(e,t),r=(qt(e+.7,t)+qt(e-.7,t)+qt(e,t+.7)+qt(e,t-.7))*.25;return n*.55+r*.45}var Jt=32,Yt=new Map;function Xt(e,t){return Math.floor(e/Jt)+`,`+Math.floor(t/Jt)}function Zt(e,t,n){let r={x:e,z:t,targetH:Math.max(Z(e,t),.245),radius:n},i=Xt(e,t),a=Yt.get(i);a?a.push(r):Yt.set(i,[r])}function Q(e,t){let n=qt(e,t);if(n<.235||Yt.size===0)return n;let r=Math.floor(e/Jt),i=Math.floor(t/Jt),a=0,o=0;for(let n=-1;n<=1;n++)for(let s=-1;s<=1;s++){let c=Yt.get(r+s+`,`+(i+n));if(c)for(let n of c){let r=Math.hypot(e-n.x,t-n.z);if(r>=n.radius)continue;let i=n.radius*.55,s=r<=i?1:1-((r-i)/(n.radius-i))**2*(3-2*((r-i)/(n.radius-i)));a+=s,o+=s*n.targetH}}return a<=0?n:a>=1?o/a:n*(1-a)+o}function Qt(e,t){return Q(e,t)<Pt}function $t(e,t){if(!Ht)return .5;let[n,r]=Kt(e,t);return Gt(Ht,n,r,1/255)}function en(e,t){if(!Vt)return 0;let[n,r]=Kt(e,t);return Gt(Vt,n,r,1/255)}var tn=(e,t,n)=>[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n],nn=[.14,.24,.28],rn=[.05,.11,.19];function an(e){return tn(nn,rn,Math.min(1,e))}var on=[0,1,0],sn=6;function cn(e,t){let n=.5,r=Q(e-n,t)*13,i=Q(e+n,t)*13,a=Q(e,t-n)*13,o=Q(e,t+n)*13;return B([-(i-r)/(2*n),1,-(o-a)/(2*n)])}var ln=6;function un(e,t,n){let r=n/2,i=1/0;for(let a=0;a<=ln;a++){let o=-r+a/ln*n;for(let a=0;a<=ln;a++){let s=Q(e+(-r+a/ln*n),t+o);s<i&&(i=s)}}return i}function dn(e,t,n,r,i=1,a=0){let o=Math.round((n-e)/i),s=Math.round((r-t)/i),c=i===1,l=[],u=[],d=[],f=[],p=[],m=[],h=[],g=[];function _(e,t){let n=c?Q(e,t):un(e,t,i),r=n<Pt,o=r?[e,Pt*13-a,t]:[e,n*13-a,t],s=r?an((Pt-n)*3):[0,0,0],l=r?on:c?cn(e,t):on,u=r?0:en(e,t),d=r?0:$t(e,t);return{p:o,c:s,n:l,uv:[e/sn,t/sn],e:n,water:+!!r,forest:u,moisture:d}}let v=[];for(let n=0;n<=s;n++){let r=[];for(let a=0;a<=o;a++)r.push(_(e+a*i,t+n*i));v.push(r)}function y(e,t,n){let r=c?null:B(Ve(Be(t.p,e.p),Be(n.p,e.p)));for(let i of[e,t,n]){l.push(i.p[0],i.p[1],i.p[2]),u.push(i.c[0],i.c[1],i.c[2]);let e=r??i.n;d.push(e[0],e[1],e[2]),f.push(i.uv[0],i.uv[1]),p.push(i.e),m.push(i.water),h.push(i.forest),g.push(i.moisture)}}for(let e=0;e<s;e++)for(let t=0;t<o;t++){let n=v[e][t],r=v[e][t+1],i=v[e+1][t],a=v[e+1][t+1];y(n,a,r),y(n,i,a)}return{positions:new Float32Array(l),colors:new Float32Array(u),normals:new Float32Array(d),uvs:new Float32Array(f),elevations:new Float32Array(p),waterFlags:new Float32Array(m),forestFracs:new Float32Array(h),moistureFracs:new Float32Array(g),vertexCount:l.length/3}}var fn=9,pn=10,mn=380,hn={d:[1,0],arrowright:[1,0],a:[-1,0],arrowleft:[-1,0],w:[0,1],arrowup:[0,1],s:[0,-1],arrowdown:[0,-1]},gn=700;function _n(e,t){let n=!0,r=new Map,i=null,a=null,o=null,s=null,c=null,l=null,u=null,d=!1,f=null;function p(){n=!1,f?.()}function m(){let e=[...r.values()];return{x:(e[0].x+e[1].x)/2,y:(e[0].y+e[1].y)/2,d:Math.hypot(e[0].x-e[1].x,e[0].y-e[1].y)}}function h(){let e=[...r.values()];return Math.atan2(e[1].y-e[0].y,e[1].x-e[0].x)}function g(e,n){let r=t.dist*.0022,i=e*r,a=n*r,o=Math.cos(t.yaw),s=Math.sin(t.yaw);t.target[0]=Math.max(-Lt,Math.min(Lt,t.target[0]-(i*o-a*s))),t.target[2]=Math.max(-600,Math.min(600,t.target[2]+(i*s+a*o))),t.target[1]=Q(t.target[0],t.target[2])*13+1}e.addEventListener(`pointerdown`,n=>{n.preventDefault(),p(),r.set(n.pointerId,{x:n.clientX,y:n.clientY});try{e.setPointerCapture(n.pointerId)}catch{}if(r.size===1)d=!!c?.(n.clientX,n.clientY),d?(i=null,o={x:n.clientX,y:n.clientY,t:performance.now()}):(i={x:n.clientX,y:n.clientY,tx:t.target[0],tz:t.target[2]},o={x:n.clientX,y:n.clientY,t:performance.now()});else if(r.size===2){d&&(d=!1,u?.(NaN,NaN)),i=null,o=null;let e=m();a={d:e.d,y:e.y,dist:t.dist,yaw:t.yaw,pitch:t.pitch,angle:h()}}}),e.addEventListener(`pointermove`,e=>{if(r.has(e.pointerId)){if(e.preventDefault(),r.set(e.pointerId,{x:e.clientX,y:e.clientY}),o&&Math.hypot(e.clientX-o.x,e.clientY-o.y)>pn&&(o=null),d){l?.(e.clientX,e.clientY);return}if(r.size>=2&&a){let e=m();t.dist=Math.max(fn,Math.min(140,a.dist*(a.d/Math.max(12,e.d)))),t.yaw=a.yaw+(h()-a.angle),t.pitch=Math.max(.08,Math.min(1.42,a.pitch+(e.y-a.y)*.005));return}i&&(t.target[0]=i.tx,t.target[2]=i.tz,g(e.clientX-i.x,i.y-e.clientY))}});function _(e){let n=!!(o&&r.size===1&&performance.now()-o.t<mn);if(d&&(d=!1,u?.(n?NaN:e.clientX,n?NaN:e.clientY)),n&&s?.(o.x,o.y),o=null,r.delete(e.pointerId),r.size<2&&(a=null),r.size===0)i=null;else if(r.size===1){let e=[...r.values()][0];i={x:e.x,y:e.y,tx:t.target[0],tz:t.target[2]}}}e.addEventListener(`pointerup`,_),e.addEventListener(`pointercancel`,_),e.addEventListener(`wheel`,e=>{e.preventDefault(),p(),t.dist=Math.max(fn,Math.min(140,t.dist*(e.deltaY<0?.9:1.11)))},{passive:!1});let v=new Set;window.addEventListener(`keydown`,e=>{let t=e.key.toLowerCase();t in hn&&(v.add(t),p())}),window.addEventListener(`keyup`,e=>{v.delete(e.key.toLowerCase())});let y=null;function b(e){if(y===null){y=e;return}let t=Math.min(.1,(e-y)/1e3);if(y=e,v.size===0||i)return;let n=0,r=0;for(let e of v){let[t,i]=hn[e];n+=t,r+=i}(n!==0||r!==0)&&g(n*gn*t,r*gn*t)}return{isAutoOrbiting:()=>n,stopAuto:p,update:b,onGrab(e,t,n){c=e,l=t,u=n},onTap(e){s=e},onInteract(e){f=e}}}var vn={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},yn={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};async function bn(e){let t=await(await fetch(e)).arrayBuffer(),n=new DataView(t);if(n.getUint32(0,!0)!==1179937895)throw Error(`не glTF-контейнер: `+e);let r=n.getUint32(8,!0),i=12,a=null,o=null;for(;i<r;){let e=n.getUint32(i,!0),r=n.getUint32(i+4,!0),s=t.slice(i+8,i+8+e);r===1313821514?a=JSON.parse(new TextDecoder().decode(s)):r===5130562&&(o=s),i+=8+e}if(!a||!o)throw Error(`GLB без JSON/BIN чанка: `+e);let s=e=>a.accessors[e],c=e=>a.bufferViews[e];function l(e){let t=s(e),n=c(t.bufferView),r=vn[t.componentType],i=(n.byteOffset||0)+(t.byteOffset||0),a=yn[t.type],l=a*r.BYTES_PER_ELEMENT,u=n.byteStride||0;if(!u||u===l)return new r(o,i,t.count*a);let d=new r(t.count*a);for(let e=0;e<t.count;e++)d.set(new r(o,i+e*u,a),e*a);return d}let u=a.meshes[0].primitives[0],d=l(u.attributes.POSITION),f=l(u.attributes.NORMAL),p=l(u.attributes.TEXCOORD_0),m=l(u.indices),h=a.materials[u.material].pbrMetallicRoughness.baseColorTexture.index,g=a.images[a.textures[h].source],_=c(g.bufferView);return{positions:d,normals:f,uvs:p,indices:m,imageBytes:o.slice(_.byteOffset||0,(_.byteOffset||0)+_.byteLength),imageMimeType:g.mimeType}}var xn=`
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
// Раньше тут лежала одна только модельная матрица. Теперь рядом с ней —
// оттенок владельца (tint): походы рисуются НАСТОЯЩИМИ моделями (генерал/
// армия/разведчик, см. models/marches/*), а не цветными пирамидками-метками,
// и «свой/чужой» больше нечем показать — цвет метки исчез вместе с меткой.
// tint.rgb — множитель поверх текстуры, tint.a — его сила (0 = не трогать
// цвет вовсе; так и живут все статичные постройки).
struct Inst { model: mat4x4f, tint: vec4f };
@group(0) @binding(7) var<uniform> inst: Inst;
// Параметры обводки выделенного объекта: rgb — цвет, a — толщина в долях
// высоты экрана. ОБЩИЙ буфер, не per-instance: выделен всегда ровно один
// объект, и обводка рисуется только ему — держать это поле в каждом инстансе
// значило бы гасить его у всех остальных при каждой смене выбора.
@group(0) @binding(8) var<uniform> outlineStyle: vec4f;

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
  let world = inst.model * vec4f(pos, 1.0);
  out.pos = vp * world;
  out.uv = uv;
  // модельная матрица тут без неравномерного масштаба — обычной 3x3 части достаточно для нормали
  out.worldNormal = normalize((inst.model * vec4f(normal, 0.0)).xyz);
  out.worldPos = world.xyz;
  out.lightClip = light.vp * world;
  return out;
}

// ---- обводка выделенного (вместо прежней пирамидки-метки над объектом).
// Приём обычный для стратегий: та же модель рисуется ВТОРОЙ раз, раздутая
// наружу по нормали и залитая сплошным цветом, и только задними гранями
// (cullMode: "front" в пайплайне ниже) — передние отсекаются, поэтому сама
// модель, нарисованная следом, ложится поверх, а по силуэту остаётся ровный
// ободок.
//
// Раздуваем не в мировом пространстве, а в клип-пространстве: смещение на
// clip.w даёт ОДИНАКОВУЮ толщину в пикселях независимо от расстояния до
// камеры — иначе обводка у дальнего замка истончалась бы в ничто, а у
// ближнего расплывалась в кляксу. Соотношение сторон достаём из самой VP
// (persp кладёт в [0][0] величину t/aspect, а в [1][1] — t), иначе на широком
// экране горизонтальная часть ободка выходила бы вдвое тоньше вертикальной.
struct VOutline {
  @builtin(position) pos: vec4f,
  @location(0) worldPos: vec3f,
};

@vertex
fn vsOutline(@location(0) pos: vec3f, @location(1) normal: vec3f) -> VOutline {
  var out: VOutline;
  let world = inst.model * vec4f(pos, 1.0);
  let clip = vp * world;
  let n = normalize((inst.model * vec4f(normal, 0.0)).xyz);
  let clipN = vp * vec4f(n, 0.0);
  let len = length(clipN.xy);
  out.worldPos = world.xyz;
  if (len < 1e-6) {
    // Нормаль смотрит точно в камеру — сдвигать некуда, оставляем как есть.
    out.pos = clip;
    return out;
  }
  let dir = clipN.xy / len;
  let aspect = vp[1][1] / max(1e-6, vp[0][0]);
  let w = outlineStyle.a * clip.w;
  out.pos = clip + vec4f(dir.x * w / aspect, dir.y * w, 0.0, 0.0);
  return out;
}

@fragment
fn fsOutline(in: VOutline) -> @location(0) vec4f {
  // Тот же туман, что и у самой модели — иначе ободок дальнего объекта
  // светился бы сквозь дымку ярче, чем сам объект.
  let d = distance(in.worldPos, fog.eye.xyz);
  let k = d * fog.color.w; let f = clamp(1.0 - exp(-k * k), 0.0, 1.0);
  return vec4f(mix(outlineStyle.rgb, fog.color.rgb, f), 1.0);
}

fn shadowFactor(clip: vec4f) -> f32 {
  let ndc = clip.xyz / clip.w;
  if (ndc.x < -1.0 || ndc.x > 1.0 || ndc.y < -1.0 || ndc.y > 1.0 || ndc.z < 0.0 || ndc.z > 1.0) {
    return 1.0;
  }
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  let bias = 0.0025;
  let texel = 1.0 / ${yt.toFixed(1)};
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
  // Оттенок владельца — множителем ПОВЕРХ текстуры, а не подменой цвета:
  // модель остаётся собой (доспех, ткань, камень постамента читаются как
  // задумано), просто уходит чуть в зелень у своих и чуть в красноту у
  // чужих. tint.a=0 у построек — множитель ровно 1, ни одного отличия от
  // прежнего кадра.
  let lit = base.rgb * lighting * mix(vec3f(1.0), inst.tint.rgb, inst.tint.a);
  // Туман — тот же расчёт, что и у рельефа/маркеров (см. renderer.ts):
  // здания/лагеря вдали тоже должны таять в дымке, а не обрываться резким
  // контуром на фоне уже затуманенной земли под ними.
  let d = distance(in.worldPos, fog.eye.xyz);
  let k = d * fog.color.w; let f = clamp(1.0 - exp(-k * k), 0.0, 1.0);
  return vec4f(mix(lit, fog.color.rgb, f), base.a);
}
`;async function Sn(e,t){let n=e.createBuffer({size:t.positions.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(n,0,t.positions);let r=e.createBuffer({size:t.normals.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(r,0,t.normals);let i=e.createBuffer({size:t.uvs.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(i,0,t.uvs);let a=t.indices.byteLength,o=Math.ceil(a/4)*4,s=e.createBuffer({size:o,usage:GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST});if(o===a)e.queue.writeBuffer(s,0,t.indices);else{let n=new Uint8Array(o);n.set(new Uint8Array(t.indices.buffer,t.indices.byteOffset,a)),e.queue.writeBuffer(s,0,n)}let c=await createImageBitmap(new Blob([t.imageBytes],{type:t.imageMimeType})),l=Math.min(1,1024/Math.max(c.width,c.height)),u=l<1?await createImageBitmap(c,{resizeWidth:Math.round(c.width*l),resizeHeight:Math.round(c.height*l),resizeQuality:`medium`}):c;l<1&&c.close();let d=e.createTexture({size:[u.width,u.height],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return e.queue.copyExternalImageToTexture({source:u},{texture:d},[u.width,u.height]),u.close(),{vao:{posBuf:n,nrmBuf:r,uvBuf:i,idxBuf:s,indexFormat:t.indices instanceof Uint16Array?`uint16`:`uint32`,indexCount:t.indices.length},texture:d}}function Cn(e,t,n){let r=e.createShaderModule({code:xn}),i=e.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:`uniform`}},{binding:1,visibility:GPUShaderStage.FRAGMENT,sampler:{type:`filtering`}},{binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:`float`}},{binding:3,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:`uniform`}},{binding:4,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:`uniform`}},{binding:5,visibility:GPUShaderStage.FRAGMENT,sampler:{type:`comparison`}},{binding:6,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:`depth`}},{binding:7,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:`uniform`}},{binding:8,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:`uniform`}}]}),a=e.createPipelineLayout({bindGroupLayouts:[i]}),o=e.createRenderPipeline({layout:a,vertex:{module:r,entryPoint:`vs`,buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]},{arrayStride:12,attributes:[{shaderLocation:1,offset:0,format:`float32x3`}]},{arrayStride:8,attributes:[{shaderLocation:2,offset:0,format:`float32x2`}]}]},fragment:{module:r,entryPoint:`fs`,targets:[{format:t}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),s=e.createRenderPipeline({layout:a,vertex:{module:r,entryPoint:`vsOutline`,buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]},{arrayStride:12,attributes:[{shaderLocation:1,offset:0,format:`float32x3`}]}]},fragment:{module:r,entryPoint:`fsOutline`,targets:[{format:t}]},primitive:{topology:`triangle-list`,cullMode:`front`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!1,depthCompare:`less`}}),c=e.createSampler({magFilter:`linear`,minFilter:`linear`,mipmapFilter:`linear`}),l=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});function u(t,n,r){let i=f;i[0]=t[0],i[1]=t[1],i[2]=t[2],i[3]=0,i[4]=n[0],i[5]=n[1],i[6]=n[2],i[7]=r,e.queue.writeBuffer(l,0,i)}let d=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),f=new Float32Array(8),p=e.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),m=new Float32Array(4);function h(t,n){m[0]=t[0],m[1]=t[1],m[2]=t[2],m[3]=n,e.queue.writeBuffer(p,0,m)}function g(t){e.queue.writeBuffer(d,0,t)}function _(t,r,a){let o=e.createBuffer({size:wn*4,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),s={model:t,modelBuf:o,bindGroup:e.createBindGroup({layout:i,entries:[{binding:0,resource:{buffer:d}},{binding:1,resource:c},{binding:2,resource:t.texture.createView()},{binding:3,resource:{buffer:l}},{binding:4,resource:{buffer:n.lightBuf}},{binding:5,resource:n.shadowSampler},{binding:6,resource:n.shadowView},{binding:7,resource:{buffer:o}},{binding:8,resource:{buffer:p}}]}),scratch:new Float32Array(wn)};return v(s,r,a),s}function v(t,n,r){let i=t.scratch;i.set(n,0),i[16]=r?r[0]:1,i[17]=r?r[1]:1,i[18]=r?r[2]:1,i[19]=r?r[3]:0,e.queue.writeBuffer(t.modelBuf,0,i)}function y(e){if(e)try{e.modelBuf.destroy()}catch{}}function b(e){e.setPipeline(o)}function x(e){e.setPipeline(s)}function S(e,t){e.setBindGroup(0,t.bindGroup),e.setVertexBuffer(0,t.model.vao.posBuf),e.setVertexBuffer(1,t.model.vao.nrmBuf),e.setIndexBuffer(t.model.vao.idxBuf,t.model.vao.indexFormat),e.drawIndexed(t.model.vao.indexCount)}function ee(e,t){e.setBindGroup(0,t.bindGroup),e.setVertexBuffer(0,t.model.vao.posBuf),e.setVertexBuffer(1,t.model.vao.nrmBuf),e.setVertexBuffer(2,t.model.vao.uvBuf),e.setIndexBuffer(t.model.vao.idxBuf,t.model.vao.indexFormat),e.drawIndexed(t.model.vao.indexCount)}return{createInstance:_,updateInstance:v,destroyInstance:y,beginModels:b,draw:ee,beginOutlines:x,drawOutline:S,setOutlineStyle:h,setFog:u,setVP:g}}var wn=20,Tn={food:`farm`,wood:`sawmill`,stone:`quarry`,gold:`gold-mine`,amber:`amber-vein`},En={food:`Пашня`,wood:`Лесопилка`,stone:`Каменоломня`,gold:`Рудник`,amber:`Янтарная жила`};function Dn(e){return e>=25?5:e>=19?4:e>=13?3:e>=7?2:1}function On(){try{let e=window.parent;if(e&&e!==window){let t=e.mpWorldSnapshot;if(typeof t==`function`){let e=t();if(e)return e}if(e.W)return e.W}}catch{}return null}function kn(){let e=On();return!e||!e.players[0]?null:{x:e.players[0].x,y:e.players[0].y}}var An=16;function jn(e,t,n){let r=On();if(!r)return null;let i=[],a=e!==void 0&&t!==void 0&&n!==void 0&&!!r.mapChunks,o=[];if(a){let i=Math.floor((e-n)/An),a=Math.floor((e+n)/An),s=Math.floor((t-n)/An),c=Math.floor((t+n)/An);for(let e=s;e<=c;e++)for(let t=i;t<=a;t++){let n=r.mapChunks[t+`,`+e];if(n)for(let e of n)o.push(e)}}else for(let e in r.map)o.push(e);let s=n===void 0?1/0:n*n,c=n!==void 0&&e!==void 0&&t!==void 0,l=new Map;for(let e of r.players)l.set(e.id,e);let u=r.players[0]?r.players[0].id:-1;for(let n of o){let a=r.map[n];if(a){if(c){let n=a.x-e,r=a.y-t;if(n*n+r*r>s)continue}if(a.t===`city`){let e=l.get(a.pid),t=e?e.race:`human`,r=e?Math.max(1,Math.min(5,Dn(e.b.hall))):1,o=!!e&&e.id===u,s=e?e.nick??`?`:`?`,c=e?`Ратуша `+e.b.hall:``;i.push({key:n,x:a.x+.5,y:a.y+.5,gx:a.x,gy:a.y,kind:0,model:`/models/castles/${t}-${r}.glb`,scale:10,own:o,nm:s,lv:c})}else if(a.t===`camp`||a.t===`fort`){let e=(a.t===`fort`?`Форт`:`Лагерь`)+` варваров`,t=`ур. `+(a.lv??`?`);i.push({key:n,x:a.x+.5,y:a.y+.5,gx:a.x,gy:a.y,kind:1,model:`/models/camps/barbarians.glb`,scale:a.t===`fort`?6.5:5,nm:e,lv:t})}else if(a.t===`node`){let e=Tn[a.res]||`farm`,t=En[a.res]||`Точка`,r=`ур. `+(a.lv??`?`);i.push({key:n,x:a.x+.5,y:a.y+.5,gx:a.x,gy:a.y,kind:2,model:`/models/resources/${e}.glb`,scale:5,nm:t,lv:r})}}}return i}function Mn(e){let t=0;for(let n in e)for(let r in e[n])t+=e[n][+r]||0;return t}function Nn(){try{let e=window.parent;if(e&&e!==window){let t=e.mpWorldSnapshot;if(typeof t==`function`){let e=t();if(e)return e}if(e.W)return e.W}}catch{}return null}var Pn=.004;function Fn(e,t){let n=e.path,r=e.pathCum;if(!n||n.length<2)return n&&n[0]||{x:e.tx,y:e.ty};let i=t*(e.pathLen??0);for(let e=1;e<r.length;e++)if(r[e]>=i){let t=r[e]-r[e-1],a=t>0?(i-r[e-1])/t:0,o=n[e-1],s=n[e];return{x:o.x+(s.x-o.x)*a,y:o.y+(s.y-o.y)*a}}return n[n.length-1]}function In(){let e=Nn();if(!e||!e.marches)return null;let t=e.players[0]?e.players[0].id:-1,n=new Map;for(let t of e.players)n.set(t.id,t);let r=[];for(let i of e.marches){let a=i.state===`gather`||i.state===`siege`||i.state===`hold`?{x:i.tx,y:i.ty}:Fn(i,Math.max(0,Math.min(1,(e.t-i.t0)/Math.max(1,i.t1-i.t0)))),o=n.get(i.pid),s=NaN;if(i.state!==`gather`&&i.state!==`siege`&&i.state!==`hold`){let t=Math.max(0,Math.min(1,(e.t-i.t0)/Math.max(1,i.t1-i.t0))),n=Fn(i,Math.max(0,t-Pn)),r=Fn(i,Math.min(1,t+Pn)),a=r.x-n.x,o=r.y-n.y;a*a+o*o>1e-12&&(s=Math.atan2(a,o))}let c=i.state===`siege`&&i.data&&i.data.battle?i.data.battle:null,l=c?{round:c.round??0,revealFromRound:c.revealFromRound??0,retreating:!!(c.retreatRequested||c.retreated),attHpLeft:c.attHpLeft??0,attStartHp:c.attStartHp??1,revealFromAttHp:c.revealFromAttHp??c.attHpLeft??0,defHpLeft:c.defHpLeft??0,defStartHp:c.defStartHp??1,revealFromDefHp:c.revealFromDefHp??c.defHpLeft??0,revealStart:c.revealStart??0,revealAt:c.revealAt??0,demolish:c.phase===`demolish`&&c.demolish?{round:c.demolish.round??0,ruinedN:c.demolish.ruined&&c.demolish.ruined.length||0,name:c.demolish.curName??null,hp:c.demolish.curHp??0,max:c.demolish.curMax??0,revealFromHp:c.demolish.revealFromHp??c.demolish.curHp??0,sameTarget:c.demolish.revealFromKey===c.demolish.curKey}:null}:null;r.push({x:a.x,y:a.y,own:i.pid===t,id:i.id,nick:o?.nick??o?.name??`?`,unitsTotal:Mn(i.units),state:i.state,tx:i.tx,ty:i.ty,t1:i.t1,battle:l,race:o?.race??`human`,genId:o&&o.gen&&o.gen.id!=null?o.gen.id:null,hasGen:!!(i.hasGen??(i.data&&i.data.has_gen)),scout:i.mode===`scout`||i.mode===`scoutmarch`,yaw:s})}return r}var Ln=document.getElementById(`status`),$=(()=>{try{if(/[?&]debug=1\b/.test(location.search))return!0;if(window.parent&&window.parent!==window)return/[?&]debug=1\b/.test(window.parent.location.search)}catch{}return!1})();$&&(Ln.style.display=`block`);function Rn(e){$&&(Ln.textContent=e.join(`
`))}function zn(e){Ln.style.display=`block`,Ln.textContent=e.join(`
`)}async function Bn(){let e=[];function t(t){zn([...e,t]);try{window.parent&&window.parent!==window&&typeof window.parent.forceCityView==`function`&&window.parent.forceCityView()}catch{}}if(!(`gpu`in navigator)){t(`WebGPU: navigator.gpu отсутствует.`);return}await Wt(),e.push(`рельеф: настоящие данные высот загружены`);let n=document.getElementById(`hmVersion`);n&&(n.textContent=`h6`);let r={x:42,y:22},i=[.6,.52,.4],a=35e-5,o=kn(),s=o??r,c=jn(s.x,s.y,192),l=c!==null;window.parent!==window&&!$&&(Ln.style.display=`none`);let d=c??[{key:`demo-0`,x:43,y:14,gx:43,gy:14,kind:0,model:`/models/castles/human-1.glb`,scale:10,nm:`Замок`,lv:`демо`},{key:`demo-1`,x:50,y:20,gx:50,gy:20,kind:1,model:`/models/camps/barbarians.glb`,scale:5,nm:`Лагерь`,lv:`демо`},{key:`demo-2`,x:55,y:12,gx:55,gy:12,kind:2,model:`/models/resources/farm.glb`,scale:5,nm:`Пашня`,lv:`демо`},{key:`demo-3`,x:30,y:30,gx:30,gy:30,kind:2,model:`/models/resources/quarry.glb`,scale:5,nm:`Каменоломня`,lv:`демо`}];e.push(l?`данные: настоящая партия, сущностей — ${d.length}`:`данные: демо (window.parent.W недоступен)`);let f=u(),p={x:[],y:[]},m={value:[]},h=new Map,g=new Map,_=new Map,v=new Map,y=new Map,b=new Map,x=new Map,S=new Map;function ee(e){let t=Ie(f);return Pe(f,t,p),Pe(f,t,m),p.x[t]=e.x,p.y[t]=e.y,m.value[t]=e.kind,h.set(t,e.model),g.set(t,e.scale),v.set(t,e.nm),y.set(t,e.lv),b.set(t,!!e.own),x.set(t,{x:e.gx,y:e.gy}),S.set(e.key,t),Zt(e.x,e.y,e.scale*1.4),t}for(let e of d)ee(e);let C=Array.from(Oe(f,[p,m]));e.push(`bitECS: сущностей — ${C.length}`);let w=await navigator.gpu.requestAdapter();if(!w){t(`WebGPU: адаптер не найден.`);return}let te=await w.requestDevice();function ne(e){let t=document.getElementById(`gpu-error-banner`);t||(t=document.createElement(`div`),t.id=`gpu-error-banner`,t.style.cssText=`position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#4a0f0f;color:#fff;font:11px/1.4 monospace;padding:6px 8px;max-height:40vh;overflow:auto;white-space:pre-wrap;`,document.body.appendChild(t)),t.textContent+=(t.textContent?`
---
`:``)+e}te.addEventListener(`uncapturederror`,e=>{let t=e.error.message;console.error(`WebGPU error:`,t),ne(t)});let re=`fb-gpu-reload-at`,ie=Number(sessionStorage.getItem(re)||0),ae=ie&&Date.now()-ie<6e4;te.lost.then(e=>{if(console.error(`WebGPU device lost:`,e.reason,e.message),e.reason!==`destroyed`){if(ae){ne(`WebGPU-устройство теряется повторно (${e.reason}) — похоже, объёмная карта нестабильна на этом устройстве/браузере. Карта города ниже работает независимо от WebGPU.`);try{window.parent&&window.parent!==window&&typeof window.parent.forceCityView==`function`&&window.parent.forceCityView()}catch{}return}ne(`WebGPU-устройство потеряно (${e.reason}): ${e.message}\nПерезагрузка через 2с...`),sessionStorage.setItem(re,String(Date.now())),setTimeout(()=>location.reload(),2e3)}});let T=document.getElementById(`gpu`),oe=T.getContext(`webgpu`);if(!oe){t(`WebGPU: getContext('webgpu') вернул null.`);return}let se=navigator.gpu.getPreferredCanvasFormat();function ce(){let e=T.clientWidth,t=T.clientHeight;if(e<=0||t<=0)return;let n=Math.min(2,window.devicePixelRatio||1),r=Math.max(1,Math.floor(e*n)),i=Math.max(1,Math.floor(t*n));T.width!==r&&(T.width=r),T.height!==i&&(T.height=i)}let le=()=>{try{return window.parent?.__world3dPaused===!0}catch{return!1}},ue=()=>T.offsetParent===null&&T.clientWidth===0||le();ce(),new ResizeObserver(ce).observe(T),oe.configure({device:te,format:se,alphaMode:`opaque`}),e.push(`WebGPU: устройство получено, формат — ${se}`);let E=await Nt(te,oe,se);function de(e,t){return e+`,`+t}function fe(e,t){try{let n=window.parent;n&&n!==window&&typeof n.ensureWorldChunk==`function`&&n.ensureWorldChunk(e,t)}catch{}}let pe=new Map;function me(e,t){return[e[0]*t,e[1]*t,e[2]*t]}function he(e,t,n){if(Qt(e,t))return!0;for(let r=0;r<8;r++){let i=r/8*Math.PI*2;if(Qt(e+Math.cos(i)*n,t+Math.sin(i)*n))return!0}return!1}function ge(e,t,n,r){for(let i of C){let a=p.x[i]-e,o=p.y[i]-t,s=(g.get(i)??5)*n+r;if(a*a+o*o<s*s)return!0}return!1}function _e(e,t){return e>1.36?t<.62?`spruce`:t<.94?`pine`:`dead`:t<.58?`broadleaf`:t<.8?`birch`:t<.94?`spruce`:`dead`}function ve(e,t){let n=[];for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=e*4+i,o=t*4+r;if(X(a,o,13122)>=.65)continue;let s=.175+X(a,o,Y+778)*.65,c=.175+X(a,o,Y+779)*.65,l=e*16+i*4+s*4,u=t*16+r*4+c*4,d=l+(zt(l/8.5,u/8.5,Y+790)*2-1)*2,f=u+(zt(l/8.5,u/8.5,Y+791)*2-1)*2;if(he(d,f,1.5)||ge(d,f,.54,.68))continue;let p=X(a,o,Y+781)*Math.PI*2,m=.85+X(a,o,Y+782)*.3,h=Q(d,f),g=h*13,_=.0315+.5355*en(d,f),v=X(a,o,Y+780)<_,y=1+X(a,o,Y+785)*1.3,b=.8+X(a,o,Y+786)*.5;if(v){let e=_e(h,X(a,o,Y+780));e===`broadleaf`&&X(a,o,13132)<.35&&(e=`autumn`);let t=e===`spruce`||e===`pine`?Ye:Xe,r=t[Math.floor(X(a,o,Y+784)*t.length)];n.push({x:d,y:g,z:f,scale:[b,y,b],yaw:p,color:me(r,m),kind:e})}else{let e=.019+.056999999999999995*Math.min(1,h/1.6);if(X(a,o,13140)>=e)continue;let t=$e[Math.floor(X(a,o,Y+784)*$e.length)],r=.6+X(a,o,Y+785)*.9,i=.6+X(a,o,Y+786)*.9;n.push({x:d,y:g,z:f,scale:[i,r,i],yaw:p,color:me(t,m),kind:`rock`})}}for(let r=0;r<8;r++)for(let i=0;i<8;i++){let a=e*8+i,o=t*8+r;if(X(a,o,13232)>=.14875)continue;let s=X(a,o,Y+888),c=X(a,o,Y+889),l=e*16+i*2+s*2,u=t*16+r*2+c*2;if(he(l,u,.4)||ge(l,u,.36,.17))continue;let d=Q(l,u);if(d>2)continue;let f=d*13,p=X(a,o,Y+890)*Math.PI*2,m=.8+X(a,o,Y+891)*.4,h=Ze[Math.floor(X(a,o,Y+892)*Ze.length)],g=.8+X(a,o,Y+893)*.6;n.push({x:l,y:f,z:u,scale:[g,g,g],yaw:p,color:me(h,m),kind:`grass`})}let r=16/3;for(let i=0;i<r;i++)for(let a=0;a<r;a++){let o=e*r+a,s=t*r+i;if(X(o,s,13342)>=.07875)continue;let c=X(o,s,Y+998),l=X(o,s,Y+999),u=e*16+a*3+c*3,d=t*16+i*3+l*3;if(he(u,d,.9)||ge(u,d,.44,.34))continue;let f=Q(u,d);if(f>2)continue;let p=f*13,m=X(o,s,Y+1e3)*Math.PI*2,h=.85+X(o,s,Y+1001)*.3,g=Qe[Math.floor(X(o,s,Y+1002)*Qe.length)],_=.9+X(o,s,Y+1003)*.7;n.push({x:u,y:p,z:d,scale:[_,_,_],yaw:m,color:me(g,h),kind:`bush`})}return n}function ye(){let e=[];for(let t of pe.values())e.push(...t);E.setDecor(e),window.__decorCount=e.length,window.__decorList=e}let be=.5,xe=1,Se=(e,t)=>e*.8+t*.2,D=new Set,O=new Set,k=[],Ce=null,A=null;function we(e,t,n=!1){let r=Math.floor(e/16),i=Math.floor(t/16);if(!n&&r===Ce&&i===A)return;Ce=r,A=i;let a=!1;for(let e=-3;e<=3;e++)for(let t=-3;t<=3;t++){let n=r+t,o=i+e,s=de(n,o);D.has(s)||O.has(s)||(O.add(s),k.push({cx:n,cz:o,key:s}),a=!0)}let o=!1;for(let e of Array.from(D)){let[t,n]=e.split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>5&&(E.removeTerrainChunk(e),D.delete(e),pe.delete(e),o=!0)}for(let e of Array.from(O)){let[t,n]=e.split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>5&&(O.delete(e),a=!0)}a&&(k=k.filter(e=>O.has(e.key)),k.sort((e,t)=>(e.cx-r)**2+(e.cz-i)**2-((t.cx-r)**2+(t.cz-i)**2))),window.__terrainChunkCount=D.size,o&&ye()}function Te(e){let t=!1,n=0;for(;k.length&&!(n>0&&performance.now()+be>e);){let{cx:e,cz:r,key:i}=k.shift();if(!O.has(i))continue;O.delete(i);let a=performance.now(),o=e*16,s=r*16,c=dn(o,s,o+16,s+16,1);E.setTerrainChunk(i,c),D.add(i),fe(e,r),pe.set(i,ve(e,r)),t=!0,be=Se(be,performance.now()-a),n++}return t&&(window.__terrainChunkCount=D.size,ye()),n}function Ee(e,t){let n=de(e,t);if(!D.has(n))return;let r=e*16,i=t*16;E.setTerrainChunk(n,dn(r,i,r+16,i+16,1))}function De(e,t,n,r){let i=Math.floor(n/16),a=Math.floor(r/16),o=(i-3)*16,s=(i+3+1)*16,c=(a-3)*16,l=(a+3+1)*16,u=e*64,d=t*64;return u>=o&&u+64<=s&&d>=c&&d+64<=l}let j=new Set,M=new Set,N=[],ke=null,Ae=null;function je(e,t,n=!1){let r=Math.floor(e/64),i=Math.floor(t/64);if(!n&&r===ke&&i===Ae)return;ke=r,Ae=i;let a=!1;for(let n=-2;n<=2;n++)for(let o=-2;o<=2;o++){let s=r+o,c=i+n,l=`far:`+s+`,`+c;j.has(l)||M.has(l)||De(s,c,e,t)||(M.add(l),N.push({cx:s,cz:c,rkey:l}),a=!0)}for(let n of Array.from(j)){let[a,o]=n.slice(4).split(`,`).map(Number),s=Math.max(Math.abs(a-r),Math.abs(o-i))>3,c=De(a,o,e,t);(s||c)&&(E.removeTerrainChunk(n),j.delete(n))}for(let e of Array.from(M)){let[t,n]=e.slice(4).split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>3&&(M.delete(e),a=!0)}a&&(N=N.filter(e=>M.has(e.rkey)),N.sort((e,t)=>(e.cx-r)**2+(e.cz-i)**2-((t.cx-r)**2+(t.cz-i)**2))),window.__farChunkCount=j.size}function P(e,t){let n=0;for(;N.length&&!(!(n===0&&t)&&performance.now()+xe>e);){let{cx:e,cz:t,rkey:r}=N.shift();if(!M.has(r))continue;M.delete(r);let i=performance.now(),a=e*64,o=t*64,s=dn(a,o,a+64,o+64,4,.35);E.setTerrainChunk(r,s),j.add(r),xe=Se(xe,performance.now()-i),n++}window.__farChunkCount=j.size}let F=Cn(te,se,E.getShadowResources()),I=new Map;function Me(e){let t=I.get(e);return t||(t=bn(e).then(e=>Sn(te,e)),I.set(e,t)),t}let Ne=new Set(Array.from(C,e=>h.get(e)));await Promise.allSettled(Array.from(Ne,e=>Me(e)));let L=new Map,R=0,Fe=0;for(let t of C){let n=p.x[t],r=p.y[t],i=Q(n,r)*13;_.set(t,i);let a=We(n,i,r,0,g.get(t)??5),o=h.get(t);try{let e=await Me(o);L.set(t,F.createInstance(e,a)),R++}catch(t){Fe++,e.push(`модель: ошибка на ${o} — ${t instanceof Error?t.message:String(t)}`)}}e.push(`модели: загружено ${R}/${C.length}${Fe?`, ошибок: `+Fe:``}`),Rn(e),window.__ecsFound=C.length,window.__foundPositions=()=>C.map(e=>({x:p.x[e],z:p.y[e],scale:g.get(e)??5}));let Re=o?o.x:r.x,ze=o?o.y:r.y,z={yaw:0,pitch:.55,dist:42,target:[Re,Q(Re,ze)*13+2,ze]},V=_n(T,z);we(z.target[0],z.target[2],!0),je(z.target[0],z.target[2],!0);let et=performance.now()+40;Te(et),P(et,!0);let tt=dn(-Lt,-600,Lt,600,12,1.2);E.setTerrainChunk(`world-backdrop`,tt),e.push(`рельеф: чанков ${D.size} (16×16) + дальних ${j.size} (64×64, шаг 4) + задник (шаг 12, весь мир), в очереди ещё ${k.length+N.length}`),Rn(e),window.__coverageCheck=(e,t)=>{for(let n of D){let[r,i]=n.split(`,`).map(Number),a=r*16,o=i*16;if(e>=a&&e<a+16&&t>=o&&t<o+16)return`near`}for(let n of j){let[r,i]=n.slice(4).split(`,`).map(Number),a=r*64,o=i*64;if(e>=a&&e<a+64&&t>=o&&t<o+64)return`far`}return null},Object.defineProperty(window,"cam",{value:{get tx(){return z.target[0]},set tx(e){z.target[0]=e,V.stopAuto()},get ty(){return z.target[1]},set ty(e){z.target[1]=e,V.stopAuto()},get tz(){return z.target[2]},set tz(e){z.target[2]=e,V.stopAuto()},get dist(){return z.dist},set dist(e){z.dist=e,V.stopAuto()},get pitch(){return z.pitch},set pitch(e){z.pitch=e,V.stopAuto()}}}),window.H=(e,t)=>Q(e,t)*13,window.__camState=()=>({yaw:z.yaw,pitch:z.pitch,dist:z.dist,target:[...z.target]}),window.__isAutoOrbiting=()=>V.isAutoOrbiting();let H=new Float32Array(16),U=[0,0,0],W=document.getElementById(`selected`),nt=3.2,rt=2.6,it=e=>e.scout?rt:nt,at=e=>Q(e.x,e.y)*13+it(e),ot=e=>Q(e.x,e.y)*13+it(e)*.5,st=[1,.86,.42],ct=1500,lt=null,ut=null,dt=[.35,.85,.45],ft=null,G=null,pt=null;window.startFollowMarch=e=>{V.stopAuto(),pt=e},V.onInteract(()=>{pt=null});function mt(e){G=null,ft=e;let t=(v.get(e)??`?`)+` · `+(y.get(e)??`?`);window.__markerActive=!0,window.__selectedLabel=t,W.textContent=t,W.style.display=`block`}function ht(){ft=null,window.__markerActive=!1,window.__selectedLabel=null,W.style.display=`none`}function gt(e,t){let n=T.width/Math.max(1,T.height),r=Math.tan(K/2),i=e/T.width*2-1,a=1-t/T.height*2,o=B(Be(U,z.target)),s=B(Ve([0,1,0],o)),c=Ve(o,s),l=B([i*n*r*s[0]+a*r*c[0]-o[0],i*n*r*s[1]+a*r*c[1]-o[1],i*n*r*s[2]+a*r*c[2]-o[2]]);return{origin:U,dir:l}}let K=.72;function _t(e,t){let n=0;for(let r=2;r<=400;r+=2){let i=e[0]+t[0]*r;if(e[1]+t[1]*r-Q(i,e[2]+t[2]*r)*13<=0){let i=n,a=r;for(let n=0;n<12;n++){let n=(i+a)/2,r=e[0]+t[0]*n,o=e[2]+t[2]*n;e[1]+t[1]*n-Q(r,o)*13>0?i=n:a=n}return{t:a,x:e[0]+t[0]*a,z:e[2]+t[2]*a}}n=r}return null}function vt(e,t){try{let n=window.parent;n&&n!==window&&typeof n.renderCartoucheFor==`function`&&n.renderCartoucheFor(e,t)}catch{}}function yt(e){try{let t=window.parent;t&&t!==window&&typeof t.renderMarchCartoucheFor==`function`&&t.renderMarchCartoucheFor(e)}catch{}}function bt(e){let t=qe(H,e);return t.w<=.001?null:{sx:(t.x/t.w*.5+.5)*T.width,sy:(1-(t.y/t.w*.5+.5))*T.height,w:t.w}}function xt(e,t){let n=.5*T.height/Math.tan(K/2),r=null,i=1/0;for(let a of C){let o=p.x[a],s=p.y[a],c=g.get(a)??5,l=[o,(_.get(a)??Q(o,s)*13)+c*.5,s],u=bt(l);if(!u)continue;let d=Math.max(26,n*c/u.w),f=e-u.sx,m=t-u.sy,h=f*f+m*m;h>d*d||h>=i||(i=h,r={kind:`entity`,eid:a,distToCam:Math.hypot(o-U[0],l[1]-U[1],s-U[2])})}for(let a of q){let o=[a.x,ot(a),a.y],s=bt(o);if(!s)continue;let c=Math.max(3,it(a)*.5),l=Math.max(26,n*c/s.w),u=e-s.sx,d=t-s.sy,f=u*u+d*d;f>l*l||f>=i||(i=f,r={kind:`march`,march:a,distToCam:Math.hypot(a.x-U[0],o[1]-U[1],a.y-U[2])})}let{origin:a,dir:o}=gt(e,t),s=_t(a,o);return r&&!(s!==null&&s.t+5<r.distToCam)?r.kind===`entity`?{kind:`entity`,eid:r.eid,t:r.distToCam}:{kind:`march`,march:r.march,t:r.distToCam}:s===null?null:{kind:`ground`,x:s.x,z:s.z,t:s.t}}V.onTap((e,t)=>{let n=T.getBoundingClientRect(),r=xt((e-n.left)*(T.width/n.width),(t-n.top)*(T.height/n.height));if(r?.kind===`entity`){mt(r.eid);let e=x.get(r.eid);e&&vt(e.x,e.y);return}if(r?.kind===`march`){ht(),G=r.march.id,window.__selectedMarchId=r.march.id,yt(r.march.id);return}ht(),G=null,r?.kind===`ground`&&vt(Math.floor(r.x),Math.floor(r.z))});function St(e,t){let n=T.getBoundingClientRect();return[(e-n.left)*(T.width/n.width),(t-n.top)*(T.height/n.height)]}function Ct(e,t){let[n,r]=St(e,t),i=xt(n,r);if(!i)return null;if(i.kind===`ground`)return{x:i.x,z:i.z};if(i.kind===`entity`){let e=x.get(i.eid);if(e)return{x:e.x+.5,z:e.y+.5}}return i.kind===`march`?{x:i.march.x,z:i.march.y}:null}function wt(e,t){let n=Ct(e,t);if(!n){ut=null;return}ut={x:n.x,y:Q(n.x,n.z)*13+3,z:n.z,color:dt}}V.onGrab((e,t)=>{let[n,r]=St(e,t),i=xt(n,r);return i?.kind!==`march`||!i.march.own?!1:(lt=i.march.id,wt(e,t),!0)},(e,t)=>{lt!==null&&wt(e,t)},(e,t)=>{let n=lt;if(lt=null,ut=null,n===null||!isFinite(e)||!isFinite(t))return;let r=Ct(e,t);if(r)try{let e=window.parent;e&&e!==window&&typeof e.redirectMarchTo==`function`&&e.redirectMarchTo(n,Math.floor(r.x),Math.floor(r.z))}catch{}});let Tt=!1,Et=0;async function Dt(){let e=jn(z.target[0],z.target[2],192);if(!e)return;let t=new Set,n=[],r=new Set;for(let i of e){t.add(i.key);let e=S.get(i.key);if(e!==void 0){if(v.set(e,i.nm),y.set(e,i.lv),b.set(e,!!i.own),ft===e&&mt(e),h.get(e)!==i.model){h.set(e,i.model),g.set(e,i.scale);let t=p.x[e],r=p.y[e],a=Q(t,r)*13;_.set(e,a);let o=We(t,a,r,0,i.scale);n.push(Me(i.model).then(t=>{F.destroyInstance(L.get(e)),L.set(e,F.createInstance(t,o))}).catch(()=>{}))}continue}let a=ee(i),o=Q(i.x,i.y)*13;_.set(a,o);let s=We(i.x,o,i.y,0,i.scale);n.push(Me(i.model).then(e=>{F.destroyInstance(L.get(a)),L.set(a,F.createInstance(e,s))}).catch(()=>{})),r.add(de(Math.floor(i.x/16),Math.floor(i.y/16))),Ee(Math.floor(i.x/16),Math.floor(i.y/16))}for(let[e,n]of Array.from(S))t.has(e)||(r.add(de(Math.floor(p.x[n]/16),Math.floor(p.y[n]/16))),Le(f,n),F.destroyInstance(L.get(n)),L.delete(n),h.delete(n),g.delete(n),_.delete(n),v.delete(n),y.delete(n),b.delete(n),x.delete(n),S.delete(e),ft===n&&ht());await Promise.allSettled(n),C=Array.from(Oe(f,[p,m]));let i=!1;for(let e of r){if(!D.has(e))continue;let[t,n]=e.split(`,`).map(Number);pe.set(e,ve(t,n)),i=!0}i&&ye(),Et++,window.__ecsFound=C.length,window.__syncCount=Et}setInterval(()=>{ue()||Tt||(Tt=!0,Dt().catch(e=>console.error(`live sync:`,e)).finally(()=>{Tt=!1}))},3e3);let q=[];function Ot(){q=In()||[],window.__marchPositions=q}let kt=new Set([`human`,`dwarf`,`elf`,`undead`]),At=[.62,1.14,.72,.32],jt=[1.22,.55,.5,.32];function Mt(e){let t=kt.has(e.race)?e.race:`human`;return e.scout?`/models/marches/scout-${t}.glb`:e.hasGen?`/models/marches/gen-${t}-${+(e.genId===1)}.glb`:`/models/marches/army-${t}.glb`}let J=new Map;function Pt(){for(let e of q){let t=Mt(e),n=J.get(e.id);if(n&&n.path!==t&&(F.destroyInstance(n.inst??void 0),J.delete(e.id),n=void 0),!n){n={path:t,inst:null,yaw:Number.isFinite(e.yaw)?e.yaw:0},J.set(e.id,n);let r=n,i=e.id;Me(t).then(e=>{J.get(i)===r&&(r.inst=F.createInstance(e,We(0,-1e6,0,0,1),At))},()=>{})}if(Number.isFinite(e.yaw)&&(n.yaw=e.yaw),n.inst){let t=e.scout?rt:nt;F.updateInstance(n.inst,We(e.x,Q(e.x,e.y)*13,e.y,n.yaw,t),e.own?At:jt)}}if(J.size>q.length){let e=new Set(q.map(e=>e.id));for(let[t,n]of J)e.has(t)||(F.destroyInstance(n.inst??void 0),J.delete(t))}}let Ft=document.getElementById(`labels`),It=new Map,Rt=Ge(),Bt=1024;function Vt(){let e=new Set,t=T.clientWidth,n=T.clientHeight;for(let r of C){let i=p.x[r],a=p.y[r],o=i-z.target[0],s=a-z.target[2];if(o*o+s*s>Bt)continue;let c=(_.get(r)??Q(i,a)*13)+(g.get(r)??5)*.6+1.1,l=Ke(H,i,c,a,Rt);if(l.w<=.001)continue;let u=(l.x/l.w*.5+.5)*t,d=(1-(l.y/l.w*.5+.5))*n;if(u<-40||u>t+40||d<-40||d>n+40)continue;e.add(r);let f=It.get(r);if(!f){let e=document.createElement(`div`);e.className=`wlabel`;let t=document.createElement(`div`);t.className=`nm`;let n=document.createElement(`div`);n.className=`lv`,e.appendChild(t),e.appendChild(n),Ft.appendChild(e),f={root:e,nm:t,lv:n,lastNm:``,lastLv:``,lastMine:!1},It.set(r,f)}let m=v.get(r)??`?`;f.lastNm!==m&&(f.nm.textContent=m,f.lastNm=m);let h=!!b.get(r);f.lastMine!==h&&(f.nm.classList.toggle(`mine`,h),f.lastMine=h);let x=y.get(r)??``;f.lastLv!==x&&(f.lv.textContent=x,f.lastLv=x),f.root.style.transform=`translate(${u.toFixed(1)}px,${d.toFixed(1)}px) translate(-50%,-100%)`}for(let[t,n]of It)e.has(t)||(n.root.remove(),It.delete(t))}let Ht=new Map;function Ut(e,t,n,r){if(!r||!n||r<=n)return t;let i=Math.max(0,Math.min(1,(Date.now()-n)/(r-n)));return e+(t-e)*i}function Gt(){let e=new Set,t=T.clientWidth,n=T.clientHeight;for(let r of q){let i=r.battle;if(!i)continue;let a=r.x-z.target[0],o=r.y-z.target[2];if(a*a+o*o>Bt)continue;let s=at(r)+1.6,c=qe(H,[r.x,s,r.y]);if(c.w<=.001)continue;let l=(c.x/c.w*.5+.5)*t,u=(1-(c.y/c.w*.5+.5))*n;if(l<-60||l>t+60||u<-60||u>n+60)continue;e.add(r.id);let d=Ht.get(r.id);if(!d){let e=document.createElement(`div`);e.className=`blabel`;let t=document.createElement(`div`);t.className=`btitle`;let n=document.createElement(`div`);n.className=`bbar atk`;let i=document.createElement(`i`);n.appendChild(i);let a=document.createElement(`div`);a.className=`bbar def`;let o=document.createElement(`i`);a.appendChild(o),e.appendChild(t),e.appendChild(n),e.appendChild(a),Ft.appendChild(e),d={root:e,title:t,atkFill:i,defFill:o},Ht.set(r.id,d)}let f=i.retreating,p=!f&&i.revealFromRound===0,m=i.demolish;d.root.className=`blabel`+(f?` retreat`:p?` deploy`:m?` demolish`:``),d.title.textContent=f?`Отступление`:p?`Развёртывание`:m?m.name?`Таранят: `+m.name:`Город разбирают`:`Бой — раунд `+i.round;let h=Math.max(0,Math.min(100,Ut(i.revealFromAttHp,i.attHpLeft,i.revealStart,i.revealAt)/Math.max(1,i.attStartHp)*100)),g=m?Math.max(0,Math.min(100,Ut(m.sameTarget?m.revealFromHp:m.hp,m.hp,i.revealStart,i.revealAt)/Math.max(1,m.max)*100)):Math.max(0,Math.min(100,Ut(i.revealFromDefHp,i.defHpLeft,i.revealStart,i.revealAt)/Math.max(1,i.defStartHp)*100));d.atkFill.style.width=h.toFixed(1)+`%`,d.defFill.style.width=g.toFixed(1)+`%`,d.root.style.transform=`translate(${l.toFixed(1)}px,${u.toFixed(1)}px) translate(-50%,-100%)`}for(let[t,n]of Ht)e.has(t)||(n.root.remove(),Ht.delete(t))}let Kt=Ge();function qt(e,t,n,r,i){let a=p.x[e],o=p.y[e],s=g.get(e)??5,c=(_.get(e)??0)+s*.6,l=a-U[0],u=c-U[1],d=o-U[2],f=l*l+u*u+d*d;if(f<3600)return!0;if(f>16900)return!1;let m=Ke(t,a,c,o,Kt);if(m.w<=.001)return!1;let h=(m.x/m.w*.5+.5)*n,v=(1-(m.y/m.w*.5+.5))*r,y=i*s/m.w+24;return h>-y&&h<n+y&&v>-y&&v<r+y}let Z={frame:0,chunks:0,render:0,labels:0,maxFrame:0,maxChunks:0,maxRender:0,maxLabels:0,n:0,worstFrame:0,worstChunks:0,worstRender:0,worstLabels:0};function Jt(){Z.maxFrame=Math.max(Z.maxFrame,Z.frame),Z.maxChunks=Math.max(Z.maxChunks,Z.chunks),Z.maxRender=Math.max(Z.maxRender,Z.render),Z.maxLabels=Math.max(Z.maxLabels,Z.labels),++Z.n>=60&&(Z.worstFrame=Z.maxFrame,Z.worstChunks=Z.maxChunks,Z.worstRender=Z.maxRender,Z.worstLabels=Z.maxLabels,Z.maxFrame=Z.maxChunks=Z.maxRender=Z.maxLabels=0,Z.n=0,Rn([`кадр (худший из 60): ${Z.worstFrame.toFixed(1)} мс`,`  стройка чанков: ${Z.worstChunks.toFixed(1)} мс`,`  отрисовка:      ${Z.worstRender.toFixed(1)} мс`,`  подписи:        ${Z.worstLabels.toFixed(1)} мс`,`чанков ${window.__terrainChunkCount??0} · моделей в кадре ${window.__modelDrawCount??0} · сущностей ${window.__ecsFound??C.length} · декора ${window.__decorCount??0}`,`в очереди на стройку: ${k.length} ближних`])),window.__perf=Z}let Yt=!1;function Xt(e){let t=$?performance.now():0;try{$t(e)}catch(e){console.error(`draw:`,e),Yt||(Yt=!0,ne(`Сбой в кадре: ${e instanceof Error?e.message:String(e)}`))}$&&(Z.frame=performance.now()-t,Jt()),requestAnimationFrame(Xt)}function $t(e){if(ue())return;V.isAutoOrbiting()&&(z.yaw=e*15e-5),V.update(e),Ot();let t=[];if(pt!==null){let e=q.find(e=>e.id===pt);e?(z.target[0]=e.x,z.target[2]=e.y,z.target[1]=Q(e.x,e.y)*13+1):pt=null}z.target[0],z.target[2],we(z.target[0],z.target[2]),je(z.target[0],z.target[2]);let n=performance.now(),r=n+3;P(r,Te(r)===0),$&&(Z.chunks=performance.now()-n);let o=[z.target[0]+Math.sin(z.yaw)*Math.cos(z.pitch)*z.dist,z.target[1]+Math.sin(z.pitch)*z.dist,z.target[2]+Math.cos(z.yaw)*Math.cos(z.pitch)*z.dist],s=Q(o[0],o[2])*13+2;o[1]<s&&(o[1]=s);let c=T.width/Math.max(1,T.height),l=He(Ue(K,c,.5,392),Je(o,z.target,[0,1,0]));H=l,U=o,E.setVP(l),E.setFog(o,i,a,e/1e3),E.setSunTarget(z.target[0],z.target[2]);{let t=B(Be(o,z.target)),n=B(Ve([0,1,0],t)),r=Ve(t,n);E.setSkyCamera(n,r,t,Math.tan(K/2),c,e/1e3)}F.setFog(o,i,a),F.setVP(l),G!==null&&!q.some(e=>e.id===G)&&(G=null),ut&&t.push(ut),E.setMarkers(t),Pt(),window.__marchCount=q.length;let u=T.clientWidth,d=T.clientHeight,f=.5*d/Math.tan(K/2),p=0,m=$?performance.now():0,h=ft===null?G===null?null:J.get(G)?.inst??null:L.get(ft)??null;if(h){let t=.5-.5*Math.cos(e%ct/ct*Math.PI*2);F.setOutlineStyle(st,.003+.0017999999999999995*t)}E.frame({r:i[0],g:i[1],b:i[2],a:1},e=>{F.beginModels(e);for(let t of C){if(!qt(t,l,u,d,f))continue;let n=L.get(t);n&&(F.draw(e,n),p++)}for(let t of J.values())t.inst&&(F.draw(e,t.inst),p++);h&&(F.beginOutlines(e),F.drawOutline(e,h))}),window.__modelDrawCount=p,$&&(Z.render=performance.now()-m);let g=$?performance.now():0;Vt(),Gt(),$&&(Z.labels=performance.now()-g)}requestAnimationFrame(Xt),window.__engineReady=!0}Bn().catch(e=>{zn([`Ошибка: ${e instanceof Error?e.message:String(e)}`]),console.error(e)});