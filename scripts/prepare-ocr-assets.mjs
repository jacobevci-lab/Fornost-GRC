import {mkdir,copyFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),target=path.join(root,'public/fornost-ocr');
await mkdir(target,{recursive:true});
for(const name of ['worker.min.js','worker.min.js.LICENSE.txt'])await copyFile(path.join(root,'node_modules/tesseract.js/dist',name),path.join(target,name));
for(const file of await readdir(path.join(root,'node_modules/tesseract.js-core'))){if(/\.wasm(?:\.js)?$/.test(file))await copyFile(path.join(root,'node_modules/tesseract.js-core',file),path.join(target,file));}
for(const lang of ['eng','tur'])await copyFile(path.join(root,`node_modules/@tesseract.js-data/${lang}/4.0.0/${lang}.traineddata.gz`),path.join(target,`${lang}.traineddata.gz`));

for(const [pkg,file] of [['tesseract.js','LICENSE.md'],['tesseract.js-core','LICENSE']])await copyFile(path.join(root,'node_modules',pkg,file),path.join(target,pkg+'-LICENSE.txt'));
