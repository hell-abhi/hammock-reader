// The popup only asks the worker to save the tab in front of it; capture, decode
// and storage happen in the worker.

const status = (text) => {
  document.getElementById("status").textContent = text;
};

document.getElementById("save").addEventListener("click", async () => {
  status("Saving…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.runtime.sendMessage({ type: "save", url: tab?.url });
    if (result?.error) throw new Error(result.error);
    status(`Saved ${result.parts} parts, ${Math.round(result.bytes / 1024)} KB.`);
  } catch (error) {
    status(`Failed: ${error.message}`);
  }
});
