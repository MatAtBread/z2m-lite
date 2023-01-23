/*const aedes = require('aedes')();
const server = require('aedes-server-factory').createServer(aedes, { ws: true });
server.listen(1883, function () {
    console.log('aedes MQTT/WS server listening on port ', 1883);
});
*/
import Aedes from 'aedes';
const port = 1883;
const wsPort = 8883;
const aedes = new Aedes();
const server = require('net').createServer(aedes.handle);
const httpServer = require('http').createServer()
const ws = require('websocket-stream')
ws.createServer({ server: httpServer }, aedes.handle)

server.listen(port, function() {
    console.log('Ades MQTT listening on port: ' + port)
})

httpServer.listen(wsPort, function () {
    console.log('Aedes MQTT-WS listening on port: ' + wsPort)
});
