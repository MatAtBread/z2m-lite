"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dataApi = exports.handleApi = void 0;
async function handleApi(rsp, fn) {
    try {
        rsp.setHeader("Content-Type", "application/json");
        rsp.write(JSON.stringify(await fn()));
    }
    catch (ex) {
        rsp.setHeader("Content-Type", "application/json");
        rsp.statusCode = 500;
        rsp.write(JSON.stringify({ message: ex.message, ...ex }));
    }
    finally {
        rsp.end();
    }
}
exports.handleApi = handleApi;
async function dataApi(db, query) {
    if (query.q === 'stored_topics') {
        const retained = await db.all('select _source from data where rowid in (SELECT rowid from (select rowid,max(msts),topic from DATA where msts > $since group by topic))', {
            $since: query.since
        });
        return retained.map(row => JSON.parse(row._source));
    }
    if (query.q === 'series') {
        const aggs = query.fields.map(f => `avg([payload.${f}]) as [${f}]`).join(', ');
        const result = await db.all(`select floor(msts/$interval)*$interval as time,
            ${aggs}
            from data where 
                topic=$topic 
                AND msts >= $start
                AND msts <= $end
            group by time`, {
            $interval: query.interval * 60000,
            $topic: query.topic,
            $start: query.start || 0,
            $end: query.end || Date.now()
        });
        return result;
    }
    if (query.q === 'topics') {
        return db.all('select distinct topic from data where $match is NULL OR topic like $match', {
            $match: query.match
        });
    }
    if (query.q === 'latest') {
        const row = await db.all('select _source from data where topic=$topic order by msts desc limit 1', {
            $topic: query.topic
        });
        return JSON.parse(row[0]._source);
    }
}
exports.dataApi = dataApi;
