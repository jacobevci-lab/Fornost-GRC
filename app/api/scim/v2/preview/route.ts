import {identityDb} from '../../../auth/security';
import {readBoundedJsonObject} from '../../../request-body';
import {ensureEnterprise} from '../../../../enterprise/schema';
import {tokenValid,directory,previewUser} from '../../../../enterprise/directory';
import {reply,failure} from '../../../../enterprise/http';
export async function POST(req:Request){
 try{
  const db=await identityDb();await ensureEnterprise(db);
  if(!await tokenValid(db,req.headers.get('authorization')))return reply({code:'unauthorized'},401);
  return reply(previewUser(await readBoundedJsonObject(req,24000),(await directory(db)).rules));
 }catch(e){return failure(e)}
}
