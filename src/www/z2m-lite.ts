/// <reference path="./vendor.ts"/>

import { text } from "stream/consumers";
import { FreeHouseModels } from "./FreeHouseDevices.js";
import { dataApi } from "./HistoryChart.js";
import { WsMqttConnection } from "./WsMqttConnection.js";
import { Glow } from "./glow-devices.js";
import type { GlowSensorGas, GlowSensorElectricity, DeviceAvailability, Device, BridgeDevices, Z2Message, FreeHouseDeviceMessage, FreeHouseHubMessage } from "./message-types.js";
import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
import { BaseDevice, ZigbeeDevice, zigbeeDeviceModels } from "./zdevices.js";

function isGlowSensor(topic: string, payload: any): payload is GlowSensorGas["payload"] | GlowSensorElectricity["payload"] {
  return !!topic.match(/glow\/.*\/SENSOR\/(gasmeter|electricitymeter)/) && payload;
}

function isDeviceAvailability(topic: string, payload: any): payload is DeviceAvailability["payload"] {
  return !!topic.match(/zigbee2mqtt\/.*\/availability/) && payload;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


const { div, button, table } = tag();

window.onload = async () => {
  Chart.defaults.font.size = 20;
  Chart.defaults.color = '#fff';

  let toast: ReturnType<typeof Toast>;
  const Toast = div.extended({
    styles: `.Toast {
      position: fixed;
      left: 1em;
      right: 1em;
      bottom: 1em;
      text-align: center;
      color: black;
      background: white;
      padding: 0.5em;
      display: block;
      opacity: 0;
      transition: opacity 0.5s;
      border-radius: 1em;
      white-space: pre;
      z-index: 100;
    }`,
    override: {
      className: 'Toast',
    },
    iterable: {
      message: undefined as string|undefined
    },
    async constructed() {
      for await (const s of this.message) {
        if (s) {
          this.textContent = s;
          this.style.opacity = "1";
          await sleep(3000);
          this.style.opacity = "0";
          await sleep(500);
        }
      }
    }
  });

  const ControlMenu = div.extended({
    styles: `.ControlMenu {
      position: fixed;
      right: 0;
      top: 0;
      text-align: right;
      color: #fff;
      background: transparent;
      padding: 0.5em;
      padding-top: 0;
      display: block;
      font-size: 2em;
    }

    .ControlMenu > div {
      background: rgba(0, 0, 0, 0.7);
      padding: 0.5em;
      display: none;
      border-radius: 1em;
    }

    .ControlMenu > div > * {
      padding: 0.3em;
      border-radius: 0.5em;
    }`,

    override: {
      className: 'ControlMenu',
      textContent: '⋮',
      onclick(event: MouseEvent) {
        // @ts-ignore
        this.children [0]!.style.display = this.children[0]!.style.display === 'block' ? '' : 'block';
      }
    },

    constructed() {
      return div(
        div({
        onclick() {
          fetch("/control/loadRules")
            .then(res => res.json())
            .then(res => {
              if (res.rules) {
                toast.message = "Reloaded rules:\n\n" + res.rules.join("\n");
              } else {
                toast.message = "No rules loaded";
              }
            });
        }
      }, "Reload Rules"),
      div({
        onclick() {
          fetch("/z2mhost")
          .then(res => res.text() || window.location.host)
          .catch(_ => window.location.host)
          .then(host => window.open('http://' + host + '/', 'manager'))
        }
      },
    "Manage Zigbee")
      )
    }
  });

  function addZigbeeDevice(device: Device) {
    if (devices.ids['zigbee2mqtt/' + device.friendly_name])
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
    override: {
      className: 'Devices'
    },
    declare: {
      sort() {
        this.append(...[...(this.children as Iterable<ReturnType<typeof BaseDevice>>)].sort((a, b) => a.sortOrder().localeCompare(b.sortOrder())));
      }
    }
  })();

  const logExample = new Set<string>();
  const mqtt = new WsMqttConnection(window.location.host, async m => {
    parseTopicMessage(JSON.parse(m.data));
  });

  dataApi({ q: 'latest', topic: 'zigbee2mqtt/bridge/devices' }).then(
    res => res ? (res.payload as BridgeDevices["payload"]).map(x => addZigbeeDevice(x)) : undefined)

  document.body.append(
    ControlMenu(),
    toast = Toast(),
    devices
  );

//  const models: Record<string, FreeHouseHubMessage['payload'][number]> = Object.create(null);
  const isDev = window.location.hash == '#dev';
  const retained = await dataApi({ q: 'stored_topics', since: Date.now() - 86400000 });
  if (retained) {
    for (const message of retained) {
      parseTopicMessage(message as Z2Message);
      await sleep(1);
    }
  }

  function parseTopicMessage({ topic, payload }: Z2Message) {
    if (payload === null || payload === undefined) {
      if (devices.ids[topic]) {
        devices.ids[topic].remove();
      }
      return;
    }

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
        if (isDeviceAvailability(topic, payload))
          devices.ids[devID].style.opacity = payload.state === 'online' ? "" : "0.5";
        else if (subTopic[2] !== 'set') {
          const p = Object.fromEntries([
            ...Object.entries(devices.ids[devID].payload),
            ...Object.entries(payload)
          ]);
          devices.ids[devID].payload = p;
        }
      }
    } else if (topic && isGlowSensor(topic, payload)) {
      if (!devices.ids[topic] && (subTopic[3] in Glow)) {
        devices.append(Glow[subTopic[3] as keyof typeof Glow]({ id: topic, payload } as any));
        devices.sort();
      } else {
        devices.ids[topic].payload = payload;
      }
    } else if (topic.startsWith('FreeHouse')) {
      const parts = topic.split('/');
      if (parts.length === 1) {
        for (const p of payload as FreeHouseHubMessage['payload']) {
          const id = topic + "/" + p.name;
          if (!devices.ids[id] && p.info.model in FreeHouseModels) {
            devices.append(FreeHouseModels[p.info.model as keyof typeof FreeHouseModels]({ id, mqtt, payload: { meta: p } }));
            devices.sort();
          }
          devices.ids[id].style.opacity = p.lastSeen > 90000 /* 15 mins */ ? "0.5" : "1";
        }
      } else if (parts.length === 2) {
        const name = parts[1];
        if (!devices.ids[topic]) {
          const id = (payload as FreeHouseDeviceMessage<"TRV1">['payload']).meta.info.model;
          devices.append(FreeHouseModels[id]({ id: topic, mqtt, payload: payload as FreeHouseDeviceMessage<"TRV1">['payload'] }));
          devices.sort();
        } else {
          devices.ids[topic].payload = payload;
          //setTimeout(()=>devices.ids[topic].payload = payload,1);
        }
      }
    } else {
      if (!logExample.has(topic)) {
        logExample.add(topic);
        console.log("Other message:", topic, payload);
      }
    }
  }
}


