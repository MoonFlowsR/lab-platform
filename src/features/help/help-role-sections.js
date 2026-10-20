import { helpTextLeaves, sectionAnnotations } from './help-annotations.js';

export const HELP_ROLES = [
  { value: 'student', label: '学生' },
  { value: 'teacher', label: '教师' },
  { value: 'finance', label: '财务' },
  { value: 'admin', label: '管理员' },
];

export const HELP_VIEWS = [...HELP_ROLES, { value: 'maintenance', label: '平台维护' }];

const roleValues = new Set(HELP_ROLES.map(role => role.value));
const viewValues = new Set(HELP_VIEWS.map(view => view.value));

export function helpRoleForAccount(accountType) {
  return roleValues.has(accountType) ? accountType : 'student';
}

function anchorId(anchor) {
  if (typeof anchor !== 'string') return '';
  try {
    const decoded = decodeURIComponent(anchor.startsWith('#') ? anchor.slice(1) : anchor);
    return decoded.startsWith('#') ? decoded.slice(1) : decoded;
  } catch {
    return '';
  }
}

export function findHelpSection(sections = [], anchor = '') {
  const target = anchorId(anchor);
  if (!target) return undefined;
  const exact = sections.find(section => section.id === target);
  if (exact) return exact;
  return sections
    .filter(section => typeof section.id === 'string' && target.startsWith(`${section.id}-`))
    .sort((left, right) => right.id.length - left.id.length)
    .find(section => {
      const suffix = target.slice(section.id.length + 1);
      return suffix === 'title' || /^\d+$/u.test(suffix);
    });
}

export function roleHelpSections(sections = [], role) {
  return roleValues.has(role) ? sections.filter(section => section.role === role) : [];
}

export function helpSectionsForView(sections = [], view) {
  return viewValues.has(view) ? sections.filter(section => section.role === view) : [];
}

export function legacyCommentSections(sections = [], comments = [], anchor = '') {
  const targetId = anchorId(anchor);
  const targetSection = findHelpSection(sections, anchor);
  const roots = comments.filter(comment => !comment.parent_id);
  return sections.filter(section => !Object.hasOwn(section, 'role'))
    .filter(section => section === targetSection || roots.some(comment => comment.section_id === section.id))
    .map(section => {
      const showAll = section === targetSection && [section.id, `${section.id}-title`].includes(targetId);
      const sectionRoots = roots.filter(comment => comment.section_id === section.id);
      const referencedBlocks = new Set(sectionRoots.map(comment => comment.block_id));
      const annotations = sectionAnnotations(section, sectionRoots);
      for (const leaf of helpTextLeaves(section)) if (annotations.has(leaf.key)) referencedBlocks.add(leaf.blockId);
      return {
        ...section,
        legacy: true,
        blocks: section.blocks.map((block, index) => showAll || referencedBlocks.has(`${section.id}-${index}`) || (section === targetSection && targetId === `${section.id}-${index}`)
          ? { ...block }
          : { ...block, hidden: true }),
      };
    });
}
