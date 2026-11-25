import {fixture} from "./enterprise-route-fixture";

export function kriFixture(){
  const f=fixture("risk-appetite");
  f.sqlite.exec(`CREATE TABLE local_users(id TEXT PRIMARY KEY,name TEXT,email TEXT,role TEXT,status TEXT);
    CREATE TABLE user_module_access(user_id TEXT PRIMARY KEY,policy_json TEXT);`);
  for(const [id,role] of [["maker","Admin"],["owner","Editor"],["reviewer","Admin"]]){
    f.sqlite.prepare("INSERT INTO local_users VALUES(?,?,?,?, 'Active')").run(id,id,id+"@example.com",role);
  }
  f.setActor({id:"maker",email:"maker@example.com",name:"Maker",role:"Admin",source:"local"});
  return f;
}
