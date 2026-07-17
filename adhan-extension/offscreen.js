const player = document.getElementById("player");

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== "offscreen") return;

  if (msg.type === "PLAY_SOUND") {
    player.src = chrome.runtime.getURL(msg.src);
    player.volume = typeof msg.volume === "number" ? msg.volume : 1.0;
    player.currentTime = 0;
    player.play().catch((err) => console.error("Adhan Reminder: playback failed", err));
  }

  if (msg.type === "STOP_SOUND") {
    player.pause();
    player.currentTime = 0;
  }
});
