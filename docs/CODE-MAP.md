# 代码导航

`src` 是浏览器端，`server` 是接口与数据库端。先按业务找到文件夹，再沿“页面 → 操作 → 服务 → 数据”修改。

| 业务 | 页面与前端操作 | 服务端实现 |
| --- | --- | --- |
| 账号、学生资料 | `src/features/accounts` | `server/routes/auth.cjs`、`server/features/accounts`、`server/services/operations/admin.cjs` |
| 财务身份与报销 | `src/features/finance` | `server/services/operations/finance.cjs`、`server/features/accounts/account-role.cjs`、`server/migrations/accounts-finance.cjs` |
| 测试、加工、维修 | `src/features/work` | `server/features/work`、`server/services/operations/work.cjs` |
| 采购与到货入库 | `src/features/purchases` | `server/services/operations/purchase.cjs` |
| 材料建库、批次修改 | `src/features/inventory` | `server/features/inventory`、`server/services/operations/inventory.cjs` |
| 出库、退库、采购人审批 | `src/features/stock` | `server/features/stock`、`server/services/operations/stock.cjs` |
| 总览与报表 | `src/features/dashboard`、`src/features/reports` | 共用业务记录与筛选规则 |
| 帮助、留言 | `src/features/help` | `server/features/help` |
| 外观主题 | `src/shared/components/ThemeSwitcher.jsx`、`src/shared/lib/theme.js` | 浏览器本地偏好，无服务端数据 |

浅色、深色与混合模式的颜色统一在 `src/styles/tokens.css` 定义；`index.html` 在加载页面前应用已保存的主题。登录页、工作台与帮助页共用切换控件，也可跟随系统明暗变化。

帮助正文在 `src/features/help/content.json`，按账号角色组织。改写正文时保留旧块编号，将原文归入 `history` 供评论回溯；新内容追加为当前块。报表帮助入口指向对应角色章节。正文同时用于服务端评论校验，更新后需重载服务，并检查 `help-export.test.cjs` 与 `tests/ui/help.mjs`。

测试、加工与维修：`request-sections.js`负责四类工单分组，`work-history.js`负责同学生、同项目、同机构的近半年记录及机构匹配，历史折叠栏仅在教师待审核工单中显示。`work-completion.cjs`校验最终信息与工单状态。`settlement_status`保存在工单记录中；已有未登记记录不自动补值。

`src/config/work-types.json`统一定义工单类型、页面、费用字段和编号前缀；维修复用测试加工流程，通过`cost_repair`单独统计费用。维修设备沿用`work_content`，维修人员保存为`repair_personnel`，维修人员单位沿用`external_unit`，计量单位默认“次”，其它单位从已保存维修记录补入菜单；专有字段由`repair-fields.cjs`校验。

到货确认与最终金额：`server/features/inventory/inbound-confirmation.cjs` 校验入库确认和工单状态；`src/features/purchases/purchase-values.js` 统一金额口径、到货数量及修改明细。

库存采购渠道联动：`server/features/inventory/purchase-supplier.cjs` 通过批次关联采购单同步渠道，与库存修改、流水及审计共用事务；`src/shared/components/SupplierChangeHistory.jsx` 展示两处修改记录。

## 公共部分

| 文件或目录 | 职责 |
| --- | --- |
| `src/App.jsx` | 登录状态、同步数据与页面装配 |
| `src/shared/components` | 搜索下拉、筛选、日期、表格、弹窗和附件控件 |
| `src/shared/api` | 请求、增量同步、图片压缩与下载 |
| `src/shared/lib` | 身份筛选、表格导出、编号等纯函数 |
| `src/styles`、`src/app/styles.js` | 全局样式和共享外观 |
| `src/config/platform-settings.json` | 标题、房间、毕业年份范围、登录标识方式 |
| `src/config/dropdown-options.json` | 基础菜单、材料别名与规格；业务新增选项仍从数据库读取 |
| `server/runtime.cjs` | 组装数据库、认证、权限及业务依赖 |
| `server/routes` | 路由与鉴权；`ops.cjs`按明确操作名分发 |
| `server/db` | 表结构、记录读写与编号 |
| `server/queries` | 业务快照、管理员日志筛选 |
| `server/services` | 同步、变更通知、备份、启动及关联删除 |
| `server/security` | 登录限流、会话撤销、学生到期停用和请求限制 |
| `server/migrations`、`server/legacy` | 现有部署的数据兼容；删除前查调用及历史数据 |
| `tests/features`、`tests/security` | 业务一致性、身份匹配与安全回归测试 |
| `tests/ui/platform.mjs` | 使用虚构数据检查四种角色及电脑、手机页面 |
| `scripts` | 构建、备份和更新工具 |

## 改动顺序

1. 先确认业务操作名和数据字段，再改相应页面与服务；读写权限由服务端检查。
2. 库存、审批、附件绑定及审计的关联写入放在同一个数据库事务中。
3. 修改筛选时同步检查屏幕、统计和 Excel 导出；姓名筛选使用账号身份，全文搜索使用文本。
4. 新增重要流程后补对应业务测试，并更新角色帮助。旧帮助引用按原索引保留为`history`，避免既有评论失去位置。

数据库、上传文件和部署配置是运行数据，不放进业务源码目录。

表格导出：`export-columns.js` 定义各业务的中文列和数据口径，`xlsx-export.js` 生成带筛选、冻结表头的工作簿，`table-export.js` 处理 Excel 下载；数据报表由 `report-export.js` 复用相同列定义，生成多工作表 Excel。

教师默认查看范围由 `server/features/accounts/view-scope.cjs` 读取数据库 `platform_settings` 的 `account_view_scope:<账号ID>`；值为 `all` 时首页及工单默认查看全组，否则沿用本人范围。该设置随数据库备份，不改变审批权限。

日志操作端：`server/db/records.cjs`统一写入`audit_logs.client_type`；`server/security/audit-client.cjs`识别请求与旧记录，`src/shared/api/client-platform.js`补充手机、平板和PC的浏览器终端信息。管理员日志页面、搜索和Excel共用接口返回的操作端；原浏览器信息保留，旧日志在读取时识别。

记录折叠：`RecentRecords.jsx`统一卡片、表格的最新一条显示与展开入口；受控组件`RecordVisibility`供报表和账号列表复用，数量取当前筛选结果，导出使用完整数据。

撤回测试的教师显示规则由`review-scope.js`的`workRecordVisible`统一处理，总览、工单、近半年历史与报表使用同一数据集；学生重提与审计记录保留。

角色待办：`src/features/tasks/task-model.js`从同步记录派生个人任务、团队跟进和库存预警，共用现有审批、完成和报销条件。`moduleTaskGroup`汇总模块待办，供角标和处理列表共用。`TaskCenter.jsx`显示入口与筛选提示；`Dashboard.jsx`显示任务、进度和提醒。`App.jsx`清除旧筛选、按记录ID打开对应待办；从提示栏可进入新建和历史记录。完整统计与导出由`features/reports`及`dashboard-metrics.js`负责。

界面布局、设计变量和双端验证入口见 [界面维护](UI-GUIDE.md)。

批次信息修改权限：`src/features/inventory/batch-edit-policy.js` 供前后端共用。学生仅可在原采购单完成入库后的48小时内修改对应批次；服务端在库存修改事务中复核，前端按到期时间收起入口。

版本记录：`scripts/release.cjs` 校验并准备大、中、小版本，统一更新包版本、`src/config/release-history.json` 和 `docs/CHANGELOG.md`；侧栏直接读取版本与累计次数，构建时检查一致性。操作见 [版本与更新记录](MAINTENANCE.md#版本与更新记录)。

更新日志：`src/features/updates/UpdateHistory.jsx` 读取通用记录，提供日期分组、搜索和排序，由使用帮助中“平台维护”后的同级板块进入；侧栏版本仅显示文本。
