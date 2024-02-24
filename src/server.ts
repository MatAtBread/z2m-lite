import http from 'http';
import nodeStatic from 'node-static';

import { handleApi, dataApi } from './lib/handleApi';

import { startMqttServer } from './aedes';
import { createWsMqttBridge } from './lib/ws-mqtt';
import { DataQuery } from './data-api';

export interface MqttLog {
    msts: number
    topic: string
    payload: unknown 
}

const www = new nodeStatic.Server('./src/www', { cache: 0 });
const compiledTs = new nodeStatic.Server('./dist/www', { cache: 0 });
const dataQuery = dataApi();
export const httpServer = http.createServer(async function (req, rsp) {
    if (req.url === '/') {
        req.url = '/index.html';
        www.serve(req, rsp);
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
    www.serve(req, rsp);
}).listen(8088);

startMqttServer();
dataQuery.then(api => createWsMqttBridge(httpServer, api));
