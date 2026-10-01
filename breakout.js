/* ============================================================
   游戏：打砖块（Canvas 2D）
   ============================================================ */
window.GameModules = window.GameModules || {};
window.GameModules.breakout = (function () {
  "use strict";

  var W = 480, H = 520;
  var COLS = 9;
  var PAD_X = 16;
  var BRICK_GAP = 6;
  var BRICK_TOP = 58;
  var BRICK_H = 18;
  var BALL_R = 7;
  var PADDLE_H = 12;
  var BASE_SPEED = 320;

  /* 砖块行颜色（从上到下，循环） */
  var ROW_STYLE = [
    { color: "#ff3b5c", score: 60 },
    { color: "#ff7b29", score: 50 },
    { color: "#ffd60a", score: 40 },
    { color: "#46ff5e", score: 30 },
    { color: "#00e5ff", score: 20 },
    { color: "#b537f2", score: 10 }
  ];

  var stage, api, canvas, ctx;
  var state = "ready";
  var bricks, paddle, ball;
  var score, lives, level;
  var attached = true;
  var rafId, lastTime;
  var keyState = {};
  var docListeners = [];

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    docListeners.push({ target: target, type: type, fn: fn, opts: opts });
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function buildUI() {
    stage.innerHTML = "";
    canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", "打砖块游戏区域");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = "480px";
    canvas.style.height = "auto";
    ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stage.appendChild(canvas);

    var hint = document.createElement("div");
    hint.className = "game-hint";
    hint.innerHTML = "移动鼠标 / 手指滑动 / 方向键控制挡板，点击或空格发射小球";
    stage.appendChild(hint);

    /* 指针统一控制（鼠标 + 触摸） */
    canvas.addEventListener("pointermove", function (e) {
      movePaddleToPointer(e);
    });
    canvas.addEventListener("pointerdown", function (e) {
      movePaddleToPointer(e);
      if (state === "running" && attached) launch();
    });

    /* 键盘 */
    on(window, "keydown", function (e) {
      var k = e.key;
      if (["ArrowLeft", "ArrowRight", " "].indexOf(k) >= 0) e.preventDefault();
      if (k === "ArrowLeft" || k === "a" || k === "A") keyState.left = true;
      if (k === "ArrowRight" || k === "d" || k === "D") keyState.right = true;

      if (state === "running") {
        if (k === " " && attached) launch();
        if (k === "p" || k === "P") pauseGame();
      } else if (state === "paused") {
        if (k === "p" || k === "P" || k === " " || k === "Escape") resumeGame();
      } else if (state === "ready") {
        if (k === " " || k === "Enter") startGame();
      } else if (state === "over") {
        if (k === "Enter" || k === " ") restart();
      }
    });
    on(window, "keyup", function (e) {
      var k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") keyState.left = false;
      if (k === "ArrowRight" || k === "d" || k === "D") keyState.right = false;
    });

    on(document, "visibilitychange", function () {
      if (document.hidden && state === "running") pauseGame();
    });
  }

  function movePaddleToPointer(e) {
    var rect = canvas.getBoundingClientRect();
    var px = (e.clientX - rect.left) * (W / rect.width);
    paddle.x = clamp(px - paddle.w / 2, 0, W - paddle.w);
  }

  function brickW() {
    return (W - PAD_X * 2 - BRICK_GAP * (COLS - 1)) / COLS;
  }

  function buildBricks() {
    bricks = [];
    var bw = brickW();
    var rows = Math.min(4 + (level - 1), 6);
    for (var r = 0; r < rows; r++) {
      var style = ROW_STYLE[r % ROW_STYLE.length];
      for (var c = 0; c < COLS; c++) {
        /* 第 2 关起最顶行设置硬砖（2 次击碎） */
        var hard = level >= 2 && r === 0;
        bricks.push({
          x: PAD_X + c * (bw + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          w: bw,
          h: BRICK_H,
          hp: hard ? 2 : 1,
          hard: hard,
          color: style.color,
          score: hard ? 80 : style.score,
          alive: true
        });
      }
    }
  }

  function resetBall() {
    attached = true;
    var speed = BASE_SPEED + (level - 1) * 26;
    ball = {
      x: paddle.x + paddle.w / 2,
      y: paddle.y - BALL_R - 1,
      vx: 0,
      vy: 0,
      r: BALL_R,
      speed: speed
    };
  }

  function resetAll() {
    level = 1;
    score = 0;
    lives = 3;
    var pw = Math.max(62, 88 - (level - 1) * 4);
    paddle = {
      x: W / 2 - pw / 2,
      y: H - 34,
      w: pw,
      h: PADDLE_H
    };
    buildBricks();
    resetBall();
    api.setScore("score", 0);
    api.setScore("level", 1);
    api.setScore("lives", 3);
  }

  function launch() {
    attached = false;
    var ang = (-Math.PI / 2) + (Math.random() * 0.5 - 0.25);
    ball.vx = ball.speed * Math.cos(ang);
    ball.vy = ball.speed * Math.sin(ang);
  }

  function update(dt) {
    /* 键盘移动挡板 */
    var paddleSpeed = 460;
    if (keyState.left) paddle.x -= paddleSpeed * dt;
    if (keyState.right) paddle.x += paddleSpeed * dt;
    paddle.x = clamp(paddle.x, 0, W - paddle.w);

    if (attached) {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r - 1;
      return;
    }

    /* 球运动子步进，防止高速穿透 */
    var speed = Math.hypot(ball.vx, ball.vy);
    var maxStep = 9;
    var n = Math.max(1, Math.ceil((speed * dt) / maxStep));
    var sdt = dt / n;
    for (var s = 0; s < n; s++) {
      moveBall(sdt);
      if (state !== "running" || attached) return;
    }

    /* 过关 */
    var anyAlive = false;
    for (var k = 0; k < bricks.length; k++) if (bricks[k].alive) { anyAlive = true; break; }
    if (!anyAlive) levelClear();
  }

  function moveBall(dt) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    /* 墙壁 */
    if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
    if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); }
    if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }

    /* 挡板 */
    if (
      ball.vy > 0 &&
      ball.y + ball.r >= paddle.y &&
      ball.y - ball.r <= paddle.y + paddle.h &&
      ball.x >= paddle.x - ball.r &&
      ball.x <= paddle.x + paddle.w + ball.r
    ) {
      ball.y = paddle.y - ball.r;
      var rel = clamp((ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2), -1, 1);
      var maxAng = Math.PI / 3; // 60°
      var ang = rel * maxAng;
      ball.vx = ball.speed * Math.sin(ang);
      ball.vy = -ball.speed * Math.cos(ang);
    }

    /* 砖块 */
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.alive) continue;
      var cx = ball.x, cy = ball.y, r = ball.r;
      var nearestX = clamp(cx, b.x, b.x + b.w);
      var nearestY = clamp(cy, b.y, b.y + b.h);
      var dx = cx - nearestX;
      var dy = cy - nearestY;
      if (dx * dx + dy * dy < r * r) {
        /* 最小穿透轴判断反弹方向 */
        var oL = cx + r - b.x;
        var oR = b.x + b.w - (cx - r);
        var oT = cy + r - b.y;
        var oB = b.y + b.h - (cy - r);
        var minO = Math.min(oL, oR, oT, oB);
        if (minO === oL || minO === oR) ball.vx = -ball.vx;
        else ball.vy = -ball.vy;

        b.hp--;
        if (b.hp <= 0) {
          b.alive = false;
          score += b.score;
          api.setScore("score", score);
        } else {
          score += 10;
          api.setScore("score", score);
        }
        break;
      }
    }

    /* 球落底 */
    if (ball.y - ball.r > H) {
      lives--;
      api.setScore("lives", Math.max(0, lives));
      if (lives <= 0) {
        gameOver();
      } else {
        resetBall();
      }
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

  function draw() {
    ctx.fillStyle = "#0a0818";
    ctx.fillRect(0, 0, W, H);

    /* 砖块 */
    bricks.forEach(function (b) {
      if (!b.alive) return;
      if (b.hard) {
        ctx.fillStyle = b.hp === 2 ? "#8d93b8" : "#c2c7e0";
      } else {
        ctx.fillStyle = b.color;
      }
      roundRect(ctx, b.x, b.y, b.w, b.h, 4);
      ctx.fill();
      if (b.hard) {
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    });

    /* 挡板 */
    ctx.save();
    ctx.shadowColor = "#00e5ff";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#00e5ff";
    roundRect(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 6);
    ctx.fill();
    ctx.restore();

    /* 球 */
    ctx.save();
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* 待发射提示 */
    if (attached && state === "running") {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = '600 14px "Noto Sans SC", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("点击 / 空格发射", W / 2, H - 60);
    }

    /* 待发射提示 */
    if (attached && state === "running") {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = '600 14px "Noto Sans SC", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("点击 / 空格发射", W / 2, H - 60);
    }
  }

  function loop(ts) {
    if (state !== "running") return;
    if (!lastTime) lastTime = ts;
    var dt = Math.min((ts - lastTime) / 1000, 0.033);
    lastTime = ts;
    update(dt);
    if (state === "running") {
      draw();
      rafId = requestAnimationFrame(loop);
    }
  }

  function startGame() {
    api.closeModal();
    state = "running";
    lastTime = 0;
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

  function levelClear() {
    state = "levelclear";
    cancelAnimationFrame(rafId);
    api.saveBest(score);
    api.showModal({
      theme: "m-yellow",
      title: "第 " + level + " 关通过",
      stats: [
        { num: score, label: "当前分数", cls: "cyan" },
        { num: lives, label: "剩余生命", cls: "green" }
      ],
      actions: [
        {
          text: "进入下一关", style: "btn-primary",
          fn: function () {
            level++;
            api.setScore("level", level);
            buildBricks();
            resetBall();
            api.closeModal();
            state = "running";
            lastTime = 0;
            rafId = requestAnimationFrame(loop);
          }
        },
        { text: "返回大厅", fn: backHall }
      ]
    });
  }

  function gameOver() {
    state = "over";
    cancelAnimationFrame(rafId);
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

  function restart() {
    resetAll();
    api.closeModal();
    state = "running";
    lastTime = 0;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function backHall() { location.hash = "#/"; }

  function start(c, a) {
    stage = c;
    api = a;
    buildUI();
    resetAll();
    draw();
    state = "ready";
    api.showModal({
      title: "打砖块",
      desc: "移动挡板接住小球，击碎全部砖块即可过关\n球速会越来越快，还会出现需要打两次的硬砖\n你有 3 条生命，别让球掉到底部",
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
