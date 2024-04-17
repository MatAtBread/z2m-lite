
import { HistoryChart } from './HistoryChart.js';
import { EnergyImport, Energy, GlowSensorElectricity, GlowSensorGas } from './message-types.js';
import { ChildTags, tag } from './node_modules/@matatbread/ai-ui/esm/ai-ui.js';
import { BaseDevice } from './zdevices.js';

const { td, span } = tag();

export const Smets2Device = BaseDevice.extended({
    declare: {
      price(period: keyof EnergyImport, {energy}: Energy) {
        return '\u00A3'+(energy.import[period] * energy.import.price.unitrate + energy.import.price.standingcharge).toFixed(2)
      },
      showHistory() {
        this.nextElementSibling?.className == 'details' 
        ? this.nextElementSibling.remove() 
        : this.after(td({colSpan: 6, className: 'details'}, this.details()))        
      }
    },
    override:{
      details():ChildTags {
        return undefined;
      }
    }
  });

export const Glow = {
    electricitymeter: Smets2Device.extended({
      styles:`#spotvalue {
        border-radius: 1em;
        text-align: center;
        padding: 0.25em 1em;
        width: calc(100% - 14em);
      }
      #kWh {
        color: #334;
        font-weight: 700;
        margin: 0.5em;
      }
      #cost {
        color: white;
        margin: 0.5em;
      }`,
      iterable: {
        payload: {} as unknown as GlowSensorElectricity["payload"]
      },
      declare:{
        get unitrate():number { return this.payload?.electricitymeter.energy.import.price.unitrate },
        get standingcharge():number { return this.payload?.electricitymeter.energy.import.price.standingcharge }
      },
      override:{
        details():ChildTags {
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
              "Day":{
                metric: 'avg',
                fields: ['electricitymeter.energy.import.cumulative'], // In kWh
                intervals: 24 * 4,
                period: 24 * 60,
              },
              "Wk":{
                metric: 'avg',
                fields: ['electricitymeter.energy.import.cumulative'], // In kWh
                intervals: 4 * 24,
                period: 24 * 60,
                segments: 7
              },
              "28d":{
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
          td({ onclick: this.showHistory.bind(this) }, 
            this.payload.electricitymeter!.map!(p => this.price('day', p as Required<typeof p>))),
          td({ 
            colSpan: 3, 
            id: 'spotvalue', 
            style: { 
              backgroundColor: this.payload.electricitymeter.power.value.map!(p => `hsl(${Math.max(Math.min(120,120 - Math.floor(120 * (p / 2))),0)} 100% 44%)`) 
            } 
          }, 
            span({ id: 'kWh' }, 
              this.payload.electricitymeter!.power!.value, ' ', this.payload.electricitymeter!.power!.units), 
            span({ id: 'cost' }, 
              '\u00A3',
              this.payload!.electricitymeter!.map!(p => `${(p.power!.value * p.energy!.import.price.unitrate).toFixed(2)}`),
              '/h')
          )
        ]
      }
    }),
    
    gasmeter: Smets2Device.extended({
      iterable: {
        payload: {} as unknown as GlowSensorGas["payload"]
      },
      declare:{
        get unitrate():number { return this.payload?.gasmeter.energy.import.price.unitrate },
        get standingcharge():number { return this.payload?.gasmeter.energy.import.price.standingcharge }
      },  
      override:{
        details(){
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
              "Day":{
                metric: 'avg',
                fields: ['gasmeter.energy.import.cumulative'],
                intervals: 24 * (60/30),
                period: 24 * 60,
              },
              "Wk":{
                metric: 'avg',
                fields: ['gasmeter.energy.import.cumulative'],
                intervals: 24 * (60/30),
                period: 24 * 60,
                segments: 7
              },
              "28d":{
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
          td({ onclick: this.showHistory.bind(this) }, this.payload.gasmeter.map!(p => p && this.price('day', p as Required<typeof p>))),
          td("\u00A0"),
        ]
      }
    })
  }

