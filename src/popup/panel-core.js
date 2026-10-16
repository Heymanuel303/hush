// Hush — popup core.
//
// First popup script after the shared libs (lib/words.js, lib/format.js,
// data/packs.js, data/sites.js). Holds the Firefox/Chrome api shim, the cached
// DOM element references, and the cross-feature UI state — everything the other
// panel-*.js feature files read or write through the shared classic-<script>
// global scope. See panel.js for the load-order contract.

// Works in both Firefox (browser.*) and Chrome (chrome.*).
const api = typeof browser !== "undefined" ? browser : chrome;

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const wordEl = document.getElementById("word");
const addBtn = document.getElementById("add");
const countEl = document.getElementById("count");
const clearBtn = document.getElementById("clearAll");
const toggleEl = document.getElementById("toggle");
const toggleLabel = document.getElementById("toggleLabel");
const tabCountEl = document.getElementById("tabCount");
const totalEl = document.getElementById("total");
const siteEl = document.getElementById("site");
const resetBtn = document.getElementById("resetTotal");
const reclaimedEl = document.getElementById("reclaimed");
const toastEl = document.getElementById("toast");
const toastMsgEl = document.getElementById("toastMsg");
const undoBtn = document.getElementById("undo");
const onboardEl = document.getElementById("onboard");
const onboardClose = document.getElementById("onboardClose");
const packsEl = document.getElementById("packs");
const packsToggle = document.getElementById("packsToggle");
const packsListEl = document.getElementById("packsList");
const sitesEl = document.getElementById("sites");
const sitesListEl = document.getElementById("sitesList");
const hubBody = document.getElementById("hubBody");
const hubOffForm = document.getElementById("hubOffForm");
const hubOnView = document.getElementById("hubOnView");
const hubUrlEl = document.getElementById("hubUrl");
const hubCodeEl = document.getElementById("hubCode");
const hubLabelEl = document.getElementById("hubLabel");
const hubConnectBtn = document.getElementById("hubConnect");
const hubErrorEl = document.getElementById("hubError");
const hubPanelEl = document.getElementById("panel-household");
const hubRevokedLineEl = document.getElementById("hubRevokedLine");
const hubHelpEl = document.getElementById("hubHelp");
const hubFromEl = document.getElementById("hubFrom");
const hubQuietEl = document.getElementById("hubQuiet");
const hubLockedNoteEl = document.getElementById("hubLockedNote");
const hubPausedEl = document.getElementById("hubPaused");
const hubSummaryEl = document.getElementById("hubSummary");
const hubSyncInfoEl = document.getElementById("hubSyncInfo");
const hubSyncBtn = document.getElementById("hubSync");
const hubDisconnectBtn = document.getElementById("hubDisconnect");
const lockBannerEl = document.getElementById("lockBanner");
const lockTextEl = document.getElementById("lockText");

// Cross-feature UI state, declared here (loaded first) so every feature file can
// safely read/write it through the shared global scope without load-order risk.
let enabledState = true; // mirrors the on/off toggle for newly built rows
let enabledPacks = []; // names of starter packs currently toggled on
let siteWords = {}; // { siteId: [raw, ...] }, mirrors the siteWords storage key
let siteOptions = {}; // { storageKey: bool }, mirrors each per-site option's storage key (see SITE_OPTIONS)
let hubState = null; // mirrors storage `hub` (read-only here; written by background.js)
let hubConfigState = null; // mirrors `hubConfig`
let hubStatusState = null; // mirrors `hubStatus`
let lockedState = false; // hubConfig.locked: the popup is read-only (see setLockedUI)
// True when editing controls must be inert: blocking paused, or managed by a locked hub.
function controlsOff() {
  return !enabledState || lockedState;
}
