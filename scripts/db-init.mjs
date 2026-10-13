// Run by the db-init compose service before migrate on the platform: asks the
// platform's provision service to create this app's role and database when they
// are missing (it never changes an existing password). Locally the
// docker-compose.local.yml overlay replaces the command with a no-op, because the
// overlay's postgres already owns the database. Node built-ins only.

const die = (message) => {
  console.error(message);
  process.exit(1);
};

const token = process.env.PLATFORM_PROVISION_TOKEN ?? '';
if (token === '') {
  die(
    "db-init: set PLATFORM_PROVISION_TOKEN in .env to the platform's PROVISION_TOKEN (see deploy/platform/README.md of the platform)",
  );
}

const raw = process.env.DATABASE_URL;
if (!raw) die('db-init: DATABASE_URL is not set');
let url;
try {
  url = new URL(raw);
} catch {
  die('db-init: DATABASE_URL is not a valid URL');
}
const app = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const database = url.pathname.slice(1);
if (database !== app) {
  die(
    `db-init: database "${database}" does not match role "${app}": the platform names the database after the role`,
  );
}

const base = (process.env.PLATFORM_PROVISION_URL || 'http://platform-provision:8080').replace(
  /\/$/,
  '',
);
const attempts = 12;
const pause = () => new Promise((resolve) => setTimeout(resolve, 5000));
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  let response;
  try {
    response = await fetch(`${base}/ensure`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ app, password }),
    });
  } catch (err) {
    console.log(
      `db-init: attempt ${attempt}/${attempts}: ${base} unreachable (${err.cause?.code ?? err.message}), retrying in 5s`,
    );
    if (attempt < attempts) await pause();
    continue;
  }
  if (response.ok) {
    const body = await response.json();
    console.log(`db-init: role ${body.role}, database ${body.database}`);
    process.exit(0);
  }
  const text = await response.text();
  if (response.status >= 500) {
    console.log(
      `db-init: attempt ${attempt}/${attempts}: provision service answered ${response.status}, retrying in 5s`,
    );
    if (attempt < attempts) await pause();
    continue;
  }
  // 4xx: retrying cannot help. A 401 means the token is wrong.
  die(`db-init: provision service answered ${response.status}: ${text}`);
}
die(`db-init: provision service unreachable after ${attempts} attempts`);
