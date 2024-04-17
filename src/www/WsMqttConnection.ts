export class WsMqttConnection {
  private socket: WebSocket | null = null;
  private reconnect = document.getElementById('reconnect');
  constructor(wsHost: string, readonly onmessage: (p: MessageEvent<any>) => void) {
    this.reconnect!.onclick = () => this.connect(wsHost);
    this.connect(wsHost);
  }

  private connect(z2mHost: string) {
    this.reconnect!.style.display = 'none';
    this.socket = new WebSocket("ws://" + z2mHost + "/api");
    this.socket.onerror = () => this.promptReconnect();
    this.socket.onclose = () => this.promptReconnect();
    this.socket.onmessage = (ev) => this.onmessage(ev);
  }

  reconnected() {
    this.reconnect!.style.display = 'none';
  }

  promptReconnect() {
    if (this.socket) {
      this.socket.onclose = this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
    this.reconnect!.style.display = 'inline-block';
  }
  send(topic: string, payload: unknown) {
    try {
      this.socket!.send(JSON.stringify({ topic, payload }));
    } catch (ex) {
      this.promptReconnect();
    }
  }
}

