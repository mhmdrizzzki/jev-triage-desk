const CLIENT_ID  = "pk_BDCzQLlYJQDG9C6W";
const REDIRECT   = location.origin + location.pathname;
const AUTH_URL   = "https://enter.pollinations.ai/authorize";
const TOKEN_URL  = "https://enter.pollinations.ai/api/oauth/token";
const DECIDE_URL = "https://gen.pollinations.ai/alpha/decisions";

const LANES = { engineering:"Engineering", support:"Support", content:"Content", growth:"Growth" };
const RUNGS = ["low","medium","high","critical"];
// What each lane actually means. Jev reads these labels; the page only reads the keys.
const LANE_CRITERIA = {
  engineering: "code, infrastructure, deploys, bugs",
  support: "billing, refunds, account access, upset customers",
  content: "copy, docs, marketing wording, announcements",
  growth: "partnerships, pricing experiments, new channels"
};
const SAMPLE = [
  "Payout for last week failed, customer has been waiting 3 days",
  "Typo on the pricing page: 'recieve'",
  "Idea: dark mode for the dashboard",
  "EU users cannot load the app at all since this morning"
].join("\n");

const $ = (id) => document.getElementById(id);
const b64url = (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)))
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const rand = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); };
const s256 = async (v) => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));

let token = sessionStorage.getItem("poll_token") || "";
let login = sessionStorage.getItem("poll_login") || "";

function setHint(msg, bad) { const h = $("hint"); h.textContent = msg; h.style.color = bad ? "var(--bad)" : "var(--mut)"; }

function refreshAuthUI() {
  const on = !!token;
  $("signin").textContent = on ? "Signed in" : "Sign in with Pollinations";
  $("signin").disabled = on;
  $("run").disabled = !on;
  $("who").textContent = on ? ("as " + (login || "you") + " · your Pollen pays") : "";
  if (on) setHint("Ready. Your Pollen is only spent when you press Triage with Jev.", false);
}

async function signIn() {
  const verifier = rand(32);
  const state = rand(16);
  sessionStorage.setItem("pkce_v", verifier);
  sessionStorage.setItem("pkce_s", state);
  const q = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    scope: "profile usage",
    state: state,
    code_challenge: await s256(verifier),
    code_challenge_method: "S256"
  });
  location.href = AUTH_URL + "?" + q.toString();
}

async function handleCallback() {
  const u = new URL(location.href);
  const code = u.searchParams.get("code");
  if (!code) return;
  const state = u.searchParams.get("state");
  const want = sessionStorage.getItem("pkce_s");
  if (want && state !== want) { setHint("Sign-in state mismatch — try again.", true); return; }
  try {
    setHint("Exchanging your authorization code…", false);
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT,
        code_verifier: sessionStorage.getItem("pkce_v") || ""
      })
    });
    const d = await r.json();
    if (!d.access_token) throw new Error(d.error_description || d.error || "no access_token");
    token = d.access_token;
    sessionStorage.setItem("poll_token", token);
    sessionStorage.removeItem("pkce_v");
    sessionStorage.removeItem("pkce_s");
    history.replaceState({}, "", REDIRECT);
    try {
      const p = await fetch("https://gen.pollinations.ai/account/profile", { headers: { Authorization: "Bearer " + token } });
      const pd = await p.json();
      login = pd.name || pd.githubUsername || "";
      sessionStorage.setItem("poll_login", login);
    } catch (e) {}
    refreshAuthUI();
    setHint("Signed in. Press Triage with Jev.", false);
  } catch (e) {
    history.replaceState({}, "", REDIRECT);
    setHint("Sign-in failed: " + e.message, true);
  }
}

function items() {
  return $("inbox").value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 40);
}

async function triage() {
  const list = items();
  if (!list.length) { setHint("Add at least one line to the inbox.", true); return; }
  $("run").disabled = true;
  setHint("Asking Jev for " + list.length * 3 + " decisions…", false);

  const questions = {};
  list.forEach((text, i) => {
    // Every question quotes its own item, otherwise Jev cannot tell which line it is judging.
    const quoted = "Inbox item #" + (i + 1) + ": \"" + text + "\"";
    questions["i" + i + "_lane"] = {
      type: "choice",
      instructions: quoted + "\nWhich team should own this item?",
      criteria: LANE_CRITERIA
    };
    questions["i" + i + "_priority"] = {
      type: "score",
      instructions: quoted + "\nHow urgently must this be picked up? low = it can wait, critical = drop everything.",
      criteria: RUNGS
    };
    questions["i" + i + "_now"] = {
      type: "noul",
      instructions: quoted + "\nShould this page an on-call human right now?"
    };
  });

  const body = {
    model: "jev",
    state: {
      task: "You are triaging a shared inbox. Each question quotes the single item it is about.",
      inbox: list,
      teams: LANE_CRITERIA,
      urgency_scale: RUNGS
    },
    questions: questions
  };

  try {
    const r = await fetch(DECIDE_URL, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    if (!r.ok) throw new Error((d.error && d.error.message) || ("HTTP " + r.status));
    $("raw").textContent = JSON.stringify(d, null, 2);
    render(list, d.answers || {});
    const u = d.usage || {};
    setHint("Done — " + list.length + " items triaged by " + (d.model || "jev") + " · " + (u.input_tokens || 0) + " input tokens billed to your Pollen.", false);
  } catch (e) {
    setHint("Triage failed: " + e.message, true);
  } finally {
    $("run").disabled = false;
  }
}

function render(list, answers) {
  const board = $("board");
  board.innerHTML = "";
  const cols = {};
  Object.keys(LANES).forEach(k => {
    cols[k] = document.createElement("div");
    cols[k].className = "col";
    cols[k].innerHTML = "<h3><span>" + LANES[k] + "</span><span class='n'>0</span></h3>";
    board.appendChild(cols[k]);
  });
  const stray = document.createElement("div");
  stray.className = "col";
  stray.innerHTML = "<h3><span>Unassigned</span><span class='n'>0</span></h3>";

  const rows = list.map((text, i) => {
    const lane = answers["i" + i + "_lane"] || {};
    const pri  = answers["i" + i + "_priority"] || {};
    const now  = answers["i" + i + "_now"] || {};
    const pos  = typeof pri.score === "number" ? pri.score : 0;
    const maxPos = Math.max(1, RUNGS.length - 1);
    return {
      text: text,
      lane: LANES[lane.choice] ? lane.choice : null,
      laneConf: lane.confidence,
      probs: lane.probabilities || {},
      score: pos,
      rung: (pri.legend && pri.legend[Math.round(pos)]) || RUNGS[Math.min(RUNGS.length - 1, Math.max(0, Math.round(pos)))] || "—",
      priConf: pri.confidence,
      page: typeof now.noul === "number" ? now.noul : 0,
      pct: Math.max(0, Math.min(1, pos / maxPos)) * 100
    };
  }).sort((a, b) => b.score - a.score);

  rows.forEach(r => {
    const el = document.createElement("div");
    el.className = "card";
    const tag = r.page >= 0.5
      ? '<span class="tag page">PAGE NOW ' + Math.round(r.page * 100) + '%</span>'
      : '<span class="tag ok">hold ' + Math.round((1 - r.page) * 100) + '%</span>';
    el.innerHTML =
      '<div class="t"></div>' +
      '<div class="bar"><i style="width:' + r.pct.toFixed(0) + '%"></i></div>' +
      '<div class="meta"><span>urgency <strong>' + r.rung + '</strong> · ' + r.score.toFixed(2) + '</span>' + tag + '</div>' +
      '<div class="meta" style="margin-top:6px"><span>lane confidence ' + (r.laneConf != null ? Math.round(r.laneConf * 100) + '%' : '—') + '</span>' +
      '<span>scale ' + (r.pct).toFixed(0) + '%</span></div>';
    el.querySelector(".t").textContent = r.text;
    const host = r.lane ? cols[r.lane] : stray;
    host.appendChild(el);
  });

  let strays = stray.querySelectorAll(".card").length;
  if (strays) board.appendChild(stray);
  Object.keys(LANES).forEach(k => {
    const n = cols[k].querySelectorAll(".card").length;
    cols[k].querySelector(".n").textContent = n;
    if (!n) { const e = document.createElement("div"); e.className = "empty"; e.textContent = "nothing here"; cols[k].appendChild(e); }
  });
  stray.querySelector(".n").textContent = strays;
}

$("inbox").value = SAMPLE;
$("signin").addEventListener("click", signIn);
$("run").addEventListener("click", triage);
refreshAuthUI();
handleCallback();