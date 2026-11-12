importScripts('engine.js');
self.onmessage = ({ data }) => {
    try {
        self.postMessage({ id: data.id, move: Chess.bestMove(data.state, data.level) });
    }
    catch {
        self.postMessage({ id: data.id, move: null });
    }
};
