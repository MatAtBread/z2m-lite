import { Server } from 'http';
import MQTT, { OnMessageCallback } from 'mqtt';
import WebSocket from 'ws';
import { InsertRecord } from '../data-api';
import { runRules } from '../rules';
import path from 'path';
import fs from 'fs';

const blockedTopics = [
  "glow/4C11AEAE140C/STATE",
  "zigbee2mqtt/bridge/extensions",
  "zigbee2mqtt/bridge/groups",
  "zigbee2mqtt/bridge/info",
  "zigbee2mqtt/bridge/logging",
  "zigbee2mqtt/bridge/state",
];

const stateFile = path.join(__dirname, '..', '..', 'state.json');

export type State = { [topic: string]: object };
const retained:State = Object.create(null);
const topicState:State = Object.create(null);

try {
  const s = require(stateFile);
  Object.assign(topicState, s);
} catch (ex) {
  // No initial state
}

let lastSave = 0;
const savePeriod = 10000; // 10 seconds
function saveState() {
  if (lastSave < Date.now() - savePeriod) {
    fs.writeFileSync(stateFile, JSON.stringify(topicState, null, 2));
    lastSave = Date.now();
  } else {
    setTimeout(saveState, savePeriod);
  }
}

const clientId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
export function createWsMqttBridge(mqttUrl: string, httpServer: Server, index: (r: InsertRecord) => (undefined | Promise<void>)) {
  if (mqttUrl.indexOf(":") < 0) mqttUrl += ":1883";

  const mqttClient = MQTT.connect("tcp://" + mqttUrl, { clientId });
  mqttClient.on('message', async (topic, message, packet) => {
    try {
      const payloadStr = message.toString();
      const payload = JSON.parse(payloadStr);
      topicState[topic] = payload;
      if (packet.retain || topic.startsWith('zigbee2mqtt/'))
        retained[topic] = payload;
      saveState();
      if (typeof payload === 'object') {
        if (!blockedTopics.includes(topic))
          await index({ q: 'insert', msts: Date.now(), topic: packet.topic, payload });

        await runRules(topic, topicState, (name:string) => (pub: string, payload: object) => {
          console.log("Automation:", name, pub, payload);
          mqttClient.publish(pub, JSON.stringify(payload), { });
        });
      } else {
        console.log("Not storing non-object MQTT payload", topic, payloadStr);
      }
    } catch (err) {
      console.warn("MqttLog: ", err);
    }
  });
  mqttClient.subscribe('#');
  const wsServer = new WebSocket.Server({ server: httpServer });
  wsServer.on('connection', (ws) => {
    const handle: OnMessageCallback = (topic, msg) => {
      try {
        const payload = JSON.parse(msg.toString());
        if (typeof payload === 'object') {
          ws.send(JSON.stringify({ topic, payload }));
        } else {
          console.log("Not storing non-object ES payload", topic, msg.toString());
        }
      } catch (ex) {
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