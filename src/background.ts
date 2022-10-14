'use strict'

import {app, BrowserWindow, ipcMain, protocol} from 'electron'
import {createProtocol} from 'vue-cli-plugin-electron-builder/lib'
import installExtension, {VUEJS3_DEVTOOLS} from 'electron-devtools-installer'
import {URL} from 'url';
import * as events from 'events';
import * as path from 'path';
import * as ssh2 from 'ssh2';
import * as net from 'net';
import * as uuid from 'uuid';
import * as dns2 from 'dns2';
import * as socksv5 from './node-socksv5/src/index';
import {
  AddTunnelParams,
  AddTunnelResult,
  ConnectResult,
  ConnectStatus,
  NewConnectParams,
  Tunnel,
  UpdateSshPayload
} from '@/model';
import {AddressType} from './node-socksv5/src/Destination';

const isDevelopment = process.env.NODE_ENV !== 'production'

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])

type SshConnectId = string;
type TunnelName = string;

class SshContext extends events.EventEmitter {
  public readonly connectConfig: ssh2.ConnectConfig;

  public sshClient!: ssh2.Client;
  public tunnels: TunnelContext[] = [];

  constructor(connectConfig: ssh2.ConnectConfig) {
    super();
    this.connectConfig = connectConfig;
  }
}

interface TunnelContext {
  sshContext: SshContext;
  name: TunnelName;
  target: string;
  localPort: number;
  localServer: net.Server;
}

function resolveHostnameOverSsh(sshClient: ssh2.Client, dnsServer: string, hostname: string): Promise<dns2.DnsResponse> {
  return new Promise<dns2.DnsResponse>((resolve, reject) => {
    console.log('resolveHostnameOverSsh: ', {dnsServer, hostname});
    const parsed = new URL(`tcp://${dnsServer}`);
    sshClient.forwardOut('127.0.0.1', 0, parsed.hostname, parseInt(parsed.port || '53'), (err, stream) => {
      if (err) {
        reject(err);
        return ;
      }
      const packet = new dns2.Packet();
      const request = (packet as any) as dns2.DnsRequest;
      (request.header as any).rd = 1;
      request.questions.push({
        name: hostname,
        class: dns2.Packet.CLASS.IN,
        type: dns2.Packet.TYPE.A,
      } as any);

      const message = packet.toBuffer();
      const len = Buffer.alloc(2);
      len.writeUInt16BE(message.length);
      stream.end(Buffer.concat([ len, message ]));
      (dns2.Packet as any).readStream(stream)
        .then((data: Buffer) => {
          if (data.length <= 0) {
            reject(new Error('Empty TCP response'));
          } else {
            resolve((dns2.Packet as any).parse(data));
          }
        })
        .catch((err: any) => reject(err));
    });
  });
}

class AppContext {
  private _sshContexts: Record<SshConnectId, SshContext> = {};
  private _tunnels: Record<TunnelName, TunnelContext> = {};

  start(params: any): Promise<void> {
    return Promise.resolve();
  }

  stop() {
    // aaa
  }

  connectSsh(params: NewConnectParams): Promise<ConnectResult> {
    const connectionId = params.connectionId || uuid.v4();

    const viaServer = params.via ? this._sshContexts[params.via] : null;
    if (params.via && !viaServer) {
      return Promise.resolve({
        result: false,
        message: 'no server',
        connectionId: '',
      });
    }

    const connectConfig: ssh2.ConnectConfig = {
      port: 22,
      username: params.username,
      password: params.password,
      readyTimeout: 1000,
    };

    const parsed = new URL(`ssh://${params.target}`);
    connectConfig.host = parsed.hostname;
    if (parsed.port) connectConfig.port = parseInt(parsed.port);

    const context = new SshContext(connectConfig);
    if (params.force) {
      this._sshContexts[connectionId] = context;
    }

    return new Promise<ConnectResult>((resolve, reject) => {
      let firstConnecting = true;
      const reconnect = () => {
        if (!firstConnecting) {
          this.emitSshUpdate({
            target: params.target,
            status: ConnectStatus.reconnecting,
          });
        }

        const connection = new ssh2.Client();
        connection
          .on('ready', () => {
            context.sshClient = connection;

            if (firstConnecting) {
              if (!params.force) {
                this._sshContexts[connectionId] = context;
              }

              firstConnecting = false;
              resolve({
                result: true,
                message: '',
                connectionId: connectionId,
              });
            } else {
              this.emitSshUpdate({
                target: params.target,
                status: ConnectStatus.connected,
              });
            }

            context.emit('ready');
          })
          .on('error', (err) => {
            if (firstConnecting) {
              firstConnecting = false;
              if (params.force) {
                resolve({
                  result: false,
                  message: err.message,
                  connectionId: connectionId,
                });
              } else {
                reject(err);
              }
            } else {
              this.emitSshUpdate({
                target: params.target,
                status: ConnectStatus.closed,
              });
              setTimeout(() => {
                reconnect();
              }, 1000);
            }
          });

        if (viaServer) {
          const doConnect = () => {
            viaServer.sshClient.forwardOut('127.0.0.1', 0, connectConfig.host as string, connectConfig.port || 22, (err, stream) => {
              if (err) {
                resolve({
                  result: false,
                  message: err.message,
                  connectionId: '',
                });
                return ;
              }
              connection.connect({
                ...connectConfig,
                host: undefined,
                port: undefined,
                sock: stream,
              });
            });
          };
          if (viaServer.sshClient) {
            doConnect();
          } else {
            viaServer.once('ready', () => {
              doConnect();
            });
          }
        } else {
          connection.connect(connectConfig);
        }
      };
      reconnect();
    });
  }

  disconnectSsh(connectionId: string): Promise<void> {
    const sshContext = this._sshContexts[connectionId];
    if (sshContext) {
      console.log('DISCONNECT ', connectionId);
      delete this._sshContexts[connectionId];

      sshContext.tunnels.forEach((tunnel) => {
        delete this._tunnels[tunnel.name];
        tunnel.localServer.close();
      });

      sshContext.sshClient.end();
    }
    return Promise.resolve();
  }

  addTunnel(params: AddTunnelParams): Promise<AddTunnelResult> {
    const sshContext = this._sshContexts[params.via];
    if (!sshContext) {
      return Promise.resolve({
        result: false,
        message: 'no connection',
        localPort: -1,
      });
    }
    return new Promise<AddTunnelResult>((resolve, reject) => {
      const tunnelContext: TunnelContext = {
        sshContext,
        name: params.name,
        target: params.target!,
        localPort: -1,
        localServer: null as any,
      };

      if (params.type === 'tcp') {
        const parsed = new URL(`tcp://${params.target}`);

        const localServer = net.createServer((localClient) => {
          localClient.on('error', (err) => {
            console.error(err);
          });
          sshContext.sshClient.forwardOut('127.0.0.1', 0, parsed.hostname, parseInt(parsed.port), (err, stream) => {
            if (err) {
              localClient.destroy(err);
            } else {
              localClient.pipe(stream).pipe(localClient);
            }
          });
        });

        localServer
          .on('error', (err) => {
            resolve({
              result: false,
              localPort: -1,
              message: err.message,
            });
          })
          .listen(params.localPort, '127.0.0.1', () => {
            const localPort = (localServer.address() as net.AddressInfo).port;
            tunnelContext.localPort = localPort;
            tunnelContext.localServer = localServer;

            this._tunnels[tunnelContext.name] = tunnelContext;
            sshContext.tunnels.push(tunnelContext);

            resolve({
              result: true,
              localPort,
              message: '',
            });
          });
      }
      else if (params.type === 'socksv5') {
        const proxyServer = new socksv5.Server({}, (info, accept, deny) => {
          return Promise.resolve()
            .then(() => {
              if (info.destination.type === AddressType.Name) {
                if (/(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}/.test(info.destination.host)) {
                  return info.destination.host;
                }
                return resolveHostnameOverSsh(sshContext.sshClient, params.dnsServer!, info.destination.host)
                  .then((dnsResp) => {
                    const answer = dnsResp.answers.find((v) => !!v.address);
                    if (answer) {
                      return answer.address!;
                    }
                    return Promise.reject(new Error('no answer'));
                  });
              }
              return info.destination.host!;
            })
            .then((host: string) => {
              return new Promise<void>((resolve, reject) => {
                sshContext.sshClient.forwardOut('127.0.0.1', 0, host, info.destination.port, (err, stream) => {
                  if (err) {
                    reject(err);
                    return ;
                  }
                  stream.on('error', (err: any) => {
                    console.error(err);
                  });
                  accept()
                    .then((clientSock) => {
                      stream.pipe(clientSock).pipe(stream);
                      resolve();
                    })
                    .catch((err) => {
                      console.error(err);
                    });
                });
              });
            })
            .catch((err) => {
              console.error(err);
              deny();
            });
        });
        proxyServer.on('error', (err) => {
          resolve({
            result: false,
            localPort: -1,
            message: err.message
          });
        });
        proxyServer.useAuth(socksv5.Auth.none());
        proxyServer.listen(params.localPort, '127.0.0.1', () => {
          const serverSocket: net.Server = ((proxyServer as any).serverSocket);
          const localPort = (serverSocket.address() as net.AddressInfo).port;

          tunnelContext.localPort = localPort;
          tunnelContext.localServer = serverSocket;
          this._tunnels[tunnelContext.name] = tunnelContext;
          sshContext.tunnels.push(tunnelContext);

          resolve({
            result: true,
            localPort,
            message: '',
          });
        });
      }
    });
  }


  emitError(message: string, closed?: boolean | undefined) {
    ipcMain.emit('app.event', 'error', {
      closed: closed,
      message: message
    });
  }

  emitSshUpdate(payload: UpdateSshPayload) {
    ipcMain.emit('app.event', 'ssh.update', payload);
  }
}

const appContext = new AppContext();

async function createWindow() {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      // // Use pluginOptions.nodeIntegration, leave this alone
      // // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      // nodeIntegration: nodeIntegration,
      // contextIsolation: !nodeIntegration,

      preload: path.join(__dirname, 'preload.js')
    }
  })

  ipcMain.handle('app.ssh.connect', (event, params: any) => {
    return appContext.connectSsh(params);
  });
  ipcMain.handle('app.ssh.disconnect', (event, params: any) => {
    return appContext.disconnectSsh(params);
  });
  ipcMain.handle('app.add-tunnel', (event, params: any) => {
    return appContext.addTunnel(params);
  });
  ipcMain.handle('app.listen.start', (event, params: any) => {
    return appContext.start(params);
  });
  ipcMain.on('app.listen.stop', (event) => {
    appContext.stop();
  });

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL as string)
    if (!process.env.IS_TEST) win.webContents.openDevTools()
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    win.loadURL('app://./index.html')
  }
}

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    try {
      await installExtension(VUEJS3_DEVTOOLS)
    } catch (e: any) {
      console.error('Vue Devtools failed to install:', e.toString())
    }
  }
  createWindow()
})

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      app.quit()
    })
  }
}
