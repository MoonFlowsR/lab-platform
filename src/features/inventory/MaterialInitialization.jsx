import { Field, SearchableSelect, DateInput } from '../../shared/components/ui.jsx';
import { formatPublicNumber } from '../../shared/lib/public-number.js';
import { FilePicker } from '../../shared/components/attachments.jsx';
import { validatePhotoFile } from '../../app/attachment-validation.js';
import { styles } from '../../app/styles.js';
import { useContext, useRef, useState } from 'react';
import { SavedOptionsContext } from '../../shared/lib/saved-options-context.js';
import dropdownOptions from '../../config/dropdown-options.json';
import { canonicalMaterialName, materialKey, uniqueOptions } from '../../shared/lib/dropdown-normalize.js';
import { materialSearchTerms } from './material-model-search.js';
import SpecificationFields from '../../shared/components/SpecificationFields.jsx';
import CustomOptionFields from '../../shared/components/CustomOptionFields.jsx';
import StorageFields from '../../shared/components/StorageFields.jsx';
import ItemPhotoFields from '../../shared/components/ItemPhotoFields.jsx';
import ExpiryDateField from '../../shared/components/ExpiryDateField.jsx';
import { newMaterialDraft } from '../../shared/lib/new-record-defaults.js';

const { purchaseItems, purchaseUnits, purchaseSuppliers } = dropdownOptions;
const unique = uniqueOptions;
const normalize = materialKey;
const otherMaterialName = '其它';
const emptyForm = newMaterialDraft;
const entryKey = () => `initial-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function MaterialInitialization({ materialCatalog = [], materials, batches, units, onSave }) {
  const sharedOptions = useContext(SavedOptionsContext);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [customMaterial, setCustomMaterial] = useState(false);
  const [evidence, setEvidence] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  const [count, setCount] = useState(0);
  const [entryId, setEntryId] = useState(entryKey);
  const lock = useRef(false);
  const set = (field, value) => { setForm(prev => ({ ...prev, [field]: value })); setError(''); };
  const catalogItems = materialCatalog.length ? materialCatalog : purchaseItems;
  const materialTerms = materialSearchTerms(catalogItems, batches);
  const materialNames = unique([...catalogItems.filter(item => !form.category || (item.categories || [item.category]).includes(form.category)).map(item => item.name), otherMaterialName]);
  const matchingMaterial = materials.find(row => normalize(row.name_cn || row.name) === normalize(form.name_cn));
  const selectedItems = catalogItems.filter(item => normalize(item.name) === normalize(form.name_cn) && (!form.category || (item.categories || [item.category]).includes(form.category)));
  const specificationOptions = unique([
    ...selectedItems.flatMap(item => item.specifications),
    ...batches.filter(batch => normalize(batch.material_name) === normalize(form.name_cn)).map(batch => batch.spec),
  ]);
  const unitOptions = unique([...purchaseUnits, ...sharedOptions.materialUnits, ...catalogItems.flatMap(item => item.units || []), matchingMaterial?.default_unit]);
  const supplierOptions = unique([
    ...sharedOptions.purchaseSuppliers,
    ...catalogItems.flatMap(item => item.suppliers || []),
    ...(form.category ? purchaseSuppliers[form.category] || [] : Object.values(purchaseSuppliers).flat()),
    ...units.filter(unit => ['采购单位', '其他'].includes(unit.unit_type)).map(unit => unit.unit_name),
  ]);
  function changeMaterial(name) {
    const material = materials.find(row => normalize(row.name_cn || row.name) === normalize(name));
    const item = catalogItems.find(item => normalize(item.name) === normalize(name) && (!form.category || (item.categories || [item.category]).includes(form.category)));
    setForm(prev => prev.name_cn === name ? prev : ({ ...prev, name_cn: name,
      category: prev.category || item?.category || '', spec: '', supplier: '', safety_notes: '',
      unit: material?.default_unit || prev.unit,
    }));
    setError('');
  }
  return <section className="platform-section-create" style={styles.card}>
    <div style={styles.cardHeader}>
      <div><h2 style={styles.h2}>现有材料建库</h2></div>
      <button type="button" disabled={busy} style={styles.primaryButton} onClick={() => setOpen(!open)}>{open ? '收起建库表单' : '开始录入现有材料'}</button>
    </div>
    {saved && <div role="status" style={styles.securityBox}>已保存：{saved.material.name_cn || saved.material.name} · {saved.batch.current_qty} {saved.batch.unit} · 批次 {formatPublicNumber(saved.batch.batch_code)}。本次已录入 {count} 条，可继续选择下一条。</div>}
    {open && <form onSubmit={async e => {
      e.preventDefault();
      if (lock.current) return;
      if (!['试剂原料', '耗材'].includes(form.category)) return setError('请选择材料类别。');
      if (!form.name_cn.trim() || (!customMaterial && !materialNames.includes(form.name_cn))) return setError('请选择材料名称，或选择“其它”后填写。');
      if (!Number.isFinite(Number(form.quantity)) || Number(form.quantity) <= 0) return setError('现有数量必须大于 0。');
      if (!form.spec.trim()) return setError('请填写规格 / 型号。');
      if (!form.storage_room.trim()) return setError('请选择存放房间，或选择“其它”后填写。');
      if (!form.storage_detail.trim()) return setError('请填写具体位置简述。');
      if (!['私用/项目用（出库需采购人审批）', '公用'].includes(form.purchase_purpose)) return setError('请选择使用目的。');
      if (!form.expiry_date) return setError('请选择有效期日期。');
      if (!form.unit.trim() || form.unit.trim().length > 30 || ['其它', '其他', '__custom_option__'].includes(form.unit.trim())) return setError('请选择单位，或选择“其它”后填写具体单位（不超过30字）。');
      try { validatePhotoFile(evidence); } catch (failure) { return setError(failure.message); }
      lock.current = true; setBusy(true); setError('');
      try {
        const result = await onSave({ ...form, material_id: matchingMaterial?._id || '', entry_key: entryId }, evidence);
        setSaved(result); setCount(value => value + 1);
        setEntryId(entryKey()); setForm(emptyForm()); setCustomMaterial(false); setEvidence(null);
      } catch (failure) { setError(failure.message || '保存失败，请重试。已填写内容会保留。'); }
      finally { lock.current = false; setBusy(false); }
    }}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div style={styles.formGrid}>
          <div className="platform-initialization-grid" style={styles.fullWidth}>
          <Field required label="材料类别"><SearchableSelect searchable={false} required value={form.category} options={['试剂原料', '耗材']} placeholder="选择材料类别" onChange={value => {
            setForm(prev => ({ ...prev, category: value, name_cn: '', spec: '', supplier: '', safety_notes: '' })); setCustomMaterial(false); setError('');
          }} /></Field>
          <div className="platform-initialization-cell"><Field required label="材料名称"><SearchableSelect required value={customMaterial ? otherMaterialName : canonicalMaterialName(form.name_cn)} onChange={name => { setCustomMaterial(name === otherMaterialName); changeMaterial(name === otherMaterialName ? '' : name); }} options={materialNames} searchTerms={materialTerms} lastOptions={[otherMaterialName]} placeholder="选择材料或搜索“其它”" /></Field>
          {customMaterial && <Field required label="其它材料名称"><input required style={styles.input} value={form.name_cn} onChange={e => set('name_cn', e.target.value)} placeholder="请填写具体材料名称" /></Field>}</div>
          <div className="platform-initialization-cell"><SpecificationFields key={`${entryId}:${form.category}:${customMaterial ? 'custom' : form.name_cn}`} value={form.spec} onChange={value => set('spec', value)} options={specificationOptions} Field={Field} SearchableSelect={SearchableSelect} styles={styles} /></div>
          <Field required label="现有数量"><input required type="number" min="0" step="any" style={styles.input} value={form.quantity} onChange={e => set('quantity', e.target.value)} placeholder="实际盘点数量，须大于 0" /></Field>
          <CustomOptionFields key={`unit:${entryId}:${form.name_cn}`} required label="单位" customLabel="其它单位" value={form.unit} onChange={value => set('unit', value)} options={unitOptions} placeholder="选择单位或搜索“其它”" customPlaceholder="请填写具体计量单位" maxLength={30} Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
          <CustomOptionFields key={`supplier:${entryId}:${form.name_cn}`} label="采购渠道（可选）" customLabel="其它采购渠道（可选）" value={form.supplier} onChange={value => set('supplier', value)} options={supplierOptions} placeholder="选择渠道或搜索“其它”" customPlaceholder="请填写具体采购渠道" Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
          <Field required label="使用目的"><SearchableSelect searchable={false} required value={form.purchase_purpose} onChange={value => set('purchase_purpose', value)} options={[{ value: '私用/项目用（出库需采购人审批）', label: '私用/项目用（出库需采购人审批）' }, '公用']} placeholder="选择使用目的" /></Field>
          <ExpiryDateField value={form.expiry_date} onChange={value => set('expiry_date', value)} Field={Field} DateInput={DateInput} styles={styles} />
          <StorageFields compactDescription groupRoom key={entryId} form={form} onChange={patch => { setForm(prev => ({ ...prev, ...patch })); setError(''); }} Field={Field} SearchableSelect={SearchableSelect} styles={styles} />
          </div>
          <div className="platform-initialization-notes" style={styles.fullWidth}>
          <Field label="安全事项（可选）"><textarea style={styles.textarea} value={form.safety_notes} onChange={e => set('safety_notes', e.target.value)} placeholder="危险性、储存要求、个人防护、特殊操作/废弃要求等" /></Field>
          <Field label="备注（可选）"><textarea style={styles.textarea} value={form.remark} onChange={e => set('remark', e.target.value)} /></Field>
          </div>
          <ItemPhotoFields photo={evidence} onPhotoChange={setEvidence} Field={Field} FilePicker={FilePicker} styles={styles} />
          {error && <div role="alert" style={styles.fullWidth}><p style={styles.note}>{error}</p></div>}
          <div style={styles.formActions}><button disabled={busy} style={styles.successButton}>{busy ? '正在保存...' : '保存并继续录入'}</button></div>
        </div>
      </fieldset>
    </form>}
  </section>;
}
