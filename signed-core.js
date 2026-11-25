(function(root){
"use strict";
const TYPE="cue-system-message-v1", CUES=["Reset","Go","Fade","Off"];
function payload(p){
  if(!p || typeof p!=="object" || Object.keys(p).sort().join(",")!=="from,nonce,to,value,verb")throw Error("Invalid packet fields");
  for(const key of ["from","to","nonce"])if(typeof p[key]!=="string"||!p[key]||p[key].length>128||!/^[a-zA-Z0-9]+(?:[-_ ][a-zA-Z0-9]+)*$/.test(p[key]))throw Error("Invalid session or nonce");
  if(!/^[0-9a-f]{32}$/.test(p.nonce))throw Error("Invalid nonce");
  if(p.verb==="cue"?!CUES.includes(p.value):p.verb!=="send"||typeof p.value!=="string"||!p.value.length||p.value.length>4096)throw Error("Invalid verb or value");
  return {from:p.from,to:p.to,nonce:p.nonce,verb:p.verb,value:p.value};
}
async function sign(chisel,key,p){return JSON.stringify(await chisel.signArtifact({privateKeyHex:key,type:TYPE,payload:payload(p)}));}
function receiver(chisel,local,remote){
  const seen=new Set();let identity="";
  return async function(raw){
    if(typeof raw!=="string"||raw.length>32000)throw Error("Invalid wire packet");
    const e=JSON.parse(raw);
    if(!e||e.type!==TYPE||typeof e.identity!=="string"||!/^chisel:v1:0[23][0-9a-f]{64}$/.test(e.identity))throw Error("Expected signed Chisel packet");
    const p=payload(e.payload);
    if(p.from!==remote||p.to!==local)throw Error("Wrong session");
    if(identity&&identity!==e.identity)throw Error("Peer identity changed; reconnect to accept a new identity");
    if(seen.has(p.nonce))throw Error("Replay rejected");
    if(seen.size>=10000)throw Error("Session message limit; reconnect with new session ID");
    if(!await chisel.verifyArtifact(e))throw Error("Signature verification failed");
    if(identity&&identity!==e.identity)throw Error("Peer identity changed");
    if(seen.has(p.nonce)||seen.size>=10000)throw Error("Replay or session limit");
    identity=e.identity;seen.add(p.nonce);
    return {...p,identity,verified:true};
  };
}
const api={TYPE,payload,sign,receiver};if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.CueSigned=api;
})(typeof window!=="undefined"?window:globalThis);
