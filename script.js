'use strict';
const $ = id => document.getElementById(id);
const glyphs = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const names = { k: 'raja', q: 'menteri', r: 'benteng', b: 'gajah', n: 'kuda', p: 'pion' };
let state = Chess.initial(), history = [], positions = [Chess.key(state)], mode = 'computer', level = '2';
let selected = null, flipped = false, thinking = false, result, worker = null, aiTimeout = null, generation = 0, sound = false, audio = null;
const STORAGE_KEY = 'ruang-catur-v1';
let moveAnimations = [];
function cancelMoveAnimation() {
    for (const animation of moveAnimations)
        animation.cancel();
    moveAnimations = [];
}
function stopAI() {
    generation++;
    cancelMoveAnimation();
    clearTimeout(aiTimeout);
    if (worker)
        worker.terminate();
    worker = null;
    thinking = false;
}
function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ history: history.map(h => h.move), mode, level, flipped, sound }));
        $('saveStatus').textContent = 'Tersimpan di perangkat ini';
    }
    catch {
        $('saveStatus').textContent = 'Penyimpanan perangkat tidak tersedia';
    }
}
function restore() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!data)
            return;
        if (!Array.isArray(data.history) || data.history.length > 2000)
            throw new Error('Invalid save');
        const restored = [], keys = [Chess.key(state)];
        let next = state;
        for (const item of data.history) {
            const m = Chess.legal(next).find(m => m.from === item.from && m.to === item.to && m.promotion === item.promotion);
            if (!m)
                throw new Error('Invalid move');
            restored.push({ before: next, move: m, san: Chess.notation(next, m) });
            next = Chess.apply(next, m);
            keys.push(Chess.key(next));
        }
        state = next;
        history = restored;
        positions = keys;
        mode = ['computer', 'local', 'auto'].includes(data.mode) ? data.mode : 'computer';
        level = ['1', '2', '3'].includes(data.level) ? data.level : '2';
        flipped = !!data.flipped;
        sound = !!data.sound;
    }
    catch {
        state = Chess.initial();
        history = [];
        positions = [Chess.key(state)];
    }
}
function boardRender() {
    cancelMoveAnimation();
    const focused = document.activeElement?.dataset?.index, moves = selected !== null ? Chess.legal(state).filter(m => m.from === selected) : [];
    const last = history.at(-1)?.move, checked = Chess.inCheck(state) ? state.board.indexOf(state.turn === 'w' ? 'K' : 'k') : -1;
    const fragment = document.createDocumentFragment();
    for (let view = 0; view < 64; view++) {
        const i = flipped ? 63 - view : view, p = state.board[i], r = i >> 3, c = i % 8, square = document.createElement('button');
        square.type = 'button';
        square.className = `square ${(r + c) % 2 ? 'dark' : 'light'}`;
        square.dataset.index = i;
        square.setAttribute('aria-label', `${Chess.squareName(i)}${p ? ', ' + names[p.toLowerCase()] + ' ' + (Chess.color(p) === 'w' ? 'putih' : 'hitam') : ', kosong'}`);
        square.setAttribute('aria-pressed', String(selected === i));
        square.tabIndex = i === Number(focused ?? (flipped ? 7 : 56)) ? 0 : -1;
        if (last && (last.from === i || last.to === i))
            square.classList.add('last-move');
        if (selected === i)
            square.classList.add('selected');
        if (i === checked)
            square.classList.add('check');
        if (moves.some(m => m.to === i))
            square.classList.add(p || moves.some(m => m.to === i && m.ep) ? 'valid-capture' : 'valid-move');
        if (p) {
            const span = document.createElement('span');
            span.className = `piece ${Chess.color(p) === 'w' ? 'white' : 'black'}-piece`;
            span.textContent = glyphs[p];
            span.setAttribute('aria-hidden', 'true');
            square.append(span);
        }
        if (view % 8 === 0) {
            const label = document.createElement('span');
            label.className = 'coordinate rank';
            label.textContent = 8 - r;
            label.setAttribute('aria-hidden', 'true');
            square.append(label);
        }
        if (view >= 56) {
            const label = document.createElement('span');
            label.className = 'coordinate file';
            label.textContent = 'abcdefgh'[c];
            label.setAttribute('aria-hidden', 'true');
            square.append(label);
        }
        square.addEventListener('click', () => clickSquare(i));
        fragment.append(square);
    }
    $('board').replaceChildren(fragment);
    $('board').setAttribute('aria-label', `Papan catur, ${flipped ? 'hitam' : 'putih'} di bawah`);
    if (focused !== undefined)
        $('board').querySelector(`[data-index="${focused}"]`)?.focus({ preventScroll: true });
}
function renderHistory() {
    $('moveCount').textContent = history.length;
    if (!history.length) {
        $('moveList').innerHTML = '<div class="empty-history"><span>♙</span><strong>Masih banyak kemungkinan.</strong><p>Langkah pertamamu akan muncul di sini.</p></div>';
        return;
    }
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < history.length; i += 2) {
        const row = document.createElement('div');
        row.className = 'move-row';
        for (const [j, text] of [String(i / 2 + 1) + '.', history[i].san, history[i + 1]?.san || '—'].entries()) {
            const cell = document.createElement('span');
            cell.textContent = text;
            if ((j === 1 && i === history.length - 1) || (j === 2 && i + 1 === history.length - 1))
                cell.className = 'latest';
            row.append(cell);
        }
        fragment.append(row);
    }
    $('moveList').replaceChildren(fragment);
    $('moveList').scrollTop = $('moveList').scrollHeight;
}
function renderCaptured() {
    const captured = { w: [], b: [] };
    for (const h of history) {
        const p = h.move.ep ? (h.before.turn === 'w' ? 'p' : 'P') : h.before.board[h.move.to];
        if (p)
            captured[h.before.turn].push(p);
    }
    for (const [side, id] of [['w', 'White'], ['b', 'Black']]) {
        $('captured' + id).textContent = captured[side].sort((a, b) => Chess.values[b.toLowerCase()] - Chess.values[a.toLowerCase()]).map(p => glyphs[p]).join('');
        const material = state.board.reduce((v, p) => v + (p ? (Chess.color(p) === side ? 1 : -1) * Chess.values[p.toLowerCase()] : 0), 0) / 100;
        $(id.toLowerCase() + 'Score').textContent = material > 0 ? '+' + Number(material.toFixed(2)) : '';
    }
}
function renderInfo() {
    result = Chess.status(state, positions);
    $('blackName').textContent = mode === 'local' ? 'Pemain hitam' : 'Komputer' + (mode === 'auto' ? ' · Hitam' : '');
    $('whiteName').textContent = mode === 'computer' ? 'Kamu' : mode === 'local' ? 'Pemain putih' : 'Komputer · Putih';
    for (const [side, id] of [['w', 'white'], ['b', 'black']]) {
        const active = state.turn === side && !result.over;
        $(id + 'Player').classList.toggle('active', active);
        $(id + 'State').textContent = result.over ? 'SELESAI' : active ? (thinking ? 'BERPIKIR…' : 'GILIRAN BERMAIN') : 'MENUNGGU';
    }
    let title = thinking ? 'Komputer sedang berpikir…' : `Giliran ${state.turn === 'w' ? 'putih' : 'hitam'}`, detail = 'Pilih bidak untuk melihat langkah yang tersedia.';
    if (mode === 'auto' && !result.over)
        detail = 'Dua komputer, satu papan. Amati strategi mereka.';
    if (result.check && !thinking) {
        title += ' · Skak!';
        detail = 'Rajamu terancam. Pilih langkah yang melindunginya.';
    }
    if (result.over) {
        title = result.type === 'mate' ? `Skakmat! ${result.winner === 'w' ? 'Putih' : 'Hitam'} menang.` : 'Permainan remis.';
        detail = { mate: 'Permainan yang baik. Siap mencoba strategi baru?', stalemate: 'Pat: tidak ada langkah sah, raja tidak sedang skak.', fifty: '50 langkah tanpa gerakan pion atau tangkapan.', repetition: 'Posisi yang sama terjadi tiga kali.', material: 'Material tidak cukup untuk menghasilkan skakmat.' }[result.type];
    }
    $('currentTurn').textContent = title;
    $('statusDetail').textContent = detail;
    $('statusIcon').textContent = result.over ? '⚑' : thinking ? '◌' : '✦';
    $('undoBtn').disabled = !history.length;
    $('exportBtn').disabled = !history.length;
    $('difficultyGroup').hidden = mode === 'local';
    $('soundBtn').setAttribute('aria-pressed', String(sound));
    $('soundBtn').setAttribute('aria-label', sound ? 'Matikan suara' : 'Aktifkan suara');
    $('soundBtn').querySelector('span').textContent = sound ? 'Suara aktif' : 'Suara mati';
}
function render() { renderInfo(); boardRender(); renderHistory(); renderCaptured(); }
function playSound(capture = false) {
    if (!sound)
        return;
    try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        audio.resume();
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(capture ? 320 : 520, audio.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(180, audio.currentTime + .09);
        gain.gain.setValueAtTime(.07, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .12);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + .13);
    }
    catch { }
}
function animateComputerMove(move, before) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        return Promise.resolve();
    const steps = [{ from: move.from, to: move.to }];
    if (move.castle)
        steps.push({ from: move.to > move.from ? move.from + 3 : move.from - 4, to: (move.from + move.to) / 2 });
    const animations = steps.map(step => {
        const origin = $('board').querySelector(`[data-index="${step.from}"]`);
        const target = $('board').querySelector(`[data-index="${step.to}"]`);
        const piece = target?.querySelector('.piece');
        if (!origin || !piece || !piece.animate)
            return Promise.resolve();
        const start = origin.getBoundingClientRect(), end = target.getBoundingClientRect();
        const finalGlyph = piece.textContent;
        piece.textContent = glyphs[before.board[step.from]];
        target.classList.add('moving-square');
        const animation = piece.animate([
            { transform: `translate(${start.left - end.left}px, ${start.top - end.top}px)` },
            { transform: 'translate(0, 0)' }
        ], { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        moveAnimations.push(animation);
        return animation.finished.catch(() => {}).finally(() => {
            piece.textContent = finalGlyph;
            target.classList.remove('moving-square');
            moveAnimations = moveAnimations.filter(item => item !== animation);
        });
    });
    return Promise.all(animations);
}
function commit(move, computerMove = false) {
    const actual = Chess.legal(state).find(m => m.from === move.from && m.to === move.to && m.promotion === move.promotion);
    if (!actual)
        return;
    const before = state, id = generation;
    history.push({ before: state, move: actual, san: Chess.notation(state, actual) });
    const capture = !!state.board[actual.to] || actual.ep;
    state = Chess.apply(state, actual);
    positions.push(Chess.key(state));
    selected = null;
    render();
    save();
    playSound(capture);
    if (computerMove)
        animateComputerMove(actual, before).then(() => { if (id === generation) scheduleAI(); });
    else
        scheduleAI();
}
function clickSquare(i) {
    if (moveAnimations.length || thinking || result.over || mode === 'auto' || mode === 'computer' && state.turn === 'b')
        return;
    if (i === selected) {
        selected = null;
        boardRender();
        return;
    }
    if (selected !== null) {
        const moves = Chess.legal(state).filter(m => m.from === selected && m.to === i);
        if (moves.length) {
            if (moves.length > 1)
                promote(moves);
            else
                commit(moves[0]);
            return;
        }
    }
    selected = Chess.color(state.board[i]) === state.turn ? i : null;
    boardRender();
}
function promote(moves) {
    const fragment = document.createDocumentFragment();
    for (const m of moves) {
        const button = document.createElement('button');
        button.textContent = glyphs[state.turn === 'w' ? m.promotion.toUpperCase() : m.promotion];
        button.setAttribute('aria-label', names[m.promotion]);
        button.addEventListener('click', () => { $('promotionDialog').close(); commit(m); });
        fragment.append(button);
    }
    $('promotionOptions').replaceChildren(fragment);
    $('promotionDialog').showModal();
}
function scheduleAI() {
    if (result.over || thinking || moveAnimations.length || !(mode === 'auto' || mode === 'computer' && state.turn === 'b'))
        return;
    thinking = true;
    renderInfo();
    const id = ++generation, snapshot = state;
    function finish(move) { if (id !== generation)
        return; if (worker)
        worker.terminate(); worker = null; thinking = false; if (move)
        commit(move, true);
    else {
        renderInfo();
        $('statusDetail').textContent = 'Komputer tidak dapat melanjutkan. Urungkan langkah atau mulai permainan baru.';
    } }
    aiTimeout = setTimeout(() => {
        if (id !== generation)
            return;
        try {
            worker = new Worker('ai-worker.js');
            worker.onmessage = event => { if (event.data.id === id)
                finish(event.data.move); };
            worker.onerror = () => { if (id === generation)
                finish(Chess.bestMove(snapshot, level, 700)); };
            worker.postMessage({ id, state: snapshot, level });
        }
        catch {
            finish(Chess.bestMove(snapshot, level, 700));
        }
    }, 300);
}
function reset() { stopAI(); state = Chess.initial(); history = []; positions = [Chess.key(state)]; selected = null; render(); save(); scheduleAI(); }
function requestReset() { if (history.length)
    $('newGameDialog').showModal();
else
    reset(); }
$('resetBtn').addEventListener('click', requestReset);
$('confirmReset').addEventListener('click', () => { $('newGameDialog').close(); mode = $('gameMode').value; reset(); });
$('cancelReset').addEventListener('click', () => { $('newGameDialog').close(); $('gameMode').value = mode; });
$('newGameDialog').addEventListener('cancel', () => { $('gameMode').value = mode; });
$('gameMode').addEventListener('change', () => { if (history.length)
    $('newGameDialog').showModal();
else {
    mode = $('gameMode').value;
    reset();
} });
$('difficulty').addEventListener('change', () => { level = $('difficulty').value; stopAI(); save(); renderInfo(); scheduleAI(); });
$('undoBtn').addEventListener('click', () => {
    stopAI();
    if (!history.length)
        return;
    let count = mode === 'computer' && state.turn === 'w' && history.length >= 2 ? 2 : 1;
    while (count-- && history.length) {
        state = history.pop().before;
        positions.pop();
    }
    selected = null;
    render();
    save();
    if (mode !== 'auto')
        scheduleAI();
    else
        $('statusDetail').textContent = 'Pemutaran dijeda. Ubah tingkat kesulitan untuk melanjutkan.';
});
$('flipBtn').addEventListener('click', () => { flipped = !flipped; boardRender(); save(); });
$('soundBtn').addEventListener('click', () => { sound = !sound; renderInfo(); save(); if (sound)
    playSound(); });
$('board').addEventListener('keydown', event => {
    const button = event.target.closest('[data-index]');
    if (!button)
        return;
    if (event.key === 'Escape') {
        selected = null;
        boardRender();
        return;
    }
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
    if (!(event.key in steps))
        return;
    event.preventDefault();
    const i = Number(button.dataset.index), view = flipped ? 63 - i : i, step = steps[event.key], next = view + step;
    if (next < 0 || next >= 64 || Math.abs(step) === 1 && (next >> 3) !== (view >> 3))
        return;
    button.tabIndex = -1;
    const target = $('board').querySelector(`[data-index="${flipped ? 63 - next : next}"]`);
    target.tabIndex = 0;
    target.focus();
});
$('exportBtn').addEventListener('click', () => {
    const outcome = result.over ? (result.winner ? (result.winner === 'w' ? '1-0' : '0-1') : '1/2-1/2') : '*';
    const text = ['[Event "Ruang Catur"]', '[Site "Local"]', `[White "${$('whiteName').textContent}"]`, `[Black "${$('blackName').textContent}"]`, `[Result "${outcome}"]`, '', history.map((h, i) => (i % 2 === 0 ? `${i / 2 + 1}. ` : '') + h.san).join(' ') + ' ' + outcome].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' })), a = document.createElement('a');
    a.href = url;
    a.download = 'ruang-catur.pgn';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});
restore();
$('gameMode').value = mode;
$('difficulty').value = level;
render();
scheduleAI();
