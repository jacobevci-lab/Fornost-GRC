"""Import OWASP's pinned ASVS 5.0.0 release. Content remains CC BY-SA 4.0.
Usage: python scripts/generate-asvs-catalog.py /path/to/OWASP-ASVS
"""
import json,hashlib,subprocess,sys
from pathlib import Path
root=sys.argv[1];commit='5cf9b032440be53ce345ab3c130fda46ba1ce7a2';path='5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.flat.json'
raw=subprocess.check_output(['git','-C',root,'show',f'{commit}:{path}']);data=json.loads(raw)['requirements']
source=f'https://github.com/OWASP/ASVS/blob/{commit}/{path}'
rows=[dict(ref='v5.0.0-'+r['req_id'].removeprefix('V'),title=r['section_name']+' · '+r['req_id'],category=r['chapter_name'],owner='Uygulama Güvenliği',statement=r['req_description'],guidance='ASVS level '+r['L']+'. © 2008–2025 OWASP Foundation. CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/ . Format converted to Fornost catalog; requirement text unchanged.',assessment='',parentRef='') for r in data]
assert len(rows)==len({r['ref'] for r in rows})
payload=dict(name='OWASP ASVS 5.0.0',revision='5.0.0',source=source,sourceSha256=hashlib.sha256(raw).hexdigest(),sourceCommit=commit,license='CC-BY-SA-4.0',withdrawn=[],requirements=rows)
Path('app/api/grc/catalog-data/owasp-asvs.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n')
Path('app/asvs-catalog-manifest.json').write_text(json.dumps({k:v for k,v in payload.items() if k!='requirements'}|dict(count=len(rows)),indent=2)+'\n')
license_text=subprocess.check_output(['git','-C',root,'show',f'{commit}:5.0/en/0x01-Frontispiece.md'],text=True)
Path('app/api/grc/catalog-data/OWASP-ASVS-NOTICE.md').write_text(license_text+'\n\nFornost conversion: requirement identifiers are version-qualified; descriptions are unchanged. The converted catalog remains licensed under CC BY-SA 4.0. No OWASP endorsement is implied.\nSource: '+source+'\n')
print(len(rows))
