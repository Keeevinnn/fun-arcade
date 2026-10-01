/* ============================================================
   游戏：贪吃蛇（Canvas 2D）
   ============================================================ */
window.GameModules = window.GameModules || {};
window.GameModules.snake = (function () {
  "use strict";

  var GRID = 20;
  var CELL = 20;
  var SIZE = GRID * CELL; // 400
  var START_INTERVAL = 165;
  var MIN_INTERVAL = 70;

  var DIRS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
  };

  var stage, api, canvas, ctx, dpad;
  var state = "ready";
  var snake, dir, dirQueue, food, score, stepInterval, acc, lastTime, rafId;
  var docListeners = [];

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    docListeners.push({ target: target, type: type, fn: fn, opts: opts });
  }

  function buildUI() {
    stage.innerHTML = "";

    canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", "贪吃蛇游戏区域");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width = "400px";
    canvas.style.height = "auto";
    ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stage.appendChild(canvas);

    var hint = document.createElement("div");
    hint.className = "game-hint";
    hint.innerHTML = "方向键 / WASD 控制方向，手机可滑动屏幕或使用方向键<br>空格 / P 键暂停";
    stage.appendChild(hint);

    dpad = document.createElement("div");
    dpad.className = "dpad show";
    dpad.innerHTML =
      '<button class="d-up" aria-label="上">▲</button>' +
      '<button class="d-left" aria-label="左">◀</button>' +
      '<button class="d-down" aria-label="下">▼</button>' +
      '<button class="d-right" aria-label="右">▶</button>';
    stage.appendChild(dpad);

    var bindPad = function (sel, d) {
      dpad.querySelector(sel).addEventListener("pointerdown", function (e) {
        e.preventDefault();
        queueDir(d);
      });
    };
    bindPad(".d-up", "up");
    bindPad(".d-down", "down");
    bindPad(".d-left", "left");
    bindPad(".d-right", "right");

    /* 触摸滑动 */
    var tStart = null;
    canvas.addEventListener("touchstart", function (e) {
      tStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    canvas.addEventListener("touchmove", function (e) {
      if (!tStart) return;
      var t = e.touches[0];
      var dx = t.clientX - tStart.x;
      var dy = t.clientY - tStart.y;
      if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
      if (Math.abs(dx) > Math.abs(dy)) queueDir(dx > 0 ? "right" : "left");
      else queueDir(dy > 0 ? "down" : "up");
      tStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    /* 键盘 */
    on(window, "keydown", function (e) {
      var k = e.key;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].indexOf(k) >= 0) e.preventDefault();

      var map = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right",
        W: "up", S: "down", A: "left", D: "right"
      };
      if (state === "running") {
        if (map[k]) queueDir(map[k]);
        if (k === " " || k === "p" || k === "P") pauseGame();
      } else if (state === "paused") {
        if (k === " " || k === "p" || k === "P" || k === "Escape") resumeGame();
      } else if (state === "ready") {
        if (k === " " || k === "Enter") startGame();
      } else if (state === "over") {
        if (k === "Enter" || k === " ") restart();
      }
    });

    on(document, "visibilitychange", function () {
      if (document.hidden && state === "running") pauseGame();
    });
  }

  function queueDir(name) {
    var d = DIRS[name];
    if (!d) return;
    var last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
    if (d.x === -last.x && d.y === -last.y) return; // 反向
    if (d.x === last.x && d.y === last.y) return;   // 同向
    if (dirQueue.length < 3) dirQueue.push(d);
  }

  function reset() {
    var cy = Math.floor(GRID / 2);
    snake = [
      { x: 5, y: cy }, { x: 4, y: cy }, { x: 3, y: cy }
    ];
    dir = DIRS.right;
    dirQueue = [];
    score = 0;
    stepInterval = START_INTERVAL;
    acc = 0;
    api.setScore("score", 0);
    api.setScore("best", api.getBest());
    spawnFood();
  }

  function spawnFood() {
    var occupied = {};
    snake.forEach(function (s) { occupied[s.x + "," + s.y] = true; });
    var free = [];
    for (var x = 0; x < GRID; x++) {
      for (var y = 0; y < GRID; y++) {
        if (!occupied[x + "," + y]) free.push({ x: x, y: y });
      }
    }
    food = free[Math.floor(Math.random() * free.length)] || { x: 0, y: 0 };
  }

  function step() {
    if (dirQueue.length) dir = dirQueue.shift();
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
      gameOver();
      return;
    }
    var willEat = head.x === food.x && head.y === food.y;
    var body = willEat ? snake : snake.slice(0, snake.length - 1);
    for (var i = 0; i < body.length; i++) {
      if (body[i].x === head.x && body[i].y === head.y) {
        gameOver();
        return;
      }
    }

    snake.unshift(head);
    if (willEat) {
      score += 10;
      api.setScore("score", score);
      var eaten = Math.floor(score / 10);
      stepInterval = Math.max(MIN_INTERVAL, START_INTERVAL - eaten * 4);
      spawnFood();
    } else {
      snake.pop();
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function draw(ts) {
    /* 背景 */
    ctx.fillStyle = "#0a0818";
    ctx.fillRect(0, 0, SIZE, SIZE);
    /* 棋盘格纹 */
    ctx.fillStyle = "rgba(255,255,255,0.028)";
    for (var x = 0; x < GRID; x++) {
      for (var y = 0; y < GRID; y++) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }

    /* 食物（脉动发光） */
    var pulse = 1 + 0.13 * Math.sin((ts || 0) / 190);
    var fx = food.x * CELL + CELL / 2;
    var fy = food.y * CELL + CELL / 2;
    var fr = (CELL / 2 - 3) * pulse;
    ctx.save();
    ctx.shadowColor = "#ff2e88";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#ff2e88";
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(fx - fr * 0.25, fy - fr * 0.25, fr * 0.28, 0, Math.PI * 2);
    ctx.fill();

    /* 蛇身 */
    for (var i = snake.length - 1; i >= 0; i--) {
      var seg = snake[i];
      var pad = i === 0 ? 1.5 : 2.5;
      var sx = seg.x * CELL + pad;
      var sy = seg.y * CELL + pad;
      var sw = CELL - pad * 2;
      if (i === 0) {
        ctx.fillStyle = "#46ff5e";
        ctx.shadowColor = "rgba(70,255,94,0.8)";
        ctx.shadowBlur = 10;
      } else {
        var t = i / snake.length;
        var g = Math.round(255 - t * 140);
        ctx.fillStyle = "rgb(20," + g + ",70)";
        ctx.shadowBlur = 0;
      }
      roundRect(ctx, sx, sy, sw, sw, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    /* 蛇头眼睛 */
    var h = snake[0];
    var hx = h.x * CELL + CELL / 2;
    var hy = h.y * CELL + CELL / 2;
    var exo = dir.x, eyo = dir.y;
    var perp = { x: -eyo, y: exo };
    var eyeOff = 4.2;
    var eyeFwd = 3.2;
    ctx.fillStyle = "#062b0a";
    [1, -1].forEach(function (s) {
      var ex = hx + exo * eyeFwd + perp.x * eyeOff * s;
      var ey = hy + eyo * eyeFwd + perp.y * eyeOff * s;
      ctx.beginPath();
      ctx.arc(ex, ey, 2.1, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function loop(ts) {
    if (state !== "running") return;
    if (!lastTime) lastTime = ts;
    var dt = ts - lastTime;
    lastTime = ts;
    acc += dt;
    var guard = 0;
    while (acc >= stepInterval && guard < 6) {
      acc -= stepInterval;
      step();
      guard++;
      if (state !== "running") break;
    }
    draw(ts);
    if (state === "running") rafId = requestAnimationFrame(loop);
  }

  function startGame() {
    api.closeModal();
    state = "running";
    lastTime = 0;
    acc = 0;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function pauseGame() {
    if (state !== "running") return;
    state = "paused";
    cancelAnimationFrame(rafId);
    api.showModal({
      title: "已暂停",
      actions: [
        { text: "继续", style: "btn-primary", fn: resumeGame },
        { text: "重新开始", fn: restart },
        { text: "返回大厅", fn: backHall }
      ]
    });
  }

  function resumeGame() {
    if (state !== "paused") return;
    api.closeModal();
    state = "running";
    lastTime = 0;
    rafId = requestAnimationFrame(loop);
  }

  function restart() {
    reset();
    startGame();
  }

  function gameOver() {
    state = "over";
    cancelAnimationFrame(rafId);
    draw(performance.now());
    var isNew = api.saveBest(score);
    api.showModal({
      theme: "m-pink",
      title: isNew ? "新纪录！" : "游戏结束",
      titleColor: isNew ? "#ffd60a" : "",
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

  function backHall() { location.hash = "#/"; }

  function start(c, a) {
    stage = c;
    api = a;
    buildUI();
    reset();
    draw(performance.now());
    state = "ready";
    api.showModal({
      title: "贪吃蛇",
      desc: "方向键 / WASD 或滑动屏幕控制方向\n吃掉能量方块得分，速度会越来越快\n别撞到墙壁和自己",
      actions: [{ text: "开始游戏", style: "btn-primary", fn: startGame }]
    });
  }

  function destroy() {
    cancelAnimationFrame(rafId);
    docListeners.forEach(function (l) {
      l.target.removeEventListener(l.type, l.fn, l.opts);
    });
    docListeners = [];
    if (stage) stage.innerHTML = "";
    state = "ready";
  }

  return { start: start, destroy: destroy };
})();
