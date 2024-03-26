import { HistoryChart } from './HistoryChart.js';
import { tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
const { tr, td, span } = tag();
export const Smets2Device = tr.extended({
    declare: {
        price(period, { energy }) {
            return '\u00A3' + (energy.import[period] * energy.import.price.unitrate + energy.import.price.standingcharge).toFixed(2);
        },
        showHistory() {
            this.nextElementSibling?.className == 'details'
                ? this.nextElementSibling.remove()
                : this.after(td({ colSpan: 6, className: 'details' }, this.details()));
        },
        details() {
            return undefined;
        }
    }
});
export const Glow = {
    electricitymeter: Smets2Device.extended({
        iterable: {
            payload: {}
        },
        declare: {
            get unitrate() { return this.payload?.electricitymeter.energy.import.price.unitrate; },
            get standingcharge() { return this.payload?.electricitymeter.energy.import.price.standingcharge; }
        },
        override: {
            details() {
                return HistoryChart({
                    topic: this.id,
                    yText: 'kW',
                    cumulative: true,
                    //scaleFactor: this.unitrate,
                    //offset: this.standingcharge,
                    views: {
                        "15m": {
                            metric: 'avg',
                            fields: ['electricitymeter.energy.import.cumulative'], // In kWh
                            intervals: 30,
                            period: 15
                        },
                        "4hr": {
                            metric: 'avg',
                            fields: ['electricitymeter.energy.import.cumulative'], // In kWh
                            intervals: 240,
                            period: 240
                        },
                        "Day": {
                            metric: 'avg',
                            fields: ['electricitymeter.energy.import.cumulative'], // In kWh
                            intervals: 24 * 4,
                            period: 24 * 60,
                        },
                        "Wk": {
                            metric: 'avg',
                            fields: ['electricitymeter.energy.import.cumulative'], // In kWh
                            intervals: 4 * 24,
                            period: 24 * 60,
                            segments: 7
                        },
                        "28d": {
                            metric: 'max',
                            type: 'bar',
                            fields: ['electricitymeter.energy.import.cumulative'], // In kWh
                            intervals: 28,
                            period: 28 * 24 * 60,
                        }
                    }
                });
            }
        },
        constructed() {
            return [
                td({ onclick: this.showHistory.bind(this) }, "\u26A1"),
                td({ onclick: this.showHistory.bind(this) }, this.payload.map(p => this.price('day', p.electricitymeter))),
                td({
                    colSpan: 3,
                    id: 'spotvalue',
                    style: { backgroundColor: this.payload.map(p => `hsl(${Math.max(Math.min(120, 120 - Math.floor(120 * (p.electricitymeter?.power?.value / 2))), 0)} 100% 44%)`) }
                }, span({ id: 'kWh' }, this.payload.map(p => `${p.electricitymeter?.power?.value} ${p.electricitymeter?.power?.units}`)), span({ id: 'cost' }, this.payload.map(p => `\u00A3${(p.electricitymeter?.power?.value * p.electricitymeter.energy.import.price.unitrate).toFixed(2)}/h`)))
            ];
        }
    }),
    gasmeter: Smets2Device.extended({
        iterable: {
            payload: {}
        },
        declare: {
            get unitrate() { return this.payload?.gasmeter.energy.import.price.unitrate; },
            get standingcharge() { return this.payload?.gasmeter.energy.import.price.standingcharge; }
        },
        override: {
            details() {
                return HistoryChart({
                    topic: this.id,
                    yText: 'kW',
                    cumulative: true,
                    //scaleFactor: this.unitrate,
                    //offset: this.standingcharge,
                    views: {
                        /*"4hr": {
                          fields: ['gasmeter.energy.import.cumulative'],
                          intervals: 240/30,
                          period: 240
                        },*/
                        "Day": {
                            metric: 'avg',
                            fields: ['gasmeter.energy.import.cumulative'],
                            intervals: 24 * (60 / 30),
                            period: 24 * 60,
                        },
                        "Wk": {
                            metric: 'avg',
                            fields: ['gasmeter.energy.import.cumulative'],
                            intervals: 24 * (60 / 30),
                            period: 24 * 60,
                            segments: 7
                        },
                        "28d": {
                            metric: 'max',
                            type: 'bar',
                            fields: ['gasmeter.energy.import.cumulative'],
                            intervals: 28,
                            period: 28 * 24 * 60,
                        }
                    }
                });
            }
        },
        constructed() {
            return [
                td({ onclick: this.showHistory.bind(this) }, "\u{1F525}"),
                td({ onclick: this.showHistory.bind(this) }, this.payload.map(p => this.price('day', p.gasmeter))),
                td("\u00A0"),
            ];
        }
    })
};
