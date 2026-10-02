// Multi-mailbox patch for mail.js.
// Replace the existing account bootstrap/callMailFunction usage with this version,
// or use this file as a full replacement if your current UI element IDs match mail.html.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL='https://wfxuxrvygyzonkflpwoq.supabase.co'
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_e2h4t8AvCobzftt36UrDbw_NJGq8qlJ'
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY)
const {data:{session}}=await supabase.auth.getSession()
if(!session?.user){location.replace('index.html');throw new Error('Not authenticated')}

let accounts=[],activeAccount=null,activeFolder='Inbox',activeMessageId=null,currentMessages=[],activeMessage=null
const accountList=document.getElementById('accountList'),mailboxHeading=document.getElementById('mailboxHeading'),mailboxAddress=document.getElementById('mailboxAddress')
const messageList=document.getElementById('messageList'),readerPanel=document.getElementById('readerPanel'),searchInput=document.getElementById('searchInput'),composeModal=document.getElementById('composeModal'),composeFrom=document.getElementById('composeFrom')
const mobileMenuBtn=document.getElementById('mobileMenuBtn'),mobileMenuClose=document.getElementById('mobileMenuClose'),mobileMenuOverlay=document.getElementById('mobileMenuOverlay'),mailSidebar=document.getElementById('mailSidebar')
const manageEmailsLink=document.getElementById('manageEmailsLink')
async function callMailFunction(payload){
  const {data:{session:s}}=await supabase.auth.getSession()
  const res=await fetch(`${SUPABASE_URL}/functions/v1/dflandscape-mail`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${s.access_token}`,'apikey':SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(payload)})
  const result=await res.json();if(!res.ok)throw new Error(result.error||'Mail request failed.');return result.data
}
async function loadAdminVisibility(){
  if(!manageEmailsLink)return
  try{
    const {data,error}=await supabase
      .from('dflandscape_mail_access')
      .select('role,active')
      .eq('user_id',session.user.id)

    if(error)throw error
    const isAdmin=(data||[]).some(row=>row?.active===true&&String(row?.role||'').toLowerCase()==='admin')
    manageEmailsLink.hidden=!isAdmin
  }catch(error){
    console.error('Unable to check admin access:',error)
    manageEmailsLink.hidden=true
  }
}

async function loadAccounts(){
  await loadAdminVisibility()
  const emails=await callMailFunction({action:'mailboxes'})
  accounts=(emails||[]).filter(e=>String(e).toLowerCase().endsWith('@dflandscape.com')).map(email=>({email,name:String(email).split('@')[0]}))
  activeAccount=accounts[0]||null;renderAccounts();renderComposeAccounts();if(activeAccount)await loadMessages()
}
function renderAccounts(){
  if(!accountList)return
  if(!accounts.length){accountList.innerHTML='<div class="no-access">No mailbox access.</div>';return}
  accountList.innerHTML=accounts.map(a=>`<button class="account-btn ${activeAccount?.email===a.email?'active':''}" data-email="${esc(a.email)}"><span class="account-copy"><strong>${esc(a.name)}</strong><span>${esc(a.email)}</span></span></button>`).join('')
  accountList.querySelectorAll('[data-email]').forEach(b=>b.onclick=async()=>{activeAccount=accounts.find(a=>a.email===b.dataset.email);activeMessageId=null;renderAccounts();renderComposeAccounts();await loadMessages();renderReader();closeMobileMenu()})
}
async function loadMessages(){
  if(!activeAccount)return
  mailboxHeading.textContent=activeFolder;mailboxAddress.textContent=activeAccount.email
  messageList.innerHTML='<div class="empty-reader" style="height:220px"><strong>Loading mail...</strong></div>'
  try{currentMessages=await callMailFunction({action:'list',folder:activeFolder,mailbox_email:activeAccount.email});renderMessages()}catch(e){messageList.innerHTML=`<div class="empty-reader" style="height:220px"><strong>Unable to load mail</strong><span>${esc(e.message)}</span></div>`}
}
function renderMessages(){
  const q=(searchInput?.value||'').trim().toLowerCase()
  const msgs=currentMessages.filter(m=>!q||`${m.sender} ${m.from} ${m.subject}`.toLowerCase().includes(q))
  messageList.innerHTML=msgs.length?msgs.map(m=>`<button class="message-row" data-id="${esc(m.uid)}"><span class="sender">${esc(m.sender||m.from)}</span><span class="time">${esc(formatDate(m.date))}</span><span class="subject">${esc(m.subject||'(No subject)')}</span><span class="snippet">${esc(m.from||'')}</span></button>`).join(''):'<div class="empty-reader" style="height:220px"><strong>No messages</strong><span>This folder is empty.</span></div>'
  messageList.querySelectorAll('[data-id]').forEach(r=>r.onclick=()=>loadMessage(r.dataset.id))
}
async function loadMessage(uid){
  try{
    activeMessageId=uid
    const m=await callMailFunction({action:'get',folder:activeFolder,uid,mailbox_email:activeAccount.email})
    activeMessage=m
    readerPanel.innerHTML=`<article class="reader reader-rich">
      <button class="mobile-reader-back" id="mobileReaderBack" type="button">← Back to ${esc(activeFolder)}</button>
      <div class="message-actions">
        <button type="button" class="message-action-btn" id="replyMessageBtn">Reply</button>
        <button type="button" class="message-action-btn" id="forwardMessageBtn">Forward</button>
        <button type="button" class="message-action-btn danger" id="deleteMessageBtn">${activeFolder==='Trash'?'Delete forever':'Delete'}</button>
      </div>
      <div class="eyebrow dark">Message</div>
      <h2>${esc(m.subject||'(No subject)')}</h2>
      <div class="reader-meta">From: ${esc(m.sender||m.from||'')}<br>To: ${esc(m.to||activeAccount.email)}<br>${esc(formatFullDate(m.date))}</div>
      <div class="reader-body">${m.html||esc(m.body||'')}</div>
    </article>`
    document.getElementById('replyMessageBtn')?.addEventListener('click',()=>openReplyComposer(m))
    document.getElementById('forwardMessageBtn')?.addEventListener('click',()=>openForwardComposer(m))
    document.getElementById('deleteMessageBtn')?.addEventListener('click',deleteActiveMessage)
    if(window.matchMedia('(max-width:900px)').matches){
      readerPanel.classList.add('mobile-open')
      readerPanel.scrollTop=0
    }
    document.getElementById('mobileReaderBack')?.addEventListener('click',closeMobileReader)
  }catch(e){
    readerPanel.innerHTML=`<div class="empty-reader"><strong>Unable to open email</strong><span>${esc(e.message)}</span></div>`
    if(window.matchMedia('(max-width:900px)').matches)readerPanel.classList.add('mobile-open')
  }
}
function closeMobileReader(){
  readerPanel?.classList.remove('mobile-open')
  activeMessageId=null
  activeMessage=null
}
function renderReader(){
  if(!readerPanel)return
  readerPanel.classList.remove('mobile-open')
  readerPanel.innerHTML='<div class="empty-reader"><strong>Select an email</strong><span>Choose a message to read it here.</span></div>'
}
function renderComposeAccounts(){if(composeFrom)composeFrom.innerHTML=accounts.map(a=>`<option value="${esc(a.email)}" ${activeAccount?.email===a.email?'selected':''}>${esc(a.email)}</option>`).join('')}

function setComposeValues({to='',subject='',body=''}={}){
  renderComposeAccounts()
  if(composeFrom&&activeAccount)composeFrom.value=activeAccount.email
  const toInput=document.getElementById('composeTo')
  const subjectInput=document.getElementById('composeSubject')
  const bodyInput=document.getElementById('composeBody')
  if(toInput)toInput.value=to
  if(subjectInput)subjectInput.value=subject
  if(bodyInput)bodyInput.value=body
  composeModal?.classList.remove('hidden')
  closeMobileMenu()
  setTimeout(()=>bodyInput?.focus(),50)
}
function replySubject(subject=''){
  return /^re:/i.test(subject)?subject:`Re: ${subject||'(No subject)'}`
}
function forwardSubject(subject=''){
  return /^fwd:/i.test(subject)?subject:`Fwd: ${subject||'(No subject)'}`
}
function quotedText(message){
  const original=String(message.body||'').trim()
  const date=formatFullDate(message.date)
  const header=`\n\nOn ${date||'an earlier date'}, ${message.from||message.sender||'the sender'} wrote:\n`
  if(!original)return header
  return header+original.split('\n').map(line=>`> ${line}`).join('\n')
}
function openReplyComposer(message){
  setComposeValues({
    to:message.from||'',
    subject:replySubject(message.subject),
    body:quotedText(message)
  })
}
function openForwardComposer(message){
  const original=String(message.body||'').trim()
  const forwarded=[
    '',
    '',
    '---------- Forwarded message ---------',
    `From: ${message.from||message.sender||''}`,
    `Date: ${formatFullDate(message.date)}`,
    `Subject: ${message.subject||'(No subject)'}`,
    `To: ${message.to||activeAccount?.email||''}`,
    '',
    original
  ].join('\n')
  setComposeValues({
    to:'',
    subject:forwardSubject(message.subject),
    body:forwarded
  })
}
async function deleteActiveMessage(){
  if(!activeMessageId||!activeAccount)return
  const permanent=activeFolder==='Trash'
  if(!confirm(permanent?'Permanently delete this email? This cannot be undone.':'Move this email to Trash?'))return
  const button=document.getElementById('deleteMessageBtn')
  if(button){button.disabled=true;button.textContent=permanent?'Deleting…':'Moving…'}
  try{
    await callMailFunction({action:'delete',folder:activeFolder,uid:activeMessageId,mailbox_email:activeAccount.email})
    closeMobileReader()
    renderReader()
    await loadMessages()
  }catch(error){
    alert(error.message||'Unable to delete email.')
    if(button){button.disabled=false;button.textContent=permanent?'Delete forever':'Delete'}
  }
}

function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]))}
function formatDate(v){if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleDateString([],{month:'short',day:'numeric'})}
function formatFullDate(v){if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleString()}
searchInput?.addEventListener('input',renderMessages)
document.querySelectorAll('.folder').forEach(btn=>btn.addEventListener('click',async()=>{activeFolder=btn.dataset.folder||'Inbox';document.querySelectorAll('.folder').forEach(x=>x.classList.toggle('active',x===btn));await loadMessages();closeMobileMenu()}))
document.getElementById('refreshBtn')?.addEventListener('click',loadMessages)
document.getElementById('composeBtn')?.addEventListener('click',()=>{renderComposeAccounts();composeModal?.classList.remove('hidden');closeMobileMenu()})
document.getElementById('closeCompose')?.addEventListener('click',()=>composeModal?.classList.add('hidden'))
document.getElementById('composeForm')?.addEventListener('submit',async e=>{e.preventDefault();const status=document.getElementById('composeStatus');status.textContent='Sending...';try{await callMailFunction({action:'send',mailbox_email:composeFrom.value,to:document.getElementById('composeTo').value.trim(),subject:document.getElementById('composeSubject').value.trim(),body:document.getElementById('composeBody').value});status.textContent='Sent.';e.target.reset();setTimeout(()=>composeModal.classList.add('hidden'),700)}catch(err){status.textContent=err.message||'Unable to send.'}})
document.querySelector('.signout')?.addEventListener('click',async e=>{e.preventDefault();await supabase.auth.signOut();location.replace('index.html')})

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
document.querySelectorAll('.utility-link').forEach(link=>link.addEventListener('click',closeMobileMenu))
window.addEventListener('resize',()=>{
  if(!isMobileMenuMode())closeMobileMenu()
  if(!window.matchMedia('(max-width:900px)').matches)readerPanel?.classList.remove('mobile-open')
})

let touchStartX=0,touchStartY=0,touchLastX=0,touchLastY=0,trackingHorizontalSwipe=false
const SWIPE_START_ZONE=Math.min(window.innerWidth*0.7,320)

document.addEventListener('touchstart',e=>{
  if(!isMobileMenuMode()||e.touches.length!==1)return

  const touch=e.touches[0]
  touchStartX=touch.clientX
  touchStartY=touch.clientY
  touchLastX=touchStartX
  touchLastY=touchStartY

  const readerOpen=readerPanel?.classList.contains('mobile-open')
  const sidebarOpen=mailSidebar?.classList.contains('mobile-open')
  const startedInLeftZone=touchStartX<=SWIPE_START_ZONE

  trackingHorizontalSwipe=readerOpen||sidebarOpen||startedInLeftZone
},{passive:true})

document.addEventListener('touchmove',e=>{
  if(!trackingHorizontalSwipe||e.touches.length!==1)return
  const touch=e.touches[0]
  touchLastX=touch.clientX
  touchLastY=touch.clientY
},{passive:true})

document.addEventListener('touchend',e=>{
  if(!trackingHorizontalSwipe)return

  const endTouch=e.changedTouches?.[0]
  const endX=endTouch?.clientX??touchLastX
  const endY=endTouch?.clientY??touchLastY
  const dx=endX-touchStartX
  const dy=endY-touchStartY

  const horizontalEnough=Math.abs(dx)>=60&&Math.abs(dx)>Math.abs(dy)*1.15

  if(horizontalEnough){
    const readerOpen=readerPanel?.classList.contains('mobile-open')
    const sidebarOpen=mailSidebar?.classList.contains('mobile-open')

    if(dx>0){
      if(readerOpen){
        closeMobileReader()
      }else if(!sidebarOpen){
        openMobileMenu()
      }
    }else if(dx<0&&sidebarOpen){
      closeMobileMenu()
    }
  }

  trackingHorizontalSwipe=false
},{passive:true})

renderReader();await loadAccounts()
