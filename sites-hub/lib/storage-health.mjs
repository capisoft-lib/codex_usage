export function temporaryStorageError(error) {
  return /D1_ERROR:.*internal error|SQLITE_BUSY|database is locked|temporarily unavailable|D1.*overloaded/i.test(String(error?.message || error));
}

function diagnostic(error, route, attempt) {
  const reference = String(error?.message || '').match(/reference\s*=\s*([a-z0-9_-]+)/i)?.[1];
  return {route, attempt, code:temporaryStorageError(error) ? 'storage_unavailable' : 'storage_error', ...(reference ? {reference} : {})};
}

export async function retryStorageRead(work, {route = 'D1 read', logger = console, sleep = ms=>new Promise(resolve=>setTimeout(resolve,ms))} = {}) {
  for (let attempt=0;;attempt++) {
    try { return await work(); }
    catch (error) {
      logger.error('dashboard.storage', diagnostic(error,route,attempt+1));
      if (!temporaryStorageError(error) || attempt >= 2) throw error;
      await sleep(100 * 2 ** attempt);
    }
  }
}

// Only reads may be replayed. Signed ingestion and every write run once.
export function resilientDatabase(database) {
  const readStatements = new WeakSet();
  const originals = new WeakMap();
  return new Proxy(database, {get(target,key) {
    if (key === 'prepare') return sql=>{
      const wrap = statement=>{
        const proxy = new Proxy(statement,{get(value,method) {
          if (method === 'bind') return (...args)=>wrap(value.bind(...args));
          if (['all','first','raw'].includes(method) && /^\s*SELECT\b/i.test(sql)) return (...args)=>retryStorageRead(()=>value[method](...args));
          return typeof value[method] === 'function' ? value[method].bind(value) : value[method];
        }});
        if (/^\s*SELECT\b/i.test(sql)) readStatements.add(proxy);
        originals.set(proxy,statement);
        return proxy;
      };
      return wrap(target.prepare(sql));
    };
    if (key === 'batch') return statements=>statements.every(statement=>readStatements.has(statement))
      ? retryStorageRead(()=>target.batch(statements.map(statement=>originals.get(statement) || statement)))
      : target.batch(statements.map(statement=>originals.get(statement) || statement));
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  }});
}

export function storageErrorResponse(error, route) {
  const requestId = crypto.randomUUID();
  console.error('dashboard.request', {...diagnostic(error,route),requestId});
  const temporary = temporaryStorageError(error);
  return Response.json({error:temporary ? 'Stockage temporairement indisponible. Réessayez.' : 'Lecture impossible. Réessayez.',
    code:temporary ? 'storage_unavailable' : 'storage_error',requestId},
    {status:temporary ? 503 : 500,headers:{'Cache-Control':'private, no-store',...(temporary ? {'Retry-After':'1'} : {})}});
}
