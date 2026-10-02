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
let mailPage=0,mailPageSize=50,mailHasMore=false,mailLoading=false,searchTimer=null,pendingMailReload=false
const accountList=document.getElementById('accountList'),mailboxHeading=document.getElementById('mailboxHeading'),mailboxAddress=document.getElementById('mailboxAddress')
const messageList=document.getElementById('messageList'),readerPanel=document.getElementById('readerPanel'),searchInput=document.getElementById('searchInput'),mailFilter=document.getElementById('mailFilter'),mailSort=document.getElementById('mailSort'),loadMoreWrap=document.getElementById('loadMoreWrap'),loadMoreBtn=document.getElementById('loadMoreBtn'),pullRefreshIndicator=document.getElementById('pullRefreshIndicator'),composeModal=document.getElementById('composeModal'),composeFrom=document.getElementById('composeFrom')
const composeTo=document.getElementById('composeTo'),composeCc=document.getElementById('composeCc'),composeBcc=document.getElementById('composeBcc'),composeSubject=document.getElementById('composeSubject'),composeBody=document.getElementById('composeBody'),composeDraftNote=document.getElementById('composeDraftNote')
const composeAttachmentInput=document.getElementById('composeAttachmentInput'),composeAttachmentList=document.getElementById('composeAttachmentList'),attachmentPreviewModal=document.getElementById('attachmentPreviewModal'),attachmentPreviewBody=document.getElementById('attachmentPreviewBody'),attachmentPreviewTitle=document.getElementById('attachmentPreviewTitle')
let composeAttachments=[]
let composeDirty=false,draftSaveTimer=null,composeOpenedFromDraft=false,composeMailboxBeforeChange=''
const mobileMenuBtn=document.getElementById('mobileMenuBtn'),mobileMenuClose=document.getElementById('mobileMenuClose'),mobileMenuOverlay=document.getElementById('mobileMenuOverlay'),mailSidebar=document.getElementById('mailSidebar')
const manageEmailsLink=document.getElementById('manageEmailsLink')
const bulkToolbar=document.getElementById('bulkToolbar'),bulkCount=document.getElementById('bulkCount'),bulkSelectAllBtn=document.getElementById('bulkSelectAllBtn'),headerSelectAllBtn=document.getElementById('headerSelectAllBtn')
const networkBanner=document.getElementById('networkBanner')
const NOTIFY_ENABLED_KEY='dfl_email_notifications_enabled',NOTIFY_SOUND_KEY='dfl_email_notification_sound'
let backgroundCheckTimer=null,mailRules=[],snoozedMessageKeys=new Set(),pendingUndoTimer=null,pendingUndoPayload=null

function normalizeThreadSubject(subject=''){
  return String(subject||'(No subject)')
    .replace(/^\s*((re|fwd?|fw):\s*)+/i,'')
    .trim()
    .toLowerCase()
}
function snoozedKey(mailbox,folder,uid){
  return `${mailbox}|${folder}|${uid}`
}
async function loadSnoozedState(){
  snoozedMessageKeys=new Set()
  if(!activeAccount)return
  const now=new Date().toISOString()
  try{
    await supabase
      .from('dflandscape_snoozed_mail')
      .delete()
      .eq('user_id',session.user.id)
      .lte('snooze_until',now)

    const {data,error}=await supabase
      .from('dflandscape_snoozed_mail')
      .select('mailbox_email,folder,uid,snooze_until')
      .eq('user_id',session.user.id)
      .eq('mailbox_email',activeAccount.email)
      .gt('snooze_until',now)

    if(error)throw error
    ;(data||[]).forEach(row=>snoozedMessageKeys.add(snoozedKey(row.mailbox_email,row.folder,row.uid)))
  }catch(error){
    console.error('Unable to load snoozed mail',error)
  }
}
function snoozeDateFromChoice(choice){
  const now=new Date()
  if(choice==='1h')return new Date(now.getTime()+60*60*1000)
  if(choice==='3d')return new Date(now.getTime()+3*24*60*60*1000)
  if(choice==='1w')return new Date(now.getTime()+7*24*60*60*1000)
  if(choice==='tomorrow'){
    const d=new Date(now)
    d.setDate(d.getDate()+1)
    d.setHours(9,0,0,0)
    return d
  }
  return null
}
async function snoozeActiveMessage(choice){
  if(!activeMessage||!activeAccount)return
  const until=snoozeDateFromChoice(choice)
  if(!until)return
  const folder=activeMessage.sourceFolder||messageFolder(activeMessage.uid)||activeFolder
  const payload={
    user_id:session.user.id,
    mailbox_email:activeAccount.email,
    folder,
    uid:String(activeMessage.uid),
    subject:activeMessage.subject||'',
    sender:activeMessage.from||activeMessage.sender||'',
    snooze_until:until.toISOString()
  }
  const {error}=await supabase.from('dflandscape_snoozed_mail').upsert(payload,{onConflict:'user_id,mailbox_email,folder,uid'})
  if(error){alert(error.message||'Unable to snooze email.');return}
  snoozedMessageKeys.add(snoozedKey(activeAccount.email,folder,activeMessage.uid))
  currentMessages=currentMessages.filter(m=>String(m.uid)!==String(activeMessage.uid))
  closeMobileReader()
  renderReader()
  renderMessages()
}
async function loadMailRulesForUser(){
  try{
    const {data,error}=await supabase
      .from('dflandscape_mail_rules')
      .select('*')
      .eq('user_id',session.user.id)
      .eq('enabled',true)
    if(error)throw error
    mailRules=data||[]
  }catch(error){
    console.error('Unable to load mail rules',error)
    mailRules=[]
  }
}
function ruleMatches(rule,message,mailbox){
  if(rule.mailbox_email&&String(rule.mailbox_email).toLowerCase()!==String(mailbox).toLowerCase())return false
  const source=rule.field==='subject'?String(message.subject||''):String(message.from||message.sender||'')
  const wanted=String(rule.match_value||'')
  if(rule.operator==='equals')return source.trim().toLowerCase()===wanted.trim().toLowerCase()
  return source.toLowerCase().includes(wanted.toLowerCase())
}
async function applyRulesToMessages(mailbox,messages){
  if(!mailRules.length||!messages?.length)return
  for(const message of messages){
    for(const rule of mailRules){
      if(!ruleMatches(rule,message,mailbox))continue
      try{
        const base={mailbox_email:mailbox,folder:'Inbox',uid:String(message.uid)}
        if(rule.action==='mark_read')await callMailFunction({action:'mark_read',...base})
        if(rule.action==='star')await callMailFunction({action:'star',...base})
        if(rule.action==='archive')await callMailFunction({action:'archive',...base})
        if(rule.action==='junk')await callMailFunction({action:'move',target:'Junk',...base})
      }catch(error){console.error('Mail rule failed',rule?.name,error)}
    }
  }
}
function composeSendPayload(){
  return {
    mailbox_email:composeFrom.value,
    to:composeTo.value.trim(),
    cc:composeCc?.value.trim()||'',
    bcc:composeBcc?.value.trim()||'',
    subject:composeSubject.value.trim(),
    body:composeBody.value,
    attachments:composeAttachments.map(a=>({
      filename:safeAttachmentName(a.filename),
      mimeType:a.mimeType||'application/octet-stream',
      size:Number(a.size)||0,
      base64:a.base64||String(a.dataUrl||'').split(',')[1]||''
    }))
  }
}
function resetComposeAfterQueuedSend(payload){
  rememberRecipients([payload.to,payload.cc,payload.bcc].join(','))
  clearDraft(payload.mailbox_email)
  composeAttachments=[]
  renderComposeAttachments()
  document.getElementById('composeForm')?.reset()
  document.getElementById('ccRow')?.classList.add('hidden')
  document.getElementById('bccRow')?.classList.add('hidden')
  composeModal?.classList.add('hidden')
}
async function sendPendingUndoMessage(){
  if(!pendingUndoPayload)return
  const payload=pendingUndoPayload
  pendingUndoPayload=null
  clearTimeout(pendingUndoTimer)
  pendingUndoTimer=null

  const toast=document.getElementById('undoSendToast')

  try{
    await callMailFunction({action:'send',...payload})
    if(toast){
      toast.querySelector('span').textContent='Sent.'
      setTimeout(()=>toast.hidden=true,1400)
    }
  }catch(error){
    if(toast){
      toast.querySelector('span').textContent='Unable to send.'
      setTimeout(()=>toast.hidden=true,2200)
    }
    alert(error?.message||'Unable to send email.')
  }
}
function queueUndoSend(){
  const payload=composeSendPayload()
  if(!payload.to&&!payload.cc&&!payload.bcc)throw new Error('Enter at least one recipient.')

  pendingUndoPayload=payload
  resetComposeAfterQueuedSend(payload)

  const toast=document.getElementById('undoSendToast')
  if(toast){
    toast.querySelector('span').textContent='Email will send in 7 seconds.'
    toast.hidden=false
  }

  clearTimeout(pendingUndoTimer)
  pendingUndoTimer=setTimeout(sendPendingUndoMessage,7000)
}
function undoPendingSend(){
  if(!pendingUndoPayload)return
  clearTimeout(pendingUndoTimer)
  pendingUndoTimer=null
  pendingUndoPayload=null

  const toast=document.getElementById('undoSendToast')
  if(toast){
    toast.querySelector('span').textContent='Send cancelled.'
    setTimeout(()=>toast.hidden=true,1400)
  }
}

async function callMailFunction(payload){
  const {data:{session:s}}=await supabase.auth.getSession()
  const res=await fetch(`${SUPABASE_URL}/functions/v1/dflandscape-mail`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${s.access_token}`,'apikey':SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(payload)})
  const result=await res.json();if(!res.ok)throw new Error(result.error||'Mail request failed.');return result.data
}

function mailboxSnapshotKey(mailbox,folder){
  return `dfl_mail_snapshot_v1:${session.user.id}:${mailbox}:${folder}`
}
function saveMailboxSnapshot(){
  if(!activeAccount||!currentMessages.length)return
  if((searchInput?.value||'').trim())return
  try{
    localStorage.setItem(mailboxSnapshotKey(activeAccount.email,activeFolder),JSON.stringify({
      messages:currentMessages,
      hasMore:mailHasMore,
      savedAt:new Date().toISOString()
    }))
  }catch{}
}
function restoreMailboxSnapshot(){
  if(!activeAccount)return false
  try{
    const raw=localStorage.getItem(mailboxSnapshotKey(activeAccount.email,activeFolder))
    if(!raw)return false
    const cached=JSON.parse(raw)
    if(!Array.isArray(cached.messages))return false
    currentMessages=cached.messages
    mailHasMore=cached.hasMore===true
    renderMessages()
    updateLoadMore()
    return true
  }catch{return false}
}
function updateNetworkBanner(){
  if(!networkBanner)return
  networkBanner.hidden=navigator.onLine
  networkBanner.textContent=navigator.onLine?'':'You’re offline. Showing the last saved mailbox.'
}
async function setAppUnreadBadge(total){
  try{
    if('setAppBadge' in navigator){
      if(total>0)await navigator.setAppBadge(total)
      else if('clearAppBadge' in navigator)await navigator.clearAppBadge()
    }
  }catch{}
}
function notificationsEnabled(){
  return localStorage.getItem(NOTIFY_ENABLED_KEY)==='true'&&'Notification' in window&&Notification.permission==='granted'
}
function playNotificationSound(){
  if(localStorage.getItem(NOTIFY_SOUND_KEY)==='false')return
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext
    if(!AudioCtx)return
    const ctx=new AudioCtx()
    const oscillator=ctx.createOscillator()
    const gain=ctx.createGain()
    oscillator.frequency.value=760
    gain.gain.value=.035
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime+.12)
    oscillator.onended=()=>ctx.close().catch(()=>{})
  }catch{}
}
async function showMailNotification(mailbox,message,extraCount=0){
  if(!notificationsEnabled())return
  const title=message?.sender||message?.from||'New email'
  const body=[message?.subject||'(No subject)',extraCount>0?`+${extraCount} more new email${extraCount===1?'':'s'}`:null].filter(Boolean).join(' · ')
  const url=`/mail.html?mailbox=${encodeURIComponent(mailbox)}&folder=Inbox&uid=${encodeURIComponent(message?.uid||'')}`
  try{
    const reg=await navigator.serviceWorker?.ready
    if(reg){
      await reg.showNotification(title,{
        body,
        icon:'/assets/icon-192x192.png',
        badge:'/assets/icon-192x192.png',
        tag:`mail-${mailbox}`,
        renotify:true,
        data:{url}
      })
    }else{
      new Notification(title,{body})
    }
    playNotificationSound()
  }catch{}
}
async function refreshUnreadBadge(){
  if(!navigator.onLine||!accounts.length)return
  let total=0
  for(const account of accounts){
    try{
      const counts=await callMailFunction({action:'counts',mailbox_email:account.email})
      total+=Number(counts?.Inbox||0)
    }catch{}
  }
  await setAppUnreadBadge(total)
}
async function checkForNewMail(){
  if(!navigator.onLine||!accounts.length)return
  for(const account of accounts){
    try{
      const result=await callMailFunction({
        action:'list',
        folder:'Inbox',
        mailbox_email:account.email,
        query:'',
        page:0,
        page_size:10,
        sort:'newest'
      })
      const messages=Array.isArray(result)?result:(result?.messages||[])
      if(!messages.length)continue
      const key=`dfl_recent_mail_uids_v1:${session.user.id}:${account.email}`
      let previous=[]
      try{previous=JSON.parse(localStorage.getItem(key)||'[]')}catch{}
      const previousSet=new Set((previous||[]).map(String))
      const currentIds=messages.map(m=>String(m.uid))
      if(previousSet.size){
        const newlyArrived=messages.filter(m=>!previousSet.has(String(m.uid)))
        if(newlyArrived.length){
          await applyRulesToMessages(account.email,newlyArrived)
          await showMailNotification(account.email,newlyArrived[0],Math.max(0,newlyArrived.length-1))
          if(activeAccount?.email===account.email&&activeFolder==='Inbox'&&!(searchInput?.value||'').trim()){
            await loadMessages({reset:true})
          }
        }
      }
      localStorage.setItem(key,JSON.stringify(currentIds))
    }catch{}
  }
  await refreshUnreadBadge()
}
function startBackgroundMailChecks(){
  clearInterval(backgroundCheckTimer)
  checkForNewMail()
  backgroundCheckTimer=setInterval(checkForNewMail,60000)
}
async function applyLaunchTarget(){
  const params=new URLSearchParams(location.search)
  const mailbox=params.get('mailbox')
  const folder=params.get('folder')
  const uid=params.get('uid')
  if(mailbox){
    const match=accounts.find(a=>a.email.toLowerCase()===mailbox.toLowerCase())
    if(match)activeAccount=match
  }
  if(folder)activeFolder=folder
  renderAccounts()
  document.querySelectorAll('.folder').forEach(btn=>btn.classList.toggle('active',(btn.dataset.folder||'Inbox')===activeFolder))
  if(activeAccount)await loadMessages({reset:true})
  if(uid&&activeAccount)await loadMessage(uid)
  if(mailbox||folder||uid)history.replaceState({},'',location.pathname)
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
  try{
    const emails=await callMailFunction({action:'mailboxes'})
    accounts=(emails||[]).filter(e=>String(e).toLowerCase().endsWith('@dflandscape.com')).map(email=>({email,name:String(email).split('@')[0]}))
    localStorage.setItem(`dfl_mail_accounts_v1:${session.user.id}`,JSON.stringify(accounts))
  }catch(error){
    try{
      accounts=JSON.parse(localStorage.getItem(`dfl_mail_accounts_v1:${session.user.id}`)||'[]')
    }catch{accounts=[]}
    if(!accounts.length)throw error
  }
  activeAccount=accounts[0]||null
  renderComposeAccounts()
  await loadMailRulesForUser()
  await applyLaunchTarget()
  startBackgroundMailChecks()
}
function renderAccounts(){
  if(!accountList)return
  if(!accounts.length){accountList.innerHTML='<div class="no-access">No mailbox access.</div>';return}
  accountList.innerHTML=accounts.map(a=>`<button class="account-btn ${activeAccount?.email===a.email?'active':''}" data-email="${esc(a.email)}"><span class="account-copy"><strong>${esc(a.name)}</strong><span>${esc(a.email)}</span></span></button>`).join('')
  accountList.querySelectorAll('[data-email]').forEach(b=>b.onclick=async()=>{activeAccount=accounts.find(a=>a.email===b.dataset.email);activeMessageId=null;renderAccounts();renderComposeAccounts();await loadMessages({reset:true});renderReader();closeMobileMenu()})
}
async function loadMessages({reset=true}={}){
  if(!activeAccount)return
  if(mailLoading){
    if(reset)pendingMailReload=true
    return
  }
  mailLoading=true

  if(reset){
    mailPage=0
    currentMessages=[]
    selectedIds.clear()
    selectionMode=false
    messageList.innerHTML='<div class="empty-reader" style="height:220px"><strong>Loading mail...</strong></div>'
  }

  mailboxHeading.textContent=activeFolder==='Junk'?'Spam':activeFolder
  mailboxAddress.textContent=activeAccount.email

  if(loadMoreBtn){
    loadMoreBtn.disabled=true
    loadMoreBtn.textContent=reset?'Loading…':'Loading more…'
  }

  try{
    const result=await callMailFunction({
      action:'list',
      folder:activeFolder,
      mailbox_email:activeAccount.email,
      query:'',
      page:mailPage,
      page_size:mailPageSize,
      sort:mailSort?.value||'newest'
    })
    const pageMessages=Array.isArray(result)?result:(result?.messages||[])
    currentMessages=reset?pageMessages:[...currentMessages,...pageMessages]
    mailHasMore=Array.isArray(result)?false:result?.hasMore===true
    mailPage+=1
    await loadSnoozedState()
    renderMessages()
    updateLoadMore()
    if(reset)saveMailboxSnapshot()
    updateNetworkBanner()
    await loadUnreadCount()
    await refreshUnreadBadge()
  }catch(e){
    if(reset){
      const restored=restoreMailboxSnapshot()
      if(!restored)messageList.innerHTML=`<div class="empty-reader" style="height:220px"><strong>Unable to load mail</strong><span>${esc(e.message)}</span></div>`
      updateNetworkBanner()
    }else{
      alert(e.message||'Unable to load more mail.')
    }
  }finally{
    mailLoading=false
    if(loadMoreBtn){
      loadMoreBtn.disabled=false
      loadMoreBtn.textContent='Load more'
    }
    if(pendingMailReload){
      pendingMailReload=false
      queueMicrotask(()=>loadMessages({reset:true}))
    }
  }
}
function updateLoadMore(){
  if(loadMoreWrap)loadMoreWrap.hidden=!mailHasMore
}
function messageMatchesSearch(message){
  const raw=(searchInput?.value||'').trim()
  if(!raw)return true
  const q=raw.toLowerCase()
  return [
    message.sender,
    message.from,
    message.to,
    message.cc,
    message.subject
  ].some(value=>String(value||'').toLowerCase().includes(q))
}
function filteredMessages(){
  const filter=mailFilter?.value||'all'
  return currentMessages.filter(m=>{
    if(!messageMatchesSearch(m))return false
    if(activeFolder==='Starred'&&m.flagged!==true)return false
    if(activeAccount&&snoozedMessageKeys.has(snoozedKey(activeAccount.email,m.sourceFolder||activeFolder,m.uid)))return false
    if(filter==='unread'&&m.seen!==false)return false
    if(filter==='starred'&&m.flagged!==true)return false
    if(filter==='attachments'&&m.hasAttachments!==true)return false
    return true
  })
}
function searchMatchInfo(message){
  const raw=(searchInput?.value||'').trim()
  if(!raw)return null
  const q=raw.toLowerCase()

  const subject=String(message.subject||'')
  if(subject.toLowerCase().includes(q))return {where:'subject',value:subject}

  const sender=String(message.sender||'')
  const from=String(message.from||'')
  if(sender.toLowerCase().includes(q))return {where:'sender',value:sender}
  if(from.toLowerCase().includes(q))return {where:'email',value:from}

  const to=String(message.to||'')
  if(to.toLowerCase().includes(q))return {where:'recipient',value:to}

  const cc=String(message.cc||'')
  if(cc.toLowerCase().includes(q))return {where:'recipient',value:cc}

  return null
}

function searchMatchLabel(message){
  const match=searchMatchInfo(message)
  if(!match)return ''
  const raw=(searchInput?.value||'').trim()
  return '<span class="search-match-note">“'+esc(raw)+'” found in '+esc(match.where)+': '+esc(match.value)+'</span>'
}
function groupedMessages(){
  const msgs=filteredMessages()
  const groups=new Map()
  for(const message of msgs){
    const key=normalizeThreadSubject(message.subject)
    if(!groups.has(key))groups.set(key,[])
    groups.get(key).push(message)
  }
  return [...groups.values()].map(thread=>{
    thread.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0))
    return {latest:thread[0],messages:thread,count:thread.length}
  }).sort((a,b)=>new Date(b.latest.date||0)-new Date(a.latest.date||0))
}
function senderDisplayName(message){
  const raw=String(message.sender||message.from||'Unknown sender').trim()
  const angle=raw.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/)
  if(angle?.[1])return angle[1].trim()
  if(raw.includes('@')){
    const email=(raw.match(/<?([^<>\s]+@[^<>\s]+)>?/)||[])[1]||raw
    return email.split('@')[0]||email
  }
  return raw
}
function senderDisplayEmail(message){
  const raw=String(message.from||message.sender||'').trim()
  const match=raw.match(/<?([^<>\s]+@[^<>\s]+)>?/)
  return match?.[1]||raw
}

function renderMessages(){
  const threads=groupedMessages()
  messageList.innerHTML=threads.length?threads.map(thread=>{
    const m=thread.latest
    const selected=selectedIds.has(String(m.uid))
    const unread=thread.messages.some(x=>x.seen===false)
    const active=activeMessageId&&thread.messages.some(x=>String(x.uid)===String(activeMessageId))
    return `<div class="message-swipe-shell" data-shell-id="${esc(m.uid)}">
      <div class="swipe-action swipe-action-read">${m.seen===false?'Read':'Unread'}</div>
      <div class="swipe-action swipe-action-delete">Delete</div>
      <div class="message-row-wrap ${unread?'unread':''} ${selected?'selected':''}" data-wrap-id="${esc(m.uid)}">
        <button class="message-select ${selectionMode?'show':''}" data-select-id="${esc(m.uid)}" type="button" aria-label="${selected?'Deselect':'Select'} message">
          <span class="selection-dot">${selected?'✓':''}</span>
        </button>
        <button class="message-star ${m.flagged?'active':''}" data-star-id="${esc(m.uid)}" type="button" aria-label="${m.flagged?'Unstar':'Star'} message">★</button>
        <button class="message-row ${unread?'unread':''} ${active?'active':''}" data-id="${esc(m.uid)}">
          <span class="sender">${esc(senderDisplayName(m))}</span>
          <span class="time">${esc(formatDate(m.date))}</span>
          <span class="subject">${esc(m.subject||'(No subject)')}${thread.count>1?` <span class="thread-count">(${thread.count})</span>`:''}</span>
          <span class="snippet">${thread.count>1?'Conversation · ':''}${esc(senderDisplayEmail(m))}</span>
          ${searchMatchLabel(m)}
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
  const ids=visibleMessageIds()
  const allSelected=ids.length&&ids.every(id=>selectedIds.has(id))
  if(bulkSelectAllBtn)bulkSelectAllBtn.textContent=allSelected?'Clear all':'Select all'
  if(headerSelectAllBtn){
    headerSelectAllBtn.classList.toggle('active',!!allSelected)
    headerSelectAllBtn.title=allSelected?'Clear all':'Select all'
    headerSelectAllBtn.setAttribute('aria-label',allSelected?'Clear all':'Select all')
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


function formatBytes(bytes=0){
  const n=Number(bytes)||0
  if(n<1024)return n+' B'
  if(n<1024*1024)return (n/1024).toFixed(1)+' KB'
  return (n/(1024*1024)).toFixed(1)+' MB'
}
function safeAttachmentName(name='Attachment'){
  return String(name||'Attachment').replace(/[\r\n"]/g,' ').trim()||'Attachment'
}
function renderComposeAttachments(){
  if(!composeAttachmentList)return
  composeAttachmentList.innerHTML=composeAttachments.map((a,i)=>`
    <div class="compose-attachment-chip">
      <span class="attachment-chip-copy"><strong>${esc(a.filename||'Attachment')}</strong><small>${esc(formatBytes(a.size||0))}</small></span>
      <button type="button" data-remove-attachment="${i}" aria-label="Remove attachment">×</button>
    </div>`).join('')
  composeAttachmentList.querySelectorAll('[data-remove-attachment]').forEach(btn=>btn.addEventListener('click',()=>{
    composeAttachments.splice(Number(btn.dataset.removeAttachment),1)
    renderComposeAttachments()
    scheduleDraftSave()
  }))
}
function fileToAttachment(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader()
    reader.onerror=()=>reject(new Error('Unable to read '+file.name))
    reader.onload=()=>{
      const dataUrl=String(reader.result||'')
      const comma=dataUrl.indexOf(',')
      resolve({
        filename:safeAttachmentName(file.name),
        mimeType:file.type||'application/octet-stream',
        size:file.size,
        dataUrl,
        base64:comma>=0?dataUrl.slice(comma+1):''
      })
    }
    reader.readAsDataURL(file)
  })
}
async function addComposeFiles(files){
  const incoming=[...(files||[])]
  if(!incoming.length)return
  const currentSize=composeAttachments.reduce((sum,a)=>sum+(Number(a.size)||0),0)
  const incomingSize=incoming.reduce((sum,f)=>sum+(Number(f.size)||0),0)
  if(currentSize+incomingSize>12*1024*1024){
    alert('Attachments can total up to 12 MB per email.')
    return
  }
  try{
    const converted=await Promise.all(incoming.map(fileToAttachment))
    composeAttachments.push(...converted)
    renderComposeAttachments()
    scheduleDraftSave()
  }catch(error){alert(error.message||'Unable to add attachment.')}
}
function attachmentPreviewHtml(a){
  const type=String(a.mimeType||'').toLowerCase()
  const url=a.dataUrl||''
  if(type.startsWith('image/')&&url)return `<img class="attachment-preview-image" src="${url}" alt="${esc(a.filename||'Attachment')}">`
  if(type==='application/pdf'&&url)return `<iframe class="attachment-preview-pdf" src="${url}" title="${esc(a.filename||'PDF')}"></iframe>`
  return `<div class="attachment-no-preview"><strong>No inline preview available</strong><span>${esc(a.filename||'Attachment')}</span></div>`
}
function openAttachmentPreview(index){
  const a=activeMessage?.attachments?.[Number(index)]
  if(!a)return
  if(attachmentPreviewTitle)attachmentPreviewTitle.textContent=a.filename||'Attachment'
  if(attachmentPreviewBody)attachmentPreviewBody.innerHTML=attachmentPreviewHtml(a)
  attachmentPreviewModal?.classList.remove('hidden')
}
function downloadAttachment(index){
  const a=activeMessage?.attachments?.[Number(index)]
  if(!a?.dataUrl)return
  const link=document.createElement('a')
  link.href=a.dataUrl
  link.download=safeAttachmentName(a.filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
}
function renderMessageAttachments(message){
  const items=message?.attachments||[]
  if(!items.length)return ''
  return `<section class="reader-attachments">
    <h3>Attachments <span>${items.length}</span></h3>
    <div class="reader-attachment-grid">
      ${items.map((a,i)=>`<div class="reader-attachment-card">
        <div class="reader-attachment-info">
          <strong>${esc(a.filename||'Attachment')}</strong>
          <span>${esc(a.mimeType||'File')} · ${esc(formatBytes(a.size||0))}</span>
        </div>
        <div class="reader-attachment-actions">
          ${(/^image\//i.test(a.mimeType||'')||a.mimeType==='application/pdf')? `<button type="button" data-preview-attachment="${i}">Preview</button>` : ''}
          <button type="button" data-download-attachment="${i}">Download</button>
        </div>
      </div>`).join('')}
    </div>
  </section>`
}


async function loadThreadConversation(message){
  const key=normalizeThreadSubject(message.subject)
  const rows=currentMessages
    .filter(row=>normalizeThreadSubject(row.subject)===key)
    .slice(0,10)
  const full=[]
  for(const row of rows){
    if(String(row.uid)===String(message.uid)){
      full.push(message)
      continue
    }
    try{
      const item=await callMailFunction({
        action:'get',
        folder:row.sourceFolder||activeFolder,
        uid:String(row.uid),
        mailbox_email:activeAccount.email
      })
      item.sourceFolder=row.sourceFolder||activeFolder
      full.push(item)
    }catch{}
  }
  if(!full.some(item=>String(item.uid)===String(message.uid)))full.push(message)
  full.sort((a,b)=>new Date(a.date||0)-new Date(b.date||0))
  return full
}
function renderThreadConversation(messages,active){
  if(!messages||messages.length<2){
    return `<div class="reader-body">${active.html||esc(active.body||'')}</div>`
  }
  return `<section class="thread-conversation">
    ${messages.map(item=>`
      <article class="thread-message ${String(item.uid)===String(active.uid)?'active':''}">
        <div class="thread-message-head">
          <strong>${esc(item.sender||item.from||'Unknown sender')}</strong>
          <span>${esc(formatFullDate(item.date))}</span>
        </div>
        <div class="thread-message-meta">To: ${esc(item.to||activeAccount.email)}</div>
        <div class="thread-message-body">${item.html||esc(item.body||'')}</div>
      </article>`).join('')}
  </section>`
}

async function loadMessage(uid){
  try{
    activeMessageId=uid
    const sourceFolder=messageFolder(uid)
    const m=await callMailFunction({action:'get',folder:sourceFolder,uid,mailbox_email:activeAccount.email})
    m.sourceFolder=sourceFolder
    activeMessage=m
    const threadMessages=await loadThreadConversation(m)
    readerPanel.innerHTML=`<article class="reader reader-rich">
      <button class="mobile-reader-back" id="mobileReaderBack" type="button">← Back to ${esc(activeFolder)}</button>
      <div class="message-actions">
        <div class="message-action-row message-action-row-primary">
          <button type="button" class="message-action-btn" id="replyMessageBtn">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17 4 12l5-5"/><path d="M20 18v-2a6 6 0 0 0-6-6H4"/></svg>
            <span>Reply</span>
          </button>
          <button type="button" class="message-action-btn" id="replyAllMessageBtn">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 17-5-5 5-5"/><path d="m12 17-5-5 5-5"/><path d="M22 18v-2a6 6 0 0 0-6-6H7"/></svg>
            <span>Reply all</span>
          </button>
          <button type="button" class="message-action-btn" id="forwardMessageBtn">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 17 5-5-5-5"/><path d="M4 18v-2a6 6 0 0 1 6-6h10"/></svg>
            <span>Forward</span>
          </button>
          <button type="button" class="message-action-btn" id="readMessageBtn">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
            <span>${m.seen===false?'Mark read':'Mark unread'}</span>
          </button>
          <button type="button" class="message-action-btn" id="starMessageBtn">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z"/></svg>
            <span>${m.flagged?'Unstar':'Star'}</span>
          </button>
        </div>
        <div class="message-action-row message-action-row-secondary">
          ${sourceFolder!=='Trash'?'<button type="button" class="message-action-btn" id="archiveMessageBtn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4z"/><path d="M3 4h18v3H3z"/><path d="M9 11h6"/></svg><span>Archive</span></button>':''}
          ${sourceFolder!=='Junk'?'<button type="button" class="message-action-btn" id="spamMessageBtn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.4 8.2 8 9 4.6-.8 8-4 8-9V6l-8-3z"/><path d="M12 8v5"/><path d="M12 17h.01"/></svg><span>Spam</span></button>':''}
          <span class="message-action-divider" aria-hidden="true"></span>
          <button type="button" class="message-action-btn danger" id="deleteMessageBtn">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m7 7 1 13h8l1-13"/><path d="M10 11v5M14 11v5"/></svg>
            <span>${sourceFolder==='Trash'?'Delete forever':'Delete'}</span>
          </button>
        </div>
      </div>
      <div class="eyebrow dark">Message</div>
      <h2>${esc(m.subject||'(No subject)')}</h2>
      <div class="reader-meta">From: ${esc(m.sender||m.from||'')}<br>To: ${esc(m.to||activeAccount.email)}<br>${esc(formatFullDate(m.date))}</div>
      ${renderThreadConversation(threadMessages,m)}
      ${renderMessageAttachments(m)}
    </article>`
    document.getElementById('replyMessageBtn')?.addEventListener('click',()=>openReplyComposer(m))
    document.getElementById('replyAllMessageBtn')?.addEventListener('click',()=>openReplyAllComposer(m))
    document.getElementById('forwardMessageBtn')?.addEventListener('click',()=>openForwardComposer(m))
    document.getElementById('readMessageBtn')?.addEventListener('click',()=>toggleActiveReadState())
    document.getElementById('starMessageBtn')?.addEventListener('click',()=>toggleActiveStar())
    document.getElementById('archiveMessageBtn')?.addEventListener('click',archiveActiveMessage)
    document.getElementById('spamMessageBtn')?.addEventListener('click',()=>moveActiveMessage('Junk'))
    document.getElementById('deleteMessageBtn')?.addEventListener('click',deleteActiveMessage)
    readerPanel.querySelectorAll('[data-preview-attachment]').forEach(btn=>btn.addEventListener('click',()=>openAttachmentPreview(btn.dataset.previewAttachment)))
    readerPanel.querySelectorAll('[data-download-attachment]').forEach(btn=>btn.addEventListener('click',()=>downloadAttachment(btn.dataset.downloadAttachment)))
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
    composeAttachments=[]
    renderComposeAttachments()
    renderComposeAccounts()
    if(composeFrom&&activeAccount)composeFrom.value=activeAccount.email
    if(composeBody)composeBody.value=appendSignature('',composeFrom?.value)
  }
  setTimeout(()=>composeTo?.focus(),50)
}
function setComposeValues({to='',cc='',bcc='',subject='',body='',attachments=[]}={}){
  renderComposeAccounts()
  if(composeFrom&&activeAccount)composeFrom.value=activeAccount.email
  if(composeTo)composeTo.value=to
  if(composeCc)composeCc.value=cc
  if(composeBcc)composeBcc.value=bcc
  if(composeSubject)composeSubject.value=subject
  if(composeBody)composeBody.value=appendSignature(body,composeFrom?.value)
  composeAttachments=(attachments||[]).map(a=>({...a}))
  renderComposeAttachments()
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
    body:forwarded,
    attachments:(message.attachments||[]).map(a=>({...a}))
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
searchInput?.addEventListener('input',()=>{
  clearTimeout(searchTimer)
  selectedIds.clear()
  selectionMode=false
  renderMessages()
  updateLoadMore()
})
mailFilter?.addEventListener('change',renderMessages)
mailSort?.addEventListener('change',()=>loadMessages({reset:true}))

const sortMenuBtn=document.getElementById('sortMenuBtn')
const filterMenuBtn=document.getElementById('filterMenuBtn')
const sortMenu=document.getElementById('sortMenu')
const filterMenu=document.getElementById('filterMenu')

function closeToolbarMenus(except=null){
  if(sortMenu&&sortMenu!==except)sortMenu.hidden=true
  if(filterMenu&&filterMenu!==except)filterMenu.hidden=true
}
sortMenuBtn?.addEventListener('click',e=>{
  e.stopPropagation()
  const willOpen=sortMenu?.hidden
  closeToolbarMenus()
  if(sortMenu)sortMenu.hidden=!willOpen
})
filterMenuBtn?.addEventListener('click',e=>{
  e.stopPropagation()
  const willOpen=filterMenu?.hidden
  closeToolbarMenus()
  if(filterMenu)filterMenu.hidden=!willOpen
})
sortMenu?.querySelectorAll('[data-sort-value]').forEach(btn=>btn.addEventListener('click',()=>{
  if(mailSort){
    mailSort.value=btn.dataset.sortValue
    mailSort.dispatchEvent(new Event('change'))
  }
  sortMenu.hidden=true
}))
filterMenu?.querySelectorAll('[data-filter-value]').forEach(btn=>btn.addEventListener('click',()=>{
  if(mailFilter){
    mailFilter.value=btn.dataset.filterValue
    mailFilter.dispatchEvent(new Event('change'))
  }
  filterMenu.hidden=true
}))
document.addEventListener('click',e=>{
  if(!e.target.closest?.('.mail-toolbar-menu'))closeToolbarMenus()
})

loadMoreBtn?.addEventListener('click',()=>loadMessages({reset:false}))
document.getElementById('bulkCloseBtn')?.addEventListener('click',exitSelectionMode)
function toggleSelectAllVisible(){
  const ids=visibleMessageIds()
  const allSelected=ids.length&&ids.every(id=>selectedIds.has(id))
  if(allSelected)ids.forEach(id=>selectedIds.delete(id))
  else ids.forEach(id=>selectedIds.add(id))
  selectionMode=selectedIds.size>0
  renderMessages()
}
document.getElementById('bulkSelectAllBtn')?.addEventListener('click',toggleSelectAllVisible)
headerSelectAllBtn?.addEventListener('click',toggleSelectAllVisible)
document.getElementById('bulkReadBtn')?.addEventListener('click',()=>runBulkAction('mark_read'))
document.getElementById('bulkUnreadBtn')?.addEventListener('click',()=>runBulkAction('mark_unread'))
document.getElementById('bulkStarBtn')?.addEventListener('click',()=>runBulkAction('star'))
document.getElementById('bulkUnstarBtn')?.addEventListener('click',()=>runBulkAction('unstar'))
document.getElementById('bulkArchiveBtn')?.addEventListener('click',()=>runBulkAction('archive'))
document.getElementById('bulkSpamBtn')?.addEventListener('click',()=>runBulkMove('Junk'))
document.getElementById('bulkMoveSelect')?.addEventListener('change',e=>{if(e.target.value){runBulkMove(e.target.value);e.target.value=''}})
document.getElementById('bulkDeleteBtn')?.addEventListener('click',()=>runBulkAction('delete'))
async function refreshMailboxKeepingSelection(){
  const selectedUid=activeMessageId?String(activeMessageId):''
  await loadMessages({reset:true})

  if(!selectedUid)return

  const stillInMailbox=currentMessages.some(message=>String(message.uid)===selectedUid)
  if(stillInMailbox){
    await loadMessage(selectedUid)
  }else{
    activeMessageId=null
    activeMessage=null
    renderReader()
  }
}

document.querySelectorAll('.folder').forEach(btn=>btn.addEventListener('click',async()=>{
  activeFolder=btn.dataset.folder||'Inbox'
  selectedIds.clear();selectionMode=false
  document.querySelectorAll('.folder').forEach(x=>x.classList.toggle('active',x===btn))
  if(mailFilter)mailFilter.value='all'
  await loadMessages({reset:true})
  renderReader()
  closeMobileMenu()
}))
document.getElementById('refreshBtn')?.addEventListener('click',refreshMailboxKeepingSelection)
document.getElementById('composeBtn')?.addEventListener('click',openNewComposer)

function closeComposeSafely(){
  saveDraftNow()
  if(composeDirty&&draftHasContent()&&!confirm('Close this message? Your draft is saved and can be restored later.'))return
  composeModal?.classList.add('hidden')
}
document.getElementById('closeCompose')?.addEventListener('click',closeComposeSafely)

document.getElementById('showCcBtn')?.addEventListener('click',()=>{document.getElementById('ccRow')?.classList.toggle('hidden');if(!document.getElementById('ccRow')?.classList.contains('hidden'))composeCc?.focus()})
document.getElementById('showBccBtn')?.addEventListener('click',()=>{document.getElementById('bccRow')?.classList.toggle('hidden');if(!document.getElementById('bccRow')?.classList.contains('hidden'))composeBcc?.focus()})
document.getElementById('addAttachmentBtn')?.addEventListener('click',()=>composeAttachmentInput?.click())
composeAttachmentInput?.addEventListener('change',async()=>{await addComposeFiles(composeAttachmentInput.files);composeAttachmentInput.value=''})
document.getElementById('closeAttachmentPreview')?.addEventListener('click',()=>attachmentPreviewModal?.classList.add('hidden'))
attachmentPreviewModal?.addEventListener('click',e=>{if(e.target===attachmentPreviewModal)attachmentPreviewModal.classList.add('hidden')})

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
  status.textContent='Queuing…'
  try{
    queueUndoSend()
    status.textContent=''
  }catch(err){
    status.textContent=err.message||'Unable to send.'
  }
})

document.getElementById('undoSendBtn')?.addEventListener('click',undoPendingSend)

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

let pullStartY=0,pullLastY=0,pullTracking=false,pullTriggered=false

document.addEventListener('touchstart',e=>{
  if(!isMobileMenuMode()||e.touches.length!==1)return
  if(window.scrollY>2)return
  if(e.target.closest?.('.reader-panel,.sidebar,.compose-modal,.message-swipe-shell'))return
  pullStartY=e.touches[0].clientY
  pullLastY=pullStartY
  pullTracking=true
  pullTriggered=false
},{passive:true})

document.addEventListener('touchmove',e=>{
  if(!pullTracking||e.touches.length!==1)return
  pullLastY=e.touches[0].clientY
  const dy=pullLastY-pullStartY
  if(pullRefreshIndicator){
    if(dy>18){
      pullRefreshIndicator.hidden=false
      pullRefreshIndicator.textContent=dy>72?'Release to refresh':'Pull to refresh'
    }else{
      pullRefreshIndicator.hidden=true
    }
  }
  if(dy>72)pullTriggered=true
},{passive:true})

document.addEventListener('touchend',async()=>{
  if(!pullTracking)return
  pullTracking=false
  if(pullRefreshIndicator)pullRefreshIndicator.hidden=true
  if(pullTriggered){
    pullTriggered=false
    await refreshMailboxKeepingSelection()
  }
},{passive:true})

window.addEventListener('online',async()=>{updateNetworkBanner();await loadMessages({reset:true});startBackgroundMailChecks()})
window.addEventListener('offline',updateNetworkBanner)
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)checkForNewMail()})
updateNetworkBanner()
renderReader();await loadAccounts()
