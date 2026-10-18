module.exports = function createInventoryOperations(context) {
const { addAudit, batchPurchasePurpose, bindStockEvidence, db, getRecord, insertRecord, listRecords, nextPublicId, nowISO, num, requireItemPhoto, requireStockEvidence, requireTeacherOrAdmin, requiredPurchaseExpiryDate, storageDetails, updateBatchInformation, updateRecord } = context;
const stockNumber = (value, label) => {
  if (!["number", "string"].includes(typeof value) || String(value).trim() === "" || !Number.isFinite(Number(value))) {
    throw new Error(label + "必须填写有效数字。");
  }
  return Number(value);
};
return {
addMaterial(req, res, action, payload, account) {
if (action === "addMaterial") {
    const idInfo = nextPublicId("MAT");
    const record = insertRecord("lab_materials", {
      ...payload,
      ...idInfo,
      material_code: idInfo.public_id,
      created_by_username: account.username,
      created_by_name: account.display_name,
      created_at: nowISO(),
      updated_at: nowISO(),
    });
    addAudit(req, account, action, "lab_materials", record._id, null, record);
    return res.json({ ok: true });
  }
},
addMaterialBatch(req, res, action, payload, account) {
if (action === "addMaterialBatch") {
    const initialQty = stockNumber(payload.initial_qty, "入库数量");
    const unitPrice = payload.unit_price == null || (typeof payload.unit_price === "string" && payload.unit_price.trim() === "")
      ? 0 : stockNumber(payload.unit_price, "单价");
    if (initialQty <= 0) throw new Error("入库数量必须大于 0。");
    if (unitPrice < 0) throw new Error("单价不能小于 0。");
    const totalPrice = initialQty * unitPrice;
    if (!Number.isFinite(totalPrice)) throw new Error("入库总价超出有效数字范围。");

    const result = db.transaction(() => {
    const material = getRecord("lab_materials", payload.material_id);
    if (!material) throw new Error("未找到材料主数据。");
    const evidence = requireStockEvidence(account, payload.photo_attachment_id, "入库");
    const idInfo = nextPublicId("BATCH");
    const record = insertRecord("lab_material_batches", {
      ...payload,
      ...idInfo,
      batch_code: idInfo.public_id,
      purchase_purpose: batchPurchasePurpose(payload),
      inbound_photo_attachment_id: evidence._id,
      material_name: material.name_cn || material.name || "",
      direction: material.direction || "",
      initial_qty: initialQty,
      current_qty: initialQty,
      unit_price: unitPrice,
      total_price: totalPrice,
      created_by_username: account.username,
      created_by_name: account.display_name,
      created_at: nowISO(),
      updated_at: nowISO(),
    });
    addAudit(req, account, action, "lab_material_batches", record._id, null, record);
    const transaction = insertRecord("lab_stock_transactions", {
      ...nextPublicId("IO"), transaction_type: "入库", batch_id: record._id, batch_code: record.batch_code,
      material_id: material._id, material_name: record.material_name, quantity: initialQty, unit: record.unit,
      storage_location: record.storage_location || "", purchase_purpose: record.purchase_purpose,
      stock_before: 0, stock_after: initialQty, usage_reason: "新增批次入库",
      photo_attachment_id: evidence._id, operator_name: account.display_name,
      operator_username: account.username, operator_account_type: account.account_type,
      created_at: nowISO(), updated_at: nowISO(),
    }, { operator_username: account.username });
    bindStockEvidence(evidence, transaction);
    addAudit(req, account, action, "lab_stock_transactions", transaction._id, null, transaction);
    return { batch: record, transaction };
    }).immediate();
    return res.json({ ok: true, ...result });
  }
},
updateMaterialBatchInformation(req, res, action, payload, account) {
if (action === "updateMaterialBatchInformation") {
    if (!["student", "admin"].includes(account.account_type)) throw new Error("只有学生或管理员账号可以修改物品信息。");
    const result = updateBatchInformation({ db, req, account, payload, getRecord, listRecords, insertRecord, updateRecord, nextPublicId, addAudit, nowISO, requiredPurchaseExpiryDate, storageDetails, requireItemPhoto, bindStockEvidence });
    return res.json({ ok: true, ...result });
  }
},
updateMaterialBatch(req, res, action, payload, account) {
if (action === "updateMaterialBatch") {
    requireTeacherOrAdmin(account);
    const reason = String(payload.reason || "").trim();
    if (!reason) throw new Error("库存修改必须填写原因。");

    const nextQty = stockNumber(payload.current_qty, "库存数量");
    const minQty = stockNumber(payload.min_qty, "最低预警数量");
    if (nextQty < 0) throw new Error("库存数量不能小于 0。");
    if (minQty < 0) throw new Error("最低预警数量不能小于 0。");

    const result = db.transaction(() => {
    const before = getRecord("lab_material_batches", payload.id);
    if (!before) throw new Error("未找到材料批次。");
    if (!payload.expected_updated_at || payload.expected_updated_at !== before.updated_at) {
      throw new Error("该批次库存或信息已被更新，本次修改未保存。请刷新库存，核对最新数量后重新修改。");
    }

    const after = updateRecord("lab_material_batches", payload.id, {
      current_qty: nextQty,
      min_qty: minQty,
      storage_location: String(payload.storage_location || "").trim(),
      ...(payload.storage_room ? storageDetails({ ...payload, storage_detail: payload.storage_detail ?? before.storage_detail }) :
        String(payload.storage_location || "").trim() === String(before.storage_location || "").trim() ? {} : { storage_room: "", storage_detail: "" }),
      last_modified_by: account.display_name,
      last_modified_username: account.username,
      last_modified_at: nowISO(),
      last_modification_reason: reason,
    });

    const idInfo = nextPublicId("IO");
    const txRecord = insertRecord("lab_stock_transactions", {
      ...idInfo,
      transaction_type: "调整",
      batch_id: before._id,
      material_id: before.material_id,
      material_name: before.material_name,
      batch_code: before.batch_code,
      quantity: Math.abs(nextQty - num(before.current_qty)),
      unit: before.unit,
      stock_before: num(before.current_qty),
      stock_after: nextQty,
      operator_name: account.display_name,
      operator_username: account.username,
      operator_account_type: account.account_type,
      modification_reason: reason,
      usage_reason: reason,
      storage_room: after.storage_room || "", storage_detail: after.storage_detail || "", storage_location: after.storage_location,
      created_at: nowISO(),
      updated_at: nowISO(),
    }, { operator_username: account.username });

    addAudit(req, account, action, "lab_material_batches", payload.id, before, after);
    addAudit(req, account, action, "lab_stock_transactions", txRecord._id, null, txRecord);
    return { record: after, transaction: txRecord };
    }).immediate();
    return res.json({ ok: true, ...result });
  }
},
};
};
