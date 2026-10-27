import {
  platformSettings,
  loginLabel,
  loginHint,
} from "../../shared/lib/platform-settings.js";
import { useState } from "react";
import { styles, tabStyle } from "../../app/styles.js";
import { accountTypes } from "../../app/config.js";
import PlatformTitle from "../../shared/components/PlatformTitle.jsx";
import { Field, SearchableSelect } from "../../shared/components/ui.jsx";
import Icon from "../../shared/components/Icon.jsx";
import ThemeSwitcher from "../../shared/components/ThemeSwitcher.jsx";

const roleDescriptions = [
  ["test", "学生", "申请与进度跟进，采购入库、材料建库、出退库与物品信息维护"],
  ["tasks", "教师", "审核指定工单，查看团队记录、维护库存"],
  ["reports", "财务", "核对最终金额与凭证，登记报销"],
  ["admin", "管理员", "管理账号，维护团队数据与操作记录"],
];

function LoginPage({ onLogin, onRegister, message }) {
  const [mode, setMode] = useState(() =>
    new URLSearchParams(window.location.search).get("register") === "1"
      ? "register"
      : "login",
  );
  const [form, setForm] = useState({
    username: "",
    password: "",
    account_type: "student",
    student_code: "",
    teacher_code: "",
    finance_code: "",
    admin_code: "",
  });
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  return (
    <div className="platform-shell platform-login" style={styles.page}>
      <section className="platform-login-layout">
        <div className="platform-login-intro">
          <div className="platform-login-brand">
            <Icon name="flask" size={27} />
            <span>实验室协作平台</span>
          </div>
          <h1><PlatformTitle /></h1>
          <p className="platform-login-lead">
            让每一次申请、协作和物品流转清晰有序。
          </p>
          <div className="platform-login-roles">
            {roleDescriptions.map(([icon, name, description]) => (
              <div key={name}>
                <Icon name={icon} size={20} />
                <div>
                  <strong>{name}</strong>
                  <p>{description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="platform-login-shared">
            成员可查看团队记录、下载附件和导出数据。
          </p>
        </div>
        <div className="platform-login-form">
          <div className="platform-login-form-heading">
            <div>
            <h2>{mode === "login" ? "欢迎回来" : "创建账号"}</h2>
            <p>
              {mode === "login"
                ? "登录后进入你的工作台"
                : "选择身份，填写管理员提供的注册码"}
            </p>
            </div>
            <ThemeSwitcher />
          </div>
          <div style={styles.loginSwitch}>
            <button
              type="button"
              aria-pressed={mode === "login"}
              style={tabStyle(mode === "login")}
              onClick={() => setMode("login")}
            >
              账号登录
            </button>
            <button
              type="button"
              aria-pressed={mode === "register"}
              style={tabStyle(mode === "register")}
              onClick={() => setMode("register")}
            >
              账号注册
            </button>
          </div>
          <form
            style={styles.formGridOne}
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              try {
                await (mode === "login" ? onLogin(form) : onRegister(form));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field required label={loginLabel}>
              <input
                required
                autoComplete="username"
                style={styles.input}
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                placeholder={loginHint}
              />
            </Field>
            {mode === "register" &&
              platformSettings.loginIdentifier === "identifier" && (
                <Field required label="姓名">
                  <input
                    required
                    style={styles.input}
                    value={form.display_name || ""}
                    onChange={(e) => set("display_name", e.target.value)}
                    placeholder="填写实际姓名，同名成员可使用不同登录账号"
                    maxLength={80}
                  />
                </Field>
              )}
            <Field required label="密码">
              <div className="platform-password-field">
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  style={styles.input}
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="至少 6 位"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "隐藏" : "显示"}
                </button>
              </div>
            </Field>
            {mode === "register" && (
              <Field label="账号类型">
                <SearchableSelect
                  required
                  value={form.account_type}
                  onChange={(value) => set("account_type", value)}
                  options={accountTypes}
                  placeholder="搜索或选择账号类型"
                />
              </Field>
            )}
            {mode === "register" && form.account_type === "student" && (
              <Field required label="学生注册码">
                <input
                  required
                  style={styles.input}
                  value={form.student_code}
                  onChange={(e) => set("student_code", e.target.value)}
                  placeholder="由平台管理员提供"
                />
              </Field>
            )}
            {mode === "register" && form.account_type === "teacher" && (
              <Field required label="教师注册码">
                <input
                  required
                  style={styles.input}
                  value={form.teacher_code}
                  onChange={(e) => set("teacher_code", e.target.value)}
                  placeholder="由平台管理员提供"
                />
              </Field>
            )}
            {mode === "register" && form.account_type === "finance" && (
              <Field required label="财务注册码">
                <input
                  required
                  style={styles.input}
                  value={form.finance_code}
                  onChange={(e) => set("finance_code", e.target.value)}
                  placeholder="由平台管理员提供"
                />
              </Field>
            )}
            {mode === "register" && form.account_type === "admin" && (
              <Field required label="管理员注册码">
                <input
                  required
                  style={styles.input}
                  value={form.admin_code}
                  onChange={(e) => set("admin_code", e.target.value)}
                  placeholder="由平台负责人提供"
                />
              </Field>
            )}
            <button disabled={busy} style={styles.primaryButton}>
              {busy ? "正在处理…" : mode === "login" ? "登录" : "注册"}
            </button>
          </form>
          {message}
          <details className="platform-login-mobile-roles">
            <summary>各角色可以做什么</summary>
            {roleDescriptions.map(([, name, description]) => (
              <p key={name}>
                <strong>{name}</strong> · {description}
              </p>
            ))}
            <p>成员可查看团队记录、下载附件和导出数据。</p>
          </details>
          <div
            style={{
              ...styles.securityBox,
              display: "flex",
              alignItems: "flex-end",
              gap: 12,
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              忘记密码请联系管理员重置。
            </span>
            <a className="platform-login-help" href="/help">
              帮助文档
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
export { LoginPage };
