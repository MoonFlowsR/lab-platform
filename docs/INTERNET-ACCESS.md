# 跨网络共享：本机运行，成员通过域名访问

适合把平台和数据留在自己的Windows电脑，同时让成员用电脑或手机异地访问。默认的 `localhost` 只能在部署电脑打开；完成下面步骤后，成员使用自己的HTTPS域名登录。

```text
成员 → https://lab.example.org → 自有公网服务器上的Caddy
     → 服务器本机端口18080 → FRP隧道 → Windows电脑127.0.0.1:3001
```

数据库和附件文件保存在Windows电脑；公网服务器负责转发请求、上传和下载。此文中的域名、地址、密钥均为占位示例，**必须换成使用者自己的配置**。不会连接发布者的云服务器或域名。

## 1. 准备自己的环境

- 一台持续开机、联网的Windows电脑，已按README启动平台，并注册首个管理员。
- 一台有固定公网IP的Linux服务器，服务商不限；需要能管理服务器、防火墙和服务。
- 一个自己管理的域名，下面以 `lab.example.org` 为示例。
- 在服务器与Windows电脑从[FRP官方发行页](https://github.com/fatedier/frp/releases)安装同一稳定版本，分别选择对应系统和CPU架构。
- 在服务器按[Caddy官方安装说明](https://caddyserver.com/docs/install)安装Caddy，使用其系统服务运行。

云服务器、域名和带宽费用由部署者自行承担。若部署地区或服务商要求备案等手续，应先完成，具体按所选服务商要求办理。

## 2. 配置域名与服务器端口

在域名的DNS管理中，为自己的子域名添加 **A记录**，指向自己的服务器公网IPv4。未配置IPv6时不要另加AAAA记录。

在云安全组和服务器防火墙中放行TCP：

| 端口 | 用途 | 允许来源 |
|---|---|---|
| 80、443 | 网站与HTTPS证书 | 访问平台的成员 |
| 7000 | Windows电脑连接FRP服务器 | 尽量限定部署电脑的公网出口IP |

证书签发所需的80/443端口须能被证书机构访问。**18080和本机3001不开放到公网**；18080只监听服务器回环地址，网站统一通过HTTPS入口访问。7000若限定出口IP，换网后需要同步调整。

## 3. 在服务器运行FRP服务端

将 `frps` 放到 `/opt/lab-network/`，在同目录创建 `frps.toml`：

```toml
bindAddr = "0.0.0.0"
bindPort = 7000
proxyBindAddr = "127.0.0.1"
allowPorts = [{ single = 18080 }]
auth.method = "token"
auth.token = "REPLACE_WITH_YOUR_OWN_RANDOM_TOKEN"
transport.tls.force = true
```

两端的 `auth.token` 要填同一个独立随机密钥，至少32个字符。可在已安装Node.js的电脑生成，再私下填入两端配置：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

密钥和真实隧道配置不要上传GitHub。校验后先前台运行：

```sh
/opt/lab-network/frps verify -c /opt/lab-network/frps.toml
/opt/lab-network/frps -c /opt/lab-network/frps.toml
```

确认正常后，先停止这个前台进程，再按照[FRP的systemd说明](https://gofrp.org/en/docs/setup/systemd/)设置开机启动与异常重启。服务的 `ExecStart` 使用上述完整路径，并设置 `Restart=always`、`RestartSec=5`。不要同时启动两份frps。

## 4. 在Windows电脑运行FRP客户端

保持平台 `.env` 的 `HOST=127.0.0.1`、`PORT=3001`，无需把平台监听地址改成公网地址。将 `frpc.exe` 放到 `C:\lab-network\`，创建 `C:\lab-network\frpc.toml`：

```toml
serverAddr = "YOUR_SERVER_PUBLIC_IP"
serverPort = 7000
loginFailExit = false
auth.method = "token"
auth.token = "REPLACE_WITH_YOUR_OWN_RANDOM_TOKEN"
transport.tls.enable = true

[[proxies]]
name = "lab-platform"
type = "tcp"
localIP = "127.0.0.1"
localPort = 3001
remotePort = 18080
```

将 `serverAddr` 改为自己的服务器公网IP，密钥与服务器一致。若修改了平台PORT，`localPort`也须同步修改。使用PowerShell校验并启动：

```powershell
C:\lab-network\frpc.exe verify -c C:\lab-network\frpc.toml
C:\lab-network\frpc.exe -c C:\lab-network\frpc.toml
```

客户端显示登录成功、代理启动成功后，在Linux服务器执行：

```sh
curl -f http://127.0.0.1:18080/api/health
```

返回 `"ok":true` 才继续设置网站入口；失败时先检查本机平台、FRP密钥、7000端口和两端日志。

## 5. 在服务器配置HTTPS入口

在Caddy安装的配置文件中，例如 `/etc/caddy/Caddyfile`，添加自己的域名：

```caddyfile
lab.example.org {
    reverse_proxy 127.0.0.1:18080
}
```

将 `lab.example.org` 换成自己的实际域名。先校验，再重新加载：

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

DNS正确、服务器80/443可达时，Caddy会为实际域名自动申请及续期HTTPS证书。参见[Caddy反向代理](https://caddyserver.com/docs/quick-starts/reverse-proxy)和[自动HTTPS](https://caddyserver.com/docs/automatic-https)。该示例域名不会为你提供实际服务。

## 6. 保持平台和隧道运行

Windows平台按README安装静默后台任务，它只管理Node.js平台，**不会自动管理这里另行安装的frpc**。FRP客户端还须单独配置启动与恢复。

可以在Windows任务计划程序创建自己的FRP任务：

1. 选择运行账号，配置“无论用户是否登录都要运行”，保存时按系统要求提供该账号凭据。
2. 触发器选择“启动时”；操作的程序填 `C:\lab-network\frpc.exe`，参数填 `-c C:\lab-network\frpc.toml`，起始目录填 `C:\lab-network`。
3. 设置取消运行时间限制；已有实例运行时不启动新实例；失败后每1分钟重新启动，重试次数设为系统允许的较大值。
4. 联通测试通过后停止手动启动的frpc，再运行计划任务，确认服务器健康检查仍成功。

`loginFailExit=false`使初次断网时客户端继续重试；任务重启设置用于进程退出后的恢复。平台任务和FRP任务应分别检查。电脑关闭、休眠、网络中断或公网服务器停机时，其他成员无法访问；任何监测都无法代替开机和联网。建议为部署电脑关闭自动休眠，并避免使隧道依赖个人VPN。

## 7. 验证异地使用与定位故障

用手机关闭Wi-Fi，通过移动网络打开 **自己的 `https://域名/`**；检查登录、同步、上传与附件下载。成员用各自账号注册，注册码由部署者私下发放，不公开发布。

| 现象 | 检查位置 |
|---|---|
| 本机localhost打不开 | 平台进程、端口及 `npm run check` |
| 本机正常，服务器18080不通 | frpc/frps、密钥、7000端口、电脑网络 |
| 18080正常，域名打不开 | DNS、80/443、防火墙、Caddy及证书 |
| 域名出现502 | Caddy到18080、FRP隧道和本机平台链路 |

先定位失败的一段，再修复对应服务，无需反复重启所有组件。以上为按官方配置编写的部署说明；实际公网联通取决于使用者自己的服务器、DNS和网络设置，本开源包不提供预设公网服务。
