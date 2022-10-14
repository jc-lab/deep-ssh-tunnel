<template>
  <div class="item-root" ref="root">
    <div class="card">
      <div style="font-size: 1.5em">
        ADD TUNNEL
        <select v-model="option">
          <option value="tcp">TCP</option>
          <option value="socksv5">SOCKSv5</option>
        </select>
        <button @click="addTunnel">ADD</button>
      </div>
      <div v-if="option === 'tcp'">
        <div class="row">
          <div>NAME : <input type="text" v-model="newTunnel.name" /></div>
          <div>TARGET : <input type="text" v-model="newTunnel.target" /></div>
          <div>LOCAL_PORT : <input type="number" v-model="newTunnel.localPort" /></div>
        </div>
      </div>
      <div v-if="option === 'socksv5'">
        <div class="row">
          <div>NAME : <input type="text" v-model="newSocks5.name" /></div>
          <div>TCP_DNS SERVER : <input type="text" v-model="newSocks5.dnsServer" /></div>
          <div>LOCAL_PORT : <input type="number" v-model="newSocks5.localPort" /></div>
        </div>
      </div>
    </div>
    <table>
      <tr>
        <th>OPTION</th>
        <th>NAME</th>
        <th>TARGET</th>
        <th>LOCAL PORT</th>
        <th>ACTION</th>
      </tr>
      <tr>
        <td colspan="5">
          ...
        </td>
      </tr>
      <tr v-for="(item, seq) in tunnels" :key="`${this.connectionId}-${seq}`">
        <td>{{item.type}}</td>
        <td>{{item.name}}</td>
        <td>{{item.target}}</td>
        <td>{{item.localPort}}</td>
      </tr>
    </table>
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue';
import {AddTunnelParams, AddTunnelResult, Tunnel} from "@/model";
import {useAppStore} from "@/store/app";
import {pinia} from "@/plugin/pinia";

export default defineComponent({
  name: 'ConnectItem',
  props: {
    connectionId: {
      type: String
    },
  },
  setup() {
    const appStore = useAppStore(pinia);
    return {
      appStore
    };
  },
  data: () => ({
    option: 'tcp',
    newTunnel: {
      name: '',
      target: '',
      localPort: 0,
      option: 'tcp'
    },
    newSocks5: {
      name: 'proxy',
      localPort: 0,
      dnsServer: '10.43.0.10:53',
    }
  }),
  computed: {
    tunnels(): Tunnel[] {
      return (this.appStore.tunnels as Tunnel[])
        .filter((v) => v.via === this.connectionId);
    }
  },
  methods: {
    addTunnel() {
      const params: AddTunnelParams = {
        type: this.option as any,
        via: this.connectionId!,
        name: '',
        localPort: 0,
      };
      if (this.option === 'tcp') {
        params.name = this.newTunnel.name;
        params.target = this.newTunnel.target;
        params.localPort = this.newTunnel.localPort;
      } else if (this.option === 'socksv5') {
        params.name = this.newSocks5.name;
        params.localPort = this.newSocks5.localPort;
        params.dnsServer = this.newSocks5.dnsServer;
      }
      console.log('addTunnel', params);
      window.electronAPI.addTunnel(params)
        .then((resp: AddTunnelResult) => {
          console.log(resp);
          if (resp.result) {
            this.appStore.addTunnel({
              ...params,
              localPort: resp.localPort,
            });
            this.newTunnel = {
              name: '',
              target: '',
              localPort: 0,
              option: 'tcp'
            };
          } else {
            alert(resp.message);
          }
        })
        .catch((err) => {
          console.error(err);
        });
    }
  }
});
</script>
<style>
.item-root {
  width: 100%;
  margin-left: 5em;
  display: flex;
  flex-direction: column;
  text-align: left;
}

.tunnels {
  padding-left: 1em;
  flex-grow: 1;
}

.tunnels input {
  width: 100%;
}
</style>
