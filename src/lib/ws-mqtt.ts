import { Server } from 'http';
import MQTT, { OnMessageCallback } from 'mqtt';
import WebSocket from 'ws';
import { NoSqlite } from './nosqlite';

export function createWsMqttBridge(httpServer: Server, db: NoSqlite<{ msts: number, topic: string, payload: unknown}>) {
const retained: { [topic: string]: string; } = {};
const mqttClient = MQTT.connect("tcp://house.mailed.me.uk:1883", {
    clientId: Math.random().toString(36)
});
mqttClient.on('message', async (topic, payload, packet) => {
    try {
        const payloadStr = payload.toString();
        if (packet.retain || topic.startsWith('zigbee2mqtt/')) {
            retained[topic] = payloadStr;
        }
        await db.index({ msts: Date.now(), topic: packet.topic, payload: JSON.parse(payloadStr) });
    } catch (err) {
        console.warn("\n", err);
    }
});
mqttClient.subscribe('#');
const wsServer = new WebSocket.Server({ server: httpServer });
wsServer.on('connection', (ws) => {
    const handle: OnMessageCallback = (topic, payload) => {
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