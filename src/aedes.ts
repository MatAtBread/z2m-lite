import Aedes from 'aedes';

export function startMqttServer() {
    const persistence = require('aedes-persistence');
    const port = 1883;

    const aedes = new Aedes({
        persistence: persistence()
    });
    const server = require('net').createServer(aedes.handle);
    server.listen(port, function() {
        console.log('Aedes MQTT listening on port: ' + port)
    })
}