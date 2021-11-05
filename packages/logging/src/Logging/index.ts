// ets_tracing: off

import * as T from "@effect-ts/core/Effect"
import type { Cause } from "@effect-ts/core/Effect/Cause"
import type { HasClock } from "@effect-ts/core/Effect/Clock"
import * as Clock from "@effect-ts/core/Effect/Clock"
import * as FiberRef from "@effect-ts/core/Effect/FiberRef"
import * as L from "@effect-ts/core/Effect/Layer"
import * as M from "@effect-ts/core/Effect/Managed"
import * as S from "@effect-ts/core/Effect/Stream"
import type { Has } from "@effect-ts/core/Has"
import { tag } from "@effect-ts/core/Has"

import * as LA from "../LogAnnotation"
import type { HasLogAppender, LogAppender } from "../LogAppender"
import * as LAP from "../LogAppender"
import type { LogContext } from "../LogContext"
import * as LC from "../LogContext"
import type { LogFormat } from "../LogFormat"
import * as LF from "../LogFormat"
import type { Logger } from "../Logger"
import * as LG from "../Logger"
import type { LogLevel } from "../LogLevel"
import * as LL from "../LogLevel"

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

export type HasLogging = Has<Logger<string>>

export const StringLogger = tag<Logger<string>>().setKey(
  "@effect-ts/logging/StringLogger"
)
export const StringLogAppender = tag<LogAppender<string>>().setKey(
  "@effect-ts/logging/StringLogAppender"
)

// -----------------------------------------------------------------------------
// Constructors
// -----------------------------------------------------------------------------

export const make: L.Layer<HasLogAppender<string>, never, HasLogging> = L.fromRawEffect(
  T.accessServiceM(StringLogAppender)((appender) =>
    T.map_(FiberRef.make(LC.empty), (ref) =>
      StringLogger.of(LG.LoggerWithFormat(ref, appender))
    )
  )
)

export const ignore: L.Layer<unknown, never, HasLogging> =
  LAP.ignore(StringLogAppender)[">>>"](make)

export function console(
  logLevel: LogLevel = LL.info,
  format: LogFormat<string> = LF.ColoredLogFormat((_, s) => s)
): L.Layer<HasClock, never, HasLogging> {
  return LAP.console(StringLogAppender)(logLevel, format)
    [">+>"](make)
    [">>>"](modifyLoggerM(addTimestamp))
}

export function consoleErr(
  logLevel: LogLevel = LL.error,
  format: LogFormat<string> = LF.SimpleConsoleLogFormat((_, s) => s)
): L.Layer<HasClock, never, HasLogging> {
  return LAP.consoleErr(StringLogAppender)(logLevel, format)
    [">+>"](make)
    [">>>"](modifyLoggerM(addTimestamp))
}

// -----------------------------------------------------------------------------
// Combinators
// -----------------------------------------------------------------------------

export const context: T.RIO<HasLogging, LogContext> = T.accessServiceM(StringLogger)(
  (_) => _.logContext
)

export function debug(line: string): T.RIO<HasLogging, void> {
  return T.accessServiceM(StringLogger)(LG.debug(line))
}

export function error(line: string): T.RIO<HasLogging, void> {
  return T.accessServiceM(StringLogger)(LG.error(line))
}

export function errorCause(
  line: string,
  cause: Cause<unknown>
): T.RIO<HasLogging, void> {
  return T.accessServiceM(StringLogger)(LG.errorCause(line, cause))
}

export function info(line: string): T.RIO<HasLogging, void> {
  return T.accessServiceM(StringLogger)(LG.info(line))
}

export function throwable(line: string, error: Error): T.RIO<HasLogging, void> {
  return T.accessServiceM(StringLogger)(LG.throwable(line, error))
}

export function trace(line: string): T.RIO<HasLogging, void> {
  return T.accessServiceM(StringLogger)(LG.trace(line))
}

export function warn(line: string): T.RIO<HasLogging, void> {
  return T.accessServiceM(StringLogger)(LG.warn(line))
}

export function warnCause(
  line: string,
  cause: Cause<unknown>
): T.RIO<HasLogging, void> {
  return T.accessServiceM(StringLogger)(LG.warnCause(line, cause))
}

export function log(level: LogLevel) {
  return (line: string): T.RIO<HasLogging, void> =>
    T.accessServiceM(StringLogger)(LG.logWithLevel(level)(line))
}

export function locally(f: (ctx: LogContext) => LogContext) {
  return <R, E, A>(effect: T.Effect<R, E, A>): T.Effect<R & HasLogging, E, A> =>
    T.accessServiceM(StringLogger)(LG.locally(f)(effect))
}

export function locallyM<R>(f: (ctx: LogContext) => T.RIO<R, LogContext>) {
  return <E, A>(effect: T.Effect<R, E, A>): T.Effect<R & HasLogging, E, A> =>
    T.accessServiceM(StringLogger)(LG.locallyM(f)(effect))
}

export function locallyManaged(f: (ctx: LogContext) => LogContext) {
  return <R, E, A>(managed: M.Managed<R, E, A>): M.Managed<R & HasLogging, E, A> =>
    M.accessServiceM(StringLogger)(LG.locallyManaged(f)(managed))
}

export function locallyStream(f: (ctx: LogContext) => LogContext) {
  return <R, E, A>(stream: S.Stream<R, E, A>): S.Stream<R & HasLogging, E, A> =>
    S.accessStream((_: HasLogging) => LG.locallyStream(f)(stream)(StringLogger.read(_)))
}

export function derive(
  f: (ctx: LogContext) => LogContext
): T.RIO<HasLogging, Logger<string>> {
  return T.accessService(StringLogger)(LG.derive(f))
}

/**
 * Modify the root logger name.
 */
export function withRootLoggerName(
  name: string
): L.Layer<HasLogging, never, HasLogging> {
  return modifyLogger(LG.named(name))
}

/**
 * Modify the initial logger context.
 */
export function withContext(
  context: LogContext
): L.Layer<HasLogging, never, HasLogging> {
  return modifyLogger(LG.derive(() => context))
}

// -----------------------------------------------------------------------------
// Operations
// -----------------------------------------------------------------------------

export function addTimestamp<A>(self: Logger<A>): T.RIO<HasClock, Logger<A>> {
  return LG.deriveM_(self, (ctx) =>
    T.map_(T.orDie(Clock.currentTime), (time) => {
      const annotation = LA.Timestamp
      return LC.annotate_(
        ctx,
        annotation,
        annotation.combine(annotation.initialValue, time)
      )
    })
  )
}

export function modifyLogger(
  f: (logger: Logger<string>) => Logger<string>
): L.Layer<HasLogging, never, HasLogging> {
  return L.fromRawEffect(
    T.accessService(StringLogger)((logger) => StringLogger.of(f(logger)))
  )
}

export function modifyLoggerM<R, E>(
  f: (logger: Logger<string>) => T.Effect<R, E, Logger<string>>
): L.Layer<R & HasLogging, E, HasLogging> {
  return L.fromEffect(StringLogger)(
    T.accessM((env: R & HasLogging) => T.provide_(f(StringLogger.read(env)), env))
  )
}
