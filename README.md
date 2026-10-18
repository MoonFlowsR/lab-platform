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

默认使用中文姓名登录。名称、渠道等初始选项为空，录入时选“其它”添加。

## 日常运行

前台启动：

```sh
npm run server
```

关闭该终端会停止服务。检查运行状态时，在另一个终端运行 `npm run check`。

### Windows 后台运行

完成首次安装后，先按 **Ctrl+C** 停止前台服务，以管理员身份打开 PowerShell，在项目目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/service.ps1 -Action Install
```

后台任务在 Windows 开机后运行，每分钟检查并恢复服务；注销桌面后仍运行，无命令行窗口或弹窗。以后可双击 `start-platform.vbs` 启动，重复启动不重启正常服务。部署电脑保持开机、联网，关闭休眠。

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
| `server/backups/` | 每小时的数据库快照，保留72份 |
| `server/logs/` | 运行日志 |
| 项目同级的`项目名-backups/` | 手动完整备份 |

运行 `npm run backup`，备份数据库、附件、配置、程序及构建并校验。自动备份只含数据库；完整备份另存一份到其他磁盘或私有存储。

恢复前停止服务和监测，先备份当前状态，再成套还原数据库与附件。程序更新及回滚步骤见 `docs/MAINTENANCE.md`。

## 配置与代码

`src/config/platform-settings.json`集中设置平台标题、房间、毕业年份范围及登录方式。`loginIdentifier`默认`name`；设为`identifier`后，注册时分别填写登录账号和姓名，可支持同名成员。现有账号标识保持不变。修改配置后重新构建、重载服务。

| 目录 | 用途 |
| --- | --- |
| `src/features` | 按账号、测试加工、采购、库存、出退库、报表、帮助划分的页面 |
| `src/shared` | 搜索、筛选、表格、同步及CSV等共享功能 |
| `server/features`、`server/services/operations` | 相应业务规则与数据库写操作 |
| `server/db`、`server/queries` | 数据存储、同步快照和日志查询 |
| `tests` | 业务、安全和手机/电脑界面检查 |
| `scripts` | 安装、构建、启动、备份和更新工具 |

具体入口见 `docs/CODE-MAP.md`。修改后运行 `npm run lint`、`npm test`、`npm run build`；界面检查先运行 `npx playwright install chromium`，再运行 `npm run test:ui`。

## 许可

[MIT License](LICENSE)
