import sqlite3 from 'sqlite3';
import http from 'http';
import nodeStatic from 'node-static';
import { existsSync } from 'fs';
import { NoSqlite } from './lib/nosqlite.js';
import { handleApi, dataApi } from './lib/handleApi.js';
import { startMqttServer } from './aedes.js';
import { createWsMqttBridge } from './lib/ws-mqtt.js';
import path from 'path';
export const db = new NoSqlite({
    filename: './mqtt.db',
    driver: sqlite3.Database
});
const mqttLog = db.open("DATA", {
    msts: 0,
    topic: ''
});
const www = new nodeStatic.Server('./src/www', { cache: 0 });
const compiledTs = new nodeStatic.Server('./dist/www', { cache: 0 });
export const httpServer = http.createServer(async function (req, rsp) {
    if (!req.url || req.url?.includes('..')) {
        rsp.statusCode = 404;
        rsp.write('Not found');
        rsp.end();
        return;
    }
    if (req.url === '/') {
        req.url = '/index.html';
        www.serve(req, rsp);
        return;
    }
    if (req.url?.startsWith('/sql?')) {
        handleApi(rsp, () => db.all(decodeURIComponent(req.url.slice(5))));
        return;
    }
    if (req.url?.startsWith('/data?')) {
        handleApi(rsp, () => dataApi(mqttLog, JSON.parse(decodeURIComponent(req.url.slice(6)))));
        return;
    }
    if (existsSync(path.join(compiledTs.root, req.url))) {
        compiledTs.serve(req, rsp);
        return;
    }
    www.serve(req, rsp);
}).listen(8088);
startMqttServer();
createWsMqttBridge(httpServer, mqttLog);
class DBMap {
    cache;
    constructor(name) {
        this.cache = new Promise(resolve => {
            return new Map;
        });
    }
    async get(k) {
        return this.cache.then(m => m.get(k));
    }
    async set(k, v) {
        return this.cache.then(m => m.set(k, v));
    }
}
