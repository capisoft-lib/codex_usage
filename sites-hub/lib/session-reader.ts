// Select matching IDs first: small responses should not require round trips for
// thousands of sessions whose calls all fall outside the requested interval.
// Four bounded reads at a time also avoid serial network waits for long history.
export async function readSessionSlices(database: D1Database, owner: string, from: string, to: string, includeInvalid: boolean, id: string | null, consume: (row: {node_id:string;session_id:string;snapshot_json:string}) => void, callsOnly = false) {
  const predicate = `julianday(json_extract(c.value,'$.timestamp')) BETWEEN julianday(?) AND julianday(?)${includeInvalid ? " OR julianday(json_extract(c.value,'$.timestamp')) IS NULL" : ""}`;
  const keys = await database.prepare(`SELECT s.node_id,s.session_id FROM mesh_sessions s JOIN mesh_nodes n ON n.id=s.node_id
    WHERE n.owner_id=? AND n.revoked_at IS NULL AND (?='' OR s.node_id || ':' || s.session_id=?)
    AND EXISTS (SELECT 1 FROM json_each(s.snapshot_json,'$.calls') c WHERE ${predicate})
    ORDER BY s.node_id,s.session_id`).bind(owner,id||'',id||'',from,to).all<{node_id:string;session_id:string}>();
  const ids=keys.results || [];
  for(let offset=0;offset<ids.length;offset+=2000) {
    const reads=[];
    for(let start=offset;start<Math.min(offset+2000,ids.length);start+=500) {
      const lo=ids[start], hi=ids[Math.min(start+499,ids.length-1)];
      const calls=`(SELECT json_group_array(json(c.value)) FROM json_each(s.snapshot_json,'$.calls') c WHERE ${predicate})`;
      const projection=callsOnly ? `json_object('calls',json(${calls}))` : `json_set(s.snapshot_json,'$.calls',json(${calls}),
        '$.turns',json((SELECT json_group_array(json(t.value)) FROM json_each(s.snapshot_json,'$.turns') t
        WHERE julianday(json_extract(t.value,'$.startedAt')) BETWEEN julianday(?) AND julianday(?))))`;
      const args: (string | number)[]=[from,to];
      if(!callsOnly) args.push(from,to);
      args.push(owner,lo.node_id,lo.session_id,hi.node_id,hi.session_id,id||'',id||'',from,to);
      reads.push(database.prepare(`SELECT s.node_id,s.session_id,${projection} AS snapshot_json FROM mesh_sessions s JOIN mesh_nodes n ON n.id=s.node_id
        WHERE n.owner_id=? AND n.revoked_at IS NULL AND (s.node_id,s.session_id)>=(?,?) AND (s.node_id,s.session_id)<=(?,?)
        AND (?='' OR s.node_id || ':' || s.session_id=?)
        AND EXISTS (SELECT 1 FROM json_each(s.snapshot_json,'$.calls') c WHERE ${predicate}) ORDER BY s.node_id,s.session_id LIMIT 500`).bind(...args).all<{node_id:string;session_id:string;snapshot_json:string}>());
    }
    for(const result of await Promise.all(reads)) for(const row of result.results || []) consume(row);
  }
}
