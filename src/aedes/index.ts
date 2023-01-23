const aedes = require('aedes')();
const server = require('aedes-server-factory').createServer(aedes);
server.listen(1883, function () {
    console.log('aedes MQTT server listening on port ', 1883);
});
