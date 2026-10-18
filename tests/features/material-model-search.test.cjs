const test = require('node:test');
const assert = require('node:assert/strict');
let materialModelTerms, materialSearchTerms, recordMatchesSearch, searchMaterialBatches;
test.before(async () => {
  ({materialModelTerms,materialSearchTerms} = await import('../../src/features/inventory/material-model-search.js'));
  ({recordMatchesSearch} = await import('../../src/shared/lib/teacher-filter.js'));
  ({searchMaterialBatches} = await import('../../src/features/inventory/material-summary.js'));
});
test('old model names are searchable without changing material name or specification', () => {
  const original={material_name:'示例聚合物',spec:'Mn-200',unit:'g',current_qty:10,storage_room:'A101'};
  assert.deepEqual(materialModelTerms(original.material_name,[original.spec]),['示例聚合物200','示例聚合物 Mn-200']);
  assert.ok(recordMatchesSearch(original,'示例聚合物200'));
  assert.ok(!recordMatchesSearch(original,'示例聚合物400'));
  assert.equal(original.material_name,'示例聚合物'); assert.equal(original.spec,'Mn-200');
});
test('model parsing preserves concentrations and ignores quantities and unknown specifications', () => {
  assert.deepEqual(materialModelTerms('示例材料（另一名称）',['AB123；70wt%']),['示例材料（AB123）','示例材料AB123']);
  assert.deepEqual(materialModelTerms('示例材料',['70wt%','500g','无','']),[]);
  assert.deepEqual(materialModelTerms('示例材料',['ｍｎ－４００']),['示例材料400','示例材料 Mn-400']);
  assert.deepEqual(materialModelTerms('示例（基团）材料',['Mn-200']),['示例（基团）材料200','示例（基团）材料 Mn-200']);
  assert.deepEqual(materialModelTerms('示例（基团）材料（其它（异名））',['Mn-200']),['示例（基团）材料200','示例（基团）材料 Mn-200']);
});
test('material selection indexes only available models and never merges different materials', () => {
  const catalog=[{name:'示例材料甲',specifications:['Mn-200']},{name:'示例材料乙',specifications:['Mn-400']}];
  const batches=[{material_name:'示例材料甲',spec:'Mn-1000'},{material_name:'示例材料甲',spec:'Mn-200'},
    {material_name:'示例材料甲',spec:'Mn-9000',deleted_at:'removed'}];
  const before=structuredClone({catalog,batches});
  const terms=materialSearchTerms(catalog,batches);
  assert.deepEqual(terms.get('示例材料甲'),['示例材料甲200','示例材料甲 Mn-200','示例材料甲1000','示例材料甲 Mn-1000']);
  assert.ok(!terms.get('示例材料乙').some(term=>term.includes('200')));
  assert.deepEqual({catalog,batches},before);
});
test('grouped stock and material summaries find combined model names within their filtered data', () => {
  const rows=[{_id:1,material_name:'示例聚合物',spec:'Mn-200',storage_room:'A101',unit:'g',current_qty:2},
    {_id:2,material_name:'示例聚合物',spec:'Mn-400',storage_room:'A102',unit:'g',current_qty:3}];
  assert.deepEqual(searchMaterialBatches(rows,'示例聚合物200',recordMatchesSearch).map(row=>row._id),[1]);
  assert.deepEqual(searchMaterialBatches(rows.filter(row=>row.storage_room==='A102'),'示例聚合物200',recordMatchesSearch),[]);
  assert.ok(recordMatchesSearch({name_cn:'示例聚合物',stock_by_spec:[{spec:'Mn-400',quantity:3,unit:'g'}]},'示例聚合物400'));
});
