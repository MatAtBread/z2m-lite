export class WsMqttConnection {
    reconnect;
    onmessage;
    socket = null;
    constructor(wsHost, reconnect, onmessage) {
        this.reconnect = reconnect;
        this.onmessage = onmessage;
        reconnect.onclick = () => this.connect(wsHost);
        this.connect(wsHost);
    }
    connect(z2mHost) {
        this.reconnect.style.display = 'none';
        this.socket = new WebSocket("ws://" + z2mHost + "/api");
        this.socket.onerror = () => this.promptReconnect();
        this.socket.onclose = () => this.promptReconnect();
        this.socket.onmessage = (ev) => this.onmessage(ev);
    }
    promptReconnect() {
        if (this.socket) {
            this.socket.onclose = this.socket.onerror = null;
            this.socket.close();
            this.socket = null;
        }
        this.reconnect.style.display = 'inline-block';
    }
    send(topic, payload) {
        try {
            this.socket.send(JSON.stringify({ topic, payload }));
        }
        catch (ex) {
            this.promptReconnect();
        }
    }
}
