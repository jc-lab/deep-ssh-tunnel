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

declare global {
  interface Window {
    appHandler: (type: string, data: any) => void;
    electronAPI: {
      connectSsh(params: NewConnectParams): Promise<ConnectResult>;
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
      // ok
    },
    exportConfig(): string {
      // ok
      return '';
    },
    addNewConnection() {
      this.newConnectionConnecting = true;
      window.electronAPI.connectSsh({
        via: this.newConnection.via,
        target: this.newConnection.target,
        username: this.newConnection.username,
        password: this.newConnection.password,
      })
        .then((result) => {
          console.log(result);
          if (result.result) {
            this.appStore.addConnection(result.connectionId, this.newConnection);
            this.newConnection = emptyNewConnection();
          } else {
            alert(result.message);
          }
        })
        .finally(() => {
          this.newConnectionConnecting = false;
        });
    },
    removeConnection(item: SshConnect) {
      this.appStore.removeConnection(item.target);
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
