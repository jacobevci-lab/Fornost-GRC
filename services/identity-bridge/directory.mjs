import { Client, EqualityFilter, OrFilter } from "ldapts";

export class BridgeError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.status = status;
  }
}
export function directoryConfig(input, allowedHosts) {
  if (!input || typeof input !== "object")
    throw new BridgeError("configuration", 422);
  const c = input;
  if (
    typeof c.host !== "string" ||
    !allowedHosts.includes(c.host.toLowerCase()) ||
    !/^\d{1,5}$/.test(String(c.port)) ||
    Number(c.port) < 1 ||
    Number(c.port) > 65535 ||
    !["ldaps", "starttls"].includes(c.transport) ||
    !["sAMAccountName", "uid"].includes(c.usernameAttribute) ||
    !["objectGUID", "entryUUID"].includes(c.subjectAttribute)
  )
    throw new BridgeError("configuration", 422);
  for (const name of ["baseDn", "bindDn"])
    if (
      typeof c[name] !== "string" ||
      !c[name] ||
      c[name].length > 2048 ||
      /[\x00\r\n]/.test(c[name])
    )
      throw new BridgeError("configuration", 422);
  return c;
}
export async function directoryOperation(
  input,
  { allowedHosts, createClient = (options) => new Client(options) },
  test = false,
) {
  const c = directoryConfig(input.directory, allowedHosts);
  if (
    typeof input.bindPassword !== "string" ||
    !input.bindPassword ||
    input.bindPassword.length > 4096
  )
    throw new BridgeError("configuration", 422);
  if (
    !test &&
    (typeof input.username !== "string" ||
      !input.username.trim() ||
      input.username.length > 320 ||
      /[\x00\r\n]/.test(input.username) ||
      typeof input.password !== "string" ||
      !input.password ||
      input.password.length > 4096)
  )
    throw new BridgeError("invalid_credentials", 401);
  const tlsOptions = {
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
    servername: c.host,
  };
  async function connect() {
    const client = createClient({
      url: `${c.transport === "ldaps" ? "ldaps" : "ldap"}://${c.host}:${c.port}`,
      timeout: 7000,
      connectTimeout: 5000,
      autoReconnect: false,
      autoRebind: false,
      tlsOptions,
    });
    try {
      if (c.transport === "starttls") await client.startTLS(tlsOptions);
      return client;
    } catch (e) {
      await client.unbind().catch(() => {});
      throw e;
    }
  }
  const service = await connect();
  let entry;
  try {
    await service.bind(c.bindDn, input.bindPassword);
    if (test) {
      const result = await service.search(c.baseDn, {
        scope: "base",
        filter: "(objectClass=*)",
        sizeLimit: 1,
        timeLimit: 5,
        attributes: ["dn"],
      });
      if (result.searchEntries.length !== 1)
        throw new BridgeError("base_dn_unavailable");
      return { ok: true, bindVerified: true };
    }
    const filter = new OrFilter({
      filters: [
        new EqualityFilter({
          attribute: c.usernameAttribute,
          value: input.username.trim(),
        }),
        new EqualityFilter({
          attribute: "userPrincipalName",
          value: input.username.trim(),
        }),
      ],
    });
    const result = await service.search(c.baseDn, {
      scope: "sub",
      filter,
      sizeLimit: 2,
      timeLimit: 5,
      attributes: [
        "mail",
        "userPrincipalName",
        c.subjectAttribute,
        "userAccountControl",
      ],
    });
    if (result.searchEntries.length !== 1)
      throw new BridgeError("invalid_credentials", 401);
    entry = result.searchEntries[0];
    if (Number(entry.userAccountControl || 0) & 2)
      throw new BridgeError("invalid_credentials", 401);
  } finally {
    await service.unbind().catch(() => {});
  }
  const user = await connect();
  try {
    await user.bind(entry.dn, input.password);
  } finally {
    await user.unbind().catch(() => {});
  }
  const email = entry.mail,
    raw = entry[c.subjectAttribute],
    subject = Buffer.isBuffer(raw) ? raw.toString("base64url") : raw;
  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+$/.test(email) ||
    typeof subject !== "string" ||
    !subject ||
    subject.length > 1024
  )
    throw new BridgeError("identity_attributes", 401);
  return { ok: true, email: email.toLowerCase(), subject };
}
