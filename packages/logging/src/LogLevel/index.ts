// ets_tracing: off

import { Tagged } from "@effect-ts/core/Case"
import * as Equal from "@effect-ts/core/Equal"
import * as Ord from "@effect-ts/system/Ord"

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

/**
 * A `LogLevel` defines the level at which an element is logged.
 */
export type LogLevel = Fatal | Error | Warn | Info | Debug | Trace | Off

export class Fatal extends Tagged("Fatal")<{}> {
  readonly level = 6
}

export class Error extends Tagged("Error")<{}> {
  readonly level = 5
}

export class Warn extends Tagged("Warn")<{}> {
  readonly level = 4
}

export class Info extends Tagged("Info")<{}> {
  readonly level = 3
}

export class Debug extends Tagged("Debug")<{}> {
  readonly level = 2
}

export class Trace extends Tagged("Trace")<{}> {
  readonly level = 1
}

export class Off extends Tagged("Off")<{}> {
  readonly level = 0
}

// -----------------------------------------------------------------------------
// Constructors
// -----------------------------------------------------------------------------

export const fatal: LogLevel = new Fatal()

export const error: LogLevel = new Error()

export const warn: LogLevel = new Warn()

export const info: LogLevel = new Info()

export const debug: LogLevel = new Debug()

export const trace: LogLevel = new Trace()

export const off: LogLevel = new Off()

// -----------------------------------------------------------------------------
// Instances
// -----------------------------------------------------------------------------

export const eqLogLevel: Equal.Equal<LogLevel> = Equal.contramap(
  (logLevel: LogLevel) => logLevel.level
)(Equal.number)

export const ordLogLevel: Ord.Ord<LogLevel> = Ord.contramap_(
  Ord.number,
  (logLevel) => logLevel.level
)

export const gt = Ord.gt(ordLogLevel)

export function gte(x: LogLevel, y: LogLevel): boolean {
  return gt(x, y) || eqLogLevel.equals(x, y)
}
