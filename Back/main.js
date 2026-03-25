const boardEl = document.getElementById("board");
const logEl = document.getElementById("log");
const turnEl = document.getElementById("turn");
const resetBtn = document.getElementById("resetBtn");
const flipBtn = document.getElementById("flipBtn");
const hintBtn = document.getElementById("hintBtn");

const PIECES = {
  w: {
    king: "♔",
    queen: "♕",
    rook: "♖",
    bishop: "♗",
    knight: "♘",
    pawn: "♙",
  },
  b: {
    king: "♚",
    queen: "♛",
    rook: "♜",
    bishop: "♝",
    knight: "♞",
    pawn: "♟",
  },
};

let flipped = false;
let selected = null;
let legalMoves = [];
let turn = "w";
let botEnabled = true;
let botColor = "b";

function initialBoard() {
  return [
    ["br", "bn", "bb", "bq", "bk", "bb", "bn", "br"],
    ["bp", "bp", "bp", "bp", "bp", "bp", "bp", "bp"],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ["wp", "wp", "wp", "wp", "wp", "wp", "wp", "wp"],
    ["wr", "wn", "wb", "wq", "wk", "wb", "wn", "wr"],
  ];
}

let board = initialBoard();

function pieceGlyph(code) {
  if (!code) return "";
  const color = code[0] === "w" ? "w" : "b";
  const type = code[1];
  const map = {
    k: "king",
    q: "queen",
    r: "rook",
    b: "bishop",
    n: "knight",
    p: "pawn",
  };
  return PIECES[color][map[type]];
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function getColor(piece) {
  return piece ? piece[0] : null;
}

function isEnemy(piece, color) {
  return piece && getColor(piece) !== color;
}

function addMove(moves, r, c) {
  if (inBounds(r, c)) moves.push({ r, c });
}

function lineMoves(moves, r, c, dr, dc, color) {
  let nr = r + dr;
  let nc = c + dc;
  while (inBounds(nr, nc)) {
    const target = board[nr][nc];
    if (!target) {
      moves.push({ r: nr, c: nc });
    } else {
      if (isEnemy(target, color)) moves.push({ r: nr, c: nc });
      break;
    }
    nr += dr;
    nc += dc;
  }
}

function getLegalMoves(r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const color = getColor(piece);
  const type = piece[1];
  const moves = [];

  if (type === "p") {
    const dir = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;
    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push({ r: r + dir, c });
      if (r === startRow && !board[r + dir * 2][c]) {
        moves.push({ r: r + dir * 2, c });
      }
    }
    for (const dc of [-1, 1]) {
      const nr = r + dir;
      const nc = c + dc;
      if (inBounds(nr, nc) && isEnemy(board[nr][nc], color)) {
        moves.push({ r: nr, c: nc, capture: true });
      }
    }
  }

  if (type === "n") {
    const jumps = [
      [2, 1],
      [2, -1],
      [-2, 1],
      [-2, -1],
      [1, 2],
      [1, -2],
      [-1, 2],
      [-1, -2],
    ];
    for (const [dr, dc] of jumps) {
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const target = board[nr][nc];
      if (!target || isEnemy(target, color)) moves.push({ r: nr, c: nc });
    }
  }

  if (type === "b" || type === "q") {
    lineMoves(moves, r, c, 1, 1, color);
    lineMoves(moves, r, c, 1, -1, color);
    lineMoves(moves, r, c, -1, 1, color);
    lineMoves(moves, r, c, -1, -1, color);
  }

  if (type === "r" || type === "q") {
    lineMoves(moves, r, c, 1, 0, color);
    lineMoves(moves, r, c, -1, 0, color);
    lineMoves(moves, r, c, 0, 1, color);
    lineMoves(moves, r, c, 0, -1, color);
  }

  if (type === "k") {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const target = board[nr][nc];
        if (!target || isEnemy(target, color)) moves.push({ r: nr, c: nc });
      }
    }
  }

  return moves;
}

function renderBoard() {
  boardEl.innerHTML = "";
  const rows = flipped ? [...board].reverse() : board;
  rows.forEach((row, rowIndex) => {
    const realRow = flipped ? 7 - rowIndex : rowIndex;
    const cols = flipped ? [...row].reverse() : row;
    cols.forEach((piece, colIndex) => {
      const realCol = flipped ? 7 - colIndex : colIndex;
      const square = document.createElement("div");
      const isLight = (realRow + realCol) % 2 === 0;
      square.className = `square ${isLight ? "light" : "dark"}`;
      square.dataset.r = realRow;
      square.dataset.c = realCol;
      square.textContent = pieceGlyph(piece);

      if (selected && selected.r === realRow && selected.c === realCol) {
        square.classList.add("selected");
      }

      const move = legalMoves.find((m) => m.r === realRow && m.c === realCol);
      if (move) {
        square.classList.add(move.capture ? "capture" : "move");
      }

      square.addEventListener("click", onSquareClick);
      boardEl.appendChild(square);
    });
  });

  const who = turn === "w" ? "белые" : "чёрные";
  const botTag = botEnabled && turn === botColor ? " (бот)" : "";
  turnEl.textContent = `Ход: ${who}${botTag}`;
}

function logMove(text) {
  const item = document.createElement("span");
  item.textContent = text;
  logEl.prepend(item);
}

function makeMove(from, to) {
  const moving = board[from.r][from.c];
  const capture = board[to.r][to.c];
  board[to.r][to.c] = moving;
  board[from.r][from.c] = null;
  if (moving[1] === "p" && (to.r === 0 || to.r === 7)) {
    board[to.r][to.c] = moving[0] + "q";
  }
  const captureText = capture ? `, взятие ${pieceGlyph(capture)}` : "";
  logMove(
    `${pieceGlyph(moving)} ${String.fromCharCode(97 + from.c)}${8 - from.r} → ${String.fromCharCode(97 + to.c)}${8 - to.r}${captureText}`
  );
  turn = turn === "w" ? "b" : "w";
  selected = null;
  legalMoves = [];
  renderBoard();
}

function getAllLegalMoves(color) {
  const moves = [];
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (piece && getColor(piece) === color) {
        const legal = getLegalMoves(r, c);
        legal.forEach((m) => {
          moves.push({
            from: { r, c },
            to: { r: m.r, c: m.c },
          });
        });
      }
    }
  }
  return moves;
}

function botMove() {
  if (!botEnabled || turn !== botColor) return;
  const moves = getAllLegalMoves(botColor);
  if (!moves.length) {
    logMove("Бот: ходов нет");
    return;
  }
  const choice = moves[Math.floor(Math.random() * moves.length)];
  makeMove(choice.from, choice.to);
}

function onSquareClick(e) {
  const r = Number(e.currentTarget.dataset.r);
  const c = Number(e.currentTarget.dataset.c);
  const piece = board[r][c];

  if (selected) {
    const move = legalMoves.find((m) => m.r === r && m.c === c);
    if (move) {
      const from = selected;
      makeMove(from, { r, c });
      if (botEnabled) {
        setTimeout(botMove, 300);
      }
      return;
    }
  }

  if (!piece) {
    selected = null;
    legalMoves = [];
    renderBoard();
    return;
  }

  if (getColor(piece) !== turn) {
    return;
  }

  selected = { r, c };
  legalMoves = getLegalMoves(r, c).map((m) => ({
    ...m,
    capture: board[m.r][m.c] !== null,
  }));
  renderBoard();
}

resetBtn.addEventListener("click", () => {
  board = initialBoard();
  selected = null;
  legalMoves = [];
  turn = "w";
  logEl.innerHTML = "";
  renderBoard();
});

flipBtn.addEventListener("click", () => {
  flipped = !flipped;
  renderBoard();
});

hintBtn.addEventListener("click", () => {
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (piece && getColor(piece) === turn) {
        const moves = getLegalMoves(r, c);
        if (moves.length) {
          selected = { r, c };
          legalMoves = moves.map((m) => ({
            ...m,
            capture: board[m.r][m.c] !== null,
          }));
          renderBoard();
          return;
        }
      }
    }
  }
});

renderBoard();
