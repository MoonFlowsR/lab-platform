import { Field, SearchableSelect, DateInput } from '../../shared/components/ui.jsx';
import { formatPublicNumber } from '../../shared/lib/public-number.js';
import { FilePicker } from '../../shared/components/attachments.jsx';
import { validatePhotoFile } from '../../app/attachment-validation.js';
import { styles } from '../../app/styles.js';
import { useEffect, useRef, useState } from 'react';
import dropdownOptions from '../../config/dropdown-options.json';
import { canonicalMaterialName, materialKey, uniqueOptions } from '../../shared/lib/dropdown-normalize.js';
import { materialSearchTerms } from './material-model-search.js';
import CustomOptionFields from '../../shared/components/CustomOptionFields.jsx';
import SpecificationFields from '../../shared/components/SpecificationFields.jsx';
import StorageFields from '../../shared/components/StorageFields.jsx';
import ExpiryDateField from '../../shared/components/ExpiryDateField.jsx';
import './material-batch-editor.css';

export default function MaterialBatchEditor({ row, materialCatalog = [], materials = [], attachments = [], onDownload, onSave, onClose }) {
  const material = materials.find(item => String(item._id) === String(row.material_id));
  const [form, setForm] = useState({ material_name: row.material_name || material?.name_cn || '', purchase_category: row.purchase_category || material?.category || '', spec: row.spec || '无', current_qty: row.current_qty ?? 0, min_qty: row.min_qty ?? 0, unit: row.unit || '', supplier: row.supplier || '', purchase_purpose: row.purchase_purpose || '', expiry_date: row.expiry_date || '', storage_room: row.storage_room || '', storage_detail: row.storage_detail || '', safety_notes: row.safety_notes || '', remark: row.remark || '', reason: '' });
  const [photo, setPhoto] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialog = useRef(null);
  const editorStyles = { ...styles, input: { ...styles.input, fontSize: 16 }, textarea: { ...styles.textarea, fontSize: 16, minHeight: 80, height: 80 } };
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement, previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; element.showModal();
    return () => { if (element.open) element.close(); document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  const set = (field, value) => { setForm(previous => ({ ...previous, [field]: value })); setError(''); };
  const selected = materialCatalog.filter(item => materialKey(item.name) === materialKey(form.material_name));
  const names = uniqueOptions([...materialCatalog.filter(item => !form.purchase_category || (item.categories || [item.category]).includes(form.purchase_category)).map(item => item.name), row.material_name]);
  const materialTerms = materialSearchTerms(materialCatalog, [row]);
  const units = uniqueOptions([...dropdownOptions.purchaseUnits, ...materialCatalog.flatMap(item => item.units || []), row.unit]);
  const suppliers = uniqueOptions([...Object.values(dropdownOptions.purchaseSuppliers).flat(), ...materialCatalog.flatMap(item => item.suppliers || []), row.supplier]);
  const existingPhoto = attachments.find(file => String(file._id) === String(row.inbound_photo_attachment_id));
  return <dialog ref={dialog} className="platform-dialog platform-batch-editor" aria-labelledby="batch-editor-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      if (!form.material_name.trim() || !form.spec.trim() || !form.unit.trim()) return setError('材料名称、规格和单位为必填项。');
      if (!form.expiry_date) return setError('请选择有效期，或勾选“长期有效”。');
      if (!form.reason.trim()) return setError('请填写修改原因。');
      try { if (photo) validatePhotoFile(photo); } catch (failure) { return setError(failure.message); }
      setBusy(true); setError('');
      try { await onSave({ ...form, id: row._id, expected_updated_at: row.updated_at }, photo); onClose(); }
      catch (failure) { setError(failure.message || '保存失败，已填写内容保留。'); }
      finally { setBusy(false); }
    }}>
      <div className="platform-dialog-header"><h2 id="batch-editor-title">修改物品信息</h2><button type="button" disabled={busy} className="platform-dialog-close" aria-label="关闭弹窗" onClick={onClose}>×</button></div>
      <p className="platform-batch-editor-context"><strong>{row.material_name}</strong> · {formatPublicNumber(row.batch_code)}<br/>修改对所有用户生效，系统记录修改前后信息；采购渠道修改会同步对应采购申请。修改单位时，请同时核对库存数量。</p>
      <fieldset disabled={busy}>
        <div className="platform-batch-editor-grid">
          <Field required label="材料类别"><SearchableSelect required value={form.purchase_category} onChange={value => set('purchase_category', value)} options={['试剂原料','耗材']} placeholder="搜索或选择材料类别" /></Field>
          <div className="platform-batch-mobile-wide"><CustomOptionFields required label="材料名称" customLabel="其它材料名称" value={canonicalMaterialName(form.material_name)} onChange={value => set('material_name', value)} options={names} searchTerms={materialTerms} placeholder="选择材料或搜索“其它”" customPlaceholder="请填写具体材料名称" Field={Field} SearchableSelect={SearchableSelect} styles={editorStyles} /></div>
          <div className="platform-batch-mobile-wide"><SpecificationFields value={form.spec} onChange={value => set('spec', value)} options={uniqueOptions([...selected.flatMap(item => item.specifications || []), row.spec])} Field={Field} SearchableSelect={SearchableSelect} styles={editorStyles} /></div>
          <Field required label="当前库存数量"><input required type="number" min="0" step="any" value={form.current_qty} onChange={event => set('current_qty', event.target.value)} style={editorStyles.input} /></Field>
          <CustomOptionFields required label="单位" customLabel="其它单位" value={form.unit} onChange={value => set('unit', value)} options={units} placeholder="选择单位或搜索“其它”" customPlaceholder="请填写具体计量单位" maxLength={30} Field={Field} SearchableSelect={SearchableSelect} styles={editorStyles} />
          <div className="platform-batch-mobile-wide"><CustomOptionFields label="采购渠道（可选）" customLabel="其它采购渠道（可选）" value={form.supplier} onChange={value => set('supplier', value)} options={suppliers} placeholder="选择渠道或搜索“其它”" customPlaceholder="请填写具体采购渠道" Field={Field} SearchableSelect={SearchableSelect} styles={editorStyles} /></div>
          <Field required label="使用目的"><SearchableSelect required value={form.purchase_purpose} onChange={value => set('purchase_purpose', value)} options={[{ value: '私用/项目用（出库需采购人审批）', label: '私用/项目用（出库需采购人审批）' },'公用']} placeholder="搜索或选择使用目的" /></Field>
          <ExpiryDateField value={form.expiry_date} onChange={value => set('expiry_date', value)} Field={Field} DateInput={DateInput} styles={editorStyles} />
          <StorageFields groupRoom compactDescription form={form} onChange={patch => { setForm(previous => ({ ...previous, ...patch })); setError(''); }} Field={Field} SearchableSelect={SearchableSelect} styles={editorStyles} />
          <Field required label="最低预警数量"><input required type="number" min="0" step="any" value={form.min_qty} onChange={event => set('min_qty', event.target.value)} style={editorStyles.input} /></Field>
          <div className="platform-batch-half"><Field label="安全事项（可选）"><textarea maxLength={2000} value={form.safety_notes} onChange={event => set('safety_notes', event.target.value)} style={editorStyles.textarea} /></Field></div>
          <div className="platform-batch-half"><Field label="备注（可选）"><textarea maxLength={2000} value={form.remark} onChange={event => set('remark', event.target.value)} style={editorStyles.textarea} /></Field></div>
          <div className="platform-batch-wide"><Field label="物品特写照片"><FilePicker file={photo} onChange={setPhoto} helper="选择新照片可替换当前照片，未选择则保留。" /></Field>{existingPhoto && <button type="button" style={styles.lightButton} onClick={() => onDownload?.(existingPhoto)}>查看当前照片</button>}</div>
          <div className="platform-batch-wide"><Field required label="修改原因"><textarea required maxLength={2000} value={form.reason} onChange={event => set('reason', event.target.value)} style={editorStyles.textarea} placeholder="简要说明修改原因" /></Field></div>
        </div>
      </fieldset>
      {error && <p role="alert" className="platform-dialog-error">{error}</p>}
      <div className="platform-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button disabled={busy} className="is-primary">{busy ? '正在保存...' : '确认修改'}</button></div>
    </form>
  </dialog>;
}
