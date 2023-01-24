import http from 'http';
import { NoSqlite } from './nosqlite';

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

export async function dataApi<Doc extends {}, Q extends DataQuery>(db: NoSqlite<Doc>, query: Q): Promise<DataResult<Q> | undefined> {
    if (query.q === 'stored_topics') {
        const retained = await db.all('select _source from data where rowid in (SELECT rowid from (select rowid,max(msts),topic from DATA where msts > $since group by topic))',{
            $since: query.since
        });
        return retained.map(row => JSON.parse(row._source)) as DataResult<Q>;
    }
    if (query.q === 'series') {
        const aggs = query.fields.map(f => `avg([payload.${f}]) as [${f}]`).join(', ');
        const result = await db.all(`select floor(msts/$interval)*$interval as time,
            ${aggs}
            from data where 
                topic=$topic 
                AND msts >= $start
                AND msts <= $end
            group by time`,{
            $interval: query.interval * 60000,
            $topic: query.topic,
            $start: query.start || 0,
            $end: query.end || Date.now()
        });
        return result as DataResult<Q>;
    }
    if (query.q === 'topics') {
        return db.all('select distinct topic from data where $match is NULL OR topic like $match',{
            $match: query.match
        }) as Promise<DataResult<Q>>;
    }
    if (query.q === 'latest') {
        const row = await db.all('select _source from data where topic=$topic order by msts desc limit 1',{
            $topic: query.topic
        });
        return JSON.parse(row[0]._source) as DataResult<Q>;
    }
}
