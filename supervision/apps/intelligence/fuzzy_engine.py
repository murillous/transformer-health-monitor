import numpy as np


class LeftEdge:
    def __init__(self, peak, foot):
        self.peak = peak
        self.foot = foot

    def __call__(self, x):
        if x <= self.peak:
            return 1.0
        if x >= self.foot:
            return 0.0
        return (self.foot - x) / (self.foot - self.peak)


class RightEdge:
    def __init__(self, foot, peak):
        self.foot = foot
        self.peak = peak

    def __call__(self, x):
        if x <= self.foot:
            return 0.0
        if x >= self.peak:
            return 1.0
        return (x - self.foot) / (self.peak - self.foot)


class Trapezoid:
    def __init__(self, a, b, c, d):
        self.a, self.b, self.c, self.d = a, b, c, d

    def __call__(self, x):
        if x <= self.a or x >= self.d:
            return 0.0
        if self.a < x < self.b:
            return (x - self.a) / (self.b - self.a)
        if self.b <= x <= self.c:
            return 1.0
        return (self.d - x) / (self.d - self.c)


class Triangle:
    def __init__(self, a, b, c):
        self.a, self.b, self.c = a, b, c

    def __call__(self, x):
        if x <= self.a or x >= self.c:
            return 0.0
        if self.a < x < self.b:
            return (x - self.a) / (self.b - self.a)
        return (self.c - x) / (self.c - self.b)


class FuzzyVariable:
    def __init__(self, name, min_val, max_val, resolution=1000):
        self.name = name
        self.universe = np.linspace(min_val, max_val, resolution)
        self.terms = {}

    def add_term(self, name, fuzzy_set):
        self.terms[name] = fuzzy_set
        return self


class FuzzyInferenceSystem:
    def __init__(self):
        self.variables = {}
        self.rules = []

    def add_variable(self, var):
        self.variables[var.name] = var

    def add_rule(self, antecedents, consequents, weight=1.0):
        self.rules.append((antecedents, consequents, weight))

    def evaluate(self, inputs):
        fuzzified = {}
        for var_name, value in inputs.items():
            if var_name in self.variables:
                term_mus = {}
                for term_name, mf in self.variables[var_name].terms.items():
                    term_mus[term_name] = mf(value)
                fuzzified[var_name] = term_mus

        output_firings = {}
        fired_rules = []

        for antecedents, consequents, weight in self.rules:
            firing = 1.0
            for var_name, term_name in antecedents:
                mu = fuzzified.get(var_name, {}).get(term_name, 0.0)
                firing = min(firing, mu)

            firing *= weight

            if firing > 0:
                for cons_var, cons_term in consequents:
                    if cons_var not in output_firings:
                        output_firings[cons_var] = {}
                    if cons_term not in output_firings[cons_var]:
                        output_firings[cons_var][cons_term] = 0.0
                    output_firings[cons_var][cons_term] = max(
                        output_firings[cons_var][cons_term], firing
                    )
                fired_rules.append({"antecedents": antecedents, "consequents": consequents, "firing": firing})

        results = {}
        for var_name, term_firings in output_firings.items():
            var = self.variables[var_name]
            aggregated = np.zeros_like(var.universe)
            for term_name, firing in term_firings.items():
                mf = var.terms[term_name]
                for i, x in enumerate(var.universe):
                    aggregated[i] = max(aggregated[i], min(mf(x), firing))

            if np.sum(aggregated) > 0:
                centroid = float(np.sum(aggregated * var.universe) / np.sum(aggregated))
            else:
                centroid = 0.0

            max_term = max(term_firings, key=term_firings.get)

            results[var_name] = {
                "score": round(centroid, 1),
                "termo_principal": max_term,
                "termos": {k: round(v, 3) for k, v in term_firings.items()},
            }

        return results, fired_rules, fuzzified
