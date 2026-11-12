const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../engine');
const index = name => (8 - Number(name[1])) * 8 + 'abcdefgh'.indexOf(name[0]);
function fen(text) {
    const [rows, turn, rights, ep, half = '0', full = '1'] = text.split(' '), board = [];
    for (const c of rows.replaceAll('/', ''))
        if (/[1-8]/.test(c))
            board.push(...Array(Number(c)).fill(null));
        else
            board.push(c);
    return { board, turn, rights: rights === '-' ? '' : rights, ep: ep === '-' ? -1 : index(ep), half: Number(half), full: Number(full) };
}
function move(s, from, to, promotion) {
    const m = C.legal(s).find(m => m.from === index(from) && m.to === index(to) && m.promotion === promotion);
    assert.ok(m, `${from}-${to} must be legal`);
    return m;
}
function perft(s, depth) { return depth ? C.legal(s).reduce((n, m) => n + perft(C.apply(s, m), depth - 1), 0) : 1; }
test('starting position matches known move-tree counts through depth four', () => {
    const s = C.initial();
    assert.equal(s.board.length, 64);
    for (const [depth, count] of [[1, 20], [2, 400], [3, 8902], [4, 197281]])
        assert.equal(perft(s, depth), count);
});
test('Kiwipete castling and pinned-piece reference position', () => {
    const s = fen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    for (const [depth, count] of [[1, 48], [2, 2039], [3, 97862]])
        assert.equal(perft(s, depth), count);
});
test('both colors castle and input snapshots remain intact for undo', () => {
    for (const side of ['w', 'b'])
        for (const kingSide of [true, false]) {
            const s = fen(`r3k2r/8/8/8/8/8/8/R3K2R ${side} KQkq - 0 1`), snapshot = JSON.stringify(s), rank = side === 'w' ? '1' : '8';
            const m = move(s, 'e' + rank, (kingSide ? 'g' : 'c') + rank), n = C.apply(s, m);
            assert.ok(m.castle);
            assert.equal(n.board[index((kingSide ? 'f' : 'd') + rank)], side === 'w' ? 'R' : 'r');
            assert.equal(n.board[index((kingSide ? 'h' : 'a') + rank)], null);
            assert.equal(JSON.stringify(s), snapshot);
            assert.equal(C.notation(s, m), kingSide ? 'O-O' : 'O-O-O');
        }
});
test('castling forbidden from or through check', () => {
    for (const position of ['4r1k1/8/8/8/8/8/8/4K2R w K -', '5rk1/8/8/8/8/8/8/4K2R w K -'])
        assert.equal(C.legal(fen(position)).some(m => m.castle), false);
});
test('en passant works for both sides, removes the correct pawn', () => {
    for (const [position, from, to, captured] of [['4k3/8/8/3pP3/8/8/8/4K3 w - d6', 'e5', 'd6', 'd5'], ['4k3/8/8/8/3Pp3/8/8/4K3 b - d3', 'e4', 'd3', 'd4']]) {
        const s = fen(position), m = move(s, from, to), n = C.apply(s, m);
        assert.ok(m.ep);
        assert.equal(n.board[index(captured)], null);
        assert.equal(n.half, 0);
        assert.equal(n.ep, -1);
    }
});
test('en passant cannot expose own king to a rook', () => {
    const s = fen('8/8/8/4KPpr/8/8/8/4k3 w - g6');
    assert.equal(C.legal(s).some(m => m.ep), false);
});
test('promotion offers all four pieces for either color', () => {
    for (const [position, from, to] of [['4k3/P7/8/8/8/8/8/4K3 w - -', 'a7', 'a8'], ['4k3/8/8/8/8/8/p7/4K3 b - -', 'a2', 'a1']]) {
        const s = fen(position);
        assert.equal(C.legal(s).filter(m => m.from === index(from)).length, 4);
        for (const type of ['q', 'r', 'b', 'n'])
            assert.equal(C.apply(s, move(s, from, to, type)).board[index(to)].toLowerCase(), type);
    }
});
test('rook capture permanently removes the related castling right', () => {
    const s = fen('r3k2r/8/8/8/8/8/7Q/4K3 w kq -');
    const n = C.apply(s, move(s, 'h2', 'h8'));
    assert.equal(n.rights, 'q');
});
test('Fool’s mate ends on the opponent’s turn with correct SAN', () => {
    let s = C.initial();
    for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4']])
        s = C.apply(s, move(s, from, to));
    const m = move(s, 'd8', 'h4');
    assert.equal(C.notation(s, m), 'Qh4#');
    s = C.apply(s, m);
    assert.deepEqual(C.status(s), { over: true, type: 'mate', winner: 'b' });
});
test('stalemate and insufficient material are draws', () => {
    assert.equal(C.status(fen('7k/5K2/6Q1/8/8/8/8/8 b - -')).type, 'stalemate');
    assert.equal(C.status(fen('4k3/8/8/8/8/8/8/4K3 w - -')).type, 'material');
});
test('threefold repetition and fifty move rule', () => {
    let s = C.initial(), positions = [C.key(s)];
    for (let i = 0; i < 2; i++)
        for (const [from, to] of [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']]) {
            s = C.apply(s, move(s, from, to));
            positions.push(C.key(s));
        }
    assert.equal(C.status(s, positions).type, 'repetition');
    assert.equal(C.status({ ...s, half: 100 }).type, 'fifty');
});
test('AI returns legal moves without modifying the position', () => {
    for (const level of [1, 2, 3]) {
        const s = C.initial(), snapshot = JSON.stringify(s), m = C.bestMove(s, level);
        assert.ok(C.legal(s).some(x => JSON.stringify(x) === JSON.stringify(m)));
        assert.equal(JSON.stringify(s), snapshot);
    }
});
test('AI finds mate in one', () => {
    const s = fen('7k/8/5KQ1/8/8/8/8/8 w - -'), m = C.bestMove(s, 2);
    assert.equal(C.status(C.apply(s, m)).type, 'mate');
});
