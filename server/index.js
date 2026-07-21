import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Where the data file lives. Point DATA_DIR at a mounted volume in Docker
// so data survives container rebuilds/restarts.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "storage.json");

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    console.error("Could not read", DATA_FILE, "- starting with an empty store:", e.message);
    return {};
  }
}

function saveStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // write to a temp file then rename, so a crash mid-write can't corrupt the real file
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

let store = loadStore();

const app = express();
app.use(express.json({ limit: "15mb" })); // draft boards + CSV imports can add up

// --- Storage API (mirrors the shape App.jsx already expects from window.storage) ---
const router = express.Router();

router.get("/", (req, res) => {
  const prefix = req.query.prefix || "";
  const keys = Object.keys(store).filter((k) => k.startsWith(prefix));
  res.json({ keys, prefix: req.query.prefix || null });
});

router.get("/:key", (req, res) => {
  const key = req.params.key;
  if (!(key in store)) return res.status(404).json({ error: "not found" });
  res.json({ key, value: store[key] });
});

router.put("/:key", (req, res) => {
  const key = req.params.key;
  const value = req.body && req.body.value;
  if (typeof value !== "string") {
    return res.status(400).json({ error: "body must be JSON with a string 'value' field" });
  }
  store[key] = value;
  try {
    saveStore(store);
  } catch (e) {
    console.error("Failed to persist storage file:", e.message);
    return res.status(500).json({ error: "failed to save" });
  }
  res.json({ key, value });
});

router.delete("/:key", (req, res) => {
  const key = req.params.key;
  delete store[key];
  try {
    saveStore(store);
  } catch (e) {
    console.error("Failed to persist storage file:", e.message);
    return res.status(500).json({ error: "failed to save" });
  }
  res.json({ key, deleted: true });
});

app.use("/api/storage", router);

app.get("/api/health", (req, res) => res.json({ ok: true, dataFile: DATA_FILE }));

// --- Serve the built frontend ---
const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));
app.get("*", (req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FFB draft prep server listening on port ${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
