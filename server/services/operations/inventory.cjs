module.exports = function createInventoryOperations(context) {
const { addAudit, batchPurchasePurpose, bindStockEvidence, db, getRecord, insertRecord, listRecords, nextPublicId, nowISO, num, requireItemPhoto, requireStockEvidence, requireTeacherOrAdmin, requiredPurchaseExpiryDate, storageDetails, updateBatchInformation, updateRecord } = context;
return {
operation14(req, res, action, payload, account) {
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
operation15(req, res, action, payload, account) {
if (action === "addMaterialBatch") {
    const material = getRecord("lab_materials", payload.material_id);
    if (!material) throw new Error("未找到材料主数据。");

    const initialQty = num(payload.initial_qty);
    const unitPrice = num(payload.unit_price);
    if (initialQty <= 0) throw new Error("入库数量必须大于 0。");

    const evidence = requireStockEvidence(account, payload.photo_attachment_id, "入库");
    return db.transaction(() => {
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
      total_price: initialQty * unitPrice,
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
    return res.json({ ok: true, batch: record, transaction });
    })();
  }
},
operation16(req, res, action, payload, account) {
if (action === "updateMaterialBatchInformation") {
    if (!["student", "admin"].includes(account.account_type)) throw new Error("只有学生或管理员账号可以修改物品信息。");
    const result = updateBatchInformation({ db, req, account, payload, getRecord, listRecords, insertRecord, updateRecord, nextPublicId, addAudit, nowISO, requiredPurchaseExpiryDate, storageDetails, requireItemPhoto, bindStockEvidence });
    return res.json({ ok: true, ...result });
  }
},
operation17(req, res, action, payload, account) {
if (action === "updateMaterialBatch") {
    requireTeacherOrAdmin(account);
    const before = getRecord("lab_material_batches", payload.id);
    if (!before) throw new Error("未找到材料批次。");

    const reason = String(payload.reason || "").trim();
    if (!reason) throw new Error("库存修改必须填写原因。");

    const nextQty = num(payload.current_qty);
    const minQty = num(payload.min_qty);
    if (nextQty < 0) throw new Error("库存数量不能小于 0。");
    if (minQty < 0) throw new Error("最低预警数量不能小于 0。");

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
    return res.json({ ok: true, record: after, transaction: txRecord });
  }
},
};
};
