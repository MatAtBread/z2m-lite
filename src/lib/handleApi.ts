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


export async function dataApi(db: NoSql<MqttLog>) {
    const stored_topcis_cache: DataResult<StoredTopicsQuery> = (await db.select("_source",
        "rowid in (SELECT rowid from (select rowid,max(msts),topic from $table where msts > $since group by topic))", {
        $since: Date.now() - 86400000
    })).map(row => JSON.parse(row._source));

    return async function <Q extends DataQuery>(query: Q): Promise<DataResult<Q> | undefined> {
        if (query.q === 'insert') {
            const msts = Date.now();
            let cached = stored_topcis_cache.find(t => t.topic === query.topic);
            if (!cached) {
                cached = { msts: Date.now(), topic: query.topic, payload: query.payload };
                stored_topcis_cache.push(cached);
            } else {
                cached.msts = msts;
                cached.payload = query.payload;
            }
            await db.index(cached);
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
