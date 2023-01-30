import Aedes from 'aedes';
import { default as persistence } from 'aedes-persistence';
import { createServer } from 'net';

export function startMqttServer() {
    const port = 1883;

    const aedes = new Aedes({
        persistence: persistence()
    });
    const server = createServer(aedes.handle as any);
    server.listen(port, function() {
        console.log('Aedes MQTT listening on port: ' + port)
    })
}