import React, { useEffect, useRef, useState } from "react";

// Apple-like, smooth single-file React component
// Tailwind CSS assumed. Copy into your app (e.g. Vite + React + Tailwind).
// Collaboration: optional WebSocket server. If you provide wsUrl, the component will connect and sync list state.

export default function AppleLikeListApp({ wsUrl = null }) {
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
  const clientIdRef = useRef(() => Math.random().toString(36).slice(2));
  const wsRef = useRef(null);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem("apple_list_items", JSON.stringify(items));
  }, [items]);

  // WebSocket collaboration
  useEffect(() => {
    if (!wsUrl) return;
    try {
      wsRef.current = new WebSocket(wsUrl);
    } catch (e) {
      console.warn("Invalid wsUrl", e);
      return;
    }
    const ws = wsRef.current;
    ws.onopen = () => {
      // announce and request state
      ws.send(JSON.stringify({ type: "hello", client: clientIdRef.current }));
      ws.send(JSON.stringify({ type: "request_state", client: clientIdRef.current }));
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.client === clientIdRef.current) return; // ignore our own
        if (msg.type === "state") {
          // Replace for simple sync (could do smarter merge)
          if (Array.isArray(msg.items)) {
            setItems(msg.items);
          }
        } else if (msg.type === "patch") {
          // apply patch (simple replace or add)
          if (Array.isArray(msg.items)) setItems(msg.items);
        }
      } catch (e) {
        console.warn("bad message", e);
      }
    };
    ws.onclose = () => {
      console.info("ws closed");
    };
    return () => {
      ws.close();
    };
  }, [wsUrl]);

  // Broadcast state to collaborators
  const broadcastState = (newItems) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "state", client: clientIdRef.current, items: newItems })
      );
    }
  };

  const addItem = (t) => {
    if (!t || !t.trim()) return;
    const newItems = [...items, t.trim()];
    setItems(newItems);
    broadcastState(newItems);
    setText("");
  };

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
    const from = dragIndex !== null ? dragIndex : Number(e.dataTransfer.getData("text/plain"));
    let to = idx;
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

  // UI helpers
  const placeholder = "Add something awesome...";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-8 font-sans antialiased">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold leading-tight">My Smooth List</h1>
            <p className="text-sm text-slate-500">Add items, drag to reorder, export .txt, and collaborate.</p>
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
            // CSS multi-column layout: when vertical space fills, items flow into a new column automatically
            columnWidth: 260,
            columnGap: "24px",
            maxHeight: "60vh",
            overflow: "auto",
          }}
        >
          {/* Items need to be inline-block to avoid being split across columns */}
          {items.map((it, idx) => (
            <div
              key={it + idx}
              draggable
              onDragStart={(e) => onDragStart(e, idx)}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={(e) => onDrop(e, idx)}
              className={`inline-block w-60 align-top mb-4 mr-4 rounded-xl p-3 border border-slate-100 shadow-sm transform transition hover:scale-101 cursor-grab bg-gradient-to-b from-white to-slate-50`}
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

          {/* empty state */}
          {items.length === 0 && (
            <div className="text-center text-slate-400 py-20">Your list is empty — add something ✨</div>
          )}
        </div>

        <footer className="mt-4 text-xs text-slate-500">
          <div>Collaboration: {wsUrl ? "connected to provided websocket" : "disabled (no wsUrl)"}.</div>
          <div className="mt-1">Tip: Use a tiny WebSocket server that relays messages (or a simple Socket.io server) to enable real-time sync.</div>
        </footer>
      </div>
    </div>
  );
}
