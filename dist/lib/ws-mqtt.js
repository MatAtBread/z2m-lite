"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWsMqttBridge = createWsMqttBridge;
const mqtt_1 = __importDefault(require("mqtt"));
const ws_1 = __importDefault(require("ws"));
const rules_1 = require("../rules");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const blockedTopics = [
    "glow/4C11AEAE140C/STATE",
    "zigbee2mqtt/bridge/extensions",
    "zigbee2mqtt/bridge/groups",
    "zigbee2mqtt/bridge/info",
    "zigbee2mqtt/bridge/logging",
    "zigbee2mqtt/bridge/state",
];
const stateFile = path_1.default.join(__dirname, '..', '..', 'state.json');
const retained = Object.create(null);
try {
    const s = require(stateFile);
    Object.assign(retained, s);
}
catch (ex) {
    // No initial state
}
let dirtyState = false;
setInterval(() => {
    if (dirtyState)
        fs_1.default.writeFileSync(stateFile, JSON.stringify(retained, null, 2));
    dirtyState = false;
}, 10000);
const clientId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
function createWsMqttBridge(mqttUrl, httpServer, index) {
    if (mqttUrl.indexOf(":") < 0)
        mqttUrl += ":1883";
    const mqttClient = mqtt_1.default.connect("tcp://" + mqttUrl, { clientId });
    mqttClient.on('message', async (topic, message, packet) => {
        try {
            const payloadStr = message.toString();
            const payload = JSON.parse(payloadStr);
            if (packet.retain || topic.startsWith('zigbee2mqtt/')) {
                retained[topic] = payload;
                dirtyState = true;
            }
            if (typeof payload === 'object') {
                if (!blockedTopics.includes(topic))
                    await index({ q: 'insert', msts: Date.now(), topic: packet.topic, payload });
                await (0, rules_1.runRules)(topic, retained, (name) => (pub, payload) => {
                    console.log("Automation:", name, pub, payload);
                    mqttClient.publish(pub, JSON.stringify(payload), { retain: true });
                });
            }
            else {
                console.log("Not storing non-object MQTT payload", topic, payloadStr);
            }
        }
        catch (err) {
            console.warn("MqttLog: ", err);
        }
    });
    mqttClient.subscribe('#');
    const wsServer = new ws_1.default.Server({ server: httpServer });
    wsServer.on('connection', (ws) => {
        const handle = (topic, msg) => {
            try {
                const payload = JSON.parse(msg.toString());
                if (typeof payload === 'object') {
                    ws.send(JSON.stringify({ topic, payload }));
                }
                else {
                    console.log("Not storing non-object ES payload", topic, msg.toString());
                }
            }
            catch (ex) {
                console.warn("Non-JSON payload: ", topic, msg.toString(), ex);
            }
        };
        mqttClient.on('message', handle);
        ws.on('close', () => mqttClient.removeListener('message', handle));
        ws.on('message', (message) => {
            const { topic, payload } = JSON.parse(message.toString());
            mqttClient.publish(topic, JSON.stringify(payload));
        });
        for (const [topic, payload] of Object.entries(retained)) {
            ws.send(JSON.stringify({ topic, payload }));
        }
    });
}
