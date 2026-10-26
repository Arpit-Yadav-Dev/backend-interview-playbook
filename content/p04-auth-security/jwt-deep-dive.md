## In one line
A JWT is three parts joined by dots: a header, a payload of **claims**, and a signature that lets a server check the first two came from a trusted key and were not changed.

## The problem it solves
Your API at `api.example.com` receives this header:

```text
Authorization: Bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0yMDI2LTEwIn0.eyJyb2xlIjoiY3VzdG9tZXIiLCJpc3MiOiJodHRwczovL2F1dGguZXhhbXBsZS5jb20iLCJhdWQiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSIsInN1YiI6Ijk4MSIsImlhdCI6MTc5MzAzNzQyMiwiZXhwIjoxNzkzMDM4MzIyfQ.ZY24mJR1t8m5TgXfMKQ1X-2F4u_-lJv5kzWkx-1d97IlWFONmVQ8-hIgIzfLa9Uhga_t8iml8oIq2UNm8IAdJQ
```

It claims to say "this is user 981". The API has to decide, without calling anyone, whether to believe it. Get that decision wrong and an attacker can make up their own token that says `"role": "admin"`.

Most real JWT security bugs come from not understanding what is inside the token: reading the payload without checking the signature, letting the token choose its own algorithm, or forgetting to check who the token was meant for. Interviewers probe these internals for exactly that reason. For **when** to use JWTs at all, see [Sessions vs JWT](#/topic/sessions-vs-jwt).

## Everyday analogy
A passport. Anyone can open it and read the name and expiry date. What makes it trustworthy is the tamper-proof chip, signed by the issuing government. A border officer checks: is the seal genuine, is it from a country we accept, has it expired, and is it valid for entry here?

Where it breaks down: a passport has a photo, so a thief can't easily use yours. A JWT is a **bearer token**: whoever holds it can use it, with no photo check.

## How it works
### The three parts
A **JWT** (JSON Web Token) is `header.payload.signature`. The first two parts are JSON, encoded with **base64url**: a way to write any bytes using only letters, digits, `-` and `_`, so the result is safe inside URLs and headers. Encoding is **not** encryption. Anyone can turn it back into JSON.

**1. Header:** how the token was signed.

```json
{ "alg": "ES256", "typ": "JWT", "kid": "key-2026-10" }
```

- `alg`: the signing algorithm, such as `HS256` or `ES256`.
- `typ`: the media type, usually `JWT`.
- `kid` (key ID): a label naming which key signed it. Used to pick the right key during key rotation.

**2. Payload:** the **claims**, statements about the user and the token itself. The JWT standard (RFC 7519) defines these **registered claims**. All are optional, but most APIs use most of them:

| Claim | Name | Meaning in our token |
|---|---|---|
| `iss` | Issuer | Who created it: `https://auth.example.com` |
| `sub` | Subject | Who it is about: user `981` |
| `aud` | Audience | Who should accept it: `https://api.example.com` |
| `exp` | Expiration | Reject after this time |
| `nbf` | Not before | Reject before this time |
| `iat` | Issued at | When it was created |
| `jti` | JWT ID | A unique ID, useful for denylists |

Times are **Unix timestamps**: seconds since 1 January 1970, UTC. In our token, `iat: 1793037422` is 26 Oct 2026 17:57:02 UTC, and `exp` is 15 minutes later.

Anything else, like `"role": "customer"`, is a **custom claim** that your app defines.

**3. Signature:** proof the first two parts were not changed. The signer takes the exact text `base64url(header) + "." + base64url(payload)` and signs it with a key. Change one character of the payload, and the signature no longer matches.

### Two kinds of signing keys
- **HS256 (HMAC with SHA-256).** One shared secret both signs and verifies. **HMAC** is a hash mixed with a secret key. Simple, but every service that can verify tokens can also **create** them. Fine when one backend issues and checks its own tokens.
- **RS256 (RSA) or ES256 (elliptic curve).** A **key pair**: the auth server signs with a **private key** that never leaves it, and APIs verify with the **public key**. A compromised API can't mint tokens. ES256 keys and signatures are much shorter than RS256 ones.

With key pairs, the auth server publishes its public keys as a **JWKS** (JSON Web Key Set) at a URL such as `https://auth.example.com/.well-known/jwks.json`. Each key carries its `kid`. APIs fetch the set, cache it, and pick the key whose `kid` matches the token's header.

**Key rotation** then needs no downtime: publish the new key in the JWKS alongside the old one, start signing with the new `kid`, and remove the old key once the longest-lived token signed with it has expired.

### The verification checklist
Every protected request must pass all of these checks:

1. **Split** the token into three parts. Reject anything malformed.
2. **Algorithm allow-list.** Your server decides which `alg` values it accepts, for example only `ES256`. Never let the token's header choose.
3. **Pick the key** from your trusted configuration or JWKS (by `kid`), never from a URL or key inside the token.
4. **Verify the signature.**
5. **Check time:** `exp` is in the future and `nbf` (if present) is in the past, allowing a small **clock skew** (difference between server clocks) of around 30–60 seconds.
6. **Check `iss`:** issued by the auth server you trust.
7. **Check `aud`:** meant for this API. A token issued for your admin tool must not work on your public API.
8. Only now **trust the claims**, such as `sub` and `role`.

```mermaid
flowchart TD
    A["Token arrives"] --> B{"alg on allow-list?"}
    B -- No --> X["Reject with 401"]
    B -- Yes --> C{"Signature valid?"}
    C -- No --> X
    C -- Yes --> D{"exp and nbf OK?"}
    D -- No --> X
    D -- Yes --> E{"iss and aud match?"}
    E -- No --> X
    E -- Yes --> F["Trust the claims"]
```
*Notice: the claims are the last thing you look at, never the first; until every check passes, the payload is just text anyone could have written.*

### Access tokens, refresh tokens, and revocation
- An **access token** is short-lived (often 5–15 minutes) and sent with every API call.
- A **refresh token** is long-lived (days or weeks), sent only to the auth server to get a new access token. It is usually a random string that the server stores (hashed) and can revoke.
- **Refresh token rotation:** each time a refresh token is used, the server issues a new one and invalidates the old one. If an old one is ever used again, someone copied it, so the server revokes that whole login.

This design exists because of the **revocation problem**: a signed JWT stays valid until `exp`, and the API, which never looks anything up, has no way to know it was cancelled. Short access tokens limit the damage, and the refresh token is the part you can actually cancel.

> [!NOTE]
> If the payload itself must be secret, there is **JWE** (JSON Web Encryption), which encrypts the content and has five dot-separated parts instead of three. Most APIs don't need it: they simply keep private data out of the token.

## Real example
**Setup:** Node.js 18+, `"type": "module"`, `npm install jose`. `jose` works in Node, browsers, and edge runtimes.

**1. Sign and verify a token** (`jwt-demo.js`):

```js
import { SignJWT, jwtVerify, generateKeyPair } from 'jose';

// In production the private key comes from a secret store. Here we make one.
const { privateKey, publicKey } = await generateKeyPair('ES256');

// Auth server: sign a 15-minute access token for user 981.
const token = await new SignJWT({ role: 'customer' })   // custom claim
  .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: 'key-2026-10' })
  .setIssuer('https://auth.example.com')
  .setAudience('https://api.example.com')
  .setSubject('981')
  .setIssuedAt()
  .setExpirationTime('15m')
  .sign(privateKey);

// API server: verify with the PUBLIC key and an explicit checklist.
const { payload } = await jwtVerify(token, publicKey, {
  algorithms: ['ES256'],                 // allow-list: "none" and HS256 are rejected
  issuer: 'https://auth.example.com',
  audience: 'https://api.example.com',
  clockTolerance: 30,                    // seconds of clock skew allowed
});                                      // exp and nbf are checked automatically
console.log(token, payload);
```

In a real API, replace `publicKey` with the auth server's key set: `createRemoteJWKSet(new URL('https://auth.example.com/.well-known/jwks.json'))`. It fetches, caches, and picks keys by `kid`.

**2. Prove the payload is readable by anyone.** `$TOKEN` holds the token from the top of this page:

```bash
node -e "console.log(Buffer.from(process.argv[1].split('.')[1], 'base64url').toString())" "$TOKEN"
```

```text
{"role":"customer","iss":"https://auth.example.com","aud":"https://api.example.com","sub":"981","iat":1793037422,"exp":1793038322}
```

No key was needed. Treat every payload as public.

**3. What `jwtVerify` does with bad tokens.** Each of these was built by hand and passed in:

| Forged or broken token | Error code from jose |
|---|---|
| Payload changed to `"role":"admin"`, old signature | `ERR_JWS_SIGNATURE_VERIFICATION_FAILED` |
| Header `"alg":"none"`, empty signature | `ERR_JOSE_ALG_NOT_ALLOWED` |
| `exp` 30 minutes in the past | `ERR_JWT_EXPIRED` |
| `aud` set to `https://admin.example.com` | `ERR_JWT_CLAIM_VALIDATION_FAILED` |

Your middleware turns all of these into `401 Unauthorized`.

## How to say it in an interview

> [!INTERVIEW]
> **30 seconds:** "A JWT has three base64url parts separated by dots. The header says which algorithm and key signed it. The payload holds claims, like the subject, issuer, audience, and expiry. The signature covers both, so any change is detected. It's signed, not encrypted, so anyone can read the payload. To verify, I check the signature with an allow-listed algorithm and a trusted key, then the expiry, issuer, and audience, and only then trust the claims."

> [!INTERVIEW]
> **2 minutes:** Start with the 30-second answer, then add:
>
> "For signing, HS256 uses one shared secret, so anything that can verify can also create tokens. With several services, I'd use ES256 or RS256: the auth server keeps the private key, and APIs fetch the public keys from a JWKS endpoint, matched by the `kid` header. That also makes key rotation painless.
>
> The main tradeoff is revocation. An API that verifies locally can't know a token was cancelled. So I keep access tokens to about 15 minutes and use rotating refresh tokens stored server-side, which I can revoke.
>
> For example, in a shop app the access token carries `sub` and a role, never an address or anything private. I'd also guard against the classic attacks: `alg: none`, algorithm confusion between HS256 and RS256, and weak HMAC secrets. All of those are blocked by a fixed algorithm allow-list and a properly random key."

## Follow-up questions interviewers ask

<details>
<summary>What is the algorithm confusion attack?</summary>

The API expects RS256 and verifies with the RSA **public** key. The attacker makes a token with header `"alg": "HS256"` and signs it with HMAC, using that public key (which is public) as the shared secret. A badly written verifier that trusts the header runs HMAC with the public key, and the signature matches. The fix: fix the allowed algorithms on the server, and use libraries that tie each key to one algorithm type, as `jose` does.

</details>

<details>
<summary>How strong does an HS256 secret need to be?</summary>

At least 256 bits of real randomness, which the JWA standard (RFC 7518) requires for HS256. Generate it, for example with `openssl rand -base64 32`. If the secret is a word like `supersecret`, an attacker with one token can guess the secret offline with password-cracking tools, then sign any token they like.

</details>

<details>
<summary>Why check aud and iss if the signature is valid?</summary>

A valid signature only proves your auth server made the token. It doesn't prove the token was meant for **this** API. If one auth server issues tokens for the shop API and for an internal admin API, a shop token without an `aud` check might be accepted by the admin API. `iss` matters when you trust several issuers, such as your own auth server and Google.

</details>

<details>
<summary>How do you revoke a JWT before it expires?</summary>

You can't make the token itself invalid. Options: keep access tokens short and revoke the refresh token; keep a Redis denylist of revoked `jti` values until their `exp`; or store a per-user "valid after" time and reject older `iat` values. The last two need a lookup on each request, which gives up some of the "no lookup" benefit.

</details>

<details>
<summary>What is the difference between decoding and verifying?</summary>

Decoding just turns base64url back into JSON. Anyone can do it, and it proves nothing. Verifying checks the signature with a trusted key and checks the claims. In `jsonwebtoken`, `jwt.decode()` decodes and `jwt.verify(token, key, { algorithms: ['HS256'] })` verifies. Server code that makes decisions must only use verified claims.

</details>

## Common mistakes and misconceptions

> [!MISTAKE]
> Not pinning the algorithm. Old libraries once accepted `"alg": "none"`, which means "no signature". Always pass an explicit allow-list, like `algorithms: ['ES256']`.

> [!MISTAKE]
> Using `decode()` instead of `verify()` on the server, for example to "quickly" read the user ID. An attacker can write any payload they want. Only verified claims count.

> [!MISTAKE]
> Putting private data in the payload, such as an email address, a delivery address, or internal flags. It is readable by anyone who sees the token, including browser extensions and logs.

> [!MISTAKE]
> Storing tokens in `localStorage` in a browser app. Any script on the page, including one injected through **XSS** (an attacker's script running on your site) or a compromised npm package, can read it and send it away. Prefer an `HttpOnly` cookie, which scripts can't read.

> [!MISTAKE]
> Ignoring clock skew, or setting it to hours. With zero tolerance, servers whose clocks differ by a few seconds randomly reject fresh tokens. With hours, expired tokens keep working. Around 30–60 seconds is typical.

## Tradeoffs: when NOT to use it
- **As a session for one web app.** If one backend issues and checks the tokens, a session cookie is simpler and can be revoked instantly. See [Sessions vs JWT](#/topic/sessions-vs-jwt).
- **When you need immediate revocation.** Bans, payment fraud, or removing an admin's access all need a lookup anyway.
- **For large or fast-changing data.** The token goes on every request and goes stale the moment the data changes. Carry an ID and a role, then look up the rest.
- **For secret data.** Use JWE or, better, keep the data on the server.
- **When you'd have to hand-roll it.** Never write your own signing or verification code. Use a maintained library and keep it updated.

## Check yourself

<details>
<summary>1. Name the three parts of a JWT and what each holds.</summary>

The header (algorithm `alg`, type `typ`, key ID `kid`), the payload (claims such as `iss`, `sub`, `aud`, `exp`, plus custom ones like `role`), and the signature over the encoded header and payload.

</details>

<details>
<summary>2. An attacker changes "role":"customer" to "role":"admin" in a token's payload and re-encodes it. What happens on a correctly configured API?</summary>

The signature no longer matches the changed payload, so verification fails and the API returns 401. The attacker can't fix the signature without the signing key.

</details>

<details>
<summary>3. Why do auth servers that use RS256 or ES256 publish a JWKS endpoint?</summary>

So APIs can fetch the current public keys, matched by `kid`, to verify tokens. It allows key rotation without redeploying every API: the new key is added to the set before it is used, and the old one is removed after its tokens expire.

</details>

## Go deeper
- [RFC 7519: JSON Web Token](https://datatracker.ietf.org/doc/html/rfc7519)
- [RFC 8725: JWT Best Current Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [OWASP JSON Web Token Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)
