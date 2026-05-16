# 📚 Documentação do Projeto

Documentação técnica e operacional para a equipe. Comece pelo `01-setup.md` se for sua primeira vez no projeto.

---

## Para começar

| Documento | Quando ler |
|---|---|
| [`01-setup.md`](./01-setup.md) | Primeira coisa ao entrar no projeto — instalação do ambiente |
| [`02-arquitetura.md`](./02-arquitetura.md) | Antes de mexer em qualquer código do firmware |
| [`03-mqtt.md`](./03-mqtt.md) | Antes de trabalhar em IoT, broker ou tópicos |
| [`04-padroes-codigo.md`](./04-padroes-codigo.md) | Antes do primeiro commit — convenções da equipe |
| [`ROADMAP.md`](./ROADMAP.md) | Status atual do projeto e o que falta fazer |

---

## Documentação técnica formal

| Documento | Conteúdo |
|---|---|
| [`projeto_transformador.pdf`](./projeto_transformador.pdf) | Versão compilada do documento técnico |

---

## Por onde começar conforme seu papel

**P1 — Hardware:** `01-setup.md` → `ROADMAP.md` (seção Hardware)  
**P2 — Firmware Base:** `01-setup.md` → `02-arquitetura.md` → `04-padroes-codigo.md`  
**P3 — DSP & Algoritmos:** `02-arquitetura.md` (módulo `sct013`) → `ROADMAP.md`  
**P4 — IoT & MQTT:** `03-mqtt.md` → `02-arquitetura.md` (módulo `publicador`)  
**P5 — IHM Python:** `03-mqtt.md` (formato dos payloads) → `ROADMAP.md` (seção IHM)  
**P6 — Diagnóstico & Docs:** todos os documentos