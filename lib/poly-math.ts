// Accepted token shapes (after space removal and "-" → "+-" normalization):
//   bare constants: "3", "-1", "0.5", ".5"
//   implicit-coeff x: "x", "-x" → coeffStr="" or "-"
//   explicit coeff with x: "3x", "-2x", "0.5x"
//   powers: "x^2", "-x^3", "2x^4"
//   optional *: "3*x^2"
//   empty token after split (leading minus case): silently dropped

export const MAX_DEGREE = 4;

export type Polynomial = { coeffs: number[] };

export function parsePolynomial(expr: string): Polynomial {
  const normalized = expr.replace(/\s+/g, "").replace(/-/g, "+-");
  const tokens = normalized.split("+").filter((t) => t !== "");
  const coeffs = [0, 0, 0, 0, 0];

  for (const token of tokens) {
    const match = token.match(/^([+-]?\d*\.?\d*)\*?(x(?:\^(\d+))?)?$/);
    if (!match) throw new Error(`Cannot parse polynomial term: "${token}"`);

    const [, coeffStr, xPart, powerStr] = match;
    const power = xPart ? (powerStr ? parseInt(powerStr, 10) : 1) : 0;

    if (power > MAX_DEGREE) {
      throw new Error(`Polynomial degree ${power} exceeds maximum ${MAX_DEGREE}`);
    }

    let coeff: number;
    if (!xPart) {
      if (!coeffStr || coeffStr === "+" || coeffStr === "-") {
        throw new Error(`Cannot parse polynomial term: "${token}"`);
      }
      coeff = parseFloat(coeffStr);
    } else if (coeffStr === "" || coeffStr === "+") {
      coeff = 1;
    } else if (coeffStr === "-") {
      coeff = -1;
    } else {
      coeff = parseFloat(coeffStr);
    }

    if (isNaN(coeff)) throw new Error(`Cannot parse coefficient in term: "${token}"`);
    coeffs[power] += coeff;
  }

  let len = coeffs.length;
  while (len > 1 && coeffs[len - 1] === 0) len--;
  return { coeffs: coeffs.slice(0, len) };
}

export function evaluatePolynomial(p: Polynomial, x: number): number {
  return p.coeffs.reduce((sum, c, i) => sum + c * x ** i, 0);
}

export function derivativePolynomial(p: Polynomial): Polynomial {
  if (p.coeffs.length <= 1) return { coeffs: [0] };
  const coeffs = p.coeffs.slice(1).map((c, i) => (i + 1) * c);
  return { coeffs: coeffs.length > 0 ? coeffs : [0] };
}
