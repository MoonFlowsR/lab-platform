import dropdowns from '../../config/dropdown-options.json' with { type: 'json' };
import { uniqueOptions } from '../../shared/lib/dropdown-normalize.js';

export function workOptions(type, history = [], units = [], current = {}) {
  const rows = history.filter(row => row.request_type === type && !row.deleted_at);
  const choices = values => uniqueOptions(values).filter(value => !['其它','其他','其他（自行填写）','__custom_option__'].includes(value));
  return {
    names: choices([...(type === '测试' ? dropdowns.testNames : dropdowns.processingNames), ...rows.map(row => row.work_content), current.work_content]),
    channels: choices([...(type === '测试' ? dropdowns.testUnits : dropdowns.processingUnits), ...units.filter(row => row.unit_type === `${type}单位` || row.unit_type === '其他').map(row => row.unit_name), ...rows.map(row => row.external_unit), current.external_unit]),
    billing: choices([...dropdowns.billingMethods, ...rows.map(row => row.workload_unit), current.workload_unit]),
  };
}
