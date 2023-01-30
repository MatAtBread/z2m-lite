import MQTT from 'mqtt';
import * as WebSocket from 'ws';
const blockedTopics = [
    "glow/4C11AEAE140C/STATE",
    "zigbee2mqtt/bridge/extensions",
    "zigbee2mqtt/bridge/groups",
    "zigbee2mqtt/bridge/info",
    "zigbee2mqtt/bridge/logging",
    "zigbee2mqtt/bridge/state",
];
export function createWsMqttBridge(httpServer, db) {
    const retained = {};
    const mqttClient = MQTT.connect("tcp://house.mailed.me.uk:1883", {
        clientId: Math.random().toString(36)
    });
    mqttClient.on('message', async (topic, payload, packet) => {
        try {
            const payloadStr = payload.toString();
            if (packet.retain || topic.startsWith('zigbee2mqtt/')) {
                retained[topic] = payloadStr;
            }
            if (!blockedTopics.includes(topic))
                await db.index({ msts: Date.now(), topic: packet.topic, payload: JSON.parse(payloadStr) });
        }
        catch (err) {
            console.warn("MqttLog: ", err);
        }
    });
    mqttClient.subscribe('#');
    const wsServer = new WebSocket.WebSocketServer({ server: httpServer });
    wsServer.on('connection', (ws) => {
        const handle = (topic, payload) => {
            ws.send(JSON.stringify({ topic, payload: JSON.parse(payload.toString()) }));
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
