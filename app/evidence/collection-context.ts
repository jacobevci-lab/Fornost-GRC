import { normalizeEvidenceControlRef, splitEvidenceControlRefs } from "./versioning";

export function sharedCollectionControl(left: string, right: string) {
  const refs = new Set(splitEvidenceControlRefs(left).map(normalizeEvidenceControlRef));
  return splitEvidenceControlRefs(right).some(ref => refs.has(normalizeEvidenceControlRef(ref)));
}
