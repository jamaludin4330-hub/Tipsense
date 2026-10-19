(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const root = document.documentElement;

  let chart = null;
  const history = [];

  /* ---------- Tema terang/gelap ---------- */
  const themeBtn = $("#themeToggle");

  function cssVar(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  function setTheme(theme) {
    root.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch (e) {}
    themeBtn.querySelector("i").className =
      theme === "dark" ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
    if (chart) applyChartTheme();
  }

  themeBtn.addEventListener("click", () => {
    setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });
  setTheme(root.getAttribute("data-theme") || "light");

  /* ---------- Navbar: efek scroll, menu aktif, tutup menu mobile ---------- */
  const navbar = $("#mainNav");
  window.addEventListener("scroll", () => {
    navbar.classList.toggle("scrolled", window.scrollY > 20);
  });

  const pills = $$(".nav-pill");
  function setActive(id) {
    pills.forEach((p) => p.classList.toggle("active", p.dataset.section === id));
  }

  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  $$("section[id]").forEach((s) => spy.observe(s));

  const navMenu = $("#navMenu");
  pills.forEach((p) => {
    p.addEventListener("click", () => {
      if (navMenu.classList.contains("show")) {
        bootstrap.Collapse.getOrCreateInstance(navMenu).hide();
      }
    });
  });

  /* ---------- Animasi muncul saat scroll ---------- */
  const revealObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("show");
          revealObs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  $$(".reveal").forEach((el) => revealObs.observe(el));

  /* ---------- Elemen form ---------- */
  const form = $("#predictForm");
  const billInput = $("#billInput");
  const billRange = $("#billRange");
  const billError = $("#billError");
  const predictBtn = $("#predictBtn");

  function showError(msg) {
    billError.textContent = msg;
    billError.classList.remove("d-none");
    billInput.classList.add("is-invalid-custom");
  }
  function clearError() {
    billError.classList.add("d-none");
    billInput.classList.remove("is-invalid-custom");
  }
  function setLoading(on) {
    predictBtn.disabled = on;
    $(".btn-label", predictBtn).classList.toggle("d-none", on);
    $(".btn-loading", predictBtn).classList.toggle("d-none", !on);
  }

  // Slider dan kolom angka saling tersinkron
  billRange.addEventListener("input", () => {
    billInput.value = billRange.value;
    clearError();
  });
  billInput.addEventListener("input", () => {
    const v = parseFloat(billInput.value);
    if (Number.isFinite(v)) {
      billRange.value = Math.min(Math.max(v, +billRange.min), +billRange.max);
    }
    clearError();
  });

  // Tombol contoh cepat
  $$(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      billInput.value = chip.dataset.bill;
      billRange.value = chip.dataset.bill;
      clearError();
      predict();
    });
  });

  /* ---------- Prediksi ---------- */
  async function requestPrediction(value) {
    const res = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total_bill: value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Terjadi kesalahan pada server.");
    return data;
  }

  async function predict() {
    clearError();
    const raw = billInput.value.trim().replace(",", ".");
    const value = Number(raw);

    if (raw === "" || !Number.isFinite(value)) {
      return showError("Masukkan total tagihan berupa angka.");
    }
    if (value <= 0) {
      return showError("Total tagihan harus lebih dari 0.");
    }

    setLoading(true);
    try {
      const data = await requestPrediction(value);
      renderResult(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    predict();
  });

  const money = (n) => "$" + Number(n).toFixed(2);

  function countUp(el, to, duration = 900) {
    const start = performance.now();
    function frame(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = money(to * eased);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function renderResult(d) {
    $("#resultEmpty").classList.add("d-none");
    $("#resultBox").classList.remove("d-none");

    $("#resBill").textContent = money(d.total_bill);
    countUp($("#resTip"), d.tip);
    $("#resPercent").textContent = d.percent + "%";
    $("#resBar").style.width = Math.min(d.percent * 4, 100) + "%";
    $("#resRange").textContent = money(d.low) + " - " + money(d.high);
    $("#resWarn").classList.toggle("d-none", !d.out_of_range);

    addHistory(d);
    markOnChart(d);
    document.dispatchEvent(new CustomEvent("tipsense:result", { detail: d }));
  }

  /* ---------- Riwayat ---------- */
  const historyWrap = $("#historyWrap");
  const historyList = $("#historyList");

  function addHistory(d) {
    history.unshift(d);
    if (history.length > 5) history.pop();
    historyList.innerHTML = "";
    history.forEach((h) => {
      const li = document.createElement("li");
      li.innerHTML = "<span>" + money(h.total_bill) + "</span><strong>" + money(h.tip) + "</strong>";
      historyList.appendChild(li);
    });
    historyWrap.classList.remove("d-none");
  }

  $("#clearHistory").addEventListener("click", () => {
    history.length = 0;
    historyList.innerHTML = "";
    historyWrap.classList.add("d-none");
  });

  /* ---------- Grafik ---------- */
  function applyChartTheme() {
    const text = cssVar("--muted");
    const grid = cssVar("--border");
    chart.options.scales.x.ticks.color = text;
    chart.options.scales.y.ticks.color = text;
    chart.options.scales.x.title.color = text;
    chart.options.scales.y.title.color = text;
    chart.options.scales.x.grid.color = grid;
    chart.options.scales.y.grid.color = grid;
    chart.options.plugins.legend.labels.color = text;
    chart.data.datasets[0].backgroundColor = cssVar("--primary");
    chart.data.datasets[1].borderColor = cssVar("--accent");
    chart.data.datasets[2].backgroundColor = cssVar("--accent");
    chart.data.datasets[2].borderColor = cssVar("--text");
    chart.update();
  }

  async function initChart() {
    const canvas = $("#regChart");
    if (!canvas || typeof Chart === "undefined") return;

    try {
      const res = await fetch("/api/chart-data");
      const d = await res.json();

      chart = new Chart(canvas, {
        type: "scatter",
        data: {
          datasets: [
            { label: "Data restoran", data: d.points, pointRadius: 4, pointHoverRadius: 6 },
            { label: "Garis regresi", data: d.line, showLine: true, borderWidth: 3, pointRadius: 0, pointHoverRadius: 0 },
            { label: "Prediksimu", data: [], pointRadius: 10, pointStyle: "rectRot", borderWidth: 2 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { title: { display: true, text: "Total tagihan (USD)" }, grid: {}, ticks: {} },
            y: { title: { display: true, text: "Tip (USD)" }, grid: {}, ticks: {} },
          },
          plugins: {
            legend: { labels: {} },
            tooltip: {
              callbacks: {
                label: (c) => "Tagihan $" + c.parsed.x.toFixed(2) + " , Tip $" + c.parsed.y.toFixed(2),
              },
            },
          },
        },
      });
      applyChartTheme();
    } catch (err) {
      const wrap = $(".chart-wrap");
      if (wrap) wrap.innerHTML = '<p class="text-muted-soft text-center pt-5">Grafik gagal dimuat.</p>';
    }
  }

  function markOnChart(d) {
    if (!chart) return;
    chart.data.datasets[2].data = [{ x: d.total_bill, y: d.tip }];
    chart.update();
  }

  /* ---------- Struk di hero: contoh prediksi sungguhan dari model ---------- */
  async function heroLoop() {
    const bills = [20, 35, 50, 12];
    const billEl = $("#heroBill");
    const tipEl = $("#heroTip");
    if (!billEl || !tipEl) return;

    let i = 0;
    async function tick() {
      try {
        const d = await requestPrediction(bills[i % bills.length]);
        billEl.textContent = "$ " + d.total_bill.toFixed(2);
        tipEl.textContent = "$ " + d.tip.toFixed(2);
      } catch (e) { /* abaikan, struk hanya hiasan */ }
      i += 1;
    }
    await tick();
    setInterval(tick, 3000);
  }

  initChart();
  heroLoop();
})();