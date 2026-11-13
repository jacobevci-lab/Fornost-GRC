import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('actual Worker accepts the cloud QA DOCX while enforcing exact expanded size and CRC',async()=>{
 const script=(await build({stdin:{contents:"import {validateOfficeContainer} from './app/evidence/office-container.ts'; export default {async fetch(r){try{validateOfficeContainer(new Uint8Array(await r.arrayBuffer()),'docx');return new Response('valid')}catch(error){return new Response(String(error.stack),{status:400})}}}",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'neutral',mainFields:['module','main'],external:['node:zlib']})).outputFiles[0].text;
 // This is a disposable local runtime unit test, without source upload, app server or external fetches.
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2025-09-01',compatibilityFlags:['nodejs_compat'],cf:false}));
 try{
  const original=await readFile('tests/fixtures/policy-import-python-docx.docx');
  const check=async(bytes,status)=>{const r=await worker.dispatchFetch('http://unit.test/',{method:'POST',body:bytes});assert.equal(r.status,status,await r.text())};
  await check(original,200);
  const directory=original.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));assert.ok(directory>0);
  const tooSmall=Buffer.from(original),size=tooSmall.readUInt32LE(directory+24),local=tooSmall.readUInt32LE(directory+42);
  tooSmall.writeUInt32LE(size-1,directory+24);tooSmall.writeUInt32LE(size-1,local+22);await check(tooSmall,400);
  const crc=Buffer.from(original),changed=(crc.readUInt32LE(directory+16)^1)>>>0;
  crc.writeUInt32LE(changed,directory+16);crc.writeUInt32LE(changed,local+14);await check(crc,400);
  await check(original.subarray(0,original.length-1),400);
 }finally{await worker.dispose()}
});
