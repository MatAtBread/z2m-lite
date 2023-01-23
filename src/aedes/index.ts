const aedes = require('aedes')();
const server = require('aedes-server-factory').createServer(aedes, { ws: true });
server.listen(1883, function () {
    console.log('aedes MQTT/WS server listening on port ', 1883);
});
