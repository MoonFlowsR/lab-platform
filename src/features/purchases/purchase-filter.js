import { optionKey, uniqueOptions } from '../../shared/lib/dropdown-normalize.js';

// Purchase units are the suppliers/channels already recorded on purchase requests.
export const purchaseSupplierOptions = (rows = []) => uniqueOptions(rows.filter(row => !row.deleted_at).map(row => row.preferred_supplier));
export const matchesPurchaseSupplier = (row, supplier = '') => !supplier || optionKey(row.preferred_supplier) === optionKey(supplier);
