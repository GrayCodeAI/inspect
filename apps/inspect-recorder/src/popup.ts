// ──────────────────────────────────────────────────────────────────────────────
// Inspect Recorder — Popup UI Logic
// ──────────────────────────────────────────────────────────────────────────────

interface PopupRecordedEvent {
  type: string;
  timestamp: number;
  url: string;
  selector?: string;
  text?: string;
  value?: string;
}

let popupRecording = false;
let events: PopupRecordedEvent[] = [];
let generatedTestScript = "";

/** Send message to background script */
function sendMessage(
  action: string,
  data?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, ...data }, (response) => {
      resolve(response || {});
    });
  });
}

/** Update UI based on recording state */
function updateUI(): void {
  const btnRecord = document.getElementById("btnRecord") as HTMLButtonElement;
  const btnClear = document.getElementById("btnClear") as HTMLButtonElement;
  const btnExport = document.getElementById("btnExport") as HTMLButtonElement;
  const btnCopy = document.getElementById("btnCopy") as HTMLButtonElement;
  const statusDot = document.getElementById("statusDot");
  const emptyState = document.getElementById("emptyState");
  const stats = document.getElementById("stats");

  btnRecord.textContent = popupRecording ? "Stop Recording" : "Start Recording";
  btnRecord.classList.toggle("recording", popupRecording);
  statusDot?.classList.toggle("recording", popupRecording);

  btnClear.disabled = events.length === 0;
  btnExport.disabled = events.length === 0;
  btnCopy.disabled = events.length === 0;

  if (events.length === 0) {
    if (emptyState) {
      emptyState.textContent = popupRecording
        ? "Interact with the page to record events..."
        : 'Click "Start Recording" to begin capturing interactions';
      emptyState.style.display = "block";
    }
    document.getElementById("eventList")!.innerHTML = "";
    document.getElementById("eventList")!.appendChild(emptyState!);
  }

  if (stats) {
    const duration =
      events.length > 0
        ? Math.round((events[events.length - 1].timestamp - events[0].timestamp) / 1000)
        : 0;
    stats.textContent = `${events.length} event${events.length !== 1 ? "s" : ""} recorded${duration > 0 ? ` • ${duration}s` : ""}`;
  }
}

/** Render event list */
function renderEvents(eventList: PopupRecordedEvent[]): void {
  const container = document.getElementById("eventList");
  if (!container) return;

  container.innerHTML = "";

  for (const event of eventList) {
    const item = document.createElement("div");
    item.className = "event-item";

    const typeBadge = document.createElement("span");
    typeBadge.className = `event-type ${event.type}`;
    typeBadge.textContent = event.type;

    const desc = document.createElement("span");
    desc.className = "event-desc";
    desc.textContent = describeEvent(event);

    item.appendChild(typeBadge);
    item.appendChild(desc);
    container.appendChild(item);
  }
}

/** Describe an event in human-readable form */
function describeEvent(event: PopupRecordedEvent): string {
  switch (event.type) {
    case "navigation":
      return `Navigate to ${truncateUrl(event.url)}`;
    case "click":
      return `Click on ${event.selector ?? "element"}`;
    case "type":
      return `Type "${truncateText(event.text ?? "", 20)}" into ${event.selector ?? "field"}`;
    case "select":
      return `Select "${event.value}" from ${event.selector ?? "dropdown"}`;
    case "submit":
      return `Submit ${event.selector ?? "form"}`;
    case "scroll":
      return "Scroll the page";
    default:
      return event.type;
  }
}

function truncateUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url.length > 40 ? url.slice(0, 40) + "..." : url;
  }
}

function truncateText(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

/** Generate test script from events */
function generateTestScript(eventList: PopupRecordedEvent[]): string {
  const lines: string[] = [];
  let stepNumber = 1;

  for (const event of eventList) {
    const desc = describeEvent(event);
    lines.push(`${stepNumber}. ${desc}`);
    stepNumber++;
  }

  return lines.join("\n");
}

// ─── Event Handlers ────────────────────────────────────────────────────────

document.getElementById("btnRecord")?.addEventListener("click", async () => {
  if (popupRecording) {
    await sendMessage("stopRecording");
    popupRecording = false;
  } else {
    await sendMessage("startRecording");
    popupRecording = true;
    events = [];
    renderEvents([]);
  }
  updateUI();
});

document.getElementById("btnClear")?.addEventListener("click", async () => {
  await sendMessage("clearEvents");
  events = [];
  renderEvents([]);
  updateUI();
});

document.getElementById("btnExport")?.addEventListener("click", async () => {
  const response = await sendMessage("exportTest");
  generatedTestScript = (response.testScript as string) || "";

  // Download as file
  const blob = new Blob([generatedTestScript], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inspect-test-${Date.now()}.ts`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("btnCopy")?.addEventListener("click", async () => {
  if (generatedTestScript) {
    await navigator.clipboard.writeText(generatedTestScript);
  } else {
    generatedTestScript = generateTestScript(events);
    await navigator.clipboard.writeText(generatedTestScript);
  }
});

// ─── Initialization ────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const state = await sendMessage("getState");
  popupRecording = !!state.popupRecording;

  const eventsResponse = await sendMessage("getEvents");
  events = (eventsResponse.events as PopupRecordedEvent[]) || [];

  updateUI();
  if (events.length > 0) {
    renderEvents(events);
  }

  // Listen for state changes from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "updateRecordingState") {
      popupRecording = message.state.popupRecording;
      updateUI();
    }
  });
}

init();
