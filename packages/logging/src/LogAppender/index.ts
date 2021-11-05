// ets_tracing: off

import * as T from "@effect-ts/core/Effect"
import * as L from "@effect-ts/core/Effect/Layer"
import * as M from "@effect-ts/core/Effect/Managed"
import * as Q from "@effect-ts/core/Effect/Queue"
import * as Ref from "@effect-ts/core/Effect/Ref"
import type { Has, Tag } from "@effect-ts/core/Has"
import { replaceServiceIn } from "@effect-ts/core/Has"
import * as NodeJSConsole from "console"
import * as fs from "fs"
import * as path from "path"

import * as LA from "../LogAnnotation"
import type { LogContext } from "../LogContext"
import * as LC from "../LogContext"
import type { LogFormat } from "../LogFormat"
import type { LogLevel } from "../LogLevel"
import * as LL from "../LogLevel"

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

export const LogAppenderId: unique symbol = Symbol.for("@effect-ts/logging/LogAppender")
export type LogAppenderId = typeof LogAppenderId

export class LogAppender<A> {
  readonly [LogAppenderId]: LogAppenderId
  constructor(readonly write: (ctx: LogContext, msg: A) => T.UIO<void>) {}
}

export type HasLogAppender<A> = Has<LogAppender<A>>

// -----------------------------------------------------------------------------
// Constructors
// -----------------------------------------------------------------------------

export function make<R, A>(tag: Tag<LogAppender<A>>) {
  return (
    format0: LogFormat<A>,
    write0: (ctx: LogContext, msg: string) => T.RIO<R, void>
  ): L.Layer<R, never, HasLogAppender<A>> => {
    return L.fromEffect(tag)(
      T.access(
        (env: R) =>
          new LogAppender((ctx, msg) =>
            T.provide_(write0(ctx, format0.format(ctx, msg)), env)
          )
      )
    )
  }
}

export function async<A>(tag: Tag<LogAppender<A>>) {
  return (
    logEntryBufferSize: number
  ): L.Layer<HasLogAppender<A>, never, HasLogAppender<A>> => {
    interface LogEntry {
      readonly ctx: LogContext
      readonly msg: A
    }

    const managed = M.accessManaged((env: HasLogAppender<A>) =>
      M.map_(
        T.toManagedRelease_(
          T.tap_(Q.makeBounded<LogEntry>(logEntryBufferSize), (queue) =>
            T.chain_(Q.take(queue), (entry) =>
              T.forkDaemon(T.forever(tag.read(env).write(entry.ctx, entry.msg)))
            )
          ),
          Q.shutdown
        ),
        (queue) => new LogAppender<A>((ctx, msg) => Q.offer_(queue, { ctx, msg }))
      )
    )

    return L.fromManaged(tag)(managed)
  }
}

export function console<A>(tag: Tag<LogAppender<A>>) {
  return (
    logLevel: LogLevel,
    format: LogFormat<A>
  ): L.Layer<unknown, never, HasLogAppender<A>> => {
    return L.map_(
      make(tag)(format, (_, msg) =>
        T.succeedWith(() => {
          NodeJSConsole.log(msg)
        })
      ),
      replaceServiceIn(
        tag,
        filter((ctx, _) => LL.gte(LC.get_(ctx, LA.Level), logLevel))
      )
    )
  }
}

export function consoleErr<A>(tag: Tag<LogAppender<A>>) {
  return (
    logLevel: LogLevel,
    format: LogFormat<A>
  ): L.Layer<unknown, never, HasLogAppender<A>> =>
    L.map_(
      make(tag)(format, (ctx, msg) => {
        const level = LC.get_(ctx, LA.Level)
        return LL.eqLogLevel.equals(level, LL.error)
          ? T.succeedWith(() => {
              NodeJSConsole.error(msg)
            })
          : T.succeedWith(() => {
              NodeJSConsole.log(msg)
            })
      }),
      replaceServiceIn(
        tag,
        filter((ctx, _) => LL.gte(LC.get_(ctx, LA.Level), logLevel))
      )
    )
}

export function file<A>(tag: Tag<LogAppender<A>>) {
  return (
    destination: string,
    encoding: BufferEncoding,
    format0: LogFormat<A>
  ): L.Layer<unknown, Error, HasLogAppender<A>> =>
    L.fromManaged(tag)(
      M.gen(function* (_) {
        const writer = yield* _(
          M.makeExit_(
            T.succeedWith(() => fs.createWriteStream(destination, encoding)),
            (writeable) =>
              T.succeedWith(() => {
                writeable.destroy()
              })
          )
        )

        const hasWarned = yield* _(Ref.makeManagedRef(false))

        return new LogAppender<A>((ctx, msg) =>
          T.unlessM_(
            T.catchAll_(
              T.succeedWith(() => {
                writer.write(format0.format(ctx, msg))
                writer.write(path.sep)
              }),
              (t) =>
                T.succeedWith(() => {
                  NodeJSConsole.error(
                    `Logging to file ${destination} failed with an exception. ` +
                      "Further exceptions will be suppressed in order to avoid log spam."
                  )
                  NodeJSConsole.error(t)
                })
            ),
            Ref.getAndSet_(hasWarned, true)
          )
        )
      })
    )
}

export function ignore<A>(
  tag: Tag<LogAppender<A>>
): L.Layer<unknown, never, HasLogAppender<A>> {
  return L.pure(tag)(new LogAppender(() => T.unit))
}

// -----------------------------------------------------------------------------
// Operations
// -----------------------------------------------------------------------------

export function filter_<A>(
  self: LogAppender<A>,
  f: (ctx: LogContext, msg: A) => boolean
): LogAppender<A> {
  return new LogAppender((ctx, msg) => (f(ctx, msg) ? self.write(ctx, msg) : T.unit))
}

export function filter<A>(f: (ctx: LogContext, msg: A) => boolean) {
  return (self: LogAppender<A>): LogAppender<A> => filter_(self, f)
}

export function filterM_<A>(
  self: LogAppender<A>,
  f: (ctx: LogContext, msg: A) => T.UIO<boolean>
): LogAppender<A> {
  return new LogAppender((ctx, msg) => T.whenM_(self.write(ctx, msg), f(ctx, msg)))
}

export function filterM<A>(f: (ctx: LogContext, msg: A) => T.UIO<boolean>) {
  return (self: LogAppender<A>): LogAppender<A> => filterM_(self, f)
}

export function withFilter_<R, E, A>(
  tag: Tag<LogAppender<A>>,
  layer: L.Layer<R, E, HasLogAppender<A>>
) {
  return (
    filterFn: (ctx: LogContext, msg: A) => boolean
  ): L.Layer<R, E, HasLogAppender<A>> =>
    L.map_(layer, replaceServiceIn(tag, filter(filterFn)))
}

export function withFilter<A>(tag: Tag<LogAppender<A>>) {
  return <R, E>(layer: L.Layer<R, E, HasLogAppender<A>>) =>
    (
      filterFn: (ctx: LogContext, msg: A) => boolean
    ): L.Layer<R, E, HasLogAppender<A>> =>
      withFilter_(tag, layer)(filterFn)
}

export function withFilterM_<R, E, A>(
  tag: Tag<LogAppender<A>>,
  layer: L.Layer<R, E, HasLogAppender<A>>
) {
  return (
    filterFn: (ctx: LogContext, msg: A) => T.UIO<boolean>
  ): L.Layer<R, E, HasLogAppender<A>> =>
    L.map_(layer, replaceServiceIn(tag, filterM(filterFn)))
}

export function withFilterM<A>(tag: Tag<LogAppender<A>>) {
  return <R, E>(layer: L.Layer<R, E, HasLogAppender<A>>) =>
    (
      filterFn: (ctx: LogContext, msg: A) => T.UIO<boolean>
    ): L.Layer<R, E, HasLogAppender<A>> =>
      withFilterM_(tag, layer)(filterFn)
}
