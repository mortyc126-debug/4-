(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=(e,t,n)=>Object.defineProperty(e,t,{value:n,enumerable:!1,writable:!0,configurable:!0}),t=(e,t)=>t&e.entityMask,n=(e,t)=>t>>>e.versionShift&(1<<e.versionBits)-1,r=(e,t)=>{let r=n(e,t)+1&(1<<e.versionBits)-1;return t&e.entityMask|r<<e.versionShift},i=e=>{let t=e?typeof e==`function`?e():e:{versioning:!1,versionBits:8},n=t.versionBits??8,r=t.versioning??!1,i=32-n,a=(1<<i)-1,o=i;return{aliveCount:0,dense:[],sparse:[],maxId:0,versioning:r,versionBits:n,entityMask:a,versionShift:o,versionMask:(1<<n)-1<<o}},a=e=>{if(e.aliveCount<e.dense.length){let t=e.dense[e.aliveCount],n=t;return e.sparse[n]=e.aliveCount,e.aliveCount++,t}let t=++e.maxId;return e.dense.push(t),e.sparse[t]=e.aliveCount,e.aliveCount++,t},o=(e,t)=>{let n=e.sparse[t];if(n===void 0||n>=e.aliveCount)return;let i=e.aliveCount-1,a=e.dense[i];if(e.sparse[a]=n,e.dense[n]=a,e.sparse[t]=i,e.dense[i]=t,e.versioning){let n=r(e,t);e.dense[i]=n}e.aliveCount--},s=(e,n)=>{let r=t(e,n),i=e.sparse[r];return i!==void 0&&i<e.aliveCount&&e.dense[i]===n},c=Symbol.for(`bitecs_internal`),l=(t,n)=>e(t||{},c,{entityIndex:n||i(),entityMasks:[[]],entityComponents:new Map,bitflag:1,componentMap:new Map,componentCount:0,queries:new Set,queriesHashMap:new Map,notQueries:new Set,dirtyQueries:new Set,entitiesWithRelations:new Set,hierarchyData:new Map,hierarchyActiveRelations:new Set,hierarchyQueryCache:new Map});function u(...e){let t,n;return e.forEach(e=>{typeof e==`object`&&`dense`in e&&`sparse`in e&&`aliveCount`in e?t=e:typeof e==`object`&&(n=e)}),l(n,t)}var d=()=>{let e=[],t=[],n=n=>e[t[n]]===n;return{add:r=>{n(r)||(t[r]=e.push(r)-1)},remove:r=>{if(!n(r))return;let i=t[r],a=e.pop();a!==r&&(e[i]=a,t[a]=i)},has:n,sparse:t,dense:e,reset:()=>{e.length=0,t.length=0},sort:n=>{e.sort(n);for(let n=0;n<e.length;n++)t[e[n]]=n}}},f=typeof SharedArrayBuffer<`u`?SharedArrayBuffer:ArrayBuffer,p=(e=1e3)=>{let t=[],n=0,r=new Uint32Array(new f(e*4)),i=e=>e<t.length&&t[e]<n&&r[t[e]]===e;return{add:e=>{if(!i(e)){if(n>=r.length){let e=new Uint32Array(new f(r.length*2*4));e.set(r),r=e}r[n]=e,t[e]=n,n++}},remove:e=>{if(!i(e))return;n--;let a=t[e],o=r[n];r[a]=o,t[o]=a},has:i,sparse:t,get dense(){return new Uint32Array(r.buffer,0,n)},reset:()=>{n=0,t.length=0},sort:e=>{let i=Array.from(r.subarray(0,n));i.sort(e);for(let e=0;e<i.length;e++)r[e]=i[e];for(let e=0;e<n;e++)t[r[e]]=e}}},m=()=>{let e=new Set;return{subscribe:t=>(e.add(t),()=>{e.delete(t)}),notify:(t,...n)=>Array.from(e).reduce((e,r)=>{let i=r(t,...n);return i&&typeof i==`object`?{...e,...i}:e},{})}},h=Symbol.for(`bitecs-relation`),g=Symbol.for(`bitecs-pairTarget`),_=Symbol.for(`bitecs-isPairComponent`),v=Symbol.for(`bitecs-relationData`),y=()=>{let t={pairsMap:new Map,initStore:void 0,exclusiveRelation:!1,autoRemoveSubject:!1,onTargetRemoved:void 0},n=r=>{if(r===void 0)throw Error(`Relation target is undefined`);let i=r===`*`?w:r;if(!t.pairsMap.has(i)){let a=t.initStore?t.initStore(r):{};e(a,h,n),e(a,g,i),e(a,_,!0),t.pairsMap.set(i,a)}return t.pairsMap.get(i)};return e(n,v,t),n},b=(e,t)=>{if(e===void 0)throw Error(`Relation is undefined`);return e(t)},x=(e,t,n)=>{let r=Le(e,t),i=[];for(let e of r)e[h]===n&&e[g]!==w&&!ie(e[g])&&i.push(e[g]);return i},S=Symbol.for(`bitecs-wildcard`);function ee(){let e=y();return Object.defineProperty(e,S,{value:!0,enumerable:!1,writable:!1,configurable:!1}),e}function C(){let e=Symbol.for(`bitecs-global-wildcard`);return globalThis[e]||(globalThis[e]=ee()),globalThis[e]}var w=C();function te(){return y()}function ne(){let e=Symbol.for(`bitecs-global-isa`);return globalThis[e]||(globalThis[e]=te()),globalThis[e]}var re=ne();function ie(e){return e?Object.getOwnPropertySymbols(e).includes(v):!1}var ae=64,T=4294967295,oe=1024;function se(e,t){let{depths:n}=e;if(t<n.length)return n;let r=Math.max(t+1,n.length*2,n.length+oe),i=new Uint32Array(r);return i.fill(T),i.set(n),e.depths=i,i}function ce(e,t,n,r){let{depthToEntities:i}=e;if(r!==void 0&&r!==T){let e=i.get(r);e&&(e.remove(t),e.dense.length===0&&i.delete(r))}n!==T&&(i.has(n)||i.set(n,p()),i.get(n).add(t))}function le(e,t){t>e.maxDepth&&(e.maxDepth=t)}function ue(e,t,n,r){e.depths[t]=n,ce(e,t,n,r),le(e,n)}function E(e,t){e[c].hierarchyQueryCache.delete(t)}function de(e,t){let n=e[c];return n.hierarchyActiveRelations.has(t)||(n.hierarchyActiveRelations.add(t),pe(e,t),fe(e,t)),n.hierarchyData.get(t)}function fe(e,t){let n=De(e,[b(t,w)]);for(let r of n)he(e,t,r);let r=new Set;for(let i of n)for(let n of x(e,i,t))r.has(n)||(r.add(n),he(e,t,n))}function pe(e,t){let n=e[c];if(!n.hierarchyData.has(t)){let e=Math.max(oe,n.entityIndex.dense.length*2),r=new Uint32Array(e);r.fill(T),n.hierarchyData.set(t,{depths:r,dirty:d(),depthToEntities:new Map,maxDepth:0})}}function me(e,t,n,r=new Set){if(r.has(n))return 0;r.add(n);let i=x(e,n,t);if(i.length===0)return 0;if(i.length===1)return D(e,t,i[0],r)+1;let a=1/0;for(let n of i){let i=D(e,t,n,r);if(i<a&&(a=i,a===0))break}return a===1/0?0:a+1}function D(e,t,n,r){let i=e[c];pe(e,t);let a=i.hierarchyData.get(t),{depths:o}=a;if(o=se(a,n),o[n]===T){let i=me(e,t,n,r);return ue(a,n,i),i}return o[n]}function he(e,t,n){return D(e,t,n,new Set)}function ge(e,t,n,r,i=d()){if(i.has(n))return;i.add(n);let a=De(e,[t(n)]);for(let n of a)r.add(n),ge(e,t,n,r,i)}function _e(e,t,n,r,i=new Set){let a=e[c];if(!a.hierarchyActiveRelations.has(t))return;pe(e,t);let o=a.hierarchyData.get(t);if(i.has(n)){o.dirty.add(n);return}i.add(n);let{depths:s,dirty:l}=o,u=r===void 0?0:he(e,t,r)+1;if(u>ae)return;let f=s[n];ue(o,n,u,f===T?void 0:f),f!==u&&(ge(e,t,n,l,d()),E(e,t))}function ve(e,t,n){let r=e[c];if(!r.hierarchyActiveRelations.has(t))return;let i=r.hierarchyData.get(t),{depths:a}=i;a=se(i,n),ye(e,t,n,a,d()),E(e,t)}function ye(e,t,n,r,i){if(i.has(n))return;i.add(n);let a=e[c].hierarchyData.get(t);if(n<r.length){let e=r[n];e!==T&&(a.depths[n]=T,ce(a,n,T,e))}let o=De(e,[t(n)]);for(let n of o)ye(e,t,n,r,i)}function be(e,t){let n=e[c].hierarchyData.get(t);if(!n)return;let{dirty:r,depths:i}=n;if(r.dense.length!==0){for(let a of r.dense)i[a]===T&&ue(n,a,me(e,t,a));r.reset()}}function xe(e,t,n,r={}){let i=e[c];de(e,t);let a=Ee(e,[t,...n]),o=i.hierarchyQueryCache.get(t);if(o&&o.hash===a)return o.result;be(e,t),N(e,n,r);let s=i.queriesHashMap.get(Ee(e,n)),{depths:l}=i.hierarchyData.get(t);s.sort((e,t)=>{let n=l[e],r=l[t];return n===r?e-t:n-r});let u=(r.buffered,s.dense);return i.hierarchyQueryCache.set(t,{hash:a,result:u}),u}function O(e,t,n,r={}){let i=de(e,t);be(e,t);let a=i.depthToEntities.get(n);return a?(r.buffered,a.dense):r.buffered?new Uint32Array:[]}var k=Symbol.for(`bitecs-opType`),A=Symbol.for(`bitecs-opTerms`),Se=Symbol.for(`bitecs-hierarchyType`),j=Symbol.for(`bitecs-hierarchyRel`),Ce=Symbol.for(`bitecs-hierarchyDepth`),we=Symbol.for(`bitecs-modifierType`),Te={[we]:`nested`},Ee=(e,t)=>{let n=e[c],r=t=>(n.componentMap.has(t)||I(e,t),n.componentMap.get(t).id),i=e=>k in e?`${e[k].toLowerCase()}(${e[A].map(i).sort().join(`,`)})`:r(e).toString();return t.map(i).sort().join(`-`)},M=(e,t,n={})=>{let r=e[c],i=Ee(e,t),a=[],o=t=>{k in t?t[A].forEach(o):(r.componentMap.has(t)||I(e,t),a.push(t))};t.forEach(o);let s=[],l=[],u=[],f=(t,n)=>{n.forEach(n=>{r.componentMap.has(n)||I(e,n),t.push(n)})};t.forEach(t=>{if(k in t){let{[k]:e,[A]:n}=t;if(e===`Not`)f(l,n);else if(e===`Or`)f(u,n);else if(e===`And`)f(s,n);else throw Error(`Nested combinator ${e} not supported yet - use simple queries for best performance`)}else r.componentMap.has(t)||I(e,t),s.push(t)});let h=a.map(e=>r.componentMap.get(e)),g=[...new Set(h.map(e=>e.generationId))],_=(e,t)=>(e[t.generationId]=(e[t.generationId]||0)|t.bitflag,e),v=s.map(e=>r.componentMap.get(e)).reduce(_,{}),y=l.map(e=>r.componentMap.get(e)).reduce(_,{}),b=u.map(e=>r.componentMap.get(e)).reduce(_,{}),x=h.reduce(_,{}),S=Object.assign(n.buffered?p():d(),{allComponents:a,orComponents:u,notComponents:l,masks:v,notMasks:y,orMasks:b,hasMasks:x,generations:g,toRemove:d(),addObservable:m(),removeObservable:m(),queues:{}});r.queries.add(S),r.queriesHashMap.set(i,S),h.forEach(e=>{e.queries.add(S)}),l.length&&r.notQueries.add(S);let ee=r.entityIndex;for(let t=0;t<ee.aliveCount;t++){let n=ee.dense[t];L(e,n,Pe)||P(e,S,n)&&Oe(S,n)}return S};function N(e,t,n={}){let r=e[c],i=Ee(e,t),a=r.queriesHashMap.get(i);return a?n.buffered&&!(`buffer`in a.dense)&&(a=M(e,t,{buffered:!0})):a=M(e,t,n),n.buffered,a.dense}function De(e,t,...n){let r=t.find(e=>e&&typeof e==`object`&&Se in e),i=t.filter(e=>!(e&&typeof e==`object`&&Se in e)),a=!1,o=!0,s=n.some(e=>e&&typeof e==`object`&&we in e);for(let e of n)if(s&&e&&typeof e==`object`&&we in e){let t=e;t[we]===`buffer`&&(a=!0),t[we]===`nested`&&(o=!1)}else if(!s){let t=e;t.buffered!==void 0&&(a=t.buffered),t.commit!==void 0&&(o=t.commit)}if(r){let{[j]:t,[Ce]:n}=r;return n===void 0?xe(e,t,i,{buffered:a}):O(e,t,n,{buffered:a})}return o&&Ae(e),N(e,i,{buffered:a})}function P(e,t,n){let r=e[c],{masks:i,notMasks:a,orMasks:o,generations:s}=t,l=Object.keys(o).length===0;for(let e=0;e<s.length;e++){let t=s[e],c=i[t],u=a[t],d=o[t],f=r.entityMasks[t][n];if(u&&f&u||c&&(f&c)!==c)return!1;d&&f&d&&(l=!0)}return l}var Oe=(e,t)=>{if(e.toRemove.has(t)){e.toRemove.remove(t),e.addObservable.notify(t);return}e.has(t)||(e.add(t),e.addObservable.notify(t))},ke=e=>{for(let t=0;t<e.toRemove.dense.length;t++){let n=e.toRemove.dense[t];e.remove(n)}e.toRemove.reset()},Ae=e=>{let t=e[c];t.dirtyQueries.size&&(t.dirtyQueries.forEach(ke),t.dirtyQueries.clear())},F=(e,t,n)=>{let r=e[c];!t.has(n)||t.toRemove.has(n)||(t.toRemove.add(n),r.dirtyQueries.add(t),t.removeObservable.notify(n))},I=(e,t)=>{if(!t)throw Error(`bitECS - Cannot register null or undefined component`);let n=e[c],r=new Set,i={id:n.componentCount++,generationId:n.entityMasks.length-1,bitflag:n.bitflag,ref:t,queries:r,setObservable:m(),getObservable:m()};return n.componentMap.set(t,i),n.bitflag*=2,n.bitflag>=2**31&&(n.bitflag=1,n.entityMasks.push([])),i},L=(e,t,n)=>{let r=e[c],i=r.componentMap.get(n);if(!i)return!1;let{generationId:a,bitflag:o}=i;return(r.entityMasks[a][t]&o)===o},je=(e,t,n)=>{let r=e[c].componentMap.get(n);if(r&&L(e,t,n))return r.getObservable.notify(t)},Me=(e,t,n,r,i=new Set)=>{if(!i.has(r)){i.add(r),Ne(t,n,re(r));for(let i of Le(t,r))if(i!==Pe&&!L(t,n,i)){Ne(t,n,i);let a=e.componentMap.get(i);if(a?.setObservable){let e=je(t,r,i);a.setObservable.notify(n,e)}}for(let a of x(t,r,re))Me(e,t,n,a,i)}},Ne=(e,t,n)=>{if(!Re(e,t))throw Error(`Cannot add component - entity ${t} does not exist in the world.`);let r=e[c],i=`component`in n?n.component:n,a=`data`in n?n.data:void 0;r.componentMap.has(i)||I(e,i);let o=r.componentMap.get(i);if(L(e,t,i))return a!==void 0&&o.setObservable.notify(t,a),!1;let{generationId:s,bitflag:l,queries:u}=o;if(r.entityMasks[s][t]|=l,L(e,t,Pe)||u.forEach(n=>{P(e,n,t)?Oe(n,t):F(e,n,t)}),r.entityComponents.get(t).add(i),a!==void 0&&o.setObservable.notify(t,a),i[_]){let n=i[h],a=i[g];if(R(e,t,b(n,w),b(w,a)),typeof a==`number`&&(R(e,a,b(w,t),b(w,n)),r.entitiesWithRelations.add(a),r.entitiesWithRelations.add(t)),r.entitiesWithRelations.add(a),n[v].exclusiveRelation===!0&&a!==w){let r=x(e,t,n)[0];r!=null&&r!==a&&z(e,t,n(r))}if(n===re){let n=x(e,t,re);for(let i of n)Me(r,e,t,i)}_e(e,n,t,typeof a==`number`?a:void 0)}return!0};function R(e,t,...n){(Array.isArray(n[0])?n[0]:n).forEach(n=>{Ne(e,t,n)})}var z=(e,t,...n)=>{let r=e[c];if(!Re(e,t))throw Error(`Cannot remove component - entity ${t} does not exist in the world.`);n.forEach(n=>{if(!L(e,t,n))return;let{generationId:i,bitflag:a,queries:o}=r.componentMap.get(n);if(r.entityMasks[i][t]&=~a,o.forEach(n=>{n.toRemove.remove(t),P(e,n,t)?Oe(n,t):F(e,n,t)}),r.entityComponents.get(t).delete(n),n[_]){let r=n[g],i=n[h];ve(e,i,t),z(e,t,b(w,r)),typeof r==`number`&&Re(e,r)&&(z(e,r,b(w,t)),z(e,r,b(w,i))),x(e,t,i).length===0&&z(e,t,b(i,w))}})},Pe={};function Fe(e,...t){let n=e[c],r=a(n.entityIndex);return n.notQueries.forEach(t=>{P(e,t,r)&&Oe(t,r)}),n.entityComponents.set(r,new Set),t.length>0&&R(e,r,t),r}var Ie=(e,t)=>{let n=e[c];if(!s(n.entityIndex,t))return;let r=[t],i=new Set;for(;r.length>0;){let t=r.shift();if(i.has(t))continue;i.add(t);let a=[];if(n.entitiesWithRelations.has(t)){for(let i of De(e,[w(t)],Te))if(Re(e,i))for(let o of n.entityComponents.get(i)){if(!o[_])continue;let n=o[h][v];a.push(()=>z(e,i,b(w,t))),o[g]===t&&(a.push(()=>z(e,i,o)),n.autoRemoveSubject&&r.push(i),n.onTargetRemoved&&a.push(()=>n.onTargetRemoved(e,i,t)))}n.entitiesWithRelations.delete(t)}for(let e of a)e();for(let t of r)Ie(e,t);for(let r of n.queries)F(e,r,t);o(n.entityIndex,t),n.entityComponents.delete(t);for(let e=0;e<n.entityMasks.length;e++)n.entityMasks[e][t]=0}},Le=(e,t)=>{let n=e[c];if(t===void 0)throw Error(`getEntityComponents: entity id is undefined.`);if(!s(n.entityIndex,t))throw Error(`getEntityComponents: entity ${t} does not exist in the world.`);return Array.from(n.entityComponents.get(t))},Re=(e,t)=>s(e[c].entityIndex,t),ze=(e,t)=>[e[0]-t[0],e[1]-t[1],e[2]-t[2]],B=(e,t)=>e[0]*t[0]+e[1]*t[1]+e[2]*t[2],Be=(e,t)=>[e[1]*t[2]-e[2]*t[1],e[2]*t[0]-e[0]*t[2],e[0]*t[1]-e[1]*t[0]],V=e=>{let t=Math.hypot(e[0],e[1],e[2])||1;return[e[0]/t,e[1]/t,e[2]/t]};function Ve(e,t){let n=new Float32Array(16);for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=0;for(let n=0;n<4;n++)a+=e[n*4+i]*t[r*4+n];n[r*4+i]=a}return n}function He(e,t,n,r){let i=1/Math.tan(e/2);return new Float32Array([i/t,0,0,0,0,i,0,0,0,0,(r+n)/(n-r),-1,0,0,2*r*n/(n-r),0])}function H(e,t,n,r,i,a){return new Float32Array([2/(t-e),0,0,0,0,2/(r-n),0,0,0,0,1/(i-a),0,-(t+e)/(t-e),-(r+n)/(r-n),i/(i-a),1])}function Ue(e,t,n,r,i){let a=Math.cos(r),o=Math.sin(r);return new Float32Array([a*i,0,-o*i,0,0,i,0,0,o*i,0,a*i,0,e,t,n,1])}function We(){return{x:0,y:0,z:0,w:0}}function Ge(e,t,n,r,i){return i.x=e[0]*t+e[4]*n+e[8]*r+e[12],i.y=e[1]*t+e[5]*n+e[9]*r+e[13],i.z=e[2]*t+e[6]*n+e[10]*r+e[14],i.w=e[3]*t+e[7]*n+e[11]*r+e[15],i}function Ke(e,t){let[n,r,i]=t;return{x:e[0]*n+e[4]*r+e[8]*i+e[12],y:e[1]*n+e[5]*r+e[9]*i+e[13],z:e[2]*n+e[6]*r+e[10]*i+e[14],w:e[3]*n+e[7]*r+e[11]*i+e[15]}}function qe(e,t,n){let r=V(ze(e,t)),i=V(Be(n,r)),a=Be(r,i);return new Float32Array([i[0],a[0],r[0],0,i[1],a[1],r[1],0,i[2],a[2],r[2],0,-B(i,e),-B(a,e),-B(r,e),1])}var Je=[[.78,.9,.8],[.85,1,.88],[.72,.84,.76],[.9,1,.92],[.8,.94,.9],[.88,.98,.8]],Ye=[[.85,.95,.78],[.92,1,.85],[.8,.9,.76],[1,.94,.78],[.88,.82,.7],[.86,1,.9],[1,.92,.8]],Xe=[[1,1.15,.95],[1.05,1.15,1],[.92,1.05,.9],[1.15,1.15,1]],Ze=[[.78,.9,.76],[.85,.98,.82],[.72,.86,.74],[.9,1,.88],[.8,.94,.86]],Qe=[[.92,.9,.86],[1,.98,.92],[.84,.84,.82],[.96,.9,.82]];function $e(e,t,n,r,i,a,o,s,c,l,u=[.5,.5],d=[.5,.5],f=[.5,.5]){let p=V(Be(ze(o,a),ze(s,a))),m=[[a,u],[o,d],[s,f]];for(let[a,o]of m)e.push(a[0],a[1],a[2]),t.push(p[0],p[1],p[2]),n.push(c),r.push(l),i.push(o[0],o[1])}function et(e,t,n,r,i,a,o,s,c,l,u,d){let f=l,p=l+c,m=[],h=[];for(let e=0;e<=a;e++){let t=e/a*Math.PI*2;m.push([Math.cos(t)*o,f,Math.sin(t)*o]),h.push([Math.cos(t)*s,p,Math.sin(t)*s])}for(let o=0;o<a;o++){let s=o/a,c=(o+1)/a;$e(e,t,n,r,i,m[o],m[o+1],h[o+1],u,d,[s,0],[c,0],[c,1]),$e(e,t,n,r,i,m[o],h[o+1],h[o],u,d,[s,0],[c,1],[s,1])}}function U(e,t,n,r,i,a,o,s,c,l,u,d=0,f=0){if(f>0){let e=(c-s)*f;s-=e,c-=e}for(let f=0;f<a;f++){let p=f/a*Math.PI,m=Math.cos(p),h=Math.sin(p),g=[d-m*o,s,-h*o],_=[d+m*o,s,h*o],v=[d-m*o,c,-h*o],y=[d+m*o,c,h*o];$e(e,t,n,r,i,g,_,y,l,u,[0,1],[1,1],[1,0]),$e(e,t,n,r,i,g,y,v,l,u,[0,1],[1,0],[0,0])}}var W=()=>({positions:[],normals:[],materialIds:[],shades:[],uvs:[]}),tt=e=>({positions:new Float32Array(e.positions),normals:new Float32Array(e.normals),materialIds:new Float32Array(e.materialIds),shades:new Float32Array(e.shades),uvs:new Float32Array(e.uvs),vertexCount:e.positions.length/3});function nt(){let e=W();return et(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.1,.06,.45,0,0,1),U(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.85,.3,2.7,1,1),tt(e)}function rt(){let e=W();return et(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.11,.07,.7,0,0,1),U(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,1.15,.25,2.15,1,1),tt(e)}function it(){let e=W();return et(e.positions,e.normals,e.materialIds,e.shades,e.uvs,7,.14,.09,.8,0,0,1),U(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,1.3,.65,2.55,1,1),tt(e)}function G(){let e=W();return et(e.positions,e.normals,e.materialIds,e.shades,e.uvs,6,.075,.045,.95,0,0,1),U(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.95,.7,2.35,1,1),tt(e)}function at(){let e=W();et(e.positions,e.normals,e.materialIds,e.shades,e.uvs,6,.09,.035,1.4,0,0,.62);let t=(t,n,r,i)=>{let a=Math.cos(t)*Math.cos(n),o=Math.sin(t)*Math.cos(n),s=Math.sin(n),c=[0,r,0],l=[a*i,r+s*i,o*i],u=[-o,0,a],d=.03;$e(e.positions,e.normals,e.materialIds,e.shades,e.uvs,[c[0]+u[0]*d,c[1],c[2]+u[2]*d],[c[0]-u[0]*d,c[1],c[2]-u[2]*d],l,0,.62);let f=[l[0]*.55,l[1]*.55+r*.45,l[2]*.55],p=[l[0]+a*i*.4-o*.15,l[1]+s*i*.4+.1,l[2]+o*i*.4+a*.15];$e(e.positions,e.normals,e.materialIds,e.shades,e.uvs,[f[0]+u[0]*d*.6,f[1],f[2]+u[2]*d*.6],[f[0]-u[0]*d*.6,f[1],f[2]-u[2]*d*.6],p,0,.62)};return t(.4,.5,1.5,.6),t(2.2,.32,1.75,.5),t(3.8,.55,1.95,.46),t(5.1,.4,2.1,.4),t(1.6,.65,2.25,.34),tt(e)}var ot=91/768;function st(){let e=W();return U(e.positions,e.normals,e.materialIds,e.shades,e.uvs,3,.55,0,.72,1,1,0,ot),tt(e)}var ct=32/768;function lt(){let e=W();return U(e.positions,e.normals,e.materialIds,e.shades,e.uvs,2,.4,0,.62,1,1,-.14,ct),U(e.positions,e.normals,e.materialIds,e.shades,e.uvs,2,.32,0,.5,1,.92,.16,ct),tt(e)}function ut(e,t){return V([e[0]+t[0],e[1]+t[1],e[2]+t[2]])}function dt(e,t){let n=Math.sin(e[0]*12.9898+e[1]*78.233+e[2]*37.719+t*91.7)*43758.5453;return n-Math.floor(n)}function ft(e){return[.5+Math.atan2(e[2],e[0])/(2*Math.PI),.5-Math.asin(Math.max(-1,Math.min(1,e[1])))/Math.PI]}function pt(){let e=[1,0,0],t=[-1,0,0],n=[0,1,0],r=[0,-1,0],i=[0,0,1],a=[0,0,-1];return[[e,n,i],[i,n,t],[t,n,a],[a,n,e],[e,i,r],[i,t,r],[t,a,r],[a,e,r]]}function mt(e){let t=[];for(let[n,r,i]of e){let e=ut(n,r),a=ut(r,i),o=ut(i,n);t.push([n,e,o],[e,r,a],[o,a,i],[e,a,o])}return t}function ht(e,t,n,r,i,a,o,s){let c=pt();for(let e=0;e<t;e++)c=mt(c);let l=e=>{let t=a*(.8+dt(e,s)*.45);return[n+e[0]*t,r+e[1]*t*o,i+e[2]*t]};for(let[t,n,r]of c){let i=.82+dt(t,s+3)*.36;$e(e.positions,e.normals,e.materialIds,e.shades,e.uvs,l(t),l(n),l(r),1,i,ft(t),ft(n),ft(r))}}function gt(){let e=W(),t=.68,n=.5;ht(e,2,0,n*t,0,n,t,1);let r=.24;return ht(e,1,.48,r*t*.9,.1,r,t,2),ht(e,1,-.4,r*t*.8,-.34,r*.85,t,3),tt(e)}async function K(e,t,n=1024){let r=await(await fetch(t)).blob(),i=await createImageBitmap(r,{premultiplyAlpha:`none`}),a=Math.min(1,n/Math.max(i.width,i.height)),o=a<1?await createImageBitmap(i,{resizeWidth:Math.round(i.width*a),resizeHeight:Math.round(i.height*a),resizeQuality:`medium`,premultiplyAlpha:`none`}):i;a<1&&i.close();let s=e.createTexture({size:[o.width,o.height],format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return e.queue.copyExternalImageToTexture({source:o},{texture:s},[o.width,o.height]),o.close(),s}var _t=class{sink;floatsPerChunk=0;vertsPerChunk=0;capacityChunks=0;order=[];slotOf=new Map;dataOf=new Map;vertexCount=0;constructor(e){this.sink=e}has(e){return this.slotOf.has(e)}put(e,t,n){this.floatsPerChunk!==t.length&&this.restride(t.length,n),this.dataOf.set(e,t);let r=this.slotOf.get(e);r===void 0&&(r=this.order.length,r+1>this.capacityChunks&&this.grow(r+1),this.order.push(e),this.slotOf.set(e,r)),this.sink.write(r*this.floatsPerChunk*4,t),this.vertexCount=this.order.length*this.vertsPerChunk}remove(e){let t=this.slotOf.get(e);if(this.dataOf.delete(e),t===void 0)return;let n=this.order.length-1;if(t!==n){let e=this.order[n];this.order[t]=e,this.slotOf.set(e,t);let r=this.dataOf.get(e);r&&this.sink.write(t*this.floatsPerChunk*4,r)}this.order.pop(),this.slotOf.delete(e),this.vertexCount=this.order.length*this.vertsPerChunk}grow(e){let t=Math.max(e,Math.ceil(this.capacityChunks*1.5),8);this.capacityChunks=t,this.sink.createBuffer(t*this.floatsPerChunk*4);for(let e=0;e<this.order.length;e++){let t=this.dataOf.get(this.order[e]);t&&this.sink.write(e*this.floatsPerChunk*4,t)}}restride(e,t){let n=this.order.slice();if(this.floatsPerChunk=e,this.vertsPerChunk=t,this.capacityChunks=0,this.order=[],this.slotOf=new Map,this.vertexCount=0,n.length){this.grow(n.length);for(let t of n){let n=this.dataOf.get(t);if(!n||n.length!==e)continue;let r=this.order.length;this.order.push(t),this.slotOf.set(t,r),this.sink.write(r*e*4,n)}this.vertexCount=this.order.length*this.vertsPerChunk}}},vt=(()=>{let[e,t,n]=[.62,.38,.3],r=Math.hypot(e,t,n);return[e/r,t/r,n/r]})(),yt=2048,bt=60,xt=100,St=1,Ct=220,wt=`
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
`,Ot=`
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
`,kt=`
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
`,At=.5,jt=1.4,Mt=new Float32Array([0,jt,0,At,0,0,0,0,At,0,jt,0,0,0,At,-.5,0,0,0,jt,0,-.5,0,0,0,0,-.5,0,jt,0,0,0,-.5,At,0,0]),q=Mt.length/3,Nt=7;async function Pt(e,t,n){let r=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),i=e.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),a=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),o=e.createTexture({size:[yt,yt],format:`depth32float`,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}).createView(),s=e.createSampler({compare:`less`,magFilter:`linear`,minFilter:`linear`}),c=H(-1,1,-1,1,.1,1),l=!0,u=1/0,d=1/0,f=1.5;function p(t,n){let r=t-u,i=n-d;if(!l&&r*r+i*i<f*f)return;u=t,d=n;let o=qe([t+vt[0]*xt,vt[1]*xt,n+vt[2]*xt],[t,0,n],[0,1,0]);c=Ve(H(-60,bt,-60,bt,St,Ct),o),e.queue.writeBuffer(a,0,c),l=!0}let[m,h,g,_,v,y,b,x,S,ee,C,w]=await Promise.all([K(e,`/textures/ground/sand.jpg`),K(e,`/textures/ground/grass.jpg`),K(e,`/textures/ground/dry_meadow.jpg`),K(e,`/textures/ground/scree.jpg`),K(e,`/textures/ground/rock.jpg`),K(e,`/textures/ground/snow.jpg`),K(e,`/textures/ground/forest_floor.jpg`),K(e,`/textures/ground/desert.jpg`),K(e,`/textures/ground/marsh.jpg`),K(e,`/textures/ground/tundra_moss.jpg`),K(e,`/textures/water/detail.jpg`),K(e,`/textures/world/regions_overlay.png`,2400)]),te=e.createSampler({addressModeU:`repeat`,addressModeV:`repeat`,magFilter:`linear`,minFilter:`linear`}),ne=e.createShaderModule({code:wt}),re=e.createRenderPipeline({layout:`auto`,vertex:{module:ne,entryPoint:`vs`,buffers:[{arrayStride:60,attributes:[{shaderLocation:0,offset:0,format:`float32x3`},{shaderLocation:1,offset:12,format:`float32x3`},{shaderLocation:2,offset:24,format:`float32x3`},{shaderLocation:3,offset:36,format:`float32x2`},{shaderLocation:4,offset:44,format:`float32`},{shaderLocation:5,offset:48,format:`float32`},{shaderLocation:6,offset:52,format:`float32`},{shaderLocation:7,offset:56,format:`float32`}]}]},fragment:{module:ne,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),ie=e.createBindGroup({layout:re.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}},{binding:2,resource:te},{binding:3,resource:m.createView()},{binding:4,resource:h.createView()},{binding:5,resource:g.createView()},{binding:6,resource:_.createView()},{binding:7,resource:v.createView()},{binding:8,resource:{buffer:a}},{binding:9,resource:s},{binding:10,resource:o},{binding:11,resource:y.createView()},{binding:12,resource:b.createView()},{binding:13,resource:x.createView()},{binding:14,resource:S.createView()},{binding:15,resource:ee.createView()},{binding:16,resource:C.createView()},{binding:17,resource:w.createView()}]}),[ae,T]=await Promise.all([K(e,`/textures/sky/sky.jpg`),K(e,`/textures/sky/clouds.png`)]),oe=e.createSampler({addressModeU:`repeat`,addressModeV:`clamp-to-edge`,magFilter:`linear`,minFilter:`linear`}),se=e.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),ce=e.createShaderModule({code:kt}),le=e.createRenderPipeline({layout:`auto`,vertex:{module:ce,entryPoint:`vs`},fragment:{module:ce,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`,cullMode:`none`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!1,depthCompare:`always`}}),ue=e.createBindGroup({layout:le.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:se}},{binding:1,resource:oe},{binding:2,resource:ae.createView()},{binding:3,resource:T.createView()}]}),E=new Float32Array(16);function de(t,n,r,i,a,o){let s=E;s[0]=t[0],s[1]=t[1],s[2]=t[2],s[3]=0,s[4]=n[0],s[5]=n[1],s[6]=n[2],s[7]=0,s[8]=r[0],s[9]=r[1],s[10]=r[2],s[11]=0,s[12]=i,s[13]=a,s[14]=o,s[15]=0,e.queue.writeBuffer(se,0,s)}let fe=e.createShaderModule({code:Dt}),pe=e.createRenderPipeline({layout:`auto`,vertex:{module:fe,entryPoint:`vs`,buffers:[{arrayStride:60,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]}]},primitive:{topology:`triangle-list`,cullMode:`back`},depthStencil:{format:`depth32float`,depthWriteEnabled:!0,depthCompare:`less`}}),me=e.createBindGroup({layout:pe.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}}]}),D=new Set;function he(e){return e===`world-backdrop`?`backdrop`:e.startsWith(`far:`)?`far`:`near`}let ge={near:null,far:null,backdrop:null},_e=t=>new _t({createBuffer(n){ge[t]?.destroy(),ge[t]=e.createBuffer({size:n,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST})},write(n,r){let i=ge[t];i&&e.queue.writeBuffer(i,n,r,0,r.length)}}),ve={near:_e(`near`),far:_e(`far`),backdrop:_e(`backdrop`)},ye=e.createShaderModule({code:Tt}),be=e.createBuffer({size:Mt.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(be,0,Mt);let xe=e.createRenderPipeline({layout:`auto`,vertex:{module:ye,entryPoint:`vs`,buffers:[{arrayStride:12,stepMode:`vertex`,attributes:[{shaderLocation:0,offset:0,format:`float32x3`}]},{arrayStride:28,stepMode:`instance`,attributes:[{shaderLocation:1,offset:0,format:`float32x3`},{shaderLocation:2,offset:12,format:`float32`},{shaderLocation:3,offset:16,format:`float32x3`}]}]},fragment:{module:ye,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),O=e.createBindGroup({layout:xe.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}}]}),k=null,A=null,Se=0,j=0,Ce=e.createShaderModule({code:Et});function we(t){let n=e.createBuffer({size:Math.max(t.vertexCount*10*4,4),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),r=new Float32Array(t.vertexCount*10);for(let e=0;e<t.vertexCount;e++)r.set(t.positions.subarray(e*3,e*3+3),e*10),r.set(t.normals.subarray(e*3,e*3+3),e*10+3),r[e*10+6]=t.materialIds[e],r[e*10+7]=t.shades[e],r.set(t.uvs.subarray(e*2,e*2+2),e*10+8);return e.queue.writeBuffer(n,0,r),n}let Te=await Promise.all(Object.entries({bark:`/textures/decor/bark.jpg`,birchBark:`/textures/decor/birch_bark.jpg`,conifer:`/textures/decor/conifer_a.png`,conifer2:`/textures/decor/conifer_b.png`,broadleaf:`/textures/decor/broadleaf.png`,autumn:`/textures/decor/autumn.png`,birchLeaf:`/textures/decor/birch_leaf.png`,bush:`/textures/decor/bush.png`,grassTuft:`/textures/decor/grass_tuft.png`}).map(async([t,n])=>[t,await K(e,n)])),Ee={...Object.fromEntries(Te),rock:v},M=e.createSampler({magFilter:`linear`,minFilter:`linear`}),N={spruce:{trunk:`bark`,canopy:`conifer`},pine:{trunk:`bark`,canopy:`conifer2`},broadleaf:{trunk:`bark`,canopy:`broadleaf`},autumn:{trunk:`bark`,canopy:`autumn`},birch:{trunk:`birchBark`,canopy:`birchLeaf`},dead:{trunk:`bark`,canopy:`bark`},bush:{trunk:`bark`,canopy:`bush`},grass:{trunk:`bark`,canopy:`grassTuft`},rock:{trunk:`bark`,canopy:`rock`}},De={spruce:nt,pine:rt,broadleaf:it,autumn:it,birch:G,dead:at,bush:st,grass:lt,rock:gt},P=[{arrayStride:40,stepMode:`vertex`,attributes:[{shaderLocation:0,offset:0,format:`float32x3`},{shaderLocation:1,offset:12,format:`float32x3`},{shaderLocation:2,offset:24,format:`float32`},{shaderLocation:3,offset:28,format:`float32`},{shaderLocation:4,offset:32,format:`float32x2`}]},{arrayStride:40,stepMode:`instance`,attributes:[{shaderLocation:5,offset:0,format:`float32x3`},{shaderLocation:6,offset:12,format:`float32x3`},{shaderLocation:7,offset:24,format:`float32`},{shaderLocation:8,offset:28,format:`float32x3`}]}],Oe=e.createRenderPipeline({layout:`auto`,vertex:{module:Ce,entryPoint:`vs`,buffers:P},fragment:{module:Ce,entryPoint:`fs`,targets:[{format:n}]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth24plus`,depthWriteEnabled:!0,depthCompare:`less`}}),ke=e.createShaderModule({code:Ot}),Ae=e.createRenderPipeline({layout:`auto`,vertex:{module:ke,entryPoint:`vs`,buffers:P},fragment:{module:ke,entryPoint:`fs`,targets:[]},primitive:{topology:`triangle-list`},depthStencil:{format:`depth32float`,depthWriteEnabled:!0,depthCompare:`less`}}),F=new Map;for(let t of Object.keys(N)){let n=De[t](),c=N[t],l=e.createBindGroup({layout:Oe.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r}},{binding:1,resource:{buffer:i}},{binding:2,resource:M},{binding:3,resource:Ee[c.trunk].createView()},{binding:4,resource:Ee[c.canopy].createView()},{binding:5,resource:{buffer:a}},{binding:6,resource:s},{binding:7,resource:o}]}),u=e.createBindGroup({layout:Ae.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:a}},{binding:1,resource:M},{binding:2,resource:Ee[c.canopy].createView()}]});F.set(t,{mesh:n,localBuf:we(n),instBuf:null,instCapacity:0,instanceCount:0,bindGroup:l,shadowBindGroup:u,scratch:null,shadowInstBuf:null,shadowInstCapacity:0,shadowInstanceCount:0,shadowScratch:null})}let I=null,L=null;function je(){let n=t.canvas.width,r=t.canvas.height;I&&I.width===n&&I.height===r||(I?.destroy(),I=e.createTexture({size:[n,r],format:`depth24plus`,usage:GPUTextureUsage.RENDER_ATTACHMENT}),L=I.createView())}function Me(e,t){let n=new Float32Array(t.vertexCount*15);for(let e=0;e<t.vertexCount;e++)n.set(t.positions.subarray(e*3,e*3+3),e*15),n.set(t.colors.subarray(e*3,e*3+3),e*15+3),n.set(t.normals.subarray(e*3,e*3+3),e*15+6),n.set(t.uvs.subarray(e*2,e*2+2),e*15+9),n[e*15+11]=t.elevations[e],n[e*15+12]=t.waterFlags[e],n[e*15+13]=t.forestFracs[e],n[e*15+14]=t.moistureFracs[e];D.add(e);let r=he(e);ve[r].put(e,n,t.vertexCount),r===`near`&&(l=!0)}function Ne(e){if(!D.has(e))return;D.delete(e);let t=he(e);ve[t].remove(e),t===`near`&&(l=!0)}function R(t){if(j=t.length,j>Se&&(k?.destroy(),Se=Math.max(j,8),k=e.createBuffer({size:Se*Nt*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),A=new Float32Array(Se*Nt)),j===0||!k)return;let n=A;t.forEach((e,t)=>{let r=t*Nt;n[r]=e.x,n[r+1]=e.y,n[r+2]=e.z,n[r+3]=1,n[r+4]=e.color[0],n[r+5]=e.color[1],n[r+6]=e.color[2]}),e.queue.writeBuffer(k,0,n,0,j*Nt)}function z(t,n,r){let i=t.scratch;if(!i||t.instanceCount===0){t.shadowInstanceCount=0;return}let a=n-bt,o=n+bt,s=r-bt,c=r+bt;t.instanceCount>t.shadowInstCapacity&&(t.shadowInstBuf?.destroy(),t.shadowInstCapacity=Math.max(t.instanceCount,8),t.shadowInstBuf=e.createBuffer({size:t.shadowInstCapacity*10*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),t.shadowScratch=new Float32Array(t.shadowInstCapacity*10));let l=t.shadowScratch,u=0;for(let e=0;e<t.instanceCount;e++){let t=e*10,n=i[t],r=i[t+2];n<a||n>o||r<s||r>c||(l.set(i.subarray(t,t+10),u*10),u++)}t.shadowInstanceCount=u,u>0&&t.shadowInstBuf&&e.queue.writeBuffer(t.shadowInstBuf,0,l,0,u*10)}function Pe(t,n){let r=t.length;if(r>n.instCapacity&&(n.instBuf?.destroy(),n.instCapacity=Math.max(r,8),n.instBuf=e.createBuffer({size:n.instCapacity*10*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),n.scratch=new Float32Array(n.instCapacity*10)),n.instanceCount=r,r===0||!n.instBuf)return;let i=n.scratch;t.forEach((e,t)=>{let n=t*10;i[n]=e.x,i[n+1]=e.y,i[n+2]=e.z,i[n+3]=e.scale[0],i[n+4]=e.scale[1],i[n+5]=e.scale[2],i[n+6]=e.yaw,i[n+7]=e.color[0],i[n+8]=e.color[1],i[n+9]=e.color[2]}),e.queue.writeBuffer(n.instBuf,0,i,0,r*10)}function Fe(e){let t=new Map;for(let n of e){let e=t.get(n.kind);e||(e=[],t.set(n.kind,e)),e.push(n)}for(let[e,n]of F)Pe(t.get(e)??[],n);l=!0}function Ie(t){e.queue.writeBuffer(r,0,t)}let Le=new Float32Array(8);function Re(t,n,r,a){let o=Le;o[0]=t[0],o[1]=t[1],o[2]=t[2],o[3]=a,o[4]=n[0],o[5]=n[1],o[6]=n[2],o[7]=r,e.queue.writeBuffer(i,0,o)}function ze(n,r){je();let i=e.createCommandEncoder();if(l){let e=i.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:o,depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}});ve.near.vertexCount>0&&ge.near&&(e.setPipeline(pe),e.setBindGroup(0,me),e.setVertexBuffer(0,ge.near),e.draw(ve.near.vertexCount));let t=!1;for(let e of F.values()){if(e.instanceCount===0){e.shadowInstanceCount=0;continue}z(e,u,d),e.shadowInstanceCount>0&&(t=!0)}if(t){e.setPipeline(Ae);for(let t of F.values())t.shadowInstanceCount===0||!t.shadowInstBuf||(e.setBindGroup(0,t.shadowBindGroup),e.setVertexBuffer(0,t.localBuf),e.setVertexBuffer(1,t.shadowInstBuf),e.draw(t.mesh.vertexCount,t.shadowInstanceCount))}e.end(),l=!1}let a=t.getCurrentTexture().createView(),s=i.beginRenderPass({colorAttachments:[{view:a,clearValue:n,loadOp:`clear`,storeOp:`store`}],depthStencilAttachment:{view:L,depthClearValue:1,depthLoadOp:`clear`,depthStoreOp:`store`}});if(s.setPipeline(le),s.setBindGroup(0,ue),s.draw(3),D.size>0){s.setPipeline(re),s.setBindGroup(0,ie);for(let e of[`near`,`far`,`backdrop`]){let t=ve[e],n=ge[e];t.vertexCount===0||!n||(s.setVertexBuffer(0,n),s.draw(t.vertexCount))}}j>0&&k&&(s.setPipeline(xe),s.setBindGroup(0,O),s.setVertexBuffer(0,be),s.setVertexBuffer(1,k),s.draw(q,j));let c=!1;for(let e of F.values())if(e.instanceCount>0){c=!0;break}if(c){s.setPipeline(Oe);for(let e of F.values())e.instanceCount===0||!e.instBuf||(s.setBindGroup(0,e.bindGroup),s.setVertexBuffer(0,e.localBuf),s.setVertexBuffer(1,e.instBuf),s.draw(e.mesh.vertexCount,e.instanceCount))}r?.(s),s.end(),e.queue.submit([i.finish()])}function B(){return{lightBuf:a,shadowView:o,shadowSampler:s}}return{setTerrainChunk:Me,removeTerrainChunk:Ne,setMarkers:R,setDecor:Fe,setVP:Ie,setFog:Re,setSunTarget:p,setSkyCamera:de,getShadowResources:B,frame:ze}}var J=12345,Ft=.235,It=2400,Lt=1200,Rt=It/2;Lt/2;var zt=2.5;function Y(e,t,n){let r=e*374761393+t*668265263+n*1274126177;return r=Math.imul(r^r>>>13,1274126177),((r^r>>>16)>>>0)/4294967296}function Bt(e,t,n){let r=Math.floor(e),i=Math.floor(t),a=e-r,o=t-i,s=a*a*(3-2*a),c=o*o*(3-2*o),l=Y(r,i,n),u=Y(r+1,i,n),d=Y(r,i+1,n),f=Y(r+1,i+1,n);return(l*(1-s)+u*s)*(1-c)+(d*(1-s)+f*s)*c}var X=null,Vt=null,Ht=null;async function Ut(e,t){let n=await fetch(e);if(!n.ok)throw Error(`${e}: HTTP ${n.status}`);let r=await n.arrayBuffer();if(r.byteLength!==t)throw Error(`${e}: неверный размер (${r.byteLength} байт, ожидалось ${t})`);return r}async function Wt(){let e=It*Lt,[t,n,r]=await Promise.all([Ut(`/heightmap/elevation-v6.bin`,e*2),Ut(`/heightmap/forest.bin`,e),Ut(`/heightmap/moisture.bin`,e)]);X=new Uint16Array(t),Vt=new Uint8Array(n),Ht=new Uint8Array(r)}function Gt(e,t,n,r){let i=Math.floor(t),a=Math.floor(n),o=Math.min(i+1,2399),s=Math.min(a+1,1199),c=t-i,l=n-a,u=a*It+i,d=a*It+o,f=s*It+i,p=s*It+o,m=e[u]+(e[d]-e[u])*c;return(m+(e[f]+(e[p]-e[f])*c-m)*l)*r}function Kt(e,t){return[Math.max(0,Math.min(2399,e+Rt)),Math.max(0,Math.min(1199,t+600))]}function qt(e,t){if(!X)return .285;let[n,r]=Kt(e,t);return Gt(X,n,r,zt/65535)}function Jt(e,t){let n=qt(e,t),r=(qt(e+.7,t)+qt(e-.7,t)+qt(e,t+.7)+qt(e,t-.7))*.25;return n*.55+r*.45}var Yt=32,Xt=new Map;function Zt(e,t){return Math.floor(e/Yt)+`,`+Math.floor(t/Yt)}function Qt(e,t,n){let r={x:e,z:t,targetH:Math.max(Jt(e,t),.245),radius:n},i=Zt(e,t),a=Xt.get(i);a?a.push(r):Xt.set(i,[r])}function Z(e,t){let n=qt(e,t);if(n<.235||Xt.size===0)return n;let r=Math.floor(e/Yt),i=Math.floor(t/Yt),a=0,o=0;for(let n=-1;n<=1;n++)for(let s=-1;s<=1;s++){let c=Xt.get(r+s+`,`+(i+n));if(c)for(let n of c){let r=Math.hypot(e-n.x,t-n.z);if(r>=n.radius)continue;let i=n.radius*.55,s=r<=i?1:1-((r-i)/(n.radius-i))**2*(3-2*((r-i)/(n.radius-i)));a+=s,o+=s*n.targetH}}return a<=0?n:a>=1?o/a:n*(1-a)+o}function $t(e,t){return Z(e,t)<Ft}function en(e,t){if(!Ht)return .5;let[n,r]=Kt(e,t);return Gt(Ht,n,r,1/255)}function tn(e,t){if(!Vt)return 0;let[n,r]=Kt(e,t);return Gt(Vt,n,r,1/255)}var Q=(e,t,n)=>[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n],nn=[.14,.24,.28],rn=[.05,.11,.19];function an(e){return Q(nn,rn,Math.min(1,e))}var on=[0,1,0],sn=6;function cn(e,t){let n=.5,r=Z(e-n,t)*13,i=Z(e+n,t)*13,a=Z(e,t-n)*13,o=Z(e,t+n)*13;return V([-(i-r)/(2*n),1,-(o-a)/(2*n)])}var ln=6;function un(e,t,n){let r=n/2,i=1/0;for(let a=0;a<=ln;a++){let o=-r+a/ln*n;for(let a=0;a<=ln;a++){let s=Z(e+(-r+a/ln*n),t+o);s<i&&(i=s)}}return i}function dn(e,t,n,r,i=1,a=0){let o=Math.round((n-e)/i),s=Math.round((r-t)/i),c=i===1,l=[],u=[],d=[],f=[],p=[],m=[],h=[],g=[];function _(e,t){let n=c?Z(e,t):un(e,t,i),r=n<Ft,o=r?[e,Ft*13-a,t]:[e,n*13-a,t],s=r?an((Ft-n)*3):[0,0,0],l=r?on:c?cn(e,t):on,u=r?0:tn(e,t),d=r?0:en(e,t);return{p:o,c:s,n:l,uv:[e/sn,t/sn],e:n,water:+!!r,forest:u,moisture:d}}let v=[];for(let n=0;n<=s;n++){let r=[];for(let a=0;a<=o;a++)r.push(_(e+a*i,t+n*i));v.push(r)}function y(e,t,n){let r=c?null:V(Be(ze(t.p,e.p),ze(n.p,e.p)));for(let i of[e,t,n]){l.push(i.p[0],i.p[1],i.p[2]),u.push(i.c[0],i.c[1],i.c[2]);let e=r??i.n;d.push(e[0],e[1],e[2]),f.push(i.uv[0],i.uv[1]),p.push(i.e),m.push(i.water),h.push(i.forest),g.push(i.moisture)}}for(let e=0;e<s;e++)for(let t=0;t<o;t++){let n=v[e][t],r=v[e][t+1],i=v[e+1][t],a=v[e+1][t+1];y(n,a,r),y(n,i,a)}return{positions:new Float32Array(l),colors:new Float32Array(u),normals:new Float32Array(d),uvs:new Float32Array(f),elevations:new Float32Array(p),waterFlags:new Float32Array(m),forestFracs:new Float32Array(h),moistureFracs:new Float32Array(g),vertexCount:l.length/3}}var fn=9,pn=10,mn=380,hn={d:[1,0],arrowright:[1,0],a:[-1,0],arrowleft:[-1,0],w:[0,1],arrowup:[0,1],s:[0,-1],arrowdown:[0,-1]},gn=700;function _n(e,t){let n=!0,r=new Map,i=null,a=null,o=null,s=null,c=null,l=null,u=null,d=!1,f=null;function p(){n=!1,f?.()}function m(){let e=[...r.values()];return{x:(e[0].x+e[1].x)/2,y:(e[0].y+e[1].y)/2,d:Math.hypot(e[0].x-e[1].x,e[0].y-e[1].y)}}function h(){let e=[...r.values()];return Math.atan2(e[1].y-e[0].y,e[1].x-e[0].x)}function g(e,n){let r=t.dist*.0022,i=e*r,a=n*r,o=Math.cos(t.yaw),s=Math.sin(t.yaw);t.target[0]=Math.max(-Rt,Math.min(Rt,t.target[0]-(i*o-a*s))),t.target[2]=Math.max(-600,Math.min(600,t.target[2]+(i*s+a*o))),t.target[1]=Z(t.target[0],t.target[2])*13+1}e.addEventListener(`pointerdown`,n=>{n.preventDefault(),p(),r.set(n.pointerId,{x:n.clientX,y:n.clientY});try{e.setPointerCapture(n.pointerId)}catch{}if(r.size===1)d=!!c?.(n.clientX,n.clientY),d?(i=null,o={x:n.clientX,y:n.clientY,t:performance.now()}):(i={x:n.clientX,y:n.clientY,tx:t.target[0],tz:t.target[2]},o={x:n.clientX,y:n.clientY,t:performance.now()});else if(r.size===2){d&&(d=!1,u?.(NaN,NaN)),i=null,o=null;let e=m();a={d:e.d,y:e.y,dist:t.dist,yaw:t.yaw,pitch:t.pitch,angle:h()}}}),e.addEventListener(`pointermove`,e=>{if(r.has(e.pointerId)){if(e.preventDefault(),r.set(e.pointerId,{x:e.clientX,y:e.clientY}),o&&Math.hypot(e.clientX-o.x,e.clientY-o.y)>pn&&(o=null),d){l?.(e.clientX,e.clientY);return}if(r.size>=2&&a){let e=m();t.dist=Math.max(fn,Math.min(140,a.dist*(a.d/Math.max(12,e.d)))),t.yaw=a.yaw+(h()-a.angle),t.pitch=Math.max(.08,Math.min(1.42,a.pitch+(e.y-a.y)*.005));return}i&&(t.target[0]=i.tx,t.target[2]=i.tz,g(e.clientX-i.x,i.y-e.clientY))}});function _(e){let n=!!(o&&r.size===1&&performance.now()-o.t<mn);if(d&&(d=!1,u?.(n?NaN:e.clientX,n?NaN:e.clientY)),n&&s?.(o.x,o.y),o=null,r.delete(e.pointerId),r.size<2&&(a=null),r.size===0)i=null;else if(r.size===1){let e=[...r.values()][0];i={x:e.x,y:e.y,tx:t.target[0],tz:t.target[2]}}}e.addEventListener(`pointerup`,_),e.addEventListener(`pointercancel`,_),e.addEventListener(`wheel`,e=>{e.preventDefault(),p(),t.dist=Math.max(fn,Math.min(140,t.dist*(e.deltaY<0?.9:1.11)))},{passive:!1});let v=new Set;window.addEventListener(`keydown`,e=>{let t=e.key.toLowerCase();t in hn&&(v.add(t),p())}),window.addEventListener(`keyup`,e=>{v.delete(e.key.toLowerCase())});let y=null;function b(e){if(y===null){y=e;return}let t=Math.min(.1,(e-y)/1e3);if(y=e,v.size===0||i)return;let n=0,r=0;for(let e of v){let[t,i]=hn[e];n+=t,r+=i}(n!==0||r!==0)&&g(n*gn*t,r*gn*t)}return{isAutoOrbiting:()=>n,stopAuto:p,update:b,onGrab(e,t,n){c=e,l=t,u=n},onTap(e){s=e},onInteract(e){f=e}}}var vn={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},yn={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};async function bn(e){let t=await(await fetch(e)).arrayBuffer(),n=new DataView(t);if(n.getUint32(0,!0)!==1179937895)throw Error(`не glTF-контейнер: `+e);let r=n.getUint32(8,!0),i=12,a=null,o=null;for(;i<r;){let e=n.getUint32(i,!0),r=n.getUint32(i+4,!0),s=t.slice(i+8,i+8+e);r===1313821514?a=JSON.parse(new TextDecoder().decode(s)):r===5130562&&(o=s),i+=8+e}if(!a||!o)throw Error(`GLB без JSON/BIN чанка: `+e);let s=e=>a.accessors[e],c=e=>a.bufferViews[e];function l(e){let t=s(e),n=c(t.bufferView),r=vn[t.componentType],i=(n.byteOffset||0)+(t.byteOffset||0),a=yn[t.type],l=a*r.BYTES_PER_ELEMENT,u=n.byteStride||0;if(!u||u===l)return new r(o,i,t.count*a);let d=new r(t.count*a);for(let e=0;e<t.count;e++)d.set(new r(o,i+e*u,a),e*a);return d}let u=a.meshes[0].primitives[0],d=l(u.attributes.POSITION),f=l(u.attributes.NORMAL),p=l(u.attributes.TEXCOORD_0),m=l(u.indices),h=a.materials[u.material].pbrMetallicRoughness.baseColorTexture.index,g=a.images[a.textures[h].source],_=c(g.bufferView);return{positions:d,normals:f,uvs:p,indices:m,imageBytes:o.slice(_.byteOffset||0,(_.byteOffset||0)+_.byteLength),imageMimeType:g.mimeType}}var xn=`
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
`)}async function Bn(){let e=[];function t(t){zn([...e,t]);try{window.parent&&window.parent!==window&&typeof window.parent.forceCityView==`function`&&window.parent.forceCityView()}catch{}}if(!(`gpu`in navigator)){t(`WebGPU: navigator.gpu отсутствует.`);return}await Wt(),e.push(`рельеф: настоящие данные высот загружены`);let n=document.getElementById(`hmVersion`);n&&(n.textContent=`h6`);let r={x:42,y:22},i=[.6,.52,.4],a=35e-5,o=kn(),s=o??r,c=jn(s.x,s.y,192),l=c!==null;window.parent!==window&&!$&&(Ln.style.display=`none`);let d=c??[{key:`demo-0`,x:43,y:14,gx:43,gy:14,kind:0,model:`/models/castles/human-1.glb`,scale:10,nm:`Замок`,lv:`демо`},{key:`demo-1`,x:50,y:20,gx:50,gy:20,kind:1,model:`/models/camps/barbarians.glb`,scale:5,nm:`Лагерь`,lv:`демо`},{key:`demo-2`,x:55,y:12,gx:55,gy:12,kind:2,model:`/models/resources/farm.glb`,scale:5,nm:`Пашня`,lv:`демо`},{key:`demo-3`,x:30,y:30,gx:30,gy:30,kind:2,model:`/models/resources/quarry.glb`,scale:5,nm:`Каменоломня`,lv:`демо`}];e.push(l?`данные: настоящая партия, сущностей — ${d.length}`:`данные: демо (window.parent.W недоступен)`);let f=u(),p={x:[],y:[]},m={value:[]},h=new Map,g=new Map,_=new Map,v=new Map,y=new Map,b=new Map,x=new Map,S=new Map;function ee(e){let t=Fe(f);return Ne(f,t,p),Ne(f,t,m),p.x[t]=e.x,p.y[t]=e.y,m.value[t]=e.kind,h.set(t,e.model),g.set(t,e.scale),v.set(t,e.nm),y.set(t,e.lv),b.set(t,!!e.own),x.set(t,{x:e.gx,y:e.gy}),S.set(e.key,t),Qt(e.x,e.y,e.scale*1.4),t}for(let e of d)ee(e);let C=Array.from(De(f,[p,m]));e.push(`bitECS: сущностей — ${C.length}`);let w=await navigator.gpu.requestAdapter();if(!w){t(`WebGPU: адаптер не найден.`);return}let te=await w.requestDevice();function ne(e){let t=document.getElementById(`gpu-error-banner`);t||(t=document.createElement(`div`),t.id=`gpu-error-banner`,t.style.cssText=`position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#4a0f0f;color:#fff;font:11px/1.4 monospace;padding:6px 8px;max-height:40vh;overflow:auto;white-space:pre-wrap;`,document.body.appendChild(t)),t.textContent+=(t.textContent?`
---
`:``)+e}te.addEventListener(`uncapturederror`,e=>{let t=e.error.message;console.error(`WebGPU error:`,t),ne(t)});let re=`fb-gpu-reload-at`,ie=Number(sessionStorage.getItem(re)||0),ae=ie&&Date.now()-ie<6e4;te.lost.then(e=>{if(console.error(`WebGPU device lost:`,e.reason,e.message),e.reason!==`destroyed`){if(ae){ne(`WebGPU-устройство теряется повторно (${e.reason}) — похоже, объёмная карта нестабильна на этом устройстве/браузере. Карта города ниже работает независимо от WebGPU.`);try{window.parent&&window.parent!==window&&typeof window.parent.forceCityView==`function`&&window.parent.forceCityView()}catch{}return}ne(`WebGPU-устройство потеряно (${e.reason}): ${e.message}\nПерезагрузка через 2с...`),sessionStorage.setItem(re,String(Date.now())),setTimeout(()=>location.reload(),2e3)}});let T=document.getElementById(`gpu`),oe=T.getContext(`webgpu`);if(!oe){t(`WebGPU: getContext('webgpu') вернул null.`);return}let se=navigator.gpu.getPreferredCanvasFormat();function ce(){let e=T.clientWidth,t=T.clientHeight;if(e<=0||t<=0)return;let n=Math.min(2,window.devicePixelRatio||1),r=Math.max(1,Math.floor(e*n)),i=Math.max(1,Math.floor(t*n));T.width!==r&&(T.width=r),T.height!==i&&(T.height=i)}let le=()=>{try{return window.parent?.__world3dPaused===!0}catch{return!1}},ue=()=>T.offsetParent===null&&T.clientWidth===0||le();ce(),new ResizeObserver(ce).observe(T),oe.configure({device:te,format:se,alphaMode:`opaque`}),e.push(`WebGPU: устройство получено, формат — ${se}`);let E=await Pt(te,oe,se);function de(e,t){return e+`,`+t}function fe(e,t){try{let n=window.parent;n&&n!==window&&typeof n.ensureWorldChunk==`function`&&n.ensureWorldChunk(e,t)}catch{}}let pe=new Map;function me(e,t){return[e[0]*t,e[1]*t,e[2]*t]}function D(e,t,n){if($t(e,t))return!0;for(let r=0;r<8;r++){let i=r/8*Math.PI*2;if($t(e+Math.cos(i)*n,t+Math.sin(i)*n))return!0}return!1}function he(e,t,n,r){for(let i of C){let a=p.x[i]-e,o=p.y[i]-t,s=(g.get(i)??5)*n+r;if(a*a+o*o<s*s)return!0}return!1}function ge(e,t){return e>1.36?t<.62?`spruce`:t<.94?`pine`:`dead`:t<.58?`broadleaf`:t<.8?`birch`:t<.94?`spruce`:`dead`}function _e(e,t){let n=[];for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=e*4+i,o=t*4+r;if(Y(a,o,13122)>=.65)continue;let s=.175+Y(a,o,J+778)*.65,c=.175+Y(a,o,J+779)*.65,l=e*16+i*4+s*4,u=t*16+r*4+c*4,d=l+(Bt(l/8.5,u/8.5,J+790)*2-1)*2,f=u+(Bt(l/8.5,u/8.5,J+791)*2-1)*2;if(D(d,f,1.5)||he(d,f,.54,.68))continue;let p=Y(a,o,J+781)*Math.PI*2,m=.85+Y(a,o,J+782)*.3,h=Z(d,f),g=h*13,_=.0315+.5355*tn(d,f),v=Y(a,o,J+780)<_,y=1+Y(a,o,J+785)*1.3,b=.8+Y(a,o,J+786)*.5;if(v){let e=ge(h,Y(a,o,J+780));e===`broadleaf`&&Y(a,o,13132)<.35&&(e=`autumn`);let t=e===`spruce`||e===`pine`?Je:Ye,r=t[Math.floor(Y(a,o,J+784)*t.length)];n.push({x:d,y:g,z:f,scale:[b,y,b],yaw:p,color:me(r,m),kind:e})}else{let e=.019+.056999999999999995*Math.min(1,h/1.6);if(Y(a,o,13140)>=e)continue;let t=Qe[Math.floor(Y(a,o,J+784)*Qe.length)],r=.6+Y(a,o,J+785)*.9,i=.6+Y(a,o,J+786)*.9;n.push({x:d,y:g,z:f,scale:[i,r,i],yaw:p,color:me(t,m),kind:`rock`})}}for(let r=0;r<8;r++)for(let i=0;i<8;i++){let a=e*8+i,o=t*8+r;if(Y(a,o,13232)>=.14875)continue;let s=Y(a,o,J+888),c=Y(a,o,J+889),l=e*16+i*2+s*2,u=t*16+r*2+c*2;if(D(l,u,.4)||he(l,u,.36,.17))continue;let d=Z(l,u);if(d>2)continue;let f=d*13,p=Y(a,o,J+890)*Math.PI*2,m=.8+Y(a,o,J+891)*.4,h=Xe[Math.floor(Y(a,o,J+892)*Xe.length)],g=.8+Y(a,o,J+893)*.6;n.push({x:l,y:f,z:u,scale:[g,g,g],yaw:p,color:me(h,m),kind:`grass`})}let r=16/3;for(let i=0;i<r;i++)for(let a=0;a<r;a++){let o=e*r+a,s=t*r+i;if(Y(o,s,13342)>=.07875)continue;let c=Y(o,s,J+998),l=Y(o,s,J+999),u=e*16+a*3+c*3,d=t*16+i*3+l*3;if(D(u,d,.9)||he(u,d,.44,.34))continue;let f=Z(u,d);if(f>2)continue;let p=f*13,m=Y(o,s,J+1e3)*Math.PI*2,h=.85+Y(o,s,J+1001)*.3,g=Ze[Math.floor(Y(o,s,J+1002)*Ze.length)],_=.9+Y(o,s,J+1003)*.7;n.push({x:u,y:p,z:d,scale:[_,_,_],yaw:m,color:me(g,h),kind:`bush`})}return n}function ve(){let e=[];for(let t of pe.values())e.push(...t);E.setDecor(e),window.__decorCount=e.length,window.__decorList=e}let ye=.5,be=1,xe=(e,t)=>e*.8+t*.2,O=new Set,k=new Set,A=[],Se=null,j=null;function Ce(e,t,n=!1){let r=Math.floor(e/16),i=Math.floor(t/16);if(!n&&r===Se&&i===j)return;Se=r,j=i;let a=!1;for(let e=-3;e<=3;e++)for(let t=-3;t<=3;t++){let n=r+t,o=i+e,s=de(n,o);O.has(s)||k.has(s)||(k.add(s),A.push({cx:n,cz:o,key:s}),a=!0)}let o=!1;for(let e of Array.from(O)){let[t,n]=e.split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>5&&(E.removeTerrainChunk(e),O.delete(e),pe.delete(e),o=!0)}for(let e of Array.from(k)){let[t,n]=e.split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>5&&(k.delete(e),a=!0)}a&&(A=A.filter(e=>k.has(e.key)),A.sort((e,t)=>(e.cx-r)**2+(e.cz-i)**2-((t.cx-r)**2+(t.cz-i)**2))),window.__terrainChunkCount=O.size,o&&ve()}function we(e){let t=!1,n=0;for(;A.length&&!(n>0&&performance.now()+ye>e);){let{cx:e,cz:r,key:i}=A.shift();if(!k.has(i))continue;k.delete(i);let a=performance.now(),o=e*16,s=r*16,c=dn(o,s,o+16,s+16,1);E.setTerrainChunk(i,c),O.add(i),fe(e,r),pe.set(i,_e(e,r)),t=!0,ye=xe(ye,performance.now()-a),n++}return t&&(window.__terrainChunkCount=O.size,ve()),n}function Te(e,t){let n=de(e,t);if(!O.has(n))return;let r=e*16,i=t*16;E.setTerrainChunk(n,dn(r,i,r+16,i+16,1))}function Ee(e,t,n,r){let i=Math.floor(n/16),a=Math.floor(r/16),o=(i-3)*16,s=(i+3+1)*16,c=(a-3)*16,l=(a+3+1)*16,u=e*64,d=t*64;return u>=o&&u+64<=s&&d>=c&&d+64<=l}let M=new Set,N=new Set,P=[],Oe=null,ke=null;function Ae(e,t,n=!1){let r=Math.floor(e/64),i=Math.floor(t/64);if(!n&&r===Oe&&i===ke)return;Oe=r,ke=i;let a=!1;for(let n=-2;n<=2;n++)for(let o=-2;o<=2;o++){let s=r+o,c=i+n,l=`far:`+s+`,`+c;M.has(l)||N.has(l)||Ee(s,c,e,t)||(N.add(l),P.push({cx:s,cz:c,rkey:l}),a=!0)}for(let n of Array.from(M)){let[a,o]=n.slice(4).split(`,`).map(Number),s=Math.max(Math.abs(a-r),Math.abs(o-i))>3,c=Ee(a,o,e,t);(s||c)&&(E.removeTerrainChunk(n),M.delete(n))}for(let e of Array.from(N)){let[t,n]=e.slice(4).split(`,`).map(Number);Math.max(Math.abs(t-r),Math.abs(n-i))>3&&(N.delete(e),a=!0)}a&&(P=P.filter(e=>N.has(e.rkey)),P.sort((e,t)=>(e.cx-r)**2+(e.cz-i)**2-((t.cx-r)**2+(t.cz-i)**2))),window.__farChunkCount=M.size}function F(e,t){let n=0;for(;P.length&&!(!(n===0&&t)&&performance.now()+be>e);){let{cx:e,cz:t,rkey:r}=P.shift();if(!N.has(r))continue;N.delete(r);let i=performance.now(),a=e*64,o=t*64,s=dn(a,o,a+64,o+64,4,.35);E.setTerrainChunk(r,s),M.add(r),be=xe(be,performance.now()-i),n++}window.__farChunkCount=M.size}let I=Cn(te,se,E.getShadowResources()),L=new Map;function je(e){let t=L.get(e);return t||(t=bn(e).then(e=>Sn(te,e)),L.set(e,t)),t}let Me=new Set(Array.from(C,e=>h.get(e)));await Promise.allSettled(Array.from(Me,e=>je(e)));let R=new Map,z=0,Pe=0;for(let t of C){let n=p.x[t],r=p.y[t],i=Z(n,r)*13;_.set(t,i);let a=Ue(n,i,r,0,g.get(t)??5),o=h.get(t);try{let e=await je(o);R.set(t,I.createInstance(e,a)),z++}catch(t){Pe++,e.push(`модель: ошибка на ${o} — ${t instanceof Error?t.message:String(t)}`)}}e.push(`модели: загружено ${z}/${C.length}${Pe?`, ошибок: `+Pe:``}`),Rn(e),window.__ecsFound=C.length,window.__foundPositions=()=>C.map(e=>({x:p.x[e],z:p.y[e],scale:g.get(e)??5}));let Le=o?o.x:r.x,Re=o?o.y:r.y,B={yaw:0,pitch:.55,dist:42,target:[Le,Z(Le,Re)*13+2,Re]},H=_n(T,B);Ce(B.target[0],B.target[2],!0),Ae(B.target[0],B.target[2],!0);let $e=performance.now()+40;we($e),F($e,!0);let et=dn(-Rt,-600,Rt,600,12,1.2);E.setTerrainChunk(`world-backdrop`,et),e.push(`рельеф: чанков ${O.size} (16×16) + дальних ${M.size} (64×64, шаг 4) + задник (шаг 12, весь мир), в очереди ещё ${A.length+P.length}`),Rn(e),window.__coverageCheck=(e,t)=>{for(let n of O){let[r,i]=n.split(`,`).map(Number),a=r*16,o=i*16;if(e>=a&&e<a+16&&t>=o&&t<o+16)return`near`}for(let n of M){let[r,i]=n.slice(4).split(`,`).map(Number),a=r*64,o=i*64;if(e>=a&&e<a+64&&t>=o&&t<o+64)return`far`}return null},Object.defineProperty(window,"cam",{value:{get tx(){return B.target[0]},set tx(e){B.target[0]=e,H.stopAuto()},get ty(){return B.target[1]},set ty(e){B.target[1]=e,H.stopAuto()},get tz(){return B.target[2]},set tz(e){B.target[2]=e,H.stopAuto()},get dist(){return B.dist},set dist(e){B.dist=e,H.stopAuto()},get pitch(){return B.pitch},set pitch(e){B.pitch=e,H.stopAuto()}}}),window.H=(e,t)=>Z(e,t)*13,window.__camState=()=>({yaw:B.yaw,pitch:B.pitch,dist:B.dist,target:[...B.target]}),window.__isAutoOrbiting=()=>H.isAutoOrbiting();let U=document.getElementById(`coordX`),W=document.getElementById(`coordY`),tt=document.getElementById(`coordGo`),nt=!1;for(let e of[U,W])e.addEventListener(`input`,()=>{nt=!0});function rt(){let e=parseFloat(U.value),t=parseFloat(W.value);!isFinite(e)||!isFinite(t)||(B.target[0]=Math.max(-Rt,Math.min(Rt,e)),B.target[2]=Math.max(-600,Math.min(600,t)),B.target[1]=Z(B.target[0],B.target[2])*13+2,H.stopAuto(),nt=!1)}tt.addEventListener(`click`,rt);for(let e of[U,W])e.addEventListener(`keydown`,t=>{t.key===`Enter`&&(t.preventDefault(),rt(),e.blur())});let it=new Float32Array(16),G=[0,0,0],at=document.getElementById(`selected`),ot=3.2,st=2.6,ct=e=>e.scout?st:ot,lt=e=>Z(e.x,e.y)*13+ct(e),ut=e=>Z(e.x,e.y)*13+ct(e)*.5,dt=[1,.86,.42],ft=1500,pt=null,mt=null,ht=[.35,.85,.45],gt=null,K=null,_t=null;window.startFollowMarch=e=>{H.stopAuto(),_t=e},H.onInteract(()=>{_t=null});function vt(e){K=null,gt=e;let t=(v.get(e)??`?`)+` · `+(y.get(e)??`?`);window.__markerActive=!0,window.__selectedLabel=t,at.textContent=t,at.style.display=`block`}function yt(){gt=null,window.__markerActive=!1,window.__selectedLabel=null,at.style.display=`none`}function bt(e,t){let n=T.width/Math.max(1,T.height),r=Math.tan(xt/2),i=e/T.width*2-1,a=1-t/T.height*2,o=V(ze(G,B.target)),s=V(Be([0,1,0],o)),c=Be(o,s),l=V([i*n*r*s[0]+a*r*c[0]-o[0],i*n*r*s[1]+a*r*c[1]-o[1],i*n*r*s[2]+a*r*c[2]-o[2]]);return{origin:G,dir:l}}let xt=.72;function St(e,t){let n=0;for(let r=2;r<=400;r+=2){let i=e[0]+t[0]*r;if(e[1]+t[1]*r-Z(i,e[2]+t[2]*r)*13<=0){let i=n,a=r;for(let n=0;n<12;n++){let n=(i+a)/2,r=e[0]+t[0]*n,o=e[2]+t[2]*n;e[1]+t[1]*n-Z(r,o)*13>0?i=n:a=n}return{t:a,x:e[0]+t[0]*a,z:e[2]+t[2]*a}}n=r}return null}function Ct(e,t){try{let n=window.parent;n&&n!==window&&typeof n.renderCartoucheFor==`function`&&n.renderCartoucheFor(e,t)}catch{}}function wt(e){try{let t=window.parent;t&&t!==window&&typeof t.renderMarchCartoucheFor==`function`&&t.renderMarchCartoucheFor(e)}catch{}}function Tt(e){let t=Ke(it,e);return t.w<=.001?null:{sx:(t.x/t.w*.5+.5)*T.width,sy:(1-(t.y/t.w*.5+.5))*T.height,w:t.w}}function Et(e,t){let n=.5*T.height/Math.tan(xt/2),r=null,i=1/0;for(let a of C){let o=p.x[a],s=p.y[a],c=g.get(a)??5,l=[o,(_.get(a)??Z(o,s)*13)+c*.5,s],u=Tt(l);if(!u)continue;let d=Math.max(26,n*c/u.w),f=e-u.sx,m=t-u.sy,h=f*f+m*m;h>d*d||h>=i||(i=h,r={kind:`entity`,eid:a,distToCam:Math.hypot(o-G[0],l[1]-G[1],s-G[2])})}for(let a of q){let o=[a.x,ut(a),a.y],s=Tt(o);if(!s)continue;let c=Math.max(3,ct(a)*.5),l=Math.max(26,n*c/s.w),u=e-s.sx,d=t-s.sy,f=u*u+d*d;f>l*l||f>=i||(i=f,r={kind:`march`,march:a,distToCam:Math.hypot(a.x-G[0],o[1]-G[1],a.y-G[2])})}let{origin:a,dir:o}=bt(e,t),s=St(a,o);return r&&!(s!==null&&s.t+5<r.distToCam)?r.kind===`entity`?{kind:`entity`,eid:r.eid,t:r.distToCam}:{kind:`march`,march:r.march,t:r.distToCam}:s===null?null:{kind:`ground`,x:s.x,z:s.z,t:s.t}}H.onTap((e,t)=>{let n=T.getBoundingClientRect(),r=Et((e-n.left)*(T.width/n.width),(t-n.top)*(T.height/n.height));if(r?.kind===`entity`){vt(r.eid);let e=x.get(r.eid);e&&Ct(e.x,e.y);return}if(r?.kind===`march`){yt(),K=r.march.id,window.__selectedMarchId=r.march.id,wt(r.march.id);return}yt(),K=null,r?.kind===`ground`&&Ct(Math.floor(r.x),Math.floor(r.z))});function Dt(e,t){let n=T.getBoundingClientRect();return[(e-n.left)*(T.width/n.width),(t-n.top)*(T.height/n.height)]}function Ot(e,t){let[n,r]=Dt(e,t),i=Et(n,r);if(!i)return null;if(i.kind===`ground`)return{x:i.x,z:i.z};if(i.kind===`entity`){let e=x.get(i.eid);if(e)return{x:e.x+.5,z:e.y+.5}}return i.kind===`march`?{x:i.march.x,z:i.march.y}:null}function kt(e,t){let n=Ot(e,t);if(!n){mt=null;return}mt={x:n.x,y:Z(n.x,n.z)*13+3,z:n.z,color:ht}}H.onGrab((e,t)=>{let[n,r]=Dt(e,t),i=Et(n,r);return i?.kind!==`march`||!i.march.own?!1:(pt=i.march.id,kt(e,t),!0)},(e,t)=>{pt!==null&&kt(e,t)},(e,t)=>{let n=pt;if(pt=null,mt=null,n===null||!isFinite(e)||!isFinite(t))return;let r=Ot(e,t);if(r)try{let e=window.parent;e&&e!==window&&typeof e.redirectMarchTo==`function`&&e.redirectMarchTo(n,Math.floor(r.x),Math.floor(r.z))}catch{}});let At=!1,jt=0;async function Mt(){let e=jn(B.target[0],B.target[2],192);if(!e)return;let t=new Set,n=[],r=new Set;for(let i of e){t.add(i.key);let e=S.get(i.key);if(e!==void 0){if(v.set(e,i.nm),y.set(e,i.lv),b.set(e,!!i.own),gt===e&&vt(e),h.get(e)!==i.model){h.set(e,i.model),g.set(e,i.scale);let t=p.x[e],r=p.y[e],a=Z(t,r)*13;_.set(e,a);let o=Ue(t,a,r,0,i.scale);n.push(je(i.model).then(t=>{I.destroyInstance(R.get(e)),R.set(e,I.createInstance(t,o))}).catch(()=>{}))}continue}let a=ee(i),o=Z(i.x,i.y)*13;_.set(a,o);let s=Ue(i.x,o,i.y,0,i.scale);n.push(je(i.model).then(e=>{I.destroyInstance(R.get(a)),R.set(a,I.createInstance(e,s))}).catch(()=>{})),r.add(de(Math.floor(i.x/16),Math.floor(i.y/16))),Te(Math.floor(i.x/16),Math.floor(i.y/16))}for(let[e,n]of Array.from(S))t.has(e)||(r.add(de(Math.floor(p.x[n]/16),Math.floor(p.y[n]/16))),Ie(f,n),I.destroyInstance(R.get(n)),R.delete(n),h.delete(n),g.delete(n),_.delete(n),v.delete(n),y.delete(n),b.delete(n),x.delete(n),S.delete(e),gt===n&&yt());await Promise.allSettled(n),C=Array.from(De(f,[p,m]));let i=!1;for(let e of r){if(!O.has(e))continue;let[t,n]=e.split(`,`).map(Number);pe.set(e,_e(t,n)),i=!0}i&&ve(),jt++,window.__ecsFound=C.length,window.__syncCount=jt}l&&setInterval(()=>{ue()||At||(At=!0,Mt().catch(e=>console.error(`live sync:`,e)).finally(()=>{At=!1}))},3e3);let q=[];function Nt(){if(!l){q=[];return}q=In()||[],window.__marchPositions=q}let Ft=new Set([`human`,`dwarf`,`elf`,`undead`]),It=[.62,1.14,.72,.32],Lt=[1.22,.55,.5,.32];function zt(e){let t=Ft.has(e.race)?e.race:`human`;return e.scout?`/models/marches/scout-${t}.glb`:e.hasGen?`/models/marches/gen-${t}-${+(e.genId===1)}.glb`:`/models/marches/army-${t}.glb`}let X=new Map;function Vt(){for(let e of q){let t=zt(e),n=X.get(e.id);if(n&&n.path!==t&&(I.destroyInstance(n.inst??void 0),X.delete(e.id),n=void 0),!n){n={path:t,inst:null,yaw:Number.isFinite(e.yaw)?e.yaw:0},X.set(e.id,n);let r=n,i=e.id;je(t).then(e=>{X.get(i)===r&&(r.inst=I.createInstance(e,Ue(0,-1e6,0,0,1),It))},()=>{})}if(Number.isFinite(e.yaw)&&(n.yaw=e.yaw),n.inst){let t=e.scout?st:ot;I.updateInstance(n.inst,Ue(e.x,Z(e.x,e.y)*13,e.y,n.yaw,t),e.own?It:Lt)}}if(X.size>q.length){let e=new Set(q.map(e=>e.id));for(let[t,n]of X)e.has(t)||(I.destroyInstance(n.inst??void 0),X.delete(t))}}let Ht=document.getElementById(`labels`),Ut=new Map,Gt=We(),Kt=1024;function qt(){let e=new Set,t=T.clientWidth,n=T.clientHeight;for(let r of C){let i=p.x[r],a=p.y[r],o=i-B.target[0],s=a-B.target[2];if(o*o+s*s>Kt)continue;let c=(_.get(r)??Z(i,a)*13)+(g.get(r)??5)*.6+1.1,l=Ge(it,i,c,a,Gt);if(l.w<=.001)continue;let u=(l.x/l.w*.5+.5)*t,d=(1-(l.y/l.w*.5+.5))*n;if(u<-40||u>t+40||d<-40||d>n+40)continue;e.add(r);let f=Ut.get(r);if(!f){let e=document.createElement(`div`);e.className=`wlabel`;let t=document.createElement(`div`);t.className=`nm`;let n=document.createElement(`div`);n.className=`lv`,e.appendChild(t),e.appendChild(n),Ht.appendChild(e),f={root:e,nm:t,lv:n,lastNm:``,lastLv:``,lastMine:!1},Ut.set(r,f)}let m=v.get(r)??`?`;f.lastNm!==m&&(f.nm.textContent=m,f.lastNm=m);let h=!!b.get(r);f.lastMine!==h&&(f.nm.classList.toggle(`mine`,h),f.lastMine=h);let x=y.get(r)??``;f.lastLv!==x&&(f.lv.textContent=x,f.lastLv=x),f.root.style.transform=`translate(${u.toFixed(1)}px,${d.toFixed(1)}px) translate(-50%,-100%)`}for(let[t,n]of Ut)e.has(t)||(n.root.remove(),Ut.delete(t))}let Jt=new Map;function Yt(e,t,n,r){if(!r||!n||r<=n)return t;let i=Math.max(0,Math.min(1,(Date.now()-n)/(r-n)));return e+(t-e)*i}function Xt(){let e=new Set,t=T.clientWidth,n=T.clientHeight;for(let r of q){let i=r.battle;if(!i)continue;let a=r.x-B.target[0],o=r.y-B.target[2];if(a*a+o*o>Kt)continue;let s=lt(r)+1.6,c=Ke(it,[r.x,s,r.y]);if(c.w<=.001)continue;let l=(c.x/c.w*.5+.5)*t,u=(1-(c.y/c.w*.5+.5))*n;if(l<-60||l>t+60||u<-60||u>n+60)continue;e.add(r.id);let d=Jt.get(r.id);if(!d){let e=document.createElement(`div`);e.className=`blabel`;let t=document.createElement(`div`);t.className=`btitle`;let n=document.createElement(`div`);n.className=`bbar atk`;let i=document.createElement(`i`);n.appendChild(i);let a=document.createElement(`div`);a.className=`bbar def`;let o=document.createElement(`i`);a.appendChild(o),e.appendChild(t),e.appendChild(n),e.appendChild(a),Ht.appendChild(e),d={root:e,title:t,atkFill:i,defFill:o},Jt.set(r.id,d)}let f=i.retreating,p=!f&&i.revealFromRound===0,m=i.demolish;d.root.className=`blabel`+(f?` retreat`:p?` deploy`:m?` demolish`:``),d.title.textContent=f?`Отступление`:p?`Развёртывание`:m?m.name?`Таранят: `+m.name:`Город разбирают`:`Бой — раунд `+i.round;let h=Math.max(0,Math.min(100,Yt(i.revealFromAttHp,i.attHpLeft,i.revealStart,i.revealAt)/Math.max(1,i.attStartHp)*100)),g=m?Math.max(0,Math.min(100,Yt(m.sameTarget?m.revealFromHp:m.hp,m.hp,i.revealStart,i.revealAt)/Math.max(1,m.max)*100)):Math.max(0,Math.min(100,Yt(i.revealFromDefHp,i.defHpLeft,i.revealStart,i.revealAt)/Math.max(1,i.defStartHp)*100));d.atkFill.style.width=h.toFixed(1)+`%`,d.defFill.style.width=g.toFixed(1)+`%`,d.root.style.transform=`translate(${l.toFixed(1)}px,${u.toFixed(1)}px) translate(-50%,-100%)`}for(let[t,n]of Jt)e.has(t)||(n.root.remove(),Jt.delete(t))}let Zt=We();function en(e,t,n,r,i){let a=p.x[e],o=p.y[e],s=g.get(e)??5,c=(_.get(e)??0)+s*.6,l=a-G[0],u=c-G[1],d=o-G[2],f=l*l+u*u+d*d;if(f<3600)return!0;if(f>16900)return!1;let m=Ge(t,a,c,o,Zt);if(m.w<=.001)return!1;let h=(m.x/m.w*.5+.5)*n,v=(1-(m.y/m.w*.5+.5))*r,y=i*s/m.w+24;return h>-y&&h<n+y&&v>-y&&v<r+y}let Q={frame:0,chunks:0,render:0,labels:0,maxFrame:0,maxChunks:0,maxRender:0,maxLabels:0,n:0,worstFrame:0,worstChunks:0,worstRender:0,worstLabels:0};function nn(){Q.maxFrame=Math.max(Q.maxFrame,Q.frame),Q.maxChunks=Math.max(Q.maxChunks,Q.chunks),Q.maxRender=Math.max(Q.maxRender,Q.render),Q.maxLabels=Math.max(Q.maxLabels,Q.labels),++Q.n>=60&&(Q.worstFrame=Q.maxFrame,Q.worstChunks=Q.maxChunks,Q.worstRender=Q.maxRender,Q.worstLabels=Q.maxLabels,Q.maxFrame=Q.maxChunks=Q.maxRender=Q.maxLabels=0,Q.n=0,Rn([`кадр (худший из 60): ${Q.worstFrame.toFixed(1)} мс`,`  стройка чанков: ${Q.worstChunks.toFixed(1)} мс`,`  отрисовка:      ${Q.worstRender.toFixed(1)} мс`,`  подписи:        ${Q.worstLabels.toFixed(1)} мс`,`чанков ${window.__terrainChunkCount??0} · моделей в кадре ${window.__modelDrawCount??0} · сущностей ${window.__ecsFound??C.length} · декора ${window.__decorCount??0}`,`в очереди на стройку: ${A.length} ближних`])),window.__perf=Q}let rn=!1;function an(e){let t=$?performance.now():0;try{on(e)}catch(e){console.error(`draw:`,e),rn||(rn=!0,ne(`Сбой в кадре: ${e instanceof Error?e.message:String(e)}`))}$&&(Q.frame=performance.now()-t,nn()),requestAnimationFrame(an)}function on(e){if(ue())return;H.isAutoOrbiting()&&(B.yaw=e*15e-5),H.update(e),Nt();let t=[];if(_t!==null){let e=q.find(e=>e.id===_t);e?(B.target[0]=e.x,B.target[2]=e.y,B.target[1]=Z(e.x,e.y)*13+1):_t=null}nt||(U.value=B.target[0].toFixed(1),W.value=B.target[2].toFixed(1)),Ce(B.target[0],B.target[2]),Ae(B.target[0],B.target[2]);let n=performance.now(),r=n+3;F(r,we(r)===0),$&&(Q.chunks=performance.now()-n);let o=[B.target[0]+Math.sin(B.yaw)*Math.cos(B.pitch)*B.dist,B.target[1]+Math.sin(B.pitch)*B.dist,B.target[2]+Math.cos(B.yaw)*Math.cos(B.pitch)*B.dist],s=Z(o[0],o[2])*13+2;o[1]<s&&(o[1]=s);let c=T.width/Math.max(1,T.height),l=Ve(He(xt,c,.5,392),qe(o,B.target,[0,1,0]));it=l,G=o,E.setVP(l),E.setFog(o,i,a,e/1e3),E.setSunTarget(B.target[0],B.target[2]);{let t=V(ze(o,B.target)),n=V(Be([0,1,0],t)),r=Be(t,n);E.setSkyCamera(n,r,t,Math.tan(xt/2),c,e/1e3)}I.setFog(o,i,a),I.setVP(l),K!==null&&!q.some(e=>e.id===K)&&(K=null),mt&&t.push(mt),E.setMarkers(t),Vt(),window.__marchCount=q.length;let u=T.clientWidth,d=T.clientHeight,f=.5*d/Math.tan(xt/2),p=0,m=$?performance.now():0,h=gt===null?K===null?null:X.get(K)?.inst??null:R.get(gt)??null;if(h){let t=.5-.5*Math.cos(e%ft/ft*Math.PI*2);I.setOutlineStyle(dt,.003+.0017999999999999995*t)}E.frame({r:i[0],g:i[1],b:i[2],a:1},e=>{I.beginModels(e);for(let t of C){if(!en(t,l,u,d,f))continue;let n=R.get(t);n&&(I.draw(e,n),p++)}for(let t of X.values())t.inst&&(I.draw(e,t.inst),p++);h&&(I.beginOutlines(e),I.drawOutline(e,h))}),window.__modelDrawCount=p,$&&(Q.render=performance.now()-m);let g=$?performance.now():0;qt(),Xt(),$&&(Q.labels=performance.now()-g)}requestAnimationFrame(an),window.__engineReady=!0}Bn().catch(e=>{zn([`Ошибка: ${e instanceof Error?e.message:String(e)}`]),console.error(e)});