module.exports = function createWorkOperations(context) {
const { WORK_REQUEST_EDIT_FIELDS, addAudit, addReviewLog, closeRejectedRequest, completeWorkValues, db, getRecord, insertRecord, nextPublicId, nowISO, num, pickFields, recordChanges, requireAssignedReviewer, requireOwner, requireStudentSubmission, requireTeacherOrAdmin, saveWorkWithAttachments, selectedReviewTeacher, studentProfiles, updateRecord, workRequestCosts } = context;
return {
operation7(req, res, action, payload, account) {
if (action === "submitWorkRequest") {
    requireStudentSubmission(account);
    const reviewTeacher = selectedReviewTeacher(payload);
    const requestType = String(payload.request_type || "").trim();
    const workContent = String(payload.work_content || "").trim();
    const externalUnit = String(payload.external_unit || "").trim();
    const workloadQuantity = num(payload.workload_quantity);
    const workloadUnit = String(payload.workload_unit || "").trim();

    if (!["测试", "加工"].includes(requestType)) throw new Error("申请类型只能为测试或加工。");
    if (!workContent) throw new Error(`请填写${requestType}名称。`);
    if (!externalUnit) throw new Error(`请填写${requestType}单位。`);
    if (workloadQuantity <= 0) throw new Error("机时/样品数量必须大于 0。");
    if (!workloadUnit) throw new Error("请选择计量方式。");

    const idInfo = nextPublicId(requestType === "测试" ? "TEST" : "PROC");
    const record = saveWorkWithAttachments(account, payload.attachment_ids || [], () => insertRecord("lab_work_requests", {
      ...pickFields(payload, WORK_REQUEST_EDIT_FIELDS),
      ...reviewTeacher,
      ...studentProfiles.snapshot(account),
      ...idInfo,
      request_type: requestType,
      work_content: workContent,
      external_unit: externalUnit,
      workload_quantity: workloadQuantity,
      workload_unit: workloadUnit,
      ...workRequestCosts(payload, requestType),
      applicant_name: account.display_name,
      applicant_username: account.username,
      applicant_account_type: account.account_type,
      status: "待教师审核",
      teacher_signature_status: "未确认",
      teacher_signed_by: "",
      teacher_signed_at: null,
      review_note: "",
      completion_note: "",
      created_by_username: account.username,
      created_by_name: account.display_name,
      created_at: nowISO(),
      updated_at: nowISO(),
    }, { applicant_username: account.username }));

    addAudit(req, account, action, "lab_work_requests", record._id, null, record);
    return res.json({ ok: true, record });
  }
},
operation8(req, res, action, payload, account) {
if (action === "withdrawWorkRequest") {
    if (account.account_type !== "student") throw new Error("只有学生申请人可以撤回本人待审核申请。教师和管理员请使用同意或驳回。");
    const before = getRecord("lab_work_requests", payload.id);
    if (!before) throw new Error("未找到工作申请。");
    requireOwner(before, account);
    if (before.status !== "待教师审核") throw new Error("只有待教师审核的申请可以撤回。");

    const after = updateRecord("lab_work_requests", payload.id, {
      status: "已撤回",
      withdrawn_by: account.display_name,
      withdrawn_username: account.username,
      withdrawn_at: nowISO(),
    });
    addAudit(req, account, action, "lab_work_requests", payload.id, before, after);
    return res.json({ ok: true });
  }
},
operation9(req, res, action, payload, account) {
if (action === "resubmitWorkRequest") {
    requireStudentSubmission(account);
    const before = getRecord("lab_work_requests", payload.id);
    if (!before) throw new Error("未找到测试/加工申请。");
    requireOwner(before, account);
    if (!["需修改", "已驳回", "已撤回"].includes(before.status)) throw new Error("请先撤回，或在需修改/已驳回状态下重新提交。");

    const patch = pickFields(payload.patch || {}, WORK_REQUEST_EDIT_FIELDS);
    const reviewTeacher = selectedReviewTeacher(patch);
    const requestType = String(patch.request_type || before.request_type || "").trim();
    const workContent = String(patch.work_content || "").trim();
    const externalUnit = String(patch.external_unit || "").trim();
    const workloadQuantity = num(patch.workload_quantity);
    const workloadUnit = String(patch.workload_unit || "").trim();

    if (!["测试", "加工"].includes(requestType)) throw new Error("申请类型只能为测试或加工。");
    if (!workContent) throw new Error(`请填写${requestType}名称。`);
    if (!externalUnit) throw new Error(`请填写${requestType}单位。`);
    if (workloadQuantity <= 0) throw new Error("机时/样品数量必须大于 0。");
    if (!workloadUnit) throw new Error("请选择计量方式。");

    const after = saveWorkWithAttachments(account, payload.attachment_ids || [], () => updateRecord("lab_work_requests", payload.id, {
      ...patch,
      ...reviewTeacher,
      ...studentProfiles.snapshot(account),
      request_type: requestType,
      work_content: workContent,
      external_unit: externalUnit,
      workload_quantity: workloadQuantity,
      workload_unit: workloadUnit,
      ...workRequestCosts(patch, requestType),
      status: "待教师审核",
      review_note: "",
      reviewed_by: "",
      reviewed_username: "",
      reviewed_at: null,
      teacher_signature_status: "未确认",
      teacher_signed_by: "",
      teacher_signed_at: null,
      resubmitted_by: account.display_name,
      resubmitted_username: account.username,
      resubmitted_at: nowISO(),
    }));
    addAudit(req, account, action, "lab_work_requests", payload.id, before, after);
    return res.json({ ok: true, record: after });
  }
},
operation10(req, res, action, payload, account) {
if (action === "reviewWorkRequest") {
    requireTeacherOrAdmin(account);
    const before = getRecord("lab_work_requests", payload.id);
    if (!before) throw new Error("未找到测试/加工申请。");
    requireAssignedReviewer(before, account);
    if (before.status !== "待教师审核") throw new Error("该申请当前不处于待审核状态，不能重复审核。");

    const nextStatus = String(payload.next_status || "").trim();
    const note = String(payload.review_note || "").trim();
    const reviewerTeacherName = String(account.display_name || account.username || "").trim();

    if (!["已通过", "已驳回"].includes(nextStatus)) throw new Error("审核只能选择同意或驳回。");
    if (nextStatus === "已驳回" && !note) throw new Error("驳回时必须填写审核意见。");

    const patch = {
      status: nextStatus,
      review_note: note,
      reviewed_by: reviewerTeacherName,
      reviewed_username: account.username,
      reviewed_at: nowISO(),
    };

    if (nextStatus === "已通过") {
      patch.teacher_signature_status = "已确认";
      patch.teacher_signed_by = reviewerTeacherName;
      patch.teacher_signed_at = nowISO();
    }

    const after = updateRecord("lab_work_requests", payload.id, patch);
    addReviewLog(before, account, nextStatus, before.status, nextStatus, note, "lab_work_requests");
    addAudit(req, account, action, "lab_work_requests", payload.id, before, after);
    return res.json({ ok: true, record: after });
  }
},
operation11(req, res, action, payload, account) {
if (action === "closeRejectedRequest") {
    if (!["lab_work_requests", "lab_purchase_requests"].includes(payload.collection)) throw new Error("仅测试、加工或采购工单支持关闭。");
    const after = db.transaction(() => {
      const before = getRecord(payload.collection, payload.id);
      if (!before) throw new Error("未找到工单。");
      const patch = closeRejectedRequest(before, payload, account, nowISO());
      const record = updateRecord(payload.collection, payload.id, patch);
      addAudit(req, account, action, payload.collection, payload.id, before, record);
      return record;
    })();
    recordChanges.notify();
    return res.json({ ok: true, record: after });
  }
},
operation12(req, res, action, payload, account) {
if (action === "completeWorkRequest") {
    const before = getRecord("lab_work_requests", payload.id);
    if (!before) throw new Error("未找到测试/加工申请。");
    const patch = completeWorkValues(before, payload, account, require('../../../src/dropdown-options.json').billingMethods, nowISO());
    const after = db.transaction(() => {
      const record = updateRecord("lab_work_requests", payload.id, patch);
      addAudit(req, account, action, "lab_work_requests", payload.id, before, record);
      return record;
    })();
    return res.json({ ok: true, record: after });
  }
},
};
};
