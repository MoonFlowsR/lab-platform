const { randomUUID } = require('node:crypto');
module.exports = function createStudentProfiles({ db, nowISO, addAudit }) {
  db.exec(`CREATE TABLE IF NOT EXISTS platform_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS student_profiles (account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    responsible_teacher_username TEXT NOT NULL REFERENCES accounts(username),guiding_teacher_username TEXT NOT NULL REFERENCES accounts(username),
    graduation_year INTEGER NOT NULL CHECK(graduation_year BETWEEN 2026 AND 2050),completed_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
  db.transaction(() => {
    if (!db.prepare("SELECT value FROM platform_settings WHERE key='student_profiles_v1'").get()) {
      const when=nowISO();
      db.prepare("INSERT INTO platform_settings(key,value,updated_at) VALUES('auth_version',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(randomUUID(),when);
      db.prepare("INSERT INTO platform_settings(key,value,updated_at) VALUES('student_profiles_v1','installed',?)").run(when);
      addAudit({headers:{},ip:'local migration'},{username:'系统维护',account_type:'system'},'requireStudentProfiles','platform_settings','student_profiles_v1',null,{existing_sessions_revoked:true,students_require_profile:true,installed_at:when});
    }
  }).immediate();
  const authVersion = () => db.prepare("SELECT value FROM platform_settings WHERE key='auth_version'").get()?.value;
  function read(account) {
    if (account.account_type!=='student') return null;
    return db.prepare(`SELECT p.responsible_teacher_username,COALESCE(r.display_name,r.username) AS responsible_teacher_name,
      p.guiding_teacher_username,COALESCE(g.display_name,g.username) AS guiding_teacher_name,p.graduation_year,p.completed_at,p.updated_at
      FROM student_profiles p JOIN accounts a ON a.id=p.account_id JOIN accounts r ON r.username=p.responsible_teacher_username
      JOIN accounts g ON g.username=p.guiding_teacher_username WHERE a.username=?`).get(account.username) || null;
  }
  function save(req,account,payload) {
    if (account.account_type!=='student') throw new Error('仅学生账号需填写学生个人资料。');
    return db.transaction(() => {
      const teachers={};
      for(const [field,label]of [['responsible_teacher','责任教师'],['guiding_teacher','指导教师']]) {
        const username=String(payload[field+'_username'] || '').trim();
        if(!username)throw new Error('请选择'+label+'。');
        const row=db.prepare("SELECT username,display_name FROM accounts WHERE username=? AND account_type='teacher'").get(username);
        if(!row)throw new Error(label+'须为已注册教师，请重新选择。');teachers[field+'_username']=row.username;
      }
      const year=Number(payload.graduation_year);
      if(!['number','string'].includes(typeof payload.graduation_year) || !Number.isInteger(year) || year<2026 || year>2050)throw new Error('请选择2026至2050年的毕业年份。');
      const id=db.prepare("SELECT id FROM accounts WHERE username=? AND account_type='student'").get(account.username)?.id;
      if(!id)throw new Error('学生账号不存在。');
      const before=read(account),when=nowISO();
      if(before?.responsible_teacher_username===teachers.responsible_teacher_username && before?.guiding_teacher_username===teachers.guiding_teacher_username && before.graduation_year===year)return before;
      db.prepare(`INSERT INTO student_profiles(account_id,responsible_teacher_username,guiding_teacher_username,graduation_year,completed_at,updated_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET responsible_teacher_username=excluded.responsible_teacher_username,
        guiding_teacher_username=excluded.guiding_teacher_username,graduation_year=excluded.graduation_year,updated_at=excluded.updated_at`).run(id,teachers.responsible_teacher_username,teachers.guiding_teacher_username,year,before?.completed_at || when,when);
      const after=read(account);addAudit(req,account,'updateMyStudentProfile','student_profiles',String(id),before,after);return after;
    }).immediate();
  }
  function snapshot(account) {
    const profile=read(account);
    if(!profile)throw new Error('请先完善学生个人信息。');
    const {responsible_teacher_username,responsible_teacher_name,guiding_teacher_username,guiding_teacher_name,graduation_year}=profile;
    return {responsible_teacher_username,responsible_teacher_name,guiding_teacher_username,guiding_teacher_name,graduation_year};
  }
  return {authVersion,read,save,snapshot};
};
