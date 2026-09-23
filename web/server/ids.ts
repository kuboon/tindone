/**
 * Random identifiers: task and log ids, and the API token.
 *
 * All of them are 128 bits of randomness in base64url — unguessable, which matters for the two
 * that end up in URLs someone can share: a task page, and the API token that stands in for a
 * sign-in on the curl endpoints.
 */

/** @returns A fresh 22-character base64url id */
export function newId(): string {
  return crypto.getRandomValues(new Uint8Array(16)).toBase64({
    alphabet: "base64url",
    omitPadding: true,
  });
}
