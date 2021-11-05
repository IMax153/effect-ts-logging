import * as A from "@effect-ts/core/Collections/Immutable/Array"
import * as T from "@effect-ts/core/Effect"
import { pipe } from "@effect-ts/core/Function"
import * as O from "@effect-ts/core/Option"
import * as TE from "@effect-ts/jest/Test"

import * as LogAnnotation from "../src/LogAnnotation"
import * as LogContext from "../src/LogContext"
import type { FormatterFunction } from "../src/LogFormat"
import * as LogFormat from "../src/LogFormat"
import * as LogLevel from "../src/LogLevel"
import * as TestLogger from "./TestLogger"

const formatterFunction: FormatterFunction = pipe(
  LogFormat.bracketed(LogFormat.LEVEL),
  LogFormat.spaced(
    pipe(
      LogFormat.timestampFormat((ts) => new Date(ts).toISOString()),
      LogFormat.spaced(
        pipe(
          LogFormat.name,
          LogFormat.spaced(LogFormat.concat_(LogFormat.line, LogFormat.error))
        )
      )
    )
  )
)

const assembledFormat = new LogFormat.AssembledLogFormat(formatterFunction)

describe("LogFormat", () => {
  const { it } = TE.runtime((_) => _[">+>"](TestLogger.live))

  it("should handle formatting an assembled log without an error", () =>
    T.succeedWith(() => {
      const context = pipe(
        LogContext.empty,
        LogContext.annotate(LogAnnotation.Name, A.from(["a", "b"])),
        LogContext.annotate(LogAnnotation.Timestamp, Date.UTC(2000, 1, 1, 12, 0, 0, 0)),
        LogContext.annotate(LogAnnotation.Level, LogLevel.warn)
      )

      const log = assembledFormat.format(context, "test message")

      expect(log).toBe("[WARN] 2000-02-01T12:00:00.000Z a.b test message")
    }))

  it("should handle formatting an assembled log with an error", () =>
    T.succeedWith(() => {
      const context = pipe(
        LogContext.empty,
        LogContext.annotate(LogAnnotation.Name, A.from(["a", "b"])),
        LogContext.annotate(LogAnnotation.Timestamp, Date.UTC(2000, 1, 1, 12, 0, 0, 0)),
        LogContext.annotate(LogAnnotation.Level, LogLevel.error),
        LogContext.annotate(
          LogAnnotation.Throwable,
          O.some({ message: "test exception" } as Error)
        )
      )

      const log = assembledFormat.format(context, "failed!")

      expect(log).toContain("[ERROR] 2000-02-01T12:00:00.000Z a.b failed!")
      expect(log).toContain("A checked error was not handled")
      expect(log).toContain("test exception")
    }))
})
