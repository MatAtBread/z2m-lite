/**
 * @typedef {import('../src/rules').State} State
 * @typedef {import('../src/rules').Publisher} Publisher
 * */

/**
 * @param {string} update
 * @param {State} state
 * @param {Publisher} publish
 */

function isTrv(value) {
    return value && 'local_temperature' in value && 'current_heating_setpoint' in value
        && 'system_mode' in value && 'position' in value
}

let lastUpdate = '';
// Prevent recursive calls to this rule
if (!update.includes('/set') && isTrv(state[update])) {
    const trvs = Object.entries(state).filter(([key, value]) => isTrv(value));

    const positions = trvs.map(([name,state]) => state.position).filter(pos => typeof pos === 'number' && !isNaN(pos));
    const position = Math.max(...positions);
    const atTemp = trvs
        .filter(([name,state]) => state.system_mode.toLowerCase() === 'heat' || state.system_mode.toLowerCase() === 'auto')
        .map(([name,state]) => typeof state.local_temperature !== 'number'
            || typeof state.current_heating_setpoint !== 'number'
            || state.local_temperature >= state.current_heating_setpoint);

    let desired = '';

    if (position < 5 || atTemp.every(f => f)) {
        desired = 'OFF';
    }
    else {
        desired = 'ON';
    }


    const current = state["zigbee2mqtt/Central Heating"]?.state_l3;
    console.log("TRVs: ", trvs.map(([name]) => name), "\nposition: ", position, "\natTemp: ", atTemp, "\ndesired: ", desired, "\ncurrent: ", current);
    if (desired && current && desired !== current /*&& desired !== lastUpdate*/) {
        publish('zigbee2mqtt/Central Heating/set', { "state_l3": lastUpdate = desired });
    }
}

