interface OtherZ2Message {
  topic: '';
  payload: { [key: string]: unknown };
}

interface BridgeDevices {
  topic: 'bridge/devices',
  payload: Device[]
}

interface CommonFeature {
  access: number;
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
  definition: {
    description: string;
    exposes: Array<{
      features: Feature[]
    } | Feature>;
  }
}

type Z2Message = BridgeDevices | OtherZ2Message;

const z2mHost = window.location.hostname + ":8080";

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

const [tr, td, a, div, input, span, block] = [e('tr'), e('td'), e('a'), e('div'), e('input'), e('span'), e('div',{
  style: 'display: inline-block'
})];

const control: {
  linkquality(value: number | unknown, f: LQIFeature, d: Device): HTMLElement | undefined;
  local_temperature(value: number | unknown, f: NumericFeature, d: Device): HTMLElement | undefined;
  state(value: string | unknown, f: BinaryFeature, d: Device): HTMLElement | undefined;
  preset(value: string | unknown, f: EnumFeature, d: Device): HTMLElement | undefined;
} = {
  linkquality(value: number, f, d) {
    if (typeof value === 'number')
    return span({ 
      update(this: HTMLSpanElement, v: number) {
        //if (v !== value) {
          value = v;
          this.style.opacity = `${value/f.value_max}`;
        //}
        return this;
      },
    }, '\uD83D\uDCF6').update(value);
  },
  local_temperature(value, f, d) {
    return span({
      update(this: HTMLSpanElement, v: number) {
        if (v !== value) {
          value = v;
          this.textContent = `${value}+${f.unit}`;
        }
        return this;
      },
    },value + f.unit);
  },
  state(value, f, d) {
    return span({
      update(this: HTMLSpanElement, v: string) {
        if (v !== value) {
          value = v;
          (this.children[0] as HTMLInputElement).checked = Boolean(value === f.value_on);
        }
        return this;
      }      
    },
      input({
        type: 'checkbox',
        checked: Boolean(value === f.value_on),
        onclick: function (this: HTMLInputElement) {
          this.disabled = true;
          api.send(JSON.stringify({ topic: d.friendly_name + "/set", payload: { 'state': this.checked ? f.value_on : f.value_off } }));
        } as unknown as HTMLInputElement['onclick']
      }),
      f.description);
  },
  preset(value, f, d) {
    return block({ 
      update(this: HTMLSpanElement, v: string) {
        if (v !== value) {
          value = v;
          const radio = this.children.namedItem(v)?.firstElementChild as HTMLInputElement;
          radio.checked = true;
          radio.disabled = false;
        }
        return this;
      },
      title: f.description 
    }, ...f.values.filter(op => ['comfort','eco'].includes(op)).map(op => span({id: op},input({ 
      type: 'radio', 
      checked: value===op, 
      name: d.ieee_address,
      onclick: function(this: HTMLInputElement) {
        this.disabled = true;
        api.send(JSON.stringify({ topic: d.friendly_name + "/set", payload: { 'preset': op } }));
    } as unknown as HTMLInputElement['onclick']
    }),op)));
  }
};

class UIDevice {
  readonly element: HTMLElement;
  readonly features: { [name: string]: Feature };

  constructor(readonly device: Device) {
    this.features = {};
    if (device.definition?.exposes?.length) for (const f of device.definition.exposes) {
      const assignFeature = (f: Feature) => { if (f.property in f) debugger; this.features[f.property] = f };
      if ('features' in f) {
        f.features.forEach(assignFeature);
      } else {
        assignFeature(f);
      }
    }

    this.element = tr({ id: device.friendly_name },
      td({ id: 'name', style: 'white-space: nowrap;' }, device.friendly_name),
      td({ id: 'value', style: 'white-space: nowrap;' }, device.friendly_name === "Coordinator" ? a({
        href: 'http://' + z2mHost + '/'
      }, 'Manage...') : '')
    );

    devices.set(device.friendly_name, this);
  }

  update(payload: {}) {
    for (const [property, value] of Object.entries(payload)) {
      const feature = this.features[property];
      if (feature) {
        if (property in control) {
          let e = this.element.children.namedItem('value')?.children.namedItem(property);
          if (!e) {
            // @ts-ignore
            const f = control[property as keyof typeof control](value, feature, this.device);
            if (f) {
              f.id = property;
              this.element.children.namedItem('value')?.append(f);
            }
          } else {
            e.update(value);
          }
        } else {
          //state.push(div({ title: feature.description}, property, ' ', JSON.stringify(value)));
          console.log("FEATURE", this.device.friendly_name, property, value, feature)
        }
      } else {
        //console.log("NO FEATURE",this.device.friendly_name, property,value,this.features)
      }
    }
    return true;
  }
}

const devices = new Map<string, UIDevice>();

const api = new WebSocket("ws://" + z2mHost + "/api");
api.onerror = () => { if (confirm("WebSocket error. Press OK to re-connect")) window.location.reload() };
api.onopen = () => api.onmessage = (m => {
  const { topic, payload } = JSON.parse(m.data) as Z2Message;
  if (topic === 'bridge/devices') {
    ui('devices')!.innerHTML = '';
    devices.clear();
    for (const device of payload) {
      ui('devices')?.append(new UIDevice(device).element);
    }
  } else {
    if (!devices.get(topic)?.update(payload))
      console.log("OTHER MESSAGE", topic, payload);
  }
})

