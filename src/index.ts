import sqlite3 from 'sqlite3'
import http from 'http';
import nodeStatic from 'node-static';
import MQTT, { OnMessageCallback } from 'mqtt';
import WebSocket from 'ws';

import { NoSqlite } from './nosqlite';

function sleep(seconds: number) {
    return new Promise(r => setTimeout(r, seconds * 1000));
}

async function dataApi<Doc extends {}, Q extends DataQuery>(db: NoSqlite<Doc>, query: Q): Promise<DataResult<Q> | undefined> {
    if (query.q === 'stored_topics') {
        const retained = await db.all('select _source from data where rowid in (SELECT rowid from (select rowid,max(msts),topic from DATA where msts > $since group by topic))',{
            $since: query.since
        });
        return retained.map(row => JSON.parse(row._source)) as DataResult<Q>;
    } else if (query.q === 'series') {
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
    } else if (query.q === 'topics') {
        return db.all('select distinct topic from data where $match is NULL OR topic like $match',{
            $match: query.match
        }) as Promise<DataResult<Q>>;
    }
}

require('./aedes');
(async function () {
    const db = new NoSqlite<{ msts: number, topic: string, payload: any }>({
        //filename: ':memory:',
        filename: './mqtt.db',
        driver: sqlite3.Database
    });
    
    const mqttClient = MQTT.connect("tcp://house.mailed.me.uk:1883", {
        clientId: Math.random().toString(36)
    });
    const retained: { [topic: string]: string} = {};
    mqttClient.on('message',async (topic, payload, packet) => {
        try {
            const payload = packet.payload.toString();
            if (packet.retain || topic.startsWith('zigbee2mqtt/')) {
                console.log(topic, packet.retain ? "RETAIN":"");
                retained[topic] = payload;
            }
            await db.index({ msts: Date.now(), topic: packet.topic, payload: JSON.parse(payload) });
        } catch (err) {
            console.warn("\n", err);
        }
    });
    //mqttClient.subscribe('bridge/devices');
    mqttClient.subscribe('#');

    const www = new nodeStatic.Server('./src/www', {
        cache: 0
    });
    const js = new nodeStatic.Server('./dist/www', {
        cache: 0
    });

    const httpServer = http.createServer(async function (req, rsp) {
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

    const wsServer = new WebSocket.Server({server: httpServer });
    wsServer.on('connection',(ws) => {
        const handle: OnMessageCallback = (topic, _payload, packet) => {
            const payload = packet.payload.toString();
            if (payload?.[0] === '{') {
                ws.send(JSON.stringify({ topic, payload: JSON.parse(payload)}));
            }
        };
        mqttClient.on('message', handle);
        ws.on('close',() => mqttClient.removeListener('message', handle));
        ws.on('message', (message) => {
            const { topic, payload } = JSON.parse(message.toString());
            //console.log("WS->MQTT",{ topic, payload });
            mqttClient.publish(topic, JSON.stringify(payload));
        })
        for (const [topic, payload] of Object.entries(retained)) {
            ws.send(JSON.stringify({ topic, payload: JSON.parse(payload) }));
        }
    });
    /*while (1) {
        await sleep(5);
        process.stdout.write("History: " + await db.count() + "              \r");
    }*/
})();

