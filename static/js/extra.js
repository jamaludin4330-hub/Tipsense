(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const root = document.documentElement;
  const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  const money = (n) => "$" + Number(n).toFixed(2);

  /* ---------- Hitung manual di kartu hasil ---------- */
  document.addEventListener("tipsense:result", (e) => {
    const d = e.detail;
    const el = $("#resCalc");
    if (!el) return;
    el.innerHTML =
      "tip &asymp; " + d.intercept.toFixed(4) + " + " + d.coef.toFixed(4) +
      " &times; " + d.total_bill.toFixed(2) + " = <strong>" + money(d.tip) + "</strong>";
  });

  /* ---------- Playground: cari garis terbaik sendiri ---------- */
  const section = $("#cara-kerja");
  const canvas = $("#playChart");
  if (!section || !canvas || typeof Chart === "undefined") return;

  const BEST_B0 = parseFloat(section.dataset.b0);
  const BEST_B1 = parseFloat(section.dataset.b1);

  const b0Range = $("#b0Range");
  const b1Range = $("#b1Range");
  const b0Val = $("#b0Val");
  const b1Val = $("#b1Val");
  const playMse = $("#playMse");
  const bestMseEl = $("#bestMse");
  const playMsg = $("#playMsg");

  let points = [];
  let playChart = null;
  let bestMse = 1;

  // MSE garis (b0, b1) pada seluruh data
  function mse(b0, b1) {
    const total = points.reduce((sum, p) => {
      const err = p.y - (b0 + b1 * p.x);
      return sum + err * err;
    }, 0);
    return total / points.length;
  }

  function lineData(b0, b1) {
    const xs = points.map((p) => p.x);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    return [
      { x: x0, y: b0 + b1 * x0 },
      { x: x1, y: b0 + b1 * x1 },
    ];
  }

  function paint() {
    if (!playChart) return;
    const text = cssVar("--muted");
    const grid = cssVar("--border");
    const o = playChart.options;
    o.scales.x.ticks.color = text;
    o.scales.y.ticks.color = text;
    o.scales.x.title.color = text;
    o.scales.y.title.color = text;
    o.scales.x.grid.color = grid;
    o.scales.y.grid.color = grid;
    o.plugins.legend.labels.color = text;
    playChart.data.datasets[0].backgroundColor = cssVar("--primary");
    playChart.data.datasets[1].borderColor = cssVar("--accent");
    playChart.data.datasets[2].borderColor = text;
    playChart.update();
  }

  function message(m) {
    const ratio = m / bestMse;
    let text;
    let cls;
    if (ratio <= 1.03) {
      text = "Hebat! Garismu hampir sama baiknya dengan garis model.";
      cls = "ok";
    } else if (ratio <= 1.5) {
      text = "Hampir! Error-mu sedikit lebih besar dari model, coba geser lagi.";
      cls = "mid";
    } else {
      text = "Error masih besar. Geser slider agar garis lebih dekat ke titik-titik data.";
      cls = "bad";
    }
    playMsg.className = "play-msg " + cls;
    playMsg.textContent = text;
  }

  function update() {
    const b0 = parseFloat(b0Range.value);
    const b1 = parseFloat(b1Range.value);
    b0Val.textContent = b0.toFixed(3);
    b1Val.textContent = b1.toFixed(4);

    const m = mse(b0, b1);
    playMse.textContent = m.toFixed(3);
    message(m);

    playChart.data.datasets[1].data = lineData(b0, b1);
    playChart.update("none");
  }

  function setValues(b0, b1) {
    b0Range.value = b0;
    b1Range.value = b1;
    update();
  }

  async function init() {
    try {
      const res = await fetch("/api/chart-data");
      const d = await res.json();
      points = d.points;

      bestMse = mse(BEST_B0, BEST_B1);
      bestMseEl.textContent = bestMse.toFixed(3);

      playChart = new Chart(canvas, {
        type: "scatter",
        data: {
          datasets: [
            { label: "Data restoran", data: points, pointRadius: 3 },
            { label: "Garismu", data: lineData(0, 0), showLine: true, borderWidth: 3, pointRadius: 0 },
            { label: "Garis model", data: lineData(BEST_B0, BEST_B1), showLine: true, borderWidth: 2, borderDash: [6, 6], pointRadius: 0 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { min: 0, max: 55, title: { display: true, text: "Total tagihan (USD)" }, grid: {}, ticks: {} },
            y: { min: 0, max: 12, title: { display: true, text: "Tip (USD)" }, grid: {}, ticks: {} },
          },
          plugins: { legend: { labels: {} } },
        },
      });

      paint();
      update();
    } catch (err) {
      const wrap = $(".chart-sm");
      if (wrap) wrap.innerHTML = '<p class="text-muted-soft text-center pt-5">Grafik gagal dimuat.</p>';
    }
  }

  b0Range.addEventListener("input", () => playChart && update());
  b1Range.addEventListener("input", () => playChart && update());
  $("#playReset").addEventListener("click", () => playChart && setValues(0, 0));
  $("#playBest").addEventListener("click", () => playChart && setValues(BEST_B0, BEST_B1));

  // Ikut berganti saat tema terang/gelap diubah
  new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  init();
})();