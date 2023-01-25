"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpServer = exports.db = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const http_1 = __importDefault(require("http"));
const node_static_1 = __importDefault(require("node-static"));
const nosqlite_1 = require("./lib/nosqlite");
const handleApi_1 = require("./lib/handleApi");
const aedes_1 = require("./aedes");
const ws_mqtt_1 = require("./lib/ws-mqtt");
exports.db = new nosqlite_1.NoSqlite({
    filename: './mqtt.db',
    driver: sqlite3_1.default.Database
}, {
    msts: 0,
    topic: ''
});
const www = new node_static_1.default.Server('./src/www', { cache: 0 });
const compiledTs = new node_static_1.default.Server('./dist/www', { cache: 0 });
exports.httpServer = http_1.default.createServer(async function (req, rsp) {
    if (req.url === '/') {
        req.url = '/index.html';
        www.serve(req, rsp);
        return;
    }
    if (req.url?.startsWith('/sql?')) {
        (0, handleApi_1.handleApi)(rsp, () => exports.db.all(decodeURIComponent(req.url.slice(5))));
        return;
    }
    if (req.url?.startsWith('/data?')) {
        (0, handleApi_1.handleApi)(rsp, () => (0, handleApi_1.dataApi)(exports.db, JSON.parse(decodeURIComponent(req.url.slice(6)))));
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
(0, ws_mqtt_1.createWsMqttBridge)(exports.httpServer, exports.db);
class DBMap {
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
