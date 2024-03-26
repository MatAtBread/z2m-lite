export class WsMqttConnection {
    onmessage;
    socket = null;
    reconnect = document.getElementById('reconnect');
    constructor(wsHost, onmessage) {
        this.onmessage = onmessage;
        this.reconnect.onclick = () => this.connect(wsHost);
        this.connect(wsHost);
    }
    connect(z2mHost) {
        this.reconnect.style.display = 'none';
        this.socket = new WebSocket("ws://" + z2mHost + "/api");
        this.socket.onerror = () => this.promptReconnect();
        this.socket.onclose = () => this.promptReconnect();
        this.socket.onmessage = (ev) => this.onmessage(ev);
    }
    reconnected() {
        this.reconnect.style.display = 'none';
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
