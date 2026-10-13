import dropdownOptions from "./../dropdown-options.json";

const { purchaseItems, purchaseSuppliers, purchaseUnits } = dropdownOptions;
const API_BASE = "";
const accountTypes = [
  { value: "student", label: "学生账号" },
  { value: "teacher", label: "教师账号" },
  { value: "admin", label: "管理员账号" },
];
const accountTypeLabels = { student: "学生账号", teacher: "教师账号", admin: "管理员账号" };
const auditActionLabels = { updateMyStudentProfile: "修改个人信息", requireStudentProfiles: "启用个人资料及登录更新", renamePurchasePurposes: "更新使用目的名称", closeRejectedRequest: "关闭被驳回工单", updateMaterialBatchInformation: "修改物品信息", convertLegacyLongTermExpiry: "有效期改为长期" };
const auditActionLabel = action => auditActionLabels[action] || action;
const accountStatusLabels = { active: "启用中", pending: "待审核", disabled: "已停用" };
const PLATFORM_TITLE = "实验室管理平台";
const ACCOUNT_STORAGE_KEY = "lab_platform_account";
const AUTO_LOGOUT_MS = 30 * 60 * 1000;
const suppliers = [...new Set(Object.values(purchaseSuppliers).flat())];
export { ACCOUNT_STORAGE_KEY, API_BASE, AUTO_LOGOUT_MS, PLATFORM_TITLE, accountStatusLabels, accountTypeLabels, accountTypes, auditActionLabel, purchaseItems, purchaseSuppliers, purchaseUnits, suppliers };
