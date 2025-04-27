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

function needsHeat(value) {
  return (value.system_mode === 'heat' || value.system_mode === 'auto')
    && value.current_heating_setpoint > value.local_temperature
    && value.position > 0
}

// Prevent recursive calls to this rule
if (!update.includes('/set') && isTrv(state[update])) {
  const trvs = Object.entries(state).filter(([key, value]) => isTrv(value));
  const desired = trvs.filter(([key, value]) => needsHeat(value)).length > 0 ? 'ON' : 'OFF';
  const current = state["zigbee2mqtt/Central Heating"]?.state_l3;

  console.log("TRVs: ", trvs.map(([name,value]) => [name,needsHeat(value)]), "\ndesired: ", desired, "\ncurrent: ", current);
  if (desired && current && desired !== current) {
    publish('zigbee2mqtt/Central Heating/set', { "state_l3": lastUpdate = desired });
  }
}

