// Подставной клиент Supabase: настоящая in-memory база с фильтрами, чтобы
// прогнать Edge Function целиком и увидеть, где она падает.
export function makeDb(tables){
  const db = JSON.parse(JSON.stringify(tables));
  const log = [];
  let nextId = 1000;

  function match(row, filters){
    return filters.every(f=>{
      const v = row[f.col];
      switch(f.op){
        case 'eq':  return String(v) === String(f.val);
        case 'neq': return String(v) !== String(f.val);
        case 'is':  return f.val === null ? (v === null || v === undefined) : v === f.val;
        case 'in':  return f.val.map(String).includes(String(v));
        case 'lte': return v <= f.val;
        case 'lt':  return v < f.val;
        case 'gte': return v >= f.val;
        case 'or':  return true; // грубо: не сужаем
        default:    return true;
      }
    });
  }

  function query(table){
    const filters = [];
    let mode = 'select', payload = null, limitN = null, orderCol = null, orderAsc = true;
    const rows = () => (db[table] = db[table] || []);

    const exec = () => {
      log.push(`${table}.${mode}` + (filters.length ? ' [' + filters.map(f=>`${f.col} ${f.op} ${JSON.stringify(f.val)}`).join(', ') + ']' : ''));
      let out = rows().filter(r => match(r, filters));
      if (orderCol) out = out.slice().sort((a,b)=> (a[orderCol]>b[orderCol]?1:-1) * (orderAsc?1:-1));
      if (limitN != null) out = out.slice(0, limitN);
      if (mode === 'select') return { data: out, error: null };
      if (mode === 'insert' || mode === 'upsert') {
        const list = Array.isArray(payload) ? payload : [payload];
        const made = list.map(r => Object.assign({ id: nextId++, created_at: new Date().toISOString(),
          updated_at: new Date().toISOString() }, r));
        rows().push(...made);
        return { data: made, error: null };
      }
      if (mode === 'update') { out.forEach(r => Object.assign(r, payload)); return { data: out, error: null }; }
      if (mode === 'delete') { db[table] = rows().filter(r => !match(r, filters)); return { data: out, error: null }; }
      return { data: out, error: null };
    };

    const api = {
      select(){ if (mode==='select') mode='select'; return api; },
      insert(p){ mode='insert'; payload=p; return api; },
      upsert(p){ mode='upsert'; payload=p; return api; },
      update(p){ mode='update'; payload=p; return api; },
      delete(){ mode='delete'; return api; },
      eq(c,v){ filters.push({col:c,op:'eq',val:v}); return api; },
      neq(c,v){ filters.push({col:c,op:'neq',val:v}); return api; },
      is(c,v){ filters.push({col:c,op:'is',val:v}); return api; },
      in(c,v){ filters.push({col:c,op:'in',val:v}); return api; },
      lte(c,v){ filters.push({col:c,op:'lte',val:v}); return api; },
      lt(c,v){ filters.push({col:c,op:'lt',val:v}); return api; },
      gte(c,v){ filters.push({col:c,op:'gte',val:v}); return api; },
      or(){ return api; },
      order(c,o){ orderCol=c; orderAsc=!o||o.ascending!==false; return api; },
      limit(n){ limitN=n; return api; },
      maybeSingle(){ const r=exec(); return Promise.resolve({ data: r.data[0] ?? null, error: r.error }); },
      single(){ const r=exec(); return Promise.resolve({ data: r.data[0] ?? null, error: r.data.length?null:{message:'no rows'} }); },
      then(res, rej){ return Promise.resolve(exec()).then(res, rej); },
    };
    return api;
  }

  return {
    db, log,
    client: {
      auth: { getUser: async () => ({ data:{ user:{ id: 'uid-1' } }, error: null }) },
      from: (t) => query(t),
    },
  };
}
