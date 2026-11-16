// ======================
// Settings
// ======================
const API = "https://api.frankfurter.app"; // free, no API key needed

// ======================
// Page elements
// ======================
const fromCurrency = document.getElementById("from-currency-select");
const toCurrency = document.getElementById("to-currency-select");
const convertButton = document.getElementById("convert-button");
const swapButton = document.getElementById("swap-button");
const result = document.getElementById("result");
const amountInput = document.getElementById("amount");
const daysSelect = document.getElementById("days");
const chartCanvas = document.getElementById("currencyChart");
const ctx = chartCanvas.getContext("2d");

let currencyChart = null;
let lastChart = null;   // remembers the last chart so the theme toggle can redraw it
let requestId = 0;      // ignores out-of-date responses

// ======================
// Netflix intro
// ======================
window.addEventListener("load", () => {
  const intro = document.querySelector(".netflix-intro");
  const showApp = () => {
    document.querySelectorAll(".wrapper, .graph-container")
      .forEach(el => (el.style.display = "block"));
    if (currencyChart) currencyChart.resize(); // chart was drawn while hidden
  };
  if (!intro) { showApp(); return; }
  setTimeout(() => {
    intro.style.transition = "opacity 1s ease";
    intro.style.opacity = "0";
    setTimeout(() => {
      intro.style.display = "none";
      showApp();
    }, 1000);
  }, 3500);
});

// ======================
// Helpers
// ======================
async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Request failed with status " + res.status);
  return res.json();
}

function getFlagEmoji(code) {
  // First two letters of a currency code are the country code (USD -> US, INR -> IN)
  return code
    .slice(0, 2)
    .toUpperCase()
    .split("")
    .map(ch => String.fromCodePoint(127397 + ch.charCodeAt(0)))
    .join("");
}

function formatNumber(value) {
  const maxDigits = Math.abs(value) < 1 ? 4 : 2; // keep small rates like 0.0066 readable
  try {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDigits
    }).format(value);
  } catch (e) {
    return value.toFixed(maxDigits);
  }
}

// ======================
// Fetch & populate currencies (with flags)
// ======================
async function loadCurrencies() {
  try {
    const data = await getJSON(`${API}/currencies`);
    const codes = Object.keys(data);

    fromCurrency.innerHTML = "";
    toCurrency.innerHTML = "";

    codes.forEach(code => {
      const label = `${getFlagEmoji(code)} ${code}`;
      const optFrom = document.createElement("option");
      const optTo = document.createElement("option");
      optFrom.value = optTo.value = code;
      optFrom.textContent = optTo.textContent = label;
      fromCurrency.appendChild(optFrom);
      toCurrency.appendChild(optTo);
    });

    fromCurrency.value = "USD";
    toCurrency.value = "INR";
    convertCurrency();
  } catch (err) {
    console.error("Could not load currencies:", err);
    result.textContent = "Could not load currencies. Check your internet connection and refresh the page.";
  }
}

// ======================
// Convert currency
// ======================
async function convertCurrency() {
  const amount = parseFloat(amountInput.value);
  const from = fromCurrency.value;
  const to = toCurrency.value;
  const thisRequest = ++requestId;

  if (!(amount > 0)) {
    result.textContent = "Enter a valid amount.";
    return;
  }
  if (!from || !to) return;

  if (from === to) {
    result.textContent = `${formatNumber(amount)} ${from} = ${formatNumber(amount)} ${to}`;
    if (currencyChart) { currencyChart.destroy(); currencyChart = null; }
    return;
  }

  try {
    const data = await getJSON(`${API}/latest?amount=${amount}&from=${from}&to=${to}`);
    if (thisRequest !== requestId) return; // a newer request replaced this one

    if (!data.rates || typeof data.rates[to] !== "number") {
      result.textContent = "Conversion rate not available.";
      return;
    }
    result.textContent = `${formatNumber(amount)} ${from} = ${formatNumber(data.rates[to])} ${to}`;
    loadChart(from, to, daysSelect.value);
  } catch (err) {
    console.error("Conversion failed:", err);
    if (thisRequest === requestId) {
      result.textContent = "Could not fetch the exchange rate. Check your connection and try again.";
    }
  }
}

convertButton.addEventListener("click", convertCurrency);
fromCurrency.addEventListener("change", convertCurrency);
toCurrency.addEventListener("change", convertCurrency);
daysSelect.addEventListener("change", convertCurrency);
amountInput.addEventListener("keydown", e => { if (e.key === "Enter") convertCurrency(); });

// ======================
// Swap button
// ======================
swapButton.addEventListener("click", () => {
  const temp = fromCurrency.value;
  fromCurrency.value = toCurrency.value;
  toCurrency.value = temp;
  convertCurrency();
});

// ======================
// Historical data & chart
// ======================
function chartTextColor() {
  return document.body.classList.contains("day-mode") ? "#222" : "white";
}

async function loadChart(from, to, days) {
  lastChart = { from, to, days };
  if (typeof Chart === "undefined") {
    console.error("Chart.js is not loaded. Add its <script> tag before script.js in index.html.");
    return;
  }

  try {
    const numDays = parseInt(days, 10) || 7;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - numDays);
    const fmt = d => d.toISOString().split("T")[0];

    const data = await getJSON(`${API}/${fmt(start)}..${fmt(end)}?from=${from}&to=${to}`);
    if (!data.rates) return;

    const labels = Object.keys(data.rates).sort();
    const values = labels.map(date => data.rates[date][to]);
    const textColor = chartTextColor();
    const gridColor = textColor === "white" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";

    if (currencyChart) currencyChart.destroy();

    currencyChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: `${from} → ${to}`,
          data: values,
          borderColor: "#4bc0c0",
          backgroundColor: "rgba(75,192,192,0.2)",
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } }
        }
      }
    });
  } catch (err) {
    console.error("Could not load chart data:", err);
  }
}

// ======================
// Live market quotes (no API key needed)
// ======================
async function fetchForexQuotes() {
  const quotesList = document.getElementById("quotes-list");
  if (!quotesList) return;

  const pairs = [["EUR", "USD"], ["USD", "INR"], ["GBP", "USD"], ["USD", "JPY"], ["AUD", "USD"]];
  try {
    const rows = await Promise.all(
      pairs.map(([a, b]) => getJSON(`${API}/latest?from=${a}&to=${b}`))
    );
    quotesList.innerHTML = "";
    rows.forEach((data, i) => {
      const [a, b] = pairs[i];
      const rate = data.rates && data.rates[b];
      if (typeof rate !== "number") return;
      const li = document.createElement("li");
      li.innerHTML = `<strong>${a}/${b}</strong>: ${rate.toFixed(4)}`;
      quotesList.appendChild(li);
    });
  } catch (err) {
    console.error("Error fetching forex quotes:", err);
    quotesList.innerHTML = "<li>Quotes are unavailable right now.</li>";
  }
}

// ======================
// Floating background: bubbles and currency symbols
// ======================
const bubbleBackground = document.querySelector(".bubble-background");

if (bubbleBackground) {
  const bubbleColors = [
    "rgba(255, 77, 109, 0.6)",
    "rgba(0, 255, 255, 0.6)",
    "rgba(255, 255, 0, 0.6)",
    "rgba(153, 102, 255, 0.6)",
    "rgba(0, 255, 128, 0.6)"
  ];

  setInterval(() => {
    const bubble = document.createElement("div");
    bubble.classList.add("circle");
    const size = Math.random() * 40 + 20;
    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.left = Math.random() * window.innerWidth + "px";
    bubble.style.background = bubbleColors[Math.floor(Math.random() * bubbleColors.length)];
    bubbleBackground.appendChild(bubble);
    setTimeout(() => bubble.remove(), 8000);
  }, 500);

  const symbols = [
    { char: "$", color: "#00ff00" },
    { char: "€", color: "#00aaff" },
    { char: "₹", color: "#ff9933" },
    { char: "£", color: "#b266ff" },
    { char: "¥", color: "#ff3333" },
    { char: "₿", color: "#ffaa00" },
    { char: "₩", color: "#66ffcc" },
    { char: "₽", color: "#ffffff" }
  ];

  setInterval(() => {
    const symbol = document.createElement("div");
    symbol.classList.add("currency-symbol");
    const pick = symbols[Math.floor(Math.random() * symbols.length)];
    symbol.textContent = pick.char;
    symbol.style.color = pick.color;
    symbol.style.textShadow = `0 0 10px ${pick.color}, 0 0 20px ${pick.color}`;
    symbol.style.left = Math.random() * 100 + "vw";
    symbol.style.fontSize = 20 + Math.random() * 30 + "px";
    const duration = 6 + Math.random() * 5;
    symbol.style.animationDuration = duration + "s";
    bubbleBackground.appendChild(symbol);
    setTimeout(() => symbol.remove(), duration * 1000);
  }, 400);
}

// ======================
// Day / night theme
// ======================
const toggleBtn = document.getElementById("theme-toggle");

if (toggleBtn) {
  if (localStorage.getItem("theme") === "night") {
    document.body.classList.add("night-mode");
    toggleBtn.textContent = "☀️ Day Mode";
  } else {
    document.body.classList.add("day-mode");
    toggleBtn.textContent = "🌙 Night Mode";
  }

  toggleBtn.addEventListener("click", () => {
    if (document.body.classList.contains("day-mode")) {
      document.body.classList.remove("day-mode");
      document.body.classList.add("night-mode");
      toggleBtn.textContent = "☀️ Day Mode";
      localStorage.setItem("theme", "night");
    } else {
      document.body.classList.remove("night-mode");
      document.body.classList.add("day-mode");
      toggleBtn.textContent = "🌙 Night Mode";
      localStorage.setItem("theme", "day");
    }
    if (lastChart) loadChart(lastChart.from, lastChart.to, lastChart.days); // recolor the chart text
  });
}

// ======================
// Start
// ======================
loadCurrencies();
fetchForexQuotes();
