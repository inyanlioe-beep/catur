/* Pure chess rules shared by the UI, AI worker, and Node tests. */
(function (root) {
    'use strict';
    const opposite = c => c === 'w' ? 'b' : 'w';
    const color = p => p ? (p === p.toUpperCase() ? 'w' : 'b') : null;
    const squareName = i => 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8));
    function initial() {
        return { board: Array.from('rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR', p => p === '.' ? null : p), turn: 'w', rights: 'KQkq', ep: -1, half: 0, full: 1 };
    }
    function attacked(s, target, by) {
        const tr = target >> 3, tc = target % 8;
        for (let i = 0; i < 64; i++) {
            const p = s.board[i];
            if (color(p) !== by)
                continue;
            const dr = tr - (i >> 3), dc = tc - i % 8, type = p.toLowerCase();
            if (type === 'p' && dr === (by === 'w' ? -1 : 1) && Math.abs(dc) === 1)
                return true;
            if (type === 'n' && Math.abs(dr) * Math.abs(dc) === 2)
                return true;
            if (type === 'k' && Math.max(Math.abs(dr), Math.abs(dc)) === 1)
                return true;
            if (((type === 'b' || type === 'q') && Math.abs(dr) === Math.abs(dc) && dr !== 0) || ((type === 'r' || type === 'q') && ((dr === 0) !== (dc === 0)))) {
                const rr = Math.sign(dr), cc = Math.sign(dc);
                let r = (i >> 3) + rr, c = i % 8 + cc;
                while (r !== tr || c !== tc) {
                    if (s.board[r * 8 + c])
                        break;
                    r += rr;
                    c += cc;
                }
                if (r === tr && c === tc)
                    return true;
            }
        }
        return false;
    }
    function inCheck(s, side = s.turn) {
        const king = s.board.indexOf(side === 'w' ? 'K' : 'k');
        return king < 0 || attacked(s, king, opposite(side));
    }
    function apply(s, m) {
        const n = { ...s, board: s.board.slice(), ep: -1 }, p = n.board[m.from], taken = n.board[m.to];
        n.board[m.from] = null;
        n.board[m.to] = m.promotion ? (s.turn === 'w' ? m.promotion.toUpperCase() : m.promotion) : p;
        if (m.ep)
            n.board[m.to + (s.turn === 'w' ? 8 : -8)] = null;
        if (m.castle) {
            const rook = m.to > m.from ? m.from + 3 : m.from - 4;
            n.board[(m.from + m.to) / 2] = n.board[rook];
            n.board[rook] = null;
        }
        if (p === 'K')
            n.rights = n.rights.replace(/[KQ]/g, '');
        if (p === 'k')
            n.rights = n.rights.replace(/[kq]/g, '');
        for (const [i, right] of [[0, 'q'], [7, 'k'], [56, 'Q'], [63, 'K']])
            if (m.from === i || m.to === i)
                n.rights = n.rights.replace(right, '');
        if (p.toLowerCase() === 'p' && Math.abs(m.to - m.from) === 16)
            n.ep = (m.to + m.from) / 2;
        n.half = p.toLowerCase() === 'p' || taken || m.ep ? 0 : s.half + 1;
        n.full = s.full + (s.turn === 'b' ? 1 : 0);
        n.turn = opposite(s.turn);
        return n;
    }
    function legal(s) {
        const moves = [], inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
        function add(from, to, extra = {}) {
            const target = s.board[to];
            if (target && (color(target) === s.turn || target.toLowerCase() === 'k'))
                return;
            if (s.board[from].toLowerCase() === 'p' && (to < 8 || to >= 56))
                for (const promotion of ['q', 'r', 'b', 'n'])
                    moves.push({ from, to, ...extra, promotion });
            else
                moves.push({ from, to, ...extra });
        }
        for (let from = 0; from < 64; from++) {
            const p = s.board[from];
            if (color(p) !== s.turn)
                continue;
            const r = from >> 3, c = from % 8, type = p.toLowerCase();
            if (type === 'p') {
                const d = s.turn === 'w' ? -1 : 1, next = from + d * 8;
                if (inside(r + d, c) && !s.board[next]) {
                    add(from, next);
                    if (r === (s.turn === 'w' ? 6 : 1) && !s.board[next + d * 8])
                        add(from, next + d * 8);
                }
                for (const dc of [-1, 1])
                    if (inside(r + d, c + dc)) {
                        const to = next + dc;
                        if (s.board[to] && color(s.board[to]) !== s.turn)
                            add(from, to);
                        else if (!s.board[to] && to === s.ep && s.board[to - d * 8] === (s.turn === 'w' ? 'p' : 'P'))
                            add(from, to, { ep: true });
                    }
            }
            else {
                const dirs = type === 'n' ? [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] : [...('rqk'.includes(type) ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : []), ...('bqk'.includes(type) ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [])];
                for (const [dr, dc] of dirs)
                    for (let step = 1; step <= ('nk'.includes(type) ? 1 : 7); step++) {
                        const nr = r + dr * step, nc = c + dc * step;
                        if (!inside(nr, nc))
                            break;
                        const to = nr * 8 + nc;
                        add(from, to);
                        if (s.board[to])
                            break;
                    }
                const home = s.turn === 'w' ? 60 : 4;
                if (type === 'k' && from === home && !inCheck(s))
                    for (const kingSide of [true, false]) {
                        const right = s.turn === 'w' ? (kingSide ? 'K' : 'Q') : (kingSide ? 'k' : 'q');
                        const direction = kingSide ? 1 : -1, rook = home + (kingSide ? 3 : -4);
                        if (s.rights.includes(right) && s.board[rook] === (s.turn === 'w' ? 'R' : 'r') && (kingSide ? [1, 2] : [-1, -2, -3]).every(d => !s.board[home + d]) && [1, 2].every(d => !attacked(s, home + d * direction, opposite(s.turn))))
                            add(from, home + 2 * direction, { castle: true });
                    }
            }
        }
        return moves.filter(m => !inCheck(apply(s, m), s.turn));
    }
    function key(s) {
        const ep = s.ep !== -1 && legal(s).some(m => m.ep) ? s.ep : -1;
        return s.board.map(p => p || '.').join('') + s.turn + s.rights + ep;
    }
    function status(s, positions = []) {
        const moves = legal(s), check = inCheck(s);
        if (!moves.length)
            return { over: true, type: check ? 'mate' : 'stalemate', winner: check ? opposite(s.turn) : null };
        if (s.half >= 100)
            return { over: true, type: 'fifty' };
        if (positions.filter(k => k === key(s)).length >= 3)
            return { over: true, type: 'repetition' };
        const men = s.board.map((p, i) => ({ p, i })).filter(x => x.p && x.p.toLowerCase() !== 'k');
        if (!men.length || (men.length === 1 && 'bn'.includes(men[0].p.toLowerCase())) || (men.length > 0 && men.every(x => x.p.toLowerCase() === 'b') && new Set(men.map(x => ((x.i >> 3) + x.i % 8) % 2)).size === 1))
            return { over: true, type: 'material' };
        return { over: false, check };
    }
    function notation(s, m, moves = legal(s)) {
        let text;
        const p = s.board[m.from], type = p.toLowerCase(), capture = s.board[m.to] || m.ep;
        if (m.castle)
            text = m.to > m.from ? 'O-O' : 'O-O-O';
        else {
            let dis = '';
            if (type !== 'p') {
                const others = moves.filter(x => x.to === m.to && x.from !== m.from && s.board[x.from] === p);
                if (others.length)
                    dis = others.every(x => x.from % 8 !== m.from % 8) ? squareName(m.from)[0] : others.every(x => (x.from >> 3) !== (m.from >> 3)) ? squareName(m.from)[1] : squareName(m.from);
            }
            text = (type === 'p' ? (capture ? squareName(m.from)[0] : '') : p.toUpperCase() + dis) + (capture ? 'x' : '') + squareName(m.to) + (m.promotion ? '=' + m.promotion.toUpperCase() : '');
        }
        const n = apply(s, m);
        if (inCheck(n))
            text += legal(n).length ? '+' : '#';
        return text;
    }
    const values = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };
    function evaluate(s) {
        let score = 0;
        s.board.forEach((p, i) => { if (!p)
            return; const r = i >> 3, c = i % 8, t = p.toLowerCase(), center = 7 - Math.abs(3.5 - r) - Math.abs(3.5 - c); const advance = color(p) === 'w' ? 6 - r : r - 1; score += (color(p) === 'w' ? 1 : -1) * (values[t] + ('nbq'.includes(t) ? center * 7 : 0) + (t === 'p' ? advance * 7 : 0)); });
        return score * (s.turn === 'w' ? 1 : -1);
    }
    function bestMove(s, level = 2, limit = 1400) {
        const deadline = Date.now() + limit, rootMoves = legal(s);
        let chosen = rootMoves[0], nodes = 0;
        const priority = (state, m) => (values[(state.board[m.to] || '').toLowerCase()] || 0) + (m.promotion ? 800 : 0);
        const order = (state, moves) => moves.sort((a, b) => priority(state, b) - priority(state, a));
        function search(state, depth, alpha, beta, ply) {
            if ((++nodes & 127) === 0 && Date.now() > deadline)
                throw new Error('time');
            const moves = legal(state);
            if (!moves.length)
                return inCheck(state) ? -100000 + ply : 0;
            if (state.half >= 100)
                return 0;
            if (depth === 0)
                return evaluate(state);
            let best = -Infinity;
            for (const m of order(state, moves)) {
                const v = -search(apply(state, m), depth - 1, -beta, -alpha, ply + 1);
                best = Math.max(best, v);
                alpha = Math.max(alpha, v);
                if (alpha >= beta)
                    break;
            }
            return best;
        }
        for (let depth = 1; depth <= Number(level); depth++) {
            let next = chosen, best = -Infinity, alpha = -Infinity;
            try {
                for (const m of order(s, rootMoves.slice())) {
                    const score = -search(apply(s, m), depth - 1, -Infinity, -alpha, 1);
                    if (score > best) {
                        best = score;
                        next = m;
                    }
                    alpha = Math.max(alpha, score);
                }
                chosen = next;
            }
            catch {
                break;
            }
        }
        return chosen || null;
    }
    const api = { initial, opposite, color, squareName, attacked, inCheck, apply, legal, key, status, notation, bestMove, values };
    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
    else
        root.Chess = api;
})(globalThis);
