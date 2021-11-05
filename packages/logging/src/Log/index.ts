// ets_tracing: off

import type * as T from "@effect-ts/core/Effect"
import type { Cause } from "@effect-ts/core/Effect/Cause"
import type * as M from "@effect-ts/core/Effect/Managed"
import type * as S from "@effect-ts/core/Effect/Stream"
import type { Endomorphism } from "@effect-ts/core/Function"

import type { LogContext } from "../LogContext"
import type { Logger } from "../Logger"
import type { HasLogging } from "../Logging"
import * as Logging from "../Logging"
import type { LogLevel } from "../LogLevel"

// -----------------------------------------------------------------------------
// Constructors
// -----------------------------------------------------------------------------

export function apply(level: LogLevel) {
  return (line: string): T.RIO<HasLogging, void> => Logging.log(level)(line)
}

// -----------------------------------------------------------------------------
// Operations
// -----------------------------------------------------------------------------

export const context: T.RIO<HasLogging, LogContext> = Logging.context

export function debug(line: string): T.RIO<HasLogging, void> {
  return Logging.debug(line)
}

export function error(line: string): T.RIO<HasLogging, void> {
  return Logging.error(line)
}

export function errorCause(
  line: string,
  cause: Cause<unknown>
): T.RIO<HasLogging, void> {
  return Logging.errorCause(line, cause)
}

export function info(line: string): T.RIO<HasLogging, void> {
  return Logging.info(line)
}

export function throwable(line: string, error: Error): T.RIO<HasLogging, void> {
  return Logging.throwable(line, error)
}

export function trace(line: string): T.RIO<HasLogging, void> {
  return Logging.trace(line)
}

export function warn(line: string): T.RIO<HasLogging, void> {
  return Logging.warn(line)
}

export function warnCause(
  line: string,
  cause: Cause<unknown>
): T.RIO<HasLogging, void> {
  return Logging.warnCause(line, cause)
}

export function derive(
  f: (ctx: LogContext) => LogContext
): T.RIO<HasLogging, Logger<string>> {
  return Logging.derive(f)
}

export function locally(f: Endomorphism<LogContext>) {
  return <R, E, A>(self: T.Effect<R, E, A>): T.Effect<R & HasLogging, E, A> =>
    Logging.locally(f)(self)
}

export function locallyM<R1>(f: (ctx: LogContext) => T.RIO<R1, LogContext>) {
  return <R2 extends HasLogging, E, A>(
    self: T.Effect<R2, E, A>
  ): T.Effect<R1 & R2, E, A> => Logging.locallyM(f)(self as any)
}

export function locallyManaged(f: (ctx: LogContext) => LogContext) {
  return <R extends HasLogging, E, A>(self: M.Managed<R, E, A>): M.Managed<R, E, A> =>
    Logging.locallyManaged(f)(self)
}

export function locallyStream(f: (ctx: LogContext) => LogContext) {
  return <R extends HasLogging, E, A>(self: S.Stream<R, E, A>): S.Stream<R, E, A> =>
    Logging.locallyStream(f)(self)
}
