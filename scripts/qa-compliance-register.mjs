// Register-specific suites enter the secondary register through its normal UI.
export async function openComplianceRegister(page,label){
  if(!['Uyum Yönetimi','Compliance Management'].includes(label))return;
  const entry=page.getByRole('button',{name:/^(Custom requirements and existing records|Özel gereksinimler ve mevcut kayıtlar)$/});
  await entry.or(page.getByRole('button',{name:/^(Back to framework matrix|Çerçeve matrisine dön)$/})).first().waitFor();
  if(await entry.isVisible())await entry.click();
}
