/** Explicit native model relations. Audit history deliberately does not block draft deletion. */
export const aiModelRelations = [
  {table:'ai_control_assessments',column:'model_id'},
  {table:'ai_model_changes',column:'model_id'},
  {table:'ai_model_monitoring',column:'model_id'},
  {table:'ai_incidents',column:'model_id'},
  {table:'ai_evidence',column:'model_id'},
  {table:'ai_risks',column:'model_id'},
  {table:'ai_vendor_assessments',column:'model_id'},
  {table:'ai_access_assignments',column:'model_id'},
  {table:'ai_release_gates',column:'model_id'},
  {table:'ai_impact_assessments',column:'model_id'},
  {table:'ai_resilience_plans',column:'model_id'},
  {table:'ai_resilience_exercises',column:'model_id'},
  {table:'ai_datasets',column:'model_id'},
  {table:'ai_regulatory_profiles',column:'model_id'},
  {table:'ai_regulatory_obligations',column:'model_id'},
  {table:'ai_literacy_records',column:'model_id'},
  {table:'ai_model_artifacts',column:'model_id'},
  {table:'ai_red_team_campaigns',column:'model_id'},
  {table:'ai_transparency_profiles',column:'model_id'},
  {table:'ai_oversight_events',column:'model_id'},
  {table:'ai_assurance_policies',column:'model_id'},
  {table:'ai_exceptions',column:'model_id'},
  {table:'ai_decommission_plans',column:'model_id'},
  {table:'ai_decommission_plans',column:'replacement_model_id'},
  {table:'ai_findings',column:'model_id'},
  {table:'ai_assurance_alerts',column:'model_id'},
  {table:'ai_assurance_packages',column:'model_id'},
 ] as const;

/** Fixed identifiers only; model IDs remain bound parameters in the DELETE. */
export const unreferencedAiModelSql = aiModelRelations.map(({table,column})=>
  `NOT EXISTS(SELECT 1 FROM ${table} WHERE ${column}=ai_model_inventory.id)`
).join(' AND ');
