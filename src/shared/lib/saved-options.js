import dropdowns from '../../config/dropdown-options.json' with { type: 'json' };
import { platformSettings } from './platform-settings.js';
import { uniqueOptions } from './dropdown-normalize.js';

const placeholders = new Set(['其它', '其他', '其他（自行填写）', '__custom_option__', '__other_room__', '__other_spec__']);
const activeRows = rows => rows.filter(row => row && !row.deleted_at);
const choices = values => uniqueOptions(values).filter(value => !placeholders.has(value));

// Only synchronized, saved records enter the shared lists; forms keep drafts locally.
export function savedOptions({ purchases = [], batches = [], stockTransactions = [], stockOutRequests = [], materials = [], materialCatalog = [], units = [] } = {}) {
  const savedPurchases = activeRows(purchases), savedBatches = activeRows(batches);
  const savedMovements = [...activeRows(stockTransactions), ...activeRows(stockOutRequests)];
  const catalog = activeRows(materialCatalog);
  return {
    storageRooms: choices([...platformSettings.rooms, ...savedPurchases.map(row => row.storage_room), ...savedBatches.map(row => row.storage_room), ...savedMovements.map(row => row.storage_room)]),
    materialUnits: choices([...dropdowns.purchaseUnits, ...catalog.flatMap(item => item.units || []), ...activeRows(materials).map(row => row.default_unit),
      ...savedPurchases.flatMap(row => [row.unit, row.actual_received_unit]), ...savedBatches.map(row => row.unit), ...savedMovements.map(row => row.unit)]),
    purchaseSuppliers: choices([...Object.values(dropdowns.purchaseSuppliers).flat(), ...catalog.flatMap(item => item.suppliers || []),
      ...savedPurchases.map(row => row.preferred_supplier), ...savedBatches.map(row => row.supplier),
      ...activeRows(units).filter(row => ['采购单位', '其他'].includes(row.unit_type)).map(row => row.unit_name)]),
  };
}
