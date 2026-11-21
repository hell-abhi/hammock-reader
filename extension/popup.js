// The popup asks the worker to save and to list; capture, decode and storage all
// happen in the worker.

const status = (text) => {
  document.getElementById("status").textContent = text;
};

async function refresh() {
  const { articles = [] } = await chrome.runtime.sendMessage({ type: "list" });
  const list = document.getElementById("library");
  list.replaceChildren(...articles.slice(0, 20).map((article) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `reader.html?id=${encodeURIComponent(article.id)}`;
    link.target = "_blank";
    link.textContent = article.title || article.url;
    const meta = document.createElement("small");
    meta.textContent = `${Math.round(article.bytes / 1024)} KB · ${new Date(article.savedAt).toLocaleDateString()}`;
    item.append(link, meta);
    return item;
  }));
}

document.getElementById("save").addEventListener("click", async () => {
  status("Saving…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.runtime.sendMessage({ type: "save", url: tab?.url });
    if (result?.error) throw new Error(result.error);
    status(`Saved ${result.parts} parts, ${Math.round(result.bytes / 1024)} KB.`);
    await refresh();
  } catch (error) {
    status(`Failed: ${error.message}`);
  }
});

refresh().catch(() => {});
