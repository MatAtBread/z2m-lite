import { e, ui } from "./utils.js";

const div = e('div');
const row = e('div', { className: 'row' });

export class UIDevice {
  static devices = new Map<string, UIDevice>();
  readonly element: HTMLElement;

  constructor(id: string) {
    this.element = row({ id });
    UIDevice.devices.set(id, this);
    const devs = ui('devices')!;
    devs.append(
      ...[...UIDevice.devices.values()].sort(({ sortOrder: a }, { sortOrder: b }) => a == b ? 0 : a < b ? -1 : 1).map(d => d.element)
    );
  }

  get sortOrder() { return this.element.id; }

  toggleDeviceDetails() {
    if (this.element.nextElementSibling) {
      if (!this.element.nextElementSibling.id) {
        this.element.nextElementSibling.remove();
      } else {
        const details = this.showDeviceDetails();
        if (details) {
          this.element.parentElement?.insertBefore(div({ style: 'width: 100%' }, ...details), this.element.nextSibling);
        }
      }
    }
  }

  protected showDeviceDetails(): HTMLElement[] { return []; }
  update(payload: { [property: string]: unknown; }) { }
}
