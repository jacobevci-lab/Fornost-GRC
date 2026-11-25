import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import {
  SAML,
  ValidateInResponseTo,
  InMemoryCacheProvider,
} from "@node-saml/node-saml";
import { X509Certificate } from "node:crypto";
import { BridgeError } from "./directory.mjs";

export async function samlClient(
  input,
  { appOrigin, privateKey, publicCert },
  verify = false,
) {
  const c = input.sso;
  if (
    !c ||
    typeof c.idpCertificate !== "string" ||
    c.idpCertificate.length > 16000 ||
    typeof c.entityId !== "string" ||
    !c.entityId ||
    typeof c.idpIssuer !== "string" ||
    !c.idpIssuer
  )
    throw new BridgeError("configuration", 422);
  const callback = new URL(c.acsUrl),
    entryPoint = new URL(c.entryPoint);
  if (
    callback.origin !== appOrigin ||
    callback.protocol !== "https:" ||
    !callback.pathname.endsWith("/api/auth/saml") ||
    callback.search ||
    callback.hash ||
    entryPoint.protocol !== "https:" ||
    entryPoint.username ||
    entryPoint.password
  )
    throw new BridgeError("configuration", 422);
  const cert = new X509Certificate(c.idpCertificate);
  if (
    Date.parse(cert.validTo) < Date.now() ||
    Date.parse(cert.validFrom) > Date.now()
  )
    throw new BridgeError("idp_certificate_expired", 422);
  const cache = new InMemoryCacheProvider({ keyExpirationPeriodMs: 300_000 });
  if (verify) {
    if (
      !/^_[a-f0-9]{64}$/.test(input.requestId) ||
      typeof input.issuedAt !== "string" ||
      !Number.isFinite(Date.parse(input.issuedAt)) ||
      Date.parse(input.issuedAt) > Date.now() + 30000 ||
      Date.now() - Date.parse(input.issuedAt) > 300000
    )
      throw new BridgeError("invalid_state", 401);
    await cache.saveAsync(input.requestId, input.issuedAt);
  }
  return new SAML({
    callbackUrl: callback.href,
    entryPoint: entryPoint.href,
    issuer: c.entityId,
    idpIssuer: c.idpIssuer,
    idpCert: c.idpCertificate,
    audience: c.entityId,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true,
    validateInResponseTo: ValidateInResponseTo.always,
    requestIdExpirationPeriodMs: 300_000,
    maxAssertionAgeMs: 300_000,
    acceptedClockSkewMs: 30000,
    cacheProvider: cache,
    generateUniqueId: () => input.requestId,
    signatureAlgorithm: "sha256",
    digestAlgorithm: "sha256",
    disableRequestedAuthnContext: true,
    ...(privateKey ? { privateKey, publicCert } : {}),
  });
}
export async function samlOperation(action, input, runtime) {
  if (action === "test") {
    await samlClient(input, runtime);
    return { ok: true, configurationVerified: true };
  }
  if (!/^_[a-f0-9]{64}$/.test(input.requestId))
    throw new BridgeError("invalid_state", 401);
  const client = await samlClient(input, runtime, action === "verify");
  if (action === "start") {
    if (!/^[a-f0-9]{64}$/.test(input.state))
      throw new BridgeError("invalid_state", 401);
    return {
      ok: true,
      url: await client.getAuthorizeUrlAsync(input.state, {}),
    };
  }
  if (
    action !== "verify" ||
    typeof input.SAMLResponse !== "string" ||
    input.SAMLResponse.length > 192_000
  )
    throw new BridgeError("invalid_response", 401);
  const xml = Buffer.from(input.SAMLResponse, "base64").toString("utf8");
  if (/<!DOCTYPE|<!ENTITY|xmldsig#(?:rsa-sha1|sha1)/i.test(xml))
    throw new BridgeError("invalid_response", 401);
  // Read endpoint constraints only from the cryptographically verified response.
  // node-saml 5.x warns about Destination/Recipient mismatches instead of rejecting them.
  const parser = new DOMParser({
    errorHandler: {
      warning() {},
      error() {
        throw new BridgeError("invalid_response", 401);
      },
      fatalError() {
        throw new BridgeError("invalid_response", 401);
      },
    },
  });
  const root = parser.parseFromString(xml, "text/xml").documentElement;
  const signatures = Array.from(root.childNodes).filter(
    (n) =>
      n.localName === "Signature" &&
      n.namespaceURI === "http://www.w3.org/2000/09/xmldsig#",
  );
  if (
    root.localName !== "Response" ||
    root.namespaceURI !== "urn:oasis:names:tc:SAML:2.0:protocol" ||
    signatures.length !== 1
  )
    throw new BridgeError("invalid_response", 401);
  const signature = new SignedXml({
    publicCert: input.sso.idpCertificate,
    getCertFromKeyInfo: () => null,
  });
  signature.loadSignature(signatures[0]);
  if (
    !signature.checkSignature(xml) ||
    signature.getSignedReferences().length !== 1
  )
    throw new BridgeError("invalid_response", 401);
  const verified = parser.parseFromString(
    signature.getSignedReferences()[0],
    "text/xml",
  ).documentElement;
  if (
    verified.localName !== "Response" ||
    verified.getAttribute("Destination") !== input.sso.acsUrl ||
    verified.getAttribute("InResponseTo") !== input.requestId
  )
    throw new BridgeError("invalid_response", 401);
  const { profile, loggedOut } = await client.validatePostResponseAsync({
    SAMLResponse: input.SAMLResponse,
  });
  const assertion = profile?.getAssertion?.();
  const confirmations =
    assertion?.Assertion?.Subject?.[0]?.SubjectConfirmation || [];
  const validBearer = confirmations.some((c) => {
    const a = c.SubjectConfirmationData?.[0]?.$;
    return (
      c.$?.Method === "urn:oasis:names:tc:SAML:2.0:cm:bearer" &&
      a?.Recipient === input.sso.acsUrl &&
      a.InResponseTo === input.requestId &&
      Number.isFinite(Date.parse(a.NotOnOrAfter)) &&
      Date.parse(a.NotOnOrAfter) > Date.now() - 30000
    );
  });
  if (!validBearer) throw new BridgeError("invalid_response", 401);
  const email =
    profile?.email ||
    profile?.mail ||
    profile?.[
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
    ];
  if (
    loggedOut ||
    !profile ||
    profile.nameIDFormat !==
      "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent" ||
    typeof profile.nameID !== "string" ||
    !profile.nameID ||
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+$/.test(email)
  )
    throw new BridgeError("identity_attributes", 401);
  return { ok: true, subject: profile.nameID, email: email.toLowerCase() };
}
