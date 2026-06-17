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
const advToggle = document.getElementById("advToggle");
const sitesEl = document.getElementById("sites");
const sitesListEl = document.getElementById("sitesList");

// Cross-feature UI state, declared here (loaded first) so every feature file can
// safely read/write it through the shared global scope without load-order risk.
let enabledState = true; // mirrors the on/off toggle for newly built rows
let enabledPacks = []; // names of starter packs currently toggled on
let advancedState = false; // mirrors the advanced-mode toggle
let siteWords = {}; // { siteId: [raw, ...] }, mirrors the siteWords storage key
