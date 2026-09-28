// The /api/cv/* endpoint behind the admin dashboard. Firebase Hosting
// rewrites /api/** here (see firebase.json), so the browser talks to its own
// origin and no CORS is involved.
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const { createHandler } = require("./cv/api");
const { createFirestoreStore } = require("./cv/store");

const ALLOWED_EMAILS = defineString("ALLOWED_EMAILS");

initializeApp();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

// Only the Google accounts listed in ALLOWED_EMAILS (functions/.env) may
// edit: the ID token the dashboard sends must be valid and belong to one.
async function authorize(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { status: 401, error: "Sign in to use the dashboard" };
  let user;
  try {
    user = await getAuth().verifyIdToken(token);
  } catch (err) {
    return { status: 401, error: "Your sign-in has expired. Sign in again." };
  }
  const allowed = ALLOWED_EMAILS.value()
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const email = (user.email || "").toLowerCase();
  if (!user.email_verified || !allowed.includes(email)) {
    return { status: 403, error: `${user.email} can't edit this site` };
  }
  return null;
}

const handler = createHandler({
  store: createFirestoreStore(db),
  authorize,
  prefix: "/api/cv",
});

exports.cvApi = onRequest(
  { region: "europe-west2", memory: "256MiB", timeoutSeconds: 30 },
  handler
);
