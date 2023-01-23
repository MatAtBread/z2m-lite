"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*const aedes = require('aedes')();
const server = require('aedes-server-factory').createServer(aedes, { ws: true });
server.listen(1883, function () {
    console.log('aedes MQTT/WS server listening on port ', 1883);
});
*/
const aedes_1 = __importDefault(require("aedes"));
const port = 1883;
const wsPort = 8883;
const aedes = new aedes_1.default();
const server = require('net').createServer(aedes.handle);
const httpServer = require('http').createServer();
const ws = require('websocket-stream');
ws.createServer({ server: httpServer }, aedes.handle);
server.listen(port, function () {
    console.log('Ades MQTT listening on port: ' + port);
});
httpServer.listen(wsPort, function () {
    console.log('Aedes MQTT-WS listening on port: ' + wsPort);
});
