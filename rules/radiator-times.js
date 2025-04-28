/**
 * @typedef {import('../src/rules').State} State
 * @typedef {import('../src/rules').Publisher} Publisher
 * */

/**
 * @param {string} update
 * @param {State} state
 * @param {Publisher} publish
 */

const date = new Date();
const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
if (context.time !== time) {
  context.time = time;
  switch (time) {
    case '06:30':
      publish('zigbee2mqtt/Front room/set', { system_mode: "auto" });
      publish('zigbee2mqtt/Front window/set', { system_mode: "auto" });
      publish('FreeHouse/Bedroom left/set', { system_mode: "auto" });
      publish('FreeHouse/Bedroom right/set', { system_mode: "auto" });
      if (date.getDay() === 2 || date.getDay() === 3 || date.getDay() === 4) {
        publish('zigbee2mqtt/Ivana Office/set', { system_mode: "auto" });
      }
      break;
    case '17:00':
      publish('zigbee2mqtt/Ivana Office/set', { system_mode: "off" });
      break;
    case '21:00':
      publish('zigbee2mqtt/Front room/set', { system_mode: "off" });
      publish('zigbee2mqtt/Front window/set', { system_mode: "off" });
      publish('zigbee2mqtt/Ivana Office/set', { system_mode: "off" });
      break;
  }
}
