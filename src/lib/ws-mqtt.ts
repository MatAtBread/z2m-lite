import { Server } from 'http';
import MQTT, { OnMessageCallback } from 'mqtt';
import WebSocket from 'ws';
import { DeleteTopicQuery, InsertRecord } from '../data-api';
import { initializeRules, runRules } from '../rules';
import path from 'path';
import fs from 'fs';

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
function saveState(force: boolean = false) {
  if (force || lastSave < Date.now() - savePeriod) {
    fs.writeFileSync(stateFile, JSON.stringify(topicState, null, 2));
    lastSave = Date.now();
  } else {
    setTimeout(saveState, savePeriod);
  }
}

const clientId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
export function createWsMqttBridge(mqttUrl: string, httpServers: Server[], index: (r: InsertRecord | DeleteTopicQuery) => (undefined | Promise<void>)) {
  if (mqttUrl.indexOf(":") < 0) mqttUrl += ":1883";

  const mqttClient = MQTT.connect("tcp://" + mqttUrl, { clientId });
  const onMqttMessage = async (topic: string, message: Buffer | string, packet: Pick<MQTT.IPublishPacket, 'retain' | 'topic'>) => {
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

        await runRules(topic);
      }
    } catch (err) {
      console.warn("MqttLog: ", err);
    }
  };

  const wsClients = new Set<WebSocket>();
  mqttClient.on('message', onMqttMessage);
  initializeRules(topicState, (name: string) => (pub: string, payload: object) => {
    console.log("Automation:", name, pub, payload);
    mqttClient.publish(pub, JSON.stringify(payload), {});
  }, (topic: string, payload: object) => {
      const echo = JSON.stringify({ topic, payload });
      for (const ws of wsClients) {
        ws.send(echo);
      }
    }
  );
  mqttClient.subscribe('#');

  const wsConnect = (ws: WebSocket) => {
    wsClients.add(ws);
    const handle: OnMessageCallback = (topic, msg, packet) => {
      try {
        const payload = msg.length ? JSON.parse(msg.toString()) : undefined;
        if (typeof payload === 'object') {
          ws.send(JSON.stringify({ topic, payload }));
        }
      } catch (ex) {
        console.warn("Non-JSON payload: ", topic, msg, ex);
      }
    };
    mqttClient.on('message', handle);
    ws.on('close', () => { wsClients.delete(ws); mqttClient.removeListener('message', handle); });
    ws.on('message', (message) => {
      let { topic, payload, retain } = JSON.parse(message.toString());
      const payloadStr = payload === null ? '' : JSON.stringify(payload);
      if (!payload) retain = false;
      mqttClient.publish(topic, payloadStr, { retain });
      // Since we don't receive our own messages, we need to handle them as if we did
      onMqttMessage(topic, payloadStr, { retain, topic });
    });
    for (const [topic, payload] of Object.entries(retained)) {
      ws.send(JSON.stringify({ topic, payload }));
    }
  }
  for (const httpServer of httpServers) {
    if (httpServer) {
      const wsServer = new WebSocket.Server({ server: httpServer });
      wsServer.on('connection', wsConnect);
    }
  }
}