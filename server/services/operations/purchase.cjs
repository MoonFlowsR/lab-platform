module.exports = function createPurchaseOperations(context) {
const { PURCHASE_EDIT_FIELDS, addAudit, addReviewLog, db, getPreviousPurchases, getRecord, insertRecord, isImageAttachmentRecord, listRecords, nextPublicId, normalizeItemName, nowISO, num, pickFields, purchaseCategory, purchasePurpose, recordChanges, requireAssignedReviewer, requireOwner, requireStudentSubmission, requireTeacherOrAdmin, requiredPurchaseExpiryDate, selectedReviewTeacher, selectedStockTeachers, storageDetails, updateRecord } = context;
return {
submitPurchaseRequest(req, res, action, payload, account) {
if (action === "submitPurchaseRequest") {
    requireStudentSubmission(account);
    const reviewTeacher = selectedReviewTeacher(payload);
    const teachers = selectedStockTeachers(account);
    const materialName = String(payload.material_name || "").trim();
    const specification = String(payload.specification || "").trim();
    const quantity = num(payload.quantity);
    const unit = String(payload.unit || "").trim();
    const supplier = String(payload.preferred_supplier || "").trim();
    const estimatedPrice = num(payload.estimated_price);
    const category = purchaseCategory(payload.purchase_category);
    const purpose = purchasePurpose(payload.purchase_purpose);

    if (!materialName) throw new Error("请填写采购物品名称。");
    if (!specification) throw new Error("请填写规格/型号。");
    if (quantity <= 0) throw new Error("采购数量必须大于 0。");
    if (!unit) throw new Error("请填写单位。");
    if (!supplier) throw new Error("请填写采购单位/供应商。");
    if (estimatedPrice <= 0) throw new Error("预计金额必须大于 0。");

    const previous = getPreviousPurchases(materialName);
    const isFirstPurchase = previous.length === 0;
    let safetyNotes = String(payload.safety_notes || "").trim();

    if (isFirstPurchase && !safetyNotes) {
      throw new Error("首次采购该物品必须填写安全事项。");
    }
    if (!isFirstPurchase && !payload.repeat_purchase_confirmed) {
      throw new Error("检测到历史同名采购，请确认现有库存不足或已用完后再提交。");
    }
    if (!safetyNotes && previous[0]?.safety_notes) safetyNotes = previous[0].safety_notes;

    const idInfo = nextPublicId("PUR");
    const record = insertRecord("lab_purchase_requests", {
      ...pickFields(payload, PURCHASE_EDIT_FIELDS),
      ...reviewTeacher,
      ...teachers,
      ...idInfo,
      material_name: materialName,
      specification,
      quantity,
      unit,
      preferred_supplier: supplier,
      estimated_price: estimatedPrice,
      purchase_category: category,
      purchase_purpose: purpose,
      safety_notes: safetyNotes,
      is_first_purchase: isFirstPurchase,
      previous_purchase_id: previous[0]?.public_id || "",
      applicant_name: account.display_name,
      applicant_username: account.username,
      applicant_account_type: account.account_type,
      status: "待教师审核",
      review_note: "",
      ordered_status: "待审核",
      received_status: "未到货",
      created_at: nowISO(),
      updated_at: nowISO(),
    }, { applicant_username: account.username });

    addAudit(req, account, action, "lab_purchase_requests", record._id, null, record);
    return res.json({ ok: true, record });
  }
},
withdrawPurchaseRequest(req, res, action, payload, account) {
if (action === "withdrawPurchaseRequest") {
    if (account.account_type !== "student") throw new Error("只有学生申请人可以撤回本人待审核申请。教师和管理员请使用同意或驳回。");
    const before = getRecord("lab_purchase_requests", payload.id);
    if (!before) throw new Error("未找到采购申请。");
    requireOwner(before, account);
    if (before.status !== "待教师审核") throw new Error("只有待教师审核的采购申请可以撤回。");
    const after = updateRecord("lab_purchase_requests", payload.id, {
      status: "已撤回",
      withdrawn_by: account.display_name,
      withdrawn_username: account.username,
      withdrawn_at: nowISO(),
    });
    addAudit(req, account, action, "lab_purchase_requests", payload.id, before, after);
    return res.json({ ok: true });
  }
},
resubmitPurchaseRequest(req, res, action, payload, account) {
if (action === "resubmitPurchaseRequest") {
    requireStudentSubmission(account);
    const before = getRecord("lab_purchase_requests", payload.id);
    if (!before) throw new Error("未找到采购申请。");
    requireOwner(before, account);
    if (!["需修改", "已驳回", "已撤回"].includes(before.status)) throw new Error("请先撤回，或在需修改/已驳回状态下重新提交。");

    const patch = pickFields(payload.patch || {}, PURCHASE_EDIT_FIELDS);
    const reviewTeacher = selectedReviewTeacher(patch);
    const teachers = selectedStockTeachers(account);
    const materialName = String(patch.material_name || "").trim();
    const specification = String(patch.specification || "").trim();
    const quantity = num(patch.quantity);
    const unit = String(patch.unit || "").trim();
    const supplier = String(patch.preferred_supplier || "").trim();
    const estimatedPrice = num(patch.estimated_price);
    const category = purchaseCategory(patch.purchase_category);
    const purpose = purchasePurpose(patch.purchase_purpose);

    if (!materialName) throw new Error("请填写采购物品名称。");
    if (!specification) throw new Error("请填写规格/型号。");
    if (quantity <= 0) throw new Error("采购数量必须大于 0。");
    if (!unit) throw new Error("请填写单位。");
    if (!supplier) throw new Error("请填写采购单位/供应商。");
    if (estimatedPrice <= 0) throw new Error("预计金额必须大于 0。");

    const previous = getPreviousPurchases(materialName, before._id);
    const isFirstPurchase = previous.length === 0 && Boolean(before.is_first_purchase ?? true);
    let safetyNotes = String(patch.safety_notes || before.safety_notes || "").trim();

    if (isFirstPurchase && !safetyNotes) throw new Error("首次采购该物品必须填写安全事项。");
    if (!isFirstPurchase && !patch.repeat_purchase_confirmed) {
      throw new Error("检测到历史同名采购，请确认现有库存不足或已用完后再提交。");
    }
    if (!safetyNotes && previous[0]?.safety_notes) safetyNotes = previous[0].safety_notes;

    const after = updateRecord("lab_purchase_requests", payload.id, {
      ...patch,
      ...reviewTeacher,
      ...teachers,
      material_name: materialName,
      specification,
      quantity,
      unit,
      preferred_supplier: supplier,
      estimated_price: estimatedPrice,
      purchase_category: category,
      purchase_purpose: purpose,
      safety_notes: safetyNotes,
      is_first_purchase: isFirstPurchase,
      previous_purchase_id: previous[0]?.public_id || before.previous_purchase_id || "",
      status: "待教师审核",
      review_note: "",
      reviewed_by: "",
      reviewed_username: "",
      reviewed_at: null,
      ordered_status: "待审核",
      received_status: "未到货",
      resubmitted_by: account.display_name,
      resubmitted_username: account.username,
      resubmitted_at: nowISO(),
    });

    addAudit(req, account, action, "lab_purchase_requests", payload.id, before, after);
    return res.json({ ok: true, record: after });
  }
},
reviewPurchaseRequest(req, res, action, payload, account) {
if (action === "reviewPurchaseRequest") {
    const result = db.transaction(() => {
    requireTeacherOrAdmin(account);
    const before = getRecord("lab_purchase_requests", payload.id);
    if (!before) throw new Error("未找到采购申请。");
    requireAssignedReviewer(before, account);
    if (before.status !== "待教师审核") throw new Error("该采购当前不处于待审核状态，不能重复审核。");

    const nextStatus = String(payload.next_status || "").trim();
    const note = String(payload.review_note || "").trim();
    const reviewerTeacherName = String(account.display_name || account.username || "").trim();

    if (!["已通过", "已驳回"].includes(nextStatus)) throw new Error("采购审核只能选择同意或驳回。");
    if (nextStatus === "已驳回" && !note) throw new Error("驳回时必须填写审核意见。");

    const finalStatus = nextStatus === "已通过" ? "待入库" : nextStatus;
    const after = updateRecord("lab_purchase_requests", payload.id, {
      status: finalStatus,
      review_note: note,
      reviewed_by: reviewerTeacherName,
      reviewed_username: account.username,
      reviewed_at: nowISO(),
      ordered_status: nextStatus === "已通过" ? "已批准" : before.ordered_status,
      received_status: nextStatus === "已通过" ? "待入库" : before.received_status,
    });

    addReviewLog(before, account, nextStatus, before.status, finalStatus, note, "lab_purchase_requests");
    addAudit(req, account, action, "lab_purchase_requests", payload.id, before, after);
    return after;
    }).immediate();
    recordChanges.notify();
    return res.json({ ok: true, record: result });
  }
},
completePurchaseInbound(req, res, action, payload, account) {
if (action === "completePurchaseInbound") {
    const result = db.transaction(() => {
    const before = getRecord("lab_purchase_requests", payload.id);
    if (!before) throw new Error("未找到采购申请。");

    const isOwner = before.applicant_username === account.username;
    const isAdmin = account.account_type === "admin";
    if (!isOwner && !isAdmin) throw new Error("采购入库应由原采购申请人完成。");
    if (before.status !== "待入库") throw new Error("只有审核通过且处于待入库状态的采购才能完成入库。");

    const teachers = selectedStockTeachers(db.prepare("SELECT * FROM accounts WHERE username=?").get(before.applicant_username) || account);
    const actualQty = num(payload.actual_qty);
    const unit = String(payload.unit || before.unit || "").trim();
    const storage = storageDetails(payload);
    const storageLocation = storage.storage_location;
    const expiryDate = requiredPurchaseExpiryDate(payload.expiry_date);
    const batchNo = String(payload.batch_no || "").trim();
    const inboundRemark = String(payload.remark || "").trim();
    const remark = [String(before.remark || "").trim(), inboundRemark].filter(Boolean).join("；");

    if (actualQty <= 0) throw new Error("实际到货数量必须大于 0。");
    if (!unit) throw new Error("请填写入库单位。");
    if (!storageLocation) throw new Error("请填写储存位置。");

    const photoAttachment = getRecord("lab_attachments", payload.photo_attachment_id);
    if (!photoAttachment || photoAttachment.deleted_at) throw new Error("请上传到货/实物照片。");
    if (!isImageAttachmentRecord(photoAttachment)) throw new Error("入库留痕必须为 PNG、JPG/JPEG 图片。");
    if (photoAttachment.target_collection !== "lab_purchase_requests" ||
        String(photoAttachment.target_id) !== String(before._id)) {
      throw new Error("入库照片未正确关联到当前采购。");
    }
    if (!isAdmin && photoAttachment.uploaded_by_username !== account.username) {
      throw new Error("入库照片必须由当前采购申请人上传。");
    }


    let material = listRecords("lab_materials", (m) =>
      normalizeItemName(m.name_cn || m.name) === normalizeItemName(before.material_name)
    )[0];

    if (!material) {
      const materialId = nextPublicId("MAT");
      material = insertRecord("lab_materials", {
        ...materialId,
        material_code: materialId.public_id,
        name_cn: before.material_name,
        name: before.material_name,
        category: before.purchase_category,
        default_unit: unit,
        hazard_level: "",
        storage_condition: "",
        safety_notes: before.safety_notes || "",
        min_stock: 0,
        created_from_purchase_id: before.public_id,
        created_by_username: account.username,
        created_by_name: account.display_name,
        created_at: nowISO(),
        updated_at: nowISO(),
      });
      addAudit(req, account, "autoCreateMaterialFromPurchase", "lab_materials", material._id, null, material);
    }

    const batchIdInfo = nextPublicId("BATCH");
    const totalPrice = num(before.estimated_price);
    const unitPrice = totalPrice / actualQty;
    const batch = insertRecord("lab_material_batches", {
      ...batchIdInfo,
      batch_code: batchIdInfo.public_id,
      material_id: material._id,
      material_name: before.material_name,
      purchase_purpose: before.purchase_purpose || "",
      ...teachers,
      purchase_category: before.purchase_category || material.category || "",
      safety_notes: before.safety_notes || "",
      supplier: before.preferred_supplier || "",
      brand: "",
      spec: before.specification || "",
      batch_no: batchNo,
      expiry_date: expiryDate,
      initial_qty: actualQty,
      current_qty: actualQty,
      unit,
      unit_price: unitPrice,
      total_price: totalPrice,
      storage_location: storageLocation,
      ...storage,
      min_qty: num(material.min_stock || 0),
      review_teacher_username: before.review_teacher_username || before.reviewed_username || "",
      review_teacher_name: before.review_teacher_name || before.reviewed_by || "",
      related_purchase_id: before.public_id,
      related_purchase_record_id: before._id,
      purchaser_name: before.applicant_name || before.applicant_username,
      purchaser_username: before.applicant_username,
      inbound_by_name: account.display_name || account.username,
      inbound_by_username: account.username,
      acceptance_status: "已入库",
      inbound_photo_attachment_id: photoAttachment._id,
      remark,
      created_by_username: account.username,
      created_by_name: account.display_name,
      created_at: nowISO(),
      updated_at: nowISO(),
    });
    addAudit(req, account, "completePurchaseInbound", "lab_material_batches", batch._id, null, batch);

    const txIdInfo = nextPublicId("IO");
    const transaction = insertRecord("lab_stock_transactions", {
      ...txIdInfo,
      transaction_type: "入库",
      batch_id: batch._id,
      material_id: material._id,
      material_name: before.material_name,
      batch_code: batch.batch_code,
      quantity: actualQty,
      unit,
      stock_before: 0,
      stock_after: actualQty,
      operator_name: account.display_name,
      operator_username: account.username,
      operator_account_type: account.account_type,
      review_teacher_username: before.review_teacher_username || before.reviewed_username || "",
      review_teacher_name: before.review_teacher_name || before.reviewed_by || "",
      related_purchase_id: before.public_id,
      purchase_purpose: before.purchase_purpose || "",
      ...teachers,
      usage_reason: "采购到货入库",
      storage_location: storageLocation,
      ...storage,
      photo_attachment_id: photoAttachment._id,
      created_at: nowISO(),
      updated_at: nowISO(),
    }, { operator_username: account.username });
    addAudit(req, account, "completePurchaseInbound", "lab_stock_transactions", transaction._id, null, transaction);

    const after = updateRecord("lab_purchase_requests", before._id, {
      ...teachers,
      status: "已完成",
      received_status: "已入库",
      completed_by: account.display_name,
      completed_username: account.username,
      completed_at: nowISO(),
      inbound_batch_id: batch._id,
      inbound_batch_code: batch.batch_code,
      inbound_transaction_id: transaction._id,
      inbound_photo_attachment_id: photoAttachment._id,
      expiry_date: expiryDate,
      actual_received_qty: actualQty,
      actual_received_unit: unit,
      storage_location: storageLocation,
      ...storage,
    });

    updateRecord("lab_attachments", photoAttachment._id, {
      attachment_state: "bound",
      bound_at: nowISO(),
    });
    addAudit(req, account, action, "lab_purchase_requests", before._id, before, after);
    return { record: after, material, batch, transaction };
    }).immediate();
    return res.json({ ok: true, ...result });
  }
},
};
};
