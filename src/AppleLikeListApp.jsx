// src/AppleLikeListApp.jsx
import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/**
 * Single-file Apple-like multi-column collaborative list using Supabase Realtime.
 *
 * Save as src/AppleLikeListApp.jsx
 *
 * Requirements:
 *   npm install @supabase/supabase-js
 *   VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set in your environment (Netlify or .env)
 *
 * Behavior:
 *  - Stores the list in Supabase table `lists` row id='default' (jsonb items).
 *  - Subscribes to changes and syncs in realtime.
 *  - Falls back to localStorage while loading.
 *  - Supports add, remove, drag/reorder, export .txt, and multi-column layout.
 */

// Initialize Supabase client from Vite env vars
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export default function AppleLikeListApp() {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("apple_list_items")) || [];
    } catch {
      return [];
    }
  });
  const [text, setText] = useState("");
  const [dragIndex, setDragIndex] = useState(null);
  const listRef = useRef(null);
  const isMounted = useRef(true);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem("apple_list_items", JSON.stringify(items));
  }, [items]);

  // Supabase: load initial state & subscribe to realtime updates
  useEffect(() => {
    isMounted.current = true;
    if (!supabase) {
      console.warn("Supabase not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
      return () => {
        isMounted.current = false;
      };
    }

    let channel = null;
    let mounted = true;

    const load = async () => {
      // Try to load row id='default'
      try {
        const { data, error } = await supabase
          .from("lists")
          .select("items")
          .eq("id", "default")
          .single();

        if (error && error.code !== "PGRST116") {
          // PGRST116: no rows returned may be driver-specific - ignore if empty
          console.error("Supabase load error:", error);
        } else if (data && mounted) {
          const loadedItems = Array.isArray(data.items) ? data.items : [];
          setItems(loadedItems);
        } else {
          // If no data, keep localStorage fallback (already set in initial state)
        }
      } catch (err) {
        console.error("Error loading from supabase:", err);
      }
    };

    load();

    // Subscribe to changes on the 'lists' table for row id='default'
    try {
      channel = supabase
        .channel("public:lists")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "lists", filter: "id=eq.default" },
          (payload) => {
            // payload.new contains the updated row
            const newItems = payload?.new?.items;
            if (Array.isArray(newItems) && isMounted.current) {
              setItems(newItems);
            }
          }
        )
        .subscribe((status) => {
          // optional: debug subscription status
          // console.log("supabase subscription status:", status);
        });
    } catch (err) {
      console.error("Supabase subscription error:", err);
    }

    return () => {
      mounted = false;
      isMounted.current = false;
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (err) {
          // ignore
        }
      }
    };
  }, []);

  // Upsert the list row in Supabase (broadcast)
  const broadcastState = async (newItems) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from("lists").upsert({
        id: "default",
        items: newItems,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.error("Supabase upsert error:", error);
      }
    } catch (err) {
      console.error("Supabase upsert exception:", err);
    }
  };

  // Add item
  const addItem = (t) => {
    if (!t || !t.trim()) return;
    const newItems = [...items, t.trim()];
    setItems(newItems);
    broadcastState(newItems);
    setText("");
  };

  // Remove item by index
  const removeItem = (i) => {
    const newItems = items.filter((_, idx) => idx !== i);
    setItems(newItems);
    broadcastState(newItems);
  };

  // Drag & drop reorder
  const onDragStart = (e, idx) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", String(idx));
    } catch (err) {}
  };

  const onDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = (e, idx) => {
    e.preventDefault();
    const from =
      dragIndex !== null ? dragIndex : Number(e.dataTransfer.getData("text/plain"));
    const to = idx;
    if (from === to) return setDragIndex(null);
    const newItems = [...items];
    const [m] = newItems.splice(from, 1);
    newItems.splice(to, 0, m);
    setItems(newItems);
    broadcastState(newItems);
    setDragIndex(null);
  };

  // Export as .txt
  const exportTxt = () => {
    const content = items.join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-list.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Keyboard: Enter to add
  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      addItem(text);
    }
  };

  const placeholder = "Add something awesome...";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-8 font-sans antialiased">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold leading-tight">My Smooth List</h1>
            <p className="text-sm text-slate-500">
              Add items, drag to reorder, export .txt, and collaborate.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={exportTxt}
              className="px-3 py-2 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition"
              title="Export .txt"
            >
              Export .txt
            </button>
            <button
              onClick={() => {
                setItems([]);
                broadcastState([]);
              }}
              className="px-3 py-2 rounded-2xl bg-red-50 text-red-600 border border-red-100"
              title="Clear list"
            >
              Clear
            </button>
          </div>
        </header>

        <div className="mb-4 flex gap-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="flex-1 px-4 py-3 rounded-2xl border border-slate-200 shadow-inner focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          <button
            onClick={() => addItem(text)}
            className="px-4 py-3 rounded-2xl bg-black text-white shadow hover:opacity-95"
          >
            Add
          </button>
        </div>

        <div
          ref={listRef}
          className="p-6 rounded-3xl bg-white/90 border border-slate-100 shadow-lg"
          style={{
            columnWidth: 260,
            columnGap: "24px",
            maxHeight: "60vh",
            overflow: "auto",
          }}
        >
          {items.map((it, idx) => (
            <div
              key={it + idx}
              draggable
              onDragStart={(e) => onDragStart(e, idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={(e) => onDrop(e, idx)}
              className="inline-block w-60 align-top mb-4 mr-4 rounded-xl p-3 border border-slate-100 shadow-sm transform transition hover:scale-101 cursor-grab bg-gradient-to-b from-white to-slate-50"
              style={{ breakInside: "avoid" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="text-sm font-medium">{it}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => removeItem(idx)}
                    className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-600 border border-red-100"
                    title="Remove"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <div className="text-center text-slate-400 py-20">Your list is empty — add something ✨</div>
          )}
        </div>

        <footer className="mt-4 text-xs text-slate-500">
          <div>
            Collaboration: {supabase ? "connected via Supabase" : "disabled (Supabase not configured)"}.
          </div>
          <div className="mt-1">
            Tip: set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in Netlify's environment variables.
          </div>
        </footer>
      </div>
    </div>
  );
}