import useBatchEditPermission from './features/inventory/use-batch-edit-permission.js';
import PageBoundary from './shared/components/PageBoundary.jsx';
import Workspace from './app/Workspace.jsx';
import PageSearch from './shared/components/PageSearch.jsx';
import PageLoading from './shared/components/PageLoading.jsx';
import { purchaseSupplierOptions, matchesPurchaseSupplier } from "./features/purchases/purchase-filter.js";
import { useCallback, useEffect, useEffectEvent, useMemo, useState, lazy, Suspense } from "react";
import { apiPost, clearStoredAccount, getStoredAccount, saveStoredAccount } from "./app/api.js";
import { usePageSearchHighlight } from "./shared/hooks/page-search-highlight.js";
import { recordMatchesStudent, studentFilterModules } from "./shared/lib/student-filter.js";
import { createTeacherContext, inventorySearchFlags, recordMatchesTeacher, recordTeacherNames, requestSearchIndex } from "./shared/lib/teacher-filter.js";
import { createSyncController } from "./shared/api/sync-controller.js";
import { createStudentNameDisplay, displayStudentAccount, sameRows } from "./features/accounts/student-name-display.js";
import { containsQuery, sortByCreatedAt } from "./app/formatters.js";
import { AUTO_LOGOUT_MS } from "./app/config.js";
import { defaultViewScope, teacherScopeMatches, workScopeMatches, requestRecordVisible } from "./shared/lib/review-scope.js";
import { datedModules, recordInDateRange } from "./shared/lib/module-date.js";
import { chinaDate } from "./features/reports/report-data.js";
import { summarizeMaterials, searchMaterialBatches } from "./features/inventory/material-summary.js";
import { filterInventoryCategory, inventoryCategoryOptions } from "./features/inventory/inventory-category.js";
import { styles } from "./app/styles.js";
import { DateInput, Field, SearchableSelect } from "./shared/components/ui.jsx";
import AccountSettingsDialog from "./features/accounts/AccountSettingsDialog.jsx";
const HelpPage = lazy(() => import("./features/help/HelpPage.jsx"));
import { LoginPage } from "./features/accounts/LoginPage.jsx";
import ModuleDateFilter from "./shared/components/ModuleDateFilter.jsx";
import RecordFilters from "./shared/components/RecordFilters.jsx";
import { buildTaskCenter, moduleTaskGroup, taskContains } from "./features/tasks/task-model.js";
import { TaskFilterBanner } from "./features/tasks/TaskCenter.jsx";
import { Dashboard } from "./features/dashboard/Dashboard.jsx";
import { WORK_DEFINITIONS, WORK_MODULES, workModule } from './features/work/work-types.js';
import { workInstitutionOptions, matchesWorkInstitution } from "./features/work/work-history.js";
const WorkRequestsPage = lazy(() => import("./features/work/WorkRequestsPage.jsx").then(module => ({ default: module.WorkRequestsPage })));
const PurchasesPage = lazy(() => import("./features/purchases/PurchasesPage.jsx").then(module => ({ default: module.PurchasesPage })));
const StockPage = lazy(() => import("./features/stock/StockPage.jsx").then(module => ({ default: module.StockPage })));
const InventoryPage = lazy(() => import("./features/inventory/InventoryPage.jsx").then(module => ({ default: module.InventoryPage })));
const ReportsPage = lazy(() => import("./features/reports/ReportsPage.jsx"));
import MaterialBatchEditor from "./features/inventory/MaterialBatchEditor.jsx";
const AccountManagementPage = lazy(() => import("./features/accounts/AccountManagementPage.jsx").then(module => ({ default: module.AccountManagementPage })));
import { createAttachmentsActions } from "./shared/api/attachments-actions.jsx";
import { createAccountsActions } from "./features/accounts/accounts-actions.jsx";
import { createWorkActions } from "./features/work/work-actions.jsx";
import { createInventoryActions } from "./features/inventory/inventory-actions.jsx";
import { createPurchasesActions } from "./features/purchases/purchases-actions.jsx";
import { createStockActions } from "./features/stock/stock-actions.jsx";
import { createRecordsActions } from "./shared/actions/records-actions.jsx";


import "./shared/components/recent-records.css";
const emptyRange = {};

function App() {
  const [loginReady, setLoginReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState({ text: "", id: 0, persistent: false });
  // Each completed operation starts a fresh five-second notice, including repeated text.
  const setMessage = useCallback((text, { persistent = false } = {}) => {
    setNotice(previous => ({ text, persistent, id: previous.id + 1 }));
  }, []);
  const [editingBatch, setEditingBatch] = useState(null);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionCheckRetry, setSessionCheckRetry] = useState(0);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [taskId, setTaskId] = useState("");
  const [currentUser, setCurrentUser] = useState(() => displayStudentAccount(getStoredAccount()));
  const [query, setQuery] = useState("");
  usePageSearchHighlight(query);
  const [moduleRanges, setModuleRanges] = useState({});
  const [moduleStudents, setModuleStudents] = useState({});
  const [moduleTeachers, setModuleTeachers] = useState({});
  const [moduleInstitutions, setModuleInstitutions] = useState({});
  const [moduleReviewScopes, setModuleReviewScopes] = useState({});
  const reviewScope = moduleReviewScopes[activeTab] || defaultViewScope(currentUser);
  const setReviewScope = scope => setModuleReviewScopes(prev => ({ ...prev, [activeTab]: scope }));
  const [purchaseViewScope, setPurchaseViewScope] = useState("mine");
  const [stockViewScope, setStockViewScope] = useState("mine");
  const [inventoryCategory, setInventoryCategory] = useState("");
  const dateRange = moduleRanges[activeTab] || emptyRange;

  const [workRequests, setWorkRequests] = useState([]);
  const [reviewLogs, setReviewLogs] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [materialBatches, setMaterialBatches] = useState([]);
  const [purchaseRequests, setPurchaseRequests] = useState([]);
  const [stockTransactions, setStockTransactions] = useState([]);
  const [stockOutRequests, setStockOutRequests] = useState([]);
  const [stockMovementType,setStockMovementType] = useState('');
  const [registeredTeacherAccounts, setRegisteredTeacherAccounts] = useState([]);
  const [units, setUnits] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [studentAccounts, setStudentAccounts] = useState([]);
  const [teacherAccounts, setTeacherAccounts] = useState([]);
  const [filterTeacherAccounts, setFilterTeacherAccounts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [auditRevision, setAuditRevision] = useState(0);
  const [hiddenRecords, setHiddenRecords] = useState([]);
  const [fundSummary, setFundSummary] = useState({ material_balance: null, material_committed: 0, test_balance: null, test_committed: 0 });
  const [purchaseCatalog, setPurchaseCatalog] = useState([]);
  const [materialCatalog, setMaterialCatalog] = useState([]);

  const sessionToken = currentUser?.session_token || '';
  const accountUsername = currentUser?.username || '';
  const isTeacher = currentUser?.account_type === "teacher";
  const isFinance = currentUser?.account_type === "finance";
  const isStudent = currentUser?.account_type === "student";
  const isAdmin = currentUser?.account_type === "admin";
  const isRecordViewer = isTeacher || isFinance || isAdmin;
  const profileRequired = isStudent && currentUser?.profile_required !== false;
  const canReview = isTeacher;
  const showInstitutionFilter = isRecordViewer && (WORK_MODULES.includes(activeTab) || activeTab === "purchases");
  const selectedInstitution = showInstitutionFilter ? moduleInstitutions[activeTab] || "" : "";
  const institutionType = WORK_DEFINITIONS.find(item => item.module === activeTab)?.name || '测试';
  const institutionLabel = activeTab === 'purchases' ? '采购单位' : institutionType === '维修' ? '维修人员单位' : institutionType + '机构';
  const visibleWorkRequests = useMemo(() => workRequests.filter(requestRecordVisible), [workRequests]);
  const visiblePurchases = useMemo(() => purchaseRequests.filter(requestRecordVisible), [purchaseRequests]);
  const visibleStockOutRequests = useMemo(() => stockOutRequests.filter(requestRecordVisible), [stockOutRequests]);
  const institutionOptions = useMemo(() => activeTab === "purchases" ? purchaseSupplierOptions(visiblePurchases) : workInstitutionOptions(visibleWorkRequests, institutionType), [activeTab, visiblePurchases, visibleWorkRequests, institutionType]);
  useEffect(() => { setModuleInstitutions({}); }, [accountUsername]);
  const showStudentFilter = isRecordViewer && (studentFilterModules.includes(activeTab) || (isAdmin && activeTab === "admin"));
  const selectedModuleStudent = showStudentFilter ? moduleStudents[activeTab] || '' : '';
  const selectedModuleTeacher = isAdmin && showStudentFilter ? moduleTeachers[activeTab] || '' : '';
  const teacherContext = useMemo(() => createTeacherContext({ purchases: purchaseRequests, batches: materialBatches, teachers: filterTeacherAccounts }), [purchaseRequests, materialBatches, filterTeacherAccounts]);
  const moduleTeacherMatches = useCallback((item, module) => recordMatchesTeacher(item, selectedModuleTeacher, module, teacherContext), [selectedModuleTeacher, teacherContext]);
  const canManageStock = isTeacher || isAdmin;
  const canEditBatchInformation = useBatchEditPermission(currentUser, materialBatches, purchaseRequests);
  const canInboundStock = isStudent || canManageStock;
  const canViewReports = isRecordViewer;

  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("等待同步");
  const studentNameDisplay = useMemo(() => createStudentNameDisplay(), []);
  const syncController = useMemo(() => createSyncController({
    fetchSnapshot: ({ known_revision, signal }) => apiPost("ops/listAll", { known_revision, delta: true }, currentUser?.session_token || "", { signal, timeoutMs: 25000 }),
    applySnapshot: snapshot => {
      const data = studentNameDisplay(snapshot);
      if (data.current_account) {
        setCurrentUser(previous => {
          if (!previous) return previous;
          const next = { ...data.current_account, session_token: previous.session_token };
          if (JSON.stringify(previous) === JSON.stringify(next)) return previous;
          saveStoredAccount(next); return next;
        });
      }
      setWorkRequests(previous => sameRows(previous, sortByCreatedAt(data.lab_work_requests || [])));
      setReviewLogs(previous => sameRows(previous, sortByCreatedAt(data.lab_review_logs || [])));
      setMaterials(previous => sameRows(previous, sortByCreatedAt(data.lab_materials || [])));
      setMaterialBatches(previous => sameRows(previous, sortByCreatedAt(data.lab_material_batches || [])));
      setPurchaseRequests(previous => sameRows(previous, sortByCreatedAt(data.lab_purchase_requests || [])));
      setStockTransactions(previous => sameRows(previous, sortByCreatedAt(data.lab_stock_transactions || [])));
      setStockOutRequests(previous => sameRows(previous, sortByCreatedAt(data.lab_stock_out_requests || [])));
      setRegisteredTeacherAccounts(data.lab_registered_teacher_accounts || []);
      setUnits(previous => sameRows(previous, sortByCreatedAt(data.lab_test_processing_units || [])));
      setAttachments(previous => sameRows(previous, sortByCreatedAt(data.lab_attachments || [])));
      setStudentAccounts(previous => sameRows(previous, data.lab_student_accounts || []));
      setTeacherAccounts(data.lab_accounts || []);
      setFilterTeacherAccounts(data.lab_teacher_accounts || []);
      setAccounts(previous => sameRows(previous, sortByCreatedAt(data.accounts || [])));
      setAuditRevision(data.audit_revision || 0);
      setHiddenRecords(data.lab_user_hidden_records || []);
      setFundSummary(data.lab_fund_summary || { material_balance: null, material_committed: 0, test_balance: null, test_committed: 0 });
      setPurchaseCatalog(data.lab_purchase_catalog || []);
      setMaterialCatalog(data.lab_material_catalog || []);
    },
    onBusy: setSyncing,
    onStart: () => setSyncStatus("正在同步数据…"),
    onSuccess: () => { setLoading(false); setSyncStatus("同步完成"); },
    onError: error => { setLoading(false); setSyncStatus("同步失败，请重试"); setMessage(error.message || "同步失败，请重试。", { persistent: true }); },
  }), [currentUser?.session_token, studentNameDisplay, setMessage]);

  function loadAll() {
    if (!currentUser) return Promise.resolve();
    return syncController.request({ force: true });
  }

  useEffect(() => {
    setLoginReady(true);
    setMessage("");
    setLoading(false);
  }, [setMessage]);

  useEffect(() => {
    if (!loginReady || !sessionToken || !sessionChecked || profileRequired) return;
    syncController.request();
    const refresh = () => { if (document.visibilityState !== "hidden") syncController.request({ background: true, force: false }); };
    const interval = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", refresh); syncController.dispose(); };
  }, [loginReady, syncController, sessionToken, sessionChecked, profileRequired]);

  useEffect(() => {
    if (!sessionToken || !sessionChecked || profileRequired) return;
    const controller = new AbortController();
    let changeTimer = null;
    const queueRefresh = () => {
      if (changeTimer) return;
      changeTimer = setTimeout(() => { changeTimer = null; syncController.request({ background: true, force: true }); }, 1000);
    };
    const retryDelay = () => new Promise(resolve => {
      const finish = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", finish); resolve(); };
      const timer = setTimeout(finish, 3000);
      controller.signal.addEventListener("abort", finish, { once: true });
    });
    const expireSession = message => window.dispatchEvent(new CustomEvent("platform-auth-expired", { detail: { token: sessionToken, message } }));
    async function listenForChanges() {
      while (!controller.signal.aborted) {
        try {
          const response = await fetch("/api/events", { headers: { Authorization: "Bearer " + sessionToken }, signal: controller.signal });
          if (response.status === 401) { expireSession("登录状态已失效，请重新登录。"); return; }
          if (response.status === 403) return;
          if (!response.ok || !response.body) throw new Error("Connection unavailable");
          const reader = response.body.getReader(), decoder = new TextDecoder();
          let pending = "";
          while (!controller.signal.aborted) {
            const { done, value } = await reader.read(); if (done) break;
            pending += decoder.decode(value, { stream: true });
            const events = pending.split("\n\n"); pending = events.pop();
            if (events.some(event => event.includes("event: session-expired"))) { expireSession("登录状态已失效，请重新登录。"); return; }
            if (events.some(event => event.includes("event: records-changed"))) queueRefresh();
          }
        } catch { /* Background polling preserves data while the stream reconnects. */ }
        if (!controller.signal.aborted) await retryDelay();
      }
    }
    listenForChanges();
    return () => { controller.abort(); if (changeTimer) clearTimeout(changeTimer); };
  }, [sessionToken, syncController, sessionChecked, profileRequired]);

  useEffect(() => {
    if (!accountUsername) return;
    let timer = null;
    const resetTimer = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        clearStoredAccount();
        setCurrentUser(null);
        setActiveTab("dashboard"); setModuleRanges({}); setModuleStudents({}); setModuleReviewScopes({}); setPurchaseViewScope("mine"); setStockViewScope("mine"); setStockMovementType(""); setInventoryCategory(""); setModuleTeachers({}); setAccountSettingsOpen(false); setQuery("");
        setMessage("长时间未操作，已自动退出。请重新登录。", { persistent: true });
      }, AUTO_LOGOUT_MS);
    };
    const events = ["click", "keydown", "mousemove", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [accountUsername, setMessage]);

  useEffect(() => {
    const token = currentUser?.session_token;
    if (!token) { setSessionChecked(true); return; }
    const controller = new AbortController(); let retryTimer;
    setSessionChecked(false);
    async function verify() {
      try {
        const result = await apiPost('auth/me', {}, token, { signal: controller.signal, timeoutMs: 15000 });
        if (controller.signal.aborted) return;
        const account = displayStudentAccount({ ...result.account, session_token: token });
        setCurrentUser(account); saveStoredAccount(account); setRegisteredTeacherAccounts(result.teachers || []); setSessionChecked(true);
      } catch (error) {
        if (controller.signal.aborted || error.status === 401) return;
        setMessage('正在核对登录信息，请稍候…', { persistent: true }); retryTimer = setTimeout(verify, 5000);
      }
    }
    verify(); return () => { controller.abort(); clearTimeout(retryTimer); };
  }, [currentUser?.session_token, sessionCheckRetry, setMessage]);

  const expireSession = useEffectEvent(event => { logoutAccount(); setMessage(event.detail.message || "登录状态已失效，请重新登录。", { persistent: true }); });
  useEffect(() => {
    const expired = event => { if (event.detail?.token === currentUser?.session_token) { expireSession(event); } };
    const missingProfile = event => { if (event.detail?.token === currentUser?.session_token) { setSessionChecked(false); setSessionCheckRetry(value => value + 1); } };
    window.addEventListener('platform-auth-expired', expired); window.addEventListener('platform-profile-required', missingProfile);
    return () => { window.removeEventListener('platform-auth-expired', expired); window.removeEventListener('platform-profile-required', missingProfile); };
  }, [currentUser?.session_token]);

  const isHiddenForMe = (collection, row) => hiddenRecords.some((h) =>
    h.target_collection === collection &&
    (String(h.target_id || "") === String(row._id || "") || String(h.target_public_id || "") === String(row.public_id || ""))
  );

  function openDashboardModule(module) {
    setTaskId("");
    // A dashboard link opens exactly the scope counted above; normal tab navigation keeps its filters.
    setModuleRanges(previous => ({ ...previous, [module]: {} }));
    setModuleStudents(previous => ({ ...previous, [module]: "" }));
    setModuleTeachers(previous => ({ ...previous, [module]: "" }));
    setModuleInstitutions(previous => ({ ...previous, [module]: "" }));
    setModuleReviewScopes(previous => ({ ...previous, [module]: defaultViewScope(currentUser) }));
    if (module === "purchases") setPurchaseViewScope("mine");
    if (module === "stock") { setStockViewScope("mine"); setStockMovementType(""); }
    if (module === "materials") setInventoryCategory("");
    setActiveTab(module);
    window.scrollTo({ top: 0 });
  }

  const dashboardRecordVisible = item => activeTab !== "dashboard" || (isStudent ? item.applicant_username === currentUser.username : teacherScopeMatches(item, currentUser, defaultViewScope(currentUser)));
  const requestDateMatches = item => recordInDateRange(item, moduleRanges[workModule(item.request_type)] || {});
  const searchRequest = useMemo(() => requestSearchIndex(reviewLogs, attachments), [reviewLogs, attachments]);
  const todayForSearch = chinaDate();
  const taskCenter = useMemo(() => buildTaskCenter({ account: currentUser, workRequests, purchases: purchaseRequests, stockOutRequests, batches: materialBatches, accounts, today: todayForSearch }), [currentUser, workRequests, purchaseRequests, stockOutRequests, materialBatches, accounts, todayForSearch]);
  const activeTask = useMemo(() => taskId === `module:${activeTab}` ? moduleTaskGroup(taskCenter, activeTab) : taskCenter.groups.find(group => group.id === taskId && group.module === activeTab), [taskCenter, taskId, activeTab]);
  const inTask = (module, row) => activeTask?.module !== module || taskContains(activeTask, row);
  useEffect(() => { setTaskId(""); }, [accountUsername]);
  function openTask(id) {
    const group = taskCenter.groups.find(item => item.id === id);
    if (!group) return;
    openDashboardModule(group.module); setQuery(""); setTaskId(id);
  }
  function openModule(module) {
    if (taskCenter.byModule[module] > 0) {
      openDashboardModule(module); setQuery(""); setTaskId(`module:${module}`);
    } else { setTaskId(""); setActiveTab(module); }
  }
  function openOverview() { setTaskId(""); setQuery(""); setActiveTab("dashboard"); window.scrollTo({ top: 0 }); }
  function leaveTask() { setTaskId(""); setQuery(""); if (activeTab === "stock") setStockViewScope("all"); if (activeTab === "purchases") setPurchaseViewScope("all"); if (WORK_MODULES.includes(activeTab) || activeTab === "purchases") setReviewScope("all"); }

  const filteredAccounts = activeTab !== "admin" ? [] : accounts.filter(row => inTask("admin", row) && (!selectedModuleStudent || row.username === selectedModuleStudent) && (!selectedModuleTeacher || row.username === selectedModuleTeacher) && recordInDateRange(row,dateRange) && containsQuery(row,query));
  const filteredWorkRequests = !WORK_MODULES.includes(activeTab) ? [] : visibleWorkRequests.filter((item) => dashboardRecordVisible(item) && inTask(workModule(item.request_type), item) && (activeTask || isAdmin || !isHiddenForMe("lab_work_requests", item)) && searchRequest(item, "lab_work_requests", query) && (!WORK_MODULES.includes(activeTab) || (requestDateMatches(item) && matchesWorkInstitution(item, selectedInstitution) && recordMatchesStudent(item, selectedModuleStudent, activeTab) && moduleTeacherMatches(item, activeTab) && workScopeMatches(item, currentUser, reviewScope))));
  const inventoryMatches = useCallback(item => taskContains(activeTask?.module === "materials" ? activeTask : null, item) && recordInDateRange(item, dateRange) && recordMatchesStudent(item, selectedModuleStudent, "materials") && moduleTeacherMatches(item, "materials"), [dateRange, selectedModuleStudent, moduleTeacherMatches, activeTask]);
  const categoryInventory = useMemo(() => filterInventoryCategory(materials, materialBatches, activeTab === "materials" ? inventoryCategory : ""), [materials, materialBatches, activeTab, inventoryCategory]);
  const summaryBatches = useMemo(() => categoryInventory.batches.filter(item => activeTab !== "materials" || inventoryMatches(item)), [categoryInventory.batches, activeTab, inventoryMatches]);
  const materialSummaryIndex = useMemo(() => activeTab !== "materials" ? [] : summarizeMaterials(categoryInventory.materials, summaryBatches).map(item => ({ item, searchRecord: {name_cn:item.name_cn,stock_by_spec:item.stock_by_spec,batch_codes:item.batch_codes,storage_locations:item.storage_locations,_search_text:item.stock_by_spec.map(spec=>`${spec.spec} · ${spec.storage_room || "未登记房间"}：${spec.quantity} ${spec.unit}`).join("；")} })), [categoryInventory.materials, summaryBatches, activeTab]);
  const filteredMaterials = activeTab !== "materials" ? [] : materialSummaryIndex.filter(({item, searchRecord}) => containsQuery(searchRecord, query) && (activeTab !== "materials" || item.batches.length || (!activeTask && !selectedModuleStudent && !selectedModuleTeacher && item.material_records.some(row => recordInDateRange(row, dateRange))))).map(({item}) => item);
  const scopedBatches = useMemo(() => categoryInventory.batches.map(item => ({ ...item, associated_teacher_names: recordTeacherNames(item, "materials", teacherContext), _search_text: inventorySearchFlags(item,todayForSearch) })).filter(item => activeTab !== "materials" || inventoryMatches(item)), [categoryInventory.batches, teacherContext, todayForSearch, activeTab, inventoryMatches]);
  const filteredBatches = activeTab !== "materials" ? [] : searchMaterialBatches(scopedBatches, query, containsQuery);
  const filteredPurchases = activeTab !== "purchases" ? [] : visiblePurchases.filter((item) => dashboardRecordVisible(item) && inTask("purchases", item) && (activeTask || isAdmin || !isHiddenForMe("lab_purchase_requests", item)) && searchRequest(item, "lab_purchase_requests", query) && (activeTab !== "purchases" || (matchesPurchaseSupplier(item, selectedInstitution) && recordInDateRange(item, dateRange) && recordMatchesStudent(item, selectedModuleStudent, activeTab) && moduleTeacherMatches(item, activeTab) && (!isStudent || purchaseViewScope === "all" || item.applicant_username === currentUser.username) && teacherScopeMatches(item, currentUser, reviewScope))));
  const searchableStocks = useMemo(() => stockTransactions.map(item => ({ ...item, associated_teacher_names: recordTeacherNames(item, "stock", teacherContext) })), [stockTransactions, teacherContext]);
  const searchableStockOutRequests = useMemo(() => visibleStockOutRequests.map(item => ({ ...item, associated_teacher_names: recordTeacherNames(item, "stock", teacherContext) })), [visibleStockOutRequests, teacherContext]);
  const filteredStocks = activeTab !== "stock" ? [] : searchableStocks.filter((item) => containsQuery(item, query) && (activeTab !== "stock" || (recordInDateRange(item, dateRange) && recordMatchesStudent(item, selectedModuleStudent, activeTab) && moduleTeacherMatches(item, "stock") && (!isStudent || stockViewScope === "all" || item.operator_username === currentUser.username))));
  const filteredStockOutRequests = activeTab !== "stock" ? [] : searchableStockOutRequests.filter(item => inTask("stock", item) && containsQuery(item, query) && (activeTab !== "stock" || (recordInDateRange(item, dateRange) && recordMatchesStudent(item, selectedModuleStudent, "stock") && moduleTeacherMatches(item, "stock") && (!isStudent || stockViewScope === "all" || item.applicant_username === currentUser.username || item.purchaser_username === currentUser.username))));

  async function setReimbursementStatus(collection, row, reimbursed) {
    const result = await apiPost("ops/setReimbursementStatus", { collection, id: row._id, reimbursed, expected_updated_at: row.updated_at }, sessionToken);
    const fields = Object.fromEntries(["reimbursed", "reimbursed_by", "reimbursed_username", "reimbursed_at", "updated_at"].map(key => [key, result.record[key]]));
    const update = rows => rows.map(item => String(item._id) === String(row._id) ? { ...item, ...fields } : item);
    if (collection === "lab_work_requests") setWorkRequests(update); else setPurchaseRequests(update);
    setMessage(reimbursed ? "已标记为已报销。" : "已恢复为未报销。");
    await loadAll();
  }

  const { uploadStockEvidence, downloadAttachment, deleteAttachment, uploadAttachment } = createAttachmentsActions({ currentUser, setMessage, loadAll });
  const { saveMyStudentProfile, saveMyPassword, adminSetAccountStatus, adminResetPassword, registerAccount, loginAccount, logoutAccount } = createAccountsActions({ currentUser, setCurrentUser, setAccountSettingsOpen, setMessage, loadAll, isAdmin, setSessionChecked, setActiveTab, setModuleRanges, setModuleStudents, setModuleReviewScopes, setPurchaseViewScope, setStockViewScope, setStockMovementType, setInventoryCategory, setModuleTeachers, setQuery, setEditingBatch, setWorkRequests, setReviewLogs, setMaterials, setMaterialBatches, setPurchaseRequests, setStockTransactions, setStockOutRequests, setAttachments, setAccounts });
  const { addWorkRequest, withdrawWorkRequest, resubmitWorkRequest, reviewWorkRequest, closeRejectedOrder, completeWorkRequest } = createWorkActions({ currentUser, setMessage, loadAll, canReview, workRequests, units });
  const { initializeMaterialStock, updateMaterialBatch, saveMaterialBatchInformation } = createInventoryActions({ uploadStockEvidence, currentUser, loadAll, setMessage, canEditBatchInformation, setEditingBatch, canManageStock, materialBatches });
  const { addPurchaseRequest, withdrawPurchaseRequest, resubmitPurchaseRequest, reviewPurchase, completePurchaseInbound } = createPurchasesActions({ currentUser, setMessage, loadAll, canReview });
  const { addStockTransaction, reviewStockOutRequest, completeStockOutRequest, withdrawStockOutRequest } = createStockActions({ uploadStockEvidence, currentUser, setMessage, loadAll, materialBatches, purchaseRequests });
  const { exportModule, deleteRecordPermanently, hideRecordForMe } = createRecordsActions({ attachments, setMessage, isAdmin, currentUser, loadAll });

  const message = notice.text && <div key={notice.id} className={`platform-action-notice${notice.persistent ? "" : " is-success"}`} role="status"
    onAnimationEnd={event => { if (event.target === event.currentTarget && event.animationName === "platform-notice-out") setNotice(current => current.id === notice.id ? { ...current, text: "" } : current); }}>
    <span>{notice.text}</span><button type="button" aria-label="关闭操作提示" onClick={() => setMessage("")}>×</button>
  </div>;
  const accountSettings = <AccountSettingsDialog key={currentUser?.username} account={currentUser || {}} teachers={registeredTeacherAccounts} required={profileRequired} onSaveProfile={saveMyStudentProfile} onSavePassword={saveMyPassword} onLogout={logoutAccount} onClose={() => setAccountSettingsOpen(false)}    />;
  if (currentUser && !sessionChecked) return <PageLoading full message="正在核对登录信息…" />;
  if (currentUser && profileRequired) return <div className="platform-shell" style={styles.page}>{accountSettings}</div>;
  if (["/help", "/help/"].includes(window.location.pathname)) return <Suspense fallback={<PageLoading full message="正在打开帮助文档…" />}><HelpPage currentUser={currentUser} /></Suspense>;
  if (loading) return <PageLoading full message="正在连接平台…" />;
  if (!currentUser) return <LoginPage onLogin={loginAccount} onRegister={registerAccount} message={message} />;

  const tabs = [
    ["dashboard", "总览"],
    ...WORK_DEFINITIONS.map(({name,module}) => [module, name + ((isAdmin || isFinance) ? '记录' : canReview ? '审核' : '')]),
    ["purchases", (isAdmin || isFinance) ? "采购记录" : canReview ? "采购审核" : "采购/入库"],
    ["stock", isStudent ? "出/退库" : "出入退库"],
    ["materials", "库存"],
    ...(isRecordViewer ? [["reports", "数据报表"]] : []),
    ...(isAdmin ? [["admin", "账号管理"]] : []),
  ];

  const workRows = filteredWorkRequests.filter(row => row.request_type === institutionType);
  const inventoryCategoryField = <Field label="材料类别"><SearchableSelect value={inventoryCategory} onChange={setInventoryCategory} clearOnInput={false} options={inventoryCategoryOptions} placeholder="搜索或选择材料类别" fixedOptions={[""]} /></Field>;

  return (
    <Workspace account={currentUser} tabs={tabs} activeTab={activeTab} taskCenter={taskCenter} syncing={syncing} syncStatus={syncStatus} onNavigate={openModule} onOverview={openOverview} onSync={loadAll} onSettings={() => setAccountSettingsOpen(true)} onLogout={logoutAccount}>
      {message}
      <div className={`platform-query-tools${isStudent ? " is-student" : ""}`}>
      <section className="platform-filter-bar" aria-label="页面搜索" style={styles.filterBar}>
        <PageSearch value={query} onChange={setQuery} />
      </section>
      {!showStudentFilter && !activeTask && (activeTab === "materials" || datedModules.includes(activeTab)) && <section className="platform-module-filters" aria-label="记录筛选" style={styles.filterBar}>
        {activeTab === "materials" && inventoryCategoryField}
        {datedModules.includes(activeTab) && <ModuleDateFilter SearchableSelect={SearchableSelect} DateInput={DateInput} module={activeTab} range={dateRange} onChange={range => setModuleRanges(prev => ({ ...prev, [activeTab]: range }))} />}
      </section>}
      </div>
      {showStudentFilter && !activeTask && <RecordFilters module={activeTab} extraSummary={activeTab === "stock" ? stockMovementType : selectedInstitution} onResetSearch={() => { setQuery(""); setModuleInstitutions(prev => ({ ...prev, [activeTab]: "" })); setStockMovementType(''); if (activeTab === "materials") setInventoryCategory(""); }} extraFields={activeTab === "materials" ? inventoryCategoryField : activeTab === "stock" ? <Field label="出入退库类型"><SearchableSelect value={stockMovementType} onChange={setStockMovementType} clearOnInput={false} options={[{value:"",label:"全部"},...["出库","入库","退库"].map(value=>({value,label:value}))]} fixedOptions={[""]} placeholder="搜索或选择出入退库类型" /></Field> : showInstitutionFilter ? <Field label={institutionLabel}><SearchableSelect key={activeTab} value={selectedInstitution} onChange={value => setModuleInstitutions(prev => ({ ...prev, [activeTab]: value }))} clearOnInput={false} options={[{value:"",label:"全部"}, ...institutionOptions.map(value => ({value,label:value}))]} fixedOptions={[""]} placeholder={"搜索或选择" + institutionLabel} /></Field> : null} showTeacherFilter={isAdmin} teachers={filterTeacherAccounts} teacher={selectedModuleTeacher} onTeacherChange={teacher => setModuleTeachers(prev => ({ ...prev, [activeTab]: teacher }))} students={studentAccounts} student={selectedModuleStudent} onStudentChange={student => setModuleStudents(prev => ({ ...prev, [activeTab]: student }))} range={dateRange} onRangeChange={range => setModuleRanges(prev => ({ ...prev, [activeTab]: range }))} styles={styles} Field={Field} SearchableSelect={SearchableSelect} DateInput={DateInput} />}

      <PageBoundary key={activeTab}><Suspense fallback={<PageLoading message="正在打开模块…" />}>
      {activeTask && <TaskFilterBanner task={activeTask} query={query} onBack={openOverview} onClear={leaveTask} />}
      {activeTab === "dashboard" && <Dashboard currentUser={currentUser} center={taskCenter} query={query} batchCount={materialBatches.length} onOpenTask={openTask} setActiveTab={openDashboardModule} />}
      {WORK_MODULES.includes(activeTab) && <WorkRequestsPage key={activeTab + ":" + (activeTask?.id || "records")} task={activeTask} onReimbursementChange={setReimbursementStatus} workHistory={visibleWorkRequests} teacherAccounts={teacherAccounts} reviewScope={reviewScope} onReviewScopeChange={setReviewScope} fixedType={institutionType} rows={workRows} logs={reviewLogs} attachments={attachments} currentUser={currentUser} units={units} canSubmit={isStudent} canReview={canReview} isAdmin={isAdmin} onAdd={addWorkRequest} onResubmit={resubmitWorkRequest} onWithdraw={withdrawWorkRequest} onReview={reviewWorkRequest} onComplete={completeWorkRequest} onCloseRejected={closeRejectedOrder} onDeleteRecord={deleteRecordPermanently} onHideRecord={hideRecordForMe} onUploadAttachment={uploadAttachment} onDownloadAttachment={downloadAttachment} onDeleteAttachment={deleteAttachment} onExport={() => exportModule(activeTab, workRows)} />}
      {activeTab === "purchases" && <PurchasesPage key={activeTab + ":" + (activeTask?.id || "records")} task={activeTask} onReimbursementChange={setReimbursementStatus} registeredTeacherAccounts={registeredTeacherAccounts} teacherAccounts={teacherAccounts} reviewScope={reviewScope} onReviewScopeChange={setReviewScope} viewScope={purchaseViewScope} onViewScopeChange={setPurchaseViewScope} materialCatalog={materialCatalog} logs={reviewLogs} rows={filteredPurchases} attachments={attachments} batches={materialBatches} purchaseHistory={purchaseRequests} purchaseCatalog={purchaseCatalog} fundSummary={fundSummary} currentUser={currentUser} units={units} canSubmit={isStudent} canReview={canReview} isAdmin={isAdmin} onAdd={addPurchaseRequest} onResubmit={resubmitPurchaseRequest} onWithdraw={withdrawPurchaseRequest} onReview={reviewPurchase} onCompleteInbound={completePurchaseInbound} onCloseRejected={closeRejectedOrder} onDeleteRecord={deleteRecordPermanently} onHideRecord={hideRecordForMe} onUploadAttachment={uploadAttachment} onDownloadAttachment={downloadAttachment} onDeleteAttachment={deleteAttachment} onExport={() => exportModule("purchases", filteredPurchases)} />}
      {activeTab === "stock" && <StockPage key={activeTab + ":" + (activeTask?.id || "records")} task={activeTask} movementType={isStudent ? "" : stockMovementType} currentUser={currentUser} purchaseRequests={purchaseRequests} teacherAccounts={registeredTeacherAccounts} requests={filteredStockOutRequests} onReviewRequest={reviewStockOutRequest} onCompleteRequest={completeStockOutRequest} onWithdrawRequest={withdrawStockOutRequest} onExportRequests={rows => exportModule("stockRequests", rows)} viewScope={stockViewScope} onViewScopeChange={setStockViewScope} canSubmit={isStudent} materialCatalog={materialCatalog} rows={filteredStocks} batches={materialBatches} attachments={attachments} isAdmin={isAdmin} onDeleteRecord={deleteRecordPermanently} isManager={isRecordViewer} onAdd={addStockTransaction} onDownloadAttachment={downloadAttachment} onExport={rows => exportModule("stock", rows)} />}
      {activeTab === "materials" && (canInboundStock || isFinance) && <InventoryPage key={activeTab + ":" + (activeTask?.id || "records")} task={activeTask} searchQuery={query} canInitialize={isStudent} materialCatalog={materialCatalog} onInitialize={initializeMaterialStock} initializationMaterials={materials} initializationBatches={materialBatches} initializationUnits={units} materials={filteredMaterials} batches={filteredBatches} isAdmin={isAdmin} onDeleteRecord={deleteRecordPermanently} attachments={attachments} onDownloadAttachment={downloadAttachment} canManageStock={canManageStock} canEditBatchInformation={canEditBatchInformation} onUpdateBatch={updateMaterialBatch} onExportBatches={() => exportModule("batches", filteredBatches)} />}
      {activeTab === "reports" && canViewReports && <Suspense fallback={<PageLoading message="正在打开数据报表…" />}><ReportsPage currentUser={currentUser} onReimbursementChange={setReimbursementStatus} onMessage={setMessage} onQueryChange={setQuery} query={query} canFilterTeacher={isAdmin} teachers={filterTeacherAccounts} data={{ teachers: filterTeacherAccounts, workRequests, materials, batches: materialBatches, purchases: purchaseRequests, stockTransactions, stockOutRequests, reviewLogs, attachments }} students={studentAccounts} /></Suspense>}
      {accountSettingsOpen && accountSettings}
      {editingBatch && canEditBatchInformation(editingBatch) && <MaterialBatchEditor row={editingBatch} materialCatalog={materialCatalog} materials={materials} attachments={attachments} onDownload={downloadAttachment} onSave={saveMaterialBatchInformation} onClose={() => setEditingBatch(null)}       />}
      {activeTab === "admin" && isAdmin && <AccountManagementPage key={activeTab + ":" + (activeTask?.id || "records")} task={activeTask} allAccounts={accounts} teachers={registeredTeacherAccounts} onReload={loadAll} accounts={filteredAccounts} auditProps={{account:currentUser,student:selectedModuleStudent,teacher:selectedModuleTeacher,range:dateRange,query,revision:auditRevision}} onSetAccountStatus={adminSetAccountStatus} onResetPassword={adminResetPassword} onExportAccounts={() => exportModule("accounts", filteredAccounts)} />}
      </Suspense></PageBoundary>
    </Workspace>
  );
}
export default App;
