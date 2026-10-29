let lastTouchEnd=0
document.addEventListener('touchend',e=>{const n=Date.now();if(n-lastTouchEnd<=300)e.preventDefault();lastTouchEnd=n},{passive:false})
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL='https://wfxuxrvygyzonkflpwoq.supabase.co'
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_e2h4t8AvCobzftt36UrDbw_NJGq8qlJ'
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY)

// Same mobile menu behavior as the regular Mail page
const mobileMenuBtn=document.getElementById('mobileMenuBtn')
const mobileMenuClose=document.getElementById('mobileMenuClose')
const mobileMenuOverlay=document.getElementById('mobileMenuOverlay')
const mailSidebar=document.getElementById('mailSidebar')

function isMobileMenuMode(){return window.matchMedia('(max-width:650px)').matches}
function openMobileMenu(){
  if(!isMobileMenuMode()||!mailSidebar)return
  mailSidebar.classList.add('mobile-open')
  mobileMenuOverlay?.removeAttribute('hidden')
  requestAnimationFrame(()=>mobileMenuOverlay?.classList.add('show'))
  mobileMenuBtn?.setAttribute('aria-expanded','true')
  document.body.classList.add('mobile-menu-open')
}
function closeMobileMenu(){
  mailSidebar?.classList.remove('mobile-open')
  mobileMenuOverlay?.classList.remove('show')
  mobileMenuBtn?.setAttribute('aria-expanded','false')
  document.body.classList.remove('mobile-menu-open')
  if(mobileMenuOverlay){
    window.setTimeout(()=>{if(!mailSidebar?.classList.contains('mobile-open'))mobileMenuOverlay.setAttribute('hidden','')},180)
  }
}
mobileMenuBtn?.addEventListener('click',()=>mailSidebar?.classList.contains('mobile-open')?closeMobileMenu():openMobileMenu())
mobileMenuClose?.addEventListener('click',closeMobileMenu)
mobileMenuOverlay?.addEventListener('click',closeMobileMenu)
mailSidebar?.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMobileMenu))
window.addEventListener('resize',()=>{if(!isMobileMenuMode())closeMobileMenu()})

let touchStartX=0,touchStartY=0,touchLastX=0,touchLastY=0,trackingHorizontalSwipe=false
const SWIPE_START_ZONE=Math.min(window.innerWidth*0.7,320)

document.addEventListener('touchstart',e=>{
  if(!isMobileMenuMode()||e.touches.length!==1)return
  if(e.target.closest?.('input,textarea,select,[contenteditable="true"],.email-request-modal'))return

  const touch=e.touches[0]
  touchStartX=touch.clientX
  touchStartY=touch.clientY
  touchLastX=touchStartX
  touchLastY=touchStartY

  const sidebarOpen=mailSidebar?.classList.contains('mobile-open')
  const startedInLeftZone=touchStartX<=SWIPE_START_ZONE
  trackingHorizontalSwipe=sidebarOpen||startedInLeftZone
},{passive:true})

document.addEventListener('touchmove',e=>{
  if(!trackingHorizontalSwipe||e.touches.length!==1)return
  const touch=e.touches[0]
  touchLastX=touch.clientX
  touchLastY=touch.clientY
},{passive:true})

document.addEventListener('touchend',e=>{
  if(!trackingHorizontalSwipe)return
  trackingHorizontalSwipe=false

  const endTouch=e.changedTouches?.[0]
  const endX=endTouch?.clientX??touchLastX
  const endY=endTouch?.clientY??touchLastY
  const dx=endX-touchStartX
  const dy=endY-touchStartY
  const horizontalEnough=Math.abs(dx)>=60&&Math.abs(dx)>Math.abs(dy)*1.15
  if(!horizontalEnough)return

  const sidebarOpen=mailSidebar?.classList.contains('mobile-open')
  if(dx>0&&!sidebarOpen)openMobileMenu()
  else if(dx<0&&sidebarOpen)closeMobileMenu()
},{passive:true})

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
async function loadSidebarMailboxes(){
  if(!accountList)return
  accountList.innerHTML='<div class="admin-loading">Loading mailboxes…</div>'
  try{
    let mailboxes=[]

    if(canManageEmails){
      const {data,error}=await supabase
        .from('dflandscape_mailboxes')
        .select('email')
        .eq('active',true)
        .order('email')

      if(error)throw error
      mailboxes=(data||[]).map(row=>row.email)
    }else{
      const {data:{session:s}}=await supabase.auth.getSession()
      const controller=new AbortController()
      const timer=setTimeout(()=>controller.abort(),10000)

      try{
        const res=await fetch(`${SUPABASE_URL}/functions/v1/dflandscape-mail`,{
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'Authorization':`Bearer ${s.access_token}`,
            'apikey':SUPABASE_PUBLISHABLE_KEY
          },
          body:JSON.stringify({action:'mailboxes'}),
          signal:controller.signal
        })
        const result=await res.json()
        if(!res.ok)throw new Error(result?.error||'Unable to load mailboxes.')
        mailboxes=result?.data||[]
      }finally{
        clearTimeout(timer)
      }
    }

    mailboxes=mailboxes.filter(v=>String(v).toLowerCase().endsWith('@dflandscape.com'))
    accountList.innerHTML=mailboxes.length
      ?mailboxes.map(m=>`<a class="account-btn" href="mail.html?mailbox=${encodeURIComponent(m)}" style="text-decoration:none"><span class="account-copy"><strong>${esc(String(m).split('@')[0])}</strong><span>${esc(m)}</span></span></a>`).join('')
      :'<div class="no-access">No mailbox access.</div>'
  }catch(error){
    console.error('Unable to load sidebar mailboxes',error)
    accountList.innerHTML='<div class="no-access">Unable to load mailboxes.</div>'
  }
}
loadSidebarMailboxes()



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


const signatureFields=['Name','Title','Business','Phone','Website','Logo','Style']
const signatureDefaultLogo="https://raw.githubusercontent.com/Merci-Chi/DFLandscape/main/images/text.png"
function signatureProfiles(){const v=user.user_metadata?.email_signature_profiles;return v&&typeof v==='object'&&!Array.isArray(v)?{...v}:{}}
function defaultSignatureProfile(mailbox){
 const isDon=/^don(?:[._-]|@)/i.test(mailbox)||(/^don white$/i.test(displayName)&&mailbox===email)
 return {name:isDon?'Don White':displayName,title:'',business:'Desert Forest Landscape',phone:'',website:'',logo:signatureDefaultLogo,style:'branded',includeLogo:true}
}
function signatureProfile(){return {...defaultSignatureProfile(signatureMailbox.value),...signatureProfiles()[signatureMailbox.value]}}
function signatureSafeUrl(value){try{const u=new URL(String(value||''));return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
function signaturePreviewRender(){
 if(!signatureMailbox)return
 const get=k=>document.getElementById('signature'+k)
 const values=Object.fromEntries(signatureFields.map(k=>[k,get(k)?.value.trim()||'']))
 const logo=signatureSafeUrl(values.Logo)
 const web=signatureSafeUrl(values.Website)
 const includeLogo=get('IncludeLogo')?.checked&&values.Style!=='simple'
 const content='<strong style="font-size:17px;color:#143c27">'+esc(values.Name)+'</strong>'+
 (values.Title?'<div>'+esc(values.Title)+'</div>':'')+
 (values.Business?'<div style="font-weight:600;color:#275840">'+esc(values.Business)+'</div>':'')+
 (values.Phone?'<div>'+esc(values.Phone)+'</div>':'')+
 (web?'<div><a href="'+esc(web)+'" target="_blank" rel="noopener noreferrer">'+esc(values.Website)+'</a></div>':'')
 document.getElementById('signaturePreview').innerHTML='<div class="signature-preview-inner">'+(includeLogo&&logo?'<img src="'+esc(logo)+'" alt="Company logo">':'')+'<div>'+content+'</div></div>'
}
function loadSignatureProfile(){
 const p=signatureProfile()
 for(const key of signatureFields){const field=document.getElementById('signature'+key);if(field)field.value=p[key.toLowerCase()]||''}
 const checkbox=document.getElementById('signatureIncludeLogo')
 if(checkbox)checkbox.checked=p.includeLogo!==false
 signaturePreviewRender()
}
for(const field of [...signatureFields,'IncludeLogo'])document.getElementById('signature'+field)?.addEventListener('input',signaturePreviewRender)

function currentSignatures(){
  const value=user.user_metadata?.email_signatures
  return value&&typeof value==='object'&&!Array.isArray(value)?{...value}:{}
}

function loadSelectedSignature(){
  if(!signatureMailbox||!signatureText)return
  const signatures=currentSignatures()
  signatureText.value=String(signatures[signatureMailbox.value]||'')
  loadSignatureProfile()
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
  const profiles=signatureProfiles()
  profiles[mailbox]={...Object.fromEntries(signatureFields.map(k=>[k.toLowerCase(),document.getElementById('signature'+k)?.value.trim()||''])),includeLogo:document.getElementById('signatureIncludeLogo')?.checked===true}
  msg.textContent='Saving…'
  const {data,error}=await supabase.auth.updateUser({data:{email_signatures:signatures,email_signature_profiles:profiles}})
  if(error){msg.textContent=error.message||'Unable to save signature.';return}
  if(data?.user)Object.assign(user,data.user)
  msg.textContent='Signature saved.'
  msg.classList.add('success')
})


// Batch 1: user-owned signatures. Legacy mailbox signatures are retained for compatibility.
async function loadUserSignatureRecords(){
 const {data,error}=await supabase.from('dflandscape_user_signatures')
   .select('id,name,content_text,content_html,design,is_default_new,is_default_reply,created_at')
   .eq('user_id',user.id).order('created_at',{ascending:true})
 if(error){console.warn('Unable to load user signatures',error);return}
 window.dflUserSignatures=data||[]
}
await loadUserSignatureRecords()


/* Batch 2 — user-based visual signature editor. Does not change legacy email sending yet. */
const userSigSelect=document.getElementById('userSignatureSelect')
const userSigEditor=document.getElementById('userSignatureEditor')
if(userSigEditor&&userSigSelect){
 let sigRows=Array.isArray(window.dflUserSignatures)?window.dflUserSignatures:[]
 let selectedSigId=''
 let sigSavedHtml=''
 const sigStatus=document.getElementById('userSignatureStatus')
 const sigName=document.getElementById('userSignatureName')
 const sigNew=document.getElementById('signatureDefaultNew')
 const sigReply=document.getElementById('signatureDefaultReply')
 const sigPreview=document.getElementById('userSignaturePreview')
 const sigAllowedTags=new Set(['DIV','P','BR','SPAN','B','STRONG','I','EM','U','S','A','IMG','TABLE','TBODY','TR','TD','TH','UL','OL','LI','FONT','BLOCKQUOTE'])
 const sigStyles=new Set(['color','background-color','font-weight','font-style','text-decoration','font-size','font-family','text-align','vertical-align','width','height','max-width','border','border-collapse','padding','padding-left','padding-right'])
 function sigUrl(value,kind='link'){
   try{const u=new URL(value);return kind==='image'?(u.protocol==='https:'?u.href:''):((u.protocol==='https:'||u.protocol==='http:'||u.protocol==='mailto:'||u.protocol==='tel:')?u.href:'')}catch{return ''}
 }
 function sigSanitize(markup){
   const source=new DOMParser().parseFromString('<div>'+String(markup||'')+'</div>','text/html').body.firstElementChild
   const out=document.createElement('div')
   function clean(parent,node){
     if(node.nodeType===Node.TEXT_NODE){parent.appendChild(document.createTextNode(node.textContent||''));return}
     if(node.nodeType!==Node.ELEMENT_NODE)return
     const tag=node.tagName.toUpperCase()
     if(['SCRIPT','STYLE','IFRAME','SVG','FORM','INPUT','BUTTON','OBJECT','EMBED','VIDEO','AUDIO'].includes(tag))return
     const allowed=sigAllowedTags.has(tag)
     const el=allowed?document.createElement(tag.toLowerCase()):parent
     if(allowed){
       if(tag==='A'){const href=sigUrl(node.getAttribute('href')||'');if(href){el.setAttribute('href',href);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer')}}
       if(tag==='IMG'){
         const src=sigUrl(node.getAttribute('src')||'','image')
         if(!src)return
         el.setAttribute('src',src);el.setAttribute('alt',(node.getAttribute('alt')||'Signature image').slice(0,120))
         const width=Math.max(20,Math.min(600,Number(node.getAttribute('width'))||200))
         el.setAttribute('width',String(width))
       }
       const style=(node.getAttribute('style')||'').split(';')
       for(const entry of style){
         const idx=entry.indexOf(':');if(idx<0)continue
         const key=entry.slice(0,idx).trim().toLowerCase(), val=entry.slice(idx+1).trim()
         if(sigStyles.has(key)&&val.length<100&&!/url\s*\(|expression\s*\(|[<>]/i.test(val))el.style.setProperty(key,val)
       }
       parent.appendChild(el)
     }
     for(const child of [...node.childNodes])clean(el,child)
   }
   for(const node of [...source.childNodes])clean(out,node)
   return out.innerHTML.slice(0,100000)
 }
 function sigText(html){
   const el=document.createElement('div');el.innerHTML=sigSanitize(html)
   return (el.innerText||el.textContent||'').slice(0,15000)
 }
 function sigRenderPreview(){sigPreview.innerHTML=sigSanitize(userSigEditor.innerHTML)}
 function sigSetStatus(value,error=false){sigStatus.textContent=value;sigStatus.style.color=error?'#ad3030':''}
 function sigFillList(){
   userSigSelect.innerHTML='<option value="">New signature</option>'+sigRows.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.name)+'</option>').join('')
   userSigSelect.value=selectedSigId
 }
 function sigLoad(id){
   selectedSigId=id||''
   const row=sigRows.find(x=>x.id===id)
   sigName.value=row?.name||''
   sigNew.checked=row?.is_default_new===true
   sigReply.checked=row?.is_default_reply===true
   userSigEditor.innerHTML=sigSanitize(row?.content_html||((row?.content_text||'').split('\n').map(x=>esc(x)).join('<br>')))
   sigSavedHtml=userSigEditor.innerHTML
   sigFillList();sigRenderPreview();sigSetStatus('')
 }
 async function sigRefresh(){
   const {data,error}=await supabase.from('dflandscape_user_signatures').select('id,name,content_html,content_text,design,is_default_new,is_default_reply,created_at').eq('user_id',user.id).order('created_at',{ascending:true})
   if(error)throw error
   sigRows=data||[];window.dflUserSignatures=sigRows
   sigLoad(sigRows.some(x=>x.id===selectedSigId)?selectedSigId:(sigRows[0]?.id||''))
 }
 userSigSelect.addEventListener('change',()=>sigLoad(userSigSelect.value))
 document.getElementById('signatureNew').addEventListener('click',()=>sigLoad(''))
 document.getElementById('signatureDuplicate').addEventListener('click',()=>{
   selectedSigId='';sigName.value=(sigName.value||'Signature')+' copy';sigNew.checked=false;sigReply.checked=false;sigFillList();sigSetStatus('Copy ready to save')
 })
 document.getElementById('signatureDelete').addEventListener('click',async()=>{
   if(!selectedSigId)return sigSetStatus('Select a saved signature to delete.',true)
   if(!confirm('Delete this signature?'))return
   const {error}=await supabase.from('dflandscape_user_signatures').delete().eq('id',selectedSigId).eq('user_id',user.id)
   if(error)return sigSetStatus(error.message,true)
   selectedSigId='';await sigRefresh();sigSetStatus('Signature deleted.')
 })
 document.querySelectorAll('[data-sig-cmd]').forEach(btn=>btn.addEventListener('click',()=>{
   userSigEditor.focus();document.execCommand(btn.dataset.sigCmd,false,null);sigRenderPreview()
 }))
 document.getElementById('sigTextColor').addEventListener('input',e=>{userSigEditor.focus();document.execCommand('foreColor',false,e.target.value);sigRenderPreview()})
 document.getElementById('sigFontSize').addEventListener('change',e=>{userSigEditor.focus();document.execCommand('fontSize',false,e.target.value);sigRenderPreview()})
 document.getElementById('signatureAddLink').addEventListener('click',()=>{
   const href=sigUrl(prompt('Enter a link (https://...)')||'')
   if(!href)return
   userSigEditor.focus()
   const selection=window.getSelection()
   if(selection?.toString())document.execCommand('createLink',false,href)
   else document.execCommand('insertHTML',false,'<a href="'+esc(href)+'">'+esc(href)+'</a>')
   sigRenderPreview()
 })
 document.getElementById('signatureAddImage').addEventListener('click',()=>{
   const src=sigUrl(prompt('Enter a public HTTPS image URL')||'','image')
   if(!src)return sigSetStatus('Image URLs must use HTTPS.',true)
   userSigEditor.focus();document.execCommand('insertHTML',false,'<img src="'+esc(src)+'" alt="Signature image" width="200">');sigRenderPreview()
 })
 document.getElementById('signatureAddTable').addEventListener('click',()=>{
   userSigEditor.focus();document.execCommand('insertHTML',false,'<table style="border-collapse:collapse"><tbody><tr><td style="padding:6px">Left column</td><td style="padding:6px">Right column</td></tr></tbody></table>');sigRenderPreview()
 })
 document.getElementById('signatureClearFormat').addEventListener('click',()=>{userSigEditor.focus();document.execCommand('removeFormat',false,null);sigRenderPreview()})
 userSigEditor.addEventListener('input',sigRenderPreview)
 userSigEditor.addEventListener('paste',e=>{
   e.preventDefault()
   const html=e.clipboardData?.getData('text/html')
   const text=e.clipboardData?.getData('text/plain')||''
   document.execCommand('insertHTML',false,html?sigSanitize(html):esc(text).replace(/\n/g,'<br>'))
   sigRenderPreview()
 })
 document.getElementById('signatureSave').addEventListener('click',async()=>{
   const name=sigName.value.trim(), html=sigSanitize(userSigEditor.innerHTML), plain=sigText(html)
   if(!name)return sigSetStatus('Enter a signature name.',true)
   if(!plain&&!/<img\b/i.test(html))return sigSetStatus('Add signature content before saving.',true)
   sigSetStatus('Saving...')
   const data={name,content_html:html,content_text:plain,design:{editor:'visual-v1'},is_default_new:false,is_default_reply:false}
   let result
   if(selectedSigId)result=await supabase.from('dflandscape_user_signatures').update(data).eq('id',selectedSigId).eq('user_id',user.id).select('id').single()
   else result=await supabase.from('dflandscape_user_signatures').insert({...data,user_id:user.id}).select('id').single()
   if(result.error)return sigSetStatus(result.error.message,true)
   selectedSigId=result.data.id
   // Clear existing defaults before setting the requested one (partial unique indexes).
   for(const [key,checked] of [['is_default_new',sigNew.checked],['is_default_reply',sigReply.checked]]){
     if(!checked)continue
     const cleared=await supabase.from('dflandscape_user_signatures').update({[key]:false}).eq('user_id',user.id).eq(key,true)
     if(cleared.error)return sigSetStatus(cleared.error.message,true)
     const updated=await supabase.from('dflandscape_user_signatures').update({[key]:true}).eq('id',selectedSigId).eq('user_id',user.id)
     if(updated.error)return sigSetStatus(updated.error.message,true)
   }
   // Explicitly turning off a default also works.
   const deselect={}
   if(!sigNew.checked)deselect.is_default_new=false
   if(!sigReply.checked)deselect.is_default_reply=false
   if(Object.keys(deselect).length){const res=await supabase.from('dflandscape_user_signatures').update(deselect).eq('id',selectedSigId).eq('user_id',user.id);if(res.error)return sigSetStatus(res.error.message,true)}
   await sigRefresh();sigSetStatus('Signature saved.')
 })
 sigRefresh().catch(e=>sigSetStatus(e.message||'Unable to load signatures.',true))
}

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


const HIDDEN_ADMIN_EMAILS=new Set(['kiara@steadyhandsop.com'])
function isHiddenAdminEmail(value=''){return HIDDEN_ADMIN_EMAILS.has(String(value||'').trim().toLowerCase())}

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
    const access=(box.users||[]).filter(u=>!isHiddenAdminEmail(u.email)&&String(u.email||'').toLowerCase().endsWith('@dflandscape.com'))
    return `<div class="admin-email-row"><div class="admin-email-copy"><strong>${esc(box.email)}</strong><span>${box.pending?'Requested email — not active yet':'Active mailbox'}</span></div><div class="admin-row-right"><span class="admin-badge ${box.pending?'pending':'active'}">${box.pending?'Pending':'Active'}</span>${access.length?access.map(u=>`<span class="access-chip">${esc(u.display_name||u.email)}</span>`).join(''):'<span class="access-chip">No assigned users</span>'}</div></div>`
  }).join('')
}
function renderUsers(){
  const host=document.getElementById('companyUserList')
  const users=(adminState.users||[]).filter(u=>!isHiddenAdminEmail(u.email)&&String(u.email||'').toLowerCase().endsWith('@dflandscape.com'))
  if(!users.length){host.innerHTML='<div class="admin-empty">No users yet.</div>';return}
  host.innerHTML=users.map(u=>{
    const isAdmin=String(u.role||'').toLowerCase()==='admin'
    const mailboxMarkup=(u.mailboxes||[]).length
      ?(u.mailboxes||[]).map(m=>`<span class="access-chip">${esc(m)}</span>`).join('')
      :'<span class="access-chip">No mailbox access</span>'
    const action=isAdmin
      ?'<span class="admin-badge active">Admin · all mailboxes</span>'
      :`<button class="manage-access-btn" data-manage-user="${esc(u.id)}" type="button">Manage access</button>`
    return `<div class="admin-user-row"><div class="admin-user-copy"><strong>${esc(u.display_name||u.email)}</strong><span>${esc(u.email)}</span></div><div class="admin-row-right">${mailboxMarkup}${action}</div></div>`
  }).join('')
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
