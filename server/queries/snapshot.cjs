module.exports = function createService({ normalizeItemName, listRecords, num, MATERIAL_FUND_TOTAL, TEST_FUND_TOTAL, db, retiredLocationPhotoIds, isSharedStockEvidence, publicAccount, getPublicTeacherAccountsForDropdown, getRegisteredTeacherAccountsForDropdown, studentNameLabels, listHiddenRecordsForAccount, buildMaterialCatalog, listAccountsForAdmin }) {
function getPreviousPurchases(materialName, excludeId = "") {
  const key = normalizeItemName(materialName);
  if (!key) return [];
  return listRecords("lab_purchase_requests", (row) =>
    String(row._id) !== String(excludeId || "") &&
    !["已撤回", "已驳回", "已关闭"].includes(row.status) &&
    normalizeItemName(row.material_name) === key
  );
}

function buildPurchaseCatalog() {
  const rows = listRecords("lab_purchase_requests", (row) => !["已撤回", "已驳回", "已关闭"].includes(row.status));
  const map = new Map();
  for (const row of rows) {
    const key = normalizeItemName(row.material_name);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        normalized_name: key,
        material_name: row.material_name,
        count: 0,
        last_public_id: row.public_id,
        last_status: row.status,
        last_quantity: row.quantity,
        last_unit: row.unit,
        last_safety_notes: row.safety_notes || "",
        last_created_at: row.created_at,
      });
    }
    const item = map.get(key);
    item.count += 1;
  }
  return [...map.values()];
}

function buildFundSummary() {
  const purchases = listRecords("lab_purchase_requests", (row) => !["已撤回", "已驳回", "已关闭"].includes(row.status));
  const work = listRecords("lab_work_requests", (row) => ["已完成", "已归档"].includes(row.status));
  const materialCommitted = purchases.reduce((sum, row) => sum + num(row.estimated_price), 0);
  const testCommitted = work.filter((row) => row.request_type === "测试").reduce((sum, row) => sum + num(row.cost_test), 0);
  const processingCommitted = work.filter((row) => row.request_type === "加工").reduce((sum, row) => sum + num(row.cost_processing ?? (num(row.cost_test) + num(row.cost_material))), 0);

  return {
    material_total: Number.isFinite(MATERIAL_FUND_TOTAL) ? MATERIAL_FUND_TOTAL : null,
    material_committed: materialCommitted,
    material_balance: Number.isFinite(MATERIAL_FUND_TOTAL) ? MATERIAL_FUND_TOTAL - materialCommitted : null,
    test_total: Number.isFinite(TEST_FUND_TOTAL) ? TEST_FUND_TOTAL : null,
    test_committed: testCommitted,
    processing_committed: processingCommitted,
    repair_committed: work.filter(row => row.request_type === '维修').reduce((sum,row)=>sum+num(row.cost_repair),0),
    test_balance: Number.isFinite(TEST_FUND_TOTAL) ? TEST_FUND_TOTAL - testCommitted : null,
    note: "测试、加工、维修仅统计已完成工单的最终金额；采购按申请记录金额统计。",
  };
}

function listAll(account, { includeAudit = true } = {}) {
  const isAdmin = account.account_type === "admin";
  const isTeacher = account.account_type === "teacher";

  // Signed-in members share work progress; mutations remain restricted to owners/reviewers.
  const workRequests = listRecords("lab_work_requests");

  // All signed-in users can read purchase records; mutations retain their own authorization.
  const purchases = listRecords("lab_purchase_requests");

  // Saved stock movements and their evidence photos are visible to all signed-in users.
  const stockTransactions = listRecords("lab_stock_transactions");
  const stockOutRequests = listRecords("lab_stock_out_requests");
  const inventoryPurchases = listRecords("lab_purchase_requests");
  const purchaseById = new Map(inventoryPurchases.map(row => [String(row._id), row]));
  const purchaseByPublicId = new Map(inventoryPurchases.map(row => [row.public_id, row]));
  const linkInventoryProfile = require("../features/inventory/inventory-profile.cjs")(db);
  const materialBatches = listRecords("lab_material_batches").map(batch => {
    const source = purchaseById.get(String(batch.related_purchase_record_id)) || purchaseByPublicId.get(batch.related_purchase_id);
    return linkInventoryProfile({ ...batch,
      purchaser_name: batch.purchaser_name || source?.applicant_name || source?.applicant_username || "",
      purchaser_username: batch.purchaser_username || source?.applicant_username || "",
      inbound_by_name: batch.inbound_by_name || batch.created_by_name || batch.created_by_username || "",
      inbound_by_username: batch.inbound_by_username || batch.created_by_username || "",
    });
  });

  const visibleTargetPublicIds = new Set([
    ...workRequests.map((r) => r.public_id),
    ...purchases.map((r) => r.public_id),
    ...stockTransactions.map((r) => r.public_id),
    ...stockOutRequests.map((r) => r.public_id),
  ].filter(Boolean));

  const visibleTargetIds = new Set([
    ...workRequests.map((r) => String(r._id)),
    ...purchases.map((r) => String(r._id)),
    ...stockTransactions.map((r) => String(r._id)),
    ...stockOutRequests.map((r) => String(r._id)),
  ].filter(Boolean));

  const allLogs = listRecords("lab_review_logs");
  const reviewLogs = isAdmin || isTeacher ? allLogs : allLogs.filter((log) =>
    visibleTargetPublicIds.has(log.target_public_id) ||
    visibleTargetIds.has(String(log.target_id))
  );

  const retiredPhotoIds = retiredLocationPhotoIds([...purchases, ...stockTransactions, ...materialBatches]);
  const attachmentRows = isAdmin
    ? listRecords("lab_attachments", (r) => !r.deleted_at)
    : listRecords("lab_attachments", (r) =>
      !r.deleted_at && (
        isSharedStockEvidence(r, stockTransactions, materialBatches) ||
        r.uploaded_by_username === account.username ||
        visibleTargetPublicIds.has(r.target_public_id) ||
        visibleTargetIds.has(String(r.target_id))
      )
    );

  const base = {
    current_account: publicAccount(db.prepare("SELECT * FROM accounts WHERE username=?").get(account.username)),
    lab_work_requests: workRequests,
    lab_review_logs: reviewLogs,
    lab_materials: listRecords("lab_materials"),
    lab_material_batches: materialBatches,
    lab_purchase_requests: purchases,
    lab_stock_transactions: stockTransactions,
    lab_stock_out_requests: stockOutRequests,
    lab_expense_records: listRecords("lab_expense_records"),
    lab_test_processing_units: listRecords("lab_test_processing_units"),
    lab_attachments: attachmentRows.filter(row => !retiredPhotoIds.has(String(row._id))),
    lab_accounts: getPublicTeacherAccountsForDropdown(),
    lab_registered_teacher_accounts: getRegisteredTeacherAccountsForDropdown(),
    ...(isAdmin ? { lab_teacher_accounts: db.prepare("SELECT username, display_name FROM accounts WHERE account_type = 'teacher' ORDER BY username").all() } : {}),
    lab_student_accounts: isTeacher || isAdmin ? db.prepare("SELECT username, display_name FROM accounts WHERE account_type = 'student' ORDER BY username").all() : [],
    lab_student_name_labels: studentNameLabels(db),
    lab_user_hidden_records: listHiddenRecordsForAccount(account),
    lab_fund_summary: buildFundSummary(),
    lab_purchase_catalog: buildPurchaseCatalog(),
    lab_material_catalog: buildMaterialCatalog(listRecords),
  };

  if (isAdmin) {
    base.accounts = listAccountsForAdmin();
    if (includeAudit) base.audit_logs = db.prepare("SELECT * FROM audit_logs ORDER BY id DESC").all();
    base.audit_revision = db.prepare("SELECT COALESCE(MAX(id),0) AS id FROM audit_logs").get().id;
  }

  return base;
}
return { getPreviousPurchases, buildPurchaseCatalog, buildFundSummary, listAll };
};
