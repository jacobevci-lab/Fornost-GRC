// The deploy check uses the existing authenticated QA session and reads an optional
// exercise. It never starts an exercise or changes a production record.
import { inventory, title } from './records.mjs';
import { matchOne, resumeContext, sessionOwner, verifyIncidentIdentity } from './resume.mjs';

export async function verifyDeployedIncident(read, loginEmail) {
  const incident = matchOne((await read('/api/incidents')).incidents, row => row.title === title.incident, 'incident', true);
  if (!incident) return 'No existing Entra incident to verify';
  const owner = sessionOwner(loginEmail, (await read('/api/auth')).user);
  const resume = await resumeContext(read, await inventory(read), owner);
  verifyIncidentIdentity(incident, resume);
  // Explain a previously rejected replay without logging either address.
  const rawMatch = [incident.declaredBy, incident.owner].every(email => email.toLowerCase() === loginEmail.toLowerCase());
  return rawMatch ? 'Existing Entra incident, participants and three linked records verified' :
    'Existing Entra incident and links verified using the canonical session email; the raw login spelling differed';
}
