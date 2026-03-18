import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDuq5VnqQ6a2rb7jHsz-Ut9scX-R37g6NU",
  authDomain: "macro-tracker-7bef2.firebaseapp.com",
  projectId: "macro-tracker-7bef2",
  storageBucket: "macro-tracker-7bef2.firebasestorage.app",
  messagingSenderId: "1008877517002",
  appId: "1:1008877517002:web:3ecc6ed45e1c0eb8001c33"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const USER_ID = "karen";
const defaultGoals = { calories: 1650, protein: 100, carbs: 180, fat: 58, fiber: 30, sugar: 25 };

function getDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return getDateKey(d);
  });
}

const MACRO_COLORS = {
  calories: "#1a1a1a",
  protein: "#2d6a4f",
  carbs: "#e76f51",
  fat: "#457b9d",
  fiber: "#6a4c93",
  sugar: "#f4a261",
};

const TABS = ["Today", "Week", "Weight", "Foods", "Goals"];

async function saveToFirebase(path, data) {
  try { await setDoc(doc(db, path), data, { merge: true }); }
  catch (e) { console.error("Firebase save error:", e); }
}

async function loadFromFirebase(path) {
  try {
    const snap = await getDoc(doc(db, path));
    return snap.exists() ? snap.data() : null;
  } catch (e) { console.error("Firebase load error:", e); return null; }
}

function RingProgress({ value, max, color, size = 80, stroke = 7 }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f0ede8" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s ease" }} />
    </svg>
  );
}

function MacroBar({ label, value, max, color }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", marginBottom: 3 }}>
        <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{label}</span>
        <span>{value}g / {max}g</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "#f0ede8", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

async function searchFoodAI(query) {
  const response = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=5&api_key=385vr15kzXpXlaQN4OGZ1y4sE1YaQFq65rXTuano`
  );
  const data = await response.json();
  const results = (data.foods || []).map(food => {
    const get = (name) => {
      const n = food.foodNutrients?.find(n => n.nutrientName === name);
      return Math.round(n?.value || 0);
    };
    return {
      name: food.description,
      serving: food.servingSize ? `${food.servingSize}${food.servingSizeUnit || "g"}` : "100g",
      calories: get("Energy"),
      protein: get("Protein"),
      carbs: get("Carbohydrate, by difference"),
      fat: get("Total lipid (fat)"),
      fiber: get("Fiber, total dietary"),
      sugar: get("Sugars, total including NLEA"),
    };
  }).filter(f => f.calories > 0);
  return results;
}

async function lookupBarcode(barcode) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
  const data = await res.json();
  if (data.status !== 1) throw new Error("Product not found");
  const p = data.product;
  const n = p.nutriments || {};
  return {
    name: p.product_name || p.generic_name || "Unknown product",
    serving: p.serving_size || "100g",
    calories: Math.round(n["energy-kcal_serving"] || n["energy-kcal_100g"] || 0),
    protein: Math.round(n["proteins_serving"] || n["proteins_100g"] || 0),
    carbs: Math.round(n["carbohydrates_serving"] || n["carbohydrates_100g"] || 0),
    fat: Math.round(n["fat_serving"] || n["fat_100g"] || 0),
    fiber: Math.round(n["fiber_serving"] || n["fiber_100g"] || 0),
    sugar: Math.round(n["sugars_serving"] || n["sugars_100g"] || 0),
  };
}

export default function MacroTracker() {
  const [tab, setTab] = useState("Today");
  const [goals, setGoals] = useState(defaultGoals);
  const [logs, setLogs] = useState({});
  const [customFoods, setCustomFoods] = useState([]);
  const [weights, setWeights] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function loadAll() {
      const [g, l, f, w] = await Promise.all([
        loadFromFirebase(`users/${USER_ID}/settings/goals`),
        loadFromFirebase(`users/${USER_ID}/data/logs`),
        loadFromFirebase(`users/${USER_ID}/data/customFoods`),
        loadFromFirebase(`users/${USER_ID}/data/weights`),
      ]);
      if (g) setGoals(g);
      if (l) setLogs(l);
      if (f) setCustomFoods(f.list || []);
      if (w) setWeights(w);
      setLoaded(true);
    }
    loadAll();
  }, []);

  const saveGoals = (g) => { setGoals(g); saveToFirebase(`users/${USER_ID}/settings/goals`, g); };
  const saveLogs = (l) => { setLogs(l); saveToFirebase(`users/${USER_ID}/data/logs`, l); };
  const saveCustomFoods = (f) => { setCustomFoods(f); saveToFirebase(`users/${USER_ID}/data/customFoods`, { list: f }); };
  const saveWeights = (w) => { setWeights(w); saveToFirebase(`users/${USER_ID}/data/weights`, w); };

  const today = getDateKey();
  const todayLog = logs[today] || [];

  const totals = (entries) => entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fat: acc.fat + (e.fat || 0),
      fiber: acc.fiber + (e.fiber || 0),
      sugar: acc.sugar + (e.sugar || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }
  );

  const addEntry = (food) => {
    const updated = { ...logs, [today]: [...(logs[today] || []), { ...food, id: Date.now(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }] };
    saveLogs(updated);
  };
  const removeEntry = (id) => {
    const updated = { ...logs, [today]: (logs[today] || []).filter(e => e.id !== id) };
    saveLogs(updated);
  };
  const addCustomFood = (food) => { saveCustomFoods([...customFoods, { ...food, id: Date.now() }]); };
  const deleteCustomFood = (id) => { saveCustomFoods(customFoods.filter(f => f.id !== id)); };
  const logWeight = (date, value) => { saveWeights({ ...weights, [date]: value }); };

  const t = totals(todayLog);

  if (!loaded) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#aaa", fontSize: 14 }}>
      Loading…
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#faf8f5", minHeight: "100vh", maxWidth: 480, margin: "0 auto", paddingBottom: 80 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:wght@400;600&display=swap');*{box-sizing:border-box;margin:0;padding:0;}button{cursor:pointer;border:none;background:none;}input{outline:none;}`}</style>
      <div style={{ padding: "28px 24px 0" }}>
        <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#aaa", fontWeight: 500 }}>Daily</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 600, color: "#1a1a1a", letterSpacing: -0.5 }}>Macro Tracker</h1>
      </div>
      <div style={{ display: "flex", padding: "16px 24px 0", borderBottom: "1px solid #ede9e2", overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "8px 14px", fontSize: 13, fontWeight: tab === t ? 600 : 400, color: tab === t ? "#1a1a1a" : "#999", borderBottom: tab === t ? "2px solid #1a1a1a" : "2px solid transparent", background: "none", fontFamily: "inherit", transition: "all 0.2s", whiteSpace: "nowrap" }}>
            {t}
          </button>
        ))}
      </div>
      <div style={{ padding: "20px 24px" }}>
        {tab === "Today" && <TodayTab totals={t} goals={goals} entries={todayLog} onAdd={addEntry} onRemove={removeEntry} customFoods={customFoods} />}
        {tab === "Week" && <WeekTab logs={logs} goals={goals} totals={totals} />}
        {tab === "Weight" && <WeightTab weights={weights} onLog={logWeight} />}
        {tab === "Foods" && <FoodsTab customFoods={customFoods} onSave={addCustomFood} onDelete={deleteCustomFood} onAdd={addEntry} />}
        {tab === "Goals" && <GoalsTab goals={goals} onChange={saveGoals} />}
      </div>
    </div>
  );
}

function TodayTab({ totals, goals, entries, onAdd, onRemove, customFoods }) {
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div>
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, border: "1px solid #ede9e2" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <RingProgress value={totals.calories} max={goals.calories} color={MACRO_COLORS.calories} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a", lineHeight: 1 }}>{totals.calories}</span>
              <span style={{ fontSize: 9, color: "#aaa", marginTop: 1 }}>kcal</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <MacroBar label="Protein" value={totals.protein} max={goals.protein} color={MACRO_COLORS.protein} />
            <MacroBar label="Carbs" value={totals.carbs} max={goals.carbs} color={MACRO_COLORS.carbs} />
            <MacroBar label="Fat" value={totals.fat} max={goals.fat} color={MACRO_COLORS.fat} />
          </div>
        </div>
        <div style={{ borderTop: "1px solid #f5f2ee", paddingTop: 14 }}>
          <MacroBar label="Fiber" value={totals.fiber} max={goals.fiber} color={MACRO_COLORS.fiber} />
          <MacroBar label="Sugar" value={totals.sugar} max={goals.sugar} color={MACRO_COLORS.sugar} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
        {["protein", "carbs", "fat"].map(m => (
          <div key={m} style={{ background: "#fff", border: "1px solid #ede9e2", borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: MACRO_COLORS[m] }}>{Math.max(0, goals[m] - totals[m])}</div>
            <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{m} left</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        {["fiber", "sugar"].map(m => (
          <div key={m} style={{ background: "#fff", border: "1px solid #ede9e2", borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: MACRO_COLORS[m] }}>{Math.max(0, goals[m] - totals[m])}</div>
            <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{m} left</div>
          </div>
        ))}
      </div>

      <button onClick={() => setShowAdd(v => !v)}
        style={{ width: "100%", padding: 13, borderRadius: 12, background: showAdd ? "#1a1a1a" : "#fff", color: showAdd ? "#fff" : "#1a1a1a", border: "1px solid #1a1a1a", fontSize: 14, fontWeight: 600, fontFamily: "inherit", marginBottom: 16, transition: "all 0.2s" }}>
        {showAdd ? "✕ Cancel" : "+ Add Food"}
      </button>
      {showAdd && <AddFoodPanel onAdd={(f) => { onAdd(f); setShowAdd(false); }} customFoods={customFoods} />}

      {entries.length > 0 && (
        <div>
          <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#aaa", fontWeight: 600, marginBottom: 10 }}>Today's Log</p>
          {entries.map(e => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", background: "#fff", border: "1px solid #ede9e2", borderRadius: 12, padding: "12px 14px", marginBottom: 8, gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>{e.name}</div>
                <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{e.serving} · {e.time}</div>
                <div style={{ fontSize: 11, marginTop: 2 }}>
                  {e.fiber > 0 && <span style={{ color: MACRO_COLORS.fiber, marginRight: 6 }}>{e.fiber}g fiber</span>}
                  {e.sugar > 0 && <span style={{ color: MACRO_COLORS.sugar }}>{e.sugar}g sugar</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
                <span style={{ color: MACRO_COLORS.protein, fontWeight: 600 }}>{e.protein}P</span>
                <span style={{ color: MACRO_COLORS.carbs, fontWeight: 600 }}>{e.carbs}C</span>
                <span style={{ color: MACRO_COLORS.fat, fontWeight: 600 }}>{e.fat}F</span>
                <span style={{ fontWeight: 700, color: "#1a1a1a" }}>{e.calories}</span>
              </div>
              <button onClick={() => onRemove(e.id)} style={{ color: "#ccc", fontSize: 18, padding: "0 4px" }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScanConfirm({ food, onAdd, onScanAgain }) {
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("serving");

  const multiplier = unit === "oz"
    ? (parseFloat(qty) * 28.3495) / 100
    : unit === "g"
    ? parseFloat(qty) / 100
    : parseFloat(qty) || 1;

  const scaled = {
    ...food,
    serving: unit === "serving" ? `${qty} serving` : `${qty}${unit}`,
    calories: Math.round(food.calories * multiplier),
    protein: Math.round(food.protein * multiplier),
    carbs: Math.round(food.carbs * multiplier),
    fat: Math.round(food.fat * multiplier),
    fiber: Math.round(food.fiber * multiplier),
    sugar: Math.round(food.sugar * multiplier),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ background: "#faf8f5", borderRadius: 12, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a", marginBottom: 2 }}>{food.name}</div>
        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 10 }}>1 serving = {food.serving}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>Qty:</label>
          <input value={qty} onChange={e => setQty(e.target.value)} type="number" min="0.1" step="0.1"
            style={{ width: 60, padding: "7px 8px", borderRadius: 8, border: "1px solid #ede9e2", fontSize: 15, fontFamily: "inherit", background: "#fff", textAlign: "center", color: "#1a1a1a" }} />
          <select value={unit} onChange={e => setUnit(e.target.value)}
            style={{ flex: 1, padding: "7px 8px", borderRadius: 8, border: "1px solid #ede9e2", fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
            <option value="serving">serving</option>
            <option value="g">g</option>
            <option value="oz">oz</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, fontSize: 13, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: "#1a1a1a" }}>{scaled.calories} kcal</span>
          <span style={{ color: MACRO_COLORS.protein, fontWeight: 600 }}>{scaled.protein}P</span>
          <span style={{ color: MACRO_COLORS.carbs, fontWeight: 600 }}>{scaled.carbs}C</span>
          <span style={{ color: MACRO_COLORS.fat, fontWeight: 600 }}>{scaled.fat}F</span>
          {scaled.fiber > 0 && <span style={{ color: MACRO_COLORS.fiber, fontWeight: 600 }}>{scaled.fiber}g fiber</span>}
          {scaled.sugar > 0 && <span style={{ color: MACRO_COLORS.sugar, fontWeight: 600 }}>{scaled.sugar}g sugar</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onScanAgain}
          style={{ flex: 1, padding: 11, borderRadius: 10, background: "#f5f2ee", color: "#1a1a1a", fontWeight: 600, fontSize: 13, fontFamily: "inherit" }}>
          Scan Again
        </button>
        <button onClick={() => onAdd(scaled)}
          style={{ flex: 2, padding: 11, borderRadius: 10, background: "#1a1a1a", color: "#fff", fontWeight: 600, fontSize: 13, fontFamily: "inherit" }}>
          Add to Log
        </button>
      </div>
    </div>
  );
}

function BarcodeScanner({ onResult, onScanAgain }) {
  const mountRef = React.useRef(null);
  const [status, setStatus] = useState("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [scannedFood, setScannedFood] = useState(null);
  const [debug, setDebug] = useState("");

  useEffect(() => {
    let active = true;
    let quagga = null;

    async function start() {
      try {
        const Q = await import("https://esm.sh/quagga@0.12.1");
        quagga = Q.default || Q;
        if (!active || !mountRef.current) return;

        quagga.init({
          inputStream: {
            type: "LiveStream",
            target: mountRef.current,
            constraints: {
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          locator: { patchSize: "medium", halfSample: true },
          numOfWorkers: 0,
          decoder: {
            readers: ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader", "code_128_reader"],
          },
          locate: true,
        }, (err) => {
          if (err) {
            if (active) { setStatus("error"); setErrorMsg("Camera error: " + err); }
            return;
          }
          if (!active) { quagga.stop(); return; }
          quagga.start();
          setStatus("scanning");
          setDebug("Quagga running…");
        });

        const counts = {};
        quagga.onDetected((result) => {
          if (!active) return;
          const code = result?.codeResult?.code;
          if (!code) return;
          counts[code] = (counts[code] || 0) + 1;
          setDebug(`Reading… (${counts[code]}/3)`);
          if (counts[code] >= 3) {
            quagga.stop();
            handleResult(code);
          }
        });

        quagga.onProcessed((result) => {
          if (result?.boxes) setDebug("Scanning…");
        });

      } catch(e) {
        if (active) { setStatus("error"); setErrorMsg("Failed to load scanner: " + e.message); }
      }
    }

    async function handleResult(barcode) {
      setStatus("found");
      setDebug("");
      try {
        const food = await lookupBarcode(barcode);
        if (active) setScannedFood(food);
      } catch {
        if (active) { setStatus("error"); setErrorMsg("Product not found. Try searching manually."); }
      }
    }

    start();

    return () => {
      active = false;
      try { if (quagga) quagga.stop(); } catch {}
    };
  }, []);

  if (status === "error") return (
    <div style={{ textAlign: "center", padding: "24px 0", color: "#e76f51", fontSize: 13 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
      <p>{errorMsg}</p>
    </div>
  );

  if (scannedFood) return (
    <ScanConfirm food={scannedFood} onAdd={onResult} onScanAgain={onScanAgain} />
  );

  return (
    <div style={{ textAlign: "center" }}>
      <style>{`
        #quagga-mount video, #quagga-mount canvas {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
      `}</style>
      <div id="quagga-mount" ref={mountRef} style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#1a1a1a", marginBottom: 10, width: "100%", height: 220 }} />
      <p style={{ fontSize: 12, color: "#aaa" }}>
        {status === "starting" ? "Loading scanner…" : "Point at barcode"}
      </p>
      {debug && <p style={{ fontSize: 10, color: "#aaa", marginTop: 4, fontFamily: "monospace" }}>{debug}</p>}
    </div>
  );
}

function RecipeAnalyzer({ onAdd }) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("idle");
  const [recipe, setRecipe] = useState(null);
  const [totalServings, setTotalServings] = useState("4");
  const [myServings, setMyServings] = useState("1");
  const [errorMsg, setErrorMsg] = useState("");

  const analyze = async () => {
    if (!url.trim()) return;
    setStatus("loading");
    setRecipe(null);
    setErrorMsg("");
    try {
      const response = await fetch("/api/analyze-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (!data.name || !data.total) throw new Error("Invalid recipe data");
      setRecipe(data);
      setTotalServings(String(data.servings || 4));
      setStatus("done");
    } catch(e) {
      setStatus("error");
      setErrorMsg(`${e.message}`);
    }
  };

  const perServing = recipe ? {
    calories: Math.round(recipe.total.calories / (parseFloat(totalServings) || 1)),
    protein: Math.round(recipe.total.protein / (parseFloat(totalServings) || 1)),
    carbs: Math.round(recipe.total.carbs / (parseFloat(totalServings) || 1)),
    fat: Math.round(recipe.total.fat / (parseFloat(totalServings) || 1)),
    fiber: Math.round(recipe.total.fiber / (parseFloat(totalServings) || 1)),
    sugar: Math.round(recipe.total.sugar / (parseFloat(totalServings) || 1)),
  } : null;

  const myPortion = perServing ? {
    name: recipe.name,
    serving: `${myServings} serving`,
    calories: Math.round(perServing.calories * (parseFloat(myServings) || 1)),
    protein: Math.round(perServing.protein * (parseFloat(myServings) || 1)),
    carbs: Math.round(perServing.carbs * (parseFloat(myServings) || 1)),
    fat: Math.round(perServing.fat * (parseFloat(myServings) || 1)),
    fiber: Math.round(perServing.fiber * (parseFloat(myServings) || 1)),
    sugar: Math.round(perServing.sugar * (parseFloat(myServings) || 1)),
  } : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste recipe URL…"
          style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #ede9e2", fontSize: 13, fontFamily: "inherit", background: "#faf8f5", color: "#1a1a1a" }} />
        <button onClick={analyze} disabled={status === "loading" || !url.trim()}
          style={{ padding: "10px 14px", borderRadius: 10, background: status === "loading" ? "#ccc" : "#1a1a1a", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap" }}>
          {status === "loading" ? "…" : "Analyze"}
        </button>
      </div>
      <p style={{ fontSize: 11, color: "#aaa", marginTop: -4 }}>Paste a URL from any recipe website</p>

      {status === "loading" && (
        <div style={{ textAlign: "center", padding: "20px 0", color: "#aaa", fontSize: 13 }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>🍳</div>
          Analyzing recipe…
        </div>
      )}

      {status === "error" && (
        <p style={{ color: "#e76f51", fontSize: 12 }}>{errorMsg}</p>
      )}

      {status === "done" && recipe && perServing && myPortion && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: "#faf8f5", borderRadius: 12, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a", marginBottom: 10 }}>{recipe.name}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>Recipe makes:</label>
              <input value={totalServings} onChange={e => setTotalServings(e.target.value)} type="number" min="1" step="1"
                style={{ width: 52, padding: "6px 8px", borderRadius: 8, border: "1px solid #ede9e2", fontSize: 14, fontFamily: "inherit", background: "#fff", textAlign: "center", color: "#1a1a1a" }} />
              <span style={{ fontSize: 12, color: "#666" }}>servings</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>I'm having:</label>
              <input value={myServings} onChange={e => setMyServings(e.target.value)} type="number" min="0.25" step="0.25"
                style={{ width: 52, padding: "6px 8px", borderRadius: 8, border: "1px solid #ede9e2", fontSize: 14, fontFamily: "inherit", background: "#fff", textAlign: "center", color: "#1a1a1a" }} />
              <span style={{ fontSize: 12, color: "#666" }}>servings</span>
            </div>
            <div style={{ borderTop: "1px solid #ede9e2", paddingTop: 10 }}>
              <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Your portion</div>
              <div style={{ display: "flex", gap: 8, fontSize: 13, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, color: "#1a1a1a" }}>{myPortion.calories} kcal</span>
                <span style={{ color: MACRO_COLORS.protein, fontWeight: 600 }}>{myPortion.protein}P</span>
                <span style={{ color: MACRO_COLORS.carbs, fontWeight: 600 }}>{myPortion.carbs}C</span>
                <span style={{ color: MACRO_COLORS.fat, fontWeight: 600 }}>{myPortion.fat}F</span>
                {myPortion.fiber > 0 && <span style={{ color: MACRO_COLORS.fiber, fontWeight: 600 }}>{myPortion.fiber}g fiber</span>}
                {myPortion.sugar > 0 && <span style={{ color: MACRO_COLORS.sugar, fontWeight: 600 }}>{myPortion.sugar}g sugar</span>}
              </div>
            </div>
          </div>
          <button onClick={() => onAdd(myPortion)}
            style={{ width: "100%", padding: 12, borderRadius: 10, background: "#1a1a1a", color: "#fff", fontWeight: 600, fontSize: 14, fontFamily: "inherit" }}>
            Add to Log
          </button>
        </div>
      )}
    </div>
  );
}

function AddFoodPanel({ onAdd, customFoods }) {
  const [mode, setMode] = useState("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scanKey, setScanKey] = useState(0);

  const doSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(""); setResults([]);
    try { setResults(await searchFoodAI(query)); }
    catch { setError("Search failed. Try again."); }
    setLoading(false);
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #ede9e2", borderRadius: 16, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["search", "🔍 Search"], ["scan", "📷 Scan"], ["recipe", "🍳 Recipe"], ["custom", "📦 My Foods"], ["manual", "✏️ Manual"]].map(([m, l]) => (
          <button key={m} onClick={() => setMode(m)}
            style={{ flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: 11, fontWeight: mode === m ? 700 : 400, background: mode === m ? "#1a1a1a" : "#f5f2ee", color: mode === m ? "#fff" : "#666", fontFamily: "inherit", transition: "all 0.2s" }}>
            {l}
          </button>
        ))}
      </div>
      {mode === "search" && (
        <div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} placeholder="Search any food…"
              style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #ede9e2", fontSize: 14, fontFamily: "inherit", background: "#faf8f5" }} />
            <button onClick={doSearch} style={{ padding: "10px 16px", borderRadius: 10, background: "#1a1a1a", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
              {loading ? "…" : "Go"}
            </button>
          </div>
          {error && <p style={{ color: "#e76f51", fontSize: 12, marginTop: 8 }}>{error}</p>}
          {results.map((f, i) => <FoodResultRow key={i} food={f} onAdd={onAdd} />)}
        </div>
      )}
      {mode === "scan" && <BarcodeScanner key={scanKey} onResult={(food) => { onAdd(food); }} onScanAgain={() => setScanKey(k => k + 1)} />}
      {mode === "recipe" && <RecipeAnalyzer onAdd={onAdd} />}
      {mode === "custom" && (
        <div>
          {customFoods.length === 0
            ? <p style={{ color: "#aaa", fontSize: 13, textAlign: "center", padding: "16px 0" }}>No saved foods yet. Add some in the Foods tab.</p>
            : customFoods.map(f => <FoodResultRow key={f.id} food={f} onAdd={onAdd} />)}
        </div>
      )}
      {mode === "manual" && <ManualFoodForm onAdd={onAdd} />}
    </div>
  );
}

function FoodResultRow({ food, onAdd }) {
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState("serving");

  const multiplier = unit === "oz"
    ? (parseFloat(qty) * 28.3495) / 100
    : unit === "g"
    ? parseFloat(qty) / 100
    : parseFloat(qty) || 1;

  const scaled = {
    ...food,
    serving: unit === "serving" ? `${qty} serving` : `${qty}${unit}`,
    calories: Math.round(food.calories * multiplier),
    protein: Math.round(food.protein * multiplier),
    carbs: Math.round(food.carbs * multiplier),
    fat: Math.round(food.fat * multiplier),
    fiber: Math.round(food.fiber * multiplier),
    sugar: Math.round(food.sugar * multiplier),
  };

  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid #f5f2ee" }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a", marginBottom: 4 }}>{food.name}</div>
      <div style={{ fontSize: 11, color: "#aaa", marginBottom: 8 }}>
        {scaled.serving} · {scaled.calories} kcal · {scaled.protein}P {scaled.carbs}C {scaled.fat}F
        {scaled.fiber > 0 && <span style={{ color: MACRO_COLORS.fiber, marginLeft: 6 }}>{scaled.fiber}g fiber</span>}
        {scaled.sugar > 0 && <span style={{ color: MACRO_COLORS.sugar, marginLeft: 6 }}>{scaled.sugar}g sugar</span>}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input value={qty} onChange={e => setQty(e.target.value)} type="number" min="0.1" step="0.1"
          style={{ width: 60, padding: "6px 8px", borderRadius: 8, border: "1px solid #ede9e2", fontSize: 14, fontFamily: "inherit", background: "#faf8f5" }} />
        <select value={unit} onChange={e => setUnit(e.target.value)}
          style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #ede9e2", fontSize: 13, fontFamily: "inherit", background: "#faf8f5" }}>
          <option value="serving">serving</option>
          <option value="oz">oz</option>
          <option value="g">g</option>
        </select>
        <button onClick={() => onAdd(scaled)}
          style={{ flex: 1, padding: "6px 14px", borderRadius: 8, background: "#1a1a1a", color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
          Add
        </button>
      </div>
    </div>
  );
}

function ManualFoodForm({ onAdd, onSave }) {
  const empty = { name: "", serving: "1 serving", calories: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "" };
  const [form, setForm] = useState(empty);
  const [oz, setOz] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.name && form.calories && form.protein && form.carbs && form.fat;

  const convertOz = () => {
    if (!oz) return;
    const grams = Math.round(parseFloat(oz) * 28.3495);
    set("serving", `${oz}oz (${grams}g)`);
  };

  const handleSubmit = (action) => {
    if (!valid) return;
    const food = { ...form, calories: +form.calories, protein: +form.protein, carbs: +form.carbs, fat: +form.fat, fiber: +(form.fiber || 0), sugar: +(form.sugar || 0) };
    if (action === "add" && onAdd) { onAdd(food); setForm(empty); setOz(""); }
    if (action === "save" && onSave) { onSave(food); setForm(empty); setOz(""); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Food name*"
        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ede9e2", fontSize: 14, fontFamily: "inherit", background: "#faf8f5" }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input value={form.serving} onChange={e => set("serving", e.target.value)} placeholder="Serving size"
          style={{ flex: 2, padding: "10px 12px", borderRadius: 10, border: "1px solid #ede9e2", fontSize: 14, fontFamily: "inherit", background: "#faf8f5" }} />
        <input value={oz} onChange={e => setOz(e.target.value)} placeholder="oz" type="number"
          style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #ede9e2", fontSize: 14, fontFamily: "inherit", background: "#faf8f5" }} />
        <button onClick={convertOz}
          style={{ padding: "10px 12px", borderRadius: 10, background: "#f5f2ee", color: "#1a1a1a", fontSize: 12, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap" }}>
          → g
        </button>
      </div>
      <p style={{ fontSize: 11, color: "#aaa", marginTop: -6 }}>Enter oz and tap → g to convert serving size</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[["calories","Calories*"],["protein","Protein (g)*"],["carbs","Carbs (g)*"],["fat","Fat (g)*"],["fiber","Fiber (g)"],["sugar","Sugar (g)"]].map(([k, label]) => (
          <input key={k} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={label} type="number"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ede9e2", fontSize: 14, fontFamily: "inherit", background: "#faf8f5" }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {onAdd && <button onClick={() => handleSubmit("add")} disabled={!valid}
          style={{ flex: 1, padding: 11, borderRadius: 10, background: valid ? "#1a1a1a" : "#e0ddd8", color: valid ? "#fff" : "#aaa", fontWeight: 600, fontSize: 14, fontFamily: "inherit" }}>
          Add to Log
        </button>}
        {onSave && <button onClick={() => handleSubmit("save")} disabled={!valid}
          style={{ flex: 1, padding: 11, borderRadius: 10, background: valid ? "#2d6a4f" : "#e0ddd8", color: valid ? "#fff" : "#aaa", fontWeight: 600, fontSize: 14, fontFamily: "inherit" }}>
          Save Food
        </button>}
      </div>
    </div>
  );
}

function WeekTab({ logs, goals, totals }) {
  const days = getLast7Days();
  const dayLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return (
    <div>
      <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#aaa", fontWeight: 600, marginBottom: 14 }}>Last 7 Days</p>
      {days.map(d => {
        const entries = logs[d] || [];
        const t = totals(entries);
        const pct = Math.min(t.calories / goals.calories, 1);
        const date = new Date(d + "T12:00:00");
        const isToday = d === getDateKey();
        return (
          <div key={d} style={{ background: "#fff", border: isToday ? "1.5px solid #1a1a1a" : "1px solid #ede9e2", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#aaa", fontWeight: 500 }}>{dayLabels[date.getDay()]}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: isToday ? "#1a1a1a" : "#555" }}>{date.getDate()}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{t.calories} kcal</span>
                <span style={{ color: "#aaa" }}>{t.protein}P · {t.fiber}g fiber · {entries.length} items</span>
              </div>
              <div style={{ height: 5, background: "#f0ede8", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct * 100}%`, height: "100%", background: pct > 0.95 ? "#e76f51" : "#1a1a1a", borderRadius: 3 }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeightTab({ weights, onLog }) {
  const today = getDateKey();
  const [input, setInput] = useState(weights[today] || "");
  const [height, setHeight] = useState({ ft: 5, in: 7 });
  const days = getLast7Days();

  const save = () => { if (input) onLog(today, parseFloat(input)); };
  const heightInches = height.ft * 12 + height.in;
  const latestWeight = days.slice().reverse().map(d => weights[d]).find(w => w);
  const bmi = latestWeight && heightInches ? ((latestWeight / (heightInches * heightInches)) * 703).toFixed(1) : null;
  const bmiCategory = bmi ? bmi < 18.5 ? "Underweight" : bmi < 25 ? "Normal weight" : bmi < 30 ? "Overweight" : "Obese" : null;
  const bmiColor = bmi ? bmi < 18.5 ? "#457b9d" : bmi < 25 ? "#2d6a4f" : bmi < 30 ? "#f4a261" : "#e76f51" : "#aaa";

  return (
    <div>
      <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#aaa", fontWeight: 600, marginBottom: 14 }}>Weight</p>
      <div style={{ background: "#fff", border: "1px solid #ede9e2", borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 12 }}>Log Today's Weight</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="lbs" type="number"
            style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #ede9e2", fontSize: 16, fontFamily: "inherit", background: "#faf8f5" }} />
          <button onClick={save} style={{ padding: "10px 20px", borderRadius: 10, background: "#1a1a1a", color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>Save</button>
        </div>
      </div>
      <div style={{ background: "#fff", border: "1px solid #ede9e2", borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 12 }}>BMI Calculator</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "#aaa", display: "block", marginBottom: 4 }}>Height (ft)</label>
            <input value={height.ft} onChange={e => setHeight(h => ({ ...h, ft: +e.target.value }))} type="number" min={3} max={8}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ede9e2", fontSize: 14, fontFamily: "inherit", background: "#faf8f5" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "#aaa", display: "block", marginBottom: 4 }}>Height (in)</label>
            <input value={height.in} onChange={e => setHeight(h => ({ ...h, in: +e.target.value }))} type="number" min={0} max={11}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ede9e2", fontSize: 14, fontFamily: "inherit", background: "#faf8f5" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: "#aaa", display: "block", marginBottom: 4 }}>Weight (lbs)</label>
            <input value={latestWeight || ""} readOnly placeholder="—"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ede9e2", fontSize: 14, fontFamily: "inherit", background: "#f5f2ee", color: "#aaa" }} />
          </div>
        </div>
        {bmi && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#faf8f5", borderRadius: 12, padding: "14px 16px" }}>
            <div>
              <div style={{ fontSize: 36, fontWeight: 700, color: bmiColor, lineHeight: 1 }}>{bmi}</div>
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>BMI</div>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: bmiColor }}>{bmiCategory}</div>
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>Based on latest logged weight</div>
            </div>
          </div>
        )}
        {!bmi && <p style={{ fontSize: 13, color: "#aaa", textAlign: "center" }}>Log a weight above to see your BMI</p>}
      </div>
      <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#aaa", fontWeight: 600, marginBottom: 10 }}>7-Day Log</p>
      {days.slice().reverse().map(d => {
        const w = weights[d];
        const date = new Date(d + "T12:00:00");
        const isToday = d === getDateKey();
        return w ? (
          <div key={d} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: isToday ? "1.5px solid #1a1a1a" : "1px solid #ede9e2", borderRadius: 12, padding: "12px 16px", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: "#666" }}>{date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}{isToday ? " · Today" : ""}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>{w} lbs</span>
          </div>
        ) : null;
      })}
    </div>
  );
}

function FoodsTab({ customFoods, onSave, onDelete, onAdd }) {
  const [showForm, setShowForm] = useState(false);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#aaa", fontWeight: 600 }}>My Foods</p>
        <button onClick={() => setShowForm(v => !v)} style={{ fontSize: 12, fontWeight: 600, color: showForm ? "#e76f51" : "#1a1a1a", fontFamily: "inherit" }}>
          {showForm ? "Cancel" : "+ New Food"}
        </button>
      </div>
      {showForm && (
        <div style={{ background: "#fff", border: "1px solid #ede9e2", borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <ManualFoodForm onSave={(food) => { onSave(food); setShowForm(false); }} />
        </div>
      )}
      {customFoods.length === 0 && !showForm && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#bbb" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🥗</div>
          <p style={{ fontSize: 14 }}>Save your custom foods and recipes here.</p>
        </div>
      )}
      {customFoods.map(f => (
        <div key={f.id} style={{ background: "#fff", border: "1px solid #ede9e2", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>{f.name}</div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{f.serving} · {f.calories} kcal · {f.protein}P {f.carbs}C {f.fat}F</div>
            {(f.fiber > 0 || f.sugar > 0) && (
              <div style={{ fontSize: 11, marginTop: 1 }}>
                {f.fiber > 0 && <span style={{ color: MACRO_COLORS.fiber, marginRight: 6 }}>{f.fiber}g fiber</span>}
                {f.sugar > 0 && <span style={{ color: MACRO_COLORS.sugar }}>{f.sugar}g sugar</span>}
              </div>
            )}
          </div>
          <button onClick={() => onAdd(f)} style={{ padding: "5px 12px", borderRadius: 8, background: "#1a1a1a", color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>Log</button>
          <button onClick={() => onDelete(f.id)} style={{ color: "#ccc", fontSize: 18, padding: "0 4px" }}>×</button>
        </div>
      ))}
    </div>
  );
}

function GoalsTab({ goals, onChange }) {
  const [draft, setDraft] = useState(goals);
  const set = (k, v) => setDraft(d => ({ ...d, [k]: +v }));
  const fields = [
    ["calories", "Calories", "kcal", 500, 5000],
    ["protein", "Protein", "g", 10, 400],
    ["carbs", "Carbohydrates", "g", 10, 500],
    ["fat", "Fat", "g", 10, 200],
    ["fiber", "Fiber", "g", 5, 60],
    ["sugar", "Sugar", "g", 5, 150],
  ];
  return (
    <div>
      <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#aaa", fontWeight: 600, marginBottom: 16 }}>Daily Goals</p>
      <div style={{ background: "#fff", border: "1px solid #ede9e2", borderRadius: 16, padding: 20, marginBottom: 16 }}>
        {fields.map(([k, label, unit, min, max]) => (
          <div key={k} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{label}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="number" value={draft[k]} onChange={e => set(k, e.target.value)}
                  style={{ width: 70, padding: "6px 10px", borderRadius: 8, border: "1px solid #ede9e2", fontSize: 14, fontFamily: "inherit", textAlign: "right", background: "#faf8f5" }} />
                <span style={{ fontSize: 12, color: "#aaa" }}>{unit}</span>
              </div>
            </div>
            <input type="range" min={min} max={max} value={draft[k]} onChange={e => set(k, e.target.value)}
              style={{ width: "100%", accentColor: MACRO_COLORS[k] }} />
          </div>
        ))}
      </div>
      <button onClick={() => onChange(draft)}
        style={{ width: "100%", padding: 13, borderRadius: 12, background: "#1a1a1a", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>
        Save Goals
      </button>
    </div>
  );
}
