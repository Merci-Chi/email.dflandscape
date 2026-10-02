import PostalMime from 'npm:postal-mime@2'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN='https://email.dflandscape.com'
const DOMAIN='@dflandscape.com'
const cors={
  'Access-Control-Allow-Origin':ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
}
const encoder=new TextEncoder()
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})}
function normalizeMailbox(v:unknown){const e=String(v||'').trim().toLowerCase();return e.endsWith(DOMAIN)?e:''}
function secretName(mailbox:string){return 'DF_MAIL_PASSWORD_'+mailbox.split('@')[0].toUpperCase().replace(/[^A-Z0-9]+/g,'_')}
function credentials(mailbox:string){
  const password=Deno.env.get(secretName(mailbox)) || (mailbox==='don@dflandscape.com'?Deno.env.get('DF_DON_MAIL_PASSWORD'):null)
  if(!password) throw new Error(`Mailbox is not provisioned yet. Missing secret ${secretName(mailbox)}.`)
  return {user:mailbox,password}
}
class Reader{
  conn:Deno.Conn;buffer=new Uint8Array(0);decoder=new TextDecoder()
  constructor(conn:Deno.Conn){this.conn=conn}
  async fill(){const c=new Uint8Array(8192);const n=await this.conn.read(c);if(n===null)throw new Error('Connection closed');const next=new Uint8Array(this.buffer.length+n);next.set(this.buffer);next.set(c.subarray(0,n),this.buffer.length);this.buffer=next}
  async line(){while(true){for(let i=0;i+1<this.buffer.length;i++){if(this.buffer[i]===13&&this.buffer[i+1]===10){const s=this.decoder.decode(this.buffer.subarray(0,i));this.buffer=this.buffer.subarray(i+2);return s}}await this.fill()}}
  async bytes(n:number){while(this.buffer.length<n)await this.fill();const out=this.buffer.slice(0,n);this.buffer=this.buffer.subarray(n);return out}
}
function quote(v:string){return `"${v.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`}
async function writeLine(conn:Deno.Conn,line:string){await conn.write(encoder.encode(line+'\r\n'))}
async function smtpRead(r:Reader){const lines:string[]=[];let code=0;while(true){const line=await r.line();lines.push(line);if(/^\d{3}[ -]/.test(line)){code=Number(line.slice(0,3));if(line[3]===' ')break}}return{code,lines}}
async function smtpCmd(c:Deno.Conn,r:Reader,cmd:string,ok:number[]){await writeLine(c,cmd);const res=await smtpRead(r);if(!ok.includes(res.code))throw new Error(`SMTP error: ${res.lines.join(' ')}`)}
async function sendMail(mailbox:string,to:string,subject:string,body:string){
  const recipients=String(to||'').split(',').map(v=>v.trim()).filter(Boolean)
  if(!recipients.length||recipients.some(v=>!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)))throw new Error('Enter valid recipient emails.')
  const {user,password}=credentials(mailbox),host=Deno.env.get('DF_MAIL_SMTP_HOST')||'smtp.hostinger.com',port=Number(Deno.env.get('DF_MAIL_SMTP_PORT')||'465')
  const c=await Deno.connectTls({hostname:host,port}),r=new Reader(c)
  try{
    if((await smtpRead(r)).code!==220)throw new Error('SMTP connection failed')
    await smtpCmd(c,r,'EHLO email.dflandscape.com',[250])
    await smtpCmd(c,r,'AUTH LOGIN',[334])
    await smtpCmd(c,r,btoa(user),[334])
    await smtpCmd(c,r,btoa(password),[235])
    await smtpCmd(c,r,`MAIL FROM:<${user}>`,[250])
    for(const recipient of recipients)await smtpCmd(c,r,`RCPT TO:<${recipient}>`,[250,251])
    await smtpCmd(c,r,'DATA',[354])
    const safe=body.replace(/\r?\n/g,'\r\n').replace(/^\./gm,'..')
    const message=[`From: ${user}`,`To: ${recipients.join(', ')}`,`Subject: ${subject.replace(/[\r\n]+/g,' ')}`,`Date: ${new Date().toUTCString()}`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','',safe,'.'].join('\r\n')
    await c.write(encoder.encode(message+'\r\n'))
    if((await smtpRead(r)).code!==250)throw new Error('SMTP send failed')
    await smtpCmd(c,r,'QUIT',[221])
    return{ok:true}
  }finally{try{c.close()}catch{}}
}
type Part={line:string,literal?:Uint8Array}
async function imapCmd(c:Deno.Conn,r:Reader,tag:string,cmd:string){await writeLine(c,`${tag} ${cmd}`);const parts:Part[]=[];while(true){const line=await r.line();const p:Part={line};const m=line.match(/\{(\d+)\}$/);if(m)p.literal=await r.bytes(Number(m[1]));parts.push(p);if(line.startsWith(tag+' ')){if(!new RegExp(`^${tag} OK`,'i').test(line))throw new Error(`IMAP error: ${line}`);return parts}}}
async function openImap(mailbox:string,folder='Inbox'){
  const {user,password}=credentials(mailbox),host=Deno.env.get('DF_MAIL_IMAP_HOST')||'imap.hostinger.com',port=Number(Deno.env.get('DF_MAIL_IMAP_PORT')||'993')
  const c=await Deno.connectTls({hostname:host,port}),r=new Reader(c);if(!(await r.line()).startsWith('* OK'))throw new Error('IMAP connection failed')
  await imapCmd(c,r,'a1',`LOGIN ${quote(user)} ${quote(password)}`)
  const list=await imapCmd(c,r,'a2','LIST "" "*"');const lines=list.map(p=>p.line).filter(l=>l.startsWith('* LIST'));let selected='INBOX'
  const flags:Record<string,string>={Sent:'\\Sent',Drafts:'\\Drafts',Trash:'\\Trash'}
  if(folder!=='Inbox'){const f=flags[folder],match=lines.find(l=>f&&l.toLowerCase().includes(f.toLowerCase()));if(match){selected=match.match(/"([^"]+)"\s*$/)?.[1]||folder}else selected=folder}
  await imapCmd(c,r,'a3',`SELECT ${quote(selected)}`);return{c,r,selected,listLines:lines}
}
function parseHeaders(raw:string){const lines=raw.replace(/\r\n/g,'\n').split('\n'),out:string[]=[];for(const l of lines){if(/^[ \t]/.test(l)&&out.length)out[out.length-1]+=' '+l.trim();else out.push(l)}const h:Record<string,string>={};for(const l of out){const i=l.indexOf(':');if(i>0)h[l.slice(0,i).toLowerCase()]=l.slice(i+1).trim()}return h}
async function listMail(mailbox:string,folder='Inbox'){const {c,r}=await openImap(mailbox,folder);try{const s=await imapCmd(c,r,'a4','UID SEARCH ALL');const line=s.find(p=>p.line.startsWith('* SEARCH'))?.line||'* SEARCH';const uids=line.replace('* SEARCH','').trim().split(/\s+/).filter(Boolean).slice(-30).reverse();const messages=[];let n=5;for(const uid of uids){const parts=await imapCmd(c,r,`a${n++}`,`UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)])`);const lit=parts.find(p=>p.literal)?.literal;if(!lit)continue;const h=parseHeaders(new TextDecoder().decode(lit));messages.push({id:uid,uid,sender:h.from||'Unknown sender',from:h.from||'',subject:h.subject||'(No subject)',date:h.date||'',time:h.date||'',snippet:''})}await imapCmd(c,r,'z1','LOGOUT');return messages}finally{try{c.close()}catch{}}}
function b64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary)}
async function getMail(mailbox:string,uid:string,folder='Inbox'){const {c,r}=await openImap(mailbox,folder);try{const parts=await imapCmd(c,r,'a4',`UID FETCH ${uid} (BODY.PEEK[])`);const lit=parts.find(p=>p.literal)?.literal;if(!lit)throw new Error('Message not found');const parsed=await PostalMime.parse(lit);await imapCmd(c,r,'z1','LOGOUT');return{id:uid,uid,sender:parsed.from?.name||parsed.from?.address||'Unknown sender',from:parsed.from?.address||'',to:(parsed.to||[]).map((x:any)=>x.address).filter(Boolean).join(', '),subject:parsed.subject||'(No subject)',date:parsed.date||'',html:typeof parsed.html==='string'?parsed.html:'',body:typeof parsed.text==='string'?parsed.text:'',attachments:(parsed.attachments||[]).map((a:any)=>{const content=a.content instanceof Uint8Array?a.content:new Uint8Array(a.content||[]),mimeType=a.mimeType||a.contentType||'application/octet-stream';return{filename:a.filename||'Attachment',mimeType,contentId:a.contentId||a.cid||'',size:content.length,dataUrl:`data:${mimeType};base64,${b64(content)}`}})}}finally{try{c.close()}catch{}}}


async function setFlag(mailbox:string,uid:string,folder:string,flag:string,enabled:boolean){
  const {c,r}=await openImap(mailbox,folder)
  try{await imapCmd(c,r,'f1',`UID STORE ${uid} ${enabled?'+':'-'}FLAGS.SILENT (${flag})`);await imapCmd(c,r,'z1','LOGOUT');return{ok:true}}finally{try{c.close()}catch{}}
}
async function moveMessage(mailbox:string,uid:string,folder:string,targetKind:'trash'|'archive'){
  const {c,r,listLines}=await openImap(mailbox,folder)
  try{
    const special=targetKind==='trash'?'\\Trash':'\\Archive'
    const fallback=targetKind==='trash'?'Trash':'Archive'
    const targetLine=listLines.find(l=>l.toLowerCase().includes(special.toLowerCase()))
    const target=targetLine?.match(/"([^"]+)"\s*$/)?.[1]||fallback
    try{await imapCmd(c,r,'m1',`UID MOVE ${uid} ${quote(target)}`)}
    catch{await imapCmd(c,r,'m1',`UID COPY ${uid} ${quote(target)}`);await imapCmd(c,r,'m2',`UID STORE ${uid} +FLAGS.SILENT (\\Deleted)`);await imapCmd(c,r,'m3','EXPUNGE')}
    await imapCmd(c,r,'z1','LOGOUT');return{ok:true}
  }finally{try{c.close()}catch{}}
}
async function deleteMail(mailbox:string,uid:string,folder='Inbox'){
  const {c,r,selected,listLines}=await openImap(mailbox,folder)
  try{
    if(folder==='Trash'||/trash/i.test(selected)){await imapCmd(c,r,'d1',`UID STORE ${uid} +FLAGS.SILENT (\\Deleted)`);await imapCmd(c,r,'d2','EXPUNGE')}
    else{
      const trashLine=listLines.find(l=>l.toLowerCase().includes('\\trash'))
      const trashFolder=trashLine?.match(/"([^"]+)"\s*$/)?.[1]||'Trash'
      try{await imapCmd(c,r,'d1',`UID MOVE ${uid} ${quote(trashFolder)}`)}
      catch{await imapCmd(c,r,'d1',`UID COPY ${uid} ${quote(trashFolder)}`);await imapCmd(c,r,'d2',`UID STORE ${uid} +FLAGS.SILENT (\\Deleted)`);await imapCmd(c,r,'d3','EXPUNGE')}
    }
    await imapCmd(c,r,'z1','LOGOUT');return{ok:true}
  }finally{try{c.close()}catch{}}
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  try{
    const auth=req.headers.get('authorization')||'',token=auth.replace(/^Bearer\s+/i,'')
    if(!token)return json({error:'Not signed in.'},401)
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const {data:{user},error}=await admin.auth.getUser(token);if(error||!user)return json({error:'Not signed in.'},401)
    const {data:profile}=await admin.from('dflandscape_mail_access').select('role,active').eq('user_id',user.id).maybeSingle()
    if(profile?.active!==true)return json({error:'No mailbox access.'},403)

    const body=await req.json()
    if(body.action==='mailboxes'){
      if(String(profile.role||'').toLowerCase()==='admin'){
        const {data}=await admin.from('dflandscape_mail_access').select('mailbox_email').eq('active',true)
        return json({data:[...new Set((data||[]).map(x=>normalizeMailbox(x.mailbox_email)).filter(Boolean))]})
      }
      const {data}=await admin.from('dflandscape_mailbox_permissions').select('mailbox_email').eq('user_id',user.id)
      return json({data:[...new Set((data||[]).map(x=>normalizeMailbox(x.mailbox_email)).filter(Boolean))]})
    }

    const mailbox=normalizeMailbox(body.mailbox_email)
    if(!mailbox)return json({error:'Choose a valid @dflandscape.com mailbox.'},400)

    if(String(profile.role||'').toLowerCase()!=='admin'){
      const {data:permission}=await admin.from('dflandscape_mailbox_permissions').select('id').eq('user_id',user.id).eq('mailbox_email',mailbox).maybeSingle()
      if(!permission)return json({error:'You do not have access to this mailbox.'},403)
    }

    let data
    if(body.action==='list')data=await listMail(mailbox,body.folder||'Inbox')
    else if(body.action==='get')data=await getMail(mailbox,String(body.uid||''),body.folder||'Inbox')
    else if(body.action==='mark_read')data=await setFlag(mailbox,String(body.uid||''),body.folder||'Inbox','\\Seen',true)
    else if(body.action==='mark_unread')data=await setFlag(mailbox,String(body.uid||''),body.folder||'Inbox','\\Seen',false)
    else if(body.action==='star')data=await setFlag(mailbox,String(body.uid||''),body.folder||'Inbox','\\Flagged',true)
    else if(body.action==='unstar')data=await setFlag(mailbox,String(body.uid||''),body.folder||'Inbox','\\Flagged',false)
    else if(body.action==='archive')data=await moveMessage(mailbox,String(body.uid||''),body.folder||'Inbox','archive')
    else if(body.action==='delete')data=await deleteMail(mailbox,String(body.uid||''),body.folder||'Inbox')
    else if(body.action==='send'){
      const to=String(body.to||'').trim()
      data=await sendMail(mailbox,to,String(body.subject||''),String(body.body||''))
    }else throw new Error('Unknown action.')
    return json({data})
  }catch(error){console.error(error);return json({error:error instanceof Error?error.message:'Mail request failed.'},500)}
})
