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
        const retained = await db.select("_source", "rowid in (SELECT rowid from (select rowid,max(msts),topic from $table where msts > $since group by topic))", {
            $since: query.since
        });
        return retained.map(row => JSON.parse(row._source));
    }
    if (query.q === 'series') {
        const result = await db.select("floor(msts/$interval)*$interval as time," +
            query.fields.map(f => `${query.metric}([payload.${f}]) as [${f}]`).join(', '), "topic=$topic AND msts >= $start AND msts < $end group by time", {
            $interval: query.interval * 60000,
            $topic: query.topic,
            $start: query.start || 0,
            $end: query.end || Date.now()
        });
        return result;
    }
    if (query.q === 'topics') {
        return db.select('distinct topic', '$match is NULL OR topic like $match', {
            $match: query.match
        });
    }
    if (query.q === 'latest') {
        const row = await db.select('_source', 'topic=$topic order by msts desc limit 1', {
            $topic: query.topic
        });
        return JSON.parse(row[0]._source);
    }
    throw new Error("Unknown API call");
}
exports.dataApi = dataApi;
