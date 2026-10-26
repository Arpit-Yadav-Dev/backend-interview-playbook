## In one line
Environment variables let you give an app its settings and secrets from outside the code, so the same code runs everywhere and passwords never end up in Git.

## The problem it solves
Your shop's code needs a database password, a Redis address, and a payment API key. The quick way is to write them straight into the code:

```js
const db = new pg.Pool({ connectionString: 'postgres://shop_app:s3cret@db.internal:5432/shop' });
```

Three things go wrong:

- **The secret is now in Git.** Everyone with access to the repository has the production password, forever, including in old commits. If the repository is ever made public, or a laptop is stolen, bots that scan for leaked keys can find it quickly.
- **Every environment needs a code change.** Your laptop, the test server, and production all use different databases.
- **Changing a password means a deploy.** Rotating a leaked key becomes a code change instead of a config change.

A **secret** is any value that grants access: passwords, API keys, private keys, tokens. Secrets and settings belong outside the code.

## Everyday analogy
A rental car. The car (your code) is identical for every driver. The settings that differ, like whose name is on the contract and which key fob opens it, are handed over at the counter (the environment) when you pick it up. You don't weld a driver's house key to the dashboard.

Where it breaks down: a key handed over at the counter is gone when you return the car. An environment variable stays visible to the running process, and to anyone with enough access to that machine, for as long as the process runs.

## How it works
An **environment variable** is a named text value, like `DATABASE_URL=postgres://...`, that a running program can read. In Node it appears in `process.env.DATABASE_URL`.

The important part is how a process gets them:

1. Every **process** (running program) has its own environment: a private list of name=value pairs.
2. When a process starts another one, the child gets a **copy** of the parent's environment at that moment.
3. Changes in the child never flow back to the parent. Changes in the parent after the child started never reach the child.
4. So a running app **never sees** edits to a `.env` file or a new `export` in your terminal until it is restarted.

In bash, a plain variable stays in the shell. `export` marks it to be copied into child processes:

```bash
DB_PASSWORD=s3cret                                 # a shell variable: only this shell sees it
node -e 'console.log(process.env.DB_PASSWORD)'     # undefined
export DB_PASSWORD                                 # now children get a copy
node -e 'console.log(process.env.DB_PASSWORD)'     # s3cret
PORT=4000 node server.js                           # set a variable for this one command only
```

```mermaid
flowchart TD
    F[".env or EnvironmentFile"] -->|"read at start"| P["systemd or shell"]
    P -->|"copies env"| N["node server.js"]
    N -->|"copies env"| W["Child process it spawns"]
    E["You edit the file"] -.->|"no effect until restart"| N
```
*Notice: values only flow downward, and only when a process starts, which is why config changes need a restart.*

A **.env file** is a plain text file of `NAME=value` lines, kept next to the app and **out of Git**. Something must load it into the environment: `node --env-file=.env` (Node 20.6 and later), the `dotenv` package, Docker's `--env-file`, or systemd's `EnvironmentFile=`.

## Real example
**Setup:** Node 20.6 or later, `"type": "module"` in `package.json`.

**1. Keep secrets out of Git.** Commit a template with no real values, and ignore the real file:

```text
# .gitignore
.env

# .env.example: committed, shows which variables are needed
DATABASE_URL=postgres://user:password@localhost:5432/shop
REDIS_URL=redis://localhost:6379
PAYMENT_API_KEY=
```

**2. Read and check config in one place** (`config.js`):

```js
// Read and check every setting once, at startup.
const required = ['DATABASE_URL', 'REDIS_URL', 'PAYMENT_API_KEY'];
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  // Name the missing variables, never print their values.
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exit(1); // fail at boot, not at the first checkout
}

export const config = {
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  paymentApiKey: process.env.PAYMENT_API_KEY,
  port: Number(process.env.PORT ?? 3000), // optional, with a default
};
```

```bash
node --env-file=.env server.js
# Starting on port 3000
node server.js            # no .env loaded
# Missing environment variables: DATABASE_URL, REDIS_URL, PAYMENT_API_KEY
```

**3. On the server, with systemd.** Put the values in a root-only file and point the unit at it:

```bash
sudo install -m 600 -o root -g root /dev/null /etc/shop-api.env   # empty file, mode 600
sudo nano /etc/shop-api.env                                      # add the NAME=value lines
```

```ini
# In /etc/systemd/system/shop-api.service, under [Service]:
EnvironmentFile=/etc/shop-api.env
```

systemd reads the file as root before starting the app, so the app's user doesn't need to read it. After changing it, run `sudo systemctl restart shop-api`.

## How to say it in an interview

> [!INTERVIEW]
> **30 seconds:** "I keep config and secrets out of the code and pass them in as environment variables. Locally that's a .env file that's git-ignored, with a committed .env.example. In production the values come from systemd, Docker, or a secrets manager. The app reads them once at startup and fails fast if a required one is missing. Env vars are copied into a process when it starts, so changing one means restarting the app."

> [!INTERVIEW]
> **2 minutes:** Start with the 30-second answer, then add:
>
> "If a secret does get committed, deleting it in the next commit isn't enough. It's still in the Git history. So I rotate it immediately: create a new key, deploy it, and revoke the old one.
>
> As a React developer, one trap I watch for: variables prefixed with `VITE_` or `NEXT_PUBLIC_` are built into the JavaScript bundle and visible to every visitor. Only public values go there. Real secrets stay on the server.
>
> The tradeoff is that env vars are simple but not very protected. Any code in the process can read them, they get copied to child processes, and they can leak into crash reports or logs. For a bigger team I'd use a secrets manager like AWS Secrets Manager or Vault, which adds access control, audit logs, and rotation."

## Follow-up questions interviewers ask

<details>
<summary>You accidentally pushed an API key to GitHub. What do you do?</summary>

Rotate it first: create a new key, update production, and revoke the old one. Assume it has been copied, because bots scan public repositories for keys. Then remove it from the history if needed, and check the provider's logs for misuse. Rewriting history alone doesn't help, because the key was already exposed.

</details>

<details>
<summary>Why didn't my app pick up the new value I put in .env?</summary>

The environment is copied into a process only when it starts. A running app keeps its old copy. Restart it: `sudo systemctl restart shop-api`, `pm2 restart shop-api --update-env`, or recreate the container.

</details>

<details>
<summary>Is it safe to put secrets in a Dockerfile with ENV?</summary>

No. `ENV` and build arguments are saved in the image, so anyone who can pull the image can read them, for example with `docker history` or `docker inspect`. Pass secrets when the container starts (`--env-file`, Compose `env_file`, or Docker secrets). See [Writing a good Dockerfile](#/topic/dockerfile-node).

</details>

<details>
<summary>What does a secrets manager add over env vars?</summary>

Central storage with access control (who can read which secret), audit logs (who read it, when), versioning, and automatic rotation. The app, or the platform, fetches secrets at startup. Many teams still deliver them to the app as env vars, just from a safer source.

</details>

## Common mistakes and misconceptions

> [!MISTAKE]
> "It's a private repository, so the secret is safe." Everyone with access, every clone, every laptop, and every CI log has it. Repositories also get made public by accident. Secrets don't belong in Git, private or not.

> [!MISTAKE]
> Logging the whole config or `process.env` at startup to debug. The secrets end up in log files and log services. Log variable names, or whether they are set, never values. See [Logging well](#/topic/logging).

> [!MISTAKE]
> Putting an API secret in a frontend env var like `VITE_PAYMENT_KEY`. Anything in the browser bundle is public.

> [!MISTAKE]
> Using one set of secrets for every environment. A leaked development key then opens production. Give each environment its own credentials.

## Tradeoffs: when NOT to use it
- **Plain env vars aren't enough for high-value secrets at scale.** They have no audit trail or rotation, and are readable by anyone with root or access to the process. Use a secrets manager.
- **Don't use env vars for large or structured config**, like feature flag lists or pricing tables. Use a config file in the repository, or a config service. Env vars suit short values that change between environments.
- **Don't scatter `process.env` reads across the code.** Read once in a config module, validate, and import that. Otherwise a missing variable only shows up when that rare code path runs.

## Check yourself

<details>
<summary>1. You run `export API_KEY=abc` in your SSH session. Does the systemd service see it?</summary>

No. The service was started by systemd, not by your shell, so it never got a copy of your session's environment. Put the value in the unit's `EnvironmentFile` and restart the service.

</details>

<details>
<summary>2. What goes in Git: .env or .env.example?</summary>

`.env.example`, with variable names and placeholder values. The real `.env` is listed in `.gitignore`.

</details>

<details>
<summary>3. Why validate env vars at startup instead of when they're used?</summary>

So a missing or wrong value stops the app immediately, during the deploy, with a clear message. Otherwise it fails later, in front of a customer, only when that code path finally runs.

</details>

## Go deeper
- [Node.js docs: process.env](https://nodejs.org/api/process.html#processenv)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [The Twelve-Factor App: Config](https://12factor.net/config)
