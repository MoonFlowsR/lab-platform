const test=require('node:test');
const assert=require('node:assert/strict');

test('retired help wording stays out of current body search while its discussion remains searchable',async()=>{
  const {filterHelpSections,sectionText,commentMatchesTerms,searchTerms}=await import('../../src/features/help/help-search.js');
  const sections=[{id:'maintenance-runtime',title:'运行维护',blocks:[{type:'history',text:'CloudBase的旧说明'},{type:'paragraph',text:'腾讯云服务器与工作站'}]}];
  assert.deepEqual(filterHelpSections(sections,'CloudBase'),[]);
  assert(!sectionText(sections[0]).includes('cloudbase'));
  assert.deepEqual(filterHelpSections(sections,'工作站')[0].searchMatches,[null,{}]);
  assert(commentMatchesTerms({quote:'CloudBase的旧说明',body:'历史问题'},searchTerms('CloudBase')));
});

test('archived cross-block quotations retain both old anchors and new comments prefer their current block',async()=>{
  const {sectionAnnotations}=await import('../../src/features/help/help-annotations.js');
  const section={id:'guide',title:'使用说明',blocks:[{type:'history',text:'原步骤一\n原步骤二'},{type:'history',text:'旧字段\n旧内容'},{type:'paragraph',text:'原步骤二，现已简化'}]};
  const old=sectionAnnotations(section,[{id:1,section_id:'guide',block_id:'guide-0',quote:'原步骤二\n旧字段'}]);
  assert(old.has('guide-0'));assert(old.has('guide-1'));assert(!old.has('guide-2'));
  const current=sectionAnnotations(section,[{id:2,section_id:'guide',block_id:'guide-2',quote:'原步骤二'}]);
  assert(current.has('guide-2'));assert(!current.has('guide-0'));
});
