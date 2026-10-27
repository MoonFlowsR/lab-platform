// New editable fields start unselected. Existing-record editors and confirmations keep their saved values.
export const newWorkDraft = request_type => ({
  request_type, review_teacher_username: '', work_content: '', external_unit: '', repair_personnel: '',
  workload_quantity: '', workload_unit: '', safety_notes: '', cost_test: '', cost_processing: '', cost_repair: '', remark: '',
});

export const newPurchaseDraft = () => ({
  material_name: '', review_teacher_username: '', specification: '', quantity: '', unit: '', preferred_supplier: '',
  purchase_purpose: '', estimated_price: '', safety_notes: '', repeat_purchase_confirmed: false, remark: '',
});

export const newMaterialDraft = () => ({
  category: '', name_cn: '', spec: '', quantity: '', unit: '', supplier: '', purchase_purpose: '', expiry_date: '',
  storage_room: '', storage_detail: '', storage_location: '', safety_notes: '', remark: '',
});

export const newStockDraft = entry_key => ({
  entry_key, transaction_type: '', batch_id: '', quantity: '', unit: '', storage_room: '', storage_detail: '', storage_location: '', usage_reason: '',
});
