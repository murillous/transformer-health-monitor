#!/usr/bin/env python3
"""
Módulo de Inteligência e Diagnóstico Técnico
---------------------------------------------
Sistema de inferência fuzzy para diagnóstico de transformadores de potência.
Toda a análise numérica (regressão, correlação, z-score, Arrhenius) roda aqui
via NumPy. O processo roda como daemon persistente (stdin/stdout loop).

Formato de entrada (stdin — uma linha JSON por ciclo):
  {
    "timestamp": 1234567890,
    "leituras": {
      "temperatura": 55.0, "delta_t": 8.0,
      "vibracao_120hz": 0.08, "vibracao_240hz": 0.04,
      "corrente_primario": 2.8, "corrente_secundario": 22.0,
      "inrush": 0
    },
    "series": {
      "temperatura":        [[ts, val], ...],
      "delta_t":            [[ts, val], ...],
      "corrente_primario":  [[ts, val], ...],
      "corrente_secundario":[[ts, val], ...],
      "vibracao_120hz":     [[ts, val], ...],
      "vibracao_240hz":     [[ts, val], ...]
    }
  }

Formato de saída (stdout — uma linha JSON por ciclo):
  {
    "timestamp": 1234567890,
    "risco_operacional": { "score": 45.2, "nivel": "moderado", ... },
    "urgencia_intervencao": { "score": 30.0, "nivel": "media" },
    "vida_residual": { "consumido": 3.2, "taxa_atual": 0.5 },
    "tendencias": [...], "predicoes": [...], "baseline": {...},
    "diagnosticos": [...], "grandezas_criticas": [], "severidade_geral": "ok"
  }
"""

import json
import sys
import numpy as np
from fuzzy_engine import (
    LeftEdge,
    RightEdge,
    Trapezoid,
    Triangle,
    FuzzyVariable,
    FuzzyInferenceSystem,
)

TOPICOS = {
    "temperatura": "Temperatura do Núcleo",
    "delta_t": "ΔT (Gradiente Térmico)",
    "vibracao_120hz": "Vibração 120Hz",
    "vibracao_240hz": "Vibração 240Hz (Harmônicos)",
    "corrente_primario": "Corrente do Primário",
    "corrente_secundario": "Corrente do Secundário",
    "inrush": "Pico de Inrush",
}

NIVEIS = {0: "baixo", 25: "moderado", 50: "alto", 75: "critico"}


def _nivel(score):
    for limiar in sorted(NIVEIS.keys(), reverse=True):
        if score >= limiar:
            return NIVEIS[limiar]
    return "baixo"


def _nivel_urgencia(score):
    if score >= 65:
        return "alta"
    if score >= 30:
        return "media"
    return "baixa"


# ─────────────────────────────────────────────
# Limiares físicos (espelhados do constants.ts)
# ─────────────────────────────────────────────
LIMIARES = {
    "temperatura":    {"critico": 85,  "aviso": 65},
    "delta_t":        {"critico": 30,  "aviso": 18},
    "vibracao_120hz": {"critico": 11,  "aviso": 7},
    "vibracao_240hz": {"critico": 7,   "aviso": 3.5},
}

# ─────────────────────────────────────────────
# Arrhenius — estado persistente entre ciclos
# ─────────────────────────────────────────────
_vida_consumida: float = 0.0
_ultimo_ts_vida: float = 0.0
_TEMP_REF = 80.0


def _aging_rate(temp_c: float) -> float:
    if temp_c <= 40:
        return 0.001
    return float(2 ** ((temp_c - _TEMP_REF) / 10))


def _update_arrhenius(temp_atual: float, agora: float) -> dict:
    global _vida_consumida, _ultimo_ts_vida
    if _ultimo_ts_vida > 0 and temp_atual > 0:
        dt_h = (agora - _ultimo_ts_vida) / 3600
        _vida_consumida = min(1.0, _vida_consumida + dt_h * _aging_rate(temp_atual) * 0.0002)
    if _ultimo_ts_vida == 0 and temp_atual > 0:
        _vida_consumida = 0.02
    _ultimo_ts_vida = agora
    return {
        "consumido": round(min(100.0, _vida_consumida * 1000) / 10, 1),
        "taxa_atual": round(_aging_rate(temp_atual) * 1000) / 1000,
    }


# ─────────────────────────────────────────────
# Análise de séries temporais (NumPy)
# series: [[timestamp_s, valor], ...]
# ─────────────────────────────────────────────

def _linear_regression(series: list) -> dict:
    if len(series) < 4:
        return {"inclinacao": 0.0, "r2": 0.0}
    pts = np.array(series, dtype=float)
    xs, ys = pts[:, 0], pts[:, 1]
    coeffs = np.polyfit(xs, ys, 1)
    y_hat = np.polyval(coeffs, xs)
    ss_res = float(np.sum((ys - y_hat) ** 2))
    ss_tot = float(np.sum((ys - np.mean(ys)) ** 2))
    r2 = max(0.0, 1.0 - ss_res / ss_tot) if ss_tot > 1e-10 else 0.0
    return {"inclinacao": round(float(coeffs[0]) * 3600, 4), "r2": round(r2, 4)}


def _calc_tendencias(series: dict) -> list:
    metricas = [
        ("temperatura",         "Temperatura",   "°C/h"),
        ("delta_t",             "ΔT",            "°C/h"),
        ("corrente_primario",   "Corrente P",    "A/h"),
        ("corrente_secundario", "Corrente S",    "A/h"),
        ("vibracao_120hz",      "Vibração 120Hz","g/h"),
        ("vibracao_240hz",      "Vibração 240Hz","g/h"),
    ]
    result = []
    for grandeza, label, unidade in metricas:
        pts = series.get(grandeza, [])
        if len(pts) < 4:
            result.append({"grandeza": grandeza, "label": label, "unidade": unidade,
                           "inclinacao": 0.0, "direcao": "estavel", "aceleracao": "constante"})
            continue
        trend = _linear_regression(pts)
        incl = trend["inclinacao"]
        direcao = "estavel" if abs(incl) < 0.1 else ("subindo" if incl > 0 else "descendo")
        mid = len(pts) // 2
        dif = _linear_regression(pts[mid:])["inclinacao"] - _linear_regression(pts[:mid])["inclinacao"]
        aceleracao = "constante" if abs(dif) < 0.05 else ("acelerando" if dif > 0 else "desacelerando")
        result.append({"grandeza": grandeza, "label": label, "unidade": unidade,
                       "inclinacao": round(incl, 2), "direcao": direcao, "aceleracao": aceleracao})
    return result


def _calc_predicoes(series: dict) -> list:
    checks = [
        ("temperatura", "Temperatura", LIMIARES["temperatura"]["critico"], "critico"),
        ("temperatura", "Temperatura", LIMIARES["temperatura"]["aviso"],   "aviso"),
        ("delta_t",     "ΔT",          LIMIARES["delta_t"]["critico"],     "critico"),
        ("delta_t",     "ΔT",          LIMIARES["delta_t"]["aviso"],       "aviso"),
    ]
    result = []
    for grandeza, label, threshold, alarme_em in checks:
        pts = series.get(grandeza, [])
        trend = _linear_regression(pts)
        if trend["inclinacao"] > 0.3 and trend["r2"] > 0.3:
            valor_atual = float(pts[-1][1]) if pts else 0.0
            dif = threshold - valor_atual
            if dif > 0:
                minutos = round((dif / trend["inclinacao"]) * 60)
                if minutos < 120:
                    result.append({
                        "grandeza": grandeza, "label": label,
                        "valor_atual": valor_atual, "tendencia": "subindo",
                        "inclinacao": round(trend["inclinacao"], 1),
                        "tempo_para_alarme": minutos, "alarme_em": alarme_em,
                    })
    return result


def _calc_correlacao_cv(series: dict) -> float:
    pts_c = series.get("corrente_primario", [])
    pts_v = series.get("vibracao_120hz", [])
    if not pts_c or not pts_v:
        return 0.0
    cutoff = pts_c[-1][0] - 20
    rec_c = [p[1] for p in pts_c if p[0] > cutoff]
    rec_v = [p[1] for p in pts_v if p[0] > cutoff]
    if len(rec_c) < 3 or len(rec_v) < 3:
        return 0.0
    if np.mean(rec_c) <= 3.5 or np.mean(rec_v) <= 0.12:
        return 0.0
    n = min(len(rec_c), len(rec_v))
    both = sum(1 for i in range(n) if rec_c[i] > 3.5 and rec_v[i] > 0.12)
    return float(min(100, round(both / n * 100)))


def _get_baselines(series: dict) -> dict:
    result = {}
    for grandeza, pts in series.items():
        if len(pts) < 10:
            continue
        vals = np.array([p[1] for p in pts], dtype=float)
        result[grandeza] = {"media": round(float(np.mean(vals)), 2),
                             "std":   round(float(np.std(vals)),  2)}
    return result


def _calc_z_scores(leituras: dict, baselines: dict) -> dict:
    mapa = {"temperatura": "z_temperatura", "delta_t": "z_delta_t",
            "corrente_primario": "z_corrente_p", "vibracao_120hz": "z_vib120"}
    z = {}
    for grandeza, chave in mapa.items():
        bl = baselines.get(grandeza)
        val = leituras.get(grandeza) or 0.0
        z[chave] = round((val - bl["media"]) / bl["std"], 1) if bl and bl["std"] > 0 else 0.0
    return z


def _detectar_eficiencia_anomala(delta_t: float, tendencias: list):
    t_dt  = next((t for t in tendencias if t["grandeza"] == "delta_t"), None)
    t_cs  = next((t for t in tendencias if t["grandeza"] == "corrente_secundario"), None)
    if not t_dt or not t_cs:
        return None
    if not (t_dt["inclinacao"] > 1.0 and abs(t_cs["inclinacao"]) < 1.0
            and delta_t > LIMIARES["delta_t"]["aviso"]):
        return None
    return {
        "tipo": "eficiencia_anomala", "severidade": "aviso",
        "titulo": "Anomalia de Eficiência",
        "mensagem": "ΔT subindo sem aumento proporcional de carga — possível perda no núcleo, conexões frouxas ou refrigeração comprometida.",
        "recomendacao": "Inspecionar conexões/aperto das chapas do núcleo, verificar fluxo de óleo/ar de refrigeração e analisar perdas a vazio.",
        "grandeza": "delta_t", "valor_atual": delta_t,
    }


def _built_system():
    fsis = FuzzyInferenceSystem()

    # --- Input: Temperature (0-120 °C) ---
    # Recalibrado p/ baseline operacional ~55°C ser "normal" full.
    # LIMITES.temperatura: aviso=70, critico=85.
    temperatura = (
        FuzzyVariable("temperatura", 0, 120)
        .add_term("normal", LeftEdge(55, 65))
        .add_term("morna", Trapezoid(60, 68, 72, 78))
        .add_term("quente", Trapezoid(72, 78, 82, 88))
        .add_term("critica", RightEdge(85, 95))
    )

    # --- Input: Delta-T (0-40 °C) ---
    delta_t = (
        FuzzyVariable("delta_t", 0, 40)
        .add_term("normal", LeftEdge(8, 12))
        .add_term("elevado", Trapezoid(10, 14, 18, 22))
        .add_term("alto", Trapezoid(20, 24, 28, 32))
        .add_term("severo", RightEdge(30, 36))
    )

    # --- Input: Vibration 120Hz (0-1.0 g) ---
    # Recalibrado: escala g pequena (firmware publica em g via MPU6050+FFT).
    # Limiares batem com packages/shared/src/constants.ts::LIMITES.vibracao120hz
    # (aviso=0.20, critico=0.45).
    vib120 = (
        FuzzyVariable("vibracao_120hz", 0, 1.0)
        .add_term("normal", LeftEdge(0.10, 0.18))
        .add_term("moderada", Trapezoid(0.15, 0.22, 0.30, 0.40))
        .add_term("forte", Trapezoid(0.35, 0.45, 0.55, 0.65))
        .add_term("severa", RightEdge(0.55, 0.75))
    )

    # --- Input: Vibration 240Hz (0-0.5 g) ---
    # LIMITES.vibracao240hz: aviso=0.10, critico=0.25.
    vib240 = (
        FuzzyVariable("vibracao_240hz", 0, 0.5)
        .add_term("normal", LeftEdge(0.05, 0.10))
        .add_term("moderada", Trapezoid(0.08, 0.12, 0.18, 0.22))
        .add_term("alta", RightEdge(0.20, 0.30))
    )

    # --- Input: Primary Current (0-10 A/Vrms) ---
    # Baseline ~2.8 A = "normal" full. LIMITES.correntePrimario: aviso=4.0, critico=6.0.
    corrente_p = (
        FuzzyVariable("corrente_primario", 0, 10)
        .add_term("normal", LeftEdge(3.0, 3.8))
        .add_term("elevada", Trapezoid(3.5, 4.2, 4.8, 5.2))
        .add_term("alta", Trapezoid(4.8, 5.5, 6.0, 6.8))
        .add_term("sobrecarga", RightEdge(6.5, 8.0))
    )

    # --- Input: Secondary Current (0-60 A) ---
    # Baseline ~22 A = "normal" full. LIMITES.correnteSecundario: aviso=30, critico=45.
    corrente_s = (
        FuzzyVariable("corrente_secundario", 0, 60)
        .add_term("normal", LeftEdge(22, 28))
        .add_term("elevada", Trapezoid(25, 32, 38, 42))
        .add_term("alta", Trapezoid(38, 44, 48, 52))
        .add_term("sobrecarga", RightEdge(50, 56))
    )

    # --- Input: Inrush Peak (0-10 A/Vpico) ---
    # Pico de magnetizacao. LIMITES.inrushPrimario: aviso=1.5, critico=3.0.
    # Quando nao ha evento de inrush recente, valor cai pra 0 -> "ausente".
    inrush = (
        FuzzyVariable("inrush", 0, 10)
        .add_term("ausente", LeftEdge(0.3, 0.8))
        .add_term("presente", Trapezoid(0.5, 1.5, 2.5, 3.5))
        .add_term("severo", RightEdge(3.0, 5.0))
    )

    # --- Input: Current × Vibration Correlation (0-100) ---
    correlacao_cv = (
        FuzzyVariable("correlacao_cv", 0, 100)
        .add_term("baixa", LeftEdge(20, 40))
        .add_term("media", Triangle(30, 50, 70))
        .add_term("alta", RightEdge(60, 80))
    )

    # --- Input: Life Consumption (0-1, fraction) ---
    vida_consumida = (
        FuzzyVariable("vida_consumida", 0, 1)
        .add_term("baixa", LeftEdge(0.2, 0.4))
        .add_term("media", Triangle(0.3, 0.5, 0.7))
        .add_term("alta", RightEdge(0.6, 0.8))
    )

    # --- Input: Harmonic Ratio vib240/vib120 (0-5) ---
    harmonic_ratio = (
        FuzzyVariable("harmonic_ratio", 0, 5)
        .add_term("normal", LeftEdge(0.5, 1.0))
        .add_term("elevado", Triangle(0.8, 1.5, 2.5))
        .add_term("distorcao", RightEdge(2.0, 3.0))
    )

    # --- Input: Z-Score Temperature (0-5, |z| clamped) ---
    z_temperatura = (
        FuzzyVariable("z_temperatura", 0, 5)
        .add_term("normal", LeftEdge(1, 2))
        .add_term("alto", Triangle(1.5, 2.5, 3.5))
        .add_term("critico", RightEdge(3, 4))
    )

    # --- Input: Z-Score Delta-T (0-5) ---
    z_delta_t = (
        FuzzyVariable("z_delta_t", 0, 5)
        .add_term("normal", LeftEdge(1, 2))
        .add_term("alto", Triangle(1.5, 2.5, 3.5))
        .add_term("critico", RightEdge(3, 4))
    )

    # --- Input: Acceleration flag (0 or 1) ---
    temp_acelerando = (
        FuzzyVariable("temp_acelerando", 0, 1)
        .add_term("nao", LeftEdge(0.3, 0.6))
        .add_term("sim", RightEdge(0.4, 0.7))
    )

    # --- Input: Temperature Trend (-5 a +10 °C/h) ---
    # Slope da regressao linear das ultimas 30 amostras (calcTendencias TS).
    # Permite antecipacao: temp morna + subindo -> moderado mesmo antes do limite.
    tendencia_temp = (
        FuzzyVariable("tendencia_temperatura", -5, 10)
        .add_term("descendo", LeftEdge(-1, 0))
        .add_term("estavel", Trapezoid(-0.5, 0, 1.5, 3))
        .add_term("subindo", RightEdge(2, 5))
    )

    # --- Input: Delta-T Trend (-3 a +6 °C/h) ---
    tendencia_delta_t = (
        FuzzyVariable("tendencia_delta_t", -3, 6)
        .add_term("descendo", LeftEdge(-0.5, 0))
        .add_term("estavel", Trapezoid(-0.3, 0, 1, 2))
        .add_term("subindo", RightEdge(1.5, 3))
    )

    # --- Input: Harmonic Ratio v240/v120 (0-2) ---
    # Razao alta indica conexoes frouxas das chapas / desalinhamento do nucleo.
    ratio_harm = (
        FuzzyVariable("ratio_harmonicas", 0, 2)
        .add_term("normal", LeftEdge(0.3, 0.5))
        .add_term("elevada", Trapezoid(0.4, 0.6, 0.9, 1.1))
        .add_term("alta", RightEdge(1.0, 1.4))
    )

    # --- Input: THD do espectro vibracional (0-1) ---
    # Total Harmonic Distortion das harmonicas 240/360/480/600 vs 120Hz fundamental.
    thd = (
        FuzzyVariable("thd", 0, 1)
        .add_term("baixa", LeftEdge(0.15, 0.25))
        .add_term("media", Trapezoid(0.20, 0.30, 0.45, 0.55))
        .add_term("alta", RightEdge(0.50, 0.70))
    )

    # --- Input: Inrush frequency (eventos / 5 min) ---
    # Energizacoes repetidas estressam o nucleo e podem indicar falta intermitente.
    taxa_inrush = (
        FuzzyVariable("taxa_inrush", 0, 10)
        .add_term("rara", LeftEdge(1, 2))
        .add_term("frequente", Trapezoid(1.5, 3, 5, 7))
        .add_term("excessiva", RightEdge(5, 8))
    )

    # --- Output: Operational Risk (0-100) ---
    risco = (
        FuzzyVariable("risco_operacional", 0, 100)
        .add_term("baixo", LeftEdge(15, 25))
        .add_term("moderado", Triangle(25, 40, 55))
        .add_term("alto", Trapezoid(50, 60, 70, 80))
        .add_term("critico", RightEdge(75, 90))
    )

    # --- Output: Intervention Urgency (0-100) ---
    urgencia = (
        FuzzyVariable("urgencia_intervencao", 0, 100)
        .add_term("baixa", LeftEdge(15, 25))
        .add_term("media", Triangle(25, 45, 60))
        .add_term("alta", RightEdge(55, 75))
    )

    for var in [
        temperatura, delta_t, vib120, vib240, corrente_p, corrente_s, inrush,
        correlacao_cv, vida_consumida,
        harmonic_ratio, z_temperatura, z_delta_t, temp_acelerando,
        tendencia_temp, tendencia_delta_t, ratio_harm, thd, taxa_inrush,
        risco, urgencia,
    ]:
        fsis.add_variable(var)

    R = lambda a, c, w=1.0: fsis.add_rule(a, c, w)

    # === Thermal rules ===
    R([("temperatura", "critica")], [("risco_operacional", "critico"), ("urgencia_intervencao", "alta")], 1.0)
    R([("temperatura", "quente"), ("delta_t", "alto")], [("risco_operacional", "alto"), ("urgencia_intervencao", "alta")], 1.0)
    R([("temperatura", "quente")], [("risco_operacional", "alto")], 0.7)
    R([("temperatura", "morna")], [("risco_operacional", "moderado")], 0.6)

    # === Delta-T / Efficiency rules ===
    R([("delta_t", "severo")], [("risco_operacional", "critico"), ("urgencia_intervencao", "alta")], 1.0)
    R([("delta_t", "alto")], [("risco_operacional", "alto")], 0.8)
    R([("delta_t", "elevado"), ("temperatura", "morna")], [("risco_operacional", "moderado")], 0.7)
    R([("delta_t", "elevado")], [("risco_operacional", "moderado")], 0.4)

    # === Vibration 120Hz - Mechanical ===
    R([("vibracao_120hz", "severa")], [("risco_operacional", "critico"), ("urgencia_intervencao", "alta")], 1.0)
    R([("vibracao_120hz", "forte"), ("vibracao_240hz", "moderada")], [("risco_operacional", "alto"), ("urgencia_intervencao", "alta")], 0.9)
    R([("vibracao_120hz", "forte")], [("risco_operacional", "moderado")], 0.7)
    R([("vibracao_120hz", "moderada")], [("risco_operacional", "moderado")], 0.4)

    # === Vibration 240Hz - Harmonics ===
    R([("vibracao_240hz", "alta")], [("risco_operacional", "alto")], 0.8)
    R([("vibracao_240hz", "moderada")], [("risco_operacional", "moderado")], 0.5)

    # === Current - Electrical overload ===
    R([("corrente_primario", "sobrecarga"), ("temperatura", "quente")], [("risco_operacional", "critico"), ("urgencia_intervencao", "alta")], 1.0)
    R([("corrente_primario", "sobrecarga")], [("risco_operacional", "alto")], 0.7)
    R([("corrente_primario", "alta")], [("risco_operacional", "moderado")], 0.5)
    R([("corrente_secundario", "sobrecarga"), ("temperatura", "quente")], [("risco_operacional", "critico")], 0.9)
    R([("corrente_secundario", "sobrecarga")], [("risco_operacional", "alto")], 0.6)
    R([("corrente_secundario", "alta")], [("risco_operacional", "moderado")], 0.4)

    # === Systemic overload ===
    R([("corrente_primario", "alta"), ("corrente_secundario", "alta")], [("risco_operacional", "alto")], 0.7)

    # === Cross-domain: mechanical + electrical ===
    R([("vibracao_120hz", "moderada"), ("corrente_primario", "elevada")], [("risco_operacional", "moderado")], 0.5)

    # === Correlation current × vibration ===
    R([("correlacao_cv", "alta"), ("corrente_primario", "elevada")], [("risco_operacional", "alto"), ("urgencia_intervencao", "media")], 0.8)
    R([("correlacao_cv", "alta"), ("vibracao_120hz", "moderada")], [("risco_operacional", "moderado")], 0.7)
    R([("correlacao_cv", "media"), ("corrente_primario", "elevada")], [("risco_operacional", "moderado")], 0.5)

    # === Life consumption (Arrhenius) ===
    R([("vida_consumida", "alta")], [("risco_operacional", "alto"), ("urgencia_intervencao", "media")], 0.8)
    R([("vida_consumida", "media"), ("temperatura", "quente")], [("risco_operacional", "moderado")], 0.6)

    # === Inrush current ===
    R([("inrush", "severo")], [("risco_operacional", "critico"), ("urgencia_intervencao", "alta")], 1.0)
    R([("inrush", "presente"), ("temperatura", "quente")], [("risco_operacional", "critico"), ("urgencia_intervencao", "alta")], 0.9)
    R([("inrush", "presente"), ("corrente_primario", "alta")], [("risco_operacional", "alto"), ("urgencia_intervencao", "media")], 0.8)
    R([("inrush", "presente")], [("risco_operacional", "moderado")], 0.5)

    # === Harmonic distortion (vib240/vib120) ===
    R([("harmonic_ratio", "distorcao"), ("vibracao_240hz", "alta")], [("risco_operacional", "alto"), ("urgencia_intervencao", "media")], 0.8)
    R([("harmonic_ratio", "elevado"), ("vibracao_240hz", "moderada")], [("risco_operacional", "moderado")], 0.6)

    # === Z-score: adaptive anomaly detection ===
    R([("z_temperatura", "critico")], [("risco_operacional", "alto")], 0.8)
    R([("z_temperatura", "alto"), ("z_delta_t", "alto")], [("risco_operacional", "alto"), ("urgencia_intervencao", "media")], 0.7)
    R([("z_temperatura", "alto"), ("temperatura", "quente")], [("risco_operacional", "moderado")], 0.6)

    # === Meta-diagnosis: 3+ variables ===
    R([("temperatura", "quente"), ("vibracao_120hz", "moderada"), ("corrente_primario", "elevada")], [("risco_operacional", "alto"), ("urgencia_intervencao", "alta")], 0.9)
    R([("delta_t", "alto"), ("corrente_primario", "alta"), ("vibracao_120hz", "moderada")], [("risco_operacional", "alto")], 0.8)

    # === Temperature acceleration (2nd derivative) ===
    R([("temp_acelerando", "sim"), ("temperatura", "quente")], [("risco_operacional", "alto"), ("urgencia_intervencao", "alta")], 0.9)
    R([("temp_acelerando", "sim"), ("temperatura", "morna")], [("risco_operacional", "moderado")], 0.7)

    # === Trend-based anticipation ===
    # Permite escalada antes do valor atual cruzar limiar.
    R([("temperatura", "morna"), ("tendencia_temperatura", "subindo")],
      [("risco_operacional", "moderado"), ("urgencia_intervencao", "media")], 0.7)
    R([("temperatura", "quente"), ("tendencia_temperatura", "subindo")],
      [("risco_operacional", "critico"), ("urgencia_intervencao", "alta")], 1.0)
    R([("delta_t", "elevado"), ("tendencia_delta_t", "subindo")],
      [("risco_operacional", "alto"), ("urgencia_intervencao", "media")], 0.8)

    # === FFT harmonics — core faults ===
    R([("ratio_harmonicas", "alta")],
      [("risco_operacional", "alto"), ("urgencia_intervencao", "media")], 0.8)
    R([("ratio_harmonicas", "elevada"), ("vibracao_120hz", "moderada")],
      [("risco_operacional", "moderado")], 0.6)
    R([("thd", "alta")],
      [("risco_operacional", "alto")], 0.7)

    # === Inrush correlation expanded ===
    R([("taxa_inrush", "excessiva")],
      [("risco_operacional", "critico"), ("urgencia_intervencao", "alta")], 0.9)
    R([("inrush", "presente"), ("temperatura", "morna"), ("tendencia_temperatura", "subindo")],
      [("risco_operacional", "alto")], 0.8)

    # === Normal operation ===
    R(
        [
            ("temperatura", "normal"),
            ("delta_t", "normal"),
            ("vibracao_120hz", "normal"),
            ("vibracao_240hz", "normal"),
            ("corrente_primario", "normal"),
        ],
        [("risco_operacional", "baixo")],
        1.0,
    )

    return fsis


SYS = _built_system()


def _gerar_diagnosticos(inputs, resultados, fired_rules):
    diagnosticos = []
    grandezas_criticas = set()

    risco = resultados.get("risco_operacional", {})
    score = risco.get("score", 0)
    termos = risco.get("termos", {})

    temp = inputs.get("temperatura", 0)
    delta_t = inputs.get("delta_t", 0)
    v120 = inputs.get("vibracao_120hz", 0)
    v240 = inputs.get("vibracao_240hz", 0)
    ip = inputs.get("corrente_primario", 0)
    is_ = inputs.get("corrente_secundario", 0)

    # Temperature diagnosis
    if temp > 85:
        diagnosticos.append({
            "tipo": "temperatura_critica",
            "severidade": "critico",
            "titulo": "Sobreaquecimento Crítico",
            "mensagem": "CRÍTICO: Temperatura do núcleo acima do limite. Risco de curto parcial entre espiras. Reduzir carga imediatamente.",
            "recomendacao": "Reduzir carga do transformador, inspecionar sistema de refrigeração e realizar termografia.",
            "grandeza": "temperatura",
            "valor_atual": temp,
        })
        grandezas_criticas.add("temperatura")
    elif temp > 70:
        diagnosticos.append({
            "tipo": "temperatura_elevada",
            "severidade": "aviso",
            "titulo": "Temperatura Elevada",
            "mensagem": f"Temperatura do núcleo elevada ({temp}°C). Monitorar degradação da isolação.",
            "recomendacao": "Monitorar evolução da temperatura, verificar carga e condições de ventilação.",
            "grandeza": "temperatura",
            "valor_atual": temp,
        })
        grandezas_criticas.add("temperatura")

    # Delta-T / Efficiency diagnosis
    if delta_t > 30:
        diagnosticos.append({
            "tipo": "eficiencia_critica",
            "severidade": "critico",
            "titulo": "Perda de Eficiência Crítica",
            "mensagem": "CRÍTICO: ΔT excessivo. Degradação da eficiência com risco iminente de curto parcial entre espiras.",
            "recomendacao": "Realizar ensaio de relação de transformação (TRT) e inspeção das bobinas.",
            "grandeza": "delta_t",
            "valor_atual": delta_t,
        })
        grandezas_criticas.add("delta_t")
    elif delta_t > 18:
        sev = "critico" if score >= 60 else "aviso"
        diagnosticos.append({
            "tipo": "eficiencia_degradada",
            "severidade": sev,
            "titulo": "Degradação da Eficiência",
            "mensagem": f"{'CRÍTICO' if sev == 'critico' else 'AVISO'} EFICIÊNCIA: Gradiente térmico elevado ({delta_t}°C) para a carga atual. Monitorar degradação da relação Pin/Pout.",
            "recomendacao": "Avaliar rendimento do transformador, verificar perdas no núcleo e enrolamentos.",
            "grandeza": "delta_t",
            "valor_atual": delta_t,
        })
        grandezas_criticas.add("delta_t")
    elif delta_t > 12 and temp > 50:
        diagnosticos.append({
            "tipo": "eficiencia_atencao",
            "severidade": "aviso",
            "titulo": "Aviso de Eficiência",
            "mensagem": f"AVISO EFICIÊNCIA: Degradação da relação Pin/Pout com elevação de ΔT ({delta_t}°C). Risco de curto parcial entre espiras em desenvolvimento.",
            "recomendacao": "Monitorar tendência do gradiente térmico e programar ensaio de fator de potência do isolamento.",
            "grandeza": "delta_t",
            "valor_atual": delta_t,
        })
        grandezas_criticas.add("delta_t")

    # Vibration 120Hz - Mechanical
    if v120 > 0.45:
        diagnosticos.append({
            "tipo": "vibracao_mecanica_critica",
            "severidade": "critico",
            "titulo": "Falha Mecânica Crítica",
            "mensagem": f"CRÍTICO: Vibração 120Hz muito elevada ({v120} g). Risco de dano estrutural ao núcleo magnético.",
            "recomendacao": "Parar máquina imediatamente. Inspecionar aperto das chapas do núcleo e integridade estrutural.",
            "grandeza": "vibracao_120hz",
            "valor_atual": v120,
        })
        grandezas_criticas.add("vibracao_120hz")
    elif v120 > 0.20:
        diagnosticos.append({
            "tipo": "vibracao_mecanica",
            "severidade": "aviso",
            "titulo": "Manutenção Mecânica",
            "mensagem": f"MANUTENÇÃO: Assinatura de vibração (120Hz) com amplitude {v120} g fora do padrão. Realizar aperto mecânico estrutural no núcleo magnético.",
            "recomendacao": "Realizar aperto mecânico das chapas do núcleo magnético e inspeção estrutural.",
            "grandeza": "vibracao_120hz",
            "valor_atual": v120,
        })
        grandezas_criticas.add("vibracao_120hz")

    # Vibration 240Hz - Harmonics
    if v240 > 0.20:
        sev = "critico" if v240 > 0.25 else "aviso"
        diagnosticos.append({
            "tipo": "harmonico_rede",
            "severidade": sev,
            "titulo": "Distorção Harmônica",
            "mensagem": f"{'CRÍTICO' if sev == 'critico' else 'ALERTA'}: Elevado ruído harmônico na rede (THD > Limite, {v240} g em 240Hz). Sugere-se projeto/instalação de filtros EMI/RFI.",
            "recomendacao": "Realizar análise de qualidade de energia. Projetar e instalar filtros harmônicos passivos ou ativos.",
            "grandeza": "vibracao_240hz",
            "valor_atual": v240,
        })
        grandezas_criticas.add("vibracao_240hz")
    elif v240 > 0.10:
        diagnosticos.append({
            "tipo": "harmonico_atencao",
            "severidade": "aviso",
            "titulo": "Ruído Harmônico",
            "mensagem": f"Ruído harmônico detectado ({v240} g em 240Hz). Possível distorção na rede elétrica.",
            "recomendacao": "Monitorar conteúdo harmônico e verificar cargas não-lineares conectadas.",
            "grandeza": "vibracao_240hz",
            "valor_atual": v240,
        })
        grandezas_criticas.add("vibracao_240hz")

    # Primary current
    if ip > 6.0:
        diagnosticos.append({
            "tipo": "sobrecarga_primario",
            "severidade": "critico",
            "titulo": "Sobrecarga no Primário",
            "mensagem": f"CRÍTICO: Sobrecarga no primário ({ip} A). Risco de danos ao enrolamento.",
            "recomendacao": "Reduzir carga imediatamente. Verificar condições da rede e dimensionamento do transformador.",
            "grandeza": "corrente_primario",
            "valor_atual": ip,
        })
        grandezas_criticas.add("corrente_primario")
    elif ip > 4.0:
        diagnosticos.append({
            "tipo": "corrente_primario_elevada",
            "severidade": "aviso",
            "titulo": "Corrente Primária Elevada",
            "mensagem": f"Corrente primária elevada ({ip} A). Verificar carga e condições da rede.",
            "recomendacao": "Verificar carga conectada e condições da rede de alimentação.",
            "grandeza": "corrente_primario",
            "valor_atual": ip,
        })
        grandezas_criticas.add("corrente_primario")

    # Secondary current
    if is_ > 45:
        diagnosticos.append({
            "tipo": "sobrecarga_secundario",
            "severidade": "critico",
            "titulo": "Sobrecarga no Secundário",
            "mensagem": f"CRÍTICO: Sobrecarga no secundário ({is_} A). Risco de aquecimento excessivo.",
            "recomendacao": "Reduzir carga no secundário. Verificar carga conectada e dimensionamento.",
            "grandeza": "corrente_secundario",
            "valor_atual": is_,
        })
        grandezas_criticas.add("corrente_secundario")
    elif is_ > 30:
        diagnosticos.append({
            "tipo": "corrente_secundario_elevada",
            "severidade": "aviso",
            "titulo": "Corrente Secundária Elevada",
            "mensagem": f"Corrente secundária elevada ({is_} A). Verificar carga conectada.",
            "recomendacao": "Verificar carga conectada ao secundário do transformador.",
            "grandeza": "corrente_secundario",
            "valor_atual": is_,
        })
        grandezas_criticas.add("corrente_secundario")

    # Inrush peak
    inrush_val = inputs.get("inrush", 0)
    if inrush_val > 3.0:
        diagnosticos.append({
            "tipo": "inrush_severo",
            "severidade": "critico",
            "titulo": "Pico de Inrush Severo",
            "mensagem": f"CRÍTICO: Pico de corrente de magnetização de {inrush_val} no primário. Estresse mecânico nos enrolamentos e risco de saturação repetida do núcleo.",
            "recomendacao": "Avaliar pré-magnetização, verificar relé de proteção e dimensionamento do disjuntor de entrada. Investigar causa: chaveamento sem ramp, descarga capacitiva ou falta seguida de retorno.",
            "grandeza": "inrush",
            "valor_atual": inrush_val,
        })
        grandezas_criticas.add("inrush")
    elif inrush_val > 1.5:
        diagnosticos.append({
            "tipo": "inrush_presente",
            "severidade": "aviso",
            "titulo": "Pico de Inrush Detectado",
            "mensagem": f"AVISO: Surto de energização ({inrush_val}) acima do limite operacional. Repetições podem acelerar fadiga das chapas do núcleo.",
            "recomendacao": "Monitorar frequência de eventos de inrush. Avaliar uso de soft-start ou relé de pré-inserção.",
            "grandeza": "inrush",
            "valor_atual": inrush_val,
        })
        grandezas_criticas.add("inrush")

    # Cross-variable: arcing (ratio is/ip elevado + temp elevada)
    if ip > 0:
        ratio = is_ / ip
        if ratio > 20 and temp > 60:
            diagnosticos.append({
                "tipo": "arco_eletrico",
                "severidade": "critico",
                "titulo": "Arco Elétrico Detectado",
                "mensagem": "CRÍTICO: Salto de fase ou centelhamento detectado. Risco de arco elétrico. Inspecionar bornes e conexões imediatamente.",
                "recomendacao": "Inspecionar bornes, conexões e isolamento. Realizar ensaio de descargas parciais.",
                "grandeza": "multivariavel",
                "valor_atual": round(ratio, 1),
            })
            grandezas_criticas.add("arco_eletrico")

    # Cross-variable: combined mechanical + electrical
    if v120 > 0.25 and v240 > 0.12 and ip > 4.5:
        diagnosticos.append({
            "tipo": "estresse_combinado",
            "severidade": "aviso",
            "titulo": "Estresse Eletromecânico",
            "mensagem": "AVISO: Vibração elevada combinada com corrente elevada. Possível desalinhamento ou desgaste de contatos.",
            "recomendacao": "Inspecionar contatos elétricos e fixação mecânica do núcleo.",
            "grandeza": "multivariavel",
            "valor_atual": None,
        })
        grandezas_criticas.add("estresse_combinado")

    # Correlation current × vibration
    correlacao_cv = inputs.get("correlacao_cv", 0)
    if correlacao_cv > 60:
        diagnosticos.append({
            "tipo": "correlacao_eletromecanica",
            "severidade": "critico" if correlacao_cv > 80 else "aviso",
            "titulo": "Correlação Corrente × Vibração",
            "mensagem": f"{'CRÍTICO' if correlacao_cv > 80 else 'AVISO'}: Corrente e vibração 120Hz elevadas simultaneamente ({correlacao_cv}%). Indica estresse eletromecânico ativo com possível evolução para curto entre espiras.",
            "recomendacao": "Reduzir carga e inspecionar enrolamentos. Realizar ensaio de relação de transformação (TRT) e análise de descargas parciais.",
            "grandeza": "multivariavel",
            "valor_atual": correlacao_cv,
        })
        grandezas_criticas.add("correlacao_eletromecanica")

    # Life consumption (Arrhenius)
    vida_consumida_val = inputs.get("vida_consumida", 0)
    if vida_consumida_val > 0.6:
        sev = "critico" if vida_consumida_val > 0.8 else "aviso"
        pct = round(vida_consumida_val * 100)
        diagnosticos.append({
            "tipo": "vida_util",
            "severidade": sev,
            "titulo": "Consumo de Vida Útil",
            "mensagem": f"{'CRÍTICO' if sev == 'critico' else 'AVISO'}: {pct}% da vida útil estimada consumida. Degradação acelerada do isolamento por estresse térmico acumulado (Arrhenius).",
            "recomendacao": "Programar ensaio de grau de polimerização (GP) e fator de potência do isolamento. Avaliar necessidade de substituição do transformador." if sev == "critico" else "Monitorar evolução do envelhecimento e programar ensaio de grau de polimerização.",
            "grandeza": "multivariavel",
            "valor_atual": pct,
        })
        grandezas_criticas.add("vida_util")

    # Harmonic distortion (from vib240/vib120 ratio)
    harmonic_ratio_val = inputs.get("harmonic_ratio", 0)
    if harmonic_ratio_val > 1.5:
        sev = "critico" if harmonic_ratio_val > 2.5 else "aviso"
        diagnosticos.append({
            "tipo": "distorcao_harmonica",
            "severidade": sev,
            "titulo": "Distorção Harmônica por Carga",
            "mensagem": f"{'CRÍTICO' if sev == 'critico' else 'AVISO'}: Relação harmônica vib240/vib120 elevada ({harmonic_ratio_val}). Carga não-linear conectada ao transformador gerando distorção na forma de onda.",
            "recomendacao": "Analisar qualidade de energia. Verificar presença de cargas não-lineares (fontes chaveadas, inversores). Considerar instalação de filtros harmônicos.",
            "grandeza": "multivariavel",
            "valor_atual": harmonic_ratio_val,
        })
        grandezas_criticas.add("distorcao_harmonica")

    # Z-score anomaly (adaptive threshold exceeded)
    z_temp = inputs.get("z_temperatura", 0)
    if z_temp > 3:
        diagnosticos.append({
            "tipo": "anomalia_adaptativa",
            "severidade": "critico",
            "titulo": "Anomalia Térmica (Threshold Adaptativo)",
            "mensagem": f"CRÍTICO: Temperatura {z_temp} desvios-padrão acima da média histórica recente. Comportamento anômalo detectado fora do regime normal do transformador.",
            "recomendacao": "Investigar causa da elevação atípica. Comparar com carga atual e condições ambientais. Inspecionar sistema de refrigeração.",
            "grandeza": "multivariavel",
            "valor_atual": z_temp,
        })
        grandezas_criticas.add("anomalia_adaptativa")

    # Meta-diagnosis: thermal + mechanical + electrical combined
    if temp > 65 and v120 > 5 and ip > 100:
        diagnosticos.append({
            "tipo": "falha_combinada",
            "severidade": "critico" if (temp > 75 and v120 > 7) else "aviso",
            "titulo": "Falha Multifatorial",
            "mensagem": f"{'CRÍTICO' if (temp > 75 and v120 > 7) else 'AVISO'}: Temperatura ({temp}°C), vibração 120Hz ({v120}) e corrente ({ip}A) simultaneamente elevados. Degradação sistêmica com risco de falha acelerada.",
            "recomendacao": "Reduzir carga. Realizar inspeção geral incluindo termografia, análise de vibração e ensaio de isolamento. Programar parada para manutenção corretiva.",
            "grandeza": "multivariavel",
            "valor_atual": None,
        })
        grandezas_criticas.add("falha_combinada")

    # Meta-diagnosis: delta_t + current + vibration combined
    if delta_t > 15 and ip > 80 and v120 > 4:
        sev = "critico" if (delta_t > 20 or ip > 120) else "aviso"
        diagnosticos.append({
            "tipo": "falha_combinada",
            "severidade": sev,
            "titulo": "Falha Multifatorial (Térmico-Elétrica)",
            "mensagem": f"{'CRÍTICO' if sev == 'critico' else 'AVISO'}: Gradiente térmico ({delta_t}°C), corrente ({ip}A) e vibração 120Hz ({v120}) simultaneamente elevados. Sobrecarga com estresse termomecânico no enrolamento.",
            "recomendacao": "Reduzir carga imediatamente. Verificar sistema de refrigeração e realizar ensaio de fator de potência do isolamento. Avaliar condição dos contatos e conexões.",
            "grandeza": "multivariavel",
            "valor_atual": None,
        })
        grandezas_criticas.add("falha_combinada")

    # Accelerating temperature warning
    temp_acelerando_val = inputs.get("temp_acelerando", 0)
    if temp_acelerando_val and temp >= 50:
        diagnosticos.append({
            "tipo": "aquecimento_acelerado",
            "severidade": "critico" if temp > 65 else "aviso",
            "titulo": "Aquecimento Acelerado",
            "mensagem": f"{'CRÍTICO' if temp > 65 else 'AVISO'}: Temperatura ({temp}°C) com tendência de aceleração — a taxa de subida está aumentando. Risco de superaquecimento progressivo.",
            "recomendacao": "Monitorar continuamente. Verificar sistema de refrigeração e carga. Preparar para redução de carga se temperatura continuar acelerando.",
            "grandeza": "multivariavel",
            "valor_atual": temp,
        })
        grandezas_criticas.add("aquecimento_acelerado")

    # Harmonics / core faults
    ratio = inputs.get("ratio_harmonicas", 0)
    thd_val = inputs.get("thd", 0)
    if ratio > 1.0:
        diagnosticos.append({
            "tipo": "harmonicas_nucleo",
            "severidade": "critico",
            "titulo": "Falha no Núcleo (Razão Harmônica)",
            "mensagem": f"CRÍTICO: Razão v240/v120 = {ratio:.2f}. Indica conexões frouxas das chapas ou desalinhamento do núcleo magnético.",
            "recomendacao": "Inspecionar aperto das chapas do núcleo, verificar paralelismo das laminações e realizar ensaio de impedância de curto-circuito.",
            "grandeza": "ratio_harmonicas",
            "valor_atual": round(ratio, 2),
        })
        grandezas_criticas.add("ratio_harmonicas")
    elif ratio > 0.6:
        diagnosticos.append({
            "tipo": "harmonicas_elevada",
            "severidade": "aviso",
            "titulo": "Razão Harmônica Elevada",
            "mensagem": f"AVISO: Razão v240/v120 = {ratio:.2f}. Conteúdo harmônico acima do esperado para operação saudável.",
            "recomendacao": "Monitorar tendência. Programar inspeção mecânica das laminações.",
            "grandeza": "ratio_harmonicas",
            "valor_atual": round(ratio, 2),
        })
        grandezas_criticas.add("ratio_harmonicas")

    if thd_val > 0.5:
        diagnosticos.append({
            "tipo": "thd_alta",
            "severidade": "aviso",
            "titulo": "Distorção Harmônica Elevada",
            "mensagem": f"AVISO: THD do espectro vibracional = {thd_val:.2f}. Sugere fluxo magnético irregular ou contribuição de cargas não-lineares.",
            "recomendacao": "Avaliar qualidade de energia da rede, identificar cargas não-lineares e inspecionar estado das chapas.",
            "grandeza": "thd",
            "valor_atual": round(thd_val, 2),
        })
        grandezas_criticas.add("thd")

    # Inrush frequency
    taxa = inputs.get("taxa_inrush", 0)
    if taxa > 5:
        diagnosticos.append({
            "tipo": "inrush_frequente",
            "severidade": "critico",
            "titulo": "Taxa de Inrush Excessiva",
            "mensagem": f"CRÍTICO: {int(taxa)} eventos de inrush em 5 minutos. Energizações repetidas estressam o núcleo e podem indicar falta intermitente da rede.",
            "recomendacao": "Investigar instabilidade da rede de alimentação, verificar relés de proteção e contatos de chaveamento.",
            "grandeza": "taxa_inrush",
            "valor_atual": int(taxa),
        })
        grandezas_criticas.add("taxa_inrush")
    elif taxa > 2:
        diagnosticos.append({
            "tipo": "inrush_recorrente",
            "severidade": "aviso",
            "titulo": "Inrush Recorrente",
            "mensagem": f"AVISO: {int(taxa)} eventos de inrush em 5 minutos. Frequência acima do esperado para operação normal.",
            "recomendacao": "Monitorar estabilidade da alimentação. Avaliar uso de soft-start ou relé de pré-inserção.",
            "grandeza": "taxa_inrush",
            "valor_atual": int(taxa),
        })
        grandezas_criticas.add("taxa_inrush")

    # Trend anticipation
    tendencia_t = inputs.get("tendencia_temperatura", 0)
    if temp > 60 and tendencia_t > 2.0:
        minutos_estim = max(1, int((85 - temp) / max(tendencia_t / 60, 0.01)))
        diagnosticos.append({
            "tipo": "temperatura_subindo",
            "severidade": "aviso",
            "titulo": "Temperatura em Elevação Rápida",
            "mensagem": f"AVISO: Temperatura atual {temp}°C subindo a {tendencia_t:.1f}°C/h. Tendência indica alarme crítico em ~{minutos_estim} min se mantida.",
            "recomendacao": "Reduzir carga preventivamente e verificar refrigeração antes de atingir limite crítico.",
            "grandeza": "tendencia_temperatura",
            "valor_atual": round(tendencia_t, 2),
        })
        grandezas_criticas.add("tendencia_temperatura")

    return diagnosticos, sorted(grandezas_criticas)


def analisar(payload: dict) -> dict:
    # Suporta formato novo {leituras, series} e legado {campo: valor}
    leituras = payload.get("leituras", payload)
    series   = payload.get("series", {})
    ts       = payload.get("timestamp") or leituras.get("timestamp", 0)

    # ── Arrhenius (estado persistente no daemon) ──────────────────────────────
    vida_residual = _update_arrhenius(leituras.get("temperatura") or 0.0, float(ts or 0))

    # ── Análise de séries (NumPy) ─────────────────────────────────────────────
    tendencias  = _calc_tendencias(series)
    predicoes   = _calc_predicoes(series)
    baselines   = _get_baselines(series)
    z_scores    = _calc_z_scores(leituras, baselines)
    correlacao_cv = _calc_correlacao_cv(series)

    v120 = leituras.get("vibracao_120hz") or 0.0
    v240 = leituras.get("vibracao_240hz") or 0.0
    harmonic_ratio = round(v240 / v120, 2) if v120 > 0.01 else 0.0

    temp_acelerando = any(
        t["grandeza"] == "temperatura" and t["aceleracao"] == "acelerando"
        for t in tendencias
    )

    # ── Monta inputs para o fuzzy ─────────────────────────────────────────────
    inputs = {k: (v if v is not None else 0) for k, v in leituras.items()}
    inputs.update({
        "correlacao_cv":  correlacao_cv if correlacao_cv > 0 else 0,
        "vida_consumida": _vida_consumida,
        "harmonic_ratio": harmonic_ratio if harmonic_ratio > 0 else 0,
        "temp_acelerando": 1 if temp_acelerando else 0,
        **{k: (v if v != 0 else 0) for k, v in z_scores.items()},
    })

    # ── Inferência fuzzy ──────────────────────────────────────────────────────
    resultados, fired_rules, fuzzified = SYS.evaluate(inputs)

    risco   = resultados.get("risco_operacional", {})
    urgencia = resultados.get("urgencia_intervencao", {})
    score_risco = risco.get("score", 0)
    nivel = "critico" if score_risco >= 75 else "alto" if score_risco >= 50 else "moderado" if score_risco >= 25 else "baixo"

    diagnosticos, grandezas_criticas_set = _gerar_diagnosticos(inputs, resultados, fired_rules)

    # Anomalia de eficiência (regra ΔT × carga)
    efic = _detectar_eficiencia_anomala(leituras.get("delta_t") or 0.0, tendencias)
    if efic:
        diagnosticos.append(efic)
        grandezas_criticas_set.add("delta_t")

    sev_geral = "ok"
    for d in diagnosticos:
        if d["severidade"] == "critico":
            sev_geral = "critico"
            break
        if d["severidade"] == "aviso":
            sev_geral = "aviso"

    score_urgencia = urgencia.get("score", 0)
    nivel_urgencia = _nivel_urgencia(score_urgencia)

    vida_pct = (inputs.get("vida_consumida") or 0) * 100
    penalty = score_risco * 0.55 + score_urgencia * 0.25 + vida_pct * 0.20
    saude_score = max(0.0, min(100.0, 100.0 - penalty))
    if saude_score >= 80:
        saude_nivel = "excelente"
    elif saude_score >= 60:
        saude_nivel = "bom"
    elif saude_score >= 40:
        saude_nivel = "atencao"
    elif saude_score >= 20:
        saude_nivel = "ruim"
    else:
        saude_nivel = "critico"

    rules_resumidas = sorted(
        (
            {
                "antecedents": [{"var": a, "term": t} for a, t in r["antecedents"]],
                "consequents": [{"var": a, "term": t} for a, t in r["consequents"]],
                "firing": round(r["firing"], 3),
            }
            for r in fired_rules
            if r.get("firing", 0) > 0.1
        ),
        key=lambda r: -r["firing"],
    )[:15]

    correlacao_cv_val = inputs.get("correlacao_cv") or 0

    saida = {
        "timestamp": ts,
        "saude": {
            "score": round(saude_score, 1),
            "nivel": saude_nivel,
        },
        "risco_operacional": {
            "score": score_risco,
            "nivel": nivel,
            "termos": risco.get("termos", {}),
        },
        "urgencia_intervencao": {
            "score": score_urgencia,
            "nivel": nivel_urgencia,
        },
        "vida_residual": vida_residual,
        "tendencias": tendencias,
        "predicoes": predicoes,
        "baseline": baselines,
        "diagnosticos": diagnosticos,
        "grandezas_criticas": sorted(grandezas_criticas_set),
        "severidade_geral": sev_geral,
        "correlacao_cv": correlacao_cv_val,
        "ratio_harmonicas": inputs.get("ratio_harmonicas") or 0,
        "thd": inputs.get("thd") or 0,
        "taxa_inrush": inputs.get("taxa_inrush") or 0,
        "fired_rules": rules_resumidas,
    }
    return saida


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            inputs = json.loads(line)
        except json.JSONDecodeError as e:
            print(json.dumps({"erro": f"JSON inválido: {e}"}), flush=True)
            continue
        resultado = analisar(inputs)
        print(json.dumps(resultado, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
