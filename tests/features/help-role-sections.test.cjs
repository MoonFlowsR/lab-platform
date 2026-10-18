const test = require('node:test');
const assert = require('node:assert/strict');

test('maintenance is a help category and never becomes an account role or changes student defaults', async () => {
  const { HELP_ROLES, HELP_VIEWS, helpRoleForAccount, helpSectionsForView, roleHelpSections } = await import('../../src/features/help/help-role-sections.js');
  assert.deepEqual(HELP_ROLES.map(role => role.value), ['student', 'teacher', 'admin']);
  assert.deepEqual(HELP_VIEWS.map(view => view.value), ['student', 'teacher', 'admin', 'maintenance']);
  assert.equal(helpRoleForAccount('maintenance'), 'student');
  const sections = [{ id: 'student-test', role: 'student' }, { id: 'maintenance-storage', role: 'maintenance' }];
  assert.deepEqual(helpSectionsForView(sections, 'maintenance'), [sections[1]]);
  assert.deepEqual(roleHelpSections(sections, 'maintenance'), []);
  assert.deepEqual(helpSectionsForView(sections, 'student'), roleHelpSections(sections, 'student'));
  assert.deepEqual(helpSectionsForView(sections, 'unknown'), []);
});

test('maintenance deep links and annotations remain independent from original role and legacy sections', async () => {
  const { findHelpSection, legacyCommentSections } = await import('../../src/features/help/help-role-sections.js');
  const sections = [{ id: 'old', title: '旧说明', blocks: [] }, { id: 'maintenance-storage', role: 'maintenance', blocks: [{type:'paragraph',text:'数据库和照片配套备份'}] }];
  assert.equal(findHelpSection(sections, '#maintenance-storage-0'), sections[1]);
  assert.deepEqual(legacyCommentSections(sections, [{id:1,section_id:'maintenance-storage',block_id:'maintenance-storage-0'}]), []);
});

test('help search excludes hidden legacy blocks while retaining their original comment indices', async () => {
  const { legacyCommentSections } = await import('../../src/features/help/help-role-sections.js');
  const { filterHelpSections, sectionText } = await import('../../src/features/help/help-search.js');
  const sections = [{ id: 'old-guide', title: '旧说明', blocks: [{ type: 'paragraph', text: '不相关的采购说明' }, { type: 'steps', items: ['被评论的入库步骤'] }] }];
  const visible = legacyCommentSections(sections, [{ id: 1, section_id: 'old-guide', block_id: 'old-guide-1', quote: '入库步骤' }]);
  assert.deepEqual(filterHelpSections(visible, '采购'), []);
  const result = filterHelpSections(visible, '入库');
  assert.equal(result[0].blocks.length, 2);
  assert.deepEqual(result[0].searchMatches, [null, { items: [0] }]);
  assert(!sectionText(visible[0]).includes('采购'));
  assert.equal(sections[0].blocks[0].hidden, undefined);
});
let HELP_ROLES, helpRoleForAccount, findHelpSection, roleHelpSections, legacyCommentSections;
test.before(async () => {
  ({ HELP_ROLES, helpRoleForAccount, findHelpSection, roleHelpSections, legacyCommentSections } = await import('../../src/features/help/help-role-sections.js'));
});

const section = (id, extra = {}) => ({ id, title: `${id} 帮助`, blocks: [{ type: 'paragraph', text: '第一段' }, { type: 'steps', items: ['步骤一', '步骤二'] }, { type: 'paragraph', text: '第三段' }], ...extra });
const comment = (id, sectionId, blockId, extra = {}) => ({ id, section_id: sectionId, block_id: blockId, quote: '评论引用', body: '评论内容', parent_id: null, ...extra });
const visible = row => row.blocks.flatMap((block, index) => block.hidden ? [] : [index]);

test('help roles have distinct Chinese labels and account selection safely defaults to student', () => {
  assert.deepEqual(HELP_ROLES, [{ value: 'student', label: '学生' }, { value: 'teacher', label: '教师' }, { value: 'admin', label: '管理员' }]);
  for (const role of HELP_ROLES) assert.equal(helpRoleForAccount(role.value), role.value);
  for (const unknown of [undefined, null, '', 'visitor', 'Student', 'constructor', {}, 1]) assert.equal(helpRoleForAccount(unknown), 'student');
});

test('role sections include only the exact selected role and retain original order and identity', () => {
  const sections = [section('legacy'), section('student-a', { role: 'student' }), section('teacher-a', { role: 'teacher' }), section('student-b', { role: 'student' }), section('admin-a', { role: 'admin' }), section('unknown', { role: 'foo' })];
  assert.deepEqual(roleHelpSections(sections, 'student'), [sections[1], sections[3]]);
  assert.deepEqual(roleHelpSections(sections, 'teacher'), [sections[2]]);
  assert.deepEqual(roleHelpSections(sections, 'admin'), [sections[4]]);
  assert.equal(roleHelpSections(sections, 'student')[0], sections[1]);
});

test('invalid role filters never fall through to legacy, unknown-role, or other roles', () => {
  const sections = [section('legacy'), section('student', { role: 'student' }), section('unknown', { role: 'foo' })];
  for (const role of [undefined, null, '', 'foo', 'constructor']) assert.deepEqual(roleHelpSections(sections, role), []);
});

test('section, title, and numbered block anchors resolve with safe URI decoding', () => {
  const english = section('student-test'), chinese = section('旧帮助');
  const sections = [english, chinese];
  for (const anchor of ['#student-test', '#student-test-title', '#student-test-0', 'student-test-2']) assert.equal(findHelpSection(sections, anchor), english);
  for (const anchor of ['#旧帮助-1', `#${encodeURIComponent('旧帮助-title')}`, encodeURIComponent('#旧帮助-0')]) assert.equal(findHelpSection(sections, anchor), chinese);
});

test('overlapping section IDs resolve to the longest exact section boundary', () => {
  const short = section('student-test'), long = section('student-test-extra'), numbered = section('student-test-1');
  const sections = [short, long, numbered];
  assert.equal(findHelpSection(sections, '#student-test-extra'), long);
  assert.equal(findHelpSection(sections, '#student-test-extra-title'), long);
  assert.equal(findHelpSection(sections, '#student-test-extra-2'), long);
  assert.equal(findHelpSection(sections, '#student-test-1'), numbered);
  assert.equal(findHelpSection(sections, '#student-test-1-0'), numbered);
  assert.equal(findHelpSection([short], '#student-test-extra'), undefined);
});

test('invalid or unrelated anchors do not match section prefixes or throw decoding errors', () => {
  const sections = [section('student-test')];
  for (const anchor of ['', '#', '#student-testing-0', '#student-test-other', '#student-test-0-step-1', '#student-test-1junk', '#student-test-1?x=1', '#student-test/%', '#%E0%A4%A', null, 4]) assert.equal(findHelpSection(sections, anchor), undefined);
  assert.equal(findHelpSection(), undefined);
});

test('legacy instructions stay absent without a root comment or direct legacy anchor', () => {
  const sections = [section('old'), section('student-a', { role: 'student' })];
  assert.deepEqual(legacyCommentSections(sections, []), []);
  assert.deepEqual(legacyCommentSections(sections, [comment(2, 'old', 'old-0', { parent_id: 1 })]), []);
  assert.deepEqual(legacyCommentSections(sections, [comment(3, 'general', '', { quote: '' })]), []);
  assert.deepEqual(legacyCommentSections(sections, [], '#student-a-0'), []);
});

test('legacy comments retain source section order, full block length, and original numbered positions', () => {
  const sections = [section('old-a'), section('old-b')];
  const comments = [comment(1, 'old-b', 'old-b-2'), comment(2, 'old-a', 'old-a-1')];
  const result = legacyCommentSections(sections, comments);
  assert.deepEqual(result.map(row => row.id), ['old-a', 'old-b']);
  assert.deepEqual(result.map(visible), [[1], [2]]);
  for (let s = 0; s < result.length; s++) {
    assert.equal(result[s].legacy, true);
    assert.equal(result[s].blocks.length, sections[s].blocks.length);
    result[s].blocks.forEach((block, index) => {
      const copy = { ...block }; delete copy.hidden;
      assert.deepEqual(copy, sections[s].blocks[index]);
    });
  }
});

test('deleted roots with live replies remain locatable without moving old quote anchors', () => {
  const original = section('old');
  const comments = [comment(1, 'old', 'old-1', { deleted_at: '2026-01-01' }), comment(2, 'old', 'old-1', { parent_id: 1 })];
  const [retained] = legacyCommentSections([original], comments);
  assert.equal(retained.id, 'old');
  assert.deepEqual(visible(retained), [1]);
  assert.deepEqual(retained.blocks[1].items, original.blocks[1].items);
});

test('deleted roots returned for administrator history also retain their source section', () => {
  const [retained] = legacyCommentSections([section('old')], [comment(1, 'old', 'old-2', { deleted_at: '2026-01-01' })]);
  assert.deepEqual(visible(retained), [2]);
});

test('a whitespace-normalized quotation spanning paragraphs, steps, and a table exposes every touched original block', () => {
  const original = section('old', { blocks: [
    { type: 'paragraph', text: '不相关的开头。' },
    { type: 'paragraph', text: '准备记录。' },
    { type: 'steps', items: ['第一步 选择材料', '第二步填写数量'] },
    { type: 'table', headers: ['字段', '内容'], rows: [['照片', '上传凭证']] },
    { type: 'paragraph', text: '确认提交。' },
    { type: 'paragraph', text: '不相关的结尾。' },
  ] });
  const quote = '记录。\n第一步\t选择材料\n第二步填写数量\n字段\t内容\n照片\t上传凭证\n确认';
  const comments = [comment(1, 'old', 'old-1', { quote, deleted_at: '2026-01-01' }), comment(2, 'old', 'old-1', { parent_id: 1 })];
  const before = JSON.stringify({ original, comments });
  const [retained] = legacyCommentSections([original], comments);
  assert.deepEqual(visible(retained), [1, 2, 3, 4]);
  assert.equal(retained.blocks.length, original.blocks.length);
  assert.equal(retained.blocks[1].text, original.blocks[1].text);
  assert.deepEqual(retained.blocks[2].items, original.blocks[2].items);
  assert.deepEqual(retained.blocks[3].rows, original.blocks[3].rows);
  assert.equal(retained.blocks[4].text, original.blocks[4].text);
  assert.equal(JSON.stringify({ original, comments }), before);
});

test('quotation fallback keeps both the explicit old anchor and every block actually highlighted', () => {
  const original = section('old', { blocks: [
    { type: 'paragraph', text: '原始锚点' },
    { type: 'paragraph', text: '无关段落' },
    { type: 'steps', items: ['填写数量', '核对单位'] },
    { type: 'paragraph', text: '然后提交' },
    { type: 'paragraph', text: '不相关结尾' },
  ] });
  const [retained] = legacyCommentSections([original], [comment(1, 'old', 'old-0', { quote: '核对单位\n然后' })]);
  assert.deepEqual(visible(retained), [0, 2, 3]);
  assert.deepEqual(visible(legacyCommentSections([original], [comment(2, 'old', 'old-2', { quote: '填写数量' })])[0]), [2]);
});

test('direct legacy section or title anchors expose all original blocks even without comments', () => {
  const old = section('旧帮助');
  for (const anchor of ['#旧帮助', '#旧帮助-title', `#${encodeURIComponent('旧帮助-title')}`]) {
    const [retained] = legacyCommentSections([old], [], anchor);
    assert.deepEqual(visible(retained), [0, 1, 2]);
    assert.deepEqual(retained.blocks, old.blocks);
  }
});

test('a direct old block anchor adds only that block to root-comment referenced blocks', () => {
  const sections = [section('old'), section('another')];
  const result = legacyCommentSections(sections, [comment(1, 'old', 'old-0')], '#old-2');
  assert.equal(result.length, 1);
  assert.deepEqual(visible(result[0]), [0, 2]);
  assert.deepEqual(visible(legacyCommentSections(sections, [], '#old-1')[0]), [1]);
});

test('a root title comment retains the title while unrelated body blocks remain hidden', () => {
  const [retained] = legacyCommentSections([section('old')], [comment(1, 'old', 'old-title')]);
  assert.equal(retained.title, 'old 帮助');
  assert.deepEqual(visible(retained), []);
});

test('root comments with mismatching section or block IDs do not expose unrelated old blocks', () => {
  const sections = [section('old'), section('old-extra')];
  const result = legacyCommentSections(sections, [comment(1, 'old', 'old-extra-1'), comment(2, 'missing', 'old-0')]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'old');
  assert.deepEqual(visible(result[0]), []);
  assert.deepEqual(legacyCommentSections(sections, [], '#old-other'), []);
});

test('sections declaring an unknown, empty, or null role are never treated as legacy', () => {
  const sections = [section('none'), section('unknown', { role: 'foo' }), section('empty', { role: '' }), section('null', { role: null }), section('undefined', { role: undefined })];
  const comments = sections.map((row, index) => comment(index + 1, row.id, `${row.id}-0`));
  assert.deepEqual(legacyCommentSections(sections, comments).map(row => row.id), ['none']);
  for (const row of sections.slice(1)) assert.deepEqual(legacyCommentSections(sections, [], `#${row.id}`), []);
});

test('all helpers leave frozen source sections and comments unchanged across repeated views', () => {
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  const sections = freeze([section('old'), section('student-test', { role: 'student' }), section('student-test-extra', { role: 'teacher' })]);
  const comments = freeze([comment(1, 'old', 'old-1'), comment(2, 'old', 'old-1', { parent_id: 1 })]);
  const before = JSON.stringify({ sections, comments });
  const first = legacyCommentSections(sections, comments), second = legacyCommentSections(sections, comments, '#old-0');
  assert.deepEqual(visible(first[0]), [1]);
  assert.deepEqual(visible(second[0]), [0, 1]);
  assert.notEqual(first[0], sections[0]);
  first[0].blocks.forEach((block, index) => assert.notEqual(block, sections[0].blocks[index]));
  roleHelpSections(sections, 'teacher'); findHelpSection(sections, '#student-test-extra-title');
  assert.equal(JSON.stringify({ sections, comments }), before);
  assert.deepEqual(legacyCommentSections(), []);
});
