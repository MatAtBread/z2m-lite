"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sqlite3_1 = __importDefault(require("sqlite3"));
const http_1 = __importDefault(require("http"));
const node_static_1 = __importDefault(require("node-static"));
const mqtt_1 = __importDefault(require("mqtt"));
const nosqlite_1 = require("./nosqlite");
function sleep(seconds) {
    return new Promise(r => setTimeout(r, seconds * 1000));
}
async function dataApi(db, query) {
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
    else if (query.q === 'topics') {
        return db.all('select distinct topic from data where $match is NULL OR topic like $match', {
            $match: query.match
        });
    }
}
require('./aedes');
(async function () {
    const db = new nosqlite_1.NoSqlite({
        //filename: ':memory:',
        filename: './mqtt.db',
        driver: sqlite3_1.default.Database
    });
    const client = mqtt_1.default.connect("tcp://house.mailed.me.uk:1883");
    client.handleMessage = async (packet, callback) => {
        try {
            if (packet.cmd === 'publish') {
                const payload = packet.payload.toString();
                if (payload?.[0] === '{') {
                    await db.index({ msts: Date.now(), topic: packet.topic, payload: JSON.parse(payload) });
                }
            }
        }
        catch (err) {
            console.warn("\n", err);
        }
        finally {
            callback();
        }
    };
    client.subscribe('#');
    const www = new node_static_1.default.Server('./src/www', {
        cache: 0
    });
    const js = new node_static_1.default.Server('./dist/www', {
        cache: 0
    });
    http_1.default.createServer(async function (req, rsp) {
        if (req.url === '/') {
            req.url = '/index.html';
            www.serve(req, rsp);
        }
        else if (req.url?.startsWith('/sql?')) {
            try {
                rsp.setHeader("Content-Type", "application/json");
                rsp.write(JSON.stringify(await db.all(decodeURIComponent(req.url.slice(5)))));
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
        else if (req.url?.startsWith('/data?')) {
            try {
                rsp.setHeader("Content-Type", "application/json");
                rsp.write(JSON.stringify(await dataApi(db, JSON.parse(decodeURIComponent(req.url.slice(6))))));
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
        else if (req.url?.endsWith('.js'))
            js.serve(req, rsp);
        else
            www.serve(req, rsp);
    }).listen(8088);
    /*while (1) {
        await sleep(5);
        process.stdout.write("History: " + await db.count() + "              \r");
    }*/
})();
