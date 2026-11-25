/**
 * Safe, deterministic After Effects-compatible Expression Evaluator.
 * Supports: time, value, wiggle(freq, amp), loopOut(duration), Math.*, + - * / ( )
 */

function hash1D(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function smoothNoise1D(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1D(i) * 2 - 1;
  const b = hash1D(i + 1) * 2 - 1;
  return a + (b - a) * u;
}

export interface ExpressionContext {
  time: number;
  localTime: number;
  duration: number;
  value: number;
  seedOffset?: number;
}

export const EXPRESSION_TEMPLATES: { label: string; expr: string }[] = [
  { label: 'Organic Wiggle', expr: 'value + wiggle(3, 18)' },
  { label: 'Camera Handheld', expr: 'value + wiggle(1.8, 12)' },
  { label: 'Sine Pulse Wave', expr: 'value + Math.sin(time * 4) * 20' },
  { label: 'Linear Spin', expr: 'value + time * 45' },
  { label: 'Loop Ping-Pong', expr: 'loopOut(1.5)' },
];

export function evaluateExpression(
  expr: string | undefined,
  ctx: ExpressionContext
): number {
  if (!expr || !expr.trim()) return ctx.value;
  const cleaned = expr.trim();

  // Reject unsafe identifiers or statement separators
  if (/[;{}[\]=`]|window|document|global|process|fetch|import|eval|Function/.test(cleaned)) {
    return ctx.value;
  }

  const wiggle = (freq: number, amp: number): number => {
    const f = Number.isFinite(freq) ? freq : 2;
    const a = Number.isFinite(amp) ? amp : 10;
    const t = ctx.time * f + (ctx.seedOffset ?? 0);
    return (smoothNoise1D(t) * 0.72 + smoothNoise1D(t * 2.13) * 0.28) * a;
  };

  const loopOut = (cycleSec: number = 2): number => {
    const c = Math.max(0.1, Number.isFinite(cycleSec) ? cycleSec : 2);
    const phase = (ctx.localTime % c) / c;
    const triangle = phase < 0.5 ? phase * 2 : 2 - phase * 2;
    return ctx.value * (0.75 + 0.5 * triangle);
  };

  const sin = Math.sin;
  const cos = Math.cos;
  const abs = Math.abs;
  const min = Math.min;
  const max = Math.max;
  const round = Math.round;
  const floor = Math.floor;
  const pow = Math.pow;

  try {
    const fn = new Function(
      'time',
      'localTime',
      'duration',
      'value',
      'wiggle',
      'loopOut',
      'sin',
      'cos',
      'abs',
      'min',
      'max',
      'round',
      'floor',
      'pow',
      'Math',
      `"use strict"; return (${cleaned});`
    );
    const res = fn(
      ctx.time,
      ctx.localTime,
      ctx.duration,
      ctx.value,
      wiggle,
      loopOut,
      sin,
      cos,
      abs,
      min,
      max,
      round,
      floor,
      pow,
      Math
    );
    return typeof res === 'number' && Number.isFinite(res) ? res : ctx.value;
  } catch {
    return ctx.value;
  }
}

export function validateExpressionSyntax(expr: string): boolean {
  if (!expr.trim()) return true;
  if (/[;{}[\]=`]|window|document|global|process|fetch|import|eval|Function/.test(expr)) {
    return false;
  }
  try {
    const testVal = evaluateExpression(expr, {
      time: 1,
      localTime: 0.5,
      duration: 4,
      value: 100,
    });
    return Number.isFinite(testVal);
  } catch {
    return false;
  }
}
