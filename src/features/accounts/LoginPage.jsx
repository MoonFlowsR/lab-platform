import { platformSettings, loginLabel, loginHint } from '../../shared/lib/platform-settings.js';
import { useState } from "react";
import { styles, tabStyle } from "../../app/styles.js";
import { PLATFORM_TITLE, accountTypes } from "../../app/config.js";
import { Field, SearchableSelect } from "../../shared/components/ui.jsx";

function LoginPage({ onLogin, onRegister, message }) {
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).get("register") === "1" ? "register" : "login");
  const [form, setForm] = useState({ username: "", password: "", account_type: "student", student_code: "", teacher_code: "", finance_code: "", admin_code: "" });
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  return (
    <div className="platform-shell platform-login" style={styles.page}>
      <section style={styles.loginCard}>
        <h1 style={styles.title}>{PLATFORM_TITLE}</h1>
        <p style={styles.subtitle}>学生办理测试、加工、维修、采购入库、材料建库、出库退库及物品信息修改；教师审核指定工单、维护库存；财务核对团队工单、登记报销；管理员管理账号与团队数据。成员可查看团队记录、下载附件和导出数据。</p>
        <div style={styles.loginSwitch}>
          <button style={tabStyle(mode === "login")} onClick={() => setMode("login")}>账号登录</button>
          <button style={tabStyle(mode === "register")} onClick={() => setMode("register")}>账号注册</button>
        </div>
        <form style={styles.formGridOne} onSubmit={(e) => { e.preventDefault(); mode === "login" ? onLogin(form) : onRegister(form); }}>
          <Field required label={loginLabel}><input required style={styles.input} value={form.username} onChange={(e) => set("username", e.target.value)} placeholder={loginHint} /></Field>
          {mode === "register" && platformSettings.loginIdentifier === "identifier" && <Field required label="姓名"><input required style={styles.input} value={form.display_name || ""} onChange={e=>set("display_name",e.target.value)} placeholder="填写实际姓名，同名成员可使用不同登录账号" maxLength={80}/></Field>}
          <Field required label="密码"><input required type="password" style={styles.input} value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="至少 6 位" /></Field>
          {mode === "register" && <Field label="账号类型"><SearchableSelect required value={form.account_type} onChange={value => set("account_type", value)} options={accountTypes} placeholder="搜索或选择账号类型" /></Field>}
          {mode === "register" && form.account_type === "student" && <Field required label="学生注册码"><input required style={styles.input} value={form.student_code} onChange={(e) => set("student_code", e.target.value)} placeholder="由平台管理员提供" /></Field>}
          {mode === "register" && form.account_type === "teacher" && <Field required label="教师注册码"><input required style={styles.input} value={form.teacher_code} onChange={(e) => set("teacher_code", e.target.value)} placeholder="由平台管理员提供" /></Field>}
          {mode === "register" && form.account_type === "finance" && <Field required label="财务注册码"><input required style={styles.input} value={form.finance_code} onChange={(e) => set("finance_code", e.target.value)} placeholder="由平台管理员提供" /></Field>}
          {mode === "register" && form.account_type === "admin" && <Field required label="管理员注册码"><input required style={styles.input} value={form.admin_code} onChange={(e) => set("admin_code", e.target.value)} placeholder="由平台负责人提供" /></Field>}
          <button style={styles.primaryButton}>{mode === "login" ? "登录" : "注册"}</button>
        </form>
        {message}
        <div style={{ ...styles.securityBox, display: "flex", alignItems: "flex-end", gap: 12 }}><span style={{ flex: 1, minWidth: 0 }}>忘记密码请联系管理员重置。</span><a className="platform-login-help" href="/help">帮助文档</a></div>
      </section>
    </div>
  );
}
export { LoginPage };
