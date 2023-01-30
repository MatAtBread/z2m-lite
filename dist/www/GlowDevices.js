import { createHistoryChart } from "./history.js";
import { UIDevice } from "./UIDevice.js";
import { e } from "./utils.js";
const [span, block] = [e('span'), e('div', { className: 'cell' })];
function price(period, { energy }) {
    return '\u00A3' + (energy.import[period] * energy.import.price.unitrate + energy.import.price.standingcharge).toFixed(2);
}
export const Glow = {
    electricitymeter: class extends UIDevice {
        cost;
        power;
        unitrate;
        constructor(id) {
            super(id);
            this.unitrate = 1;
            this.element.onclick = () => this.toggleDeviceDetails();
            this.element.append(block("\u26A1"), block({ id: 'day' }), block({ id: 'spotvalue' }, this.power = span({ id: 'kWh' }), this.cost = span({ id: 'cost' })));
        }
        update(payload) {
            this.unitrate = payload.electricitymeter.energy.import.price.unitrate;
            this.element.children.day.textContent = price('day', payload.electricitymeter);
            this.power.textContent =
                `${payload.electricitymeter?.power?.value} ${payload.electricitymeter?.power?.units}`;
            this.cost.textContent =
                `\u00A3${(payload.electricitymeter?.power?.value * payload.electricitymeter.energy.import.price.unitrate).toFixed(2)}/h`;
            const hue = Math.max(Math.min(120, 120 - Math.floor(120 * (payload.electricitymeter?.power?.value / 2))), 0);
            this.element.children.spotvalue.style.backgroundColor = `hsl(${hue} 100% 44%)`;
        }
        showDeviceDetails() {
            return createHistoryChart({
                topic: this.element.id,
                cumulative: true,
                hourlyRate: this.unitrate,
                metric: 'max',
                views: {
                    "15m": {
                        fields: ['electricitymeter.energy.import.cumulative'],
                        intervals: 30,
                        period: 15
                    },
                    "4hr": {
                        fields: ['electricitymeter.energy.import.cumulative'],
                        intervals: 240,
                        period: 240
                    },
                    "Day": {
                        fields: ['electricitymeter.energy.import.cumulative'],
                        intervals: 24 * 4,
                        period: 24 * 60,
                    },
                    "Wk": {
                        fields: ['electricitymeter.energy.import.cumulative'],
                        intervals: 4 * 24,
                        period: 24 * 60,
                        segments: 7
                    },
                    "28d": {
                        type: 'bar',
                        fields: ['electricitymeter.energy.import.cumulative'],
                        intervals: 28,
                        period: 28 * 24 * 60,
                    }
                }
            });
        }
    },
    gasmeter: class extends UIDevice {
        unitrate;
        constructor(id) {
            super(id);
            this.unitrate = 1;
            this.element.onclick = () => this.toggleDeviceDetails();
            this.element.append(block("\u{1F525}"), block({ id: 'day' }), block("\u00A0"));
        }
        update(payload) {
            this.unitrate = payload.gasmeter.energy.import.price.unitrate;
            this.element.children['day'].textContent = price('day', payload.gasmeter);
        }
        showDeviceDetails() {
            return createHistoryChart({
                topic: this.element.id,
                cumulative: true,
                hourlyRate: this.unitrate,
                metric: 'avg',
                views: {
                    /*"4hr": {
                      fields: ['gasmeter.energy.import.cumulative'],
                      intervals: 240/30,
                      period: 240
                    },*/
                    "Day": {
                        fields: ['gasmeter.energy.import.cumulative'],
                        intervals: 24 * (60 / 30),
                        period: 24 * 60,
                    },
                    "Wk": {
                        fields: ['gasmeter.energy.import.cumulative'],
                        intervals: 24 * (60 / 30),
                        period: 24 * 60,
                        segments: 7
                    },
                    "28d": {
                        type: 'bar',
                        fields: ['gasmeter.energy.import.cumulative'],
                        intervals: 28,
                        period: 28 * 24 * 60,
                    }
                }
            });
        }
    },
};
