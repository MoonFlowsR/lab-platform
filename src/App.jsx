import { useEffect, useMemo, useState } from "react";
import { apiPost, callAccountAuth, callLabOps, clearStoredAccount, downloadAttachmentApi, getStoredAccount, prepareWorkAttachments, saveStoredAccount, uploadAttachmentApi, uploadDraftAttachmentApi } from "./app/api.js";
import { usePageSearchHighlight } from "./page-search-highlight.js";
import { recordMatchesStudent, studentFilterModules } from "./student-filter.js";
import { createTeacherContext, inventorySearchFlags, recordMatchesTeacher, recordTeacherNames, requestSearchIndex } from "./teacher-filter.js";
import { createSyncController } from "./sync-controller.js";
import { containsQuery, countBy, isChineseName, num, sortByCreatedAt, sumCosts } from "./app/formatters.js";
import { AUTO_LOGOUT_MS, PLATFORM_TITLE, accountTypeLabels, auditActionLabel } from "./app/config.js";
import { teacherScopeMatches, workScopeMatches } from "./review-scope.js";
import { datedModules, recordInDateRange } from "./module-date.js";
import { chinaDate } from "./report-data.js";
import { summarizeMaterials } from "./material-summary.js";
import { showAlert, showConfirm, showForm, showPrompt } from "./platform-dialog.jsx";
import { workOptions } from "./work-options.js";
import { styles, tabStyle } from "./app/styles.js";
import { DateInput, Field, MiniBars, SearchableSelect, StatCard } from "./components/ui.jsx";
import CustomOptionFields from "./CustomOptionFields.jsx";
import { workFee } from "./work-values.js";
import { validateAttachmentFile, validatePhotoFile } from "./app/attachment-validation.js";
import { downloadCsv } from "./csv-export.js";
import AccountSettingsDialog from "./AccountSettingsDialog.jsx";
import HelpPage from "./HelpPage.jsx";
import { AccountPage } from "./pages/AccountPage.jsx";
import ModuleDateFilter from "./ModuleDateFilter.jsx";
import StudentRecordFilter from "./StudentRecordFilter.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { WorkRequestsPage } from "./pages/WorkRequestsPage.jsx";
import { PurchasesPage } from "./pages/PurchasesPage.jsx";
import { StockPage } from "./pages/StockPage.jsx";
import { MaterialsPage } from "./pages/MaterialsPage.jsx";
import ReportsView from "./ReportsView.jsx";

import MaterialBatchEditor from "./MaterialBatchEditor.jsx";
import { AdminPage } from "./pages/AdminPage.jsx";
import "./recent-records.css";

function App() {
  const [loginReady, setLoginReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editingBatch, setEditingBatch] = useState(null);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionCheckRetry, setSessionCheckRetry] = useState(0);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [currentUser, setCurrentUser] = useState(getStoredAccount);
  const [query, setQuery] = useState("");
  usePageSearchHighlight(query);
  const [moduleRanges, setModuleRanges] = useState({});
  const [moduleStudents, setModuleStudents] = useState({});
  const [moduleTeachers, setModuleTeachers] = useState({});
  const [moduleReviewScopes, setModuleReviewScopes] = useState({});
  const reviewScope = moduleReviewScopes[activeTab] || "mine";
  const setReviewScope = scope => setModuleReviewScopes(prev => ({ ...prev, [activeTab]: scope }));
  const [purchaseViewScope, setPurchaseViewScope] = useState("mine");
  const [stockViewScope, setStockViewScope] = useState("mine");
  const dateRange = moduleRanges[activeTab] || {};

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
  const [auditLogs, setAuditLogs] = useState([]);
  const [hiddenRecords, setHiddenRecords] = useState([]);
  const [fundSummary, setFundSummary] = useState({ material_balance: null, material_committed: 0, test_balance: null, test_committed: 0 });
  const [purchaseCatalog, setPurchaseCatalog] = useState([]);
  const [materialCatalog, setMaterialCatalog] = useState([]);

  const sessionToken = currentUser?.session_token || '';
  const accountUsername = currentUser?.username || '';
  const isTeacher = currentUser?.account_type === "teacher";
  const isStudent = currentUser?.account_type === "student";
  const isAdmin = currentUser?.account_type === "admin";
  const profileRequired = isStudent && currentUser?.profile_required !== false;
  const canReview = isTeacher;
  const showStudentFilter = (isTeacher || isAdmin) && studentFilterModules.includes(activeTab);
  const selectedModuleStudent = showStudentFilter ? moduleStudents[activeTab] || '' : '';
  const selectedModuleTeacher = isAdmin && showStudentFilter ? moduleTeachers[activeTab] || '' : '';
  const teacherContext = createTeacherContext({ purchases: purchaseRequests, batches: materialBatches, teachers: filterTeacherAccounts });
  const moduleTeacherMatches = (item, module) => recordMatchesTeacher(item, selectedModuleTeacher, module, teacherContext);
  const canManageStock = isTeacher || isAdmin;
  const canEditBatchInformation = isStudent || isAdmin;
  const canInboundStock = isStudent || canManageStock;
  const canViewReports = isTeacher || isAdmin;

  async function ensureLogin() {
    setLoginReady(true);
    setMessage("");
    setLoading(false);
  }

  const [syncing, setSyncing] = useState(false);
  const syncController = useMemo(() => createSyncController({
    fetchSnapshot: ({ known_revision, signal }) => apiPost("ops/listAll", { known_revision }, currentUser?.session_token || "", { signal, timeoutMs: 25000 }),
    applySnapshot: data => {
      if (data.current_account) {
        setCurrentUser(previous => {
          if (!previous) return previous;
          const next = { ...data.current_account, session_token: previous.session_token };
          if (JSON.stringify(previous) === JSON.stringify(next)) return previous;
          saveStoredAccount(next); return next;
        });
      }
      setWorkRequests(sortByCreatedAt(data.lab_work_requests || []));
      setReviewLogs(sortByCreatedAt(data.lab_review_logs || []));
      setMaterials(sortByCreatedAt(data.lab_materials || []));
      setMaterialBatches(sortByCreatedAt(data.lab_material_batches || []));
      setPurchaseRequests(sortByCreatedAt(data.lab_purchase_requests || []));
      setStockTransactions(sortByCreatedAt(data.lab_stock_transactions || []));
      setStockOutRequests(sortByCreatedAt(data.lab_stock_out_requests || []));
      setRegisteredTeacherAccounts(data.lab_registered_teacher_accounts || []);
      setUnits(sortByCreatedAt(data.lab_test_processing_units || []));
      setAttachments(sortByCreatedAt(data.lab_attachments || []));
      setStudentAccounts(data.lab_student_accounts || []);
      setTeacherAccounts(data.lab_accounts || []);
      setFilterTeacherAccounts(data.lab_teacher_accounts || []);
      setAccounts(sortByCreatedAt(data.accounts || []));
      setAuditLogs(sortByCreatedAt(data.audit_logs || []));
      setHiddenRecords(data.lab_user_hidden_records || []);
      setFundSummary(data.lab_fund_summary || { material_balance: null, material_committed: 0, test_balance: null, test_committed: 0 });
      setPurchaseCatalog(data.lab_purchase_catalog || []);
      setMaterialCatalog(data.lab_material_catalog || []);
    },
    onBusy: setSyncing,
    onStart: () => setMessage("正在同步数据…"),
    onSuccess: background => {
      setLoading(false);
      if (!background) setMessage("同步完成。");
      else setMessage(previous => /同步失败|连接超时|连接暂时中断/.test(previous || "") ? "同步完成。" : previous);
    },
    onError: error => { setLoading(false); setMessage(`同步失败：${error.message || error}`); },
  }), [currentUser?.session_token]);

  function loadAll() {
    if (!currentUser) return Promise.resolve();
    return syncController.request({ force: true });
  }

  useEffect(() => {
    ensureLogin();
  }, []);

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
        setActiveTab("dashboard"); setModuleRanges({}); setModuleStudents({}); setModuleReviewScopes({}); setPurchaseViewScope("mine"); setStockViewScope("mine"); setStockMovementType(""); setModuleTeachers({}); setAccountSettingsOpen(false); setQuery("");
        setMessage("长时间未操作，已自动退出。请重新登录。");
      }, AUTO_LOGOUT_MS);
    };
    const events = ["click", "keydown", "mousemove", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [accountUsername]);

  useEffect(() => {
    const token = currentUser?.session_token;
    if (!token) { setSessionChecked(true); return; }
    const controller = new AbortController(); let retryTimer;
    setSessionChecked(false);
    async function verify() {
      try {
        const result = await apiPost('auth/me', {}, token, { signal: controller.signal, timeoutMs: 15000 });
        if (controller.signal.aborted) return;
        const account = { ...result.account, session_token: token };
        setCurrentUser(account); saveStoredAccount(account); setRegisteredTeacherAccounts(result.teachers || []); setSessionChecked(true);
      } catch (error) {
        if (controller.signal.aborted || error.status === 401) return;
        setMessage('正在核对登录信息，请稍候…'); retryTimer = setTimeout(verify, 5000);
      }
    }
    verify(); return () => { controller.abort(); clearTimeout(retryTimer); };
  }, [currentUser?.session_token, sessionCheckRetry]);

  useEffect(() => {
    const expired = event => { if (event.detail?.token === currentUser?.session_token) { logoutAccount(); setMessage(event.detail.message || '登录状态已失效，请重新登录。'); } };
    const missingProfile = event => { if (event.detail?.token === currentUser?.session_token) { setSessionChecked(false); setSessionCheckRetry(value => value + 1); } };
    window.addEventListener('platform-auth-expired', expired); window.addEventListener('platform-profile-required', missingProfile);
    return () => { window.removeEventListener('platform-auth-expired', expired); window.removeEventListener('platform-profile-required', missingProfile); };
  }, [currentUser?.session_token]);

  const isHiddenForMe = (collection, row) => hiddenRecords.some((h) =>
    h.target_collection === collection &&
    (String(h.target_id || "") === String(row._id || "") || String(h.target_public_id || "") === String(row.public_id || ""))
  );

  const dashboardRecordVisible = item => activeTab !== "dashboard" || (isStudent ? item.applicant_username === currentUser.username : teacherScopeMatches(item, currentUser));
  const requestDateMatches = item => recordInDateRange(item, moduleRanges[item.request_type === "测试" ? "test" : "processing"] || {});
  const searchRequest = useMemo(() => requestSearchIndex(reviewLogs, attachments), [reviewLogs, attachments]);
  const todayForSearch = chinaDate();
  const filteredAccounts = accounts.filter(row => containsQuery(row,query));
  const filteredAuditLogs = auditLogs.filter(row => containsQuery({...row,_search_text: auditActionLabel(row.action) + " " + (row.target_type || "-") + "/" + (row.target_id || "-")},query));
  const filteredWorkRequests = workRequests.filter((item) => dashboardRecordVisible(item) && (isAdmin || !isHiddenForMe("lab_work_requests", item)) && searchRequest(item, "lab_work_requests", query) && (!["test", "processing"].includes(activeTab) || (requestDateMatches(item) && recordMatchesStudent(item, selectedModuleStudent, activeTab) && moduleTeacherMatches(item, activeTab) && workScopeMatches(item, currentUser, reviewScope))));
  const inventoryMatches = item => recordInDateRange(item, dateRange) && recordMatchesStudent(item, selectedModuleStudent, "materials") && moduleTeacherMatches(item, "materials");
  const summaryBatches = materialBatches.filter(item => activeTab !== "materials" || inventoryMatches(item));
  const filteredMaterials = summarizeMaterials(materials, summaryBatches).filter(item => containsQuery({name_cn:item.name_cn,batch_codes:item.batch_codes,storage_locations:item.storage_locations,_search_text:item.stock_by_spec.map(spec=>`${spec.spec}：${spec.quantity} ${spec.unit}`).join("；")}, query) && (activeTab !== "materials" || item.batches.length || (!selectedModuleStudent && !selectedModuleTeacher && item.material_records.some(row => recordInDateRange(row, dateRange)))));
  const filteredBatches = materialBatches.map(item => ({ ...item, associated_teacher_names: recordTeacherNames(item, "materials", teacherContext), _search_text: inventorySearchFlags(item,todayForSearch) })).filter((item) => containsQuery(item, query) && (activeTab !== "materials" || inventoryMatches(item)));
  const filteredPurchases = purchaseRequests.filter((item) => dashboardRecordVisible(item) && (isAdmin || !isHiddenForMe("lab_purchase_requests", item)) && searchRequest(item, "lab_purchase_requests", query) && (activeTab !== "purchases" || (recordInDateRange(item, dateRange) && recordMatchesStudent(item, selectedModuleStudent, activeTab) && moduleTeacherMatches(item, activeTab) && (!isStudent || purchaseViewScope === "all" || item.applicant_username === currentUser.username) && teacherScopeMatches(item, currentUser, reviewScope))));
  const filteredStocks = stockTransactions.map(item => ({ ...item, associated_teacher_names: recordTeacherNames(item, "stock", teacherContext) })).filter((item) => containsQuery(item, query) && (activeTab !== "stock" || (recordInDateRange(item, dateRange) && recordMatchesStudent(item, selectedModuleStudent, activeTab) && moduleTeacherMatches(item, "stock") && (!isStudent || stockViewScope === "all" || item.operator_username === currentUser.username))));
  const filteredStockOutRequests = stockOutRequests.map(item => ({ ...item, associated_teacher_names: recordTeacherNames(item, "stock", teacherContext) })).filter(item => containsQuery(item, query) && (activeTab !== "stock" || (recordInDateRange(item, dateRange) && recordMatchesStudent(item, selectedModuleStudent, "stock") && moduleTeacherMatches(item, "stock") && (!isStudent || stockViewScope === "all" || item.applicant_username === currentUser.username || item.purchaser_username === currentUser.username))));
  



  async function addWorkRequest(form, pendingAttachments = []) {
    try {
      const attachment_ids = await prepareWorkAttachments(pendingAttachments, currentUser);
      await callLabOps("submitWorkRequest", { ...form, attachment_ids }, currentUser);
      setMessage(`${form.request_type}申请已提交，等待教师审核。`);
      await loadAll();
      return true;
    } catch (error) {
      showAlert(error.message || error);
      return false;
    }
  }

  async function withdrawWorkRequest(row) {
    if (!await showConfirm(`确定撤回这条${row.request_type || "测试/加工"}申请吗？撤回后可以修改并重新提交。`, { title: '撤回申请确认', confirmText: '确认撤回', details: [{ label: '申请编号', value: row.public_id }, { label: '申请人', value: row.applicant_name || row.applicant_username }] })) return;
    try {
      await callLabOps("withdrawWorkRequest", { id: row._id }, currentUser);
      setMessage("申请已撤回，可修改后重新提交。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

  async function resubmitWorkRequest(row, form, pendingAttachments = []) {
    try {
      const attachment_ids = await prepareWorkAttachments(pendingAttachments, currentUser);
      await callLabOps("resubmitWorkRequest", { id: row._id, patch: form, attachment_ids }, currentUser);
      setMessage("申请已修改并重新提交，等待教师审核。");
      await loadAll();
      return true;
    } catch (error) {
      showAlert(error.message || error);
      return false;
    }
  }

  async function reviewWorkRequest(row, nextStatus) {
    if (!canReview) return showAlert("只有被指定的审核教师可以审核测试/加工申请。");
    const reviewerTeacherName = currentUser?.display_name || currentUser?.username || "";
    const needsNote = nextStatus === "已驳回";
    const input = await showPrompt(
      nextStatus === "已通过" ? "同意意见（可选，可留空）" : "请输入驳回意见（必填）",
      row.review_note || "",
      { title: `${row.request_type}申请审核`, multiline: true, field: { required: needsNote }, danger: needsNote, confirmText: needsNote ? '确认驳回' : '确认同意', details: [{ label: '申请编号', value: row.public_id }, { label: '申请人', value: row.applicant_name || row.applicant_username }, { label: '申请内容', value: row.work_content }, { label: '审核结果', value: nextStatus }] }
    );
    if (input === null) return;
    const note = input.trim();
    if (needsNote && !note) return showAlert("请填写审核意见。");
    try {
      await callLabOps("reviewWorkRequest", {
        id: row._id,
        next_status: nextStatus,
        review_note: note,
        reviewer_teacher_name: reviewerTeacherName,
      }, currentUser);
      setMessage("审核已更新。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

  async function closeRejectedOrder(collection, row) {
    if (!await showConfirm('是否确认关闭并结束此工单？关闭后归入“已完成”，标记“已关闭”，无法在平台中撤销或重新提交。原审批和附件保留，不计完成费用或入库金额。', { title: '关闭工单确认', confirmText: '确认关闭并结束', danger: true, details: [{label:'申请编号',value:row.public_id},{label:'申请人',value:row.applicant_name || row.applicant_username},{label:'工单内容',value:row.work_content || row.material_name},{label:'当前状态',value:row.status},{label:'关闭结果',value:'已关闭，结束工单'}] })) return;
    try {
      await callLabOps('closeRejectedRequest', {collection, id:row._id, confirmed:true, expected_updated_at:row.updated_at}, currentUser);
      setMessage('工单已关闭，已归入已完成记录。');
      await loadAll();
    } catch (error) { showAlert(error.message || error); }
  }

  async function completeWorkRequest(row) {
    const feeKey = row.request_type === '加工' ? 'cost_processing' : 'cost_test';
    const options = workOptions(row.request_type, workRequests, units, row).billing;
    const values = await showForm({ title: '确认' + row.request_type + '工单完成', confirmText: '确认完成',
      message: '是否需要修改数量、金额或计费方式？请核对后点击“确认完成”。修改会留痕，无需再次审核。',
      details: [{label:'申请编号',value:row.public_id},{label:'申请人',value:row.applicant_name || row.applicant_username},{label:'申请内容',value:row.work_content}],
      fields: [
        {name:'workload_quantity',label:'最终数量',type:'number',required:true,min:0,value:row.workload_quantity},
        {name:'workload_unit',label:'计费方式',required:true,value:row.workload_unit,render:({value,onChange}) => <CustomOptionFields required label="" customLabel="其它计费方式" value={value} onChange={onChange} options={options} placeholder="搜索或选择计费方式" customPlaceholder="请填写具体计费方式" maxLength={60} Field={({label,children}) => <div>{label && <div style={styles.fieldLabel}>{label}</div>}{children}</div>} SearchableSelect={SearchableSelect} styles={styles} />},
        {name:feeKey,label:'最终总' + row.request_type + '费 / 元',type:'number',required:true,min:0,value:workFee(row)},
        {name:'completion_note',label:'完成备注（可选）',wide:true,maxLength:2000,value:row.completion_note || '',placeholder:'可说明费用或数量调整原因'},
      ],
      validate: values => !Number.isFinite(Number(values.workload_quantity)) || Number(values.workload_quantity) <= 0 ? '最终数量必须大于 0。' : !String(values.workload_unit || '').trim() || ['其它','其他','__custom_option__'].includes(values.workload_unit) ? '请选择或填写计费方式。' : '',
    });
    if (values === null) return;
    try {
      await callLabOps('completeWorkRequest', {id:row._id, confirmed:true, expected_updated_at:row.updated_at,
        patch:{workload_quantity:Number(values.workload_quantity),workload_unit:values.workload_unit,[feeKey]:Number(values[feeKey])},completion_note:values.completion_note.trim()}, currentUser);
      setMessage(row.request_type + '工单已完成，费用按最终金额统计。');
      await loadAll();
    } catch (error) { showAlert(error.message || error); }
  }

  async function uploadStockEvidence(file, transactionType = "入库") {
    if (transactionType === "出库") validatePhotoFile(file);
    else validateAttachmentFile(file);
    const draftId = `stock-${currentUser.username}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return uploadDraftAttachmentApi(draftId, file, currentUser);
  }

  async function initializeMaterialStock(form, file) {
    validatePhotoFile(file);
    const evidence = await uploadStockEvidence(file);
    const result = await callLabOps("initializeMaterialStock", { ...form, photo_attachment_id: evidence._id }, currentUser);
    await loadAll();
    setMessage("现有材料与期初库存已保存，所有用户均可查看和领用。");
    return result;
  }

  

  async function addMaterialBatch(form, file) {
    if (!canInboundStock) return;
    try {
      const evidence = await uploadStockEvidence(file);
      await callLabOps("addMaterialBatch", { ...form, photo_attachment_id: evidence._id }, currentUser);
      setMessage("材料批次已新增。");
      await loadAll();
      return true;
    } catch (error) {
      showAlert(error.message || error);
      return false;
    }
  }

  async function updateMaterialBatch(row) {
    if (canEditBatchInformation) { setEditingBatch(row); return; }
    if (!canManageStock) return showAlert("只有教师或管理员账号可以修改库存。");
    const values = await showForm({ title: '修改库存', message: '核对批次及修正后数量。修改原因必填，系统记录修改前后数值、操作人和时间。', confirmText: '确认修改',
      details: [{ label: '材料', value: row.material_name }, { label: '批次', value: row.batch_code }, { label: '当前库存', value: `${row.current_qty} ${row.unit}` }],
      fields: [
        { name: 'quantity', label: `修正后库存（${row.unit}）`, type: 'number', required: true, min: 0, value: row.current_qty ?? 0 },
        { name: 'minimum', label: '最低预警数量', type: 'number', required: true, min: 0, value: row.min_qty ?? 0 },
        { name: 'location', label: row.storage_room ? '存放房间' : '储存位置', required: true, value: row.storage_room || row.storage_location || '' },
        ...(row.storage_room ? [{ name: 'storage_detail', label: '具体位置简述', required: true, multiline: true, wide: true, maxLength: 500, value: row.storage_detail || '', placeholder: '如柜号、上/下层、左右侧' }] : []),
        { name: 'reason', label: '修改原因', required: true, multiline: true, wide: true, placeholder: '填写库存修正原因，操作将留存记录' },
      ],
    });
    if (values === null) return;
    const nextQty = Number(values.quantity), minQty = Number(values.minimum), reason = values.reason.trim(), location = values.location.trim();
    const storage = row.storage_room ? { storage_room: location, storage_detail: values.storage_detail.trim() } : {};
    try {
      await callLabOps("updateMaterialBatch", {
        id: row._id,
        current_qty: nextQty,
        storage_location: location.trim(),
        ...storage,
        min_qty: minQty,
        reason: reason.trim(),
      }, currentUser);
      setMessage("库存已修改，并已记录修改前后数值、操作人、时间和原因。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

  async function saveMaterialBatchInformation(form, photo) {
    if (!canEditBatchInformation) throw new Error("只有学生或管理员可以修改物品信息。");
    const evidence = photo ? await uploadStockEvidence(photo) : null;
    await callLabOps("updateMaterialBatchInformation", { ...form, ...(evidence ? { photo_attachment_id: evidence._id } : {}) }, currentUser);
    setMessage("物品信息已修改，并已记录修改前后信息和原因。");
    await loadAll();
  }

  async function addPurchaseRequest(form, pendingAttachments = []) {
    try {
      const response = await callLabOps("submitPurchaseRequest", form, currentUser);
      const record = response.record || null;
      for (const item of (Array.isArray(pendingAttachments) ? pendingAttachments : [])) {
        if (record?._id) {
          await uploadAttachmentApi({ target_collection: "lab_purchase_requests", target_id: record._id, target_public_id: record.public_id }, item.file, currentUser);
        }
      }
      setMessage("采购申请已提交，等待教师审核。");
      await loadAll();
      return true;
    } catch (error) {
      showAlert(error.message || error);
      return false;
    }
  }

  async function withdrawPurchaseRequest(row) {
    if (!await showConfirm("确定撤回这条采购申请吗？撤回后可以修改并重新提交。", { title: '撤回采购确认', confirmText: '确认撤回', details: [{ label: '申请编号', value: row.public_id }, { label: '采购物品', value: row.material_name }] })) return;
    try {
      await callLabOps("withdrawPurchaseRequest", { id: row._id }, currentUser);
      setMessage("采购申请已撤回，可修改后重新提交。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

  async function resubmitPurchaseRequest(row, form, pendingAttachments = []) {
    try {
      await callLabOps("resubmitPurchaseRequest", { id: row._id, patch: form }, currentUser);
      for (const item of (Array.isArray(pendingAttachments) ? pendingAttachments : [])) {
        await uploadAttachmentApi({ target_collection: "lab_purchase_requests", target_id: row._id, target_public_id: row.public_id }, item.file, currentUser);
      }
      setMessage("采购申请已修改并重新提交，等待教师审核。");
      await loadAll();
      return true;
    } catch (error) {
      showAlert(error.message || error);
      return false;
    }
  }

  async function reviewPurchase(row, nextStatus) {
    if (!canReview) return showAlert("只有被指定的审核教师可以审核采购申请。");
    const needsNote = nextStatus === "已驳回";
    const input = await showPrompt(
      nextStatus === "已通过" ? "采购同意意见（可选，可留空）" : "请输入采购驳回意见（必填）",
      row.review_note || "",
      { title: '采购申请审核', multiline: true, field: { required: needsNote }, danger: needsNote, confirmText: needsNote ? '确认驳回' : '确认同意', message: nextStatus === '已通过' ? '同意后进入待入库，物品到货后须完成入库。' : '', details: [{ label: '申请编号', value: row.public_id }, { label: '申请人', value: row.applicant_name || row.applicant_username }, { label: '采购物品', value: row.material_name }, { label: '审核结果', value: nextStatus }] }
    );
    if (input === null) return;
    const note = input.trim();
    if (needsNote && !note) return showAlert("请填写审核意见。");
    try {
      await callLabOps("reviewPurchaseRequest", {
        id: row._id,
        next_status: nextStatus,
        review_note: note,
        reviewer_teacher_name: currentUser?.display_name || currentUser?.username || "",
      }, currentUser);
      setMessage(nextStatus === "已通过" ? "采购已审核通过，等待申请人到货后完成入库。" : "采购审核已更新。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

  async function completePurchaseInbound(row, form, photoFile) {
    try {
      validatePhotoFile(photoFile);
      const photo = await uploadAttachmentApi({
        target_collection: "lab_purchase_requests",
        target_id: row._id,
        target_public_id: row.public_id,
      }, photoFile, currentUser);
      await callLabOps("completePurchaseInbound", {
        id: row._id,
        actual_qty: Number(form.actual_qty),
        unit: form.unit,
        storage_location: form.storage_location,
        storage_room: form.storage_room,
        storage_detail: form.storage_detail,

        expiry_date: form.expiry_date,
        remark: form.remark,
        photo_attachment_id: photo._id,
      }, currentUser);
      setMessage("到货照片和入库信息已保存，采购已完成并自动生成库存批次与入库流水。");
      await loadAll();
      return true;
    } catch (error) {
      showAlert(error.message || error);
      return false;
    }
  }

  async function addStockTransaction(form, photoFile) {
    try {
      let photoAttachmentId = "";
      const needsPhotos = ["入库", "出库", "退库"].includes(form.transaction_type);
      if (needsPhotos) { validatePhotoFile(photoFile); }
      if (["入库", "出库", "退库"].includes(form.transaction_type)) {
        const evidence = await uploadStockEvidence(photoFile, form.transaction_type);
        photoAttachmentId = evidence._id;
      }
      const result = await callLabOps("createStockTransaction", { ...form, photo_attachment_id: photoAttachmentId }, currentUser);
      setMessage(result.approval_required ? "出库申请已提交采购人审批，库存尚未扣减。" : "库存流水已保存，库存数量已更新。");
      await loadAll();
      return true;
    } catch (error) {
      showAlert(error.message || error);
      return false;
    }
  }

  async function reviewStockOutRequest(row, decision) {
    const values = await showForm({ title: decision + '出库申请', message: decision === '同意' ? '同意后由申请人完成出库，当前不扣减库存。' : '驳回意见必填，申请人可重新提交。', confirmText: '确认' + decision,
      details: [{ label: '材料', value: row.material_name }, { label: '申请人', value: row.applicant_name }, { label: '申请数量', value: row.quantity + ' ' + row.unit }],
      fields: [{ name: 'review_note', label: decision === '驳回' ? '驳回意见' : '同意意见（可选）', required: decision === '驳回', multiline: true, wide: true, maxLength: 2000 }] });
    if (values === null) return false;
    try { await callLabOps('reviewStockOutRequest', { id: row._id, decision, review_note: values.review_note }, currentUser); setMessage('出库申请已' + decision + '。'); await loadAll(); return true; }
    catch (error) { showAlert(error.message || error); return false; }
  }

  async function completeStockOutRequest(row) {
    if (!await showConfirm('确认实际领用以下材料。完成后扣减库存，系统保留采购人审批记录。', { title: '完成出库登记', confirmText: '确认完成出库', details: [{ label: '材料 / 批次', value: row.material_name + ' · ' + row.batch_code }, { label: '出库数量', value: row.quantity + ' ' + row.unit }, { label: '采购人', value: row.purchaser_name }] })) return false;
    try { await callLabOps('completeStockOutRequest', { id: row._id }, currentUser); setMessage('出库已完成，库存数量已更新。'); await loadAll(); return true; }
    catch (error) { showAlert(error.message || error); return false; }
  }

  async function withdrawStockOutRequest(row) {
    if (!await showConfirm('撤回后本申请不能完成出库。如需修改数量、单位等信息，请重新提交，重新取得采购人同意。', { title: '撤回出库申请', confirmText: '确认撤回', details: [{ label: '申请编号', value: row.public_id }, { label: '材料', value: row.material_name }] })) return false;
    try { await callLabOps('withdrawStockOutRequest', { id: row._id }, currentUser); setMessage('出库申请已撤回，库存未变。'); await loadAll(); return true; }
    catch (error) { showAlert(error.message || error); return false; }
  }

  

  function exportModule(kind, rows) {
    const count = downloadCsv(kind, rows, { attachments });
    setMessage(`已导出 ${count} 条当前筛选数据，列标题均为中文。`);
  }

  async function deleteRecordPermanently(collection, row) {
    if (!isAdmin) return;
    try {
      const { preview } = await callLabOps("adminDeletePreview", { collection, id: row._id }, currentUser);
      const scope = Object.entries(preview.counts).map(([name, count]) => `${name} ${count} 条`).join("、");
      const confirmation = `永久删除“${preview.name || preview.title}”（${preview.public_id}）？

范围：${scope}。
${preview.note}

删除将直接清除当前数据库中的记录，所有用户均不可再查看，无法在平台中撤销。`;
      if (!await showConfirm(confirmation, { title: "永久删除确认", confirmText: "确认永久删除", danger: true })) return;
      await callLabOps("adminDeleteRecord", { collection, id: row._id, token: preview.token }, currentUser);
      setMessage("记录已从当前数据库永久删除，所有用户页面将自动同步。");
      await loadAll();
    } catch (error) { showAlert(error.message || error); }
  }

  async function hideRecordForMe(collection, row) {
    const title = row.public_id || row.work_content || row.material_name || row.batch_code || "该记录";
    if (!await showConfirm(`确定从当前账号列表中删除“${title}”吗？\n\n这只会隐藏在你自己的账号里，不会删除数据库原始记录，也不会影响其他用户查看。`)) return;
    try {
      await callLabOps("hideRecordForMe", { collection, id: row._id, public_id: row.public_id || "" }, currentUser);
      setMessage("该记录已从当前账号列表中隐藏，不影响其他用户和数据库原始记录。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

  async function downloadAttachment(attachment) {
    try {
      await downloadAttachmentApi(attachment, currentUser);
    } catch (error) {
      showAlert(error.message || error);
    }
  }

  async function deleteAttachment(attachment) {
    if (!attachment?._id) return showAlert("附件编号异常，无法删除。");
    if (!await showConfirm(`确定删除附件“${attachment.original_name || "未命名附件"}”吗？`)) return;
    try {
      await apiPost("attachments/delete", { id: attachment._id }, currentUser?.session_token || "");
      setMessage("附件已删除。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

  async function uploadAttachment(target, file) {
    if (!file) return showAlert("请先选择附件文件。");
    try {
      await uploadAttachmentApi(target, file, currentUser);
      setMessage("附件已上传。");
      await loadAll();
    } catch (error) {
      showAlert(error.message || error);
    }
  }

  async function saveMyStudentProfile(form) {
    const result = await apiPost('profile/save', form, currentUser.session_token);
    const account = { ...result.account, session_token: currentUser.session_token };
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
    if (!isChineseName(username)) return showAlert("账号必须为中文姓名，长度 2–12 个中文字符，可包含间隔号 ·。");
    if (password.length < 6) return showAlert("密码至少 6 位。");
    if (form.account_type === "student" && !String(form.student_code || "").trim()) return showAlert("请填写学生注册码。");
    if (form.account_type === "teacher" && !String(form.teacher_code || "").trim()) return showAlert("请填写教师注册码。");
    if (form.account_type === "admin" && !String(form.admin_code || "").trim()) return showAlert("请填写管理员注册码。");
    try {
      const account = await callAccountAuth("register", {
        username, password, account_type: form.account_type,
        student_code: form.student_code || "", teacher_code: form.teacher_code || "", admin_code: form.admin_code || ""
      });
      if (account?.pending) {
        setCurrentUser(null);
        clearStoredAccount();
        setMessage(account.server_message || "账号已提交注册，待管理员审核通过后才能登录。");
        return;
      }
      setSessionChecked(false);
      setCurrentUser(account);
      saveStoredAccount(account);
      setActiveTab("dashboard"); setModuleRanges({}); setModuleStudents({}); setModuleReviewScopes({}); setPurchaseViewScope("mine"); setStockViewScope("mine"); setStockMovementType(""); setModuleTeachers({}); setAccountSettingsOpen(false); setQuery("");
      setMessage(`注册成功，当前身份：${accountTypeLabels[account.account_type]}`);
    } catch (error) {
      showAlert(error.message || error);
    }
  }

  async function loginAccount(form) {
    const username = form.username.trim();
    const password = form.password.trim();
    if (!username || !password) return showAlert("请输入姓名和密码。");
    if (!isChineseName(username)) return showAlert("账号必须为中文姓名。");
    try {
      const account = await callAccountAuth("login", { username, password });
      setSessionChecked(false);
      setCurrentUser(account);
      saveStoredAccount(account);
      setActiveTab("dashboard"); setModuleRanges({}); setModuleStudents({}); setModuleReviewScopes({}); setPurchaseViewScope("mine"); setStockViewScope("mine"); setStockMovementType(""); setModuleTeachers({}); setAccountSettingsOpen(false); setQuery("");
      setMessage(`登录成功，当前身份：${accountTypeLabels[account.account_type]}`);
    } catch (error) {
      showAlert(error.message || error);
    }
  }

  function logoutAccount() {
    setAccountSettingsOpen(false); setEditingBatch(null); setSessionChecked(false);
    setWorkRequests([]); setReviewLogs([]); setMaterials([]); setMaterialBatches([]); setPurchaseRequests([]); setStockTransactions([]); setStockOutRequests([]); setAttachments([]); setAccounts([]); setAuditLogs([]);
    clearStoredAccount();
    setCurrentUser(null);
    setActiveTab("dashboard"); setModuleRanges({}); setModuleStudents({}); setModuleReviewScopes({}); setPurchaseViewScope("mine"); setStockViewScope("mine"); setStockMovementType(""); setModuleTeachers({}); setAccountSettingsOpen(false); setQuery("");
    setMessage("已退出账号。");
  }

  const accountSettings = <AccountSettingsDialog key={currentUser?.username} account={currentUser || {}} teachers={registeredTeacherAccounts} required={profileRequired} onSaveProfile={saveMyStudentProfile} onSavePassword={saveMyPassword} onLogout={logoutAccount} onClose={() => setAccountSettingsOpen(false)}    />;
  if (currentUser && !sessionChecked) return <div className="platform-shell platform-login" style={styles.page}><div style={styles.card}>正在核对登录信息…</div></div>;
  if (currentUser && profileRequired) return <div className="platform-shell" style={styles.page}>{accountSettings}</div>;
  if (["/help", "/help/"].includes(window.location.pathname)) return <HelpPage currentUser={currentUser} />;
  if (loading) return <div className="platform-shell platform-login" style={styles.page}><div style={styles.card}>正在连接本地服务器...</div></div>;
  if (!currentUser) return <AccountPage onLogin={loginAccount} onRegister={registerAccount} message={message} />;

  const tabs = [
    ["dashboard", "总览"],
    ["test", isAdmin ? "测试记录" : canReview ? "测试审核" : "测试"],
    ["processing", isAdmin ? "加工记录" : canReview ? "加工审核" : "加工"],
    ["purchases", isAdmin ? "采购记录" : canReview ? "采购审核" : "采购/入库"],
    ["stock", isStudent ? "出/退库" : "出入退库"],
    ["materials", "库存"],
    ...((isTeacher || isAdmin) ? [["reports", "数据报表"]] : []),
    ...(isAdmin ? [["admin", "账号管理"]] : []),
  ];

  const testRows = filteredWorkRequests.filter((r) => r.request_type === "测试");
  const processingRows = filteredWorkRequests.filter((r) => r.request_type === "加工");

  return (
    <div className="platform-shell" style={styles.page}>
      <header className="platform-header" style={styles.header}>
        <div>
          <h1 style={styles.title}>{PLATFORM_TITLE}</h1>
          <p style={styles.subtitle}>申请、审核、库存与数据管理</p>
          <p style={styles.meta}>当前账号：{currentUser.display_name || currentUser.username}（{accountTypeLabels[currentUser.account_type]}） · 同步状态：{message || "已连接"}</p>
        </div>
        <div className="platform-header-actions" style={styles.headerRight}>
          <button style={styles.secondaryButton} disabled={syncing} onClick={loadAll}>{syncing ? "同步中…" : "手动同步"}</button>
          <a href="/help" style={{ ...styles.lightButton, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>帮助文档</a>
          <button style={styles.lightButton} onClick={() => setAccountSettingsOpen(true)}>个人信息与密码</button>
          <button style={styles.lightButton} onClick={logoutAccount}>退出登录</button>
        </div>
      </header>

      <nav className="platform-nav" style={styles.nav}>{tabs.map(([key, label]) => <button key={key} style={tabStyle(activeTab === key)} onClick={() => setActiveTab(key)}>{label}</button>)}</nav>

      {<section className="platform-filter-bar" style={styles.filterBar}>
        <input style={styles.input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索页面内任意内容" aria-label="搜索记录" />
        {datedModules.includes(activeTab) && !showStudentFilter && <ModuleDateFilter SearchableSelect={SearchableSelect} DateInput={DateInput} module={activeTab} range={dateRange} onChange={range => setModuleRanges(prev => ({ ...prev, [activeTab]: range }))} />}
      </section>}
      {showStudentFilter && <StudentRecordFilter onResetSearch={() => { setQuery(""); setStockMovementType(''); }} extraFields={activeTab === "stock" ? <Field label="出入退库类型"><SearchableSelect value={stockMovementType} onChange={setStockMovementType} clearOnInput={false} options={[{value:"",label:"全部"},...["出库","入库","退库"].map(value=>({value,label:value}))]} fixedOptions={[""]} placeholder="搜索或选择出入退库类型" /></Field> : null} showTeacherFilter={isAdmin} teachers={filterTeacherAccounts} teacher={selectedModuleTeacher} onTeacherChange={teacher => setModuleTeachers(prev => ({ ...prev, [activeTab]: teacher }))} students={studentAccounts} student={selectedModuleStudent} onStudentChange={student => setModuleStudents(prev => ({ ...prev, [activeTab]: student }))} range={dateRange} onRangeChange={range => setModuleRanges(prev => ({ ...prev, [activeTab]: range }))} styles={styles} Field={Field} SearchableSelect={SearchableSelect} DateInput={DateInput} />}

      {activeTab === "dashboard" && <Dashboard stockOutRequests={filteredStockOutRequests.filter(row => isAdmin || row.applicant_username === currentUser.username || row.purchaser_username === currentUser.username)} accounts={filteredAccounts} stockRows={isStudent ? filteredStocks.filter(row => row.operator_username === currentUser.username) : filteredStocks} attachments={attachments} onDownloadAttachment={downloadAttachment} currentUser={currentUser} workRequests={filteredWorkRequests} batches={filteredBatches} purchases={filteredPurchases} canManageStock={canManageStock} setActiveTab={setActiveTab} />}
      {activeTab === "test" && <WorkRequestsPage workHistory={workRequests} teacherAccounts={teacherAccounts} reviewScope={reviewScope} onReviewScopeChange={setReviewScope} fixedType="测试" rows={testRows} logs={reviewLogs} attachments={attachments} currentUser={currentUser} units={units} canSubmit={isStudent} canReview={canReview} isAdmin={isAdmin} onAdd={addWorkRequest} onResubmit={resubmitWorkRequest} onWithdraw={withdrawWorkRequest} onReview={reviewWorkRequest} onComplete={completeWorkRequest} onCloseRejected={closeRejectedOrder} onDeleteRecord={deleteRecordPermanently} onHideRecord={hideRecordForMe} onUploadAttachment={uploadAttachment} onDownloadAttachment={downloadAttachment} onDeleteAttachment={deleteAttachment} onExport={() => exportModule("test", testRows)} />}
      {activeTab === "processing" && <WorkRequestsPage workHistory={workRequests} teacherAccounts={teacherAccounts} reviewScope={reviewScope} onReviewScopeChange={setReviewScope} fixedType="加工" rows={processingRows} logs={reviewLogs} attachments={attachments} currentUser={currentUser} units={units} canSubmit={isStudent} canReview={canReview} isAdmin={isAdmin} onAdd={addWorkRequest} onResubmit={resubmitWorkRequest} onWithdraw={withdrawWorkRequest} onReview={reviewWorkRequest} onComplete={completeWorkRequest} onCloseRejected={closeRejectedOrder} onDeleteRecord={deleteRecordPermanently} onHideRecord={hideRecordForMe} onUploadAttachment={uploadAttachment} onDownloadAttachment={downloadAttachment} onDeleteAttachment={deleteAttachment} onExport={() => exportModule("processing", processingRows)} />}
      {activeTab === "purchases" && <PurchasesPage registeredTeacherAccounts={registeredTeacherAccounts} teacherAccounts={teacherAccounts} reviewScope={reviewScope} onReviewScopeChange={setReviewScope} viewScope={purchaseViewScope} onViewScopeChange={setPurchaseViewScope} materialCatalog={materialCatalog} logs={reviewLogs} rows={filteredPurchases} attachments={attachments} batches={materialBatches} purchaseHistory={purchaseRequests} purchaseCatalog={purchaseCatalog} fundSummary={fundSummary} currentUser={currentUser} units={units} canSubmit={isStudent} canReview={canReview} isAdmin={isAdmin} onAdd={addPurchaseRequest} onResubmit={resubmitPurchaseRequest} onWithdraw={withdrawPurchaseRequest} onReview={reviewPurchase} onCompleteInbound={completePurchaseInbound} onCloseRejected={closeRejectedOrder} onDeleteRecord={deleteRecordPermanently} onHideRecord={hideRecordForMe} onUploadAttachment={uploadAttachment} onDownloadAttachment={downloadAttachment} onDeleteAttachment={deleteAttachment} onExport={() => exportModule("purchases", filteredPurchases)} />}
      {activeTab === "stock" && <StockPage movementType={isStudent ? "" : stockMovementType} currentUser={currentUser} teacherAccounts={registeredTeacherAccounts} requests={filteredStockOutRequests} onReviewRequest={reviewStockOutRequest} onCompleteRequest={completeStockOutRequest} onWithdrawRequest={withdrawStockOutRequest} onExportRequests={rows => exportModule("stockRequests", rows)} viewScope={stockViewScope} onViewScopeChange={setStockViewScope} canSubmit={isStudent} materialCatalog={materialCatalog} rows={filteredStocks} batches={materialBatches} attachments={attachments} isAdmin={isAdmin} onDeleteRecord={deleteRecordPermanently} isManager={canManageStock} onAdd={addStockTransaction} onDownloadAttachment={downloadAttachment} onExport={rows => exportModule("stock", rows)} />}
      {activeTab === "materials" && canInboundStock && <MaterialsPage canInitialize={isStudent} materialCatalog={materialCatalog} onInitialize={initializeMaterialStock} initializationMaterials={materials} initializationBatches={materialBatches} initializationUnits={units} materials={filteredMaterials} batches={filteredBatches} isAdmin={isAdmin} onDeleteRecord={deleteRecordPermanently} attachments={attachments} onDownloadAttachment={downloadAttachment} canManageStock={canManageStock} canEditBatchInformation={canEditBatchInformation} onAddBatch={addMaterialBatch} onUpdateBatch={updateMaterialBatch} onExportMaterials={() => exportModule("materials", filteredMaterials)} onExportBatches={() => exportModule("batches", filteredBatches)} />}
      {activeTab === "reports" && canViewReports && <ReportsView onQueryChange={setQuery} query={query} canFilterTeacher={isAdmin} teachers={filterTeacherAccounts} data={{ teachers: filterTeacherAccounts, workRequests, materials, batches: materialBatches, purchases: purchaseRequests, stockTransactions, stockOutRequests, reviewLogs, attachments }} students={studentAccounts}      StatCard={StatCard} MiniBars={MiniBars}   num={num} sumCosts={sumCosts} countBy={countBy}  />}
      {accountSettingsOpen && accountSettings}
      {editingBatch && canEditBatchInformation && <MaterialBatchEditor row={editingBatch} materialCatalog={materialCatalog} materials={materials} attachments={attachments} onDownload={downloadAttachment} onSave={saveMaterialBatchInformation} onClose={() => setEditingBatch(null)}       />}
      {activeTab === "admin" && isAdmin && <AdminPage accounts={filteredAccounts} auditLogs={filteredAuditLogs} onSetAccountStatus={adminSetAccountStatus} onResetPassword={adminResetPassword} onExportAccounts={() => exportModule("accounts", filteredAccounts)} onExportAudit={() => exportModule("audit", filteredAuditLogs)} />}
    </div>
  );
}
export default App;
