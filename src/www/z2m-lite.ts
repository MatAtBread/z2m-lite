interface OtherZ2Message {
  topic: '';
  payload: { [key: string]: unknown };
}

interface DeviceAvailability {
  topic: `zigbee2mqtt/${string}/availability`;
  payload: { state: "online" | "offline" };
}

interface BridgeDevices {
  topic: 'zigbee2mqtt/bridge/devices',
  payload: Device[]
}

interface BridgeState {
  topic: 'zigbee2mqtt/bridge/state',
  payload: { state: 'offline' | 'online' };
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
interface BridgeInfo {
  topic: "zigbee2mqtt/bridge/info",
  payload: {
    "version": string;
    "commit": string;
    "coordinator": {
      "ieee_address": string;
      "type": string;
      "meta": object;
    },
    "network": { "channel": number, "pan_id": number, "extended_pan_id": number[] },
    "log_level": LogLevel,
    "permit_join": boolean,
    "permit_join_timeout"?: number, // Time in seconds till permit join is disabled, `undefined` in case of no timeout
    "config": object;
    "config_schema": object;
    "restart_required": boolean // Indicates whether Zigbee2MQTT needs to be restarted to apply options set through zigbee2mqtt/request/bridge/options
  }
}

interface BridgeConfig {
  topic: "zigbee2mqtt/bridge/config"
  payload?: never;
  // ...more fields here
}

interface BridgeLogging {
  topic: 'zigbee2mqtt/bridge/logging',
  payload: {
    level: LogLevel;
    message: string;
  };
}

interface BridgeLog {
  topic: 'zigbee2mqtt/bridge/log',
  message: string;
  meta?: {
    friendly_name?: string;
  }
  type: string;
  payload?: never;
}

type Z2Message = DeviceAvailability | BridgeDevices | BridgeState | BridgeLogging | BridgeLog | BridgeInfo | BridgeConfig | OtherZ2Message;

interface CommonFeature {
  // Bit 1: The property can be found in the published state of this device.
  // Bit 2: The property can be set with a /set command
  // Bit 3: The property can be retrieved with a /get command (when this bit is true, bit 1 will also be true)
  access?: number;
  description: string;
  name: string;
  property: string;
}

interface BinaryFeature extends CommonFeature {
  type: "binary"
  value_off: string;
  value_on: string;
  value_toggle: string;
}

interface NumericFeature extends CommonFeature {
  type: "numeric"
  unit: string;
}

interface TextFeature extends CommonFeature {
  type: "text"
}

interface EnumFeature extends CommonFeature {
  type: 'enum';
  values: string[];
}

interface LQIFeature extends NumericFeature {
  unit: 'lqi';
  value_max: number;
  value_min: number;
}

type Feature = BinaryFeature | NumericFeature | EnumFeature | LQIFeature | TextFeature;

interface Device {
  friendly_name: string;
  ieee_address: string;
  definition?: {
    model: string;
    description: string;
    exposes: Array<{
      features: Feature[]
    } | Feature>;
  }
}

const POLLED_REFRESH_SECONDS = 180;

function ui(id: string) {
  return document.getElementById(id);
}

type HTMLElementAttrs<E extends keyof HTMLElementTagNameMap> = {
  [A in keyof HTMLElementTagNameMap[E]]: Exclude<HTMLElementTagNameMap[E][A], null> extends Function
  ? HTMLElementTagNameMap[E][A]
  : HTMLElementTagNameMap[E][A] | string
};

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends {} ? DeepPartial<T[P]> : T[P];
}

function notUndefined<T>(x: T | undefined): x is T { return typeof x !== 'undefined' }

function e<K extends keyof HTMLElementTagNameMap>(tag: K, defaults?: DeepPartial<HTMLElementAttrs<K>>) {
  return (attrs: DeepPartial<HTMLElementAttrs<K>> | string | Node | undefined, ...children: (string | Node | undefined)[]) => {
    const e = document.createElement(tag);
    if (defaults)
      Object.assign(e, defaults);

    if (typeof attrs === 'object' && !(attrs instanceof Node)) {
      Object.assign(e, attrs);
      if (children)
        e.append(...children.filter(notUndefined));
    } else {
      if (children)
        e.append(...[attrs, ...children].filter(notUndefined));
      else if (typeof attrs !== 'undefined')
        e.append(attrs);
    }
    return e;
  }
}

const [tr, td, a, div, input, span, block, button, canvas] = [e('tr'), e('td'), e('a'), e('div'), e('input'), e('span'), e('div', {
  style: 'display: inline-block'
}), e('button'), e('canvas')];

type FeatureElementAttrs = Partial<{
  onvalue?: ((this: HTMLElement, ev: Event & { value: string | number | null }) => void);
} & Omit<HTMLElement, 'onchange'>>;

const featureElement = {
  linkquality: (attrs: Partial<HTMLElement> = {}) => (f: LQIFeature, value: number | null) => {
    return span({
      update(this: HTMLSpanElement, v: number) {
        if (v !== value) {
          value = v;
          this.style.opacity = `${value / f.value_max}`;
        }
        return this;
      },
      ...attrs
    }, '\uD83D\uDCF6');
  },
  binary: (attrs: FeatureElementAttrs = {}) => (f: BinaryFeature, value: string | null) => {
    let self = block({
      update(this: HTMLElement, v: string) {
        if (v !== value) {
          if (typeof value === 'string')
            if (this.children.namedItem(value))
              (this.children.namedItem(value) as HTMLButtonElement)!.disabled = false;
          value = v;
          if (this.children.namedItem(v))
            (this.children.namedItem(v) as HTMLButtonElement)!.disabled = true;
        }
        return this;
      },
      title: f.description,
      ...attrs
    }, ...[f.value_off, f.value_on].map(op => button({
      id: op,
      disabled: value === op,
      onclick: function (this: HTMLButtonElement) {
        this.disabled = true;
        attrs.onvalue?.call(self, Object.assign(new Event('value'), { value: op }));
      } as unknown as HTMLButtonElement['onclick']
    }, op)));
    return self;
  },
  enum: (attrs: FeatureElementAttrs = {}) => (f: EnumFeature, value: string | null) => {
    let self = block({
      update(this: HTMLElement, v: string) {
        if (v !== value) {
          if (value !== null)
            (this.children.namedItem(value) as HTMLButtonElement)!.disabled = false;
          value = v;
          if (this.children.namedItem(v))
            (this.children.namedItem(v) as HTMLButtonElement)!.disabled = true;
        }
        return this;
      },
      title: f.description,
      ...attrs
    }, ...f.values.sort()/*.filter(op => ['auto', 'off', value].includes(op))*/.map(op => button({
      id: op,
      disabled: value === op,
      onclick: function (this: HTMLButtonElement) {
        this.disabled = true;
        attrs.onvalue?.call(self, Object.assign(new Event('value'), { value: op }));
      } as unknown as HTMLButtonElement['onclick']
    }, op)));
    return self;
  },
  numeric: (attrs: Partial<HTMLElement> = {}) => (f: NumericFeature, value: number | null) => {
    return span({
      update(this: HTMLSpanElement, v: number) {
        if (v !== value) {
          value = v;
          this.textContent = value + f.unit;
        }
        return this;
      },
      ...attrs
    }, value + f.unit);
  },
  text: (attrs: Partial<HTMLElement> = {}) => (f: TextFeature, value: string | null) => {
    return span({
      update(this: HTMLSpanElement, v: string) {
        if (v !== value) {
          value = v;
          this.textContent = value;
        }
        return this;
      },
      ...attrs
    }, value || '');
  }
};

function logMessage(message: string) {
  const log = div(message);
  ui('log')?.append(log);
  setTimeout(()=>log.remove(), 15000);
}

window.onload = async () => {
  const z2mHost = (await fetch("/z2mhost").then(res => res.text()).catch(_ => null)) || window.location.host;

  const propertyColumns = {
    linkquality: featureElement.linkquality(),
    friendly_name: (f: TextFeature, value: string | null, d: UIDevice) => featureElement.text({
      onclick: async () => {
        if (d.features.preset && d.features.system_mode && confirm("Reset " + d.device.friendly_name + "?")) {
          d.api("set", { 'preset': 'comfort' });
          d.api("set", { 'system_mode': "off" });
          d.api("set", { 'system_mode': "auto" });
        }
      }
    })(f, value),
    state: (f: BinaryFeature, value: string | null, d: UIDevice) => featureElement.binary({
      onvalue(ev) { d.api("set", { 'state': ev.value }) }
    })(f, value),
    system_mode: (f: EnumFeature, value: string | null, d: UIDevice) => featureElement.enum({
      onvalue(ev) {
        d.api("set", { 'system_mode': ev.value });
        if (ev.value !== 'off') d.api("set", { 'preset': 'comfort' });
      }
    })(f, value),
    local_temperature: featureElement.numeric(),
    current_heating_setpoint: featureElement.numeric(),
    position: (f: NumericFeature, value: string | null, d: UIDevice) => featureElement.numeric({
      onclick: async (e) => {
        d.toggleDeviceDetails()
      }
    })(f, Number(value))
  };

  class UIDevice {
    readonly element: HTMLElement;
    readonly features: { [name: string]: Feature };

    constructor(readonly device: Device) {
      this.features = { friendly_name: { type: 'text', name: 'friendly_name', property: 'friendly_name', description: 'Device name' } };
      if (device.definition?.exposes?.length) for (const f of device.definition.exposes) {
        const assignFeature = (f: Feature) => this.features[f.property] = f;
        if ('features' in f) {
          f.features.forEach(assignFeature);
        } else {
          assignFeature(f);
        }
      }

      this.element = tr({ id: device.friendly_name },
        device.friendly_name === "Coordinator"
          ? td({ colSpan: 6 },
            button({
              id: 'manage',
              onclick() { window.open('http://' + z2mHost + '/', 'manager') }
            }, 'Manage devices'))
          : undefined);

      devices.set(device.friendly_name, this);
      ui('devices')?.append(this.element);
    }

    toggleDeviceDetails(){
      if (this.element.nextElementSibling) {
        if (!this.element.nextElementSibling.id) {
          this.element.nextElementSibling.remove();
        } else {
          const details = this.showDeviceDetails();
          if (details) {
            this.element.parentElement?.insertBefore(tr(td({ colSpan: "6" }, details)), this.element.nextSibling)
          }
        }
      }
    }

    protected showDeviceDetails():HTMLElement | void {}
    get topic() { return "zigbee2mqtt/" + this.device.friendly_name }

    update(payload: { [property: string]: unknown }) {
      for (const property of (Object.keys(propertyColumns) as (keyof typeof propertyColumns)[])) {
        const value = property === 'friendly_name' ? this.device.friendly_name : payload[property];
        const feature = this.features[property];
        if (value !== undefined && feature) {
          let e = this.element.children.namedItem(property) as HTMLElement;
          if (!e) {
            e = propertyColumns[property](feature as any, (feature.access || 0) & 6 ? value as any : null, this) || null;
            if (e) {
              e = td({ id: property }, e);
              this.element.append(e);
            }
          }
          e?.firstElementChild?.update(value);
        }
      }
      return true;
    }

    api(subCommand: string, payload: unknown) {
      z2mApi.send(this.topic + (subCommand ? '/' + subCommand : ''), payload)
    }
  }
 
  Chart.defaults.font.size = 20;
  Chart.defaults.color = '#fff';
  const deviceDetails = {
    TS0601_thermostat: class extends UIDevice {
      showDeviceDetails() {
        const chart = canvas({
          style: {
            height: '10em'
          }
        });

        dataApi({
          q: 'series',
          topic: this.topic,
          interval: 15,
          start: Date.now() - 3 * 24 * 60 * 60 * 1000,
          "fields": ["local_temperature", "position",/*"current_heating_setpoint"*/]
        }).then(data => {
            if (data?.length) {
              const series = Object.keys(data[0]).filter(k => k !== 'time');
              new Chart(chart, {
                type: 'scatter',
                data: {
                  //labels: data.map(d => new Date(d.time).toString().slice(16, 21)),
                  datasets: series.map(k => ({
                    label: k,
                    showLine: true,
                    yAxisID: 'y' + k,
                    data: data.map(d => ({x: d.time, y: d[k]}))
                  }))
                },
                options: {
                  scales: {
                    /*xAxis:{
                      type: 'time',
                      time: {
                        unit: "hour"
                      }
                    },*/
                    ...Object.fromEntries(series.map((k, idx) => ['y' + k, {
                      position: k === 'position' ? 'right' : 'left',
                      min: k === 'position' ? 0 : undefined,
                      max: k === 'position' ? 100 : undefined,
                    }]))
                  }
                }
              });
            }
          })
        return chart;

      }
    },
    /*electricitymeter: class extends UIDevice {
      constructor(topic: string) {
        super({
          friendly_name: 'Electrcity',
          ieee_address: '0x00'
        })
      }
    },
    gasmeter: class extends UIDevice {},*/
  }
  const devices = new Map<string, UIDevice>();

  class Z2MConnection {
    private socket: WebSocket | null = null;
    constructor(wsHost: string, readonly onmessage: (p: MessageEvent<any>) => void) {
      ui('reconnect')!.onclick = () => this.connect(wsHost);
      this.connect(wsHost);
    }

    private connect(z2mHost: string) {
      ui('reconnect')!.style.display = 'none';
      this.socket = new WebSocket("ws://" + z2mHost + "/api");
      this.socket.onerror = () => this.promptReconnect();
      this.socket.onclose = () => this.promptReconnect();
      this.socket.onmessage = (ev) => this.onmessage(ev);
    }

    promptReconnect() {
      if (this.socket) {
        this.socket.onclose = this.socket.onerror = null;
        this.socket.close();
        this.socket = null;
      }
      ui('reconnect')!.style.display = 'inline-block';
    }
    send(topic: string, payload: unknown) {
      try {
        this.socket!.send(JSON.stringify({ topic, payload }));
      } catch (ex) {
        this.promptReconnect();
      }
    }
  }

  function initialiseDevices(payload: BridgeDevices["payload"]) {
    for (const device of devices.values()) {
      device.element.style.opacity = "0.5";
    }
    payload.sort((a, b) => {
      return a.friendly_name === "Coordinator" ? 1 :
        b.friendly_name === "Coordinator" ? -1 :
          a.friendly_name < b.friendly_name ? -1 :
            a.friendly_name > b.friendly_name ? 1 : 0;
    });
    for (const device of payload) {
      const exists = devices.get(device.friendly_name);
      const elt = (exists || new (deviceDetails[device.definition?.model as keyof typeof deviceDetails] || UIDevice)(device)).element;
      elt.style.opacity = "";
    }
  }

  const retained = await dataApi({q:'stored_topics', since: Date.now() - 86400000});
  if (retained) {
    const bridgeDevices = retained.find(r => r.topic === 'zigbee2mqtt/bridge/devices');
    if (bridgeDevices?.payload) {
      initialiseDevices(bridgeDevices.payload as BridgeDevices["payload"]);
    }
    for (const {topic,payload} of retained)
      devices.get(topic.replace("zigbee2mqtt/",""))?.update(payload as { [p:string]: unknown })
  }

  const z2mApi = new Z2MConnection(window.location.host,async m => {
    const { topic, payload } = JSON.parse(m.data) as Z2Message;
    const subTopic = topic.split('/');
    if (topic === 'zigbee2mqtt/bridge/devices') {
      initialiseDevices(payload);
    } else if (topic === 'zigbee2mqtt/bridge/state') {
      switch (payload.state) {
        case 'offline':
          z2mApi.promptReconnect();
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
    } else if (devices.get(subTopic[1]) && subTopic[2] === 'availability') {
      devices.get(subTopic[1])!.element.style.opacity = (payload as DeviceAvailability['payload']).state === 'online' ? "1" : "0.5";
    } else if (typeof payload === 'object' && payload && !devices.get(topic.replace("zigbee2mqtt/",""))?.update(payload)) {
      console.log("OTHER MESSAGE", topic, payload);
    }
  });

  /*
  dataApi({q: 'topics', match: 'glow/%/SENSOR/%'}).then(data => data?.forEach(d => {
    if (d.topic) {
      const glow = d.topic.split("/") as ['glow',string,'SENSOR','electricitymeter'|'gasmeter']
      new deviceDetails[glow[3]](d.topic);
    }
  }));

  new Electricity();
  new Gas();
  */
  
  // @ts-ignore
  window.z2mApi = z2mApi;
}

function dataApi<Q extends DataQuery>(query: Q) {
  return fetch("/data?"+encodeURIComponent(JSON.stringify(query))).then(res => res.json() as Promise<DataResult<Q> | undefined>);
}


