import * as T from "@effect-ts/core/Effect"
import type { HasClock } from "@effect-ts/core/Effect/Clock"
import type * as L from "@effect-ts/core/Effect/Layer"
import * as S from "@effect-ts/core/Effect/Stream"
import { flow, pipe } from "@effect-ts/core/Function"
import type { Option } from "@effect-ts/core/Option"
import * as O from "@effect-ts/core/Option"
import * as Show from "@effect-ts/core/Show"
import * as crypto from "crypto"

import * as Log from "../src/Log"
import * as LogAnnotation from "../src/LogAnnotation"
import * as LogContext from "../src/LogContext"
import * as LogFormat from "../src/LogFormat"
import type { HasLogging } from "../src/Logging"
import * as Logging from "../src/Logging"
import * as LogLevel from "../src/LogLevel"

// -----------------------------------------------------------------------------
// Log Annotations
// -----------------------------------------------------------------------------

export const CalculationId: LogAnnotation.LogAnnotation<Option<string>> =
  LogAnnotation.make({
    name: "calculation-id",
    initialValue: O.emptyOf<string>(),
    combine: (_, y) => y,
    render: O.getOrElse(() => "undefined-calculation-id")
  })

export const CalculationNumber: LogAnnotation.LogAnnotation<number> =
  LogAnnotation.make({
    name: "calculation-number",
    initialValue: 0,
    combine: (_, y) => y,
    render: Show.number.show
  })

// -----------------------------------------------------------------------------
// Program Environment
// -----------------------------------------------------------------------------

export const env: L.Layer<HasClock, never, HasLogging> = Logging.console(
  LogLevel.debug,
  LogFormat.ColoredLogFormat(
    (ctx, line) =>
      `${LogContext.apply_(ctx, CalculationId)}` +
      " " +
      `${LogContext.apply_(ctx, CalculationNumber)}` +
      " " +
      line
  )
)[">>>"](Logging.withRootLoggerName("my-logger"))

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

export function mockUUID(): string {
  // Mock generation of a UUID
  return crypto.randomBytes(16).toString("hex")
}

// -----------------------------------------------------------------------------
// Program
// -----------------------------------------------------------------------------

export const program = pipe(
  S.fromIterable([1, 2, 3, 4, 5]),
  S.chain((calcNumber) =>
    pipe(
      S.fromEffect(Log.debug(`would log first line for calculation #${calcNumber}`)),
      S.zipRight(
        S.fromEffect(Log.debug(`would log second line for calculation #${calcNumber}`))
      ),
      Log.locallyStream(
        flow(
          LogAnnotation.apply_(CalculationId, O.some(mockUUID())),
          LogAnnotation.apply_(CalculationNumber, calcNumber)
        )
      )
    )
  ),
  S.runDrain,
  T.provideSomeLayer(env)
)

export function main(): Promise<void> {
  return T.runPromise(program)
}

main()
