"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMqttServer = void 0;
const aedes_1 = __importDefault(require("aedes"));
function startMqttServer() {
    const persistence = require('aedes-persistence');
    const port = 1883;
    const aedes = new aedes_1.default({
        persistence: persistence()
    });
    const server = require('net').createServer(aedes.handle);
    server.listen(port, function () {
        console.log('Aedes MQTT listening on port: ' + port);
    });
}
exports.startMqttServer = startMqttServer;
