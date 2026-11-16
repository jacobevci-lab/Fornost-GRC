/** Navigation contract shared by existing audit regression journeys. */
export async function openAuditSection(page,section){
 const main=section==='requests'?'Evidence requests':['closure','reports'].includes(section)?'Report and closure':'Workspace';
 await page.getByRole('tab',{name:main,exact:true}).click();
 const action={plan:'Plan and team',workpapers:'All tests',readiness:'Evidence readiness',requirements:'Advanced register',reports:'Reports'}[section];
 if(action)await page.getByRole('button',{name:action,exact:true}).click();
}
