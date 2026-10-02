// Multi-mailbox patch for mail.js.
// Replace the existing account bootstrap/callMailFunction usage with this version,
// or use this file as a full replacement if your current UI element IDs match mail.html.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL='https://wfxuxrvygyzonkflpwoq.supabase.co'
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_e2h4t8AvCobzftt36UrDbw_NJGq8qlJ'
const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY)
const {data:{session}}=await supabase.auth.getSession()
if(!session?.user){location.replace('index.html');throw new Error('Not authenticated')}

let accounts=[],activeAccount=null,activeFolder='Inbox',activeMessageId=null,currentMessages=[]
const accountList=document.getElementById('accountList'),mailboxHeading=document.getElementById('mailboxHeading'),mailboxAddress=document.getElementById('mailboxAddress')
const messageList=document.getElementById('messageList'),readerPanel=document.getElementById('readerPanel'),searchInput=document.getElementById('searchInput'),composeModal=document.getElementById('composeModal'),composeFrom=document.getElementById('composeFrom')
const mobileMenuBtn=document.getElementById('mobileMenuBtn'),mobileMenuClose=document.getElementById('mobileMenuClose'),mobileMenuOverlay=document.getElementById('mobileMenuOverlay'),mailSidebar=document.getElementById('mailSidebar')
async function callMailFunction(payload){
  const {data:{session:s}}=await supabase.auth.getSession()
  const res=await fetch(`${SUPABASE_URL}/functions/v1/dflandscape-mail`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${s.access_token}`,'apikey':SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(payload)})
  const result=await res.json();if(!res.ok)throw new Error(result.error||'Mail request failed.');return result.data
}
async function loadAccounts(){
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
  try{const m=await callMailFunction({action:'get',folder:activeFolder,uid,mailbox_email:activeAccount.email});readerPanel.innerHTML=`<article class="reader reader-rich"><div class="eyebrow dark">Message</div><h2>${esc(m.subject||'(No subject)')}</h2><div class="reader-meta">From: ${esc(m.sender||m.from||'')}<br>To: ${esc(m.to||activeAccount.email)}<br>${esc(formatFullDate(m.date))}</div><div class="reader-body">${m.html||esc(m.body||'')}</div></article>`}catch(e){readerPanel.innerHTML=`<div class="empty-reader"><strong>Unable to open email</strong><span>${esc(e.message)}</span></div>`}
}
function renderReader(){if(readerPanel)readerPanel.innerHTML='<div class="empty-reader"><strong>Select an email</strong><span>Choose a message to read it here.</span></div>'}
function renderComposeAccounts(){if(composeFrom)composeFrom.innerHTML=accounts.map(a=>`<option value="${esc(a.email)}" ${activeAccount?.email===a.email?'selected':''}>${esc(a.email)}</option>`).join('')}
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
window.addEventListener('resize',()=>{if(!isMobileMenuMode())closeMobileMenu()})

let touchStartX=0,touchStartY=0,touchLastX=0,trackingEdgeSwipe=false
document.addEventListener('touchstart',e=>{
  if(!isMobileMenuMode()||e.touches.length!==1)return
  touchStartX=e.touches[0].clientX
  touchStartY=e.touches[0].clientY
  touchLastX=touchStartX
  trackingEdgeSwipe=touchStartX<=28||mailSidebar?.classList.contains('mobile-open')
},{passive:true})
document.addEventListener('touchmove',e=>{
  if(!trackingEdgeSwipe||e.touches.length!==1)return
  touchLastX=e.touches[0].clientX
},{passive:true})
document.addEventListener('touchend',e=>{
  if(!trackingEdgeSwipe)return
  const dx=touchLastX-touchStartX
  const dy=(e.changedTouches?.[0]?.clientY??touchStartY)-touchStartY
  if(Math.abs(dx)>=55&&Math.abs(dx)>Math.abs(dy)*1.2){
    if(dx>0&&touchStartX<=28)openMobileMenu()
    if(dx<0&&mailSidebar?.classList.contains('mobile-open'))closeMobileMenu()
  }
  trackingEdgeSwipe=false
},{passive:true})

renderReader();await loadAccounts()
