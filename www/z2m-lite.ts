interface OtherZ2Message {
  topic: '';
  payload: { [key: string]: unknown };
}

interface BridgeDevices {
  topic: 'bridge/devices',
  payload: Device[]
}

interface BridgeState {
  topic: 'bridge/state',
  payload: 'offline' | 'online';
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
interface BridgeInfo {
  topic: "bridge/info",
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

interface BridgeLogging {
  topic: 'bridge/logging',
  level: LogLevel;
  message: string;
  payload?: never;
}

type Z2Message = BridgeDevices | BridgeState | BridgeLogging | BridgeInfo | OtherZ2Message;

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

interface EnumFeature extends CommonFeature {
  type: 'enum';
  values: string[];
}

interface LQIFeature extends NumericFeature {
  unit: 'lqi';
  value_max: number;
  value_min: number;
}

type Feature = BinaryFeature | NumericFeature | EnumFeature | LQIFeature;

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

const z2mHost = window.location.hostname + ":8080";
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

function e<K extends keyof HTMLElementTagNameMap>(tag: K, defaults?: DeepPartial<HTMLElementAttrs<K>>) {
  return (attrs: DeepPartial<HTMLElementAttrs<K>> | string | Node, ...children: (string | Node)[]) => {
    const e = document.createElement(tag);
    if (defaults)
      Object.assign(e, defaults);

    if (typeof attrs === 'object' && !(attrs instanceof Node)) {
      Object.assign(e, attrs);
      if (children)
        e.append(...children);
    } else {
      if (children)
        e.append(attrs, ...children);
      else
        e.append(attrs);
    }
    return e;
  }
}

const [tr, td, a, div, input, span, block, button] = [e('tr'), e('td'), e('a'), e('div'), e('input'), e('span'), e('div', {
  style: 'display: inline-block'
}), e('button')];

const featureElement = {
  linkquality:(f: LQIFeature, d: UIDevice, value: number | null, attrs = {}) => {
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
  binary(f: BinaryFeature, d: UIDevice, value: string | null, attrs = {}) {
    return block({
      update(this: HTMLElement, v: string) {
        if (v !== value) {
          if (typeof value === 'string')
            (this.children.namedItem(value) as HTMLButtonElement)!.disabled = false;
          value = v;
          (this.children.namedItem(v) as HTMLButtonElement)!.disabled = true;
        }
        return this;
      },
      title: f.description,
      ...attrs
    }, ...[f.value_off, f.value_on].map(op => button({
      id: op,
      disabled: value === op,
      onclick: function (this: HTMLInputElement) {
        this.disabled = true;
        d.api("set", { 'state': op });
      } as unknown as HTMLInputElement['onclick']
    }, op)));
  },
  enum(f: EnumFeature, d: UIDevice, value: string | null, attrs = {}) {
    return block({
      update(this: HTMLElement, v: string) {
        if (v !== value) {
          if (value !== null)
            (this.children.namedItem(value) as HTMLButtonElement)!.disabled = false;
          value = v;
          (this.children.namedItem(v) as HTMLButtonElement)!.disabled = true;
        }
        return this;
      },
      title: f.description,
      ...attrs
    }, ...f.values.sort().filter(op => ['comfort', 'eco', value].includes(op)).map(op => button({
      id: op,
      disabled: value === op,
      onclick: function (this: HTMLInputElement) {
        this.disabled = true;
        d.api("set", { 'preset': op });
      } as unknown as HTMLInputElement['onclick']
    }, op)));
  },
  numeric(f: NumericFeature, d: UIDevice, value: number | null, attrs = {}) {
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
  }
};

const propertyColumns = {
  linkquality: featureElement.linkquality,
  state: featureElement.binary,
  preset: featureElement.enum,
  local_temperature: featureElement.numeric,
  current_heating_setpoint: (f: NumericFeature, d: UIDevice, value: number | null) => featureElement.numeric(f,d,value, { style: "color: #4f4" }),
  position: featureElement.numeric
};

class UIDevice {
  readonly element: HTMLElement;
  private readonly features: { [name: string]: Feature };
  private delayedRefresh: number = 0;

  constructor(readonly device: Device) {
    this.features = {};
    if (device.definition?.exposes?.length) for (const f of device.definition.exposes) {
      const assignFeature = (f: Feature) => this.features[f.property] = f;
      if ('features' in f) {
        f.features.forEach(assignFeature);
      } else {
        assignFeature(f);
      }
    }

    this.element = tr({ id: device.friendly_name },
      td({ id: 'name'/*, style: 'white-space: nowrap;'*/ }, device.friendly_name),
      td({ id: 'value', style: 'white-space: nowrap;' }, device.friendly_name === "Coordinator"
        ? button({
          id: 'manage',
          onclick() { window.open('http://' + z2mHost + '/', 'manager') }
        }, 'Manage...')
        : '')
    );

    devices.set(device.friendly_name, this);
  }

  update(payload: { [property: string]: unknown }) {
    for (const property of (Object.keys(propertyColumns) as (keyof typeof propertyColumns)[])) {
      const value = payload[property];
      const feature = this.features[property];
      if (value !== undefined && feature) {
        let e = this.element.children.namedItem('value')!.children.namedItem(property);
        if (!e) {
          e = propertyColumns[property](feature as any, this, (feature.access||0) & 6 ? value as any : null) || null;
          if (e) {
            e.id = property;
            this.element.children.namedItem('value')!.append(e);
          }
        }
        e?.update(value);
      }
    }
    return true;
  }

  api(subCommand: string, payload: unknown) {
    z2mApi.send(this.device.friendly_name + (subCommand ? '/'+subCommand : ''), payload)
  }
}

const devices = new Map<string, UIDevice>();

function promptReconnect() {
  document.getElementById('reconnect')?.remove();
  document.body.append(a({ id: 'reconnect', onclick() { window.location.reload() } }, 'Bridge offline. Click to re-connect'));
}

class Z2MConnection {
  private socket: WebSocket;
  constructor(onmessage: (p: MessageEvent<any>) => void) {
    this.socket = new WebSocket("ws://" + z2mHost + "/api");
    this.socket.onerror = () => { promptReconnect(); };
    this.socket.onopen = () => this.socket.onmessage = onmessage;
  }
  send(topic: string, payload: unknown) {
    try {
      this.socket.send(JSON.stringify({ topic, payload }));
    } catch (ex) {
      promptReconnect();
    }
  }
}

const z2mApi = new Z2MConnection(m => {
  const { topic, payload } = JSON.parse(m.data) as Z2Message;
  const subTopic = topic.split('/');
  if (topic === 'bridge/devices') {
    ui('devices')!.innerHTML = '';
    devices.clear();
    payload.sort((a, b) => {
      return a.friendly_name === "Coordinator" ? 1 :
        b.friendly_name === "Coordinator" ? -1 :
          a.friendly_name < b.friendly_name ? -1 :
            a.friendly_name > b.friendly_name ? 1 : 0;
    });
    for (const device of payload) {
      ui('devices')?.append(new UIDevice(device).element);
    }
  } else if (topic === 'bridge/state') {
    if (payload === 'offline') {
      promptReconnect();
    } else if (payload === 'online') {
      document.getElementById('reconnect')?.remove();
    } else if (payload === 'logging') {

    } else
      console.log("BRIDGE MESSAGE", topic, payload);
  } else if (topic === 'bridge/logging') {
    // 
  } else {
    if (typeof payload === 'object' && payload && !devices.get(topic)?.update(payload))
      console.log("OTHER MESSAGE", topic, payload);
  }
})
