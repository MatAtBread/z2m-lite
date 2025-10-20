/// <reference path="./vendor.ts"/>
import { FreeHouseModels, Hub } from "./FreeHouseDevices.js";
import { dataApi } from "./HistoryChart.js";
import { WsMqttConnection } from "./WsMqttConnection.js";
import { Glow } from "./glow-devices.js";
import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
import { CodeEditor } from "./rule-edit.js";
import { ZigbeeDevice, zigbeeDeviceModels } from "./zdevices.js";
function isGlowSensor(topic, payload) {
    return !!topic.match(/glow\/.*\/SENSOR\/(gasmeter|electricitymeter)/) && payload;
}
function isDeviceAvailability(topic, payload) {
    return !!topic.match(/zigbee2mqtt\/.*\/availability/) && payload;
}
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
const { div, table, tr, td } = tag();
const Toast = div.extended({
    styles: `.Toast {
      position: fixed;
      left: 1em;
      right: 1em;
      bottom: 1em;
      text-align: center;
      color: white;
      background: black;
      padding: 0.5em;
      display: block;
      opacity: 0;
      transition: opacity 0.5s;
      border-radius: 1em;
      white-space: pre;
      z-index: 100;
    }

    .Toast * {
      color: inherit;
      background: inherit;
    }`,
    override: {
        className: 'Toast',
    },
    iterable: {
        message: undefined // ChildTags - but fails TS
    },
    async *constructed() {
        let count = 0;
        for await (const s of this.message) {
            this.style.opacity = String(++count ? "1" : "0");
            yield s;
            sleep(3000).then(() => this.style.opacity = (--count ? "1" : "0"));
        }
    }
});
window.onload = async () => {
    Chart.defaults.font.size = 20;
    Chart.defaults.color = '#fff';
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
            onclick(event) {
                // @ts-ignore
                this.children[0].style.display = this.children[0].style.display === 'block' ? '' : 'block';
            }
        },
        constructed() {
            return div(div({
                onclick() {
                    fetch("/control/loadRules")
                        .then(res => res.json())
                        .then(res => {
                        if (res.rules) {
                            toast.message = [div("Reloaded rules"), table(Object.entries(res.rules).map(([name, msg]) => tr(td(name), td(String(msg)))))];
                        }
                        else {
                            toast.message = "No rules loaded";
                        }
                    });
                }
            }, "Reload Rules"), div({
                onclick() {
                    document.body.append(CodeEditor());
                }
            }, "Edit Rules"));
        }
    });
    function addZigbeeDevice(device) {
        if (devices.ids['zigbee2mqtt/' + device.friendly_name])
            return;
        const controls = zigbeeDeviceModels[device.friendly_name]
            ?? zigbeeDeviceModels[device.definition?.model]
            ?? ZigbeeDevice;
        devices.append(controls({ device, mqtt }));
        devices.sort();
    }
    const devices = table.extended({
        styles: `.Devices {
      margin-bottom: 3em;
      width: 100%;
    }`,
        ids: {},
        override: {
            className: 'Devices'
        },
        declare: {
            sort() {
                this.append(...[...this.children].sort((a, b) => String(a.sortOrder()).localeCompare(String(b.sortOrder()))));
            }
        }
    })();
    const logExample = new Set();
    const mqtt = new WsMqttConnection(window.location.host, async (m) => {
        parseTopicMessage(JSON.parse(m.data));
    });
    dataApi({ q: 'latest', topic: 'zigbee2mqtt/bridge/devices' }).then(res => res ? res.payload.map(x => addZigbeeDevice(x)) : undefined);
    document.body.append(ControlMenu(), window.toast = Toast(), devices);
    //  const models: Record<string, FreeHouseHubMessage['payload'][number]> = Object.create(null);
    const isDev = window.location.hash == '#dev';
    const retained = await dataApi({ q: 'stored_topics', since: Date.now() - 86400000 });
    if (retained) {
        for (const message of retained) {
            parseTopicMessage(message);
            await sleep(1);
        }
    }
    function parseTopicMessage({ topic, payload }) {
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
        }
        else if (topic === 'zigbee2mqtt/bridge/state') {
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
        }
        else if (topic === 'zigbee2mqtt/bridge/logging') {
            if (payload.level === 'warn' || payload.level === 'error') {
                // logMessage(payload.message);
            }
            // @ts-ignore
        }
        else if (topic === 'zigbee2mqtt/bridge/log') {
            // @ts-ignore
        }
        else if (topic === 'zigbee2mqtt/bridge/config') {
        }
        else if (topic === 'zigbee2mqtt/bridge/info') {
        }
        else if (subTopic[0] === 'zigbee2mqtt' && typeof payload === 'object' && payload) {
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
        }
        else if (topic && isGlowSensor(topic, payload)) {
            if (!devices.ids[topic] && (subTopic[3] in Glow)) {
                devices.append(Glow[subTopic[3]]({ id: topic, payload }));
                devices.sort();
            }
            else {
                devices.ids[topic].payload = payload;
            }
        }
        else if (topic.startsWith('FreeHouse')) {
            const parts = topic.split('/');
            if (parts.length === 1) {
                if (!devices.ids[topic])
                    devices.append(Hub({ id: topic, mqtt, payload: payload }));
                else
                    devices.ids[topic].payload = payload;
                const typedPayload = payload;
                for (const p of typedPayload.devices) {
                    const id = topic + "/" + p.name;
                    if (!devices.ids[id] && p.info.model in FreeHouseModels) {
                        devices.append(FreeHouseModels[p.info.model]({ id, mqtt, payload: { meta: p } }));
                        devices.sort();
                    }
                    if (devices.ids[id])
                        devices.ids[id].style.opacity = p.lastSeen > 90000 /* 15 mins */ ? "0.5" : "1";
                }
            }
            else if (parts.length === 2) {
                const name = parts[1];
                if (!devices.ids[topic]) {
                    const id = payload.meta.info.model;
                    devices.append(FreeHouseModels[id]({ id: topic, mqtt, payload: payload /*FreeHouseDeviceMessage<"TRV1">['payload']*/ }));
                    devices.sort();
                }
                else {
                    devices.ids[topic].payload = payload;
                }
            }
        }
        else {
            if (!logExample.has(topic)) {
                logExample.add(topic);
                console.log("Other message:", topic, payload);
            }
        }
    }
};
