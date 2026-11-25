import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { SignedXml } from "xml-crypto";
import { samlOperation, samlClient } from "./saml.mjs";
const dir = mkdtempSync(join(tmpdir(), "fornost-saml-"));
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(dir, "key.pem"),
    "-out",
    join(dir, "cert.pem"),
    "-subj",
    "/CN=Fornost test IdP",
    "-days",
    "1",
  ],
  { stdio: "ignore" },
);
after(() => rmSync(dir, { recursive: true, force: true }));
const key = readFileSync(join(dir, "key.pem"), "utf8"),
  cert = readFileSync(join(dir, "cert.pem"), "utf8");
const requestId = "_" + "a".repeat(64),
  runtime = { appOrigin: "https://app.example.com" },
  sso = {
    idpCertificate: cert,
    entityId: "fornost-test",
    idpIssuer: "https://idp.example.com",
    acsUrl: "https://app.example.com/api/auth/saml",
    entryPoint: "https://idp.example.com/sso",
  };
const now = () => new Date().toISOString();
function sign(xml, element) {
  const signer = new SignedXml({
    privateKey: key,
    publicCert: cert,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
  });
  signer.addReference({
    xpath: `//*[local-name(.)='${element}']`,
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });
  signer.computeSignature(xml, {
    location: {
      reference: `//*[local-name(.)='${element}']/*[local-name(.)='Issuer']`,
      action: "after",
    },
  });
  return signer.getSignedXml();
}
function response({
  issuer = sso.idpIssuer,
  audience = sso.entityId,
  inResponseTo = requestId,
  recipient = sso.acsUrl,
  destination = sso.acsUrl,
  expiry = Date.now() + 120000,
  assertionSigned = true,
  responseSigned = true,
} = {}) {
  const end = new Date(expiry).toISOString();
  let xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_response" Version="2.0" IssueInstant="${now()}" Destination="${destination}" InResponseTo="${inResponseTo}"><saml:Issuer>${issuer}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status><saml:Assertion ID="_assertion" Version="2.0" IssueInstant="${now()}"><saml:Issuer>${issuer}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">immutable-user-1</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${inResponseTo}" Recipient="${recipient}" NotOnOrAfter="${end}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${new Date(Date.now() - 30000).toISOString()}" NotOnOrAfter="${end}"><saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${now()}" SessionIndex="test-session"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement><saml:Attribute Name="email"><saml:AttributeValue>user@example.com</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion></samlp:Response>`;
  if (assertionSigned) xml = sign(xml, "Assertion");
  if (responseSigned) xml = sign(xml, "Response");
  return xml;
}
const input = (xml) => ({
  sso,
  requestId,
  issuedAt: now(),
  SAMLResponse: Buffer.from(xml).toString("base64"),
});
test("SAML validates signed response and assertion and yields persistent identity", async () => {
  const result = await samlOperation("verify", input(response()), runtime);
  assert.deepEqual(result, {
    ok: true,
    subject: "immutable-user-1",
    email: "user@example.com",
  });
  const url = new URL(
    (
      await samlOperation(
        "start",
        { sso, requestId, state: "b".repeat(64) },
        runtime,
      )
    ).url,
  );
  assert.equal(url.origin, "https://idp.example.com");
  assert.ok(url.searchParams.get("SAMLRequest"));
  assert.equal(url.searchParams.get("RelayState"), "b".repeat(64));
});
test("SAML rejects wrong issuer/audience/request, expired, unsigned and tampered assertions", async () => {
  for (const overrides of [
    { issuer: "https://evil.example.com" },
    { audience: "other" },
    { recipient: "https://other.example.com/acs" },
    { destination: "https://other.example.com/acs" },
    { inResponseTo: "_" + "c".repeat(64) },
    { expiry: Date.now() - 120000 },
    { assertionSigned: false },
    { responseSigned: false },
  ])
    await assert.rejects(
      samlOperation("verify", input(response(overrides)), runtime),
      JSON.stringify(overrides),
    );
  await assert.rejects(
    samlOperation(
      "verify",
      input(response().replace("user@example.com", "admin@example.com")),
      runtime,
    ),
  );
  await assert.rejects(
    samlOperation("verify", input("<!DOCTYPE root>" + response()), runtime),
  );
});
test("SAML cache consumes request once and rejects replay; callback configuration is pinned", async () => {
  const i = input(response()),
    client = await samlClient(i, runtime, true);
  await client.validatePostResponseAsync({ SAMLResponse: i.SAMLResponse });
  await assert.rejects(
    client.validatePostResponseAsync({ SAMLResponse: i.SAMLResponse }),
  );
  await assert.rejects(
    samlClient(
      {
        ...i,
        sso: { ...sso, acsUrl: "https://evil.example.com/api/auth/saml" },
      },
      runtime,
      true,
    ),
  );
});
