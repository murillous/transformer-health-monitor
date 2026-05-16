import express from "express";
import historicoRouter from "./api/historico";
import relatorioRouter from "./api/relatorio";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/historico", historicoRouter);
app.use("/api/relatorio", relatorioRouter);

app.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
});
