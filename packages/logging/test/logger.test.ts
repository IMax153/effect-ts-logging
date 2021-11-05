import * as Associative from "@effect-ts/core/Associative"
import * as A from "@effect-ts/core/Collections/Immutable/Array"
import * as C from "@effect-ts/core/Collections/Immutable/Chunk"
import * as HM from "@effect-ts/core/Collections/Immutable/HashMap"
import * as Tp from "@effect-ts/core/Collections/Immutable/Tuple"
import * as T from "@effect-ts/core/Effect"
import { currentTime } from "@effect-ts/core/Effect/Clock"
import * as M from "@effect-ts/core/Effect/Managed"
import * as S from "@effect-ts/core/Effect/Stream"
import { identity, pipe } from "@effect-ts/core/Function"
import * as O from "@effect-ts/core/Option"
import * as Show from "@effect-ts/core/Show"
import * as TE from "@effect-ts/jest/Test"

import * as Log from "../src/Log"
import * as LogAnnotation from "../src/LogAnnotation"
import * as LogContext from "../src/LogContext"
import * as Logger from "../src/Logger"
import { StringLogger } from "../src/Logging"
import * as LogLevel from "../src/LogLevel"
import * as TestUtils from "./test-utils"
import * as TestLogger from "./TestLogger"

describe("Logger", () => {
  const { it, provide } = TE.runtime((_) => _[">+>"](TestLogger.live))

  afterEach(() => T.runPromise(provide(TestLogger.reset)))

  it("should log with the specified log level", () =>
    T.gen(function* (_) {
      yield* _(Log.debug("test"))

      const lines = yield* _(TestLogger.lines)

      TestUtils.equalLines(
        lines,
        C.single(
          Tp.tuple(
            pipe(
              LogContext.empty,
              LogContext.annotate(LogAnnotation.Level, LogLevel.debug)
            ),
            "test"
          )
        )
      )
    }))

  it("should handle application of log annotations", () =>
    T.gen(function* (_) {
      const exampleAnnotation = LogAnnotation.make({
        name: "annotation-name",
        initialValue: "unknown-annotation-value",
        combine: (oldValue, newValue) => oldValue + " " + newValue,
        render: identity
      })

      const locally = pipe(
        exampleAnnotation,
        LogAnnotation.apply("value1"),
        Log.locally
      )

      yield* _(locally(Log.info("line1")))

      const lines = yield* _(TestLogger.lines)

      TestUtils.equalLines(
        lines,
        C.single(
          Tp.tuple(
            pipe(
              LogContext.empty,
              LogContext.annotate(
                exampleAnnotation,
                exampleAnnotation.combine(exampleAnnotation.initialValue, "value1")
              ),
              LogContext.annotate(LogAnnotation.Level, LogLevel.info)
            ),
            "line1"
          )
        )
      )
    }))

  it("should handle a named logger", () =>
    T.gen(function* (_) {
      yield* _(
        pipe(
          T.accessService(StringLogger)(Logger.named("first")),
          T.chain((logger) =>
            Logger.locally(
              pipe(LogAnnotation.Name, LogAnnotation.apply(A.single("second")))
            )(logger.log("line1"))(logger)
          )
        )
      )

      const lines = yield* _(TestLogger.lines)

      TestUtils.equalLines(
        lines,
        C.single(
          Tp.tuple(
            pipe(
              LogContext.empty,
              LogContext.annotate(LogAnnotation.Name, A.from(["first", "second"]))
            ),
            "line1"
          )
        )
      )
    }))

  it("should handle derivation of a logger", () =>
    T.gen(function* (_) {
      const counter = LogAnnotation.make({
        name: "counter",
        initialValue: 0,
        combine: Associative.sum.combine,
        render: Show.number.show
      })

      const derived = yield* _(Log.derive(LogAnnotation.apply_(counter, 10)))

      yield* _(
        pipe(
          derived,
          Logger.locally(LogAnnotation.apply_(counter, 20))(
            Logger.info_(derived, "fake log")
          )
        )
      )

      const lines = yield* _(TestLogger.lines)

      TestUtils.equalLines(
        lines,
        C.single(
          Tp.tuple(
            pipe(
              LogContext.empty,
              LogContext.annotate(LogAnnotation.Level, LogLevel.info),
              LogContext.annotate(counter, 30)
            ),
            "fake log"
          )
        )
      )
    }))

  it("should handle effectful application of local annotations", () =>
    T.gen(function* (_) {
      const timely = LogAnnotation.make({
        name: "time",
        // https://stackoverflow.com/questions/11526504/minimum-and-maximum-date
        initialValue: new Date(-8640000000000000).getTime(),
        combine: Associative.last<number>().combine,
        render: Show.number.show
      })

      const now = yield* _(currentTime)

      yield* _(
        pipe(
          Log.info("line1"),
          Log.locallyM((ctx) =>
            pipe(
              currentTime,
              T.orDie,
              T.map((now) => LogContext.annotate_(ctx, timely, now))
            )
          )
        )
      )

      const lines = yield* _(TestLogger.lines)

      TestUtils.equalLines(
        lines,
        C.single(
          Tp.tuple(
            pipe(
              LogContext.empty,
              LogContext.annotate(timely, now),
              LogContext.annotate(LogAnnotation.Level, LogLevel.info)
            ),
            "line1"
          )
        )
      )
    }))

  it("should handle managed application of local annotations", () =>
    T.gen(function* (_) {
      yield* _(
        pipe(
          M.make_(Log.info("acquire"), () => Log.info("release")),
          Log.locallyManaged(
            LogAnnotation.apply_(LogAnnotation.Name, A.single("level-1"))
          ),
          M.use(() => Log.info("use"))
        )
      )

      const lines = yield* _(TestLogger.lines)

      TestUtils.equalLines(
        lines,
        C.from([
          Tp.tuple(
            pipe(
              LogContext.empty,
              LogContext.annotate(LogAnnotation.Name, A.single("level-1")),
              LogContext.annotate(LogAnnotation.Level, LogLevel.info)
            ),
            "acquire"
          ),
          Tp.tuple(
            pipe(
              LogContext.empty,
              LogContext.annotate(LogAnnotation.Level, LogLevel.info)
            ),
            "use"
          ),
          Tp.tuple(
            pipe(
              LogContext.empty,
              LogContext.annotate(LogAnnotation.Name, A.single("level-1")),
              LogContext.annotate(LogAnnotation.Level, LogLevel.info)
            ),
            "release"
          )
        ])
      )
    }))

  it("should handle streamed application of local annotations", () =>
    T.gen(function* (_) {
      yield* _(
        pipe(
          S.fromEffect(Log.info("line1")),
          S.zipRight(S.fromEffect(Log.info("line2"))),
          Log.locallyStream(
            LogAnnotation.apply_(LogAnnotation.Name, A.single("level-1"))
          ),
          S.runDrain
        )
      )

      const lines = yield* _(TestLogger.lines)

      TestUtils.equalLines(
        lines,
        C.from([
          Tp.tuple(
            pipe(
              LogContext.empty,
              LogContext.annotate(LogAnnotation.Name, A.single("level-1")),
              LogContext.annotate(LogAnnotation.Level, LogLevel.info)
            ),
            "line1"
          ),
          Tp.tuple(
            pipe(
              LogContext.empty,
              LogContext.annotate(LogAnnotation.Name, A.single("level-1")),
              LogContext.annotate(LogAnnotation.Level, LogLevel.info)
            ),
            "line2"
          )
        ])
      )
    }))

  it("should render the log context", () =>
    T.succeedWith(() => {
      const correlationId = TestUtils.mockUUID()

      const rendered = pipe(
        LogContext.empty,
        LogContext.annotate(
          LogAnnotation.Name,
          A.from(["logger_name", "second_level"])
        ),
        LogContext.annotate(LogAnnotation.CorrelationId, O.some(correlationId)),
        LogContext.renderContext
      )

      expect(rendered).equals(
        pipe(
          HM.make<string, string>(),
          HM.set(LogAnnotation.Name.name, "logger_name.second_level"),
          HM.set(LogAnnotation.CorrelationId.name, correlationId as string)
        )
      )
    }))
})
