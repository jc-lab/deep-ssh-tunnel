<template>
  <div>
    <h1>DEEP SSH TUNNEL</h1>
    <table style="width: 100%">
      <tr>
        <th>VIA</th>
        <th>TARGET</th>
        <th>USERNAME</th>
        <th>PASSWORD | ETC</th>
        <th>ACTION</th>
      </tr>
      <tr>
        <td>
          <select v-model="newConnection.via">
            <option value="">NOTHING</option>
            <option v-for="(item, seq) in connections" :key="`tunnel-${seq}`" :value="item.connectionId">{{item.target}} ({{item.connectionId}})</option>
          </select>
        </td>
        <td><input type="text" v-model="newConnection.target" placeholder="hostname:port or alias:NAME" /></td>
        <td><input type="text" v-model="newConnection.username" placeholder="username" /></td>
        <td><input type="password" v-model="newConnection.password" placeholder="password" /></td>
        <td><button @click="addNewConnection" :disabled="newConnectionConnecting">CONNECT</button></td>
      </tr>
      <template v-for="(item, seq) in connections" :key="`ssh-connect-${seq}`">
        <tr>
          <td colspan="5"><hr /></td>
        </tr>
        <tr>
          <td>{{item.via}}</td>
          <td>{{item.target}} ({{item.connectionId}})</td>
          <td>{{item.username}}</td>
          <td>{{item.status}}</td>
          <td><button @click="removeConnection(item)">REMOVE</button></td>
        </tr>
        <tr>
          <td colspan="5"><ConnectItem :connection-id="item.connectionId" /></td>
        </tr>
      </template>
    </table>
    <hr />
    <div>
      <div>
        <button @click="configJson = exportConfig()">EXPORT</button>
        <button @click="importConfig(configJson)">IMPORT</button>
      </div>
      <textarea style="width: 100%; min-height: 200px" v-model="configJson"></textarea>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ConnectItem from '@/component/ConnectItem.vue';
import {useAppStore} from '@/store/app';
import {AddTunnelParams, AddTunnelResult, ConnectResult, NewConnectParams, SshConnect, Tunnel} from "@/model";

interface ExportedTunnel {
  type: string;
  name: string;
  localPort: number;
  target?: string;
  dnsServer?: string;
}

interface ExportedConnection {
  connectionId: string;
  via: string;
  target: string;
  username: string;
  password: string;
  tunnels: ExportedTunnel[];
}

interface ExportedConfig {
  connections: ExportedConnection[];
}

declare global {
  interface Window {
    appHandler: (type: string, data: any) => void;
    electronAPI: {
      connectSsh(params: NewConnectParams): Promise<ConnectResult>;
      disconnectSsh(connectionId: string): Promise<void>;
      addTunnel(params: AddTunnelParams): Promise<AddTunnelResult>;
      appListenStart(params: any): Promise<void>;
      appListenStop(): void;
    }
  }
}

function emptyNewConnection(): NewConnectParams {
  return {
    via: '',
    target: '',
    username: '',
    password: '',
  };
}

export default defineComponent({
  name: 'App',
  components: {
    ConnectItem
  },
  setup() {
    const appStore = useAppStore();
    return {
      appStore
    };
  },
  data: () => ({
    newConnectionConnecting: false,
    newConnection: emptyNewConnection(),
    configJson: '{}',
  }),
  computed: {
    connections(): SshConnect[] {
      return this.appStore.sshConnects;
    },
    tunnels(): Tunnel[] {
      return this.appStore.tunnels;
    }
  },
  mounted() {
    window.appHandler = (type, data) => this.appHandler(type, data);
  },
  methods: {
    appHandler(type: string, data: any) {
      if (type === 'ssh.update') {
        this.appStore.updateSsh(data);
      }
    },
    importConfig(input: string) {
      const loadedConfig = JSON.parse(input) as ExportedConfig;

      loadedConfig.connections.forEach((c) => {
        const existingConnection = this.connections.find((v) => c.connectionId === v.connectionId);
        if (existingConnection) {
          // ok
        } else {
          this.pushConnection({
            connectionId: c.connectionId,
            via: c.via,
            target: c.target,
            username: c.username,
            password: c.password,
            force: true,
          })
            .then(() => {
              c.tunnels.forEach((t) => {
                const tunnelParams: AddTunnelParams = {
                  via: c.connectionId,
                  type: t.type as any,
                  name: t.name,
                  target: t.target,
                  dnsServer: t.dnsServer,
                  localPort: t.localPort
                };
                window.electronAPI.addTunnel(tunnelParams)
                    .then((tunnelResp) => {
                      console.log('tunnelResp', tunnelResp);
                      if (tunnelResp.result) {
                        this.appStore.addTunnel({
                          ...tunnelParams,
                          localPort: tunnelResp.localPort,
                        });
                      } else {
                        alert(tunnelResp.message);
                      }
                    });
              });
            });
        }
      });


      // ok
    },
    exportConfig(): string {
      // ok
      return JSON.stringify({
        connections: this.connections.map((v) => ({
          connectionId: v.connectionId,
          via: v.via,
          target: v.target,
          username: v.username,
          password: v.password,
          tunnels: this.tunnels.filter((t) => t.via === v.connectionId).map((t) => ({
            type: t.type,
            name: t.name,
            localPort: t.localPort,
            target: t.target,
            dnsServer: t.dnsServer,
          }))
        })),
      } as ExportedConfig, null, 2);
    },
    addNewConnection() {
      this.newConnectionConnecting = true;
      return this.pushConnection({
        via: this.newConnection.via,
        target: this.newConnection.target,
        username: this.newConnection.username,
        password: this.newConnection.password
      })
          .then(() => {
            this.newConnection = emptyNewConnection();
          })
          .finally(() => {
            this.newConnectionConnecting = false;
          });
    },
    removeConnection(item: SshConnect) {
      window.electronAPI.disconnectSsh(item.connectionId);
      this.appStore.removeConnection(item.target);
    },
    pushConnection(params: NewConnectParams) {
      return window.electronAPI.connectSsh(params)
          .then((result) => {
            console.log(result);

            this.appStore.addConnection(result.connectionId, params);

            if (!result.result) {
              alert(result.message);
            }

            return result;
          })
          .finally(() => {
            this.newConnectionConnecting = false;
          });
    }
  }
});
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}

.row {
  display: flex;
  flex-direction: column;
}

.col {
  display: flex;
  flex-direction: row;
}
</style>
