import type { Chunk } from "@effect-ts/core/Collections/Immutable/Chunk"
import * as C from "@effect-ts/core/Collections/Immutable/Chunk"
import type { Tuple } from "@effect-ts/core/Collections/Immutable/Tuple"
import * as Tp from "@effect-ts/core/Collections/Immutable/Tuple"
import * as T from "@effect-ts/core/Effect"
import * as FiberRef from "@effect-ts/core/Effect/FiberRef"
import * as L from "@effect-ts/core/Effect/Layer"
import * as Ref from "@effect-ts/core/Effect/Ref"
import type { Has } from "@effect-ts/core/Has"
import { tag } from "@effect-ts/core/Has"
import { intersect } from "@effect-ts/system/Utils"

import type { LogContext } from "../../src/LogContext"
import * as LC from "../../src/LogContext"
import type { Logger } from "../../src/Logger"
import type { HasLogging } from "../../src/Logging"
import { StringLogger } from "../../src/Logging"

export interface TestLoggerService extends Logger<string> {
  readonly lines: T.UIO<Chunk<Tuple<[LogContext, string]>>>
  readonly reset: T.UIO<void>
}

export type HasTestLogger = Has<TestLoggerService>

export const TestLogger = tag<TestLoggerService>()

export const live: L.Layer<unknown, never, HasTestLogger & HasLogging> =
  L.fromRawEffect(
    T.gen(function* (_) {
      const data = yield* _(Ref.makeRef(C.empty<Tuple<[LogContext, string]>>()))
      const logger = yield* _(
        T.map_(
          FiberRef.make(LC.empty),
          (ref): TestLoggerService => ({
            log: (line) =>
              T.asUnit(
                T.chain_(FiberRef.get(ref), (ctx) =>
                  Ref.update_(data, C.append(Tp.tuple(ctx, line)))
                )
              ),
            logContext: FiberRef.get(ref),
            locally: (f) => (effect) =>
              T.chain_(FiberRef.get(ref), (ctx) =>
                FiberRef.locally(f(ctx))(effect)(ref)
              ),
            lines: Ref.get(data),
            reset: Ref.set_(data, C.empty())
          })
        )
      )
      return intersect(TestLogger.of(logger), StringLogger.of(logger))
    })
  )

export const { lines, locally, log, logContext, reset } = T.deriveLifted(TestLogger)(
  ["log"],
  ["lines", "logContext", "reset"],
  ["locally"]
)
