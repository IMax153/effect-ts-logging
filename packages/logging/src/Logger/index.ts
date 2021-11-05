// ets_tracing: off

import * as Tp from "@effect-ts/core/Collections/Immutable/Tuple"
import * as T from "@effect-ts/core/Effect"
import type { Cause } from "@effect-ts/core/Effect/Cause"
import type { FiberRef } from "@effect-ts/core/Effect/FiberRef"
import * as FRef from "@effect-ts/core/Effect/FiberRef"
import * as M from "@effect-ts/core/Effect/Managed"
import { makeReleaseMap, releaseAll } from "@effect-ts/core/Effect/Managed/ReleaseMap"
import * as S from "@effect-ts/core/Effect/Stream"
import type { Endomorphism } from "@effect-ts/core/Function"
import * as O from "@effect-ts/core/Option"

import type { LogAnnotation } from "../LogAnnotation"
import * as LA from "../LogAnnotation"
import type { LogAppender } from "../LogAppender"
import type { LogContext } from "../LogContext"
import * as LC from "../LogContext"
import type { LogLevel } from "../LogLevel"
import * as LL from "../LogLevel"

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

export interface Logger<A> {
  /**
   * Logs the specified element using an interhited `LogLevel`.
   */
  readonly log: (line: A) => T.UIO<void>
  /**
   * Retrieves the `LogContext` for the `Logger`.
   */
  readonly logContext: T.UIO<LogContext>
  /**
   * Modifies the `LogContext` within the scope of the specified effect.
   */
  readonly locally: (
    f: Endomorphism<LogContext>
  ) => <R, E, A1>(effect: T.Effect<R, E, A1>) => T.Effect<R, E, A1>
}

export function LoggerWithFormat<A>(
  contextRef: FiberRef<LogContext>,
  appender: LogAppender<A>
): Logger<A> {
  return {
    logContext: FRef.get(contextRef),
    log: (line) => T.chain_(FRef.get(contextRef), (ctx) => appender.write(ctx, line)),
    locally: (f) => (effect) =>
      T.chain_(FRef.get(contextRef), (ctx) => FRef.locally(f(ctx))(effect)(contextRef))
  }
}

// -----------------------------------------------------------------------------
// Operations
// -----------------------------------------------------------------------------

/**
 * Modifies the `LogContext` within the scope of the specified effect.
 */
export function locally(f: Endomorphism<LogContext>) {
  return <R, E, A1>(effect: T.Effect<R, E, A1>) => {
    return <A>(self: Logger<A>): T.Effect<R, E, A1> => self.locally(f)(effect)
  }
}

/**
 * Modifies the `LogContext` with an effect within the scope of the specified
 * effect.
 */
export function locallyM<R>(f: (ctx: LogContext) => T.RIO<R, LogContext>) {
  return <E, A1>(effect: T.Effect<R, E, A1>) => {
    return <A>(self: Logger<A>): T.Effect<R, E, A1> =>
      T.chain_(T.chain_(self.logContext, f), (ctx) => locally(() => ctx)(effect)(self))
  }
}

// TODO: remove when latest @effect-ts/core is released
function managedReserve<R, E, A>(
  self: M.Managed<R, E, A>
): T.UIO<M.Reservation<R, E, A>> {
  return T.map_(makeReleaseMap, (releaseMap) =>
    M.Reservation.of(
      T.map_(
        T.provideSome_(self.effect, (_: R) => Tp.tuple(_, releaseMap)),
        Tp.get(1)
      ),
      (_) => releaseAll(_, T.sequential)(releaseMap)
    )
  )
}

/**
 * Modify the `LogContext` within the scope of a `Managed` operation.
 */
export function locallyManaged(f: Endomorphism<LogContext>) {
  return <R, E, A1>(managed: M.Managed<R, E, A1>) => {
    return <A>(self: Logger<A>): M.Managed<R, E, A1> =>
      M.makeReserve(
        T.map_(managedReserve(managed), (r) =>
          M.Reservation.of(locally(f)(r.acquire)(self), (exit) =>
            locally(f)(r.release(exit))(self)
          )
        )
      )
  }
}

/**
 * Modify the `LogContext` within the scope of a `Stream`.

 */
export function locallyStream(f: Endomorphism<LogContext>) {
  return <R, E, A1>(stream: S.Stream<R, E, A1>) => {
    return <A>(self: Logger<A>): S.Stream<R, E, A1> =>
      new S.Stream(M.map_(stream.proc, (p) => locally(f)(p)(self)))
  }
}

/**
 * Modify a `LogAnnotation` within the scopy of the specified effect.
 */
export function locallyAnnotate<B>(annotation: LogAnnotation<B>, value: B) {
  return <R, E, A1>(effect: T.Effect<R, E, A1>) => {
    return <A>(self: Logger<A>): T.Effect<R, E, A1> =>
      locally(LC.annotate(annotation, value))(effect)(self)
  }
}

/**
 * Logs the specified element at the specified `LogLevel`.
 */
export function logWithLevel(level: LogLevel) {
  return <A>(line: A) => {
    return (self: Logger<A>): T.UIO<void> =>
      locallyAnnotate(LA.Level, level)(self.log(line))(self)
  }
}

/**
 * Logs the specified element at the debug level.
 */
export function debug_<A>(self: Logger<A>, line: A): T.UIO<void> {
  return logWithLevel(LL.debug)(line)(self)
}

/**
 * Logs the specified element at the debug level.
 *
 * @ets_data_first debug_
 */
export function debug<A>(line: A) {
  return (self: Logger<A>): T.UIO<void> => debug_(self, line)
}

/**
 * Evaluates the specified element based on the `LogLevel` set and will log
 * the element at the debug level.
 */
export function debugM_<R, E, A>(
  self: Logger<A>,
  line: T.Effect<R, E, A>
): T.Effect<R, E, void> {
  return T.chain_(line, (_) => debug_(self, _))
}

/**
 * Evaluates the specified element based on the `LogLevel` set and will log
 * the element at the debug level.
 *
 * @ets_data_first debugM_
 */
export function debugM<R, E, A>(line: T.Effect<R, E, A>) {
  return (self: Logger<A>): T.Effect<R, E, void> => debugM_(self, line)
}

/**
 * Logs the specified element at the error level.
 */
export function error_<A>(self: Logger<A>, line: A): T.UIO<void> {
  return logWithLevel(LL.error)(line)(self)
}

/**
 * Logs the specified element at the error level.
 *
 * @ets_data_first error_
 */
export function error<A>(line: A) {
  return (self: Logger<A>): T.UIO<void> => error_(self, line)
}

/**
 * Evaluates the specified element based on the `LogLevel` set and will log
 * the element at the error level.
 */
export function errorM_<R, E, A>(
  self: Logger<A>,
  line: T.Effect<R, E, A>
): T.Effect<R, E, void> {
  return T.chain_(line, (_) => error_(self, _))
}

/**
 * Evaluates the specified element based on the `LogLevel` set and will log
 * the element at the error level.
 *
 * @ets_data_first errorM_
 */
export function errorM<R, E, A>(line: T.Effect<R, E, A>) {
  return (self: Logger<A>): T.Effect<R, E, void> => errorM_(self, line)
}

/**
 * Logs the specified element at the error level with the specified `Cause`.
 */
export function errorCause_<A>(
  self: Logger<A>,
  line: A,
  cause: Cause<unknown>
): T.UIO<void> {
  const annotation = LA.Cause
  return self.locally(
    LC.annotate(annotation, annotation.combine(annotation.initialValue, O.some(cause)))
  )(logWithLevel(LL.error)(line)(self))
}

/**
 * Logs the specified element at the error level with the specified `Cause`.
 *
 * @ets_data_first errorCause_
 */
export function errorCause<A>(line: A, cause: Cause<unknown>) {
  return (self: Logger<A>): T.UIO<void> => errorCause_(self, line, cause)
}

/**
 * Evaluates the specified element based on the `LogLevel` set and will log
 * the element at the error level.
 */
export function errorCauseM_<R, E, A>(
  self: Logger<A>,
  line: T.Effect<R, E, A>,
  cause: Cause<unknown>
): T.Effect<R, E, void> {
  return T.chain_(line, (_) => errorCause_(self, _, cause))
}

/**
 * Evaluates the specified element based on the `LogLevel` set and will log
 * the element at the error level.
 *
 * @ets_data_first errorCauseM_
 */
export function errorCauseM<R, E, A>(line: T.Effect<R, E, A>, cause: Cause<unknown>) {
  return (self: Logger<A>): T.Effect<R, E, void> => errorCauseM_(self, line, cause)
}

/**
 * Logs the specified element at the info level.
 */
export function info_<A>(self: Logger<A>, line: A): T.UIO<void> {
  return logWithLevel(LL.info)(line)(self)
}

/**
 * Logs the specified element at the info level.
 *
 * @ets_data_first info_
 */
export function info<A>(line: A) {
  return (self: Logger<A>): T.UIO<void> => info_(self, line)
}

/**
 * Evaluates the specified element based on the `LogLevel` set and will log
 * the element at the info level.
 */
export function infoM_<R, E, A>(
  self: Logger<A>,
  line: T.Effect<R, E, A>
): T.Effect<R, E, void> {
  return T.chain_(line, (_) => info_(self, _))
}

/**
 * Evaluates the specified element based on the `LogLevel` set and will log
 * the element at the info level.
 *
 * @ets_data_first infoM_
 */
export function infoM<R, E, A>(line: T.Effect<R, E, A>) {
  return (self: Logger<A>): T.Effect<R, E, void> => infoM_(self, line)
}

/**
 * Logs the specified element at the error level with the exception.
 */
export function throwable_<A>(self: Logger<A>, line: A, error: Error): T.UIO<void> {
  const annotation = LA.Throwable
  return self.locally(
    LC.annotate(annotation, annotation.combine(annotation.initialValue, O.some(error)))
  )(error_(self, line))
}

/**
 * Logs the specified element at the error level with the exception.
 *
 * @ets_data_first throwable_
 */
export function throwable<A>(line: A, error: Error) {
  return (self: Logger<A>): T.UIO<void> => throwable_(self, line, error)
}

/**
 * Logs the specified element at the trace level.
 */
export function trace_<A>(self: Logger<A>, line: A): T.UIO<void> {
  return logWithLevel(LL.trace)(line)(self)
}

/**
 * Logs the specified element at the trace level.
 *
 * @ets_data_first trace_
 */
export function trace<A>(line: A) {
  return (self: Logger<A>): T.UIO<void> => trace_(self, line)
}

/**
 * Evaluates the specified element based on the `LogLevel` set and will log
 * the element at the trace level.
 */
export function traceM_<R, E, A>(
  self: Logger<A>,
  line: T.Effect<R, E, A>
): T.Effect<R, E, void> {
  return T.chain_(line, (_) => trace_(self, _))
}

/**
 * Evaluates the specified element based on the `LogLevel` set and will log
 * the element at the info level.
 *
 * @ets_data_first traceM_
 */
export function traceM<R, E, A>(line: T.Effect<R, E, A>) {
  return (self: Logger<A>): T.Effect<R, E, void> => traceM_(self, line)
}

/**
 * Logs the specified element at the warn level.
 */
export function warn_<A>(self: Logger<A>, line: A): T.UIO<void> {
  return logWithLevel(LL.warn)(line)(self)
}

/**
 * Logs the specified element at the warn level.
 *
 * @ets_data_first warn_
 */
export function warn<A>(line: A) {
  return (self: Logger<A>): T.UIO<void> => warn_(self, line)
}

/**
 * Evaluates the specified element based on the `LogLevel` set and will log
 * the element at the warn level.
 */
export function warnM_<R, E, A>(
  self: Logger<A>,
  line: T.Effect<R, E, A>
): T.Effect<R, E, void> {
  return T.chain_(line, (_) => warn_(self, _))
}

/**
 * Evaluates the specified element based on the `LogLevel` set and will log
 * the element at the warn level.
 *
 * @ets_data_first warnM_
 */
export function warnM<R, E, A>(line: T.Effect<R, E, A>) {
  return (self: Logger<A>): T.Effect<R, E, void> => warnM_(self, line)
}

/**
 * Logs the specified element at the warn level with the specified `Cause`.
 */
export function warnCause_<A>(
  self: Logger<A>,
  line: A,
  cause: Cause<unknown>
): T.UIO<void> {
  const annotation = LA.Cause
  return self.locally(
    LC.annotate(annotation, annotation.combine(annotation.initialValue, O.some(cause)))
  )(logWithLevel(LL.warn)(line)(self))
}

/**
 * Logs the specified element at the warn level with the specified `Cause`.
 *
 * @ets_data_first warnCause_
 */
export function warnCause<A>(line: A, cause: Cause<unknown>) {
  return (self: Logger<A>): T.UIO<void> => warnCause_(self, line, cause)
}

/**
 * Evaluates the specified element based on the `LogLevel` set and will log
 * the element at the warn level.
 */
export function warnCauseM_<R, E, A>(
  self: Logger<A>,
  line: T.Effect<R, E, A>,
  cause: Cause<unknown>
): T.Effect<R, E, void> {
  return T.chain_(line, (_) => warnCause_(self, _, cause))
}

/**
 * Evaluates the specified element based on the `LogLevel` set and will log
 * the element at the warn level.
 *
 * @ets_data_first warnCauseM_
 */
export function warnCauseM<R, E, A>(line: T.Effect<R, E, A>, cause: Cause<unknown>) {
  return (self: Logger<A>): T.Effect<R, E, void> => warnCauseM_(self, line, cause)
}

/**
 * Derives a new `Logger` from the specified one by applying the specified
 * decorator to the logger's `LogContext`.
 */
export function derive_<A>(self: Logger<A>, f: Endomorphism<LogContext>): Logger<A> {
  return {
    log: (line) => locally((ctx) => LC.merge_(f(LC.empty), ctx))(self.log(line))(self),
    logContext: self.logContext,
    locally: self.locally
  }
}

/**
 * Derives a new `Logger` from the specified one by applying the specified
 * decorator to the logger's `LogContext`.
 *
 * @ets_data_first derive_
 */
export function derive(f: Endomorphism<LogContext>) {
  return <A>(self: Logger<A>): Logger<A> => derive_(self, f)
}

/**
 * Derives a new `Logger` from the specified one by applying the specified
 * decorator to the logger's `LogContext`.
 */
export function deriveM_<R, A>(
  self: Logger<A>,
  f: (ctx: LogContext) => T.RIO<R, LogContext>
): T.RIO<R, Logger<A>> {
  return T.access((env: R) => {
    return {
      log: (line) =>
        locallyM((ctx) =>
          T.provide_(
            T.map_(f(LC.empty), (_) => LC.merge_(_, ctx)),
            env
          )
        )(self.log(line))(self),
      logContext: self.logContext,
      locally: self.locally
    }
  })
}

/**
 * Derives a new `Logger` from the specified one by applying the specified
 * decorator to the logger's `LogContext`.
 *
 * @ets_data_first deriveM_
 */
export function deriveM<R>(f: (ctx: LogContext) => T.RIO<R, LogContext>) {
  return <A>(self: Logger<A>): T.RIO<R, Logger<A>> => deriveM_(self, f)
}

/**
 * Produces a named logger.
 */
export function named_<A>(self: Logger<A>, name: string): Logger<A> {
  return derive_(self, LC.annotate(LA.Name, [name]))
}

/**
 * Produces a named logger.
 *
 * @ets_data_first named_
 */
export function named(name: string) {
  return <A>(self: Logger<A>): Logger<A> => named_(self, name)
}

/**
 * Produces a new `Logger` by adapting a different input type to the input type
 * of this `Logger.
 */
export function contramap_<A, A1>(self: Logger<A>, f: (a: A1) => A): Logger<A1> {
  return {
    log: (line) => self.log(f(line)),
    logContext: self.logContext,
    locally: self.locally
  }
}

/**
 * Produces a new `Logger` by adapting a different input type to the input type
 * of this `Logger.
 *
 * @ets_data_first contramap_
 */
export function contramap<A, A1>(f: (a: A1) => A) {
  return (self: Logger<A>): Logger<A1> => contramap_(self, f)
}
