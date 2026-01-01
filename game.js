// ====== 設定 ======
const PASTEL = ["#F6C1D1", "#C8E7FF", "#D7F2C2", "#F9E6B3", "#D8C9FF"]; // 5色
const BG = "#f7f3ee";                 // 和紙っぽいベース
const BORDER = "rgba(90,70,50,0.35)"; // 上品な線色
// 落下の速さ（開始は約3倍体感、段数でさらに加速）
const GRAVITY_BASE = 2200 /10;   // 10倍遅くスタート
const GRAVITY_PER_SCORE = 55;    // 1段ごとに+55（調整用）
const GRAVITY_MAX = 2200 * 7;    // 上限（暴走防止）
const SPAWN_BASE = 1.05;              // 秒（だんだん速くしても良い）
const NON_MOCHI_RATE = 0.14;          // たまに餅じゃないもの
const STACK_TOLERANCE = 0.60;         // 横重なり率がこの以上なら成功（0〜1）
const MISS_LIMIT = 3;

// ====== DOM ======
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const worldBestEl = document.getElementById("worldBest");
const myScoreEl = document.getElementById("myScore");
const missesEl = document.getElementById("misses");

const panel = document.getElementById("panel");
const panelTitle = document.getElementById("panelTitle");
const panelBody = document.getElementById("panelBody");
const claimEl = document.getElementById("claim");
document.getElementById("restart").onclick = () => start();

const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");

// ====== 画面リサイズ ======
function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);

// ====== 入力 ======
let moveDir = 0; // -1,0,1
leftBtn.addEventListener("touchstart", (e)=>{ e.preventDefault(); moveDir = -1; }, {passive:false});
leftBtn.addEventListener("touchend", ()=> moveDir = 0);
rightBtn.addEventListener("touchstart", (e)=>{ e.preventDefault(); moveDir = 1; }, {passive:false});
rightBtn.addEventListener("touchend", ()=> moveDir = 0);

window.addEventListener("keydown", (e)=>{
  if (e.key === "ArrowLeft") moveDir = -1;
  if (e.key === "ArrowRight") moveDir = 1;
});
window.addEventListener("keyup", (e)=>{
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") moveDir = 0;
});

// ドラッグでも左右移動
let dragging = false;
let lastX = 0;
canvas.addEventListener("pointerdown", (e)=>{ dragging = true; lastX = e.clientX; });
canvas.addEventListener("pointermove", (e)=>{
  if (!dragging) return;
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  player.x += dx;
});
canvas.addEventListener("pointerup", ()=> dragging=false);
canvas.addEventListener("pointercancel", ()=> dragging=false);

// ====== ゲーム状態 ======
let W=0, H=0;
let tPrev = 0;
let running = false;

const player = { x: 0, y: 0, w: 110, h: 32, speed: 560 }; // 落下物の“受け”位置
let stack = [];        // 積まれた餅（または落下物）
let falling = null;    // 現在落下中
let spawnTimer = 0;
let spawnInterval = SPAWN_BASE;
let score = 0;
let misses = 0;

// ====== オブジェクト生成 ======
function makeDrop(isMochi) {
  const radius = 40 + Math.random()*10;
  const color = PASTEL[(Math.random()*PASTEL.length)|0];
  return {
    type: isMochi ? "mochi" : "junk",
    x: Math.random()*(W - radius*2) + radius,
    y: -radius - 10,
    r: radius,
    vy: 0,
    color,
    // junkの見た目：少し尖った/違う感じに
    spin: (Math.random()*2-1)*3,
    angle: 0
  };
}

// ====== 描画 ======
function drawBackground() {
  ctx.fillStyle = BG;
  ctx.fillRect(0,0,W,H);

  // 和紙っぽい薄い粒
  for (let i=0;i<120;i++){
    const x = Math.random()*W;
    const y = Math.random()*H;
    ctx.fillStyle = "rgba(90,70,50,0.025)";
    ctx.fillRect(x,y,1,1);
  }

  // 右上あたりに“金箔ライン”風の控えめな線（装飾）
  ctx.strokeStyle = "rgba(160,130,80,0.15)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W-260, 86);
  ctx.lineTo(W-14, 86);
  ctx.stroke();
}

function drawMochi(m) {
  // もち：円＋上品な縁
  ctx.fillStyle = m.color;
  ctx.beginPath();
  ctx.arc(m.x, m.y, m.r, 0, Math.PI*2);
  ctx.fill();

  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(m.x, m.y, m.r-1, 0, Math.PI*2);
  ctx.stroke();

  // ほんのりハイライト
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(m.x - m.r*0.28, m.y - m.r*0.28, m.r*0.28, 0, Math.PI*2);
  ctx.fill();
}

function drawJunk(o) {
  // junk：だるまっぽい三角（簡易）＝餅じゃない感
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.angle);
  ctx.fillStyle = "rgba(90,70,50,0.55)";
  ctx.beginPath();
  ctx.moveTo(0, -o.r*0.9);
  ctx.lineTo(o.r*0.75, o.r*0.75);
  ctx.lineTo(-o.r*0.75, o.r*0.75);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  // “受け皿”は極力目立たせない（和風上品に）
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  roundRect(player.x, player.y, player.w, player.h, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(140,120,90,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

// ====== 物理・判定 ======
function clampPlayer(){
  player.x = Math.max(12, Math.min(player.x, W - player.w - 12));
}

// 下の“台”のY（積み上がり）
function getStackTopY(){
  if (stack.length === 0) return player.y;
  const last = stack[stack.length-1];
  return last.y - last.r; // 上端
}

// どれだけ重なっているか（横方向の重なり率）
function overlapRatio(a, b){
  // a,bは円。簡易に「中心距離」で判定（本格的にするなら投影で）
  const dx = Math.abs(a.x - b.x);
  const max = a.r + b.r;
  const ratio = 1 - (dx / max); // 1に近いほど重なる
  return Math.max(0, Math.min(1, ratio));
}

function settleDrop(drop){
  // junkが着地 → 即死
  if (drop.type !== "mochi"){
    return gameOver("餅じゃないものを積んでしまいました…");
  }

  // 置く基準：一つ前の餅（なければプレイヤー“受け”の中央）
  let baseCenterX, baseY;
  if (stack.length === 0){
    baseCenterX = player.x + player.w/2;
    baseY = player.y;
  } else {
    baseCenterX = stack[stack.length-1].x;
    baseY = stack[stack.length-1].y - stack[stack.length-1].r*2 + 2;
  }

  // 重なり率
  const baseCircle = { x: baseCenterX, y: 0, r: drop.r };
  const incoming = { x: drop.x, y: 0, r: drop.r };
  const ratio = overlapRatio(baseCircle, incoming);

  if (ratio >= STACK_TOLERANCE){
    // 成功：積む
    const y = (stack.length === 0)
      ? player.y - drop.r
      : (stack[stack.length-1].y - stack[stack.length-1].r*2 + 2);

    stack.push({ ...drop, y });
    score++;
    myScoreEl.textContent = String(score);

    // 少しずつ速くする
    spawnInterval = Math.max(0.55, SPAWN_BASE - score*0.02);
  } else {
    // 失敗
    misses++;
    missesEl.textContent = `${misses} / ${MISS_LIMIT}`;
    if (misses >= MISS_LIMIT){
      return gameOver("重ねるのに3回失敗しました。");
    }
  }
}

function update(dt){
  // 入力でプレイヤー移動
  player.x += moveDir * player.speed * dt;
  clampPlayer();

  // 落下生成
  spawnTimer -= dt;
  if (!falling && spawnTimer <= 0){
    const isMochi = Math.random() > NON_MOCHI_RATE;
    falling = makeDrop(isMochi);
    spawnTimer = spawnInterval;
  }

  // 落下更新
  if (falling){
    falling.vy += GRAVITY * dt;
    falling.y += falling.vy * dt;
    if (falling.type === "junk") falling.angle += falling.spin * dt;

    // 接地判定：積み上がり or 受け皿
    const topY = getStackTopY();
    const floorY = topY; // ここに触れたらsettle
    if (falling.y + falling.r >= floorY){
      settleDrop(falling);
      falling = null;
    }

    // 画面外（下に抜ける）＝失敗扱いにしても良い
    if (falling && falling.y - falling.r > H + 20){
      misses++;
      missesEl.textContent = `${misses} / ${MISS_LIMIT}`;
      falling = null;
      if (misses >= MISS_LIMIT){
        return gameOver("取り逃しが重なりました。");
      }
    }
  }
}

function render(){
  drawBackground();

  // 積み
  for (const m of stack){
    drawMochi(m);
  }

  // 落下物
  if (falling){
    if (falling.type === "mochi") drawMochi(falling);
    else drawJunk(falling);
  }

  drawPlayer();
}

// ====== ループ ======
function loop(ts){
  if (!running) return;
  if (!tPrev) tPrev = ts;
  const dt = Math.min(0.033, (ts - tPrev) / 1000);
  tPrev = ts;

  W = canvas.clientWidth;
  H = canvas.clientHeight;

  update(dt);
  render();

  requestAnimationFrame(loop);
}

// ====== ゲーム開始/終了 ======
async function start(){
  panel.style.display = "none";
  claimEl.style.display = "none";
  claimEl.textContent = "";

  score = 0; misses = 0;
  myScoreEl.textContent = "0";
  missesEl.textContent = `0 / ${MISS_LIMIT}`;

  stack = [];
  falling = null;
  spawnTimer = 0;
  spawnInterval = SPAWN_BASE;

  // レイアウト確定後にサイズ反映
  requestAnimationFrame(()=>{
    resize();
    W = canvas.clientWidth;
    H = canvas.clientHeight;

    player.x = W/2 - player.w/2;
    player.y = H - 120;
    clampPlayer();
  });

  running = true;
  tPrev = 0;

  // TODO: ここで「今日の世界最高」を取得して表示（バックエンド接続後）
  worldBestEl.textContent = "—";

  requestAnimationFrame(loop);
}

function gameOver(reason){
  running = false;

  panelTitle.textContent = "ゲームオーバー";
  panelBody.textContent = `${reason}\nあなたの記録：${score} 段`;

  panel.style.display = "block";

  // TODO: スコア送信して「世界最高更新なら引換コード発行」
  // submitScore(score).then(...)
}

// 起動
start();
