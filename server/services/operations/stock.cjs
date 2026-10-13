module.exports = function createStockOperations(context) {
const { addAudit, bindStockEvidence, db, getRecord, initializeMaterialStock, insertRecord, listRecords, nextPublicId, nowISO, recordChanges, requireItemPhoto, requireStockEvidence, stockOutService, studentProfiles } = context;
return {
operation13(req, res, action, payload, account) {
if (action === "initializeMaterialStock") {
    if (account.account_type !== "student") throw new Error("现有材料建库由学生账号录入。");
    const result = initializeMaterialStock({ db, req, account, payload, listRecords, getRecord,
      insertRecord, nextPublicId, addAudit, nowISO, requireStockEvidence, requireItemPhoto, bindStockEvidence, profileSnapshot: studentProfiles.snapshot(account) });
    return res.json({ ok: true, ...result });
  }
},
operation23(req, res, action, payload, account) {
if (action === "createStockTransaction") {
    const result = stockOutService.submission(req, account, payload);
    recordChanges.notify();
    return res.json({ ok: true, ...result });
  }
},
operation24(req, res, action, payload, account) {
if (["reviewStockOutRequest", "completeStockOutRequest", "withdrawStockOutRequest"].includes(action)) {
    const result = stockOutService.act(req, account, action, payload);
    recordChanges.notify();
    return res.json({ ok: true, ...result });
  }
},
};
};
