import http from 'http';
import { DataQuery, DataResult } from '../data-api'
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

export async function dataApi<Q extends DataQuery>(db: NoSql<MqttLog>, query: Q): Promise<DataResult<Q> | undefined> {
    if (query.q === 'stored_topics') {
        const retained = await db.select("_source",
        "rowid in (SELECT rowid from (select rowid,max(msts),topic from $table where msts > $since group by topic))",{
            $since: query.since
        });
        return retained.map(row => JSON.parse(row._source)) as DataResult<Q>;
    }
    if (query.q === 'series') {
        const result = await db.select("floor(msts/$interval)*$interval as time," +
                query.fields.map(f => `${query.metric}([payload.${f}]) as [${f}]`).join(', '),
            "topic=$topic AND msts >= $start AND msts < $end group by time",{
            $interval: query.interval * 60000,
            $topic: query.topic,
            $start: query.start || 0,
            $end: query.end || Date.now()
        });
        return result as DataResult<Q>;
    }
    if (query.q === 'topics') {
        return db.select('distinct topic','$match is NULL OR topic like $match',{
            $match: query.match
        }) as Promise<DataResult<Q>>;
    }
    if (query.q === 'latest') {
        const row = await db.select('_source','topic=$topic order by msts desc limit 1',{
            $topic: query.topic
        });
        return JSON.parse(row[0]._source) as DataResult<Q>;
    }
    throw new Error("Unknown API call");
}
