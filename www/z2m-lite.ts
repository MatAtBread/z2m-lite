interface OtherZ2Message {
  topic: '';
  payload: { [key: string]: unknown };
}

interface DeviceAvailability {
  topic: `${string}/availability`;
  payload: { state: "online" | "offline" };
}

interface BridgeDevices {
  topic: 'bridge/devices',
  payload: Device[]
}

interface BridgeState {
  topic: 'bridge/state',
  payload: { state: 'offline' | 'online' };
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

interface BridgeConfig {
  topic: "bridge/config"
  payload?: never;
  // ...more fields here
}

interface BridgeLogging {
  topic: 'bridge/logging',
  payload: {
    level: LogLevel;
    message: string;
  };
}

interface BridgeLog {
  topic: 'bridge/log',
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

const [tr, td, a, div, input, span, block, button] = [e('tr'), e('td'), e('a'), e('div'), e('input'), e('span'), e('div', {
  style: 'display: inline-block'
}), e('button')];

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

window.onload = () => {
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
    position: featureElement.numeric()
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
    }

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
      z2mApi.send(this.device.friendly_name + (subCommand ? '/' + subCommand : ''), payload)
    }
  }

  const devices = new Map<string, UIDevice>();

  class Z2MConnection {
    private socket: WebSocket | null = null;
    constructor(readonly onmessage: (p: MessageEvent<any>) => void) {
      ui('reconnect')!.onclick = () => this.connect();
      this.connect();
    }

    private connect() {
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

  const z2mApi = new Z2MConnection(m => {
    const { topic, payload } = JSON.parse(m.data) as Z2Message;
    const subTopic = topic.split('/');
    if (topic === 'bridge/devices') {
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
        const elt = (exists || new UIDevice(device)).element;
        elt.style.opacity = "";
        ui('devices')?.append(elt);
      }
    } else if (topic === 'bridge/state') {
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
    } else if (topic === 'bridge/logging') {
      if (payload.level === 'warn' || payload.level === 'error') {
        logMessage(payload.message);
      }
    } else if (topic === 'bridge/log') {
    } else if (topic === 'bridge/config') {
    } else if (topic === 'bridge/info') {
    } else if (devices.get(subTopic[0]) && subTopic[1] === 'availability') {
      devices.get(subTopic[0])!.element.style.opacity = (payload as DeviceAvailability['payload']).state === 'online' ? "1" : "0.5";
    } else if (typeof payload === 'object' && payload && !devices.get(topic)?.update(payload)) {
      console.log("OTHER MESSAGE", topic, payload);
    }
  })
  // @ts-ignore
  window.z2mApi = z2mApi;
}