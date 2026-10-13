// Legacy orders retain the actual reviewer; unassigned pending orders remain in "全部".
export const reviewTeacherUsername = row => row.review_teacher_username || row.reviewed_username || '';
export const reviewTeacherName = row => row.review_teacher_name || row.review_teacher_username || '未指定';
export const teacherScopeMatches = (row, account, scope = 'mine') => account?.account_type !== 'teacher' || scope === 'all' || reviewTeacherUsername(row) === account.username;
export const canReviewAssignedRequest = (row, account) => account?.account_type === 'teacher' && Boolean(row.review_teacher_username) && row.review_teacher_username === account.username;

export const workScopeMatches = (row, account, scope = "mine") => account?.account_type === "student" ? scope === "all" || row.applicant_username === account.username : teacherScopeMatches(row, account, scope);
