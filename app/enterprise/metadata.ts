import {DOMParser} from '@xmldom/xmldom';
import {safeHttpUrl} from '../api/integrations/security';
export function validSaml(xml:string){
 if(!xml||xml.length>100000||/<!DOCTYPE|<!ENTITY|PRIVATE KEY/i.test(xml))return false;
 let invalid=false;
 try{
  const doc=new DOMParser({errorHandler:()=>{invalid=true}}).parseFromString(xml,'application/xml');
  const ns='urn:oasis:names:tc:SAML:2.0:metadata',root=doc.documentElement;
  if(invalid||root.namespaceURI!==ns||!['EntityDescriptor','EntitiesDescriptor'].includes(root.localName))return false;
  return Array.from(doc.getElementsByTagNameNS(ns,'IDPSSODescriptor')).some(idp=>idp.parentNode?.nodeType===1&&
   !!(idp.parentNode as Element).getAttribute('entityID')&&
   (idp.getAttribute('protocolSupportEnumeration')||'').split(/\s+/).includes('urn:oasis:names:tc:SAML:2.0:protocol')&&
   Array.from(idp.getElementsByTagNameNS(ns,'SingleSignOnService')).some(service=>!!safeHttpUrl(service.getAttribute('Location'))));
 }catch{return false}
}
