/* ============================================================
   游戏：反应力测试（等待变绿 → 立刻点击）
   ============================================================ */
window.GameModules = window.GameModules || {};
window.GameModules.reaction = (function () {
  "use strict";

  var ROUNDS = 5;
  var STORAGE_KEY = "funarcade_best_reaction";

  var stage, api, pad, mainEl, subEl, historyBox;
  var state = "idle";
  var results = [];
  var waitTimer = 0, goTime = 0;
  var docListeners = [];

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    docListeners.push({ target: target, type: type, fn: fn, opts: opts });
  }

  function getFastest() {
    try {
      return parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10) || 0;
    } catch (e) { return 0; }
  }
  function saveFastest(ms) {
    try {
      var cur = getFastest();
      if (cur === 0 || ms < cur) {
        localStorage.setItem(STORAGE_KEY, String(ms));
        return true;
      }
    } catch (e) {}
    return false;
  }

  function avgOf(list) {
    if (!list.length) return 0;
    var sum = 0;
    list.forEach(function (v) { sum += v; });
    return Math.round(sum / list.length);
  }

  function rank(avg) {
    if (avg < 200) return "反应神速，堪比职业选手";
    if (avg < 250) return "非常敏捷，超过大多数人";
    if (avg < 300) return "表现不错，反应灵敏";
    if (avg < 350) return "中规中矩，还有提升空间";
    return "还需多练，保持专注会更快";
  }

  function buildUI() {
    stage.innerHTML = "";

    pad = document.createElement("div");
    pad.className = "reaction-pad state-idle";
    pad.setAttribute("role", "button");
    pad.setAttribute("tabindex", "0");
    pad.setAttribute("aria-label", "反应力测试面板");
    mainEl = document.createElement("div");
    mainEl.className = "rp-main";
    subEl = document.createElement("div");
    subEl.className = "rp-sub";
    pad.appendChild(mainEl);
    pad.appendChild(subEl);
    stage.appendChild(pad);

    historyBox = document.createElement("div");
    historyBox.className = "reaction-history";
    stage.appendChild(historyBox);

    var controls = document.createElement("div");
    controls.className = "game-controls";
    var resetBtn = document.createElement("button");
    resetBtn.className = "btn btn-ghost";
    resetBtn.textContent = "重新开始";
    resetBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      resetToIdle();
    });
    controls.appendChild(resetBtn);
    stage.appendChild(controls);

    /* 用 pointerdown 记录，减少点击延迟，保证计时精确 */
    pad.addEventListener("pointerdown", handlePad);

    /* 键盘支持 */
    on(window, "keydown", function (e) {
      if (e.key === " " || e.key === "Enter") {
        if (state === "summary") return;
        e.preventDefault();
        handlePad(e);
      }
    });
  }

  function setPad(stateName, main, sub) {
    state = stateName;
    pad.className = "reaction-pad state-" + stateName;
    mainEl.textContent = main;
    subEl.textContent = sub || "";
  }

  function startRound() {
    setPad("wait", "等待绿色…", "看到绿色的瞬间立刻点击，别急");
    var delay = 1500 + Math.random() * 3000;
    clearTimeout(waitTimer);
    waitTimer = setTimeout(function () {
      goTime = performance.now();
      setPad("go", "点击！", "");
    }, delay);
  }

  function handlePad(e) {
    if (state === "idle") {
      startRound();
    } else if (state === "wait") {
      /* 太早了 */
      clearTimeout(waitTimer);
      setPad("toosoon", "太早了！", "点击重新等待");
    } else if (state === "go") {
      var rt = Math.round(performance.now() - goTime);
      results.push(rt);
      renderHistory();
      var isNew = saveFastest(rt);
      api.setScore("best", getFastest());

      if (results.length >= ROUNDS) {
        setPad("result", "完成", "点击查看结果");
        showSummary(isNew);
      } else {
        var avg = avgOf(results);
        api.setScore("avg", avg + "ms");
        setPad("result", rt + " ms", "点击进行第 " + (results.length + 1) + " 轮");
      }
    } else if (state === "result") {
      startRound();
    } else if (state === "toosoon") {
      startRound();
    }
  }

  function renderHistory() {
    historyBox.innerHTML = "";
    results.forEach(function (rt, i) {
      var item = document.createElement("div");
      item.className = "rh-item";
      item.innerHTML = "第" + (i + 1) + '轮 <b>' + rt + "ms</b>";
      historyBox.appendChild(item);
    });
  }

  function showSummary(hadNew) {
    state = "summary";
    var avg = avgOf(results);
    api.setScore("avg", avg + "ms");
    api.showModal({
      theme: "m-yellow",
      title: "测试结果",
      desc: rank(avg) + (hadNew ? "\n（本轮创造了你的最快纪录）" : ""),
      stats: [
        { num: avg + "ms", label: "平均反应", cls: "cyan" },
        { num: getFastest() + "ms", label: "最快反应", cls: "yellow" }
      ],
      actions: [
        { text: "再测一次", style: "btn-primary", fn: function () {
          resetToIdle();
          startRound();
        } },
        { text: "返回大厅", fn: backHall }
      ]
    });
  }

  function resetToIdle() {
    clearTimeout(waitTimer);
    api.closeModal();
    results = [];
    renderHistory();
    api.setScore("avg", "-");
    api.setScore("best", getFastest());
    setPad("idle", "反应力测试", "点击开始，共 " + ROUNDS + " 轮");
  }

  function backHall() { location.hash = "#/"; }

  function start(c, a) {
    stage = c;
    api = a;
    buildUI();
    api.setScore("best", getFastest());
    setPad("idle", "反应力测试", "点击开始，共 " + ROUNDS + " 轮");
  }

  function destroy() {
    clearTimeout(waitTimer);
    docListeners.forEach(function (l) {
      l.target.removeEventListener(l.type, l.fn, l.opts);
    });
    docListeners = [];
    if (stage) stage.innerHTML = "";
    state = "idle";
  }

  return { start: start, destroy: destroy };
})();
