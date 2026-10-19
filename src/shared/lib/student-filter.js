export const studentFilterModules = ['test', 'processing', 'repair', 'purchases', 'stock', 'materials'];

export function studentFilterOptions(students = []) {
  const names = students.map(account => account.display_name || account.username);
  return students.map((account, index) => ({
    ...account,
    label: names[index] === '全部' || names.filter(name => name === names[index]).length > 1
      ? `${names[index]}（${account.username}）` : names[index],
  }));
}

export function recordMatchesStudent(row, student = '', module) {
  const owner = module === 'stock' ? row.operator_username : module === 'materials'
    ? row.purchaser_username || row.created_by_username || row.inbound_by_username
    : row.applicant_username;
  return !student || owner === student;
}
