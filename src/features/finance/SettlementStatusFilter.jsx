import { Field, SearchableSelect } from '../../shared/components/ui.jsx';
import { settlementStatusOptions } from './settlement-filter.js';

export default function SettlementStatusFilter({ value, onChange }) {
  return <Field label="工单状态"><SearchableSelect searchable={false} value={value} onChange={onChange} options={settlementStatusOptions} placeholder="选择工单状态" fixedOptions={['']} /></Field>;
}
