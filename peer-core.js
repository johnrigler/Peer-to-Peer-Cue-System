(function(root){
"use strict";
const CUES=Object.freeze(["Reset","Go","Fade","Off"]);
function id(value){
  if(typeof value!=="string" || value.length>128 || !/^[a-zA-Z0-9]+(?:[-_ ][a-zA-Z0-9]+)*$/.test(value))throw Error("Invalid PeerJS session ID");
  return value;
}
function invite(base,value){
  const u=new URL("peer.html",base);u.search="";u.hash="";u.searchParams.set("connect",id(value));return u.href;
}
function fromInput(value){
  const s=String(value).trim();
  if(/^https?:\/\//i.test(s)){
    const u=new URL(s);if(u.username||u.password)throw Error("Invalid pairing URL");
    return id(u.searchParams.get("connect"));
  }
  return id(s);
}
function fromLocation(href){const u=new URL(href);return u.searchParams.has("connect")?id(u.searchParams.get("connect")):"";}
function decode(value){
  if(typeof value!=="string"||!value.length||value.length>4096)return null;
  return {type:CUES.includes(value)?"cue":"text",value};
}
function encodeText(value){const data=decode(value);if(!data||data.type!=="text")throw Error("Enter text, or use the separate cue buttons for reserved cue words.");return data.value;}
const api={CUES,id,invite,fromInput,fromLocation,decode,encodeText};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.CuePeerCore=api;
})(typeof window!=="undefined"?window:globalThis);
