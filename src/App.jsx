import { useState, useEffect } from "react";

const STORAGE_KEYS = {
  customFoods: "macro-tracker-custom-foods",
  goals: "macro-tracker-goals",
  logs: "macro-tracker-logs",
  weights: "macro-tracker-weights",
};

const defaultGoals = { calories: 2000, protein: 150, carbs: 200, fat: 65, fiber: 25, sugar: 50 };

function getDateKey(date = new Date()) {
  return date.toISOString().split("T")[0];
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
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Return nutrition info for: "${query}". Respond ONLY with valid JSON array (no markdown, no preamble) of 1-4 matching foods. Each object: { "name": string, "serving": string, "calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number, "sugar": number }. Use realistic values per serving.`
      }]
    })
  });
  const data = await response.json();
  const text = data.content?.find(b => b.type === "text")?.text || "[]";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

export default function MacroTracker() {
  const [tab, setTab] = useState("Today");
  const [goals, setGoals] = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.goals)) || defaultGoals; } catch { return defaultGoals; } });
  const [logs, setLogs] = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.logs)) || {}; } catch { return {}; } });
  const [customFoods, setCustomFoods] = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.customFoods)) || []; } catch { return []; } });
  const [weights, setWeights] = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.weights)) || {}; } catch { return {}; } });

  useEffect(() => { localStorage.setItem(STORAGE_KEYS.goals, JSON.stringify(goals)); }, [goals]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(logs)); }, [logs]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.customFoods, JSON.stringify(customFoods)); }, [customFoods]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.weights, JSON.stringify(weights)); }, [weights]);

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
    setLogs(prev => ({ ...prev, [today]: [...(prev[today] || []), { ...food, id: Date.now(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }] }));
  };
  const removeEntry = (id) => { setLogs(prev => ({ ...prev, [today]: (prev[today] || []).filter(e => e.id !== id) })); };
  const saveCustomFood = (food) => { setCustomFoods(prev => [...prev, { ...food, id: Date.now() }]); };
  const deleteCustomFood = (id) => { setCustomFoods(prev => prev.filter(f => f.id !== id)); };
  const logWeight = (date, value) => { setWeights(prev => ({ ...prev, [date]: value })); };

  const t = totals(todayLog);

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
        {tab === "Foods" && <FoodsTab customFoods={customFoods} onSave={saveCustomFood} onDelete={deleteCustomFood} onAdd={addEntry} />}
        {tab === "Goals" && <GoalsTab goals={goals} onChange={setGoals} />}
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
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
                <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>
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

function AddFoodPanel({ onAdd, customFoods }) {
  const [mode, setMode] = useState("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        {[["search", "🔍 Search"], ["custom", "📦 My Foods"], ["manual", "✏️ Manual"]].map(([m, l]) => (
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
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #f5f2ee" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>{food.name}</div>
        <div style={{ fontSize: 11, color: "#aaa" }}>{food.serving} · {food.calories} kcal · {food.protein}P {food.carbs}C {food.fat}F</div>
        {(food.fiber > 0 || food.sugar > 0) && (
          <div style={{ fontSize: 11, marginTop: 1 }}>
            {food.fiber > 0 && <span style={{ color: MACRO_COLORS.fiber, marginRight: 6 }}>{food.fiber}g fiber</span>}
            {food.sugar > 0 && <span style={{ color: MACRO_COLORS.sugar }}>{food.sugar}g sugar</span>}
          </div>
        )}
      </div>
      <button onClick={() => onAdd(food)} style={{ padding: "6px 14px", borderRadius: 8, background: "#1a1a1a", color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>Add</button>
    </div>
  );
}

function ManualFoodForm({ onAdd, onSave }) {
  const empty = { name: "", serving: "1 serving", calories: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "" };
  const [form, setForm] = useState(empty);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.name && form.calories && form.protein && form.carbs && form.fat;

  const handleSubmit = (action) => {
    if (!valid) return;
    const food = { ...form, calories: +form.calories, protein: +form.protein, carbs: +form.carbs, fat: +form.fat, fiber: +(form.fiber || 0), sugar: +(form.sugar || 0) };
    if (action === "add" && onAdd) { onAdd(food); setForm(empty); }
    if (action === "save" && onSave) { onSave(food); setForm(empty); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Food name*"
        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ede9e2", fontSize: 14, fontFamily: "inherit", background: "#faf8f5" }} />
      <input value={form.serving} onChange={e => set("serving", e.target.value)} placeholder="Serving size"
        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ede9e2", fontSize: 14, fontFamily: "inherit", background: "#faf8f5" }} />
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

      {/* Log today */}
      <div style={{ background: "#fff", border: "1px solid #ede9e2", borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 12 }}>Log Today's Weight</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="lbs" type="number"
            style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #ede9e2", fontSize: 16, fontFamily: "inherit", background: "#faf8f5" }} />
          <button onClick={save} style={{ padding: "10px 20px", borderRadius: 10, background: "#1a1a1a", color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>Save</button>
        </div>
      </div>

      {/* BMI Calculator */}
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

      {/* 7-day log */}
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