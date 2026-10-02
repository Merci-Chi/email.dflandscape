let lastTouchEnd=0
document.addEventListener('touchend',e=>{const n=Date.now();if(n-lastTouchEnd<=300)e.preventDefault();lastTouchEnd=n},{passive:false})
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL='https://wfxuxrvygyzonkflpwoq.supabase.co'
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_e2h4t8AvCobzftt36UrDbw_NJGq8qlJ'
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY)
const {data:{session}}=await supabase.auth.getSession()
if(!session?.user){location.replace('index.html');throw new Error('Not authenticated')}
const user=session.user
const email=(user.email||'').toLowerCase()
const displayName=user.user_metadata?.display_name||email.split('@')[0]||'Mailbox'
const {data:accessRows,error:accessError}=await supabase.from('dflandscape_mail_access').select('role,active').eq('user_id',user.id)
const canManageEmails=!accessError&&(accessRows||[]).some(row=>row?.active===true&&String(row?.role||'').toLowerCase()==='admin')
const manageEmailsLink=document.getElementById('manageEmailsLink')
if(manageEmailsLink)manageEmailsLink.hidden=!canManageEmails
if(location.pathname.endsWith('/manage-emails.html')&&!canManageEmails){location.replace('mail.html');throw new Error('No access')}

const accountList=document.getElementById('accountList')
if(accountList)accountList.innerHTML=`<a class="account-btn active" href="mail.html" style="text-decoration:none"><span class="account-copy"><strong>${esc(displayName)}</strong><span>${esc(email)}</span></span></a>`



const NOTIFY_ENABLED_KEY='dfl_email_notifications_enabled'
const NOTIFY_SOUND_KEY='dfl_email_notification_sound'
const notificationToggle=document.getElementById('notificationToggle')
const notificationSoundToggle=document.getElementById('notificationSoundToggle')
const enableNotificationsBtn=document.getElementById('enableNotificationsBtn')
const notificationMessage=document.getElementById('notificationMessage')

function notificationEnabled(){
  return localStorage.getItem(NOTIFY_ENABLED_KEY)==='true'
}
function notificationSoundEnabled(){
  return localStorage.getItem(NOTIFY_SOUND_KEY)!=='false'
}
function refreshNotificationSettings(){
  if(notificationToggle)notificationToggle.checked=notificationEnabled()
  if(notificationSoundToggle)notificationSoundToggle.checked=notificationSoundEnabled()
  if(notificationMessage){
    if(!('Notification' in window))notificationMessage.textContent='Notifications are not supported in this browser.'
    else if(Notification.permission==='denied')notificationMessage.textContent='Notifications are blocked in your browser settings.'
    else if(Notification.permission==='granted'&&notificationEnabled())notificationMessage.textContent='Notifications are enabled on this device.'
    else notificationMessage.textContent='Notifications are off on this device.'
  }
}
notificationToggle?.addEventListener('change',async()=>{
  if(notificationToggle.checked){
    if(!('Notification' in window)){
      notificationToggle.checked=false
      refreshNotificationSettings()
      return
    }
    const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission()
    if(permission!=='granted'){
      notificationToggle.checked=false
      localStorage.setItem(NOTIFY_ENABLED_KEY,'false')
    }else{
      localStorage.setItem(NOTIFY_ENABLED_KEY,'true')
    }
  }else{
    localStorage.setItem(NOTIFY_ENABLED_KEY,'false')
  }
  refreshNotificationSettings()
})
notificationSoundToggle?.addEventListener('change',()=>{
  localStorage.setItem(NOTIFY_SOUND_KEY,String(notificationSoundToggle.checked))
  refreshNotificationSettings()
})
enableNotificationsBtn?.addEventListener('click',async()=>{
  if(!('Notification' in window)){refreshNotificationSettings();return}
  const permission=await Notification.requestPermission()
  localStorage.setItem(NOTIFY_ENABLED_KEY,String(permission==='granted'))
  refreshNotificationSettings()
})
refreshNotificationSettings()

const settingsEmail=document.getElementById('settingsEmail')
const settingsDisplayName=document.getElementById('settingsDisplayName')
const profileForm=document.getElementById('profileForm')
const passwordForm=document.getElementById('passwordForm')
const signatureForm=document.getElementById('signatureForm')
const signatureMailbox=document.getElementById('signatureMailbox')
const signatureText=document.getElementById('signatureText')
const mailRuleForm=document.getElementById('mailRuleForm'),mailRuleMailbox=document.getElementById('mailRuleMailbox'),mailRuleList=document.getElementById('mailRuleList')

async function loadSettingsMailboxes(){
  if(!signatureMailbox)return
  try{
    const {data:{session:s}}=await supabase.auth.getSession()
    const res=await fetch(`${SUPABASE_URL}/functions/v1/dflandscape-mail`,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${s.access_token}`,
        'apikey':SUPABASE_PUBLISHABLE_KEY
      },
      body:JSON.stringify({action:'mailboxes'})
    })
    const result=await res.json()
    const mailboxes=(result?.data||[]).filter(v=>String(v).toLowerCase().endsWith('@dflandscape.com'))
    signatureMailbox.innerHTML=mailboxes.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('')
    if(mailRuleMailbox)mailRuleMailbox.innerHTML='<option value="">All mailboxes</option>'+mailboxes.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('')
    loadSelectedSignature()
  }catch(error){
    console.error('Unable to load signature mailboxes',error)
    signatureMailbox.innerHTML=`<option value="${esc(email)}">${esc(email)}</option>`
    if(mailRuleMailbox)mailRuleMailbox.innerHTML='<option value="">All mailboxes</option><option value="'+esc(email)+'">'+esc(email)+'</option>'
    loadSelectedSignature()
  }
}

function currentSignatures(){
  const value=user.user_metadata?.email_signatures
  return value&&typeof value==='object'&&!Array.isArray(value)?{...value}:{}
}

function loadSelectedSignature(){
  if(!signatureMailbox||!signatureText)return
  const signatures=currentSignatures()
  signatureText.value=String(signatures[signatureMailbox.value]||'')
}

if(settingsEmail)settingsEmail.value=email
if(settingsDisplayName)settingsDisplayName.value=displayName

profileForm?.addEventListener('submit',async e=>{
  e.preventDefault()
  const msg=document.getElementById('profileMessage')
  const nextName=settingsDisplayName.value.trim()
  if(!nextName){msg.textContent='Enter a display name.';return}
  msg.textContent='Saving…'
  const {data,error}=await supabase.auth.updateUser({data:{display_name:nextName}})
  if(error){msg.textContent=error.message||'Unable to save profile.';return}
  if(data?.user)Object.assign(user,data.user)
  msg.textContent='Profile saved.'
  msg.classList.add('success')
})

passwordForm?.addEventListener('submit',async e=>{
  e.preventDefault()
  const msg=document.getElementById('passwordMessage')
  const password=document.getElementById('settingsPassword').value
  const confirmPassword=document.getElementById('settingsPasswordConfirm').value
  if(password.length<8){msg.textContent='Use at least 8 characters.';return}
  if(password!==confirmPassword){msg.textContent='Passwords do not match.';return}
  msg.textContent='Updating…'
  const {error}=await supabase.auth.updateUser({password})
  if(error){msg.textContent=error.message||'Unable to update password.';return}
  e.currentTarget.reset()
  msg.textContent='Password updated.'
  msg.classList.add('success')
})

signatureMailbox?.addEventListener('change',loadSelectedSignature)

signatureForm?.addEventListener('submit',async e=>{
  e.preventDefault()
  const msg=document.getElementById('signatureMessage')
  const mailbox=signatureMailbox.value
  if(!mailbox){msg.textContent='Choose a mailbox.';return}
  const signatures=currentSignatures()
  signatures[mailbox]=signatureText.value.trim()
  msg.textContent='Saving…'
  const {data,error}=await supabase.auth.updateUser({data:{email_signatures:signatures}})
  if(error){msg.textContent=error.message||'Unable to save signature.';return}
  if(data?.user)Object.assign(user,data.user)
  msg.textContent='Signature saved.'
  msg.classList.add('success')
})

if(signatureMailbox)loadSettingsMailboxes()
if(mailRuleList)loadMailRules()


async function loadMailRules(){
  if(!mailRuleList)return
  mailRuleList.innerHTML='<div class="admin-loading">Loading rules…</div>'
  const {data,error}=await supabase
    .from('dflandscape_mail_rules')
    .select('*')
    .eq('user_id',user.id)
    .order('created_at',{ascending:false})
  if(error){
    mailRuleList.innerHTML='<div class="admin-empty">'+esc(error.message||'Unable to load rules.')+'</div>'
    return
  }
  if(!(data||[]).length){
    mailRuleList.innerHTML='<div class="admin-empty">No mail rules yet.</div>'
    return
  }
  mailRuleList.innerHTML=(data||[]).map(rule=>`
    <div class="mail-rule-row">
      <div class="mail-rule-copy">
        <strong>${esc(rule.name)}</strong>
        <span>${esc(rule.mailbox_email||'All mailboxes')} · ${esc(rule.field)} ${esc(rule.operator)} “${esc(rule.match_value)}” → ${esc(rule.action.replaceAll('_',' '))}</span>
      </div>
      <div class="mail-rule-actions">
        <label class="switch"><input type="checkbox" data-rule-toggle="${esc(rule.id)}" ${rule.enabled?'checked':''}><span></span></label>
        <button type="button" data-rule-delete="${esc(rule.id)}">Delete</button>
      </div>
    </div>`).join('')
  mailRuleList.querySelectorAll('[data-rule-toggle]').forEach(input=>input.addEventListener('change',async()=>{
    await supabase.from('dflandscape_mail_rules').update({enabled:input.checked,updated_at:new Date().toISOString()}).eq('id',input.dataset.ruleToggle).eq('user_id',user.id)
  }))
  mailRuleList.querySelectorAll('[data-rule-delete]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('Delete this mail rule?'))return
    await supabase.from('dflandscape_mail_rules').delete().eq('id',btn.dataset.ruleDelete).eq('user_id',user.id)
    await loadMailRules()
  }))
}

mailRuleForm?.addEventListener('submit',async e=>{
  e.preventDefault()
  const msg=document.getElementById('mailRuleMessage')
  msg.textContent='Saving…'
  const payload={
    user_id:user.id,
    mailbox_email:document.getElementById('mailRuleMailbox').value||null,
    name:document.getElementById('mailRuleName').value.trim(),
    field:document.getElementById('mailRuleField').value,
    operator:document.getElementById('mailRuleOperator').value,
    match_value:document.getElementById('mailRuleValue').value.trim(),
    action:document.getElementById('mailRuleAction').value,
    enabled:true
  }
  const {error}=await supabase.from('dflandscape_mail_rules').insert(payload)
  if(error){msg.textContent=error.message||'Unable to save rule.';return}
  mailRuleForm.reset()
  msg.textContent='Rule added.'
  msg.classList.add('success')
  await loadMailRules()
})


let adminState={users:[],mailboxes:[]}
async function adminApi(action,payload={}){
  const {data,error}=await supabase.functions.invoke('manage-email-users',{body:{action,...payload}})
  if(error)throw error
  if(data?.error)throw new Error(data.error)
  return data
}
async function loadAdminData(){
  const emailHost=document.getElementById('managedEmailList')
  const userHost=document.getElementById('companyUserList')
  if(!emailHost||!userHost)return
  emailHost.innerHTML='<div class="admin-loading">Loading email accounts…</div>'
  userHost.innerHTML='<div class="admin-loading">Loading users…</div>'
  try{
    adminState=await adminApi('list')
    renderMailboxes()
    renderUsers()
  }catch(e){
    console.error(e)
    emailHost.innerHTML=`<div class="admin-empty">${esc(e.message||'Unable to load email accounts.')}</div>`
    userHost.innerHTML=`<div class="admin-empty">${esc(e.message||'Unable to load users.')}</div>`
  }
}
function renderMailboxes(){
  const host=document.getElementById('managedEmailList')
  const boxes=adminState.mailboxes||[]
  if(!boxes.length){host.innerHTML='<div class="admin-empty">No @dflandscape.com email accounts yet.</div>';return}
  host.innerHTML=boxes.map(box=>{
    const access=(box.users||[]).filter(u=>String(u.email||'').toLowerCase().endsWith('@dflandscape.com'))
    return `<div class="admin-email-row"><div class="admin-email-copy"><strong>${esc(box.email)}</strong><span>${box.pending?'Requested email — not active yet':'Active mailbox'}</span></div><div class="admin-row-right"><span class="admin-badge ${box.pending?'pending':'active'}">${box.pending?'Pending':'Active'}</span>${access.length?access.map(u=>`<span class="access-chip">${esc(u.display_name||u.email)}</span>`).join(''):'<span class="access-chip">No assigned users</span>'}</div></div>`
  }).join('')
}
function renderUsers(){
  const host=document.getElementById('companyUserList')
  const users=(adminState.users||[]).filter(u=>String(u.email||'').toLowerCase().endsWith('@dflandscape.com'))
  if(!users.length){host.innerHTML='<div class="admin-empty">No @dflandscape.com users yet.</div>';return}
  host.innerHTML=users.map(u=>`<div class="admin-user-row"><div class="admin-user-copy"><strong>${esc(u.display_name||u.email)}</strong><span>${esc(u.email)}</span></div><div class="admin-row-right">${(u.mailboxes||[]).length?(u.mailboxes||[]).map(m=>`<span class="access-chip">${esc(m)}</span>`).join(''):'<span class="access-chip">No mailbox access</span>'}<button class="manage-access-btn" data-manage-user="${esc(u.id)}" type="button">Manage access</button></div></div>`).join('')
  host.querySelectorAll('[data-manage-user]').forEach(btn=>btn.onclick=()=>openAccessModal(btn.dataset.manageUser))
}
function mailboxToggleMarkup(box,checked=false){
  return `<label class="mailbox-toggle"><span class="mailbox-toggle-copy"><strong>${esc(box.email)}</strong><small>${box.pending?'Pending request':'Active mailbox'}</small></span><span class="switch"><input type="checkbox" value="${esc(box.email)}" ${checked?'checked':''}><span></span></span></label>`
}
function openAccessModal(userId){
  const u=(adminState.users||[]).find(x=>x.id===userId);if(!u)return
  document.getElementById('accessUserId').value=u.id
  document.getElementById('accessModalTitle').textContent=`Mailbox access — ${u.display_name||u.email}`
  document.getElementById('accessMailboxChoices').innerHTML=(adminState.mailboxes||[]).map(b=>mailboxToggleMarkup(b,(u.mailboxes||[]).includes(b.email))).join('')
  document.getElementById('accessMessage').textContent=''
  document.getElementById('accessModal').classList.remove('hidden')
}
document.getElementById('closeAccessModalBtn')?.addEventListener('click',()=>document.getElementById('accessModal').classList.add('hidden'))
document.getElementById('accessForm')?.addEventListener('submit',async e=>{
  e.preventDefault()
  const msg=document.getElementById('accessMessage')
  const userId=document.getElementById('accessUserId').value
  const mailboxes=[...document.querySelectorAll('#accessMailboxChoices input:checked')].map(x=>x.value)
  msg.textContent='Saving…'
  try{await adminApi('set_permissions',{user_id:userId,mailboxes});document.getElementById('accessModal').classList.add('hidden');await loadAdminData()}catch(err){msg.textContent=err.message||'Unable to save access.'}
})
document.getElementById('openAddUserBtn')?.addEventListener('click',()=>{
  document.getElementById('addUserForm').reset()
  document.getElementById('addUserMessage').textContent=''
  document.getElementById('newUserMailboxChoices').innerHTML=(adminState.mailboxes||[]).map(b=>mailboxToggleMarkup(b,false)).join('')
  document.getElementById('addUserModal').classList.remove('hidden')
})
document.getElementById('closeAddUserBtn')?.addEventListener('click',()=>document.getElementById('addUserModal').classList.add('hidden'))
document.getElementById('addUserForm')?.addEventListener('submit',async e=>{
  e.preventDefault()
  const msg=document.getElementById('addUserMessage')
  const prefix=document.getElementById('newUserEmailPrefix').value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'').replace(/^[._-]+|[._-]+$/g,'')
  const display_name=document.getElementById('newUserDisplayName').value.trim()
  const password=document.getElementById('newUserPassword').value
  const mailboxes=[...document.querySelectorAll('#newUserMailboxChoices input:checked')].map(x=>x.value)
  if(!prefix){msg.textContent='Enter a valid email name.';return}
  msg.textContent='Creating user…'
  try{await adminApi('create_user',{email:`${prefix}@dflandscape.com`,display_name,password,mailboxes});document.getElementById('addUserModal').classList.add('hidden');await loadAdminData()}catch(err){msg.textContent=err.message||'Unable to create user.'}
})
document.getElementById('refreshAdminDataBtn')?.addEventListener('click',loadAdminData)

const emailRequestModal=document.getElementById('emailRequestModal')
const emailRequestForm=document.getElementById('emailRequestForm')
const emailRequestFields=document.getElementById('emailRequestFields')
const emailRequestSuccess=document.getElementById('emailRequestSuccess')
const requestedEmailCount=document.getElementById('requestedEmailCount')
const requestedEmailNames=document.getElementById('requestedEmailNames')
const emailRequestTotal=document.getElementById('emailRequestTotal')
const emailRequestMessage=document.getElementById('emailRequestMessage')
const addEmailCountSelect=document.getElementById('addEmailCountSelect')
const emailRequestPaymentBtn=document.getElementById('emailRequestPaymentBtn')
function getBillingCycle(){return document.querySelector('input[name="billingCycle"]:checked')?.value||'monthly'}
function renderRequestedEmailFields(){
  const count=Number(requestedEmailCount?.value||1)
  const existing=[...(requestedEmailNames?.querySelectorAll('input[data-email-name]')||[])].map(i=>i.value)
  requestedEmailNames.innerHTML=Array.from({length:count},(_,i)=>`<label class="request-field">Email ${i+1} name<div class="email-name-row"><input type="text" data-email-name maxlength="64" placeholder="example" value="${esc(existing[i]||'')}" required><span>@dflandscape.com</span></div></label>`).join('')
  if(addEmailCountSelect&&document.activeElement!==addEmailCountSelect)addEmailCountSelect.value=String(count)
  updateRequestTotal()
}
function updateRequestTotal(){const c=Number(requestedEmailCount?.value||1);emailRequestTotal.textContent=getBillingCycle()==='yearly'?`$${c*24}/year`:`$${c*2}/month`}
function resetRequest(count=1){
  emailRequestForm?.reset()
  if(requestedEmailCount)requestedEmailCount.value=String(count)
  emailRequestMessage.textContent=''
  emailRequestFields?.classList.remove('hidden')
  emailRequestSuccess?.classList.add('hidden')
  if(emailRequestPaymentBtn){emailRequestPaymentBtn.hidden=true;emailRequestPaymentBtn.href='#'}
  renderRequestedEmailFields()
}
addEmailCountSelect?.addEventListener('change',()=>{
  if(requestedEmailCount)requestedEmailCount.value=addEmailCountSelect.value
})
document.getElementById('openEmailRequestBtn')?.addEventListener('click',()=>{
  resetRequest(Number(addEmailCountSelect?.value||1))
  emailRequestModal.classList.remove('hidden')
})
document.getElementById('closeEmailRequestBtn')?.addEventListener('click',()=>emailRequestModal.classList.add('hidden'))
document.getElementById('closeRequestSuccessBtn')?.addEventListener('click',()=>{emailRequestModal.classList.add('hidden');loadAdminData()})
requestedEmailCount?.addEventListener('change',renderRequestedEmailFields)
document.querySelectorAll('input[name="billingCycle"]').forEach(i=>i.addEventListener('change',updateRequestTotal))
emailRequestForm?.addEventListener('submit',async e=>{
  e.preventDefault()
  const btn=e.currentTarget.querySelector('button[type="submit"]')
  const quantity=Number(requestedEmailCount.value||1),billingCycle=getBillingCycle()
  const names=[...requestedEmailNames.querySelectorAll('input[data-email-name]')].map(i=>i.value.trim())
  const usernames=names.map(n=>n.toLowerCase().replace(/[^a-z0-9._-]+/g,'').replace(/^[._-]+|[._-]+$/g,''))
  if(names.some(n=>!n)||usernames.some(n=>!n)){emailRequestMessage.textContent='Enter a valid name for every email.';return}
  const requestedEmails=usernames.map((username,i)=>({name:names[i],username,email:`${username}@dflandscape.com`}))
  btn.disabled=true;emailRequestMessage.textContent='Submitting request…'
  const {data:reqRow,error:reqErr}=await supabase.from('dflandscape_email_requests').insert({requested_by:user.id,requested_by_email:email,quantity,billing_cycle:billingCycle,price_per_email:billingCycle==='yearly'?24:2,requested_emails:requestedEmails,status:'pending'}).select('id').single()
  if(reqErr){btn.disabled=false;emailRequestMessage.textContent=reqErr.message||'Unable to submit request.';return}
  emailRequestMessage.textContent='Creating secure payment link…'
  const {data:pay,error:payErr}=await supabase.functions.invoke('create-email-payment-link',{body:{request_id:reqRow.id}})
  btn.disabled=false
  if(payErr||!pay?.payment_link){emailRequestMessage.textContent='Request saved, but the payment link could not be created.';await loadAdminData();return}
  emailRequestPaymentBtn.href=pay.payment_link;emailRequestPaymentBtn.hidden=false;emailRequestPaymentBtn.textContent=billingCycle==='monthly'?`Continue to payment — $${quantity*2}/month`:`Continue to payment — $${quantity*24}/year`
  emailRequestMessage.textContent='';emailRequestFields.classList.add('hidden');emailRequestSuccess.classList.remove('hidden');await loadAdminData()
})

const pendingEmailRequestList=document.getElementById('pendingEmailRequestList')
const editPendingRequestModal=document.getElementById('editPendingRequestModal')
const editPendingRequestForm=document.getElementById('editPendingRequestForm')
const editPendingRequestId=document.getElementById('editPendingRequestId')
const editPendingEmailFields=document.getElementById('editPendingEmailFields')
const editPendingRequestMessage=document.getElementById('editPendingRequestMessage')
let pendingEmailRequests=[]

async function loadPendingEmailRequests(){
  if(!pendingEmailRequestList||!canManageEmails)return
  pendingEmailRequestList.innerHTML='<div class="pending-request-empty">Loading pending requests…</div>'
  const {data,error}=await supabase.from('dflandscape_email_requests')
    .select('id,quantity,billing_cycle,requested_emails,requested_by_email,payment_status,status,created_at')
    .eq('status','pending')
    .order('created_at',{ascending:false})

  if(error){
    console.error(error)
    pendingEmailRequestList.innerHTML='<div class="pending-request-empty">Unable to load pending requests.</div>'
    return
  }

  pendingEmailRequests=Array.isArray(data)?data:[]
  if(!pendingEmailRequests.length){
    pendingEmailRequestList.innerHTML='<div class="pending-request-empty">No pending email requests.</div>'
    return
  }

  pendingEmailRequestList.innerHTML=pendingEmailRequests.map(r=>{
    const emails=Array.isArray(r.requested_emails)?r.requested_emails:[]
    const count=Number(r.quantity||emails.length||0)
    return `
      <div class="pending-request-card">
        <div class="pending-request-top">
          <div>
            <strong>${count} email${count===1?'':'s'}</strong>
            <span>${esc(r.billing_cycle||'monthly')} · ${esc(r.payment_status||'unpaid')}</span>
          </div>
          <button class="pending-edit-btn" data-pending-edit="${esc(r.id)}" type="button">Edit</button>
        </div>
        <div class="pending-address-list">
          ${emails.map(item=>`<span>${esc(item?.email||'')}</span>`).join('')}
        </div>
        <div class="pending-request-meta">Requested by ${esc(r.requested_by_email||'Unknown')}</div>
      </div>
    `
  }).join('')

  pendingEmailRequestList.querySelectorAll('[data-pending-edit]').forEach(btn=>{
    btn.addEventListener('click',()=>openPendingEmailEditor(btn.dataset.pendingEdit))
  })

  const params=new URLSearchParams(location.search)
  const requestId=params.get('request')
  if(requestId&&pendingEmailRequests.some(r=>r.id===requestId)){
    openPendingEmailEditor(requestId)
  }
}

function openPendingEmailEditor(requestId){
  const request=pendingEmailRequests.find(r=>r.id===requestId)
  if(!request||!editPendingRequestModal)return

  editPendingRequestId.value=request.id
  editPendingRequestMessage.textContent=''

  const emails=Array.isArray(request.requested_emails)?request.requested_emails:[]
  editPendingEmailFields.innerHTML=emails.map((item,index)=>{
    const username=String(item?.email||'').split('@')[0]||String(item?.username||'')
    return `
      <label class="request-field">
        Email ${index+1}
        <div class="email-name-row">
          <input type="text" data-pending-email-name maxlength="64" value="${esc(username)}" required>
          <span>@dflandscape.com</span>
        </div>
      </label>
    `
  }).join('')

  editPendingRequestModal.classList.remove('hidden')
}

function closePendingEmailEditor(){
  editPendingRequestModal?.classList.add('hidden')
  const url=new URL(location.href)
  url.searchParams.delete('request')
  url.searchParams.delete('action')
  history.replaceState(null,'',url.pathname+url.search+url.hash)
}

async function cancelPendingEmailRequest(){
  const requestId=editPendingRequestId?.value
  if(!requestId)return
  if(!confirm('Delete this pending email request?'))return

  const {error}=await supabase.from('dflandscape_email_requests')
    .update({status:'cancelled',updated_at:new Date().toISOString()})
    .eq('id',requestId)
    .eq('status','pending')

  if(error){
    editPendingRequestMessage.textContent=error.message||'Unable to delete request.'
    return
  }

  closePendingEmailEditor()
  await Promise.all([loadPendingEmailRequests(),loadAdminData()])
}

document.getElementById('refreshPendingRequestsBtn')?.addEventListener('click',loadPendingEmailRequests)
document.getElementById('closeEditPendingRequestBtn')?.addEventListener('click',closePendingEmailEditor)
document.getElementById('deletePendingRequestBtn')?.addEventListener('click',cancelPendingEmailRequest)
editPendingRequestModal?.addEventListener('click',e=>{if(e.target===editPendingRequestModal)closePendingEmailEditor()})

editPendingRequestForm?.addEventListener('submit',async e=>{
  e.preventDefault()
  const requestId=editPendingRequestId.value
  const request=pendingEmailRequests.find(r=>r.id===requestId)
  if(!request)return

  const usernames=[...editPendingEmailFields.querySelectorAll('[data-pending-email-name]')].map(input=>
    input.value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'').replace(/^[._-]+|[._-]+$/g,'')
  )

  if(usernames.some(v=>!v)){
    editPendingRequestMessage.textContent='Every email needs a valid name.'
    return
  }
  if(new Set(usernames).size!==usernames.length){
    editPendingRequestMessage.textContent='Each requested email must be different.'
    return
  }

  const old=Array.isArray(request.requested_emails)?request.requested_emails:[]
  const requested_emails=usernames.map((username,index)=>({
    name:old[index]?.name||username,
    username,
    email:`${username}@dflandscape.com`
  }))

  const saveButton=e.currentTarget.querySelector('button[type="submit"]')
  saveButton.disabled=true
  editPendingRequestMessage.textContent='Saving…'

  const {error}=await supabase.from('dflandscape_email_requests')
    .update({requested_emails,updated_at:new Date().toISOString()})
    .eq('id',requestId)
    .eq('status','pending')

  saveButton.disabled=false

  if(error){
    editPendingRequestMessage.textContent=error.message||'Unable to save changes.'
    return
  }

  closePendingEmailEditor()
  await Promise.all([loadPendingEmailRequests(),loadAdminData()])
})

await loadPendingEmailRequests()

document.querySelector('.signout')?.addEventListener('click',async e=>{e.preventDefault();await supabase.auth.signOut();location.replace('index.html')})
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]))}
if(requestedEmailCount)renderRequestedEmailFields()
await loadAdminData()
