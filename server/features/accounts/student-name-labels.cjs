// Display metadata only; account identifiers and saved workflow snapshots stay unchanged.
module.exports = function studentNameLabels(db) {
  return db.prepare(`SELECT a.username, a.display_name,
    COALESCE(r.display_name,r.username,'') AS responsible_teacher_name,
    COALESCE(g.display_name,g.username,'') AS guiding_teacher_name
    FROM accounts a LEFT JOIN student_profiles p ON p.account_id=a.id
    LEFT JOIN accounts r ON r.username=p.responsible_teacher_username AND r.account_type='teacher'
    LEFT JOIN accounts g ON g.username=p.guiding_teacher_username AND g.account_type='teacher'
    WHERE a.account_type='student' ORDER BY a.username`).all();
};
