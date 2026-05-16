import { Router } from "express";
import { store } from "../db/store";

const router = Router();

router.get("/", (req, res) => {
  const { inicio, fim, topico } = req.query;

  if (inicio && fim) {
    const data = store.registrosPorPeriodo(
      new Date(inicio as string),
      new Date(fim as string)
    );
    return res.json(data);
  }

  res.json(store.historico(topico as string | undefined));
});

router.get("/alarmes", (_req, res) => {
  res.json(store.getAlarmes());
});

export default router;
