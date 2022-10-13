import {defineStore} from 'pinia';
import {Tunnel, SshConnect, NewConnectParams, ConnectStatus, UpdateSshPayload, AddTunnelParams} from '@/model';

export const useAppStore = defineStore('app', {
  state: () => ({
    sshConnects: [] as SshConnect[],
    tunnels: [] as Tunnel[],
  }),
  actions: {
    addConnection(connectionId: string, params: NewConnectParams) {
      this.sshConnects.push({
        ...params,
        connectionId: connectionId,
        status: ConnectStatus.connected,
        tunnels: [],
      });
    },
    addTunnel(params: AddTunnelParams) {
      this.tunnels.push({
        ...params,
      });
    },
    removeConnection(target: string) {
      const index = this.sshConnects.findIndex((v) => v.target === target);
      if (index >= 0) {
        this.sshConnects.splice(index, 1);
      }
    },
    updateSsh(payload: UpdateSshPayload) {
      const instance = this.sshConnects.find((v) => v.target === payload.target);
      if (instance) {
        instance.status = payload.status;
      }
    }
  }
});
