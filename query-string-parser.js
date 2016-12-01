'use strict'

const lodash = require('lodash')

exports.parse = parse

const Groups = {
}

exports.register = function (params) {
  if (params.key && !Groups[params.key]) {
    Groups[params.key] = params.validator || getSelfParser(params.key)
  }
}

function getSelfParser (key) {
  return function parseKey (query, data, required) {
    parseValueSingle(query, data, key)
    if (required && data[key] == null) {
      data.errors.push(`query string parameter ${key} is required`)
    }
  }
}

// Parse the `req.query` object, given the specified groups, returning an object
// with all the params suitably parsed; `tag` and `field` values are arrays of
// strings, everything else is a scalar value.
// The object returned will also contain an `errors` property which is an array
// of error messages related to the parms.
function parse (groups, query) {
  query = removeEmptyParams(lodash.cloneDeep(query))

  const data = {}
  data.warnings = []
  data.errors = []

  for (let group of groups) {
    if (group[0] === '/') continue

    const required = (group[0] === '!')
    if (required) group = group.substr(1)

    const parseFn = Groups[group]
    if (parseFn == null) throw new Error(`unknown parse group ${group}`)

    parseFn(query, data, required)
  }

  // Report on for query parms not used.
  for (let prop in query) {
    data.warnings.push(`unknown query string param "${prop}"`)
  }

  return data
}

function removeEmptyParams (query) {
  var pruned = {}

  for (let key of Object.keys(query)) {
    if (query[key] == null) {
      continue
    }

    if (Array.isArray(query[key])) {
      let filtered = query[key].filter((elem) => {
        return (elem != null && elem !== '')
      })
      if (filtered.length !== 0) {
        pruned[key] = filtered
      }
    } else if (query[key] !== '') {
      pruned[key] = query[key]
    }
  }

  return pruned
}

function subParseDate (string) {
  if (!string) return null

  let match = string.match(/^\d{4}-.*/)
  const isISO = match != null

  let date

  if (isISO) {
    // try Date.parse()
    date = Date.parse(string)
    if (!isNaN(date)) return date
  }

  // try as a millsecond value > 1,000,000
  date = parseInt(string, 10)
  if (!isNaN(date)) {
    if (date >= 1000 * 1000) return date
  }

  // try as a duration
  let duration = subParseDuration(string)
  if (duration != null) {
    return Date.now() + duration
  }

  // try Date.parse()
  date = Date.parse(string)
  if (!isNaN(date)) return date

  return null
}
exports.subParseDate = subParseDate

// Regular expression for duration expressions.
const DurationRegex = /(-)?(\d+)(ms|s|m|h|d|w)?/

// Return indication whether string is a duration expression.
// function isDuration (string) {
//   return string.match(DurationRegex) != null
// }

// Parse a duration expression returning ms: -?\d+(ms|s|m|h|d|w) (def: seconds)
function subParseDuration (string) {
  if (string == null) return null

  const match = string.match(DurationRegex)
  if (match == null) return null

  let val = parseInt(match[2], 10)
  const units = match[3] || 's'
  if (match[1] === '-') val = -val

  switch (units) {
    case 'ms': return val
    case 's': return val * 1000
    case 'm': return val * 1000 * 60
    case 'h': return val * 1000 * 60 * 60
    case 'd': return val * 1000 * 60 * 60 * 24
    case 'w': return val * 1000 * 60 * 60 * 24 * 7
    default: return val * 1000
  }
}
exports.subParseDuration = subParseDuration

// Parse a field, should only be one value.
function parseValueSingle (query, data, prop) {
  const val = query[prop]
  delete query[prop]

  if (val == null) return

  if (lodash.isArray(val)) {
    data[prop] = val[0]
    data.errors.push(`query string parameter "${prop}" specified more than once`)
    return
  }

  data[prop] = val
}
exports.parseValueSingle = parseValueSingle

// Parse a field, can be a single value or array.
function parseValueMulti (query, data, propIn, propOut) {
  const val = query[propIn]
  delete query[propIn]

  if (val == null) return

  if (lodash.isArray(val)) {
    data[propOut] = val.slice()
    return
  }

  data[propOut] = [val]
}
exports.parseValueMulti = parseValueMulti
