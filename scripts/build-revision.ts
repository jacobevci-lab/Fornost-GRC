import {execFileSync} from 'node:child_process';
export function resolveBuildRevision(env:Record<string,string|undefined>=process.env,readGit:()=>string=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()){
 const explicit=env.FORNOST_BUILD_REVISION;
 if(explicit!==undefined){if(!/^[a-f0-9]{40}$/.test(explicit))throw new Error('FORNOST_BUILD_REVISION must be a full lowercase Git commit SHA');return explicit;}
 try{const revision=readGit();if(/^[a-f0-9]{40}$/.test(revision))return revision;}catch{}
 return /^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')?env.GITHUB_SHA!:'unknown';
}
