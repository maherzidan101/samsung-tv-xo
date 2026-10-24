// XO for Samsung TVs. Written as plain ES5 so it runs on the 2021 TV's Chrome 76 engine.
(function () {
  'use strict';

  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27, BACKSPACE: 8 };
  var LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  var TV_DELAY_MS = 600;

  var state = {
    screen: 'menu',
    mode: 'tv',          // 'tv' = you (X) vs the TV (O); 'duo' = two people sharing the remote
    menuFocus: 0,
    board: emptyBoard(),
    turn: 'X',
    starter: 'X',        // alternates every round so nobody always goes first
    focus: 4,
    over: false,
    overAt: 0,           // when the round ended; a quick double press of OK must not skip the result
    winLine: null,
    scores: { X: 0, O: 0, draw: 0 },
    round: 0             // bumped on every new round; a pending TV move from an old round is dropped
  };

  var el = {
    menu: document.getElementById('menu'),
    game: document.getElementById('game'),
    menuItems: document.querySelectorAll('.menu-item'),
    board: document.getElementById('board'),
    status: document.getElementById('status'),
    labelX: document.getElementById('label-x'),
    labelO: document.getElementById('label-o'),
    scoreX: document.getElementById('score-x'),
    scoreO: document.getElementById('score-o'),
    scoreDraw: document.getElementById('score-draw'),
    cells: []
  };

  function emptyBoard() {
    return ['', '', '', '', '', '', '', '', ''];
  }

  function emptyCells(board) {
    var out = [];
    for (var i = 0; i < 9; i++) if (board[i] === '') out.push(i);
    return out;
  }

  function findWinner(board) {
    for (var i = 0; i < LINES.length; i++) {
      var a = LINES[i][0], b = LINES[i][1], c = LINES[i][2];
      if (board[a] !== '' && board[a] === board[b] && board[a] === board[c]) {
        return { mark: board[a], line: LINES[i] };
      }
    }
    return null;
  }

  // Returns the empty cell that would complete a line of two `mark`s, or -1.
  function findFinishingCell(board, mark) {
    for (var i = 0; i < LINES.length; i++) {
      var line = LINES[i], count = 0, gap = -1;
      for (var j = 0; j < 3; j++) {
        if (board[line[j]] === mark) count++;
        else if (board[line[j]] === '') gap = line[j];
      }
      if (count === 2 && gap !== -1) return gap;
    }
    return -1;
  }

  // The TV plays sensibly but not perfectly, so a fork can still beat it.
  function chooseMove(board, me, them) {
    var win = findFinishingCell(board, me);
    if (win !== -1) return win;
    var block = findFinishingCell(board, them);
    if (block !== -1) return block;
    if (board[4] === '') return 4;
    var corners = [0, 2, 6, 8].filter(function (c) { return board[c] === ''; });
    var pool = corners.length ? corners : emptyCells(board);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function isTvTurn() {
    return state.mode === 'tv' && state.turn === 'O' && !state.over;
  }

  function place(index) {
    if (state.over || state.board[index] !== '') return;
    state.board[index] = state.turn;

    var result = findWinner(state.board);
    if (result) {
      state.over = true;
      state.winLine = result.line;
      state.scores[result.mark]++;
    } else if (emptyCells(state.board).length === 0) {
      state.over = true;
      state.scores.draw++;
    } else {
      state.turn = state.turn === 'X' ? 'O' : 'X';
    }
    if (state.over) state.overAt = Date.now();
    render();
    scheduleTvMove();
  }

  function scheduleTvMove() {
    if (!isTvTurn()) return;
    var round = state.round;
    setTimeout(function () {
      if (round !== state.round || state.screen !== 'game' || !isTvTurn()) return;
      place(chooseMove(state.board, 'O', 'X'));
      // If the TV took the highlighted square, move the highlight to the nearest free one.
      if (!state.over && state.board[state.focus] !== '') {
        state.focus = nearestEmpty(state.focus);
        render();
      }
    }, TV_DELAY_MS);
  }

  function nearestEmpty(from) {
    var free = emptyCells(state.board), best = free[0], bestDist = 99;
    for (var i = 0; i < free.length; i++) {
      var dist = Math.abs(Math.floor(free[i] / 3) - Math.floor(from / 3)) + Math.abs(free[i] % 3 - from % 3);
      if (dist < bestDist) { best = free[i]; bestDist = dist; }
    }
    return best;
  }

  function newRound() {
    state.round++;
    state.board = emptyBoard();
    state.turn = state.starter;
    state.starter = state.starter === 'X' ? 'O' : 'X';
    state.over = false;
    state.winLine = null;
    state.focus = 4;
    render();
    scheduleTvMove();
  }

  function startGame(mode) {
    state.mode = mode;
    state.scores = { X: 0, O: 0, draw: 0 };
    state.starter = 'X';
    state.screen = 'game';
    newRound();
  }

  function showMenu() {
    state.round++;
    state.screen = 'menu';
    render();
  }

  // Inside TizenBrew the game is a page TizenBrew navigated to, so going back returns to
  // TizenBrew's list. Exiting the whole TV app is only the fallback when there is no history.
  function exitApp() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    try {
      window.tizen.application.getCurrentApplication().exit();
    } catch (e) {
      // Not on a TV (desktop browser): nothing to exit.
    }
  }

  function nameOf(mark) {
    if (state.mode === 'tv') return mark === 'X' ? 'You' : 'TV';
    return 'Player ' + mark;
  }

  function statusText() {
    if (state.over) {
      var result = findWinner(state.board);
      var head = !result ? 'Draw!'
        : state.mode === 'tv' ? (result.mark === 'X' ? 'You win!' : 'TV wins!')
          : nameOf(result.mark) + ' wins!';
      return head + '<br><small>OK to play again</small>';
    }
    if (isTvTurn()) return 'TV is thinking&hellip;';
    if (state.mode === 'tv') return 'Your turn';
    return '<span class="mark-' + state.turn.toLowerCase() + '">' + nameOf(state.turn) + '</span> to play';
  }

  function render() {
    el.menu.className = 'screen' + (state.screen === 'menu' ? ' is-active' : '');
    el.game.className = 'screen' + (state.screen === 'game' ? ' is-active' : '');

    for (var m = 0; m < el.menuItems.length; m++) {
      el.menuItems[m].className = 'menu-item' + (m === state.menuFocus ? ' is-focused' : '');
    }
    if (state.screen !== 'game') return;

    for (var i = 0; i < 9; i++) {
      var mark = state.board[i];
      var cls = 'cell';
      if (mark) cls += ' is-' + mark.toLowerCase();
      if (i === state.focus && !state.over && !isTvTurn()) cls += ' is-focused';
      if (state.winLine && state.winLine.indexOf(i) !== -1) cls += ' is-win';
      el.cells[i].className = cls;
      el.cells[i].textContent = mark;
    }
    el.board.className = 'board' + (state.over ? ' is-over' : '');
    el.status.innerHTML = statusText();
    el.labelX.textContent = state.mode === 'tv' ? 'You (X)' : 'Player X';
    el.labelO.textContent = state.mode === 'tv' ? 'TV (O)' : 'Player O';
    el.scoreX.textContent = state.scores.X;
    el.scoreO.textContent = state.scores.O;
    el.scoreDraw.textContent = state.scores.draw;
  }

  function moveFocus(dx, dy) {
    var row = Math.floor(state.focus / 3), col = state.focus % 3;
    row = Math.min(2, Math.max(0, row + dy));
    col = Math.min(2, Math.max(0, col + dx));
    state.focus = row * 3 + col;
    render();
  }

  function digitFromKey(code) {
    if (code >= 49 && code <= 57) return code - 48;   // top-row / remote digits 1-9
    if (code >= 97 && code <= 105) return code - 96;  // numpad 1-9
    return 0;
  }

  function onMenuKey(code) {
    if (code === KEY.LEFT || code === KEY.UP) state.menuFocus = 0;
    else if (code === KEY.RIGHT || code === KEY.DOWN) state.menuFocus = 1;
    else if (code === KEY.ENTER) return startGame(state.menuFocus === 0 ? 'tv' : 'duo');
    else if (code === KEY.BACK || code === KEY.ESC) return exitApp();
    else return false;
    render();
  }

  function onGameKey(code) {
    if (code === KEY.BACK || code === KEY.ESC || code === KEY.BACKSPACE) return showMenu();
    if (state.over) {
      if (code === KEY.ENTER && Date.now() - state.overAt > 700) newRound();
      return;
    }
    if (isTvTurn()) return;
    if (code === KEY.LEFT) moveFocus(-1, 0);
    else if (code === KEY.RIGHT) moveFocus(1, 0);
    else if (code === KEY.UP) moveFocus(0, -1);
    else if (code === KEY.DOWN) moveFocus(0, 1);
    else if (code === KEY.ENTER) place(state.focus);
    else {
      var digit = digitFromKey(code);
      if (digit) {
        state.focus = digit - 1;
        place(state.focus);
        render();
      }
    }
  }

  function buildBoard() {
    for (var i = 0; i < 9; i++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('data-index', i);
      el.board.appendChild(cell);
      el.cells.push(cell);
    }
  }

  // Digit keys are not delivered to web apps unless registered. TizenBrew also registers the
  // keys listed in package.json; this covers the app being opened outside TizenBrew.
  function registerTvKeys() {
    var names = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    for (var i = 0; i < names.length; i++) {
      try {
        window.tizen.tvinputdevice.registerKey(names[i]);
      } catch (e) {
        // Desktop browser, or this key is already registered.
      }
    }
  }

  document.addEventListener('keydown', function (event) {
    var code = event.keyCode;
    if (state.screen === 'menu') onMenuKey(code);
    else onGameKey(code);
    if (code !== KEY.BACK) event.preventDefault();
  });

  // Mouse support, for testing on a computer.
  el.board.addEventListener('click', function (event) {
    var index = Number(event.target.getAttribute('data-index'));
    if (isNaN(index) || event.target.className.indexOf('cell') === -1) return;
    if (state.over) return newRound();
    if (isTvTurn()) return;
    state.focus = index;
    place(index);
  });
  for (var m = 0; m < el.menuItems.length; m++) {
    el.menuItems[m].addEventListener('click', function (event) {
      startGame(event.currentTarget.getAttribute('data-mode'));
    });
  }

  buildBoard();
  registerTvKeys();
  render();
}());
