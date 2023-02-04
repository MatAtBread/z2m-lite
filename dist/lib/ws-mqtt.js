"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWsMqttBridge = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const ws_1 = __importDefault(require("ws"));
const blockedTopics = [
    "glow/4C11AEAE140C/STATE",
    "zigbee2mqtt/bridge/extensions",
    "zigbee2mqtt/bridge/groups",
    "zigbee2mqtt/bridge/info",
    "zigbee2mqtt/bridge/logging",
    "zigbee2mqtt/bridge/state",
];
function createWsMqttBridge(httpServer, index) {
    const retained = {};
    const mqttClient = mqtt_1.default.connect("tcp://house.mailed.me.uk:1883", {
        clientId: Math.random().toString(36)
    });
    mqttClient.on('message', async (topic, payload, packet) => {
        try {
            const payloadStr = payload.toString();
            if (packet.retain || topic.startsWith('zigbee2mqtt/')) {
                retained[topic] = payloadStr;
            }
            if (!blockedTopics.includes(topic))
                await index({ q: 'insert', topic: packet.topic, payload: JSON.parse(payloadStr) });
        }
        catch (err) {
            console.warn("MqttLog: ", err);
        }
    });
    mqttClient.subscribe('#');
    const wsServer = new ws_1.default.Server({ server: httpServer });
    wsServer.on('connection', (ws) => {
        const handle = (topic, payload) => {
            try {
                ws.send(JSON.stringify({ topic, payload: JSON.parse(payload.toString()) }));
            }
            catch (ex) {
                console.warn("Non-JSON payload: ", payload.toString(), ex);
            }
        };
        mqttClient.on('message', handle);
        ws.on('close', () => mqttClient.removeListener('message', handle));
        ws.on('message', (message) => {
            const { topic, payload } = JSON.parse(message.toString());
            mqttClient.publish(topic, JSON.stringify(payload));
        });
        for (const [topic, payload] of Object.entries(retained)) {
            ws.send(JSON.stringify({ topic, payload: JSON.parse(payload) }));
        }
    });
}
exports.createWsMqttBridge = createWsMqttBridge;
