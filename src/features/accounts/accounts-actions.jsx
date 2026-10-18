import { loginHint } from '../../shared/lib/platform-settings.js';
import { apiPost, callAccountAuth, callLabOps, clearStoredAccount, saveStoredAccount } from "../../app/api.js";
import { displayStudentAccount } from "./student-name-display.js";
import { isValidLoginId } from "../../app/formatters.js";
import { accountTypeLabels } from "../../app/config.js";
import { showAlert, showConfirm } from "../../shared/components/platform-dialog.jsx";

export function createAccountsActions({ currentUser, setCurrentUser, setAccountSettingsOpen, setMessage, loadAll, isAdmin, setSessionChecked, setActiveTab, setModuleRanges, setModuleStudents, setModuleReviewScopes, setPurchaseViewScope, setStockViewScope, setStockMovementType, setInventoryCategory, setModuleTeachers, setQuery, setEditingBatch, setWorkRequests, setReviewLogs, setMaterials, setMaterialBatches, setPurchaseRequests, setStockTransactions, setStockOutRequests, setAttachments, setAccounts }) {
async function saveMyStudentProfile(form) {
    const result = await apiPost('profile/save', form, currentUser.session_token);
    const account = displayStudentAccount({ ...result.account, session_token: currentUser.session_token });
    setCurrentUser(account); saveStoredAccount(account); setAccountSettingsOpen(false); setMessage('个人信息已保存。');
    if (!currentUser.profile_required) await loadAll();
  }

async function saveMyPassword(values) {
    await callLabOps('changeMyPassword', { old_password: values.old_password.trim(), new_password: values.new_password.trim() }, currentUser);
    logoutAccount(); setMessage('密码已修改，请使用新密码重新登录。');
  }

async function adminSetAccountStatus(row, status) {
    if (!isAdmin) return showAlert("只有管理员账号可以操作账号状态。");
    if (!await showConfirm(`确定将账号“${row.display_name || row.username}”设置为 ${status === "active" ? "启用" : status === "pending" ? "待审核" : "停用"} 吗？`)) return;
    try {
      await callLabOps("adminSetAccountStatus", { id: row.id || row._id, status }, currentUser);
      setMessage("账号状态已更新。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

async function adminResetPassword(row) {
    if (!isAdmin) return showAlert("只有管理员账号可以重置密码。");
    if (!await showConfirm(`确定将账号“${row.display_name || row.username}”的密码重置为 123456？该账号在所有设备上的登录也将失效。`, { title: '重置密码确认', confirmText: '确认重置' })) return;
    try {
      const resettingSelf = String(row.id || row._id) === String(currentUser._id || currentUser.id);
      await callLabOps("adminResetPassword", { id: row.id || row._id }, currentUser);
      if (resettingSelf) { logoutAccount(); setMessage("密码已重置为 123456，请重新登录后修改密码。"); return; }
      setMessage("密码已重置为 123456，请通知对应用户登录后修改密码。");
      await loadAll();
    } catch (error) { showAlert(error.message || error); }
  }

async function registerAccount(form) {
    const username = form.username.trim();
    const password = form.password.trim();
    if (!username || !password) return showAlert("请填写姓名和密码。");
    if (!isValidLoginId(username)) return showAlert(loginHint);
    if (password.length < 6) return showAlert("密码至少 6 位。");
    if (form.account_type === "student" && !String(form.student_code || "").trim()) return showAlert("请填写学生注册码。");
    if (form.account_type === "teacher" && !String(form.teacher_code || "").trim()) return showAlert("请填写教师注册码。");
    if (form.account_type === "admin" && !String(form.admin_code || "").trim()) return showAlert("请填写管理员注册码。");
    try {
      const account = displayStudentAccount(await callAccountAuth("register", {
        username, display_name:form.display_name, password, account_type: form.account_type,
        student_code: form.student_code || "", teacher_code: form.teacher_code || "", admin_code: form.admin_code || ""
      }));
      if (account?.pending) {
        setCurrentUser(null);
        clearStoredAccount();
        setMessage(account.server_message || "账号已提交注册，待管理员审核通过后才能登录。");
        return;
      }
      setSessionChecked(false);
      setCurrentUser(account);
      saveStoredAccount(account);
      setActiveTab("dashboard"); setModuleRanges({}); setModuleStudents({}); setModuleReviewScopes({}); setPurchaseViewScope("mine"); setStockViewScope("mine"); setStockMovementType(""); setInventoryCategory(""); setModuleTeachers({}); setAccountSettingsOpen(false); setQuery("");
      setMessage(`注册成功，当前身份：${accountTypeLabels[account.account_type]}`);
    } catch (error) {
      showAlert(error.message || error);
    }
  }

async function loginAccount(form) {
    const username = form.username.trim();
    const password = form.password.trim();
    if (!username || !password) return showAlert("请输入姓名和密码。");
    if (!isValidLoginId(username)) return showAlert(loginHint);
    try {
      const account = displayStudentAccount(await callAccountAuth("login", { username, password }));
      setSessionChecked(false);
      setCurrentUser(account);
      saveStoredAccount(account);
      setActiveTab("dashboard"); setModuleRanges({}); setModuleStudents({}); setModuleReviewScopes({}); setPurchaseViewScope("mine"); setStockViewScope("mine"); setStockMovementType(""); setInventoryCategory(""); setModuleTeachers({}); setAccountSettingsOpen(false); setQuery("");
      setMessage(`登录成功，当前身份：${accountTypeLabels[account.account_type]}`);
    } catch (error) {
      showAlert(error.message || error);
    }
  }

function logoutAccount() {
    setAccountSettingsOpen(false); setEditingBatch(null); setSessionChecked(false);
    setWorkRequests([]); setReviewLogs([]); setMaterials([]); setMaterialBatches([]); setPurchaseRequests([]); setStockTransactions([]); setStockOutRequests([]); setAttachments([]); setAccounts([]);
    clearStoredAccount();
    setCurrentUser(null);
    setActiveTab("dashboard"); setModuleRanges({}); setModuleStudents({}); setModuleReviewScopes({}); setPurchaseViewScope("mine"); setStockViewScope("mine"); setStockMovementType(""); setInventoryCategory(""); setModuleTeachers({}); setAccountSettingsOpen(false); setQuery("");
    setMessage("已退出账号。");
  }
return { saveMyStudentProfile, saveMyPassword, adminSetAccountStatus, adminResetPassword, registerAccount, loginAccount, logoutAccount };
}
