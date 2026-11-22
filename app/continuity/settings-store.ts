import {completedInitialization} from "../completed-initialization";
import {coreReferenceGuard} from "../core-reference-write";

const initialization=completedInitialization();
const schema=[
`CREATE TABLE IF NOT EXISTS enterprise_continuity_plan_settings (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, plan_id TEXT NOT NULL UNIQUE,
  exercise_frequency TEXT, next_exercise_date TEXT, asset_refs TEXT NOT NULL DEFAULT '[]', supplier_refs TEXT NOT NULL DEFAULT '[]'
)`,
`INSERT OR IGNORE INTO enterprise_continuity_plan_settings(sequence,plan_id)
SELECT CAST(substr(code,5) AS INTEGER),id FROM enterprise_continuity_plans
WHERE code GLOB 'BCP-[0-9]*' AND substr(code,5) NOT GLOB '*[^0-9]*'
  AND code=printf('BCP-%03d',CAST(substr(code,5) AS INTEGER)) AND CAST(substr(code,5) AS INTEGER)>0
ORDER BY created_at,id`,
`INSERT INTO enterprise_continuity_plan_settings(plan_id)
SELECT id FROM enterprise_continuity_plans p WHERE NOT EXISTS
  (SELECT 1 FROM enterprise_continuity_plan_settings s WHERE s.plan_id=p.id) ORDER BY created_at,id`,
`CREATE TRIGGER IF NOT EXISTS continuity_plan_settings_insert AFTER INSERT ON enterprise_continuity_plans
BEGIN
  INSERT OR IGNORE INTO enterprise_continuity_plan_settings(sequence,plan_id)
  SELECT CAST(substr(NEW.code,5) AS INTEGER),NEW.id
    WHERE NEW.code=printf('BCP-%03d',CAST(substr(NEW.code,5) AS INTEGER)) AND CAST(substr(NEW.code,5) AS INTEGER)>0;
  INSERT INTO enterprise_continuity_plan_settings(plan_id) SELECT NEW.id
    WHERE NOT EXISTS(SELECT 1 FROM enterprise_continuity_plan_settings WHERE plan_id=NEW.id);
END`
];

export async function ensureContinuitySettings(db:D1Database){
  await initialization(db,async()=>{
    const installed=await db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='continuity_plan_settings_insert'").first();
    if(!installed)await db.batch(schema.map(sql=>db.prepare(sql)));
  });
}
export const settingsProjection="s.sequence,s.exercise_frequency,s.next_exercise_date,s.asset_refs,s.supplier_refs";
export const settingsJoin=" LEFT JOIN enterprise_continuity_plan_settings s ON s.plan_id=p.id ";
export async function readSettings(db:D1Database,id:string){
  return await db.prepare("SELECT "+settingsProjection+" FROM enterprise_continuity_plan_settings s WHERE plan_id=?").bind(id).first<Record<string,unknown>>()||{};
}
export type PlanSettings={exerciseFrequency:string;nextExerciseDate:string;assetRefs:string[];supplierRefs:string[]};
export function settingsWrite(db:D1Database,id:string,settings:PlanSettings){
  return db.prepare("UPDATE enterprise_continuity_plan_settings SET exercise_frequency=?,next_exercise_date=?,asset_refs=?,supplier_refs=? WHERE plan_id=? AND changes()=1")
    .bind(settings.exerciseFrequency||null,settings.nextExerciseDate||null,JSON.stringify(settings.assetRefs),JSON.stringify(settings.supplierRefs),id);
}
export function dependencyGuard(id:string,x:PlanSettings,bia?:string){
  const targets=[
    ...(bia?[{field:"bia_ref",modules:["BIA"],value:bia}]:[]),
    ...x.assetRefs.map(value=>({field:"asset_refs",modules:["Varlık Envanteri"],value})),
    ...x.supplierRefs.map(value=>({field:"supplier_refs",modules:["Tedarikçiler"],value})),
  ];
  return coreReferenceGuard(targets.map(t=>({...t,sourceId:id,value:t.value.toLowerCase()})));
}
