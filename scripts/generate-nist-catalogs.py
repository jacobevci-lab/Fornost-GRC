"""Generate pinned NIST catalogs from an authorized local clone of usnistgov/oscal-content.
Usage: python scripts/generate-nist-catalogs.py /path/to/oscal-content
Source repository is CC0. No network requests or runtime downloads are performed.
"""
import json, re, hashlib, subprocess, sys
from pathlib import Path
root=Path(sys.argv[1]); out=Path('app/api/grc/catalog-data')
commit=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
specs=[('nist-800-53','NIST SP 800-53 Rev. 5 (5.2.0)','SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json'),('nist-800-171','NIST SP 800-171 Rev. 3','SP800-171/rev3/json/NIST_SP800-171_rev3_catalog.json'),('nist-800-172','NIST SP 800-172 Rev. 3','SP800-172/rev3/json/NIST_SP800-172_rev3_catalog.json'),('nist-ssdf','NIST SSDF 1.1 (SP 800-218)','SP800-218/ver1/json/NIST_SP800-218_ver1_catalog.json')]
manifest=[]
for slug,name,relative in specs:
 path=root/'nist.gov'/relative; raw=path.read_bytes(); catalog=json.loads(raw)['catalog']; rows=[]; withdrawn=[]
 def props(n,key):return [p['value'] for p in n.get('props',[]) if p['name']==key and not p.get('class')]
 def ref(n):
  if slug=='nist-800-53':return (props(n,'label') or [n['id'].upper()])[0]
  if slug in ('nist-800-171','nist-800-172'):return props(n,'sort-id')[0]
  return n['id']
 def flatten(parts,depth=0):
  result=[]
  for p in parts:
   text=p.get('prose',''); label=(props(p,'label') or [''])[0]
   if text: result.append('  '*depth+(label+' ' if label else '')+text)
   result.extend(flatten(p.get('parts',[]),depth+1))
  return result
 def visit(n,category='',parent=''):
  for group in n.get('groups',[]):visit(group,group.get('title',category),parent)
  for control in n.get('controls',[]):
   reference=ref(control)
   if 'withdrawn' in props(control,'status'):withdrawn.append(reference)
   else:
    params={p['id']:p for p in control.get('params',[])}
    def resolve(text):
     def replace(m):
      key=m.group(1).strip();p=params.get(key,{})
      label=p.get('label') or '; '.join(p.get('select',{}).get('choice',[])) or key
      return '[Organization-defined: '+label+']'
     for _ in range(10):
      updated=re.sub(r'\{\{\s*insert:\s*param,\s*([^}]+)\}\}',replace,text)
      if updated==text: break
      text=updated
     assert '{{ insert:' not in text, 'Unresolved parameter'
     return text
    def part(names):return resolve('\n'.join(flatten([p for p in control.get('parts',[]) if p['name'] in names])))
    statement=part(['statement'])
    assert statement,reference
    rows.append(dict(ref=reference,title=control['title'],category=category,owner='Atanmadı',statement=statement,guidance=part(['guidance']),assessment=part(['assessment-objective','assessment-method']),parentRef=parent))
   visit(control,category,reference)
 visit(catalog)
 assert len(rows)==len({r['ref'] for r in rows})
 payload=dict(name=name,revision=catalog['metadata']['version'],source=f'https://github.com/usnistgov/oscal-content/blob/{commit}/nist.gov/{relative}',sourceSha256=hashlib.sha256(raw).hexdigest(),sourceCommit=commit,license='CC0-1.0',withdrawn=withdrawn,requirements=rows)
 (out/(slug+'.json')).write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n')
 manifest.append({k:v for k,v in payload.items() if k!='requirements'}|dict(slug=slug,count=len(rows),families=len(catalog.get('groups',[]))))
 print(name,len(rows),'active',len(withdrawn),'withdrawn')
Path('app/nist-catalog-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
# Preserve the full CSF Core subcategory statements alongside the Turkish labels.
csf_path=root/'nist.gov/CSF/v2.0/json/NIST_CSF_v2.0_catalog.json';raw=csf_path.read_bytes();csf=json.loads(raw)['catalog'];statements={}
for function in csf['groups']:
 for category in function['controls']:
  for subcategory in category['controls']:
   if any(p['name']=='status' and p['value']=='withdrawn' for p in subcategory.get('props',[])):continue
   statements[subcategory['id']]='\n'.join(p.get('prose','') for p in subcategory.get('parts',[]) if p['name']=='statement')
assert len(statements)==106 and all(statements.values())
(out/'nist-csf-statements.json').write_text(json.dumps(dict(source=f'https://github.com/usnistgov/oscal-content/blob/{commit}/nist.gov/CSF/v2.0/json/NIST_CSF_v2.0_catalog.json',sourceSha256=hashlib.sha256(raw).hexdigest(),statements=statements),ensure_ascii=False,indent=2)+'\n')
