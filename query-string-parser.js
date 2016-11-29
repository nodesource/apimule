'use strict'

const lodash = require('lodash')

exports.parse = parse

const DefaultDurationSeconds = 5

const Groups = {
  agentScope: parseAgentScope,
  duration: parseDuration,
  nameData: parseNameData,
  fields: parseFields,
  interval: parseInterval,
  startEnd: parseStartEnd,
  agg: parseAgg
}

for (let key of ['id', 'app', 'key', 'val', 'name', 'data', 'asset', 'type', 'firstName', 'lastName', 'email', 'company', 'optOut', 'license']) {
  Groups[key] = getSelfParser(key)
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

  // Perform semantic checks.

  // Why did I think we needed this??? - pmuellr
  // If no end time, and aggregated values => nope.
  // if (data.end == null && data.agg && data.agg !== 'raw') {
  //   data.errors.push('continous queries cannot aggregate fields')
  //   data.agg = 'raw'
  // }

  // Why did I think we needed this??? - pmuellr
  // If no end time, and aggregated time values => nope.
  // if (data.end == null && data.interval && data.interval !== 'raw') {
  //   data.errors.push('continous queries cannot aggregate over time')
  //   data.interval = 'raw'
  // }

  // If interval is specified, and agg is not set, use mean.
  if (data.interval && data.interval !== 'raw' && !data.agg) {
    data.agg = 'mean'
  }

  // If interval is not 'raw', agg must not be 'raw'.
  if (data.interval && data.interval !== 'raw' && data.agg && data.agg === 'raw') {
    data.errors.push('when interval is specifed, agg must not be raw')
    data.interval = 'raw'
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

function parseAgentScope (query, data) {
  parseValueSingle(query, data, 'id')
  parseValueSingle(query, data, 'app')
  parseValueMulti(query, data, 'tag', 'tags')
  parseValueSingle(query, data, 'hostname')

  if (data.id) {
    if (data.app) {
      data.warnings.push('id already specified, app ignored')
      delete data.app
    }

    if (data.tags) {
      data.warnings.push('id already specified, tags ignored')
      delete data.tags
    }

    if (data.hostname) {
      data.warnings.push('id already specified, hostname ignored')
      delete data.hostname
    }
  }
}

function parseDuration (query, data) {
  parseValueSingle(query, data, 'duration')
  if (data.duration == null) data.duration = DefaultDurationSeconds

  const value = parseInt(`${data.duration}`, 10)
  if (isNaN(value)) {
    data.errors.push(`invalid duration format "${data.duration}"`)
    delete data.duration
    return
  }

  data.duration = value
}

function parseNameData (query, data) {
  parseValueSingle(query, data, 'name')
  parseValueSingle(query, data, 'data')

  if (data.name == null && data.data != null) {
    data.errors.push('must specify name if specifying data')
    delete data.data
    return
  }
}

function parseFields (query, data) {
  parseValueMulti(query, data, 'field', 'fields')
}

function parseInterval (query, data) {
  parseValueSingle(query, data, 'interval')

  if (data.interval == null) data.interval = '1s'

  if (data.interval) {
    const value = subParseDuration(data.interval)
    if (value != null) {
      data.interval = value
      return
    } else {
      data.errors.push(`invalid interval value ${data.interval}`)
      delete data.interval
      return
    }
  }
}

function parseStartEnd (query, data) {
  parseValueSingle(query, data, 'start')
  parseValueSingle(query, data, 'end')

  if (data.start == null && data.end != null) {
    delete data.end
    data.errors.push('start must be specified if end is specified')
    return
  }

  if (data.start) data.start = subParseDate(data.start)
  if (data.end) data.end = subParseDate(data.end)
}

const Aggs = 'raw min max mean median'.split(' ')
function parseAgg (query, data) {
  parseValueSingle(query, data, 'agg')
  if (data.agg == null) data.agg = 'mean'

  if (Aggs.indexOf(data.agg) === -1) {
    data.errors.push(`invalid agg value ${data.agg}`)
    delete data.agg
  }
}

function subParseDate (string) {
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
