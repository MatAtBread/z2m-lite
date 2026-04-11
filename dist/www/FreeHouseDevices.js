import { HistoryChart } from './HistoryChart.js';
import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
import { DataSet, Network } from './node_modules/vis-network/standalone/esm/vis-network.js';
import { sleep } from './z2m-lite.js';
import { ClickOption } from './zdevices.js';
import { BaseDevice } from './BaseDevice.js';
const { td, div, button, table, tr, input, a, span } = tag();
function rssiScale(rssi) {
    if (rssi > -30)
        return 1;
    if (rssi < -100)
        return 0;
    return (rssi + 100) / 70;
}
const PopupConfig = div.extended({
    styles: `.popupThing {
      position: absolute;
      left: 0;
      top: 10%;
      background: black;
      border-radius: 0.5em;
      margin: 1em;
      padding: 1em;
      border: 3px solid #80f;
      font-size: 1.2em;
      z-index: 9;
      right: 0;
      width: auto;
    }

    .popupThing input {
      color: yellow;
      border-radius: 0.5em;
      border: 3px solid yellow;
      background-color: #334;
      margin: 0.5em;
      width: 4em;
      padding: 0.3em;
    }

    .popupThing table {
      width: 100%;
    }

    .popupThing td:nth-child(1) {
      text-align: right;
    }

    .popupThing .controls {
      position: absolute;
      top: 0em;
      right: 0em;
    }
    `,
    override: {
        className: 'popupThing',
        tabIndex: 0 // Make div focusable
    },
    declare: {
        closePopup(e) { e.stopPropagation(); this.remove(); }
    },
    constructed() {
        this.when('keydown').consume(e => {
            if (e.key === 'Escape') {
                PopupConfig.closePopup.call(this, e);
            }
            else if (e.key === 'Enter') {
                this.closePopup(e);
            }
        });
        this.when('@ready').consume(() => this.focus());
    }
});
const CH4 = BaseDevice.extended({
    styles: `#paused {
      margin-left: 0.5em;
      color: rgb(169, 126, 255);
      width: 8em;
      white-space: break-spaces;
      max-height: 3em;
      overflow: hidden;
    }`,
    iterable: {
        payload: {}
    },
    constructed() {
        this.when('click:.ClickOption').consume(x => {
            if (x) {
                const mode = x.target.textContent;
                this.api('set', { mode: mode });
                if (this.payload.mode.valueOf() !== mode) {
                    this.payload.mode = mode;
                }
            }
        });
        const mode = this.payload.map(p => p?.mode).multi();
        return [
            td({
                onclick: () => this.toggleDetails(),
                style: {
                    opacity: this.payload.map(p => rssiScale(p.meta.rssi).toString())
                },
            }, '\uD83D\uDCF6'),
            td({
                onclick: () => this.toggleDetails()
            }, this.id.split('/')[1]),
            td(ClickOption({ disabled: mode.map(p => p === 'on') }, "on"), ClickOption({ disabled: mode.map(p => p === 'clock') }, "clock"), ClickOption({ disabled: mode.map(p => p === 'off') }, "off")),
            td({
                id: 'paused',
                colSpan: 3,
                onclick: null
            }, this.payload.pause.map(t => t ? 'Paused (no radiators are on)' : '')),
            td()
        ];
    }
});
const TRV1 = BaseDevice.extended({
    styles: `#local_temperature {
      width: 3em;
      text-align: right;
    }
    #current_heating_setpoint {
      width: 3em;
      color: rgb(135, 214, 135);
      text-align: right;
    }
    #position {
      width: 3em;
      text-align: right;
    }
`,
    iterable: {
        payload: {}
    },
    override: {
        api(subCommand, payload) {
            this.mqtt.send(this.id + (subCommand ? '/' + subCommand : ''), payload, true);
        },
        details() {
            return HistoryChart({
                topic: this.id,
                views: {
                    "1hr": {
                        metric: 'avg',
                        fields: ["local_temperature", "position", "battery_percent"],
                        intervals: 60,
                        period: 60
                    },
                    "6hr": {
                        metric: 'avg',
                        fields: ["local_temperature", "position", "battery_percent"],
                        intervals: 360 / 10,
                        period: 360
                    },
                    "Day": {
                        metric: 'avg',
                        fields: ["local_temperature", "position", "battery_percent"],
                        intervals: 24 * 4,
                        period: 24 * 60,
                    },
                    "TWk": {
                        metric: 'avg',
                        fields: ["local_temperature", "position", "battery_percent", "battery_mv"],
                        intervals: 24 * 7,
                        period: 24 * 60 * 7
                    },
                    "Wk": {
                        metric: 'avg',
                        fields: ["local_temperature"],
                        intervals: 24 * 4,
                        period: 24 * 60,
                        segments: 7
                    },
                    "28d": {
                        metric: 'avg',
                        type: 'bar',
                        fields: ["local_temperature"],
                        intervals: 28,
                        period: 28 * 24 * 60,
                    }
                }
            });
        }
    },
    constructed() {
        this.when('click:.ClickOption').consume(x => {
            if (x) {
                const mode = x.target.textContent?.toUpperCase();
                this.api('set', { system_mode: mode });
                if (this.payload.system_mode.valueOf() !== mode) {
                    this.payload.system_mode = mode;
                }
            }
        });
        const system_mode = (this.payload.system_mode).multi();
        const color = this.payload.map(p => typeof p?.local_temperature?.valueOf() === 'number' && p?.system_mode !== 'off'
            && p?.local_temperature && p?.current_heating_setpoint
            ? p?.local_temperature >= p?.current_heating_setpoint ? '#d88' : '#aaf'
            : '#aaa').multi();
        return [
            td({
                onclick: () => this.toggleDetails(),
                style: {
                    opacity: this.payload.map(p => p?.is_charging || p?.battery_percent < 10 ? "1" : rssiScale(p.meta.rssi).toString())
                },
                className: this.payload.battery_percent.map(p => p < 10 ? 'flash' : '')
            }, this.payload.map(p => p?.is_charging ? '\uD83D\uDD0C' : p?.battery_percent < 10 ? '\uD83D\uDD0B' : '\uD83D\uDCF6')),
            td({
                onclick: () => this.toggleDetails()
            }, this.id.split('/')[1]),
            td(ClickOption({ disabled: system_mode.map(p => p === 'auto') }, "auto"), ClickOption({ disabled: system_mode.map(p => p === 'heat') }, "heat"), ClickOption({ disabled: system_mode.map(p => p === 'off') }, "off"), ClickOption({ disabled: system_mode.map(p => p === 'sleep') }, "sleep")),
            td({
                id: 'local_temperature',
                style: {
                    fontSize: '2em',
                    color: color
                }
            }, this.payload.local_temperature.map(t => t?.toFixed(1)), '°C'),
            td({
                onclick: ((src) => (function (e) {
                    const update = {};
                    if (!document.querySelector('.popupThing')) {
                        const payload = src.payload.valueOf();
                        const typedValue = (input) => ({
                            number: (e) => Number(e.value),
                            boolean: (e) => Boolean(e.checked),
                            string: (e) => e.value,
                        }[typeof payload[input.name]]?.(input));
                        const popup = PopupConfig({
                            closePopup(e) {
                                if (Object.keys(update).length)
                                    src.api("set", update);
                                PopupConfig.closePopup.call(this, e);
                            }
                        }, div({
                            className: 'controls'
                        }, button({
                            style: { color: '#00d000', fontSize: '125%' },
                            onclick: (e) => popup.closePopup(e)
                        }, "✔"), button({
                            onclick: (e) => PopupConfig.closePopup.call(popup, e)
                        }, "❌")), div({ style: { fontWeight: "700", textAlign: "center", fontSize: "120%" } }, src.id.split('/')[1]), table(payload.meta.info.writeable.map(f => tr(td(f.replaceAll(/_/g, ' ')), td(input({
                            name: f,
                            oninput: (e) => {
                                const label = e.target.parentElement.previousElementSibling;
                                label.style.color = "yellow";
                                label.style.textDecoration = "underline";
                                update[f] = typedValue(e.target);
                            },
                            ...typeof payload[f] === 'boolean' ? {
                                type: 'checkbox',
                                checked: src.payload[f].initially(payload[f]).map(v => Boolean(f in update ? update[f] : v)),
                                style: { height: '1.5em', width: '1.5em' }
                            } : {
                                type: typeof payload[f] === 'number' ? 'number' : 'text',
                                value: src.payload[f].initially(payload[f]).map(v => String(f in update ? update[f] : v))
                            }
                        }))))), div({
                            style: {
                                margin: '1em',
                                fontSize: '90%'
                            }
                        }, div({
                            style: { display: 'inline-block', verticalAlign: 'top', fontSize: '150%', marginRight: '0.5em' }
                        }, "🛈 "), div({ style: { display: 'inline-block' } }, div(src.payload.meta.info.model, ' build ', a({
                            style: {
                                color: 'darkcyan',
                                whiteSpace: 'break-spaces'
                            },
                            href: '#',
                            onclick(e) {
                                e.stopImmediatePropagation();
                                if (confirm(`Do you want to update the firmware on '${payload.meta.name}'`)) {
                                    fetch(`http://${payload.meta.hub}/otaupdate/${payload.meta.mac.replace(/:/g, '')}`, {
                                        method: 'GET',
                                        credentials: 'omit' // This disables sending credentials
                                    }).then(() => {
                                        alert('Update pending. Please check back in a few minutes.');
                                    }).catch(error => {
                                        console.warn("Request firmware update: ", error);
                                    });
                                }
                            }
                        }, src.payload.meta.info.build)), div('Motor status: ', src.payload.motor), div('RSSI: TX ', src.payload.meta.rssi, ' RX ', src.payload.rssi), div('🔋 ', src.payload.battery_percent, '% (', src.payload.battery_mv, 'mV)')), button({
                            style: { float: 'right', color: '#ff8080', width: '8em' },
                            onclick: async (e) => {
                                if (confirm(`Are you sure you want to try to delete the device "${src.id.slice("FreeHouse/".length)}"?.\n\nIf the device is still powered on, it may reappear later.`)) {
                                    src.deleteDevice();
                                    await sleep(345);
                                    window.location.reload();
                                    e.stopPropagation();
                                }
                            }
                        }, "delete device")));
                        this.append(popup);
                    }
                    e.stopPropagation();
                }))(this)
            }, div({
                id: 'current_heating_setpoint',
                style: {
                    color: color
                }
            }, this.payload.current_heating_setpoint, '°C'), div({
                id: 'position',
                title: this.payload.motor
            }, span({ style: { color: 'rgb(200,100,100)', marginRight: '0.5em' } }, this.payload.motor.map(m => ({ stuck: '⚠', 'timed-out': '⏱' }[m] ?? ''))), this.payload.position, '%'))
        ];
    }
});
export const Hub = BaseDevice.extended({
    styles: `.details > .Hub {
    border-radius: 0.5em;
    background: #222;
    color: #fff;
    border: 3px solid #880;
    height: 16em;
  }

  .details.zoomed > .Hub {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 5;
    height: initial;
  }

  .details > .controls #close {
    display: none;
  }

  .details.zoomed > .controls #close {
    display: initial;
  }

  .details > .controls {
    margin-top: 0.5em;
    position: absolute;
    left: 0.5em;
    z-index: 6;
  }

  .details.zoomed > .controls {
    display: block;
    position: fixed;
    top: 0.5em;
  }
  `,
    iterable: {
        payload: undefined
    },
    override: {
        api(subCommand, payload) {
            throw new Error("Hub does not support API calls");
        },
        sortOrder() {
            return "\xFF\xFF";
        },
        async details() {
            const nodes = new DataSet();
            nodes.add({ id: '.', label: 'FreeHouse', color: '#cc0', shape: 'diamond', font: { color: 'white' } });
            const edges = new DataSet();
            const net = div({ className: 'Hub' });
            net.focus();
            const network = new Network(net, { nodes, edges }, {
                physics: {
                    minVelocity: 0.04
                }
            });
            network.on('click', (params) => {
                for (const id of params.nodes)
                    if (id.startsWith('hub:')) {
                        window.open('http://' + id.slice(4), id);
                    }
            });
            const previousHub = {};
            this.payload.consume(p => {
                if (!net.isConnected) {
                    network.destroy();
                    throw new Error("FreeHouse hub no longer in DOM");
                }
                nodes.update({
                    id: 'hub:' + p.hub,
                    label: p.name,
                    color: '#c0c',
                    shape: 'box',
                    font: { color: 'white' }
                });
                nodes.update({
                    id: 'ssid:' + p.ssid,
                    label: p.ssid,
                    color: '#080',
                    shape: 'box',
                    font: { color: 'white' }
                });
                edges.update({
                    id: '.' + p.hub,
                    from: '.',
                    to: 'ssid:' + p.ssid,
                    width: 2
                });
                edges.update({
                    id: p.ssid + p.hub,
                    from: 'ssid:' + p.ssid,
                    to: 'hub:' + p.hub,
                    width: 2
                });
                const thisHub = p.hub;
                if (previousHub[thisHub]?.size)
                    previousHub[thisHub].forEach(mac => {
                        if (!p.devices.some(dev => dev.hub === thisHub && dev.mac === mac)) {
                            edges.remove(thisHub + mac);
                            previousHub[thisHub].delete(mac);
                        }
                    });
                p.devices.sort((a, b) => a.lastSeen - b.lastSeen).forEach((dev, idx) => {
                    previousHub[dev.hub] ??= new Set();
                    previousHub[dev.hub].add(dev.mac);
                    nodes.update({
                        id: 'dev:' + dev.mac,
                        label: dev.name,
                        color: '#0cc',
                        shape: 'dot',
                        font: { color: 'white' }
                    });
                    const edge = {
                        id: dev.hub + dev.mac,
                        from: 'hub:' + dev.hub,
                        to: 'dev:' + dev.mac,
                        width: 8 * rssiScale(dev.rssi) + 1,
                        label: String(dev.rssi),
                        color: '#cc0'
                    };
                    edges.update(idx ? edge : { ...edge, width: 12, color: '#fff' });
                    if (idx === 0)
                        setTimeout(() => edges.update(edge), 250);
                });
            }).catch(e => console.log(e));
            return [
                div({ className: 'controls' }, button({
                    id: 'zoom',
                    onclick: () => this.nextElementSibling?.classList.toggle('zoomed')
                }, "\u26F6"), button({
                    id: 'close',
                    onclick: () => this.toggleDetails()
                }, "❌")),
                net
            ];
        },
        toggleDetails() {
            this.nextElementSibling?.classList.contains('details')
                ? this.nextElementSibling.remove()
                : this.after(td({ colSpan: 6, className: 'details' }, this.details()));
        }
    },
    async constructed() {
        return [
            td('\uD83D\uDD0C'),
            td({
                onclick: () => this.toggleDetails()
            }, "FreeHouse Network"),
            td(),
            td(),
            td()
        ];
    }
});
export const FreeHouseModels = {
    TRV1,
    CH4
};
