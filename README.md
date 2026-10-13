# 实验室管理平台

用于测试、加工、采购入库、库存、出库退库、审核与数据报表。数据保存在部署电脑，首次启动为空系统。成员的日常操作见平台内“帮助文档”。

## 安装与首次启动

1. 安装 [Node.js 24.x](https://nodejs.org/en/download)，保留 npm。
2. 点击 **Code → Download ZIP** 下载源码并解压。
3. 在包含 `package.json` 的目录打开终端，运行：

```sh
npm run setup
npm ci
npm run local
```

启动后打开 [http://localhost:3001/](http://localhost:3001/)。

`npm run setup` 会生成本机 `.env` 文件，其中包含密钥和三类账号的注册码。

首次使用按以下顺序注册：

- 管理员：使用 `ADMIN_INVITE_CODE`，首个管理员自动启用。
- 教师：使用 `TEACHER_INVITE_CODE`，由管理员启用。
- 学生：使用 `STUDENT_INVITE_CODE`，首次登录填写责任教师、指导教师和毕业年份。

账号使用中文姓名。名称、渠道等初始选项为空，录入时选“其它”添加。

## 日常运行

前台启动：

```sh
npm run server
```

关闭该终端会停止服务。检查运行状态时，在另一个终端运行 `npm run check`。

### Windows 后台运行

完成首次安装后，先按 **Ctrl+C** 停止前台服务，再运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/service.ps1 -Action Install
```

后台任务在 Windows 登录后运行，每分钟检查并恢复平台服务，无命令行窗口或弹窗。以后可双击 `start-platform.vbs` 启动。部署电脑须保持开机、联网和登录，关闭自动休眠。

停止后台服务并移除任务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/service.ps1 -Action Remove
```

## 跨网络访问

`localhost` 仅供部署电脑访问。让异地成员使用平台，需要准备公网服务器和域名，配置 FRP 隧道及 HTTPS：

```text
成员浏览器 → 域名 / HTTPS → 公网服务器 → FRP → 部署电脑上的平台
```

1. 域名的 DNS A 记录指向服务器公网 IP。
2. 服务器运行 `frps`；部署电脑运行 `frpc`，将平台的 `127.0.0.1:3001` 转发到服务器。
3. 服务器用 Caddy 或 Nginx 配置 HTTPS，并反向代理到 FRP 转发端口。
4. 为 FRP 单独配置后台启动和恢复；平台的后台任务只管理平台服务。
5. 用手机移动网络访问域名，检查登录、上传和下载。

数据库和附件仍保存在部署电脑。电脑关机、休眠、断网或隧道停止时，异地访问会中断。上传 GitHub 只发布源码，不会自动托管平台。

## 数据与备份

| 位置 | 内容 |
|---|---|
| `.env` | 密钥、注册码、服务配置 |
| `server/data/lab_platform.db` | 账号、业务、审批、评论与审计 |
| `server/uploads/` | 照片和附件 |
| `server/backups/` | 数据库备份及手动完整备份 |
| `server/logs/` | 运行日志 |

暂停上传和删除后运行 `npm run backup`，生成包含数据库、附件和 `.env` 的完整备份。每小时自动备份只有数据库。

恢复时先停止服务及后台任务，将备份中的数据库、附件和 `.env` 分别放回对应位置；清理旧数据库的 `-wal`、`-shm` 文件后再启动。更新程序时保留这些运行数据。

## 许可

[MIT License](LICENSE)
