// The display label keeps mentor context; layouts can separate it from the person's name.
export function splitPersonName(value) {
  const label = String(value ?? '').trim();
  const match = label.match(/^(.*?)\s*([（(])([^（）()]+)([）)])$/u);
  if (!match || !match[1]) return { name: label, mentors: [] };
  const parts = match[3].split(/([，,、])/u);
  const mentors = [];
  for (let index = 0; index < parts.length; index += 2) {
    mentors.push((index === 0 ? match[2] : '') + parts[index] + (parts[index + 1] || match[4]));
  }
  return { name: match[1], mentors };
}

export function isPersonLabel(label) {
  return ['姓名', '申请人', '审批人', '审核人', '审核教师', '采购人', '入库人', '操作人', '完成人', '关闭人', '账号', '原审批人', '接收人'].includes(label);
}
