"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleApi = handleApi;
exports.dataApi = dataApi;
const client_1 = require("@clickhouse/client");
async function handleApi(rsp, fn) {
    try {
        rsp.setHeader("Content-Type", "application/json");
        const data = await fn();
        rsp.write(JSON.stringify(data || null));
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
function changedFields(a, b, path, ignoreFields) {
    const result = [];
    (function cmp(a, b, path) {
        if (typeof a !== typeof b)
            return result.push(path);
        if (a === b)
            return;
        if (Array.isArray(a)) {
            if (!Array.isArray(b))
                return result.push(path);
            if (a.length !== b.length)
                return result.push(path);
            for (let i = 0; i < a.length; i++) {
                const p = path;
                cmp(a[i], b[i], path + '.' + i);
            }
        }
        else if (typeof a === 'object') {
            if (a === null && b !== null || a !== null && b === null)
                return result.push(path);
            const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
            for (const i of keys.values()) {
                if (!ignoreFields.includes(i))
                    cmp(a[i], b[i], path + '.' + i);
            }
        }
        else if (a !== b)
            return result.push(path);
    })(a, b, path);
    return result;
}
function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}
async function dataApi() {
    const dbUrlIdx = process.argv.indexOf("--db");
    const dbUrl = dbUrlIdx >= 0 ? process.argv[dbUrlIdx + 1] : 'http://house.mailed.me.uk:8123';
    const db = (0, client_1.createClient)({
        url: dbUrl,
    });
    let attempts = 0;
    while (true) {
        try {
            await db.command({
                query: `
          CREATE TABLE IF NOT EXISTS data (
            topic String,
            msts Int64,
            payload String
          ) ENGINE = MergeTree()
          ORDER BY (topic, msts)
        `
            });
            console.log("Clickhouse connected");
            break;
        }
        catch (ex) {
            console.log(`Waiting for Clickhouse #${++attempts} (${ex.message})`);
            await sleep(3.5);
        }
    }
    const storedTopicsRs = await db.query({
        query: `SELECT topic, max(msts) as max_msts, argMax(payload, msts) as payload FROM data GROUP BY topic`,
        format: 'JSONEachRow'
    });
    const storedTopicsRaw = await storedTopicsRs.json();
    const storedTopicsCache = storedTopicsRaw.map(r => ({
        topic: r.topic,
        msts: Number(r.max_msts),
        payload: JSON.parse(r.payload)
    }));
    return async function (query) {
        if (query.q === 'delete') {
            const idx = storedTopicsCache.findIndex(t => t.topic === query.topic);
            if (idx >= 0)
                storedTopicsCache.splice(idx, 1);
            await db.command({
                query: `ALTER TABLE data DELETE WHERE topic = {topic:String}`,
                query_params: { topic: query.topic }
            });
            return;
        }
        if (query.q === 'insert') {
            const cached = storedTopicsCache.find(t => t.topic === query.topic);
            let payloadChanged = false;
            if (!cached || !cached.payload || !query.payload) {
                payloadChanged = true;
            }
            else {
                const changes = changedFields(query.payload, cached.payload, 'payload', ['timestamp', 'last_seen']);
                payloadChanged = changes.length > 0;
            }
            if (!cached) {
                const newMsg = { msts: query.msts, topic: query.topic, payload: query.payload };
                storedTopicsCache.push(newMsg);
            }
            else {
                cached.msts = query.msts;
                if (payloadChanged) {
                    cached.payload = query.payload;
                }
            }
            if (payloadChanged && !process.argv.includes("--no-store")) {
                await db.insert({
                    table: 'data',
                    values: [{
                            topic: query.topic,
                            msts: query.msts,
                            payload: JSON.stringify(query.payload)
                        }],
                    format: 'JSONEachRow'
                });
            }
            return;
        }
        if (query.q === 'latest') {
            return storedTopicsCache.find(t => t.topic === query.topic);
        }
        if (query.q === 'stored_topics') {
            return storedTopicsCache;
        }
        if (query.q === 'series') {
            const fieldNames = query.fields.map(f => typeof f === 'string' ? f : Object.keys(f)[0]);
            if (query.metric === 'boolean') {
                const rs = await db.query({
                    query: `
            SELECT msts, payload
            FROM data
            WHERE topic = {topic:String}
              AND msts >= {start:Int64}
              AND msts <= {end:Int64}
            ORDER BY msts ASC
          `,
                    query_params: {
                        topic: query.topic,
                        start: query.start || 0,
                        end: query.end || Date.now()
                    },
                    format: 'JSONEachRow'
                });
                const rows = await rs.json();
                return rows.map(h => {
                    const payloadObj = JSON.parse(h.payload);
                    return Object.fromEntries([
                        ['time', Number(h.msts)],
                        ...fieldNames.map(boolField => {
                            const val = payloadObj?.[boolField];
                            const norm = typeof val === 'string' ? val.toUpperCase() : val;
                            const map = { ON: 1, OFF: 0, 1: 1, 0: 0 };
                            return [
                                boolField,
                                map[norm] ?? 0
                            ];
                        })
                    ]);
                });
            }
            else {
                const aggFunc = ['sum', 'avg', 'max', 'min'].includes(query.metric) ? query.metric : 'avg';
                const selects = query.fields.map((f, i) => {
                    const m = typeof f === 'string' ? null : Object.values(f)[0].match(/transform\(([a-zA-Z_.]+),(.*)/);
                    if (m) {
                        query.fields[i] = m[1].trim();
                        return `${aggFunc}OrNull(transform(JSONExtractRaw(payload, ${query.fields[i].split('.').map(p => `'${p}'`)}), ${m[2]}) AS \`${m[1].trim()}\``;
                    }
                    else {
                        return `${aggFunc}OrNull(CAST(JSONExtractRaw(payload, ${f.split('.').map(p => `'${p}'`)}) AS Float64)) AS \`${f}\``;
                    }
                }).join(', ');
                const intervalSeconds = (Number(query.interval) || 1) * 60;
                const clickhouseQuery = `SELECT
              (toUnixTimestamp(toStartOfInterval(toDateTime(toUInt64(msts / 1000)), INTERVAL ${query.interval} MINUTE)) + ${intervalSeconds}) * 1000 AS key,
              ${selects}
            FROM data
            WHERE topic = {topic:String}
              AND msts >= {start:Int64}
              AND msts <= {end:Int64}
            GROUP BY key
            ORDER BY key
          `;
                const rs = await db.query({
                    query: clickhouseQuery,
                    query_params: {
                        topic: query.topic,
                        start: query.start || 0,
                        end: query.end || Date.now()
                    },
                    format: 'JSONEachRow'
                });
                const rows = await rs.json();
                return rows.map((b) => {
                    const obj = { time: Number(b.key) };
                    fieldNames.forEach(f => {
                        if (b[f] !== null && b[f] !== undefined) {
                            obj[f] = Number(b[f]);
                        }
                    });
                    return obj;
                });
            }
        }
        throw new Error("Unknown API call");
    };
}
