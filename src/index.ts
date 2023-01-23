import sqlite3 from 'sqlite3'
import http from 'http';
import nodeStatic from 'node-static';
import MQTT from 'mqtt';

import { NoSqlite } from './nosqlite';

function sleep(seconds: number) {
    return new Promise(r => setTimeout(r, seconds * 1000));
}

async function dataApi<Doc extends {}>(db: NoSqlite<Doc>, query: DataQuery): Promise<DataResult | undefined> {
    if (query.series) {
        const aggs = query.series.fields.map(f => `avg([payload.${f}]) ${f}`).join(', ');
        const result = await db.all(`select floor(msts/$interval)*$interval as time,
            ${aggs}
            from data where 
                topic=$topic 
                AND msts >= $start
                AND msts <= $end
            group by time`,{
            $interval: query.series.interval * 60000,
            $topic: query.series.topic,
            $start: query.series.start || 0,
            $end: query.series.end || Date.now()
        });
        return result as DataResult;
    }
}

require('./aedes');
(async function () {
    const db = new NoSqlite<{ msts: number, topic: string, payload: any }>({
        //filename: ':memory:',
        filename: './mqtt.db',
        driver: sqlite3.Database
    });
    
    const client = MQTT.connect("tcp://house.mailed.me.uk:1883");
    client.handleMessage = async (packet, callback) => {
        try {
            if (packet.cmd === 'publish') {
                const payload = packet.payload.toString();
                if (payload?.[0] === '{') {
                    await db.index({ msts: Date.now(), topic: packet.topic, payload: JSON.parse(payload) });
                }
            }
        } catch (err) {
            console.warn("\n", err);
        } finally {
            callback()
        }
    };
    client.subscribe('#');

    const www = new nodeStatic.Server('./src/www', {
        cache: 0
    });
    const js = new nodeStatic.Server('./dist/www', {
        cache: 0
    });

    http.createServer(async function (req, rsp) {
        if (req.url === '/') {
            req.url = '/index.html';
            www.serve(req, rsp);
        }
        else if (req.url?.startsWith('/sql?')) {
            try {
                rsp.setHeader("Content-Type", "application/json");
                rsp.write(JSON.stringify(await db.all(decodeURIComponent(req.url.slice(5)))));    
            } catch (ex: any) {
                rsp.setHeader("Content-Type", "application/json");
                rsp.statusCode = 500;
                rsp.write(JSON.stringify({message: ex.message,...ex}));
            } finally {
                rsp.end();
            }
        } 
        else if (req.url?.startsWith('/data?')) {
            try {
                rsp.setHeader("Content-Type", "application/json");
                rsp.write(JSON.stringify(await dataApi(db, JSON.parse(decodeURIComponent(req.url.slice(6))))));    
            } catch (ex: any) {
                rsp.setHeader("Content-Type", "application/json");
                rsp.statusCode = 500;
                rsp.write(JSON.stringify({message: ex.message,...ex}));
            } finally {
                rsp.end();
            }
        }else if (req.url?.endsWith('.js'))
            js.serve(req, rsp);
        else
            www.serve(req, rsp);
    }).listen(8088);

    while (1) {
        await sleep(5);
        process.stdout.write("History: " + await db.count() + "              \r");
    }
})();

