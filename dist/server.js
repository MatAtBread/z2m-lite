"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpServer = void 0;
const http_1 = __importDefault(require("http"));
const node_static_1 = __importDefault(require("node-static"));
const handleApi_1 = require("./lib/handleApi");
const aedes_1 = require("./aedes");
const ws_mqtt_1 = require("./lib/ws-mqtt");
const www = new node_static_1.default.Server('./src/www', { cache: 0 });
const compiledTs = new node_static_1.default.Server('./dist/www', { cache: 0 });
const dataQuery = (0, handleApi_1.dataApi)();
exports.httpServer = http_1.default.createServer(async function (req, rsp) {
    if (req.url === '/') {
        req.url = '/index.html';
        www.serve(req, rsp);
        return;
    }
    if (req.url?.startsWith('/data/')) {
        const [path, search] = req.url.split('?');
        const dq = {
            q: path.split('/')[2],
            ...JSON.parse(decodeURIComponent(search))
        };
        (0, handleApi_1.handleApi)(rsp, () => dataQuery.then(fn => fn(dq)));
        return;
    }
    if (req.url?.endsWith('.ts')) {
        req.url = req.url.replace(/\.ts$/, '.js');
        compiledTs.serve(req, rsp);
        return;
    }
    www.serve(req, rsp);
}).listen(8088);
(0, aedes_1.startMqttServer)();
dataQuery.then(api => (0, ws_mqtt_1.createWsMqttBridge)(exports.httpServer, api));
