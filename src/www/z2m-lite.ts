import type { GlowSensorElectricity, GlowSensorGas, BridgeDevices, Z2Message, DeviceAvailability } from "./MqttMessages";

import { UIDevice } from "./UIDevice.js";
import { dataApi, e, notUndefined, ui } from "./utils.js";
import { WsMqttConnection } from "./wsmqtt.js";
import { UIZigbee2mqttDevice, ZigbeeCoordinator, zigbeeDeviceModels } from "./zigbeeDevices.js";
import { Glow } from "./glowDevices.js";

function isDeviceAvailability(topic: string, payload: Z2Message["payload"]): payload is DeviceAvailability["payload"] {
  return !!topic.match(/zigbee2mqtt\/.*\/availability/) && notUndefined(payload);
}
function isGlowSensor(topic: string, payload: Z2Message["payload"]): payload is GlowSensorGas["payload"] | GlowSensorElectricity["payload"] {
  return !!topic.match(/glow\/.*\/SENSOR\/(gasmeter|electricitymeter)/) && notUndefined(payload);
}

const div = e('div');

function logMessage(message: string) {
  const log = div(message);
  ui('log')?.append(log);
  setTimeout(() => log.remove(), 15000);
}

window.onload = async () => {
  Chart.defaults.font.size = 20;
  Chart.defaults.color = '#fff';

  fetch("/z2mhost")
    .then(res => res.text() || window.location.host)
    .catch(_ => window.location.host)
    .then(host => new ZigbeeCoordinator(host));

  const bridgeDevices = await dataApi({ q: 'latest', topic: 'zigbee2mqtt/bridge/devices' }).then(
    res => Object.fromEntries(((res?.payload as BridgeDevices["payload"]).map(x => [x.friendly_name, x])) ?? {})
  );

  const mqtt = new WsMqttConnection(window.location.host, ui('reconnect')!, async m => {
    parseTopicMessage(JSON.parse(m.data));
  });

  const retained = await dataApi({ q: 'stored_topics', since: Date.now() - 86400000 });
  if (retained) {
    for (const message of retained) {
      parseTopicMessage(message as Z2Message)
    }
  }

  function parseTopicMessage({ topic, payload }: Z2Message) {
    const subTopic = topic.split('/');
    if (topic === 'zigbee2mqtt/bridge/devices') {
      // Merge in the retained devices
      for (const d of payload) {
        if (d.friendly_name in bridgeDevices) {
          // Deep merge?
          Object.assign(bridgeDevices[d.friendly_name], d);
        } else {
          bridgeDevices[d.friendly_name] = d;
        }
      }
    } else if (topic === 'zigbee2mqtt/bridge/state') {
      switch (payload.state) {
        case 'offline':
          mqtt.promptReconnect();
          break;
        case 'online':
          ui('reconnect')!.style.display = 'none';
          break;
        default:
          console.log("BRIDGE MESSAGE", topic, payload);
          break;
      }
    } else if (topic === 'zigbee2mqtt/bridge/logging') {
      if (payload.level === 'warn' || payload.level === 'error') {
        logMessage(payload.message);
      }
    } else if (topic === 'zigbee2mqtt/bridge/log') {
    } else if (topic === 'zigbee2mqtt/bridge/config') {
    } else if (topic === 'zigbee2mqtt/bridge/info') {
    } else if (subTopic[0] === 'zigbee2mqtt' && typeof payload === 'object' && payload) {
      const descriptor = bridgeDevices[subTopic[1]];
      if (descriptor) {
        let uiDev = UIDevice.devices.get('zigbee2mqtt/' + descriptor.friendly_name);
        if (!uiDev) {
          const model = String(descriptor.definition?.model) as keyof typeof zigbeeDeviceModels;
          const uiClass = model in zigbeeDeviceModels ? zigbeeDeviceModels[model] : UIZigbee2mqttDevice;
          uiDev = new uiClass(mqtt, descriptor);
        }
        if (isDeviceAvailability(topic, payload))
          uiDev.element.style.opacity = payload.state === 'online' ? "1" : "0.5";
        if (!subTopic[2])
          uiDev.update(payload);
      } else {
        console.warn("No device descriptor for", topic, payload);
      }
    } else if (isGlowSensor(topic, payload)) {
      const uiDev = UIDevice.devices.get(topic) ?? ((subTopic[3] in Glow) && new Glow[subTopic[3] as keyof typeof Glow](topic));
      if (uiDev)
        uiDev.update(payload);
    } else {
      console.log("Other message:", topic, payload);
    }
  }
  // @ts-ignore - just for debugging from the dev console
  window.mqtt = mqtt;
}
