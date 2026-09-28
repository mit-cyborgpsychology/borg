import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [ip, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(ip,prefix,'ipv4');
for (const [ip,prefix] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['2002::',16],['2001::',32]]) blocked.addSubnet(ip,prefix,'ipv6');
export function isPublicAddress(address) {
 const family=isIP(address);
 return Boolean(family && !blocked.check(address,family===4?'ipv4':'ipv6'));
}
export function publicUrl(value) {
 if(typeof value!=='string' || value.length>2048) throw new Error('Enter a valid public paper URL.');
 const url=new URL(value.trim());
 const host=url.hostname.replace(/^\[|\]$/g,'');
 if(!['http:','https:'].includes(url.protocol) || url.username || url.password || url.port || !host.includes('.') && !isIP(host) || (isIP(host) && !isPublicAddress(host))) throw new Error('Enter a public HTTP or HTTPS paper URL.');
 url.hash='';
 return url.href;
}
// Validate the addresses used by the actual socket, not a separate DNS preflight.
export function publicLookup(host,options,callback) {
 lookup(host,{all:true,verbatim:true},(error,addresses)=>{
  if(error) return callback(error);
  if(!addresses.length || addresses.some(a=>!isPublicAddress(a.address))) return callback(new Error('Private addresses are not allowed'));
  if(options.all) callback(null,addresses);
  else callback(null,addresses[0].address,addresses[0].family);
 });
}
export async function fetchPublic(value, options={}, redirects=0) {
 const url=new URL(publicUrl(String(value)));
 if(redirects>5) throw new Error('Too many redirects');
 return new Promise((resolve,reject)=>{
  const request=(url.protocol==='https:'?https:http).request(url,{
   method:'GET',headers:{...options.headers,'Accept-Encoding':'identity'},lookup:publicLookup,
   signal:options.signal || AbortSignal.timeout(20_000), agent:false
  },response=>{
   const status=response.statusCode || 502;
   if([301,302,303,307,308].includes(status) && response.headers.location){
    response.resume();
    resolve(fetchPublic(new URL(response.headers.location,url).href,options,redirects+1));return;
   }
   const chunks=[];let size=0;
   response.on('data',chunk=>{
    size+=chunk.length;
    if(size>25*1024*1024){response.destroy(new Error('Paper download exceeds 25 MB'));return;}
    chunks.push(chunk);
   });
   response.on('error',reject);
   response.on('end',()=>{
    const headers=new Headers();
    for(const [key,val] of Object.entries(response.headers)) if(val!==undefined) headers.set(key,Array.isArray(val)?val.join(', '):val);
    const result=new Response([204,205,304].includes(status)?null:Buffer.concat(chunks),{status,headers});
    Object.defineProperty(result,'url',{value:url.href});resolve(result);
   });
  });
  request.on('error',reject);request.end();
 });
}
