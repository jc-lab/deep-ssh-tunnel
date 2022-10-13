export interface Tunnel extends AddTunnelParams {
  type: 'tcp' | 'socksv5';
  name: string;
  via: string;
  localPort: number;
  target?: string;
  dnsServer?: string;
}

export enum ConnectStatus {
  connected = 'connected',
  reconnecting = 'reconnecting',
  closed = 'closed',
}

export interface NewConnectParams {
  via: string;
  target: string; // hostname:port or alias:XXXX
  username: string;
  password: string;
}

export interface ConnectResult {
  result: boolean;
  message: string;
  connectionId: string;
}


export interface AddTunnelParams {
  type: 'tcp' | 'socksv5';
  name: string;
  via: string;
  localPort: number;
  target?: string;
  dnsServer?: string;
}

export interface AddTunnelResult {
  result: boolean;
  message: string;
  localPort: number;
}

export interface SshConnect extends NewConnectParams {
  connectionId: string;
  status: ConnectStatus;
  tunnels: Tunnel[];
}

export interface UpdateSshPayload {
  target: string;
  status: ConnectStatus;
}
