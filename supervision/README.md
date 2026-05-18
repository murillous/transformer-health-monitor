# supervision/

Monorepo TypeScript + Python da stack de supervisão.

A documentação completa (arquitetura, API, WebSocket, diagnóstico fuzzy) está em **[`../docs/06-supervision.md`](../docs/06-supervision.md)**.

## Quick start

```bash
npm install
pip install -r apps/intelligence/requirements.txt
npm run dev
```

Sobe Express (:3001) + Vite (:5173). Para a stack inteira (com bridge serial), use `../scripts/start.ps1` (Windows) ou `../scripts/start.sh` (Linux/macOS) na raiz do repo.
