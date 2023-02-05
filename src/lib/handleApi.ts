import http from 'http';
import { DataQuery, DataResult, SeriesResult, StoredTopicsQuery } from '../data-api'
import { MqttLog } from '../server';
import { NoSql } from './nosqlite';

export async function handleApi(rsp: http.ServerResponse<http.IncomingMessage>, fn: () => Promise<unknown>) {
    try {
        rsp.setHeader("Content-Type", "application/json");
        rsp.write(JSON.stringify(await fn()));
    } catch (ex: any) {
        rsp.setHeader("Content-Type", "application/json");
        rsp.statusCode = 500;
        rsp.write(JSON.stringify({ message: ex.message, ...ex }));
    } finally {
        rsp.end();
    }
}

function changedFields(a: any, b: any, path: string, ignoreFields: string[]) {
    const result: string[] = [];
    (function cmp(a,b,path){
        if (typeof a !== typeof b)
            return result.push(path);
        if (a === b)
            return ;
        if (Array.isArray(a)) {
            if (!Array.isArray(b))
               return result.push(path);
            if (a.length !== b.length)
                return result.push(path);
            for (let i=0; i<a.length; i++) {
                const p = path;
                cmp(a[i],b[i],path+'.'+i);
            }
        } else if (typeof a === 'object') {
            if (a === null && b !== null || a !== null && b === null) 
                return result.push(path);
            const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
            for (const i of keys.values()) {
                if (!ignoreFields.includes(i))
                    cmp(a[i],b[i],path+'.'+i);
            }
        } else if (a !== b)
            return result.push(path);
    })(a,b,path);
    return result;
}

export async function dataApi(db: NoSql<MqttLog>) {
    const stored_topcis_cache: DataResult<StoredTopicsQuery> = (await db.select("_source",
        "rowid in (SELECT rowid from (select rowid,max(msts),topic from $table where msts > $since group by topic))", {
        $since: Date.now() - 86400000
    })).map(row => JSON.parse(row._source));

    return async function <Q extends DataQuery>(query: Q): Promise<DataResult<Q> | undefined> {
        if (query.q === 'insert') {
            const cached = stored_topcis_cache.find(t => t.topic === query.topic);
            if (!cached) {
                const newMsg = { msts: query.msts, topic: query.topic, payload: query.payload};
                stored_topcis_cache.push(newMsg);
                await db.index(newMsg);
            } else {
                // If everything except the time-stamp is the same, just update the previous record
                const changed = !query.payload 
                    || !cached.payload 
                    || changedFields(query.payload, cached.payload, 'payload', ['timestamp','last_seen']);

                if (changed !== true && changed.length) {
                    cached.payload = query.payload;
                    cached.msts = query.msts;
                    await db.index(cached);
                } else {
                    const seq = cached.msts;
                    cached.payload = query.payload;
                    cached.msts = query.msts;
                    await db.update({ topic: cached.topic, msts: seq }, cached);
                }
            }
            return;
        }
        if (query.q === 'latest') {
            return stored_topcis_cache.find(t => t.topic === query.topic) as DataResult<Q>;
        }
        if (query.q === 'stored_topics') {
            return stored_topcis_cache as DataResult<Q>
        }
        if (query.q === 'series') {
            const result: SeriesResult = await db.select("floor(msts/$interval)*$interval as time," +
                query.fields.map(f => `${query.metric}([payload.${f}]) as [${f}]`).join(', '),
                "topic=$topic AND msts >= $start AND msts < $end group by time", {
                $interval: query.interval * 60000,
                $topic: query.topic,
                $start: query.start || 0,
                $end: query.end || Date.now()
            });
            return result as DataResult<Q>;
        }
        if (query.q === 'topics') {
            return db.select('distinct topic', '$match is NULL OR topic like $match', {
                $match: query.match
            }) as Promise<DataResult<Q>>;
        }
        throw new Error("Unknown API call");
    }
}
