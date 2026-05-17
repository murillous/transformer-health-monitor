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

router.get("/alarmes", (req, res) => {
  const { page, limit, severidade, inicio, fim, grandeza } = req.query;

  if (page || limit || severidade || inicio || fim || grandeza) {
    const result = store.consultarAlarmes({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      severidade: severidade as string | undefined,
      grandeza: grandeza as string | undefined,
      inicio: inicio ? new Date(inicio as string) : undefined,
      fim: fim ? new Date(fim as string) : undefined,
    });
    return res.json(result);
  }

  res.json(store.getAlarmes());
});

export default router;
