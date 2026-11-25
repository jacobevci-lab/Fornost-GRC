import { withBasePath } from '../../base-path';
export async function localOcr(file:Blob){
 if(file.size>10485760)throw new Error('AI_FILE_SIZE');
 const bitmap=await createImageBitmap(file);const size=bitmap.width*bitmap.height;bitmap.close();if(size>20000000)throw new Error('AI_IMAGE_SIZE');
 const {createWorker,OEM}=await import('tesseract.js');
 const base=new URL(withBasePath('/fornost-ocr'),location.origin).href;
 const worker=await createWorker(['eng','tur'],OEM.LSTM_ONLY,{workerPath:base+'/worker.min.js',langPath:base,corePath:base,workerBlobURL:false,cacheMethod:'none'});
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([worker.recognize(file).then(r=>r.data.text.slice(0,160000)),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('AI_OCR_TIMEOUT')),60000);})]);}finally{clearTimeout(timer);await worker.terminate();}
}
