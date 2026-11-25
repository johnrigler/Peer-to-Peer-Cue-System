(function(){
"use strict";
const $=id=>document.getElementById(id), C=window.CuePeerCore;
const peers=new Map(), pending=new Map(), buttons=[...document.querySelectorAll("[data-cue]")];
let peer, ownId="", invite="", signaling=false, privateKey="", identity="";
const S=window.CueSigned, H=window.CHISEL, receivers=new Map();
const ready=!!(H&&H.signArtifact&&H.verifyArtifact&&H.identityFromPrivateKey&&H.getSigningBackend&&H.getSigningBackend()==="noble");
const status=text=>{$("status").textContent=text;};
function log(text){
  const div=document.createElement("div");div.textContent=new Date().toLocaleTimeString()+" "+text;
  $("log").prepend(div);while($("log").children.length>200)$("log").lastChild.remove();
}
function refresh(){
  const sel=$("destination"), previous=sel.value;sel.replaceChildren();
  for(const [id,c] of peers){if(!c.open)continue;const o=document.createElement("option");o.value=id;o.textContent=id;sel.append(o);}
  if([...sel.options].some(o=>o.value===previous))sel.value=previous;
  const active=!!sel.value;sel.disabled=!active;$("send").disabled=!active||!privateKey;$("disconnect").disabled=!active;
  buttons.forEach(b=>b.disabled=!active||!privateKey);$("connect").disabled=!signaling;
}
function renderPending(){
  $("pending").replaceChildren();
  for(const [id,c] of pending){
    const row=document.createElement("div");row.className="pending";const text=document.createElement("span");text.textContent="Incoming unverified peer: "+id+" ";row.append(text);
    for(const [label,yes] of [["Accept",true],["Reject",false]]){const b=document.createElement("button");b.type="button";b.textContent=label;b.onclick=()=>{if(pending.get(id)!==c)return;pending.delete(id);if(yes&&!peers.has(id)){peers.set(id,c);log("Accepted "+id);}else c.close();renderPending();refresh();};row.append(b);}
    $("pending").append(row);
  }
}
function attach(c,inbound){
  const id=c.peer;
  try{C.id(id);}catch{c.close();return;}
  if(id===ownId||peers.has(id)||pending.has(id)||peers.size+pending.size>=16){c.close();return;}
  if(inbound){pending.set(id,c);renderPending();}else peers.set(id,c);
  if(!receivers.has(id))receivers.set(id,S.receiver(H,ownId,id));
  const verify=receivers.get(id);let queue=Promise.resolve();let queued=0;
  c.on("open",()=>{if(peers.get(id)===c){log("Connected "+id);status("Connected (unverified)");}refresh();});
  c.on("data",raw=>{
    if(peers.get(id)!==c)return;
    if(queued>=32){log("Too many pending messages; closing connection");c.close();return;}
    queued++;
    queue=queue.then(async()=>{
      if(peers.get(id)!==c)return;
      try{
        const data=await verify(raw);
        if(peers.get(id)!==c)return;
        if(data.verb==="cue"){$("cue").dataset.state=data.value;$("cue").textContent=data.value==="Reset"?"Standby":data.value==="Off"?"All Off":data.value;}
        const address=await H.litecoin.publicKeyHexToAddress(data.identity.slice("chisel:v1:".length));
        if(peers.get(id)!==c)return;
        log("Verified "+address+" · "+data.verb+": "+data.value);
      }catch(e){log("Rejected packet: "+e.message);}
    }).finally(()=>queued--);
  });
  const close=()=>{if(peers.get(id)===c)peers.delete(id);if(pending.get(id)===c)pending.delete(id);renderPending();refresh();};
  c.on("close",()=>{log("Disconnected "+id);close();});
  c.on("error",e=>{log("Connection error: "+String(e));close();c.close();});
  refresh();
}
async function send(verb,value){
  const c=peers.get($("destination").value);if(!c||!c.open){status("Select a connected peer");return false;}
  const key=privateKey;if(!key){status("Load a test identity first");return false;}
  try{const packet=await S.sign(H,key,{from:ownId,to:c.peer,nonce:C.sessionId(),verb,value});if(privateKey!==key||peers.get(c.peer)!==c||!c.open)throw Error("Identity or connection changed");c.send(packet);log("Signed → "+c.peer+": "+verb+" "+value);return true;}catch(e){status(String(e));return false;}
}
try{$("remote").value=C.fromLocation(location.href);}catch(e){status(e.message);}
$("connect-form").addEventListener("submit",e=>{e.preventDefault();try{const id=C.fromInput($("remote").value);if(!signaling||!peer)throw Error("PeerJS is not ready");if(id===ownId||peers.has(id)||pending.has(id)||peers.size+pending.size>=16)throw Error("Cannot connect to that session");attach(peer.connect(id,{reliable:true}),false);status("Connecting to "+id);}catch(e){status(e.message);}});
$("message-form").addEventListener("submit",async e=>{e.preventDefault();const value=$("message").value;if(await send("send",value)&&$("message").value===value)$("message").value="";});
buttons.forEach(b=>b.addEventListener("click",()=>send("cue",b.dataset.cue)));
$("disconnect").onclick=()=>{const id=$("destination").value,c=peers.get(id);if(c){peers.delete(id);c.close();refresh();}};
$("clear").onclick=()=>$("log").replaceChildren();
$("copy-id").onclick=async()=>{try{await navigator.clipboard.writeText(ownId);status("Session ID copied");}catch{status("Select and copy your session ID above.");}};
$("copy").onclick=async()=>{try{await navigator.clipboard.writeText(invite);status("Pairing link copied");}catch{status("Copy the pairing URL shown above.");}};
$("identity-badge").onclick=()=>$("identity-panel").hidden=!$("identity-panel").hidden;
let keyEpoch=0;
async function loadKey(key){
  const epoch=++keyEpoch;
  try{
    if(!ready)throw Error("Chisel Noble signer unavailable");
    if(privateKey)throw Error("Lock current identity and reload before switching");
    const next=H.identityFromPrivateKey(key);
    const address=await H.litecoin.publicKeyHexToAddress(next.slice("chisel:v1:".length));
    if(epoch!==keyEpoch)return;
    privateKey=key;identity=next;
    $("identity-badge").textContent=address.slice(0,8)+"…"+address.slice(-5);$("identity-badge").title=address;
    $("identity-detail").textContent=address+" · "+next;refresh();
  }catch(e){if(epoch===keyEpoch)$("identity-detail").textContent=e.message;}
}
$("generate-key").onclick=()=>{if(!ready)return;const bytes=crypto.getRandomValues(new Uint8Array(32));const key=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");bytes.fill(0);loadKey(key);};
$("load-key").onclick=()=>{const key=$("test-key").value.trim();$("test-key").value="";if(/^[0-9a-fA-F]{64}$/.test(key))loadKey(key.toLowerCase());else $("identity-detail").textContent="Expected 64 hex characters";};
$("lock-key").onclick=()=>{keyEpoch++;privateKey="";identity="";$("test-key").value="";$("identity-badge").textContent="Identity: locked";$("identity-badge").removeAttribute("title");$("identity-detail").textContent="Locked. Reload to start a new identity and session.";for(const c of peers.values())c.close();if(peer)peer.destroy();refresh();};
if(!ready){status("Chisel SDK unavailable; signing disabled.");return;}
if(!window.Peer){status("PeerJS failed to load. Reload with an internet connection.");return;}
try{peer=new Peer(C.sessionId(),{debug:1});}catch(e){status("Unable to generate a secure session ID: "+String(e));return;}
peer.on("open",id=>{
  ownId=id;signaling=true;$("own-id").textContent=id;invite=new URL("signed-peer.html",location.href);invite.searchParams.set("connect",id);invite=invite.href;
  $("invite").href=invite;$("invite").textContent=invite;$("invite").hidden=false;$("copy").disabled=false;$("copy-id").disabled=false;
  try{if(!window.QRCode)throw Error("QR unavailable");$("qr").replaceChildren();$("qr").hidden=false;new QRCode($("qr"),{text:invite,width:200,height:200,correctLevel:QRCode.CorrectLevel.M});}catch{$("qr").hidden=true;}
  status("Ready. Share your pairing link or connect to another peer.");refresh();
});
peer.on("connection",c=>attach(c,true));
peer.on("disconnected",()=>{signaling=false;status("Signaling disconnected. Existing data channels may remain open.");refresh();try{peer.reconnect();}catch{}});
peer.on("close",()=>{signaling=false;peers.clear();pending.clear();$("qr").hidden=true;$("invite").hidden=true;$("copy").disabled=true;$("copy-id").disabled=true;renderPending();refresh();status("Peer closed. Reload to start a new session.");});
peer.on("error",e=>{status("PeerJS: "+String(e));refresh();});
})();
