import { platformSettings } from '../shared/lib/platform-settings.js';
import { actionName as auditActionLabel } from '../shared/lib/audit-labels.js';
import dropdownOptions from "../config/dropdown-options.json";

const { purchaseItems, purchaseSuppliers, purchaseUnits } = dropdownOptions;
const API_BASE = "";
const accountTypes = [
  { value: "student", label: "学生账号" },
  { value: "teacher", label: "教师账号" },
  { value: "admin", label: "管理员账号" },
];
const accountTypeLabels = { student: "学生账号", teacher: "教师账号", admin: "管理员账号" };
const accountStatusLabels = { active: "启用中", pending: "待审核", disabled: "已停用" };
const PLATFORM_TITLE = platformSettings.title;
const ACCOUNT_STORAGE_KEY = "surface_lab_account";
const AUTO_LOGOUT_MS = 30 * 60 * 1000;
const suppliers = [...new Set(Object.values(purchaseSuppliers).flat())];
export { ACCOUNT_STORAGE_KEY, API_BASE, AUTO_LOGOUT_MS, PLATFORM_TITLE, accountStatusLabels, accountTypeLabels, accountTypes, auditActionLabel, purchaseItems, purchaseSuppliers, purchaseUnits, suppliers };
