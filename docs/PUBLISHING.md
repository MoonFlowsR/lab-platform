# 源码发布与隐私说明

## 发布什么

使用独立、已去隐私的源码目录创建一个**全新 Git 仓库**。不要将正在运行的平台目录整体上传，不要沿用其 `.git` 历史，也不要先上传真实数据再删除。已公开的数据可能保留在历史、克隆和分叉中，见 [GitHub敏感数据说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)。

本源码包已排除账号与业务数据库、照片附件、评论与审计数据、真实 `.env`、注册码、密钥、日志、备份、测试产物、旧版本源码快照和旧 Git 历史；机构名称、域名、专用材料与渠道目录、房间配置也已替换为通用空目录或明确的示例。

`.gitignore` 负责日常排除运行数据，`npm run privacy:check` 检查 Git 将提交的文件。不要用 `git add -f` 绕过忽略规则；GitHub网页拖拽上传也不会替你执行本机检查。

## 第一次发布到 GitHub

1. 在 GitHub 新建仓库，例如 `lab-platform`。最终需要开放给所有人时选择 Public；可先用 Private 核对内容。
2. 仓库保持空白，不另选 README、许可证或 `.gitignore`，这些文件已包含在源码包中。
3. 仅在本独立源码目录运行：

```sh
git init -b main
git config user.name "YOUR_PUBLIC_NAME"
git config user.email "YOUR_ID+YOUR_USERNAME@users.noreply.github.com"
git add .
npm run privacy:check
git diff --cached --stat
git diff --cached
git commit -m "Initial open-source release"
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

把地址和提交身份中的占位符换成自己的信息；隐私邮箱从 GitHub Settings → Emails 获取，并勾选 Keep my email addresses private 和 Block command line pushes that expose my email。设置仅保护后续提交；已有历史中的邮箱需要另行清理。Git身份应使用希望公开的名称和 GitHub隐私邮箱；不要使用本单位人员邮箱。检查暂存文件时应只有程序、通用说明、空配置示例和MIT许可证，没有运行数据。登录GitHub并推送由发布者本人完成。

也可用 GitHub Desktop 添加此独立目录，查看文件后提交并 Publish repository。步骤依据 [GitHub本地源码发布说明](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)。

## 持续更新

只同步功能代码和通用说明；实际账号、业务、附件、日志、配置和本单位目录留在私有运行实例。每次暂存后重新运行隐私检查并查看差异。发布ZIP、截图、报错日志和GitHub问题时同样去除私密内容。

MIT许可使别人能合法使用、修改和分发代码；它不授予任何实际数据库、照片、成员信息或私密配置。依据 [GitHub许可证说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)。
