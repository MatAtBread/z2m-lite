import sqlite3 from 'sqlite3'
import http from 'http';
import nodeStatic from 'node-static';

import { NoSqlite } from './lib/nosqlite';
import { handleApi, dataApi } from './lib/handleApi';

import { startMqttServer } from './aedes';
import { createWsMqttBridge } from './lib/ws-mqtt';

export interface MqttLog {
    msts: number
    topic: string
    payload: unknown 
}

export const db = new NoSqlite({
    filename: './mqtt.db',
    driver: sqlite3.Database
});

const mqttLog = db.open("DATA", <MqttLog>{
    msts: 0,
    topic: ''
})

const www = new nodeStatic.Server('./src/www', { cache: 0 });
const compiledTs = new nodeStatic.Server('./dist/www', { cache: 0 });

const dataQuery = dataApi(mqttLog);
export const httpServer = http.createServer(async function (req, rsp) {
    if (req.url === '/') {
        req.url = '/index.html';
        www.serve(req, rsp);
        return;
    }
    if (req.url?.startsWith('/sql?')) {
        handleApi(rsp, () => db.all(decodeURIComponent(req.url!.slice(5))));
        return;
    }
    if (req.url?.startsWith('/data?')) {
        handleApi(rsp, () => dataQuery.then(fn => fn(JSON.parse(decodeURIComponent(req.url!.slice(6))))));
        return;
    }
    if (req.url?.endsWith('.ts')) {
        req.url = req.url.replace(/\.ts$/, '.js');
        compiledTs.serve(req, rsp);
        return;
    }
    www.serve(req, rsp);
}).listen(8088);

startMqttServer();
dataQuery.then(api => createWsMqttBridge(httpServer, api));
