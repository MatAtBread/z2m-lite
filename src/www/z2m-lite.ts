/// <reference path="./vendor.ts"/>

import { dataApi } from "./HistoryChart.js";
import { WsMqttConnection } from "./WsMqttConnection.js";
import { Glow } from "./glow-devices.js";
import type { GlowSensorGas, GlowSensorElectricity, DeviceAvailability, Device, BridgeDevices, Z2Message } from "./message-types.js";
import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
import { BaseDevice, ZigbeeDevice, zigbeeDeviceModels } from "./zdevices.js";

function isGlowSensor(topic: string, payload: any): payload is GlowSensorGas["payload"] | GlowSensorElectricity["payload"] {
  return !!topic.match(/glow\/.*\/SENSOR\/(gasmeter|electricitymeter)/) && payload;
}

function isDeviceAvailability (topic:string, payload: any): payload is DeviceAvailability["payload"] {
  return !!topic.match(/zigbee2mqtt\/.*\/availability/) && payload;
}

const { div, button, table } = tag();

window.onload = async () => {
  Chart.defaults.font.size = 20;
  Chart.defaults.color = '#fff';


  const ZigbeeCoordinator = div.extended({
    styles:`.ZigbeeCoordinator {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      text-align: center;
    }
    .ZigbeeCoordinator button {
      width: 60%;
    }`,
    override:{
      className: 'ZigbeeCoordinator',
    },
    constructed() {
      return fetch("/z2mhost")
        .then(res => res.text() ||  window.location.host)
        .catch(_ => window.location.host)
        .then(host => button({
          onclick:() => window.open('http://' + host + '/', 'manager')
        },'Manage devices'))
    }
  });

  function addZigbeeDevice(device: Device) {
    if (devices.ids['zigbee2mqtt/'+device.friendly_name])
      return;
    const controls = zigbeeDeviceModels[device.friendly_name as keyof typeof zigbeeDeviceModels]
    ?? zigbeeDeviceModels[device.definition?.model as keyof typeof zigbeeDeviceModels]
    ?? ZigbeeDevice;
    devices.append(controls({ device, mqtt }));
    devices.sort();
  }

  const devices = table.extended({
    styles: `.Devices {
      margin-bottom: 3em;
      width: 100%;
    }`,
    ids: {} as { [friendly_name: string]: typeof BaseDevice },
    override:{
      className: 'Devices'
    },
    declare:{
      sort() {
        this.append(...[...this.children].sort((a, b) => a.id.localeCompare(b.id)));
      }
    }
  })();
  
  const mqtt = new WsMqttConnection(window.location.host,async m => {
    parseTopicMessage(JSON.parse(m.data));
  });

  dataApi({ q: 'latest', topic: 'zigbee2mqtt/bridge/devices' }).then(
    res => (res.payload as BridgeDevices["payload"])
      .map(x => addZigbeeDevice(x)));

  document.body.append(
    ZigbeeCoordinator(),
    devices
  );

  const retained = await dataApi({q:'stored_topics', since: Date.now() - 86400000});
  if (retained) {
    for (const message of retained) {
      parseTopicMessage(message as Z2Message)
    }
  }

  function parseTopicMessage({topic,payload}:Z2Message) {
    const subTopic = topic.split('/');
    if (topic === 'zigbee2mqtt/bridge/devices') {
      // Merge in the retained devices
      for (const d of payload) {
        const devID = 'zigbee2mqtt/' + d.friendly_name;
        if (!devices.ids[devID])
          addZigbeeDevice(d);
        devices.ids[devID].device = d;
      }
    } else if (topic === 'zigbee2mqtt/bridge/state') {
      switch (payload.state) {
        case 'offline':
          mqtt.promptReconnect();
          break;
        case 'online':
          mqtt.reconnected();
          break;
        default:
          console.log("BRIDGE MESSAGE", topic, payload);
          break;
      }
    } else if (topic === 'zigbee2mqtt/bridge/logging') {
      if (payload.level === 'warn' || payload.level === 'error') {
        // logMessage(payload.message);
      }
    } else if (topic === 'zigbee2mqtt/bridge/log') {
    } else if (topic === 'zigbee2mqtt/bridge/config') {
    } else if (topic === 'zigbee2mqtt/bridge/info') {
    } else if (subTopic[0] === 'zigbee2mqtt' && typeof payload === 'object' && payload) {
      const devID = subTopic[0] + '/' + subTopic[1];
      if (devices.ids[devID]) {
        if (isDeviceAvailability(topic,payload)) 
        devices.ids[devID].style.opacity = payload.state === 'online' ? "":"0.5";
      else if (subTopic[2] !== 'set') {
        devices.ids[devID].payload = Object.fromEntries([
          ...Object.entries(devices.ids[devID].payload.valueOf()),
          ...Object.entries(payload)
        ]);
      }
      }
    } else if (isGlowSensor(topic,payload)) {
      if (!devices.ids[topic] && (subTopic[3] in Glow)) {
        devices.append(Glow[subTopic[3] as keyof typeof Glow]({ id: topic, payload: payload as any }));
        devices.sort();
      } else {
        // @ts-ignore: fix typing
        devices.ids[topic].payload = payload;
        // devices.ids[topic].payload = Object.fromEntries([
        //   ...Object.entries(devices.ids[topic].payload.valueOf()),
        //   ...Object.entries(payload)
        // ]);
      }
    } else {
      console.log("Other message:",topic, payload);
    }
  }
}


