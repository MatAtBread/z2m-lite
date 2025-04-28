import http from 'http';
import nodeStatic from 'node-static';

import { handleApi, dataApi } from './lib/handleApi';

import { startMqttServer } from './aedes';
import { createWsMqttBridge } from './lib/ws-mqtt';
import { DataQuery } from './data-api';
import { existsSync } from 'fs';
import path from 'path';
import { loadRules } from './rules';

export interface MqttLog {
    msts: number
    topic: string
    payload: unknown
}

const www = new nodeStatic.Server('./src/www', { cache: 0 });
const compiledTs = new nodeStatic.Server('./dist/www', { cache: 0 });
const rulesStatc = new nodeStatic.Server('.', { cache: 0 });

const dataQuery = dataApi();
export const httpServer = http.createServer(async function (req, rsp) {
    try {
        if (req.url === '/') {
            req.url = '/index.html';
            www.serve(req, rsp);
            return;
        }
        if (req.url?.startsWith('/rules/')) {
            rulesStatc.serve(req, rsp);
            return;
        }

        if (req.url === '/control/loadRules') {
            rsp.writeHead(200, { 'Content-Type': 'application/json' });
            rsp.write(JSON.stringify({ rules: loadRules() }));
            rsp.end();
            return;
        }
        if (req.url?.startsWith('/data/')) {
            const [path,search] = req.url.split('?');
            const dq:DataQuery = {
                q: path.split('/')[2],
                ...JSON.parse(decodeURIComponent(search))
            };
            handleApi(rsp, () => dataQuery.then(fn => fn(dq)));
            return;
        }
        if (req.url?.endsWith('.ts')) {
            req.url = req.url.replace(/\.ts$/, '.js');
            compiledTs.serve(req, rsp);
            return;
        }
        if (req.url?.endsWith('.js')) {
            if (existsSync(path.join(__dirname, '..', 'src', 'www', req.url)))
                www.serve(req, rsp);
            else
                compiledTs.serve(req, rsp);
            return;
        }
        www.serve(req, rsp);
    } catch (ex) {
        rsp.statusCode = 500;
        rsp.write(ex?.toString());
        rsp.end();
    }
}).listen(8088,() => console.log("HTTP Listening on: http://localhost:8088"));

const mqttUrlIdx = process.argv.indexOf("--mqtt");
if (mqttUrlIdx === -1)
    startMqttServer();
dataQuery.then(api => createWsMqttBridge(mqttUrlIdx >=0 ? process.argv[mqttUrlIdx + 1] : "localhost", httpServer, api));
