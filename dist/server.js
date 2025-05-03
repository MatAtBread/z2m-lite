"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const node_static_1 = __importDefault(require("node-static"));
const handleApi_1 = require("./lib/handleApi");
const aedes_1 = require("./aedes");
const ws_mqtt_1 = require("./lib/ws-mqtt");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const rules_1 = require("./rules");
const www = new node_static_1.default.Server('./src/www', { cache: 0 });
const compiledTs = new node_static_1.default.Server('./dist/www', { cache: 0 });
const rulesStatc = new node_static_1.default.Server('.', { cache: 0 });
const dataQuery = (0, handleApi_1.dataApi)();
const requestHandler = async function (req, rsp) {
    try {
        if (req.url === '/') {
            req.url = '/index.html';
            www.serve(req, rsp);
            return;
        }
        if (req.url?.startsWith('/rules/')) {
            if (req.url === '/rules/') {
                rsp.writeHead(200, { 'Content-Type': 'application/json' });
                rsp.write(JSON.stringify({ rules: (0, rules_1.getRules)() }));
                rsp.end();
            }
            else {
                if (req.method === 'PUT') {
                    let body = '';
                    req.on('data', chunk => {
                        body += chunk.toString();
                    });
                    req.on('end', () => {
                        const rule = body.toString();
                        try {
                            if (req.url) {
                                rsp.writeHead(200, { 'Content-Type': 'application/json' });
                                rsp.write(JSON.stringify({ rules: (0, rules_1.saveRule)(req.url.split('/')[2], rule) }));
                                rsp.end();
                            }
                            else {
                                rsp.writeHead(400, { 'Content-Type': 'application/json' });
                                rsp.write(JSON.stringify({ error: 'Invalid rule' }));
                                rsp.end();
                            }
                        }
                        catch (ex) {
                            rsp.writeHead(500, { 'Content-Type': 'application/json' });
                            rsp.write(JSON.stringify({ error: ex.message }));
                            rsp.end();
                        }
                    });
                }
                else {
                    rulesStatc.serve(req, rsp);
                }
            }
            return;
        }
        if (req.url === '/control/loadRules') {
            rsp.writeHead(200, { 'Content-Type': 'application/json' });
            rsp.write(JSON.stringify({ rules: (0, rules_1.loadRules)() }));
            rsp.end();
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
        if (req.url?.endsWith('.js')) {
            if ((0, fs_1.existsSync)(path_1.default.join(__dirname, '..', 'src', 'www', req.url)))
                www.serve(req, rsp);
            else
                compiledTs.serve(req, rsp);
            return;
        }
        www.serve(req, rsp);
    }
    catch (ex) {
        rsp.statusCode = 500;
        rsp.write(ex?.toString());
        rsp.end();
    }
};
const httpServer = http_1.default.createServer(requestHandler).listen(8088, () => console.log("HTTP Listening on: http://localhost:8088"));
const mqttUrlIdx = process.argv.indexOf("--mqtt");
if (mqttUrlIdx === -1)
    (0, aedes_1.startMqttServer)();
dataQuery.then(api => (0, ws_mqtt_1.createWsMqttBridge)(mqttUrlIdx >= 0 ? process.argv[mqttUrlIdx + 1] : "localhost", httpServer, api));
