// Run on the publisher's machine. Customer artifacts contain only the public key.
import { generateKeyPairSync, sign, createPrivateKey } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const [command, ...args] = process.argv.slice(2);
if (command === "keygen" && args.length === 2) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  writeFileSync(args[0], privateKey.export({ type:"pkcs8",format:"pem" }), { flag:"wx", mode:0o600 });
  writeFileSync(args[1], publicKey.export({type:"spki",format:"der"}).toString("base64url") + "\n",{flag:"wx"});
} else if (command === "issue" && args.length === 7) {
  const [path,installation,customer,edition,expires,serial,out] = args;
  const revision=Number(serial), expiry=new Date(expires);
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(installation) || !customer.trim() || customer.length>160 ||
    !["Essentials","Professional","Enterprise"].includes(edition) || !Number.isSafeInteger(revision) || revision<1 ||
    !Number.isFinite(+expiry) || +expiry<=Date.now() || !expires.endsWith("Z")) throw Error("Invalid license parameters. Use an explicit future UTC timestamp.");
  const key=createPrivateKey(readFileSync(path));
  if (key.asymmetricKeyType!=="ed25519") throw Error("Expected an Ed25519 publisher key.");
  const claims={product:"Fornost GRC",installation,customer:customer.trim(),edition,expires:expiry.toISOString(),revision};
  const payload="FGR1."+Buffer.from(JSON.stringify(claims)).toString("base64url");
  writeFileSync(out,payload+"."+sign(null,Buffer.from(payload),key).toString("base64url")+"\n",{flag:"wx",mode:0o600});
} else {
  console.error("Usage: node scripts/issue-license.mjs keygen PRIVATE.pem PUBLIC.txt\n       node scripts/issue-license.mjs issue PRIVATE.pem INSTALLATION CUSTOMER EDITION EXPIRES_UTC REVISION OUTPUT.fornost");
  process.exitCode=2;
}
