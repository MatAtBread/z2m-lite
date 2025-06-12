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
    "zigbee2mqtt/bridge/converters",
    "zigbee2mqtt/bridge/definitions",
    "zigbee2mqtt/bridge/extensions",
    "zigbee2mqtt/bridge/groups",
    "zigbee2mqtt/bridge/info",
    "zigbee2mqtt/bridge/logging",
    "zigbee2mqtt/bridge/state",
];
const stateFile = path_1.default.join(__dirname, '..', '..', 'state.json');
const retained = Object.create(null);
const topicState = Object.create(null);
try {
    const s = require(stateFile);
    Object.assign(topicState, s);
}
catch (ex) {
    // No initial state
}
let lastSave = 0;
const savePeriod = 10000; // 10 seconds
function saveState(force = false) {
    if (force || lastSave < Date.now() - savePeriod) {
        fs_1.default.writeFileSync(stateFile, JSON.stringify(topicState, null, 2));
        lastSave = Date.now();
    }
    else {
        setTimeout(saveState, savePeriod);
    }
}
const clientId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
function createWsMqttBridge(mqttUrl, httpServer, index) {
    if (mqttUrl.indexOf(":") < 0)
        mqttUrl += ":1883";
    const mqttClient = mqtt_1.default.connect("tcp://" + mqttUrl, { clientId });
    const onMqttMessage = async (topic, message, packet) => {
        try {
            const payloadStr = message.toString();
            if (payloadStr.length === 0) {
                console.log("Deleting device:", topic);
                await index({ q: 'delete', topic });
                delete topicState[topic];
                saveState(true);
                console.log("Deleted device:", topic);
                return;
            }
            const payload = JSON.parse(payloadStr);
            topicState[topic] = payload;
            if (packet.retain || topic.startsWith('zigbee2mqtt/'))
                retained[topic] = payload;
            saveState();
            if (typeof payload === 'object') {
                if (!blockedTopics.includes(topic))
                    await index({ q: 'insert', msts: Date.now(), topic: packet.topic, payload });
                await (0, rules_1.runRules)(topic);
            }
        }
        catch (err) {
            console.warn("MqttLog: ", err);
        }
    };
    mqttClient.on('message', onMqttMessage);
    (0, rules_1.initializeRules)(topicState, (name) => (pub, payload) => {
        console.log("Automation:", name, pub, payload);
        mqttClient.publish(pub, JSON.stringify(payload), {});
    });
    mqttClient.subscribe('#');
    const wsServer = new ws_1.default.Server({ server: httpServer });
    wsServer.on('connection', (ws) => {
        const handle = (topic, msg, packet) => {
            try {
                const payload = msg.length ? JSON.parse(msg.toString()) : undefined;
                if (typeof payload === 'object') {
                    ws.send(JSON.stringify({ topic, payload }));
                }
            }
            catch (ex) {
                console.warn("Non-JSON payload: ", topic, msg, ex);
            }
        };
        mqttClient.on('message', handle);
        ws.on('close', () => mqttClient.removeListener('message', handle));
        ws.on('message', (message) => {
            let { topic, payload, retain } = JSON.parse(message.toString());
            const payloadStr = payload === null ? '' : JSON.stringify(payload);
            if (!payload)
                retain = false;
            mqttClient.publish(topic, payloadStr, { retain });
            // Since we don't receive our own messages, we need to handle them as if we did
            onMqttMessage(topic, payloadStr, { retain, topic });
        });
        for (const [topic, payload] of Object.entries(retained)) {
            ws.send(JSON.stringify({ topic, payload }));
        }
    });
}
