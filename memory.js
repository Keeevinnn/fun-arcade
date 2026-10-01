/* ============================================================
   游戏：记忆翻牌（DOM Grid + 3D 翻牌）
   ============================================================ */
window.GameModules = window.GameModules || {};
window.GameModules.memory = (function () {
  "use strict";

  /* 12 种图案（SVG + 颜色） */
  var ICONS = [
    { c: "#e53935", s: '<circle cx="12" cy="12" r="8" fill="{c}"/>' },
    { c: "#f57c00", s: '<rect x="4" y="4" width="16" height="16" rx="2.5" fill="{c}"/>' },
    { c: "#fbc02d", s: '<path d="M12 4L20 19H4z" fill="{c}"/>' },
    { c: "#43a047", s: '<path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8z" fill="{c}"/>' },
    { c: "#009688", s: '<path d="M12 20s-7-4.6-9-9c-1.4-3 0.8-6.4 4-6.4 2 0 3.6 1.2 5 3 1.4-1.8 3-3 5-3 3.2 0 5.4 3.4 4 6.4-2 4.4-9 9-9 9z" fill="{c}"/>' },
    { c: "#00acc1", s: '<path d="M12 3l7 9-7 9-7-9z" fill="{c}"/>' },
    { c: "#1e88e5", s: '<path d="M15 3.5a8 8 0 100 17 7 7 0 010-17z" fill="{c}"/>' },
    { c: "#3949ab", s: '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" fill="{c}"/>' },
    { c: "#8e24aa", s: '<path d="M13.5 2L4.5 13.5h5.4L9 22l9-11.5h-5.4L13.5 2z" fill="{c}"/>' },
    { c: "#d81b60", s: '<path d="M12 2l8 5v10l-8 5-8-5V7z" fill="{c}"/>' },
    { c: "#795548", s: '<path d="M12 2s7 8 7 13a7 7 0 11-14 0c0-5 7-13 7-13z" fill="{c}"/>' },
    { c: "#546e7a", s: '<circle cx="12" cy="12" r="7.5" fill="none" stroke="{c}" stroke-width="3.4"/>' }
  ];

  function iconSvg(i) {
    return '<svg viewBox="0 0 24 24">' + ICONS[i].s.replace(/{c}/g, ICONS[i].c) + "</svg>";
  }

  var stage, api, board;
  var state = "ready";
  var level, pairs, moves, matched;
  var firstCard, secondCard, lockBoard;
  var startTime, timerRaf, lastSec, hiddenAt;
  var docListeners = [];
  var flipTimers = [];

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    docListeners.push({ target: target, type: type, fn: fn, opts: opts });
  }
  function later(fn, ms) {
    var id = setTimeout(fn, ms);
    flipTimers.push(id);
    return id;
  }

  function pairsForLevel(lv) {
    return Math.min(6 + (lv - 1) * 2, 12);
  }

  function buildUI() {
    stage.innerHTML = "";
    board = document.createElement("div");
    board.className = "memory-board";
    board.setAttribute("aria-label", "记忆翻牌棋盘");
    board.style.maxWidth = "520px";
    board.style.width = "100%";
    stage.appendChild(board);

    var hint = document.createElement("div");
    hint.className = "game-hint";
    hint.innerHTML = "点击卡片翻开，找出两张图案相同的卡片配对";
    stage.appendChild(hint);

    /* 键盘快捷开始 */
    on(window, "keydown", function (e) {
      if (state === "ready" && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        startGame();
      }
    });

    /* 切后台时冻结计时 */
    on(document, "visibilitychange", function () {
      if (document.hidden) {
        hiddenAt = performance.now();
      } else if (hiddenAt && startTime) {
        startTime += performance.now() - hiddenAt;
        hiddenAt = 0;
      }
    });
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function buildLevel() {
    pairs = pairsForLevel(level);
    moves = 0;
    matched = 0;
    firstCard = null;
    secondCard = null;
    lockBoard = false;
    startTime = 0;
    lastSec = -1;

    var iconIds = [];
    for (var i = 0; i < pairs; i++) iconIds.push(i, i);
    shuffle(iconIds);

    var total = iconIds.length;
    var cols = Math.ceil(Math.sqrt(total));
    board.style.gridTemplateColumns = "repeat(" + cols + ", 1fr)";
    board.innerHTML = "";

    iconIds.forEach(function (iconId) {
      var card = document.createElement("div");
      card.className = "mem-card";
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", "未翻开的卡片");
      card.dataset.icon = iconId;
      card.innerHTML =
        '<div class="mem-inner">' +
          '<div class="mem-face mem-front"></div>' +
          '<div class="mem-face mem-back" style="background:linear-gradient(135deg,#eceeff,#d6dbff)">' +
          iconSvg(iconId) +
          "</div>" +
        "</div>";

      var flip = function () { flipCard(card); };
      card.addEventListener("click", flip);
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); }
      });
      board.appendChild(card);
    });

    api.setScore("moves", 0);
    api.setScore("time", "0s");
    api.setScore("level", level);
  }

  function flipCard(card) {
    if (state !== "playing" || lockBoard) return;
    if (card.classList.contains("flipped") || card.classList.contains("done")) return;

    card.classList.add("flipped");
    if (!startTime) {
      startTime = performance.now();
      startTimer();
    }

    if (!firstCard) {
      firstCard = card;
      return;
    }

    secondCard = card;
    moves++;
    api.setScore("moves", moves);
    checkMatch();
  }

  function checkMatch() {
    var isMatch = firstCard.dataset.icon === secondCard.dataset.icon;
    if (isMatch) {
      firstCard.classList.add("done");
      secondCard.classList.add("done");
      firstCard = null;
      secondCard = null;
      matched++;
      if (matched === pairs) {
        levelClear();
      }
    } else {
      lockBoard = true;
      var a = firstCard, b = secondCard;
      a.classList.add("badge-mismatch");
      b.classList.add("badge-mismatch");
      later(function () {
        a.classList.remove("flipped", "badge-mismatch");
        b.classList.remove("flipped", "badge-mismatch");
        firstCard = null;
        secondCard = null;
        lockBoard = false;
      }, 820);
    }
  }

  function startTimer() {
    cancelAnimationFrame(timerRaf);
    function tick() {
      if (startTime) {
        var sec = Math.floor((performance.now() - startTime) / 1000);
        if (sec !== lastSec) {
          lastSec = sec;
          var m = Math.floor(sec / 60);
          var s = sec % 60;
          api.setScore("time", m > 0 ? m + "m" + s + "s" : s + "s");
        }
      }
      timerRaf = requestAnimationFrame(tick);
    }
    timerRaf = requestAnimationFrame(tick);
  }

  function stopTimer() {
    cancelAnimationFrame(timerRaf);
    var sec = startTime ? Math.floor((performance.now() - startTime) / 1000) : 0;
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m > 0 ? m + "m" + s + "s" : s + "s";
  }

  function levelClear() {
    state = "cleared";
    var t = stopTimer();
    var isNew = api.saveBest(level);
    api.showModal({
      theme: "m-yellow",
      title: "第 " + level + " 关完成",
      stats: [
        { num: moves, label: "所用步数", cls: "cyan" },
        { num: t, label: "所用时间", cls: "green" },
        { num: api.getBest(), label: "最高关卡", cls: "yellow" }
      ],
      actions: [
        {
          text: "下一关", style: "btn-primary",
          fn: function () {
            level++;
            api.closeModal();
            buildLevel();
            state = "playing";
          }
        },
        { text: "重新开始", fn: restart },
        { text: "返回大厅", fn: backHall }
      ]
    });
  }

  function startGame() {
    api.closeModal();
    state = "playing";
  }

  function restart() {
    level = 1;
    api.closeModal();
    buildLevel();
    state = "playing";
  }

  function backHall() { location.hash = "#/"; }

  function start(c, a) {
    stage = c;
    api = a;
    buildUI();
    level = 1;
    buildLevel();
    state = "ready";
    api.showModal({
      title: "记忆翻牌",
      desc: "翻开卡片，记住图案位置，找出两张相同的卡片\n每关配对的卡片对数会增加，考验你的记忆力\n看看你能闯到第几关",
      actions: [{ text: "开始游戏", style: "btn-primary", fn: startGame }]
    });
  }

  function destroy() {
    cancelAnimationFrame(timerRaf);
    flipTimers.forEach(function (id) { clearTimeout(id); });
    flipTimers = [];
    docListeners.forEach(function (l) {
      l.target.removeEventListener(l.type, l.fn, l.opts);
    });
    docListeners = [];
    if (stage) stage.innerHTML = "";
    state = "ready";
  }

  return { start: start, destroy: destroy };
})();
