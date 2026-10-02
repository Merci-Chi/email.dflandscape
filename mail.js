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
let selectedIds=new Set(),selectionMode=false,longPressTimer=null
const accountList=document.getElementById('accountList'),mailboxHeading=document.getElementById('mailboxHeading'),mailboxAddress=document.getElementById('mailboxAddress')
const messageList=document.getElementById('messageList'),readerPanel=document.getElementById('readerPanel'),searchInput=document.getElementById('searchInput'),mailFilter=document.getElementById('mailFilter'),composeModal=document.getElementById('composeModal'),composeFrom=document.getElementById('composeFrom')
const composeTo=document.getElementById('composeTo'),composeCc=document.getElementById('composeCc'),composeBcc=document.getElementById('composeBcc'),composeSubject=document.getElementById('composeSubject'),composeBody=document.getElementById('composeBody'),composeDraftNote=document.getElementById('composeDraftNote')
let composeDirty=false,draftSaveTimer=null,composeOpenedFromDraft=false,composeMailboxBeforeChange=''
const mobileMenuBtn=document.getElementById('mobileMenuBtn'),mobileMenuClose=document.getElementById('mobileMenuClose'),mobileMenuOverlay=document.getElementById('mobileMenuOverlay'),mailSidebar=document.getElementById('mailSidebar')
const manageEmailsLink=document.getElementById('manageEmailsLink')
const bulkToolbar=document.getElementById('bulkToolbar'),bulkCount=document.getElementById('bulkCount'),bulkSelectAllBtn=document.getElementById('bulkSelectAllBtn')
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
  mailboxHeading.textContent=activeFolder==='Junk'?'Spam':activeFolder
  mailboxAddress.textContent=activeAccount.email
  messageList.innerHTML='<div class="empty-reader" style="height:220px"><strong>Loading mail...</strong></div>'
  try{
    currentMessages=await callMailFunction({action:'list',folder:activeFolder,mailbox_email:activeAccount.email})
    renderMessages()
    await loadUnreadCount()
  }catch(e){
    messageList.innerHTML=`<div class="empty-reader" style="height:220px"><strong>Unable to load mail</strong><span>${esc(e.message)}</span></div>`
  }
}
function filteredMessages(){
  const q=(searchInput?.value||'').trim().toLowerCase()
  const filter=mailFilter?.value||'all'
  return currentMessages.filter(m=>{
    if(activeFolder==='Starred'&&m.flagged!==true)return false
    if(q&&!`${m.sender} ${m.from} ${m.subject} ${m.to||''} ${m.cc||''}`.toLowerCase().includes(q))return false
    if(filter==='unread'&&m.seen!==false)return false
    if(filter==='starred'&&m.flagged!==true)return false
    if(filter==='attachments'&&m.hasAttachments!==true)return false
    return true
  })
}
function renderMessages(){
  const msgs=filteredMessages()
  messageList.innerHTML=msgs.length?msgs.map(m=>{
    const selected=selectedIds.has(String(m.uid))
    return `<div class="message-swipe-shell" data-shell-id="${esc(m.uid)}">
      <div class="swipe-action swipe-action-read">${m.seen===false?'Read':'Unread'}</div>
      <div class="swipe-action swipe-action-delete">Delete</div>
      <div class="message-row-wrap ${m.seen===false?'unread':''} ${selected?'selected':''}" data-wrap-id="${esc(m.uid)}">
        <button class="message-select ${selectionMode?'show':''}" data-select-id="${esc(m.uid)}" type="button" aria-label="${selected?'Deselect':'Select'} message">
          <span class="selection-dot">${selected?'✓':''}</span>
        </button>
        <button class="message-star ${m.flagged?'active':''}" data-star-id="${esc(m.uid)}" type="button" aria-label="${m.flagged?'Unstar':'Star'} message">★</button>
        <button class="message-row ${m.seen===false?'unread':''}" data-id="${esc(m.uid)}">
          <span class="sender">${esc(m.sender||m.from)}</span>
          <span class="time">${esc(formatDate(m.date))}</span>
          <span class="subject">${esc(m.subject||'(No subject)')}</span>
          <span class="snippet">${esc(m.from||'')}</span>
        </button>
      </div>
    </div>`
  }).join(''):'<div class="empty-reader" style="height:220px"><strong>No messages</strong><span>This folder is empty.</span></div>'

  messageList.querySelectorAll('[data-id]').forEach(r=>r.onclick=e=>{
    if(selectionMode){e.preventDefault();toggleSelected(r.dataset.id);return}
    loadMessage(r.dataset.id)
  })
  messageList.querySelectorAll('[data-star-id]').forEach(btn=>btn.onclick=async e=>{e.stopPropagation();if(selectionMode){toggleSelected(btn.dataset.starId);return}await toggleMessageFlag(btn.dataset.starId)})
  messageList.querySelectorAll('[data-select-id]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();toggleSelected(btn.dataset.selectId)})
  attachLongPressHandlers()
  attachMessageSwipeHandlers()
  updateBulkToolbar()
}

function visibleMessageIds(){
  return filteredMessages().map(m=>String(m.uid))
}
function messageFolder(uid){
  const row=currentMessages.find(x=>String(x.uid)===String(uid))
  return row?.sourceFolder||activeFolder
}
async function loadUnreadCount(){
  const badge=document.getElementById('inboxUnreadCount')
  if(!badge||!activeAccount)return
  try{
    const counts=await callMailFunction({action:'counts',mailbox_email:activeAccount.email})
    const count=Number(counts?.Inbox||0)
    badge.textContent=String(count)
    badge.hidden=count<1
  }catch{}
}
function enterSelectionMode(uid){
  selectionMode=true
  if(uid)selectedIds.add(String(uid))
  renderMessages()
}
function exitSelectionMode(){
  selectionMode=false
  selectedIds.clear()
  renderMessages()
}
function toggleSelected(uid){
  const id=String(uid)
  selectionMode=true
  if(selectedIds.has(id))selectedIds.delete(id)
  else selectedIds.add(id)
  if(!selectedIds.size)selectionMode=false
  renderMessages()
}
function updateBulkToolbar(){
  if(!bulkToolbar)return
  bulkToolbar.hidden=!selectionMode
  if(bulkCount)bulkCount.textContent=`${selectedIds.size} selected`
  if(bulkSelectAllBtn){
    const ids=visibleMessageIds()
    bulkSelectAllBtn.textContent=ids.length&&ids.every(id=>selectedIds.has(id))?'Clear all':'Select all'
  }
}
function attachLongPressHandlers(){
  messageList.querySelectorAll('[data-wrap-id]').forEach(wrap=>{
    const uid=wrap.dataset.wrapId
    let moved=false
    wrap.addEventListener('touchstart',()=>{
      moved=false
      clearTimeout(longPressTimer)
      longPressTimer=setTimeout(()=>{if(!moved)enterSelectionMode(uid)},500)
    },{passive:true})
    wrap.addEventListener('touchmove',()=>{moved=true;clearTimeout(longPressTimer)},{passive:true})
    wrap.addEventListener('touchend',()=>clearTimeout(longPressTimer),{passive:true})
    wrap.addEventListener('touchcancel',()=>clearTimeout(longPressTimer),{passive:true})
  })
}
function attachMessageSwipeHandlers(){
  messageList.querySelectorAll('[data-shell-id]').forEach(shell=>{
    let sx=0,sy=0,lx=0,ly=0,tracking=false
    const row=shell.querySelector('.message-row-wrap')
    shell.addEventListener('touchstart',e=>{
      if(selectionMode||e.touches.length!==1)return
      const t=e.touches[0];sx=lx=t.clientX;sy=ly=t.clientY;tracking=true
    },{passive:true})
    shell.addEventListener('touchmove',e=>{
      if(!tracking||e.touches.length!==1)return
      const t=e.touches[0];lx=t.clientX;ly=t.clientY
      const dx=lx-sx,dy=ly-sy
      if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)){
        row.style.transform=`translateX(${Math.max(-88,Math.min(88,dx))}px)`
      }
    },{passive:true})
    shell.addEventListener('touchend',async e=>{
      if(!tracking)return
      tracking=false
      const t=e.changedTouches?.[0],dx=(t?.clientX??lx)-sx,dy=(t?.clientY??ly)-sy
      row.style.transform=''
      if(Math.abs(dx)<65||Math.abs(dx)<=Math.abs(dy)*1.15)return
      const uid=shell.dataset.shellId
      if(dx>0){
        const m=currentMessages.find(x=>String(x.uid)===String(uid))
        const action=m?.seen===false?'mark_read':'mark_unread'
        try{await setMessageState(action,uid);if(m)m.seen=action==='mark_read';renderMessages()}catch(err){alert(err.message||'Unable to update message.')}
      }else{
        const source=messageFolder(uid)
        if(source==='Trash'){
          if(!confirm('Permanently delete this email?'))return
        }
        try{await callMailFunction({action:'delete',folder:source,uid,mailbox_email:activeAccount.email});currentMessages=currentMessages.filter(x=>String(x.uid)!==String(uid));selectedIds.delete(String(uid));renderMessages()}catch(err){alert(err.message||'Unable to delete email.')}
      }
    },{passive:true})
  })
}
async function runBulkAction(action){
  const ids=[...selectedIds]
  if(!ids.length)return
  const permanent=action==='delete'&&ids.every(uid=>messageFolder(uid)==='Trash')
  if(action==='delete'&&!confirm(permanent?'Permanently delete selected emails?':'Move selected emails to Trash?'))return
  setBulkBusy(true)
  try{
    for(const uid of ids){
      await callMailFunction({action,folder:messageFolder(uid),uid,mailbox_email:activeAccount.email})
      const row=currentMessages.find(x=>String(x.uid)===String(uid))
      if(action==='mark_read'&&row)row.seen=true
      if(action==='mark_unread'&&row)row.seen=false
      if(action==='star'&&row)row.flagged=true
      if(action==='unstar'&&row)row.flagged=false
      if(action==='delete'||action==='archive')currentMessages=currentMessages.filter(x=>String(x.uid)!==String(uid))
    }
    exitSelectionMode()
  }catch(error){
    alert(error.message||'Unable to update selected emails.')
    renderMessages()
  }finally{setBulkBusy(false)}
}
function setBulkBusy(busy){
  bulkToolbar?.querySelectorAll('button').forEach(btn=>btn.disabled=busy)
}

async function loadMessage(uid){
  try{
    activeMessageId=uid
    const sourceFolder=messageFolder(uid)
    const m=await callMailFunction({action:'get',folder:sourceFolder,uid,mailbox_email:activeAccount.email})
    m.sourceFolder=sourceFolder
    activeMessage=m
    readerPanel.innerHTML=`<article class="reader reader-rich">
      <button class="mobile-reader-back" id="mobileReaderBack" type="button">← Back to ${esc(activeFolder)}</button>
      <div class="message-actions">
        <button type="button" class="message-action-btn" id="replyMessageBtn">Reply</button>
        <button type="button" class="message-action-btn" id="replyAllMessageBtn">Reply all</button>
        <button type="button" class="message-action-btn" id="forwardMessageBtn">Forward</button>
        <button type="button" class="message-action-btn" id="readMessageBtn">${m.seen===false?'Mark read':'Mark unread'}</button>
        <button type="button" class="message-action-btn" id="starMessageBtn">${m.flagged?'Unstar':'Star'}</button>
        ${sourceFolder!=='Trash'?'<button type="button" class="message-action-btn" id="archiveMessageBtn">Archive</button>':''}
        ${sourceFolder!=='Junk'?'<button type="button" class="message-action-btn" id="spamMessageBtn">Spam</button>':''}
        <select class="message-move-select" id="moveMessageSelect" aria-label="Move message"><option value="">Move to…</option><option value="Inbox">Inbox</option><option value="Archive">Archive</option><option value="Junk">Spam</option><option value="Trash">Trash</option></select>
        <button type="button" class="message-action-btn danger" id="deleteMessageBtn">${sourceFolder==='Trash'?'Delete forever':'Delete'}</button>
      </div>
      <div class="eyebrow dark">Message</div>
      <h2>${esc(m.subject||'(No subject)')}</h2>
      <div class="reader-meta">From: ${esc(m.sender||m.from||'')}<br>To: ${esc(m.to||activeAccount.email)}<br>${esc(formatFullDate(m.date))}</div>
      <div class="reader-body">${m.html||esc(m.body||'')}</div>
    </article>`
    document.getElementById('replyMessageBtn')?.addEventListener('click',()=>openReplyComposer(m))
    document.getElementById('replyAllMessageBtn')?.addEventListener('click',()=>openReplyAllComposer(m))
    document.getElementById('forwardMessageBtn')?.addEventListener('click',()=>openForwardComposer(m))
    document.getElementById('readMessageBtn')?.addEventListener('click',()=>toggleActiveReadState())
    document.getElementById('starMessageBtn')?.addEventListener('click',()=>toggleActiveStar())
    document.getElementById('archiveMessageBtn')?.addEventListener('click',archiveActiveMessage)
    document.getElementById('spamMessageBtn')?.addEventListener('click',()=>moveActiveMessage('Junk'))
    document.getElementById('moveMessageSelect')?.addEventListener('change',e=>{if(e.target.value)moveActiveMessage(e.target.value)})
    document.getElementById('deleteMessageBtn')?.addEventListener('click',deleteActiveMessage)
    if(m.seen===false){
      callMailFunction({action:'mark_read',folder:sourceFolder,uid,mailbox_email:activeAccount.email}).then(()=>{
        const row=currentMessages.find(x=>String(x.uid)===String(uid));if(row)row.seen=true;renderMessages()
      }).catch(()=>{})
    }
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

function signaturesMap(){
  const value=session.user.user_metadata?.email_signatures
  return value&&typeof value==='object'&&!Array.isArray(value)?value:{}
}
function getSignature(mailbox=composeFrom?.value||activeAccount?.email||''){
  return String(signaturesMap()[mailbox]||'').trim()
}
function appendSignature(body='',mailbox=composeFrom?.value||activeAccount?.email||''){
  const signature=getSignature(mailbox)
  if(!signature)return body
  const clean=String(body||'')
  if(clean.includes(signature))return clean
  return clean?`${clean}\n\n-- \n${signature}`:`-- \n${signature}`
}
function draftKey(mailbox=composeFrom?.value||activeAccount?.email||''){
  return `dfl_email_draft_v1:${session.user.id}:${mailbox||'default'}`
}
function currentDraft(){
  return {
    from:composeFrom?.value||'',
    to:composeTo?.value||'',
    cc:composeCc?.value||'',
    bcc:composeBcc?.value||'',
    subject:composeSubject?.value||'',
    body:composeBody?.value||''
  }
}
function draftHasContent(draft=currentDraft()){
  return [draft.to,draft.cc,draft.bcc,draft.subject,draft.body].some(v=>String(v||'').trim())
}
function saveDraftNow(){
  if(!composeModal||composeModal.classList.contains('hidden'))return
  const draft=currentDraft()
  if(draftHasContent(draft)){
    localStorage.setItem(draftKey(draft.from),JSON.stringify({...draft,saved_at:new Date().toISOString()}))
    if(composeDraftNote)composeDraftNote.textContent='Draft saved'
  }else{
    localStorage.removeItem(draftKey(draft.from))
    if(composeDraftNote)composeDraftNote.textContent=''
  }
}
function scheduleDraftSave(){
  composeDirty=true
  if(composeDraftNote)composeDraftNote.textContent='Saving draft…'
  clearTimeout(draftSaveTimer)
  draftSaveTimer=setTimeout(()=>{saveDraftNow();composeDirty=false},450)
}
function clearDraft(mailbox=composeFrom?.value||activeAccount?.email||''){
  localStorage.removeItem(draftKey(mailbox))
  composeDirty=false
  if(composeDraftNote)composeDraftNote.textContent=''
}
function restoreDraft(mailbox=composeFrom?.value||activeAccount?.email||''){
  try{
    const raw=localStorage.getItem(draftKey(mailbox))
    if(!raw)return false
    const draft=JSON.parse(raw)
    if(composeTo)composeTo.value=draft.to||''
    if(composeCc)composeCc.value=draft.cc||''
    if(composeBcc)composeBcc.value=draft.bcc||''
    if(composeSubject)composeSubject.value=draft.subject||''
    if(composeBody)composeBody.value=draft.body||''
    if(draft.cc)document.getElementById('ccRow')?.classList.remove('hidden')
    if(draft.bcc)document.getElementById('bccRow')?.classList.remove('hidden')
    if(composeDraftNote)composeDraftNote.textContent='Draft restored'
    composeOpenedFromDraft=true
    return true
  }catch{return false}
}
function openNewComposer(){
  renderComposeAccounts()
  if(composeFrom&&activeAccount)composeFrom.value=activeAccount.email
  composeOpenedFromDraft=false
  composeModal?.classList.remove('hidden')
  closeMobileMenu()
  const restored=restoreDraft()
  if(!restored){
    document.getElementById('composeForm')?.reset()
    renderComposeAccounts()
    if(composeFrom&&activeAccount)composeFrom.value=activeAccount.email
    if(composeBody)composeBody.value=appendSignature('',composeFrom?.value)
  }
  setTimeout(()=>composeTo?.focus(),50)
}
function setComposeValues({to='',cc='',bcc='',subject='',body=''}={}){
  renderComposeAccounts()
  if(composeFrom&&activeAccount)composeFrom.value=activeAccount.email
  if(composeTo)composeTo.value=to
  if(composeCc)composeCc.value=cc
  if(composeBcc)composeBcc.value=bcc
  if(composeSubject)composeSubject.value=subject
  if(composeBody)composeBody.value=appendSignature(body,composeFrom?.value)
  if(cc)document.getElementById('ccRow')?.classList.remove('hidden')
  if(bcc)document.getElementById('bccRow')?.classList.remove('hidden')
  composeOpenedFromDraft=false
  composeDirty=true
  composeModal?.classList.remove('hidden')
  closeMobileMenu()
  scheduleDraftSave()
  setTimeout(()=>composeBody?.focus(),50)
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
function cleanAddressList(value=''){
  return String(value).split(',').map(v=>v.trim()).filter(Boolean)
}
function openReplyComposer(message){
  setComposeValues({
    to:message.replyTo||message.from||'',
    subject:replySubject(message.subject),
    body:quotedText(message)
  })
}
function openReplyAllComposer(message){
  const own=(activeAccount?.email||'').toLowerCase()
  const sender=message.replyTo||message.from||''
  const ccCandidates=[...cleanAddressList(message.to),...cleanAddressList(message.cc)]
    .filter(v=>v&&v.toLowerCase()!==own&&v.toLowerCase()!==sender.toLowerCase())
  setComposeValues({
    to:sender,
    cc:[...new Set(ccCandidates)].join(', '),
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

async function setMessageState(action,uid=activeMessageId){
  if(!uid||!activeAccount)return
  await callMailFunction({action,folder:messageFolder(uid),uid,mailbox_email:activeAccount.email})
}
async function toggleMessageFlag(uid){
  const row=currentMessages.find(x=>String(x.uid)===String(uid))
  const next=!(row?.flagged===true)
  try{
    await setMessageState(next?'star':'unstar',uid)
    if(row)row.flagged=next
    if(activeMessage&&String(activeMessage.uid)===String(uid))activeMessage.flagged=next
    renderMessages()
  }catch(error){alert(error.message||'Unable to update star.')}
}
async function toggleActiveStar(){
  if(!activeMessage)return
  const next=!activeMessage.flagged
  try{
    await setMessageState(next?'star':'unstar')
    activeMessage.flagged=next
    const row=currentMessages.find(x=>String(x.uid)===String(activeMessageId));if(row)row.flagged=next
    const btn=document.getElementById('starMessageBtn');if(btn)btn.textContent=next?'Unstar':'Star'
    renderMessages()
  }catch(error){alert(error.message||'Unable to update star.')}
}
async function toggleActiveReadState(){
  if(!activeMessage)return
  const markRead=activeMessage.seen===false
  try{
    await setMessageState(markRead?'mark_read':'mark_unread')
    activeMessage.seen=markRead
    const row=currentMessages.find(x=>String(x.uid)===String(activeMessageId));if(row)row.seen=markRead
    const btn=document.getElementById('readMessageBtn');if(btn)btn.textContent=markRead?'Mark unread':'Mark read'
    renderMessages()
  }catch(error){alert(error.message||'Unable to update read status.')}
}
async function archiveActiveMessage(){
  if(!activeMessageId||!activeAccount)return
  const btn=document.getElementById('archiveMessageBtn')
  if(btn){btn.disabled=true;btn.textContent='Archiving…'}
  try{
    await setMessageState('archive')
    closeMobileReader();renderReader();await loadMessages()
  }catch(error){
    alert(error.message||'Unable to archive email.')
    if(btn){btn.disabled=false;btn.textContent='Archive'}
  }
}

async function moveActiveMessage(target){
  if(!activeMessageId||!activeAccount||!target)return
  try{
    await callMailFunction({action:'move',folder:messageFolder(activeMessageId),target,uid:activeMessageId,mailbox_email:activeAccount.email})
    closeMobileReader();renderReader();await loadMessages()
  }catch(error){alert(error.message||'Unable to move email.')}
}
async function runBulkMove(target){
  const ids=[...selectedIds]
  if(!ids.length||!target)return
  setBulkBusy(true)
  try{
    for(const uid of ids){
      await callMailFunction({action:'move',folder:messageFolder(uid),target,uid,mailbox_email:activeAccount.email})
      currentMessages=currentMessages.filter(x=>String(x.uid)!==String(uid))
    }
    exitSelectionMode()
    await loadUnreadCount()
  }catch(error){
    alert(error.message||'Unable to move selected emails.')
    renderMessages()
  }finally{setBulkBusy(false)}
}

async function deleteActiveMessage(){
  if(!activeMessageId||!activeAccount)return
  const sourceFolder=messageFolder(activeMessageId)
  const permanent=sourceFolder==='Trash'
  if(!confirm(permanent?'Permanently delete this email? This cannot be undone.':'Move this email to Trash?'))return
  const button=document.getElementById('deleteMessageBtn')
  if(button){button.disabled=true;button.textContent=permanent?'Deleting…':'Moving…'}
  try{
    await callMailFunction({action:'delete',folder:sourceFolder,uid:activeMessageId,mailbox_email:activeAccount.email})
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
mailFilter?.addEventListener('change',renderMessages)
document.getElementById('bulkCloseBtn')?.addEventListener('click',exitSelectionMode)
document.getElementById('bulkSelectAllBtn')?.addEventListener('click',()=>{
  const ids=visibleMessageIds()
  const allSelected=ids.length&&ids.every(id=>selectedIds.has(id))
  if(allSelected)ids.forEach(id=>selectedIds.delete(id));else ids.forEach(id=>selectedIds.add(id))
  selectionMode=selectedIds.size>0
  renderMessages()
})
document.getElementById('bulkReadBtn')?.addEventListener('click',()=>runBulkAction('mark_read'))
document.getElementById('bulkUnreadBtn')?.addEventListener('click',()=>runBulkAction('mark_unread'))
document.getElementById('bulkStarBtn')?.addEventListener('click',()=>runBulkAction('star'))
document.getElementById('bulkUnstarBtn')?.addEventListener('click',()=>runBulkAction('unstar'))
document.getElementById('bulkArchiveBtn')?.addEventListener('click',()=>runBulkAction('archive'))
document.getElementById('bulkSpamBtn')?.addEventListener('click',()=>runBulkMove('Junk'))
document.getElementById('bulkMoveSelect')?.addEventListener('change',e=>{if(e.target.value){runBulkMove(e.target.value);e.target.value=''}})
document.getElementById('bulkDeleteBtn')?.addEventListener('click',()=>runBulkAction('delete'))
document.querySelectorAll('.folder').forEach(btn=>btn.addEventListener('click',async()=>{
  activeFolder=btn.dataset.folder||'Inbox'
  selectedIds.clear();selectionMode=false
  document.querySelectorAll('.folder').forEach(x=>x.classList.toggle('active',x===btn))
  if(mailFilter)mailFilter.value='all'
  await loadMessages()
  renderReader()
  closeMobileMenu()
}))
document.getElementById('refreshBtn')?.addEventListener('click',loadMessages)
document.getElementById('composeBtn')?.addEventListener('click',openNewComposer)

function closeComposeSafely(){
  saveDraftNow()
  if(composeDirty&&draftHasContent()&&!confirm('Close this message? Your draft is saved and can be restored later.'))return
  composeModal?.classList.add('hidden')
}
document.getElementById('closeCompose')?.addEventListener('click',closeComposeSafely)

document.getElementById('showCcBtn')?.addEventListener('click',()=>{document.getElementById('ccRow')?.classList.toggle('hidden');if(!document.getElementById('ccRow')?.classList.contains('hidden'))composeCc?.focus()})
document.getElementById('showBccBtn')?.addEventListener('click',()=>{document.getElementById('bccRow')?.classList.toggle('hidden');if(!document.getElementById('bccRow')?.classList.contains('hidden'))composeBcc?.focus()})

;[composeTo,composeCc,composeBcc,composeSubject,composeBody].forEach(el=>el?.addEventListener('input',scheduleDraftSave))
composeFrom?.addEventListener('focus',()=>{composeMailboxBeforeChange=composeFrom.value})
composeFrom?.addEventListener('change',()=>{
  if(composeMailboxBeforeChange&&draftHasContent()){
    const draft=currentDraft()
    localStorage.setItem(draftKey(composeMailboxBeforeChange),JSON.stringify({...draft,from:composeMailboxBeforeChange,saved_at:new Date().toISOString()}))
  }
  composeMailboxBeforeChange=composeFrom.value
  if(!composeOpenedFromDraft&&composeBody&&!composeBody.value.trim())composeBody.value=appendSignature('',composeFrom.value)
  scheduleDraftSave()
})

document.getElementById('composeForm')?.addEventListener('submit',async e=>{
  e.preventDefault()
  const status=document.getElementById('composeStatus')
  status.textContent='Sending...'
  try{
    await callMailFunction({
      action:'send',
      mailbox_email:composeFrom.value,
      to:composeTo.value.trim(),
      cc:composeCc?.value.trim()||'',
      bcc:composeBcc?.value.trim()||'',
      subject:composeSubject.value.trim(),
      body:composeBody.value
    })
    rememberRecipients([composeTo.value,composeCc?.value,composeBcc?.value].join(','))
    clearDraft(composeFrom.value)
    status.textContent='Sent.'
    e.target.reset()
    document.getElementById('ccRow')?.classList.add('hidden')
    document.getElementById('bccRow')?.classList.add('hidden')
    setTimeout(()=>composeModal.classList.add('hidden'),700)
  }catch(err){status.textContent=err.message||'Unable to send.'}
})
document.querySelector('.signout')?.addEventListener('click',async e=>{e.preventDefault();await supabase.auth.signOut();location.replace('index.html')})


function normalizeAddressToken(value=''){
  const match=String(value).match(/<([^<>\s]+@[^<>\s]+)>/)
  return (match?.[1]||String(value)).trim().toLowerCase()
}
function knownRecipients(){
  const set=new Set()
  accounts.forEach(a=>set.add(a.email))
  currentMessages.forEach(m=>[m.from,m.sender,m.to,m.cc].forEach(v=>cleanAddressList(v||'').forEach(x=>{const n=normalizeAddressToken(x);if(n.includes('@'))set.add(n)})))
  try{JSON.parse(localStorage.getItem('dfl_email_recent_recipients')||'[]').forEach(v=>set.add(v))}catch{}
  set.delete((activeAccount?.email||'').toLowerCase())
  return [...set].filter(Boolean)
}
function rememberRecipients(value=''){
  const incoming=cleanAddressList(value).map(normalizeAddressToken).filter(v=>v.includes('@'))
  let saved=[]
  try{saved=JSON.parse(localStorage.getItem('dfl_email_recent_recipients')||'[]')}catch{}
  localStorage.setItem('dfl_email_recent_recipients',JSON.stringify([...new Set([...incoming,...saved])].slice(0,50)))
}
function wireRecipientAutocomplete(input,suggestions){
  if(!input||!suggestions)return
  const update=()=>{
    const pieces=input.value.split(',')
    const query=pieces.pop().trim().toLowerCase()
    if(!query){suggestions.hidden=true;suggestions.innerHTML='';return}
    const matches=knownRecipients().filter(v=>v.toLowerCase().includes(query)).slice(0,8)
    if(!matches.length){suggestions.hidden=true;suggestions.innerHTML='';return}
    suggestions.innerHTML=matches.map(v=>`<button type="button" data-email="${esc(v)}">${esc(v)}</button>`).join('')
    suggestions.hidden=false
    suggestions.querySelectorAll('[data-email]').forEach(btn=>btn.addEventListener('click',()=>{
      const prefix=pieces.map(v=>v.trim()).filter(Boolean)
      input.value=[...prefix,btn.dataset.email].join(', ')+(prefix.length||btn.dataset.email?', ':'')
      suggestions.hidden=true
      input.focus()
      scheduleDraftSave()
    }))
  }
  input.addEventListener('input',update)
  input.addEventListener('focus',update)
  input.addEventListener('blur',()=>setTimeout(()=>{suggestions.hidden=true},160))
}
wireRecipientAutocomplete(composeTo,document.getElementById('toSuggestions'))
wireRecipientAutocomplete(composeCc,document.getElementById('ccSuggestions'))
wireRecipientAutocomplete(composeBcc,document.getElementById('bccSuggestions'))

window.addEventListener('beforeunload',e=>{
  if(composeModal&&!composeModal.classList.contains('hidden')&&draftHasContent()){
    saveDraftNow()
    e.preventDefault()
    e.returnValue=''
  }
})

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

  const insideMessageRow=!!e.target.closest?.('.message-swipe-shell')
  trackingHorizontalSwipe=!insideMessageRow&&(readerOpen||sidebarOpen||startedInLeftZone)
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
