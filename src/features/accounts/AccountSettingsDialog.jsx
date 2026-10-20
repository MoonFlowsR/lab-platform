import { graduationYears } from '../../shared/lib/platform-settings.js';
import { Field, SearchableSelect } from '../../shared/components/ui.jsx';
import { styles } from '../../app/styles.js';
import { useEffect, useRef, useState } from 'react';
import './account-settings.css';
export default function AccountSettingsDialog({ account, teachers = [], required = false, adminEdit = false, onSaveProfile, onSavePassword, onLogout, onClose }) {
  const dialog=useRef(null),busyRef=useRef(false),student=account.account_type==='student';
  const controlsRef=useRef({required,onClose});
  useEffect(()=>{controlsRef.current={required,onClose};},[required,onClose]);
  const [tab,setTab]=useState('profile'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [form,setForm]=useState({responsible_teacher_username:account.student_profile?.responsible_teacher_username || '',guiding_teacher_username:account.student_profile?.guiding_teacher_username || '',graduation_year:account.student_profile?.graduation_year ? String(account.student_profile.graduation_year) : ''});
  const [password,setPassword]=useState({old_password:'',new_password:'',confirm_password:''});
  const set=(key,value)=>{setForm(prev=>({...prev,[key]:value}));setError('');};
  useEffect(()=>{busyRef.current=busy;},[busy]);
  useEffect(()=>{
    const element=dialog.current,previousFocus=document.activeElement,overflow=document.body.style.overflow;
    const preventCancel=event=>{event.preventDefault();if(!controlsRef.current.required && !busyRef.current)controlsRef.current.onClose();};
    const preventEscape=event=>{if(controlsRef.current.required && event.key==='Escape')event.preventDefault();};
    element.addEventListener('cancel',preventCancel);
    document.addEventListener('keydown',preventEscape,true);
    document.body.style.overflow='hidden';element.showModal();
    return()=>{element.removeEventListener('cancel',preventCancel);document.removeEventListener('keydown',preventEscape,true);if(element.open)element.close();document.body.style.overflow=overflow;if(previousFocus?.isConnected)previousFocus.focus();};
  },[]);
  const teacherOptions=teachers.map(teacher=>({value:teacher.username,label:teacher.display_name && teacher.display_name!==teacher.username ? `${teacher.display_name}（${teacher.username}）` : teacher.display_name || teacher.username}));
  return <dialog ref={dialog} closedby={required ? 'none' : 'closerequest'} className="platform-dialog platform-account-settings" aria-labelledby="account-settings-title">
    <form onSubmit={async event=>{
      event.preventDefault();if(busy)return;
      if(tab==='profile' && student && (!form.responsible_teacher_username || !form.guiding_teacher_username || !form.graduation_year))return setError('系统责任教师、实际指导教师和毕业年份均为必填项。');
      if(tab==='password') {
        if(!password.old_password || !password.new_password || !password.confirm_password)return setError('请填写当前密码及两次新密码。');
        if(password.new_password.trim().length<6)return setError('新密码至少6位。');
        if(password.new_password.trim()===password.old_password.trim())return setError('新密码不能与当前密码相同。');
        if(password.new_password.trim()!==password.confirm_password.trim())return setError('两次输入的新密码不一致。');
      }
      setError('');setBusy(true);
      try {if(tab==='profile')await onSaveProfile(form);else await onSavePassword(password);}catch(failure){setError(failure.message || '保存失败，请重试。');}finally{setBusy(false);}
    }}>
      <div className="platform-dialog-header"><h2 id="account-settings-title">{adminEdit ? '修改学生资料' : required ? '完善个人信息' : '账户设置'}</h2>{!required&&<button type="button" disabled={busy} className="platform-dialog-close" aria-label="关闭弹窗" onClick={onClose}>×</button>}</div>
      <p className="platform-account-identity"><strong>{account.display_name || account.username}</strong> · {({student:'学生',teacher:'教师',admin:'管理员',finance:'财务'})[account.account_type]}</p>
      {adminEdit ? <p style={styles.muted}>更新毕业年份后，可返回账号列表启用账号。</p> : required ? <p className="platform-account-required">请先填写以下三项，再进入平台。</p> : <div className="platform-account-tabs" role="tablist" aria-label="账号设置">{[['profile','个人信息'],['password','修改密码']].map(([value,label])=><button key={value} type="button" role="tab" disabled={busy} aria-selected={tab===value} onClick={()=>{setTab(value);setError('');}}>{label}</button>)}</div>}
      <fieldset disabled={busy}>
        {tab==='profile' && (student ? <div className="platform-account-fields">
          <Field required label="系统责任教师"><SearchableSelect required value={form.responsible_teacher_username} options={teacherOptions} onChange={value=>set('responsible_teacher_username',value)} placeholder="搜索或选择系统责任教师" /></Field>
          <Field required label="实际指导教师"><SearchableSelect required value={form.guiding_teacher_username} options={teacherOptions} onChange={value=>set('guiding_teacher_username',value)} placeholder="搜索或选择实际指导教师" /></Field>
          <Field required label={<>毕业年份<strong className="platform-graduation-hint">非组内成员（如小学期课设、毕设、联培等）请选择合作结束年份</strong></>}><SearchableSelect required value={form.graduation_year} options={graduationYears.map(year=>({value:String(year),label:`${year}年`}))} onChange={value=>set('graduation_year',value)} placeholder="搜索或选择毕业年份" /></Field>
          {!teachers.length&&<p role="alert" className="platform-dialog-error">暂无已注册教师，请联系管理员。</p>}
        </div> : <p style={styles.muted}>姓名和账号身份由注册信息确定，可在“修改密码”中更新密码。</p>)}
        {tab==='password' && <div className="platform-account-password"><p style={styles.muted}>新密码至少6位，修改后该账号在所有设备上退出登录。</p>{[['old_password','当前密码'],['new_password','新密码'],['confirm_password','再次输入新密码']].map(([key,label])=><Field key={key} required label={label}><input required type="password" style={{...styles.input,fontSize:16}} value={password[key]} onChange={event=>{setPassword(prev=>({...prev,[key]:event.target.value}));setError('');}} autoComplete={key==='old_password'?'current-password':'new-password'} /></Field>)}</div>}
      </fieldset>
      {error&&<p role="alert" className="platform-dialog-error">{error}</p>}
      <div className="platform-dialog-actions">{required ? <button type="button" disabled={busy} onClick={onLogout}>退出登录</button> : <button type="button" disabled={busy} onClick={onClose}>关闭</button>}{(student || tab==='password')&&<button className="is-primary" disabled={busy}>{busy ? '正在保存…' : required ? '保存并进入平台' : tab==='profile' ? '保存个人信息' : '确认修改密码'}</button>}</div>
    </form>
  </dialog>;
}
