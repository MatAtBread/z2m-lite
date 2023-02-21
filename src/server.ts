import http from 'http';
import nodeStatic from 'node-static';

import { handleApi, dataApi } from './lib/handleApi';

import { startMqttServer } from './aedes';
import { createWsMqttBridge } from './lib/ws-mqtt';
import { ESClient } from './lib/es';

export interface MqttLog {
    msts: number
    topic: string
    payload: unknown 
}

const www = new nodeStatic.Server('./src/www', { cache: 0 });
const compiledTs = new nodeStatic.Server('./dist/www', { cache: 0 });
const es = ESClient({ node: 'http://house.mailed.me.uk:9200' });
const dataQuery = dataApi(es);
export const httpServer = http.createServer(async function (req, rsp) {
    if (req.url === '/') {
        req.url = '/index.html';
        www.serve(req, rsp);
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
