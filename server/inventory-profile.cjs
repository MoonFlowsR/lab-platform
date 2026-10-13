// Inventory reflects the creator's current mentors; saved workflow snapshots remain intact.
module.exports = function inventoryProfiles(db) {
  const rows = db.prepare(`SELECT a.username, p.responsible_teacher_username,
    COALESCE(r.display_name,r.username) AS responsible_teacher_name,
    p.guiding_teacher_username, COALESCE(g.display_name,g.username) AS guiding_teacher_name
    FROM student_profiles p JOIN accounts a ON a.id=p.account_id
    JOIN accounts r ON r.username=p.responsible_teacher_username
    JOIN accounts g ON g.username=p.guiding_teacher_username`).all();
  const profiles = new Map(rows.map(({username,...profile}) => [username,profile]));
  return batch => {
    const profile = profiles.get(batch.inbound_by_username || batch.created_by_username);
    return profile ? {...batch,...profile,student_profile_linked:true} : batch;
  };
};
