/* ============================================================
   趣玩街机 · 主控逻辑
   大厅渲染 / hash 路由 / 游戏生命周期 / 最高分 / 模态面板
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- 图标（内联 SVG） ---------------- */
  var ICONS = {
    snake:
      '<svg viewBox="0 0 24 24" fill="none" stroke="#46ff5e" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 18c0-2.2 2-3.2 4-3.2s4 1 4-1-2-2.8-2-5 2-4 4-4 4 1 4 3"/>' +
      '<circle cx="17.6" cy="7.8" r="1.3" fill="#46ff5e" stroke="none"/>' +
      '<path d="M20.2 7l2.2-1.1M20.2 8.6l2.2 1.1"/></svg>',
    "2048":
      '<svg viewBox="0 0 24 24">' +
      '<rect x="3" y="3" width="8" height="8" rx="1.6" fill="#ff9d4d"/>' +
      '<rect x="13" y="3" width="8" height="8" rx="1.6" fill="#ff7b29"/>' +
      '<rect x="3" y="13" width="8" height="8" rx="1.6" fill="#ff7b29"/>' +
      '<rect x="13" y="13" width="8" height="8" rx="1.6" fill="#ff5e14"/></svg>',
    breakout:
      '<svg viewBox="0 0 24 24">' +
      '<rect x="3" y="3.5" width="4.2" height="3" rx="0.7" fill="#00e5ff"/>' +
      '<rect x="9.9" y="3.5" width="4.2" height="3" rx="0.7" fill="#009fb0"/>' +
      '<rect x="16.8" y="3.5" width="4.2" height="3" rx="0.7" fill="#00e5ff"/>' +
      '<rect x="6.4" y="9" width="4.2" height="3" rx="0.7" fill="#009fb0"/>' +
      '<rect x="13.4" y="9" width="4.2" height="3" rx="0.7" fill="#00e5ff"/>' +
      '<circle cx="12" cy="15" r="1.7" fill="#ffffff"/>' +
      '<rect x="5.5" y="19" width="13" height="2.4" rx="1.2" fill="#00e5ff"/></svg>',
    memory:
      '<svg viewBox="0 0 24 24">' +
      '<rect x="3" y="6" width="10" height="14" rx="1.6" fill="#8a1fc9"/>' +
      '<rect x="11" y="4" width="10" height="14" rx="1.6" fill="#b537f2"/>' +
      '<path d="M14.2 11h3.6M16 9.2v3.6" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/></svg>',
    reaction:
      '<svg viewBox="0 0 24 24">' +
      '<path d="M13.5 2L4.5 13.5h5.4L9 22l9-11.5h-5.4L13.5 2z" fill="#ff3b5c"/></svg>',
    back:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M15 18l-6-6 6-6"/></svg>'
  };

  /* ---------------- 游戏配置 ---------------- */
  var GAMES = [
    {
      id: "snake",
      cls: "t-snake",
      iconCls: "icon-bg-snake",
      name: "贪吃蛇",
      desc: "吃掉能量方块让自己变长，速度会越来越快，别撞到墙和自己。",
      chips: [
        { key: "score", label: "分数", cls: "cur" },
        { key: "best", label: "最高", cls: "best" }
      ],
      bestLabel: function (v) { return v > 0 ? "最高 " + v : "还没有记录"; }
    },
    {
      id: "2048",
      cls: "t-2048",
      iconCls: "icon-bg-2048",
      name: "2048",
      desc: "滑动方块，让相同数字相撞合并，目标是拼出 2048。",
      chips: [
        { key: "score", label: "分数", cls: "cur" },
        { key: "best", label: "最高", cls: "best" }
      ],
      bestLabel: function (v) { return v > 0 ? "最高 " + v : "还没有记录"; }
    },
    {
      id: "breakout",
      cls: "t-breakout",
      iconCls: "icon-bg-breakout",
      name: "打砖块",
      desc: "移动挡板接住小球，把上方的砖块全部击碎即可过关。",
      chips: [
        { key: "score", label: "分数", cls: "cur" },
        { key: "level", label: "关卡", cls: "cur" },
        { key: "lives", label: "生命", cls: "cur" }
      ],
      bestLabel: function (v) { return v > 0 ? "最高 " + v : "还没有记录"; }
    },
    {
      id: "memory",
      cls: "t-memory",
      iconCls: "icon-bg-memory",
      name: "记忆翻牌",
      desc: "翻开卡片找出相同图案，用最少的步数完成配对，关卡越往后越多。",
      chips: [
        { key: "moves", label: "步数", cls: "cur" },
        { key: "time", label: "用时", cls: "cur" },
        { key: "level", label: "关卡", cls: "cur" }
      ],
      bestLabel: function (v) { return v > 0 ? "通关 " + v + " 关" : "还没有记录"; }
    },
    {
      id: "reaction",
      cls: "t-reaction",
      iconCls: "icon-bg-reaction",
      name: "反应力测试",
      desc: "屏幕变绿的瞬间立刻点击，测测你的反应速度有多快。",
      chips: [
        { key: "avg", label: "平均", cls: "cur" },
        { key: "best", label: "最快", cls: "best" }
      ],
      bestLabel: function (v) { return v > 0 ? "最快 " + v + " ms" : "还没有记录"; }
    }
  ];

  function getGame(id) {
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i];
    return null;
  }

  /* ---------------- 最高分存储 ---------------- */
  function bestKey(id) { return "funarcade_best_" + id; }
  function getBest(id) {
    try {
      return parseInt(localStorage.getItem(bestKey(id)) || "0", 10) || 0;
    } catch (e) { return 0; }
  }
  function saveBest(id, score) {
    try {
      if (score > getBest(id)) {
        localStorage.setItem(bestKey(id), String(score));
        return true;
      }
    } catch (e) {}
    return false;
  }

  /* ---------------- 模态面板 ---------------- */
  var modalEl = null;
  function closeModal() {
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
  }

  /**
   * opts: { theme, title, desc, stats:[{num,label,cls}], actions:[{text,style,fn}] }
   */
  function showModal(opts) {
    closeModal();
    var mask = document.createElement("div");
    mask.className = "modal-mask";

    var panel = document.createElement("div");
    panel.className = "modal-panel" + (opts.theme ? " " + opts.theme : "");

    var html = "";
    if (opts.title) html += '<h2 style="' + (opts.titleColor ? "color:" + opts.titleColor : "") + '">' + opts.title + "</h2>";
    if (opts.desc) html += '<div class="modal-desc">' + opts.desc + "</div>";
    if (opts.stats && opts.stats.length) {
      html += '<div class="modal-stats">';
      opts.stats.forEach(function (s) {
        html += '<div class="modal-stat"><span class="ms-num ' + (s.cls || "cyan") + '">' + s.num +
          '</span><span class="ms-lab">' + s.label + "</span></div>";
      });
      html += "</div>";
    }
    if (opts.actions && opts.actions.length) {
      html += '<div class="modal-actions"></div>';
    }
    panel.innerHTML = html;
    mask.appendChild(panel);

    if (opts.actions && opts.actions.length) {
      var actBox = panel.querySelector(".modal-actions");
      opts.actions.forEach(function (a) {
        var b = document.createElement("button");
        b.className = "btn " + (a.style || "btn-ghost");
        b.textContent = a.text;
        b.addEventListener("click", function () {
          if (a.fn) a.fn();
        });
        actBox.appendChild(b);
      });
    }

    document.body.appendChild(mask);
    modalEl = mask;

    // 自动聚焦第一个按钮，方便键盘操作
    var firstBtn = panel.querySelector("button");
    if (firstBtn) firstBtn.focus();
    return mask;
  }

  /* ---------------- 大厅渲染 ---------------- */
  function renderHall(container) {
    var html =
      '<div class="hall-header">' +
        '<div class="hall-logo"><span class="line1">FUN ARCADE</span><span class="line2">趣玩街机</span></div>' +
        '<div class="hall-sub">五款经典小游戏，打开即玩 · 电脑手机都支持</div>' +
        '<div class="hall-blink">PRESS TO START</div>' +
      "</div>" +
      '<div class="game-grid"></div>';
    container.innerHTML = html;

    var grid = container.querySelector(".game-grid");
    GAMES.forEach(function (g) {
      var card = document.createElement("div");
      card.className = "game-card " + g.cls;
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "开始玩 " + g.name);
      card.innerHTML =
        '<div class="card-icon ' + g.iconCls + '">' + ICONS[g.id] + "</div>" +
        "<h3>" + g.name + "</h3>" +
        "<p>" + g.desc + "</p>" +
        '<div class="card-best">' + g.bestLabel(getBest(g.id)) + "</div>";
      var go = function () { location.hash = "#/game/" + g.id; };
      card.addEventListener("click", go);
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
      });
      grid.appendChild(card);
    });
  }

  /* ---------------- 游戏生命周期 ---------------- */
  var current = null; // { game, mod, stage }

  function openGame(id) {
    var game = getGame(id);
    var mod = window.GameModules ? window.GameModules[id] : null;
    if (!game || !mod) {
      location.hash = "#/";
      return;
    }

    // 若已有游戏运行，先销毁
    if (current) destroyCurrent();

    var view = document.getElementById("view-game");
    var chipsHtml = "";
    game.chips.forEach(function (c) {
      chipsHtml +=
        '<div class="score-chip ' + c.cls + '" data-chip="' + c.key + '">' +
          '<div class="chip-label">' + c.label + '</div>' +
          '<span class="chip-value">-</span>' +
        "</div>";
    });

    view.innerHTML =
      '<div class="game-topbar">' +
        '<button class="btn-back" id="btn-back">' + ICONS.back + "返回大厅</button>" +
        '<div class="game-title">' + game.name + "</div>" +
        '<div class="score-bar">' + chipsHtml + "</div>" +
      "</div>" +
      '<div class="game-stage" id="game-stage"></div>';

    view.querySelector("#btn-back").addEventListener("click", function () {
      location.hash = "#/";
    });

    var stage = view.querySelector("#game-stage");
    var chipEls = {};
    var chipVals = {};
    view.querySelectorAll(".score-chip").forEach(function (chip) {
      chipEls[chip.getAttribute("data-chip")] = chip.querySelector(".chip-value");
    });

    var api = {
      game: game,
      setScore: function (key, val) {
        chipVals[key] = val;
        if (chipEls[key]) chipEls[key].textContent = val;
      },
      getScore: function (key) { return chipVals[key]; },
      getBest: function () { return getBest(game.id); },
      saveBest: function (score) {
        var isNew = saveBest(game.id, score);
        if (isNew && chipEls.best) chipEls.best.textContent = score;
        return isNew;
      },
      showModal: showModal,
      closeModal: closeModal
    };

    current = { game: game, mod: mod, stage: stage, api: api };
    mod.start(stage, api);
  }

  function destroyCurrent() {
    if (current) {
      try { current.mod.destroy(); } catch (e) {}
      current = null;
    }
    closeModal();
  }

  /* ---------------- 路由 ---------------- */
  function showView(name) {
    var views = document.querySelectorAll(".view");
    for (var i = 0; i < views.length; i++) {
      views[i].classList.toggle("active", views[i].id === "view-" + name);
    }
  }

  function route() {
    var hash = location.hash || "#/";
    var m = hash.match(/^#\/game\/([a-z0-9]+)/i);
    if (m && getGame(m[1])) {
      showView("game");
      openGame(m[1]);
    } else {
      destroyCurrent();
      showView("hall");
      var hall = document.getElementById("view-hall");
      renderHall(hall);
    }
  }

  window.addEventListener("hashchange", route);
  window.addEventListener("DOMContentLoaded", route);
  if (document.readyState !== "loading") route();

  /* 对外暴露（供调试/扩展） */
  window.Arcade = {
    GAMES: GAMES,
    getBest: getBest,
    showModal: showModal,
    closeModal: closeModal
  };
})();
