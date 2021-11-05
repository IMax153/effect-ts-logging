// ets_tracing: off

import * as Associative from "@effect-ts/core/Associative"
import * as Cause from "@effect-ts/core/Effect/Cause"
import type { Endomorphism } from "@effect-ts/core/Function"
import type { Option } from "@effect-ts/core/Option"
import * as O from "@effect-ts/core/Option"
import { matchTag_ } from "@effect-ts/core/Utils"
import { EOL } from "os"

import type { LogAnnotation } from "../LogAnnotation"
import * as LA from "../LogAnnotation"
import type { LogContext } from "../LogContext"
import * as LC from "../LogContext"
import type { LogLevel } from "../LogLevel"

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

/**
 * Log Format represents a function that that takes a `LogContext` with all
 * log annotations as well as a line and produces the final log entry.
 *
 * The idea is that those formats should be composed by decoration.
 */
export interface LogFormat<A> {
  readonly format: (context: LogContext, line: A) => string
}

export type LineFormatter<A = string> = (context: LogContext, line: A) => string

// -----------------------------------------------------------------------------
// SimpleConsoleLogFormat
// -----------------------------------------------------------------------------

const BLUE = "\u001B[34m"
const CYAN = "\u001B[36m"
const GREEN = "\u001B[32m"
const MAGENTA = "\u001B[35m"
const RED = "\u001B[31m"
const RESET = "\u001B[0m"
const YELLOW = "\u001B[33m"
const WHITE = "\u001B[37m"

const intercalateSpace = Associative.intercalate(" ")(Associative.string)

export function fromFunction<A = string>(formatter: LineFormatter<A>): LogFormat<A> {
  return {
    format: formatter
  }
}

export function SimpleConsoleLogFormat(
  f: LineFormatter = (_, line) => line
): LogFormat<string> {
  return {
    format: (context, line) => {
      const date = LC.apply_(context, LA.Timestamp)
      const level = LC.apply_(context, LA.Level)
      const loggerName = LC.apply_(context, LA.Name)
      const cause = O.alt(() => LC.get_(context, LA.Cause))(
        O.map_(LC.get_(context, LA.Throwable), Cause.fail)
      )
      const renderedCause = O.map_(cause, (cause) => EOL + Cause.pretty(cause))
      const maybeError = O.getOrElse_(renderedCause, () => "")

      return Associative.fold(intercalateSpace)(date)([
        level,
        loggerName,
        f(context, line),
        maybeError
      ])
    }
  }
}

// -----------------------------------------------------------------------------
// ColoredLogFormat
// -----------------------------------------------------------------------------

function withColor(color: string, value: string): string {
  return `${color}${value}${RESET}`
}

function highlightLog(level: LogLevel, message: string): string {
  const color = matchTag_(
    level,
    {
      Error: () => RED,
      Warn: () => YELLOW,
      Info: () => CYAN,
      Debug: () => GREEN,
      Trace: () => MAGENTA
    },
    () => RESET
  )
  return withColor(color, message)
}

function formatInternal(
  line: string,
  time: string,
  level: LogLevel,
  loggerName: string,
  maybeError: Option<string>
): string {
  const logTag = highlightLog(level, level._tag.toLowerCase()).padStart(14, " ")
  const logTime = withColor(BLUE, time)
  const logName = withColor(WHITE, loggerName)
  const logMsg = `${logTime} ${logTag} [${logName}] ${highlightLog(level, line)}`
  return O.fold_(
    maybeError,
    () => logMsg,
    (err) => `${logMsg}${EOL}${highlightLog(level, err)}`
  )
}

export function ColoredLogFormat(
  f: LineFormatter = (_, line) => line
): LogFormat<string> {
  return {
    format: (context, line) => {
      const date = LC.apply_(context, LA.Timestamp)
      const level = LC.get_(context, LA.Level)
      const loggerName = LC.apply_(context, LA.Name)
      const cause = O.alt(() => LC.get_(context, LA.Cause))(
        O.map_(LC.get_(context, LA.Throwable), Cause.fail)
      )
      const maybeError = O.map_(cause, Cause.pretty)

      return formatInternal(f(context, line), date, level, loggerName, maybeError)
    }
  }
}

// -----------------------------------------------------------------------------
// AssembledLogFormat
// -----------------------------------------------------------------------------

export type FormatterFunction = (
  builder: string,
  context: LogContext,
  line: string
) => any

export function concat_(
  self: FormatterFunction,
  that: FormatterFunction
): FormatterFunction {
  return (builder, context, line) => {
    return self(builder, context, line) + that(builder, context, line)
  }
}

/**
 * @ets_data_first concat_
 */
export function concat(that: FormatterFunction) {
  return (self: FormatterFunction): FormatterFunction => concat_(self, that)
}

export function spaced_(
  self: FormatterFunction,
  that: FormatterFunction
): FormatterFunction {
  return (builder, context, line) => {
    return self(builder, context, line) + " " + that(builder, context, line)
  }
}

/**
 * @ets_data_first spaced_
 */
export function spaced(that: FormatterFunction) {
  return (self: FormatterFunction): FormatterFunction => spaced_(self, that)
}

export class AssembledLogFormat implements LogFormat<string> {
  private formatter: FormatterFunction

  constructor(formatter: FormatterFunction) {
    this.formatter = formatter
  }

  format(context: LogContext, line: string): string {
    return this.formatter("", context, line)
  }
}

export const space: FormatterFunction = (builder) => builder + " "

export const bracketStart: FormatterFunction = (builder) => builder + "["

export const bracketEnd: FormatterFunction = (builder) => builder + "]"

export function renderedAnnotation<A>(self: LogAnnotation<A>): FormatterFunction {
  return (builder, context) => builder + LC.apply_(context, self)
}

export function renderedAnnotationF_<A>(
  annotation: LogAnnotation<A>,
  f: Endomorphism<string>
): FormatterFunction {
  return (builder, context) => builder + f(LC.apply_(context, annotation))
}

/**
 * @ets_data_first renderedAnnotationF_
 */
export function renderedAnnotationF(f: Endomorphism<string>) {
  return <A>(annotation: LogAnnotation<A>): FormatterFunction =>
    renderedAnnotationF_(annotation, f)
}

export function annotationF_<A>(
  annotation: LogAnnotation<A>,
  f: (a: A) => string
): FormatterFunction {
  return (builder, context) => builder + f(LC.get_(context, annotation))
}

/**
 * @ets_data_first annotationF_
 */
export function annotationF<A>(f: (a: A) => string) {
  return (annotation: LogAnnotation<A>): FormatterFunction =>
    annotationF_(annotation, f)
}

export function bracketed(self: FormatterFunction): FormatterFunction {
  return concat_(bracketStart, concat_(self, bracketEnd))
}

export const level: FormatterFunction = renderedAnnotation(LA.Level)

export const LEVEL: FormatterFunction = renderedAnnotationF_(LA.Level, (_) =>
  _.toUpperCase()
)

export const name: FormatterFunction = renderedAnnotation(LA.Name)

export const error: FormatterFunction = (builder, context) => {
  return O.fold_(
    O.alt(() => LC.get_(context, LA.Cause))(
      O.map_(LC.get_(context, LA.Throwable), Cause.fail)
    ),
    () => builder,
    (cause) => builder + EOL + Cause.pretty(cause)
  )
}

export const timestamp: FormatterFunction = annotationF_(
  LA.Timestamp,
  new Intl.DateTimeFormat().format
)

export function timestampFormat(
  formatter: (date: number) => string
): FormatterFunction {
  return annotationF_(LA.Timestamp, formatter)
}

export const line: FormatterFunction = (builder, _, line) => builder + line
