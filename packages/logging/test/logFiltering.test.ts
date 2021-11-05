import * as C from "@effect-ts/core/Collections/Immutable/Chunk"
import * as Tp from "@effect-ts/core/Collections/Immutable/Tuple"
import * as T from "@effect-ts/core/Effect"
import * as L from "@effect-ts/core/Effect/Layer"
import * as M from "@effect-ts/core/Effect/Managed"
import * as Q from "@effect-ts/core/Effect/Queue"
import * as TE from "@effect-ts/jest/Test"
import { pipe } from "@effect-ts/system/Function"

import * as LogAnnotation from "../src/LogAnnotation"
import * as LogAppender from "../src/LogAppender"
import type { LogContext } from "../src/LogContext"
import * as LC from "../src/LogContext"
import * as LogFiltering from "../src/LogFiltering"
import * as LogFormat from "../src/LogFormat"
import { StringLogAppender } from "../src/Logging"
import type { LogLevel } from "../src/LogLevel"
import * as LL from "../src/LogLevel"

function makeContext(name: string, level: LogLevel): LogContext {
  return pipe(
    LC.empty,
    LC.annotate(LogAnnotation.Name, name.split(".")),
    LC.annotate(LogAnnotation.Level, level)
  )
}

function testFilter(
  name: string,
  level: LogLevel,
  filter: (context: LogContext, line: string) => boolean
): boolean {
  return filter(makeContext(name, level), "")
}

const filter: (context: LogContext, line: any) => boolean = LogFiltering.filterBy(
  LL.debug,
  Tp.tuple("a", LL.info),
  Tp.tuple("a.b.c", LL.warn),
  Tp.tuple("e.f", LL.error)
)

describe("LogFiltering", () => {
  const { it } = TE.runtime()

  it("can be built from a list of nodes", () =>
    T.succeedWith(() => {
      expect(testFilter("x", LL.debug, filter)).toBeTruthy()
      expect(testFilter("a", LL.debug, filter)).toBeFalsy()
      expect(testFilter("a", LL.info, filter)).toBeTruthy()
      expect(testFilter("a.b", LL.debug, filter)).toBeFalsy()
      expect(testFilter("a.b", LL.info, filter)).toBeTruthy()
      expect(testFilter("a.b.c", LL.info, filter)).toBeFalsy()
      expect(testFilter("a.b.c", LL.warn, filter)).toBeTruthy()
      expect(testFilter("e", LL.debug, filter)).toBeTruthy()
      expect(testFilter("e.f", LL.debug, filter)).toBeFalsy()
    }))

  it("can be applied onto log appenders", () =>
    T.gen(function* (_) {
      const queue = yield* _(Q.makeUnbounded<string>())
      const baseAppender = LogAppender.make(StringLogAppender)(
        LogFormat.fromFunction((_, line) => line),
        (_, line) => T.asUnit(Q.offer_(queue, line))
      )
      const filteredAppender = pipe(
        filter,
        LogAppender.withFilter(StringLogAppender)(baseAppender)
      )

      yield* _(
        pipe(
          filteredAppender,
          L.build,
          M.use((hasAppender) => {
            const appender = StringLogAppender.read(hasAppender)
            return pipe(
              appender.write(makeContext("a.b.c", LL.debug), "a.b.c"),
              T.zipRight(appender.write(makeContext("x", LL.debug), "x"))
            )
          })
        )
      )

      const result = yield* _(T.map_(Q.takeAll(queue), C.toArray))

      expect(result).toEqual(["x"])
    }))
})
