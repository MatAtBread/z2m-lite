export function isDeviceAvailability(topic, payload) {
    return !!topic.match(/zigbee2mqtt\/.*\/availability/) && payload;
}
export function isGlowSensor(topic, payload) {
    return !!topic.match(/glow\/.*\/SENSOR\/(gasmeter|electricitymeter)/) && payload;
}
