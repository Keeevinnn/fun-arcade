/* ============================================================
   游戏：2048（DOM Grid + 滑动合并动画）
   ============================================================ */
window.GameModules = window.GameModules || {};
window.GameModules["2048"] = (function () {
  "use strict";

  var N = 4;
  var GAP = 10;

  var stage, api, board, layer;
  var model, nextId, score, busy, wonShown, state;
  var cellSize = 0;
  var animTimers = [];
  var docListeners = [];

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    docListeners.push({ target: target, type: type, fn: fn, opts: opts });
  }
  function later(fn, ms) {
    var id = setTimeout(fn, ms);
    animTimers.push(id);
    return id;
  }

  function emptyModel() {
    var m = [];
    for (var r = 0; r < N; r++) {
      m.push([null, null, null, null]);
    }
    return m;
  }

  function buildUI() {
    stage.innerHTML = "";
    board = document.createElement("div");
    board.className = "board-2048";
    board.setAttribute("aria-label", "2048 棋盘");

    var bg = document.createElement("div");
    bg.className = "grid-bg";
    for (var i = 0; i < N * N; i++) {
      bg.innerHTML += '<div class="cell"></div>';
    }
    board.appendChild(bg);

    layer = document.createElement("div");
    layer.className = "tile-layer";
    board.appendChild(layer);
    stage.appendChild(board);

    var hint = document.createElement("div");
    hint.className = "game-hint";
    hint.innerHTML = "方向键 / WASD 或在棋盘上滑动，让相同数字相撞合并";
    stage.appendChild(hint);

    /* Pointer Events 统一鼠标拖动与触摸滑动 */
    var pStart = null;
    board.addEventListener("pointerdown", function (e) {
      pStart = { x: e.clientX, y: e.clientY };
    });
    board.addEventListener("pointerup", function (e) {
      if (!pStart) return;
      handleSwipe(e.clientX - pStart.x, e.clientY - pStart.y);
      pStart = null;
    });
    board.addEventListener("pointercancel", function () { pStart = null; });

    /* 键盘 */
    on(window, "keydown", function (e) {
      var k = e.key;
      var map = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        Up: "up", Down: "down", Left: "left", Right: "right",
        w: "up", s: "down", a: "left", d: "right",
        W: "up", S: "down", A: "left", D: "right"
      };
      if (map[k]) {
        e.preventDefault();
        if (state === "running") doMove(map[k]);
      } else if (state === "ready" && (k === " " || k === "Enter")) {
        startGame();
      } else if (state === "over" && (k === "Enter" || k === " ")) {
        restart();
      }
    });
  }

  function handleSwipe(dx, dy) {
    if (state !== "running" || Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? "right" : "left");
    else doMove(dy > 0 ? "down" : "up");
  }

  function measure() {
    var w = layer.clientWidth;
    cellSize = (w - GAP * (N - 1)) / N;
  }

  function positionTile(t) {
    var x = t.col * (cellSize + GAP);
    var y = t.row * (cellSize + GAP);
    var el = t.el;
    el.style.width = cellSize + "px";
    el.style.height = cellSize + "px";
    el.style.setProperty("--tf-pos", "translate(" + x + "px," + y + "px)");
    el.style.transform = "translate(" + x + "px," + y + "px)";
  }

  function makeTile(v, r, c, isNew) {
    var t = { id: nextId++, v: v, row: r, col: c, el: null };
    var el = document.createElement("div");
    el.className = "tile" + (isNew ? " new" : "");
    el.setAttribute("data-v", v);
    el.textContent = v;
    t.el = el;
    layer.appendChild(el);
    positionTile(t);
    if (isNew) {
      later(function () { el.classList.remove("new"); }, 220);
    }
    return t;
  }

  function addRandomTile() {
    var empty = [];
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        if (!model[r][c]) empty.push({ r: r, c: c });
      }
    }
    if (!empty.length) return null;
    var spot = empty[Math.floor(Math.random() * empty.length)];
    var v = Math.random() < 0.9 ? 2 : 4;
    var t = makeTile(v, spot.r, spot.c, true);
    model[spot.r][spot.c] = t;
    return t;
  }

  /* 取某方向的所有线（线起点为压缩方向） */
  function getLines(dir) {
    var lines = [];
    for (var i = 0; i < N; i++) {
      var cells = [];
      var coords = [];
      for (var j = 0; j < N; j++) {
        var r, c;
        if (dir === "left") { r = i; c = j; }
        else if (dir === "right") { r = i; c = N - 1 - j; }
        else if (dir === "up") { r = j; c = i; }
        else { r = N - 1 - j; c = i; }
        cells.push(model[r][c]);
        coords.push({ r: r, c: c });
      }
      lines.push({ cells: cells, coords: coords });
    }
    return lines;
  }

  function slideLine(cells) {
    var result = [];
    var movements = [];
    var gained = 0;
    for (var j = 0; j < cells.length; j++) {
      var t = cells[j];
      if (!t) continue;
      var last = result[result.length - 1];
      if (last && last.v === t.v && !last._mergeLock) {
        last._mergeLock = true;
        last._pendingV = t.v * 2;
        movements.push({ tile: t, origIndex: j, toIndex: result.length - 1, gone: true });
        gained += t.v * 2;
      } else {
        movements.push({ tile: t, origIndex: j, toIndex: result.length, gone: false });
        result.push(t);
      }
    }
    while (result.length < N) result.push(null);
    var moved = movements.some(function (m) { return m.toIndex !== m.origIndex; });
    return { result: result, movements: movements, gained: gained, moved: moved };
  }

  function doMove(dir) {
    if (busy) return;
    measure();
    var lines = getLines(dir);
    var results = [];
    var anyMoved = false;
    var totalGained = 0;
    var allMov = [];

    lines.forEach(function (line) {
      var res = slideLine(line.cells);
      results.push({ line: line, res: res });
      if (res.moved) anyMoved = true;
      totalGained += res.gained;
      res.movements.forEach(function (m) {
        m.target = line.coords[m.toIndex];
        allMov.push(m);
      });
    });

    if (!anyMoved) return;
    busy = true;

    /* 第一步：所有方块滑向目标（含被合并者） */
    allMov.forEach(function (m) {
      m.tile.row = m.target.r;
      m.tile.col = m.target.c;
      positionTile(m.tile);
    });

    if (totalGained > 0) {
      score += totalGained;
      api.setScore("score", score);
      api.saveBest(score);
    }

    /* 第二步：落地后处理合并、新增 */
    later(function () {
      var newModel = emptyModel();
      var mergeKeeps = [];
      var goneTiles = [];

      results.forEach(function (item) {
        item.res.result.forEach(function (t, k) {
          var coord = item.line.coords[k];
          if (t) {
            newModel[coord.r][coord.c] = t;
            t.row = coord.r;
            t.col = coord.c;
            if (t._mergeLock) mergeKeeps.push(t);
          }
        });
        item.res.movements.forEach(function (m) {
          if (m.gone) goneTiles.push(m.tile);
        });
      });

      /* 移除被合并的方块 */
      goneTiles.forEach(function (t) {
        if (t.el.parentNode) t.el.parentNode.removeChild(t.el);
      });

      /* 合并方块：更新数值并播放动画 */
      mergeKeeps.forEach(function (t) {
        t.v = t._pendingV;
        t.el.setAttribute("data-v", t.v);
        t.el.textContent = t.v;
        positionTile(t);
        t.el.classList.add("merged");
        later(function () { t.el.classList.remove("merged"); }, 240);
      });

      model = newModel;

      /* 清理临时标记 */
      for (var r = 0; r < N; r++) {
        for (var c = 0; c < N; c++) {
          if (model[r][c]) {
            model[r][c]._mergeLock = false;
            model[r][c]._pendingV = 0;
          }
        }
      }

      addRandomTile();

      /* 胜利判定 */
      if (!wonShown) {
        var has2048 = false;
        for (var rr = 0; rr < N; rr++) {
          for (var cc = 0; cc < N; cc++) {
            if (model[rr][cc] && model[rr][cc].v >= 2048) has2048 = true;
          }
        }
        if (has2048) {
          wonShown = true;
          showWin();
          busy = false;
          return;
        }
      }

      busy = false;
      if (!canMove()) showOver();
    }, 140);
  }

  function canMove() {
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        var t = model[r][c];
        if (!t) return true;
        if (c + 1 < N && model[r][c + 1] && model[r][c + 1].v === t.v) return true;
        if (r + 1 < N && model[r + 1][c] && model[r + 1][c].v === t.v) return true;
      }
    }
    return false;
  }

  function showWin() {
    state = "won";
    api.showModal({
      theme: "m-yellow",
      title: "你拼出了 2048！",
      stats: [
        { num: score, label: "当前分数", cls: "cyan" },
        { num: api.getBest(), label: "最高分", cls: "yellow" }
      ],
      actions: [
        { text: "继续挑战", style: "btn-primary", fn: function () {
          api.closeModal(); state = "running";
        } },
        { text: "重新开始", fn: restart },
        { text: "返回大厅", fn: backHall }
      ]
    });
  }

  function showOver() {
    state = "over";
    api.showModal({
      theme: "m-pink",
      title: "无路可走了",
      stats: [
        { num: score, label: "本局分数", cls: "cyan" },
        { num: api.getBest(), label: "最高分", cls: "yellow" }
      ],
      actions: [
        { text: "再来一局", style: "btn-primary", fn: restart },
        { text: "返回大厅", fn: backHall }
      ]
    });
  }

  function reset() {
    if (layer) layer.innerHTML = "";
    model = emptyModel();
    nextId = 1;
    score = 0;
    busy = false;
    wonShown = false;
    measure();
    addRandomTile();
    addRandomTile();
    api.setScore("score", 0);
    api.setScore("best", api.getBest());
  }

  function startGame() {
    api.closeModal();
    state = "running";
  }

  function restart() {
    reset();
    api.closeModal();
    state = "running";
  }

  function backHall() { location.hash = "#/"; }

  function start(c, a) {
    stage = c;
    api = a;
    buildUI();
    reset();
    state = "ready";
    api.showModal({
      title: "2048",
      desc: "滑动方块，相同数字相撞会合并成翻倍数字\n每一步后都会出现新方块\n棋盘填满且无法合并时结束",
      actions: [{ text: "开始游戏", style: "btn-primary", fn: startGame }]
    });
  }

  function destroy() {
    animTimers.forEach(function (id) { clearTimeout(id); });
    animTimers = [];
    docListeners.forEach(function (l) {
      l.target.removeEventListener(l.type, l.fn, l.opts);
    });
    docListeners = [];
    if (stage) stage.innerHTML = "";
    state = "ready";
  }

  return { start: start, destroy: destroy };
})();
