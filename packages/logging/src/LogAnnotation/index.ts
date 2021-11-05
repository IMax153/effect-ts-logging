// ets_tracing: off

import { Case } from "@effect-ts/core/Case"
import * as C from "@effect-ts/core/Effect/Cause"
import type { Endomorphism } from "@effect-ts/core/Function"
import type { Option } from "@effect-ts/core/Option"
import * as O from "@effect-ts/core/Option"
import type { Array } from "@effect-ts/system/Collections/Immutable/Array"
import * as A from "@effect-ts/system/Collections/Immutable/Array"

import type { LogContext } from "../LogContext"
import * as LC from "../LogContext"
import type { LogLevel } from "../LogLevel"
import * as LL from "../LogLevel"

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

/**
 * A `LogAnnotation` describes a particular type of annotation applied to log
 * lines.
 */
export class LogAnnotation<A> extends Case<{
  readonly name: string
  readonly initialValue: A
  readonly combine: (x: A, y: A) => A
  readonly render: (a: A) => string
}> {}

// -----------------------------------------------------------------------------
// Constructors
// -----------------------------------------------------------------------------

export function make<A>(params: {
  readonly name: string
  readonly initialValue: A
  readonly combine: (x: A, y: A) => A
  readonly render: (a: A) => string
}) {
  return new LogAnnotation(params)
}

/**
 * Creates a `LogAnnotation` that is represented as an optional value and
 * initialized with `None`. If a value for the annotation is present, it
 * will be rendered using the provided function. When absent, it will be
 * rendered as an empty string.
 */
export function optional<A>(name: string, render: (a: A) => string) {
  return make({
    name,
    initialValue: O.emptyOf<A>(),
    combine: (_, y) => y,
    render: O.fold(() => "", render)
  })
}

/**
 * The `CorrelationId` annotation keeps track of correlation id.
 */
export const CorrelationId: LogAnnotation<Option<string>> = make({
  name: "correlation-id",
  initialValue: O.emptyOf<string>(),
  combine: (_, y) => y,
  render: O.getOrElse(() => "unknown-correlation-id")
})

/**
 * The `Level` annotation keeps track of log levels.
 */
export const Level: LogAnnotation<LogLevel> = make({
  name: "level",
  initialValue: LL.info,
  combine: (_, y) => y,
  render: (_) => _._tag.toLowerCase()
})

/**
 * The `Name` annotation keeps track of logger names.
 */
export const Name: LogAnnotation<Array<string>> = make({
  name: "name",
  initialValue: A.emptyOf<string>(),
  combine: A.concat_,
  render: A.join(".")
})

/**
 * The `Throwable` annotation keeps track of a throwable.
 */
export const Throwable: LogAnnotation<Option<any>> = optional("throwable", (_) =>
  C.pretty(C.fail(_))
)

/**
 * The `Cause` annotation keeps track of a cause.
 */
export const Cause: LogAnnotation<Option<C.Cause<unknown>>> = optional(
  "cause",
  C.pretty
)

/**
 * The `Timestamp` annotation keeps track of the log timestamp.
 */
export const Timestamp: LogAnnotation<number> = make({
  name: "timestamp",
  // https://stackoverflow.com/questions/11526504/minimum-and-maximum-date
  initialValue: -8640000000000000,
  combine: (_, y) => y,
  render: (_) => new Date(_).toISOString()
})

// -----------------------------------------------------------------------------
// Operations
// -----------------------------------------------------------------------------

export function apply_<A>(self: LogAnnotation<A>, value: A): Endomorphism<LogContext> {
  return LC.annotate(self, self.combine(self.initialValue, value))
}

/**
 * @ets_data_first apply_
 */
export function apply<A>(value: A) {
  return (self: LogAnnotation<A>): Endomorphism<LogContext> => apply_(self, value)
}
