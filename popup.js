const dot         = document.getElementById("dot");
const statusText  = document.getElementById("status-text");
const mainBtn     = document.getElementById("main-btn");
const openIgBtn   = document.getElementById("open-ig-btn");
const ghLink      = document.getElementById("gh-link");
const infoBtn     = document.getElementById("info-btn");
const infoBox     = document.getElementById("info-box");

ghLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: ghLink.href });
});

openIgBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.instagram.com/" });
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const onIG = tab && tab.url && tab.url.startsWith("https://www.instagram.com");

  if (!onIG) {
    dot.className          = "dot red";
    statusText.textContent = "Not on Instagram";
    mainBtn.textContent    = "Open on Instagram first";
    mainBtn.disabled       = true;
    openIgBtn.style.display = "block"; 
    return;
  }

  dot.className          = "dot green";
  statusText.textContent = "Instagram detected ✓";
  mainBtn.textContent    = "Run Unfollow Check";
  mainBtn.disabled       = false;
  openIgBtn.style.display = "none"; 

  mainBtn.addEventListener("click", async () => {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ["content.js"],
    }).catch(() => {});

    chrome.tabs.sendMessage(tab.id, { action: "OPEN_PANEL" }, () => {
      void chrome.runtime.lastError;
    });

    window.close();
  });
});