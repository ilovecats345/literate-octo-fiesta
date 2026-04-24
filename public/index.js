"use strict";

const form = document.getElementById("proxy-form");
const input = document.getElementById("proxy-url");
const errorEl = document.getElementById("proxy-error");

// Scramjet controller setup (per TN docs)
const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
  files: {
    wasm: "/scram/scramjet.wasm.wasm",
    all: "/scram/scramjet.all.js",
    sync: "/scram/scramjet.sync.js",
  },
});
scramjet.init();

// BareMux connection (you must also serve /baremux/worker.js)
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

// Simple URL vs search detection
function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  // If it looks like a URL, ensure scheme
  if (/^(https?:\/\/|[\w-]+\.[\w]{2,}).*/i.test(trimmed)) {
    if (!/^https?:\/\//i.test(trimmed)) {
      return "https://" + trimmed;
    }
    return trimmed;
  }

  // Otherwise, treat as a search query (DuckDuckGo by default)
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

// Register SW + open frame on submit
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";

  const rawUrl = input.value;
  const url = normalizeUrl(rawUrl);

  if (!url) {
    errorEl.textContent = "Enter a URL or search query.";
    return;
  }

  try {
    // Make sure SW is registered
    if (!navigator.serviceWorker.controller) {
      await navigator.serviceWorker.register("sw.js");
      console.log("Scramjet service worker registered");
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Failed to register service worker.";
    return;
  }

  // Set up BareMux transport if not already set
  try {
    const wispUrl =
      (location.protocol === "https:" ? "wss" : "ws") +
      "://" +
      location.host +
      "/wisp/";

    const currentTransport = await connection.getTransport();
    if (!currentTransport || currentTransport !== "/libcurl/index.mjs") {
      // Using libcurl transport as in Scramjet-App example
      await connection.setTransport("/libcurl/index.mjs", [
        { websocket: wispUrl },
      ]);
      console.log("BareMux transport set to libcurl");
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Failed to configure transport.";
    return;
  }

  // Create or reuse the Scramjet proxy frame
  try {
    let frame = document.getElementById("proxy-frame");
    if (!frame) {
      const proxyFrame = scramjet.createFrame();
      proxyFrame.frame.id = "proxy-frame";
      document.body.appendChild(proxyFrame.frame);
      frame = proxyFrame.frame;
    }

    // Navigate the frame to the proxied URL
    const proxyFrame = scramjet.frameById("proxy-frame");
    if (!proxyFrame) {
      errorEl.textContent = "Could not create proxy frame.";
      return;
    }
    proxyFrame.go(url);
    console.log("Navigating proxy frame to:", url);
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Failed to open proxied site.";
  }
});
